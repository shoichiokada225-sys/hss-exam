var CACHE_NAME = "hss-exam-v3";
var ASSETS = [
  "./",
  "./index.html",
  "./config.js",
  "./data/questions.json",
  "./data/demo-questions.json",
  "./manifest.json",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", function(event) {
  event.waitUntil(
    caches.keys().then(function(names) {
      return Promise.all(
        names.filter(function(name) { return name !== CACHE_NAME; })
             .map(function(name) { return caches.delete(name); })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener("fetch", function(event) {
  // Skip non-GET requests and webhook calls
  if (event.request.method !== "GET") return;
  if (event.request.url.includes("script.google.com")) return;
  if (event.request.url.includes("cdnjs.cloudflare.com")) return;
  if (event.request.url.includes("cdn.jsdelivr.net")) return;

  event.respondWith(
    caches.match(event.request).then(function(cached) {
      if (cached) {
        // Return cached, but also update cache in background
        var fetchPromise = fetch(event.request).then(function(response) {
          if (response && response.status === 200) {
            var clone = response.clone();
            caches.open(CACHE_NAME).then(function(cache) {
              cache.put(event.request, clone);
            });
          }
          return response;
        }).catch(function() {});
        return cached;
      }
      return fetch(event.request).then(function(response) {
        if (response && response.status === 200) {
          var clone = response.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(event.request, clone);
          });
        }
        return response;
      });
    })
  );
});
