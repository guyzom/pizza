/* Keep an entire release together. Bump VERSION whenever an app file changes.
 * Workers wait until existing tabs close, keeping each active game on one release. */
"use strict";
const VERSION = "1.0.0";
const PREFIX = "pizza-pups:" + self.registration.scope + ":";
const CACHE = PREFIX + VERSION;
const SHELL = ["./", "index.html", "style.css", "polish.css", "core.js", "levels.js",
  "game.js", "audio.js", "dogs.js", "meshes.js", "postfx.js", "install.js", "vendor/three.min.js",
  "manifest.webmanifest", "app-icon.svg", "app-icon-192.png", "app-icon-512.png", "apple-touch-icon.png",
  "assets/biscuit.svg", "assets/pepper.svg", "assets/toffee.svg", "assets/coco.svg"];
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL.map((path) =>
    new Request(new URL(path, self.registration.scope), { cache: "reload" })))));
});
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith(PREFIX) && key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url), scope = new URL(self.registration.scope);
  if (event.request.method !== "GET" || url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;
  const relative = url.pathname.slice(scope.pathname.length);
  if (relative && !SHELL.includes(relative)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const key = new URL(relative || "./", self.registration.scope);
    const cached = await cache.match(key.href);
    return cached || fetch(event.request);
  })());
});
