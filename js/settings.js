// Sommerville Ledger 4 — settings.js
// Themes, Demo Mode, PIN screen, splash, haptics
// Part of index.html (3.5.2 split). Plain script, loaded in order; all files share one global scope.
    // ─── Debt Edit Modal ────────────────────────────────────

    // ─── Themes Modal ────────────────────────────────────────

    function openConfigThemes() {
        // Close settings modal if open, then open themes
        const settingsModal = document.getElementById('settingsModal');
        if (settingsModal) settingsModal.classList.remove('open');
        // Open themes modal
        openModal('configThemesModal');
        // Sync toggle state
    }

    // ─── Demo Mode ───────────────────────────────────────────
    function toggleDemoMode() {
        demoMode = document.getElementById('demoModeCheckbox').checked;

        // Refresh all displays
        refreshAll();
        updateStats();   // 4.0.5: the old updateExpenseStats() call is gone (it no longer exists and threw before the message)
        // 4.3.0: the "Demo Mode enabled/disabled" messages called showMsg(), which doesn't exist, so turning Demo
        // Mode on or off always ended in an error after the switch had already flipped. The checkbox shows the state.
    }

    // ─── PIN & Security ──────────────────────────────────────
    function hashPin(pin) {
        return CryptoJS.SHA256(pin).toString();
    }

    async function setupPin() {
        const newPin = document.getElementById('newPin').value;
        const confirmPin = document.getElementById('confirmPin').value;
        const hint = document.getElementById('pinHint').value.trim();
        const errorDiv = document.getElementById('setupError');

        if (newPin.length !== 4 || !/^\d{4}$/.test(newPin)) {
            errorDiv.textContent = 'PIN must be exactly 4 digits';
            errorDiv.style.display = 'block';
            return;
        }

        if (newPin !== confirmPin) {
            errorDiv.textContent = 'PINs do not match';
            errorDiv.style.display = 'block';
            return;
        }

        if (!hint) {
            errorDiv.textContent = 'Please enter a hint to help you remember';
            errorDiv.style.display = 'block';
            return;
        }

        // Save PIN hash and hint
        localStorage.setItem('pf_pin', hashPin(newPin));
        localStorage.setItem('pf_pin_hint', hint);

        // Derive encryption key from PIN
        encryptionKey = await deriveEncryptionKey(newPin);
        _sessionPin = newPin;

        // Unlock and init app
        isUnlocked = true;
        _unlockWithTransition();
    }

    // 4.0.1: the home screen is built behind the lock screen first, then the lock fades away over it
    // (was: fade, then build, so the build time came on top of the fade).
    // 4.0.8: the home screen is built once per launch. Unlocking again after Lock App used to rerun initApp(),
    // whose buildChart() threw "Canvas is already in use" before the fade, so the PIN screen stayed up for good.
    // Now a re-unlock only refreshes, and nothing that throws can keep the lock screen from fading.
    let _appStarted = false;
    function _unlockWithTransition() {
        const lock = document.getElementById('lockScreen');
        // Fire fullscreen early so browser has time to settle
        requestFullscreen();
        try {
            if (!_appStarted) { initApp(); _appStarted = true; }
            else refreshAll();
        } catch (e) { console.error('Unlock: building the home screen failed', e); }
        requestAnimationFrame(() => {
            lock.style.transition = 'opacity 0.35s ease';
            lock.style.opacity = '0';
            setTimeout(() => {
                lock.style.display = 'none';
                lock.style.transition = '';
                lock.style.opacity = '';
            }, 350);
        });
    }

    let _loginBusy = false;   // 4.0.1: the key is worked out asynchronously; ignore repeat taps/Enter meanwhile
    async function attemptLogin() {
        if (_loginBusy) return;
        const pin = document.getElementById('pinInput').value;
        const errorDiv = document.getElementById('pinError');
        const storedHash = localStorage.getItem('pf_pin');

        if (pin.length !== 4) {
            errorDiv.textContent = 'Enter 4 digits';
            return;
        }

        if (hashPin(pin) === storedHash) {
            // Correct PIN - derive encryption key
            _loginBusy = true;
            try { encryptionKey = await deriveEncryptionKey(pin); } finally { _loginBusy = false; }
            _sessionPin = pin;
            isUnlocked = true;
            failedLoginAttempts = 0; // Reset counter on successful login

            _unlockWithTransition();
        } else {
            // Wrong PIN
            failedLoginAttempts++;
            errorDiv.textContent = 'Incorrect PIN';
            _pinReset();

            // Show hint button after 3 failed attempts
            if (failedLoginAttempts >= 3) {
                const hintButton = document.getElementById('hintButton');
                hintButton.style.display = 'block';
                hintButton.textContent = '💡 Need help? Show Hint';
            }

            // Shake animation on dots
            const dots = document.getElementById('pinDots');
            if (dots) { dots.style.animation = 'shake 0.5s'; setTimeout(() => { dots.style.animation = ''; }, 500); }
        }
    }

    function toggleHint() {
        const hintDisplay = document.getElementById('hintDisplay');
        const hint = localStorage.getItem('pf_pin_hint');

        if (hintDisplay.style.display === 'none') {
            document.getElementById('hintText').textContent = hint;
            hintDisplay.style.display = 'block';
            setTimeout(() => { hintDisplay.style.opacity = '1'; }, 10);
        } else {
            hintDisplay.style.opacity = '0';
            setTimeout(() => { hintDisplay.style.display = 'none'; }, 300);
        }
    }

    function lockApp() {
        isUnlocked = false;
        _sessionPin = null;
        failedLoginAttempts = 0; // Reset failed attempts counter
        document.getElementById('lockScreen').style.display = 'flex';
        _pinReset();
        document.getElementById('hintDisplay').style.display = 'none';
        document.getElementById('hintButton').style.display = 'none'; // Hide hint button
        closeModal('settingsModal');
        showHomePage();
    }
    // ─── PIN Numpad ──────────────────────────────────────────
    let _pinBuffer = '';

    function _pinUpdateDots() {
        for (let i = 0; i < 4; i++) {
            const d = document.getElementById('pd' + i);
            if (d) d.classList.toggle('filled', i < _pinBuffer.length);
        }
    }

    function pinPad(digit) {
        if (_pinBuffer.length >= 4) return;
        _pinBuffer += String(digit);
        _pinUpdateDots();
        document.getElementById('pinInput').value = _pinBuffer;
        document.getElementById('pinError').textContent = '';
        if (_pinBuffer.length === 4) setTimeout(attemptLogin, 50);   // 4.0.1: was 120 ms; just long enough for the 4th dot to show
    }

    function pinPadBack() {
        if (!_pinBuffer.length) return;
        _pinBuffer = _pinBuffer.slice(0, -1);
        _pinUpdateDots();
        document.getElementById('pinInput').value = _pinBuffer;
    }

    // Reset buffer when lock screen shown (called by lockApp)
    function _pinReset() {
        _pinBuffer = '';
        _pinUpdateDots();
        document.getElementById('pinInput').value = '';
    }

    // ─── Auto Theme by Time of Day ───────────────────────────
    // 07:00–19:59 → alaskan-lite (light)   |   20:00–06:59 → alaskan (dark)
    // ─── Splash Screen ───────────────────────────────────────
    function showSplash() {
        const el = document.getElementById('splashScreen');
        if (!el) { checkPinStatus(); return; }
        el.style.display = 'flex';

        // Phase 1 — logo scales in with bounce
        setTimeout(() => {
            const logo = document.getElementById('splashLogo');
            if (logo) { logo.style.opacity = '1'; logo.style.transform = 'scale(1)'; }
        }, 150);

        // Phase 2 — tap msg blinks
        setTimeout(() => {
            const tap = document.getElementById('splashTapMsg');
            if (tap) { tap.style.opacity = '1'; tap.style.animation = 'splashBlink 1.6s ease-in-out infinite'; }
        }, 1800);
    }

    function splashTap() {
        const el = document.getElementById('splashScreen');
        if (!el || el._leaving) return;
        el._leaving = true;
        // 4.0.6: crossfade. The CLAUDE screen starts underneath (z-index 19999, the crest is 20000) and the crest
        // fades off it, on the same navy (was: fade to the dark page, then pop the next screen in)
        showClaudeSplash();
        el.style.transition = 'opacity 0.5s ease';
        el.style.opacity = '0';
        setTimeout(() => {
            el.style.display = 'none';
            el.style.opacity = '1';
            el._leaving = false;
        }, 500);
    }

    function showClaudeSplash() {
        const el = document.getElementById('claudeSplashScreen');
        if (!el) { checkPinStatus(); return; }
        el.style.display = 'flex';

        // Phase 1 — symbol pulses in
        setTimeout(() => {
            const sym = document.getElementById('claudeSymbol');
            if (sym) { sym.style.animation = 'claudePulse 0.7s cubic-bezier(0.34,1.56,0.64,1) forwards, claudeGlow 2s ease-in-out 0.7s infinite'; }
        }, 150);

        // Phase 2 — label types in letter by letter
        setTimeout(() => {
            const lbl = document.getElementById('claudeLabel');
            if (!lbl) return;
            lbl.style.opacity = '1';
            const word = 'CLAUDE';
            lbl.textContent = '';
            let i = 0;
            const typer = setInterval(() => {
                lbl.textContent += word[i];
                i++;
                if (i >= word.length) clearInterval(typer);
            }, 80);
        }, 700);

        // Phase 3 — loading bar sweeps across
        setTimeout(() => {
            const bar = document.getElementById('claudeBar');
            if (bar) { bar.style.transition = 'width 1.2s cubic-bezier(0.4,0,0.2,1)'; bar.style.width = '100%'; }
        }, 1100);

        // Phase 4 — "powered by" fades up
        setTimeout(() => {
            const pw = document.getElementById('claudePowered');
            if (pw) { pw.style.animation = 'claudeFadeUp 0.6s ease forwards'; }
        }, 1500);

        // Auto-advance after 2.6s
        setTimeout(() => { claudeSplashDismiss(); }, 2600);
    }

    function claudeSplashTap() {
        claudeSplashDismiss();
    }

    function claudeSplashDismiss() {
        const el = document.getElementById('claudeSplashScreen');
        if (!el || el.style.display === 'none' || el._leaving) return;
        el._leaving = true;
        // 4.0.6: crossfade. The PIN screen goes up underneath (z-index 10000) and the CLAUDE screen fades off it
        // (was: fade to the dark page, then the PIN screen popped in all at once)
        checkPinStatus();
        el.style.transition = 'opacity 0.4s ease';
        el.style.opacity = '0';
        setTimeout(() => {
            el.style.display = 'none';
            el.style.opacity = '1';
            el._leaving = false;
        }, 400);
    }

    // ─── Haptic Feedback ─────────────────────────────────────
    // Mixed pattern: heavy for destructive/save, light for nav/close
    function haptic(type) {
        if (!navigator.vibrate) return;
        if (type === 'heavy')  navigator.vibrate(18);
        else if (type === 'medium') navigator.vibrate(10);
        else                   navigator.vibrate(5);   // light
    }

    function hapticForButton(btn) {
        const fn  = (btn.getAttribute('onclick') || '').toLowerCase();
        const cls = btn.className || '';
        const txt = btn.textContent.trim().toLowerCase();

        // Destructive actions → heavy
        if (/delete|remove|clear|reset|wipe|logbookdelete/.test(fn)) {
            haptic('heavy'); return;
        }
        // Save / submit / confirm → medium
        if (/save|add|submit|confirm|setup|attempt|unlock|setpin|ddSave/.test(fn) ||
            cls.includes('submit-btn') ||
            /^(save|add|confirm|set|unlock|done)/.test(txt)) {
            haptic('medium'); return;
        }
        // Everything else (nav, close, toggle, settings) → light
        haptic('light');
    }

    document.addEventListener('pointerdown', (e) => {
        const btn = e.target.closest('button');
        if (btn) hapticForButton(btn);
}, { passive: true });

    // Allow Enter key to submit
    document.addEventListener('DOMContentLoaded', () => {
        const pinInput = document.getElementById('pinInput');
        if (pinInput) {
            pinInput.addEventListener('keyup', (e) => {
                if (e.key === 'Enter') attemptLogin();
            });
        }
        // Long press 5 seconds anywhere → fullscreen
        let longPressTimer = null;
        const LONG_PRESS_MS = 5000;
        document.body.addEventListener('touchstart', (e) => {
            if (e.target.closest('button, input, select, textarea, a, label')) return;
            longPressTimer = setTimeout(() => { requestFullscreen(); }, LONG_PRESS_MS);
}, { passive: true });
        document.body.addEventListener('touchend',   () => { clearTimeout(longPressTimer); });
        document.body.addEventListener('touchmove',  () => { clearTimeout(longPressTimer); });
        document.body.addEventListener('touchcancel',() => { clearTimeout(longPressTimer); });
    });

