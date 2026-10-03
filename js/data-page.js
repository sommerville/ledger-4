// Sommerville Ledger 4 — data-page.js
// Data page: the monthly logger and its save engine (v3.2/v3.3)
// Part of index.html (3.5.2 split). Plain script, loaded in order; all files share one global scope.
    // ══════════════════════════════════════════════════════════════
    // DATA DUMP v2 — Persistent Form with Month Selector
    // ══════════════════════════════════════════════════════════════

    let ddTimeTravelOffset = 0;
    let ddCurrentMk = null;

    // Context-aware element helpers
    function ddFB()  { return document.getElementById('ddFormBodyMob'); }
    function ddMS()  { return document.getElementById('ddMonthSelectMob'); }
    function ddTTM() { return document.getElementById('ddTimeTravelMsgMob'); }
    function ddFBSel(inner) { return '#ddFormBodyMob ' + inner; }

    function ddGetToday() {
        const d = new Date();
        d.setMonth(d.getMonth() + ddTimeTravelOffset);
        return d;
    }

    function ddMonthKey(d) {
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    }

    function openDataDump() { navigate('data'); }   // v3.3: a page, like Setup

    // ══════════════════════════════════════════════════════════════
    // DATA PAGE (v3.3 redesign) — the monthly logger
    // Full page like Setup (was the dataDumpModal popup). Same save engine as 3.2 (ddSnap, ddSaveSection):
    // this block only changes how the month is drawn. Rows keep the 3.2 contract —
    // .dd-entry-row / .dd-new-row, data-gidx, data-section, data-mk, the paycheck card ids and data-* —
    // because ddCheckNewRows / ddSaveSection read them.
    // ══════════════════════════════════════════════════════════════
    const DD_ICON = {
        prev:  '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
        next:  '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>',
        chev:  '<svg class="dd-chev" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>',
        x:     '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
        gear:  '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/></svg>',
    };
    const DD_TAGS = { income: '$', expenses: 'BILL', debt: 'DEBT', bulkdebt: 'XTRA', accounts: 'INV', realestate: 'RE', coast: 'CST', loans: 'LOAN', notes: 'NOTE' };
    let ddStat = {};   // per-section "logged / expected" for the progress chips, filled as sections draw

    // A value going into a JS string inside an onclick="..." attribute
    function ddJ(s) { return ddE(String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")); }
    function ddDay(date) {   // 'YYYY-MM-DD' → 'Sep 5'
        const [y, m, d] = String(date || '').split('-').map(Number);
        return (y && m && d) ? new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
    }
    function ddMon(mk) {     // 'YYYY-MM' → 'Aug'
        const [y, m] = String(mk || '').split('-').map(Number);
        return (y && m) ? new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short' }) : '';
    }
    function ddMoneyTxt(n) { return typeof fmt === 'function' ? fmt(n || 0) : '$' + Math.round(n || 0).toLocaleString(); }
    function ddPrevKeys(mk, n) { const out = []; let k = mk; for (let i = 0; i < n; i++) { k = ddPrevMonthKey(k); out.push(k); } return out; }
    // Latest entry before month mk that matches — used for the "last: $X" hints
    function ddLastBefore(list, mk, match) {
        let best = null;
        list.forEach(e => { if (e && e.date && e.date.slice(0, 7) < mk && match(e) && (!best || e.date > best.date || (e.date === best.date && (e.ts || 0) >= (best.ts || 0)))) best = e; });
        return best;
    }
    function ddLastHint(e, pre) {
        if (!e) return '';
        return (pre || 'Last') + ' ' + ddMoneyTxt(e.amount) + ' · ' + ddMon(e.date.slice(0, 7));
    }

    // ── Open / close / leave (the page guards unsaved typing) ──
    function ddConfirmLeave() {
        if (!ddDirty.size) return true;
        const what = [...ddDirty].map(s => DD_SECTION_TITLES[s] || s).join(', ');
        if (!confirm('You have changes that aren’t saved yet (' + what + '). Leave and lose them?')) return false;
        ddDirty.clear();
        return true;
    }
    // Back arrow on the page (same bookkeeping as closeModal: pop our entry, consume its history entry quietly)
    function ddClose() {
        if (!ddConfirmLeave()) return;
        if (navStack.length <= 1) { navigate('home', true, true); return; }
        navLocked = true;
        navStack.pop();
        navigate(navStack[navStack.length - 1], true, true);
        skipNextPopstate = true;
        historyDepth = Math.max(0, historyDepth - 1);
        history.back();
        setTimeout(() => { navLocked = false; skipNextPopstate = false; }, 300);
    }
    // Called from goBack() (swipe / hardware Back). Returns true when Back was cancelled.
    function ddHandleBack(top) {
        if (top !== 'data' || !ddDirty.size) return false;
        if (ddConfirmLeave()) return false;
        history.pushState({ idx: navStack.length - 1 }, '', '');   // put back the history entry Back just used
        historyDepth++;
        return true;
    }
    function ddOpenSetup() { if (ddConfirmLeave()) openSetup(); }

    // ── Month picker ──
    function ddBuildMonthDropdown() {
        const sel = ddMS();
        if (!sel) return;
        const today = ddGetToday();
        // Start at Jan 2024, or earlier if the data goes back further
        let first = '2024-01';
        [incomeEntries, expenses, entries, debtEntries, coastContribs, retirementContribs, bulkDebtPayments].forEach(list => (list || []).forEach(e => {
            const k = e && typeof e.date === 'string' ? e.date.slice(0, 7) : '';
            if (/^\d{4}-\d{2}$/.test(k) && k >= '1990-01' && k < first) first = k;
        }));
        const [fy, fm] = first.split('-').map(Number);
        const end = new Date(today.getFullYear(), today.getMonth(), 1);
        const months = [];
        const c = new Date(fy, fm - 1, 1);
        while (c <= end) {
            months.push({ key: ddMonthKey(c), label: c.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) });
            c.setMonth(c.getMonth() + 1);
        }
        months.reverse();
        const prev = sel.value && months.some(m => m.key === sel.value) ? sel.value : months[0]?.key;
        sel.innerHTML = months.map(m => `<option value="${m.key}"${m.key === prev ? ' selected' : ''}>${m.label}</option>`).join('');
        ddLoadMonth();
    }
    // ‹ › buttons: the list is newest first, so "next month" is one option up
    function ddStep(dir) {
        const sel = ddMS();
        if (!sel) return;
        const i = sel.selectedIndex - dir;
        if (i < 0 || i >= sel.options.length) return;
        sel.selectedIndex = i;
        ddMonthChanged();
    }
    function ddUpdateStepper() {
        const sel = ddMS();
        const p = document.getElementById('ddPrevMob'), n = document.getElementById('ddNextMob');
        if (!sel) return;
        if (p) p.disabled = sel.selectedIndex >= sel.options.length - 1;
        if (n) n.disabled = sel.selectedIndex <= 0;
    }

    // ─── v3.2: stable row → entry mapping ────────────────────
    // Each section's rows carry positions into ddSnap, a copy of the arrays taken when that section was drawn.
    // Saving and deleting resolve rows to the entry objects themselves, so nothing shifts under them.
    let ddSnap = {};
    // Names typed in Setup can hold quotes, & or <; escape them before they go into the page
    function ddE(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
    const DD_ARRAYS = () => ({ income: incomeEntries, retirement: retirementContribs, expenses, debt: debtEntries,
                               bulkdebt: bulkDebtPayments, accounts: entries, coast: coastContribs });
    // v3.5: extra debt payments are drawn and saved inside the Debt section
    const DD_SECTION_ARRAYS = { income: ['income', 'retirement'], expenses: ['expenses'], debt: ['debt', 'bulkdebt'],
                                accounts: ['accounts'], realestate: [], coast: ['coast'], loans: [], notes: [] };
    const ddHost = sectionId => sectionId === 'bulkdebt' ? 'debt' : (sectionId === 'retirement' ? 'income' : sectionId);
    const DD_SECTION_TITLES = { income: 'Income', expenses: 'Bills', debt: 'Debt balances', bulkdebt: 'Extra debt payments',
                                accounts: 'Investments', realestate: 'Real Estate', coast: 'Coast savings', loans: 'Loans', notes: 'Notes' };
    function ddTakeSnap(keys) { const all = DD_ARRAYS(); (keys || Object.keys(all)).forEach(k => { ddSnap[k] = all[k].slice(); }); }
    function ddObj(section, i) { const arr = ddSnap[section]; i = parseInt(i, 10); return arr && i >= 0 ? (arr[i] || null) : null; }
    function ddRemove(section, obj) { const arr = DD_ARRAYS()[section]; const i = arr ? arr.indexOf(obj) : -1; if (i >= 0) arr.splice(i, 1); return i >= 0; }
    function ddPersist(section) {
        ({ income: saveIncomeEntries, retirement: saveRetirementContribs, expenses: saveExpenses, debt: saveDebtEntries,
           bulkdebt: saveBulkDebtPayments, accounts: saveEntries, coast: saveCoastContribs })[section]();
    }
    let ddLastTs = 0;
    function ddTs() { ddLastTs = Math.max(Date.now(), ddLastTs + 1); return ddLastTs; }   // unique, increasing

    // Unsaved typing, per section — switching months or leaving asks first; the section shows "Unsaved"
    const ddDirty = new Set();
    function ddMarkDirty(e) {
        const w = e.target && e.target.closest && e.target.closest('[id^="dd-wrap-"]');
        if (w && w.dataset.section) { ddDirty.add(w.dataset.section); w.classList.add('dd-dirty'); }
    }
    document.addEventListener('input', ddMarkDirty);
    document.addEventListener('change', ddMarkDirty);
    function ddMonthChanged() {
        const sel = ddMS();
        if (!sel) return;
        if (ddDirty.size && sel.value !== ddCurrentMk) {
            const what = [...ddDirty].map(s => DD_SECTION_TITLES[s] || s).join(', ');
            if (!confirm('You have changes that aren’t saved yet (' + what + '). Switch months and lose them?')) { sel.value = ddCurrentMk; ddUpdateStepper(); return; }
        }
        ddLoadMonth();
        const page = document.getElementById('dataPage');
        if (page) page.scrollTop = 0;
    }

    function ddSectionHtml(sectionId, mk) {
        return ({ income: ddSectionIncome, expenses: ddSectionExpenses, debt: ddSectionDebt,
                  accounts: ddSectionAccounts, realestate: ddSectionRealEstate, coast: ddSectionCoast, loans: ddSectionLoans, notes: ddSectionNotes })[sectionId](mk);
    }
    // Redraw one section after it changes; the others keep whatever is typed in them
    function ddRefreshSection(sectionId, mk) {
        sectionId = ddHost(sectionId);
        const old = document.getElementById('dd-wrap-' + sectionId + '-' + mk);
        if (!old || !DD_SECTION_ARRAYS[sectionId]) { ddLoadMonth(); return; }
        const ui = sectionId === 'income' ? ddIncomeUiState(mk) : null;
        const bulk = document.getElementById('dd-bulk-' + mk + '-body');
        const bulkOpen = !!(bulk && bulk.style.display !== 'none');
        ddTakeSnap(DD_SECTION_ARRAYS[sectionId]);
        old.outerHTML = ddSectionHtml(sectionId, mk);
        ddDirty.delete(sectionId);
        if (ui) ddRestoreIncomeUi(mk, ui);
        if (sectionId === 'debt' && bulkOpen) ddTogglePc('dd-bulk-' + mk + '-body');
        ddRenderChips(mk);
    }
    function ddIncomeUiState(mk) {
        const st = { open: {}, tab: {} };
        document.querySelectorAll('[id^="dd-pc-'+mk+'-"][id$="-outer"], [id^="dd-np-'+mk+'-"][id$="-body"]').forEach(el => { st.open[el.id] = el.style.display !== 'none'; });
        document.querySelectorAll('[id^="dd-pc-'+mk+'-"][data-pc-idx]').forEach(el => { if (el.style.display === 'block') st.tab[el.dataset.payerId] = parseInt(el.dataset.pcIdx, 10); });
        document.querySelectorAll('[id^="dd-bonus-'+mk+'-"]').forEach(el => { if (el.style.display === 'block') st.tab[el.dataset.payerId] = 'B'; });
        return st;
    }
    function ddRestoreIncomeUi(mk, st) {
        Object.entries(st.open).forEach(([id, open]) => {
            const el = document.getElementById(id); if (!el) return;
            el.style.display = open ? 'block' : 'none';
            const card = el.closest('.dd-pay'); if (card) card.classList.toggle('open', open);
        });
        Object.entries(st.tab).forEach(([pid, tab]) => { if (tab === 'B') ddPcTabBonus(mk, pid); else ddPcTab(mk, pid, tab); });
    }
    function ddShowMsg(sectionId, mk, text, isError) {
        sectionId = ddHost(sectionId);
        const msg = document.getElementById('dd-msg-'+sectionId+'-'+mk);
        if (!msg) return;
        msg.textContent = text;
        msg.classList.toggle('err', !!isError);
        msg.style.display = 'block';
        clearTimeout(msg._t);
        msg._t = setTimeout(() => { msg.style.display = 'none'; }, isError ? 6000 : 2500);
    }

    function ddLoadMonth() {
        const sel = ddMS();
        if (!sel) return;
        ddCurrentMk = sel.value;
        const body = ddFB();
        if (!body) return;
        ddTakeSnap();
        ddDirty.clear();
        ddStat = {};
        const mk = ddCurrentMk;
        body.innerHTML = [ddSectionIncome(mk), ddSectionAccounts(mk), ddSectionExpenses(mk), ddSectionCoast(mk),
                          ddSectionDebt(mk), ddSectionLoans(mk), ddSectionRealEstate(mk), ddSectionNotes(mk)].join('');
        ddRenderChips(mk);
        ddUpdateStepper();
        const msg = ddTTM();
        const isFuture = mk > ddMonthKey(ddGetToday());
        if (msg) { msg.style.display = isFuture ? 'block' : 'none'; if (isFuture) msg.textContent = 'Time Travel mode — future month'; }
    }

    // Progress chips under the month: what's logged vs. what the month usually has. Tap one to jump there.
    function ddRenderChips(mk) {
        const box = document.getElementById('ddChipsMob');
        if (!box) return;
        const order = [['income', 'Pay'], ['accounts', 'Investments'], ['expenses', 'Bills'], ['coast', 'Coast'], ['debt', 'Debt'], ['loans', 'Loans'], ['notes', 'Note']];
        box.innerHTML = order.filter(([id]) => ddStat[id] && (ddStat[id].of > 0 || ddStat[id].n > 0)).map(([id, lbl]) => {
            const s = ddStat[id];
            const state = s.n <= 0 ? 'empty' : (s.n >= s.of ? 'done' : 'part');
            const count = id === 'notes' ? '' : ' <span>' + (s.of > s.n ? s.n + '/' + s.of : s.n) + '</span>';
            return '<button class="dd-pchip ' + state + '" onclick="ddJump(\'' + id + '\')"><i></i>' + lbl + count + '</button>';
        }).join('');
    }
    // v3.5.1: every Data page section except Notes collapses; the choice is remembered (pf_ddCollapsed, UI only)
    function ddCollapsedSet() {
        try { return new Set(JSON.parse(localStorage.getItem('pf_ddCollapsed') || '[]')); } catch (e) { return new Set(); }
    }
    function ddIsCollapsed(sectionId) { return ddCollapsedSet().has(sectionId); }
    function ddToggleSec(sectionId, mk, forceOpen) {
        const el = document.getElementById('dd-wrap-' + sectionId + '-' + mk);
        if (!el) return;
        const collapse = forceOpen ? false : !el.classList.contains('dd-collapsed');
        el.classList.toggle('dd-collapsed', collapse);
        const head = el.querySelector('.dd-head-tap'); if (head) head.setAttribute('aria-expanded', collapse ? 'false' : 'true');
        const set = ddCollapsedSet();
        if (collapse) set.add(sectionId); else set.delete(sectionId);
        try { localStorage.setItem('pf_ddCollapsed', JSON.stringify([...set])); } catch (e) {}
    }
    function ddJump(sectionId) {
        const el = document.getElementById('dd-wrap-' + sectionId + '-' + ddCurrentMk);
        if (el && el.classList.contains('dd-collapsed')) ddToggleSec(sectionId, ddCurrentMk, true);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // ── Building blocks ──
    // opts: { sub, noAdd, noRemove }
    function ddSectionWrap(title, color, innerHtml, mk, sectionId, opts) {
        opts = opts || {};
        const canAdd = sectionId !== 'income' && !opts.noAdd;
        const canRm  = sectionId !== 'income' && !opts.noRemove;
        return `
        <section id="dd-wrap-${sectionId}-${mk}" data-section="${sectionId}" class="dd-sec${ddIsCollapsed(sectionId) ? ' dd-collapsed' : ''}">
            <div class="dd-head dd-head-tap" role="button" tabindex="0" aria-expanded="${ddIsCollapsed(sectionId) ? 'false' : 'true'}" onclick="ddToggleSec('${sectionId}','${mk}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();ddToggleSec('${sectionId}','${mk}')}">
                <span class="su-tag">${DD_TAGS[sectionId] || ''}</span>
                <div class="dd-htext"><span class="dd-title">${title}</span>${opts.sub ? `<span class="dd-sub">${opts.sub}</span>` : ''}</div>
                <span class="dd-unsaved">Unsaved</span>
                ${DD_ICON.chev}
            </div>
            <div class="dd-body" id="dd-sec-${sectionId}-${mk}">
                ${innerHtml}
            </div>
            <div class="dd-foot">
                ${canAdd ? `<button class="dd-fbtn" onclick="ddAddRow('${sectionId}','${mk}')">+ Add</button>` : ''}
                ${canRm ? `<button class="dd-fbtn" id="dd-delbtn-${sectionId}-${mk}" onclick="ddToggleDelete('${sectionId}','${mk}')">Remove</button>` : ''}
                <button class="dd-save" onclick="ddSave('${sectionId}','${mk}')">Save</button>
            </div>
            <div id="dd-msg-${sectionId}-${mk}" class="dd-msg" style="display:none;"></div>
        </section>`;
    }
    function ddLbl(name, hint, muted) {
        return '<div class="dd-lbl"><span class="dd-name' + (muted ? ' muted' : '') + '">' + name + '</span>' + (hint ? '<span class="dd-hint">' + hint + '</span>' : '') + '</div>';
    }
    // Money input. attrs = extra attributes (class, data-*) placed on the <input>
    function ddIn(value, attrs, kind) {
        const v = value === '' || value == null ? '' : ' value="' + ddE(value) + '"';
        const step = kind === 'oz' ? '0.001' : '0.01';
        return '<span class="dd-money' + (kind === 'oz' ? ' oz' : '') + (kind === 'net' ? ' net' : '') + '"><input type="number"' + v
             + ' placeholder="' + (kind === 'oz' ? '0' : '0.00') + '" step="' + step + '" inputmode="decimal" enterkeyhint="done" ' + (attrs || '') + (/\bclass="/.test(attrs || '') ? '' : ' class="dd-in"') + '></span>';
    }
    function ddXBtn(onclick) {
        return '<button type="button" class="dd-x-btn" aria-label="Remove" onclick="' + onclick + '">' + DD_ICON.x + '</button>';
    }
    function ddExistingRow(sectionId, mk, gi, label, value, hint) {
        return `<div class="dd-entry-row" data-gidx="${gi}" data-section="${sectionId}" data-mk="${mk}">
            ${ddXBtn(`ddDeleteEntry('${sectionId}',${gi},'${mk}')`)}
            ${ddLbl(label, hint)}
            ${ddIn(value, 'data-entry-idx="' + gi + '" data-field="amount"')}
        </div>`;
    }
    function ddBlankRow(sectionId, mk, label, dataAttrs, hint) {
        return `<div class="dd-entry-row dd-new-row" data-section="${sectionId}" data-mk="${mk}" ${dataAttrs || ''}>
            ${ddXBtn("this.closest('.dd-entry-row').remove()")}
            ${ddLbl(label, hint, true)}
            ${ddIn('', '')}
        </div>`;
    }
    function ddEmpty(text) { return '<div class="dd-empty">' + text + '</div>'; }

    // ─── PAYCHECK CARDS (Income + Retirement combined per payer) ───────────────

    function ddTogglePc(bodyId) {
        const el = document.getElementById(bodyId);
        if (!el) return;
        const open = el.style.display === 'none';
        el.style.display = open ? 'block' : 'none';
        const card = el.closest('.dd-pay'); if (card) card.classList.toggle('open', open);
    }
    function ddTabsFor(payerId) {
        const body = ddFB();
        return body ? [...body.querySelectorAll('.dd-tab')].filter(b => b.dataset.payerId === String(payerId)) : [];
    }
    function ddPanelsFor(payerId) {
        const body = ddFB();
        return body ? [...body.querySelectorAll('[data-pc-idx]')].filter(p => p.dataset.payerId === String(payerId) && p.id.indexOf('dd-pc-') === 0) : [];
    }
    function ddTabHas(tab) {
        const body = ddFB();
        const panel = body && (tab.dataset.tab === 'B'
            ? [...body.querySelectorAll('.dd-bonus-card')].find(p => p.dataset.payerId === tab.dataset.payerId)
            : ddPanelsFor(tab.dataset.payerId).find(p => p.dataset.pcIdx === tab.dataset.tab));
        const net = panel && (tab.dataset.tab === 'B' ? panel.querySelector('input.dd-np-row:not(.dd-bonus-gross-inp)') : panel.querySelector('.dd-pc-net'));
        return !!(net && net.value && parseFloat(net.value) > 0);
    }
    function ddPcTab(mk, payerId, activeIdx) {
        ddPanelsFor(payerId).forEach(p => { p.style.display = parseInt(p.dataset.pcIdx, 10) === activeIdx ? 'block' : 'none'; });
        const body = ddFB();
        const bonusPanel = body && [...body.querySelectorAll('.dd-bonus-card')].find(p => p.dataset.payerId === String(payerId));
        if (bonusPanel) bonusPanel.style.display = 'none';
        ddTabsFor(payerId).forEach(t => {
            t.classList.toggle('on', t.dataset.tab === String(activeIdx));
            t.classList.toggle('has', ddTabHas(t));
        });
    }
    function ddPcTabBonus(mk, payerId) {
        ddPanelsFor(payerId).forEach(p => { p.style.display = 'none'; });
        const body = ddFB();
        const bonusPanel = body && [...body.querySelectorAll('.dd-bonus-card')].find(p => p.dataset.payerId === String(payerId));
        if (bonusPanel) bonusPanel.style.display = 'block';
        ddTabsFor(payerId).forEach(t => {
            t.classList.toggle('on', t.dataset.tab === 'B');
            t.classList.toggle('has', ddTabHas(t));
        });
    }

    function ddSectionIncome(mk) {
        const prevKey     = ddPrevMonthKey(mk);
        const thisPayroll = incomeEntries.filter(e => e.date.slice(0,7) === mk  && e.type === 'payroll');
        const prevPayroll = incomeEntries.filter(e => e.date.slice(0,7) === prevKey && e.type === 'payroll');
        const shownInc    = new Set();   // income entries drawn somewhere on this screen
        const shownRc     = new Set();   // retirement contributions drawn somewhere on this screen
        let expectTotal = 0, loggedTotal = 0;

        // Only payroll-type payers get the paycheck layout
        const payerMap = {};
        payers.filter(p => (!p.defaultType || p.defaultType === 'payroll') && activeInMonth(p, mk)).forEach(p => { payerMap[p.id] = p; });
        [...thisPayroll, ...prevPayroll].forEach(e => {
            if (e.payerId && !payerMap[e.payerId]) {
                const cfg = payers.find(p => p.id === e.payerId);
                if (cfg && !activeInMonth(cfg, mk) && e.date.slice(0,7) !== mk) return;   // v3.2: closed company
                if (!cfg || !cfg.defaultType || cfg.defaultType === 'payroll')
                    payerMap[e.payerId] = cfg || { id: e.payerId, name: e.payerName };
            }
        });

        let allCards = '';
        Object.values(payerMap).forEach(payer => {
            // v3.2: paychecks fill the tabs in the order they were entered (as before), and each paycheck's
            // retirement contributions are matched to that paycheck: by link (linkedPayTs) first, then the
            // way the screen always paired them (tab 1/2/3 ↔ the 1st/15th/28th), then same date, then
            // older entries with other dates. Checked against the 2026-09-28 backup: identical pairing.
            const paychecks = thisPayroll
                .filter(e => e.payerId === payer.id)
                .sort((a,b) => (a.ts||0) - (b.ts||0));
            const lastPayDate = paychecks.reduce((m, e) => e.date > m ? e.date : m, '');
            // v3.3: as many tabs as the pay schedule expects (weekly = 4–5), never fewer than 3,
            // and never fewer than the paychecks already logged (a 4th used to be hidden but counted)
            const expected = payDatesInMonth(payer, mk);
            const nTabs    = Math.max(3, expected ? expected.length : 0, paychecks.length);
            paychecks.forEach(e => shownInc.add(e));
            loggedTotal += paychecks.length;
            expectTotal += expected ? Math.max(expected.length, paychecks.length) : paychecks.length;

            // Payroll retirement sources only (exclude bonus sources)
            const linkedSources = retirementSources.filter(src =>
                src.sponsor && src.sponsor.toLowerCase() === (payer.name||'').toLowerCase()
            );
            const monthContribs = retirementContribs.filter(c => c.date && c.date.slice(0,7) === mk);
            const claimedC = new Set(), contribFor = {};
            linkedSources.forEach(src => {
                const pool = monthContribs.filter(c => c.sourceId === src.id)
                    .sort((a,b) => a.date.localeCompare(b.date) || (a.ts||0) - (b.ts||0));
                const take = test => paychecks.forEach((pc, i) => {
                    const key = i + '|' + src.id;
                    if (contribFor[key]) return;
                    const c = pool.find(c => !claimedC.has(c) && test(c, pc, i));
                    if (c) { claimedC.add(c); contribFor[key] = c; }
                });
                take((c, pc) => pc.ts && c.linkedPayTs === pc.ts);
                take((c, pc, i) => !c.linkedPayTs && c.date === mk + '-' + ['01', '15', '28'][i]);   // how tabs always paired
                take((c, pc) => !c.linkedPayTs && c.date === pc.date);
                take(c => !c.linkedPayTs && !['01', '15', '28'].includes(c.date.slice(8, 10)));   // older real-dated entries
            });
            claimedC.forEach(c => shownRc.add(c));

            // Bonus payer + bonus income entries + bonus retirement sources
            const bonusPayer     = bonusPayerFor(payer);   // v3.2: linked by id, name as fallback
            const bonusPayerName = bonusPayer ? bonusPayer.name : payer.name + ' — Bonus';
            const bonusEntries   = bonusPayer
                ? incomeEntries.filter(e => e.date.slice(0,7) === mk && e.type === 'bonus' && e.payerId === bonusPayer.id)
                : [];
            const bonusSources   = bonusPayer
                ? retirementSources.filter(src => src.sponsor && src.sponsor.toLowerCase() === bonusPayerName.toLowerCase())
                : [];
            bonusEntries.forEach(e => shownInc.add(e));

            const outerBodyId = 'dd-pc-'+mk+'-'+payer.id+'-outer';
            const startOpen   = false;   // v3.5: the page opens with every income card collapsed

            const retBlock = (title, rows) => '<div class="dd-subhead">' + ddE(title) + '</div>' + rows;

            // ── Paycheck panels ──
            let panelsHtml = '';
            for (let pcIdx = 0; pcIdx < nTabs; pcIdx++) {
                const existing  = paychecks[pcIdx] || null;
                const gi        = existing ? incomeEntries.indexOf(existing) : -1;
                const netVal    = existing ? existing.amount : '';
                const grossVal  = existing ? (existing.grossPay || '') : '';
                const pcId      = 'dd-pc-'+mk+'-'+payer.id+'-'+pcIdx;
                const isNew     = !existing;
                // A new paycheck is dated after the ones already logged, so it keeps its tab.
                // v3.3: with a pay schedule it takes that payday; without one, the old 1st/15th/28th slots.
                const slotDate  = (expected && expected[pcIdx]) || (mk + '-' + (['01', '15', '28'][pcIdx] || '28'));
                const newDate   = isNew ? (slotDate > lastPayDate ? slotDate : lastPayDate) : '';

                let retHtml = '';
                linkedSources.forEach(src => {
                    const contrib   = contribFor[pcIdx + '|' + src.id] || null;
                    const cgi       = contrib ? retirementContribs.indexOf(contrib) : -1;
                    const contribTs = contrib ? (contrib.ts || '') : '';
                    let rows = '';
                    (src.contribTypes || []).forEach(typeKey => {
                        const ti   = CONTRIB_TYPES[typeKey] || { label: typeKey };
                        const cval = contrib && contrib.amounts && contrib.amounts[typeKey] != null ? contrib.amounts[typeKey] : '';
                        rows += '<div class="dd-row sm">' + ddLbl(ddE(ti.label))
                              + ddIn(cval, 'data-contrib-gi="'+cgi+'" data-contrib-ts="'+contribTs+'" data-source-id="'+ddE(src.id)+'" data-type-key="'+ddE(typeKey)+'" data-pc-idx="'+pcIdx+'" data-payer-id="'+ddE(payer.id)+'"')
                              + '</div>';
                    });
                    retHtml += retBlock(src.label || src.institution || 'Retirement', rows);
                });

                panelsHtml +=
                    '<div id="'+ddE(pcId)+'" class="dd-pcpanel" data-payer-id="'+ddE(payer.id)+'" data-payer-name="'+ddE(payer.name)+'" data-pc-idx="'+pcIdx+'" data-gi="'+gi+'" data-is-new="'+isNew+'" data-new-date="'+newDate+'"'
                  + ' style="display:'+(pcIdx===0?'block':'none')+';">'
                  + '<div class="dd-row">' + ddLbl('Net pay', existing ? 'Paid ' + ddDay(existing.date) : (expected && expected[pcIdx] ? 'Payday ' + ddDay(expected[pcIdx]) : 'Take-home')) + ddIn(netVal, 'class="dd-in dd-pc-net"', 'net') + '</div>'
                  + '<div class="dd-row">' + ddLbl('Gross pay') + ddIn(grossVal, 'class="dd-in dd-pc-gross"') + '</div>'
                  + retHtml
                  + '</div>';
            }

            // ── Bonus panel (shown when the Bonus tab is active) ──
            let bonusPanelHtml = '';
            if (bonusPayer) {
                const bonusEntry = bonusEntries[0] || null;
                const bGi        = bonusEntry ? incomeEntries.indexOf(bonusEntry) : -1;
                const bIsNew     = !bonusEntry;
                const bonusBcId  = 'dd-bonus-'+mk+'-'+payer.id;   // v3.2: was '-0' for every company

                let bRetHtml = '';
                bonusSources.forEach(src => {
                    const existingContrib = bonusEntry
                        ? retirementContribs.find(rc => rc.sourceId === src.id && (rc.linkedBonusTs === bonusEntry.ts || (!rc.linkedBonusTs && rc.date && rc.date.slice(0,7) === mk)))
                        : null;
                    if (existingContrib) shownRc.add(existingContrib);
                    const cgi       = existingContrib ? retirementContribs.indexOf(existingContrib) : -1;
                    const contribTs = existingContrib ? (existingContrib.ts || '') : '';
                    let rows = '';
                    (src.contribTypes || []).forEach(typeKey => {
                        const ti   = CONTRIB_TYPES[typeKey] || { label: typeKey };
                        const cval = existingContrib && existingContrib.amounts && existingContrib.amounts[typeKey] != null ? existingContrib.amounts[typeKey] : '';
                        rows += '<div class="dd-row sm">' + ddLbl(ddE(ti.label))
                              + ddIn(cval, 'data-type-key="'+ddE(typeKey)+'" data-source-id="'+ddE(src.id)+'" data-contrib-gi="'+cgi+'" data-contrib-ts="'+contribTs+'" data-bonus-ts="'+(bonusEntry ? bonusEntry.ts : '')+'" data-mk="'+mk+'" data-bonus-gi="'+bGi+'"')
                              + '</div>';
                    });
                    bRetHtml += retBlock(src.label || src.institution || 'Retirement', rows);
                });

                bonusPanelHtml =
                    '<div id="'+ddE(bonusBcId)+'" class="dd-bonus-card dd-pcpanel"'
                  + ' data-gi="'+bGi+'" data-is-new="'+bIsNew+'" data-payer-id="'+ddE(payer.id)+'" data-payer-name="'+ddE(bonusPayerName)+'" data-mk="'+mk+'" data-new-date="'+mk+'-15"'
                  + ' style="display:none;">'
                  + '<div class="dd-row">' + ddLbl('Bonus net pay', bonusEntry ? 'Paid ' + ddDay(bonusEntry.date) : 'Take-home')
                  + ddIn(bonusEntry ? bonusEntry.amount : '', 'class="dd-in dd-np-row" data-gidx="'+bGi+'" data-section="income" data-mk="'+mk+'" data-ts="'+(bonusEntry&&bonusEntry.ts||'')+'"'
                        + (bIsNew ? ' data-type="bonus" data-payer-name="'+ddE(bonusPayerName)+'"' : ''), 'net') + '</div>'
                  + '<div class="dd-row">' + ddLbl('Bonus gross pay')
                  + ddIn(bonusEntry && (bonusEntry.grossPay || bonusEntry.gross) || '', 'class="dd-in dd-bonus-gross-inp dd-np-row" data-gidx="'+bGi+'" data-section="income" data-mk="'+mk+'"') + '</div>'
                  + bRetHtml
                  // v3.2: a second bonus check in the same month used to be invisible (but still counted)
                  + bonusEntries.slice(1).map(x => {
                        const xi = incomeEntries.indexOf(x);
                        return '<div class="dd-entry-row dd-np-row" data-gidx="'+xi+'" data-ts="'+(x.ts||'')+'" data-section="income" data-mk="'+mk+'">'
                             + '<span class="dd-x-btn" style="display:none;"></span>'
                             + ddLbl('Another bonus', 'Paid ' + ddDay(x.date))
                             + ddIn(x.amount, '', 'net') + '</div>';
                    }).join('')
                  + '</div>';
            }

            // ── Tabs ──
            let tabsHtml = '<div class="dd-tabs" role="tablist">';
            for (let i = 0; i < nTabs; i++) {
                const pc   = paychecks[i];
                const has  = pc && pc.amount > 0;
                const date = pc ? ddDay(pc.date) : (expected && expected[i] ? ddDay(expected[i]) : '');
                tabsHtml += '<button type="button" id="dd-pctab-'+ddE(mk+'-'+payer.id+'-'+i)+'" class="dd-tab'+(i===0?' on':'')+(has?' has':'')+'" data-payer-id="'+ddE(payer.id)+'" data-tab="'+i+'"'
                          + ' onclick="ddPcTab(\''+mk+'\',\''+ddJ(payer.id)+'\','+i+')"><b>'+(i+1)+'</b>'+(date ? '<small>'+date+'</small>' : '')+'</button>';
            }
            if (bonusPayer) {
                const bHas = bonusEntries.length > 0;
                tabsHtml += '<button type="button" id="dd-pctab-'+ddE(mk+'-'+payer.id)+'-B" class="dd-tab bonus'+(bHas?' has':'')+'" data-payer-id="'+ddE(payer.id)+'" data-tab="B"'
                          + ' onclick="ddPcTabBonus(\''+mk+'\',\''+ddJ(payer.id)+'\')"><b>Bonus</b>'+(bHas ? '<small>'+ddDay(bonusEntries[0].date)+'</small>' : '')+'</button>';
            }
            tabsHtml += '</div>';

            const netSum = paychecks.reduce((s, e) => s + (e.amount || 0), 0) + bonusEntries.reduce((s, e) => s + (e.amount || 0), 0);
            const subBits = [expected ? paychecks.length + ' of ' + expected.length + ' paychecks' : paychecks.length + ' paycheck' + (paychecks.length === 1 ? '' : 's')];
            if (bonusEntries.length) subBits.push('bonus');
            if (netSum) subBits.push(ddMoneyTxt(netSum));

            allCards +=
                '<div class="dd-pay' + (startOpen ? ' open' : '') + '">'
              + '<button type="button" class="dd-payhead" onclick="ddTogglePc(\''+ddJ(outerBodyId)+'\')">'
              + '<div class="dd-lbl"><span class="dd-name">'+ddE(payer.name)+'</span><span class="dd-hint">'+subBits.join(' · ')+'</span></div>'
              + DD_ICON.chev + '</button>'
              + '<div id="'+ddE(outerBodyId)+'" class="dd-paybody" style="display:'+(startOpen?'block':'none')+';">'
              + tabsHtml
              + panelsHtml
              + bonusPanelHtml
              + '</div>'
              + '</div>';
        });

        // Dividends and tax refund: one small card each (bonus lives inside its company's card)
        const nonPayrollThis = incomeEntries.filter(e => e.date.slice(0,7) === mk && e.type !== 'payroll' && e.type !== 'bonus');
        ['dividends', 'tax_refund'].forEach(typeKey => {
            const ti          = INCOME_TYPES[typeKey] || { label: typeKey };
            const typeEntries = nonPayrollThis.filter(e => e.type === typeKey);
            typeEntries.forEach(e => shownInc.add(e));
            const cardId      = 'dd-np-'+mk+'-'+typeKey;
            const bodyId2     = cardId+'-body';
            let innerRows = '';
            typeEntries.forEach(e => {
                const gi = incomeEntries.indexOf(e);
                innerRows += '<div class="dd-entry-row dd-np-row" data-gidx="'+gi+'" data-ts="'+(e.ts||'')+'" data-section="income" data-mk="'+mk+'">'
                           + ddXBtn("ddDeleteEntry('income',"+gi+",'"+mk+"')")
                           + ddLbl(ddE(e.payerName||ti.label), ddDay(e.date))
                           + ddIn(e.amount, '') + '</div>';
            });
            innerRows += '<div class="dd-entry-row dd-new-row" data-section="income" data-mk="'+mk+'" data-payer-id="" data-payer-name="" data-type="'+typeKey+'">'
                       + ddLbl(typeEntries.length ? 'Add another' : 'Amount', '', true) + ddIn('', '') + '</div>';
            const startOpen = false;   // v3.5: collapsed, like the paycheck cards
            const total = typeEntries.reduce((s, e) => s + (e.amount || 0), 0);
            allCards += '<div id="'+cardId+'" class="dd-pay small' + (startOpen ? ' open' : '') + '">'
                      + '<button type="button" class="dd-payhead" onclick="ddTogglePc(\''+bodyId2+'\')">'
                      + '<div class="dd-lbl"><span class="dd-name">'+ti.label+'</span><span class="dd-hint">'+(total ? ddMoneyTxt(total) : 'None this month')+'</span></div>'
                      + DD_ICON.chev + '</button>'
                      + '<div id="'+bodyId2+'" class="dd-paybody" style="display:'+(startOpen?'block':'none')+';">' + innerRows + '</div>'
                      + '</div>';
        });

        // v3.3: anything this month that none of the cards above shows (a bonus with no company, a paycheck from
        // a payer set up as another kind, an old "Bonus" entry…) used to be invisible but still counted. Show it.
        const otherInc = incomeEntries.filter(e => e.date && e.date.slice(0,7) === mk && !shownInc.has(e));
        if (otherInc.length) {
            allCards += '<div class="dd-pay small open"><div class="dd-payhead static"><div class="dd-lbl"><span class="dd-name">Other income</span>'
                      + '<span class="dd-hint">Logged this month, not tied to a company above</span></div></div><div class="dd-paybody">'
                      + otherInc.map(e => {
                            const gi = incomeEntries.indexOf(e);
                            const kind = (INCOME_TYPES[e.type] || { label: e.type || 'Income' }).label;
                            return '<div class="dd-entry-row dd-np-row" data-gidx="'+gi+'" data-ts="'+(e.ts||'')+'" data-section="income" data-mk="'+mk+'">'
                                 + ddXBtn("ddDeleteEntry('income',"+gi+",'"+mk+"')")
                                 + ddLbl(ddE(e.payerName || kind), ddE(kind) + ' · ' + ddDay(e.date))
                                 + ddIn(e.amount, '') + '</div>';
                        }).join('')
                      + '</div></div>';
        }
        // Retirement contributions no paycheck on this screen claims (paycheck deleted before 3.2, a plan with no company…)
        const orphanContribs = retirementContribs.filter(c => c.date && c.date.slice(0,7) === mk && !shownRc.has(c));
        if (orphanContribs.length) {
            allCards += '<div class="dd-orphans">'
                      + '<div class="dd-orphans-t">Retirement not tied to a paycheck</div>'
                      + orphanContribs.map(c => '<div class="dd-orow">'
                          + '<span class="dd-oname">' + ddE(c.sourceName || 'Contribution') + ' · ' + ddDay(c.date) + '</span>'
                          + '<span class="dd-oamt">' + ddMoneyTxt(c.totalAmount) + '</span>'
                          + '<button type="button" class="dd-fbtn danger" onclick="ddDeleteEntry(\'retirement\',' + retirementContribs.indexOf(c) + ',\'' + mk + '\')">Remove</button></div>').join('')
                      + '<div class="dd-hint">These count toward your totals. If one belonged to a paycheck that was deleted, remove it here.</div></div>';
        }

        if (!Object.keys(payerMap).length && !otherInc.length) {
            allCards = '<div class="dd-empty">No employers set up yet. Add one in <button type="button" class="dd-link" onclick="ddOpenSetup()">Accounts</button>.</div>' + allCards;
        }

        const monthNet = incomeEntries.filter(e => e.date && e.date.slice(0,7) === mk).reduce((s, e) => s + (e.amount || 0), 0);
        ddStat.income = { n: loggedTotal, of: expectTotal };
        return ddSectionWrap('Income', '', allCards, mk, 'income', { sub: monthNet ? 'Take-home ' + ddMoneyTxt(monthNet) : 'Nothing logged yet' });
    }

    // Recent enough to suggest: logged in one of the last 3 months, or set up and never logged yet
    function ddSuggest(list, mk, match) {
        const recent = ddPrevKeys(mk, 3);
        let ever = false;
        for (const e of list) {
            if (!e || !e.date || !match(e)) continue;
            ever = true;
            if (recent.includes(e.date.slice(0, 7))) return true;
        }
        return !ever;
    }

    // EXPENSES (bills)
    function ddSectionExpenses(mk) {
        const monthExp = expenses.filter(e => e.date.slice(0,7) === mk);
        const coMatch  = (c, e) => (e.companyId != null && e.companyId !== '' && String(c.id) === String(e.companyId)) || e.companyName === c.name;
        let rows = '';
        monthExp.forEach(e => {
            const co = companies.find(c => coMatch(c, e));
            rows += ddExistingRow('expenses', mk, expenses.indexOf(e), ddE(e.companyName || 'Payment'), e.amount, ddE(e.serviceType || (co && co.serviceType) || ''));
        });
        // v3.3: suggest every open bill paid in the last 3 months (was: last month only, so a skipped month
        // dropped the bill off the list), plus bills set up but never logged yet
        let blanks = 0;
        const seen = new Set(monthExp.map(e => e.companyName));
        companies.filter(c => activeInMonth(c, mk)).forEach(c => {
            if (seen.has(c.name) || monthExp.some(e => coMatch(c, e))) return;
            if (!ddSuggest(expenses, mk, e => coMatch(c, e))) return;
            seen.add(c.name);
            const last = ddLastBefore(expenses, mk, e => coMatch(c, e));
            rows += ddBlankRow('expenses', mk, ddE(c.name),
                'data-company-name="'+ddE(c.name)+'" data-company-id="'+ddE(c.id)+'" data-service-type="'+ddE(c.serviceType||'Bill')+'"',
                last ? ddLastHint(last) : ddE(c.serviceType || 'Bill'));
            blanks++;
        });
        // Last month's bills whose company isn't set up (older data) — as before
        const prevKey = ddPrevMonthKey(mk);
        expenses.filter(e => e.date.slice(0,7) === prevKey).forEach(e => {
            if (seen.has(e.companyName)) return;
            if (companies.some(c => coMatch(c, e))) return;
            seen.add(e.companyName);
            rows += ddBlankRow('expenses', mk, ddE(e.companyName),
                'data-company-name="'+ddE(e.companyName)+'" data-company-id="'+ddE(e.companyId||'')+'" data-service-type="'+ddE(e.serviceType||'Bill')+'"',
                ddLastHint(e));
            blanks++;
        });
        const nLogged = new Set(monthExp.map(e => e.companyName)).size;
        const total = monthExp.reduce((s, e) => s + (e.amount || 0), 0);
        ddStat.expenses = { n: nLogged, of: nLogged + blanks };
        if (!rows) rows = ddEmpty('No bills yet. Tap + Add, or set bills up in Accounts.');
        return ddSectionWrap('Bills', '', '<div id="dd-expenses-rows-'+mk+'">'+rows+'</div>', mk, 'expenses',
            { sub: (blanks ? nLogged + ' of ' + (nLogged + blanks) + ' logged' : nLogged + ' logged') + (total ? ' · ' + ddMoneyTxt(total) : '') });
    }

    // DEBT balances
    function ddSectionDebt(mk) {
        const monthDebt = debtEntries.filter(e => e.date.slice(0,7) === mk);
        let rows = '';
        monthDebt.forEach(e => {
            const last = ddLastBefore(debtEntries, mk, x => String(x.accountId) === String(e.accountId));
            rows += ddExistingRow('debt', mk, debtEntries.indexOf(e), ddE(e.accountName || 'Debt'), e.amount, last ? ddLastHint(last) : '');
        });
        let blanks = 0;
        const seen = new Set(monthDebt.map(e => String(e.accountId)));
        debtAccounts.filter(a => activeInMonth(a, mk)).forEach(a => {
            if (seen.has(String(a.id))) return;
            if (!ddSuggest(debtEntries, mk, e => String(e.accountId) === String(a.id))) return;
            seen.add(String(a.id));
            const last = ddLastBefore(debtEntries, mk, e => String(e.accountId) === String(a.id));
            rows += ddBlankRow('debt', mk, ddE(a.name), 'data-account-id="'+ddE(a.id)+'"', last ? ddLastHint(last) : 'Balance owed');
            blanks++;
        });
        const nLogged = seen.size - blanks;
        const total = monthDebt.reduce((s, e) => s + (e.amount || 0), 0);
        ddStat.debt = { n: nLogged, of: nLogged + blanks };
        if (!rows) rows = ddEmpty('No debts. Tap + Add, or set them up in Accounts.');
        return ddSectionWrap('Debt', '', '<div id="dd-debt-rows-'+mk+'">'+rows+'</div>' + ddBulkCard(mk), mk, 'debt',
            { sub: (blanks ? nLogged + ' of ' + (nLogged + blanks) + ' logged' : nLogged + ' logged') + (total ? ' · ' + ddMoneyTxt(total) + ' owed' : '') });
    }

    // EXTRA DEBT PAYMENTS (beyond the monthly bill): a collapsed card at the bottom of Debt (v3.5; was its own section)
    function ddBulkCard(mk) {
        const monthBulk = bulkDebtPayments.filter(e => e.date && e.date.slice(0,7) === mk);
        let rows = '';
        monthBulk.forEach(e => {
            const gi = bulkDebtPayments.indexOf(e);
            rows += `<div class="dd-entry-row" data-gidx="${gi}" data-section="bulkdebt" data-mk="${mk}">
                ${ddXBtn(`ddBulkDebtDelete(${gi},'${mk}')`)}
                ${ddLbl(ddE(e.accountName||'Payment'), e.note ? ddE(e.note) : '')}
                ${ddIn(e.amount, '')}
            </div>`;
        });
        const open = debtAccounts.filter(a => activeInMonth(a, mk));
        if (open.length) {
            const opts = open.map(a => '<option value="'+ddE(a.id)+'">'+ddE(a.name)+'</option>').join('');
            rows += `<div class="dd-entry-row dd-new-row" data-section="bulkdebt" data-mk="${mk}">
                ${ddXBtn("this.closest('.dd-entry-row').remove()")}
                <select class="dd-sel" aria-label="Debt account">${opts}</select>
                ${ddIn('', '')}
            </div>`;
        } else if (!rows) rows = ddEmpty('No open debts.');
        const total = monthBulk.reduce((s, e) => s + (e.amount || 0), 0);
        const bodyId = 'dd-bulk-' + mk + '-body';
        const addBtn = open.length ? '<button type="button" class="dd-fbtn dd-bulk-add" onclick="ddAddRow(\'bulkdebt\',\'' + mk + '\')">+ Add payment</button>' : '';
        return '<div class="dd-pay small dd-bulk">'
             + '<button type="button" class="dd-payhead" onclick="ddTogglePc(\'' + bodyId + '\')">'
             + '<div class="dd-lbl"><span class="dd-name">Extra payments</span><span class="dd-hint">'
             + (total ? ddMoneyTxt(total) + ' extra this month' + (monthBulk.length > 1 ? ' · ' + monthBulk.length + ' payments' : '') : 'Optional · beyond the regular payment')
             + '</span></div>' + DD_ICON.chev + '</button>'
             + '<div id="' + bodyId + '" class="dd-paybody" style="display:none;">'
             + '<div id="dd-bulkdebt-rows-' + mk + '">' + rows + '</div>' + addBtn + '</div></div>';
    }

    function ddBulkDebtDelete(gi, mk) { ddDeleteEntry('bulkdebt', gi, mk); }
    // COAST CONTRIBUTIONS
    function ddSectionCoast(mk) {
        const monthCoast = coastContribs.filter(e => e.date && e.date.slice(0,7) === mk);
        let rows = '';
        monthCoast.forEach(e => {
            const gi = coastContribs.indexOf(e);
            const acctLabel = e.accountName || (coastAccounts.find(a=>a.id===e.accountId)||{}).institution || 'Contribution';
            rows += `<div class="dd-entry-row" data-gidx="${gi}" data-section="coast" data-mk="${mk}">
                ${ddXBtn(`ddCoastDelete(${gi},'${mk}')`)}
                ${ddLbl(ddE(acctLabel), e.note ? ddE(e.note) : '')}
                ${ddIn(e.amount, 'data-entry-idx="' + gi + '" data-field="amount"')}
            </div>`;
        });
        let blanks = 0;
        const seen = new Set(monthCoast.map(e => String(e.accountId)));
        coastAccounts.filter(a => activeInMonth(a, mk)).forEach(a => {
            if (seen.has(String(a.id))) return;
            if (!ddSuggest(coastContribs, mk, e => String(e.accountId) === String(a.id))) return;
            seen.add(String(a.id));
            const lbl  = a.institution || a.id;
            const last = ddLastBefore(coastContribs, mk, e => String(e.accountId) === String(a.id));
            const hint = last ? ddLastHint(last) : '';   // 3.8: monthly coast goals removed
            rows += `<div class="dd-entry-row dd-new-row" data-section="coast" data-mk="${mk}" data-account-id="${ddE(a.id)}" data-account-name="${ddE(lbl)}">
                ${ddXBtn("this.closest('.dd-entry-row').remove()")}
                ${ddLbl(ddE(lbl), hint, true)}
                ${ddIn('', '')}
            </div>`;
            blanks++;
        });
        const nLogged = monthCoast.length;
        const total = monthCoast.reduce((s, e) => s + (e.amount || 0), 0);
        ddStat.coast = { n: nLogged, of: nLogged + blanks };
        if (!rows) rows = coastAccounts.some(a => activeInMonth(a, mk)) ? ddEmpty('Nothing added this month. Tap + Add.') : ddEmpty('No coast accounts. Set one up in Accounts.');
        return ddSectionWrap('Coast savings', '', '<div id="dd-coast-rows-'+mk+'">'+rows+'</div>', mk, 'coast',
            { sub: total ? ddMoneyTxt(total) + ' added' : 'Nothing added yet' });
    }

    function ddSectionNotes(mk) {
        const note = monthNotes[mk] || '';
        ddStat.notes = { n: note ? 1 : 0, of: 1 };
        return `
        <section id="dd-wrap-notes-${mk}" data-section="notes" class="dd-sec">
            <div class="dd-head">
                <span class="su-tag">NOTE</span>
                <div class="dd-htext"><span class="dd-title">Notes</span><span class="dd-sub">What happened this month</span></div>
                <span class="dd-unsaved">Unsaved</span>
            </div>
            <div class="dd-body">
                <textarea id="dd-notes-${mk}" class="dd-ta" placeholder="Contributions, market events, job changes…">${ddE(note)}</textarea>
            </div>
            <div class="dd-foot"><button class="dd-save" onclick="ddSaveNotes('${mk}')">Save note</button></div>
            <div id="dd-notes-msg-${mk}" class="dd-msg" style="display:none;"></div>
        </section>`;
    }

    function ddSaveNotes(mk) {
        const el = document.getElementById('dd-notes-' + mk);
        if (!el) return;
        const text = el.value.trim();
        if (text) {
            monthNotes[mk] = text;
        } else {
            delete monthNotes[mk];
        }
        saveMonthNotes();
        ddDirty.delete('notes');
        const w = document.getElementById('dd-wrap-notes-' + mk); if (w) w.classList.remove('dd-dirty');
        ddStat.notes = { n: text ? 1 : 0, of: 1 };
        ddRenderChips(mk);
        const msg = document.getElementById('dd-notes-msg-' + mk);
        if (msg) { msg.textContent = text ? 'Note saved.' : 'Note cleared.'; msg.classList.remove('err'); msg.style.display = 'block'; clearTimeout(msg._t); msg._t = setTimeout(() => msg.style.display = 'none', 2000); }
    }

    function ddCoastDelete(gi, mk) { ddDeleteEntry('coast', gi, mk); }

    // INVESTMENTS
    function ddSectionAccounts(mk) {
        let rows = '', nShown = 0, nLogged = 0, total = 0;
        accounts.filter(a => a.type !== 'metals' && (activeInMonth(a, mk) || entries.some(e => e.accountId == a.id && e.date.slice(0,7) === mk))).forEach(acct => {
            const name = ddE(acct.name || acct.institution || 'Account');
            const inst = acct.institution && acct.institution !== acct.name ? ddE(acct.institution) : '';
            const latest = entries
                .filter(e => e.accountId == acct.id && e.date.slice(0,7) === mk)
                .sort((a,b) => b.date.localeCompare(a.date) || (b.ts||0) - (a.ts||0))[0];
            nShown++;
            if (latest) {
                nLogged++; total += latest.amount || 0;
                rows += ddExistingRow('accounts', mk, entries.indexOf(latest), name, latest.amount, inst);
            } else {
                const last = ddLastBefore(entries, mk, e => e.accountId == acct.id);
                rows += ddBlankRow('accounts', mk, name, 'data-account-id="'+ddE(acct.id)+'"', [inst, last ? ddLastHint(last) : ''].filter(Boolean).join(' · '));
            }
        });
        const metalsAccts = accounts.filter(a => a.type === 'metals' && activeInMonth(a, mk));
        if (metalsAccts.length > 0) {
            const thisM    = metalsData[mk] || {};
            // Fall back to latest prior month oz count if this month not yet entered
            const allKeys  = Object.keys(metalsData).sort();
            const priorKey = allKeys.filter(k => k <= mk).slice(-1)[0];
            const priorM   = priorKey ? metalsData[priorKey] : {};
            const goldOz   = thisM.gold   != null ? thisM.gold   : (priorM.gold   != null ? priorM.gold   : '');
            const silverOz = thisM.silver != null ? thisM.silver : (priorM.silver != null ? priorM.silver : '');
            const gp = thisM.goldPrice   || '';
            const sp = thisM.silverPrice || '';
            const lastGp = priorM && priorKey !== mk && priorM.goldPrice ? 'Last ' + ddMoneyTxt(priorM.goldPrice) : '';
            const lastSp = priorM && priorKey !== mk && priorM.silverPrice ? 'Last ' + ddMoneyTxt(priorM.silverPrice) : '';
            nShown++; if (gp || sp) nLogged++;
            const metalVal = (parseFloat(goldOz) || 0) * (parseFloat(gp) || 0) + (parseFloat(silverOz) || 0) * (parseFloat(sp) || 0);
            if (gp || sp) total += metalVal;
            // v3.5.1: one Investments-style row; tap it to show the oz / price fields
            const lastVal = priorM && priorKey !== mk && (priorM.goldPrice || priorM.silverPrice)
                ? (parseFloat(priorM.gold) || 0) * (parseFloat(priorM.goldPrice) || 0) + (parseFloat(priorM.silver) || 0) * (parseFloat(priorM.silverPrice) || 0) : 0;
            const ozHint = [goldOz !== '' ? 'Gold ' + goldOz + ' oz' : '', silverOz !== '' ? 'Silver ' + silverOz + ' oz' : ''].filter(Boolean).join(' · ');
            const lastHint = lastVal ? 'Last ' + ddMoneyTxt(lastVal) + ' · ' + new Date(priorKey + '-15').toLocaleString('en-US', { month: 'short' }) : '';
            const mBody = 'dd-metals-body-' + mk;
            const upd = 'oninput="ddMetalsTotal(\'' + mk + '\')"';
            rows += '<div class="dd-metals" id="dd-metals-' + mk + '">'
                  + '<div class="dd-row dd-metals-head" role="button" tabindex="0" aria-expanded="false" aria-controls="' + mBody + '" onclick="ddToggleMetals(\'' + mk + '\')" onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();ddToggleMetals(\'' + mk + '\')}">'
                  +   '<div class="dd-lbl"><span class="dd-name' + ((gp || sp) ? '' : ' muted') + '">Precious Metals ' + DD_ICON.chev + '</span><span class="dd-hint">' + (lastHint || ozHint || 'Gold & silver') + '</span></div>'
                  +   '<span class="dd-money"><span class="dd-in dd-metals-val" id="dd-metals-val-' + mk + '">' + ((gp || sp) ? ddMetalsFmt(metalVal) : '<span class="dd-metals-ph">0.00</span>') + '</span></span>'
                  + '</div>'
                  + '<div class="dd-metals-body" id="' + mBody + '" style="display:none;"><div class="dd-metals-grid">'
                  +   '<div class="dd-metal"><div class="dd-metal-t">Gold</div>'
                  +     '<label class="dd-metal-l" for="dd-gold-oz-'+mk+'">Amount</label>' + ddIn(goldOz, 'id="dd-gold-oz-'+mk+'" ' + upd, 'oz')
                  +     '<label class="dd-metal-l" for="dd-gold-price-'+mk+'">Price / oz' + (lastGp ? ' <span>' + lastGp + '</span>' : '') + '</label>' + ddIn(gp, 'id="dd-gold-price-'+mk+'" ' + upd)
                  +   '</div>'
                  +   '<div class="dd-metal"><div class="dd-metal-t">Silver</div>'
                  +     '<label class="dd-metal-l" for="dd-silver-oz-'+mk+'">Amount</label>' + ddIn(silverOz, 'id="dd-silver-oz-'+mk+'" ' + upd, 'oz')
                  +     '<label class="dd-metal-l" for="dd-silver-price-'+mk+'">Price / oz' + (lastSp ? ' <span>' + lastSp + '</span>' : '') + '</label>' + ddIn(sp, 'id="dd-silver-price-'+mk+'" ' + upd)
                  +   '</div>'
                  + '</div>'
                  + '</div></div>';
        }
        ddStat.accounts = { n: nLogged, of: nShown };
        if (!rows) rows = ddEmpty('No investment accounts. Set them up in Accounts.');
        // 4.0.3: the subtitle shows the portfolio balance for the month (every account's latest balance through mk,
        // the same number as that month's Investments snapshot), not just the sum of the accounts updated so far.
        const portfolio = LC.investTotal(accounts, entries, mk);
        return ddSectionWrap('Investments', '', '<div id="dd-accounts-rows-'+mk+'">'+rows+'</div>', mk, 'accounts',
            { sub: nLogged + ' of ' + nShown + ' updated' + (portfolio ? ' · Portfolio ' + ddMoneyTxt(portfolio) : '') });
    }

    // PRECIOUS METALS row (v3.5.1): expand/collapse + live total
    function ddMetalsFmt(n) { return (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
    function ddToggleMetals(mk) {
        const body = document.getElementById('dd-metals-body-' + mk);
        const wrap = document.getElementById('dd-metals-' + mk);
        if (!body || !wrap) return;
        const open = body.style.display === 'none';
        body.style.display = open ? 'block' : 'none';
        wrap.classList.toggle('open', open);
        const head = wrap.querySelector('.dd-metals-head'); if (head) head.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
    function ddMetalsTotal(mk) {
        const v = id => { const el = document.getElementById(id + mk); return el ? parseFloat(el.value) || 0 : 0; };
        const gp = v('dd-gold-price-'), sp = v('dd-silver-price-');
        const out = document.getElementById('dd-metals-val-' + mk);
        if (!out) return;
        out.innerHTML = (gp || sp) ? ddMetalsFmt(v('dd-gold-oz-') * gp + v('dd-silver-oz-') * sp) : '<span class="dd-metals-ph">0.00</span>';
    }

    // REAL ESTATE (3.5.3) — one row per property; fill it in the month of the borough assessment, leave it blank otherwise.
    // Saves to pf_home_values (same shape as before: { date: 'YYYY-MM', value, note, propertyId? }). No progress chip.
    function ddSectionRealEstate(mk) {
        const vals = dtGetHomeValues();
        const rows = reProps().map(p => {
            const here = vals.find(r => rePid(r) === p.id && String(r.date || '').slice(0, 7) === mk);
            const last = here ? null : reLatest(p.id, ddPrevMonthKey(mk));
            const hint = here ? 'Logged for ' + reMonLabel(mk) : (last ? 'Last ' + ddMoneyTxt(last.value) + ' · ' + reMonLabel(last.date) : 'No value yet');
            return '<div class="dd-row" data-re-prop="' + ddE(p.id) + '"' + (here ? ' data-re-has="1"' : '') + '>'
                 + ddLbl(ddE(p.name), hint, !here) + ddIn(here ? here.value : '', '') + '</div>';
        }).join('');
        const total = realEstateTotal(mk);
        return ddSectionWrap('Real Estate', '', '<div id="dd-realestate-rows-' + mk + '">' + rows + '</div>', mk, 'realestate',
            { sub: 'Once a year' + (total ? ' · ' + ddMoneyTxt(total) : ''), noAdd: true, noRemove: true });
    }
    function ddSaveRealEstate(mk) {
        const wrap = document.getElementById('dd-wrap-realestate-' + mk);
        if (!wrap) return;
        const rows = [...wrap.querySelectorAll('[data-re-prop]')];
        const num = inp => { const raw = inp.value.trim(); return raw === '' ? '' : parseFloat(raw); };
        for (const row of rows) {
            const inp = row.querySelector('input'), v = num(inp);
            if (v === '') continue;
            if (isNaN(v) || v < 0) { inp.focus(); return ddShowMsg('realestate', mk, 'Property values can’t be negative.', true); }
            if (v >= 1e9) { inp.focus(); return ddShowMsg('realestate', mk, 'That value looks like a typo.', true); }
        }
        const props = reProps(), arr = dtGetHomeValues();
        const name = pid => (props.find(p => p.id === pid) || {}).name || 'Home';
        const idxFor = pid => arr.findIndex(r => rePid(r) === pid && String(r.date || '').slice(0, 7) === mk);
        const removals = rows.filter(r => r.dataset.reHas && !(num(r.querySelector('input')) > 0)).map(r => r.dataset.reProp);
        if (removals.length && !confirm('Remove ' + removals.map(pid => name(pid) + '’s ' + reMonLabel(mk) + ' value (' + ddMoneyTxt(arr[idxFor(pid)].value) + ')').join(', ') + '?')) return;
        let changed = 0;
        rows.forEach(row => {
            const pid = row.dataset.reProp, v = num(row.querySelector('input')), i = idxFor(pid);
            if (removals.includes(pid)) { if (i >= 0) { arr.splice(i, 1); changed++; } return; }
            if (!(v > 0)) return;
            if (i >= 0) { if (arr[i].value !== v) { arr[i] = Object.assign({}, arr[i], { value: v }); changed++; } }
            else { const e = { date: mk, note: '', value: v }; if (pid !== 'home') e.propertyId = pid; arr.push(e); changed++; }
        });
        dtSaveHomeValues(arr);
        ddRefreshSection('realestate', mk);
        ddShowMsg('realestate', mk, changed ? changed + ' value' + (changed === 1 ? '' : 's') + ' saved.' : 'Saved.');
    }

    // Updates the contrib-type dropdown when source changes on a retirement new-row
    function ddRetTypeUpdate(srcSel) {
        const row = srcSel.closest('.dd-entry-row');
        const src = retirementSources.find(s => s.id === srcSel.value);
        const ts  = row && row.querySelector('.dd-ret-type-sel');
        if (!ts || !src) return;
        ts.innerHTML = (src.contribTypes || []).map(k =>
            '<option value="'+ddE(k)+'">'+ddE(CONTRIB_TYPES[k] && CONTRIB_TYPES[k].label ? CONTRIB_TYPES[k].label : k)+'</option>'
        ).join('');
    }

    // ADD ROW
    function ddAddRow(sectionId, mk) {
        const container = document.getElementById('dd-'+sectionId+'-rows-'+mk);
        if (!container) return;
        if (sectionId === 'bulkdebt') { const b = document.getElementById('dd-bulk-' + mk + '-body'); if (b && b.style.display === 'none') ddTogglePc(b.id); }
        const empty = container.querySelector('.dd-empty'); if (empty) empty.remove();
        const xBtn = ddXBtn("this.closest('.dd-entry-row').remove()");
        const open = (list, lbl) => list.filter(a => activeInMonth(a, mk)).map(a => '<option value="'+ddE(a.id)+'">'+ddE(lbl(a))+'</option>').join('');
        const row  = (attrs, sel) => '<div class="dd-entry-row dd-new-row dd-added" data-section="'+sectionId+'" data-mk="'+mk+'" '+attrs+'>' + xBtn + sel + ddIn('', '') + '</div>';
        let html = '';
        if (sectionId === 'income') {
            const payerOpts = payers.filter(p => activeInMonth(p, mk)).map(p=>'<option value="p:'+ddE(p.id)+'" data-payer-id="'+ddE(p.id)+'" data-payer-name="'+ddE(p.name)+'" data-type="'+ddE(p.defaultType||'payroll')+'">'+ddE(p.name)+'</option>').join('');
            const typeOpts  = '<option value="t:dividends" data-payer-id="" data-payer-name="Dividends" data-type="dividends">Dividends</option>'
                            + '<option value="t:tax_refund" data-payer-id="" data-payer-name="Tax Refund" data-type="tax_refund">Tax Refund</option>'
                            + '<option value="t:bonus" data-payer-id="" data-payer-name="Bonus" data-type="bonus">Bonus</option>';
            html = row('data-payer-id="" data-payer-name="" data-type="payroll"',
                   '<select class="dd-sel" onchange="ddIncSel(this)"><option value="">Payer / type…</option>' + payerOpts + (payerOpts ? '<option disabled>──────────</option>' : '') + typeOpts + '</select>');
        } else if (sectionId === 'expenses') {
            const coOpts = companies.filter(c => activeInMonth(c, mk)).map(c=>'<option value="'+ddE(c.id)+'" data-name="'+ddE(c.name)+'" data-svc="'+ddE(c.serviceType||'Bill')+'">'+ddE(c.name)+'</option>').join('');
            html = row('data-company-name="" data-service-type="Bill"', '<select class="dd-sel" aria-label="Bill" onchange="ddExpCoSel(this)"><option value="">Pick a bill…</option>' + coOpts + '</select>');
        } else if (sectionId === 'debt' || sectionId === 'bulkdebt') {
            const opts = open(debtAccounts, a => a.name);
            if (!opts) { ddShowMsg(sectionId, mk, 'No open debts. Set one up in Accounts first.', true); return; }
            html = row('', '<select class="dd-sel" aria-label="Debt">' + opts + '</select>');
        } else if (sectionId === 'accounts') {
            const opts = open(accounts.filter(a => a.type !== 'metals'), a => a.name || a.institution);
            if (!opts) { ddShowMsg(sectionId, mk, 'No investment accounts. Set one up in Accounts first.', true); return; }
            html = row('', '<select class="dd-sel" aria-label="Account">' + opts + '</select>');
        } else if (sectionId === 'coast') {
            const opts = open(coastAccounts, a => a.institution || a.id);
            if (!opts) { ddShowMsg(sectionId, mk, 'No coast accounts. Set one up in Accounts first.', true); return; }
            html = row('data-account-id="" data-account-name=""',
                   '<select class="dd-sel" aria-label="Coast account" onchange="this.closest(\'.dd-entry-row\').dataset.accountId=this.value;this.closest(\'.dd-entry-row\').dataset.accountName=this.options[this.selectedIndex].text;">' + opts + '</select>');
        } else if (sectionId === 'retirement') {
            const srcOpts = retirementSources.map(s=>'<option value="'+ddE(s.id)+'">'+ddE(s.label||s.institution)+'</option>').join('');
            const firstSrc = retirementSources[0];
            const typeOpts = firstSrc ? (firstSrc.contribTypes||[]).map(k=>'<option value="'+ddE(k)+'">'+ddE(CONTRIB_TYPES[k]?.label||k)+'</option>').join('') : '';
            html = row('', '<select class="dd-sel" onchange="ddRetTypeUpdate(this)">'+srcOpts+'</select><select class="dd-sel dd-ret-type-sel">'+typeOpts+'</select>');
        }
        const metalsRow = sectionId === 'accounts' ? container.querySelector('.dd-metals') : null;
        if (metalsRow) metalsRow.insertAdjacentHTML('beforebegin', html);
        else container.insertAdjacentHTML('beforeend', html);
        const added = metalsRow ? metalsRow.previousElementSibling : container.lastElementChild;
        const sel = added && added.querySelector('select');
        if (sel && typeof sel.focus === 'function') sel.focus();
    }

    // REMOVE TOGGLE — shows the × on each row
    function ddToggleDelete(sectionId, mk) {
        const btn  = document.getElementById('dd-delbtn-'+sectionId+'-'+mk);
        const wrap = document.getElementById('dd-wrap-'+sectionId+'-'+mk);
        if (!btn || !wrap) return;
        const on = !wrap.classList.contains('dd-rm');
        wrap.classList.toggle('dd-rm', on);
        btn.dataset.deleteMode = on ? '1' : '0';
        btn.classList.toggle('on', on);
        btn.textContent = on ? 'Done' : 'Remove';
    }

    function ddDeleteEntry(section, snapIdx, mk) {
        const obj = ddObj(section, snapIdx);
        if (!obj) return;
        const acct = section === 'accounts' ? accounts.find(a => String(a.id) === String(obj.accountId)) : null;
        const label = obj.companyName || obj.accountName || obj.payerName || obj.sourceName || (acct && (acct.name || acct.institution)) || 'entry';
        const amt = section === 'retirement' ? obj.totalAmount : obj.amount;
        if (!confirm('Remove "' + label + '"' + (typeof amt === 'number' ? ' ($' + amt.toLocaleString() + ')' : '') + '?')) return;
        ddRemove(section, obj);
        ddPersist(section);
        if (section === 'income' && obj.ts) {   // its retirement contributions go with it
            const linked = retirementContribs.filter(c => c.linkedPayTs === obj.ts || c.linkedBonusTs === obj.ts);
            if (linked.length) { linked.forEach(c => ddRemove('retirement', c)); saveRetirementContribs(); }
        }
        ddRefreshSection(ddHost(section), mk);
    }

    // ─── SAVE (v3.2 rewrite) ─────────────────────────────────
    // Rows point at entries through ddSnap (taken when their section was drawn), never at live array
    // positions, so removing, adding or re-sorting entries in the same save can't redirect an edit.
    // A paycheck and its retirement contributions are one unit: removing the paycheck removes them,
    // new contributions carry linkedPayTs / linkedBonusTs and take the paycheck's date.
    // Saving redraws only that section, right away (no delayed full redraw, no double-tap duplicates).
    function ddSave(sectionId, mk) {
        if (sectionId === 'loans') return ddSaveLoans(mk);   // v3.4: loans have their own save
        if (sectionId === 'realestate') return ddSaveRealEstate(mk);   // 3.5.3
        if (sectionId === 'debt')  return ddSaveDebt(mk);    // v3.5: balances + extra payments together
        const problem = ddCheckNewRows(sectionId, mk);
        if (problem) { ddShowMsg(sectionId, mk, problem, true); return; }
        const saved = ddSaveSection(sectionId, mk);
        ddRefreshSection(sectionId, mk);
        ddShowMsg(sectionId, mk, saved > 0 ? saved + ' entr' + (saved === 1 ? 'y' : 'ies') + ' saved.' : 'Saved.');
    }

    // v3.5: Debt balances and extra payments save together; anything cleared in either is confirmed once
    function ddClearedLabels(sectionId, mk) {
        const out = [];
        document.querySelectorAll('#dd-'+sectionId+'-rows-'+mk+' .dd-entry-row:not(.dd-new-row)').forEach(row => {
            if (!ddObj(sectionId, row.dataset.gidx)) return;
            const inputs = row.querySelectorAll('input[type="number"]');
            const inp = inputs[inputs.length - 1];
            if (!inp) return;
            const raw = inp.value.trim();
            if (raw === '' || isNaN(parseFloat(raw))) out.push(((row.querySelector('span:not(.dd-x-btn)') || {}).textContent || 'entry').replace(/\s+/g, ' ').trim());
        });
        return out;
    }
    function ddSaveDebt(mk) {
        const problem = ddCheckNewRows('debt', mk) || ddCheckNewRows('bulkdebt', mk);
        if (problem) { ddShowMsg('debt', mk, problem, true); return; }
        const asks = ddClearedLabels('debt', mk).concat(ddClearedLabels('bulkdebt', mk).map(l => l + ' (extra payment)'));
        const answer = asks.length > 0 && confirm('Remove ' + (asks.length > 1 ? 'these entries' : 'this entry') + '?\n\n' + asks.map(a => '"' + a + '"').join(', '));
        const saved = ddSaveSection('debt', mk, { answer }) + ddSaveSection('bulkdebt', mk, { answer });
        ddRefreshSection('debt', mk);
        ddShowMsg('debt', mk, saved > 0 ? saved + ' entr' + (saved === 1 ? 'y' : 'ies') + ' saved.' : 'Saved.');
    }

    // A new row with an amount but nothing picked (company, account…) used to be dropped silently
    function ddCheckNewRows(sectionId, mk) {
        // v3.3: amounts that can't be right (a stray minus sign, an extra few zeros)
        const wrap = document.getElementById('dd-wrap-' + sectionId + '-' + mk);
        for (const inp of wrap ? wrap.querySelectorAll('input[type="number"]') : []) {
            const raw = inp.value.trim(), v = parseFloat(raw);
            if (raw === '' || isNaN(v)) continue;
            const row = inp.closest('.dd-entry-row, .dd-row');
            const what = row && row.querySelector('.dd-name') ? row.querySelector('.dd-name').textContent : 'an amount';
            if (v < 0 && sectionId !== 'expenses') { inp.focus(); return '“' + what + '” is negative. Amounts here can’t be below zero.'; }
            if (Math.abs(v) >= 1e9)                { inp.focus(); return '“' + what + '” is ' + v.toLocaleString() + '. That looks like a typo.'; }
        }
        const sel = sectionId === 'income'
            ? ddFBSel('.dd-entry-row.dd-new-row[data-section="income"][data-mk="'+mk+'"]')
            : '#dd-'+sectionId+'-rows-'+mk+' .dd-new-row';
        if (sectionId === 'income') {
            for (const card of document.querySelectorAll(ddFBSel('[id^="dd-pc-'+mk+'-"][data-pc-idx], [id^="dd-bonus-'+mk+'-"]'))) {
                if (ddObj('income', card.dataset.gi)) continue;   // existing paycheck: clearing net pay means remove it
                const bonus = card.classList.contains('dd-bonus-card');
                const net = bonus ? card.querySelector('input.dd-np-row:not(.dd-bonus-gross-inp)') : card.querySelector('.dd-pc-net');
                if (net && net.value.trim() !== '' && !isNaN(parseFloat(net.value))) continue;
                const extra = [...card.querySelectorAll(bonus ? '.dd-bonus-gross-inp, input[data-type-key]' : '.dd-pc-gross, input[data-type-key]')]
                    .some(i => i.value.trim() !== '' && !isNaN(parseFloat(i.value)));
                if (extra) {
                    const which = bonus ? 'the bonus' : (card.dataset.payerName || '') + ' paycheck ' + (parseInt(card.dataset.pcIdx, 10) + 1);
                    return 'Enter the net pay for ' + which + ' too. Gross pay and retirement can’t be saved without it.';
                }
            }
        }
        for (const row of document.querySelectorAll(sel)) {
            const nums = row.querySelectorAll('input[type="number"]');
            const amt = nums.length ? nums[nums.length - 1].value.trim() : '';
            if (amt === '' || isNaN(parseFloat(amt))) continue;
            const s = row.querySelector('select');
            const preset = row.dataset.companyName || row.dataset.accountId || row.dataset.payerName || (row.dataset.type && row.dataset.type !== 'payroll');
            if (s && !s.value && !preset) {
                const what = { expenses: 'a company', income: 'a payer' }[sectionId] || 'an account';
                return 'Pick ' + what + ' for the $' + parseFloat(amt).toLocaleString() + ' row, then Save again.';
            }
        }
        return '';
    }

    function ddSaveSection(sectionId, mk, opts) {   // opts.answer: the removal question was already asked
        const dateStr = mk + '-15';
        let saved = 0;
        const removals   = [];   // { section, obj, label }  (label null = goes along with another removal)
        const typeClears = [];   // { obj, typeKey, label }
        const touched    = new Set();

        // 1. Existing rows: standard sections, coast, dividend / refund cards
        const existingSel = sectionId === 'income'
            ? ddFBSel('.dd-entry-row:not(.dd-new-row)[data-section="income"][data-mk="'+mk+'"]')
            : '#dd-'+sectionId+'-rows-'+mk+' .dd-entry-row:not(.dd-new-row)';
        document.querySelectorAll(existingSel).forEach(row => {
            const obj = ddObj(sectionId, row.dataset.gidx);
            if (!obj) return;
            const inputs = row.querySelectorAll('input[type="number"]');
            const inp = inputs[inputs.length - 1];
            if (!inp) return;
            const raw = inp.value.trim(), val = parseFloat(raw);
            if (raw === '' || isNaN(val)) {
                const label = (row.querySelector('span:not(.dd-x-btn)') || {}).textContent || 'entry';
                removals.push({ section: sectionId, obj, label: label.replace(/\s+/g, ' ').trim() });
            } else {
                if (sectionId === 'retirement') obj.totalAmount = val; else obj.amount = val;
                touched.add(sectionId); saved++;
            }
        });

        // 2. Paycheck + bonus cards: cleared net pay removes the paycheck and its contributions
        const cards = sectionId === 'income'
            ? [...document.querySelectorAll(ddFBSel('[id^="dd-pc-'+mk+'-"][data-pc-idx], [id^="dd-bonus-'+mk+'-"]'))] : [];
        const isBonusCard  = card => card.classList.contains('dd-bonus-card');
        const cardEntry    = card => ddObj('income', card.dataset.gi);
        const cardNet      = card => isBonusCard(card) ? card.querySelector('input.dd-np-row:not(.dd-bonus-gross-inp)') : card.querySelector('.dd-pc-net');
        const cardContribs = card => [...new Set([...card.querySelectorAll('input[data-type-key]')].map(i => ddObj('retirement', i.dataset.contribGi)).filter(Boolean))];
        const cardLabel    = card => (card.dataset.payerName || 'Paycheck') + (isBonusCard(card) ? '' : ' — Paycheck ' + (parseInt(card.dataset.pcIdx) + 1));
        cards.forEach(card => {
            const entry = cardEntry(card);
            if (!entry) return;
            const raw = ((cardNet(card) || {}).value || '').trim();
            if (raw === '' || isNaN(parseFloat(raw))) {
                const linked = cardContribs(card);
                removals.push({ section: 'income', obj: entry, label: cardLabel(card) + (linked.length ? ' (and its retirement contributions)' : '') });
                linked.forEach(c => removals.push({ section: 'retirement', obj: c, label: null }));
            }
        });
        // A single contribution type cleared (paycheck stays)
        cards.forEach(card => {
            const entry = cardEntry(card);
            if (entry && removals.some(r => r.obj === entry)) return;
            card.querySelectorAll('input[data-type-key]').forEach(inp => {
                const c = ddObj('retirement', inp.dataset.contribGi);
                if (!c) return;
                const k = inp.dataset.typeKey, raw = inp.value.trim();
                if ((raw === '' || isNaN(parseFloat(raw))) && c.amounts && c.amounts[k] != null && c.amounts[k] !== '') {
                    typeClears.push({ obj: c, typeKey: k, label: cardLabel(card) + ' — ' + (CONTRIB_TYPES[k] || { label: k }).label });
                }
            });
        });

        // 3. Metals prices cleared
        const metalClears = [];
        if (sectionId === 'accounts' && metalsData[mk]) {
            const gp = document.getElementById('dd-gold-price-'+mk), sp = document.getElementById('dd-silver-price-'+mk);
            if (gp && gp.value.trim() === '' && metalsData[mk].goldPrice)   metalClears.push({ key: 'goldPrice',   label: 'Gold price / oz' });
            if (sp && sp.value.trim() === '' && metalsData[mk].silverPrice) metalClears.push({ key: 'silverPrice', label: 'Silver price / oz' });
        }

        // 4. One confirmation for everything being removed
        const asks = removals.filter(r => r.label).map(r => r.label).concat(typeClears.map(t => t.label), metalClears.map(m => m.label));
        const confirmed = asks.length > 0 && (opts && 'answer' in opts ? opts.answer : confirm('Remove ' + (asks.length > 1 ? 'these entries' : 'this entry') + '?\n\n' + asks.map(a => '"' + a + '"').join(', ')));
        const pending = new Set(removals.map(r => r.obj));   // removed now, or kept as-is if declined
        const removed = new Set();
        if (confirmed) {
            typeClears.forEach(({ obj, typeKey }) => {
                if (obj.amounts) delete obj.amounts[typeKey];
                obj.totalAmount = Object.values(obj.amounts || {}).reduce((a, v) => a + (v || 0), 0);
                if (!Object.keys(obj.amounts || {}).length) removals.push({ section: 'retirement', obj, label: null });
                touched.add('retirement');
            });
            removals.slice().forEach(r => {
                if (r.section === 'income' && r.obj.ts) retirementContribs
                    .filter(c => (c.linkedPayTs === r.obj.ts || c.linkedBonusTs === r.obj.ts) && !removals.some(x => x.obj === c))
                    .forEach(c => removals.push({ section: 'retirement', obj: c, label: null }));
            });
            removals.forEach(r => { if (ddRemove(r.section, r.obj)) { removed.add(r.obj); touched.add(r.section); } });
            metalClears.forEach(m => { delete metalsData[mk][m.key]; });
            if (metalClears.length) saveMetalsData();
        }

        // 5. New rows
        const newSel = sectionId === 'income'
            ? ddFBSel('.dd-entry-row.dd-new-row[data-section="income"][data-mk="'+mk+'"]')
            : '#dd-'+sectionId+'-rows-'+mk+' .dd-new-row';
        document.querySelectorAll(newSel).forEach(row => {
            const numInputs  = row.querySelectorAll('input[type="number"]');
            const textInputs = row.querySelectorAll('input[type="text"]');
            const selects    = row.querySelectorAll('select');
            const amount     = parseFloat(numInputs[numInputs.length-1] && numInputs[numInputs.length-1].value);
            if (isNaN(amount)) return;
            if (sectionId === 'income') {
                const incType = row.dataset.type || 'payroll';
                if (incType === 'payroll') {
                    const pn = row.dataset.payerName || (textInputs[0] && textInputs[0].value.trim()) || '';
                    if (!pn) return;
                    let payer = payers.find(p => p.name.toLowerCase() === pn.toLowerCase());
                    if (!payer) { payer = { id: 'p_'+ddTs(), name: pn, defaultType: 'payroll' }; payers.push(payer); savePayers(); }
                    incomeEntries.push({ date: dateStr, amount, type: 'payroll', payerId: payer.id, payerName: payer.name, ts: ddTs() });
                } else {
                    const ti = INCOME_TYPES[incType] || { label: incType };
                    incomeEntries.push({ date: dateStr, amount, type: incType, payerId: '', payerName: ti.label || incType, ts: ddTs() });
                }
                touched.add('income'); saved++;
            } else if (sectionId === 'expenses') {
                const cn = row.dataset.companyName || (textInputs[0] && textInputs[0].value.trim()) || '';
                if (!cn) return;
                let co = companies.find(c => c.name.toLowerCase() === cn.toLowerCase());
                if (!co) { co = { id: Date.now(), name: cn, serviceType: row.dataset.serviceType || 'Bill' }; companies.push(co); saveCompanies(); }
                expenses.push({ date: dateStr, amount, companyName: co.name, companyId: co.id, serviceType: co.serviceType, ts: ddTs() });
                touched.add('expenses'); saved++;
            } else if (sectionId === 'debt') {
                const aid = (selects[0] && selects[0].value) || row.dataset.accountId;
                const acct = debtAccounts.find(a => String(a.id) === String(aid));
                if (!acct) return;
                debtEntries.push({ date: dateStr, amount, accountId: acct.id, accountName: acct.name, accountType: acct.type, ts: ddTs() });
                touched.add('debt'); saved++;
            } else if (sectionId === 'accounts') {
                const aidRaw = (selects[0] && selects[0].value) || row.dataset.accountId;
                if (!aidRaw) return;
                const acct = accounts.find(a => String(a.id) === String(aidRaw));
                entries.push({ date: dateStr, accountId: acct ? acct.id : aidRaw, amount, ts: ddTs() });
                touched.add('accounts'); saved++;
            } else if (sectionId === 'bulkdebt') {
                const aid = selects[0] && selects[0].value;
                const acct = debtAccounts.find(a => String(a.id) === String(aid));
                if (!acct) return;
                bulkDebtPayments.push({ id: 'bp_'+ddTs(), date: dateStr, amount, accountId: acct.id, accountName: acct.name, note: '', ts: ddTs() });
                touched.add('bulkdebt'); saved++;
            } else if (sectionId === 'coast') {
                if (!(amount > 0)) return;
                const selEl    = selects[0];
                const acctId   = row.dataset.accountId || (selEl ? selEl.value : '');
                if (!acctId) return;
                const acct     = coastAccounts.find(a => String(a.id) === String(acctId));
                const acctName = row.dataset.accountName || (acct ? acct.institution : (selEl ? (selEl.options[selEl.selectedIndex] || {}).text : ''));
                coastContribs.push({ id: 'cc_'+ddTs(), date: dateStr, accountId: acctId, accountName: acctName,
                                     institution: acct ? acct.institution : acctName, amount, note: '', ts: ddTs() });
                touched.add('coast'); saved++;
            }
        });

        // 6. Paycheck + bonus cards: pay, then the contributions attached to that paycheck
        cards.forEach(card => {
            const bonus = isBonusCard(card);
            let entry = cardEntry(card);
            if (entry && pending.has(entry)) return;   // removed above, or removal declined (left as it was)
            const netInp   = cardNet(card);
            const grossInp = bonus ? card.querySelector('.dd-bonus-gross-inp') : card.querySelector('.dd-pc-gross');
            const net = parseFloat(netInp && netInp.value), gross = parseFloat(grossInp && grossInp.value);
            if (entry) {
                if (!isNaN(net)) { entry.amount = net; touched.add('income'); saved++; }
                if (!isNaN(gross) && gross > 0) entry.grossPay = gross;
            } else if (!isNaN(net) && net > 0) {
                const date = card.dataset.newDate || dateStr;
                if (bonus) {
                    const bp = payers.find(p => p.name.toLowerCase() === (card.dataset.payerName || '').toLowerCase());
                    entry = { date, amount: net, type: 'bonus', payerId: bp ? bp.id : '', payerName: card.dataset.payerName || 'Bonus', ts: ddTs() };
                } else {
                    const payer = payers.find(p => String(p.id) === String(card.dataset.payerId)) || { id: card.dataset.payerId, name: card.dataset.payerName };
                    entry = { date, amount: net, type: 'payroll', payerId: payer.id, payerName: payer.name, ts: ddTs() };
                }
                if (!isNaN(gross) && gross > 0) entry.grossPay = gross;
                incomeEntries.push(entry);
                touched.add('income'); saved++;
            }
            if (!entry) return;   // no paycheck to attach contributions to
            if (!entry.ts) { entry.ts = ddTs(); touched.add('income'); }
            const made = {};      // sourceId → contribution created in this save
            card.querySelectorAll('input[data-type-key]').forEach(inp => {
                const typeKey = inp.dataset.typeKey, sourceId = inp.dataset.sourceId, val = parseFloat(inp.value);
                if (isNaN(val)) return;
                const src = retirementSources.find(s => s.id === sourceId);
                if (src && src.contribTypes && src.contribTypes.length && !src.contribTypes.includes(typeKey)) return;
                let c = ddObj('retirement', inp.dataset.contribGi);
                if (c && removed.has(c)) return;
                if (!c) c = made[sourceId];
                if (!c) {
                    if (!(val > 0) || !src) return;
                    c = { id: 'rc_' + ddTs() + '_' + (bonus ? 'b' : card.dataset.pcIdx), date: entry.date, sourceId: src.id,
                          sourceName: src.label || src.institution, amounts: {}, totalAmount: 0, ts: ddTs() };
                    retirementContribs.push(c);
                    made[sourceId] = c;
                }
                // Tie it to this paycheck from now on
                if (bonus) { if (!c.linkedBonusTs) c.linkedBonusTs = entry.ts; }
                else if (!c.linkedPayTs) c.linkedPayTs = entry.ts;   // keep its date; just tie it to this paycheck
                c.amounts = c.amounts || {};
                if (src && src.contribTypes && src.contribTypes.length) Object.keys(c.amounts).forEach(k => { if (!src.contribTypes.includes(k)) delete c.amounts[k]; });
                c.amounts[typeKey] = val;
                c.totalAmount = Object.values(c.amounts).reduce((a, b) => a + (b || 0), 0);
                touched.add('retirement'); saved++;
            });
        });

        // 7. Metals: oz + prices, and the metals balance for the month
        if (sectionId === 'accounts') {
            const gp  = parseFloat((document.getElementById('dd-gold-price-'+mk)||{}).value)   || 0;
            const sp  = parseFloat((document.getElementById('dd-silver-price-'+mk)||{}).value) || 0;
            const goz = parseFloat((document.getElementById('dd-gold-oz-'+mk)||{}).value);
            const soz = parseFloat((document.getElementById('dd-silver-oz-'+mk)||{}).value);
            if (document.getElementById('dd-gold-oz-'+mk)) {
                const mUpdate = Object.assign({}, metalsData[mk]||{});
                if (gp)          mUpdate.goldPrice   = gp;
                if (sp)          mUpdate.silverPrice = sp;
                if (!isNaN(goz)) mUpdate.gold        = goz;
                if (!isNaN(soz)) mUpdate.silver      = soz;
                metalsData[mk] = mUpdate;
                saveMetalsData();
                const metalsAccts = accounts.filter(a => a.type === 'metals' && activeInMonth(a, mk));
                if (metalsAccts.length > 0 && (gp > 0 || sp > 0)) {
                    const metalVal = ((!isNaN(goz) ? goz : (mUpdate.gold || 0)) * gp) + ((!isNaN(soz) ? soz : (mUpdate.silver || 0)) * sp);
                    metalsAccts.forEach(acct => {
                        const exist = entries.find(e => String(e.accountId) === String(acct.id) && e.date.slice(0,7) === mk);
                        if (exist) exist.amount = metalVal;
                        else entries.push({ date: mk + '-01', amount: metalVal, accountId: acct.id, accountName: acct.name, accountType: 'metals', institution: acct.institution || '', ts: ddTs() });
                    });
                    touched.add('accounts');
                }
            }
        }

        // 8. Sort once, then persist what changed
        const byDate = (a, b) => (a.date || '').localeCompare(b.date || '');
        if (touched.has('income'))     { incomeEntries.sort(byDate);      saveIncomeEntries(); }
        if (touched.has('retirement')) { retirementContribs.sort(byDate); saveRetirementContribs(); }
        if (touched.has('expenses'))   { expenses.sort(byDate);           saveExpenses(); }
        if (touched.has('debt'))       { debtEntries.sort(byDate);        saveDebtEntries(); }
        if (touched.has('bulkdebt'))   { bulkDebtPayments.sort(byDate);   saveBulkDebtPayments(); }
        if (touched.has('accounts'))   { entries.sort(byDate);            saveEntries(); }
        if (touched.has('coast'))      { coastContribs.sort(byDate);      saveCoastContribs(); }
        return saved;
    }

    function ddPrevMonthKey(mk) {
        const parts = mk.split('-').map(Number);
        const prev = new Date(parts[0], parts[1]-2, 1);
        return prev.getFullYear()+'-'+String(prev.getMonth()+1).padStart(2,'0');
    }

    function openCalculator(type) {
        // Navigate in next frame so menu is gone before page appears
        requestAnimationFrame(() => {
            switch(type) {
                case 'compound':
                    navigate('calculator', false, false);
                    requestAnimationFrame(() => { seedCompoundCalc(); runCompoundCalc(); });
                    break;
                case 'budget':   navigate('budget',     false, false); break;
            }
        });
    }

    // Click outside to close
    document.querySelectorAll('.modal').forEach(m => {
        m.addEventListener('click', e => { if (e.target === m) m.classList.remove('open'); });
    });

