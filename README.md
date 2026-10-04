# Sommerville Ledger 4

A personal finance app built as two web apps on GitHub Pages (no build step): a **phone logger** and a **desktop planner**.

Ledger 3.0 was the pivot from Ledger 2: backups go to the cloud, and all the planning (Retirement Plan, Paycheck Planner, FIRE projections) lives on the desktop. **Current version: 4.3.3 (phone), 4.5.0 (desktop).** 4.0 rolls up 3.6–3.8.1: bundled libraries and import safety (3.6), golden-number tests, one shared math file used by both apps (`js/ledger-core.js`, 3.7–3.7.2), the goals rework with editable goal steps and critical mass (3.8), and a home icon layout that finally stays put (3.8.1). See [CHANGELOG](library/CHANGELOG.md).

| App | Open it at | What it does |
|---|---|---|
| **Phone app** (`index.html`) | `https://sommerville.github.io/ledger-4/` | **The logger.** The only app that saves financial data. You log balances, bills, income, 401(k) and coast contributions, loans you've made and property values here, and track your goals. Data stays on the phone, encrypted with your PIN. Installs as a PWA and works offline. |
| **Desktop planner** (`desktop.html`) | `https://sommerville.github.io/ledger-4/desktop.html` | **The planner.** Dashboards plus the Retirement Plan, Paycheck Planner and FIRE projections. Open a backup from the phone (plain or locked). It remembers only your planning settings; your financial data is never stored there and never leaves the browser. |

The two apps share two things: the **backup file** (`ledger-YYYY-MM-DD.json`) and the **math** (`js/ledger-core.js`), so a number means the same thing on both screens.

**Typical flow:**
1. Phone → Settings → Data Management. Tap **📤 Save to OneDrive / Share…** → OneDrive (backups are plain files since 4.0.10, no PIN).
2. Computer → open `desktop.html` → choose the newest backup in the synced OneDrive folder (or **Load newest backup** once the folder is chosen). Older locked backups ask for the app PIN.

Backups are plain files since 4.0.10 (Darrin's call: there are no account numbers or other sensitive data in them). Backups saved locked before that (`-locked.json`, keyed with the 4-digit app PIN) still open on both apps.

---

## Docs (in `library/`, kept on your computer)

| File | Read it when |
|---|---|
| **README.md** | You're new here, or deploying. |
| **[GUIDE.md](library/GUIDE.md)** | You want to know what a number means and how it's calculated. Covers every major section, the Goals, and the Retirement Plan in depth. |
| **[CLAUDE.md](library/CLAUDE.md)** | You (or Claude) are about to change code. Architecture, the shared math, the backup file format, storage keys, rules and the per-deploy checklist. |
| **[PAYSPLIT.md](library/PAYSPLIT.md)** | You're changing the Paycheck Planner's payroll math, or doing the December tax-table update. |
| **[STYLE.md](library/STYLE.md)** | You're changing how things look: themes, colors, icons, goal cards, layout conventions. |
| **[CHANGELOG.md](library/CHANGELOG.md)** | You want to know what changed, and when. |
| **[ROADMAP.md](library/ROADMAP.md)** | You're planning what's next. Open issues, known gaps, yearly chores and parked ideas. |

Tests live in `tests/golden/` (also local only): `run.py` checks every planning number in both apps (192 checks) and `goals_check.py` checks the goals (42). See its README.

---

## Setting up this repo (first time)

1. Create a new repo, e.g. `ledger-4` (public, which free GitHub Pages needs).
2. Upload everything from the release zip's **`deploy/`** folder, keeping the `css/`, `js/`, `vendor/`, `icons/` and `images/` folders. The zip's `local/` folder (`library/`, `tests/`) stays on your computer.
3. Settings → **Pages** → Source: *Deploy from a branch* → `main` / `/ (root)` → Save.
4. After the green check under **Actions**, open `https://sommerville.github.io/ledger-4/` on the phone and **Add to Home Screen**. The icon is labeled "Ledger 4".

The repo is `ledger-4` (it was `ledger-3.2`). The phone's saved data and PIN belong to `https://sommerville.github.io`, which every repo there shares, so moving to a new repo name kept them. The installed home-screen app is tied to the repo's address, though: after a rename, open the new address and Add to Home Screen again.

## Deploying an update

1. **Upload the whole set every time**: `index.html`, `sw.js` (with `CACHE_NAME` bumped), `desktop.html`, `manifest.json`, `.gitignore`, and the `css/`, `js/` and `vendor/` folders. Drag them onto the repo page together → **Commit changes**; GitHub keeps the folders. Re-uploading unchanged files does no harm; leaving one out breaks the app.
2. **Never delete `sw.js`.** It's the phone app's offline cache. Without it the phone keeps running whatever old copy it cached and never sees updates.
3. New icons go into `icons/home/` (not the repo root), and must be listed in `sw.js`, or the offline cache fails to install.
4. **Don't upload `library/`, `tests/` or any backup file.** The repo is public. If they're already there, delete them on GitHub (open the folder → ⋯ → Delete directory).
5. Wait a minute or two for the **Actions** tab to show a green check.
6. On the phone, close and reopen the app (twice if the update doesn't show). Settings → About shows the version.
7. Test in all three themes (Dark, Sunset, Royal Navy).

## Repo layout

```
icons/home/     home-screen icons (tattoo-flash style, 18 in use)
icons/app/      4 PWA icons
images/         banner.webp, banner-large.webp
vendor/         Chart.js, Hammer, chartjs-plugin-zoom, CryptoJS (pinned copies)
favicon.ico
index.html      phone app: markup
css/app.css     phone app: styles
js/             phone app code (16 files, loaded in order);
                js/ledger-core.js is the shared math, also loaded by desktop.html
desktop.html    desktop planner (not cached by sw.js)
manifest.json   PWA settings, start_url ./index.html
sw.js           offline cache for the phone app — never delete
README.md       this file
.gitignore      keeps backups, library/, tests/ and old builds out of the repo
```

On your computer only (never in the repo):
```
library/        docs (above)
tests/golden/   golden backup + test scripts
```

## Privacy — read before committing anything

- **Never commit a backup file (`ledger-*.json` / `.txt`) to this repo**, locked or not. The repo is public. `.gitignore` blocks them if you use git; uploading through the GitHub website ignores `.gitignore`, so check before you drag files in.
- `library/` and `tests/` stay local. The docs describe the math with example numbers, but `PAYSPLIT.md` and `CLAUDE.md` contain a few real paycheck figures used to verify the payroll math. The golden test backup is made up, but still don't put it on the phone: importing it replaces your data.
- Backups are plain text since 4.0.10, on OneDrive or the phone, by choice (nothing sensitive in them). Keep the OneDrive folder private anyway and don't share backup files.
