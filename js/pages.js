// Sommerville Ledger 4 — pages.js
// Net Worth, Debt, Real Estate, and the Monthly Snapshots lists
// Part of index.html (3.5.2 split). Plain script, loaded in order; all files share one global scope.
    // ─── History Modal ───────────────────────────────────────

// ─── Expenses ────────────────────────────────────────────

// Called by the expenses new-row dropdown in data dump
    function ddExpCoSel(sel) {
        const o = sel.options[sel.selectedIndex];
        const row = sel.closest('.dd-entry-row');
        if (!row) return;
        if (!sel.value) { row.dataset.companyName = ''; row.dataset.serviceType = 'Bill'; return; }   // v3.3
        row.dataset.companyName  = o.dataset.name || o.text;
        row.dataset.serviceType  = o.dataset.svc  || 'Bill';
    }

    // Called by the income new-row dropdown in data dump
    function ddIncSel(sel) {
        const o = sel.options[sel.selectedIndex];
        const row = sel.closest('.dd-entry-row');
        if (!row) return;
        row.dataset.payerId   = o.dataset.payerId   || '';
        row.dataset.payerName = o.dataset.payerName || '';
        row.dataset.type      = o.dataset.type      || 'payroll';
    }

    function dtGetHomeValues() {
        try { return JSON.parse(localStorage.getItem('pf_home_values') || '[]'); }
        catch(e) { return []; }
    }
    function dtSaveHomeValues(arr) {
        localStorage.setItem('pf_home_values', JSON.stringify(arr));
    }

    // 3.7: the math lives in js/ledger-core.js (LC), shared with the desktop. The phone's "as of" is this month.
    function getTotalInvestments() { return LC.investTotal(accounts, entries, null); }

    // Debt is capped at last month, so a new month with no entries can't zero out net worth
    function getTotalDebt() { return LC.debtTotal(debtAccounts, debtEntries, moKey(new Date())); }

    function getCurrentNetWorth() {
        return getTotalInvestments() - getTotalDebt() + getLoansOwed();   // v3.4: + loans owed to you
    }

    // ─── Net Worth Page ──────────────────────────────────────────
    function updateNetWorthPage() {
        const liquidNW = getCurrentNetWorth();
        const latestHV = realEstateTotal();   // v3.5
        const trueNW   = liquidNW + latestHV;
        const el  = document.getElementById('debtTotalBalance');
        const lEl = document.getElementById('debtLiquidNW');
        if (el)  el.textContent = fmt(trueNW);
        if (lEl) lEl.textContent = fmt(liquidNW);
        buildNetWorthChart();
        renderNWSnapshotList();
    }

    // ─── Monthly snapshot cards (v3.5.1: one shell for every page's list) ───
    function snapHead(color) {
        return `<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:${color};margin-bottom:10px;">Monthly Snapshots</div>`;
    }
    function snapCard(prefix, mk, bg, border, textClr, title, right, body, padTop) {
        return `
            <div style="background:${bg};border:1px solid ${border};border-radius:12px;margin-bottom:10px;overflow:hidden;">
                <button onclick="snapToggle('${prefix}','${mk}')" class="u-btn-clear">
                    <div class="u-flex-between">
                        <span style="font-size:14px;font-weight:700;color:${textClr};">${title}</span>
                        ${right}
                    </div>
                </button>
                <div id="${prefix}-snap-${mk}" style="display:none;padding:0 14px 12px;">
                    <div style="border-top:1px solid ${border};padding-top:${padTop}px;">${body}</div>
                </div>
            </div>`;
    }
    // Opens one month's card and closes the others on that page
    function snapToggle(prefix, mk) {
        const el = document.getElementById(prefix + '-snap-' + mk);
        if (!el) return;
        const isOpen = el.style.display !== 'none';
        document.querySelectorAll('[id^="' + prefix + '-snap-"]').forEach(e => e.style.display = 'none');
        if (!isOpen) el.style.display = 'block';
    }

    function renderNWSnapshotList() {
        const container = document.getElementById('nwSnapshotList');
        if (!container) return;

        const isSunset = (document.body.classList.contains('sunset-theme') || document.body.classList.contains('navy-theme'));
        const isDark   = document.body.classList.contains('alaskan-theme') || isSunset;
        const accent   = isSunset ? tc('#F5C030') : '#D4AF37';
        const cardBg   = isSunset ? tc('rgba(35,8,4,0.7)') : '#1A2A42';
        const border   = isSunset ? tc('#5A2018') : '#2A3A52';
        const txtClr   = isSunset ? tc('#F0D0A0') : '#C8D0DC';
        const subClr   = isSunset ? tc('#C09070') : '#8A9AB0';
        const posClr   = '#4CAF50';
        const negClr   = '#EF5350';
        const debtClr  = '#EF9A9A';

        // Build all months that have any data
        const allMonths = [...new Set([
            ...entries.map(e => e.date.slice(0,7)),
            ...debtEntries.map(e => e.date.slice(0,7)),
            ...loanEvents.map(e => e.date.slice(0,7)),   // v3.4
        ])].sort().reverse();

        if (!allMonths.length) {
            container.innerHTML = `<div style="color:${subClr};font-size:13px;text-align:center;padding:16px;">No data yet.</div>`;
            return;
        }

        const fmtMK = mk => {
            const d = new Date(mk + '-02');
return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        };

        // Helper: latest value for an account up to and including month mk
        const latestForAcct = (acctId, list, mk) => LC.balance(list, acctId, mk);   // 3.7

        // Real estate up to mk: each property's latest value (v3.5)
        const hvForMonth = mk => realEstateTotal(mk);

        let html = snapHead(subClr);

        allMonths.forEach((mk, i) => {
            // Investments by account type
            let invest = 0;
            const investRows = accounts.map(acct => {
                const v = latestForAcct(acct.id, entries, mk);
                invest += v;
                return v > 0 ? `<div style="display:flex;justify-content:space-between;font-size:11px;color:${subClr};padding:1px 0;"><span>${acct.institution || acct.name}</span><span>${fmt(v)}</span></div>` : '';
            }).filter(Boolean).join('');

            // Debt by account
            let debt = 0;
            const debtRows = debtAccounts.map(acct => {
                const v = latestForAcct(acct.id, debtEntries, mk);
                debt += v;
                return v > 0 ? `<div style="display:flex;justify-content:space-between;font-size:11px;color:${subClr};padding:1px 0;"><span>${acct.name}</span><span style="color:${debtClr};">-${fmt(v)}</span></div>` : '';
            }).filter(Boolean).join('');

            const hv       = hvForMonth(mk);
            const loansOwed = getLoansOwed(mk);   // v3.4
            const liquidNW = invest - debt + loansOwed;
            const trueNW   = liquidNW + hv;
            const nwColor  = trueNW >= 0 ? posClr : negClr;

            // Compare to prior month for delta
            const prevMK   = allMonths[i + 1];
            let delta = null;
            if (prevMK !== undefined) {
                let pInvest = 0, pDebt = 0;
                accounts.forEach(a => { pInvest += latestForAcct(a.id, entries, prevMK); });
                debtAccounts.forEach(a => { pDebt += latestForAcct(a.id, debtEntries, prevMK); });
                const pHV   = hvForMonth(prevMK);
                const pTrue = pInvest - pDebt + pHV + getLoansOwed(prevMK);
                delta = trueNW - pTrue;
            }

            html += snapCard('nw', mk, cardBg, border, txtClr, fmtMK(mk),
                `${delta !== null
                            ? `<span style="font-size:14px;font-weight:700;color:${delta>=0?posClr:negClr};">${delta>=0?'+':''}${fmt(delta)}</span>`
                            : `<span style="font-size:12px;color:${subClr};">—</span>`}`,
                `
                        <!-- Investments -->
                        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:${subClr};margin-bottom:4px;">Investments</div>
                        ${investRows || `<div style="font-size:11px;color:${subClr};">No data</div>`}
                        <div style="display:flex;justify-content:space-between;font-size:12px;font-weight:700;color:${accent};border-top:1px solid ${border};margin-top:4px;padding-top:4px;">
                            <span>Total Investments</span><span>${fmt(invest)}</span>
                        </div>
                        <!-- Debt -->
                        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:${subClr};margin:10px 0 4px;">Debt</div>
                        ${debtRows || `<div style="font-size:11px;color:${subClr};">No debt logged</div>`}
                        <div style="display:flex;justify-content:space-between;font-size:12px;font-weight:700;color:${debtClr};border-top:1px solid ${border};margin-top:4px;padding-top:4px;">
                            <span>Total Debt</span><span>-${fmt(debt)}</span>
                        </div>
                        ${loansOwed > 0 ? `
                        <div style="display:flex;justify-content:space-between;font-size:12px;font-weight:700;color:${accent};margin-top:10px;">
                            <span>Loans owed to you</span><span>${fmt(loansOwed)}</span>
                        </div>` : ''}
                        <!-- Real Estate (v3.5) -->
                        ${hv > 0 ? `
                        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:${subClr};margin:10px 0 4px;">Real Estate</div>
                        ${realEstateItems(mk).map(x => `<div style="display:flex;justify-content:space-between;font-size:11px;color:${subClr};padding:1px 0;">
                            <span>${ddE(x.p.name)}</span><span>${fmt(x.e.value)}</span>
                        </div>`).join('')}` : ''}
                        <!-- Summary -->
                        <div style="margin-top:10px;padding-top:10px;border-top:2px solid ${border};">
                            <div style="display:flex;justify-content:space-between;font-size:12px;color:${subClr};margin-bottom:2px;">
                                <span>Liquid NW (invest − debt + loans)</span><span style="color:${liquidNW>=0?posClr:negClr};">${fmt(liquidNW)}</span>
                            </div>
                            ${hv > 0 ? `<div style="display:flex;justify-content:space-between;font-size:12px;color:${subClr};margin-bottom:2px;"><span>+ Real Estate</span><span>${fmt(hv)}</span></div>` : ''}
                            <div style="display:flex;justify-content:space-between;font-size:14px;font-weight:800;color:${nwColor};margin-top:4px;">
                                <span>True Net Worth</span><span>${fmt(trueNW)}</span>
                            </div>
                        </div>`, 10);
        });

        container.innerHTML = html;
    }

    // ─── Debt Trend Chart ────────────────────────────────────────
    let debtTrendChartInst = null;
    let debtViewAcctId = 'total'; // 'total' or an account id

    function setDebtView(btn) {
        document.querySelectorAll('[data-debtview]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        debtViewAcctId = btn.getAttribute('data-debtview');
        buildDebtTrendChart();
    }

    function buildDebtTrendChart() {
        const canvas = document.getElementById('debtTrendChart');
        if (!canvas) return;
        if (debtTrendChartInst) { debtTrendChartInst.destroy(); debtTrendChartInst = null; }

        const isDark   = document.body.classList.contains('alaskan-theme') || (document.body.classList.contains('sunset-theme') || document.body.classList.contains('navy-theme'));
        const isSunset = (document.body.classList.contains('sunset-theme') || document.body.classList.contains('navy-theme'));
        const tick  = '#C0C0C0';
        const grid  = '#5A6F83';
        const lineC = isSunset ? tc('#F5C030') : '#EF9A9A';
        const fillC = isSunset ? tc('rgba(245,192,48,0.12)') : 'rgba(239,154,154,0.12)';

        // Rebuild per-account filter buttons fresh every render
        // Only show accounts that actually have logged entries
        const ctrlEl = document.getElementById('debtChartControls');
        if (ctrlEl) {
            ctrlEl.innerHTML = '<button data-debtview="total" class="active" onclick="setDebtView(this)">Total</button>';
            debtAccounts
                .filter(acct => {
                    const acctEntries = debtEntries.filter(e => String(e.accountId) === String(acct.id)).sort((a,b) => a.date.localeCompare(b.date));
                    return acctEntries.length > 0 && acctEntries[acctEntries.length - 1].amount > 0;
                })
                .forEach(acct => {
                    const b = document.createElement('button');
                    b.setAttribute('data-debtview', String(acct.id));
                    b.textContent = acct.name;
                    b.onclick = function() { setDebtView(this); };
                    if (String(acct.id) === String(debtViewAcctId)) b.classList.add('active');
                    ctrlEl.appendChild(b);
                });
            // Reset view to total if selected account no longer has a non-zero balance
            if (debtViewAcctId !== 'total') {
                const selEntries = debtEntries.filter(e => String(e.accountId) === String(debtViewAcctId)).sort((a,b) => a.date.localeCompare(b.date));
                if (!selEntries.length || selEntries[selEntries.length - 1].amount <= 0) {
                    debtViewAcctId = 'total';
                    ctrlEl.querySelector('[data-debtview="total"]').classList.add('active');
                }
            }
        }

        // Determine which accounts to include
        // Use == (not ===) to handle string/number mismatch from data attribute
        const acctList = debtViewAcctId === 'total'
            ? debtAccounts
            : debtAccounts.filter(a => String(a.id) === String(debtViewAcctId));

        // All months that have any debt data
        const allMonths = [...new Set(debtEntries.map(e => e.date.slice(0,7)))].sort();
        if (!allMonths.length) return;

        const scale = demoMode ? 0.01 : 1;
        const labels = [], data = [];
        allMonths.forEach(m => {
            let total = 0;
            acctList.forEach(acct => {
                const prior = debtEntries
                    .filter(e => e.accountId === acct.id && e.date.slice(0,7) <= m)
                    .sort((a,b) => a.date.localeCompare(b.date));
                if (prior.length) total += prior[prior.length-1].amount;
            });
            const d = new Date(m + '-02');
labels.push(d.toLocaleDateString('en-US', {month:'short'}) + " '" + String(d.getFullYear()).slice(-2));
            data.push(Math.round(total * scale));
        });

        const fmtTick = v => {
            if (v >= 1e6) return '$' + (v/1e6).toFixed(1) + 'M';
            if (v >= 1e3) return '$' + Math.round(v/1e3) + 'k';
            return '$' + Math.round(v);
        };

        const ctx = canvas.getContext('2d');
        const grad = ctx.createLinearGradient(0, 0, 0, canvas.offsetHeight || 200);
        grad.addColorStop(0, fillC);
        grad.addColorStop(1, 'rgba(0,0,0,0)');

        debtTrendChartInst = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label: 'Debt',
                    data,
                    borderColor: lineC,
                    backgroundColor: grad,
                    tension: 0.4,
                    fill: true,
                    pointRadius: data.length > 24 ? 0 : 3,
                    pointBackgroundColor: lineC,
                    pointHoverRadius: 5,
                    borderWidth: 2.5
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: { label: c => ' ' + fmtTick(c.raw) },
                        backgroundColor: 'rgba(10,26,47,0.95)',
                        titleColor: lineC,
                        bodyColor: tick,
                        borderColor: lineC,
                        borderWidth: 1
                    }
                },
                scales: {
                    x: { ticks: { autoSkip: true, maxTicksLimit: 12, color: tick }, grid: { color: grid } },
                    y: { min: Math.max(0, Math.round((data[0] - 100000) / 10000) * 10000), max: Math.round((data[0] + 100000) / 10000) * 10000, ticks: { callback: fmtTick, color: tick }, grid: { color: grid } }
                }
            }
        });
    }

    // ─── Debt Page (standalone) ──────────────────────────────────
    function updateDebtAccountsPage() {
        buildDebtTrendChart();
        const isSunset = (document.body.classList.contains('sunset-theme') || document.body.classList.contains('navy-theme'));
        const isDark   = document.body.classList.contains('alaskan-theme') || isSunset;
        const cardBg   = isSunset ? tc('rgba(35,8,4,0.7)') : '#1A2A42';
        const border   = isSunset ? tc('#5A2018') : '#2A3A52';
        const txtClr   = isSunset ? tc('#F0D0A0') : '#C8D0DC';
        const subClr   = isSunset ? tc('#C09070') : '#8A9AB0';
        const debtClr  = '#EF9A9A';

        let total = 0;
        const rows = debtAccounts.map(acct => {
            const latest = debtEntries
                .filter(e => e.accountId === acct.id)
                .sort((a,b) => a.date.localeCompare(b.date));
            const val = latest.length ? latest[latest.length-1].amount : 0;
            total += val;
            if (val === 0) return '';
            return `
            <div style="background:${cardBg};border:1px solid ${border};border-radius:12px;padding:12px 14px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;">
                <div>
                    <div style="font-size:14px;font-weight:700;color:${txtClr};">${acct.name}</div>
                    <div style="font-size:11px;color:${subClr};">${acct.type || 'debt'}${latest.length ? ' · as of ' + latest[latest.length-1].date : ''}</div>
                </div>
                <div style="font-size:16px;font-weight:800;color:${debtClr};">${fmt(val)}</div>
            </div>`;
        }).join('');

        const el = document.getElementById('debtPageTotal');
        if (el) el.textContent = fmt(total);

        const list = document.getElementById('debtAccountsList');
        if (list) {
            list.innerHTML = rows || `<div style="color:${subClr};font-size:13px;text-align:center;padding:16px;">No debt accounts configured.</div>`;
        }
        renderDebtSnapshotList();
    }

    function updateDebtPage() {
        // Legacy compat — called by home value changes etc.
        updateNetWorthPage();
    }

    // ─── Real Estate (v3.5; was the Home Value tracker) ───────────────────
    // pf_properties: [{ id, name }] — 'home' always exists (older data has no list).
    // pf_home_values: [{ date: 'YYYY-MM', value, note, propertyId? }] — no propertyId means 'home', so older entries
    // and older backups need no change. Net worth = liquid + each property's latest value. Not in liquid NW, FIRE or the plan.
    function reProps() {
        let p; try { p = JSON.parse(localStorage.getItem('pf_properties') || '[]'); } catch (e) { p = []; }
        if (!Array.isArray(p)) p = [];
        p = p.filter(x => x && x.id && x.name);
        if (!p.some(x => x.id === 'home')) p.unshift({ id: 'home', name: 'Home' });
        return p;
    }
    function reSaveProps(p) { localStorage.setItem('pf_properties', JSON.stringify(p)); }
    const rePid = LC.propId;
    // 3.7: latest value of each property (through mk, or the latest overall) — math in ledger-core.js
    function reLatest(pid, mk) { return LC.propertyValue(dtGetHomeValues(), pid, mk || null); }
    function realEstateItems(mk) { return LC.realEstateItems(reProps(), dtGetHomeValues(), mk || null); }
    function realEstateTotal(mk) { return LC.realEstate(reProps(), dtGetHomeValues(), mk || null); }

    // ─── Real Estate page (3.5.3: a full page like Debt; was the homeValueModal pop-up) ───
    // Values come from the Data page (Real estate section), usually once a year from the borough assessment.
    function reMonLabel(date) {   // 'YYYY-MM' or 'YYYY-MM-DD' → 'Jan 2026'
        const [y, m] = String(date || '').split('-').map(Number);
        return (y && m) ? new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '';
    }
    function reColors() {
        const isSunset = (document.body.classList.contains('sunset-theme') || document.body.classList.contains('navy-theme'));
        return {
            isSunset,
            cardBg: isSunset ? tc('rgba(35,8,4,0.7)') : '#1A2A42',
            border: isSunset ? tc('#5A2018') : '#2A3A52',
            txt:    isSunset ? tc('#F0D0A0') : '#C8D0DC',
            sub:    isSunset ? tc('#C09070') : '#8A9AB0',
            accent: isSunset ? tc('#F5C030') : '#D4AF37',
            pos: '#4CAF50', neg: '#EF5350',
        };
    }
    let reView = 'total';   // chart buttons: 'total' or a property id
    function setReView(btn) { reView = btn.getAttribute('data-review'); updateRealEstatePage(); }
    function updateRealEstatePage() {
        const props = reProps();
        if (reView !== 'total' && !props.some(p => p.id === reView)) reView = 'total';
        const view = reView === 'total' ? props : props.filter(p => p.id === reView);
        const C = reColors();
        const total = view.reduce((s, p) => { const e = reLatest(p.id); return s + (e ? e.value || 0 : 0); }, 0);
        const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
        set('rePageTotal', fmt(total));
        set('rePageLabel', reView === 'total' ? 'Total Real Estate Value' : view[0].name + ' — Assessed Value');
        const ctrl = document.getElementById('reChartControls');
        if (ctrl) ctrl.innerHTML = '<button data-review="total"' + (reView === 'total' ? ' class="active"' : '') + ' onclick="setReView(this)">All</button>'
            + props.map(p => '<button data-review="' + ddE(p.id) + '"' + (reView === p.id ? ' class="active"' : '') + ' onclick="setReView(this)">' + ddE(p.name) + '</button>').join('');
        buildRealEstateChart(view);
        // One box per property; tap it to open that property's history (one line per assessment)
        const list = document.getElementById('rePropList');
        if (!list) return;
        const vals = dtGetHomeValues();
        list.innerHTML = props.map(p => {
            const hist = vals.filter(e => rePid(e) === p.id && e.date).sort((x, y) => y.date.localeCompare(x.date));
            const e = hist[0];
            const rows = hist.map((h, i) => {
                const prev = hist[i + 1], d = prev ? (h.value || 0) - (prev.value || 0) : null;
                return `<div style="display:flex;justify-content:space-between;font-size:12px;color:${C.txt};padding:3px 0;">
                        <span>${h.date.slice(0, 4)} <span style="font-size:11px;color:${C.sub};">· ${reMonLabel(h.date).split(' ')[0]}</span></span>
                        <span>${fmt(h.value)}${d ? `<span style="color:${d > 0 ? C.pos : C.neg};margin-left:6px;">${d > 0 ? '+' : ''}${fmt(d)}</span>` : ''}</span>
                    </div>`;
            }).join('');
            return `
            <div style="background:${C.cardBg};border:1px solid ${C.border};border-radius:12px;margin-bottom:8px;overflow:hidden;">
                <button onclick="snapToggle('re','${ddJ(p.id)}')" class="u-btn-clear" style="padding:12px 14px;">
                    <div class="u-flex-between" style="align-items:center;gap:10px;">
                        <div style="text-align:left;min-width:0;">
                            <div style="font-size:14px;font-weight:700;color:${C.txt};">${ddE(p.name)}</div>
                            <div style="font-size:11px;color:${C.sub};">${e ? 'Assessed ' + reMonLabel(e.date) : 'No value yet'}</div>
                        </div>
                        <div style="font-size:16px;font-weight:800;color:${C.accent};white-space:nowrap;">${e ? fmt(e.value) : '—'}</div>
                    </div>
                </button>
                <div id="re-snap-${ddE(p.id)}" style="display:none;padding:0 14px 12px;">
                    <div style="border-top:1px solid ${C.border};padding-top:8px;">${rows || `<div style="font-size:11px;color:${C.sub};">No values yet · log one on the Data page</div>`}</div>
                </div>
            </div>`;
        }).join('');
    }

    let reChartInst = null;
    function buildRealEstateChart(view) {
        const canvas = document.getElementById('reChart');
        if (!canvas) return;
        if (reChartInst) { reChartInst.destroy(); reChartInst = null; }
        const ids = new Set(view.map(p => p.id));
        const months = [...new Set(dtGetHomeValues().filter(e => ids.has(rePid(e)) && e.date).map(e => e.date.slice(0, 7)))].sort();
        if (!months.length) return;
        const C = reColors(), tick = '#C0C0C0', grid = '#5A6F83';
        const scale = demoMode ? 0.01 : 1;
        const data = months.map(mk => Math.round(view.reduce((s, p) => { const e = reLatest(p.id, mk); return s + (e ? e.value || 0 : 0); }, 0) * scale));
        const labels = months.map(mk => { const d = new Date(mk + '-02'); return d.toLocaleDateString('en-US', { month: 'short' }) + " '" + String(d.getFullYear()).slice(-2); });
        const fmtTick = v => v >= 1e6 ? '$' + (v / 1e6).toFixed(1) + 'M' : (v >= 1e3 ? '$' + Math.round(v / 1e3) + 'k' : '$' + Math.round(v));
        reChartInst = new Chart(canvas.getContext('2d'), {
            type: 'line',
            data: { labels, datasets: [{ label: 'Value', data, borderColor: C.accent, backgroundColor: C.isSunset ? tc('rgba(245,192,48,0.12)') : 'rgba(212,175,55,0.15)',
                tension: 0.3, fill: true, pointRadius: 4, pointBackgroundColor: C.accent, pointHoverRadius: 6, borderWidth: 2.5 }] },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false },
                    tooltip: { callbacks: { label: c => ' $' + Number(c.raw).toLocaleString() }, backgroundColor: 'rgba(10,26,47,0.95)', titleColor: C.accent, bodyColor: tick, borderColor: C.accent, borderWidth: 1 } },
                scales: { x: { ticks: { color: tick }, grid: { color: grid } },
                          y: { beginAtZero: false, ticks: { callback: fmtTick, color: tick }, grid: { color: grid } } }
            }
        });
    }

