// Service worker pro Minileague Squad Check.
//
// Záměrně cachuje jen skořápku aplikace — HTML, manifest, ikony, značky klubů.
// Odpovědi z /api/fpl se nikdy neukládají: zastaralá tabulka miniligy nebo
// stará sestava vypadají jako pravda, a to je horší než čestná chyba.
// Pro čerstvost dat máme edge cache na serveru.
//
// Výjimka jsou odznaky klubů z /api/badge. Ty se mění jednou za sezónu
// (postup a sestup), takže je držíme natrvalo — u obrázku zastaralost
// nehrozí a šetří to desítky requestů při každém otevření.

const SHELL = 'squadcheck-shell-v20';
const BADGES = 'squadcheck-badges-v1';
const FILES = ['/', '/index.html', '/manifest.webmanifest',
               '/icon.svg', '/favicon.svg', '/club-marks.svg',
               // Styly a skripty jsou od rozdělení index.html samostatné
               // soubory. Bez nich by se offline načetla prázdná skořápka:
               // HTML by bylo z cache, ale appka by neměla čím naběhnout.
               '/css/app.css', '/css/narrow.css', '/css/small.css',
               '/css/mobile.css',
               '/js/core.js', '/js/tabs.js', '/js/ui.js', '/js/planner.js',
               '/js/h2h.js', '/js/status.js', '/js/squad.js', '/js/news.js', '/js/advisor.js', '/js/sync.js', '/js/topbar.js', '/js/mobile.js', '/js/boot.js',
               '/js/firebase.js',
               // plakát a loga: velké, neměnné, a bez nich vypadá vstup rozbitě
               '/assets/headline.webp', '/assets/logo-transp.webp',
               '/assets/logo.webp', '/assets/mark.webp'];

self.addEventListener('install', ev => {
  ev.waitUntil(
    caches.open(SHELL)
      // addAll je all-or-nothing: jeden chybějící soubor by shodil celou
      // instalaci a appka by zůstala bez service workeru. Radši po jednom.
      .then(c => Promise.all(FILES.map(f => c.add(f).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', ev => {
  ev.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== SHELL && k !== BADGES).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', ev => {
  const url = new URL(ev.request.url);

  if(ev.request.method !== 'GET') return;
  if(url.origin !== location.origin) return;

  // Odznaky: cache first. Obrázek klubu se během sezóny nemění.
  if(url.pathname === '/api/badge'){
    ev.respondWith(
      caches.open(BADGES).then(c =>
        c.match(ev.request).then(hit => hit || fetch(ev.request).then(res => {
          if(res.ok) c.put(ev.request, res.clone());
          return res;
        }).catch(() => hit)))
    );
    return;
  }

  if(url.pathname.startsWith('/api/')) return;   // data vždy ze sítě

  // Skořápka: nejdřív síť, cache je záložní plán pro offline.
  ev.respondWith(
    fetch(ev.request)
      .then(res => {
        const copy = res.clone();
        caches.open(SHELL).then(c => c.put(ev.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(ev.request).then(hit => hit || caches.match('/')))
  );
});
