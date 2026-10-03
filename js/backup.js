// Sommerville Ledger 4 — backup.js
// Backup export (locked/plain), import, backup reminder, pre-2024 cleanup
// Part of index.html (3.5.2 split). Plain script, loaded in order; all files share one global scope.
    // ── Backup file ─────────────────────────────────────────
    // v3.0: optional password lock (AES-GCM, key from PBKDF2-SHA256 via WebCrypto),
    // and a share-sheet button so the file can go straight to OneDrive (or any cloud app).
    // 3.6: a passphrase lock was tried and dropped (Darrin's call): backups stay locked with the app PIN.
    function buildBackup() {
        return {
            README: "Portfolio Backup File - How to Reset Yearly Goals: To reset a yearly goal (e.g., if you exceeded the 2026 goal and want to set it again), open this file in a text editor, find the 'yearlyGoals' section, locate the year (e.g., '2026'), and change 'completed: true' to 'completed: false' and set 'completionDate: null'. Then save the file and import it back into the app.",
            schemaVersion: 1,          // bump when the export shape changes — desktop viewer reads this
            app: 'sommerville-ledger-mobile',
            version: 4,
            exportedAt: new Date().toISOString(),
            entries,
            accounts,
            institutions,
            expenses,
            companies,
            yearlyGoals,
            metalsData,
            debtAccounts,
            debtEntries,
            bulkDebtPayments,
            incomeEntries,
            payers,
            retirementContribs,
            retirementLimits,
            retirementSources,
            coastContribs,
            coastAccounts,
            loanPeople,         // v3.4
            loanEvents,         // v3.4
            goalLadders: goalsLoad(),   // 3.8: Settings → Goal steps (only tracks you changed)
            homeOrder: (() => { try { return JSON.parse(localStorage.getItem('pf_homeOrder') || 'null'); } catch (e) { return null; } })(),   // 3.8.1: home icon layout
            logbook: JSON.parse(localStorage.getItem('pf_logbook') || '[]'),
            monthNotes: monthNotes,
            taxAdjustEnabled: taxAdjustEnabled,
            taxRatePct: taxRatePct,
            homeValues: JSON.parse(localStorage.getItem('pf_home_values') || '[]'),
            properties: reProps(),   // v3.5: Real Estate properties (homeValues[].propertyId points here)
            theme:          localStorage.getItem('pf_theme')            || 'alaskan',
            basicCalcEnabled: localStorage.getItem('pf_basicCalcEnabled') || '0',
            userAge:        localStorage.getItem('pf_dt_user_age')      || '',
            pinHint:        localStorage.getItem('pf_pin_hint')         || '',
            erGoal:         localStorage.getItem('pf_er_goal')           || ''
            // v3.1: monteCarloResult, untrackedLiving, healthInsurance no longer exported
            // (Monte Carlo and the living/health estimates moved to the desktop planner)
        };
    }

    const BACKUP_ENC_FORMAT = 'ledger-enc-1';
    const BACKUP_KDF_ITER   = 250000;
    function _b64(buf) { let s = ''; new Uint8Array(buf).forEach(b => s += String.fromCharCode(b)); return btoa(s); }
    function _unb64(str) { const s = atob(str), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; }
    async function _backupKey(password, salt, iter) {
        const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
        return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    }
    // keyType: 'pin' (the 4-digit app PIN). The desktop reads it to word its prompt.
    async function encryptBackup(obj, password, keyType) {
        const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
        const key  = await _backupKey(password, salt, BACKUP_KDF_ITER);
        const ct   = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(obj)));
        // Only non-sensitive labels stay readable; everything else is inside `data`
        return { format: BACKUP_ENC_FORMAT, app: obj.app, schemaVersion: obj.schemaVersion, exportedAt: obj.exportedAt, keyType: keyType || 'pin',
                 kdf: 'PBKDF2-SHA256', iter: BACKUP_KDF_ITER, cipher: 'AES-256-GCM', salt: _b64(salt), iv: _b64(iv), data: _b64(ct) };
    }
    async function decryptBackup(env, password) {
        const key = await _backupKey(password, _unb64(env.salt), env.iter || BACKUP_KDF_ITER);
        try {
            const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: _unb64(env.iv) }, key, _unb64(env.data));
            return JSON.parse(new TextDecoder().decode(pt));
        } catch (e) { throw new Error('Wrong PIN or password (or the file is damaged).'); }
    }

    let _exportMsgTimer = null;
    function _exportMsg(text, ok) {
        const m = document.getElementById('exportMsg'); if (!m) return;
        clearTimeout(_exportMsgTimer);
        m.textContent = text; m.className = 'msg ' + (ok ? 'success' : 'error'); m.style.display = 'block';
        if (ok) _exportMsgTimer = setTimeout(() => { m.style.display = 'none'; }, 6000);
    }
    // v3.1: a message with a button, so nothing happens without a tap (no silent downloads)
    function _exportPrompt(text, buttons) {   // buttons: [[label, onTap], …]
        const m = document.getElementById('exportMsg'); if (!m) return;
        clearTimeout(_exportMsgTimer);
        m.className = 'msg'; m.style.display = 'block';
        m.innerHTML = '';
        const t = document.createElement('div'); t.textContent = text; t.style.marginBottom = '8px'; m.appendChild(t);
        buttons.forEach(([label, onTap], i) => {
            const b = document.createElement('button'); b.className = 'action-btn' + (i ? ' dark' : ''); b.style.margin = i ? '8px 0 0' : '0'; b.textContent = label;
            b.onclick = () => { m.style.display = 'none'; onTap(); };
            m.appendChild(b);
        });
    }
    function _downloadFile(text, name, quiet) {
        const blob = new Blob([text], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 10000);
        if (quiet) return;
        _markExported();
        _exportMsg('✅ Downloaded ' + name + ' to this phone\'s Downloads folder.', true);
    }
    // Chrome on Android refuses .json in the share sheet ("NotAllowedError: Permission denied") even
    // though canShare() says yes, so shares always go out as a .txt copy of the same JSON (allowed
    // everywhere). Both apps load .txt backups. Returns null if the browser can't share files at all.
    function _shareableFile(text, jsonName) {
        if (!navigator.canShare) return null;
        const asTxt = new File([text], jsonName.replace(/\.json$/, '.txt'), { type: 'text/plain' });
        if (navigator.canShare({ files: [asTxt] })) return asTxt;
        const asJson = new File([text], jsonName, { type: 'application/json' });
        if (navigator.canShare({ files: [asJson] })) return asJson;
        return null;
    }
    async function _shareFile(file, json, locked, attempt) {
        const dl = ['⬇️ Download to this phone instead', () => _downloadFile(json, file.name.replace(/\.txt$/, '.json'))];
        try {
            // Files only on the retry: some Android share targets choke on a title next to a file
            await navigator.share(attempt === 1 ? { files: [file], title: file.name } : { files: [file] });
            _markExported();
            _exportMsg('✅ Sent ' + file.name + (locked ? ' (locked)' : '') + '. Check that it arrived in OneDrive.', true);
        } catch (err) {
            const why = (err.name || 'Error') + (err.message ? ': ' + err.message : '');
            if (err.name === 'AbortError') { _exportMsg('Share cancelled or no app accepted the file. Nothing was saved. (' + why + ')', false); return; }
            if (attempt === 1) {
                try { if (document.fullscreenElement && document.exitFullscreen) await document.exitFullscreen(); } catch (e) {}
                _exportPrompt('Backup ready: ' + file.name + '. The share sheet didn\'t open (' + why + ').',
                    [['📤 Tap to try again', () => _shareFile(file, json, locked, 2)], dl]);
                return;
            }
            _exportPrompt('The share sheet still didn\'t open (' + why + '). Download it instead, then upload it from the OneDrive app.', [dl]);
        }
    }

    // Builds the backup text (locked with the PIN if asked). Throws an Error with a user-facing message.
    async function _buildExport(locked) {
        let out = buildBackup();
        if (locked) {
            const pw = _sessionPin;   // v3.1: locked with the app PIN
            if (!pw) throw new Error('Lock the app (Settings → Security) and unlock it with your PIN, then save again.');
            if (!window.crypto || !crypto.subtle) throw new Error("This browser can't encrypt files. Uncheck the lock or use Chrome/Safari.");
            try { out = await encryptBackup(out, pw, 'pin'); } catch (e) { throw new Error('Encryption failed: ' + e.message); }
        }
        const json = JSON.stringify(out, null, locked ? 0 : 2);
        const name = `ledger-${moKey(new Date())}-${String(new Date().getDate()).padStart(2, '0')}${locked ? '-locked' : ''}.json`; // local date
        return { json, name, locked };
    }
    // v3.1: Android only opens the share sheet if navigator.share() runs right on the tap. Locking the
    // backup takes a moment, so it's prepared in the background when Manage Data opens (and when the
    // lock box changes); the Save tap then shares the ready file immediately.
    let _prepared = null;
    async function _prepareExport() {
        _prepared = null;
        if (demoMode) return;
        const locked = !!document.getElementById('exportEncrypt')?.checked;
        try { const r = await _buildExport(locked); _prepared = { ...r, file: _shareableFile(r.json, r.name), at: Date.now() }; }
        catch (e) { _prepared = null; }
    }

    async function exportData(mode = 'download') {
        // Prevent export in demo mode
        if (demoMode) {
            alert('⚠️ Export is disabled in Demo Mode. Please disable Demo Mode in Settings first.');
            return;
        }
        const locked = !!document.getElementById('exportEncrypt')?.checked;

        // Share sheet → OneDrive / Drive / Files (phones). Never falls through to a silent download.
        if (mode === 'share') {
            const p = _prepared;
            if (p && p.locked === locked && Date.now() - p.at < 10 * 60 * 1000 && p.file) {
                _shareFile(p.file, p.json, locked, 1);      // no await before this: keeps the tap "fresh"
                return;
            }
            let r;
            try { r = await _buildExport(locked); } catch (e) { _exportMsg('❌ ' + e.message); return; }
            const file = _shareableFile(r.json, r.name);
            if (!file) {
                _exportPrompt("This browser can't send files to the share sheet.", [['⬇️ Download to this phone instead', () => _downloadFile(r.json, r.name)]]);
                return;
            }
            _prepared = { ...r, file, at: Date.now() };
            await _shareFile(file, r.json, locked, 1);
            return;
        }

        let json, suggestedName;
        try { const r = await _buildExport(locked); json = r.json; suggestedName = r.name; } catch (e) { _exportMsg('❌ ' + e.message); return; }

        // Try modern File System Access API first (real save dialog)
        if (window.showSaveFilePicker) {
            try {
                const fileHandle = await window.showSaveFilePicker({
                    suggestedName,
                    types: [{ description: 'Ledger Backup', accept: { 'application/json': ['.json'] } }]
                });
                const writable = await fileHandle.createWritable();
                await writable.write(json);
                await writable.close();
                _markExported();
                _exportMsg('✅ Saved ' + suggestedName, true);
                return; // success — done
            } catch (err) {
                if (err.name === 'AbortError') return; // user cancelled — do nothing
                // Other error: fall through to legacy download
            }
        }
        // Legacy fallback (the Download button)
        _downloadFile(json, suggestedName);
    }

    // ── 3.6: backup reminder + persistent storage ────────────
    // pf_lastExport (UI only, not in the backup): when a backup last left this phone (shared, saved or downloaded).
    const BACKUP_REMIND_DAYS = 30;
    function _markExported() {
        try { localStorage.setItem('pf_lastExport', new Date().toISOString()); } catch (e) {}
        _renderBackupBanner();
    }
    function _daysSinceExport() {
        const t = Date.parse(localStorage.getItem('pf_lastExport') || '');
        return isNaN(t) ? null : Math.floor((Date.now() - t) / 86400000);
    }
    function _renderBackupBanner() {
        const el = document.getElementById('backupBanner'); if (!el) return;
        const d = _daysSinceExport();
        const show = d === null || d >= BACKUP_REMIND_DAYS;
        el.style.display = show ? '' : 'none';
        if (show) el.textContent = d === null
            ? '💾 No backup saved from this phone yet. Tap to save one.'
            : '💾 Last backup ' + d + ' days ago. Tap to save one.';
        // 4.0: keep page 2's top row of icons out from under the banner
        document.body.classList.toggle('bk-banner-on', show);
        if (show) requestAnimationFrame(() => { const r = el.getBoundingClientRect(); if (r.bottom > 0) document.body.style.setProperty('--bk-banner-h', Math.ceil(r.bottom + 6) + 'px'); });
    }
    function openBackupFromBanner() { openModal('dataManagementModal'); _prepareExport(); }

    // Ask the browser not to clear this site's storage under pressure (Chrome grants it to installed apps).
    let _persistState = null;   // 'kept' | 'not-kept' | 'unsupported'
    async function _requestPersist() {
        try {
            if (!navigator.storage || !navigator.storage.persist) _persistState = 'unsupported';
            else _persistState = (await navigator.storage.persisted()) || (await navigator.storage.persist()) ? 'kept' : 'not-kept';
        } catch (e) { _persistState = 'unsupported'; }
        _renderPersistState();
    }
    function _renderPersistState() {
        const el = document.getElementById('storagePersistStatus'); if (!el) return;
        el.textContent = _persistState === 'kept'
            ? '✓ Storage is kept: the browser won’t clear your data on its own.'
            : _persistState === 'not-kept'
                ? '⚠️ The browser may clear this app’s data if the phone runs low on space. Install the app to the home screen, and save backups often.'
                : _persistState === 'unsupported' ? '⚠️ This browser can’t promise to keep your data. Save backups often.' : '';
    }
    // Called at the end of loadFromStorage() (each unlock)
    function ledgerAfterLoad() {
        goalLadders = null; _goalCache = null;   // 3.8: goal steps reload with the new key
        try { localStorage.removeItem('pf_backupPassCheck'); } catch (e) {}   // left over from the dropped passphrase step
        _prepared = null;
        _renderBackupBanner();
        _requestPersist();
    }

    // v3.0: a locked backup is parked here until its PIN (or password) is entered
    let _pendingLockedImport = null;
    function _askImportPassword(b) {
        const pin = b.keyType === 'pin';
        _pendingLockedImport = b;
        document.getElementById('importMsg').style.display = 'none';
        const pw = document.getElementById('importPw');
        document.getElementById('importPwMsg').textContent = pin
            ? '🔒 This backup is locked with a PIN. Enter the 4-digit PIN it was saved with.'
            : '🔒 This backup is locked. Enter the password it was saved with.';
        pw.placeholder = pin ? 'PIN' : 'Backup password';
        pw.inputMode = pin ? 'numeric' : 'text';
        document.getElementById('importPwWrap').style.display = '';
        pw.focus();
    }
    async function unlockImport() {
        const msgDiv = document.getElementById('importMsg');
        if (!_pendingLockedImport) return;
        try {
            const b = await decryptBackup(_pendingLockedImport, document.getElementById('importPw').value);
            _pendingLockedImport = null;
            document.getElementById('importPw').value = '';
            document.getElementById('importPwWrap').style.display = 'none';
            applyImport(b);
        } catch (err) {
            msgDiv.textContent = '❌ ' + err.message; msgDiv.className = 'msg error'; msgDiv.style.display = 'block';
        }
    }

    function importData(event) {
        const file = event.target.files[0];
        if (!file) return;
        const msgDiv = document.getElementById('importMsg');

        const reader = new FileReader();
        reader.onload = async function(e) {
            event.target.value = '';
            let b;
            try { b = JSON.parse(e.target.result); }
            catch (err) { msgDiv.textContent = '❌ That file isn’t a Ledger backup (' + err.message + ').'; msgDiv.className = 'msg error'; msgDiv.style.display = 'block'; return; }
            if (b && b.format === BACKUP_ENC_FORMAT) {
                // Try this phone's PIN first
                for (const pw of [_sessionPin]) {
                    if (!pw) continue;
                    try { const plain = await decryptBackup(b, pw); applyImport(plain); return; } catch (x) {}
                }
                _askImportPassword(b);
                return;
            }
            applyImport(b);
        };
        reader.readAsText(file);
    }

    // ── 3.6: import asks first ───────────────────────────────
    // Shows the file next to what's on the phone, asks, saves a copy of the phone's data, then loads.
    function _newestDate(src) {
        let m = '';
        ['entries', 'expenses', 'incomeEntries', 'debtEntries', 'coastContribs', 'retirementContribs', 'loanEvents'].forEach(k =>
            (Array.isArray(src[k]) ? src[k] : []).forEach(e => { if (e && typeof e.date === 'string' && e.date > m) m = e.date; }));
        return m ? m.slice(0, 10) : '';
    }
    function _importSummary(b) {
        const n = x => Array.isArray(x) ? x.length : 0;
        const cur = { entries, accounts, expenses, incomeEntries, debtEntries, coastContribs, retirementContribs, loanEvents };
        const rows = [['Accounts', 'accounts'], ['Balance entries', 'entries'], ['Bills', 'expenses'], ['Income', 'incomeEntries'],
                      ['Debt balances', 'debtEntries'], ['Coast savings', 'coastContribs'], ['Retirement', 'retirementContribs'], ['Loans', 'loanEvents']];
        const saved = b.exportedAt && !isNaN(Date.parse(b.exportedAt))
            ? new Date(b.exportedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'unknown date';
        const fileNew = _newestDate(b), phoneNew = _newestDate(cur);
        let t = 'Load this backup? It REPLACES what’s on this phone.\n\n'
              + 'File: saved ' + saved + (fileNew ? ', newest entry ' + fileNew : '') + '\n'
              + 'Phone: newest entry ' + (phoneNew || 'none') + '\n\n'
              + rows.map(([l, k]) => l + ': file ' + n(b[k]) + ' · phone ' + n(cur[k])).join('\n');
        const warn = [];
        if (phoneNew && fileNew && phoneNew > fileNew) warn.push('⚠️ This phone has entries newer than the file. They will be lost.');
        if (n(b.entries) < n(cur.entries) || n(b.expenses) < n(cur.expenses) || n(b.incomeEntries) < n(cur.incomeEntries)) warn.push('⚠️ The file has fewer entries than this phone.');
        if (typeof b.schemaVersion === 'number' && b.schemaVersion > 1) warn.push('⚠️ This file is from a newer app (schema v' + b.schemaVersion + '). Some of it may not load.');
        if (warn.length) t += '\n\n' + warn.join('\n');
        t += '\n\nA copy of this phone’s data downloads first, so you can undo.';
        return t;
    }
    // A copy of what's on the phone before an import replaces it. Locked with the PIN when possible.
    async function _safetyCopy() {
        const name = `ledger-${moKey(new Date())}-${String(new Date().getDate()).padStart(2, '0')}-before-import`;
        let out = buildBackup();
        const pw = _sessionPin;
        if (pw && window.crypto && crypto.subtle) {
            out = await encryptBackup(out, pw, 'pin');
            _downloadFile(JSON.stringify(out), name + '-locked.json', true);
        } else {
            _downloadFile(JSON.stringify(out, null, 2), name + '.json', true);
        }
        return name;
    }
    async function applyImport(b) {
        const msgDiv = document.getElementById('importMsg');
        if (!b || !Array.isArray(b.entries) || !Array.isArray(b.accounts)) {
            msgDiv.textContent = '❌ Unrecognized file format (no accounts or entries).'; msgDiv.className = 'msg error'; msgDiv.style.display = 'block';
            return;
        }
        if (!confirm(_importSummary(b))) {
            msgDiv.textContent = 'Nothing was loaded. Your data is unchanged.'; msgDiv.className = 'msg'; msgDiv.style.display = 'block';
            return;
        }
        try { await _safetyCopy(); }
        catch (e) {
            if (!confirm('The copy of this phone’s data couldn’t be saved (' + e.message + '). Load the backup anyway?')) return;
        }
        _applyImportNow(b);
    }

    function _applyImportNow(b) {
        _prepared = null;   // data is about to change; rebuild the share copy next time
        const msgDiv = document.getElementById('importMsg');
            try {
                // 3.6: a backup replaces everything, so it's the way out of a failed load: saving is allowed again
                _saveBlocked = false; _loadFailures = 0; _hideLoadError();
                entries = b.entries;
                accounts = b.accounts;
                if (Array.isArray(b.institutions) && b.institutions.length) {
                    institutions = b.institutions;
                }
                if (Array.isArray(b.expenses)) {
                    expenses = b.expenses;
                }
                if (Array.isArray(b.companies)) {
                    companies = b.companies;
                }
                if (b.yearlyGoals && typeof b.yearlyGoals === 'object') {
                    yearlyGoals = b.yearlyGoals;
                }
                if (b.metalsData && typeof b.metalsData === 'object') {
                    metalsData = b.metalsData;
                }
                if (Array.isArray(b.debtAccounts)) {
                    debtAccounts = b.debtAccounts;
                }
                if (Array.isArray(b.debtEntries)) {
                    debtEntries = b.debtEntries;
                }
                if (Array.isArray(b.bulkDebtPayments)) {
                    bulkDebtPayments = b.bulkDebtPayments;
                }
                if (Array.isArray(b.incomeEntries)) {
                    incomeEntries = b.incomeEntries;
                    // Strip orphaned 'gross' field where 'grossPay' exists (same cleanup as on load)
                    incomeEntries.forEach(e => { if ('gross' in e && 'grossPay' in e) delete e.gross; });
                }
                if (Array.isArray(b.payers)) {
                    payers = b.payers;
                }
                if (Array.isArray(b.retirementContribs)) {
                    retirementContribs = b.retirementContribs;
                }
                if (b.retirementLimits && typeof b.retirementLimits === 'object') {
                    retirementLimits = b.retirementLimits;
                }
                if (Array.isArray(b.retirementSources)) {
                    retirementSources = b.retirementSources;
                }
                if (Array.isArray(b.coastContribs)) {
                    coastContribs = b.coastContribs;
                }
                if (Array.isArray(b.coastAccounts)) {
                    coastAccounts = b.coastAccounts;
                }
                if (Array.isArray(b.loanPeople)) { loanPeople = b.loanPeople; saveLoanPeople(); }   // v3.4
                if (Array.isArray(b.loanEvents)) { loanEvents = b.loanEvents; saveLoanEvents(); }
                if (b.goalLadders && typeof b.goalLadders === 'object' && !Array.isArray(b.goalLadders)) { goalLadders = b.goalLadders; goalsSave(); }   // 3.8
                if (b.homeOrder && Array.isArray(b.homeOrder.p1) && Array.isArray(b.homeOrder.p2)) { localStorage.setItem('pf_homeOrder', JSON.stringify(b.homeOrder)); if (typeof renderHomeGrids === 'function') renderHomeGrids(); }   // 3.8.1
                if (Array.isArray(b.logbook)) {
                    localStorage.setItem('pf_logbook', JSON.stringify(b.logbook));
                }
                if (b.monthNotes && typeof b.monthNotes === 'object') {
                    monthNotes = b.monthNotes;
                    saveMonthNotes();
                }
                if (b.taxAdjustEnabled !== undefined) {
                    taxAdjustEnabled = b.taxAdjustEnabled;
                    localStorage.setItem('pf_taxEnabled', taxAdjustEnabled);
                }
                if (b.taxRatePct !== undefined) {
                    taxRatePct = b.taxRatePct;
                    localStorage.setItem('pf_taxRate', taxRatePct);
                }
                if (Array.isArray(b.homeValues) && b.homeValues.length) {
                    localStorage.setItem('pf_home_values', JSON.stringify(b.homeValues));
                }
                if (Array.isArray(b.properties) && b.properties.length) reSaveProps(b.properties);   // v3.5
                if (b.theme)      localStorage.setItem('pf_theme',       b.theme);
                if (b.basicCalcEnabled !== undefined) localStorage.setItem('pf_basicCalcEnabled', b.basicCalcEnabled);
                if (b.userAge)    localStorage.setItem('pf_dt_user_age', b.userAge);
                if (b.erGoal)     localStorage.setItem('pf_er_goal',     b.erGoal);
                linkBonusPayers();   // v3.2: link bonuses to their company and old entries to their payer
                saveEntries();
                saveAccounts();
                saveInstitutions();
                saveExpenses();
                saveCompanies();
                saveYearlyGoals();
                saveMetalsData();
                saveDebtAccounts();
                saveDebtEntries();
                saveBulkDebtPayments();
                saveIncomeEntries();
                savePayers();
                saveRetirementContribs();
                saveRetirementLimitsData();
                saveRetirementSources();
                saveCoastContribs();
                saveCoastAccounts();
                refreshAll();

                msgDiv.textContent = `✅ Loaded! ${accounts.length} accounts, ${entries.length} entries, ${expenses.length} expenses. A copy of the old data is in Downloads.`;
                msgDiv.className = 'msg success';
                msgDiv.style.display = 'block';
                setTimeout(() => { msgDiv.style.display = 'none'; }, 6000);
            } catch(err) {
                msgDiv.textContent = `❌ ${err.message}`;
                msgDiv.className = 'msg error';
                msgDiv.style.display = 'block';
            }
    }

    // ─── Clean Up Pre-2024 ──────────────────────────────────
    function resetGoalYear() {
        const year = parseInt(document.getElementById('goalResetYear').value);
        if (!yearlyGoals[year]) {
            // No goal set yet for this year — nothing to reset
            const msg = document.getElementById('goalResetMsg');
            msg.style.background = '#e67e22';
            msg.textContent = `⚠️ No goal found for ${year}.`;
            msg.style.display = 'block';
            setTimeout(() => { msg.style.display = 'none'; }, 3000);
            return;
        }
        yearlyGoals[year].completed = false;
        yearlyGoals[year].completionDate = null;
        yearlyGoals[year].completedLate = false;
        yearlyGoals[year].expanded = true;
        saveYearlyGoals();
        refreshAll();
        const msg = document.getElementById('goalResetMsg');
        msg.style.background = '#4CAF50';
        msg.textContent = `✅ ${year} goal reset — now showing as In Progress.`;
        msg.style.display = 'block';
        setTimeout(() => { msg.style.display = 'none'; }, 3500);
    }
