/* ---------- Datos básicos ---------- */
var SUIT = {
  clubs:    { symbol: "♣", color: "black", name: "tréboles" },
  diamonds: { symbol: "♦", color: "red", name: "diamantes" },
  spades:   { symbol: "♠", color: "black", name: "picas" },
  hearts:   { symbol: "♥", color: "red", name: "corazones" }
};
var SUIT_ORDER = ["clubs", "diamonds", "spades", "hearts"];
var SUIT_SORT = { clubs: 0, diamonds: 1, spades: 2, hearts: 3 };
var RANK_LABEL = {2:"2",3:"3",4:"4",5:"5",6:"6",7:"7",8:"8",9:"9",10:"10",11:"J",12:"Q",13:"K",14:"A"};
/* Asientos: 0=Vos (abajo), 1=Este (der.), 2=Norte (arriba), 3=Oeste (izq.).
   El juego avanza "a la izquierda" = sentido horario en pantalla = (i+3)%4.
   El nombre visible de cada asiento sale de DEFAULT_NAMES/names, no de acá. */
var SEAT = [
  { cls: "south" },
  { cls: "east" },
  { cls: "north" },
  { cls: "west" }
];
var HUMAN = 0;
/* Nombres (0=vos; 1=Este, 2=Norte, 3=Oeste). Los rivales son editables. */
var DEFAULT_NAMES = ["Vos", "Carla", "Beto", "Ana"];
var names = DEFAULT_NAMES.slice();
function playerName(i) { return (names[i] && names[i].length) ? names[i] : DEFAULT_NAMES[i]; }
var DIRS = ["left", "right", "across", "hold"];
var DIR_TXT = { left: "a la izquierda ←", right: "a la derecha →", across: "de frente ↑", hold: "ninguna" };
var AI_DELAY = 650, TRICK_HOLD = 1000;

/* ---------- Estado ---------- */
var players = null;        // [{ hand:[], score, roundPoints }]
var phase = "play";        // "pass" | "play" | "scoring"
var trick = [];            // [{ seat, card }]
var leadSeat = 0, turn = 0;
var heartsBroken = false, tricksPlayed = 0, handNumber = 0;
var passDir = "left";
var humanPass = [];        // ids elegidos para pasar
var busy = false;
var target = 100;
var aiLevel = "normal";    // "facil" | "normal" | "dificil"
var moonMode = "demas";    // "demas" (los demás +26) | "tirador" (el tirador −26)
var hintTimer = null;
var flowTimer = null;      // setTimeout del avance de IA / cierre de baza (cancelable)
var lastTrickCardId = null; // para animar sólo la carta recién jugada
var dealAnim = false;       // el próximo render es el de una mano nueva: reparto animado
var handHistory = [];      // puntos por mano: [ [p0,p1,p2,p3], ... ]  (no usar "history": choca con window.history)
var pendingOver = false;   // la mano que se está mostrando terminó la partida
// ¿La mano que se está mostrando la ganó el humano disparando la luna? El bump
// de la estadística "moons" queda atado al CIERRE del modal (una acción del
// usuario que ocurre una sola vez), no a endHand(): saveGame() no persiste en
// phase "scoring", así que un reload durante el modal hace que loadGame()
// repita resolveTrick()/endHand() para la MISMA mano, y bumpStat ahí adentro
// la contaría de nuevo (ver docs/PLAN-2.md, Fase 1).
var pendingMoonBump = false;
var CW, CH, OW;

