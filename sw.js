// Service worker for FPL Squad Check.
//
// It deliberately caches only the app shell — HTML, manifest, icons, club
// marks. Responses from /api/fpl are never stored: a stale league table or an
// old squad look like the truth, and that is worse than an honest error. For
// data freshness there is an edge cache on the server.
//
// The exception is club badges from /api/badge. Those change once a season
// (promotion and relegation), so they are kept indefinitely — an image cannot
// go stale in a harmful way and it saves dozens of requests on every open.

const SHELL = 'squadcheck-shell-v26';
const BADGES = 'squadcheck-badges-v1';
const FILES = ['/', '/index.html', '/manifest.webmanifest',
               '/icon.svg', '/favicon.svg', '/club-marks.svg',
               // Styles and scripts are separate files since index.html was
               // split up. Without them an empty shell would load offline:
               // the HTML would come from cache with nothing to start it.
               '/css/app.css', '/css/narrow.css', '/css/small.css',
               '/css/mobile.css',
               '/js/core.js', '/js/tabs.js', '/js/status.js', '/js/squad.js',
               '/js/news.js', '/js/ui.js', '/js/histcache.js', '/js/gate.js',
               '/js/topbar.js', '/js/mobile.js', '/js/boot.js',
               // The entry screen artwork: small, unchanging, and without it
               // the landing page looks broken.
               '/assets/hero.svg', '/assets/mark.webp'];

self.addEventListener('install', ev => {
  ev.waitUntil(
    caches.open(SHELL)
      // addAll is all-or-nothing: one missing file would bring down the whole
      // install and leave the app without a service worker. One at a time.
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

  // Badges: cache first. A club's image does not change during a season.
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

  if(url.pathname.startsWith('/api/')) return;   // data always from the network

  // The shell: network first, the cache is the offline fallback.
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
