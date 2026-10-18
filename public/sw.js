// Service Worker: damit die Seite auch ohne Netz (z. B. im Tunnel) neu geladen werden kann.
// Immer zuerst das Netz (Updates kommen sofort an), nur ohne Netz bzw. nach 6 s die gespeicherte Kopie.
// Server-Anfragen (api/…) laufen nie über den Zwischenspeicher – der Spielstand kommt immer frisch vom Server
// bzw. ohne Netz aus der Offline-Warteschlange der App.
"use strict";
const CACHE = "madeira-v1";
const CORE = ["./", "style.css", "content.js", "map-data.js", "logic.js", "tools.js", "bay-map.js", "roads.js", "icons.js",
  "figures.js", "app.js", "vendor/jspdf.umd.min.js", "manifest.json", "icon.svg"];

self.addEventListener("install", (ev) => {
  ev.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).catch(() => {}).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (ev) => {
  ev.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

function fromNetwork(req) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Zeitüberschreitung")), 6000);
    fetch(req).then((res) => { clearTimeout(timer); resolve(res); }, (e) => { clearTimeout(timer); reject(e); });
  });
}

self.addEventListener("fetch", (ev) => {
  const req = ev.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const scope = new URL(self.registration.scope);
  const own = url.origin === scope.origin && url.pathname.startsWith(scope.pathname);
  const fonts = url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";
  if (!(own || fonts)) return;
  if (own && url.pathname.slice(scope.pathname.length).startsWith("api/")) return; // Spielstand, Fotos: nie zwischenspeichern
  const page = req.mode === "navigate";
  ev.respondWith(fromNetwork(req).then((res) => {
    if (res && (res.ok || res.type === "opaque")) {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(page ? "./" : req, copy)).catch(() => {});
    }
    return res;
  }).catch(() => caches.match(page ? "./" : req, { ignoreSearch: page }).then((hit) => hit || caches.match(req)).then((hit) => hit ||
    new Response("Offline – diese Datei ist noch nicht gespeichert.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } }))));
});