/* ---------- Mazo ---------- */
function makeDeck() {
  var d = [];
  for (var si = 0; si < SUIT_ORDER.length; si++) {
    var sk = SUIT_ORDER[si];
    for (var r = 2; r <= 14; r++) d.push({ suit: sk, rank: r, color: SUIT[sk].color, id: sk + "-" + r });
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
function sortHand(h) {
  h.sort(function (a, b) { return (SUIT_SORT[a.suit] - SUIT_SORT[b.suit]) || (a.rank - b.rank); });
  return h;
}
function pointsOf(card) {
  if (card.suit === "hearts") return 1;
  if (card.suit === "spades" && card.rank === 12) return 13;
  return 0;
}
function is2C(card) { return card.suit === "clubs" && card.rank === 2; }
function holderOf2C() {
  for (var s = 0; s < 4; s++)
    for (var i = 0; i < players[s].hand.length; i++)
      if (is2C(players[s].hand[i])) return s;
  return 0;
}

/* ---------- Reglas: jugadas legales ---------- */
function legalCards(seat) {
  var hand = players[seat].hand;
  var leading = trick.length === 0;
  var i, c, out = [];
  if (leading) {
    if (tricksPlayed === 0) {
      for (i = 0; i < hand.length; i++) if (is2C(hand[i])) return [hand[i]];
    }
    if (!heartsBroken) {
      for (i = 0; i < hand.length; i++) if (hand[i].suit !== "hearts") out.push(hand[i]);
      if (out.length) return out;
    }
    return hand.slice();
  }
  var led = trick[0].card.suit;
  for (i = 0; i < hand.length; i++) if (hand[i].suit === led) out.push(hand[i]);
  if (out.length) return out;
  // Sin el palo: descarte libre, salvo en la primera baza (sin corazones ni Q♠)
  if (tricksPlayed === 0) {
    var safe = [];
    for (i = 0; i < hand.length; i++) {
      c = hand[i];
      if (c.suit !== "hearts" && !(c.suit === "spades" && c.rank === 12)) safe.push(c);
    }
    if (safe.length) return safe;
  }
  return hand.slice();
}
function trickWinner() {
  var led = trick[0].card.suit, best = trick[0];
  for (var i = 1; i < trick.length; i++)
    if (trick[i].card.suit === led && trick[i].card.rank > best.card.rank) best = trick[i];
  return best.seat;
}
function trickPoints() {
  var p = 0;
  for (var i = 0; i < trick.length; i++) p += pointsOf(trick[i].card);
  return p;
}

/* ---------- IA ---------- */
function cardDanger(card) {
  if (card.suit === "spades" && card.rank === 12) return 1000;          // Q♠
  if (card.suit === "spades" && card.rank > 12) return 600 + card.rank; // A♠, K♠
  if (card.suit === "hearts") return 200 + card.rank;
  return card.rank;
}
function aiPass(seat) {
  var hand = players[seat].hand.slice();
  if (aiLevel === "facil") { shuffle(hand); return hand.slice(0, 3); }   // pase al azar
  if (aiLevel === "dificil") {
    // Peligro + bonus por vaciar palos cortos (para poder fallar después)
    var counts = { clubs: 0, diamonds: 0, spades: 0, hearts: 0 };
    for (var i = 0; i < hand.length; i++) counts[hand[i].suit]++;
    hand.sort(function (a, b) {
      var sa = cardDanger(a) + (a.suit !== "hearts" ? (5 - counts[a.suit]) * 8 : 0);
      var sb = cardDanger(b) + (b.suit !== "hearts" ? (5 - counts[b.suit]) * 8 : 0);
      return sb - sa;
    });
    return hand.slice(0, 3);
  }
  hand.sort(function (a, b) { return cardDanger(b) - cardDanger(a); });
  return hand.slice(0, 3);
}
function lowestCard(cards) {
  var best = cards[0];
  for (var i = 1; i < cards.length; i++)
    if (cards[i].rank < best.rank || (cards[i].rank === best.rank && SUIT_SORT[cards[i].suit] < SUIT_SORT[best.suit])) best = cards[i];
  return best;
}
function highestCard(cards) {
  var best = cards[0];
  for (var i = 1; i < cards.length; i++) if (cards[i].rank > best.rank) best = cards[i];
  return best;
}
function mostDangerous(cards) {
  var best = cards[0];
  for (var i = 1; i < cards.length; i++) if (cardDanger(cards[i]) > cardDanger(best)) best = cards[i];
  return best;
}
function leadHard(legal) {
  // Lidera con la más baja de su palo más largo (para ir gastando y mantener control)
  var bySuit = {};
  for (var i = 0; i < legal.length; i++) (bySuit[legal[i].suit] = bySuit[legal[i].suit] || []).push(legal[i]);
  var best = null, bestLen = -1;
  for (var s in bySuit) if (bySuit[s].length > bestLen) { bestLen = bySuit[s].length; best = bySuit[s]; }
  return lowestCard(best);
}
function aiPlay(seat) {
  var legal = legalCards(seat);
  if (legal.length === 1) return legal[0];
  if (aiLevel === "facil") return legal[Math.floor(Math.random() * legal.length)]; // juega al azar
  if (trick.length === 0) {
    // Liderar: la más baja (en difícil, desde el palo más largo)
    return aiLevel === "dificil" ? leadHard(legal) : lowestCard(legal);
  }
  var led = trick[0].card.suit;
  var inSuit = [], i;
  for (i = 0; i < legal.length; i++) if (legal[i].suit === led) inSuit.push(legal[i]);
  if (inSuit.length) {
    var high = trick[0].card.rank;
    for (i = 1; i < trick.length; i++) if (trick[i].card.suit === led && trick[i].card.rank > high) high = trick[i].card.rank;
    var under = [];
    for (i = 0; i < inSuit.length; i++) if (inSuit[i].rank < high) under.push(inSuit[i]);
    if (under.length) return highestCard(under);            // descarga seguro por debajo
    var isLast = trick.length === 3;
    return isLast ? highestCard(inSuit) : lowestCard(inSuit); // forzado a ganar: si soy último suelto la alta
  }
  // Descarte: largá lo más peligroso (Q♠, espadas altas, corazones altos)
  return mostDangerous(legal);
}

/* ---------- Reparto / pase ---------- */
function dealHand() {
  var deck = shuffle(makeDeck());
  for (var s = 0; s < 4; s++) { players[s].hand = []; players[s].roundPoints = 0; players[s].taken = []; }
  for (var i = 0; i < deck.length; i++) players[i % 4].hand.push(deck[i]);
  for (s = 0; s < 4; s++) sortHand(players[s].hand);
  heartsBroken = false; tricksPlayed = 0; trick = [];
}
function passTarget(seat) {
  if (passDir === "left") return (seat + 3) % 4;
  if (passDir === "right") return (seat + 1) % 4;
  return (seat + 2) % 4; // across
}
function removeCards(seat, cards) {
  for (var i = 0; i < cards.length; i++) {
    var hand = players[seat].hand;
    for (var j = 0; j < hand.length; j++) if (hand[j].id === cards[i].id) { hand.splice(j, 1); break; }
  }
}
function confirmPass() {
  if (phase !== "pass" || humanPass.length !== 3) return;
  var sel = [[], [], [], []];
  for (var k = 0; k < humanPass.length; k++) {
    var hand = players[HUMAN].hand;
    for (var j = 0; j < hand.length; j++) if (hand[j].id === humanPass[k]) { sel[HUMAN].push(hand[j]); break; }
  }
  for (var s = 1; s < 4; s++) sel[s] = aiPass(s);
  for (s = 0; s < 4; s++) removeCards(s, sel[s]);
  for (s = 0; s < 4; s++) {
    var tgt = passTarget(s);
    for (var i = 0; i < sel[s].length; i++) players[tgt].hand.push(sel[s][i]);
  }
  for (s = 0; s < 4; s++) sortHand(players[s].hand);
  humanPass = [];
  beginPlay();
}

/* ---------- Juego ---------- */
function clearFlow() { if (flowTimer) { clearTimeout(flowTimer); flowTimer = null; } }
function beginPlay() {
  phase = "play";
  tricksPlayed = 0; trick = []; heartsBroken = false;
  leadSeat = holderOf2C(); turn = leadSeat;
  busy = false;
  setStatus(turn === HUMAN ? "Salís vos: jugá el 2 de tréboles." : playerName(turn) + " sale.");
  advance();
}
function advance() {
  if (phase !== "play") return;
  if (trick.length === 4) return;
  if (turn === HUMAN) { busy = false; if (trick.length > 0) setStatus("Te toca jugar."); render(); return; }
  busy = true; render();
  flowTimer = setTimeout(function () {
    flowTimer = null;
    if (phase !== "play" || turn === HUMAN || trick.length >= 4) return;
    doPlay(turn, aiPlay(turn));
  }, AI_DELAY);
}
function doPlay(seat, card) {
  removeCards(seat, [card]);
  trick.push({ seat: seat, card: card });
  if (card.suit === "hearts") heartsBroken = true;
  if (trick.length === 4) {
    busy = true; render();
    // Las 4 cartas "viajan" hacia quien se lleva la baza
    var t = document.getElementById("trick");
    t.className = "collect to-" + SEAT[trickWinner()].cls;
    flowTimer = setTimeout(resolveTrick, TRICK_HOLD);
  } else {
    turn = (turn + 3) % 4;
    advance();
  }
}
function resolveTrick() {
  flowTimer = null;
  if (phase !== "play" || trick.length !== 4) return;  // ignora timers obsoletos
  var w = trickWinner(), pts = trickPoints(), i;
  players[w].roundPoints += pts;
  for (i = 0; i < trick.length; i++) if (pointsOf(trick[i].card) > 0) players[w].taken.push(trick[i].card);
  tricksPlayed++;
  trick = [];
  if (tricksPlayed === 13) { endHand(); return; }
  leadSeat = w; turn = w;
  setStatus((w === HUMAN ? "Te llevaste la baza" : playerName(w) + " se llevó la baza") + (pts > 0 ? " (+" + pts + ")" : "") + ".");
  advance();
}
function endHand() {
  var s, shooter = -1;
  for (s = 0; s < 4; s++) if (players[s].roundPoints === 26) shooter = s;
  var deltas = [0, 0, 0, 0];
  if (shooter >= 0) {
    if (moonMode === "tirador") { for (s = 0; s < 4; s++) deltas[s] = (s === shooter) ? -26 : 0; }
    else { for (s = 0; s < 4; s++) deltas[s] = (s === shooter) ? 0 : 26; }
  } else { for (s = 0; s < 4; s++) deltas[s] = players[s].roundPoints; }
  pendingMoonBump = (shooter === HUMAN);
  for (s = 0; s < 4; s++) players[s].score += deltas[s];
  handHistory.push(deltas.slice());
  phase = "scoring";
  busy = true;
  render();
  // D2 (docs/PLAN-2.md): un empate en el liderazgo (menor puntaje) al
  // alcanzar el objetivo juega una mano de desempate en vez de declarar
  // ganador por orden de asiento — antes, con 2+ empatados en el mínimo,
  // el sort estable de showWin() favorecía en silencio al de asiento más
  // bajo. Sólo termina si alguien llegó al objetivo Y el líder es único.
  pendingOver = false;
  var reachedTarget = false;
  for (s = 0; s < 4; s++) if (players[s].score >= target) reachedTarget = true;
  if (reachedTarget) {
    var minScore = players[0].score;
    for (s = 1; s < 4; s++) if (players[s].score < minScore) minScore = players[s].score;
    var leaders = 0;
    for (s = 0; s < 4; s++) if (players[s].score === minScore) leaders++;
    pendingOver = leaders === 1;
  }
  showRound(deltas, shooter);   // muestra siempre las cartas de la mano (aun si terminó el juego)
}

/* ---------- Render ---------- */
// el() vive en shared/ui.js.
function esc(s) {
  return String(s).replace(/[&<>"]/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
  });
}
// cardFace, rankName, cardLabel y makeCardEl viven en shared/cards.js.
function setStatus(msg) { document.getElementById("status").textContent = msg || ""; }

function renderOpp(seat) {
  var box = document.getElementById("seat-" + seat);
  var p = players[seat], n = p.hand.length;
  box.className = "seat " + SEAT[seat].cls + ((turn === seat && phase === "play") ? " active thinking" : "");
  var cards = n > 0 ? '<div class="seat-cards"><div class="card down"></div><span class="count-badge">' + n + '</span></div>' : '<div class="seat-cards"></div>';
  box.innerHTML = cards + '<div class="chip"><span class="nm">' + esc(playerName(seat)) + '</span><span class="sc">' + p.score + '</span></div>';
}
function renderTrick() {
  var t = document.getElementById("trick");
  t.className = "";              // limpia clases de "recoger baza" de la baza anterior
  t.innerHTML = "";
  if (!trick.length) { lastTrickCardId = null; return; }
  for (var i = 0; i < trick.length; i++) {
    var d = el("div", "play " + SEAT[trick[i].seat].cls);
    var card = trick[i].card;
    // Animar (pop-in) sólo la carta recién jugada, una vez
    if (i === trick.length - 1 && trick.length < 4 && card.id !== lastTrickCardId) {
      d.classList.add("new"); lastTrickCardId = card.id;
    }
    d.appendChild(makeCardEl(card));
    t.appendChild(d);
  }
}
function renderHand() {
  var hand = document.getElementById("hand"); hand.innerHTML = "";
  var cards = players[HUMAN].hand;
  var n = cards.length;
  if (!n) return;
  var availW = hand.clientWidth || (document.getElementById("table").clientWidth - 8);
  var step = n > 1 ? Math.min(CW * 0.62, (availW - CW) / (n - 1)) : 0;
  var totalW = (n - 1) * step + CW;
  var offset = Math.max(0, (availW - totalW) / 2);

  var myTurn = phase === "play" && turn === HUMAN && !busy && trick.length < 4;
  var legalSet = {};
  if (myTurn) { var lg = legalCards(HUMAN); for (var k = 0; k < lg.length; k++) legalSet[lg[k].id] = 1; }

  for (var i = 0; i < n; i++) {
    var card = cards[i];
    var ce = makeCardEl(card);
    ce.style.left = (offset + i * step) + "px";
    ce.style.zIndex = i;
    ce.dataset.id = card.id;
    if (dealAnim) { ce.classList.add("deal"); ce.style.animationDelay = (i * 24) + "ms"; }
    if (phase === "pass") {
      ce.classList.add("playable");
      if (humanPass.indexOf(card.id) >= 0) ce.classList.add("picked");
      keyActivate(ce, (function (c) { return function () { togglePass(c); }; })(card));
    } else if (myTurn) {
      if (legalSet[card.id]) {
        ce.classList.add("playable");
        keyActivate(ce, (function (c) { return function () { humanPlay(c); }; })(card));
      } else { ce.classList.add("dim"); }
    } else { ce.classList.add("dim"); }
    hand.appendChild(ce);
  }
}
function render() {
  document.getElementById("handno").textContent = handNumber;
  document.getElementById("target").textContent = target;
  document.getElementById("hb").textContent = heartsBroken ? "💔 rotos" : "♥";
  renderOpp(1); renderOpp(2); renderOpp(3);
  renderTrick();
  renderHand();
  updateControls();
  saveGame();
  dealAnim = false;   // el reparto se anima una sola vez
}
function updateControls() {
  var passBtn = document.getElementById("btn-pass");
  if (phase === "pass") {
    passBtn.hidden = false;
    passBtn.disabled = humanPass.length !== 3;
    passBtn.textContent = "Pasar " + DIR_TXT[passDir];
  } else {
    passBtn.hidden = true;
  }
}

/* ---------- Acciones del jugador ---------- */
function togglePass(card) {
  if (phase !== "pass") return;
  var idx = humanPass.indexOf(card.id);
  if (idx >= 0) humanPass.splice(idx, 1);
  else { if (humanPass.length >= 3) return; humanPass.push(card.id); }
  clearHint();
  render();
}
function humanPlay(card) {
  if (phase !== "play" || turn !== HUMAN || busy || trick.length >= 4) return;
  var legal = legalCards(HUMAN), ok = false;
  for (var i = 0; i < legal.length; i++) if (legal[i].id === card.id) { ok = true; break; }
  if (!ok) return;
  clearHint();
  doPlay(HUMAN, card);
}

/* ---------- Pista ---------- */
function clearHint() {
  if (hintTimer) { clearTimeout(hintTimer); hintTimer = null; }
  var hs = document.querySelectorAll(".card.hint");
  for (var i = 0; i < hs.length; i++) hs[i].classList.remove("hint");
}
function highlightCards(ids) {
  clearHint();
  for (var i = 0; i < ids.length; i++) {
    var e = document.querySelector('.hand .card[data-id="' + ids[i] + '"]');
    if (e) e.classList.add("hint");
  }
  hintTimer = setTimeout(clearHint, 1800);
}
function onHint() {
  if (phase === "pass") {
    var p = aiPass(HUMAN);
    highlightCards([p[0].id, p[1].id, p[2].id]);
  } else if (phase === "play" && turn === HUMAN && !busy && trick.length < 4) {
    highlightCards([aiPlay(HUMAN).id]);
  } else {
    toast("Esperá tu turno.");
  }
}

/* ---------- Modales de puntaje ---------- */
function scoreRow(seat, mid, total, cls) {
  var tr = "<tr class=\"" + (cls || "") + "\">";
  tr += "<td>" + esc(playerName(seat)) + "</td>";
  if (mid != null) tr += '<td class="num">' + (mid > 0 ? "+" + mid : "0") + "</td>";
  tr += '<td class="num">' + total + "</td></tr>";
  return tr;
}
function validCard(c) { return c && SUIT[c.suit] && RANK_LABEL[c.rank] != null; }
function pointCardsHtml(cards) {
  var arr = (cards || []).filter(validCard).sort(function (a, b) { return (SUIT_SORT[a.suit] - SUIT_SORT[b.suit]) || (a.rank - b.rank); });
  if (!arr.length) return '<span class="none">sin cartas con puntos</span>';
  var h = "";
  for (var i = 0; i < arr.length; i++)
    h += '<span class="minicard ' + arr[i].suit + '">' + RANK_LABEL[arr[i].rank] + SUIT[arr[i].suit].symbol + '</span>';
  return h;
}
function showRound(deltas, shooter) {
  document.getElementById("round-title").textContent = "Fin de la mano " + handNumber;
  var moon = document.getElementById("round-moon");
  if (shooter >= 0) {
    moon.hidden = false;
    // playerName() sin esc(): seguro porque baja unas líneas por .textContent (no
    // interpreta HTML). Si esto pasara a asignarse por .innerHTML, hay que
    // escapar playerName() como en el resto del archivo (ver auditoría XSS).
    var who = shooter === HUMAN ? "¡Disparaste a la luna!" : playerName(shooter) + " disparó a la luna";
    var eff = moonMode === "tirador" ? (shooter === HUMAN ? " — restás 26." : " — resta 26.") : " — los demás +26.";
    moon.textContent = "🌙 " + who + eff;
  } else { moon.hidden = true; }
  var leader = 0, s;
  for (s = 1; s < 4; s++) if (players[s].score < players[leader].score) leader = s;
  var body = "";
  for (s = 0; s < 4; s++) {
    var cls = "taken-row" + (s === HUMAN ? " me" : "") + (s === leader ? " lead" : "");
    body += '<div class="' + cls + '">' +
      '<div class="taken-head"><span class="nm">' + esc(playerName(s)) + '</span>' +
      '<span class="pts">' + (deltas[s] > 0 ? "+" + deltas[s] : "" + deltas[s]) + ' · total ' + players[s].score + '</span></div>' +
      '<div class="taken-cards">' + pointCardsHtml(players[s].taken) + '</div></div>';
  }
  document.getElementById("round-body").innerHTML = body;
  document.getElementById("round-next").textContent = pendingOver ? "Ver resultado final" : "Continuar";
  document.getElementById("round").hidden = false;
}
function showWin() {
  recordMatchEnd();
  var order = [0, 1, 2, 3].sort(function (a, b) { return players[a].score - players[b].score; });
  var winner = order[0];
  var body = "";
  for (var i = 0; i < order.length; i++) {
    var s = order[i];
    body += scoreRow(s, null, players[s].score, (s === HUMAN ? "me " : "") + (i === 0 ? "lead" : ""));
  }
  document.getElementById("win-body").innerHTML = body;
  document.getElementById("win-emoji").textContent = winner === HUMAN ? "🏆" : "🙂";
  document.getElementById("win-title").textContent = winner === HUMAN ? "¡Ganaste!" : "Fin del juego";
  // playerName() sin esc(): seguro porque baja por .textContent (ver nota en showRound).
  document.getElementById("win-congrats").textContent =
    winner === HUMAN ? "🎉 Terminaste con menos puntos. ¡Felicitaciones!" : "Ganó " + playerName(winner) + " con " + players[winner].score + " puntos.";
  document.getElementById("win").hidden = false;
  if (winner === HUMAN) celebrate();
  gameDel();
}
function buildScoresTable() {
  var t = document.getElementById("scores-table"), s, h;
  if (!handHistory.length) {
    t.innerHTML = '<tbody><tr><td class="score-table-empty">Todavía no terminó ninguna mano.</td></tr></tbody>';
    return;
  }
  var leader = 0;
  for (s = 1; s < 4; s++) if (players[s].score < players[leader].score) leader = s;
  var html = '<thead><tr><th>Mano</th>';
  for (s = 0; s < 4; s++) html += '<th class="num' + (s === HUMAN ? ' col-me' : '') + '">' + esc(playerName(s)) + '</th>';
  html += '</tr></thead><tbody>';
  for (h = 0; h < handHistory.length; h++) {
    var row = handHistory[h] || [];
    html += '<tr><td>' + (h + 1) + '</td>';
    for (s = 0; s < 4; s++) html += '<td class="num' + (s === HUMAN ? ' col-me' : '') + '">' + (row[s] != null ? row[s] : 0) + '</td>';
    html += '</tr>';
  }
  html += '</tbody><tfoot><tr><td><b>Total</b></td>';
  for (s = 0; s < 4; s++) html += '<td class="num' + (s === HUMAN ? ' col-me' : '') + (s === leader ? ' lead' : '') + '"><b>' + players[s].score + '</b></td>';
  html += '</tr></tfoot>';
  t.innerHTML = html;
}
function openScores() { buildScoresTable(); document.getElementById("scores").hidden = false; }

/* ---------- Festejo ---------- */
// celebrate() y stopConfetti() viven en shared/ui.js.

/* ---------- Aviso breve ---------- */
// toast() vive en shared/ui.js.

/* ---------- Tamaños ---------- */
function setSizes() {
  var board = document.getElementById("table");
  var w = board.clientWidth || window.innerWidth;
  var h = board.clientHeight || window.innerHeight;
  var cw = Math.min(w / 6.2, h / 6.6);
  // Techo más alto en pantallas anchas: si no, en desktop la mesa queda chica
  // y descentrada con mucho espacio libre alrededor.
  var cwCap = window.innerWidth >= 1100 ? 125 : 92;
  CW = Math.round(Math.max(42, Math.min(cw, cwCap)));
  CH = Math.round(CW * 1.42);
  OW = Math.round(CW * 0.62);
  var root = document.documentElement;
  root.style.setProperty("--cw", CW + "px");
  root.style.setProperty("--ch", CH + "px");
  root.style.setProperty("--ow", OW + "px");
}

/* ---------- Opciones ---------- */
function updateSettingsUI() {
  var i, a = document.querySelectorAll("[data-target]");
  for (i = 0; i < a.length; i++) a[i].classList.toggle("active", parseInt(a[i].dataset.target, 10) === target);
  var b = document.querySelectorAll("[data-ai]");
  for (i = 0; i < b.length; i++) b[i].classList.toggle("active", b[i].dataset.ai === aiLevel);
  var c = document.querySelectorAll("[data-moon]");
  for (i = 0; i < c.length; i++) c[i].classList.toggle("active", c[i].dataset.moon === moonMode);
  var ni = document.querySelectorAll(".name-input");
  for (i = 0; i < ni.length; i++) { var seat = parseInt(ni[i].dataset.seat, 10); ni[i].value = names[seat] || ""; }
}
function savePrefs() { try { localStorage.setItem(PREFS_KEY, JSON.stringify({ target: target, aiLevel: aiLevel, moonMode: moonMode, names: names })); } catch (e) {} }
function loadPrefs() {
  try {
    var p = JSON.parse(localStorage.getItem(PREFS_KEY));
    if (!p) return;
    if (p.target === 50 || p.target === 100) target = p.target;
    if (p.aiLevel === "facil" || p.aiLevel === "normal" || p.aiLevel === "dificil") aiLevel = p.aiLevel;
    if (p.moonMode === "demas" || p.moonMode === "tirador") moonMode = p.moonMode;
    if (p.names && p.names.length === 4)
      for (var i = 1; i < 4; i++) if (typeof p.names[i] === "string") names[i] = p.names[i].slice(0, 12);
  } catch (e) {}
}

/* ---------- Persistencia ---------- */
var PREFS_KEY = "corazones.prefs", STATS_KEY = "corazones.stats";
// El candado multi-pestaña y gameSet/gameDel/GAME_KEY viven en shared/storage.js.
// loadStats/saveStats/bumpStat vienen de makeStats() en shared/storage.js.
var _stats = makeStats(STATS_KEY);
var loadStats = _stats.load, saveStats = _stats.save, bumpStat = _stats.bump;
function recordMatchEnd() {
  // "played" ya se cuenta en newMatch() (D1, docs/PLAN-2.md): al repartir la
  // 1.ª mano, no acá al terminar — así una partida abandonada a mitad de
  // camino también cuenta, igual que en los otros 3 juegos.
  var s = loadStats();
  var winner = 0;
  for (var i = 1; i < 4; i++) if (players[i].score < players[winner].score) winner = i;
  if (winner === HUMAN) s.won = (s.won || 0) + 1;
  var mine = players[HUMAN].score;
  if (s.bestScore == null || mine < s.bestScore) s.bestScore = mine;
  saveStats(s);
}
function saveGame() {
  try {
    if (phase === "scoring") return;
    var p = [];
    for (var s = 0; s < 4; s++) p.push({ hand: players[s].hand, score: players[s].score, roundPoints: players[s].roundPoints, taken: players[s].taken });
    gameSet(JSON.stringify({
      v: 1,
      players: p, phase: phase, trick: trick, leadSeat: leadSeat, turn: turn,
      heartsBroken: heartsBroken, tricksPlayed: tricksPlayed, handNumber: handNumber, passDir: passDir, target: target,
      history: handHistory, humanPass: humanPass
    }));
  } catch (e) {}
}
function validSaved(d) {
  if (!d || !d.players || d.players.length !== 4) return false;
  // Formato versionado: una versión futura desconocida se descarta.
  if (d.v != null && d.v !== 1) return false;
  if (d.phase !== "play" && d.phase !== "pass") return false;   // sólo estados jugables
  // Números fuera de rango o de otro tipo (p. ej. un string inyectado desde
  // otra página del mismo origen, ver docs/PLAN-2.md, Fase 2) se rechazan:
  // llegan crudos a innerHTML en renderOpp()/buildScoresTable().
  if (d.turn != null && asIntInRange(d.turn, 0, 3, null) === null) return false;
  if (d.leadSeat != null && asIntInRange(d.leadSeat, 0, 3, null) === null) return false;
  if (d.tricksPlayed != null && asIntInRange(d.tricksPlayed, 0, 13, null) === null) return false;
  if (d.handNumber != null && asIntInRange(d.handNumber, 1, 1000000, null) === null) return false;
  if (d.passDir != null && DIRS.indexOf(d.passDir) < 0) return false;
  if (d.history != null) {
    if (!Array.isArray(d.history)) return false;
    for (var h = 0; h < d.history.length; h++) {
      var row = d.history[h];
      if (row == null) continue;
      if (!Array.isArray(row)) return false;
      for (var c = 0; c < row.length; c++) if (asNum(row[c], null) === null) return false;
    }
  }
  // Las cartas en juego (manos + baza en mesa) no pueden repetirse (RNF-04:
  // un guardado corrupto se descarta), igual que en Solitario/Carta Blanca.
  var n = 0, i, s, seen = {}, key;
  if (d.trick != null) {
    if (!Array.isArray(d.trick)) return false;
    for (i = 0; i < d.trick.length; i++) {
      if (!d.trick[i] || !validCard(d.trick[i].card)) return false;
      if (asIntInRange(d.trick[i].seat, 0, 3, null) === null) return false;
      key = d.trick[i].card.suit + "-" + d.trick[i].card.rank;
      if (seen[key]) return false;
      seen[key] = 1;
    }
    n += d.trick.length;
  }
  n += (d.tricksPlayed || 0) * 4;
  for (s = 0; s < 4; s++) {
    var p = d.players[s];
    if (!p || !Array.isArray(p.hand)) return false;
    if (p.score != null && asNum(p.score, null) === null) return false;
    if (p.roundPoints != null && asNum(p.roundPoints, null) === null) return false;
    for (i = 0; i < p.hand.length; i++) {
      if (!validCard(p.hand[i])) return false;
      key = p.hand[i].suit + "-" + p.hand[i].rank;
      if (seen[key]) return false;
      seen[key] = 1;
    }
    if (p.taken != null) {
      if (!Array.isArray(p.taken)) return false;
      for (i = 0; i < p.taken.length; i++) if (!validCard(p.taken[i])) return false;
    }
    n += p.hand.length;
  }
  return n === 52;
}
function loadGame() {
  try {
    var d = JSON.parse(localStorage.getItem(GAME_KEY));
    if (!validSaved(d)) return false;
    players = [];
    for (var s = 0; s < 4; s++) players.push({
      hand: d.players[s].hand,
      score: asNum(d.players[s].score, 0),
      roundPoints: asNum(d.players[s].roundPoints, 0),
      taken: d.players[s].taken || []
    });
    phase = d.phase; trick = d.trick || [];
    leadSeat = asIntInRange(d.leadSeat, 0, 3, 0);
    turn = asIntInRange(d.turn, 0, 3, 0);
    heartsBroken = !!d.heartsBroken;
    tricksPlayed = asIntInRange(d.tricksPlayed, 0, 13, 0);
    handNumber = asIntInRange(d.handNumber, 1, 1000000, 1);
    passDir = d.passDir || "left";
    if (d.target === 50 || d.target === 100) target = d.target;
    handHistory = (d.history && d.history.length != null) ? d.history : [];
    busy = false; humanPass = [];
    // Restaurar las cartas ya elegidas para pasar (sólo ids presentes en la mano)
    if (phase === "pass" && Array.isArray(d.humanPass)) {
      for (var k = 0; k < d.humanPass.length && humanPass.length < 3; k++) {
        for (var j = 0; j < players[HUMAN].hand.length; j++)
          if (players[HUMAN].hand[j].id === d.humanPass[k]) { humanPass.push(d.humanPass[k]); break; }
      }
    }
    setSizes();
    render();
    if (phase === "play") {
      if (trick.length === 4) { busy = true; flowTimer = setTimeout(resolveTrick, TRICK_HOLD); }
      else advance();
    } else if (phase === "pass") {
      setStatus("Elegí 3 cartas para pasar " + DIR_TXT[passDir]);
    } else {
      nextHand();
    }
    return true;
  } catch (e) { return false; }
}

/* ---------- Nueva mano / partida ---------- */
function nextHand() {
  clearFlow();
  document.getElementById("round").hidden = true;
  handNumber++;
  passDir = DIRS[(handNumber - 1) % 4];
  dealHand();
  dealAnim = true;   // el primer render de la mano nueva anima el abanico
  if (passDir === "hold") {
    beginPlay();
  } else {
    phase = "pass"; humanPass = []; busy = false;
    setStatus("Elegí 3 cartas para pasar " + DIR_TXT[passDir]);
    render();
  }
}
function newMatch() {
  clearFlow();
  stopConfetti();
  clearHint();
  document.getElementById("win").hidden = true;
  document.getElementById("round").hidden = true;
  players = [
    { hand: [], score: 0, roundPoints: 0, taken: [] }, { hand: [], score: 0, roundPoints: 0, taken: [] },
    { hand: [], score: 0, roundPoints: 0, taken: [] }, { hand: [], score: 0, roundPoints: 0, taken: [] }
  ];
  handNumber = 0; trick = []; busy = false; handHistory = [];
  // D1 (docs/PLAN-2.md): cuenta al repartir la 1.ª mano, igual que
  // Solitario/Carta Blanca/Buscaminas (antes sólo se contaba al terminar la
  // partida completa en recordMatchEnd(), y una partida abandonada a mitad
  // de camino no sumaba nada).
  bumpStat("played");
  nextHand();
}

/* ---------- Inicio y eventos ---------- */
loadPrefs();
setSizes();
if (!loadGame()) newMatch();
updateSettingsUI();

window.addEventListener("pagehide", saveGame);
document.addEventListener("visibilitychange", function () { if (document.hidden) saveGame(); });

document.getElementById("btn-new").onclick = function () { newMatch(); };
document.getElementById("btn-pass").onclick = confirmPass;

// Delegación de clics de la mano (un único listener, en vez de uno por carta).
document.getElementById("hand").addEventListener("click", function (e) {
  var ce = e.target.closest(".card.playable");
  if (!ce) return;
  var id = ce.dataset.id, h = players[HUMAN].hand, card = null;
  for (var i = 0; i < h.length; i++) if (String(h[i].id) === id) { card = h[i]; break; }
  if (!card) return;
  if (phase === "pass") togglePass(card);
  else if (phase === "play") humanPlay(card);
});
document.getElementById("btn-hint").onclick = onHint;
document.getElementById("btn-scores").onclick = openScores;
document.getElementById("scores-close").onclick = function () { document.getElementById("scores").hidden = true; };
document.getElementById("btn-help").onclick = function () { document.getElementById("help").hidden = false; };
document.getElementById("help-close").onclick = function () { document.getElementById("help").hidden = true; };
document.getElementById("btn-menu").onclick = function () { document.getElementById("menu").hidden = false; };
document.getElementById("menu-close").onclick = function () { document.getElementById("menu").hidden = true; };
document.getElementById("btn-settings").onclick = function () { updateSettingsUI(); document.getElementById("settings").hidden = false; };
document.getElementById("settings-close").onclick = function () { document.getElementById("settings").hidden = true; };
document.getElementById("round-next").onclick = function () {
  document.getElementById("round").hidden = true;
  if (pendingMoonBump) { pendingMoonBump = false; bumpStat("moons"); }
  if (pendingOver) showWin(); else nextHand();
};
document.getElementById("win-new").onclick = function () { newMatch(); };
document.getElementById("win-close").onclick = function () { document.getElementById("win").hidden = true; stopConfetti(); };

(function () {
  var i, tg = document.querySelectorAll("[data-target]");
  for (i = 0; i < tg.length; i++) (function (btn) {
    btn.onclick = function () { target = parseInt(btn.dataset.target, 10); savePrefs(); updateSettingsUI(); render(); };
  })(tg[i]);
  var ai = document.querySelectorAll("[data-ai]");
  for (i = 0; i < ai.length; i++) (function (btn) {
    btn.onclick = function () { aiLevel = btn.dataset.ai; savePrefs(); updateSettingsUI(); };
  })(ai[i]);
  var mn = document.querySelectorAll("[data-moon]");
  for (i = 0; i < mn.length; i++) (function (btn) {
    btn.onclick = function () { moonMode = btn.dataset.moon; savePrefs(); updateSettingsUI(); };
  })(mn[i]);
  var ni = document.querySelectorAll(".name-input");
  for (i = 0; i < ni.length; i++) (function (inp) {
    var seat = parseInt(inp.dataset.seat, 10);
    inp.oninput = function () { names[seat] = inp.value.trim().slice(0, 12); savePrefs(); render(); };
  })(ni[i]);
})();

// debounce() vive en shared/ui.js (en móvil el resize dispara en ráfagas:
// barra del navegador, rotación). Además del resize de la ventana se observa
// la MESA en sí (ResizeObserver, es lo que mide setSizes): al rotar el
// teléfono o al entrar/salir el riel lateral, su tamaño real puede cambiar
// después del último evento resize.
var relayout = debounce(function () { setSizes(); render(); }, 120);
window.addEventListener("resize", relayout);
if (typeof ResizeObserver === "function")
  new ResizeObserver(relayout).observe(document.getElementById("table"));
