const CACHE_NAME = "anxiety-manager-v2";
const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/styles.css",
  "/copilot.css",
  "/app.js",
  "/manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((cacheName) => cacheName !== CACHE_NAME)
            .map((cacheName) => caches.delete(cacheName)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (shouldBypassCache(request, url)) {
    return;
  }

  event.respondWith(networkFirst(request));
});

function shouldBypassCache(request, url) {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return true;
  }

  if (request.method !== "GET") {
    return true;
  }

  return (
    url.href.includes("supabase.co") ||
    url.pathname === "/api" ||
    url.pathname.startsWith("/api/") ||
    url.pathname.includes("/api/")
  );
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);

  try {
    const response = await fetch(request);

    if (response && response.ok) {
      try {
        await cache.put(request, response.clone());
      } catch {
        // A cache write failure should never block a valid network response.
      }
    }

    return response;
  } catch (error) {
    const cachedResponse = await cache.match(request);

    if (cachedResponse) {
      return cachedResponse;
    }

    throw error;
  }
}
