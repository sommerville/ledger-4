// Sommerville Ledger 4 — ledger-core.js (3.7; batch 2 in 3.7.1, batch 3 in 3.7.2)
// THE shared money math. Loaded by both apps: the phone (index.html, first script, cached by sw.js)
// and the desktop planner (desktop.html). One copy of each formula, so the two can't drift.
//
// Rules for this file:
//  - Pure functions only: no DOM, no localStorage, no globals from either app. Data comes in as arguments.
//  - Every "as of" is an explicit month key 'YYYY-MM' passed by the caller:
//      phone   → this month (today)          desktop → the backup's export month
//  - Change a formula here only with the golden numbers (tests/golden/run.py) before and after,
//    and update tests/golden/EXPECTED.md + expected.json by hand first if a number is meant to change.
//  - Everything lives on one global, LC, so nothing collides with names in the two apps.
//
// Batch 1 (3.7): months, latest balance, investments, debt, loans owed to you, real estate.
// Batch 2 (3.7.1): last-12-month window, spending, mortgage, savings, take-home, savings rate, FIRE targets,
//                 projected dates, break-even pay.
// Batch 3 (3.7.2): mortgage balance, principal paid per month and payment (mortgageInfo).
var LC = (function () {
    'use strict';

    // ─── Months ──────────────────────────────────────────────
    // Local time, never toISOString() (UTC shifts the month for Alaska)
    function monthKey(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); }
    function addMonths(mk, n) { const [y, m] = mk.split('-').map(Number); return monthKey(new Date(y, m - 1 + n, 1)); }
    const r2 = n => Math.round((n || 0) * 100) / 100;   // cents

    // ─── Latest balance ──────────────────────────────────────
    // The entry with the latest date for one account, on or before `upto` (a month 'YYYY-MM', a day 'YYYY-MM-DD',
    // or null = no limit).
    // Ties on the same date: the one later in the list wins (it was logged later).
    // Never depends on the list being sorted (3.7: some phone screens used to take the last entry in the list).
    function latestEntry(list, accountId, upto) {
        let best = null;
        for (const e of list) {
            if (!e || e.accountId !== accountId || !e.date) continue;
            if (upto && e.date.slice(0, upto.length) > upto) continue;
            if (!best || e.date >= best.date) best = e;
        }
        return best;
    }
    function balance(list, accountId, upto) { const e = latestEntry(list, accountId, upto); return e ? (e.amount || 0) : 0; }
    // Sum of each account's latest balance (optional filter on the account)
    function total(accts, list, upto, filter) {
        return (accts || []).filter(filter || (() => true)).reduce((s, a) => s + balance(list, a.id, upto), 0);
    }

    // ─── Investments and debt ────────────────────────────────
    // Investments count every entry through `upto` (null = all, even this month's).
    function investTotal(accounts, entries, upto, filter) { return total(accounts, entries, upto, filter); }
    function taxableTotal(accounts, entries, upto) { return total(accounts, entries, upto, a => a.type === 'taxable'); }
    // Debt as of a month is capped at the month BEFORE it, so a new month with no entries yet doesn't drop debt to $0.
    function debtCap(asOfMk) { return addMonths(asOfMk, -1); }
    function debtTotal(debtAccounts, debtEntries, asOfMk) { return total(debtAccounts, debtEntries, debtCap(asOfMk)); }
    // Debt through a month itself, no cap (charts and monthly snapshots, one point per month)
    function debtThrough(debtAccounts, debtEntries, mk) { return total(debtAccounts, debtEntries, mk); }

    // ─── Loans owed to you (3.4) ─────────────────────────────
    // One rate per person with dated marks (rates: [{ from: 'YYYY-MM', rate }]); every loan to that person grows at the
    // rate in force that month. Interest is added each month, rounded to the cent, starting the month after each loan.
    // Payments go to the oldest loan first, interest before principal. Net worth only: never investments, FIRE or the plan.
    function loanRateAt(p, mk) {
        const rs = ((p && p.rates) || []).slice().sort((a, b) => a.from.localeCompare(b.from));
        if (!rs.length) return 0;
        let r = rs[0].rate;
        rs.forEach(x => { if (x.from <= mk) r = x.rate; });
        return r;
    }
    function loanEventsFor(events, personId) {
        return (events || []).filter(e => String(e.personId) === String(personId) && e.date && e.amount > 0)
            .sort((a, b) => a.date.localeCompare(b.date) || (a.ts || 0) - (b.ts || 0));
    }
    // Runs one person's loans month by month through `throughMk`. Returns each loan (tranche), one row per month, and totals.
    function loanCalc(p, events, throughMk) {
        const evs = loanEventsFor(events, p.id);
        const out = { tranches: [], lent: 0, interest: 0, paid: 0, owed: 0, overpaid: 0, months: [] };
        if (!evs.length) return out;
        let mk = evs[0].date.slice(0, 7), guard = 0;
        while (mk <= throughMk && guard++ < 1200) {
            const row = { mk, interest: 0, lent: 0, paid: 0, rate: loanRateAt(p, mk) };
            // 1. Interest on everything lent before this month
            out.tranches.forEach(t => {
                const bal = t.lent + t.interest - t.paid;
                if (bal <= 0 || t.mk >= mk) return;
                const i = r2(bal * row.rate / 1200);
                t.interest = r2(t.interest + i); row.interest = r2(row.interest + i);
            });
            // 2. New loans this month
            evs.filter(e => e.type === 'lend' && e.date.slice(0, 7) === mk).forEach(e => {
                out.tranches.push({ id: e.id, mk, date: e.date, note: e.note || '', lent: e.amount, interest: 0, paid: 0 });
                row.lent = r2(row.lent + e.amount);
            });
            // 3. Payments this month: oldest loan first (its interest, then principal)
            evs.filter(e => e.type === 'payment' && e.date.slice(0, 7) === mk).forEach(e => {
                let left = e.amount;
                row.paid = r2(row.paid + e.amount);
                for (const t of out.tranches) {
                    const bal = r2(t.lent + t.interest - t.paid);
                    if (bal <= 0 || left <= 0) continue;
                    const take = Math.min(bal, left);
                    t.paid = r2(t.paid + take); left = r2(left - take);
                }
                if (left > 0) out.overpaid = r2(out.overpaid + left);
            });
            out.months.push(row);
            mk = addMonths(mk, 1);
        }
        out.tranches.forEach(t => { t.owed = r2(t.lent + t.interest - t.paid); out.lent += t.lent; out.interest += t.interest; out.paid += t.paid; });
        out.lent = r2(out.lent); out.interest = r2(out.interest); out.paid = r2(out.paid + out.overpaid);
        out.owed = r2(out.tranches.reduce((s, t) => s + t.owed, 0));
        return out;
    }
    // Everything owed to you at the end of month mk
    function loansOwed(people, events, mk) { return r2((people || []).reduce((s, p) => s + loanCalc(p, events, mk).owed, 0)); }

    // ─── Real estate (3.5) ───────────────────────────────────
    // properties: [{ id, name }] ('home' always exists); values: [{ date: 'YYYY-MM', value, propertyId? }] — no propertyId = 'home'.
    // Each property counts at its latest value through `upto` (null = the latest ever). Net worth only.
    const propId = v => v.propertyId || 'home';
    function propertyValue(values, pid, upto) {
        let best = null;
        for (const v of values || []) {
            if (!v || propId(v) !== pid || !v.date) continue;
            if (upto && v.date.slice(0, 7) > upto) continue;
            if (!best || v.date >= best.date) best = v;
        }
        return best;
    }
    function realEstateItems(properties, values, upto) {
        return (properties || []).map(p => ({ p, e: propertyValue(values, p.id, upto) })).filter(x => x.e && x.e.value > 0);
    }
    function realEstate(properties, values, upto) { return realEstateItems(properties, values, upto).reduce((s, x) => s + (x.e.value || 0), 0); }

    // ─── Net worth ───────────────────────────────────────────
    // d = { accounts, entries, debtAccounts, debtEntries, loanPeople, loanEvents, properties, homeValues }
    // Liquid = investments (all entries) − debt (capped at last month) + loans owed (through this month).
    // Net worth = liquid + real estate (each property's latest value).
    function netWorth(d, asOfMk) {
        const invest = investTotal(d.accounts, d.entries, null);
        const debt = debtTotal(d.debtAccounts, d.debtEntries, asOfMk);
        const loans = loansOwed(d.loanPeople, d.loanEvents, asOfMk);
        const home = realEstate(d.properties, d.homeValues, null);
        const liquid = invest - debt + loans;
        return { invest, debt, loans, home, liquid, total: liquid + home };
    }

    // ─── Last 12 months (3.7.1) ──────────────────────────────
    // The 12 COMPLETE months before the as-of month: as of 2026-10 → 2025-10 … 2026-09. The as-of month itself is left out.
    function t12Range(asOfMk) { return { start: addMonths(asOfMk, -12), end: asOfMk }; }
    function inT12(e, asOfMk) {
        const m = e && e.date && e.date.slice(0, 7);
        return !!m && m >= addMonths(asOfMk, -12) && m < asOfMk;
    }
    // Sum over the last 12 months; `pick` chooses the number (default: amount), `filter` narrows the list
    function sumT12(list, asOfMk, pick, filter) {
        pick = pick || (e => e.amount || 0);
        return (list || []).filter(e => inT12(e, asOfMk) && (!filter || filter(e))).reduce((s, e) => s + (pick(e) || 0), 0);
    }

    // ─── Spending, savings, income ───────────────────────────
    const MORTGAGE_RE = /mortgage|loan|house/;   // bills whose company name contains one of these count as the mortgage
    const isMortgageBill = e => MORTGAGE_RE.test((e.companyName || '').toLowerCase());
    function trackedSpending(expenses, asOfMk) { return sumT12(expenses, asOfMk); }
    function mortgageSpending(expenses, asOfMk) { return sumT12(expenses, asOfMk, null, isMortgageBill); }
    // Retirement (incl. employer match and HSA) + coast contributions, last 12 months
    function t12Savings(retirementContribs, coastContribs, asOfMk) {
        const ret   = sumT12(retirementContribs, asOfMk, e => e.totalAmount || e.amount || 0);
        const match = sumT12(retirementContribs, asOfMk, e => (e.amounts && e.amounts.employer_match) || 0);
        const coast = sumT12(coastContribs, asOfMk);
        return { ret, coast, match, retMo: ret / 12, coastMo: coast / 12, matchMo: match / 12, totalMo: (ret + coast) / 12 };
    }
    function takeHome(incomeEntries, asOfMk) { return sumT12(incomeEntries, asOfMk); }
    // After-tax savings rate (a fraction, or null with no income): (retirement + coast) ÷ (take-home + retirement)
    function savingsRate(sv, takeHomeAmt) { const base = takeHomeAmt + sv.ret; return base > 0 ? (sv.ret + sv.coast) / base : null; }

    // ─── FIRE ────────────────────────────────────────────────
    const PLAN_RETURN = 0.07;   // assumed yearly return for projected dates
    const WR = 0.04;            // withdrawal rate (the desktop's Phase 4 slider is separate)
    // Gross-up so withdrawals cover the tax on them. 0% tax = no gross-up.
    function taxDivisor(taxPct) { return taxPct > 0 ? 1 - taxPct / 100 : 1; }
    function fullFire(spending, taxPct, wr) { return spending / taxDivisor(taxPct) / (wr || WR); }
    function coastFire(spending, mortgage, taxPct, wr) { return (spending - mortgage) / taxDivisor(taxPct) / (wr || WR); }
    // Months until `goal`: each month balance × (1 + return/12) + pmt. 0 if already there; Infinity past 50 years.
    function monthsToGoal(pv, goal, pmt, annualReturn) {
        if (pv >= goal) return 0;
        const r = (annualReturn == null ? PLAN_RETURN : annualReturn) / 12;
        let b = pv;
        for (let n = 1; n <= 600; n++) { b = b * (1 + r) + (pmt || 0); if (b >= goal) return n; }
        return Infinity;
    }
    // Balance after `months` of the same growth + contributions (yearly-goal suggestions)
    function projectBalance(pv, pmt, months, annualReturn) {
        const r = (annualReturn == null ? PLAN_RETURN : annualReturn) / 12;
        let b = pv; for (let i = 0; i < months; i++) b = b * (1 + r) + (pmt || 0);
        return b;
    }
    // Hourly pay that covers spending with no saving: bills (+ living) grossed up for 7.65% FICA + 14% federal,
    // plus health insurance (paid pre-tax), over 2,080 hours. No Alaska income tax.
    function breakEvenHourly(bills, living, health) { return ((bills + (living || 0)) / (1 - 0.0765 - 0.14) + (health || 0)) / 2080; }

    // ─── Mortgage (3.7.2) ────────────────────────────────────
    // balance   = latest balance of each mortgage-type debt account, capped at last month like all debt
    // principal = per account, the average drop between its last 7 balance entries (6 drops; rises are skipped),
    //             added up across accounts
    // payment   = mortgage bills over the last 12 complete months ÷ 12 (includes escrow: a known gap)
    function mortgageInfo(debtAccounts, debtEntries, expenses, asOfMk) {
        const accts = (debtAccounts || []).filter(a => a.type === 'mortgage');
        let principal = 0;
        accts.forEach(a => {
            const de = (debtEntries || []).filter(e => e && e.accountId === a.id && e.date).sort((x, y) => x.date.localeCompare(y.date)).slice(-7);
            let red = 0, n = 0;
            for (let i = 1; i < de.length; i++) { const d = (de[i - 1].amount || 0) - (de[i].amount || 0); if (d > 0) { red += d; n++; } }
            if (n) principal += red / n;
        });
        return { balance: debtTotal(accts, debtEntries, asOfMk), principal, payment: mortgageSpending(expenses, asOfMk) / 12 };
    }

    return { monthKey, addMonths, r2, latestEntry, balance, total, investTotal, taxableTotal, debtCap, debtTotal, debtThrough,
             loanRateAt, loanEventsFor, loanCalc, loansOwed, propId, propertyValue, realEstateItems, realEstate, netWorth,
             t12Range, inT12, sumT12, MORTGAGE_RE, isMortgageBill, trackedSpending, mortgageSpending, t12Savings, takeHome, savingsRate,
             PLAN_RETURN, WR, taxDivisor, fullFire, coastFire, monthsToGoal, projectBalance, breakEvenHourly, mortgageInfo };
})();
