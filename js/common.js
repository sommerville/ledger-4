// Sommerville Ledger 4 — common.js
// Delete all, fullscreen charts, header balance, refresh, fmt and modal helpers, icon size, service worker
// Part of index.html (3.5.2 split). Plain script, loaded in order; all files share one global scope.
    // ─── Delete All ──────────────────────────────────────────
    function deleteAll() {
        // Reset all in-memory data
        entries          = [];
        accounts         = [];
        institutions     = ['M1', 'Charles Schwab', 'Sofi', 'T.Rowe', 'Empower', 'HSA Bank'];
        expenses         = [];
        companies        = [];
        yearlyGoals      = {};
        metalsData       = {};
        debtAccounts     = [];
        debtEntries      = [];
        incomeEntries    = [];
        payers           = [];
        retirementContribs = [];
        retirementLimits   = {};
        retirementSources  = [];
        coastContribs      = [];
        coastAccounts      = [];
        loanPeople         = [];
        loanEvents         = [];
        goalLadders        = {}; _goalCache = null;   // 3.8

        // Remove all financial data from localStorage
        const keysToRemove = [
            'pf_entries', 'pf_accounts', 'pf_institutions',
            'pf_expenses', 'pf_companies', 'pf_yearlyGoals',
            'pf_metalsData',
            'pf_debtAccounts', 'pf_debtEntries', 'pf_bulkDebtPayments',
            'pf_incomeEntries', 'pf_payers',
            'pf_retirementContribs', 'pf_retirementLimits', 'pf_retirementSources',
            'pf_coastContribs', 'pf_coastAccounts', 'pf_loanPeople', 'pf_loanEvents', 'pf_goalLadders',
            'pf_logbook', 'pf_home_values', 'pf_properties', 'pf_monteCarlo', 'pf_monthNotes',
            'pf_taxRate', 'pf_taxEnabled', 'pf_dt_user_age',
            'pf_last_income_type', 'pf_last_income_payer',
            'pf_ret_lastHolder', 'pf_ret_lastInst', 'pf_ret_lastSponsor', 'pf_ret_lastType',
            'pf_pin_hint', 'pf_basicCalcEnabled'
        ];
        keysToRemove.forEach(k => localStorage.removeItem(k));

        refreshAll();
        closeModal('confirmDeleteModal');
        closeModal('settingsModal');
    }
    function buildChart() {
        const isDark = document.body.classList.contains('alaskan-theme') || document.body.classList.contains('sunset-theme');
        const isAnyDark = isDark;

        const lineColor = '#D4AF37';
        const bgColor   = 'rgba(212,175,55,0.1)';

        const ctx = document.getElementById('myChart').getContext('2d');
        chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Balance',
                    data: [],
                    borderColor: lineColor,
                    backgroundColor: bgColor,
                    tension: 0.4,
                    fill: true,
                    pointRadius: 0,
                    pointHoverRadius: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    x: {
                        type: 'category',
                        ticks: {
                            autoSkip: true,
                            maxTicksLimit: 12,
                            color: isAnyDark ? '#C0C0C0' : '#666'
                        },
                        grid: {
                            color: isAnyDark ? '#5A6F83' : '#d0d0d0'
                        }
                    },
                    y: {
                        beginAtZero: false,
                        ticks: {
                            callback: v => {
                                const a = Math.abs(v);
                                if (a >= 1e6) return '$' + Math.round(v/1e6) + 'M';
                                if (a >= 1e3) return '$' + Math.round(v/1e3) + 'k';
                                return '$' + Math.round(v);
                            },
                            color: isAnyDark ? '#C0C0C0' : '#666'
                        },
                        grid: {
                            color: isAnyDark ? '#5A6F83' : '#d0d0d0'
                        }
                    }
                }
            }
        });
    }

    // ─── Fullscreen Chart Functions ──────────────────────────
    let fullscreenChart = null;

    function toggleChartFullscreen() {
        const modal = document.getElementById('chartFullscreenModal');
        modal.classList.add('open');

        // Build fullscreen chart after a short delay to ensure modal is visible
        setTimeout(() => {
            buildFullscreenChart();
        }, 50);
    }

    function closeChartFullscreen() {
        const modal = document.getElementById('chartFullscreenModal');
        modal.classList.remove('open');

        // Destroy fullscreen chart
        if (fullscreenChart) {
            fullscreenChart.destroy();
            fullscreenChart = null;
        }
    }

    function buildFullscreenChart() {
        // Destroy existing chart if any
        if (fullscreenChart) {
            fullscreenChart.destroy();
        }

        // Get chart data using same function as main chart
        const data = getChartData();

        // Determine colors based on theme
        const isDarkWing2 = document.body.classList.contains('alaskan-theme') || document.body.classList.contains('sunset-theme');
        const isAnyDark2 = isDarkWing2;

        let lineColor = isDarkWing2 ? '#D4AF37' : '#C87820';
        let bgColor   = isDarkWing2 ? 'rgba(212,175,55,0.1)' : 'rgba(200,120,32,0.12)';

        const ctx = document.getElementById('fullscreenChart').getContext('2d');
        fullscreenChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: data.map(d => d.label || fmtDate(d.date)),
                datasets: [{
                    label: 'Balance',
                    data: data.map(d => d.amount),
                    borderColor: lineColor,
                    backgroundColor: bgColor,
                    tension: 0.4,
                    fill: true,
                    pointRadius: 5,
                    pointHoverRadius: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false
                },
                plugins: {
                    legend: { display: false },
                    zoom: {
                        pan: {
                            enabled: true,
                            mode: 'x'
                        },
                        zoom: {
                            wheel: {
                                enabled: true
                            },
                            pinch: {
                                enabled: true
                            },
                            mode: 'x'
                        }
                    }
                },
                scales: {
                    x: {
                        type: 'category',
                        ticks: {
                            autoSkip: true,
                            maxTicksLimit: 12
                        }
                    },
                    y: {
                        beginAtZero: false,
                        ticks: { callback: v => '$' + Math.round(v).toLocaleString() }
                    }
                }
            }
        });
    }

    function setView(btn) {
        currentView = btn.dataset.view;
        document.querySelectorAll('.chart-controls button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        refreshAll();
    }

    function updateChart() {
        if (!chart) return;
        const data = getChartData();
        chart.data.labels = data.map(d => d.label || fmtDate(d.date));
        chart.data.datasets[0].data = data.map(d => demoMode ? d.amount * 0.01 : d.amount);
        chart.update();
    }

    function getChartData() {
        const relevantAccounts = currentView === 'total'
            ? accounts
            : accounts.filter(a => a.type === currentView);

        const dates = [...new Set(
            entries
                .filter(e => e.date >= '2024-01-01')
                .filter(e => currentView === 'total' || e.accountType === currentView)
                .map(e => e.date)
        )].sort();

        const since2024 = entries.filter(e => e.date >= '2024-01-01');
        const dataPoints = dates.map(date => {
            let total = 0;
            // 3.7.1: latest entry by date on or before this day (was the last matching entry in the list)
            relevantAccounts.forEach(acct => { total += LC.balance(since2024, acct.id, date); });
            return { date, amount: total };
        });

        // Infer 2023 year-end balance from each account's earliest 2024 entry
        let yearEnd2023 = 0;
        relevantAccounts.forEach(acct => {
            const earliest2024 = entries
                .filter(e => e.accountId === acct.id && e.date >= '2024-01-01')
                .sort((a, b) => a.date.localeCompare(b.date))[0];
            if (earliest2024) yearEnd2023 += earliest2024.amount;
        });

        const result = dataPoints.filter(d => d.amount > 0);
        if (yearEnd2023 > 0) {
            // Use 2023-12-32 as a sentinel that sorts before 2024 but after real Dec dates;
            // label it manually via a display property instead of relying on fmtDate
            result.unshift({ date: '2023-12-31', amount: yearEnd2023, label: "Dec '23" });
        }
        return result;
    }

    // ─── Header Balance ──────────────────────────────────────
    function updateHeader() {
        const labels = {
            total: 'Total Invested',
            '401k': '401k Balance',
            hsa: 'HSA Balance',
            ira: 'IRA Balance',
            taxable: 'Taxable Balance',
            metals: 'Metals Balance'
        };

        const relevantAccounts = currentView === 'total'
            ? accounts
            : accounts.filter(a => a.type === currentView);

        const total = LC.investTotal(relevantAccounts, entries, null);   // 3.7: latest by date (was the last entry in the list)

        const balEl = document.getElementById('headerBalance');
        const lblEl = document.getElementById('headerLabel');
        if (balEl) balEl.textContent = fmt(total);
        if (lblEl) lblEl.textContent = labels[currentView] || 'Total Invested';
        renderInvestSnapshotList();
    }

    // ─── Projections ─────────────────────────────────────────
    const BIRTHDAY = new Date(1985, 3, 29); // April 29, 1985

    function getCurrentAge() {
        const today = new Date();
        let age = today.getFullYear() - BIRTHDAY.getFullYear();
        const hasBirthdayPassed = today.getMonth() > BIRTHDAY.getMonth() ||
            (today.getMonth() === BIRTHDAY.getMonth() && today.getDate() >= BIRTHDAY.getDate());
        if (!hasBirthdayPassed) age--;
        return age;
    }

    function getCurrentTotal() { return LC.investTotal(accounts, entries, null); }   // 3.7: same as getTotalInvestments()

    // ─── Refresh All ─────────────────────────────────────────
    function refreshAll() {
        updateHeader();
        updateChart();
    }

    // ─── Helpers ─────────────────────────────────────────────
    function fmt(n) {
        const value = demoMode ? n * 0.01 : n;
return new Intl.NumberFormat('en-US', { style:'currency', currency:'USD', maximumFractionDigits:0 }).format(Math.round(value));
    }

    function fmtExpense(n) {
return new Intl.NumberFormat('en-US', { style:'currency', currency:'USD', maximumFractionDigits:0 }).format(Math.round(n));
    }

    function fmtDate(str) {
        const d = new Date(str);
const month = d.toLocaleDateString('en-US', { month: 'short' });
        const year = String(d.getFullYear()).slice(-2);
        return `${month} '${year}`;
    }

    // ─── Custom Modal Functions ──────────────────────────────

// v3.0: the Early Retirement Plan (erCalcP1…erCalcP4) moved to the desktop planner — see desktop.html rpCompute().
    // Taxable total is still used by the Coast FIRE milestones.
    function getTaxableTotal() { return LC.taxableTotal(accounts, entries, null); }   // 3.7: ledger-core.js



// ── Service Worker — register real sw.js file ──────────────────────
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
navigator.serviceWorker.register('./sw.js', { scope: './' })
            .then(reg => {
                // Force immediate update check
                reg.update();
            })
            .catch(() => {});
    });
}

        // ── Icon Size ──────────────────────────────────────────────
        function applyIconSize(px) {
            px = parseInt(px);
            document.querySelectorAll('.home-icon').forEach(el => {
                el.style.width  = px + 'px';
                el.style.height = px + 'px';
            });
            document.querySelectorAll('.home-icon svg, .home-icon img').forEach(el => {
                el.setAttribute && el.setAttribute('width',  px);
                el.setAttribute && el.setAttribute('height', px);
                el.style && (el.style.width  = px + 'px');
                el.style && (el.style.height = px + 'px');
                el.style && (el.style.objectFit = 'contain');
            });
            // Reflow grid columns to fit icon size
            document.querySelectorAll('.home-grid').forEach(g => {
                g.style.gridTemplateColumns = `repeat(auto-fill, minmax(${px}px, 1fr))`;
            });
            localStorage.setItem('pf_iconSize', px);
        }

        function loadIconSize() {
            const saved = localStorage.getItem('pf_iconSize');
            const px = saved ? parseInt(saved) : 88;
            applyIconSize(px);
        }

    
