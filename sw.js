// Caches are prefixed so this app never deletes another Ledger app's cache on the same github.io origin.
// Ledger 4.0 keeps the 'Ledger3 ' prefix on purpose: activate() only clears caches with this prefix, so the
// old 3.x caches on the phone are cleaned up. Changing it would leave them behind.
const CACHE_PREFIX = 'Ledger3 ';
const CACHE_NAME = CACHE_PREFIX + 'v4.0';
const ASSETS = [
  './',
  './index.html',
  './css/app.css',
  // 3.6: libraries are bundled (were CDN links that were never cached, so offline worked by luck)
  './vendor/chart-4.4.1.umd.js',
  './vendor/hammer-2.0.8.min.js',
  './vendor/chartjs-plugin-zoom-2.0.1.min.js',
  './vendor/crypto-js-4.1.1.js',
  './js/ledger-core.js',   // 3.7: shared money math (also loaded by desktop.html)
  './js/app.js',
  './js/home.js',
  './js/planning.js',
  './js/storage.js',
  './js/setup.js',
  './js/loans.js',
  './js/data-page.js',
  './js/pages.js',
  './js/settings.js',
  './js/income.js',
  './js/retirement.js',
  './js/coast.js',
  './js/goals.js',   // 3.8
  './js/backup.js',
  './js/common.js',
  './manifest.json',
  './favicon.ico',
  './icons/app/icon.png',
  './icons/app/icon-192.png',
  './icons/app/icon-512-maskable.png',
  './icons/app/icon-192-maskable.png',
  './images/banner.webp',
  './images/banner-large.webp',
  './icons/home/backtest.png',
  './icons/home/budget.png',
  './icons/home/compound-interest.png',
  './icons/home/data.png',
  './icons/home/debt.png',
  './icons/home/expenses.png',
  './icons/home/fire.png',
  './icons/home/goals.png',   // 3.8 (placeholder until Darrin's art)
  './icons/home/real-estate.png',
  './icons/home/income.png',
  './icons/home/investments.png',
  './icons/home/loans.png',
  './icons/home/log.png',
  './icons/home/net-worth.png',
  './icons/home/retirement.png',
  './icons/home/settings.png',
  './icons/home/summary.png',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k.startsWith(CACHE_PREFIX) && k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});
