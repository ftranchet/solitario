/* ---------- Datos básicos ---------- */
var SUIT = {
  spades:   { symbol: "♠", color: "black", name: "picas" },
  hearts:   { symbol: "♥", color: "red", name: "corazones" },
  diamonds: { symbol: "♦", color: "red", name: "diamantes" },
  clubs:    { symbol: "♣", color: "black", name: "tréboles" }
};
var RANK_LABEL = {1:"A",2:"2",3:"3",4:"4",5:"5",6:"6",7:"7",8:"8",9:"9",10:"10",11:"J",12:"Q",13:"K"};
var MAX_GAME = 2147483647;

/* ---------- Estado ---------- */
var state = null;
var gameNumber = 1;
var selection = null;      // { pile, col, index }  pile: "tableau" | "free" | "foundation"
var undoStack = [];
var seconds = 0, timerId = null, started = false;
var CW, CH, OFFSET;

/* ---------- Arrastre ---------- */
var pending = null;        // { src, startX, startY, rect, pointerId, elem, canDrag }
var drag = null;           // { layer, inner, grabDX, grabDY }

/* ---------- Pistas y autocompletar ---------- */
var hintMoves = null, hintIndex = 0, hintStateMoves = -1, hintTimer = null;
var autoTimer = null;
var animFoundation = -1;   // pila final que acaba de recibir una carta (para animarla)
var counted = false;       // ¿ya se contó esta partida en las estadísticas?
var winRecorded = false;   // ¿ya se registró la victoria? (deshacer y rehacer no debe duplicarla)

/* ---------- Estadísticas ---------- */
var STATS_KEY = "cartablanca.stats";
// loadStats/saveStats/bumpStat vienen de makeStats() en shared/storage.js.
var _stats = makeStats(STATS_KEY);
var loadStats = _stats.load, saveStats = _stats.save, bumpStat = _stats.bump;
function recordWin() {
  var s = loadStats();
  s.won = (s.won || 0) + 1;
  if (s.bestTime == null || seconds < s.bestTime) s.bestTime = seconds;
  saveStats(s);
}

/* ---------- Reparto (numerado, estilo FreeCell de Windows) ----------
   Generador lineal congruente de Microsoft: cada número de partida produce
   siempre el mismo reparto. */
function msDeal(seed) {
  var s = seed >>> 0;
  function rnd() {
    s = (s * 214013 + 2531011) >>> 0;
    return (s >>> 16) & 0x7fff;
  }
  var deck = [];
  for (var i = 0; i < 52; i++) deck.push(i);
  var out = [], n = 52;
  for (var k = 0; k < 52; k++) {
    var j = rnd() % n;
    out.push(deck[j]);
    deck[j] = deck[n - 1];
    n--;
  }
  return out;
}
function msCardToObj(c) {
  var rank = Math.floor(c / 4) + 1;                       // 1..13
  var suit = ["clubs", "diamonds", "hearts", "spades"][c % 4];
  return { suit: suit, rank: rank, color: SUIT[suit].color, faceUp: true, id: c };
}
function randomGameNumber() { return Math.floor(Math.random() * 1000000) + 1; }
function deal(number) {
  gameNumber = number;
  var order = msDeal(number);
  state = { free: [null, null, null, null], foundations: [[],[],[],[]],
            tableau: [[],[],[],[],[],[],[],[]], moves: 0 };
  for (var k = 0; k < 52; k++) state.tableau[k % 8].push(msCardToObj(order[k]));
}

/* ---------- Deshacer ---------- */
function snapshot() {
  undoStack.push(JSON.stringify(state));
  if (undoStack.length > 400) undoStack.shift();
}
function undo() {
  if (!undoStack.length) return;
  stopAutoComplete();
  clearHintHighlights();
  state = JSON.parse(undoStack.pop());
  selection = null;
  render();
}

/* ---------- Reglas ---------- */
function foundationSlotFor(foundations, card) {
  for (var i = 0; i < 4; i++) {
    var f = foundations[i];
    if (f.length && f[f.length - 1].suit === card.suit) return i;
  }
  if (card.rank === 1) {
    for (var k = 0; k < 4; k++) if (foundations[k].length === 0) return k;
  }
  return -1;
}
function canFoundIn(foundations, card) {
  var i = foundationSlotFor(foundations, card);
  if (i < 0) return -1;
  var f = foundations[i];
  if (f.length === 0) return card.rank === 1 ? i : -1;
  return card.rank === f[f.length - 1].rank + 1 ? i : -1;
}
function canMoveToFoundation(card) { return canFoundIn(state.foundations, card); }

