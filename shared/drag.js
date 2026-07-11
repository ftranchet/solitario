// @ts-check
/*
 * shared/drag.js — Máquina de arrastre por puntero (pointerdown/move/up/
 * cancel), común a Solitario y Carta Blanca (~100 líneas que eran
 * duplicadas casi byte a byte entre los dos motores, ver docs/PLAN-2.md,
 * Fase 5). Corazones no la usa: su interacción es sólo clic/toque (mano
 * abanicada, sin drag & drop); Buscaminas tampoco (sin cartas).
 *
 * Cada juego crea SU controlador con makeDragController(cfg), pasando sólo
 * los puntos donde de verdad difieren:
 *   extraPile            "waste" (Solitario) | "free" (Carta Blanca) — el
 *                        nombre de la pila de un solo hueco (además de
 *                        tablero/fundación).
 *   offset()             alto en px de cada carta apilada en la vista de
 *                        arrastre (OFFSET_UP en Solitario, OFFSET en Carta
 *                        Blanca).
 *   canDrag(src)          ¿esta carta/grupo se puede agarrar como tal? En
 *                        Solitario siempre (ya sólo cablea drag en cartas
 *                        boca arriba); en Carta Blanca sólo si forma una
 *                        escalera válida (canSelectTableau()) — si no, el
 *                        puntero se ignora y el toque queda para el click.
 *   selectionIndex(src)   índice a guardar en `selection` (en Solitario es
 *                        src.index tal cual; en Carta Blanca depende de la
 *                        pila de origen).
 *   tryDrop(dropAttr)     intenta soltar en el `data-drop` bajo el punto
 *                        de soltado (cada juego prueba sus propias pilas
 *                        —Carta Blanca suma el pozo libre—) y devuelve si
 *                        se aplicó el movimiento.
 *   onClick(src)          qué hacer si NO hubo arrastre (un tap/click
 *                        normal) — llama al handleCardClick() de cada
 *                        juego con su propia firma (Solitario pasa
 *                        también la carta; Carta Blanca no la necesita).
 *
 * El resto —seguimiento del puntero, el umbral de 8px para distinguir tap
 * de drag, un solo puntero a la vez, la capa flotante que sigue al dedo/
 * cursor, buscar el data-drop bajo el punto de soltado (con el cuerpo de
 * la carta como respaldo si ahí no hay nada)— es idéntico entre los dos
 * juegos y vive acá.
 *
 * Se carga como <script> CLÁSICO, después de shared/cards.js (usa
 * makeCardEl) y antes de games/<juego>.js (que llama a
 * makeDragController()). Depende de globals que cada juego YA declara con
 * el mismo nombre y sentido (mismo scope global, sin módulos): `autoTimer`,
 * `selection`, `CW`, `CH`, `startTimer()`, `render()`, `checkWin()`,
 * `getSelectionCards()` — se leen/escriben directo, como si este código
 * siguiera viviendo en el archivo del juego.
 */
/**
 * @typedef {Object} DragConfig
 * @property {string} extraPile
 * @property {() => number} offset
 * @property {(src: any) => boolean} canDrag
 * @property {(src: any) => number} selectionIndex
 * @property {(dropAttr: string) => boolean} tryDrop
 * @property {(src: any) => void} onClick
 */
/**
 * @param {DragConfig} cfg
 * @returns {{ onPointerDown: (e: PointerEvent, src: any, elem: HTMLElement) => void }}
 */
