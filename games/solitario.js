/* ---------- Datos básicos ---------- */
var SUIT = {
  spades:   { symbol: "♠", color: "black", name: "picas" },
  hearts:   { symbol: "♥", color: "red", name: "corazones" },
  diamonds: { symbol: "♦", color: "red", name: "diamantes" },
  clubs:    { symbol: "♣", color: "black", name: "tréboles" }
};
var SUIT_ORDER = ["spades", "hearts", "diamonds", "clubs"];
var RANK_LABEL = {1:"A",2:"2",3:"3",4:"4",5:"5",6:"6",7:"7",8:"8",9:"9",10:"10",11:"J",12:"Q",13:"K"};

/* ---------- Estado ---------- */
var state = null;
var selection = null;      // { pile, col, index }
var undoStack = [];
var seconds = 0, timerId = null, started = false;
var CW, CH, OFFSET_UP, OFFSET_DOWN;
var settings = { draw: 1 };
var animFoundation = -1;   // pila final que acaba de recibir una carta (para animarla)
var dealAnim = false;      // el próximo render es el de una partida nueva: reparto animado
var counted = false;       // ¿ya se contó esta partida en las estadísticas?
var winRecorded = false;   // ¿ya se registró la victoria? (deshacer y rehacer no debe duplicarla)

/* ---------- Estadísticas ---------- */
var STATS_KEY = "solitario.stats";
// loadStats/saveStats/bumpStat vienen de makeStats() en shared/storage.js.
var _stats = makeStats(STATS_KEY);
var loadStats = _stats.load, saveStats = _stats.save, bumpStat = _stats.bump;
function recordWin() {
  var s = loadStats();
  s.won = (s.won || 0) + 1;
  if (s.bestTime == null || seconds < s.bestTime) s.bestTime = seconds;
  if (s.bestMoves == null || state.moves < s.bestMoves) s.bestMoves = state.moves;
  saveStats(s);
}

/* ---------- Pistas y autocompletar ---------- */
var hintMoves = null, hintIndex = 0, hintStateMoves = -1, hintTimer = null;
var autoTimer = null, autoProgress = true;

