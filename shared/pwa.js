// @ts-check
/*
 * shared/pwa.js — Registro del service worker + auto-actualización.
 *
 * Idéntico en las 6 páginas; se carga como <script> CLÁSICO. Extraído para
 * poder aplicar una Content-Security-Policy sin `unsafe-inline` en script-src
 * (ver docs/ARQUITECTURA.md, Fase 5): un <script src="..."> externo no cuenta
 * como "inline" para la CSP, aunque el contenido sea el mismo de siempre.
 *
 * Además de registrar el SW, resuelve un problema real: cuando se publica una
 * versión nueva, un visitante que ya tenía la app cacheada podía quedar con un
 * SW viejo sirviendo assets viejos (CSS/íconos desincronizados) hasta que
 * borrara la caché a mano. Acá:
 *   - `updateViaCache: "none"`: el navegador nunca sirve sw.js desde su caché
 *     HTTP al chequear actualizaciones — siempre lo trae de la red, así detecta
 *     una versión nueva enseguida.
 *   - Al detectar que un SW NUEVO tomó el control (controllerchange) y ya había
 *     uno antes (es una actualización, no la primera visita), recargamos UNA
 *     vez para que la página tome el código nuevo sin intervención del usuario.
 */
if ("serviceWorker" in navigator) {
  // ¿Había ya un SW controlando esta carga? Si sí, un cambio de controller
  // posterior es una ACTUALIZACIÓN (hay que recargar). En la primera visita
  // (sin controller) el claim inicial no debe recargar: la página ya es fresca.
  var hadController = !!navigator.serviceWorker.controller;
  var reloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", function () {
    if (hadController && !reloaded) {
      reloaded = true;
      location.reload();
    }
  });
  addEventListener("load", function () {
    navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).catch(function () {});
  });
}
