/* Layout Çizim Motoru – service worker (PWA, çevrimdışı çalışma).
   Strateji: önce ağ, olmazsa önbellek. Böylece yeni sürüm hemen gelir, internet yokken son sürüm açılır.
   /api, /files ve /preview (masaüstü sunucusu) ile başka sitelere giden istekler (GitHub API) hiç önbelleğe alınmaz.
   SURUM yayında (GitHub Actions) commit kimliğiyle değişir; eski önbellekler silinir. */

const SURUM = '__BUILD__';
const CACHE = `layoutx-${SURUM}`;
const SHELL = [
  './', 'index.html', 'manifest.webmanifest',
  'app/app.css', 'app/app.js', 'app/checks.js', 'app/form.js', 'app/i18n.js', 'app/i18n-dict.js', 'app/sections.js', 'app/studio.js', 'app/web.js',
  'app/icon.png', 'app/icons/icon-192.png', 'app/icons/icon-512.png', 'app/icons/maskable-512.png', 'app/icons/apple-touch-icon.png', 'app/icons/icon.svg',
  'belge/belge.css', 'belge/belge.js', 'belge/kaynak.js',
  'belge/fonts/selawk.ttf', 'belge/fonts/selawksb.ttf', 'belge/fonts/selawkb.ttf', 'belge/fonts/Carlito-Regular.ttf', 'belge/fonts/Carlito-Bold.ttf',
  'belge/logos/dolfin.png', 'belge/logos/enva.svg', 'belge/logos/vico.png', 'belge/logos/ksystem.png',
  'tools/sablon-layout-veri.json'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => Promise.all(SHELL.map((u) => c.add(u).catch(() => null)))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('layoutx-') && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;                       // GitHub API vb.
  if (/\/(api|files|preview)\//.test(url.pathname)) return;                // masaüstü sunucusunun canlı verisi
  e.respondWith((async () => {
    try {
      const res = await fetch(req);
      if (res.ok && res.type === 'basic') {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => null);
      }
      return res;
    } catch (err) {
      const hit = await caches.match(req, { ignoreSearch: req.mode === 'navigate' });
      if (hit) return hit;
      if (req.mode === 'navigate') {
        const shell = await caches.match('index.html') || await caches.match('./');
        if (shell) return shell;
      }
      throw err;
    }
  })());
});
