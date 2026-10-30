// Bump VERSION on every deploy. A new name makes the browser fetch every file
// again; without it the installed app keeps showing the old files.
const VERSION = "v1";
const CACHE = `bokeh-${VERSION}`;
const FILES = [
  "./",
  "index.html",
  "style.css",
  "tabs.js",
  "blur.js",
  "video.js",
  "pwa.js",
  "vendor/mp4-muxer.js",
  "fonts/fredoka-600.woff2",
  "fonts/nunito.woff2",
  "icons/icon.svg",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "manifest.webmanifest",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Cache first: the app has no server data, so the saved copy is always right.
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request)));
});
