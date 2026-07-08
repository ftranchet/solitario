// @ts-check
/*
 * shared/ui.js — Widgets de UI comunes a los 4 juegos: el aviso flotante
 * (toast) y el helper de accesibilidad por teclado (keyActivate).
 *
 * Se carga como <script> CLÁSICO (no módulo) ANTES del script del juego, así
 * define funciones GLOBALES —igual que cuando estaba embebido en cada
 * juego— y tanto el juego como shared/storage.js (que llama a toast() si
 * falla el guardado) las siguen viendo.
 *
 * El estilo (.toast / .toast.show, .card:focus-visible, .btn:focus-visible)
 * vive en styles/base.css / styles/cards.css.
 *
 * Nota: la cabecera (header/HUD) y los modales de cada juego NO se
 * generalizaron acá porque su contenido difiere sustancialmente entre juegos
 * (HUD de tiempo/movimientos vs. mano/objetivo; modal de victoria vs. de fin de
 * mano). Se decidió no forzar una interfaz común: sería abstracción prematura
 * (ver docs/ARQUITECTURA.md, Fase 3).
 */
/** @param {string} msg */
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

/**
 * Hace operable por teclado un elemento que no lo es nativamente (un <div>
 * usado como carta o casilla): agrega tabindex="0" y activa `handler` con
 * Enter o Espacio, igual que un click. NO agrega el listener de click —
 * cada juego lo asigna aparte, con su propia lógica de mouse/touch/drag;
 * `handler` debe ser la MISMA función que ya dispara esa interacción, para
 * no duplicar reglas de juego acá (ver docs/ARQUITECTURA.md, Fase 6).
 * @param {HTMLElement} el
 * @param {() => void} handler
 */
function keyActivate(el, handler) {
  el.tabIndex = 0;
  el.addEventListener("keydown", function (e) {
    if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
      e.preventDefault();
      handler();
    }
  });
}

/**
 * Asigna `handler` como click Y como activación por teclado (keyActivate),
 * para los "huecos" clickeables que no son cartas (mazo, columna vacía,
 * fundación vacía). Evita repetir el par `el.onclick = handler; keyActivate
 * (el, handler);` en cada punto donde se crean.
 * @param {HTMLElement} el
 * @param {() => void} handler
 */
function clickActivate(el, handler) {
  el.onclick = handler;
  keyActivate(el, handler);
}
