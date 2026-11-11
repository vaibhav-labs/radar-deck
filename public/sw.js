// Caches the app shell (HTML/CSS/JS/icons) so Radar Deck opens offline.
// API calls to the Apps Script backend are never touched here — src/api.ts and
// src/offlineQueue.ts own that logic (IndexedDB cache + queue), so the SW
// only ever caches same-origin GET requests for the app's own static files.

const CACHE_NAME = "radar-deck-shell-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(["/", "/manifest.webmanifest"]))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // leave the Apps Script API alone

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(req);
      const network = fetch(req)
        .then((res) => {
          if (res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => undefined);

      // Stale-while-revalidate: answer from cache immediately if we have it,
      // otherwise wait for the network.
      return cached ?? (await network) ?? Response.error();
    })
  );
});
