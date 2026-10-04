// Sommerville Ledger 4 — app.js
// Startup, state, swipes, the Summary sheet, the Logbook, navigation
// Part of index.html (3.5.2 split). Plain script, loaded in order; all files share one global scope.

    // ─── Timezone-safe month key helper ──────────────────────
    // Always use local time; never toISOString() for month keys
    // (toISOString() is UTC and shifts the month for US timezones)
    function moKey(d) {
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    }

    // ─── Themes (4.1.0; Royal Navy replaced Sea Glass in 4.2.0) ──
    // Code that colors things itself checks "isSunset" (which also covers Royal Navy) and passes each Sunset
    // color through tc(): on Sunset it's unchanged, on Royal Navy it becomes that color's navy version.
    // The CSS works the same way (each sunset rule has a navy twin right after it in app.css).
    // Add a color here whenever a new isSunset ? '...' color is added, or it shows in sunset colors on Royal Navy.
    const NAVY_COLORS = {
        // shared Dark/Sunset gold and greys used by the main charts
        '#D4AF37': '#FFC801',
        'rgba(212,175,55,0.1)': 'rgba(255,200,1,0.1)',
        'rgba(212,175,55,0.15)': 'rgba(255,200,1,0.15)',
        '#C0C0C0': '#D9E8E3',
        '#5A6F83': '#2A4A58',
        '#2A3A52': '#114C5A',
        // Sunset colors
        '#000': '#000',
        '#1A0404': '#0F1E26',
        '#2A0808': '#172B36',
        '#4ADE80': '#5EE0A0',
        '#5A2018': '#114C5A',
        '#5CD080': '#5ED69A',
        '#6AB0E0': '#7CC4E0',
        '#C08060': '#93B3B1',
        '#C09070': '#93B3B1',
        '#D0A888': '#ACCAC0',
        '#D0B090': '#B1CDC4',
        '#E05050': '#F0675A',
        '#E08020': '#FF9932',
        '#F0D0A0': '#D9E8E3',
        '#F5C030': '#FFC801',
        'rgba(20,4,2,0.9)': 'rgba(8,14,17,0.9)',
        'rgba(20,4,2,0.95)': 'rgba(8,14,17,0.95)',
        'rgba(245,192,48,0.12)': 'rgba(255,208,38,0.12)',
        'rgba(30,80,30,0.35)': 'rgba(30,110,70,0.35)',
        'rgba(35,8,4,0.0)': 'rgba(14,25,31,0.0)',
        'rgba(35,8,4,0.7)': 'rgba(14,25,31,0.7)',
        'rgba(35,8,4,0.88)': 'rgba(14,25,31,0.88)',
        'rgba(35,8,4,0.90)': 'rgba(14,25,31,0.90)',
        'rgba(50,12,6,0.85)': 'rgba(20,36,44,0.85)',
        'rgba(80,20,20,0.35)': 'rgba(120,35,30,0.35)'
    };
    function tc(c) {
        return document.body.classList.contains('navy-theme') ? (NAVY_COLORS[c] || c) : c;
    }

    // ─── State ───────────────────────────────────────────────
    let entries = [];
    let accounts = [];
    let institutions = ['M1', 'Charles Schwab', 'Sofi', 'T.Rowe', 'Empower', 'HSA Bank'];
    let expenses = [];
    let companies = [];
    let yearlyGoals = {}; // { year: { amount, completed, completionDate } }
    let currentView = 'total';
    let chart = null;
    let metalsData = {}; // { 'YYYY-MM': { gold: X, silver: Y } }
    let demoMode = false;
    let isUnlocked = false;
    let taxAdjustEnabled = true;   // Apply tax gross-up to FIRE numbers
    let taxRatePct = 25;           // Effective tax rate %
    let failedLoginAttempts = 0; // Track failed PIN attempts
    let debtAccounts = []; // { id, name, type, institution }
    let debtEntries = [];  // { date, amount, accountId, accountName, accountType, ts }
    let bulkDebtPayments = []; // { id, date, amount, accountId, accountName, note, ts }
    let monthNotes = {}; // { 'YYYY-MM': 'note text' }
    let debtChart = null;
    let incomeEntries = [];  // { date, amount, type, payerId, payerName, ts }
    let payers = [];         // { id, name, defaultType }
    let currentIncomeView = 'total';

    let retirementContribs = []; // { id, date, sourceId, sourceName, amounts:{type:val,...}, totalAmount, ts }
    let retirementLimits   = {}; // { limit401k, limitTotal401k, limitHSA, hsaCoverage, perPerson:{holder:{limit401k,limitTotal401k}} }
    let retirementSources  = []; // { id, label, institution, sponsor, contribTypes:[] } — each source = one plan/person

    // ─── Swipe Detection & Notepad ─────────────
    let touchStartX = 0;
    let touchStartY = 0;
    let touchEndX = 0;
    let touchEndY = 0;
    let notepadIsOpen = false;
    let overviewIsOpen = false;

    function handleSwipe() {
        // Swipe gestures are mobile-only — desktop mode uses mouse/trackpad
        const swipeDistanceX = touchEndX - touchStartX;
        const swipeDistanceY = touchEndY - touchStartY;
        const elapsed = Date.now() - touchStartTime;
        const velocityX = Math.abs(swipeDistanceX) / elapsed;
        const absX = Math.abs(swipeDistanceX);
        const absY = Math.abs(swipeDistanceY);
        const minSwipe = 65;
        const minVelocity = 0.35;

        // Overview/logbook overlay close-swipes (still needed for the overlays themselves)
        if (overviewIsOpen) {
            const clearlyUp = swipeDistanceY < -120 && absY > absX * 2.5 && (Math.abs(swipeDistanceY) / elapsed) > 0.6;
            if (clearlyUp) closeOverview();
            return;
        }
        if (notepadIsOpen) {
            // No swipe-to-close for logbook — use the close button
            return;
        }

        // Only horizontal swipes below — no vertical swipes on main pages
        if (absX <= absY * 1.2) return;
        if (absX < minSwipe) return;

        // Swipe right → go back
        if (swipeDistanceX > minSwipe) {
            goBack();
        }
        // Swipe left → flip home screen to page 2 (only on home, page 1)
        // (page 2 → page 1 handled by homeSlider touch listener directly)
    }

    // ─── Overview / Statement Page ───────────────────────────
    function openOverview() {
        try { buildOverview(); } catch(e) { console.error('buildOverview error:', e); }
        const page = document.getElementById('overviewPage');
        page.style.display = 'block';
        // Force reflow so CSS transition fires reliably
        void page.offsetHeight;
        page.style.transform = 'translateY(0)';
        overviewIsOpen = true;
    }

    function closeOverview() {
        const page = document.getElementById('overviewPage');
        page.style.transform = 'translateY(-100%)';
        setTimeout(() => { page.style.display = 'none'; }, 350);
        overviewIsOpen = false;
    }

    function buildOverview() {
        // Round to nearest dollar for this page
        const fmtR = n => {
            const v = demoMode ? n * 0.01 : n;
return new Intl.NumberFormat('en-US', { style:'currency', currency:'USD', maximumFractionDigits:0 }).format(Math.round(v));
        };
const fmtRraw = fmtR;   // 4.0.5: was unscaled, so spending, FIRE, income, retirement and coast showed real numbers in Demo Mode

        // Date
        const now = new Date();
        document.getElementById('ovDate').textContent =
now.toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' });

        // Total portfolio
        let total = 0;
        const acctValues = accounts.map(acct => {
            const val = LC.balance(entries, acct.id, null);   // 3.7: latest by date
            total += val;
            return { acct, val };
        });

        // Net Worth — liquid (investments - debt) and true (+ home equity)
        const totalDebt = getTotalDebt();
        const liquidNW  = total - totalDebt + getLoansOwed();   // v3.4: + loans owed to you
        const latestHV  = realEstateTotal();   // v3.5: every property's latest value
        const netWorth  = liquidNW + latestHV;   // true NW

        // Portfolio Snapshot card
        const portfolioBalEl = document.getElementById('ovPortfolioBalance');
        if (portfolioBalEl) portfolioBalEl.textContent = fmtR(total);

        // True Net Worth
        const ovNetWorthEl = document.getElementById('ovNetWorth');
        if (ovNetWorthEl) {
            ovNetWorthEl.textContent = fmtR(netWorth);
            ovNetWorthEl.className = 'row-value';
        }

        // Liquid NW — shown indented under Net Worth as ↳ Liquid
        const ovLiqEl = document.getElementById('ovLiquidNW');
        if (ovLiqEl) {
            ovLiqEl.textContent = fmtR(liquidNW);
            ovLiqEl.className = 'row-value';
        }

        // Home equity row — only shown if there's a home value logged
        const ovHERow = document.getElementById('ovHomeEquityRow');
        const ovHEEl  = document.getElementById('ovHomeEquity');
        if (ovHERow) ovHERow.style.display = latestHV > 0 ? '' : 'none';
        if (ovHEEl && latestHV > 0) {
            ovHEEl.textContent = fmtR(latestHV);
            ovHEEl.className = 'row-value';
        }

        // Individual debt accounts — type label first, then account name, no negative sign, no icons
        const typeLabels = { mortgage:'Mortgage', auto:'Auto', student:'Student', credit:'Credit', personal:'Personal', other:'Other' };
        const ovDebtRowsEl = document.getElementById('ovDebtRows');
        if (ovDebtRowsEl) {
            if (debtAccounts.length === 0) {
                ovDebtRowsEl.innerHTML = '';
            } else {
                ovDebtRowsEl.innerHTML = debtAccounts.map(acct => {
                    const _on = new Date(); const _op = new Date(_on.getFullYear(), _on.getMonth()-1, 1);
                    const _ok = _op.getFullYear()+'-'+String(_op.getMonth()+1).padStart(2,'0');
                    const latest = debtEntries
                        .filter(e => e.accountId === acct.id && e.date.slice(0,7) <= _ok)
                        .sort((a,b) => a.date.localeCompare(b.date));
                    const bal = latest.length ? latest[latest.length-1].amount : 0;
                    if (bal <= 0) return '';
                    const typeLabel = typeLabels[acct.type] || acct.type;
                    return `<div class="overview-row">
                        <span class="row-label">${typeLabel}</span>
                        <span class="row-value">${fmtR(bal)}</span>
                    </div>`;
                }).join('');
            }
        }

        // Account breakdown — sorted biggest to smallest
        const acctRows = acctValues
            .filter(({ val }) => val > 0)
            .sort((a, b) => b.val - a.val)
            .map(({ acct, val }) => {
                const pct = total > 0 ? ((val / total) * 100).toFixed(1) : '0.0';
                return `<div class="overview-row">
                    <span class="row-label">${acct.nickname || acct.institution} <span style="font-size:10px;opacity:0.5;">${acct.type.toUpperCase()}</span></span>
                    <span class="row-value">${fmtR(val)} <span style="font-size:11px;opacity:0.5;">${pct}%</span></span>
                </div>`;
            }).join('') || '<div class="overview-row"><span class="row-label">No accounts</span></div>';
        document.getElementById('ovAccountRows').innerHTML = acctRows;

        // FIRE metrics
        const wr = _wr();   // fixed 4% on the phone
        const annualExp = getAnnualSpending();          // logged bills, last 12 complete months (3.1)
        // 3.7.1: targets from ledger-core.js
        const fullFireNum  = annualExp > 0 ? getFullFire() : 0;
        const coastFireNum = annualExp > 0 ? getCoastFire() : 0;

        document.getElementById('ovAnnualExp').textContent      = annualExp > 0   ? fmtRraw(annualExp) : '—';
        document.getElementById('ovSafeWithdrawal').textContent = total > 0       ? fmtRraw(total * wr) + '/yr' : '—';
        document.getElementById('ovFullFire').textContent       = fullFireNum > 0  ? fmtRraw(fullFireNum) : '—';
        document.getElementById('ovCoastFire').textContent      = coastFireNum > 0 ? fmtRraw(coastFireNum) : '—';

        // Break-even hourly rate — minimum to cover all bills with no contributions
        const ovBreakEvenEl = document.getElementById('ovBreakEven');
        if (ovBreakEvenEl && annualExp > 0) {
            // v3.1: logged bills only (estimated living + health insurance live in the desktop planner)
            // Gross up for federal tax + FICA (no Alaska state income tax) — LC.breakEvenHourly (3.7.1)
            const hourlyRate  = LC.breakEvenHourly(getTrackedAnnualExpenses());
            ovBreakEvenEl.textContent = '$' + (demoMode ? hourlyRate * 0.01 : hourlyRate).toFixed(2) + '/hr';   // 4.0.5: Demo Mode
        } else if (ovBreakEvenEl) {
            ovBreakEvenEl.textContent = '—';
        }

        // Allocation by type — sorted biggest to smallest
        const types = ['401k', 'ira', 'hsa', 'taxable', 'metals', 'receivable'];
        const allocTypeLabels = { '401k':'401(k)', ira:'IRA', hsa:'HSA', taxable:'Taxable Brokerage', metals:'Precious Metals', receivable:'Loans Receivable' };
        const allocData = types.map(type => {
            const typeAccts = accounts.filter(a => a.type === type);
            const typeTotal = LC.investTotal(typeAccts, entries, null);   // 3.7
            return { type, typeTotal };
        }).filter(d => d.typeTotal > 0).sort((a, b) => b.typeTotal - a.typeTotal);

        const allocRows = allocData.map(({ type, typeTotal }) => {
            const pct = total > 0 ? ((typeTotal / total) * 100).toFixed(1) : '0.0';
            return `<div class="overview-row">
                <span class="row-label">${allocTypeLabels[type]}</span>
                <span class="row-value">${fmtR(typeTotal)} <span style="font-size:11px;opacity:0.5;">${pct}%</span></span>
            </div>`;
        }).join('');
        document.getElementById('ovAllocRows').innerHTML = allocRows || '<div class="overview-row"><span class="row-label">No data</span></div>';

        // Income Snapshot
        const incToday    = new Date();
        const incYear     = incomeEntries.filter(_inT12);   // 3.7.1: last 12 complete months (LC.inT12)

        // Net = sum of .amount for all entries — this is what every other widget uses
        const incNet     = incYear.reduce((s, e) => s + (e.amount || 0), 0);
        const incMonthly = incNet / 12;

        // Gross = grossPay (if logged) for payroll, otherwise fall back to amount; plus amount for all non-payroll
        const incGross = incYear.reduce((s, e) => {
            if (e.type === 'payroll') return s + (e.grossPay != null ? e.grossPay : (e.amount || 0));
            return s + (e.amount || 0);
        }, 0);

        const ovIncGrossEl = document.getElementById('ovIncomeGross');
        const ovIncAnnEl   = document.getElementById('ovIncomeAnnual');
        const ovIncMonEl   = document.getElementById('ovIncomeMonthly');
        if (ovIncGrossEl) ovIncGrossEl.textContent = incGross > 0 ? fmtRraw(incGross) : '—';
        if (ovIncAnnEl)   ovIncAnnEl.textContent   = incNet   > 0 ? fmtRraw(incNet)   : '—';
        if (ovIncMonEl)   ovIncMonEl.textContent   = incMonthly > 0 ? fmtRraw(incMonthly) : '—';

        // By income type
        const incTypeMap = {};
        incYear.forEach(e => { incTypeMap[e.type] = (incTypeMap[e.type] || 0) + (e.amount || 0); });
        const incTypeLabels = { payroll:'Payroll', dividends:'Dividends', tax_refund:'Tax Refund', bonus:'Bonus' };
        const incTypeRows = Object.entries(incTypeMap)
            .sort((a, b) => b[1] - a[1])
            .map(([k, v]) => `<div class="overview-row">
                <span class="row-label" style="padding-left:12px; font-size:12px;">↳ ${incTypeLabels[k] || k}</span>
                <span class="row-value" style="font-size:13px;">${fmtRraw(v)}</span>
            </div>`).join('');
        const ovIncTypeEl = document.getElementById('ovIncomeTypeRows');
        if (ovIncTypeEl) ovIncTypeEl.innerHTML = incTypeRows;

        // Combined YTD income
        const yrStr = incToday.getFullYear().toString();
        const ytdTotal = incomeEntries.filter(e => e.date.startsWith(yrStr))
            .reduce((s, e) => s + (e.amount || 0), 0);
        const ovIncPayerEl = document.getElementById('ovIncomePayerRows');
        if (ovIncPayerEl) ovIncPayerEl.innerHTML = ytdTotal > 0 ? `
            <div class="overview-row">
                <span class="row-label">${yrStr} YTD</span>
                <span class="row-value">${fmtRraw(ytdTotal)}</span>
            </div>` : '';

        // Retirement Snapshot
        const retYTD = retCalcYTD();
        const retLim = retirementLimits;
        const lim401k  = parseFloat(retLim.limit401k)  || 0;
        const limHSA   = parseFloat(retLim.limitHSA)   || 0;

        const ovRetYTDEl    = document.getElementById('ovRetYTD');
        const ovRetEmp401kEl = document.getElementById('ovRetEmployee401k');
        const ovRetMatchEl  = document.getElementById('ovRetMatch');
        const ovRetHSAEl    = document.getElementById('ovRetHSA');
        if (ovRetYTDEl)     ovRetYTDEl.textContent     = retYTD.grandTotal   > 0 ? fmtRraw(retYTD.grandTotal)                      : '—';
        if (ovRetEmp401kEl) ovRetEmp401kEl.textContent = retYTD.employee401k > 0 ? fmtRraw(retYTD.employee401k)                    : '—';
        if (ovRetMatchEl)   ovRetMatchEl.textContent   = retYTD.totals['employer_match'] > 0 ? fmtRraw(retYTD.totals['employer_match']) : '—';
        if (ovRetHSAEl)     ovRetHSAEl.textContent     = retYTD.totalHSA     > 0 ? fmtRraw(retYTD.totalHSA)                        : '—';

        // 401k limit row
        const lim401kRow    = document.getElementById('ovRet401kLimitRow');
        const lim401kRemain = document.getElementById('ovRet401kRemain');
        if (lim401kRow && lim401kRemain && lim401k > 0) {
            // v15.1: limits are per person — check each plan (plus its bonus plan) separately
            const planSrcs = _retDisplaySources().filter(s =>
                (s.contribTypes || []).some(k => k === '401k_pretax' || k === '401k_roth'));
            const parts = planSrcs.map(src => {
                const bonus = _retBonusSourcesFor(src);
                const ytd   = bonus.length ? retCalcYTDMerged([src.id, ...bonus.map(b => b.id)]) : retCalcYTD(src.id);
                const lim   = parseFloat(((retLim.perPlan || {})[src.id] || {}).limit401k) || lim401k;
                const rem   = lim - ytd.employee401k;
                return (src.sponsor || src.institution || src.label) + ' ' + (rem > 0 ? fmtRraw(rem) : 'Maxed ✓');
            });
            lim401kRow.style.display = '';
            lim401kRemain.textContent = parts.length ? parts.join(' · ') : fmtRraw(lim401k - retYTD.employee401k);
            lim401kRemain.style.color = '';
        } else if (lim401kRow) { lim401kRow.style.display = 'none'; }

        // HSA limit row
        const limHSARow    = document.getElementById('ovRetHSALimitRow');
        const limHSARemain = document.getElementById('ovRetHSARemain');
        if (limHSARow && limHSARemain && limHSA > 0) {
            const remainHSA = limHSA - retYTD.totalHSA;
            limHSARow.style.display = '';
            limHSARemain.textContent = remainHSA > 0 ? fmtRraw(remainHSA) : 'Maxed ✓';
            limHSARemain.style.color = remainHSA <= 0 ? '#4CAF50' : '';
        } else if (limHSARow) { limHSARow.style.display = 'none'; }

        // Avg monthly contributions (based on months that have any data)
        const ovRetAvgEl = document.getElementById('ovRetAvgMonth');
        let retMonthlyAvgOv = 0;
        if (ovRetAvgEl) {
            const activeMonths = new Set(retirementContribs.filter(e => e.date).map(e => e.date.slice(0,7)));
            const monthCount   = activeMonths.size;
            const allTimeTotal = retirementContribs.reduce((s, e) => {
                if (e.amounts && typeof e.amounts === 'object') return s + Object.values(e.amounts).reduce((a,v) => a+(v||0), 0);
                return s + (e.totalAmount || e.amount || 0);
            }, 0);
            retMonthlyAvgOv = monthCount > 0 ? allTimeTotal / monthCount : 0;
            ovRetAvgEl.textContent = retMonthlyAvgOv > 0 ? fmtRraw(retMonthlyAvgOv) : '—';
        }

        // Coast Contributions snapshot
        const coastYTDEl  = document.getElementById('ovCoastYTD');
        const coastMoEl   = document.getElementById('ovCoastMonthly');
        const coastAllEl  = document.getElementById('ovCoastAllTime');
        const srRetEl     = document.getElementById('ovSRRetirement');
        const srCoastEl   = document.getElementById('ovSRCoast');
        const srTotalEl   = document.getElementById('ovSRTotal');
        const srPctEl     = document.getElementById('ovSRPct');

        const coastYTDVal   = typeof coastCalcYTD    === 'function' ? coastCalcYTD()    : 0;
        const coastAvgVal   = typeof coastCalcMonthlyAvg === 'function' ? coastCalcMonthlyAvg() : 0;
        const coastAllVal   = typeof coastCalcAllTime === 'function' ? coastCalcAllTime() : 0;

        if (coastYTDEl)  coastYTDEl.textContent  = coastYTDVal > 0  ? fmtRraw(coastYTDVal)  : '—';
        if (coastMoEl)   coastMoEl.textContent   = coastAvgVal > 0  ? fmtRraw(coastAvgVal)  : '—';
        if (coastAllEl)  coastAllEl.textContent  = coastAllVal > 0  ? fmtRraw(coastAllVal)  : '—';

        // Combined savings rate — v15.1: trailing 12 months, after-tax basis
        const _svOv          = getT12Savings();
        const totalSavingsOv = _svOv.totalMonthly;
        const savingsRate    = getSavingsRate();
        const rateColor    = savingsRate === null ? '' : savingsRate >= 30 ? '#00c805' : savingsRate >= 20 ? '#2a69ac' : savingsRate >= 10 ? '#F59E0B' : '#dc3545';

        if (srRetEl)   srRetEl.textContent   = _svOv.retMonthly > 0 ? fmtRraw(_svOv.retMonthly) : '—';
        if (srCoastEl) srCoastEl.textContent = _svOv.coastMonthly > 0 ? fmtRraw(_svOv.coastMonthly) : '—';
        if (srTotalEl) srTotalEl.textContent = totalSavingsOv > 0    ? fmtRraw(totalSavingsOv)     : '—';
        if (srPctEl) {
            srPctEl.textContent = savingsRate !== null ? savingsRate.toFixed(1) + '%' : '—';
            if (rateColor) srPctEl.style.color = rateColor;
        }
    }

    // ─── Logbook System ──────────────────────────────────────
    let logbookEntries = [];    // [{text, timestamp, id}]
    let logbookCurrentIdx = -1; // -1 = new entry mode

    function logbookBuildChronicle() {
        // Build a read-only synthetic entry from monthNotes, newest first
        const notes = monthNotes || {};
        const sorted = Object.keys(notes).sort().reverse(); // YYYY-MM newest first
        if (!sorted.length) return null;
        const text = sorted.map(mk => {
            const [y, m] = mk.split('-');
            const label = new Date(parseInt(y), parseInt(m) - 1, 1)
.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
            return label + '\n' + notes[mk];
        }).join('\n\n');
        return { id: 'chronicle', chronicle: true, timestamp: new Date().toISOString(), text };
    }

    function logbookLoad() {
        const saved = localStorage.getItem('pf_logbook');
        logbookEntries = saved ? JSON.parse(saved) : [];
        // Prepend the auto-generated monthly notes chronicle as entry 0
        const chronicle = logbookBuildChronicle();
        if (chronicle) logbookEntries.unshift(chronicle);
    }

    function logbookSave() {
        // Strip the chronicle entry before persisting — it's always rebuilt on load
        const toSave = logbookEntries.filter(e => !e.chronicle);
        localStorage.setItem('pf_logbook', JSON.stringify(toSave));
    }

    function logbookCopy() {
        const text = document.getElementById('notepadText').value.trim();
        if (!text) return;
        const btn = document.getElementById('logbookCopyBtn');
        navigator.clipboard.writeText(text).then(() => {
            if (btn) {
                const orig = btn.innerHTML;
                btn.innerHTML = '✅ Copied!';
                btn.style.background = 'rgba(76,175,80,0.25)';
                btn.style.borderColor = '#4CAF50';
                btn.style.color = '#4CAF50';
                setTimeout(() => {
                    btn.innerHTML = orig;
                    const isDark = document.body.classList.contains('alaskan-theme') || (document.body.classList.contains('sunset-theme') || document.body.classList.contains('navy-theme'));
                    btn.style.background = tc('rgba(212,175,55,0.15)');
                    btn.style.borderColor = tc('#D4AF37');
                    btn.style.color = tc('#D4AF37');
                }, 1800);
            }
        }).catch(() => {
            // Fallback for browsers without clipboard API
            const ta = document.getElementById('notepadText');
            ta.select();
            document.execCommand('copy');
            if (btn) { btn.innerHTML = '✅ Copied!'; setTimeout(() => { btn.innerHTML = '📋 Copy'; }, 1800); }
        });
    }

    function logbookRender() {
        const total = logbookEntries.length;
        const isNew = logbookCurrentIdx === -1;
        const prevBtn = document.getElementById('logbookPrevBtn');
        const nextBtn = document.getElementById('logbookNextBtn');
        const counter = document.getElementById('logbookCounter');
        const tsBar = document.getElementById('logbookTimestampBar');
        const ta = document.getElementById('notepadText');

        const deleteBtn = document.getElementById('logbookDeleteBtn');
        if (isNew) {
            ta.value = '';
            ta.readOnly = false;
            counter.textContent = total > 0 ? 'New Entry  (' + total + ' saved)' : 'New Entry';
            tsBar.textContent = '';
            prevBtn.disabled = total === 0;
            nextBtn.disabled = true;
            if (deleteBtn) deleteBtn.style.opacity = '0.4';
        } else {
            const entry = logbookEntries[logbookCurrentIdx];
            ta.value = entry.text;
            const isChronicle = !!entry.chronicle;
            ta.readOnly = isChronicle;
            ta.style.opacity = isChronicle ? '0.85' : '1';
            const num = logbookCurrentIdx + 1;
            if (isChronicle) {
                counter.textContent = 'Monthly Notes Chronicle';
                tsBar.textContent = '📋 Auto-generated from Data Dump notes · read-only';
            } else {
                counter.textContent = 'Entry ' + num + ' of ' + total;
                const d = new Date(entry.timestamp);
tsBar.textContent = '🕐 ' + d.toLocaleDateString('en-US', {weekday:'short', year:'numeric', month:'short', day:'numeric'}) + '  ' + d.toLocaleTimeString('en-US', {hour:'2-digit', minute:'2-digit'});
            }
            prevBtn.disabled = logbookCurrentIdx === 0;
            nextBtn.disabled = logbookCurrentIdx >= total - 1;
            if (deleteBtn) deleteBtn.style.opacity = isChronicle ? '0.4' : '1';
        }
    }

    function logbookNew() {
        logbookCurrentIdx = -1;
        logbookRender();
        document.getElementById('notepadText').focus();
    }

    function logbookAutoSave() {
        if (logbookCurrentIdx !== -1 && logbookEntries[logbookCurrentIdx] && logbookEntries[logbookCurrentIdx].chronicle) return; // never overwrite chronicle
        const text = document.getElementById('notepadText').value.trim();
        if (!text) return;
        if (logbookCurrentIdx === -1) {
            const entry = { id: Date.now(), timestamp: new Date().toISOString(), text };
            logbookEntries.push(entry);
            logbookCurrentIdx = logbookEntries.length - 1;
        } else {
            logbookEntries[logbookCurrentIdx].text = text;
            logbookEntries[logbookCurrentIdx].editedAt = new Date().toISOString();
        }
        logbookSave();
    }

    function logbookDelete() {
        if (logbookCurrentIdx === -1) return; // nothing to delete on new entry
        if (logbookEntries[logbookCurrentIdx] && logbookEntries[logbookCurrentIdx].chronicle) return; // chronicle is read-only
        if (!confirm('Delete this log entry?')) return;
        logbookEntries.splice(logbookCurrentIdx, 1);
        logbookSave();
        // Move to adjacent entry or new entry
        if (logbookEntries.length === 0) {
            logbookCurrentIdx = -1;
        } else if (logbookCurrentIdx >= logbookEntries.length) {
            logbookCurrentIdx = logbookEntries.length - 1;
        }
        logbookRender();
    }

    function logbookPrev() {
        logbookAutoSave();
        if (logbookCurrentIdx === -1) {
            // from new entry, go to last saved
            if (logbookEntries.length > 0) logbookCurrentIdx = logbookEntries.length - 1;
        } else if (logbookCurrentIdx > 0) {
            logbookCurrentIdx--;
        }
        logbookRender();
    }

    function logbookNext() {
        logbookAutoSave();
        if (logbookCurrentIdx < logbookEntries.length - 1) {
            logbookCurrentIdx++;
        } else {
            logbookCurrentIdx = -1; // go to new entry
        }
        logbookRender();
    }

    function saveNotepad() {
        logbookLoad();
        const text = document.getElementById('notepadText').value.trim();
        if (!text) return;

        if (logbookCurrentIdx === -1) {
            // New entry
            const entry = { id: Date.now(), timestamp: new Date().toISOString(), text };
            logbookEntries.push(entry);
            logbookCurrentIdx = logbookEntries.length - 1;
        } else {
            // Update existing
            logbookEntries[logbookCurrentIdx].text = text;
            logbookEntries[logbookCurrentIdx].editedAt = new Date().toISOString();
        }
        logbookSave();
        logbookRender();

        const msg = document.getElementById('notepadSaveMsg');
        msg.style.display = 'block';
        setTimeout(() => { msg.style.display = 'none'; }, 2000);
    }

    // Touch event listeners for swipe detection
    let touchStartTime = 0;
    document.addEventListener('touchstart', e => {
        touchStartX = e.changedTouches[0].clientX;
        touchStartY = e.changedTouches[0].clientY;
        touchStartTime = Date.now();
}, { passive: true });

    document.addEventListener('touchend', e => {
        touchEndX = e.changedTouches[0].clientX;
        touchEndY = e.changedTouches[0].clientY;
        handleSwipe();
}, { passive: true });

    // Prevent browser pull-to-refresh on the overview/swipe pages when they are open
    document.addEventListener('touchmove', e => {
        if (overviewIsOpen || notepadIsOpen) {
            // Allow scroll within those pages but prevent document scroll
            const target = e.target;
            const overviewPage = document.getElementById('overviewPage');
            const notepadPage = document.getElementById('notepadPage');
            const isInsideScrollable = (overviewPage && overviewPage.contains(target)) ||
                                       (notepadPage && notepadPage.contains(target));
            if (!isInsideScrollable) e.preventDefault();
        }
}, { passive: false });

    // ─── Init ────────────────────────────────────────────────
    document.addEventListener('DOMContentLoaded', () => {
        showSplash();
    });

    // Backdrop tap — tapping outside a modal card closes it cleanly
    document.addEventListener('click', (e) => {
        const openModal = document.querySelector('.modal.open');
        if (!openModal) return;
        if (e.target === openModal) closeModal(openModal.id);
    });

    // Block ALL touch events from reaching home page elements when a modal is open.
    // pointer-events:none only affects mouse events on mobile — touch needs its own guard.
    document.addEventListener('touchstart', e => {
        const openModal = document.querySelector('.modal.open');
        if (!openModal) return;
        // If touch is inside the modal card, let it through
        const card = openModal.querySelector('.modal-box');
        if (card && card.contains(e.target)) return;
        if (openModal.contains(e.target) && e.target !== openModal) return;
        // Touch is on backdrop or outside — block it completely
        e.stopImmediatePropagation();
        e.preventDefault();
}, { passive: false, capture: true });

    document.addEventListener('touchend', e => {
        const openModal = document.querySelector('.modal.open');
        if (!openModal) return;
        const card = openModal.querySelector('.modal-box');
        if (card && card.contains(e.target)) return;
        if (openModal.contains(e.target) && e.target !== openModal) return;
        e.stopImmediatePropagation();
        e.preventDefault();
        // Close on backdrop tap
        if (e.target === openModal) closeModal(openModal.id);
}, { passive: false, capture: true });

    function checkPinStatus() {
        const pinHash = localStorage.getItem('pf_pin');
        const lockScreen = document.getElementById('lockScreen');

        if (!pinHash) {
            // First time user - show setup
            document.getElementById('pinInputSection').style.display = 'none';
            document.getElementById('pinSetupSection').style.display = 'block';
            document.getElementById('lockMessage').textContent = 'Welcome! Set up your security PIN';
            lockScreen.style.display = 'flex';
        } else {
            // Existing user - show login
            lockScreen.style.display = 'flex';
        }
    }

    // ─── Fullscreen Functions ────────────────────────────────
    // 4.0.4: only for the app opened in a browser tab. The installed app is already fullscreen from the
    // manifest ("display": "fullscreen"), and asking again stacked Chrome's page fullscreen on top: the
    // "To exit full screen…" toast, and Android's back/home/apps buttons vanishing almost as soon as they
    // were swiped up (until Back dropped the page fullscreen).
    function requestFullscreen() {
        // Skip when installed (manifest fullscreen or standalone) or already fullscreen
        if (window.matchMedia('(display-mode: fullscreen)').matches ||
            window.matchMedia('(display-mode: standalone)').matches ||
            window.navigator.standalone === true ||
            document.fullscreenElement || document.webkitFullscreenElement) return;
        // Defer so the DOM has painted and dvh has resolved before the browser
        // recalculates the viewport in fullscreen mode.
        requestAnimationFrame(() => {
            setTimeout(() => {
                const el = document.documentElement;
                const req = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen || el.msRequestFullscreen;
                if (req) req.call(el).catch(() => {});
            }, 180);
        });
    }
    function enterFullscreen() {
        requestFullscreen();
        closeModal('displayOptionsModal');
    }

    function initApp() {
        loadFromStorage();
        buildChart();
        refreshAll();
        renderHomeGrids();
        initHomeSliderTouch();
        navStack = ['home'];
        navigate('home', true); // Show home page (was hidden at startup to prevent flash)
    }

    // ═══════════════════════════════════════════════════════════
    // BULLETPROOF NAVIGATION - Stack-Based System
    // ═══════════════════════════════════════════════════════════
    let navStack = ['home'];
    let skipNextPopstate = false;
    let historyDepth = 0;  // tracks exactly how many pushState calls we've made
    let navLocked = false;
    // Main navigation function
    function navigate(location, skipHistory, bypassLock) {
        if (navLocked && !bypassLock) {
            return;
        }

        // Add to stack
        if (!skipHistory) {
            navStack.push(location);
            history.pushState({ idx: navStack.length - 1 }, '', '');
            historyDepth++;
        }

        // Close all modals and notepad
        const openModals = document.querySelectorAll('.modal.open');
        if (openModals.length > 0) {
            openModals.forEach(m => {
                m.classList.remove('open');
            });
        }

        if (notepadIsOpen) {
            document.getElementById('notepadPage').style.transform = 'translateY(100%)';
            setTimeout(() => document.getElementById('notepadPage').style.display = 'none', 300);
            notepadIsOpen = false;
        }

        // Parse location (format: "page" or "page:modal" or "page:notepad")
        const [page, overlay] = location.split(':');

        // Hide all pages (remove any lingering entrance animation class too)
        const allPageIds = ['setupPage', 'dataPage', 'loansPage', 'homePage', 'incomePage', 'incomeStatsPage', 'accountsPage', 'retirementPage', 'expensesPage', 'networthPage', 'debtPage', 'realEstatePage', 'firePage', 'calculatorPage', 'budgetPage', 'goalsPage'];
        allPageIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.style.display = 'none';
                el.classList.remove('page-entering');
            }
        });

        // Helper: show a page with smooth fade-in
        function showPage(id, initFn) {
            const el = document.getElementById(id);
            el.style.display = 'block';
            // Force reflow so animation restarts cleanly
            void el.offsetWidth;
            el.classList.add('page-entering');
el.addEventListener('animationend', () => el.classList.remove('page-entering'), { once: true });
            if (initFn) {
                try { initFn(); }
                catch(e) { console.warn('showPage initFn error:', id, e); navLocked = false; }
            }
        }

        // Show target page
        const pageActions = {
            'home':       () => showPage('homePage'),
            'income':     () => showPage('incomePage', () => updateIncomeTotals()),
            'incomeStats': () => showPage('incomeStatsPage', () => renderIncomeStats()),
            'accounts':   () => showPage('accountsPage',   () => { if (!chart) buildChart(); updateChart(); updateHeader(); }),
            'retirement': () => showPage('retirementPage', () => updateRetirementPage()),
            'coast':      () => showPage('firePage', () => { document.getElementById('fireTab-goals').style.display='none'; document.getElementById('fireTab-coast').style.display='block'; updateFirePage(); }),
            'goals':      () => showPage('firePage', () => { setFireTabByName('goals'); updateFirePage(); }),
            'expenses':   () => showPage('expensesPage',   () => updateExpensesTotals()),
            'networth':   () => showPage('networthPage',    () => updateNetWorthPage()),
            'debt':       () => showPage('debtPage',       () => updateDebtAccountsPage()),
            'realestate': () => showPage('realEstatePage', () => updateRealEstatePage()),   // 3.5.3
            'stats':      () => showPage('firePage', () => { setFireTabByName('coast'); updateFirePage(); }),
            'fire':       () => showPage('firePage', () => { document.getElementById('fireTab-goals').style.display='none'; document.getElementById('fireTab-coast').style.display='block'; updateFirePage(); }),
            'calculator': () => showPage('calculatorPage', () => {
                seedCompoundCalc();
                runCompoundCalc();
            }),
            'budget':     () => showPage('budgetPage', () => { seedBudgetCalc(); runBudgetCalc(); }),
            'data':       () => showPage('dataPage', () => { ddBuildMonthDropdown(); }),   // v3.3: full page (was dataDumpModal)
            'loans':      () => showPage('loansPage', () => updateLoansPage()),   // 3.5.4: a regular page
            'allgoals':   () => showPage('goalsPage', () => updateGoalsOverview()),   // 3.8: every goal's next step
            'setup':      () => showPage('setupPage', () => { suView = 'list'; suDraft = null; suSheetOpen = false; suRender(); })
        };

        if (pageActions[page]) {
            pageActions[page]();
        }

        // Show overlay (modal or notepad) if specified
        if (overlay === 'notepad') {
            logbookLoad();
            logbookCurrentIdx = -1;
            const np = document.getElementById('notepadPage');
            np.style.display = 'block';
            setTimeout(() => { np.style.transform = 'translateY(0)'; logbookRender(); }, 10);
            notepadIsOpen = true;
        } else if (overlay) {
            // Open modal in the next animation frame — zero visible delay, no flash
            requestAnimationFrame(() => {
                const modal = document.getElementById(overlay);
                if (modal) {
                    modal.classList.add('open');
                    if (overlay === 'goalsModal')              updateGoals();
                    if (overlay === 'networthGoalsModal')      renderNetWorthGoals();
                    if (overlay === 'retirementLimitsModal')   initRetirementLimitsModal();
                }
            });
        }

    }

    // Go back in navigation stack
    function goBack() {
        // v15.2.1: swipe-back closes an open info panel first
        if (typeof infoIsOpen === 'function' && infoIsOpen()) { closeInfo(); return; }

        if (navStack.length <= 1) {
            // At home - immediately push forward to prevent going back past app
            history.pushState({ idx: 0 }, '', '');
            history.pushState({ idx: 0 }, '', ''); // Double-push as safety
            historyDepth += 2;
            return;
        }

        // v3.2: Back inside Setup closes the add sheet or the form, not the page
        const top = navStack[navStack.length - 1];
        if (suHandleBack(top)) return;
        if (ddHandleBack(top)) return;   // v3.3: Data page with unsaved typing asks first

        navLocked = true;  // Lock to prevent double-back
        navStack.pop();
        const previous = navStack[navStack.length - 1];
        navigate(previous, true, true);  // ← bypassLock=true!
        setTimeout(() => {
            navLocked = false;
        }, 100);
    }

    // Handle browser back button
    window.addEventListener('popstate', (e) => {
        e.preventDefault();
        if (skipNextPopstate) { skipNextPopstate = false; return; }
        // v15.2.1: Back closes an open info panel and stays on the page
        if (typeof infoIsOpen === 'function' && infoIsOpen()) {
            closeInfo();
            history.pushState({ idx: 0 }, '', '');   // restore the history entry Back just used
            return;
        }
        goBack();
    });

    // Initialize history with safety buffer to prevent app exit
    history.replaceState({ idx: 0 }, '', '');
    history.pushState({ idx: 0 }, '', '');  // Safety buffer
    history.pushState({ idx: 0 }, '', '');  // Double safety

    // ═══════════════════════════════════════════════════════════
    // Wrapper Functions (for existing code compatibility)
    // ═══════════════════════════════════════════════════════════
    function showAccountsPage() {navigate('accounts'); }
    function showIncomePage() {navigate('income'); }
    function showIncomeStatsPage() {navigate('incomeStats'); }
    function showRetirementPage() { navigate('retirement'); }
    function showNetWorthPage() { navigate('networth'); }
    function showHomeValuePage() { navigate('realestate'); }   // 3.5.3: a page (was the homeValueModal pop-up)
    function showExpensesPage() {navigate('expenses'); }
    function showDebtPage() { navigate('debt'); }
    function showFirePage(tab)  { navigate(tab === 'coast' ? 'coast' : tab === 'goals' ? 'goals' : 'fire'); }
    function openCoastGoals() {
        const coast = document.getElementById('fireTab-coast');
        const goals = document.getElementById('fireTab-goals');
        if (coast) coast.style.display = 'none';
        if (goals) {
            goals.classList.remove('u-hidden');
            goals.style.display = 'block';
        }
        updateGoalsPage();
        // Add back button if not already there
        if (!document.getElementById('coastGoalsBackBtn') && goals) {
            const btn = document.createElement('button');
            btn.id = 'coastGoalsBackBtn';
            btn.className = 'action-btn';
            btn.style.cssText = 'width:100%;margin-bottom:16px;';
            btn.textContent = '\u2190 Back to Coast';
            btn.onclick = closeCoastGoals;
            goals.insertBefore(btn, goals.firstChild);
        }
    }
    function closeCoastGoals() {
        const coast = document.getElementById('fireTab-coast');
        const goals = document.getElementById('fireTab-goals');
        if (goals) goals.style.display = 'none';
        if (coast) coast.style.display = 'block';
        renderCoastSnapshotList();
    }

    function setFireTab(btn) {
        document.querySelectorAll('#fireTabBar button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const tab = btn.getAttribute('data-ftab');
        ['plan','coast','goals'].forEach(t => {
            const el = document.getElementById('fireTab-' + t);
            if (el) el.style.display = t === tab ? 'block' : 'none';
        });
        _updateFireHeader(tab);
    }

function setFireTabByName(tab) {
        const btn = document.querySelector('#fireTabBar button[data-ftab="' + tab + '"]');
        if (btn) setFireTab(btn);
    }

    function _updateFireHeader(tab) {
        const hdrVal  = document.getElementById('firePageHeaderVal');
        const hdrLbl  = document.getElementById('firePageHeaderLabel');
        const ytdLbl  = document.getElementById('firePageYTDLabel');
        if (!hdrVal) return;
        // Always show total taxable + YTD contributions
        const taxableTotal = getTaxableTotal();   // 3.7: latest by date
        hdrVal.textContent = fmt(taxableTotal);
        if (hdrLbl) hdrLbl.textContent = 'Total Taxable';
        if (ytdLbl) ytdLbl.textContent = fmt(coastCalcYTD()) + ' YTD Contributions';
    }

    function updateFirePage() {
        // Theme the card backgrounds
        const T = retTheme();
        document.querySelectorAll('#firePage .bg-card-blue, #firePage .bg-card-blue-r12, #firePage .bg-card-blue-r12-14, #firePage .bg-card-blue-r12-p10').forEach(el => {
            el.style.background = T.cardBg;
        });
        // Run all three section updates
        updateStats();
        updateCoastPage();
        updateGoalsPage();
        // Update header after data is rendered
        const activeBtn = document.querySelector('#fireTabBar button.active');
        const activeTab = activeBtn ? activeBtn.getAttribute('data-ftab') : 'coast';
        _updateFireHeader(activeTab);
    }
    function showHomePage() {
        loadIconSize();
        navStack = ['home'];
        // Pop exactly as many browser history entries as we've pushed,
        // so no stale popstate entries remain after tapping home.
        const depth = historyDepth;
        historyDepth = 0;
        if (depth > 0) {
            skipNextPopstate = true;
            history.go(-depth);
            setTimeout(() => {
                skipNextPopstate = false;
                navigate('home', true);
            }, 100);
        } else {
            navigate('home', true);
        }
    }
    function openNotepad() { navigate(navStack[navStack.length-1].split(':')[0] + ':notepad'); }
    function closeNotepad() {goBack(); }
    function openModal(id) { navigate(navStack[navStack.length-1].split(':')[0] + ':' + id); }
    function closeModal(id) {
        if (navStack.length <= 1) return;
        // Close button path: pop navStack, navigate back, AND consume the
        // browser history entry so popstate doesn't fire a second goBack().
        navLocked = true;
        navStack.pop();
        const previous = navStack[navStack.length - 1];
        navigate(previous, true, true);
        // Consume the stale history entry without triggering goBack() again
        skipNextPopstate = true;
        historyDepth = Math.max(0, historyDepth - 1);
        history.back();
        setTimeout(() => { navLocked = false; skipNextPopstate = false; }, 300);
    }

