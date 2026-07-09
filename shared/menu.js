// @ts-check
/*
 * shared/menu.js — Genera el contenido del menú de juegos (🎮) de las 4
 * páginas de juego a partir de games/registry.js.
 *
 * Antes el HTML de <div id="menu" class="overlay"> (incluido el SVG de
 * Carta Blanca) estaba escrito a mano, idéntico, en las 4 páginas: agregar
 * un juego exigía editarlo en las 4 sin nada que avisara si se olvidaba una
 * o quedaban desincronizadas. Un test de contrato lo detectaba, pero el
 * problema real era el copy-paste en sí; generarlo elimina la clase de
 * error entera en vez de sólo detectarla (mismo criterio ya aplicado al
 * launcher y a Estadísticas, ver docs/ARQUITECTURA.md, Fase 4).
 *
 * Se carga como <script> CLÁSICO, después de games/registry.js (necesita
 * window.GAMES) y antes de games/<juego>.js (el menú debe existir en el DOM
 * cuando el motor cablea #menu-close). La página actual se determina por
 * data-store-ns en <html>, que ya coincide 1:1 con el id de cada entrada del
 * registro (lo usa también shared/storage.js para el candado multi-pestaña).
 */
(function () {
  var listEl = document.querySelector("#menu .game-list");
  if (!listEl) return;
  var current = document.documentElement.dataset.storeNs;
  var html = '<a class="game-link" href="index.html"><span class="ico">🏠</span> Inicio</a>';
  html += window.GAMES.map(function (g) {
    var inner = '<span class="ico">' + g.icon + '</span> ' + g.title;
    return g.id === current
      ? '<span class="game-link current">' + inner + '</span>'
      : '<a class="game-link" href="' + g.href + '">' + inner + '</a>';
  }).join("");
  html += '<a class="game-link" href="estadisticas.html"><span class="ico">📊</span> Estadísticas</a>';
  listEl.innerHTML = html;
})();
