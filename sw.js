/*
 * Service worker de "Juegos clásicos".
 *
 * Objetivo: que la app sea instalable y jugable sin conexión. Precachea el
 * "app shell" (los HTML de cada juego, íconos y manifest) en la instalación y
 * responde desde caché cuando no hay red.
 *
 * Estrategias:
 *   - "App shell" con código (HTML, CSS, JS) -> network-first (en línea traés
 *     lo último; sin conexión, servís la copia cacheada). El HTML, su CSS y su
 *     JS deben hacer juego entre sí: si el CSS fuera cache-first podría servir
 *     una copia vieja junto a un HTML nuevo (íconos sin estilo, layout roto)
 *     ante cualquier cambio sin subir VERSION. Network-first garantiza que en
 *     línea las tres piezas lleguen siempre de la misma versión.
 *   - Binarios estáticos (íconos, favicon, manifest) -> stale-while-revalidate
 *     (respuesta instantánea desde caché y refresco en segundo plano). Casi
 *     nunca cambian y una copia vieja no rompe nada, así que priorizamos la
 *     velocidad.
 *
 * Para publicar una versión nueva, subí VERSION: al activarse, el SW borra las
 * cachés viejas y vuelve a precachear. (Con network-first para el código, los
 * usuarios en línea ya reciben lo último aunque se olvide subir VERSION; el
 * bump sólo hace falta para refrescar la copia OFFLINE.)
 *
 * Actualización con aviso (Fase 5 de docs/PLAN.md): a propósito NO llamamos
 * self.skipWaiting() en "install". Así, cuando hay un SW nuevo, el navegador
 * lo deja "esperando" (registration.waiting) mientras el viejo sigue
 * controlando las pestañas abiertas — es el flujo estándar. shared/pwa.js
 * detecta ese estado de espera y muestra un toast con botón "Recargar"; sólo
 * al tocarlo le mandamos el mensaje "skip-waiting" de más abajo, que activa
 * el nuevo SW y dispara controllerchange.
 *
 * Todas las rutas se resuelven relativas a la ubicación del SW (self.location),
 * así funciona igual servido en la raíz o en un subdirectorio (GitHub Pages).
 */
const VERSION = "v1.30.0";
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
  "games/registry.js",
  "games/solitario.js",
  "games/carta-blanca.js",
  "games/corazones.js",
  "games/buscaminas.js",
  "shared/theme.js",
  "shared/pwa.js",
  "shared/ui.js",
  "shared/storage.js",
  "shared/cards.js",
  "shared/drag.js",
  "shared/menu.js",
  "shared/launcher.js",
  "shared/estadisticas-page.js",
  "styles/tokens.css",
  "styles/base.css",
  "styles/game.css",
  "styles/cards.css",
  "styles/solitario.css",
  "styles/carta-blanca.css",
  "styles/corazones.css",
  "styles/buscaminas.css",
  "styles/launcher.css",
  "styles/estadisticas.css",
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
    // No self.skipWaiting() acá: en la PRIMERA visita (sin SW previo) el
    // navegador activa este SW solo, sin esperar. En una ACTUALIZACIÓN, sin
    // este llamado el SW nuevo queda "esperando" hasta que el cliente pida
    // skip-waiting (ver el listener de "message" y shared/pwa.js) — es lo
    // que habilita mostrar el aviso de "hay una versión nueva" en vez de
    // reemplazar el código bajo los pies del usuario sin avisar.
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
  // El código del app shell (CSS y JS) va junto con el HTML: network-first,
  // para que en línea las tres piezas lleguen siempre de la misma versión y no
  // se pueda servir CSS/JS viejo con HTML nuevo.
  const isCode = /\.(css|js)$/.test(url.pathname);

  if (isHTML || isCode) {
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
        // Sin conexión: servimos la copia cacheada de ESTE recurso (todo el app
        // shell se precachea). Para HTML, no caemos a index.html: en una app
        // multipágina mostraría una página bajo la URL de otra.
        const cached = await caches.match(req);
        return cached || Response.error();
      }
    })());
    return;
  }

  // Binarios estáticos (íconos, favicon, manifest): stale-while-revalidate.
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
