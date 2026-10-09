// Sommerville Ledger 4 — home.js
// Home screen: the two-page icon grid, drag to reorder
// Part of index.html (3.5.2 split). Plain script, loaded in order; all files share one global scope.
// ═══════════════════════════════════════════════════════
    // HOME SCREEN — two-page grid with swipe & drag-to-reorder
    // ═══════════════════════════════════════════════════════

    // SVG icons keyed by id
    const HOME_SVGS = {

        income:     `<img src="icons/home/income.png"     alt="Income"      width="88" height="88" style="width:88px;height:88px;object-fit:contain;">`,
        invest:     `<img src="icons/home/investments.png" alt="Investments" width="88" height="88" style="width:88px;height:88px;object-fit:contain;">`,
        expenses:   `<img src="icons/home/expenses.png"   alt="Expenses"    width="88" height="88" style="width:88px;height:88px;object-fit:contain;">`,
        networth:   `<img src="icons/home/net-worth.png"  alt="Net Worth"   width="88" height="88" style="width:88px;height:88px;object-fit:contain;">`,
        fire:       `<img src="icons/home/fire.png"        alt="FIRE"        width="88" height="88" style="width:88px;height:88px;object-fit:contain;">`,
        summary:    `<img src="icons/home/summary.png"    alt="Summary"     width="88" height="88" style="width:88px;height:88px;object-fit:contain;">`,
        compound:   `<img src="icons/home/compound-interest.png" alt="Compound Interest" width="88" height="88" style="width:88px;height:88px;object-fit:contain;">`,
        budget:     `<img src="icons/home/budget.png"     alt="Budget"      width="88" height="88" style="width:88px;height:88px;object-fit:contain;">`,
        retirement: `<img src="icons/home/retirement.png" alt="Retirement"  width="88" height="88" style="width:88px;height:88px;object-fit:contain;">`,
        debt:       `<img src="icons/home/debt.png"        alt="Debt"        width="88" height="88" style="width:88px;height:88px;object-fit:contain;">`,
        homevalue:  `<img src="icons/home/real-estate.png" alt="Real Estate" width="88" height="88" style="width:88px;height:88px;object-fit:contain;">`,
        loans:      `<img src="icons/home/loans.png"      alt="Loans"       width="88" height="88" style="width:88px;height:88px;object-fit:contain;">`,   // v3.4
        goals:      `<img src="icons/home/goals.png"      alt="Goals"       width="88" height="88" style="width:88px;height:88px;object-fit:contain;">`,   // 3.8
        monthreview:`<img src="icons/home/month-review.svg" alt="Month in Review" width="88" height="88" style="width:88px;height:88px;object-fit:contain;">`,   // 4.7.0
        yearreview: `<img src="icons/home/year-review.svg"  alt="Year in Review"  width="88" height="88" style="width:88px;height:88px;object-fit:contain;">`,   // 4.7.0

    };
    // Page 1 icon definitions (persisted order)
    let homeIconsP1 = [
{ id:'income',     label:'Income',      cls:'icon-income',     fn:"showIncomePage()" },
{ id:'invest',     label:'Investments', cls:'icon-invest',     fn:"showAccountsPage()" },
{ id:'expenses',   label:'Expenses',    cls:'icon-expenses',   fn:"showExpensesPage()" },
{ id:'networth',   label:'Net Worth',   cls:'icon-networth',   fn:"showNetWorthPage()" },
{ id:'debt',       label:'Debt',        cls:'icon-debt',       fn:"showDebtPage()" },
{ id:'fire',       label:'FIRE',        cls:'icon-fire',       fn:"showFirePage()" },
{ id:'retirement', label:'Retirement',  cls:'icon-retirement', fn:"showRetirementPage()" },
{ id:'homevalue',  label:'Real Estate', cls:'icon-homevalue',  fn:"showHomeValuePage()" },   // v3.5: was Home Value; id kept so saved icon order still works
{ id:'summary',    label:'Summary',     cls:'icon-summary',    fn:"openOverview()" },
    ];
    // Page 2 icon definitions
    let homeIconsP2 = [
{ id:'compound', label:'Compound Int.',     cls:'icon-compound', fn:"openCalculator('compound')" },
{ id:'budget',   label:'Budget',            cls:'icon-budget',   fn:"openCalculator('budget')" },
{ id:'loans',    label:'Loans',             cls:'icon-loans',    fn:"openLoans()" },   // v3.4
{ id:'goals',    label:'Goals',             cls:'icon-goals',    fn:"openGoals()" },   // 3.8
{ id:'monthreview', label:'Month in Review', cls:'icon-monthreview', fn:"openMonthReview()" },   // 4.7.0: was a link inside Summary
{ id:'yearreview',  label:'Year in Review',  cls:'icon-yearreview',  fn:"openYearReview()" },    // 4.7.0
        null,   // v3.0: Ret. Plan moved to the desktop planner
    ];

    // Current page index (0 or 1)
    let homePageIdx = 0;
    let homeJiggling = false;
    let homeDragSrcIdx = null;
    let homeDragSrcPage = null; // 'p1' or 'p2'
    let _homeEdgeTimer = null;  // timer for cross-page drag
    let _homeEdgeSide = null;   // 'left' or 'right'

    // ── 3.8.1: remember where you put the icons ──
    // pf_homeOrder = { p1: [id|null, …], p2: [id|null, …] } (UI only, plain JSON; also in the backup as homeOrder).
    // Before 3.8.1 the order lived only in memory, so every reload went back to the built-in layout.
    const _HOME_DEFS = [...homeIconsP1, ...homeIconsP2].filter(Boolean);
    function _homeSaveOrder() {
        const ids = arr => arr.slice(0, 12).map(ic => ic ? ic.id : null);
        try { localStorage.setItem('pf_homeOrder', JSON.stringify({ p1: ids(homeIconsP1), p2: ids(homeIconsP2) })); } catch (e) {}
    }
    function _homeLoadOrder() {
        let o = null;
        try { o = JSON.parse(localStorage.getItem('pf_homeOrder') || 'null'); } catch (e) { o = null; }
        if (!o || !Array.isArray(o.p1) || !Array.isArray(o.p2)) return;
        const byId = id => _HOME_DEFS.find(d => d.id === id) || null;
        const seen = new Set();
        const build = arr => arr.slice(0, 12).map(id => { const d = id && !seen.has(id) ? byId(id) : null; if (d) seen.add(id); return d; });
        const p1 = build(o.p1), p2 = build(o.p2);
        // Icons added since the layout was saved (e.g. Goals in 3.8) go in the first empty slot of page 2, then page 1
        _HOME_DEFS.filter(d => !seen.has(d.id)).forEach(d => {
            let i = p2.indexOf(null);
            if (i === -1 && p2.length < 9) { p2.push(d); return; }
            if (i !== -1) { p2[i] = d; return; }
            i = p1.indexOf(null);
            if (i !== -1) p1[i] = d; else p2.push(d);
        });
        homeIconsP1 = p1; homeIconsP2 = p2;
    }

    function renderHomeGrids() {
        _homeLoadOrder();   // 3.8.1
        _renderGrid(document.getElementById('homeGrid1'), homeIconsP1, 'p1');
        _renderGrid(document.getElementById('homeGrid2'), homeIconsP2, 'p2');
    }

    function _renderGrid(container, icons, page, swappedIdx) {
        if (!container) return;
        container.innerHTML = '';
        // Always pad to 9 slots (3 rows of 3) so all drop targets exist
        const GRID_SIZE = 9;
        const padded = icons.slice(0, GRID_SIZE);
        while (padded.length < GRID_SIZE) padded.push(null);
        padded.forEach((ic, idx) => {
            // Empty slot
            if (!ic) {
                const slot = document.createElement('div');
                slot.className = 'home-slot-empty';
                slot.style.cssText = 'width:100%;aspect-ratio:1/1.1;';
                container.appendChild(slot);
                return;
            }

            const btn = document.createElement('button');
            btn.className = 'home-app';
            if (idx === swappedIdx) btn.classList.add('just-swapped');
            btn.dataset.idx = idx;
            btn.dataset.page = page;
            btn.innerHTML = `
                <div class="home-icon ${ic.cls}">${HOME_SVGS[ic.id] || ''}</div>`;

            let pressTimer = null;
            let didDrag = false;

            btn.addEventListener('touchstart', e => {
                didDrag = false;
                btn.classList.add('pressed');
                pressTimer = setTimeout(() => {
                    btn.classList.remove('pressed');
                    _enterJiggle(page);
                }, 500);
}, { passive: true });

            btn.addEventListener('touchmove', e => {
                didDrag = true;
                clearTimeout(pressTimer);
                btn.classList.remove('pressed');
                if (homeJiggling) _onDragMove(e, idx, page);
}, { passive: true });

            btn.addEventListener('touchend', e => {
                clearTimeout(pressTimer);
                btn.classList.remove('pressed');
                if (homeJiggling && didDrag) {
                    _onDragEnd(e, page);
                } else if (!didDrag) {
                    if (homeJiggling) { _exitJiggle(); return; }
                    e.preventDefault(); // suppress synthetic click so we don't double-fire
                    try { eval(ic.fn); } catch(ex) {}
                }
            });

            // Mouse/desktop click fallback (touch devices use touchend above)
            btn.addEventListener('click', e => {
                if (homeJiggling) { _exitJiggle(); return; }
                try { eval(ic.fn); } catch(ex) {}
            });

            container.appendChild(btn);
        });
        if (homeJiggling) _applyJiggleClass(container);
    }

    function _enterJiggle(page) {
        homeJiggling = true;
        homeDragSrcPage = page;
        document.querySelectorAll('#homeGrid1 .home-app, #homeGrid2 .home-app').forEach(b => {
            b.classList.add('jiggling');
        });
    }

    function _exitJiggle() {
        if (homeJiggling) _homeSaveOrder();   // 3.8.1
        homeJiggling = false;
        homeDragSrcIdx = null;
        homeDragSrcPage = null;
        document.querySelectorAll('.home-app.jiggling').forEach(b => b.classList.remove('jiggling'));
    }

    function _applyJiggleClass(container) {
        container.querySelectorAll('.home-app').forEach(b => b.classList.add('jiggling'));
    }

    function _onDragMove(e, srcIdx, page) {
        if (homeDragSrcIdx === null) homeDragSrcIdx = srcIdx;
        const touch = e.touches[0];
        const icons = page === 'p1' ? homeIconsP1 : homeIconsP2;
        const container = page === 'p1' ? document.getElementById('homeGrid1') : document.getElementById('homeGrid2');
        if (!container) return;

        // ── Edge detection: hold near screen edge for 1.5s to flip page ──
        const screenW = window.innerWidth;
        const edgeZone = screenW * 0.15; // 15% of screen width
        const nearLeft  = touch.clientX < edgeZone;
        const nearRight = touch.clientX > screenW - edgeZone;
        const side = nearLeft ? 'left' : nearRight ? 'right' : null;

        if (side && side !== _homeEdgeSide) {
            _homeEdgeSide = side;
            clearTimeout(_homeEdgeTimer);
            // Show pulsing ring on the dragged icon to signal pending page flip
            const srcBtns = container.querySelectorAll('.home-app, .home-slot-empty');
            if (srcBtns[homeDragSrcIdx]) srcBtns[homeDragSrcIdx].classList.add('edge-pending');
            _homeEdgeTimer = setTimeout(() => {
                // Remove pending indicator
                container.querySelectorAll('.edge-pending').forEach(b => b.classList.remove('edge-pending'));
                // Flip page and move icon across — icon stays visible until page flips
                const destPage = page === 'p1' ? 'p2' : 'p1';
                const destIcons = destPage === 'p1' ? homeIconsP1 : homeIconsP2;
                while (icons.length < 12) icons.push(null);
                const moved = icons[homeDragSrcIdx];
                icons[homeDragSrcIdx] = null; // leave null placeholder, don't splice
                while (destIcons.length < 12) destIcons.push(null);
                // Find first empty slot on dest page
                let destSlot = destIcons.indexOf(null);
                if (destSlot === -1) destSlot = destIcons.length;
                destIcons[destSlot] = moved;
                homeDragSrcIdx = destSlot;
                homeDragSrcPage = destPage;
                _renderGrid(container, icons, page);
                const destContainer = destPage === 'p1' ?
                    document.getElementById('homeGrid1') : document.getElementById('homeGrid2');
                homeGoToPage(destPage === 'p1' ? 0 : 1);
                _renderGrid(destContainer, destIcons, destPage, homeDragSrcIdx);
                _applyJiggleClass(destContainer);
                _homeEdgeSide = null;
                _homeEdgeTimer = null;
            }, 1500);
        } else if (!side) {
            // Cancel edge — remove pending indicator
            container.querySelectorAll('.edge-pending').forEach(b => b.classList.remove('edge-pending'));
            _homeEdgeSide = null;
            clearTimeout(_homeEdgeTimer);
            _homeEdgeTimer = null;
        }

        // ── Hit detection: check both .home-app buttons AND empty slots ──
        const allSlots = container.querySelectorAll('.home-app, .home-slot-empty');
        const btns     = container.querySelectorAll('.home-app');
        let targetIdx = homeDragSrcIdx;

        allSlots.forEach((slot, i) => {
            const r = slot.getBoundingClientRect();
            const cx = r.left + r.width / 2;
            const cy = r.top + r.height / 2;
            if (Math.abs(touch.clientX - cx) < r.width * 0.55 &&
                Math.abs(touch.clientY - cy) < r.height * 0.55) {
                targetIdx = i;
            }
        });

        btns.forEach(b => b.classList.remove('drag-over'));
        if (targetIdx !== homeDragSrcIdx && allSlots[targetIdx]) {
            if (allSlots[targetIdx].classList.contains('home-app')) {
                allSlots[targetIdx].classList.add('drag-over');
            }
        }

        // Live reorder — works for both occupied slots and empty slots
        if (targetIdx !== homeDragSrcIdx) {
            // Ensure icons array is padded to 12 before splicing
            while (icons.length < 12) icons.push(null);
            const moved = icons.splice(homeDragSrcIdx, 1)[0];
            icons.splice(targetIdx, 0, moved);
            // Trim trailing nulls beyond 12
            while (icons.length > 12 && icons[icons.length - 1] === null) icons.pop();
            homeDragSrcIdx = targetIdx;
            _renderGrid(container, icons, page, targetIdx);
            _applyJiggleClass(container);
        }
    }

    function _onDragEnd(e, page) {
        clearTimeout(_homeEdgeTimer);
        _homeEdgeTimer = null;
        _homeEdgeSide = null;
        const container = page === 'p1' ? document.getElementById('homeGrid1') : document.getElementById('homeGrid2');
        if (container) container.querySelectorAll('.drag-over').forEach(b => b.classList.remove('drag-over'));
        homeDragSrcIdx = null;
        _homeSaveOrder();   // 3.8.1: keep the new layout
    }

    // ── Page slide navigation ──────────────────────────────
    function homeGoToPage(idx) {
        homePageIdx = idx;
        const track = document.getElementById('homeSliderTrack');
        if (track) track.style.transform = idx === 0 ? '' : 'translateX(-50%)';
        document.querySelectorAll('.home-dot').forEach((d, i) => {
            d.classList.toggle('active', i === idx);
        });
        if (homeJiggling) _exitJiggle();
    }

    // ── Touch handling for page swipe (on the slider) ──────
    let _hsTouchX0 = 0, _hsTouchY0 = 0, _hsTracking = false;

    function initHomeSliderTouch() {
        const slider = document.getElementById('homeSlider');
        if (!slider) return;
        slider.addEventListener('touchstart', e => {
            _hsTouchX0 = e.touches[0].clientX;
            _hsTouchY0 = e.touches[0].clientY;
            _hsTracking = true;
}, { passive: true });
        slider.addEventListener('touchend', e => {
            if (!_hsTracking) return;
            _hsTracking = false;
            const dx = e.changedTouches[0].clientX - _hsTouchX0;
            const dy = e.changedTouches[0].clientY - _hsTouchY0;
            if (Math.abs(dx) > Math.abs(dy) * 1.2 && Math.abs(dx) > 50) {
                if (dx < 0 && homePageIdx === 0) homeGoToPage(1);
                else if (dx > 0 && homePageIdx === 1) homeGoToPage(0);
            }
}, { passive: true });
    }

    function updateExpensesTotals() {
        // 12 complete months (excluding the current partial month) — 3.7.1: same total as annual spending
        const yearTotal = getTrackedAnnualExpenses();
        const monthlyAvg = yearTotal / 12;

        document.getElementById('expensesYearTotal').textContent = fmtExpense(yearTotal);
        document.getElementById('expensesMonthlyAvg').textContent = `Monthly Avg: ${fmtExpense(monthlyAvg)}`;
        buildExpensesChart();
        renderExpenseSnapshotList();
    }

    function buildExpensesChart() {
        const ctx = document.getElementById('expensesChart');
        if (!ctx) return;

        const isSunset = (document.body.classList.contains('sunset-theme') || document.body.classList.contains('navy-theme'));
        const isDark = document.body.classList.contains('alaskan-theme') || isSunset;

        const barColor   = isSunset ? tc('#E08020') : '#D4AF37';
        const gridColor  = 'rgba(255,255,255,0.08)';
        const tickColor  = isSunset ? tc('#D0B090') : '#A0B8CC';
        const bgColor    = isDark   ? (isSunset ? tc('rgba(35,8,4,0.0)') : 'rgba(10,26,47,0.0)') : 'rgba(0,0,0,0.0)';

        // Build last 12 complete months
        const today = new Date();
        const labels = [];
        const data   = [];
        for (let m = 11; m >= 0; m--) {
            const d = new Date(today.getFullYear(), today.getMonth() - m - 1, 1);
            const key = moKey(d);
const monthLabel = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
            const total = expenses
                .filter(e => e.date && e.date.startsWith(key))
                .reduce((s, e) => s + (e.amount || 0), 0);
            labels.push(monthLabel);
            data.push(Math.round(total));
        }

        // Destroy existing chart if present
        if (window._expensesChart instanceof Chart) {
            window._expensesChart.destroy();
        }

        const avg = data.length ? Math.round(data.reduce((a,b)=>a+b,0) / data.length) : 0;
        const avgColor = isSunset ? tc('#F5C030') : '#D4AF37';

        window._expensesChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    {
                        label: '',
                        data,
                        backgroundColor: barColor + 'CC',
                        borderColor: barColor,
                        borderWidth: 1,
                        borderRadius: 4,
                        order: 2,
                    },
                    {
                        label: 'Monthly Average',
                        data: data.map(() => avg),
                        type: 'line',
                        borderColor: avgColor,
                        borderWidth: 2,
                        borderDash: [5, 5],
                        pointRadius: 0,
                        fill: false,
                        order: 1,
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: isSunset ? tc('rgba(20,4,2,0.95)') : '#0A1A2F',
                        titleColor: barColor,
                        bodyColor: tickColor,
                        callbacks: {
                            label: ctx => '$' + ctx.raw.toLocaleString()
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { color: gridColor },
                        ticks: { color: tickColor, font: { size: 10 } }
                    },
                    y: {
                        grid: { color: gridColor },
                        ticks: {
                            color: tickColor,
                            font: { size: 10 },
                            callback: v => '$' + (v >= 1000 ? (v/1000).toFixed(0)+'k' : v)
                        },
                        beginAtZero: true
                    }
                }
            }
        });
        // Custom HTML avg-line label — below chart, always readable
        const avgLegEl = document.getElementById('expensesAvgLegend');
        if (avgLegEl) {
            const lblColor = isSunset ? tc('#D0A888') : '#A0B8CC';
            avgLegEl.innerHTML =
                '<span style="display:inline-flex;align-items:center;gap:6px;color:' + lblColor + ';">' +
                '<svg width="28" height="10" style="flex-shrink:0"><line x1="0" y1="5" x2="28" y2="5" ' +
                'stroke="' + avgColor + '" stroke-width="2" stroke-dasharray="5,4"/></svg>' +
                'Monthly Average</span>';
        }
    }

