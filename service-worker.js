const CACHE_NAME = 'anxiety-manager-v5';
const CORE_STATIC_ASSETS = ['/', '/index.html', '/styles.css', '/copilot.css', '/app.js', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_STATIC_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
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

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET' || !isHttpRequest(url)) {
    return;
  }

  if (shouldBypassCache(url)) {
    event.respondWith(fetch(request));
    return;
  }

  event.respondWith(networkFirst(request));
});

function isHttpRequest(url) {
  return url.protocol === 'http:' || url.protocol === 'https:';
}

function shouldBypassCache(url) {
  if (url.href.includes('supabase.co')) {
    return true;
  }

  if (url.origin !== self.location.origin) {
    return true;
  }

  const path = url.pathname;

  return path.endsWith('/service-worker.js') ||
    path.endsWith('/chat.js') ||
    path === '/api' ||
    path.startsWith('/api/') ||
    path.includes('/api/');
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);

  try {
    const response = await fetch(request);

    if (response && response.ok && response.type === 'basic') {
      try {
        await cache.put(request, response.clone());
      } catch {
        // Cache write failures should never block a valid network response.
      }
    }

    return response;
  } catch (error) {
    const cachedResponse = await cache.match(request);

    if (cachedResponse) {
      return cachedResponse;
    }

    if (request.mode === 'navigate') {
      const appShell = await cache.match('/index.html');

      if (appShell) {
        return appShell;
      }
    }

    throw error;
  }
}
