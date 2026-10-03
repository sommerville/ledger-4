// Sommerville Ledger 4 — planning.js
// Planning helpers, info panels (ⓘ), Compounding and Budget calculators, yearly goals
// Part of index.html (3.5.2 split). Plain script, loaded in order; all files share one global scope.
    // ─── Planning helpers (v15.1) ────────────────────────────
    // Single source of truth for spending, savings and projections used by the
    // FIRE page, Summary and Goals (Monte Carlo + Retirement Plan live in the desktop planner).
    // 3.7.1: the math lives in js/ledger-core.js (LC), shared with the desktop. The phone's "as of" is this month.
    const PLAN_RETURN = LC.PLAN_RETURN;   // assumed annual return for projected dates (7%)
    function _asOf() { return moKey(new Date()); }

    function _t12Range() { return LC.t12Range(_asOf()); }
    function _inT12(e) { return LC.inT12(e, _asOf()); }
    // Tracked bills, last 12 complete months
    function getTrackedAnnualExpenses() { return LC.trackedSpending(expenses, _asOf()); }
    function getAnnualMortgage() { return LC.mortgageSpending(expenses, _asOf()); }
    // v3.1: yearly spending on the phone = logged bills only (last 12 complete months).
    // Estimated living costs + health insurance are a planning choice → desktop planner (Retirement Plan page).
    // pf_untrackedLiving / pf_healthInsurance are left in storage untouched (Ledger 2 still reads them).
    function getAnnualSpending() {
        return getTrackedAnnualExpenses();
    }
    // Trailing-12-month savings (retirement incl. employer money, and coast contributions)
    function getT12Savings() {
        const sv = LC.t12Savings(retirementContribs, coastContribs, _asOf());
        return { retAnnual: sv.ret, coastAnnual: sv.coast, retMonthly: sv.retMo, coastMonthly: sv.coastMo,
                 totalMonthly: sv.totalMo, matchMonthly: sv.matchMo };
    }
    // Take-home pay, all income, last 12 complete months
    function getT12TakeHome() { return LC.takeHome(incomeEntries, _asOf()); }
    // Savings rate (%), after-tax basis: savings ÷ (take-home pay + money already routed into retirement accounts)
    function getSavingsRate() {
        const r = LC.savingsRate(LC.t12Savings(retirementContribs, coastContribs, _asOf()), getT12TakeHome());
        return r === null ? null : r * 100;
    }
    // Full / Coast FIRE targets on the phone: logged bills, the phone's tax rate, 4%
    function getFullFire() { return LC.fullFire(getAnnualSpending(), taxRatePct, _wr()); }
    function getCoastFire() { return LC.coastFire(getAnnualSpending(), getAnnualMortgage(), taxRatePct, _wr()); }

    // ─── Info panels: assumptions, variables & formulas (v15.2) ─────
    // Every panel is built from live data at the moment it opens.
    function openInfo(key) {
        const build = INFO_PANELS[key];
        if (!build) return;
        let p;
        try { p = build(); } catch (e) { p = { title: 'How this is calculated', sections: [{ h: 'Error', notes: [String(e)] }] }; }
        document.getElementById('infoTitle').textContent = p.title;
        document.getElementById('infoBody').innerHTML = p.sections.map(_infoSection).join('');
        const el = document.getElementById('infoModal');
        el.style.display = '';          // v15.2.1: visibility comes from the .open class only
        el.querySelector('.modal-box').scrollTop = 0;
        el.classList.add('open');
    }
    function closeInfo() {
        const el = document.getElementById('infoModal');
        if (el) el.classList.remove('open');
    }
    function infoIsOpen() {
        const el = document.getElementById('infoModal');
        return !!(el && el.classList.contains('open'));
    }
    function _infoEsc(s) { return String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }
    function _infoSection(s) {
        let h = `<div class="info-sec"><h4>${_infoEsc(s.h)}</h4>`;
        if (s.rows) h += s.rows.map(r => `<div class="info-row${r[2] ? ' total' : ''}"><span>${_infoEsc(r[0])}</span><span>${_infoEsc(r[1])}</span></div>`).join('');
        if (s.formula) h += `<div class="info-formula">${_infoEsc(s.formula)}</div>`;
        if (s.notes) h += `<ul class="info-notes">${s.notes.map(n => `<li>${_infoEsc(n)}</li>`).join('')}</ul>`;
        return h + '</div>';
    }
    const _$ = n => fmt(n);                                         // respects Demo Mode
    const _pct = (n, d = 1) => (n * 100).toFixed(d) + '%';
    function _latestBal(filterFn) { return LC.investTotal(accounts, entries, null, filterFn); }   // 3.7: ledger-core.js
    function _t12Label() {
        const r = _t12Range();
        const lbl = mk => new Date(mk + '-02').toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        const [y, m] = r.end.split('-').map(Number);
        return lbl(r.start) + ' – ' + lbl(moKey(new Date(y, m - 2, 1)));
    }
    function _spendingSection() {
        const bills = getTrackedAnnualExpenses();
        return { h: 'Annual expenses', rows: [
            ['Logged bills (' + _t12Label() + ')', _$(bills)],
            ['Annual expenses', _$(bills), true],
        ], notes: ['Bills = every expense entry in the last 12 complete months (the current month is left out).',
                   'Logged bills only. Groceries, fuel, dining and health insurance aren\'t logged as bills, so these numbers run low. The desktop planner (Retirement Plan page) can add estimates for them.',
                   'Tax rate: ' + taxRatePct + '%, the last rate saved on this phone. The desktop planner sets its own tax rate and runs Monte Carlo.',
                   "Today's dollars — no inflation is applied."] };
    }
    function _wr() { return LC.WR; }   // fixed 4% on the phone
    function _taxDiv() { return LC.taxDivisor(taxRatePct); }

    const INFO_PANELS = {
        fullFire() {
            const S = getAnnualSpending(), wr = _wr(), P = _latestBal(() => true);
            const goal = S / _taxDiv() / wr, sv = getT12Savings();
            const mo = projectMonthsToGoal(P, goal, sv.totalMonthly);
            return { title: '🔥 Full FIRE Number', sections: [
                _spendingSection(),
                { h: 'Formula', formula:
`Full FIRE = spending ÷ (1 − tax)
            ÷ withdrawal rate
  = ${_$(S)} ÷ (1 − ${taxRatePct}%) ÷ ${_pct(wr)}
  = ${_$(goal)}

Progress = portfolio ÷ Full FIRE
  = ${_$(P)} ÷ ${_$(goal)}
  = ${_pct(P / goal)}` },
                { h: 'Projected date', rows: [
                    ['Starting portfolio (all accounts)', _$(P)],
                    ['Monthly savings (last 12 mo)', _$(sv.totalMonthly)],
                    ['Assumed return', _pct(PLAN_RETURN) + '/yr'],
                    ['Months to goal', isFinite(mo) ? String(mo) : '50+ yrs', true],
                ], formula: `each month:\n  balance × (1 + ${_pct(PLAN_RETURN)}/12)\n  + ${_$(sv.totalMonthly)}\nuntil balance ≥ ${_$(goal)}` },
                { h: 'Assumptions', notes: [
                    'Withdrawal rate comes from the Retirement Plan slider (default 4%).',
                    `Tax rate (${taxRatePct}%) is applied to every dollar withdrawn. Roth money and taxable cost basis are really taxed less, so this is conservative.`,
                    'Monthly savings = retirement contributions (incl. employer match & HSA) + coast contributions over the last 12 months, held steady.',
                    'Portfolio = latest balance of every account, including metals and loans receivable. Home equity is not included.'] },
            ] };
        },
        coastFire() {
            const S = getAnnualSpending(), M = getAnnualMortgage(), wr = _wr();
            const T = _latestBal(a => a.type === 'taxable'), goal = (S - M) / _taxDiv() / wr, sv = getT12Savings();
            const mo = projectMonthsToGoal(T, goal, sv.coastMonthly);
            const names = accounts.filter(a => a.type === 'taxable').map(a => a.institution || a.name).join(' + ');
            return { title: '🏠 Coast FIRE (No Mortgage)', sections: [
                _spendingSection(),
                { h: 'Formula', formula:
`Coast FIRE = (spending − mortgage)
             ÷ (1 − tax) ÷ withdrawal rate
  = (${_$(S)} − ${_$(M)})
    ÷ (1 − ${taxRatePct}%) ÷ ${_pct(wr)}
  = ${_$(goal)}

Progress = taxable ÷ Coast FIRE
  = ${_$(T)} ÷ ${_$(goal)}
  = ${_pct(T / goal)}` },
                { h: 'Projected date', rows: [
                    ['Taxable now (' + names + ')', _$(T)],
                    ['Coast contributions / mo (last 12 mo)', _$(sv.coastMonthly)],
                    ['Assumed return', _pct(PLAN_RETURN) + '/yr'],
                    ['Months to goal', isFinite(mo) ? String(mo) : '50+ yrs', true],
                ] },
                { h: 'Assumptions', notes: [
                    'Mortgage = expenses whose company name contains "mortgage", "loan" or "house".',
                    'Known gap: the whole mortgage payment is removed, but escrow (property tax + insurance) continues after payoff. This understates the target until escrow is split out.',
                    'Only taxable accounts count, because they can be spent before 59½ without penalty.'] },
            ] };
        },
        coastPage() {
            const T = _latestBal(a => a.type === 'taxable');
            const rows = accounts.filter(a => a.type === 'taxable').map(a => [a.name + ' (' + a.institution + ')', _$(_latestBal(x => x.id === a.id))]);
            rows.push(['Total taxable', _$(T), true]);
            return { title: '🌴 Coast FIRE page', sections: [
                { h: 'Header', rows },
                { h: 'Contributions', rows: [
                    ['YTD contributions', _$(coastCalcYTD())],
                    ['All-time contributions', _$(coastCalcAllTime())],
                    ['Historical monthly avg', _$(coastCalcMonthlyAvg())],
                ], notes: ['Historical monthly avg = all-time contributions ÷ months from the first contribution through this month.',
                           'Planning math (FIRE dates, Retirement Plan) uses the last 12 months instead: ' + _$(getT12Savings().coastMonthly) + '/mo.'] },
            ] };
        },
        fireMetrics() {
            const S = getAnnualSpending(), M = getAnnualMortgage(), wr = _wr(), P = _latestBal(() => true);
            const bills = getTrackedAnnualExpenses();
            const gross = LC.breakEvenHourly(bills) * 2080;   // 3.7.1: ledger-core.js
            return { title: 'FIRE Metrics', sections: [
                _spendingSection(),
                { h: 'Formulas', formula:
`Safe withdrawal = portfolio × ${_pct(wr)}
  = ${_$(P * wr)}/yr

Full FIRE = ${_$(S)}
  ÷ (1 − ${taxRatePct}%) ÷ ${_pct(wr)}
  = ${_$(S / _taxDiv() / wr)}

Coast FIRE = (${_$(S)} − ${_$(M)} mortgage)
  ÷ (1 − ${taxRatePct}%) ÷ ${_pct(wr)}
  = ${_$((S - M) / _taxDiv() / wr)}` },
                { h: 'Break-even hourly rate', formula:
`gross = logged bills
  ÷ (1 − 7.65% FICA − 14% federal)
  = ${_$(bills)} ÷ 0.7835
  = ${_$(gross)}

÷ 2,080 hours/yr
= $${(gross / 2080).toFixed(2)}/hr`,
                  notes: ['Assumes no contributions and no Alaska state income tax. The 14% federal effective rate is a fixed estimate.'] },
            ] };
        },
        savingsRate() {
            const takeHome = getT12TakeHome();
            const sv = getT12Savings(), rate = getSavingsRate();
            return { title: '💰 Savings Rate', sections: [
                { h: 'Last 12 complete months (' + _t12Label() + ')', rows: [
                    ['Retirement contributions (R)', _$(sv.retAnnual)],
                    ['  ↳ incl. employer match', _$(sv.matchMonthly * 12)],
                    ['Coast contributions (C)', _$(sv.coastAnnual)],
                    ['Take-home pay, all income (N)', _$(takeHome)],
                ] },
                { h: 'Formula', formula:
`Savings rate = (R + C) ÷ (N + R)
  = (${_$(sv.retAnnual)} + ${_$(sv.coastAnnual)})
    ÷ (${_$(takeHome)} + ${_$(sv.retAnnual)})
  = ${rate !== null ? rate.toFixed(1) + '%' : '—'}` },
                { h: 'Why this basis', notes: [
                    'Retirement money is taken out before your paycheck lands, so it is added back to the income side. Otherwise the rate is inflated.',
                    'N is net (after-tax) income, so this is an after-tax savings rate. Taxes are not counted as income or as savings.',
                    'Take-home includes payroll, bonuses, tax refunds and dividends (PFD).'] },
            ] };
        },
        netWorth() {
            const inv = _latestBal(() => true);
            const debt = getTotalDebt();
            const reItems = realEstateItems();   // v3.5
            const home = realEstateTotal();
            const _n = new Date(), capMk = moKey(new Date(_n.getFullYear(), _n.getMonth() - 1, 1));
            return { title: '⚖️ Net Worth', sections: [
                { h: 'Components', rows: [
                    ['Investments (latest balance per account)', _$(inv)],
                    ['Debt (latest through ' + capMk + ')', '−' + _$(debt)],
                    ['Loans owed to you (with interest)', _$(getLoansOwed())],
                    ['Liquid net worth', _$(inv - debt + getLoansOwed()), true],
                    ...(reItems.length ? reItems.map(x => [ddE(x.p.name) + ' (' + x.e.date + ')', _$(x.e.value)]) : [['Real estate', _$(0)]]),
                    ['Net worth incl. real estate', _$(inv - debt + getLoansOwed() + home), true],
                ] },
                { h: 'Formula', formula: 'Liquid = investments − debt + loans owed to you\nNet worth = liquid + real estate (latest value of each property)' },
                { h: 'Notes', notes: [
                    "Debt is capped at last month, so a new month with no entries yet doesn't zero it out.",
                    'Real estate is the most recent value logged for each property. It is not adjusted between entries, and it is not part of liquid net worth, FIRE or retirement numbers.',
                    'Investments include metals and loans receivable.'] },
            ] };
        },
        retLimits() {
            const L = retirementLimits || {}, lim401k = parseFloat(L.limit401k) || 0, limTot = parseFloat(L.limitTotal401k) || 0, limHSA = parseFloat(L.limitHSA) || 0;
            const rows = [];
            _retDisplaySources().filter(s => (s.contribTypes || []).some(k => k === '401k_pretax' || k === '401k_roth')).forEach(src => {
                const bonus = _retBonusSourcesFor(src);
                const ytd = bonus.length ? retCalcYTDMerged([src.id, ...bonus.map(b => b.id)]) : retCalcYTD(src.id);
                const pl = (L.perPlan || {})[src.id] || {};
                const l1 = parseFloat(pl.limit401k) || lim401k, l2 = parseFloat(pl.limitTotal401k) || limTot;
                const who = src.sponsor || src.label;
                rows.push([who + ' — employee (pre-tax + Roth)', _$(ytd.employee401k) + ' / ' + _$(l1)]);
                rows.push([who + ' — total incl. match + after-tax', _$(ytd.total401k) + ' / ' + _$(l2)]);
            });
            const all = retCalcYTD();
            rows.push(['HSA — employee + employer (household)', _$(all.totalHSA) + ' / ' + _$(limHSA), true]);
            return { title: '🏦 Retirement Limits', sections: [
                { h: new Date().getFullYear() + ' year-to-date vs limit', rows },
                { h: 'Formula', formula: 'remaining = limit − YTD for that plan\nYTD = contributions Jan 1 – today' },
                { h: 'Assumptions', notes: [
                    'Limits are per person, so each plan is checked on its own. Bonus-plan contributions are added to the same employee plan.',
                    'Employee limit covers pre-tax + Roth deferrals. Total limit (IRS 415(c)) adds employer match + after-tax.',
                    'HSA family limit is shared by the household: employee + employer together.',
                    'Limits come from Retirement → Annual Limits. 2026 IRS: $24,500 / $72,000 / HSA family $8,750. No catch-up contributions (under 50).'] },
            ] };
        },
    };

    // Months to reach a goal at PLAN_RETURN with a steady monthly contribution
    function projectMonthsToGoal(currentValue, goalValue, monthlyContrib) { return LC.monthsToGoal(currentValue, goalValue, monthlyContrib); }   // 3.7.1

    function formatProjectedDate(months) {
        if (months === 0) return 'Achieved! 🎉';
        if (months === Infinity || months > 600) return 'Need higher growth';
        const today = new Date();
        const futureDate = new Date(today);
        futureDate.setMonth(futureDate.getMonth() + months);
        const monthName = futureDate.toLocaleDateString('en-US', { month: 'short' });
        const year = futureDate.getFullYear();
        return `${monthName} ${year}`;
    }

    function updateStats() {
        // 3.7: latest balance by date (was the last entry in the list)
        const totalPortfolio = getCurrentTotal();
        const taxableTotal = getTaxableTotal();

        // 3.7.1: FIRE targets from ledger-core.js (logged bills, last 12 complete months; the phone's tax rate; 4%)
        const fullFIRENumber  = getFullFire();
        const coastFIRENumber = getCoastFire();

        // v15.1: project with an assumed return + actual trailing-12-month contributions
        const _sav = getT12Savings();
        const monthsToFullFIRE  = projectMonthsToGoal(totalPortfolio, fullFIRENumber, _sav.totalMonthly);
        const monthsToCoastFIRE = projectMonthsToGoal(taxableTotal, coastFIRENumber, _sav.coastMonthly);
        const monthsToMillion   = projectMonthsToGoal(totalPortfolio, 1000000, _sav.totalMonthly);

// Coast FIRE
        const _sc = id => document.getElementById(id);
        if (_sc('statsCoastFIRE'))       _sc('statsCoastFIRE').textContent       = fmt(coastFIRENumber);
        if (_sc('statsCurrentTaxable'))  _sc('statsCurrentTaxable').textContent  = fmt(taxableTotal);
        if (_sc('statsCoastProgress'))   _sc('statsCoastProgress').textContent   = ((taxableTotal / coastFIRENumber) * 100).toFixed(1) + '%';
        if (_sc('statsCoastDate'))       _sc('statsCoastDate').textContent       = formatProjectedDate(monthsToCoastFIRE);
        if (_sc('statsFullFIRE'))        _sc('statsFullFIRE').textContent        = fmt(fullFIRENumber);
        if (_sc('statsCurrentPortfolio'))_sc('statsCurrentPortfolio').textContent= fmt(totalPortfolio);
        if (_sc('statsFullProgress'))    _sc('statsFullProgress').textContent    = ((totalPortfolio / fullFIRENumber) * 100).toFixed(1) + '%';
        if (_sc('statsFullDate'))        _sc('statsFullDate').textContent        = formatProjectedDate(monthsToFullFIRE);

        // Render yearly goals
        renderYearlyGoals(totalPortfolio, _sav.totalMonthly);
    }

    // ─── Compound Calculator ─────────────────────────────────
    // Seed compound interest calculator with live portfolio data
    function seedCompoundCalc() {
        const total = getCurrentTotal();
        const initialEl = document.getElementById('calcInitial');
        if (initialEl && total > 0) initialEl.value = Math.round(total);

        const monthlyEl = document.getElementById('calcMonthly');
        if (monthlyEl) {
            const coastMonthly = typeof coastCalcMonthlyAvg === 'function' ? coastCalcMonthlyAvg() : 0;
            const retMonths = new Set(retirementContribs.filter(e=>e.date).map(e=>e.date.slice(0,7)));
            const retTotal  = retirementContribs.reduce((s,e)=>s+(e.totalAmount||e.amount||0),0);
            const retMonthly = retMonths.size > 0 ? retTotal / retMonths.size : 0;
            const combined = Math.round(coastMonthly + retMonthly);
            if (combined > 0) monthlyEl.value = combined;
        }

        const yearsEl   = document.getElementById('calcYears');
        const yearsDisp = document.getElementById('calcYearsDisplay');
        if (yearsEl) {
            const age = typeof getCurrentAge === 'function' ? getCurrentAge() : 0;
            const yrs = age > 0 ? Math.max(1, 65 - age) : 30;
            yearsEl.value = yrs;
            if (yearsDisp) yearsDisp.textContent = yrs + ' Years';
        }
    }

    function runCompoundCalc() {
        const initial = parseFloat(document.getElementById('calcInitial').value) || 0;
        const monthly = parseFloat(document.getElementById('calcMonthly').value) || 0;
        const rateAnnual = parseFloat(document.getElementById('calcRate').value) / 100;
        const years = parseInt(document.getElementById('calcYears').value) || 1;

        // Update displays
        document.getElementById('calcRateDisplay').textContent = (rateAnnual * 100).toFixed(1) + '%';
        document.getElementById('calcYearsDisplay').textContent = years + ' Years';

        // Calculate future value with monthly contributions
        const rateMonthly = rateAnnual / 12;
        const months = years * 12;

        // Future value of initial investment
        const fvInitial = initial * Math.pow(1 + rateMonthly, months);

        // Future value of monthly contributions (annuity)
        const fvMonthly = monthly * ((Math.pow(1 + rateMonthly, months) - 1) / rateMonthly);

        const futureValue = fvInitial + fvMonthly;
        const totalContributions = initial + (monthly * months);
        const totalInterest = futureValue - totalContributions;

        // Update display
        document.getElementById('calcFutureValue').textContent = fmt(futureValue);
        document.getElementById('calcTotalContrib').textContent = fmt(totalContributions);
        document.getElementById('calcTotalInterest').textContent = fmt(totalInterest);
    }

    // ─── Budget Calculator Toggle ────────────────────────────
    function toggleCustomBudget() {
        const section = document.getElementById('customBudgetSection');
        if (section.style.display === 'none') {
            section.style.display = 'block';
        } else {
            section.style.display = 'none';
        }
    }

    // ─── Budget Calculator ───────────────────────────────────
    // Seed budget calculator with live income/expense/savings data
    function seedBudgetCalc() {
        const today    = new Date();
        const curStr   = moKey(today);
        const startStr = moKey(new Date(today.getFullYear(), today.getMonth() - 12, 1));

        // Monthly take-home — trailing 12mo payroll net average (always refresh)
        const incEl = document.getElementById('budgetIncome');
        if (incEl) {
            const payrollTotal = incomeEntries
                .filter(e => e.date >= startStr + '-01' && e.date < curStr + '-01' && e.type === 'payroll')
                .reduce((s, e) => s + (e.amount || 0), 0);
            const payrollAvg = Math.round(payrollTotal / 12);
            if (payrollAvg > 0) incEl.value = payrollAvg;
        }

        // Needs — actual tracked monthly expenses average (only seed if empty)
        const needsEl = document.getElementById('customNeeds');
        if (needsEl && !needsEl.value) {
            const expTotal = expenses
                .filter(e => e.date >= startStr + '-01' && e.date < curStr + '-01')
                .reduce((s, e) => s + (e.amount || 0), 0);
            const expAvg = Math.round(expTotal / 12);
            if (expAvg > 0) needsEl.value = expAvg;
        }

        // Savings — coast contributions monthly average (only seed if empty)
        const savingsEl = document.getElementById('customSavings');
        if (savingsEl && !savingsEl.value) {
            const coastMonthly = typeof coastCalcMonthlyAvg === 'function' ? coastCalcMonthlyAvg() : 0;
            const combined = Math.round(coastMonthly);
            if (combined > 0) savingsEl.value = combined;
        }

        // Wants — remaining balance: income - needs - savings (only seed if empty)
        const wantsEl = document.getElementById('customWants');
        if (wantsEl && !wantsEl.value) {
            const income   = parseFloat(document.getElementById('budgetIncome').value) || 0;
            const needs    = parseFloat(document.getElementById('customNeeds').value)   || 0;
            const savings  = parseFloat(document.getElementById('customSavings').value) || 0;
            const wants    = Math.round(income - needs - savings);
            if (wants > 0) wantsEl.value = wants;
        }
    }

    function runBudgetCalc() {
        const income = parseFloat(document.getElementById('budgetIncome').value) || 0;

        // Theme-aware colors
        const isSunset = document.body.classList.contains('sunset-theme');
        const isDark   = document.body.classList.contains('alaskan-theme') || isSunset;

        const cardBg   = isSunset ? 'rgba(35,8,4,0.90)'    : '#1A2A42';
        const subBg    = isSunset ? 'rgba(50,12,6,0.85)'   : 'rgba(10,26,47,0.7)';
        const headColor= isSunset ? '#F5C030'               : '#D4AF37';
        const txtMain  = isSunset ? '#F0D0A0'               : '#E0E0E0';
        const txtSub   = isSunset ? '#C09070'               : '#8A8F98';
        const needsCol = isSunset ? '#5CD080'               : '#4CAF50';
        const wantsCol = isSunset ? '#E08020'               : '#FFA040';
        const savCol   = isSunset ? '#6AB0E0'               : '#5BA8D8';
        const remBg    = isSunset ? 'rgba(30,80,30,0.35)'   : 'rgba(20,60,20,0.4)';
        const remBdr   = isSunset ? '#5CD080'               : '#4CAF50';
        const remTxt   = isSunset ? '#5CD080'               : '#4CAF50';
        const overBg   = isSunset ? 'rgba(80,20,20,0.35)'   : 'rgba(60,10,10,0.4)';
        const overBdr  = isSunset ? '#E05050'               : '#E57373';
        const overTxt  = isSunset ? '#E05050'               : '#E57373';

        // 50/30/20 Rule calculations
        const needsTarget   = income * 0.50;
        const wantsTarget   = income * 0.30;
        const savingsTarget = income * 0.20;

        // Display 50/30/20 breakdown
        const breakdownHTML = `
            <div style="background:${cardBg}; border-radius:12px; padding:16px; margin-bottom:16px;">
                <h3 style="font-size:16px; margin-bottom:14px; color:${headColor};">📊 50/30/20 Recommended Budget</h3>

                <div style="margin-bottom:12px; padding:12px; background:${subBg}; border-radius:8px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                        <span style="font-size:14px; color:${needsCol}; font-weight:600;">50% Needs</span>
                        <span style="font-size:18px; font-weight:700; color:${needsCol};">${fmt(needsTarget)}</span>
                    </div>
                    <div style="font-size:12px; color:${txtSub};">Housing, groceries, utilities, insurance, minimum debt payments</div>
                </div>

                <div style="margin-bottom:12px; padding:12px; background:${subBg}; border-radius:8px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                        <span style="font-size:14px; color:${wantsCol}; font-weight:600;">30% Wants</span>
                        <span style="font-size:18px; font-weight:700; color:${wantsCol};">${fmt(wantsTarget)}</span>
                    </div>
                    <div style="font-size:12px; color:${txtSub};">Dining out, entertainment, shopping, hobbies, subscriptions</div>
                </div>

                <div style="padding:12px; background:${subBg}; border-radius:8px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                        <span style="font-size:14px; color:${savCol}; font-weight:600;">20% Savings & Debt</span>
                        <span style="font-size:18px; font-weight:700; color:${savCol};">${fmt(savingsTarget)}</span>
                    </div>
                    <div style="font-size:12px; color:${txtSub};">Emergency fund, retirement, investments, extra debt payments</div>
                </div>
            </div>
        `;
        document.getElementById('budgetBreakdown').innerHTML = breakdownHTML;

        // Custom budget comparison
        const customNeeds   = parseFloat(document.getElementById('customNeeds').value)   || 0;
        const customWants   = parseFloat(document.getElementById('customWants').value)   || 0;
        const customSavings = parseFloat(document.getElementById('customSavings').value) || 0;

        if (customNeeds > 0 || customWants > 0 || customSavings > 0) {
            const needsPercent   = income > 0 ? (customNeeds   / income * 100) : 0;
            const wantsPercent   = income > 0 ? (customWants   / income * 100) : 0;
            const savingsPercent = income > 0 ? (customSavings / income * 100) : 0;
            const totalSpent = customNeeds + customWants + customSavings;
            const leftover   = income - totalSpent;

            const needsStatus   = needsPercent   <= 50 ? '✅' : '⚠️';
            const wantsStatus   = wantsPercent   <= 30 ? '✅' : '⚠️';
            const savingsStatus = savingsPercent >= 20 ? '✅' : '⚠️';

            const loBg  = leftover >= 0 ? remBg  : overBg;
            const loBdr = leftover >= 0 ? remBdr : overBdr;
            const loTxt = leftover >= 0 ? remTxt : overTxt;

            const comparisonHTML = `
                <div style="background:${cardBg}; border-radius:12px; padding:16px; margin-bottom:16px;">
                    <h3 style="font-size:16px; margin-bottom:14px; color:${headColor};">📈 Your Budget vs 50/30/20</h3>

                    <div style="margin-bottom:10px; padding:10px; background:${subBg}; border-radius:8px;">
                        <div class="u-flex-between">
                            <span style="font-size:13px; color:${txtSub};">Needs ${needsStatus}</span>
                            <div class="u-text-right">
                                <div style="font-size:16px; font-weight:700; color:${txtMain};">${fmt(customNeeds)} (${needsPercent.toFixed(0)}%)</div>
                                <div style="font-size:12px; color:${txtSub};">Target: ${fmt(needsTarget)} (50%)</div>
                            </div>
                        </div>
                    </div>

                    <div style="margin-bottom:10px; padding:10px; background:${subBg}; border-radius:8px;">
                        <div class="u-flex-between">
                            <span style="font-size:13px; color:${txtSub};">Wants ${wantsStatus}</span>
                            <div class="u-text-right">
                                <div style="font-size:16px; font-weight:700; color:${txtMain};">${fmt(customWants)} (${wantsPercent.toFixed(0)}%)</div>
                                <div style="font-size:12px; color:${txtSub};">Target: ${fmt(wantsTarget)} (30%)</div>
                            </div>
                        </div>
                    </div>

                    <div style="margin-bottom:10px; padding:10px; background:${subBg}; border-radius:8px;">
                        <div class="u-flex-between">
                            <span style="font-size:13px; color:${txtSub};">Savings ${savingsStatus}</span>
                            <div class="u-text-right">
                                <div style="font-size:16px; font-weight:700; color:${txtMain};">${fmt(customSavings)} (${savingsPercent.toFixed(0)}%)</div>
                                <div style="font-size:12px; color:${txtSub};">Target: ${fmt(savingsTarget)} (20%)</div>
                            </div>
                        </div>
                    </div>

                    <div style="margin-top:14px; padding:14px; background:${loBg}; border-radius:8px; border:2px solid ${loBdr};">
                        <div class="u-flex-between">
                            <span style="font-size:14px; font-weight:600; color:${loTxt};">${leftover >= 0 ? 'Remaining' : 'Over Budget'}</span>
                            <span style="font-size:20px; font-weight:700; color:${loTxt};">${fmt(Math.abs(leftover))}</span>
                        </div>
                    </div>
                </div>
            `;
            document.getElementById('budgetComparison').innerHTML = comparisonHTML;
        } else {
            document.getElementById('budgetComparison').innerHTML = '';
        }
    }

    // ─── Yearly Goals ────────────────────────────────────────
    // Investments → 🎯 Goals: the Portfolio goal track (3.8, goals.js: steps incl. $1M and the critical-mass
    // points; replaces the $1M card), the date-based yearly goals, and Taxable could pay off mortgage.
    function updateGoals() {
        const totalPortfolio = getCurrentTotal();   // 3.7: latest balance by date
        const _goalMonthly = getT12Savings().totalMonthly;   // v15.1: 7% + trailing-12-month contributions
        const card = document.getElementById('portfolioGoalCard');
        if (card) card.innerHTML = goalCard('portfolio');
        renderYearlyGoals(totalPortfolio, _goalMonthly);
        renderTaxableMortgageMilestone();
    }

    function renderTaxableMortgageMilestone() {
        const container = document.getElementById('taxableMortgageMilestone');
        if (!container) return;

        const taxableTotal = getTaxableTotal();   // 3.7
        // Mortgage principal balance: latest per mortgage account, capped at last month like all debt
        const mortgageBalance = LC.mortgageInfo(debtAccounts, debtEntries, expenses, moKey(new Date())).balance;   // 3.7.2

        const isSunset = document.body.classList.contains('sunset-theme');
        const isDark  = document.body.classList.contains('alaskan-theme');
        const accentColor = isSunset ? '#F5C030' : '#D4AF37';
        const bgColor     = isSunset ? 'rgba(35,8,4,0.88)' : '#1A2A42';
        const subColor    = isSunset ? '#C09070' : '#8A8F98';
        const textColor   = isSunset ? '#F0D0A0' : '#C0C0C0';
        const barBg       = isSunset ? 'rgba(20,4,2,0.9)' : '#0A1A2F';

        if (mortgageBalance <= 0) {
            container.innerHTML = `
                <div style="background:${bgColor}; border-radius:12px; padding:16px; margin-bottom:16px; border:1px dashed ${accentColor};">
                    <div style="font-size:15px; font-weight:700; color:${accentColor};">Taxable Could Pay Off Mortgage</div>
                    <div style="font-size:13px; color:${subColor}; margin-top:6px;">Add a Mortgage debt account on the Net Worth page to track this milestone.</div>
                    <div style="font-size:13px; color:${textColor}; margin-top:4px;">Current taxable: <strong>${fmt(taxableTotal)}</strong></div>
                </div>
            `;
            return;
        }

        const achieved = taxableTotal >= mortgageBalance;
        const pct = Math.min(100, Math.max(0, (taxableTotal / mortgageBalance) * 100));
        const borderColor = isDark ? (achieved ? '#D4AF37' : '#2A3A52') : (achieved ? '#C87820' : '#C4A870');

        container.innerHTML = `
            <div style="background:${bgColor}; border-radius:12px; padding:16px; margin-bottom:16px; border:2px solid ${borderColor};">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                    <div>
                        <div style="font-size:15px; font-weight:700; color:${accentColor};">Taxable Could Pay Off Mortgage</div>
                        <div style="font-size:11px; color:${subColor}; margin-top:1px;">Taxable balance ≥ mortgage principal</div>
                        <div style="font-size:12px; color:${subColor}; margin-top:3px;">${achieved ? '✅ Achieved!' : `${fmt(mortgageBalance - taxableTotal)} to go`}</div>
                    </div>
                    <div style="font-size:18px; font-weight:700; color:${achieved ? '#4CAF50' : accentColor};">${pct.toFixed(1)}%</div>
                </div>
                <div style="background:${barBg}; border-radius:8px; height:10px; overflow:hidden;">
                    <div style="background:${achieved ? '#4CAF50' : accentColor}; height:100%; width:${pct}%; border-radius:8px; transition:width 0.3s;"></div>
                </div>
                <div style="display:flex; justify-content:space-between; margin-top:8px; font-size:12px; color:${subColor};">
                    <span>Taxable: <strong style="color:${textColor};">${fmt(taxableTotal)}</strong></span>
                    <span>Mortgage Balance: <strong style="color:${textColor};">${fmt(mortgageBalance)}</strong></span>
                </div>
            </div>
        `;
    }

    function renderYearlyGoals(totalPortfolio, monthlyContrib) {
        const container = document.getElementById('yearlyGoalsContainer');
        const currentYear = new Date().getFullYear();

        // Check if we need to auto-complete any goals
        Object.keys(yearlyGoals).forEach(year => {
            const goal = yearlyGoals[year];
            if (!goal.completed && totalPortfolio >= goal.amount) {
                goal.completed = true;
                const _d = new Date();
                goal.completionDate = moKey(_d) + '-' + String(_d.getDate()).padStart(2, '0');
                // Check if completed after year ended
                const completionYear = parseInt(goal.completionDate.slice(0, 4));
                goal.completedLate = completionYear > parseInt(year);
                saveYearlyGoals();
            }
        });

        // Determine which years to show - only current year and past years with goals
        const yearsToShow = [];
        for (let year = 2026; year <= currentYear; year++) {
            yearsToShow.push(year);
        }
        // Also show any future years that already have goals set
        Object.keys(yearlyGoals).forEach(year => {
            const y = parseInt(year);
            if (y > currentYear && !yearsToShow.includes(y)) {
                yearsToShow.push(y);
            }
        });
        yearsToShow.sort((a, b) => a - b);

        // v15.3: once the latest year has a goal, offer the next year so there's always a goal to add
        const _lastYear = yearsToShow[yearsToShow.length - 1];
        if (yearlyGoals[_lastYear]) yearsToShow.push(_lastYear + 1);

        let html = '';
        yearsToShow.forEach(year => {
            const goal = yearlyGoals[year];

            if (!goal) {
                // Show add button
                const _sugg = suggestYearGoal(year, totalPortfolio, monthlyContrib);
                html += `
                    <div class="u-card-blue" style="cursor:pointer;" onclick="showAddYearGoalForm(${year})">
                        <div class="u-flex-between">
                            <div>
                                <h3 style="font-size:16px; margin:0;" class="col-navy">🎯 ${year} Goal</h3>
                                <div style="font-size:12px; margin-top:4px;" class="col-muted">Tap to set · on pace for about ${fmt(_sugg)} by Dec ${year}</div>
                            </div>
                            <div style="font-size:24px" class="col-blue">+</div>
                        </div>
                    </div>
                    <div id="addGoalForm${year}" style="display:none; background:#fff; border-radius:12px; padding:16px; margin-bottom:16px; border:2px solid #2a69ac;">
                        <h3 style="font-size:16px; margin-bottom:6px; color:#1e3c72;">Set ${year} Goal</h3>
                        <div style="font-size:12px; margin-bottom:10px;" class="col-muted">Pre-filled with where you're on pace to be by Dec 31, ${year} (7% return + last 12 months of savings, rounded). Change it to anything.</div>
                        <input type="number" id="goalInput${year}" value="${_sugg}" placeholder="Enter goal amount" step="1000" style="width:100%; padding:10px; border:1px solid #ddd; border-radius:6px; font-size:14px; margin-bottom:10px;">
                        <div class="u-grid-2col-10">
                            <button class="submit-btn" style="margin:0;" onclick="saveYearGoal(${year})">Save Goal</button>
                            <button class="submit-btn" style="margin:0; background:linear-gradient(135deg,#636e72,#2d3436);" onclick="cancelYearGoalForm(${year})">Cancel</button>
                        </div>
                    </div>
                `;
            } else {
                // Show goal card
                const progress = (totalPortfolio / goal.amount) * 100;
                const yearPassed = new Date().getFullYear() > year;
                const isLate = goal.completedLate || false;

                // Determine status icon
                let statusIcon = '';
                let statusColor = '#2a69ac';
                if (goal.completed) {
                    if (isLate) {
                        statusIcon = '🐢';
                        statusColor = '#ff9800';
                    } else {
                        statusIcon = '✅';
                        statusColor = '#00c805';
                    }
                } else if (yearPassed) {
                    statusIcon = '⚠️';
                    statusColor = '#ffc107';
                }

                const isExpanded = goal.expanded || false;

                const monthsToGoal = projectMonthsToGoal(totalPortfolio, goal.amount, monthlyContrib);

                // Compact view (first two lines + icon)
                html += `
                    <div class="u-card-blue">
                        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                            <div class="u-flex-1">
                                <h3 style="font-size:16px; margin-bottom:8px;" class="col-navy">🎯 ${year} Goal</h3>
                                <div style="font-size:28px; font-weight:700; color:#D4AF37;">${fmt(goal.amount)}</div>
                            </div>
                            ${statusIcon ? `<div style="font-size:16px; cursor:pointer; user-select:none;" onclick="toggleYearGoal(${year})">${statusIcon}</div>` : ''}
                        </div>
                        ${isExpanded ? `
                        <div id="goalDetails${year}">
                            ${goal.completed ? `<p style="font-size:13px; color:#00c805; margin:12px 0 8px 0; font-weight:600;">Completed: ${goal.completionDate}${isLate ? ' (Late)' : ''}</p>` : `<p style="font-size:13px; color:#666; margin:12px 0 8px 0;">Target by end of ${year}</p>`}
                            <div style="margin-top:12px; padding-top:12px" class="bdt-light">
                                <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                                    <span class="u-fs13-666">Current Portfolio:</span>
                                    <span style="font-size:14px; font-weight:600;">${fmt(totalPortfolio)}</span>
                                </div>
                                <div style="display:flex; justify-content:space-between;">
                                    <span class="u-fs13-666">Progress:</span>
                                    <span style="font-size:14px; font-weight:600; color:#2a69ac;">${progress.toFixed(1)}%</span>
                                </div>
                                ${!goal.completed ? `
                                <div style="display:flex; justify-content:space-between; margin-top:8px; padding-top:8px" class="bdt-light">
                                    <span class="u-fs13-666">Projected Date:</span>
                                    <span style="font-size:14px; font-weight:600; color:#00c805;">${formatProjectedDate(monthsToGoal)}</span>
                                </div>` : ''}
                            </div>
                        </div>` : ''}
                    </div>
                `;
            }
        });

        container.innerHTML = html;
    }

    // v15.3: projected portfolio on Dec 31 of `year` at PLAN_RETURN + steady monthly savings, rounded to $10K
    function suggestYearGoal(year, totalPortfolio, monthlyContrib) {
        const now = new Date();
        const months = Math.max(0, (year - now.getFullYear()) * 12 + (11 - now.getMonth()));
        return Math.round(LC.projectBalance(totalPortfolio, monthlyContrib, months) / 10000) * 10000;   // 3.7.1
    }

    function toggleYearGoal(year) {
        const goal = yearlyGoals[year];
        if (!goal) return;
        goal.expanded = !goal.expanded;
        saveYearlyGoals();
        updateStats();
    }

    function showAddYearGoalForm(year) {
        document.getElementById(`addGoalForm${year}`).style.display = 'block';
    }

    function cancelYearGoalForm(year) {
        document.getElementById(`addGoalForm${year}`).style.display = 'none';
        document.getElementById(`goalInput${year}`).value = '';
    }

    function saveYearGoal(year) {
        const amount = parseFloat(document.getElementById(`goalInput${year}`).value);
        if (isNaN(amount) || amount <= 0) {
            alert('Please enter a valid goal amount.');
            return;
        }

        yearlyGoals[year] = {
            amount: amount,
            completed: false,
            completionDate: null
        };

        saveYearlyGoals();
        updateStats();
    }

