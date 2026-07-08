/*
 * Service worker de "Juegos clásicos".
 *
 * Objetivo: que la app sea instalable y jugable sin conexión. Precachea el
 * "app shell" (los HTML de cada juego, íconos y manifest) en la instalación y
 * responde desde caché cuando no hay red.
 *
 * Estrategias:
 *   - Documentos HTML  -> network-first (en línea traés lo último; sin conexión,
 *     servís la copia cacheada). Así las actualizaciones llegan al recargar.
 *   - Estáticos (íconos, svg, manifest) -> stale-while-revalidate (respuesta
 *     instantánea desde caché y refresco en segundo plano).
 *
 * Para publicar una versión nueva, subí VERSION: al activarse, el SW borra las
 * cachés viejas y vuelve a precachear.
 *
 * Todas las rutas se resuelven relativas a la ubicación del SW (self.location),
 * así funciona igual servido en la raíz o en un subdirectorio (GitHub Pages).
 */
const VERSION = "v1.4.0";
const PREFIX = "juegos-clasicos-";
const CACHE = PREFIX + VERSION;

const ASSETS = [
  "./",
  "index.html",
  "solitario.html",
  "carta-blanca.html",
  "corazones.html",
  "buscaminas.html",
  "estadisticas.html",
  "shared/ui.js",
  "shared/storage.js",
  "shared/cards.js",
  "styles/tokens.css",
  "styles/base.css",
  "styles/cards.css",
  "favicon.svg",
  "manifest.webmanifest",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-192.png",
  "icons/icon-maskable-512.png",
  "icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const urls = ASSETS.map((p) => new URL(p, self.location).toString());
    await cache.addAll(urls);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    // Sólo borramos NUESTRAS cachés viejas. `caches` es por origen (no por
    // scope): en un dominio compartido (p. ej. usuario.github.io) puede haber
    // cachés de otras apps y no hay que tocarlas.
    await Promise.all(
      keys.filter((k) => k.startsWith(PREFIX) && k !== CACHE).map((k) => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

// Permite que la página fuerce la toma de control del SW en espera, si quiere.
self.addEventListener("message", (event) => {
  if (event.data === "skip-waiting") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // no interceptamos terceros

  const isHTML =
    req.mode === "navigate" ||
    (req.headers.get("accept") || "").includes("text/html");

  if (isHTML) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        // Sólo cacheamos respuestas OK: así una respuesta transitoria (404/500)
        // no pisa la copia buena precacheada.
        if (fresh && fresh.ok) {
          const cache = await caches.open(CACHE);
          cache.put(req, fresh.clone());
        }
        return fresh;
      } catch (e) {
        // App multipágina: servimos la copia cacheada de ESTA página (todas se
        // precachean). No caemos a index.html para no mostrar una página bajo
        // la URL de otra.
        const cached = await caches.match(req);
        return cached || Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req);
    const network = fetch(req)
      .then((res) => {
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      })
      .catch(() => null);
    return cached || (await network) || Response.error();
  })());
});
