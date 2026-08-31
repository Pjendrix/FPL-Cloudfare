/* FPL Squad Check — startup

   Restores the last session (or shows the entry screen) and registers the
   service worker. Loaded last, because it calls into every other file.

   The js/ files load as classic <script> tags in a fixed order and share
   one global scope: nothing is exported or imported, but hoisting does
   not cross file boundaries. The order is therefore part of the contract
   and is written down in index.html.
   ============================================================ */

/* Whoever was here last. enterApp() stores both IDs in localStorage and
   bootstrapGate() reads them back, so a refresh does not throw anyone
   out. "Change IDs" in the header clears them; without that button this
   would be a trap. */
bootstrapGate();

/* The service worker keeps the app shell available offline. Data is never
   cached — a stale league table is worse than an error message. */
if('serviceWorker' in navigator && location.protocol === 'https:'){
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
