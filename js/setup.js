// Sommerville Ledger 4 — setup.js
// Setup: accounts and companies (v3.2)
// Part of index.html (3.5.2 split). Plain script, loaded in order; all files share one global scope.
// ══════════════════════════════════════════════════════════════
    // SETUP — Accounts & companies (v3.2)
    // One screen for everything the monthly entry asks about, one add/edit pattern for every kind.
    // Replaces the Data Dump "Configure" grid and its five popups. Entry: Data Dump → Setup → openSetup().
    // Closing keeps history: closed items drop out of months after they close (activeInMonth).
    // ══════════════════════════════════════════════════════════════
    let suView       = 'list';   // 'list' | 'form'
    let suDraft      = null;     // the item being added or edited (a copy; saved only on Save)
    let suShowClosed = false;
    let suSheetOpen  = false;
    let suToastMsg   = '';
    let suToastTimer = null;
    let suArmed      = '';       // 'close' | 'delete' while the confirm row is showing
    let suError      = '';

    const SU_KINDS = {
        income:  { title: 'Employer or income source', sub: 'Paychecks, retirement plan, bonus',   tag: '$' },
        account: { title: 'Investment account',        sub: '401k, IRA, HSA, taxable or metals',   tag: 'INV' },
        bill:    { title: 'Bill',                      sub: 'Something you pay every month',       tag: 'BILL' },
        debt:    { title: 'Debt',                      sub: 'Mortgage, loan or card balance',      tag: 'DEBT' },
        coast:   { title: 'Coast savings account',     sub: 'Taxable money you add to each month', tag: 'CST' },
        loan:    { title: 'Loan',                      sub: 'Money you lent · interest added monthly', tag: 'LOAN' },   // 3.5.4
        property:{ title: 'Real Estate',               sub: 'Home or land · value logged once a year', tag: 'RE' },   // 3.5.3
    };
    const SU_ACCT_TYPES = [['401k', '401k'], ['ira', 'IRA'], ['hsa', 'HSA'], ['taxable', 'Taxable'], ['metals', 'Metals'], ['receivable', 'Loan receivable']];
    const SU_DEBT_TYPES = [['mortgage', 'Mortgage'], ['auto', 'Auto loan'], ['credit_card', 'Credit card'], ['student', 'Student loan'], ['personal', 'Personal loan'], ['other', 'Other']];
    const SU_PAY_FREQS  = [['weekly', 'Weekly'], ['biweekly', 'Every 2 weeks'], ['semimonthly', 'Twice a month'], ['monthly', 'Monthly']];
    const SU_ICON = {
        back:  '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
        next:  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity:.5;flex-shrink:0"><path d="M9 18l6-6-6-6"/></svg>',
        plus:  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
        x:     '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
        info:  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;margin-top:1px;opacity:.8"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.01"/></svg>',
    };

    // ── Shared helpers (also used by the Data Dump) ──
    // Is this account/company still in use for month mk? A closed one stays through the month it closed.
    function activeInMonth(item, mk) {
        return !item || !item.closed || !item.closedMonth || mk <= item.closedMonth;
    }

    // Paydays (YYYY-MM-DD) for a payer in month mk, from payer.paySchedule; null when no schedule is set.
    // paySchedule: { freq: 'weekly'|'biweekly'|'semimonthly'|'monthly', anchor: 'YYYY-MM-DD' (weekly/biweekly), days: [n|'last', …] }
    function payDatesInMonth(payer, mk) {
        const ps = payer && payer.paySchedule;
        if (!ps || !ps.freq) return null;
        const [y, m] = mk.split('-').map(Number);
        const last = new Date(y, m, 0).getDate();
        const pad = d => mk + '-' + String(d).padStart(2, '0');
        if (ps.freq === 'weekly' || ps.freq === 'biweekly') {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(ps.anchor || '')) return null;
            const DAY = 86400000, step = (ps.freq === 'weekly' ? 7 : 14) * DAY;
            const [ay, am, ad] = ps.anchor.split('-').map(Number);
            const a = Date.UTC(ay, am - 1, ad), first = Date.UTC(y, m - 1, 1), end = Date.UTC(y, m - 1, last);
            const out = [];
            for (let t = a + Math.ceil((first - a) / step) * step; t <= end; t += step) out.push(pad(new Date(t).getUTCDate()));
            return out;
        }
        const raw = ps.freq === 'semimonthly' ? (ps.days && ps.days.length ? ps.days : [15, 'last']) : [(ps.days || [1])[0]];
        const days = [...new Set(raw.map(d => d === 'last' ? last : Math.max(1, Math.min(parseInt(d, 10) || 1, last))))].sort((a, b) => a - b);
        return days.map(pad);
    }

    function suEsc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
    function suMk() { return moKey(new Date()); }
    function suMonthName(mk, long) {
        const [y, m] = mk.split('-').map(Number);
        return new Date(y, m - 1, 1).toLocaleDateString('en-US', long ? { month: 'long', year: 'numeric' } : { month: 'short', year: 'numeric' });
    }
    function suMoney(n) { return fmt(n || 0); }
    function suParseMoney(s) { const v = parseFloat(String(s || '').replace(/[$,\s]/g, '')); return isNaN(v) ? null : v; }
    function suSame(a, b) { return String(a) === String(b); }
    function suNewId(prefix) { return prefix + Date.now() + '_' + Math.random().toString(36).slice(2, 6); }

    function suLatest(list, match) {
        let best = null;
        list.forEach(e => { if (match(e) && (!best || e.date > best.date || (e.date === best.date && (e.ts || 0) >= (best.ts || 0)))) best = e; });
        return best;
    }
    function suBonusName(name) { return name + ' — Bonus'; }
    function suPayerSources(name) { return retirementSources.filter(s => s.sponsor === name); }
    function suSourceHasHistory(id) { return retirementContribs.some(c => suSame(c.sourceId, id)); }
    function suContribLabel(k) { return (CONTRIB_TYPES[k] && CONTRIB_TYPES[k].label) || k; }
    // A plan is a 401k or an HSA; mixing them in one plan gets split apart at load (migrateRetirementSources)
    const SU_401K_TYPES = ['401k_pretax', '401k_roth', 'after_tax', 'employer_match'];
    const SU_HSA_TYPES  = ['hsa_employee', 'hsa_employer'];
    function suPlanKind(types) { return (types || []).some(t => SU_HSA_TYPES.includes(t)) ? 'hsa' : '401k'; }
    function suTypeChips(keys, selected, onclick) {
        const all = keys.concat(selected.filter(t => !keys.includes(t)));   // never hide a type that's already on
        return `<div class="su-chips">${all.map(t => `<button type="button" class="su-chip sm tick${selected.includes(t) ? ' on' : ''}" aria-pressed="${selected.includes(t)}" onclick="${onclick}('${t}')">${suContribLabel(t)}</button>`).join('')}</div>`;
    }
    function suScheduleText(p) {
        const ps = p.paySchedule;
        if (!ps || !ps.freq) return 'Pay schedule not set';
        const f = (SU_PAY_FREQS.find(x => x[0] === ps.freq) || [, ps.freq])[1];
        const n = (payDatesInMonth(p, suMk()) || []).length;
        return f + (n ? ' · ' + n + ' this month' : '');
    }

    // ── Open / navigation ──
    function openSetup() { navigate('setup'); }

    function suPushNav(tag) {
        navStack.push(tag);
        history.pushState({ idx: navStack.length - 1 }, '', '');
        historyDepth++;
    }
    // Leave a pushed sub-view by button (not Back): drop our navStack entry and consume its history entry quietly
    function suPopNav(tag) {
        if (navStack[navStack.length - 1] !== tag) return;
        navStack.pop();
        historyDepth = Math.max(0, historyDepth - 1);
        skipNextPopstate = true;
        history.back();
        setTimeout(() => { skipNextPopstate = false; }, 300);
    }
    // Called from goBack() when Back/swipe lands on a Setup sub-view. Returns true when handled.
    function suHandleBack(top) {
        if (top !== 'setupForm' && top !== 'setupSheet') return false;
        navStack.pop();
        historyDepth = Math.max(0, historyDepth - 1);
        if (top === 'setupSheet') suSheetOpen = false;
        else { suView = 'list'; suDraft = null; }
        suRender();
        return true;
    }

    function suToast(msg) {
        suToastMsg = msg;
        clearTimeout(suToastTimer);
        suToastTimer = setTimeout(() => { suToastMsg = ''; if (suView === 'list') suRender(); }, 2600);
    }

    function suRender() {
        const body = document.getElementById('setupBody');
        if (!body) return;
        body.innerHTML = (suView === 'form' && suDraft) ? suFormHtml() : suListHtml();
        if (suView === 'list' && suSheetOpen) body.insertAdjacentHTML('beforeend', suSheetHtml());
    }

    // ── List ──
    function suListItems() {
        const mk = suMk();
        const typeLbl = t => (SU_ACCT_TYPES.find(x => x[0] === t) || [, String(t || '').toUpperCase()])[1];
        const debtLbl = t => (SU_DEBT_TYPES.find(x => x[0] === t) || [, t || 'Debt'])[1];

        const income = payers.filter(p => p.defaultType !== 'bonus').map(p => {
            const srcs = suPayerSources(p.name);
            const hasBonus = !!bonusPayerFor(p);
            const isPay = !p.defaultType || p.defaultType === 'payroll';
            const parts = isPay ? [suScheduleText(p)] : [(INCOME_TYPES[p.defaultType] || {}).label || 'Other income'];
            if (srcs.length) parts.push(srcs.map(s => s.institution || 'Plan').join(', '));
            if (hasBonus) parts.push('bonus');
            return { kind: 'income', id: p.id, name: p.name, sub: parts.join(' · '), closed: p.closed, closedMonth: p.closedMonth };
        });
        // Retirement plans whose company isn't set up as a payer (edited on their own)
        const payerNames = new Set(payers.map(p => p.name));
        retirementSources.filter(s => !payerNames.has(s.sponsor)).forEach(s => income.push({
            kind: 'plan', id: s.id, name: s.label || s.institution || 'Retirement plan',
            sub: 'Retirement plan · ' + ((s.contribTypes || []).map(suContribLabel).join(', ') || 'no types'),
        }));

        const typeOrder = ['401k', 'ira', 'hsa', 'taxable', 'receivable', 'metals'];
        const invest = accounts.slice().sort((a, b) => typeOrder.indexOf(a.type) - typeOrder.indexOf(b.type) || String(a.institution).localeCompare(String(b.institution)))
            .map(a => {
                const last = a.type === 'metals' ? null : suLatest(entries, e => suSame(e.accountId, a.id));
                return { kind: 'account', id: a.id, name: a.name || a.institution, sub: typeLbl(a.type) + (a.institution && a.name !== a.institution ? ' · ' + a.institution : ''),
                         val: last ? suMoney(last.amount) : '', closed: a.closed, closedMonth: a.closedMonth };
            });

        const bills = companies.slice().sort((a, b) => String(a.name).localeCompare(String(b.name))).map(c => {
            const last = suLatest(expenses, e => (e.companyId && suSame(e.companyId, c.id)) || e.companyName === c.name);
            return { kind: 'bill', id: c.id, name: c.name, sub: (c.serviceType || 'Bill') + (last ? ' · last ' + suMonthName(last.date.slice(0, 7)) : ''),
                     val: last ? suMoney(last.amount) : '', closed: c.closed, closedMonth: c.closedMonth };
        });

        const debts = debtAccounts.map(d => {
            const last = suLatest(debtEntries, e => suSame(e.accountId, d.id) && e.date.slice(0, 7) <= mk);
            return { kind: 'debt', id: d.id, name: d.name, sub: debtLbl(d.type) + (d.institution ? ' · ' + d.institution : ''),
                     val: last ? suMoney(last.amount) : '', closed: d.closed, closedMonth: d.closedMonth };
        });

        const coast = coastAccounts.map(a => ({ kind: 'coast', id: a.id, name: a.institution || 'Coast account',
            sub: 'Coast savings', closed: a.closed, closedMonth: a.closedMonth }));

        return [
            { title: 'Income',        kind: 'income',  items: income },
            { title: 'Investments',   kind: 'account', items: invest },
            { title: 'Bills',         kind: 'bill',    items: bills },
            { title: 'Debts',         kind: 'debt',    items: debts },
            { title: 'Coast savings', kind: 'coast',   items: coast },
            { title: 'Loans',         kind: 'loan', items: loanPeople.map(p => {   // 3.5.4
                const owed = loanCalc(p, mk).owed;
                return { kind: 'loan', id: p.id, name: p.name, sub: (p.status === 'repaying' ? 'Repaying' : 'Deferred') + ' · ' + lnRateAt(p, mk) + '%', val: suMoney(owed) }; }) },
            { title: 'Real Estate',   kind: 'property', items: reProps().map(p => { const e = reLatest(p.id);   // 3.5.3
                return { kind: 'property', id: p.id, name: p.name, sub: e ? 'Assessed ' + reMonLabel(e.date) : 'No value yet', val: e ? suMoney(e.value) : '' }; }) },
        ];
    }

    function suListHtml() {
        const groups = suListItems();
        const closedCount = groups.reduce((n, g) => n + g.items.filter(i => i.closed).length, 0);
        const rowHtml = it => `<button class="su-row${it.closed ? ' closed' : ''}" onclick="suOpenForm('${it.kind}','${suEsc(it.id)}')">
                <div class="su-rtext"><span class="su-rname">${suEsc(it.name)}</span>
                <span class="su-rsub">${it.closed ? 'Closed ' + suEsc(suMonthName(it.closedMonth || suMk())) : suEsc(it.sub)}</span></div>
                ${it.val && !it.closed ? `<span class="su-rval">${suEsc(it.val)}</span>` : ''}${SU_ICON.next}</button>`;
        const groupHtml = g => {
            const shown = g.items.filter(i => suShowClosed || !i.closed);
            const open = g.items.filter(i => !i.closed).length;
            return `<div class="su-group"><div class="su-glabel"><span>${g.title}</span><span>${open}</span></div>
                <div class="su-card">${shown.length ? shown.map(rowHtml).join('')
                    : `<button class="su-row" onclick="suOpenForm('${g.kind}')"><span class="su-rsub" style="flex:1">None yet · add one</span>${SU_ICON.plus}</button>`}</div></div>`;
        };
        return `<div class="su-wrap">
            <div class="su-top">
                <button class="su-back" onclick="goBack()" aria-label="Back to Data">${SU_ICON.back}Data</button>
                <button class="su-add" onclick="suOpenSheet()">${SU_ICON.plus}Add</button>
            </div>
            <h1 class="su-h1">Accounts &amp; companies</h1>
            <p class="su-lede">Everything the monthly entry asks about. Tap one to change it.</p>
            ${suToastMsg ? `<div class="su-toast" role="status">${suEsc(suToastMsg)}</div>` : ''}
            ${groups.map(groupHtml).join('')}
            <div style="padding:10px 16px 28px">${closedCount ? `<button class="su-link" onclick="suToggleClosed()">${suShowClosed ? 'Hide' : 'Show'} ${closedCount} closed</button>` : ''}</div>
        </div>`;
    }
    function suToggleClosed() { suShowClosed = !suShowClosed; suRender(); }

    // ── Add sheet ──
    function suOpenSheet() { suSheetOpen = true; suPushNav('setupSheet'); suRender(); }
    function suCloseSheet() { suSheetOpen = false; suPopNav('setupSheet'); suRender(); }
    function suSheetHtml() {
        return `<div class="su-sheetbg" onclick="if(event.target===this)suCloseSheet()">
            <div class="su-sheet" role="dialog" aria-label="What are you adding?">
                <div class="su-grab"></div>
                <div class="su-sheethead"><h2>What are you adding?</h2><button class="su-x" onclick="suCloseSheet()" aria-label="Close">${SU_ICON.x}</button></div>
                ${Object.entries(SU_KINDS).map(([k, v]) => `<button class="su-opt" onclick="suOpenForm('${k}')">
                    <span class="su-tag">${v.tag}</span><span class="su-rtext"><span class="su-rname">${v.title}</span><span class="su-rsub">${v.sub}</span></span></button>`).join('')}
            </div></div>`;
    }

    // ── Forms: open ──
    function suOpenForm(kind, id) {
        const isNew = id == null;
        let d = { kind, id: isNew ? null : id, isNew };
        const mk = suMk();
        if (kind === 'account') {
            const a = isNew ? {} : accounts.find(x => suSame(x.id, id));
            if (!a) return;
            Object.assign(d, { type: a.type || 'taxable', institution: a.institution || '', name: isNew ? '' : (a.name || ''),
                               newInst: false, balance: '', asOf: mk });
        } else if (kind === 'debt') {
            const a = isNew ? {} : debtAccounts.find(x => suSame(x.id, id));
            if (!a) return;
            Object.assign(d, { name: a.name || '', type: a.type || 'mortgage', institution: a.institution || '', balance: '', asOf: mk });
        } else if (kind === 'bill') {
            const c = isNew ? {} : companies.find(x => suSame(x.id, id));
            if (!c) return;
            Object.assign(d, { name: c.name || '', serviceType: c.serviceType || '' });
        } else if (kind === 'coast') {
            const a = isNew ? {} : coastAccounts.find(x => suSame(x.id, id));
            if (!a) return;
            Object.assign(d, { institution: a.institution || '' });   // 3.8: monthly goals removed
        } else if (kind === 'loan') {   // 3.5.4
            const p = isNew ? null : loanPeople.find(x => suSame(x.id, id));
            if (!isNew && !p) return;
            Object.assign(d, isNew ? { name: '', status: 'deferred', rate: '3.5', balance: '', asOf: mk }
                                   : { name: p.name, status: p.status || 'deferred', rate: String(lnRateAt(p, mk)), rateFrom: mk });
        } else if (kind === 'property') {   // 3.5.3
            const p = isNew ? {} : reProps().find(x => suSame(x.id, id));
            if (!p) return;
            Object.assign(d, { name: p.name || '', balance: '', asOf: mk });
        } else if (kind === 'plan') {
            const s = retirementSources.find(x => suSame(x.id, id));
            if (!s) return;
            Object.assign(d, { label: s.label || '', institution: s.institution || '', types: (s.contribTypes || []).slice() });
        } else if (kind === 'income') {
            const p = isNew ? { defaultType: 'payroll' } : payers.find(x => suSame(x.id, id));
            if (!p) return;
            const ps = p.paySchedule || {};
            const bonusPayer = isNew ? null : bonusPayerFor(p);
            const bonusSrc = bonusPayer ? retirementSources.find(s => s.sponsor === bonusPayer.name) : null;
            Object.assign(d, {
                name: p.name || '', defaultType: p.defaultType || 'payroll',
                freq: ps.freq || '', anchor: ps.anchor || '',
                day1: String((ps.days || [])[0] ?? (ps.freq === 'monthly' ? 1 : 15)), day2: String((ps.days || [])[1] ?? 'last'),
                plans: isNew ? [] : suPayerSources(p.name).map(s => ({ id: s.id, pk: suPlanKind(s.contribTypes), institution: s.institution || '', types: (s.contribTypes || []).slice(), locked: suSourceHasHistory(s.id) })),
                bonus: !!bonusPayer,
                bonusLocked: !!bonusPayer && (incomeEntries.some(e => suSame(e.payerId, bonusPayer.id)) || (bonusSrc && suSourceHasHistory(bonusSrc.id))),
                bonusTypes: bonusSrc ? (bonusSrc.contribTypes || []).slice() : ['401k_pretax'],
            });
        } else return;
        suDraft = d; suArmed = ''; suError = '';
        if (suSheetOpen) { suSheetOpen = false; navStack[navStack.length - 1] = 'setupForm'; }   // the sheet's history entry becomes the form's
        else suPushNav('setupForm');
        suView = 'form';
        suRender();
        const pg = document.getElementById('setupPage'); if (pg) pg.scrollTop = 0;
    }
    function suCancelForm() { suView = 'list'; suDraft = null; suPopNav('setupForm'); suRender(); }

    // Draft edits. Text inputs update the draft without re-rendering (keeps the keyboard up); chips re-render.
    function suSet(field, value, rerender) { if (!suDraft) return; suDraft[field] = value; if (rerender) suRender(); }
    function suPlanSet(i, field, value) { if (suDraft && suDraft.plans[i]) suDraft.plans[i][field] = value; }
    function suToggleIn(listField, key) {
        const list = suDraft[listField];
        const i = list.indexOf(key);
        if (i >= 0) list.splice(i, 1); else list.push(key);
        suRender();
    }
    function suPlanToggle(i, key) {
        const t = suDraft.plans[i].types, j = t.indexOf(key);
        if (j >= 0) t.splice(j, 1); else t.push(key);
        suRender();
    }
    function suAddPlan(kind) {
        suDraft.plans.push({ id: null, pk: kind, institution: '', types: kind === 'hsa' ? ['hsa_employee'] : ['401k_pretax', 'employer_match'], locked: false });
        suRender();
    }
    function suRemovePlan(i) { suDraft.plans.splice(i, 1); suRender(); }
    function suArm(what) { suArmed = what; suRender(); }

    // ── Forms: markup ──
    function suChips(options, current, onclickFn, cls) {
        return `<div class="su-chips">${options.map(([v, l]) => `<button type="button" class="su-chip ${cls || ''}${suSame(v, current) ? ' on' : ''}" aria-pressed="${suSame(v, current)}" onclick="${onclickFn}('${suEsc(v)}')">${suEsc(l)}</button>`).join('')}</div>`;
    }
    function suTextField(id, label, field, opts) {
        const o = opts || {};
        return `<div class="su-field"><label class="su-label" for="${id}">${label}</label>
            <input id="${id}" class="su-input${o.money ? ' money' : ''}" type="${o.type || 'text'}" ${o.max ? 'max="' + o.max + '"' : ''} ${o.money ? 'inputmode="decimal"' : ''} ${o.numeric ? 'inputmode="numeric"' : ''}
                value="${suEsc(suDraft[field])}" placeholder="${suEsc(o.placeholder || '')}" autocomplete="off"
                oninput="suSet('${field}', this.value)"></div>`;
    }
    function suBalanceFields(what) {
        return `<div class="su-2col">
            ${suTextField('suBal', 'Current ' + what + ' <em>(optional)</em>', 'balance', { money: true, placeholder: '$0.00' })}
            ${suTextField('suAsOf', 'As of', 'asOf', { type: 'month', max: suMk() })}</div>`;
    }

    function suFormHtml() {
        const d = suDraft, k = SU_KINDS[d.kind];
        let title, body = '';
        if (d.kind === 'account') {
            title = d.isNew ? 'New investment account' : (d.name || d.institution);
            const types = SU_ACCT_TYPES.filter(t => t[0] !== 'receivable' || d.type === 'receivable' || accounts.some(a => a.type === 'receivable'));
            const insts = institutions.slice();
            if (d.institution && !insts.includes(d.institution)) insts.push(d.institution);
            body = `<div class="su-field"><span class="su-label">Type</span>${suChips(types, d.type, "suSetAcctType")}
                    ${d.type === 'taxable' ? '<span class="su-hint">Taxable counts toward your Coast number.</span>' : ''}
                    ${d.type === 'metals' ? '<span class="su-hint">Metals are logged by the ounce each month, so there’s no balance to enter here.</span>' : ''}</div>
                <div class="su-field"><span class="su-label">Where is it?</span>
                    ${suChips(insts.map(i => [i, i]).concat([['__new', '+ New']]), d.newInst ? '__new' : d.institution, 'suSetInst')}
                    ${d.newInst ? `<input id="suNewInst" class="su-input" type="text" placeholder="Institution name" value="${suEsc(d.institution)}" oninput="suSet('institution', this.value)" autocomplete="off">` : ''}</div>
                ${suTextField('suName', 'Nickname <em>(optional)</em>', 'name', { placeholder: 'e.g. Brokerage' })}
                ${d.isNew && d.type !== 'metals' ? suBalanceFields('balance') : ''}
                ${d.isNew && d.type !== 'metals' ? `<div class="su-note">${SU_ICON.info}<span>With a balance, it shows up in Investments from that month on. Earlier months stay as they were.</span></div>` : ''}`;
        } else if (d.kind === 'debt') {
            title = d.isNew ? 'New debt' : d.name;
            body = `${suTextField('suName', 'Name', 'name', { placeholder: 'e.g. Truck loan' })}
                <div class="su-field"><span class="su-label">Type</span>${suChips(SU_DEBT_TYPES, d.type, "suSetField('type')")}</div>
                ${suTextField('suInst', 'Lender <em>(optional)</em>', 'institution', { placeholder: 'e.g. Credit Union 1' })}
                ${d.isNew ? suBalanceFields('balance owed') : ''}`;
        } else if (d.kind === 'bill') {
            title = d.isNew ? 'New bill' : d.name;
            const cats = [...new Set(companies.map(c => c.serviceType).filter(Boolean))].sort();
            body = `${suTextField('suName', 'Name', 'name', { placeholder: 'e.g. Electric' })}
                <div class="su-field"><label class="su-label" for="suCat">Category</label>
                    ${cats.length ? suChips(cats.map(c => [c, c]), d.serviceType, "suSetField('serviceType')", 'sm') : ''}
                    <input id="suCat" class="su-input" type="text" placeholder="Or type a new one" value="${suEsc(cats.includes(d.serviceType) ? '' : d.serviceType)}" oninput="suSet('serviceType', this.value)" autocomplete="off"></div>
                <div class="su-note">${SU_ICON.info}<span>Log this month’s amount in Data once you’ve paid it. After that it’s filled in as a reminder each month.</span></div>`;
        } else if (d.kind === 'coast') {
            title = d.isNew ? 'New coast savings account' : d.institution;
            body = `${suTextField('suInst', 'Where is it?', 'institution', { placeholder: 'e.g. Schwab' })}`;   // 3.8: no monthly goal
        } else if (d.kind === 'loan') {   // 3.5.4
            title = d.isNew ? 'New loan' : d.name;
            const p = d.isNew ? null : loanPeople.find(x => suSame(x.id, d.id));
            const rs = p ? (p.rates || []).slice().sort((a, b) => a.from.localeCompare(b.from)) : [];
            body = `${suTextField('suName', 'Who did you lend to?', 'name', { placeholder: 'e.g. Bruce' })}
                <div class="su-field"><span class="su-label">Repayment</span>${suChips([['deferred', 'Deferred'], ['repaying', 'Repaying']], d.status, "suSetField('status')")}
                    <span class="su-hint">One running balance, like a line of credit. Deferred: no payments expected yet; interest still adds up. Repaying: the Data page expects a payment each month.</span></div>
                ${d.isNew
                    ? suTextField('suRate', 'Interest rate % <em>(per year)</em>', 'rate', { placeholder: '3.5' })
                      + `<div class="su-2col">${suTextField('suBal', 'Lent so far <em>(optional)</em>', 'balance', { money: true, placeholder: '$0.00' })}${suTextField('suAsOf', 'Month', 'asOf', { type: 'month', max: suMk() })}</div>`
                    : `<div class="su-2col">${suTextField('suRate', 'Interest rate %', 'rate', { placeholder: '3.5' })}${suTextField('suRateFrom', 'Starting with', 'rateFrom', { type: 'month' })}</div>
                       <span class="su-hint">${rs.map((r, i) => (i ? 'From ' : 'Since ') + suEsc(suMonthName(r.from)) + ': ' + r.rate + '%').join(' · ')}. A new rate applies from the month you pick; earlier months keep theirs.</span>`}
                <div class="su-note">${SU_ICON.info}<span>Log money lent and payments on the Data page (Loans section). New money starts earning the month after; payments cover interest first, then principal. Counts in net worth, not investments.</span></div>`;
        } else if (d.kind === 'property') {
            title = d.isNew ? 'New real estate' : d.name;
            body = `${suTextField('suName', 'Name', 'name', { placeholder: 'e.g. Cohoe land' })}
                ${d.isNew ? suBalanceFields('assessed value') : ''}
                <div class="su-note">${SU_ICON.info}<span>Log each year’s borough assessment on the Data page (Real Estate section) in the month it comes out. Counts in net worth, not liquid net worth.</span></div>`;
        } else if (d.kind === 'plan') {
            title = d.label || 'Retirement plan';
            body = `${suTextField('suLabel', 'Name', 'label')}
                ${suTextField('suInst', 'Held at', 'institution', { placeholder: 'e.g. T. Rowe Price' })}
                <div class="su-field"><span class="su-label">Contribution types</span>
                    ${suTypeChips(suPlanKind(d.types) === 'hsa' ? SU_HSA_TYPES : SU_401K_TYPES, d.types, "suToggleIn.bind(null,'types')")}</div>`;
        } else if (d.kind === 'income') {
            title = d.isNew ? 'New employer' : d.name;
            body = suIncomeBody();
        }
        return `<div class="su-wrap">
            <div class="su-top"><button class="su-back" onclick="suCancelForm()" aria-label="Back to setup">${SU_ICON.back}Setup</button></div>
            <h1 class="su-h1">${suEsc(title || k.title)}</h1>
            ${!d.isNew && k ? `<p class="su-lede">${k.title}</p>` : ''}
            <div class="su-form">
                ${suError ? `<div class="su-err" role="alert">${suEsc(suError)}</div>` : ''}
                ${body}
                ${d.isNew ? '' : suDangerHtml()}
            </div>
            <div class="su-foot">
                <button class="su-btn sec" onclick="suCancelForm()">Cancel</button>
                <button class="su-btn pri" onclick="suSave()">${d.isNew ? 'Add' : 'Save changes'}</button>
            </div></div>`;
    }
    function suSetAcctType(v) { suDraft.type = v; suRender(); }
    function suSetInst(v) {
        if (v === '__new') { suDraft.newInst = true; suDraft.institution = ''; suRender(); const el = document.getElementById('suNewInst'); if (el) el.focus(); return; }
        suDraft.newInst = false; suDraft.institution = v; suRender();
    }
    function suSetField(field) { return v => { suDraft[field] = v; suRender(); }; }

    function suIncomeBody() {
        const d = suDraft;
        const isPay = d.defaultType === 'payroll';
        let sched = '';
        if (isPay) {
            let detail = '';
            if (d.freq === 'weekly' || d.freq === 'biweekly') {
                detail = `<div class="su-field"><label class="su-label" for="suAnchor">A recent payday</label>
                    <input id="suAnchor" class="su-input" type="date" value="${suEsc(d.anchor)}" onchange="suSet('anchor', this.value, true)"></div>`;
            } else if (d.freq === 'semimonthly') {
                detail = `<div class="su-2col">
                    <div class="su-field"><label class="su-label" for="suDay1">First payday</label><input id="suDay1" class="su-input" inputmode="numeric" value="${suEsc(d.day1)}" onchange="suSet('day1', this.value, true)"></div>
                    <div class="su-field"><label class="su-label" for="suDay2">Second <em>(or “last”)</em></label><input id="suDay2" class="su-input" value="${suEsc(d.day2)}" onchange="suSet('day2', this.value, true)"></div></div>`;
            } else if (d.freq === 'monthly') {
                detail = `<div class="su-field"><label class="su-label" for="suDay1">Payday <em>(day of month, or “last”)</em></label><input id="suDay1" class="su-input" value="${suEsc(d.day1)}" onchange="suSet('day1', this.value, true)"></div>`;
            }
            const preview = suSchedulePreview();
            sched = `<div class="su-field"><span class="su-label">Pay schedule</span>${suChips(SU_PAY_FREQS, d.freq, "suSetField('freq')")}
                <span class="su-hint">The monthly screen uses this to know how many paychecks to expect.</span></div>
                ${detail}${preview ? `<div class="su-note">${SU_ICON.info}<span>${preview}</span></div>` : ''}`;
        }
        const planCards = d.plans.map((p, i) => `<div class="su-plan">
                <div class="su-planhead"><span>${p.pk === 'hsa' ? 'HSA' : '401k plan'}</span>
                ${p.locked ? '<span class="su-hint">Has contributions</span>' : `<button type="button" class="su-mini" onclick="suRemovePlan(${i})">Remove</button>`}</div>
                <input class="su-input" type="text" aria-label="Plan ${i + 1} held at" placeholder="Held at, e.g. T. Rowe Price" value="${suEsc(p.institution)}" oninput="suPlanSet(${i}, 'institution', this.value)" autocomplete="off">
                ${suTypeChips(p.pk === 'hsa' ? SU_HSA_TYPES : SU_401K_TYPES, p.types, 'suPlanToggle.bind(null,' + i + ')')}
            </div>`).join('');
        const plans = isPay ? `<div class="su-field"><span class="su-label">Retirement plans</span>
                ${planCards}
                <div class="su-2col"><button type="button" class="su-dashed" onclick="suAddPlan('401k')">${SU_ICON.plus}401k plan</button>
                <button type="button" class="su-dashed" onclick="suAddPlan('hsa')">${SU_ICON.plus}HSA</button></div></div>
            <label class="su-switchrow"><span class="su-rtext"><span class="su-rname">Pays a bonus</span>
                <span class="su-rsub">${d.bonusLocked ? 'Has past bonus entries, so it stays on' : 'Adds a Bonus check to the month'}</span></span>
                <input type="checkbox" ${d.bonus ? 'checked' : ''} ${d.bonusLocked ? 'disabled' : ''} onchange="suSet('bonus', this.checked, true)"><span class="su-switch"></span></label>
            ${d.bonus ? `<div class="su-field"><span class="su-label">Retirement from bonus checks</span>
                ${suTypeChips(SU_401K_TYPES, d.bonusTypes, "suToggleIn.bind(null,'bonusTypes')")}</div>` : ''}` : '';
        return `${suTextField('suName', 'Company name', 'name', { placeholder: 'e.g. Hilcorp' })}${sched}${plans}`;
    }
    function suDraftSchedule() {
        const d = suDraft;
        if (!d.freq) return null;
        const day = v => (String(v).trim().toLowerCase() === 'last' ? 'last' : (parseInt(v, 10) || null));
        if (d.freq === 'weekly' || d.freq === 'biweekly') return { freq: d.freq, anchor: d.anchor || '' };
        if (d.freq === 'semimonthly') return { freq: d.freq, days: [day(d.day1) || 15, day(d.day2) || 'last'] };
        return { freq: d.freq, days: [day(d.day1) || 1] };
    }
    function suSchedulePreview() {
        const ps = suDraftSchedule();
        if (!ps) return '';
        const now = new Date(), out = [];
        for (let i = 0; i < 3; i++) {
            const mk = moKey(new Date(now.getFullYear(), now.getMonth() + i, 1));
            const dates = payDatesInMonth({ paySchedule: ps }, mk);
            if (!dates) return 'Pick a recent payday to see the dates.';
            if ((suDraft.freq === 'semimonthly' || suDraft.freq === 'monthly') && [suDraft.day1].concat(suDraft.freq === 'semimonthly' ? [suDraft.day2] : [])
                .some(v => { const s = String(v).trim().toLowerCase(); return !(s === 'last' || (/^\d{1,2}$/.test(s) && +s >= 1 && +s <= 31)); })) return 'Paydays are a day of the month (1–31) or “last”.';
            const mon = new Date(+mk.slice(0, 4), +mk.slice(5) - 1, 1).toLocaleDateString('en-US', { month: 'short' });
            out.push(`${mon} ${dates.map(x => +x.slice(8)).join(', ')}`);
        }
        return 'Paydays: ' + out.join(' · ');
    }

    function suHasHistory() {
        const d = suDraft;
        if (d.kind === 'account') {
            const a = accounts.find(x => suSame(x.id, d.id));
            return entries.some(e => suSame(e.accountId, d.id)) || (a && a.type === 'metals' && Object.keys(metalsData || {}).length > 0);
        }
        if (d.kind === 'debt')  return debtEntries.some(e => suSame(e.accountId, d.id)) || bulkDebtPayments.some(e => suSame(e.accountId, d.id));
        if (d.kind === 'bill')  { const c = companies.find(x => suSame(x.id, d.id)); return expenses.some(e => (e.companyId && suSame(e.companyId, d.id)) || (c && e.companyName === c.name)); }
        if (d.kind === 'coast') return coastContribs.some(e => suSame(e.accountId, d.id));
        if (d.kind === 'plan')  return suSourceHasHistory(d.id);
        if (d.kind === 'income') {
            const p = payers.find(x => suSame(x.id, d.id)); if (!p) return false;
            const bp = bonusPayerFor(p);
            const srcIds = suPayerSources(p.name).concat(bp ? suPayerSources(bp.name) : []).map(s => s.id);
            return incomeEntries.some(e => suSame(e.payerId, p.id) || (bp && suSame(e.payerId, bp.id))) || retirementContribs.some(c => srcIds.some(id => suSame(id, c.sourceId)));
        }
        return false;
    }
    function suItem() {
        const d = suDraft;
        const list = { account: accounts, debt: debtAccounts, bill: companies, coast: coastAccounts, income: payers, plan: retirementSources, property: reProps(), loan: loanPeople }[d.kind];
        return list ? list.find(x => suSame(x.id, d.id)) : null;
    }
    function suDangerHtml() {
        const d = suDraft, item = suItem();
        if (!item) return '';
        const history = suHasHistory();
        const mkName = suMonthName(suMk(), true).split(' ')[0];
        if (item.closed) {
            return `<div class="su-danger"><div class="su-note">${SU_ICON.info}<span>Closed ${suEsc(suMonthName(item.closedMonth || suMk(), true))}. It no longer shows up in new months.</span></div>
                <button class="su-btn sec" onclick="suReopen()">Reopen</button></div>`;
        }
        if (d.kind === 'loan') {   // 3.5.4: remove the person and everything logged for them
            const n = lnEventsFor(item.id).length, owed = loanCalc(item, suMk()).owed;
            return suArmed === 'delete'
                ? `<div class="su-danger"><div class="su-note warn">${SU_ICON.info}<span>Remove the loan to ${suEsc(item.name)}${n ? ' and its ' + n + ' logged entr' + (n === 1 ? 'y' : 'ies') : ''}?${owed > 0 ? ' Net worth drops by ' + suMoney(owed) + '.' : ''}</span></div>
                    <div class="su-2col"><button class="su-btn sec" onclick="suArm('')">Keep it</button><button class="su-dbtn solid" onclick="suDelete()">Remove</button></div></div>`
                : `<div class="su-danger"><button class="su-dbtn" onclick="suArm('delete')">Remove loan</button></div>`;
        }
        if (d.kind === 'property') {   // 3.5.3: Home always stays; others can be removed with their values
            if (item.id === 'home') return '';
            const n = dtGetHomeValues().filter(r => rePid(r) === item.id).length;
            return suArmed === 'delete'
                ? `<div class="su-danger"><div class="su-note warn">${SU_ICON.info}<span>Remove ${suEsc(item.name)}${n ? ' and its ' + n + ' logged value' + (n === 1 ? '' : 's') : ''}? Net worth drops by its value.</span></div>
                    <div class="su-2col"><button class="su-btn sec" onclick="suArm('')">Keep it</button><button class="su-dbtn solid" onclick="suDelete()">Remove</button></div></div>`
                : `<div class="su-danger"><button class="su-dbtn" onclick="suArm('delete')">Remove</button></div>`;
        }
        if (d.kind === 'plan') {
            if (history) return '';
            return suArmed === 'delete'
                ? `<div class="su-danger"><div class="su-note warn">${SU_ICON.info}<span>Delete this plan? It has no contributions logged.</span></div>
                    <div class="su-2col"><button class="su-btn sec" onclick="suArm('')">Keep it</button><button class="su-dbtn solid" onclick="suDelete()">Delete</button></div></div>`
                : `<div class="su-danger"><button class="su-dbtn" onclick="suArm('delete')">Delete plan</button></div>`;
        }
        const noun = { account: 'account', debt: 'debt', bill: 'bill', coast: 'account', income: 'company' }[d.kind];
        const closeWhat = {
            account: `It drops out of new months. ${item.type === 'metals' ? '' : 'Its balance is set to $0 for ' + mkName + ' so your totals stop counting it. '}Past months stay as they were.`,
            debt:    `It drops out of new months and its balance is set to $0 for ${mkName} (paid off). Past months stay as they were.`,
            bill:    'It stops showing up as a reminder in new months. Past payments stay as they were.',
            coast:   'It drops out of new months. Past contributions stay as they were.',
            income:  'Its paychecks and bonus drop out of new months. Past income and contributions stay as they were.',
        }[d.kind];
        if (suArmed === 'close') {
            return `<div class="su-danger"><div class="su-note warn">${SU_ICON.info}<span>${closeWhat}</span></div>
                <div class="su-2col"><button class="su-btn sec" onclick="suArm('')">Keep it open</button><button class="su-dbtn solid" onclick="suClose()">Close ${noun}</button></div></div>`;
        }
        if (suArmed === 'delete') {
            return `<div class="su-danger"><div class="su-note warn">${SU_ICON.info}<span>Nothing has been logged for this ${noun}, so it can be deleted outright.</span></div>
                <div class="su-2col"><button class="su-btn sec" onclick="suArm('')">Keep it</button><button class="su-dbtn solid" onclick="suDelete()">Delete</button></div></div>`;
        }
        return `<div class="su-danger">
            <button class="su-dbtn" onclick="suArm('close')">Close ${noun} · keeps its history</button>
            ${history ? '' : `<button class="su-dbtn" style="opacity:.8" onclick="suArm('delete')">Delete (nothing logged yet)</button>`}</div>`;
    }

    // ── Save ──
    function suFail(msg) { suError = msg; suRender(); const pg = document.getElementById('setupPage'); if (pg) pg.scrollTop = 0; }
    function suDone(msg) {
        suView = 'list'; suDraft = null; suArmed = ''; suError = '';
        suPopNav('setupForm');
        suToast(msg);
        try { refreshAll(); } catch (e) { console.warn('setup refresh', e); }
        suRender();
        const pg = document.getElementById('setupPage'); if (pg) pg.scrollTop = 0;
    }
    function suDupe(list, field, value, selfId) {
        const v = String(value).trim().toLowerCase();
        return list.some(x => !suSame(x.id, selfId) && String(x[field] || '').trim().toLowerCase() === v);
    }
    function suStartBalance(kind, item) {
        const d = suDraft;
        const amt = suParseMoney(d.balance);
        if (amt == null) return;
        const mk = /^\d{4}-\d{2}$/.test(d.asOf || '') && d.asOf <= suMk() ? d.asOf : suMk();
        const date = mk + '-15', ts = Date.now();
        if (kind === 'account') { entries.push({ date, accountId: item.id, amount: amt, ts }); entries.sort((a, b) => a.date.localeCompare(b.date)); saveEntries(); }
        else { debtEntries.push({ date, amount: amt, accountId: item.id, accountName: item.name, accountType: item.type, ts }); debtEntries.sort((a, b) => a.date.localeCompare(b.date)); saveDebtEntries(); }
    }

    function suSave() {
        const d = suDraft;
        if (!d) return;
        suError = '';
        const trim = v => String(v || '').trim();

        if (d.kind === 'loan') {   // 3.5.4
            const name = trim(d.name);
            if (!name) return suFail('Who is the loan to?');
            if (suDupe(loanPeople, 'name', name, d.id)) return suFail('There’s already a loan for “' + name + '”.');
            const rate = lnNum(d.rate);
            if (rate == null || rate < 0 || rate > 30) return suFail('Enter an interest rate between 0 and 30%.');
            if (d.isNew) {
                const amt = trim(d.balance) === '' ? null : suParseMoney(d.balance);
                if (trim(d.balance) !== '' && (amt == null || amt <= 0 || amt >= 1e7)) return suFail('The amount lent doesn’t look right.');
                if (amt != null && (!lnValidMk(d.asOf) || d.asOf > suMk())) return suFail('Pick the month you lent it (not a future month).');
                const p = { id: suNewId('ln_'), name, status: d.status, rates: [{ from: amt != null ? d.asOf : suMk(), rate }] };
                loanPeople.push(p); saveLoanPeople();
                if (amt != null) { loanEvents.push({ id: suNewId('le_'), personId: p.id, date: d.asOf + '-15', type: 'lend', amount: amt, note: '', ts: Date.now() }); saveLoanEvents(); }
                return suDone('Added ' + name);
            }
            const p = loanPeople.find(x => suSame(x.id, d.id)); if (!p) return;
            if (rate !== lnRateAt(p, d.rateFrom || suMk())) {
                if (!lnValidMk(d.rateFrom)) return suFail('Pick the month the new rate starts.');
                const rs = (p.rates || []).slice().sort((a, b) => a.from.localeCompare(b.from));
                if (rs.length && d.rateFrom <= rs[0].from) rs[0].rate = rate;   // changing the starting rate
                else { p.rates = (p.rates || []).filter(r => r.from !== d.rateFrom); p.rates.push({ from: d.rateFrom, rate }); }
            }
            p.name = name; p.status = d.status; saveLoanPeople();
            return suDone('Saved ' + name);
        }
        if (d.kind === 'property') {   // 3.5.3
            const name = trim(d.name);
            if (!name) return suFail('Give it a name.');
            const props = reProps();
            if (suDupe(props, 'name', name, d.id)) return suFail('There’s already real estate called “' + name + '”.');
            if (d.isNew) {
                if (d.balance && suParseMoney(d.balance) == null) return suFail('The value doesn’t look like a number.');
                if (d.balance && d.asOf && d.asOf > suMk()) return suFail('“As of” can’t be a future month.');
                const p = { id: 'pr_' + Date.now(), name };
                props.push(p); reSaveProps(props);
                const v = suParseMoney(d.balance);
                if (v > 0) { const arr = dtGetHomeValues(); arr.push({ date: /^\d{4}-\d{2}$/.test(d.asOf || '') ? d.asOf : suMk(), note: '', value: v, propertyId: p.id }); dtSaveHomeValues(arr); }
                return suDone('Added ' + name);
            }
            const p = props.find(x => suSame(x.id, d.id)); if (!p) return;
            p.name = name; reSaveProps(props);
            return suDone('Saved ' + name);
        }
        if (d.kind === 'account') {
            const inst = trim(d.institution);
            if (!inst) return suFail('Pick where the account is, or add a new institution.');
            if (!institutions.includes(inst)) { institutions.push(inst); institutions.sort(); saveInstitutions(); }
            const typeLbl = (SU_ACCT_TYPES.find(t => t[0] === d.type) || [, d.type])[1];
            const name = trim(d.name) || inst + ' ' + typeLbl;
            if (d.isNew) {
                if (d.type !== 'metals' && d.balance && suParseMoney(d.balance) == null) return suFail('The balance doesn’t look like a number.');
                if (d.balance && d.asOf && d.asOf > suMk()) return suFail('“As of” can’t be a future month.');
                const a = { id: Date.now(), name, type: d.type, institution: inst };
                accounts.push(a); saveAccounts();
                if (d.type !== 'metals') suStartBalance('account', a);
                return suDone('Added ' + name);
            }
            const a = suItem(); if (!a) return;
            Object.assign(a, { name, type: d.type, institution: inst }); saveAccounts();
            return suDone('Saved ' + name);
        }

        if (d.kind === 'debt') {
            const name = trim(d.name);
            if (!name) return suFail('Give the debt a name.');
            if (suDupe(debtAccounts, 'name', name, d.id)) return suFail('You already have a debt called ' + name + '.');
            if (d.isNew) {
                if (d.balance && suParseMoney(d.balance) == null) return suFail('The balance doesn’t look like a number.');
                if (d.balance && d.asOf && d.asOf > suMk()) return suFail('“As of” can’t be a future month.');
                const a = { id: Date.now(), name, type: d.type, institution: trim(d.institution) };
                debtAccounts.push(a); saveDebtAccounts();
                suStartBalance('debt', a);
                return suDone('Added ' + name);
            }
            const a = suItem(); if (!a) return;
            Object.assign(a, { name, type: d.type, institution: trim(d.institution) }); saveDebtAccounts();
            // Keep past entries' labels in step with the account
            let touched = false;
            debtEntries.forEach(e => { if (suSame(e.accountId, a.id) && (e.accountName !== name || e.accountType !== a.type)) { e.accountName = name; e.accountType = a.type; touched = true; } });
            if (touched) saveDebtEntries();
            let touchedB = false;
            bulkDebtPayments.forEach(e => { if (suSame(e.accountId, a.id) && e.accountName !== name) { e.accountName = name; touchedB = true; } });
            if (touchedB) saveBulkDebtPayments();
            return suDone('Saved ' + name);
        }

        if (d.kind === 'bill') {
            const name = trim(d.name), cat = trim(d.serviceType) || 'Bill';
            if (!name) return suFail('Give the bill a name.');
            if (suDupe(companies, 'name', name, d.id)) return suFail('You already have a bill called ' + name + '.');
            if (d.isNew) { companies.push({ id: Date.now(), name, serviceType: cat }); saveCompanies(); return suDone('Added ' + name); }
            const c = suItem(); if (!c) return;
            const oldName = c.name;
            Object.assign(c, { name, serviceType: cat }); saveCompanies();
            let touched = false;
            expenses.forEach(e => {
                if ((e.companyId && suSame(e.companyId, c.id)) || (!e.companyId && e.companyName === oldName)) {
                    if (e.companyName !== name || e.serviceType !== cat) { e.companyName = name; e.serviceType = cat; touched = true; }
                }
            });
            if (touched) saveExpenses();
            return suDone('Saved ' + name);
        }

        if (d.kind === 'coast') {
            const inst = trim(d.institution);
            if (!inst) return suFail('Say where the account is.');
            if (suDupe(coastAccounts, 'institution', inst, d.id)) return suFail('You already have a coast account at ' + inst + '.');
            // 3.8: monthly coast goals were removed; saving an account drops its old monthlyGoal
            if (d.isNew) { coastAccounts.push({ id: 'cacct_' + Date.now(), institution: inst }); saveCoastAccounts(); return suDone('Added ' + inst); }
            const a = suItem(); if (!a) return;
            a.institution = inst; delete a.monthlyGoal; saveCoastAccounts();
            let touched = false;
            coastContribs.forEach(e => { if (suSame(e.accountId, a.id) && e.accountName !== inst) { e.accountName = inst; touched = true; } });
            if (touched) saveCoastContribs();
            return suDone('Saved ' + inst);
        }

        if (d.kind === 'plan') {
            if (!d.types.length) return suFail('Pick at least one contribution type.');
            const s = suItem(); if (!s) return;
            Object.assign(s, { label: trim(d.label) || s.label, institution: trim(d.institution), contribTypes: d.types.slice() });
            saveRetirementSources();
            return suDone('Saved ' + (s.label || 'plan'));
        }

        if (d.kind === 'income') return suSaveIncome();
    }

    function suSaveIncome() {
        const d = suDraft;
        const name = String(d.name || '').trim();
        if (!name) return suFail('Give the company a name.');
        if (name.endsWith(' — Bonus')) return suFail('That name is reserved for bonus checks. Try another.');
        if (suDupe(payers, 'name', name, d.id)) return suFail('You already have ' + name + '.');
        const isPay = d.defaultType === 'payroll';
        const sched = isPay ? suDraftSchedule() : null;
        if (sched && (sched.freq === 'weekly' || sched.freq === 'biweekly') && !sched.anchor) return suFail('Pick a recent payday so the schedule knows where to start.');
        if (isPay && (d.freq === 'semimonthly' || d.freq === 'monthly')) {
            const okDay = v => { const s = String(v).trim().toLowerCase(); return s === 'last' || (/^\d{1,2}$/.test(s) && +s >= 1 && +s <= 31); };
            if (!okDay(d.day1) || (d.freq === 'semimonthly' && !okDay(d.day2))) return suFail('Paydays are a day of the month (1–31) or “last”.');
            if (d.freq === 'semimonthly' && String(d.day1).trim().toLowerCase() === String(d.day2).trim().toLowerCase()) return suFail('Twice a month needs two different paydays.');
        }
        if (d.plans.some(p => !p.types.length)) return suFail('Each retirement plan needs at least one contribution type.');
        if (d.bonus && !d.bonusTypes.length && !d.bonusLocked) return suFail('Pick what bonus checks put toward retirement, or turn the bonus off.');

        let p;
        if (d.isNew) {
            p = { id: 'payer_' + Date.now(), name, defaultType: 'payroll' };
            payers.push(p);
        } else {
            p = suItem(); if (!p) return;
            const oldName = p.name;
            if (oldName !== name) {
                // Rename everything that points at the company by name
                const bp = bonusPayerFor(p);
                const oldBonus = bp ? bp.name : suBonusName(oldName), newBonus = suBonusName(name);
                const relabeled = {};
                retirementSources.forEach(s => {
                    if (s.sponsor !== oldName && s.sponsor !== oldBonus) return;
                    s.sponsor = s.sponsor === oldName ? name : newBonus;
                    if (s.label && s.label.startsWith(oldName)) { s.label = name + s.label.slice(oldName.length); relabeled[s.id] = s.label; }
                });
                // Past contributions keep a copy of the plan name; keep it in step
                let touchedRC = false;
                retirementContribs.forEach(c => { if (relabeled[c.sourceId] && c.sourceName !== relabeled[c.sourceId]) { c.sourceName = relabeled[c.sourceId]; touchedRC = true; } });
                if (touchedRC) saveRetirementContribs();
                if (bp) { bp.name = newBonus; bp.parentId = p.id; }
                let touched = false;
                incomeEntries.forEach(e => {
                    const mine  = e.payerId ? suSame(e.payerId, p.id) : e.payerName === oldName;
                    const bonus = e.payerId ? (bp && suSame(e.payerId, bp.id)) : e.payerName === oldBonus;
                    if (mine && e.payerName !== name) { e.payerName = name; touched = true; }
                    if (bonus && e.payerName !== newBonus) { e.payerName = newBonus; touched = true; }
                });
                if (touched) saveIncomeEntries();
                p.name = name;
            }
        }
        if (isPay) { if (sched) p.paySchedule = sched; else delete p.paySchedule; }

        // Retirement plans: update, add, remove (removal is only offered for plans with no contributions)
        const keep = new Set(d.plans.filter(x => x.id).map(x => String(x.id)));
        retirementSources = retirementSources.filter(s => s.sponsor !== name || keep.has(String(s.id)) || suSourceHasHistory(s.id));
        d.plans.forEach((pl, i) => {
            const onlyHSA = pl.types.every(t => t.startsWith('hsa_'));
            if (pl.id) {
                const s = retirementSources.find(x => suSame(x.id, pl.id));
                if (s) { s.institution = pl.institution.trim(); s.contribTypes = pl.types.slice(); }
            } else {
                retirementSources.push({ id: 'src_' + Date.now() + i + (onlyHSA ? '_h' : ''), label: name + (onlyHSA ? ' — HSA' : ' — Retirement'),
                                         institution: pl.institution.trim(), sponsor: name, contribTypes: pl.types.slice() });
            }
        });

        // Bonus: a separate payer "<name> — Bonus" plus its own plan
        const bonusName = suBonusName(name);
        let bp = bonusPayerFor(p);
        if (isPay && d.bonus) {
            if (!bp) { bp = { id: 'payer_' + Date.now() + '_b', name: bonusName, defaultType: 'bonus', parentId: p.id }; payers.push(bp); }
            if (bp.closed && !p.closed) { delete bp.closed; delete bp.closedMonth; }
            const inst = (d.plans.find(x => x.institution.trim()) || { institution: '' }).institution.trim();
            const bs = retirementSources.find(s => s.sponsor === bonusName);
            if (bs) { if (d.bonusTypes.length) bs.contribTypes = d.bonusTypes.slice(); bs.institution = bs.institution || inst; }
            else if (d.bonusTypes.length) retirementSources.push({ id: 'src_' + Date.now() + '_b', label: name + ' — Bonus Plan', institution: inst, sponsor: bonusName, contribTypes: d.bonusTypes.slice() });
        } else if (isPay && bp && !d.bonusLocked) {
            payers = payers.filter(x => x !== bp);
            retirementSources = retirementSources.filter(s => s.sponsor !== bonusName || suSourceHasHistory(s.id));
        }
        savePayers(); saveRetirementSources();
        return suDone((d.isNew ? 'Added ' : 'Saved ') + name);
    }

    // ── Close / reopen / delete ──
    function suClose() {
        const d = suDraft, item = suItem();
        if (!item) return;
        const mk = suMk(), ts = Date.now();
        item.closed = true; item.closedMonth = mk;
        if (d.kind === 'account') {
            const last = item.type === 'metals' ? null : suLatest(entries, e => suSame(e.accountId, item.id));
            if (last && last.amount !== 0) { entries.push({ date: mk + '-15', accountId: item.id, amount: 0, ts, closedZero: true }); entries.sort((a, b) => a.date.localeCompare(b.date)); saveEntries(); }
            saveAccounts();
        } else if (d.kind === 'debt') {
            const last = suLatest(debtEntries, e => suSame(e.accountId, item.id));
            if (last && last.amount !== 0) { debtEntries.push({ date: mk + '-15', amount: 0, accountId: item.id, accountName: item.name, accountType: item.type, ts, closedZero: true }); debtEntries.sort((a, b) => a.date.localeCompare(b.date)); saveDebtEntries(); }
            saveDebtAccounts();
        } else if (d.kind === 'bill') saveCompanies();
        else if (d.kind === 'coast') saveCoastAccounts();
        else if (d.kind === 'income') {
            const bp = bonusPayerFor(item);
            if (bp) { bp.closed = true; bp.closedMonth = mk; }
            savePayers();
        }
        suDone('Closed ' + (item.name || item.institution));
    }
    function suReopen() {
        const d = suDraft, item = suItem();
        if (!item) return;
        delete item.closed; delete item.closedMonth;
        // Take back the $0 balance that closing logged, if it's still the latest entry and still $0
        const undoZero = (list, save) => {
            const last = suLatest(list, e => suSame(e.accountId, item.id));
            if (last && last.closedZero && last.amount === 0) { list.splice(list.indexOf(last), 1); save(); }
        };
        if (d.kind === 'account') undoZero(entries, saveEntries);
        if (d.kind === 'debt') undoZero(debtEntries, saveDebtEntries);
        if (d.kind === 'income') {
            const bp = bonusPayerFor(item);
            if (bp) { delete bp.closed; delete bp.closedMonth; }
        }
        ({ account: saveAccounts, debt: saveDebtAccounts, bill: saveCompanies, coast: saveCoastAccounts, income: savePayers })[d.kind]();
        suDone('Reopened ' + (item.name || item.institution));
    }
    function suDelete() {
        const d = suDraft, item = suItem();
        if (d && d.kind === 'loan') {   // 3.5.4
            if (!item) return;
            loanEvents = loanEvents.filter(e => !suSame(e.personId, item.id)); saveLoanEvents();
            loanPeople = loanPeople.filter(x => x !== item); saveLoanPeople();
            return suDone('Removed ' + item.name);
        }
        if (d && d.kind === 'property') {   // 3.5.3
            if (!item || item.id === 'home') return;
            dtSaveHomeValues(dtGetHomeValues().filter(r => rePid(r) !== item.id));
            reSaveProps(reProps().filter(x => x.id !== item.id));
            return suDone('Removed ' + item.name);
        }
        if (!item || suHasHistory()) return;
        const label = item.name || item.institution || item.label;
        if (d.kind === 'account')      { accounts = accounts.filter(x => x !== item); saveAccounts(); }
        else if (d.kind === 'debt')    { debtAccounts = debtAccounts.filter(x => x !== item); saveDebtAccounts(); }
        else if (d.kind === 'bill')    { companies = companies.filter(x => x !== item); saveCompanies(); }
        else if (d.kind === 'coast')   { coastAccounts = coastAccounts.filter(x => x !== item); saveCoastAccounts(); }
        else if (d.kind === 'plan')    { retirementSources = retirementSources.filter(x => x !== item); saveRetirementSources(); }
        else if (d.kind === 'income') {
            const bp = bonusPayerFor(item), bonusName = bp ? bp.name : suBonusName(item.name);
            retirementSources = retirementSources.filter(s => s.sponsor !== item.name && s.sponsor !== bonusName);
            payers = payers.filter(x => x !== item && x !== bp);
            savePayers(); saveRetirementSources();
        }
        suDone('Deleted ' + label);
    }