function canPlaceOnTableau(card, col) {
  var t = state.tableau[col];
  if (t.length === 0) return true;                        // cualquier carta a una columna vacía
  var top = t[t.length - 1];
  return top.color !== card.color && top.rank === card.rank + 1;
}
/* ¿Las cartas de t[index..fin] forman una escalera válida (baja y alterna color)? */
function isValidRun(cards) {
  for (var i = 1; i < cards.length; i++) {
    var a = cards[i - 1], b = cards[i];
    if (!(a.color !== b.color && a.rank === b.rank + 1)) return false;
  }
  return true;
}
function canSelectTableau(col, index) {
  var t = state.tableau[col];
  if (index < 0 || index >= t.length) return false;
  if (index === t.length - 1) return true;
  return isValidRun(t.slice(index));
}
/* Cuántas cartas se pueden mover juntas a "destCol":
   (pozos libres + 1) * 2 ^ (columnas vacías). La columna de destino, si está
   vacía, no se cuenta. */
function countEmptyFree() {
  var n = 0;
  for (var i = 0; i < 4; i++) if (!state.free[i]) n++;
  return n;
}
function countEmptyCols(exclude) {
  var n = 0;
  for (var c = 0; c < 8; c++) {
    if (c === exclude) continue;
    if (state.tableau[c].length === 0) n++;
  }
  return n;
}
function maxMovable(destCol) {
  return (countEmptyFree() + 1) * Math.pow(2, countEmptyCols(destCol));
}

/* ---------- Selección ---------- */
function getSelectionCards() {
  if (!selection) return null;
  if (selection.pile === "tableau") return state.tableau[selection.col].slice(selection.index);
  if (selection.pile === "free") return [state.free[selection.col]];
  if (selection.pile === "foundation") {
    var f = state.foundations[selection.col]; return [f[f.length - 1]];
  }
  return null;
}
function removeSelected() {
  if (selection.pile === "tableau") return state.tableau[selection.col].splice(selection.index);
  if (selection.pile === "free") { var c = state.free[selection.col]; state.free[selection.col] = null; return [c]; }
  if (selection.pile === "foundation") return [state.foundations[selection.col].pop()];
  return [];
}
function selectCard(pile, col, index) {
  if (pile === "tableau") { if (!canSelectTableau(col, index)) return false; selection = { pile: "tableau", col: col, index: index }; return true; }
  if (pile === "free") { if (state.free[col] == null) return false; selection = { pile: "free", col: col, index: 0 }; return true; }
  if (pile === "foundation") { var f = state.foundations[col]; if (!f.length) return false; selection = { pile: "foundation", col: col, index: f.length - 1 }; return true; }
  return false;
}

/* ---------- Movimientos ---------- */
function moveSelectionToTableau(col) {
  if (selection.pile === "tableau" && selection.col === col) return false;
  var cards = getSelectionCards();
  if (!canPlaceOnTableau(cards[0], col)) return false;
  if (cards.length > maxMovable(col)) return false;
  snapshot();
  var moved = removeSelected();
  for (var i = 0; i < moved.length; i++) state.tableau[col].push(moved[i]);
  state.moves++;
  return true;
}
function moveSelectionToFree(col) {
  if (selection.pile === "free" && selection.col === col) return false;
  var cards = getSelectionCards();
  if (cards.length !== 1) return false;
  if (state.free[col] != null) return false;
  snapshot();
  var moved = removeSelected();
  state.free[col] = moved[0];
  state.moves++;
  return true;
}
function moveSelectionToFoundation() {
  if (selection.pile === "foundation") return false;
  var cards = getSelectionCards();
  if (cards.length !== 1) return false;
  var fi = canMoveToFoundation(cards[0]);
  if (fi < 0) return false;
  snapshot();
  var moved = removeSelected();
  state.foundations[fi].push(moved[0]);
  animFoundation = fi;
  state.moves++;
  return true;
}
/* Doble clic / doble toque: mandar la carta (o la escalera) a donde corresponda.
   Prioridad: pila final > otra columna del tablero > pozo libre. */