/* ---------- Mazo ---------- */
function makeDeck() {
  var d = [], id = 0;
  for (var si = 0; si < SUIT_ORDER.length; si++) {
    var sk = SUIT_ORDER[si];
    for (var r = 1; r <= 13; r++) {
      d.push({ suit: sk, rank: r, color: SUIT[sk].color, faceUp: false, id: id++ });
    }
  }
  return d;
}
function shuffle(a) {
  for (var i = a.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}
function deal() {
  var deck = shuffle(makeDeck());
  state = { stock: [], waste: [], foundations: [[],[],[],[]], tableau: [[],[],[],[],[],[],[]], moves: 0 };
  var di = 0;
  for (var col = 0; col < 7; col++) {
    for (var r = 0; r <= col; r++) {
      var card = deck[di++];
      card.faceUp = (r === col);
      state.tableau[col].push(card);
    }
  }
  while (di < deck.length) { var c = deck[di++]; c.faceUp = false; state.stock.push(c); }
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
  stuckCheckMoves = -1;   // el estado cambió: invalida el chequeo de atasco
  render();
}

/* ---------- Reglas ---------- */
function foundationIndexFor(card) {
  for (var i = 0; i < 4; i++) {
    var f = state.foundations[i];
    if (f.length && f[f.length - 1].suit === card.suit) return i;
  }
  if (card.rank === 1) {
    for (var k = 0; k < 4; k++) if (state.foundations[k].length === 0) return k;
  }
  return -1;
}
function canMoveToFoundation(card) {
  var i = foundationIndexFor(card);
  if (i < 0) return -1;
  var f = state.foundations[i];
  if (f.length === 0) return card.rank === 1 ? i : -1;
  var t = f[f.length - 1];
  return card.rank === t.rank + 1 ? i : -1;
}
function canPlaceOnTableau(card, col) {
  var t = state.tableau[col];
  if (t.length === 0) return card.rank === 13;
  var top = t[t.length - 1];
  if (!top.faceUp) return false;
  return top.color !== card.color && top.rank === card.rank + 1;
}

/* ---------- Selección ---------- */
function getSelectionCards() {
  if (!selection) return null;
  if (selection.pile === "tableau") return state.tableau[selection.col].slice(selection.index);
  if (selection.pile === "waste") return [state.waste[state.waste.length - 1]];
  if (selection.pile === "foundation") {
    var f = state.foundations[selection.col]; return [f[f.length - 1]];
  }
  return null;
}
function flipTop(pile) {
  if (pile.length && !pile[pile.length - 1].faceUp) pile[pile.length - 1].faceUp = true;
}
function removeSelected() {
  if (selection.pile === "tableau") {
    var t = state.tableau[selection.col];
    var moved = t.splice(selection.index);
    flipTop(t);
    return moved;
  }
  if (selection.pile === "waste") return [state.waste.pop()];
  if (selection.pile === "foundation") return [state.foundations[selection.col].pop()];
  return [];
}
function selectCard(pile, col, index, card) {
  if (pile === "tableau") { if (!card.faceUp) return; selection = { pile: pile, col: col, index: index }; }
  else if (pile === "waste") selection = { pile: "waste", col: 0, index: index };
  else if (pile === "foundation") selection = { pile: "foundation", col: col, index: index };
}

/* ---------- Movimientos ---------- */
function moveSelectionToTableau(col) {
  var cards = getSelectionCards();
  if (selection.pile === "tableau" && selection.col === col) return false;
  if (!canPlaceOnTableau(cards[0], col)) return false;
  snapshot();
  var moved = removeSelected();
  for (var i = 0; i < moved.length; i++) state.tableau[col].push(moved[i]);
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
/* Doble clic / doble toque: mandar la carta (o el grupo) a donde corresponda.
   Igual que con los ases, primero intenta las pilas finales; si no, busca una
   columna del tablero donde encaje. */
function autoMoveSelection() {
  if (moveSelectionToFoundation()) return true;
  if (selection.pile === "foundation") return false; // no sacamos de las fundaciones
  var cards = getSelectionCards();
  if (!cards || !cards.length) return false;
  var lead = cards[0];
  var srcCol = selection.pile === "tableau" ? selection.col : -1;
  var emptyDest = -1;
  for (var dc = 0; dc < 7; dc++) {
    if (dc === srcCol) continue;
    if (!canPlaceOnTableau(lead, dc)) continue;
    if (state.tableau[dc].length > 0) return moveSelectionToTableau(dc); // sobre otra carta
    if (emptyDest < 0) emptyDest = dc;                                    // columna vacía (Rey)
  }
  // Una columna vacía sólo si el movimiento sirve: saca una carta del descarte
  // o destapa una carta boca abajo en la columna de origen.
  if (emptyDest >= 0) {
    var useful = selection.pile === "waste";
    if (!useful && selection.pile === "tableau" && selection.index > 0) {
      var below = state.tableau[selection.col][selection.index - 1];
      useful = !!below && !below.faceUp;
    }
    if (useful) return moveSelectionToTableau(emptyDest);
  }
  return false;
}
function dealStock() {
  if (autoTimer) return;
  if (state.stock.length === 0 && state.waste.length === 0) return;
  snapshot();
  if (state.stock.length === 0) {
    while (state.waste.length) { var c = state.waste.pop(); c.faceUp = false; state.stock.push(c); }
  } else {
    var n = settings.draw;
    for (var k = 0; k < n && state.stock.length; k++) {
      var cc = state.stock.pop(); cc.faceUp = true; state.waste.push(cc);
    }
  }
  state.moves++;
  selection = null;
  startTimer();
  render();
}

/* ---------- Toques (tap) ---------- */
function handleCardClick(pile, col, index, card) {
  if (autoTimer) return;
  if (pile === "tableau" && !card.faceUp) return;
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
    if (moved) { selection = null; afterMove(); return; }
    selectCard(pile, col, index, card);
    render();
    return;
  }
  // Sin selección previa, un solo toque manda la carta a su lugar (fundación
  // o una columna válida) si hay un destino legal — antes hacía falta un
  // segundo toque sobre la misma carta (o un doble clic) para esto mismo.
  // Si no hay destino, sólo la selecciona: se puede arrastrar o elegir el
  // destino a mano tocando otra pila.
  selectCard(pile, col, index, card);
  if (autoMoveSelection()) { selection = null; afterMove(); return; }
  render();
}
function handleEmptyColumn(col) {
  if (autoTimer) return;
  if (!selection) return;
  if (moveSelectionToTableau(col)) { selection = null; afterMove(); }
}
function handleFoundationClick() {
  if (autoTimer) return;
  if (!selection) return;
  if (moveSelectionToFoundation()) { selection = null; afterMove(); }
}
function afterMove() { startTimer(); render(); checkWin(); }

/* ---------- Arrastre (drag) ----------
   La máquina de puntero (pointerdown/move/up/cancel, capa flotante, umbral
   de 8px) vive en shared/drag.js, compartida con Carta Blanca. Acá sólo lo
   que es propio de Solitario: el nombre de la pila de un solo hueco
   ("waste"), el offset de apilado (OFFSET_UP) y a qué pilas se puede soltar
   (fundación o tablero — sin pozo libre, eso es cosa de Carta Blanca). */
var dragController = makeDragController({
  extraPile: "waste",
  offset: function () { return OFFSET_UP; },
  canDrag: function () { return true; },   // attachDrag() sólo se cablea en cartas boca arriba
  selectionIndex: function (src) { return src.index; },
  tryDrop: function (d) {
    if (d.indexOf("foundation") === 0) return moveSelectionToFoundation();
    if (d.indexOf("tableau") === 0) return moveSelectionToTableau(parseInt(d.split(":")[1], 10));
    return false;
  },
  onClick: function (s) { handleCardClick(s.pile, s.col, s.index, s.card); }
});

/* ---------- Reloj ----------
   Por timestamps, no por conteo de ticks: los navegadores estrangulan los
   setInterval de una pestaña en segundo plano (Chrome: ~1/min), así que
   sumar 1 por tick subcuenta el tiempo real transcurrido. `timerAnchor`
   guarda cuándo "empezaría" el cronómetro si hubiera corrido sin pausas
   (Date.now() menos lo ya acumulado); cada tick (por más tarde que llegue)
   RECALCULA `seconds` desde el reloj real en vez de incrementar. */
var timerAnchor = 0;
function startTimer() {
  if (started) return;
  started = true;
  if (!counted) { counted = true; bumpStat("played"); }
  timerAnchor = Date.now() - seconds * 1000;
  timerId = setInterval(function () { seconds = Math.floor((Date.now() - timerAnchor) / 1000); updateHUD(); }, 1000);
}
function stopTimer() {
  if (timerId) { seconds = Math.floor((Date.now() - timerAnchor) / 1000); clearInterval(timerId); }
  timerId = null;
}
function resetTimer() { stopTimer(); seconds = 0; started = false; updateHUD(); }

/* ---------- Victoria + festejo ---------- */
// celebrate() y stopConfetti() viven en shared/ui.js.
function checkWin() {
  var total = 0;
  for (var i = 0; i < 4; i++) total += state.foundations[i].length;
  if (total === 52) {
    stopTimer();
    started = false;   // si se sigue jugando (deshacer), el reloj puede reanudarse
    if (!winRecorded) { winRecorded = true; recordWin(); }
    var m = Math.floor(seconds / 60), s = seconds % 60;
    var t = (m < 10 ? "0" : "") + m + ":" + (s < 10 ? "0" : "") + s;
    document.getElementById("win-stats").textContent = "Tiempo " + t + " \u00b7 " + state.moves + " movimientos";
    document.getElementById("win").hidden = false;
    winCascade();
  }
}
// La cascada de cartas cl\u00e1sica (cascade() vive en shared/ui.js): cada pila
// final larga sus cartas desde su posici\u00f3n real en pantalla, de arriba abajo.
function winCascade() {
  var stacks = [];
  for (var i = 0; i < 4; i++) {
    var slot = document.querySelector('[data-drop="foundation:' + i + '"]');
    if (!slot) continue;
    var r = slot.getBoundingClientRect();
    stacks.push({
      x: r.left, y: r.top, w: r.width, h: r.height,
      cards: state.foundations[i].slice().reverse().map(function (c) { return { suit: c.suit, rank: c.rank }; })
    });
  }
  cascade(stacks);
}
/* ---------- Sin jugadas (derrota) ---------- */
function canPlaceCardAnywhere(card) {
  if (canMoveToFoundation(card) >= 0) return true;
  for (var c = 0; c < 7; c++) if (canPlaceOnTableau(card, c)) return true;
  return false;
}
/* Cartas que pueden llegar a quedar arriba del descarte dando vuelta el mazo y
   reciclando, SIN hacer otros movimientos. Simula el ciclo completo, por lo que
   funciona tanto en reparto de 1 como de 3 (en 3 no todas las cartas son
   alcanzables). Como nada se quita, el ciclo es finito: paramos al repetirse. */
function reachableStockWasteCards() {
  var stock = state.stock.slice();
  var waste = state.waste.slice();
  var draw = settings.draw;
  var tops = [];
  if (waste.length) tops.push(waste[waste.length - 1]);
  if (stock.length === 0 && waste.length === 0) return tops;
  var seen = {}, guard = 0;
  while (guard++ < 4000) {
    if (stock.length === 0 && waste.length === 0) break;
    var key = "";
    for (var a = 0; a < stock.length; a++) key += stock[a].id + ",";
    key += "|";
    for (var b = 0; b < waste.length; b++) key += waste[b].id + ",";
    if (seen[key]) break;
    seen[key] = 1;
    if (stock.length === 0) {
      while (waste.length) stock.push(waste.pop());
    } else {
      for (var k = 0; k < draw && stock.length; k++) waste.push(stock.pop());
      if (waste.length) tops.push(waste[waste.length - 1]);
    }
  }
  return tops;
}
function hasAnyMove() {
  // Movimientos directos desde las columnas. Se consideran todos los sufijos de la
  // escalera boca arriba: mover la escalera completa siempre, y una escalera parcial
  // s\u00f3lo cuando sirve (la carta que queda expuesta puede subir a una fundaci\u00f3n).
  for (var col = 0; col < 7; col++) {
    var t = state.tableau[col];
    if (!t.length) continue;
    if (canMoveToFoundation(t[t.length - 1]) >= 0) return true;
    var fu = firstFaceUpIndex(t);
    if (fu >= 0) {
      for (var i2 = fu; i2 < t.length; i2++) {
        var lead = t[i2];
        if (i2 > fu && canMoveToFoundation(t[i2 - 1]) < 0) continue;
        for (var dc = 0; dc < 7; dc++) {
          if (dc === col) continue;
          if (!canPlaceOnTableau(lead, dc)) continue;
          // mover un Rey solo a otra columna vac\u00eda no aporta nada
          if (lead.rank === 13 && i2 === 0 && state.tableau[dc].length === 0) continue;
          return true;
        }
      }
    }
  }
  // Cartas alcanzables del mazo/descarte dando vuelta y reciclando
  var reach = reachableStockWasteCards();
  for (var i = 0; i < reach.length; i++) if (canPlaceCardAnywhere(reach[i])) return true;
  return false;
}
/* hasAnyMove simula el ciclo completo del mazo, as\u00ed que se memoiza por cantidad de
   movimientos (igual que las pistas). Se invalida donde el estado cambia sin mover. */
var stuckCheckMoves = -1, stuckCheckHas = true;
function hasAnyMoveCached() {
  if (state.moves !== stuckCheckMoves) { stuckCheckMoves = state.moves; stuckCheckHas = hasAnyMove(); }
  return stuckCheckHas;
}
function updateStuckState() {
  // Sin jugadas posibles: s\u00f3lo resaltamos el bot\u00f3n "Nueva" (sin aviso breve).
  var stuck = !isWon() && !autoTimer && !hasAnyMoveCached();
  document.getElementById("btn-new").classList.toggle("attention", stuck);
}

/* ---------- Render ---------- */
// el() vive en shared/ui.js.
// cardFace, rankName, cardLabel y makeCardEl viven en shared/cards.js.
// makeDragController vive en shared/drag.js.
function attachDrag(elem, src) {
  elem.style.touchAction = "none";
  elem.addEventListener("pointerdown", function (e) { dragController.onPointerDown(e, src, elem); });
  keyActivate(elem, function () { handleCardClick(src.pile, src.col, src.index, src.card); });
}

function render() {
  setSizes();   // el tamaño de carta depende del estado (columna más alta)
  var landFi = animFoundation; animFoundation = -1;   // animar el aterrizaje una sola vez
  var swWrap = document.getElementById("stockwaste"); swWrap.innerHTML = "";
  var foundWrap = document.getElementById("foundations"); foundWrap.innerHTML = "";
  var tableau = document.getElementById("tableau"); tableau.innerHTML = "";

  /* Mazo */
  var stockSlot = el("div", "slot");
  if (state.stock.length) {
    var sc = el("div", "card down stock-card");
    clickActivate(sc, dealStock);
    stockSlot.appendChild(sc);
    stockSlot.appendChild(el("div", "badge", String(state.stock.length)));
  } else {
    var rec = el("div", "recycle stock-card", "\u21bb");
    clickActivate(rec, dealStock);
    stockSlot.appendChild(rec);
  }
  swWrap.appendChild(stockSlot);

  /* Descarte (con abanico en modo difícil). En el layout lateral (apaisado
     corto) el abanico se abre hacia ABAJO en vez de a la derecha: la columna
     lateral mide una carta de ancho y hacia abajo hay lugar libre. */
  var wasteSlot = el("div", "slot");
  if (state.waste.length) {
    var show = settings.draw === 3 ? Math.min(3, state.waste.length) : 1;
    var startIdx = state.waste.length - show;
    var fan = Math.round(CW * 0.30);
    for (var w = 0; w < show; w++) {
      var idx = startIdx + w;
      var card = state.waste[idx];
      var isTop = idx === state.waste.length - 1;
      var ce = makeCardEl(card, isTop && selection && selection.pile === "waste");
      ce.style.position = "absolute"; ce.style.zIndex = w;
      if (sideLayout) { ce.style.left = "0"; ce.style.top = (w * fan) + "px"; }
      else { ce.style.left = (w * fan) + "px"; ce.style.top = "0"; }
      if (isTop) {
        ce.dataset.pile = "waste"; ce.dataset.col = "0"; ce.dataset.index = String(state.waste.length - 1);
        attachDrag(ce, { pile: "waste", col: 0, index: state.waste.length - 1, card: card });
      } else {
        ce.style.pointerEvents = "none";
      }
      wasteSlot.appendChild(ce);
    }
  } else {
    wasteSlot.appendChild(el("div", "slot-ph"));
  }
  swWrap.appendChild(wasteSlot);

  /* Pilas finales */
  for (var fi = 0; fi < 4; fi++) {
    var fslot = el("div", "slot");
    fslot.setAttribute("data-drop", "foundation:" + fi);
    var f = state.foundations[fi];
    if (f.length) {
      var fcard = f[f.length - 1];
      var fsel = selection && selection.pile === "foundation" && selection.col === fi;
      var fe = makeCardEl(fcard, fsel);
      fe.dataset.pile = "foundation"; fe.dataset.col = String(fi); fe.dataset.index = String(f.length - 1);
      if (fi === landFi) fe.classList.add("land");
      attachDrag(fe, { pile: "foundation", col: fi, index: f.length - 1, card: fcard });
      fslot.appendChild(fe);
    } else {
      var fph = el("div", "foundation-ph", "A");
      clickActivate(fph, handleFoundationClick);
      fslot.appendChild(fph);
    }
    foundWrap.appendChild(fslot);
  }

  /* Columnas */
  for (var col = 0; col < 7; col++) {
    var colEl = el("div", "col");
    colEl.setAttribute("data-drop", "tableau:" + col);
    var pile = state.tableau[col];
    if (pile.length === 0) {
      var ph = el("div", "placeholder");
      (function (cc) { clickActivate(ph, function () { handleEmptyColumn(cc); }); })(col);
      colEl.appendChild(ph);
    } else {
      var y = 0, lastOff = OFFSET_UP;
      for (var i = 0; i < pile.length; i++) {
        var tcard = pile[i];
        var tsel = selection && selection.pile === "tableau" && selection.col === col && i >= selection.index;
        var te = makeCardEl(tcard, tsel);
        te.style.top = y + "px"; te.style.zIndex = i;
        if (dealAnim) { te.classList.add("deal"); te.style.animationDelay = ((col * 4 + i) * 20) + "ms"; }
        if (tcard.faceUp) {
          te.dataset.pile = "tableau"; te.dataset.col = String(col); te.dataset.index = String(i);
          attachDrag(te, { pile: "tableau", col: col, index: i, card: tcard });
        }
        colEl.appendChild(te);
        lastOff = tcard.faceUp ? OFFSET_UP : OFFSET_DOWN;
        y += lastOff;
      }
      colEl.style.minHeight = (y - lastOff + CH) + "px";
    }
    tableau.appendChild(colEl);
  }

  updateHUD();
  document.getElementById("btn-undo").disabled = undoStack.length === 0;
  updateAutoButton();
  updateStuckState();
  saveGame();
  dealAnim = false;   // el reparto se anima una sola vez
}

function updateHUD() {
  document.getElementById("moves").textContent = state.moves;
  var m = Math.floor(seconds / 60), s = seconds % 60;
  document.getElementById("time").textContent = (m < 10 ? "0" : "") + m + ":" + (s < 10 ? "0" : "") + s;
}

/* ---------- Tamaños ----------
   El tamaño de carta se calcula según el layout activo (centinela
   --board-layout que fija el CSS de #board) y según el ESTADO REAL de la
   partida: se parte del máximo que permite el ancho (con techo) y se achica
   hasta que la columna más alta del tablero entre completa SIN SCROLL.
   Debajo de un piso de legibilidad (~52px de carta) se deja de achicar y se
   permite el scroll (mejor scrollear que cartas ilegibles). Como depende del
   estado, render() lo recalcula en cada jugada: si una columna crece, las
   cartas se achican solas; al deshacerse la pila, vuelven a crecer. */
var sideLayout = false;
var FIT_MIN_CW = 52;   // piso de legibilidad del ajuste por alto

// Alto en px de la columna más alta del tablero si la carta midiera `cw`
// (usa las mismas fórmulas de solape, con sus pisos). Sin estado todavía,
// asume el reparto inicial (la 7.ª columna: 6 tapadas + 1 destapada).
function tallestColumnPx(cw) {
  var ch = Math.round(cw * 1.42);
  var od = Math.max(10, Math.round(ch * 0.16));
  var ou = Math.max(24, Math.round(ch * 0.34));
  if (!state) return ch + 6 * od;
  var max = ch;
  for (var c = 0; c < 7; c++) {
    var t = state.tableau[c];
    if (!t.length) continue;
    var h = ch;
    for (var i = 0; i < t.length - 1; i++) h += t[i].faceUp ? ou : od;
    if (h > max) max = h;
  }
  return max;
}

function setSizes() {
  var root = document.documentElement;
  var board = document.getElementById("board");
  var cs = getComputedStyle(board);
  var padL = parseFloat(cs.paddingLeft) || 0, padR = parseFloat(cs.paddingRight) || 0;
  var padT = parseFloat(cs.paddingTop) || 0, padB = parseFloat(cs.paddingBottom) || 0;
  var contentW = board.clientWidth - padL - padR;
  var availH = (board.clientHeight || window.innerHeight) - padT - padB;
  // Separación proporcional: densa en celular, más aireada en tablet/escritorio.
  var gap = contentW < 460 ? 4 : (contentW < 760 ? 6 : 8);
  sideLayout = cs.getPropertyValue("--board-layout").trim() === "side";

  // Límite por ancho (7 columnas, más las 2 laterales en apaisado corto)…
  var cw = Math.floor(sideLayout ? (contentW - 8 * gap) / 9 : (contentW - 6 * gap) / 7);
  // …con techo más alto en pantallas anchas (si no, en desktop el tablero
  // queda chico y descentrado) y piso duro para ultra-angostas.
  var cwCap = window.innerWidth >= 1100 ? 150 : 110;
  cw = Math.max(36, Math.min(cw, cwCap));
  // En apaisado corto, la columna lateral apila las 4 pilas finales.
  if (sideLayout) cw = Math.min(cw, Math.floor((availH - 3 * gap) / (4 * 1.42)));

  // Ajuste por alto: achicar hasta que la columna más alta entre sin scroll
  // (28 = padding inferior del tablero; en layout vertical se suma la fila
  // superior y su separación). Piso: FIT_MIN_CW.
  function needed(w) {
    var h = tallestColumnPx(w) + 28;
    if (!sideLayout) h += Math.round(w * 1.42) + 10;
    return h;
  }
  var fitFloor = Math.min(FIT_MIN_CW, cw);
  while (cw > fitFloor && needed(cw) > availH) cw--;

  CW = cw;
  CH = Math.round(CW * 1.42);
  OFFSET_DOWN = Math.max(10, Math.round(CH * 0.16));
  OFFSET_UP = Math.max(24, Math.round(CH * 0.34));
  root.style.setProperty("--cw", CW + "px");
  root.style.setProperty("--ch", CH + "px");
  root.style.setProperty("--gap", gap + "px");
}

/* ---------- Opciones ---------- */
function applySettings() {
  savePrefs();
  stuckCheckMoves = -1;   // el reparto (1 ó 3) cambia qué cartas del mazo son alcanzables
  setSizes();
  render();
  updateSettingsUI();
}
function updateSettingsUI() {
  var a = document.querySelectorAll("[data-draw]");
  for (var i = 0; i < a.length; i++) a[i].classList.toggle("active", parseInt(a[i].dataset.draw, 10) === settings.draw);
}

/* ---------- Pistas ---------- */
function noFaceDownInTableau() {
  for (var col = 0; col < 7; col++) {
    var t = state.tableau[col];
    for (var i = 0; i < t.length; i++) if (!t[i].faceUp) return false;
  }
  return true;
}
function isWon() {
  var total = 0;
  for (var i = 0; i < 4; i++) total += state.foundations[i].length;
  return total === 52;
}
function firstFaceUpIndex(t) {
  for (var i = 0; i < t.length; i++) if (t[i].faceUp) return i;
  return -1;
}
function generateHints() {
  var moves = [];
  // 1) A las pilas finales
  if (state.waste.length) {
    var wc = state.waste[state.waste.length - 1];
    if (canMoveToFoundation(wc) >= 0)
      moves.push({ kind: "foundation", from: { pile: "waste", col: 0, index: state.waste.length - 1 }, fi: canMoveToFoundation(wc), prio: 1 });
  }
  for (var col = 0; col < 7; col++) {
    var t = state.tableau[col];
    if (t.length) {
      var c = t[t.length - 1];
      if (c.faceUp && canMoveToFoundation(c) >= 0)
        moves.push({ kind: "foundation", from: { pile: "tableau", col: col, index: t.length - 1 }, fi: canMoveToFoundation(c), prio: 1 });
    }
  }
  // 2) Mover columnas (prioriza destapar una carta tapada). Además de la escalera
  // completa, sugiere escaleras parciales cuando la carta que queda expuesta puede
  // subir a una fundación.
  for (var col2 = 0; col2 < 7; col2++) {
    var tt = state.tableau[col2];
    var fu = firstFaceUpIndex(tt);
    if (fu < 0) continue;
    for (var i2 = fu; i2 < tt.length; i2++) {
      var lead = tt[i2];
      var exposes = i2 > fu && canMoveToFoundation(tt[i2 - 1]) >= 0;
      if (i2 > fu && !exposes) continue;   // escaleras parciales sólo si sirven
      for (var dc = 0; dc < 7; dc++) {
        if (dc === col2) continue;
        if (!canPlaceOnTableau(lead, dc)) continue;
        var reveals = i2 === fu && fu > 0;
        var pointlessKing = lead.rank === 13 && i2 === 0 && state.tableau[dc].length === 0;
        if (pointlessKing) continue;
        moves.push({ kind: "tableau", from: { pile: "tableau", col: col2, index: i2 }, toCol: dc, prio: reveals ? 2 : (exposes ? 3 : 5) });
      }
    }
  }
  // 3) Del descarte a una columna
  if (state.waste.length) {
    var wc2 = state.waste[state.waste.length - 1];
    for (var dc2 = 0; dc2 < 7; dc2++)
      if (canPlaceOnTableau(wc2, dc2))
        moves.push({ kind: "tableau", from: { pile: "waste", col: 0, index: state.waste.length - 1 }, toCol: dc2, prio: 3 });
  }
  moves.sort(function (a, b) { return a.prio - b.prio; });
  // 4) Dar vuelta cartas del mazo (última opción del ciclo)
  if (state.stock.length > 0 || state.waste.length > 0) moves.push({ kind: "stock", prio: 9 });
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
  if (move.kind === "stock") {
    var sc = document.querySelector(".stock-card");
    if (sc) sc.classList.add("hint");
  } else {
    var sel = '.card[data-pile="' + move.from.pile + '"][data-col="' + move.from.col + '"][data-index="' + move.from.index + '"]';
    var srcEl = document.querySelector(sel);
    if (srcEl) srcEl.classList.add("hint");
    if (move.from.pile === "tableau") {
      var run = document.querySelectorAll('.card[data-pile="tableau"][data-col="' + move.from.col + '"]');
      for (var i = 0; i < run.length; i++)
        if (parseInt(run[i].dataset.index, 10) >= move.from.index) run[i].classList.add("hint");
    }
    var dropSel = move.kind === "foundation"
      ? '[data-drop="foundation:' + move.fi + '"]'
      : '[data-drop="tableau:' + move.toCol + '"]';
    var dst = document.querySelector(dropSel);
    if (dst) dst.classList.add("hint-target");
  }
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

/* ---------- Autocompletar ---------- */
function updateAutoButton() {
  var btn = document.getElementById("btn-auto");
  if (!btn) return;
  btn.hidden = !(noFaceDownInTableau() && !isWon() && !autoTimer);
}
function findFoundationMove() {
  if (state.waste.length) {
    var wc = state.waste[state.waste.length - 1];
    if (canMoveToFoundation(wc) >= 0) return { from: "waste" };
  }
  for (var col = 0; col < 7; col++) {
    var t = state.tableau[col];
    if (t.length) {
      var c = t[t.length - 1];
      if (c.faceUp && canMoveToFoundation(c) >= 0) return { from: "tableau", col: col };
    }
  }
  return null;
}
function autoFoundationMove(mv) {
  var card, fi;
  if (mv.from === "waste") {
    card = state.waste[state.waste.length - 1];
    fi = canMoveToFoundation(card);
    if (fi < 0) return false;
    state.waste.pop();
    state.foundations[fi].push(card);
  } else {
    var t = state.tableau[mv.col];
    card = t[t.length - 1];
    fi = canMoveToFoundation(card);
    if (fi < 0) return false;
    t.pop();
    flipTop(t);
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
  autoProgress = true;
  updateAutoButton();
  autoTimer = setInterval(autoTick, 130);
}
function stopAutoComplete() {
  if (autoTimer) clearInterval(autoTimer);
  autoTimer = null;
  stuckCheckMoves = -1;   // el autocompletado mueve mazo/descarte sin sumar movimientos
}
function autoTick() {
  selection = null;
  var mv = findFoundationMove();
  if (mv) {
    autoFoundationMove(mv);
    autoProgress = true;        // hubo progreso en esta vuelta al mazo
    render();
    if (isWon()) { stopAutoComplete(); checkWin(); }
    return;
  }
  if (state.stock.length === 0 && state.waste.length === 0) {
    stopAutoComplete(); render(); if (isWon()) checkWin();
    return;
  }
  if (state.stock.length === 0) {
    // Acá se cierra una vuelta entera al mazo. Si en toda la vuelta anterior no se pudo
    // subir ninguna carta a las fundaciones, ya no hay nada que hacer: cortar de inmediato
    // (en vez de seguir ciclando cartas sin sentido durante decenas de "ticks").
    if (!autoProgress) { stopAutoComplete(); render(); return; }
    autoProgress = false;
    while (state.waste.length) { var c = state.waste.pop(); c.faceUp = false; state.stock.push(c); }
  } else {
    for (var k = 0; k < settings.draw && state.stock.length; k++) {
      var cc = state.stock.pop(); cc.faceUp = true; state.waste.push(cc);
    }
  }
  render();
}

/* ---------- Aviso breve ---------- */
// toast() vive en shared/ui.js.

/* ---------- Persistencia (preferencias y partida) ---------- */
var PREFS_KEY = "solitario.prefs";
// El candado multi-pestaña y gameSet/gameDel/GAME_KEY viven en shared/storage.js.
function savePrefs() {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify({ draw: settings.draw })); } catch (e) {}
}
function loadPrefs() {
  try {
    var p = JSON.parse(localStorage.getItem(PREFS_KEY));
    if (p && (p.draw === 1 || p.draw === 3)) settings.draw = p.draw;
  } catch (e) {}
}
function validCard(c) { return !!(c && SUIT[c.suit] && c.rank >= 1 && c.rank <= 13); }
function validState(s) {
  if (!s || !s.foundations || !s.tableau || !s.stock || !s.waste) return false;
  if (s.foundations.length !== 4 || s.tableau.length !== 7) return false;
  // Debe haber exactamente un mazo completo: 52 cartas válidas, sin repetidas.
  var piles = [s.stock, s.waste], seen = {}, n = 0, i, j;
  for (i = 0; i < 4; i++) piles.push(s.foundations[i]);
  for (i = 0; i < 7; i++) piles.push(s.tableau[i]);
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
  return n === 52;
}
function saveGame() {
  try {
    if (isWon()) { gameDel(); return; }
    gameSet(JSON.stringify({ v: 1, state: state, seconds: seconds, counted: counted }));
  } catch (e) {}
}
function loadGame() {
  try {
    var data = JSON.parse(localStorage.getItem(GAME_KEY));
    // Formato versionado: un guardado de una versión futura desconocida se
    // descarta (mejor una partida nueva que restaurar mal). Sin `v` = legado
    // pre-versionado, misma forma que v1.
    if (data && data.v != null && data.v !== 1) return false;
    if (!data || !validState(data.state)) return false;
    state = data.state;
    if (typeof state.moves !== "number" || state.moves < 0) state.moves = 0;
    seconds = (typeof data.seconds === "number" && data.seconds >= 0) ? data.seconds : 0;
    counted = !!data.counted;
    winRecorded = false;
    started = false; selection = null; undoStack = [];
    stuckCheckMoves = -1;
    stopTimer();
    render();
    return true;
  } catch (e) { return false; }
}

/* ---------- Nueva partida ---------- */
function newGame() {
  stopAutoComplete();
  stopConfetti();
  clearHintHighlights();
  hintMoves = null; hintStateMoves = -1;
  deal();
  selection = null;
  undoStack = [];
  counted = false;
  winRecorded = false;
  stuckCheckMoves = -1;
  resetTimer();
  document.getElementById("win").hidden = true;
  dealAnim = true;   // el primer render de la partida nueva anima el reparto
  render();
}

/* ---------- Inicio y eventos ---------- */
loadPrefs();
setSizes();
if (!loadGame()) newGame();   // continúa la partida guardada, o reparte una nueva
updateSettingsUI();

// Guardar al ocultar/cerrar para no perder el tiempo transcurrido
window.addEventListener("pagehide", saveGame);
document.addEventListener("visibilitychange", function () { if (document.hidden) saveGame(); });

document.getElementById("btn-new").onclick = newGame;
document.getElementById("btn-undo").onclick = undo;
document.getElementById("btn-help").onclick = function () { document.getElementById("help").hidden = false; };
document.getElementById("help-close").onclick = function () { document.getElementById("help").hidden = true; };
document.getElementById("btn-menu").onclick = function () { document.getElementById("menu").hidden = false; };
document.getElementById("menu-close").onclick = function () { document.getElementById("menu").hidden = true; };
document.getElementById("btn-settings").onclick = function () { updateSettingsUI(); document.getElementById("settings").hidden = false; };
document.getElementById("settings-close").onclick = function () { document.getElementById("settings").hidden = true; };
document.getElementById("win-new").onclick = newGame;
document.getElementById("win-close").onclick = function () { document.getElementById("win").hidden = true; stopConfetti(); };
document.getElementById("btn-hint").onclick = onHint;
document.getElementById("btn-auto").onclick = startAutoComplete;

(function () {
  var draws = document.querySelectorAll("[data-draw]");
  for (var i = 0; i < draws.length; i++) (function (btn) {
    btn.onclick = function () { settings.draw = parseInt(btn.dataset.draw, 10); applySettings(); };
  })(draws[i]);
})();

document.getElementById("board").addEventListener("click", function (e) {
  if (e.target.closest(".card, .slot-ph, .placeholder, .foundation-ph, .recycle, .badge, button")) return;
  if (selection) { selection = null; render(); }
});
// debounce() vive en shared/ui.js (en móvil el resize dispara en ráfagas:
// barra del navegador, rotación). Además del resize de la ventana se observa
// el TABLERO en sí (ResizeObserver): al rotar el teléfono o al entrar/salir
// el riel lateral, el tamaño real del tablero puede cambiar después del
// último evento resize, y recalcular con dimensiones viejas dejaba columnas
// mal dimensionadas (solapadas) hasta el próximo resize.
var relayout = debounce(function () { setSizes(); render(); }, 120);
window.addEventListener("resize", relayout);
if (typeof ResizeObserver === "function")
  new ResizeObserver(relayout).observe(document.getElementById("board"));
