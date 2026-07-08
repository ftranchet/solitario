// @ts-check
/*
 * shared/pwa.js — Registro del service worker.
 *
 * Idéntico en las 6 páginas; se carga como <script> CLÁSICO. Extraído para
 * poder aplicar una Content-Security-Policy sin `unsafe-inline` en script-src
 * (ver docs/ARQUITECTURA.md, Fase 5): un <script src="..."> externo no cuenta
 * como "inline" para la CSP, aunque el contenido sea el mismo de siempre.
 */
if ("serviceWorker" in navigator) {
  addEventListener("load", function () {
    navigator.serviceWorker.register("sw.js").catch(function () {});
  });
}
