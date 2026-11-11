// Service worker de Bocado: guarda la app para usarla sin internet
// y muestra los recordatorios aunque la app esté cerrada.
// Al cambiar archivos de la app, sube VERSION para que el celular los renueve.
const VERSION = "bocado-1";
const ARCHIVOS = [
  "./", "index.html", "estilos.css", "manifest.webmanifest", "favicon.svg", "icono-192.png", "apple-touch-icon.png",
  "datos/alimentos.json",
  "js/app.js", "js/util.js", "js/db.js", "js/sync.js", "js/nutricion.js", "js/alimentos.js", "js/perfil.js",
  "js/graficos.js", "js/avisos.js", "js/escaner.js",
  "js/vistas/hoy.js", "js/vistas/selector.js", "js/vistas/propios.js", "js/vistas/progreso.js",
  "js/vistas/ayuno.js", "js/vistas/mas.js",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k);
    await self.clients.claim();
  })());
});

// Archivos de la app: primero lo guardado (rápido y sin internet) y se actualiza por detrás.
// La API nunca se guarda.
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const navegacion = e.request.mode === "navigate";
    const guardado = await cache.match(navegacion ? "index.html" : e.request, { ignoreSearch: navegacion });
    const red = fetch(e.request).then((r) => {
      if (r.ok && !navegacion) cache.put(e.request, r.clone());
      return r;
    });
    if (guardado) {
      e.waitUntil(red.catch(() => {}));
      return guardado;
    }
    return red;
  })());
});

self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || "Bocado", {
    body: d.body || "",
    icon: "icono-192.png",
    badge: "icono-192.png",
    tag: d.tag,
    data: { url: d.url || "./" },
  }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "./";
  e.waitUntil((async () => {
    const ventanas = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    if (ventanas.length) {
      await ventanas[0].focus();
      ventanas[0].postMessage({ tipo: "abrir", url });
      return;
    }
    await self.clients.openWindow(url);
  })());
});
