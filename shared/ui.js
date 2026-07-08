/*
 * shared/ui.js — Widgets de UI comunes a los 4 juegos: por ahora, el aviso
 * flotante (toast).
 *
 * Se carga como <script> CLÁSICO (no módulo) ANTES del script del juego, así
 * define `window.toast` GLOBAL —igual que cuando estaba embebido en cada
 * juego— y tanto el juego como shared/storage.js (que llama a toast() si
 * falla el guardado) lo siguen viendo.
 *
 * El estilo (.toast / .toast.show) vive en styles/base.css.
 *
 * Nota: la cabecera (header/HUD) y los modales de cada juego NO se
 * generalizaron acá porque su contenido difiere sustancialmente entre juegos
 * (HUD de tiempo/movimientos vs. mano/objetivo; modal de victoria vs. de fin de
 * mano). Esa unificación queda para la Fase 4 (contrato de juego).
 */
function toast(msg) {
  var t = document.createElement("div");
  t.className = "toast";
  t.textContent = msg;
  t.setAttribute("role", "status");   // lo anuncian los lectores de pantalla
  document.body.appendChild(t);
  setTimeout(function () { t.classList.add("show"); }, 10);
  setTimeout(function () {
    t.classList.remove("show");
    setTimeout(function () { t.remove(); }, 300);
  }, 1700);
}
