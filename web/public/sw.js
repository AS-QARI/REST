// Bump this whenever the app shell changes so users do not get an old theme
// during the first render after a deployment.
const CACHE_NAME = "rest-shell-v4";
// "reload" skips the browser's HTTP cache so a fresh install never stores old HTML.
const APP_SHELL = [new Request(self.registration.scope, { cache: "reload" })];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))));
  self.clients.claim();
});

function isNavigation(request) {
  return request.mode === "navigate" || (request.headers.get("accept") || "").includes("text/html");
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;

  // HTML/navigation: network-first so app updates always reach the user; fall back to cache offline.
  // GitHub Pages sends HTML with max-age=600, so a plain fetch could still return the
  // previous deploy for up to 10 minutes. "no-cache" revalidates with the server every
  // time (a cheap 304 when nothing changed); the hashed JS/CSS it points to are new files.
  if (isNavigation(request)) {
    event.respondWith(
      fetch(request.url, { cache: "no-cache", credentials: "same-origin" })
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match(self.registration.scope))),
    );
    return;
  }

  // Prefer the network for app assets so a newly deployed CSS/JS bundle is
  // applied immediately. The cache remains an offline fallback.
  event.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        return response;
      })
      .catch(() => caches.match(request)),
  );
});