function autoMoveSelection() {
  if (moveSelectionToFoundation()) return true;
  if (selection.pile === "foundation") return false;
  var cards = getSelectionCards();
  if (!cards || !cards.length) return false;
  var lead = cards[0];
  var srcCol = selection.pile === "tableau" ? selection.col : -1;
  var emptyDest = -1;
  for (var dc = 0; dc < 8; dc++) {
    if (dc === srcCol) continue;
    if (!canPlaceOnTableau(lead, dc)) continue;
    if (cards.length > maxMovable(dc)) continue;
    if (state.tableau[dc].length > 0) return moveSelectionToTableau(dc);  // sobre otra carta
    if (emptyDest < 0) emptyDest = dc;                                    // columna vacía
  }
  if (cards.length === 1 && selection.pile !== "free") {
    for (var fc = 0; fc < 4; fc++) if (state.free[fc] == null) return moveSelectionToFree(fc);
  }
  if (emptyDest >= 0) return moveSelectionToTableau(emptyDest);
  return false;
}

/* ---------- Toques (tap) ---------- */
function handleCardClick(pile, col, index) {
  if (selection) {
    var sameAnchor = selection.pile === pile && selection.col === col &&
      (pile === "tableau" ? selection.index === index : true);
    if (sameAnchor) {
      if (autoMoveSelection()) { selection = null; afterMove(); return; }
      selection = null; render(); return;
    }
    var moved = false;
    if (pile === "tableau") moved = moveSelectionToTableau(col);
    else if (pile === "foundation") moved = moveSelectionToFoundation();
    else if (pile === "free") moved = moveSelectionToFree(col);
    if (moved) { selection = null; afterMove(); return; }
    if (selectCard(pile, col, index)) render();
    else { selection = null; render(); }
    return;
  }
  if (selectCard(pile, col, index)) render();
}
function handleEmptyColumn(col) {
  if (autoTimer || !selection) return;
  if (moveSelectionToTableau(col)) { selection = null; afterMove(); }
}
function handleFreeClick(col) {
  if (autoTimer || !selection) return;
  if (moveSelectionToFree(col)) { selection = null; afterMove(); }
}
function handleFoundationClick() {
  if (autoTimer || !selection) return;
  if (moveSelectionToFoundation()) { selection = null; afterMove(); }
}
function afterMove() { startTimer(); render(); checkWin(); }

/* ---------- Arrastre (drag) ---------- */
function onPointerDown(e, src, elem) {
  if (autoTimer) return;
  if (pending) return;
  if (e.button != null && e.button > 0) return;
  e.preventDefault();
  try { elem.setPointerCapture(e.pointerId); } catch (_) {}
  var canDrag = src.pile !== "tableau" || canSelectTableau(src.col, src.index);
  pending = {
    src: src, startX: e.clientX, startY: e.clientY,
    rect: elem.getBoundingClientRect(), pointerId: e.pointerId, elem: elem, canDrag: canDrag
  };
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerCancel);
}
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
function onPointerUp(e) {
  if (!pending || e.pointerId !== pending.pointerId) return;
  cleanupListeners();
  var wasDrag = !!drag;
  var s = pending.src;
  if (wasDrag) finishDrag(e);
  pending = null;
  if (!wasDrag) handleCardClick(s.pile, s.col, s.index);
}
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
function getRunElements(sel) {
  var nodes;
  if (sel.pile === "tableau") {
    nodes = document.querySelectorAll('.card[data-pile="tableau"][data-col="' + sel.col + '"]');
    var arr = [];
    for (var i = 0; i < nodes.length; i++) if (parseInt(nodes[i].dataset.index, 10) >= sel.index) arr.push(nodes[i]);
    return arr;
  }
  if (sel.pile === "free") nodes = document.querySelectorAll('.card[data-pile="free"][data-col="' + sel.col + '"]');
  else nodes = document.querySelectorAll('.card[data-pile="foundation"][data-col="' + sel.col + '"]');
  return Array.prototype.slice.call(nodes);
}
function beginDrag() {
  var src = pending.src;
  selection = { pile: src.pile, col: src.col, index: src.pile === "tableau" ? src.index : (src.pile === "foundation" ? src.index : 0) };
  var cards = getSelectionCards();
  var originals = getRunElements(selection);
  for (var i = 0; i < originals.length; i++) originals[i].classList.add("dragging");

  var layer = el("div", "drag-layer");
  var inner = el("div", "drag-inner");
  for (var j = 0; j < cards.length; j++) {
    var c = makeCardEl(cards[j], false);
    c.style.position = "absolute"; c.style.left = "0"; c.style.top = (j * OFFSET) + "px";
    inner.appendChild(c);
  }
  layer.appendChild(inner);
  document.body.appendChild(layer);
  drag = { layer: layer, inner: inner, grabDX: pending.startX - pending.rect.left, grabDY: pending.startY - pending.rect.top };
  positionDrag(pending.startX, pending.startY);
}
function positionDrag(x, y) {
  drag.inner.style.transform = "translate(" + (x - drag.grabDX) + "px," + (y - drag.grabDY) + "px)";
}
function dropTargetAt(x, y) {
  var under = document.elementFromPoint(x, y);
  return under ? under.closest("[data-drop]") : null;
}
function finishDrag(e) {
  var cardLeft = e.clientX - drag.grabDX, cardTop = e.clientY - drag.grabDY;
  drag.layer.remove();
  drag = null;
  // Soltado: primero donde está el dedo/cursor (lo intuitivo, sirva donde sirva el agarre);
  // si ahí no hay pila, se prueba el cuerpo de la carta como respaldo (no rebota si la tapa).
  var target = dropTargetAt(e.clientX, e.clientY) || dropTargetAt(cardLeft + CW * 0.5, cardTop + CH * 0.30);
  var moved = false;
  if (target) {
    var d = target.getAttribute("data-drop");
    if (d.indexOf("foundation") === 0) moved = moveSelectionToFoundation();
    else if (d.indexOf("free") === 0) moved = moveSelectionToFree(parseInt(d.split(":")[1], 10));
    else if (d.indexOf("tableau") === 0) moved = moveSelectionToTableau(parseInt(d.split(":")[1], 10));
  }
  selection = null;
  if (moved) { startTimer(); render(); checkWin(); }
  else render();
}