// ─── Net Worth Chart (matches investments chart style) ──
    let networthFullscreenChart = null;

    function buildNetWorthChart() {
        const fmtMonthKey = mk => {
            const d = new Date(mk + '-02');
return d.toLocaleDateString('en-US', { month: 'short' }) + " '" + String(d.getFullYear()).slice(-2);
        };
        const canvas = document.getElementById('debtChart');
        if (!canvas) return;

        const allMonths = [...new Set([
            ...entries.map(e => e.date.slice(0,7)),
            ...debtEntries.map(e => e.date.slice(0,7)),
            ...loanEvents.map(e => e.date.slice(0,7))   // v3.4
        ])].sort();

        if (allMonths.length === 0) {
            if (debtChart) { debtChart.destroy(); debtChart = null; }
            return;
        }

        const labels = [], nwData = [];
        const scale = demoMode ? 0.01 : 1;

        allMonths.forEach(m => {
            const debt   = LC.debtThrough(debtAccounts, debtEntries, m);   // 3.7: ledger-core.js
            const invest = LC.investTotal(accounts, entries, m);
            labels.push(fmtMonthKey(m));
            nwData.push(Math.round((invest - debt + getLoansOwed(m)) * scale));   // v3.4: + loans
        });

        if (debtChart) { debtChart.destroy(); debtChart = null; }

        const isDark  = document.body.classList.contains('alaskan-theme') || (document.body.classList.contains('sunset-theme') || document.body.classList.contains('navy-theme'));
        const nwColor = tc('#D4AF37');
        const nwBg    = tc('rgba(212,175,55,0.15)');
        const tick    = tc('#C0C0C0');
        const grid    = tc('#5A6F83');

        const fmtTick = v => {
            const a = Math.abs(v);
            if (a >= 1e6) return '$' + Math.round(v/1e6) + 'M';
            if (a >= 1e3) return '$' + Math.round(v/1e3) + 'k';
            return '$' + Math.round(v);
        };

        const ctx = canvas.getContext('2d');
        debtChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label: 'Net Worth',
                    data: nwData,
                    borderColor: nwColor,
                    backgroundColor: nwBg,
                    tension: 0.4,
                    fill: true,
                    pointRadius: 0,
                    pointHoverRadius: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: {
                        type: 'category',
                        ticks: { autoSkip: true, maxTicksLimit: 12, color: tick },
                        grid: { color: grid }
                    },
                    y: {
                        beginAtZero: false,
                        ticks: { callback: fmtTick, color: tick },
                        grid: { color: grid }
                    }
                }
            }
        });
    }

    function toggleNetWorthChartFullscreen() {
        const modal = document.getElementById('networthFullscreenModal');
        if (!modal) return;
        modal.classList.add('open');
        setTimeout(() => buildNetWorthFullscreenChart(), 50);
    }

    function closeNetWorthChartFullscreen() {
        const modal = document.getElementById('networthFullscreenModal');
        if (modal) modal.classList.remove('open');
        if (networthFullscreenChart) { networthFullscreenChart.destroy(); networthFullscreenChart = null; }
    }

    function buildNetWorthFullscreenChart() {
        const fmtMonthKey = mk => {
            const d = new Date(mk + '-02');
return d.toLocaleDateString('en-US', { month: 'short' }) + " '" + String(d.getFullYear()).slice(-2);
        };
        if (networthFullscreenChart) { networthFullscreenChart.destroy(); networthFullscreenChart = null; }

        const allMonths = [...new Set([
            ...entries.map(e => e.date.slice(0,7)),
            ...debtEntries.map(e => e.date.slice(0,7)),
            ...loanEvents.map(e => e.date.slice(0,7))   // v3.4
        ])].sort();

        const labels = [], debtData = [], nwData = [];
        const scale = demoMode ? 0.01 : 1;

        allMonths.forEach(m => {
            const debt   = LC.debtThrough(debtAccounts, debtEntries, m);   // 3.7: ledger-core.js
            const invest = LC.investTotal(accounts, entries, m);
            labels.push(fmtMonthKey(m));
            debtData.push(Math.round(debt * scale));
            nwData.push(Math.round((invest - debt + getLoansOwed(m)) * scale));   // v3.4: + loans
        });

        const isDark  = document.body.classList.contains('alaskan-theme') || (document.body.classList.contains('sunset-theme') || document.body.classList.contains('navy-theme'));
        const nwColor = tc('#D4AF37');
        const nwBg    = tc('rgba(212,175,55,0.1)');
        const tick    = tc('#C0C0C0');
        const grid    = tc('#5A6F83');

        const fmtTick = v => {
            const a = Math.abs(v);
            if (a >= 1e6) return '$' + Math.round(v/1e6) + 'M';
            if (a >= 1e3) return '$' + Math.round(v/1e3) + 'k';
            return '$' + Math.round(v);
        };

        const ctx = document.getElementById('networthFullscreenCanvas').getContext('2d');
        networthFullscreenChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [
                    {
                        label: 'Net Worth',
                        data: nwData,
                        borderColor: nwColor,
                        backgroundColor: nwBg,
                        tension: 0.4,
                        fill: true,
                        pointRadius: 5,
                        pointHoverRadius: 8
                    },
                    {
                        label: 'Debt',
                        data: debtData,
                        borderColor: '#dc3545',
                        backgroundColor: 'rgba(220,53,69,0.06)',
                        tension: 0.4,
                        fill: false,
                        pointRadius: 5,
                        pointHoverRadius: 8
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: true,
                        labels: { color: tick }
                    },
                    tooltip: {
                        callbacks: {
                            label: c => c.dataset.label + ': $' + Math.round(c.parsed.y).toLocaleString()
                        }
                    }
                },
                scales: {
                    x: {
                        type: 'category',
                        ticks: { autoSkip: true, maxTicksLimit: 12, color: tick },
                        grid: { color: grid }
                    },
                    y: {
                        beginAtZero: false,
                        ticks: { callback: fmtTick, color: tick },
                        grid: { color: grid }
                    }
                }
            }
        });
    }

    // 3.8: the Net Worth and Liquid Net Worth goal tracks (goals.js); steps are set in Goals page → Edit goal steps
    function renderNetWorthGoals() {
        const container = document.getElementById('networthGoalsContent');
        if (container) container.innerHTML = goalCard('networth') + goalCard('liquid');
    }

    // ─── Retirement Snapshot List (inline monthly cards) ──────
    function renderRetSnapshotList() {
        const container = document.getElementById('retSnapshotList');
        if (!container) return;
        const T = retTheme();
        const wdClr = '#c0392b';

        const today  = new Date();
        const months = [];
        let d = new Date(2024, 0, 1);
        while (d <= today) { months.push(moKey(d)); d.setMonth(d.getMonth() + 1); }
        months.reverse();

const fmtMK = mk => new Date(mk + '-15').toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

        let html = snapHead(T.mutedClr);

        months.forEach(mk => {
            const ents = retirementContribs.filter(e => e.date && e.date.startsWith(mk));
            const total = ents.reduce((s, e) => s + (e.totalAmount || e.amount || 0), 0);
            const hasEnts = ents.length > 0;
            const totalClr = total < 0 ? wdClr : T.valClr;

            // Group by institution
            const instMap = {};
            ents.forEach(e => {
                const key = e.institution || e.sourceName || '—';
                if (!instMap[key]) instMap[key] = [];
                instMap[key].push(e);
            });

            let instBlocks = '';
            Object.entries(instMap).forEach(([inst, instEnts]) => {
                const instTotal = instEnts.reduce((s, e) => s + (e.totalAmount || e.amount || 0), 0);
                const instClr   = instTotal < 0 ? wdClr : T.valClr;

                // Sum contrib types across all entries for this institution
                const contribSums = {};
                const withdrawalSums = {};
                instEnts.forEach(e => {
                    const eSrc = retirementSources.find(s => s.id === e.sourceId);
                    if (e.amounts && Object.keys(e.amounts).length) {
                        Object.entries(e.amounts).forEach(([k, v]) => {
                            if (!v) return;
                            const label = k === 'employer_match'
                                ? ((eSrc?.sponsor || eSrc?.label || e.sourceName || 'Employer') + ' Match')
                                : (CONTRIB_TYPES[k]?.label || k);
                            if (v >= 0) contribSums[label] = (contribSums[label] || 0) + v;
                            else withdrawalSums[label] = (withdrawalSums[label] || 0) + v;
                        });
                    } else {
                        const v = e.totalAmount || e.amount || 0;
                        const label = e.sourceName || '—';
                        if (v >= 0) contribSums[label] = (contribSums[label] || 0) + v;
                        else withdrawalSums[label] = (withdrawalSums[label] || 0) + v;
                    }
                });
                const contribLines    = Object.entries(contribSums).map(([label, v]) => ({ label, v }));
                const withdrawalLines = Object.entries(withdrawalSums).map(([label, v]) => ({ label, v }));
                const wdTotal         = withdrawalLines.reduce((s, l) => s + l.v, 0);

                // Institution: name left, net total right
                let block = `<div style="display:flex;justify-content:space-between;align-items:baseline;padding:6px 0 2px 0;">
                    <span style="font-size:13px;font-weight:700;color:${T.textClr};">${inst}</span>
                    <span style="font-size:13px;font-weight:700;color:${instClr};">${fmt(instTotal)}</span>
                </div>`;

                // Contribution lines: indented directly, no sub-header
                contribLines.forEach(({ label, v }) => {
                    block += `<div style="display:flex;justify-content:space-between;font-size:11px;color:${T.mutedClr};padding:1px 0 1px 14px;">
                        <span>${label}</span>
                        <span>${fmt(v)}</span>
                    </div>`;
                });

                // Withdrawals: label+subtotal, then indented lines
                if (withdrawalLines.length) {
                    block += `<div style="display:flex;justify-content:space-between;align-items:baseline;padding:4px 0 1px 0;">
                        <span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:${wdClr};">Withdrawals</span>
                        <span style="font-size:11px;font-weight:700;color:${wdClr};">${fmt(wdTotal)}</span>
                    </div>`;
                    withdrawalLines.forEach(({ label, v }) => {
                        block += `<div style="display:flex;justify-content:space-between;font-size:11px;color:${T.mutedClr};padding:1px 0 1px 14px;">
                            <span>${label}</span>
                            <span style="color:${wdClr};">${fmt(v)}</span>
                        </div>`;
                    });
                }

                instBlocks += `<div style="margin-bottom:8px;">${block}</div>`;
            });

            html += snapCard('ret', mk, T.cardBg, T.borderClr, T.textClr, fmtMK(mk),
                `${hasEnts
                            ? `<span style="font-size:14px;font-weight:700;color:${totalClr};">${fmt(total)}</span>`
                            : `<span style="font-size:12px;color:${T.mutedClr};">—</span>`}`,
                `
                        ${hasEnts ? instBlocks : `<div style="font-size:11px;color:${T.mutedClr};">No entries</div>`}`, 8);
        });

        container.innerHTML = html;
    }

    // ─── Coast Snapshot List (inline monthly cards) ────────────
    function renderCoastSnapshotList() {
        const container = document.getElementById('coastSnapshotList');
        if (!container) return;
        const T = retTheme();
        const wdClr = '#c0392b';

        const today  = new Date();
        const startYr = coastContribs.length
            ? Math.min(2024, parseInt(coastContribs.map(e => e.date || '2024').sort()[0].slice(0, 4)))
            : 2024;
        const months = [];
        let d = new Date(startYr, 0, 1);
        while (d <= today) { months.push(moKey(d)); d.setMonth(d.getMonth() + 1); }
        months.reverse();

const fmtMK = mk => new Date(mk + '-15').toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

        let html = snapHead(T.mutedClr);

        months.forEach(mk => {
            const ents = coastContribs.filter(e => e.date && e.date.startsWith(mk));
            const total = ents.reduce((s, e) => s + (e.amount || 0), 0);
            const hasEnts = ents.length > 0;
            const totalClr = total < 0 ? wdClr : T.valClr;

            // Group by institution
            const instMap = {};
            ents.forEach(e => {
                const key = e.institution || e.accountName || '—';
                if (!instMap[key]) instMap[key] = [];
                instMap[key].push(e);
            });

            let instBlocks = '';
            Object.entries(instMap).forEach(([inst, instEnts]) => {
                const contribs    = instEnts.filter(e => (e.amount || 0) >= 0);
                const withdrawals = instEnts.filter(e => (e.amount || 0) < 0);
                const instTotal   = instEnts.reduce((s, e) => s + (e.amount || 0), 0);
                const instClr     = instTotal < 0 ? wdClr : T.valClr;
                const wdTotal     = withdrawals.reduce((s, e) => s + (e.amount || 0), 0);

                // Institution: name left, net total right
                let block = `<div style="display:flex;justify-content:space-between;align-items:baseline;padding:6px 0 2px 0;">
                    <span style="font-size:13px;font-weight:700;color:${T.textClr};">${inst}</span>
                    <span style="font-size:13px;font-weight:700;color:${instClr};">${fmt(instTotal)}</span>
                </div>`;

                // Contributions label (no value), then amount-only lines
                if (contribs.length) {
                    block += `<div style="font-size:11px;color:${T.mutedClr};padding:1px 0 1px 14px;">Contributions</div>`;
                    contribs.forEach(e => {
                        block += `<div style="display:flex;justify-content:flex-end;font-size:11px;color:${T.mutedClr};padding:1px 0 1px 14px;">
                            <span>${fmt(e.amount || 0)}</span>
                        </div>`;
                    });
                }

                // Withdrawals: label + subtotal, then amount-only lines
                if (withdrawals.length) {
                    block += `<div style="display:flex;justify-content:space-between;align-items:baseline;padding:4px 0 1px 14px;">
                        <span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:${wdClr};">Withdrawals</span>
                        <span style="font-size:11px;font-weight:700;color:${wdClr};">${fmt(wdTotal)}</span>
                    </div>`;
                    withdrawals.forEach(e => {
                        block += `<div style="display:flex;justify-content:flex-end;font-size:11px;color:${wdClr};padding:1px 0 1px 14px;">
                            <span>${fmt(e.amount || 0)}</span>
                        </div>`;
                    });
                }

                instBlocks += `<div style="margin-bottom:6px;">${block}</div>`;
            });

            html += snapCard('coast', mk, T.cardBg, T.borderClr, T.textClr, fmtMK(mk),
                `${hasEnts
                            ? `<span style="font-size:14px;font-weight:700;color:${totalClr};">${fmt(total)}</span>`
                            : `<span style="font-size:12px;color:${T.mutedClr};">—</span>`}`,
                `
                        ${hasEnts ? instBlocks : `<div style="font-size:11px;color:${T.mutedClr};">No entries</div>`}`, 8);
        });

        container.innerHTML = html;
    }

    // ─── Investment Snapshot List (inline monthly cards) ──────
    function renderInvestSnapshotList() {
        const container = document.getElementById('investSnapshotList');
        if (!container) return;

        const isSunset = (document.body.classList.contains('sunset-theme') || document.body.classList.contains('navy-theme'));
        const isDark   = document.body.classList.contains('alaskan-theme') || isSunset;

        const accent  = isSunset ? tc('#F5C030') : '#D4AF37';
        const cardBg  = isSunset ? tc('#2A0808') : '#1A2A42';
        const border  = isSunset ? tc('#5A2018') : '#2A3A52';
        const txtClr  = isSunset ? tc('#F0D0A0') : '#E0E8F0';
        const subClr  = isSunset ? tc('#C08060') : '#7A8FA0';
        const posClr  = isSunset ? tc('#F5C030') : '#D4AF37';
        const negClr  = '#e74c3c';

        const start = new Date(2024, 0, 1);
        const today = new Date();
        const end   = new Date(today.getFullYear(), today.getMonth(), 1);

        const allMonths = [];
        const cursor = new Date(start);
        while (cursor <= end) {
            allMonths.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`);
            cursor.setMonth(cursor.getMonth() + 1);
        }
        allMonths.reverse();

const fmtMK = mk => new Date(mk + '-02').toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

        // Latest known balance per account up to and including month mk
        const latestForAcct = (acct, mk) => LC.balance(entries, acct.id, mk);   // 3.7

        // Filter accounts by current view
        const viewAccounts = currentView === 'total'
            ? accounts
            : accounts.filter(a => a.type === currentView);

        let html = snapHead(subClr);

        allMonths.forEach((mk, i) => {
            let total = 0;
            const acctRows = viewAccounts.map(acct => {
                const v = latestForAcct(acct, mk);
                total += v;
                return v > 0
                    ? `<div style="display:flex;justify-content:space-between;font-size:11px;color:${subClr};padding:1px 0;">
                        <span>${acct.institution || acct.name}</span><span>${fmt(v)}</span>
                       </div>`
                    : '';
            }).filter(Boolean).join('');

            const prevMK = allMonths[i + 1];
            let delta = null;
            if (prevMK !== undefined) {
                let pTotal = 0;
                viewAccounts.forEach(a => { pTotal += latestForAcct(a, prevMK); });
                delta = total - pTotal;
            }

            const deltaStr = delta !== null && total > 0
                ? `<span style="font-size:11px;color:${delta >= 0 ? posClr : negClr};margin-left:6px;">${delta >= 0 ? '+' : ''}${fmt(delta)}</span>`
                : '';

            html += snapCard('invest', mk, cardBg, border, txtClr, fmtMK(mk),
                `${deltaStr || `<span style="font-size:12px;color:${subClr};">—</span>`}`,
                `
                        ${acctRows || `<div style="font-size:11px;color:${subClr};">No data</div>`}
                        ${viewAccounts.length > 1 && total > 0 ? `
                        <div style="display:flex;justify-content:space-between;font-size:12px;font-weight:700;color:${accent};border-top:1px solid ${border};margin-top:4px;padding-top:4px;">
                            <span>Total</span><span>${fmt(total)}</span>
                        </div>` : ''}`, 10);
        });

        container.innerHTML = html;
    }

    // ─── Expense Snapshot List (inline monthly cards) ─────────
    function renderExpenseSnapshotList() {
        const container = document.getElementById('expenseSnapshotList');
        if (!container) return;

        const isSunset = (document.body.classList.contains('sunset-theme') || document.body.classList.contains('navy-theme'));
        const isDark   = document.body.classList.contains('alaskan-theme') || isSunset;

        const accent  = isSunset ? tc('#E08020') : '#D4AF37';
        const cardBg  = isSunset ? tc('#2A0808') : '#1A2A42';
        const border  = isSunset ? tc('#5A2018') : '#2A3A52';
        const txtClr  = isSunset ? tc('#F0D0A0') : '#E0E8F0';
        const subClr  = isSunset ? tc('#C08060') : '#7A8FA0';
        const negClr  = '#e74c3c';
        const posClr  = isSunset ? tc('#F5C030') : '#D4AF37';
        const inputBg = isSunset ? tc('#1A0404') : '#0D1829';

        const start = new Date(2024, 0, 1);
        const today = new Date();
        const end   = new Date(today.getFullYear(), today.getMonth(), 1);

        const allMonths = [];
        const cursor = new Date(start);
        while (cursor <= end) {
            allMonths.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`);
            cursor.setMonth(cursor.getMonth() + 1);
        }
        allMonths.reverse();

