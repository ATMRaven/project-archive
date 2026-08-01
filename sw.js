// ============================================================================
// Service Worker — caches app shell for offline use
// ============================================================================

const CACHE_NAME = "archive-v5";
const SHELL_ASSETS = [
  "/",
  "/index.html",
  "/style.css",
  "/script.js",
  "/manifest.json",
  "/icons/icon-192.png",
];

// Install — cache the app shell
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS))
  );
  self.skipWaiting();
});

// Activate — clean up old caches
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// Fetch — network-first for HTML/JS/CSS, let API calls go straight to network
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);

  // CRITICAL: Cache API ONLY supports GET requests. Skip non-GET requests (POST, PUT, DELETE).
  if (e.request.method !== "GET") {
    return;
  }

  // Don't cache API calls or external dynamic services
  if (
    url.pathname.startsWith("/api/") ||
    url.hostname.includes("supabase") ||
    url.hostname.includes("cdn.jsdelivr") ||
    url.hostname.includes("workers.dev")
  ) {
    return;
  }

  // Don't cache Google Fonts (they have their own browser caching)
  if (
    url.hostname.includes("fonts.googleapis") ||
    url.hostname.includes("fonts.gstatic")
  ) {
    return;
  }

  e.respondWith(
    fetch(e.request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(e.request))
  );
});
