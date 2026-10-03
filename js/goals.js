// Sommerville Ledger 4 — goals.js (3.8)
// One goals system: every goal ladder, its steps, when each step was reached, the Goals page and the Goal steps editor.
// Part of index.html. Plain script, loaded in order; all files share one global scope.
//
// A track is one number you're climbing (portfolio, net worth, …) with an ordered ladder of steps.
//  - The current step is the first one never reached. Once a step is reached it stays done (✓ + the month it
//    was first reached), even if the number dips later. Nothing is stored for that: the month comes from history.
//  - Ladders are editable in Goals page → Edit goal steps (pf_goalLadders, encrypted; in the backup as goalLadders).
//    A track with no saved ladder uses its defaults below.
//  - Some tracks carry extra rows that aren't ladder steps: the two critical-mass points (Portfolio) and
//    Coast FIRE (Taxable). They're worked out from today's numbers each time.
//  - The yearly portfolio goals (planning.js) stay date-based, beside the Portfolio track.
// Money math comes from ledger-core.js (LC).

    const GOAL_TRACKS = [
        { id: 'portfolio', name: 'Portfolio', emoji: '📈', page: 'Investments',
          defaults: [250000, 500000, 750000, 1000000, 1500000, 2000000, 2500000, 3000000] },
        { id: 'networth', name: 'Net Worth', emoji: '🏦', page: 'Net Worth', note: 'incl. real estate',
          defaults: [100000, 250000, 500000, 1000000, 1500000, 2000000] },
        { id: 'liquid', name: 'Liquid Net Worth', emoji: '💧', page: 'Net Worth', note: 'investments − debt + loans',
          defaults: [100000, 250000, 500000, 750000, 1000000, 1500000] },
        { id: 'taxable', name: 'Taxable Balance', emoji: '🌄', page: 'Coast FIRE', note: 'can be spent before 59½',
          defaults: [25000, 50000, 100000, 250000, 300000, 400000, 500000, 750000, 1000000] },
        { id: 'coastContrib', name: 'Coast Contributions', emoji: '🌱', page: 'Coast FIRE', note: 'all-time',
          defaults: [1000, 5000, 10000, 25000, 50000, 100000, 150000, 200000, 250000, 500000] },
        { id: 'incomeMonthly', name: 'Monthly Income', emoji: '💵', page: 'Income', note: 'average, last 12 months',
          defaults: [10000, 15000, 20000] },
        { id: 'incomeAnnual', name: 'Annual Income', emoji: '💰', page: 'Income', note: 'last 12 months',
          defaults: [200000, 250000, 300000] },
        { id: 'incomeAllTime', name: 'All-Time Earned', emoji: '🏆', page: 'Income', note: 'every income entry',
          defaults: [500000, 1000000, 2000000] },
    ];
    const goalTrack = id => GOAL_TRACKS.find(t => t.id === id);
    const CRIT_INFLATION = 0.03;   // critical mass (spending): growth after inflation = 7% − 3%

    // ── Ladders (Goals page → Edit goal steps) ──
    let goalLadders = null;   // { trackId: [amounts] } — only tracks you've changed
    function goalsLoad() {
        if (goalLadders) return goalLadders;
        let v = null;
        try { v = decrypt(localStorage.getItem('pf_goalLadders')); } catch (e) { v = null; }
        goalLadders = v && typeof v === 'object' && !Array.isArray(v) ? v : {};
        return goalLadders;
    }
    function goalsSave() { localStorage.setItem('pf_goalLadders', encrypt(goalLadders || {})); }
    function goalLadder(id) {
        const L = goalsLoad()[id];
        const t = goalTrack(id);
        const steps = Array.isArray(L) && L.length ? L : (t ? t.defaults : []);
        return [...new Set(steps.map(Number).filter(v => isFinite(v) && v > 0))].sort((a, b) => a - b);
    }

    // ── Values: now, and month by month (for the month each step was first reached) ──
    function _gNow() { return moKey(new Date()); }
    function _gFirstMonth() {
        const all = [entries, debtEntries, incomeEntries, coastContribs, loanEvents].flatMap(l => (l || []).map(e => e && e.date ? e.date.slice(0, 7) : null)).filter(Boolean).sort();
        return all[0] || _gNow();
    }
    function _gMonths() {
        const out = [], now = _gNow();
        for (let m = _gFirstMonth(); m <= now && out.length < 1200; m = LC.addMonths(m, 1)) out.push(m);
        return out;
    }
    // Today's value of a track
    function goalValue(id) {
        const now = _gNow();
        switch (id) {
            case 'portfolio':     return getCurrentTotal();
            case 'networth':      return getCurrentNetWorth() + realEstateTotal();
            case 'liquid':        return getCurrentNetWorth();
            case 'taxable':       return getTaxableTotal();
            case 'coastContrib':  return coastCalcAllTime();
            case 'incomeAnnual':  return LC.takeHome(incomeEntries, now);
            case 'incomeMonthly': return LC.takeHome(incomeEntries, now) / 12;
            case 'incomeAllTime': return incomeEntries.reduce((s, e) => s + (e.amount || 0), 0);
        }
        return 0;
    }
    // The value at the end of month mk (each month's own entries; debt and loans through that month)
    function goalValueAt(id, mk) {
        const inv = () => LC.investTotal(accounts, entries, mk);
        const liq = () => inv() - LC.debtThrough(debtAccounts, debtEntries, mk) + LC.loansOwed(loanPeople, loanEvents, mk);
        const thru = list => (list || []).filter(e => e && e.date && e.date.slice(0, 7) <= mk).reduce((s, e) => s + (e.amount || 0), 0);
        switch (id) {
            case 'portfolio':     return inv();
            case 'liquid':        return liq();
            case 'networth':      return liq() + realEstateTotal(mk);
            case 'taxable':       return LC.taxableTotal(accounts, entries, mk);
            case 'coastContrib':  return thru(coastContribs);
            case 'incomeAnnual':  return LC.takeHome(incomeEntries, LC.addMonths(mk, 1));          // the 12 months ending with mk
            case 'incomeMonthly': return LC.takeHome(incomeEntries, LC.addMonths(mk, 1)) / 12;
            case 'incomeAllTime': return thru(incomeEntries);
        }
        return 0;
    }
    // Monthly amount used for a projected date (null = no date for this track)
    function goalMonthly(id) {
        const sv = LC.t12Savings(retirementContribs, coastContribs, _gNow());
        if (id === 'portfolio' || id === 'networth' || id === 'liquid') return sv.totalMo;
        if (id === 'taxable' || id === 'coastContrib') return sv.coastMo;
        return null;
    }
    // Months to a step: balances grow at 7% plus savings; contributions just add up (no growth)
    function goalMonthsTo(id, value, target) {
        const mo = goalMonthly(id);
        if (mo == null) return null;
        if (id === 'coastContrib') return value >= target ? 0 : mo > 0 ? Math.ceil((target - value) / mo) : Infinity;
        return LC.monthsToGoal(value, target, mo);
    }

    // ── Track state: done steps (with the month first reached), current step, what's after it ──
    let _goalCache = null;   // { key, states } — rebuilt when the data changes
    function _goalDataKey() {
        return [entries.length, debtEntries.length, incomeEntries.length, coastContribs.length, loanEvents.length,
                dtGetHomeValues().length, JSON.stringify(goalsLoad()), _gNow()].join('|');
    }
    function goalState(id) {
        const key = _goalDataKey();
        if (!_goalCache || _goalCache.key !== key) _goalCache = { key, states: {} };
        if (_goalCache.states[id]) return _goalCache.states[id];
        const steps = goalLadder(id), value = goalValue(id);
        const months = _gMonths(), series = months.map(m => [m, m === _gNow() ? value : goalValueAt(id, m)]);
        const firstAt = target => { const hit = series.find(([, v]) => v >= target); return hit ? hit[0] : null; };
        const done = [], todo = [];
        steps.forEach(target => { const mk = firstAt(target); (mk ? done : todo).push(mk ? { target, mk } : { target }); });
        const st = { id, value, steps, done, current: todo[0] || null, rest: todo.slice(1), firstAt };
        _goalCache.states[id] = st;
        return st;
    }
    // Extra rows that aren't ladder steps
    function goalExtras(id) {
        const st = goalState(id);
        const row = (label, target, note) => ({ label, target, note, mk: target > 0 ? st.firstAt(target) : null });
        if (id === 'portfolio') {
            const sv = LC.t12Savings(retirementContribs, coastContribs, _gNow());
            const yearly = sv.totalMo * 12, spend = getAnnualSpending();
            return [
                row('⚖️ Critical mass: growth beats your saving', yearly / LC.PLAN_RETURN,
                    'An average ' + Math.round(LC.PLAN_RETURN * 100) + '% year adds more than the ' + fmt(yearly) + ' you saved in the last 12 months.'),
                row('🛟 Critical mass: growth covers your spending', spend / (LC.PLAN_RETURN - CRIT_INFLATION),
                    'An average year’s growth after ' + Math.round(CRIT_INFLATION * 100) + '% inflation pays your ' + fmt(spend) + ' of yearly spending (logged bills; the desktop adds living + health).'),
            ];
        }
        if (id === 'taxable') {
            const cf = coastFireTarget();
            return cf > 0 ? [row('🎯 Coast FIRE', cf, 'From logged bills minus the mortgage. The desktop planner adds living + health, so its number is higher.')] : [];
        }
        return [];
    }

    // ── One renderer for every goal card ──
    function _gMon(mk) { const [y, m] = mk.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }); }
    function _gEsc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
    function _gBar(T, pct, clr) {
        return `<div style="background:${T.borderClr};border-radius:6px;height:9px;overflow:hidden;margin:6px 0 4px;"><div style="width:${Math.min(100, Math.max(0, pct)).toFixed(1)}%;background:${clr};height:100%;border-radius:6px;"></div></div>`;
    }
    // A row for one target: reached → ✓ + month; not reached → progress, amount left, projected date
    function _gTargetRow(T, id, label, target, mk, value, opts) {
        opts = opts || {};
        if (mk) return `<div style="display:flex;justify-content:space-between;gap:10px;padding:6px 0;font-size:13px;">
                <span style="color:${T.textClr};">${label}</span><span style="color:${T.greenClr};font-weight:700;white-space:nowrap;">✓ ${_gMon(mk)}</span></div>`
            + (opts.note ? `<div style="font-size:10px;color:${T.mutedClr};margin:-4px 0 6px;font-style:italic;">${_gEsc(opts.note)}</div>` : '');
        const n = goalMonthsTo(id, value, target);
        const when = n == null ? '' : ' · ' + formatProjectedDate(n);
        return `<div style="padding:4px 0 8px;">
                <div style="display:flex;justify-content:space-between;gap:10px;font-size:13px;">
                    <span style="color:${T.textClr};font-weight:700;">${opts.next ? 'Next: ' : ''}${label}</span>
                    <span style="color:${T.accent};font-weight:800;">${(target > 0 ? value / target * 100 : 0).toFixed(0)}%</span></div>
                ${_gBar(T, target > 0 ? value / target * 100 : 0, T.accent)}
                <div style="font-size:11px;color:${T.mutedClr};">${fmt(target - value)} to go${when}</div>
                ${opts.note ? `<div style="font-size:10px;color:${T.mutedClr};margin-top:3px;font-style:italic;">${_gEsc(opts.note)}</div>` : ''}
            </div>`;
    }
    // opts.compact: the Goals page (current step only, no completed list)
    function goalCard(id, opts) {
        opts = opts || {};
        const t = goalTrack(id); if (!t) return '';
        const T = retTheme(), st = goalState(id);
        const label = v => fmt(v).replace('.00', '');
        let body = '';
        if (st.current) body += _gTargetRow(T, id, label(st.current.target), st.current.target, null, st.value, { next: true });
        else body += `<div style="font-size:13px;color:${T.greenClr};font-weight:700;padding:4px 0 8px;">✓ Every step reached. Add more with Edit goal steps on the Goals page.</div>`;
        const last = st.done[st.done.length - 1];
        if (last && !opts.compact) body += _gTargetRow(T, id, 'Last reached: ' + label(last.target), last.target, last.mk, st.value);
        goalExtras(id).forEach(x => { body += _gTargetRow(T, id, x.label, x.target, x.mk, st.value, { note: opts.compact ? '' : x.note }); });
        if (!opts.compact && st.done.length > 1) {
            const listId = 'goal-done-' + id;
            body += `<button class="u-btn-clear" style="font-size:12px;color:${T.accent};padding:6px 0 0;width:auto;" onclick="const e=document.getElementById('${listId}');e.style.display=e.style.display==='none'?'block':'none';">Show completed (${st.done.length})</button>
                <div id="${listId}" style="display:none;border-top:1px solid ${T.borderClr};margin-top:6px;padding-top:4px;">
                ${st.done.slice().reverse().map(d => _gTargetRow(T, id, label(d.target), d.target, d.mk, st.value)).join('')}</div>`;
        }
        if (!opts.compact && st.rest.length) body += `<div style="font-size:10px;color:${T.mutedClr};margin-top:6px;">After that: ${st.rest.slice(0, 3).map(r => label(r.target)).join(' → ')}${st.rest.length > 3 ? ' → …' : ''}</div>`;
        return `<div style="background:${T.cardBg};border:1px solid ${T.borderClr};border-radius:12px;padding:14px;margin-bottom:12px;">
                <div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px;margin-bottom:6px;">
                    <div><div style="font-size:15px;font-weight:800;color:${T.accent};">${t.emoji} ${t.name}</div>
                        ${t.note ? `<div style="font-size:11px;color:${T.mutedClr};">${t.note}</div>` : ''}</div>
                    <div style="font-size:16px;font-weight:800;color:${T.textClr};white-space:nowrap;">${fmt(st.value)}</div></div>
                ${body}</div>`;
    }

    // ── Goals page: the current step of every track ──
    function openGoals() { navigate('allgoals'); }
    function updateGoalsOverview() {
        const el = document.getElementById('goalsOverviewBody'); if (!el) return;
        const T = retTheme();
        const yr = new Date().getFullYear(), yg = yearlyGoals[yr];
        const head = t => `<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:${T.mutedClr};margin:16px 0 8px;">${t}</div>`;
        let yearly = '';
        if (yg) {
            const v = getCurrentTotal();
            yearly = head(yr + ' goal') + `<div style="background:${T.cardBg};border:1px solid ${T.borderClr};border-radius:12px;padding:14px;margin-bottom:12px;">`
                + (yg.completed ? `<div style="display:flex;justify-content:space-between;font-size:13px;"><span style="color:${T.textClr};font-weight:700;">${fmt(yg.amount)} by Dec 31</span><span style="color:${T.greenClr};font-weight:700;">✓ ${_gEsc(yg.completionDate || '')}</span></div>`
                               : _gTargetRow(T, 'portfolio', fmt(yg.amount) + ' by Dec 31', yg.amount, null, v)) + '</div>';
        }
        const groups = [...new Set(GOAL_TRACKS.map(t => t.page))];
        el.innerHTML = yearly + groups.map(g => head(g) + GOAL_TRACKS.filter(t => t.page === g).map(t => goalCard(t.id, { compact: true })).join('')).join('')
            + `<button class="action-btn dark u-mt10" onclick="openGoalSteps()">Edit goal steps</button>`;
    }

    // ── Goals page → Edit goal steps ──
    function openGoalSteps() { openModal('goalStepsModal'); renderGoalSteps(); }
    function renderGoalSteps(msg) {
        const el = document.getElementById('goalStepsBody'); if (!el) return;
        const T = retTheme(), L = goalsLoad();
        el.innerHTML = (msg ? `<div class="msg success" style="display:block;margin-bottom:10px;">${_gEsc(msg)}</div>` : '')
            + `<p style="font-size:13px;margin:0 0 12px;" class="col-muted">Each track climbs these steps in order. A step you've already reached keeps its ✓ and month. Tap × to remove a step.</p>`
            + GOAL_TRACKS.map(t => {
                const steps = goalLadder(t.id), custom = Array.isArray(L[t.id]);
                return `<div style="background:${T.cardBg};border:1px solid ${T.borderClr};border-radius:12px;padding:12px 14px;margin-bottom:10px;">
                    <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px;">
                        <span style="font-size:14px;font-weight:800;color:${T.accent};">${t.emoji} ${t.name}</span>
                        ${custom ? `<button class="u-btn-clear" style="width:auto;padding:0;font-size:11px;color:${T.mutedClr};text-decoration:underline;" onclick="goalStepsReset('${t.id}')">Reset to defaults</button>` : `<span style="font-size:11px;color:${T.mutedClr};">defaults</span>`}</div>
                    <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;">
                        ${steps.map(v => `<span style="display:inline-flex;align-items:center;gap:6px;padding:4px 6px 4px 10px;border-radius:14px;border:1px solid ${T.borderClr};font-size:12px;color:${T.textClr};">${fmt(v)}
                            <button aria-label="Remove ${fmt(v)}" onclick="goalStepsRemove('${t.id}',${v})" style="border:0;background:none;color:${T.mutedClr};font-size:15px;line-height:1;padding:0 2px;cursor:pointer;">×</button></span>`).join('') || `<span style="font-size:12px;color:${T.mutedClr};">No steps</span>`}</div>
                    <div style="display:flex;gap:8px;">
                        <input id="goalAdd-${t.id}" type="number" inputmode="decimal" placeholder="Add a step, e.g. 1250000" step="1000"
                            style="flex:1;min-width:0;padding:8px 10px;border-radius:8px;font-size:14px;" class="bdr-alaskan col-silver bg-deep-alaskan"
                            onkeydown="if(event.key==='Enter')goalStepsAdd('${t.id}')">
                        <button class="action-btn" style="margin:0;width:auto;padding:8px 14px;" onclick="goalStepsAdd('${t.id}')">Add</button></div>
                </div>`;
            }).join('');
    }
    function _goalStepsSet(id, steps, msg) {
        goalsLoad()[id] = [...new Set(steps)].sort((a, b) => a - b);
        try { goalsSave(); } catch (e) { return renderGoalSteps(); }   // 3.6 save guard: encrypt() refuses while blocked
        _goalCache = null; renderGoalSteps(msg);
    }
    function goalStepsAdd(id) {
        const inp = document.getElementById('goalAdd-' + id);
        const v = Math.round(parseFloat(String(inp && inp.value || '').replace(/[$,\s]/g, '')));
        if (!(v > 0) || v >= 1e10) { if (inp) inp.focus(); return; }
        _goalStepsSet(id, goalLadder(id).concat(v), goalTrack(id).name + ': added ' + fmt(v) + '.');
    }
    function goalStepsRemove(id, v) { _goalStepsSet(id, goalLadder(id).filter(x => x !== v), goalTrack(id).name + ': removed ' + fmt(v) + '.'); }
    function goalStepsReset(id) {
        if (!confirm('Put ' + goalTrack(id).name + ' back to its default steps?')) return;
        delete goalsLoad()[id];
        try { goalsSave(); } catch (e) { return; }
        _goalCache = null; renderGoalSteps(goalTrack(id).name + ' is back to its defaults.');
    }