/* ---------- Reloj ---------- */
function startTimer() {
  if (started) return;
  started = true;
  if (!counted) { counted = true; bumpStat("played"); }
  timerId = setInterval(function () { seconds++; updateHUD(); }, 1000);
}
function stopTimer() { if (timerId) clearInterval(timerId); timerId = null; }
function resetTimer() { stopTimer(); seconds = 0; started = false; updateHUD(); }

/* ---------- Victoria + festejo ---------- */
// celebrate() y stopConfetti() viven en shared/ui.js.
function totalFoundation() {
  var total = 0;
  for (var i = 0; i < 4; i++) total += state.foundations[i].length;
  return total;
}
function isWon() { return totalFoundation() === 52; }
function checkWin() {
  if (!isWon()) return;
  stopTimer();
  started = false;   // si se sigue jugando (deshacer), el reloj puede reanudarse
  if (!winRecorded) { winRecorded = true; recordWin(); }
  var m = Math.floor(seconds / 60), s = seconds % 60;
  var t = (m < 10 ? "0" : "") + m + ":" + (s < 10 ? "0" : "") + s;
  document.getElementById("win-stats").textContent =
    "Tiempo " + t + " · " + state.moves + " movimientos · Partida n.º " + gameNumber;
  document.getElementById("win").hidden = false;
  celebrate();
}
/* ---------- Sin jugadas (derrota) ---------- */
function bottomRunStart(col) {
  var t = state.tableau[col];
  if (!t.length) return -1;
  var i = t.length - 1;
  while (i > 0 && t[i - 1].color !== t[i].color && t[i - 1].rank === t[i].rank + 1) i--;
  return i;
}
function hasAnyMove() {
  var col, dc, i;
  // 1) A las pilas finales
  for (i = 0; i < 4; i++) if (state.free[i] && canMoveToFoundation(state.free[i]) >= 0) return true;
  for (col = 0; col < 8; col++) {
    var t = state.tableau[col];
    if (t.length && canMoveToFoundation(t[t.length - 1]) >= 0) return true;
  }
  // 2) Mandar una carta a un pozo libre vacío (siempre que haya alguna carta)
  if (countEmptyFree() > 0) {
    for (col = 0; col < 8; col++) if (state.tableau[col].length) return true;
  }
  // 3) Escaleras (o cartas) de una columna a otra
  for (col = 0; col < 8; col++) {
    var start = bottomRunStart(col);
    if (start < 0) continue;
    var len = state.tableau[col].length;
    for (i = start; i < len; i++) {
      var lead = state.tableau[col][i];
      var runLen = len - i;
      for (dc = 0; dc < 8; dc++) {
        if (dc === col) continue;
        if (!canPlaceOnTableau(lead, dc)) continue;
        if (runLen > maxMovable(dc)) continue;
        if (i === 0 && state.tableau[dc].length === 0) continue; // mover columna entera a otra vacía no aporta
        return true;
      }
    }
  }
  // 4) De un pozo libre a una columna
  for (i = 0; i < 4; i++) {
    if (!state.free[i]) continue;
    for (dc = 0; dc < 8; dc++) if (canPlaceOnTableau(state.free[i], dc)) return true;
  }
  return false;
}
function updateStuckState() {
  var stuck = !isWon() && !autoTimer && !hasAnyMove();
  document.getElementById("btn-new").classList.toggle("attention", stuck);
}

