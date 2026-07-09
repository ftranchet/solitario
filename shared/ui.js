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

/*
 * Festejo de victoria: lluvia de confeti en un canvas de pantalla completa
 * (.confetti-canvas, ver styles/game.css). Era idéntico en los 4 juegos; se
 * consolidó acá sin cambiar el comportamiento. Respeta prefers-reduced-motion
 * (no dibuja nada si el usuario prefiere menos movimiento).
 */
/** @type {(() => void) | null} */
var confettiCleanup = null;

function stopConfetti() {
  if (confettiCleanup) { confettiCleanup(); confettiCleanup = null; }
}

function celebrate() {
  stopConfetti();
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  var canvas = document.createElement("canvas");
  canvas.className = "confetti-canvas";
  document.body.appendChild(canvas);
  var maybeCtx = canvas.getContext("2d");
  if (!maybeCtx) { canvas.remove(); return; }
  var ctx = maybeCtx;   // narrowing explícito: adentro de frame() ya no es null
  function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
  resize();
  window.addEventListener("resize", resize);
  var raf = 0;
  confettiCleanup = function () {
    if (raf) cancelAnimationFrame(raf);
    window.removeEventListener("resize", resize);
    canvas.remove();
  };
  var colors = ["#e8b44a", "#c62828", "#1f7a46", "#1f6fd0", "#ffffff", "#ff7ab6"];
  var N = Math.max(80, Math.min(200, Math.round(window.innerWidth / 4)));
  /** @type {{x: number, y: number, w: number, h: number, vx: number, vy: number, rot: number, vr: number, color: string}[]} */
  var parts = [];
  for (var i = 0; i < N; i++) {
    parts.push({
      x: Math.random() * canvas.width, y: -20 - Math.random() * canvas.height,
      w: 6 + Math.random() * 6, h: 8 + Math.random() * 8,
      vx: -1.5 + Math.random() * 3, vy: 2 + Math.random() * 3.5,
      rot: Math.random() * Math.PI, vr: -0.2 + Math.random() * 0.4,
      color: colors[Math.floor(Math.random() * colors.length)]
    });
  }
  var DURATION = 4500, start = Date.now();
  function frame() {
    var elapsed = Date.now() - start;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    var fade = elapsed > DURATION - 900 ? Math.max(0, (DURATION - elapsed) / 900) : 1;
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      p.x += p.vx; p.y += p.vy; p.vy += 0.02; p.rot += p.vr;
      if (p.y > canvas.height + 20) { p.y = -20; p.x = Math.random() * canvas.width; }
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.globalAlpha = fade; ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore();
    }
    if (elapsed < DURATION) raf = requestAnimationFrame(frame);
    else stopConfetti();
  }
  raf = requestAnimationFrame(frame);
}