function makeDragController(cfg) {
  /** @type {{ src: any, startX: number, startY: number, rect: DOMRect, pointerId: number, elem: HTMLElement, canDrag: boolean } | null} */
  var pending = null;
  /** @type {{ layer: HTMLElement, inner: HTMLElement, grabDX: number, grabDY: number } | null} */
  var drag = null;

  /** @param {PointerEvent} e @param {any} src @param {HTMLElement} elem */
  function onPointerDown(e, src, elem) {
    if (autoTimer) return;
    if (pending) return;   // ya hay un toque/arrastre en curso: ignorar dedos extra
    if (e.button != null && e.button > 0) return;
    e.preventDefault();
    try { elem.setPointerCapture(e.pointerId); } catch (_) {}
    pending = {
      src: src, startX: e.clientX, startY: e.clientY,
      rect: elem.getBoundingClientRect(), pointerId: e.pointerId, elem: elem,
      canDrag: cfg.canDrag(src)
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerCancel);
  }
  /** @param {PointerEvent} e */
  function onPointerMove(e) {
    if (!pending || e.pointerId !== pending.pointerId) return;
    if (!drag) {
      if (!pending.canDrag) return;
      var dx = e.clientX - pending.startX, dy = e.clientY - pending.startY;
      if (Math.sqrt(dx * dx + dy * dy) < 8) return;
      beginDrag();
    }
    if (drag) { e.preventDefault(); positionDrag(e.clientX, e.clientY); }
  }
  /** @param {PointerEvent} e */
  function onPointerUp(e) {
    if (!pending || e.pointerId !== pending.pointerId) return;
    cleanupListeners();
    var wasDrag = !!drag;
    var s = pending.src;
    if (wasDrag) finishDrag(e);
    pending = null;
    if (!wasDrag) cfg.onClick(s);
  }
  /** @param {PointerEvent} e */
  function onPointerCancel(e) {
    if (!pending || e.pointerId !== pending.pointerId) return;
    cleanupListeners();
    if (drag) { drag.layer.remove(); drag = null; selection = null; render(); }
    pending = null;
  }
  function cleanupListeners() {
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("pointercancel", onPointerCancel);
  }
  /** @param {{ pile: string, col: number, index: number }} sel */
  function getRunElements(sel) {
    var nodes;
    if (sel.pile === "tableau") {
      nodes = document.querySelectorAll('.card[data-pile="tableau"][data-col="' + sel.col + '"]');
      var arr = [];
      for (var i = 0; i < nodes.length; i++) if (parseInt(/** @type {string} */ (nodes[i].getAttribute("data-index")), 10) >= sel.index) arr.push(nodes[i]);
      return arr;
    }
    if (sel.pile === cfg.extraPile) nodes = document.querySelectorAll('.card[data-pile="' + cfg.extraPile + '"][data-col="' + sel.col + '"]');
    else nodes = document.querySelectorAll('.card[data-pile="foundation"][data-col="' + sel.col + '"]');
    return Array.prototype.slice.call(nodes);
  }
  function beginDrag() {
    var p = /** @type {NonNullable<typeof pending>} */ (pending);
    selection = { pile: p.src.pile, col: p.src.col, index: cfg.selectionIndex(p.src) };
    // getSelectionCards() no da null acá: selection se acaba de fijar arriba.
    var cards = /** @type {Card[]} */ (getSelectionCards());
    var originals = getRunElements(selection);
    for (var i = 0; i < originals.length; i++) originals[i].classList.add("dragging");

    var layer = el("div", "drag-layer");
    var inner = el("div", "drag-inner");
    for (var j = 0; j < cards.length; j++) {
      var c = makeCardEl(cards[j], false);
      c.style.position = "absolute"; c.style.left = "0"; c.style.top = (j * cfg.offset()) + "px";
      inner.appendChild(c);
    }
    layer.appendChild(inner);
    document.body.appendChild(layer);
    drag = { layer: layer, inner: inner, grabDX: p.startX - p.rect.left, grabDY: p.startY - p.rect.top };
    positionDrag(p.startX, p.startY);
  }
  /** @param {number} x @param {number} y */
  function positionDrag(x, y) {
    var d = /** @type {NonNullable<typeof drag>} */ (drag);
    d.inner.style.transform = "translate(" + (x - d.grabDX) + "px," + (y - d.grabDY) + "px)";
  }
  /** @param {number} x @param {number} y */
  function dropTargetAt(x, y) {
    var under = document.elementFromPoint(x, y);
    return under ? under.closest("[data-drop]") : null;
  }
  /** @param {PointerEvent} e */
  function finishDrag(e) {
    var d = /** @type {NonNullable<typeof drag>} */ (drag);
    var cardLeft = e.clientX - d.grabDX, cardTop = e.clientY - d.grabDY;
    d.layer.remove();
    drag = null;
    // Soltado: primero donde está el dedo/cursor (lo intuitivo, sirva donde sirva el agarre);
    // si ahí no hay pila, se prueba el cuerpo de la carta como respaldo (no rebota si la tapa).
    var target = dropTargetAt(e.clientX, e.clientY) || dropTargetAt(cardLeft + CW * 0.5, cardTop + CH * 0.30);
    var moved = target ? cfg.tryDrop(/** @type {string} */ (target.getAttribute("data-drop"))) : false;
    selection = null;
    if (moved) { startTimer(); render(); checkWin(); }
    else render();
  }

  return { onPointerDown: onPointerDown };
}