/* ---------- Render ---------- */
// el() vive en shared/ui.js.
// cardFace, rankName, cardLabel y makeCardEl viven en shared/cards.js.
function attachDrag(elem, src) {
  elem.style.touchAction = "none";
  elem.addEventListener("pointerdown", function (e) { onPointerDown(e, src, elem); });
  keyActivate(elem, function () { handleCardClick(src.pile, src.col, src.index); });
}

function render() {
  var landFi = animFoundation; animFoundation = -1;   // animar el aterrizaje una sola vez
  var top = document.getElementById("top"); top.innerHTML = "";
  var tableau = document.getElementById("tableau"); tableau.innerHTML = "";

  /* Pozos libres (4, a la izquierda) */
  for (var fc = 0; fc < 4; fc++) {
    var cell = el("div", "slot");
    cell.setAttribute("data-drop", "free:" + fc);
    var card = state.free[fc];
    if (card) {
      var fsel = selection && selection.pile === "free" && selection.col === fc;
      var ce = makeCardEl(card, fsel);
      ce.dataset.pile = "free"; ce.dataset.col = String(fc); ce.dataset.index = "0";
      attachDrag(ce, { pile: "free", col: fc, index: 0, card: card });
      cell.appendChild(ce);
    } else {
      var fph = el("div", "free-ph");
      (function (c) { clickActivate(fph, function () { handleFreeClick(c); }); })(fc);
      cell.appendChild(fph);
    }
    top.appendChild(cell);
  }

  /* Pilas finales (4, a la derecha) */
  for (var fi = 0; fi < 4; fi++) {
    var fslot = el("div", "slot");
    fslot.setAttribute("data-drop", "foundation:" + fi);
    var f = state.foundations[fi];
    if (f.length) {
      var fcard = f[f.length - 1];
      var sel = selection && selection.pile === "foundation" && selection.col === fi;
      var fe = makeCardEl(fcard, sel);
      fe.dataset.pile = "foundation"; fe.dataset.col = String(fi); fe.dataset.index = String(f.length - 1);
      if (fi === landFi) fe.classList.add("land");
      attachDrag(fe, { pile: "foundation", col: fi, index: f.length - 1, card: fcard });
      fslot.appendChild(fe);
    } else {
      var fph2 = el("div", "foundation-ph", "A");
      clickActivate(fph2, handleFoundationClick);
      fslot.appendChild(fph2);
    }
    top.appendChild(fslot);
  }

  /* Columnas (8) */
  for (var col = 0; col < 8; col++) {
    var colEl = el("div", "col");
    colEl.setAttribute("data-drop", "tableau:" + col);
    var pile = state.tableau[col];
    if (pile.length === 0) {
      var ph = el("div", "placeholder");
      (function (cc) { clickActivate(ph, function () { handleEmptyColumn(cc); }); })(col);
      colEl.appendChild(ph);
    } else {
      var y = 0;
      for (var i = 0; i < pile.length; i++) {
        var tcard = pile[i];
        var tsel = selection && selection.pile === "tableau" && selection.col === col && i >= selection.index;
        var te = makeCardEl(tcard, tsel);
        te.style.top = y + "px"; te.style.zIndex = i;
        te.dataset.pile = "tableau"; te.dataset.col = String(col); te.dataset.index = String(i);
        attachDrag(te, { pile: "tableau", col: col, index: i, card: tcard });
        colEl.appendChild(te);
        y += OFFSET;
      }
      colEl.style.minHeight = (y - OFFSET + CH) + "px";
    }
    tableau.appendChild(colEl);
  }

  updateHUD();
  document.getElementById("btn-undo").disabled = undoStack.length === 0;
  updateAutoButton();
  updateStuckState();
  saveGame();
}

function updateHUD() {
  document.getElementById("moves").textContent = state.moves;
  document.getElementById("gameno").textContent = gameNumber;
  var m = Math.floor(seconds / 60), s = seconds % 60;
  document.getElementById("time").textContent = (m < 10 ? "0" : "") + m + ":" + (s < 10 ? "0" : "") + s;
}

