const CACHE_NAME = "fieldlog-v3-cache-v1";

// フォルダ名やドメインを気にせず、その場所にあるファイルをキャッシュする書き方です
const urlsToCache = [
  "./",
  "index.html",
  "app.js"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(urlsToCache);
    })
  );
});

self.addEventListener("fetch", (e) => {
  e.respondWith(
    caches.match(e.request).then((response) => {
      return response || fetch(e.request);
    })
  );
});