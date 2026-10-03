// Sommerville Ledger 4 — storage.js
// Saving and loading pf_ keys, PIN encryption
// Part of index.html (3.5.2 split). Plain script, loaded in order; all files share one global scope.
    // ─── Storage ─────────────────────────────────────────────
    function loadFromStorage() {
        // 3.6: start every load with saving allowed; decrypt() turns it off if a saved list can't be read
        _loadFailures = 0;
        _saveBlocked  = false;

        try {
            const data = localStorage.getItem('pf_entries');
            entries = decrypt(data) || [];
        } catch(e) { entries = []; }

        try {
            const data = localStorage.getItem('pf_accounts');
            accounts = decrypt(data) || [];
        } catch(e) { accounts = []; }

        try {
            const data = localStorage.getItem('pf_expenses');
            expenses = decrypt(data) || [];
        } catch(e) { expenses = []; }

        try {
            const data = localStorage.getItem('pf_companies');
            companies = decrypt(data) || [];
        } catch(e) { companies = []; }

        try {
            const data = localStorage.getItem('pf_yearlyGoals');
            yearlyGoals = decrypt(data) || {};
        } catch(e) { yearlyGoals = {}; }

        try {
            const data = localStorage.getItem('pf_metalsData');
            metalsData = decrypt(data) || {};
        } catch(e) { metalsData = {}; }

        try {
            const data = localStorage.getItem('pf_debtAccounts');
            debtAccounts = decrypt(data) || [];
        } catch(e) { debtAccounts = []; }

        try {
            const data = localStorage.getItem('pf_debtEntries');
            debtEntries = decrypt(data) || [];
        } catch(e) { debtEntries = []; }

        try {
            const data = localStorage.getItem('pf_bulkDebtPayments');
            bulkDebtPayments = decrypt(data) || [];
        } catch(e) { bulkDebtPayments = []; }

        try {
            const data = localStorage.getItem('pf_monthNotes');
            monthNotes = decrypt(data) || {};
        } catch(e) { monthNotes = {}; }

        try {
            const data = localStorage.getItem('pf_incomeEntries');
            incomeEntries = decrypt(data) || [];
            // One-time cleanup: strip orphaned 'gross' field where 'grossPay' exists
            incomeEntries.forEach(e => { if ('gross' in e && 'grossPay' in e) delete e.gross; });
        } catch(e) { incomeEntries = []; }

        try {
            const data = localStorage.getItem('pf_payers');
            payers = decrypt(data) || [];
        } catch(e) { payers = []; }

        try {
            const data = localStorage.getItem('pf_retirementContribs');
            retirementContribs = decrypt(data) || [];
        } catch(e) { retirementContribs = []; }

        try {
            const data = localStorage.getItem('pf_retirementLimits');
            retirementLimits = decrypt(data) || {};
        } catch(e) { retirementLimits = {}; }

        try {
            const data = localStorage.getItem('pf_retirementSources');
            retirementSources = decrypt(data) || [];
        } catch(e) { retirementSources = []; }
        // 3.6: these tidy-ups save. If a list failed to load, saving is blocked and they throw;
        // the rest of the load must still run so the app opens (read-only) and shows the warning.
        try { purgeOrphanedRetirementSources(); } catch(e) {}
        try { linkBonusPayers(); } catch(e) {}
        try { migrateRetirementSources(); } catch(e) {}
        try { loadCoastData(); } catch(e) {}
        try { loadLoans(); } catch(e) {}   // v3.4

        try {
            const data = localStorage.getItem('pf_institutions');
            const inst = decrypt(data);
            if (Array.isArray(inst) && inst.length) institutions = inst;
        } catch(e) {}

        // Load theme preference (not encrypted)
        const theme = localStorage.getItem('pf_theme') || 'alaskan';
        setTheme(theme);

        // v15.0: mobile is standalone — clear leftover desktop-switch keys
        localStorage.removeItem('pf_deviceMode');
        sessionStorage.removeItem('pf_handoff_pin');

        // Tax rate — v3.1: set in the desktop planner. The phone keeps its last saved rate (read-only)
        // for its quick FIRE numbers, and exports it so the planner can start from it.
        const savedTaxRate = localStorage.getItem('pf_taxRate');
        if (savedTaxRate !== null) taxRatePct = parseFloat(savedTaxRate) || 25;

        // 3.6: load warning, persistent storage request, backup reminder (backup.js)
        if (_saveBlocked) _showLoadError();
        if (typeof ledgerAfterLoad === 'function') ledgerAfterLoad();
    }

    // ─── 3.6: failed loads block saving ──────────────────────
    // Before 3.6 a list that failed to decrypt came back empty, and the next save made the loss permanent.
    // Now a failure turns saving off for the session (encrypt() refuses) and a red banner explains it.
    // Loading a backup (Settings → Manage Data) turns saving back on, because it replaces everything.
    let _loadFailures = 0;
    let _saveBlocked  = false;
    function _showLoadError() {
        let el = document.getElementById('loadErrorBanner');
        if (!el) {
            el = document.createElement('div');
            el.id = 'loadErrorBanner';
            el.setAttribute('role', 'alert');
            el.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:30000;background:#B71C1C;color:#fff;font:600 13px/1.4 -apple-system,BlinkMacSystemFont,sans-serif;padding:calc(env(safe-area-inset-top) + 10px) 14px 10px;box-shadow:0 2px 10px rgba(0,0,0,.5);';
            document.body.appendChild(el);
        }
        el.textContent = '⚠️ ' + (_loadFailures || 1) + ' saved list' + (_loadFailures === 1 ? '' : 's') + " couldn't be read, so saving is turned off to protect your data. "
            + 'Lock the app and unlock it with your PIN. If this stays, load your latest backup (Settings → Manage Data).';
        el.style.display = 'block';
    }
    function _hideLoadError() { const el = document.getElementById('loadErrorBanner'); if (el) el.style.display = 'none'; }

    // ─── Encryption Helpers ──────────────────────────────────
    let encryptionKey = null;
    let _sessionPin = null;   // v3.1: kept in memory only while unlocked (opens old PIN-locked backups)

    // 4.0.1: the browser's built-in PBKDF2 (about 10 ms) instead of CryptoJS (over a second on a phone,
    // with the screen frozen after the 4th PIN digit). CryptoJS 4.1.1's PBKDF2 defaults to SHA-1, so this
    // gives the exact same key and existing data opens unchanged. CryptoJS stays as the fallback.
    async function deriveEncryptionKey(pin) {
        try {
            if (window.crypto && crypto.subtle) {
                const enc  = new TextEncoder();
                const base = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits']);
                const bits = await crypto.subtle.deriveBits(
                    { name: 'PBKDF2', salt: enc.encode('portfolio-salt-v1'), iterations: 10000, hash: 'SHA-1' }, base, 256);
                return Array.from(new Uint8Array(bits), b => b.toString(16).padStart(2, '0')).join('');
            }
        } catch (e) { /* fall through to CryptoJS */ }
        return CryptoJS.PBKDF2(pin, 'portfolio-salt-v1', {
            keySize: 256/32,
            iterations: 10000
        }).toString();
    }

    function encrypt(data) {
        if (_saveBlocked) {   // 3.6: never write over data that failed to load
            _showLoadError();
            const err = new Error('Saving is turned off: some saved data could not be read.');
            err.ledgerSaveBlocked = true;
            throw err;
        }
        if (!encryptionKey) return data;
        try {
            const jsonStr = JSON.stringify(data);
            return CryptoJS.AES.encrypt(jsonStr, encryptionKey).toString();
        } catch(e) {
            return data;
        }
    }

    function decrypt(encryptedData) {
        if (!encryptionKey || !encryptedData) return null;
        try {
            // Try to decrypt as encrypted data first
            const bytes = CryptoJS.AES.decrypt(encryptedData, encryptionKey);
            const decryptedStr = bytes.toString(CryptoJS.enc.Utf8);
            if (decryptedStr) {
                return JSON.parse(decryptedStr);
            }
        } catch(e) {}
        // Not encrypted with this key: older data was saved as plain JSON
        try {
            return JSON.parse(encryptedData);
        } catch(e2) {
            // 3.6: something is stored here but can't be read. Count it and stop all saving.
            _loadFailures++;
            _saveBlocked = true;
            return null;
        }
    }

    function saveEntries() { localStorage.setItem('pf_entries', encrypt(entries)); }
    function saveAccounts() { localStorage.setItem('pf_accounts', encrypt(accounts)); }
    function saveInstitutions() { localStorage.setItem('pf_institutions', encrypt(institutions)); }
    function saveExpenses() { localStorage.setItem('pf_expenses', encrypt(expenses)); }
    function saveCompanies() { localStorage.setItem('pf_companies', encrypt(companies)); }
    function saveYearlyGoals() { localStorage.setItem('pf_yearlyGoals', encrypt(yearlyGoals)); }
    function saveMetalsData() { localStorage.setItem('pf_metalsData', encrypt(metalsData)); }
    function saveDebtAccounts() { localStorage.setItem('pf_debtAccounts', encrypt(debtAccounts)); }
    function saveDebtEntries() { localStorage.setItem('pf_debtEntries', encrypt(debtEntries)); }
    function saveBulkDebtPayments() { localStorage.setItem('pf_bulkDebtPayments', encrypt(bulkDebtPayments)); }
    function saveMonthNotes()       { localStorage.setItem('pf_monthNotes', encrypt(monthNotes)); }
    function saveIncomeEntries() { localStorage.setItem('pf_incomeEntries', encrypt(incomeEntries)); }
    function savePayers() { localStorage.setItem('pf_payers', encrypt(payers)); }
    function saveRetirementLimitsData() { localStorage.setItem('pf_retirementLimits',  encrypt(retirementLimits));  }
    function saveRetirementContribs()   { localStorage.setItem('pf_retirementContribs', encrypt(retirementContribs)); }
    function saveRetirementSources()    { localStorage.setItem('pf_retirementSources',  encrypt(retirementSources));  }

    // Remove retirement sources whose sponsor no longer has a matching payer
    // v3.2: a bonus payer ("<Company> — Bonus") links to its company by id (parentId), so renames can't split them
    function bonusPayerFor(payer) {
        if (!payer) return null;
        return payers.find(b => b.defaultType === 'bonus' && (String(b.parentId) === String(payer.id) || b.name === payer.name + ' — Bonus')) || null;
    }
    function linkBonusPayers() {
        let changed = false;
        payers.filter(b => b.defaultType === 'bonus' && !b.parentId).forEach(b => {
            const parent = payers.find(p => p.defaultType !== 'bonus' && b.name === p.name + ' — Bonus');
            if (parent) { b.parentId = parent.id; changed = true; }
        });
        if (changed) savePayers();
        // Older income entries saved only a name: give them their company's id (exact name match only)
        let touched = false;
        incomeEntries.forEach(e => {
            if (e.payerId || !e.payerName) return;
            const p = payers.find(x => x.name === e.payerName);
            if (p) { e.payerId = p.id; touched = true; }
        });
        if (touched) saveIncomeEntries();
    }

    function purgeOrphanedRetirementSources() {
        const payerNames = new Set(payers.map(p => p.name));
        const before = retirementSources.length;
        retirementSources = retirementSources.filter(s => !s.sponsor || payerNames.has(s.sponsor));
        if (retirementSources.length !== before) saveRetirementSources();
    }

    // Split any sources that have both 401k and HSA types into two separate sources
    function migrateRetirementSources() {
        const hsaKeys  = ['hsa_employee','hsa_employer'];
        const k401Keys = ['401k_pretax','401k_roth','after_tax','employer_match'];
        let changed = false;
        const toAdd = [];
        const srcIdRemap = {}; // old sourceId → new HSA sourceId for contrib migration

        retirementSources.forEach(src => {
            const types   = src.contribTypes || [];
            const has401k = types.some(k => k401Keys.includes(k));
            const hasHSA  = types.some(k => hsaKeys.includes(k));
            if (has401k && hasHSA) {
                src.contribTypes = types.filter(k => !hsaKeys.includes(k));
                const hsaExists = retirementSources.some(s =>
                    s.sponsor === src.sponsor &&
                    (s.contribTypes || []).some(k => hsaKeys.includes(k))
                );
                if (!hsaExists) {
                    const newHsaId = 'src_' + Date.now() + '_h';
                    toAdd.push({
                        id:           newHsaId,
                        label:        (src.sponsor || src.label) + ' — HSA',
                        institution:  src.institution || '',
                        sponsor:      src.sponsor || '',
                        contribTypes: types.filter(k => hsaKeys.includes(k))
                    });
                    srcIdRemap[src.id] = newHsaId;
                }
                changed = true;
            }
        });
        retirementSources.push(...toAdd);

        // Re-assign HSA amounts in existing contrib entries to the new HSA source
        if (Object.keys(srcIdRemap).length > 0) {
            retirementContribs.forEach(entry => {
                const newHsaId = srcIdRemap[entry.sourceId];
                if (!newHsaId || !entry.amounts) return;
                const hsaAmounts = {};
                let hsaTotal = 0;
                hsaKeys.forEach(k => {
                    if (entry.amounts[k] > 0) {
                        hsaAmounts[k] = entry.amounts[k];
                        hsaTotal += entry.amounts[k];
                        delete entry.amounts[k];
                    }
                });
                if (hsaTotal > 0) {
                    // Recalc totalAmount for the original entry
                    entry.totalAmount = Object.values(entry.amounts).reduce((a, b) => a + (b || 0), 0);
                    // Create a new HSA contrib entry
                    retirementContribs.push({
                        id:          'rc_' + Date.now() + '_hm',
                        date:        entry.date,
                        sourceId:    newHsaId,
                        sourceName:  toAdd.find(s => s.id === newHsaId)?.label || 'HSA',
                        amounts:     hsaAmounts,
                        totalAmount: hsaTotal,
                        ts:          (entry.ts || Date.now()) + 1
                    });
                }
            });
            retirementContribs.sort((a, b) => a.date.localeCompare(b.date));
            saveRetirementContribs();
        }

        if (changed) saveRetirementSources();
    }

    function setTheme(theme) {
        // Remove all theme classes
        document.body.classList.remove('alaskan-theme', 'sunset-theme');

        // Apply selected theme (only two Alaskan themes)
        if (theme === 'alaskan') {
            document.body.classList.add('alaskan-theme');
        } else if (theme === 'sunset') {
            document.body.classList.add('sunset-theme');
        } else {
            // Default to dark if unrecognized
            document.body.classList.add('alaskan-theme');
            theme = 'alaskan';
        }

        // Update radio buttons
        const darkWingRadio = document.getElementById('themeAlaskan');
        if (darkWingRadio) darkWingRadio.checked = (theme === 'alaskan');
        const sunsetRadio = document.getElementById('themeSunset');
        if (sunsetRadio) sunsetRadio.checked = (theme === 'sunset');

        // Save preference
        localStorage.setItem('pf_theme', theme);

// Rebuild dynamic pages if visible so colors match new theme
        const budgetEl = document.getElementById('budgetPage');
        if (budgetEl && budgetEl.style.display !== 'none') runBudgetCalc();

        // Rebuild charts so colors match new theme immediately
        if (isUnlocked && chart) {
            chart.destroy();
            chart = null;
            buildChart();
        }
        if (isUnlocked) buildNetWorthChart();

// Auto-close the themes modal after selection
        const themesModal = document.getElementById('configThemesModal');
        if (themesModal && themesModal.classList.contains('open')) {
            setTimeout(() => {
                closeModal('configThemesModal');
            }, 300);
        }
    }