/* ---------- Tamaños ---------- */
function setSizes() {
  var root = document.documentElement;
  var board = document.getElementById("board");
  var cs = getComputedStyle(board);
  var padL = parseFloat(cs.paddingLeft) || 0, padR = parseFloat(cs.paddingRight) || 0;
  var contentW = board.clientWidth - padL - padR;
  var gap = contentW < 520 ? 4 : (contentW < 820 ? 6 : 8);

  // Límite por ancho: 8 columnas + 7 huecos deben entrar.
  var cwByWidth = (contentW - 7 * gap) / 8;
  // Límite por alto: que la fila superior y parte del tablero entren.
  var availH = board.clientHeight || window.innerHeight;
  var cwByHeight = ((availH - 14) / 3.0) / 1.42;

  CW = Math.floor(Math.min(cwByWidth, cwByHeight));
  // Techo más alto en pantallas anchas: si no, en desktop el tablero queda
  // chico y descentrado con mucho espacio libre alrededor.
  var cwCap = window.innerWidth >= 1100 ? 145 : 104;
  CW = Math.max(30, Math.min(CW, cwCap));
  CH = Math.round(CW * 1.42);
  OFFSET = Math.max(22, Math.round(CH * 0.32));
  root.style.setProperty("--cw", CW + "px");
  root.style.setProperty("--ch", CH + "px");
  root.style.setProperty("--gap", gap + "px");
}

/* ---------- Pistas ---------- */
function generateHints() {
  var moves = [];
  var col, dc, i;
  // 1) A las pilas finales (prioridad alta)
  for (i = 0; i < 4; i++) {
    if (state.free[i] && canMoveToFoundation(state.free[i]) >= 0)
      moves.push({ kind: "foundation", from: { pile: "free", col: i, index: 0 }, fi: canMoveToFoundation(state.free[i]), prio: 1 });
  }
  for (col = 0; col < 8; col++) {
    var t = state.tableau[col];
    if (t.length && canMoveToFoundation(t[t.length - 1]) >= 0)
      moves.push({ kind: "foundation", from: { pile: "tableau", col: col, index: t.length - 1 }, fi: canMoveToFoundation(t[t.length - 1]), prio: 1 });
  }
  // 2) Escaleras de una columna a otra (prioriza vaciar una columna)
  for (col = 0; col < 8; col++) {
    var start = bottomRunStart(col);
    if (start < 0) continue;
    var len = state.tableau[col].length;
    for (i = start; i < len; i++) {
      var lead = state.tableau[col][i];
      var runLen = len - i;
      for (dc = 0; dc < 8; dc++) {
        if (dc === col) continue;
        if (!canPlaceOnTableau(lead, dc)) continue;
        if (runLen > maxMovable(dc)) continue;
        if (i === 0 && state.tableau[dc].length === 0) continue;
        var emptiesCol = (i === 0);
        moves.push({ kind: "tableau", from: { pile: "tableau", col: col, index: i }, toCol: dc, prio: emptiesCol ? 2 : 4 });
      }
    }
  }
  // 3) De un pozo libre a una columna
  for (i = 0; i < 4; i++) {
    if (!state.free[i]) continue;
    for (dc = 0; dc < 8; dc++)
      if (canPlaceOnTableau(state.free[i], dc))
        moves.push({ kind: "tableau", from: { pile: "free", col: i, index: 0 }, toCol: dc, prio: 3 });
  }
  moves.sort(function (a, b) { return a.prio - b.prio; });
  // 4) Como último recurso, guardar una carta en un pozo libre
  var emptyFree = -1;
  for (i = 0; i < 4; i++) if (!state.free[i]) { emptyFree = i; break; }
  if (emptyFree >= 0) {
    for (col = 0; col < 8; col++) {
      var tt = state.tableau[col];
      if (tt.length) { moves.push({ kind: "free", from: { pile: "tableau", col: col, index: tt.length - 1 }, toFree: emptyFree, prio: 8 }); break; }
    }
  }
  return moves;
}
function clearHintHighlights() {
  if (hintTimer) { clearTimeout(hintTimer); hintTimer = null; }
  var hs = document.querySelectorAll(".card.hint");
  for (var i = 0; i < hs.length; i++) hs[i].classList.remove("hint");
  var ts = document.querySelectorAll(".hint-target");
  for (var j = 0; j < ts.length; j++) ts[j].classList.remove("hint-target");
}
function showHint(move) {
  clearHintHighlights();
  var fp = move.from;
  var sel = '.card[data-pile="' + fp.pile + '"][data-col="' + fp.col + '"][data-index="' + fp.index + '"]';
  var srcEl = document.querySelector(sel);
  if (srcEl) srcEl.classList.add("hint");
  if (fp.pile === "tableau") {
    var run = document.querySelectorAll('.card[data-pile="tableau"][data-col="' + fp.col + '"]');
    for (var i = 0; i < run.length; i++)
      if (parseInt(run[i].dataset.index, 10) >= fp.index) run[i].classList.add("hint");
  }
  var dropSel = move.kind === "foundation" ? '[data-drop="foundation:' + move.fi + '"]'
    : move.kind === "free" ? '[data-drop="free:' + move.toFree + '"]'
    : '[data-drop="tableau:' + move.toCol + '"]';
  var dst = document.querySelector(dropSel);
  if (dst) dst.classList.add("hint-target");
  hintTimer = setTimeout(clearHintHighlights, 2000);
}
function onHint() {
  if (autoTimer) return;
  if (!hintMoves || state.moves !== hintStateMoves) {
    hintMoves = generateHints();
    hintIndex = 0;
    hintStateMoves = state.moves;
  } else if (hintMoves.length) {
    hintIndex = (hintIndex + 1) % hintMoves.length;
  }
  if (!hintMoves.length) { toast("No hay movimientos. Probá con una nueva partida."); return; }
  showHint(hintMoves[hintIndex]);
}

