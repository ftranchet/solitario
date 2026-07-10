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

/*
 * el() — helper de creación de nodos DOM, idéntico en Solitario, Carta
 * Blanca y Corazones (Buscaminas no lo necesita: no lo usaba). Reemplaza
 * `document.createElement` + asignar className/innerHTML a mano.
 */
/**
 * @param {string} tag
 * @param {string} [cls]
 * @param {string} [html]
 */
function el(tag, cls, html) {
  var e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}

/**
 * Devuelve una versión "debounced" de `fn`: sólo corre `ms` después del
 * último llamado, cancelando el timer del llamado anterior. Los 3 juegos de
 * cartas la usaban igual para el resize (en móvil dispara en ráfagas: barra
 * del navegador, rotación); Buscaminas no la necesita desde que su tamaño
 * pasó a CSS puro (ver docs/PLAN.md, Fase 2).
 * @param {() => void} fn
 * @param {number} ms
 * @returns {() => void}
 */
function debounce(fn, ms) {
  var timer = 0;
  return function () {
    if (timer) clearTimeout(timer);
    timer = window.setTimeout(function () { timer = 0; fn(); }, ms);
  };
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
 * Accesibilidad de los modales (.overlay), común a los 4 juegos:
 *   - Escape cierra el modal visible, PERO sólo los descartables: se cierra
 *     clickeando su propio botón de cierre (id terminado en "-close"), así
 *     corre la misma lógica que el botón (p. ej. #win-close también frena el
 *     confeti). El modal de fin de mano de Corazones NO tiene botón "-close"
 *     (su único botón AVANZA el juego) y por eso Escape no lo toca.
 *   - El foco queda atrapado adentro (Tab/Shift+Tab ciclan) mientras haya un
 *     modal abierto, entra solo al abrirlo y vuelve a donde estaba al
 *     cerrarlo (patrón WAI-ARIA de diálogo modal).
 */
(function () {
  function visibleOverlays() {
    var all = document.querySelectorAll(".overlay");
    var out = [];
    for (var i = 0; i < all.length; i++) {
      var o = /** @type {HTMLElement} */ (all[i]);
      if (!o.hidden) out.push(o);
    }
    return out;
  }
  /** @param {HTMLElement} root */
  function focusables(root) {
    var nodes = root.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    /** @type {HTMLElement[]} */
    var out = [];
    for (var i = 0; i < nodes.length; i++) {
      var el2 = /** @type {HTMLElement} */ (nodes[i]);
      var disabled = /** @type {HTMLButtonElement} */ (el2).disabled;
      if (!disabled && el2.offsetParent !== null) out.push(el2);
    }
    return out;
  }

  document.addEventListener("keydown", function (e) {
    var open = visibleOverlays();
    if (!open.length) return;
    var top = open[open.length - 1];
    if (e.key === "Escape") {
      var closeBtn = /** @type {HTMLElement | null} */ (top.querySelector('[id$="-close"]'));
      if (closeBtn) { e.preventDefault(); closeBtn.click(); }
      return;
    }
    if (e.key !== "Tab") return;
    var f = focusables(top);
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    var active = document.activeElement;
    if (!top.contains(active)) { e.preventDefault(); first.focus(); }
    else if (e.shiftKey && active === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
  });

  // Al abrirse un modal (hidden -> false), el foco entra a su primer control
  // y se recuerda dónde estaba; al cerrarse, vuelve ahí. Los overlays son
  // estáticos en el HTML, así que alcanza con observar su atributo `hidden`.
  /** @type {HTMLElement | null} */
  var restoreTo = null;
  var mo = new MutationObserver(function (muts) {
    for (var i = 0; i < muts.length; i++) {
      var o = /** @type {HTMLElement} */ (muts[i].target);
      if (!o.hidden) {
        restoreTo = /** @type {HTMLElement | null} */ (document.activeElement instanceof HTMLElement ? document.activeElement : null);
        var f = focusables(o);
        if (f.length) f[0].focus();
      } else if (restoreTo && document.contains(restoreTo)) {
        restoreTo.focus();
        restoreTo = null;
      }
    }
  });
  var overlays = document.querySelectorAll(".overlay");
  for (var i = 0; i < overlays.length; i++) {
    mo.observe(overlays[i], { attributes: true, attributeFilter: ["hidden"] });
    var modal = overlays[i].querySelector(".card-modal");
    if (modal) { modal.setAttribute("role", "dialog"); modal.setAttribute("aria-modal", "true"); }
  }
})();

/*
 * Festejos de victoria, en un canvas de pantalla completa (.confetti-canvas,
 * ver styles/game.css). Dos variantes:
 *   - celebrate(): lluvia de confeti (Corazones, Buscaminas).
 *   - cascade(stacks): la CASCADA de cartas clásica de Windows — las cartas
 *     de las pilas finales salen despedidas y rebotan por la pantalla
 *     dejando estela (el canvas no se borra entre frames, ésa es la gracia).
 *     La usan Solitario y Carta Blanca.
 * Ambas respetan prefers-reduced-motion (no dibujan nada) y se cortan con
 * stopConfetti() (nueva partida, cerrar el modal de victoria).
 */
/** @type {(() => void) | null} */
var confettiCleanup = null;

function stopConfetti() {
  if (confettiCleanup) { confettiCleanup(); confettiCleanup = null; }
}

/**
 * Cascada de cartas al ganar. Cada ~300ms sale UNA carta de cada pila final
 * (las 4 a la vez, como en el Solitario clásico), con velocidad horizontal
 * aleatoria; rebotan contra el piso perdiendo energía y desaparecen al salir
 * por los costados. Colores desde los tokens (respeta el modo oscuro).
 * @typedef {{ suit: string, rank: number }} CascadeCard
 * @typedef {{ x: number, y: number, w: number, h: number, cards: CascadeCard[] }} CascadeStack
 * @param {CascadeStack[]} stacks  pilas finales; `cards` va de arriba hacia abajo
 */
function cascade(stacks) {
  stopConfetti();
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  var canvas = document.createElement("canvas");
  canvas.className = "confetti-canvas";
  document.body.appendChild(canvas);
  var maybeCtx = canvas.getContext("2d");
  if (!maybeCtx) { canvas.remove(); return; }
  var ctx = maybeCtx;
  function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
  resize();
  var debouncedResize = debounce(resize, 120);   // borra la estela, las cartas siguen
  window.addEventListener("resize", debouncedResize);
  var raf = 0;
  confettiCleanup = function () {
    if (raf) cancelAnimationFrame(raf);
    window.removeEventListener("resize", debouncedResize);
    canvas.remove();
  };

  var css = getComputedStyle(document.documentElement);
  /** @param {string} name @param {string} fallback */
  function token(name, fallback) { var v = css.getPropertyValue(name).trim(); return v || fallback; }
  var FACE = token("--card-face-top", "#ffffff");
  var BORDER = token("--paper-border", "#d9cdb4");
  var RED = token("--suit-red", "#c62828");
  var BLACK = token("--suit-black", "#1a1a1a");
  /** @type {Record<string, string>} */
  var SYM = { spades: "♠", hearts: "♥", diamonds: "♦", clubs: "♣" };

  /** @type {{x:number,y:number,vx:number,vy:number,w:number,h:number,card:CascadeCard}[]} */
  var flying = [];
  var pointers = stacks.map(function () { return 0; });
  var WAVE_MS = 300, GRAV = 0.5, BOUNCE = 0.82, LIMIT_MS = 15000;
  var start = Date.now(), lastWave = -WAVE_MS;

  /** @param {{x:number,y:number,w:number,h:number,card:CascadeCard}} f */
  function drawCard(f) {
    var x = f.x, y = f.y, w = f.w, h = f.h, r = Math.max(3, w * 0.1);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    ctx.fillStyle = FACE;
    ctx.fill();
    ctx.strokeStyle = BORDER;
    ctx.lineWidth = 1;
    ctx.stroke();
    var color = SUIT[f.card.suit] && SUIT[f.card.suit].color === "red" ? RED : BLACK;
    ctx.fillStyle = color;
    ctx.textBaseline = "top";
    ctx.font = "900 " + Math.round(h * 0.24) + "px system-ui, sans-serif";
    ctx.fillText(RANK_LABEL[f.card.rank] + (SYM[f.card.suit] || ""), x + w * 0.09, y + h * 0.06);
    ctx.font = "900 " + Math.round(h * 0.42) + "px system-ui, sans-serif";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(SYM[f.card.suit] || "", x + w * 0.32, y + h * 0.88);
  }

  function frame() {
    var now = Date.now();
    if (now - start > LIMIT_MS) { stopConfetti(); return; }
    // Nueva tanda: una carta de cada pila que todavía tenga.
    if (now - start - lastWave >= WAVE_MS) {
      lastWave = now - start;
      for (var s = 0; s < stacks.length; s++) {
        var st = stacks[s];
        if (pointers[s] >= st.cards.length) continue;
        var card = st.cards[pointers[s]++];
        var dir = Math.random() < 0.5 ? -1 : 1;
        flying.push({
          x: st.x, y: st.y, w: st.w, h: st.h, card: card,
          vx: dir * (2.5 + Math.random() * 5), vy: -(1 + Math.random() * 3)
        });
      }
    }
    // Física + dibujo SIN borrar el canvas: las cartas dejan estela.
    for (var i = flying.length - 1; i >= 0; i--) {
      var f = flying[i];
      f.vy += GRAV; f.x += f.vx; f.y += f.vy;
      if (f.y + f.h > canvas.height) { f.y = canvas.height - f.h; f.vy = -Math.abs(f.vy) * BOUNCE; }
      if (f.x < -f.w || f.x > canvas.width) { flying.splice(i, 1); continue; }
      drawCard(f);
    }
    var launchedAll = pointers.every(function (ptr, s2) { return ptr >= stacks[s2].cards.length; });
    if (launchedAll && !flying.length) { stopConfetti(); return; }
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);
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
  // Debounced: sin esto, arrastrar el borde de la ventana (o rotar el
  // celular) durante los ~4.5s de confeti reasigna canvas.width/height
  // decenas de veces por segundo, cada una un reflow costoso.
  var debouncedResize = debounce(resize, 120);
  window.addEventListener("resize", debouncedResize);
  var raf = 0;
  confettiCleanup = function () {
    if (raf) cancelAnimationFrame(raf);
    window.removeEventListener("resize", debouncedResize);
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
