// @ts-check
/*
 * shared/estadisticas-page.js — Lógica de estadisticas.html: agrega y
 * muestra las estadísticas de cada juego a partir de games/registry.js, y
 * maneja el botón "Reiniciar estadísticas".
 *
 * Se carga como <script> CLÁSICO, después de games/registry.js. Extraído del
 * <script> inline de estadisticas.html para poder aplicar una CSP sin
 * 'unsafe-inline' en script-src (ver docs/ARQUITECTURA.md, Fase 5).
 */
/** @param {string} k */
function g(k) {
  try { return JSON.parse(/** @type {string} */ (localStorage.getItem(k))) || {}; }
  catch (e) { return {}; }
}
/** @param {unknown} v */
function n(v) { return (typeof v === "number" && isFinite(v)) ? v : 0; }
/** @param {unknown} s */
function fmtTime(s) {
  if (s == null || typeof s !== "number" || !isFinite(s)) return "—";
  var m = Math.floor(s / 60), x = s % 60;
  return (m < 10 ? "0" : "") + m + ":" + (x < 10 ? "0" : "") + x;
}
/**
 * @param {number} won
 * @param {number} played
 */
function rate(won, played) { return played > 0 ? Math.round(won / played * 100) + "%" : "—"; }
/**
 * @param {string} label
 * @param {unknown} value
 */
function row(label, value) { return '<div class="row"><span>' + label + '</span><b>' + value + '</b></div>'; }
/** @param {Record<string, unknown>} st */
function rowPlayed(st) {
  var played = n(st.played), won = n(st.won);
  return row("Partidas jugadas", played) + row("Ganadas", won + " (" + rate(won, played) + ")");
}
// Helpers que recibe el body(stats, h) de cada juego en games/registry.js.
/** @type {StatHelpers} */
var statHelpers = { n: n, fmtTime: fmtTime, rate: rate, row: row, rowPlayed: rowPlayed };

// Las tarjetas se arman a partir de games/registry.js: agregar un juego nuevo
// sólo requiere sumarlo ahí (ver docs/ARQUITECTURA.md, Fase 4).
function render() {
  var out = window.GAMES.map(function (game) {
    var stats = g(game.statsKey);
    var body = game.body(stats, statHelpers) || '<div class="empty">Todavía no jugaste ninguna partida.</div>';
    return '<div class="card"><h2><span class="ico">' + game.icon + '</span> ' + game.title + '</h2>' + body + '</div>';
  }).join("");
  var cardsEl = document.getElementById("cards");
  if (cardsEl) cardsEl.innerHTML = out;
}

var resetBtn = document.getElementById("reset");
if (resetBtn) {
  resetBtn.onclick = function () {
    if (!confirm("¿Borrar todas las estadísticas? No se puede deshacer.")) return;
    window.GAMES.forEach(function (game) {
      try { localStorage.removeItem(game.statsKey); } catch (e) {}
    });
    render();
  };
}

render();