/* ---------- Autocompletar ----------
   Aparece sólo cuando llevando cartas a las pilas finales (sin más movimientos)
   se puede ganar la partida. */
function autoWinnable() {
  // Copias superficiales: la simulación sólo hace push/pop de referencias,
  // nunca muta las cartas (mucho más barato que clonar con JSON en cada render).
  var foundations = [], tableau = [], free = state.free.slice(), i0;
  for (i0 = 0; i0 < 4; i0++) foundations.push(state.foundations[i0].slice());
  for (i0 = 0; i0 < 8; i0++) tableau.push(state.tableau[i0].slice());
  var progress = true;
  while (progress) {
    progress = false;
    for (var i = 0; i < 4; i++) {
      if (free[i]) { var fi = canFoundIn(foundations, free[i]); if (fi >= 0) { foundations[fi].push(free[i]); free[i] = null; progress = true; } }
    }
    for (var col = 0; col < 8; col++) {
      var t = tableau[col];
      if (t.length) { var fj = canFoundIn(foundations, t[t.length - 1]); if (fj >= 0) { foundations[fj].push(t.pop()); progress = true; } }
    }
  }
  var total = 0;
  for (var k = 0; k < 4; k++) total += foundations[k].length;
  return total === 52;
}
function updateAutoButton() {
  var btn = document.getElementById("btn-auto");
  if (!btn) return;
  btn.hidden = !(!isWon() && !autoTimer && autoWinnable());
}
function findFoundationMove() {
  for (var i = 0; i < 4; i++) if (state.free[i] && canMoveToFoundation(state.free[i]) >= 0) return { from: "free", col: i };
  for (var col = 0; col < 8; col++) {
    var t = state.tableau[col];
    if (t.length && canMoveToFoundation(t[t.length - 1]) >= 0) return { from: "tableau", col: col };
  }
  return null;
}
function autoFoundationMove(mv) {
  var card, fi;
  if (mv.from === "free") {
    card = state.free[mv.col];
    fi = canMoveToFoundation(card);
    if (fi < 0) return false;
    state.free[mv.col] = null;
    state.foundations[fi].push(card);
  } else {
    var t = state.tableau[mv.col];
    card = t[t.length - 1];
    fi = canMoveToFoundation(card);
    if (fi < 0) return false;
    t.pop();
    state.foundations[fi].push(card);
  }
  animFoundation = fi;
  state.moves++;
  return true;
}
function startAutoComplete() {
  if (autoTimer) return;
  clearHintHighlights();
  selection = null;
  snapshot();
  startTimer();
  updateAutoButton();
  autoTimer = setInterval(autoTick, 130);
}
function stopAutoComplete() {
  if (autoTimer) clearInterval(autoTimer);
  autoTimer = null;
}
function autoTick() {
  selection = null;
  var mv = findFoundationMove();
  if (mv) {
    autoFoundationMove(mv);
    render();
    if (isWon()) { stopAutoComplete(); checkWin(); }
    return;
  }
  stopAutoComplete();
  render();
  if (isWon()) checkWin();
}

/* ---------- Aviso breve ---------- */
// toast() vive en shared/ui.js.

