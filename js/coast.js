// Sommerville Ledger 4 — coast.js
// Coast FIRE page and goals
// Part of index.html (3.5.2 split). Plain script, loaded in order; all files share one global scope.
    // ════════════════════════════════════════════════════════
    // ─── COAST CONTRIBUTIONS SECTION ────────────────────────
    // ════════════════════════════════════════════════════════

    // coastContribs and coastAccounts: loaded by loadFromStorage() / applyImport()
    var coastContribs = [], coastAccounts = [];
    function saveCoastContribs()  { localStorage.setItem('pf_coastContribs',  encrypt(coastContribs)); }
    function saveCoastAccounts()  { localStorage.setItem('pf_coastAccounts',   encrypt(coastAccounts)); }

    function loadCoastData() {
        try { const d = localStorage.getItem('pf_coastContribs');  coastContribs  = decrypt(d) || []; } catch(e) { coastContribs  = []; }
        try { const d = localStorage.getItem('pf_coastAccounts');  coastAccounts  = decrypt(d) || []; } catch(e) { coastAccounts  = []; }
    }

    // ── Totals helpers ──
    function coastCalcYTD() {
        const yr = new Date().getFullYear();
        return coastContribs.filter(e => e.date && e.date.startsWith(String(yr)))
                            .reduce((s, e) => s + (e.amount || 0), 0);
    }
    function coastCalcAllTime() {
        return coastContribs.reduce((s, e) => s + (e.amount || 0), 0);
    }
    function coastCalcMonthlyAvg() {
        if (!coastContribs.length) return 0;
        // Find earliest contribution month
        const dated = coastContribs.filter(e => e.date).map(e => e.date.slice(0,7)).sort();
        if (!dated.length) return 0;
        const firstMo = dated[0]; // e.g. "2025-01"
        const now = new Date();
        const nowMo = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0');
        // Count calendar months from first contribution month through current month (inclusive)
        const [fy, fm] = firstMo.split('-').map(Number);
        const [ny, nm] = nowMo.split('-').map(Number);
        const totalMonths = (ny - fy) * 12 + (nm - fm) + 1;
        return totalMonths > 0 ? coastCalcAllTime() / totalMonths : 0;
    }
    function coastCalcForYear(yr) {
        return coastContribs.filter(e => e.date && e.date.startsWith(String(yr)))
                            .reduce((s, e) => s + (e.amount || 0), 0);
    }
    // 3.6: Coast FIRE (no mortgage) target — the same number as the Coast FIRE card on this page
    // (updateStats) and its ⓘ panel: (logged bills − mortgage, last 12 complete months) ÷ (1 − tax) ÷ 4%.
    // The desktop planner adds estimated living + health costs, so its target is much higher.
    function coastFireTarget() {
        const goal = getCoastFire();   // 3.7.1: LC.coastFire
        return isFinite(goal) && goal > 0 ? goal : 0;
    }

    // ── Main page update ──
    function updateCoastPage() {
        const T      = retTheme();
        const ytd    = coastCalcYTD();
        const allTime = coastCalcAllTime();
        const coastMonthlyAvgVal = coastCalcMonthlyAvg();
        const yr     = new Date().getFullYear();

        const ytdEl = document.getElementById('coastYTDTotal');
        if (ytdEl) ytdEl.textContent = fmt(ytd);
        const lblEl = document.getElementById('coastYearLabel');
        if (lblEl) lblEl.textContent = yr + ' Year-to-Date';
        // v3.5.1: the Historical Monthly Avg / All-Time Total boxes were removed (same numbers as the All Time row)
        renderCoastSnapshotList();
    }

    // ── Goals Page ──
    function updateGoalsPage() {
        const T          = retTheme();
        const allTime    = coastCalcAllTime();
        const coastMonthlyAvgVal = coastCalcMonthlyAvg();

        const hdr = document.getElementById('goalsAllTimeCoast');
        if (hdr) hdr.textContent = fmt(allTime);

        // Coast to 65 — current portfolio compounding with zero new contributions
        const c65El = document.getElementById('coastTo65Body');
        if (c65El) {
            const currentTotal = getCurrentTotal();
            const currentAge   = getCurrentAge();
            const yearsLeft    = 65 - currentAge;
            if (currentTotal > 0 && yearsLeft > 0) {
                const scenarios = [
{ label: 'Conservative', rate: 0.06 },
{ label: 'Moderate',     rate: 0.07 },
{ label: 'Aggressive',   rate: 0.08 },
                ];
                const fmtM = n => {
                    if (n >= 1e6) return '$' + (n/1e6).toFixed(2).replace(/\.?0+$/,'') + 'M';
                    return '$' + Math.round(n/1000) + 'K';
                };
                c65El.innerHTML = `
                    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:8px;">
                        ${scenarios.map(s => {
                            const bal = currentTotal * Math.pow(1 + s.rate, yearsLeft);
                            const mo  = bal * 0.04 / 12;
                            return `<div style="text-align:center;">
                                <div style="font-size:10px;font-weight:700;color:${T.mutedClr};text-transform:uppercase;letter-spacing:0.4px;margin-bottom:4px;">${s.label}</div>
                                <div style="font-size:17px;font-weight:900;color:${T.accent};">${fmtM(bal)}</div>
                                <div style="font-size:11px;color:${T.mutedClr};margin-top:2px;">${fmtM(mo)}/mo</div>
                            </div>`;
                        }).join('')}
                    </div>
                    <div style="font-size:10px;color:${T.mutedClr};text-align:center;padding-top:8px;border-top:1px solid ${T.borderClr};">
                        Starting ${fmtM(currentTotal)} · Age ${currentAge} → 65 · 4% withdrawal
                    </div>`;
            } else {
                c65El.innerHTML = `<div style="color:${T.mutedClr};font-size:13px;">Add investment entries to calculate.</div>`;
            }
        }

        // Annual contributions table
        const annEl = document.getElementById('goalsAnnualTable');
        if (annEl) {
            const thisYear = new Date().getFullYear();
            const years = [...new Set(coastContribs.filter(e=>e.date).map(e=>parseInt(e.date.slice(0,4),10)))].sort().reverse();
            if (!years.length) {
                annEl.innerHTML = `<div style="color:${T.mutedClr};font-size:13px;text-align:center;padding:8px;">No contribution data yet.</div>`;
            } else {
                annEl.innerHTML = `
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px;margin-bottom:4px;padding:0 4px;">
                    <span style="font-size:11px;font-weight:700;color:${T.mutedClr};">YEAR</span>
                    <span style="font-size:11px;font-weight:700;color:${T.mutedClr};text-align:right;">TOTAL</span>
                    <span style="font-size:11px;font-weight:700;color:${T.mutedClr};text-align:right;">AVG/MO</span>
                </div>` +
                years.map(yr => {
                    const total  = coastCalcForYear(yr);
                    // Divide by 12 for past years, or months elapsed so far for current year
                    const thisYr = new Date().getFullYear();
                    const moCount = yr < thisYr ? 12 : new Date().getMonth() + 1;
                    const avg    = total / moCount;
                    const isThis = yr === thisYear;
                    return `<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px;padding:8px 4px;border-top:1px solid ${T.borderClr};${isThis?'background:rgba(42,105,172,0.06);border-radius:6px;':''}">
                        <span style="font-size:14px;font-weight:${isThis?'800':'600'};color:${isThis?T.accent:T.textClr};">${yr}${isThis?' ✦':''}</span>
                        <span style="font-size:14px;font-weight:700;color:${T.valClr};text-align:right;">${fmt(total)}</span>
                        <span style="font-size:13px;color:${T.mutedClr};text-align:right;">${fmt(avg)}</span>
                    </div>`;
                }).join('') +
                `<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px;padding:8px 4px;border-top:2px solid ${T.accent};margin-top:4px;">
                    <span style="font-size:13px;font-weight:800;color:${T.textClr};">All Time</span>
                    <span style="font-size:13px;font-weight:800;color:${T.accent};text-align:right;">${fmt(allTime)}</span>
                    <span style="font-size:13px;color:${T.mutedClr};text-align:right;">${fmt(coastMonthlyAvgVal)}</span>
                </div>`;
            }
        }

        // 3.8: Coast goals come from the one goals system (goals.js): all-time contributions and the taxable balance
        // (with Coast FIRE). The per-account monthly coast goals were removed in 3.8.
        const cfEl = document.getElementById('goalsCoastMilestones');
        if (cfEl) cfEl.innerHTML = goalCard('coastContrib') + goalCard('taxable');

        // Combined savings rate
        const srEl = document.getElementById('goalsSavingsRate');
        if (srEl) {
            // v15.1: trailing 12 months, after-tax basis (shared with Summary)
            const _sv = getT12Savings();
            const retMonthlyAvg = _sv.retMonthly;
            const coastT12Monthly = _sv.coastMonthly;
            const totalSavings = _sv.totalMonthly;
            const rate = getSavingsRate();
            const rateClr = rate===null?T.mutedClr:rate>=30?'#00c805':rate>=20?T.accent:rate>=10?'#FBBF24':'#F87171';

            srEl.innerHTML = `
                <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid ${T.borderClr};">
                    <span style="font-size:13px;color:${T.mutedClr};">Retirement avg/mo</span>
                    <span style="font-size:13px;font-weight:700;color:${T.valClr};">${fmt(retMonthlyAvg)}</span>
                </div>
                <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid ${T.borderClr};">
                    <span style="font-size:13px;color:${T.mutedClr};">Coast contrib avg/mo</span>
                    <span style="font-size:13px;font-weight:700;color:${T.valClr};">${fmt(coastT12Monthly)}</span>
                </div>
                <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid ${T.borderClr};">
                    <span style="font-size:14px;font-weight:700;color:${T.textClr};">Total savings/mo</span>
                    <span style="font-size:16px;font-weight:900;color:${T.accent};">${fmt(totalSavings)}</span>
                </div>
                <div style="display:flex;justify-content:space-between;padding:8px 0;">
                    <span style="font-size:14px;font-weight:700;color:${T.textClr};">Savings Rate</span>
                    <span style="font-size:20px;font-weight:900;color:${rateClr};">${rate!==null?rate.toFixed(1)+'%':'—'}</span>
                </div>
                ${rate!==null?`<div style="font-size:11px;color:${T.mutedClr};margin-top:4px;">
                    ${rate>=50?'🌟 Exceptional savings rate':rate>=30?'💪 Strong savings rate':rate>=20?'✅ Good savings rate':rate>=10?'⚠️ Below 20% target':'🔴 Low savings rate — review expenses'}
                </div>`:''}`;
        }
    }

    // ── Wire into navigate() and load ──
    // (injected into the navigate switch below)

