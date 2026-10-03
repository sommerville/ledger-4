// Sommerville Ledger 4 — income.js
// Income page, views, chart, snapshots, history
// Part of index.html (3.5.2 split). Plain script, loaded in order; all files share one global scope.
    // ═══════════════════════════════════════════════════════════
    // INCOME SECTION
    // ═══════════════════════════════════════════════════════════

    const INCOME_TYPES = {
        payroll:    { label: 'Payroll',     emoji: '💼' },
        dividends:  { label: 'Dividends',   emoji: '📈' },
        tax_refund: { label: 'Tax Refund',  emoji: '🏛️' },
        bonus:      { label: 'Bonus',       emoji: '🎉' },
    };

    // ─── Income View Filter (v3.2) ───────────────────────────
    // Views: 'total', 'payer:<id>' (a company's paychecks + its bonuses), 'payroll', 'bonus', 'other'.
    // Companies match by payerId (bonus via parentId), falling back to the saved name for old entries.
    const INCOME_VIEW_LABELS = {
        total:    'Past Year Total',
        payroll:  'Payroll — Past Year',
        bonus:    'Bonus — Past Year',
        other:    'Other — Past Year',
    };

    // Companies that get a button: payroll payers, open, or closed with income in the past year
    function incomeViewCompanies() {
        const start = moKey(new Date(new Date().getFullYear(), new Date().getMonth() - 12, 1)) + '-01';
        return payers.filter(p => (!p.defaultType || p.defaultType === 'payroll') &&
            (!p.closed || incomeEntries.some(e => e.date >= start && incomeEntryIsCompany(e, p))));
    }
    function incomeEntryIsCompany(e, p) {
        const b = bonusPayerFor(p);
        if (e.payerId) return String(e.payerId) === String(p.id) || (!!b && String(e.payerId) === String(b.id));
        return e.payerName === p.name || (!!b && e.payerName === b.name);
    }
    function incomeViewLabel(view) {
        if (view && view.startsWith('payer:')) {
            const p = payers.find(x => String(x.id) === view.slice(6));
            return (p ? p.name : 'Company') + ' — Past Year';
        }
        return INCOME_VIEW_LABELS[view] || 'Past Year Total';
    }
    function renderIncomeViewButtons() {
        const wrap = document.getElementById('incomeViewButtons');
        if (!wrap) return;
        const views = [['total', 'Total'], ...incomeViewCompanies().map(p => ['payer:' + p.id, p.name]), ['payroll', 'Payroll'], ['bonus', 'Bonus'], ['other', 'Other']];
        if (!views.some(v => v[0] === currentIncomeView)) currentIncomeView = 'total';
        const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
        wrap.innerHTML = views.map(([v, l]) => `<button data-iview="${esc(v)}"${v === currentIncomeView ? ' class="active"' : ''} onclick="setIncomeView(this)">${esc(l)}</button>`).join('');
    }

    function setIncomeView(btn) {
        document.querySelectorAll('#incomePage .chart-controls button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentIncomeView = btn.getAttribute('data-iview');
        updateIncomeTotals();
    }

    // Returns true if an entry matches the current view filter
    function incomeEntryMatchesView(e, view) {
        if (view === 'total') return true;
        const typeLower = (e.type || '').toLowerCase();
        if (view && view.startsWith('payer:')) {
            const p = payers.find(x => String(x.id) === view.slice(6));
            if (!p || typeLower === 'bonus') return false;   // v3.5.1: company views leave bonuses out (they have their own button)
            const b = bonusPayerFor(p);
            if (b && (e.payerId ? String(e.payerId) === String(b.id) : e.payerName === b.name)) return false;
            return incomeEntryIsCompany(e, p);
        }
        if (view === 'payroll') return typeLower === 'payroll';
        if (view === 'bonus')   return typeLower === 'bonus';
        if (view === 'other') {
            // "Other" = not a company with a button, not payroll, not bonus (dividends, refunds, PFD…)
            return typeLower !== 'payroll' && typeLower !== 'bonus' && !incomeViewCompanies().some(p => incomeEntryIsCompany(e, p));
        }
        return true;
    }

    // ─── Income Totals & Chart ───────────────────────────────
    function updateIncomeTotals() {
        renderIncomeViewButtons();
        // Last 12 complete months (exclude current partial month) — 3.7.1: LC.inT12
        const yearIncome = incomeEntries.filter(e => _inT12(e) && incomeEntryMatchesView(e, currentIncomeView));
        const yearTotal  = yearIncome.reduce((s, e) => s + e.amount, 0);
        const monthlyAvg = yearTotal / 12;

        document.getElementById('incomeYearTotal').textContent = fmt(yearTotal);
        document.getElementById('incomeMonthlyAvg').textContent = `Monthly Avg: ${fmt(monthlyAvg)}`;

        // Theme-aware text colour for monthly avg line
        const _isSunset = document.body.classList.contains('sunset-theme');
        const _isDark   = document.body.classList.contains('alaskan-theme');
        const avgEl     = document.getElementById('incomeMonthlyAvg');
        if (avgEl) avgEl.style.color = _isSunset ? '#F0D0A0' : '#A0B8CC';

        const lblEl = document.getElementById('incomeBalanceLabel');
        if (lblEl) lblEl.textContent = incomeViewLabel(currentIncomeView);

        buildIncomeChart();
        renderIncomeSnapshotList();
    }

    function buildIncomeChart() {
        const ctx = document.getElementById('incomeChart');
        if (!ctx) return;

        const isSunset = document.body.classList.contains('sunset-theme');
        const isDark   = document.body.classList.contains('alaskan-theme');

        // Single bar color per theme — consistent regardless of active view filter
        const barColor  = isSunset ? '#E08020' : '#D4AF37';
        const gridColor = (isDark||isSunset) ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.1)';
        const tickColor = isSunset ? '#D0B090' : '#A0B8CC';
        const avgColor  = isSunset ? '#F5C030' : '#D4AF37';

        // v3.5.1: one bar colour in every view (the v3.2 two-shade bonus split was removed)

        // Build last 12 complete months only
        const today  = new Date();
        const labels = [];
        const data   = [];   // month totals
        for (let m = 11; m >= 0; m--) {
            const d   = new Date(today.getFullYear(), today.getMonth() - m - 1, 1);
            const key = moKey(d);
const lbl = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
            const monthEntries = incomeEntries.filter(e => e.date && e.date.startsWith(key) && incomeEntryMatchesView(e, currentIncomeView));
            const total = monthEntries.reduce((s, e) => s + (e.amount || 0), 0);
            labels.push(lbl);
            data.push(Math.round(total));
        }

        if (window._incomeChart instanceof Chart) window._incomeChart.destroy();

        const avg = data.length ? Math.round(data.reduce((a, b) => a + b, 0) / data.length) : 0;

        window._incomeChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    {
                        label: '',
                        data,
                        backgroundColor: barColor + 'CC',
                        borderColor: barColor,
                        borderWidth: 1,
                        borderRadius: 4,
                        order: 2,
                    },
                    {
                        label: 'Monthly Average',
                        data: data.map(() => avg),
                        stack: 'avg',
                        type: 'line',
                        borderColor: avgColor,
                        borderWidth: 2,
                        borderDash: [5, 5],
                        pointRadius: 0,
                        fill: false,
                        order: 1,
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: isSunset ? 'rgba(20,4,2,0.95)' : '#0A1A2F',
                        titleColor: barColor,
                        bodyColor: tickColor,
                        callbacks: {
                            label: ctx => (ctx.dataset.label ? ctx.dataset.label + ': ' : '') + '$' + Number(ctx.raw).toLocaleString(),
                        }
                    }
                },
                scales: {
                    x: {
                        stacked: true,
                        grid: { color: gridColor },
                        ticks: { color: tickColor, font: { size: 10 } }
                    },
                    y: {
                        stacked: true,
                        grid: { color: gridColor },
                        ticks: {
                            color: tickColor,
                            font: { size: 10 },
                            callback: v => '$' + (v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v)
                        },
                        beginAtZero: true
                    }
                }
            }
        });

        // Legend: the average line only
        const avgLegEl = document.getElementById('incomeAvgLegend');
        if (avgLegEl) {
            const lblColor = isSunset ? '#D0A888' : '#A0B8CC';
            avgLegEl.innerHTML =
                '<span style="display:inline-flex;align-items:center;gap:6px;color:' + lblColor + ';">' +
                '<svg width="28" height="10" style="flex-shrink:0"><line x1="0" y1="5" x2="28" y2="5" ' +
                'stroke="' + avgColor + '" stroke-width="2" stroke-dasharray="5,4"/></svg>' +
                'Monthly Average</span>';
        }
    }

    // ─── Income Snapshot List (inline monthly cards) ─────────
    function renderIncomeSnapshotList() {
        const container = document.getElementById('incomeSnapshotList');
        if (!container) return;

        const isSunset = document.body.classList.contains('sunset-theme');
        const isDark   = document.body.classList.contains('alaskan-theme') || isSunset;

        const accent  = isSunset ? '#F5C030' : '#D4AF37';
        const cardBg  = isSunset ? '#2A0808' : '#1A2A42';
        const border  = isSunset ? '#5A2018' : '#2A3A52';
        const txtClr  = isSunset ? '#F0D0A0' : '#E0E8F0';
        const subClr  = isSunset ? '#C08060' : '#7A8FA0';
        const posClr  = isSunset ? '#F5C030' : '#D4AF37';
        const negClr  = '#e74c3c';
        const inputBg = isSunset ? '#1A0404' : '#0D1829';

        const start = new Date(2024, 0, 1);
        const today = new Date();
        const end   = new Date(today.getFullYear(), today.getMonth(), 1);

        const allMonths = [];
        const cursor = new Date(start);
        while (cursor <= end) {
            allMonths.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`);
            cursor.setMonth(cursor.getMonth() + 1);
        }
        allMonths.reverse(); // newest first

        const fmtMK = mk => {
            const d = new Date(mk + '-02');
return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        };

        let html = snapHead(subClr);

        allMonths.forEach((mk, i) => {
            const monthEntries = incomeEntries.filter(e => e.date && e.date.startsWith(mk));
            const total = monthEntries.reduce((s, e) => s + (e.amount || 0), 0);

            // Delta vs prior month
            const prevMK = allMonths[i + 1];
            let delta = null;
            if (prevMK !== undefined) {
                const prevTotal = incomeEntries
                    .filter(e => e.date && e.date.startsWith(prevMK))
                    .reduce((s, e) => s + (e.amount || 0), 0);
                delta = total - prevTotal;
            }

// Group entries by payer for the expanded view
            // Order: non-bonus entries first (payroll/dividends/etc), then bonus — within each payer
            const byPayer = {};
            monthEntries.forEach(e => {
                const key = e.payerName || '—';
                if (!byPayer[key]) byPayer[key] = [];
                byPayer[key].push(e);
            });
            // Sort each payer's entries: non-bonus first, then bonus
            Object.values(byPayer).forEach(arr => {
                arr.sort((a, b) => {
                    const aIsBonus = a.type === 'bonus' ? 1 : 0;
                    const bIsBonus = b.type === 'bonus' ? 1 : 0;
                    return aIsBonus - bIsBonus;
                });
            });

            // Build company group blocks
            const companyBlocks = Object.entries(byPayer).map(([payerName, entries]) => {
                const payerTotal = entries.reduce((s, e) => s + (e.amount || 0), 0);
                // Label payroll entries as Paycheck 1, Paycheck 2, etc.
                let paycheckCount = 0;
                const entryRows = entries.map(e => {
                    const typeInfo = INCOME_TYPES[e.type] || { label: e.type };
                    let rowLabel;
                    if (e.type === 'payroll') {
                        paycheckCount++;
                        rowLabel = paycheckCount === 1 ? 'Paycheck 1' : paycheckCount === 2 ? 'Paycheck 2' : `Paycheck ${paycheckCount}`;
                    } else {
                        rowLabel = typeInfo.label;
                    }
                    return `<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid ${border};">
                        <span style="font-size:13px;color:${txtClr};">${rowLabel}</span>
                        <span style="font-size:13px;font-weight:700;color:${accent};">${fmt(e.amount)}</span>
                    </div>`;
                }).join('');
                return `<div style="background:${inputBg};border:1px solid ${border};border-radius:10px;padding:10px 12px;margin-bottom:8px;">
                    <div style="font-size:12px;font-weight:700;color:${subClr};text-transform:uppercase;letter-spacing:0.8px;margin-bottom:6px;">${payerName}</div>
                    ${entryRows}
                    ${entries.length > 1 ? `<div style="display:flex;justify-content:space-between;align-items:center;padding-top:7px;">
                        <span style="font-size:12px;font-weight:700;color:${subClr};">Total</span>
                        <span style="font-size:13px;font-weight:700;color:${accent};">${fmt(payerTotal)}</span>
                    </div>` : ''}
                </div>`;
            }).join('');

            html += snapCard('income', mk, cardBg, border, txtClr, fmtMK(mk),
                `${total > 0
                            ? `<span style="font-size:14px;font-weight:700;color:${accent};">${fmt(total)}</span>`
                            : `<span style="font-size:12px;color:${subClr};">—</span>`}`,
                `
                        ${monthEntries.length > 0 ? `
                        ${companyBlocks}
                        ` : `<div style="font-size:11px;color:${subClr};">No entries</div>`}`, 10);
        });

        container.innerHTML = html;
    }

    // ─── Income History Modal ────────────────────────────────

function renderIncomeStats() {
        const el = document.getElementById('incomeStatsContent');
        if (!el) return;

        const today    = new Date();
        const curStr   = moKey(today);
        const startStr = moKey(new Date(today.getFullYear(), today.getMonth() - 12, 1));

        // Theme
        const isSunset = document.body.classList.contains('sunset-theme');
        const isDark   = document.body.classList.contains('alaskan-theme');
        const accent   = isSunset ? '#F5C030' : '#D4AF37';
        const cardBg   = isSunset ? '#2A0808' : '#1A2A42';
        const borderClr= isSunset ? '#5A2018' : '#2A3A52';
        const textClr  = isSunset ? '#F0D0A0' : '#E0E8F0';
        const mutedClr = isSunset ? '#C08060' : '#7A8FA0';
        const valClr   = isSunset ? '#F5C030' : '#60A5FA';
        const greenClr = isSunset ? '#F5C030' : '#4ADE80';
        const goldClr  = isSunset ? '#F5C030' : '#D4AF37';

        // Build monthly data for last 12 months
        const monthData = [];
        for (let m = 11; m >= 0; m--) {
            const d   = new Date(today.getFullYear(), today.getMonth() - m - 1, 1);
            const key = moKey(d);
const lbl = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
            const ents = incomeEntries.filter(e => e.date && e.date.startsWith(key));
            const tot  = ents.reduce((s, e) => s + (e.amount || 0), 0);
            monthData.push({ key, lbl, tot, entries: ents });
        }

        const annualTotal = monthData.reduce((s, m) => s + m.tot, 0);
        const monthlyAvg  = annualTotal / 12;
        const nonZero     = monthData.filter(m => m.tot > 0);
        const bestMonth   = nonZero.length ? nonZero.reduce((b, m) => m.tot > b.tot ? m : b) : null;
        const worstMonth  = nonZero.length ? nonZero.reduce((b, m) => m.tot < b.tot ? m : b) : null;

        // 3.8: income goals are goal tracks (goals.js); steps are set in Goals page → Edit goal steps

        function statRow(label, value, sub) {
            return `<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px solid ${borderClr};">
                <div>
                    <div style="font-size:13px;color:${mutedClr};">${label}</div>
                    ${sub ? `<div style="font-size:11px;color:${mutedClr};margin-top:2px;">${sub}</div>` : ''}
                </div>
                <div style="font-size:17px;font-weight:700;color:${valClr};">${value}</div>
            </div>`;
        }

        function sectionHead(title) {
            return `<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:${accent};margin:20px 0 10px;">${title}</div>`;
        }

        // ── Year-by-year totals
        const allYears = [...new Set(
            incomeEntries.filter(e => e.date).map(e => e.date.slice(0, 4))
        )].sort().reverse();
        const curYear = String(today.getFullYear());
        const yearRows = allYears.map(yr => {
            const isCurrentYear = yr === curYear;
            // Current year: all months including partial current month (YTD)
            // Past years: full year total
            const tot = incomeEntries
                .filter(e => e.date && e.date.startsWith(yr))
                .reduce((s, e) => s + (e.amount || 0), 0);
            const gross = incomeEntries
                .filter(e => e.date && e.date.startsWith(yr))
                .reduce((s, e) => e.type === 'payroll'
                    ? s + (e.grossPay != null ? e.grossPay : (e.amount || 0))
                    : s + (e.amount || 0), 0);
            const showGross = gross > tot;
            const ytdBadge = isCurrentYear
                ? `<span style="font-size:10px;background:${accent};color:${isDark||isSunset?'#000':'#fff'};padding:2px 7px;border-radius:10px;font-weight:700;margin-left:6px;">YTD</span>`
                : '';
            return `<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px solid ${borderClr};">
                <div style="font-size:14px;font-weight:700;color:${textClr};">${yr}${ytdBadge}</div>
                <div class="u-text-right">
                    <div style="font-size:17px;font-weight:700;color:${valClr};">${fmt(tot)}</div>
                    ${showGross ? `<div style="font-size:11px;color:${mutedClr};">gross ${fmt(gross)}</div>` : ''}
                </div>
            </div>`;
        }).join('');

        el.innerHTML = `
            ${sectionHead('Income by Year')}
            <div style="background:${cardBg};border:1px solid ${borderClr};border-radius:12px;padding:4px 16px;margin-bottom:4px;color:${textClr};">
                ${yearRows || `<div style="padding:12px 0;color:${mutedClr};font-size:13px;">No income entries yet.</div>`}
            </div>

            ${sectionHead('Best & Worst Month')}
            <div style="background:${cardBg};border-radius:12px;padding:16px;margin-bottom:12px;color:${textClr};">
                ${bestMonth  ? statRow('Best Month',   fmt(bestMonth.tot),  bestMonth.lbl) : statRow('Best Month', '—', 'No data yet')}
                ${worstMonth && worstMonth.lbl !== bestMonth?.lbl ? statRow('Lowest Month', fmt(worstMonth.tot), worstMonth.lbl) : ''}
            </div>

            ${sectionHead('Income Goals')}
            ${goalCard('incomeMonthly')}${goalCard('incomeAnnual')}${goalCard('incomeAllTime')}
        `;
    }