/* ---------- Persistencia (partida en curso) ---------- */
// El candado multi-pestaña y gameSet/gameDel/GAME_KEY viven en shared/storage.js.
function validCard(c) { return !!(c && SUIT[c.suit] && c.rank >= 1 && c.rank <= 13); }
function validState(s) {
  if (!s || !s.foundations || !s.tableau || !s.free) return false;
  if (s.foundations.length !== 4 || s.tableau.length !== 8 || s.free.length !== 4) return false;
  // Debe haber exactamente un mazo completo: 52 cartas válidas, sin repetidas.
  var piles = [], seen = {}, n = 0, i, j;
  for (i = 0; i < 4; i++) piles.push(s.foundations[i]);
  for (i = 0; i < 8; i++) piles.push(s.tableau[i]);
  for (i = 0; i < piles.length; i++) {
    if (!Array.isArray(piles[i])) return false;
    for (j = 0; j < piles[i].length; j++) {
      var c = piles[i][j];
      if (!validCard(c)) return false;
      var key = c.suit + "-" + c.rank;
      if (seen[key]) return false;
      seen[key] = 1;
      n++;
    }
  }
  for (i = 0; i < 4; i++) {
    var fc = s.free[i];
    if (fc == null) continue;
    if (!validCard(fc)) return false;
    var fkey = fc.suit + "-" + fc.rank;
    if (seen[fkey]) return false;
    seen[fkey] = 1;
    n++;
  }
  return n === 52;
}
function saveGame() {
  try {
    if (isWon()) { gameDel(); return; }
    gameSet(JSON.stringify({ state: state, seconds: seconds, gameNumber: gameNumber, counted: counted }));
  } catch (e) {}
}
function loadGame() {
  try {
    var data = JSON.parse(localStorage.getItem(GAME_KEY));
    if (!data || !validState(data.state)) return false;
    state = data.state;
    if (typeof state.moves !== "number" || state.moves < 0) state.moves = 0;
    seconds = (typeof data.seconds === "number" && data.seconds >= 0) ? data.seconds : 0;
    gameNumber = (typeof data.gameNumber === "number" && data.gameNumber >= 1) ? data.gameNumber : 1;
    counted = !!data.counted;
    winRecorded = false;
    started = false; selection = null; undoStack = [];
    stopTimer();
    render();
    return true;
  } catch (e) { return false; }
}

/* ---------- Nueva partida ---------- */
function newGame(number) {
  stopAutoComplete();
  stopConfetti();
  clearHintHighlights();
  hintMoves = null; hintStateMoves = -1;
  if (typeof number !== "number" || !isFinite(number)) number = randomGameNumber();
  number = Math.max(1, Math.min(MAX_GAME, Math.floor(number)));
  deal(number);
  selection = null;
  undoStack = [];
  counted = false;
  winRecorded = false;
  resetTimer();
  document.getElementById("win").hidden = true;
  render();
}

/* ---------- Inicio y eventos ---------- */
setSizes();
if (!loadGame()) newGame();   // continúa la partida guardada, o reparte una nueva

// Guardar al ocultar/cerrar para no perder el tiempo transcurrido
window.addEventListener("pagehide", saveGame);
document.addEventListener("visibilitychange", function () { if (document.hidden) saveGame(); });

document.getElementById("btn-new").onclick = function () { newGame(); };
document.getElementById("btn-undo").onclick = undo;
document.getElementById("btn-help").onclick = function () { document.getElementById("help").hidden = false; };
document.getElementById("help-close").onclick = function () { document.getElementById("help").hidden = true; };
document.getElementById("btn-menu").onclick = function () { document.getElementById("menu").hidden = false; };
document.getElementById("menu-close").onclick = function () { document.getElementById("menu").hidden = true; };
document.getElementById("btn-settings").onclick = function () {
  document.getElementById("game-input").value = gameNumber;
  document.getElementById("settings").hidden = false;
};
document.getElementById("settings-close").onclick = function () { document.getElementById("settings").hidden = true; };
document.getElementById("game-go").onclick = function () {
  var v = parseInt(document.getElementById("game-input").value, 10);
  if (!isFinite(v) || v < 1) { toast("Escribí un número de partida válido."); return; }
  document.getElementById("settings").hidden = true;
  newGame(v);
};
document.getElementById("win-new").onclick = function () { newGame(); };
document.getElementById("win-close").onclick = function () { document.getElementById("win").hidden = true; stopConfetti(); };
document.getElementById("btn-hint").onclick = onHint;
document.getElementById("btn-auto").onclick = startAutoComplete;

document.getElementById("board").addEventListener("click", function (e) {
  if (e.target.closest(".card, .slot-ph, .placeholder, .foundation-ph, .free-ph, button")) return;
  if (selection) { selection = null; render(); }
});
// debounce() vive en shared/ui.js (en móvil el resize dispara en ráfagas:
// barra del navegador, rotación).
window.addEventListener("resize", debounce(function () { setSizes(); render(); }, 120));
