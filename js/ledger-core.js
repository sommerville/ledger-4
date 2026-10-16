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

    // ─── Retirement budget (desktop 4.7.0) ───────────────────
    // Property tax + home insurance inside the mortgage payment (escrow), yearly: they keep coming after payoff.
    // payment − principal − this month's interest; 0 without a rate.
    function escrowEstimate(paymentMo, principalMo, balance, ratePct) {
        if (!(ratePct > 0) || !(paymentMo > 0)) return 0;
        return Math.max(0, paymentMo - (principalMo || 0) - (balance || 0) * ratePct / 100 / 12) * 12;
    }
    // Yearly spending in retirement. bills = logged bills without the mortgage; the mortgage counts only if it
    // isn't paid off by then (its escrow is inside the payment then); living, health and other are estimates
    // the phone doesn't log.
    function retirementBudget(b) {
        const keep = !!b.keepMortgage;
        const L = { bills: b.bills || 0, mortgage: keep ? (b.mortgage || 0) : 0, escrow: keep ? 0 : (b.escrow || 0),
                    living: b.living || 0, health: b.health || 0, other: b.other || 0 };
        L.total = L.bills + L.mortgage + L.escrow + L.living + L.health + L.other;
        return L;
    }

    // ─── Social Security (desktop 4.8.0) ─────────────────────
    // Monthly benefit at a claiming age from the ssa.gov estimates at 62, 67 and 70 (straight line between them).
    // Without the 62/70 figures, Social Security's own rule for a full retirement age of 67 fills them in:
    // 70% of the age-67 benefit at 62, 124% at 70.
    function ssAtAge(p, claimAge) {
        const at67 = +(p && p.at67) || 0;
        if (!(at67 > 0)) return 0;
        const a = Math.min(70, Math.max(62, +claimAge || 67));
        const at62 = +p.at62 > 0 ? +p.at62 : at67 * 0.70, at70 = +p.at70 > 0 ? +p.at70 : at67 * 1.24;
        return a <= 67 ? at62 + (at67 - at62) * (a - 62) / 5 : at67 + (at70 - at67) * (a - 67) / 3;
    }
    // Spousal benefit: up to half the worker's age-67 benefit, cut 25/36 of 1% a month for the first 36 months
    // before 67 and 5/12 of 1% a month beyond that (so 32.5% of it at 62). No credits for waiting past 67.
    function spousalAtAge(workerAt67, claimAge) {
        const early = Math.max(0, Math.round((67 - Math.min(67, Math.max(62, +claimAge || 67))) * 12));
        const cut = Math.min(36, early) * 25 / 36 / 100 + Math.max(0, early - 36) * 5 / 12 / 100;
        return (+workerAt67 || 0) * 0.5 * (1 - cut);
    }

    // ─── Bridge plan: Roth ladder + ACA (desktop 4.9.0) ───────
    // ACA premium tax credit for a year. magi and fpl yearly (fpl = the poverty line for the household);
    // benchmarkMo = the full monthly price of the benchmark (second-lowest silver) plan for the household.
    // rules '2026': the original ACA (2.10%–9.96% of income, nothing above 400% of the poverty line: the cliff);
    // 'enhanced': the 2021–2025 rules (0%–8.5%, no cliff). Below 138% Alaska's Medicaid applies instead.
    const ACA_BANDS = {
        '2026': [[0, 2.10, 2.10], [133, 3.14, 4.19], [150, 4.19, 6.60], [200, 6.60, 8.44], [250, 8.44, 9.96], [300, 9.96, 9.96], [400, null, null]],
        enhanced: [[0, 0, 0], [150, 0, 2], [200, 2, 4], [250, 4, 6], [300, 6, 8.5], [400, 8.5, 8.5]]
    };
    function acaCredit(magi, fpl, benchmarkMo, rules) {
        const pct = fpl > 0 ? magi / fpl * 100 : Infinity;
        const out = { pct, medicaid: pct < 138, overCliff: false, sharePct: 0, credit: 0 };
        if (!(benchmarkMo > 0) || !(fpl > 0) || out.medicaid) return out;
        const bands = ACA_BANDS[rules === 'enhanced' ? 'enhanced' : '2026'];
        let i = bands.length - 1; while (i > 0 && pct < bands[i][0]) i--;
        const [lo, a, b] = bands[i];
        if (a == null) { out.overCliff = true; return out; }
        const hi = i + 1 < bands.length ? bands[i + 1][0] : lo;
        out.sharePct = hi > lo ? a + (b - a) * Math.min(1, (pct - lo) / (hi - lo)) : a;
        out.credit = Math.max(0, benchmarkMo * 12 - out.sharePct / 100 * magi);
        return out;
    }
    // Federal tax on ordinary income (married filing jointly, 2026): standard deduction $32,200,
    // 10% to $24,800 of taxable income, 12% to $100,800, 22% to $211,400, 24% after. Gains and dividends
    // are assumed to sit in the 0% capital-gains band (true at these incomes).
    // The year the tax and ACA tables here are for; the yearly update bumps it (offline Chad asks for it each January).
    const TABLES_YEAR = 2026;
    const FED_2026 = { std: 32200, bands: [[24800, 0.10], [100800, 0.12], [211400, 0.22], [Infinity, 0.24]] };
    function fedTax(ordinary, t) {
        t = t || FED_2026;
        let left = Math.max(0, ordinary - t.std), tax = 0, from = 0;
        for (const [to, rate] of t.bands) { const part = Math.min(left, to - from); if (part <= 0) break; tax += part * rate; left -= part; from = to; }
        return tax;
    }
    // Year by year from the retirement age to 59½ (health to 65). p: { age, endAge, taxable, pretax, rothBasis,
    // conversion (per year), growth (%), spend (yearly, without health insurance), gainShare (% of taxable
    // withdrawals that is gain), divYield (%), fpl, benchmarkMo, planMo (the plan you'd buy, full price/mo),
    // rules, medicareMo, after595Magi }. Spending is paid from taxable, then Roth basis, then conversions at
    // least 5 years old. Returns rows and a summary.
    function bridgePlan(p) {
        const r = (p.growth || 0) / 100, rows = [], ladder = [];
        let taxable = p.taxable || 0, pretax = p.pretax || 0, basis = p.rothBasis || 0, rothGrowth = 0, short = 0, firstShortAge = null;
        // 2026-10-14 (audit): only what went in can come out before 59½: Roth basis (contributions + after-tax money) and each
        // conversion once it is 5 years old. Their growth stays in the Roth until 59½ (rothGrowth), never spent here.
        const S = { converted: 0, tax: 0, health: 0, credit: 0, medicaidYrs: 0, cliffYrs: 0, firstAccess: null };
        for (let age = Math.floor(p.age); age < 65; age++) {
            const bridge = age < p.endAge;
            const conv = bridge ? Math.min(p.conversion || 0, pretax) : 0;
            const div = taxable * (p.divYield || 0) / 100;
            const health = (magi) => {
                if (age >= 65) return { cost: 0, a: null };
                const a = acaCredit(magi, p.fpl, p.benchmarkMo, p.rules);
                const price = (p.planMo > 0 ? p.planMo : p.benchmarkMo || 0) * 12;
                return { cost: a.medicaid ? 0 : Math.max(0, price - a.credit), a };
            };
            let row = null;
            if (bridge) {
                const tax = fedTax(conv);
                // health depends on income, income on withdrawals: settle it in a few passes
                let w1 = 0, h = health(conv + div);
                for (let k = 0; k < 4; k++) {
                    const need = (p.spend || 0) + h.cost + tax;
                    w1 = Math.min(taxable, need);
                    h = health(conv + div + w1 * (p.gainShare || 0) / 100);
                }
                const need = (p.spend || 0) + h.cost + tax;
                w1 = Math.min(taxable, need);
                let left = need - w1;
                const w2 = Math.min(basis, left); left -= w2;
                let w3 = 0;
                for (const c of ladder) { if (age - c.age >= 5 && c.left > 0 && left > 0) { const x = Math.min(c.left, left); c.left -= x; w3 += x; left -= x; } }
                if (left > 0.5 && firstShortAge == null) firstShortAge = age;
                short += Math.max(0, left);
                if (conv > 0) { ladder.push({ age, left: conv }); S.converted += conv; S.tax += tax; }
                const magi = conv + div + w1 * (p.gainShare || 0) / 100;
                row = { age, conv, tax, magi, fplPct: h.a ? h.a.pct : null, credit: h.a ? h.a.credit : 0, health: h.cost, medicaid: !!(h.a && h.a.medicaid),
                        overCliff: !!(h.a && h.a.overCliff), need, fromTaxable: w1, fromBasis: w2, fromLadder: w3, short: Math.max(0, left) };
                taxable = Math.max(0, (taxable - w1) * (1 + r));
                rothGrowth = rothGrowth * (1 + r) + (Math.max(0, basis - w2) + ladder.reduce((t, c) => t + c.left, 0)) * r;
                basis = Math.max(0, basis - w2);
                pretax = Math.max(0, (pretax - conv) * (1 + r));
            } else {
                const magi = p.after595Magi || 0, h = health(magi);
                row = { age, conv: 0, tax: 0, magi, fplPct: h.a ? h.a.pct : null, credit: h.a ? h.a.credit : 0, health: h.cost, medicaid: !!(h.a && h.a.medicaid),
                        overCliff: !!(h.a && h.a.overCliff), need: 0, fromTaxable: 0, fromBasis: 0, fromLadder: 0, short: 0, after: true };
            }
            if (row.fplPct != null) { S.health += row.health; S.credit += row.credit; if (row.medicaid) S.medicaidYrs++; if (row.overCliff) S.cliffYrs++; }
            rows.push(row);
        }
        if (ladder.length) S.firstAccess = ladder[0].age + 5;
        const ladderLeft = ladder.reduce((s, c) => s + c.left, 0);
        return { rows, short, firstShortAge, covered: short < 1, taxableAt595: taxable, pretaxAt595: pretax, rothAt595: basis + ladderLeft + rothGrowth, ...S };
    }

    // ─── Monte Carlo (desktop 4.10.0) ─────────────────────────
    // Repeatable random numbers (mulberry32) and a bell curve (Box–Muller), so the same inputs give the same answer.
    function rng(seedNum) {
        let a = (seedNum >>> 0) || 1;
        return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    }
    // s: { age, port, retire, contrib (per year until retiring), spend (per year, today's dollars, already grossed
    // up for tax), ss: [{ fromAge, perYear }] (today's dollars, grows with inflation), bufferYears (cash set aside at
    // retirement, in years of spending), cashRate (%) }. a: { life, retW, volW, retR, volR, infl, inflVol } in %.
    // Each year in retirement: Social Security pays what it can; after a down year the rest comes from the cash
    // buffer (no selling low); otherwise from the portfolio, and after an up year the buffer is refilled to target.
    // Success = money (portfolio + buffer) never runs out before life expectancy.
    function monteCarlo(s, a, n, seedNum) {
        const R = rng(seedNum == null ? 12345 : seedNum);
        const N = (m, sd) => { const u1 = R() || 1e-12, u2 = R(); return m + Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2) * sd; };
        const pct = x => (x || 0) / 100, ends = [];
        let ok = 0, bufferUsedRuns = 0;
        n = n || 10000;
        for (let i = 0; i < n; i++) {
            let port = s.port, age = s.age, exp = s.spend, infl = 1, alive = true, lastR = 0, buf = 0, usedBuf = false;
            while (age < s.retire) { port = port * (1 + N(pct(a.retW), pct(a.volW))) + (s.contrib || 0); const f = N(pct(a.infl), pct(a.inflVol)); exp *= 1 + f; infl *= 1 + f; age++; }
            const target = () => exp * (s.bufferYears || 0);
            buf = Math.min(port, target()); port -= buf;
            while (age < a.life) {
                const ss = (s.ss || []).reduce((t, x) => t + (age >= x.fromAge ? x.perYear * infl : 0), 0);
                let need = Math.max(0, exp - ss);
                if (lastR < 0 && buf > 0) { const x = Math.min(buf, need); buf -= x; need -= x; if (x > 0) usedBuf = true; }
                port -= need;
                if (port < 0) { buf += port; port = 0; if (buf <= 0) { buf = 0; alive = false; break; } }
                const r = N(pct(a.retR), pct(a.volR)), f = N(pct(a.infl), pct(a.inflVol));
                port *= 1 + r; buf *= 1 + pct(s.cashRate); exp *= 1 + f; infl *= 1 + f; lastR = r; age++;
                if (r > 0 && buf < target() && port > 0) { const x = Math.min(port, target() - buf); port -= x; buf += x; }
            }
            if (alive) ok++; if (usedBuf) bufferUsedRuns++;
            ends.push(port + buf);
        }
        ends.sort((x, y) => x - y);
        return { rate: ok / n * 100, median: ends[Math.floor(n / 2)], p10: ends[Math.floor(n * 0.1)], p90: ends[Math.floor(n * 0.9)], bufferUsedPct: bufferUsedRuns / n * 100 };
    }

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
             PLAN_RETURN, WR, taxDivisor, fullFire, coastFire, monthsToGoal, projectBalance, breakEvenHourly, mortgageInfo,
             escrowEstimate, retirementBudget, ssAtAge, spousalAtAge,
             acaCredit, fedTax, bridgePlan, FED_2026, TABLES_YEAR, rng, monteCarlo };
})();
