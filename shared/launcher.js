// @ts-check
/*
 * shared/launcher.js — Arma el menú de inicio (index.html) a partir de
 * games/registry.js. Agregar un juego nuevo sólo requiere sumarlo al registro
 * (ver docs/ARQUITECTURA.md, Fase 4).
 *
 * Se carga como <script> CLÁSICO, después de games/registry.js. Extraído del
 * <script> inline de index.html para poder aplicar una CSP sin
 * 'unsafe-inline' en script-src (ver Fase 5).
 */
var tilesEl = document.getElementById("tiles");
if (tilesEl) {
  tilesEl.innerHTML = window.GAMES.map(function (g) {
    return '<a class="tile" href="' + g.href + '">' +
           '<span class="ico">' + g.icon + '</span>' +
           '<span class="tname">' + g.title + '</span></a>';
  }).join("");
}
