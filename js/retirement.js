// Sommerville Ledger 4 — retirement.js
// Retirement contributions page and annual limits
// Part of index.html (3.5.2 split). Plain script, loaded in order; all files share one global scope.
    // ═══════════════════════════════════════════════════════════
    // RETIREMENT CONTRIBUTIONS SECTION
    // ═══════════════════════════════════════════════════════════

    const CONTRIB_TYPES = {
        '401k_pretax':    { label: '401k Pre-Tax',    group: '401k_emp',   limitKey: 'limit401k'      },
        '401k_roth':      { label: 'Roth 401k',       group: '401k_emp',   limitKey: 'limit401k'      },
        'after_tax':      { label: 'After-Tax',       group: '401k_total', limitKey: 'limitTotal401k' },
        'employer_match': { label: 'Employer Match',  group: '401k_total', limitKey: 'limitTotal401k' },
        'hsa_employee':   { label: 'HSA — Employee',  group: 'hsa',        limitKey: 'limitHSA'       },
        'hsa_employer':   { label: 'HSA — Employer',  group: 'hsa',        limitKey: 'limitHSA'       },
    };

    // ─── Theme helpers ──────────────────────────────────────────
    function retTheme() {
        const isSunset = document.body.classList.contains('sunset-theme');
        const isDark   = document.body.classList.contains('alaskan-theme') || isSunset;
        return {
            isDark, isSunset,
            accent:    isSunset ? '#F5C030' : '#D4AF37',
            cardBg:    isSunset ? '#2A0808' : '#1A2A42',
            inputBg:   isSunset ? '#1A0404' : '#0D1829',
            borderClr: isSunset ? '#5A2018' : '#2A3A52',
            textClr:   isSunset ? '#F0D0A0' : '#E0E8F0',
            mutedClr:  isSunset ? '#C08060' : '#7A8FA0',
            valClr:    isSunset ? '#F5C030' : '#60A5FA',
            greenClr:  isSunset ? '#4ADE80' : '#4ADE80',
            warnClr:   '#F87171',
        };
    }

    // ─── Compute YTD totals (supports per-plan) ───────────────
    function retCalcYTD(sourceIdFilter) {
        const year    = new Date().getFullYear();
        const yrStr   = String(year);
        let entries   = retirementContribs.filter(e => e.date && e.date.startsWith(yrStr));
        if (sourceIdFilter) entries = entries.filter(e => e.sourceId === sourceIdFilter);

        const totals = {};
        Object.keys(CONTRIB_TYPES).forEach(k => { totals[k] = 0; });
        entries.forEach(e => {
            if (e.amounts && typeof e.amounts === 'object') {
                Object.entries(e.amounts).forEach(([k, v]) => { if (totals[k] !== undefined) totals[k] += (v || 0); });
            } else if (e.contribType) {
                if (totals[e.contribType] !== undefined) totals[e.contribType] += (e.amount || 0);
            }
        });
        const employee401k = totals['401k_pretax'] + totals['401k_roth'];
        const total401k    = employee401k + totals['after_tax'] + totals['employer_match'];
        const totalHSA     = totals['hsa_employee'] + totals['hsa_employer'];
        const grandTotal   = total401k + totalHSA;
        return { totals, employee401k, total401k, totalHSA, grandTotal };
    }

    // Sum YTD across multiple source IDs (used to merge bonus into parent company)
    function retCalcYTDMerged(sourceIds) {
        const year  = new Date().getFullYear();
        const yrStr = String(year);
        const idSet = new Set(sourceIds);
        let entries = retirementContribs.filter(e => e.date && e.date.startsWith(yrStr) && idSet.has(e.sourceId));
        const totals = {};
        Object.keys(CONTRIB_TYPES).forEach(k => { totals[k] = 0; });
        entries.forEach(e => {
            if (e.amounts && typeof e.amounts === 'object') {
                Object.entries(e.amounts).forEach(([k, v]) => { if (totals[k] !== undefined) totals[k] += (v || 0); });
            } else if (e.contribType) {
                if (totals[e.contribType] !== undefined) totals[e.contribType] += (e.amount || 0);
            }
        });
        const employee401k = totals['401k_pretax'] + totals['401k_roth'];
        const total401k    = employee401k + totals['after_tax'] + totals['employer_match'];
        const totalHSA     = totals['hsa_employee'] + totals['hsa_employer'];
        const grandTotal   = total401k + totalHSA;
        return { totals, employee401k, total401k, totalHSA, grandTotal };
    }

    // Returns the bonus source(s) for a given payroll source, if any
    function _retBonusSourcesFor(src) {
        const bonusSponsor = (src.sponsor || src.label || '') + ' \u2014 Bonus';
        return retirementSources.filter(s => s.sponsor === bonusSponsor || s.id.endsWith('_b') && s.sponsor && s.sponsor === bonusSponsor);
    }

    // Build a deduplicated list of "display sources" — bonus sources are folded into their parent
    function _retDisplaySources() {
        const bonusSponsors = new Set(
            payers.filter(p => p.defaultType === 'bonus').map(p => p.name)
        );
        // Payroll sources only (exclude sources whose sponsor is a bonus payer)
        return retirementSources.filter(s => !bonusSponsors.has(s.sponsor));
    }

    // ─── Main retirement page ───────────────────────────────────
    function updateRetirementPage() {
        const T    = retTheme();
        const lim  = retirementLimits;
        const year = new Date().getFullYear();

        const ytdAll       = retCalcYTD();
        const lim401k      = parseFloat(lim.limit401k)      || 0;
        const limTotal401k = parseFloat(lim.limitTotal401k) || 0;
        const limHSA       = parseFloat(lim.limitHSA)       || 0;

        document.getElementById('retYTDTotal').textContent = fmt(ytdAll.grandTotal);
        const yearLbl = document.getElementById('retYearLabel');
        if (yearLbl) yearLbl.textContent = year + ' Total Contributions';

        const the401kTypes = ['401k_pretax','401k_roth','after_tax','employer_match'];
        const planSrcs = _retDisplaySources().filter(s =>
            (s.contribTypes || []).some(k => the401kTypes.includes(k))
        );

        // Build list of vertical bar items: { label, sublabel, current, limit }
        const bars = [];

        // Only include sources that are enabled for display
        const visiblePlanSrcs = planSrcs.filter(s => s.showOnGraph !== false);

        // Helper: get merged YTD for a source + its bonus counterpart
        const mergedYTD = src => {
            const bonusSrcs = _retBonusSourcesFor(src);
            return bonusSrcs.length
                ? retCalcYTDMerged([src.id, ...bonusSrcs.map(b => b.id)])
                : retCalcYTD(src.id);
        };

        if (visiblePlanSrcs.length > 1) {
            visiblePlanSrcs.forEach(src => {
                const ytd      = mergedYTD(src);
                const perLim   = (lim.perPlan || {})[src.id] || {};
                const h401k    = parseFloat(perLim.limit401k)      || lim401k;
                const hTotal   = parseFloat(perLim.limitTotal401k) || limTotal401k;
                const company  = src.sponsor || src.institution || src.label;
                if ((src.contribTypes||[]).some(k=>['401k_pretax','401k_roth'].includes(k)))
                    bars.push({ label: '401k', sublabel: company, current: ytd.employee401k, limit: h401k });
                bars.push({ label: 'Total', sublabel: company, current: ytd.total401k, limit: hTotal });
            });
            bars.push({ label: 'HSA', sublabel: '', current: ytdAll.totalHSA, limit: limHSA });
        } else if (visiblePlanSrcs.length === 1) {
            const src     = visiblePlanSrcs[0];
            const ytd     = mergedYTD(src);
            const perLim  = (lim.perPlan || {})[src.id] || {};
            const h401k   = parseFloat(perLim.limit401k)      || lim401k;
            const hTotal  = parseFloat(perLim.limitTotal401k) || limTotal401k;
            const company = src.sponsor || src.institution || src.label;
            if ((src.contribTypes||[]).some(k=>['401k_pretax','401k_roth'].includes(k)))
                bars.push({ label: '401k', sublabel: company, current: ytd.employee401k, limit: h401k });
            bars.push({ label: 'Total', sublabel: company, current: ytd.total401k, limit: hTotal });
            bars.push({ label: 'HSA', sublabel: '', current: ytdAll.totalHSA, limit: limHSA });
        } else {
            bars.push({ label: '401k',  sublabel: '', current: ytdAll.employee401k, limit: lim401k      });
            bars.push({ label: 'Total', sublabel: '', current: ytdAll.total401k,    limit: limTotal401k });
            bars.push({ label: 'HSA',   sublabel: '', current: ytdAll.totalHSA,     limit: limHSA        });
        }

        // Filter out bars with no data and no limit
        const activeBars = bars.filter(b => b.current > 0 || b.limit > 0);

        const trackBg  = 'rgba(255,255,255,0.07)';
        const BAR_H    = 180; // px tall for the track

        const colsHtml = activeBars.map(b => {
            const pct     = b.limit > 0 ? Math.min(100, b.current / b.limit * 100) : 0;
            const over    = b.limit > 0 && b.current > b.limit;
            const fillH   = (pct / 100) * BAR_H;
            const barClr  = over ? T.warnClr : (pct >= 100 ? T.greenClr : (pct >= 75 ? '#FBBF24' : T.accent));
            const remain  = b.limit > 0 ? b.limit - b.current : null;

            return `
            <div style="display:flex;flex-direction:column;align-items:center;flex:1;min-width:0;padding:0 6px;">
                <!-- Value at top -->
                <div style="font-size:12px;font-weight:800;color:${barClr};margin-bottom:6px;text-align:center;line-height:1.2;">${fmt(b.current)}</div>
                <!-- Vertical track -->
                <div style="position:relative;width:100%;max-width:52px;height:${BAR_H}px;background:${trackBg};border-radius:10px;overflow:hidden;">
                    <!-- Fill from bottom -->
                    <div style="position:absolute;bottom:0;left:0;right:0;height:${fillH.toFixed(1)}px;background:${barClr};border-radius:10px;transition:height 0.5s ease;"></div>
                    <!-- Pct label inside bar if tall enough -->
                    ${fillH > 28 ? `<div style="position:absolute;bottom:6px;left:0;right:0;text-align:center;font-size:10px;font-weight:700;color:rgba(0,0,0,0.55);">${pct.toFixed(0)}%</div>` : ''}
                </div>
                <!-- Limit at bottom -->
                ${b.limit > 0 ? `<div style="font-size:10px;color:${T.mutedClr};margin-top:5px;text-align:center;">${fmt(b.limit)}</div>` : ''}
                <!-- Remaining / over -->
                <div style="font-size:10px;color:${over ? T.warnClr : T.mutedClr};margin-top:2px;text-align:center;">
                    ${b.limit > 0 ? (over ? `+${fmt(-remain)}` : `${fmt(remain)} left`) : ''}
                </div>
                <!-- Label -->
                <div style="font-size:11px;font-weight:700;color:${T.textClr};margin-top:6px;text-align:center;">${b.label}</div>
                <div style="font-size:10px;color:${T.mutedClr};text-align:center;line-height:1.3;">${b.sublabel}</div>
            </div>`;
        }).join('');

        const el = document.getElementById('retVertBars');
        if (el) el.innerHTML = `
            <div style="display:flex;justify-content:space-around;align-items:flex-end;gap:4px;">
                ${colsHtml}
            </div>`;
        renderRetSnapshotList();
    }

    // ─── Annual Limits Modal ────────────────────────────────────
    function initRetirementLimitsModal() {
        const T   = retTheme();
        const lim = retirementLimits;
        // Populate fields
        document.getElementById('retLimit401k').value      = lim.limit401k      || '';
        document.getElementById('retLimitTotal401k').value = lim.limitTotal401k || '';
        document.getElementById('retLimitHSA').value       = lim.limitHSA       || '';
        document.getElementById('retHSACoverage').value    = lim.hsaCoverage    || 'self';
        document.getElementById('retLimitsMsg').style.display = 'none';

        // Apply theme to heading labels and subtitle
        ['retLimitsAccentHead','retLimitsHSAHead'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.color = T.accent;
        });
        const sub = document.getElementById('retLimitsSubtitle');
        if (sub) sub.style.color = T.mutedClr;

        // Per-plan overrides — one row per plan that has 401k-type contributions (bonus sources excluded)
        const the401kTypes = ['401k_pretax','401k_roth','after_tax','employer_match'];
        const planSrcs = _retDisplaySources().filter(s =>
            (s.contribTypes || []).some(k => the401kTypes.includes(k))
        );
        const perPlan = lim.perPlan || {};
        const ppEl = document.getElementById('retPerPersonLimits');
        if (ppEl && planSrcs.length > 1) {
            ppEl.innerHTML = `
            <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:${T.accent};margin:14px 0 8px;">Per-Plan Overrides (optional)</div>
            <p style="font-size:12px;color:${T.mutedClr};margin-bottom:10px;">Leave blank to use the global limits above. Each plan = one person's limit.</p>
            ${planSrcs.map(src => `
            <div class="u-mb10">
                <div style="font-size:12px;font-weight:600;color:${T.textClr};margin-bottom:6px;">${src.label}</div>
                <div class="form-row" style="gap:8px;">
                    <div class="form-group u-mb0">
                        <label>Employee 401k Limit</label>
                        <input type="number" id="retPP401k_${src.id}" value="${perPlan[src.id]?.limit401k || ''}" placeholder="Global" step="500">
                    </div>
                    <div class="form-group u-mb0">
                        <label>Total 401k Limit</label>
                        <input type="number" id="retPPTotal_${src.id}" value="${perPlan[src.id]?.limitTotal401k || ''}" placeholder="Global" step="500">
                    </div>
                </div>
            </div>`).join('')}`;
        } else if (ppEl) {
            ppEl.innerHTML = '';
        }
    }

    function saveRetirementLimits() {
        // Collect per-plan overrides keyed by source.id (bonus sources excluded)
        const the401kTypes = ['401k_pretax','401k_roth','after_tax','employer_match'];
        const planSrcs = _retDisplaySources().filter(s =>
            (s.contribTypes || []).some(k => the401kTypes.includes(k))
        );
        const perPlan = {};
        planSrcs.forEach(src => {
            const v401k  = parseFloat(document.getElementById(`retPP401k_${src.id}`)?.value)  || 0;
            const vTotal = parseFloat(document.getElementById(`retPPTotal_${src.id}`)?.value) || 0;
            if (v401k || vTotal) perPlan[src.id] = { limit401k: v401k, limitTotal401k: vTotal };
        });
        retirementLimits = {
            limit401k:      parseFloat(document.getElementById('retLimit401k').value)      || 0,
            limitTotal401k: parseFloat(document.getElementById('retLimitTotal401k').value) || 0,
            limitHSA:       parseFloat(document.getElementById('retLimitHSA').value)       || 0,
            hsaCoverage:    document.getElementById('retHSACoverage').value,
            perPlan,
        };
        saveRetirementLimitsData();

        const msgEl = document.getElementById('retLimitsMsg');
        if (msgEl) {
            msgEl.textContent = 'Limits saved!';
            msgEl.className = 'msg success';
            msgEl.style.display = 'block';
            setTimeout(() => { msgEl.style.display = 'none'; }, 2500);
        }
        updateRetirementPage();
    }

