// Sommerville Ledger 4 — loans.js
// Loans: money you have lent (v3.4)
// Part of index.html (3.5.2 split). Plain script, loaded in order; all files share one global scope.
    // ══════════════════════════════════════════════════════════════
    // LOANS (v3.4) — money you've lent (e.g. college loans to family)
    // loanPeople: [{ id, name, status: 'deferred'|'repaying', rates: [{ from: 'YYYY-MM', rate: 3.5 }] }]
    // loanEvents: [{ id, personId, date: 'YYYY-MM-DD', type: 'lend'|'payment', amount, note, ts }]
    // One rate per person, changed going forward with a dated mark: every loan to that person
    // grows at the rate in force that month. Interest is added at the end of each month
    // (monthly compounding, rounded to the cent), starting the month after each loan.
    // Payments go to the oldest loan first, interest before principal.
    // Counts in net worth (getLoansOwed), never in investments or retirement math.
    // ══════════════════════════════════════════════════════════════
    let loanPeople = [];
    let loanEvents = [];
    function saveLoanPeople() { localStorage.setItem('pf_loanPeople', encrypt(loanPeople)); }
    function saveLoanEvents() { localStorage.setItem('pf_loanEvents', encrypt(loanEvents)); }
    function loadLoans() {
        try { loanPeople = decrypt(localStorage.getItem('pf_loanPeople')) || []; } catch (e) { loanPeople = []; }
        try { loanEvents = decrypt(localStorage.getItem('pf_loanEvents')) || []; } catch (e) { loanEvents = []; }
        if (!Array.isArray(loanPeople)) loanPeople = [];
        if (!Array.isArray(loanEvents)) loanEvents = [];
    }

    const lnR2 = n => Math.round((n || 0) * 100) / 100;
    function lnNextMk(mk) { const [y, m] = mk.split('-').map(Number); const d = new Date(y, m, 1); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); }
    function lnNowMk() { return moKey(new Date()); }
    function lnMonthName(mk, long) {
        const [y, m] = String(mk || '').split('-').map(Number);
        return (y && m) ? new Date(y, m - 1, 1).toLocaleDateString('en-US', long ? { month: 'long', year: 'numeric' } : { month: 'short', year: 'numeric' }) : '';
    }
    // 3.7: the loan math lives in js/ledger-core.js (LC), shared with the desktop
    function lnRateAt(p, mk) { return LC.loanRateAt(p, mk); }   // rate (%) in force for person p in month mk
    function lnEventsFor(pid) { return LC.loanEventsFor(loanEvents, pid); }

    // Run a person's loans month by month through `throughMk` (default: this month). Returns each loan (tranche),
    // one row per month (months[]) and the totals. Math: LC.loanCalc in ledger-core.js.
    function loanCalc(p, throughMk) { return LC.loanCalc(p, loanEvents, throughMk || lnNowMk()); }
    // Everything owed to you at the end of month mk (default this month) — counts in net worth
    function getLoansOwed(mk) { return LC.loansOwed(loanPeople, loanEvents, mk || lnNowMk()); }
    // Level monthly payment to clear `owed` in n months at rate%
    function lnPayment(owed, rate, n) {
        const r = rate / 1200;
        if (owed <= 0) return 0;
        return r ? owed * r / (1 - Math.pow(1 + r, -n)) : owed / n;
    }

    // ── Loans page (#loansPage) ──
    function openLoans() { navigate('loans'); }

    // ── Loans page (3.5.4): header, All / per-person buttons, chart, one box per person ──
    // Lending and payments are logged on the Data page; people and rates are set up in Accounts.
    let lnPageView = 'total';
    function setLnView(btn) { lnPageView = btn.getAttribute('data-lnview'); updateLoansPage(); }
    function lnColors() {
        const isSunset = document.body.classList.contains('sunset-theme');
        return { isSunset, cardBg: isSunset ? 'rgba(35,8,4,0.7)' : '#1A2A42', border: isSunset ? '#5A2018' : '#2A3A52',
                 txt: isSunset ? '#F0D0A0' : '#C8D0DC', sub: isSunset ? '#C09070' : '#8A9AB0', accent: isSunset ? '#F5C030' : '#D4AF37',
                 pos: '#4CAF50', neg: '#EF5350' };
    }
    function updateLoansPage() {
        const nowMk = lnNowMk(), C = lnColors();
        if (lnPageView !== 'total' && !loanPeople.some(p => String(p.id) === lnPageView)) lnPageView = 'total';
        const view = lnPageView === 'total' ? loanPeople : loanPeople.filter(p => String(p.id) === lnPageView);
        const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
        set('lnPageTotal', fmt(lnR2(view.reduce((s, p) => s + loanCalc(p, nowMk).owed, 0))));
        set('lnPageLabel', lnPageView === 'total' ? 'Owed to You' : view[0].name + ' — Owes You');
        const ctrl = document.getElementById('lnChartControls');
        if (ctrl) ctrl.innerHTML = loanPeople.length ? '<button data-lnview="total"' + (lnPageView === 'total' ? ' class="active"' : '') + ' onclick="setLnView(this)">All</button>'
            + loanPeople.map(p => '<button data-lnview="' + ddE(p.id) + '"' + (lnPageView === String(p.id) ? ' class="active"' : '') + ' onclick="setLnView(this)">' + ddE(p.name) + '</button>').join('') : '';
        // Old "Loan receivable" investment account still around → counted twice
        const old = accounts.filter(a => a.type === 'receivable');
        const warn = document.getElementById('lnWarn');
        if (warn) warn.innerHTML = old.length && loanPeople.length ? `<div style="background:${C.cardBg};border:1px solid ${C.neg};border-radius:12px;padding:12px 14px;margin-bottom:12px;font-size:12px;color:${C.txt};">
            ${old.map(a => '“' + ddE(a.name || a.institution) + '”').join(', ')} is still set up as an investment account, so it’s counted twice.
            <button class="u-btn-clear" style="display:inline;width:auto;padding:0;color:${C.accent};text-decoration:underline;font-size:12px;" onclick="lnRetireOld()">Remove the old account</button></div>` : '';
        buildLoansChart(view);
        const list = document.getElementById('lnPersonList');
        if (!list) return;
        if (!loanPeople.length) { list.innerHTML = `<div style="color:${C.sub};font-size:13px;text-align:center;padding:16px;">No loans yet. Add one in Data → Accounts → + Add → Loan.</div>`; return; }
        list.innerHTML = loanPeople.map(p => {
            const c = loanCalc(p, nowMk), rate = lnRateAt(p, nowMk), repaying = p.status === 'repaying';
            const line = (l, r, clr) => `<div style="display:flex;justify-content:space-between;font-size:12px;color:${clr || C.txt};padding:2px 0;"><span>${l}</span><span>${r}</span></div>`;
            const subHead = t => `<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:${C.sub};margin:10px 0 4px;">${t}</div>`;
            const est = c.owed > 0 ? [60, 120].map(n => ddMoneyTxt(Math.ceil(lnPayment(c.owed, rate, n))) + '/mo over ' + (n / 12) + ' yrs').join(' · ') : '';
            // One revolving balance (3.5.4): the box holds the summary; months are in Monthly Snapshots below
            const intPaid = lnIntPaid(c);
            const rs = (p.rates || []).slice().sort((a, b) => a.from.localeCompare(b.from));
            const body =
                  line('Lent', ddMoneyTxt(c.lent)) + line('Interest added', '+' + ddMoneyTxt(c.interest), C.pos)
                + line('Paid back', (c.paid ? '−' : '') + ddMoneyTxt(c.paid) + (c.paid ? ` <span style="font-size:11px;color:${C.sub};">(${ddMoneyTxt(intPaid)} interest)</span>` : ''))
                + line('Rate', rate + '% · added monthly' + (rs.length > 1 ? ` <span style="font-size:11px;color:${C.sub};">(since ${ddE(lnMonthName(rs.filter(r => r.from <= nowMk).slice(-1)[0].from))})</span>` : ''))
                + line('First lent', ddE(lnMonthName(c.months.length ? c.months[0].mk : nowMk, true)))
                + (est ? `<div style="font-size:11px;color:${C.sub};margin-top:8px;line-height:1.4;">${repaying ? 'To pay it off' : 'Once he starts repaying'}: ${est}</div>` : '')
                + (c.overpaid > 0 ? `<div style="font-size:11px;color:${C.neg};margin-top:6px;">Payments are ${ddMoneyTxt(c.overpaid)} more than he owed.</div>` : '');
            return `
            <div style="background:${C.cardBg};border:1px solid ${C.border};border-radius:12px;margin-bottom:8px;overflow:hidden;">
                <button onclick="snapToggle('ln','${ddJ(p.id)}')" class="u-btn-clear" style="padding:12px 14px;">
                    <div class="u-flex-between" style="align-items:center;gap:10px;">
                        <div style="text-align:left;min-width:0;">
                            <div style="font-size:14px;font-weight:700;color:${C.txt};">${ddE(p.name)}</div>
                            <div style="font-size:11px;color:${C.sub};">${repaying ? 'Repaying' : 'Deferred'} · ${rate}%</div>
                        </div>
                        <div style="font-size:16px;font-weight:800;color:${C.accent};white-space:nowrap;">${ddMoneyTxt(c.owed)}</div>
                    </div>
                </button>
                <div id="ln-snap-${ddE(p.id)}" style="display:none;padding:0 14px 12px;">
                    <div style="border-top:1px solid ${C.border};padding-top:8px;">${body}</div>
                </div>
            </div>`;
        }).join('');
        renderLoanSnapshots(view);
    }
    // Payment split like a bank loan: interest owed so far first, then principal (display only; the balance is the same)
    function lnSplitRows(c) {
        let bal = 0, unpaid = 0;
        return c.months.map(r => {
            bal = lnR2(bal + r.lent + r.interest - r.paid);
            unpaid = lnR2(unpaid + r.interest);
            const toInt = lnR2(Math.min(r.paid, unpaid)); unpaid = lnR2(unpaid - toInt);
            return Object.assign({}, r, { bal, toInt, toPrin: lnR2(r.paid - toInt) });
        });
    }
    function lnIntPaid(c) { return lnR2(lnSplitRows(c).reduce((s, r) => s + r.toInt, 0)); }
    // Monthly Snapshots, like Net Worth: one card per month (newest first), the change on the right, what happened inside
    function renderLoanSnapshots(view) {
        const box = document.getElementById('lnSnapshotList');
        if (!box) return;
        const C = lnColors(), nowMk = lnNowMk();
        const per = view.map(p => {
            const c = loanCalc(p, nowMk);
            const rs = (p.rates || []).slice().sort((a, b) => a.from.localeCompare(b.from));
            return { p, rows: new Map(lnSplitRows(c).map(r => [r.mk, r])), rateFrom: new Map(rs.slice(1).map(r => [r.from, r.rate])) };
        });
        const months = [...new Set(per.flatMap(x => [...x.rows.keys()]))].sort().reverse();
        if (!months.length) { box.innerHTML = ''; return; }
        const line = (l, r, clr) => `<div style="display:flex;justify-content:space-between;font-size:11px;color:${clr || C.sub};padding:1px 0;"><span>${l}</span><span>${r}</span></div>`;
        let html = snapHead(C.sub);
        months.forEach(mk => {
            let delta = 0, bal = 0, inner = '';
            per.forEach(({ p, rows, rateFrom }) => {
                const r = rows.get(mk);
                if (!r) return;
                delta = lnR2(delta + r.lent + r.interest - r.paid); bal = lnR2(bal + r.bal);
                let lines = '';
                if (r.lent)     lines += line('Lent', '+' + ddMoneyTxt(r.lent), C.txt);
                if (r.paid)     lines += line('Payment received', '−' + ddMoneyTxt(r.paid), C.txt)
                                       + line('&nbsp;&nbsp;interest · principal', ddMoneyTxt(r.toInt) + ' · ' + ddMoneyTxt(r.toPrin));
                if (r.interest) lines += line('Interest added', '+' + ddMoneyTxt(r.interest), C.pos);
                if (rateFrom.has(mk)) lines += line('Rate changed', rateFrom.get(mk) + '%', C.accent);
                if (!lines) lines = line('No activity', '');
                inner += (view.length > 1 ? `<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:${C.sub};margin:6px 0 2px;">${ddE(p.name)}</div>` : '') + lines;
            });
            inner += `<div style="display:flex;justify-content:space-between;font-size:12px;font-weight:700;color:${C.accent};border-top:1px solid ${C.border};margin-top:4px;padding-top:4px;"><span>Balance</span><span>${ddMoneyTxt(bal)}</span></div>`;
            const right = delta ? `<span style="font-size:14px;font-weight:700;color:${delta > 0 ? C.pos : C.neg};">${delta > 0 ? '+' : '−'}${ddMoneyTxt(Math.abs(delta))}</span>`
                                : `<span style="font-size:12px;color:${C.sub};">—</span>`;
            html += snapCard('lnm', mk, C.cardBg, C.border, C.txt, lnMonthName(mk, true), right, inner, 10);
        });
        box.innerHTML = html;
    }
    let lnChartInst = null;
    function buildLoansChart(view) {
        const canvas = document.getElementById('lnChart');
        if (!canvas) return;
        if (lnChartInst) { lnChartInst.destroy(); lnChartInst = null; }
        const firsts = view.map(p => lnEventsFor(p.id)[0]).filter(Boolean).map(e => e.date.slice(0, 7)).sort();
        if (!firsts.length) return;
        const nowMk = lnNowMk(), months = [];
        for (let mk = firsts[0]; mk <= nowMk && months.length < 600; mk = lnNextMk(mk)) months.push(mk);
        const scale = demoMode ? 0.01 : 1;
        const data = months.map(mk => Math.round(view.reduce((s, p) => s + loanCalc(p, mk).owed, 0) * scale));   // owed at the end of each month
        const C = lnColors(), tick = '#C0C0C0', grid = '#5A6F83';
        const labels = months.map(mk => { const d = new Date(mk + '-02'); return d.toLocaleDateString('en-US', { month: 'short' }) + " '" + String(d.getFullYear()).slice(-2); });
        const fmtTick = v => v >= 1e3 ? '$' + Math.round(v / 1e3) + 'k' : '$' + Math.round(v);
        lnChartInst = new Chart(canvas.getContext('2d'), {
            type: 'line',
            data: { labels, datasets: [{ label: 'Owed', data, borderColor: C.accent, backgroundColor: C.isSunset ? 'rgba(245,192,48,0.12)' : 'rgba(212,175,55,0.15)',
                tension: 0.3, fill: true, pointRadius: data.length > 24 ? 0 : 3, pointBackgroundColor: C.accent, borderWidth: 2.5 }] },
            options: { responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ' $' + Number(c.raw).toLocaleString() } } },
                scales: { x: { ticks: { autoSkip: true, maxTicksLimit: 12, color: tick }, grid: { color: grid } },
                          y: { beginAtZero: true, ticks: { callback: fmtTick, color: tick }, grid: { color: grid } } } }
        });
    }

    // Old-style "Loan receivable" investment accounts: remove once the loans live here
    function lnRetireOld() {
        const old = accounts.filter(a => a.type === 'receivable');
        if (!old.length) return;
        const n = entries.filter(e => old.some(a => String(a.id) === String(e.accountId))).length;
        if (!confirm('Remove ' + old.map(a => '“' + (a.name || a.institution) + '”').join(', ') + ' from Investments, with its ' + n + ' logged balance' + (n === 1 ? '' : 's') + '?\n\nThe loans on this page replace it. This can’t be undone (a backup export first is a good idea).')) return;
        const ids = new Set(old.map(a => String(a.id)));
        entries = entries.filter(e => !ids.has(String(e.accountId)));
        accounts = accounts.filter(a => !ids.has(String(a.id)));
        saveEntries(); saveAccounts();
        if (typeof refreshAll === 'function') { try { refreshAll(); } catch (e) {} }
        updateLoansPage();
    }
    function lnNum(s) { const v = parseFloat(String(s == null ? '' : s).replace(/[$,%\s]/g, '')); return isNaN(v) ? null : v; }
    function lnValidMk(mk) { return /^\d{4}-(0[1-9]|1[0-2])$/.test(mk || ''); }
    // Keep the starting rate at (or before) the first loan so every month has a rate
    function lnFixFirstRate(p) {
        const first = lnEventsFor(p.id)[0];
        if (!first || !p.rates || !p.rates.length) return;
        const rs = p.rates.slice().sort((a, b) => a.from.localeCompare(b.from));
        if (rs[0].from > first.date.slice(0, 7)) rs[0].from = first.date.slice(0, 7);
    }

    function ddSectionLoans(mk) {
        if (!loanPeople.length) { ddStat.loans = { n: 0, of: 0 }; return ''; }
        let html = '', due = 0, got = 0;
        loanPeople.forEach(p => {
            const c = loanCalc(p, mk);
            const row = c.months.find(r => r.mk === mk) || { interest: 0 };
            const evs = lnEventsFor(p.id).filter(e => e.date.slice(0, 7) === mk);
            const repaying = p.status === 'repaying';
            if (repaying) { due++; if (evs.some(e => e.type === 'payment')) got++; }
            let rows = evs.map(e => `<div class="dd-entry-row" data-loan-ev="${ddE(e.id)}">
                    ${ddXBtn(`ddLoanDelete('${ddJ(e.id)}','${mk}')`)}
                    ${ddLbl(e.type === 'lend' ? 'Lent' : 'Payment received', e.note ? ddE(e.note) : '')}
                    ${ddIn(e.amount, '')}</div>`).join('');
            rows += `<div class="dd-entry-row dd-new-row" data-loan-new="lend" data-person="${ddE(p.id)}">${ddLbl(evs.some(e => e.type === 'lend') ? 'Lent more' : 'Lent this month', 'Starts earning next month', true)}${ddIn('', '')}</div>`;
            rows += `<div class="dd-entry-row dd-new-row" data-loan-new="payment" data-person="${ddE(p.id)}">${ddLbl('Payment received', repaying ? 'Covers interest first' : 'None expected yet', true)}${ddIn('', '')}</div>`;
            html += `<div class="dd-pay open"><div class="dd-payhead static"><div class="dd-lbl"><span class="dd-name">${ddE(p.name)}</span>
                    <span class="dd-hint">Owes ${ddMoneyTxt(c.owed)} after ${ddE(ddMon(mk))} · ${lnRateAt(p, mk)}%${row.interest ? ' · +' + ddMoneyTxt(row.interest) + ' interest' : ''}</span></div></div>
                    <div class="dd-paybody">${rows}</div></div>`;
        });
        ddStat.loans = { n: got, of: due };
        const owed = getLoansOwed(mk);
        return ddSectionWrap('Loans', '', '<div id="dd-loans-rows-' + mk + '">' + html + '</div>', mk, 'loans',
            { sub: 'Owed to you ' + ddMoneyTxt(owed), noAdd: true });
    }
    function ddLoanDelete(evId, mk) {
        const e = loanEvents.find(x => String(x.id) === String(evId));
        if (!e || !confirm('Remove this ' + (e.type === 'lend' ? 'loan' : 'payment') + ' of ' + ddMoneyTxt(e.amount) + '?')) return;
        loanEvents = loanEvents.filter(x => x !== e); saveLoanEvents();
        ddRefreshSection('loans', mk);
    }
    function ddSaveLoans(mk) {
        const wrap = document.getElementById('dd-wrap-loans-' + mk);
        if (!wrap) return;
        const num = inp => { const raw = inp.value.trim(); return raw === '' ? '' : parseFloat(raw); };
        // Check first
        for (const inp of wrap.querySelectorAll('input[type="number"]')) {
            const v = num(inp);
            if (v === '' ) continue;
            if (isNaN(v) || v < 0) { inp.focus(); return ddShowMsg('loans', mk, 'Loan amounts can’t be negative.', true); }
            if (v >= 1e7) { inp.focus(); return ddShowMsg('loans', mk, 'That amount looks like a typo.', true); }
        }
        const removals = [], edits = [];
        wrap.querySelectorAll('[data-loan-ev]').forEach(row => {
            const e = loanEvents.find(x => String(x.id) === row.dataset.loanEv); if (!e) return;
            const v = num(row.querySelector('input'));
            if (v === '' || v === 0) removals.push(e); else if (v !== e.amount) edits.push([e, v]);
        });
        if (removals.length && !confirm('Remove ' + removals.map(e => '“' + (e.type === 'lend' ? 'Lent' : 'Payment') + ' ' + ddMoneyTxt(e.amount) + '”').join(', ') + '?')) return;
        let saved = 0;
        edits.forEach(([e, v]) => { e.amount = v; saved++; });
        if (removals.length) loanEvents = loanEvents.filter(e => !removals.includes(e));
        wrap.querySelectorAll('[data-loan-new]').forEach(row => {
            const v = num(row.querySelector('input'));
            if (v === '' || !(v > 0)) return;
            const p = loanPeople.find(x => String(x.id) === row.dataset.person); if (!p) return;
            loanEvents.push({ id: suNewId('le_'), personId: p.id, date: mk + '-15', type: row.dataset.loanNew, amount: v, note: '', ts: ddTs() });
            lnFixFirstRate(p);
            saved++;
        });
        saveLoanEvents(); saveLoanPeople();
        ddRefreshSection('loans', mk);
        ddShowMsg('loans', mk, saved || removals.length ? (saved + removals.length) + ' change' + (saved + removals.length === 1 ? '' : 's') + ' saved.' : 'Saved.');
    }

