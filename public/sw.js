// Readability service worker — installability + offline support.
// Strategy:
//  - Navigations (page loads): network-first, fall back to the cached page,
//    then to an offline fallback. This makes previously-read chapters available
//    offline (their server-rendered HTML is cached on visit).
//  - Static assets (/_next/static, icons, images, fonts): stale-while-revalidate.
//  - Cross-origin requests (e.g. Supabase) are left untouched.

// Bump on every change to sw.js or whenever a deploy should purge stale caches.
// `activate` deletes any cache whose name doesn't match the current VERSION, so
// returning visitors get a clean slate instead of stale HTML/chunks (which
// would otherwise surface as a ChunkLoadError after a deploy).
const VERSION = "v4";
const STATIC_CACHE = `readability-static-${VERSION}`;
const RUNTIME_CACHE = `readability-runtime-${VERSION}`;
const PRECACHE = [
  "/offline.html",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== STATIC_CACHE && key !== RUNTIME_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // leave Supabase / cross-origin alone

  // Page navigations: network-first, fall back to cache, then offline page.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() =>
          caches
            .match(request)
            .then((cached) => cached || caches.match("/offline.html")),
        ),
    );
    return;
  }

  // Static assets: stale-while-revalidate.
  const isStatic =
    url.pathname.startsWith("/_next/static") ||
    url.pathname.startsWith("/icons") ||
    /\.(?:png|jpg|jpeg|svg|webp|gif|ico|woff2?)$/.test(url.pathname);

  if (isStatic) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const network = fetch(request)
          .then((response) => {
            const copy = response.clone();
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
            return response;
          })
          .catch(() => cached);
        return cached || network;
      }),
    );
  }
});