const fmtMK = mk => new Date(mk + '-02').toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

        let html = snapHead(subClr);

        allMonths.forEach((mk, i) => {
            const monthExpenses = expenses.filter(e => e.date && e.date.startsWith(mk));
            const total = monthExpenses.reduce((s, e) => s + (e.amount || 0), 0);

            const prevMK = allMonths[i + 1];
            let delta = null;
            if (prevMK !== undefined) {
                const prevTotal = expenses.filter(e => e.date && e.date.startsWith(prevMK)).reduce((s, e) => s + (e.amount || 0), 0);
                delta = total - prevTotal;
            }

const entryRows = monthExpenses.slice().reverse().map(e =>
                `<div style="background:${inputBg};border:1px solid ${border};border-radius:8px;padding:10px;margin-bottom:6px;">
                    <div class="u-flex-between">
                        <div>
                            <div style="font-size:12px;font-weight:700;color:${txtClr};">${e.companyName || 'Payment'}</div>
                            <div style="font-size:11px;color:${subClr};margin-top:1px;">${e.serviceType || ''} · ${fmtDate(e.date)}</div>
                        </div>
                        <div style="font-size:14px;font-weight:700;color:${negClr};">${fmtExpense(e.amount)}</div>
                    </div>
                </div>`
            ).join('');

            html += snapCard('expense', mk, cardBg, border, txtClr, fmtMK(mk),
                `${total > 0
                            ? `<span style="font-size:14px;font-weight:700;color:${negClr};">${fmtExpense(total)}</span>`
                            : `<span style="font-size:12px;color:${subClr};">—</span>`}`,
                `
                        ${entryRows || `<div style="font-size:11px;color:${subClr};padding:4px 0;">No entries this month.</div>`}`, 10);
        });

        container.innerHTML = html;
    }

    // ─── Debt Snapshot List (inline monthly cards) ────────────
    function renderDebtSnapshotList() {
        const container = document.getElementById('debtSnapshotList');
        if (!container) return;

        const isSunset = (document.body.classList.contains('sunset-theme') || document.body.classList.contains('navy-theme'));
        const isDark   = document.body.classList.contains('alaskan-theme') || isSunset;

        const cardBg  = isSunset ? tc('#2A0808') : '#1A2A42';
        const border  = isSunset ? tc('#5A2018') : '#2A3A52';
        const txtClr  = isSunset ? tc('#F0D0A0') : '#E0E8F0';
        const subClr  = isSunset ? tc('#C08060') : '#7A8FA0';
        const debtClr = '#EF9A9A';
        const posClr  = isSunset ? tc('#F5C030') : '#D4AF37';
        const inputBg = isSunset ? tc('#1A0404') : '#0D1829';

        const debtTypeLabels = {
            credit_card: 'Credit Card', mortgage: 'Mortgage', auto: 'Auto Loan',
            student: 'Student Loan', personal: 'Personal Loan', other: 'Other'
        };

        const start = new Date(2024, 0, 1);
        const today = new Date();
        const end   = new Date(today.getFullYear(), today.getMonth(), 1);

        const allMonths = [];
        const cursor = new Date(start);
        while (cursor <= end) {
            allMonths.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`);
            cursor.setMonth(cursor.getMonth() + 1);
        }
        allMonths.reverse();

const fmtMK = mk => new Date(mk + '-02').toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

        // For each month, use the latest-known balance per account up to that month (same as NW snapshot)
        const latestForAcct = (acctId, mk) => LC.balance(debtEntries, acctId, mk);   // 3.7

        let html = snapHead(subClr);

        allMonths.forEach((mk, i) => {
            let total = 0;
            const acctRows = debtAccounts.map(acct => {
                const v = latestForAcct(acct.id, mk);
                total += v;
                return v > 0
                    ? `<div style="display:flex;justify-content:space-between;font-size:11px;color:${subClr};padding:1px 0;">
                        <span>${acct.name}</span><span style="color:${debtClr};">-${fmt(v)}</span>
                       </div>`
                    : '';
            }).filter(Boolean).join('');

            const prevMK = allMonths[i + 1];
            let delta = null;
            if (prevMK !== undefined) {
                let pTotal = 0;
                debtAccounts.forEach(a => { pTotal += latestForAcct(a.id, prevMK); });
                delta = total - pTotal;
            }

            // delta for debt: going down is good (negative delta = positive sign)
            const deltaStr = delta !== null && total > 0
                ? `<span style="font-size:11px;color:${delta <= 0 ? posClr : debtClr};margin-left:6px;">${delta >= 0 ? '+' : ''}${fmt(delta)}</span>`
                : '';

            html += snapCard('debt', mk, cardBg, border, txtClr, fmtMK(mk),
                `${deltaStr || `<span style="font-size:12px;color:${subClr};">—</span>`}`,
                `
                        ${acctRows || `<div style="font-size:11px;color:${subClr};">No data</div>`}
                        ${debtAccounts.length > 1 && total > 0 ? `
                        <div style="display:flex;justify-content:space-between;font-size:12px;font-weight:700;color:${debtClr};border-top:1px solid ${border};margin-top:4px;padding-top:4px;">
                            <span>Total Debt</span><span>-${fmt(total)}</span>
                        </div>` : ''}`, 10);
        });

        container.innerHTML = html;
    }

