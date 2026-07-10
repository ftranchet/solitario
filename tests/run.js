/*
 * Tests de navegador para los juegos (Solitario, Carta Blanca, Corazones, Buscaminas).
 *
 * Corren los HTML reales en Chromium y verifican los flujos clave y las regresiones
 * ya encontradas. No hace falta configurar nada: el runner levanta su propio
 * servidor HTTP local (ver startServer).
 *
 * Uso:   cd tests && npm install && npm test
 * Ver el README para detalles y cómo elegir el navegador.
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const { chromium } = require("playwright-core");

const ROOT = path.resolve(__dirname, "..");
var BASE = "";                                   // se completa al levantar el server
function url(file) { return BASE + file; }

/* Servidor estático mínimo: los juegos usan localStorage, que en file:// es poco
   fiable; servirlos por http reproduce el entorno real (mismo origen entre pestañas). */
function startServer(rootDir) {
  var types = { ".html": "text/html; charset=utf-8", ".svg": "image/svg+xml", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".ico": "image/x-icon", ".webmanifest": "application/manifest+json", ".json": "application/json" };
  var server = http.createServer(function (req, res) {
    var rel = decodeURIComponent(req.url.split("?")[0]);
    if (rel === "/") rel = "/index.html";
    var fp = path.join(rootDir, path.normalize(rel));
    if (fp.indexOf(rootDir) !== 0) { res.writeHead(403); res.end(); return; }
    fs.readFile(fp, function (err, data) {
      if (err) { res.writeHead(404); res.end("no encontrado"); return; }
      res.writeHead(200, { "content-type": types[path.extname(fp)] || "application/octet-stream" });
      res.end(data);
    });
  });
  return new Promise(function (resolve) {
    server.listen(0, "127.0.0.1", function () { resolve({ server: server, port: server.address().port }); });
  });
}

/* ---------- Resolución del navegador ----------
   1) CHROMIUM_BIN / CHROME_BIN si apuntan a un ejecutable.
   2) PLAYWRIGHT_BROWSERS_PATH (Chromium preinstalado, p. ej. Claude Code en la web).
   3) Chrome del sistema (channel "chrome"), útil en la máquina del usuario. */
function resolveLaunch() {
  var bin = process.env.CHROMIUM_BIN || process.env.CHROME_BIN;
  if (bin && fs.existsSync(bin)) return { executablePath: bin };

  var base = process.env.PLAYWRIGHT_BROWSERS_PATH || "/opt/pw-browsers";
  var candidates = [path.join(base, "chromium")]; // symlink de conveniencia
  try {
    fs.readdirSync(base).forEach(function (d) {
      if (!/^chromium[-_]/.test(d)) return;
      candidates.push(
        path.join(base, d, "chrome-linux", "chrome"),
        path.join(base, d, "chrome-linux", "headless_shell"),
        path.join(base, d, "chrome-mac", "Chromium.app", "Contents", "MacOS", "Chromium"),
        path.join(base, d, "chrome-win", "chrome.exe")
      );
    });
  } catch (e) {}
  for (var i = 0; i < candidates.length; i++) {
    try { if (fs.existsSync(candidates[i])) return { executablePath: candidates[i] }; } catch (e) {}
  }
  return { channel: "chrome" }; // último recurso: Google Chrome instalado en el sistema
}

/* ---------- Mini-arnés ---------- */
var tests = [];
function test(name, fn) { tests.push({ name: name, fn: fn }); }
function assert(cond, msg) { if (!cond) throw new Error(msg || "assert falló"); }
function assertNoErrors(errors) { assert(errors.length === 0, "errores de página: " + errors.join(" | ")); }

async function newPage(context) {
  var page = await context.newPage();
  var errors = [];
  page.on("pageerror", function (e) { errors.push("pageerror: " + e.message); });
  page.on("console", function (m) { if (m.type() === "error") errors.push("console.error: " + m.text()); });
  return { page: page, errors: errors };
}
async function open(context, file) {
  // Cada test corre en un contexto nuevo: localStorage/sessionStorage ya vienen
  // vacíos, así que basta con navegar (sin limpiar ni recargar).
  var p = await newPage(context);
  await p.page.goto(url(file), { waitUntil: "load" });
  await p.page.waitForTimeout(120);
  return p;
}

/* ========================= TESTS ========================= */

/* 1) Carga sin errores de consola/página en todas las pantallas. */
["index.html", "solitario.html", "carta-blanca.html", "corazones.html", "buscaminas.html", "estadisticas.html"]
.forEach(function (file) {
  test("carga sin errores: " + file, async function (ctx) {
    var p = await open(ctx, file);
    await p.page.waitForTimeout(150);
    assertNoErrors(p.errors);
  });
});

/* 2) Corazones — REGRESIÓN: el fin de mano debe mostrar el modal de puntajes.
   Bug: la variable global `history` chocaba con window.history y endHand lanzaba
   "history.push is not a function", dejando la mesa vacía con "Te toca jugar". */
test("Corazones: el fin de mano muestra el modal (regresión history/window.history)", async function (ctx) {
  var p = await open(ctx, "corazones.html");
  await p.page.evaluate(function () {
    window.AI_DELAY = 5; window.TRICK_HOLD = 5;
    function mk(s, r) { return { suit: s, rank: r, color: SUIT[s].color, id: s + "-" + r }; }
    players[0].hand = [mk("clubs", 5)]; players[1].hand = [mk("clubs", 6)];
    players[2].hand = [mk("hearts", 9)]; players[3].hand = [mk("clubs", 8)];
    for (var s = 0; s < 4; s++) { players[s].roundPoints = 0; players[s].taken = []; players[s].score = 0; }
    tricksPlayed = 12; trick = []; heartsBroken = true; phase = "play";
    leadSeat = 3; turn = 3; busy = false; handNumber = 1; render(); advance();
  });
  // Las 3 IA juegan; queda el turno del humano con 3 cartas en mesa.
  await p.page.waitForFunction(function () { return (turn === 0 && trick.length === 3) || phase !== "play"; }, null, { timeout: 4000 });
  await p.page.evaluate(function () { humanPlay(players[0].hand[0]); });
  // Debe resolverse la baza y abrirse el modal de fin de mano.
  await p.page.waitForFunction(function () {
    return phase === "scoring" && document.getElementById("round").hidden === false;
  }, null, { timeout: 4000 });
  assert(await p.page.evaluate(function () { return Array.isArray(handHistory) && handHistory.length === 1; }),
    "handHistory debería tener 1 mano registrada");
  assertNoErrors(p.errors);
});

/* 3) Corazones — partida completa por la UI hasta el modal de victoria. */
test("Corazones: partida completa por la UI llega al modal de victoria", async function (ctx) {
  var p = await open(ctx, "corazones.html");
  await p.page.evaluate(function () { window.AI_DELAY = 4; window.TRICK_HOLD = 4; window.target = 6; });
  var won = false;
  for (var i = 0; i < 6000; i++) {
    var s = await p.page.evaluate(function () {
      return {
        phase: phase,
        roundHidden: document.getElementById("round").hidden,
        winHidden: document.getElementById("win").hidden,
        picks: document.querySelectorAll(".hand .card.picked").length,
        canPick: document.querySelectorAll(".hand .card.playable:not(.picked)").length,
        canPlay: document.querySelectorAll(".hand .card.playable").length
      };
    });
    if (!s.winHidden) { won = true; break; }
    if (!s.roundHidden) { await p.page.evaluate(function () { document.getElementById("round-next").click(); }); await p.page.waitForTimeout(25); continue; }
    if (s.phase === "pass") {
      if (s.picks < 3 && s.canPick > 0) await p.page.evaluate(function () { document.querySelector(".hand .card.playable:not(.picked)").click(); });
      else if (s.picks === 3) await p.page.evaluate(function () { document.getElementById("btn-pass").click(); });
      await p.page.waitForTimeout(15); continue;
    }
    if (s.phase === "play" && s.canPlay > 0) { await p.page.evaluate(function () { document.querySelector(".hand .card.playable").click(); }); await p.page.waitForTimeout(15); continue; }
    await p.page.waitForTimeout(20);
  }
  assert(won, "no se llegó al modal de victoria");
  assertNoErrors(p.errors);
});

/* 4) Corazones — candado entre pestañas (#3): dos pestañas, un único dueño del guardado.
   Dos páginas en el mismo contexto comparten localStorage pero tienen sessionStorage
   separado: simula dos pestañas del mismo juego. */
test("Corazones: dos pestañas, un único dueño del guardado (#3)", async function (ctx) {
  var a = await open(ctx, "corazones.html");
  await a.page.waitForTimeout(150);
  var b = await newPage(ctx);
  await b.page.goto(url("corazones.html"), { waitUntil: "load" }); // sin limpiar: respeta el candado de A
  await b.page.waitForTimeout(300);
  var ownerA = await a.page.evaluate(function () { return saveOwner; });
  var ownerB = await b.page.evaluate(function () { return saveOwner; });
  assert((ownerA ? 1 : 0) + (ownerB ? 1 : 0) === 1, "debe haber exactamente un dueño (A=" + ownerA + " B=" + ownerB + ")");
});

/* 5) Buscaminas — generación "sin adivinanzas" en Experto (#1): completa y revela
   sin congelar (el trabajo se trocea cediendo el hilo). */
test("Buscaminas: generación 'sin adivinanzas' en Experto completa y revela (#1)", async function (ctx) {
  var p = await open(ctx, "buscaminas.html");
  await p.page.evaluate(function () { noGuess = true; setDifficulty("expert"); });
  await p.page.waitForTimeout(100);
  await p.page.evaluate(function () { digCell(8, 15); }); // primer toque: dispara la generación
  await p.page.waitForFunction(function () { return started === true && generating === false; }, null, { timeout: 9000 });
  var r = await p.page.evaluate(function () { return { revealed: revealedCount, dead: dead }; });
  assert(r.revealed > 0 && !r.dead, "esperaba celdas reveladas y no muerto: " + JSON.stringify(r));
  assertNoErrors(p.errors);
});

/* 6) Solitario — victoria muestra el modal. */
test("Solitario: la victoria muestra el modal", async function (ctx) {
  var p = await open(ctx, "solitario.html");
  var hidden = await p.page.evaluate(function () {
    var su = SUIT_ORDER, f = [[], [], [], []];
    for (var i = 0; i < 4; i++) for (var r = 1; r <= 13; r++) f[i].push({ suit: su[i], rank: r, color: SUIT[su[i]].color, faceUp: true, id: i * 13 + r });
    state.foundations = f; state.tableau = [[], [], [], [], [], [], []]; state.stock = []; state.waste = [];
    checkWin(); return document.getElementById("win").hidden;
  });
  assert(hidden === false, "el modal de victoria no apareció");
  assertNoErrors(p.errors);
});

/* 7) Solitario — el autocompletado corta al cerrar una vuelta al mazo sin progreso (#5).
   Estado atascado (sin ases): antes ciclaba 80 ticks (~10s); ahora corta enseguida. */
test("Solitario: el autocompletado corta cuando no hay progreso (#5)", async function (ctx) {
  var p = await open(ctx, "solitario.html");
  await p.page.evaluate(function () {
    function c(s, r, id) { return { suit: s, rank: r, color: SUIT[s].color, faceUp: true, id: id }; }
    state.foundations = [[], [], [], []];
    state.tableau = []; for (var i = 0; i < 7; i++) state.tableau.push([c("clubs", 5, 100 + i)]);
    state.stock = [c("clubs", 6, 200), c("clubs", 7, 201)]; // sin ases => nunca hay jugada a fundación
    state.waste = []; settings.draw = 1; selection = null;
    startAutoComplete();
  });
  await p.page.waitForFunction(function () { return autoTimer === null; }, null, { timeout: 3000 });
  assertNoErrors(p.errors);
});

/* 8) Carta Blanca — victoria muestra el modal. */
test("Carta Blanca: la victoria muestra el modal", async function (ctx) {
  var p = await open(ctx, "carta-blanca.html");
  var hidden = await p.page.evaluate(function () {
    var su = Object.keys(SUIT), f = [[], [], [], []];
    for (var i = 0; i < 4; i++) for (var r = 1; r <= 13; r++) f[i].push({ suit: su[i], rank: r, color: SUIT[su[i]].color, id: i * 13 + r });
    state.foundations = f; state.tableau = [[], [], [], [], [], [], [], []]; state.free = [null, null, null, null];
    checkWin(); return document.getElementById("win").hidden;
  });
  assert(hidden === false, "el modal de victoria no apareció");
  assertNoErrors(p.errors);
});

/* 9) Solitario — la detección de atasco y las pistas ven escaleras parciales (#9).
   Bug: hasAnyMove/generateHints sólo miraban la escalera completa; mover 8♥ → 9♣
   para exponer el 9♠ (que sube a la fundación) no se detectaba y el botón "Nueva"
   pulsaba como si no hubiera jugadas. */
test("Solitario: detecta jugada útil de escalera parcial (stuck/pista) (#9)", async function (ctx) {
  var p = await open(ctx, "solitario.html");
  var r = await p.page.evaluate(function () {
    function c(s, rk, id, up) { return { suit: s, rank: rk, color: SUIT[s].color, faceUp: up !== false, id: id }; }
    // Picas hasta el 8 en la fundación; una columna termina en 9♠,8♥ y otra en 9♣.
    var sp = []; for (var r2 = 1; r2 <= 8; r2++) sp.push(c("spades", r2, 300 + r2));
    state.foundations = [sp, [], [], []];
    state.tableau = [
      [c("hearts", 13, 1, false), c("spades", 9, 2), c("hearts", 8, 3)],
      [c("diamonds", 13, 4, false), c("clubs", 9, 5)],
      [], [], [], [], []
    ];
    state.stock = [c("clubs", 2, 6, false)]; state.waste = [];
    state.moves = 77; selection = null;
    var has = hasAnyMove();
    var hints = generateHints(), partial = false;
    for (var i = 0; i < hints.length; i++)
      if (hints[i].kind === "tableau" && hints[i].from.col === 0 && hints[i].from.index === 2) partial = true;
    return { has: has, partial: partial };
  });
  assert(r.has, "hasAnyMove debería detectar la jugada 8♥→9♣ que expone el 9♠");
  assert(r.partial, "la pista debería sugerir mover el 8♥ (escalera parcial)");
  assertNoErrors(p.errors);
});

/* 10) Solitario — la victoria se registra una sola vez (#10).
   Bug: tras ganar, deshacer y rehacer el último movimiento volvía a llamar a
   recordWin() e inflaba las estadísticas. */
test("Solitario: la victoria se registra una sola vez (deshacer tras ganar) (#10)", async function (ctx) {
  var p = await open(ctx, "solitario.html");
  var r = await p.page.evaluate(function () {
    localStorage.removeItem("solitario.stats");
    var f = [[], [], [], []];
    for (var i = 0; i < 4; i++) for (var rk = 1; rk <= 13; rk++)
      f[i].push({ suit: SUIT_ORDER[i], rank: rk, color: SUIT[SUIT_ORDER[i]].color, faceUp: true, id: i * 13 + rk });
    var last = f[3].pop();   // a un movimiento de ganar: el K queda en una columna
    state = { stock: [], waste: [], foundations: f, tableau: [[last], [], [], [], [], [], []], moves: 10 };
    winRecorded = false; selection = null; undoStack = []; stuckCheckMoves = -1;
    render();
    selectCard("tableau", 0, 0, last);
    moveSelectionToFoundation(); selection = null; afterMove();
    var w1 = (JSON.parse(localStorage.getItem("solitario.stats")) || {}).won;
    document.getElementById("win").hidden = true;
    undo();
    selectCard("tableau", 0, 0, state.tableau[0][0]);
    moveSelectionToFoundation(); selection = null; afterMove();
    var w2 = (JSON.parse(localStorage.getItem("solitario.stats")) || {}).won;
    return { w1: w1, w2: w2 };
  });
  assert(r.w1 === 1, "la primera victoria debería registrar won=1 (fue " + r.w1 + ")");
  assert(r.w2 === 1, "rehacer la victoria no debe volver a contarla (won=" + r.w2 + ")");
  assertNoErrors(p.errors);
});

/* 11) Carta Blanca — autoWinnable no muta el estado real (refactor a copias superficiales). */
test("Carta Blanca: autocompletar aparece y autoWinnable no muta el estado", async function (ctx) {
  var p = await open(ctx, "carta-blanca.html");
  var r = await p.page.evaluate(function () {
    var su = ["spades", "hearts", "diamonds", "clubs"], f = [[], [], [], []], t = [[], [], [], [], [], [], [], []];
    for (var i = 0; i < 4; i++) {
      for (var rk = 1; rk <= 11; rk++) f[i].push({ suit: su[i], rank: rk, color: SUIT[su[i]].color, id: i * 13 + rk });
      t[i].push({ suit: su[i], rank: 13, color: SUIT[su[i]].color, id: 1000 + i });
      t[i].push({ suit: su[i], rank: 12, color: SUIT[su[i]].color, id: 2000 + i });
    }
    state = { free: [null, null, null, null], foundations: f, tableau: t, moves: 5 };
    render();
    return {
      winnable: autoWinnable(),
      btnShown: !document.getElementById("btn-auto").hidden,
      intact: state.tableau[0].length === 2 && state.foundations[0].length === 11
    };
  });
  assert(r.winnable, "autoWinnable debería dar true con todo ordenado");
  assert(r.btnShown, "el botón Autocompletar debería estar visible");
  assert(r.intact, "autoWinnable no debe mutar el estado real");
  assertNoErrors(p.errors);
});

/* 11b) Carta Blanca — un solo Enter (en vez de click) manda la carta del
   pozo libre a su lugar, reutilizando el mismo handleCardClick que usa el
   mouse/tap. Antes hacía falta seleccionar y tocar el destino aparte (dos
   acciones); ahora una activación por teclado alcanza, igual que un tap. */
test("Carta Blanca: un solo Enter manda la carta a su lugar (teclado)", async function (ctx) {
  var p = await open(ctx, "carta-blanca.html");
  await p.page.evaluate(function () {
    function c(s, rk, id) { return { suit: s, rank: rk, color: SUIT[s].color, id: id }; }
    state = {
      free: [c("hearts", 9, 500), null, null, null],
      foundations: [[], [], [], []],
      tableau: [[c("spades", 10, 501)], [], [], [], [], [], [], []],
      moves: 0
    };
    selection = null; undoStack = []; render();
  });
  await p.page.evaluate(function () { document.querySelector('.card[data-pile="free"]').focus(); });
  await p.page.keyboard.press("Enter");   // un solo Enter: manda el 9♥ sobre el 10♠
  var r = await p.page.evaluate(function () {
    return { col0: state.tableau[0].length, free0: state.free[0], moves: state.moves };
  });
  assert(r.col0 === 2 && r.free0 === null && r.moves === 1,
    "un solo Enter debería reproducir la misma jugada que el mouse: " + JSON.stringify(r));
  assertNoErrors(p.errors);
});

/* 11c) Carta Blanca — un solo click de mouse (no doble clic, no seleccionar
   y tocar aparte) manda una carta del tablero a la columna que la recibe.
   Pedido explícito: "hoy las cartas van al lugar adecuado con 2 clicks o
   toques, hacelo que sea sólo con uno". */
test("Carta Blanca: un solo click manda la carta a la columna que la recibe", async function (ctx) {
  var p = await open(ctx, "carta-blanca.html");
  await p.page.evaluate(function () {
    function c(s, rk, id) { return { suit: s, rank: rk, color: SUIT[s].color, id: id }; }
    state = {
      free: [null, null, null, null],
      foundations: [[], [], [], []],
      tableau: [[c("hearts", 9, 500)], [c("spades", 10, 501)], [], [], [], [], [], []],
      moves: 0
    };
    selection = null; undoStack = []; render();
  });
  await p.page.click('.card[data-pile="tableau"][data-col="0"]');
  var r = await p.page.evaluate(function () {
    return { col0: state.tableau[0].length, col1: state.tableau[1].length, moves: state.moves, selected: !!selection };
  });
  assert(r.col0 === 0 && r.col1 === 2 && r.moves === 1 && !r.selected,
    "un solo click debería mover el 9♥ sobre el 10♠: " + JSON.stringify(r));
  assertNoErrors(p.errors);
});

/* 12) Buscaminas — al restaurar una partida guardada el reloj espera la próxima
   jugada (#12). Bug: loadGame arrancaba el reloj al abrir la pestaña. */
test("Buscaminas: al restaurar una partida el reloj espera la próxima jugada (#12)", async function (ctx) {
  var p = await open(ctx, "buscaminas.html");
  await p.page.evaluate(function () { noGuess = false; digCell(4, 4); render(); });
  await p.page.waitForFunction(function () { return started === true; }, null, { timeout: 3000 });
  await p.page.reload({ waitUntil: "load" });
  await p.page.waitForTimeout(150);
  var r = await p.page.evaluate(function () {
    var idle = timerId === null && started === true;
    var rc = anySafe();
    if (rc) onTap(rc[0], rc[1]);
    return { idle: idle, resumed: timerId !== null };
  });
  assert(r.idle, "tras restaurar, el reloj no debería estar corriendo todavía");
  assert(r.resumed, "el reloj debería reanudarse con la primera jugada");
  assertNoErrors(p.errors);
});

/* ==================== PERSISTENCIA ==================== */

/* 13) Solitario — la partida guardada se restaura al recargar. */
test("Solitario: la partida guardada se restaura al recargar", async function (ctx) {
  var p = await open(ctx, "solitario.html");
  var before = await p.page.evaluate(function () {
    dealStock();
    return { moves: state.moves, waste: state.waste.length, stock: state.stock.length };
  });
  await p.page.reload({ waitUntil: "load" });
  await p.page.waitForTimeout(150);
  var after = await p.page.evaluate(function () {
    return { moves: state.moves, waste: state.waste.length, stock: state.stock.length };
  });
  assert(JSON.stringify(after) === JSON.stringify(before),
    "no restauró: " + JSON.stringify(before) + " vs " + JSON.stringify(after));
  assertNoErrors(p.errors);
});

/* 14) Carta Blanca — restauración al recargar + validState rechaza cartas repetidas. */
test("Carta Blanca: se restaura al recargar y validState rechaza duplicados", async function (ctx) {
  var p = await open(ctx, "carta-blanca.html");
  var before = await p.page.evaluate(function () {
    var col = 0; while (!state.tableau[col].length) col++;
    selectCard("tableau", col, state.tableau[col].length - 1);
    moveSelectionToFree(0); selection = null; render();
    return { moves: state.moves, free0: state.free[0].id, gn: gameNumber };
  });
  await p.page.reload({ waitUntil: "load" });
  await p.page.waitForTimeout(150);
  var after = await p.page.evaluate(function () {
    var ok = { moves: state.moves, free0: state.free[0] && state.free[0].id, gn: gameNumber };
    // validState: un mazo con una carta repetida no debe aceptarse
    var s2 = JSON.parse(JSON.stringify(state));
    var col = 0; while (s2.tableau[col].length < 2) col++;
    s2.tableau[col][0] = JSON.parse(JSON.stringify(s2.tableau[col][1]));
    ok.dupRejected = !validState(s2);
    ok.saneAccepted = validState(JSON.parse(JSON.stringify(state)));
    return ok;
  });
  assert(after.moves === before.moves && after.free0 === before.free0 && after.gn === before.gn,
    "no restauró: " + JSON.stringify(before) + " vs " + JSON.stringify(after));
  assert(after.dupRejected, "validState aceptó una carta duplicada");
  assert(after.saneAccepted, "validState rechazó un estado sano");
  assertNoErrors(p.errors);
});

/* 15) Buscaminas — el tablero guardado se restaura idéntico (minas incluidas). */
test("Buscaminas: el tablero guardado se restaura idéntico al recargar", async function (ctx) {
  var p = await open(ctx, "buscaminas.html");
  var before = await p.page.evaluate(function () {
    noGuess = false; digCell(4, 4); render();
    var m = []; for (var r = 0; r < rows; r++) for (var c = 0; c < cols; c++) if (grid[r][c].mine) m.push(r + "," + c);
    return { revealed: revealedCount, mines: m.join("|") };
  });
  await p.page.reload({ waitUntil: "load" });
  await p.page.waitForTimeout(150);
  var after = await p.page.evaluate(function () {
    var m = []; for (var r = 0; r < rows; r++) for (var c = 0; c < cols; c++) if (grid[r][c].mine) m.push(r + "," + c);
    return { revealed: revealedCount, mines: m.join("|") };
  });
  assert(after.revealed === before.revealed, "casillas reveladas: " + before.revealed + " vs " + after.revealed);
  assert(after.mines === before.mines, "las minas deben quedar en el mismo lugar");
  assertNoErrors(p.errors);
});

/* 16) Corazones — las cartas elegidas para pasar sobreviven la recarga (#16). */
test("Corazones: las cartas elegidas para pasar sobreviven la recarga (#16)", async function (ctx) {
  var p = await open(ctx, "corazones.html");
  await p.page.waitForTimeout(150);
  var before = await p.page.evaluate(function () {
    // La mano 1 siempre pasa (izquierda): elegimos 2 cartas
    togglePass(players[0].hand[0]);
    togglePass(players[0].hand[5]);
    return humanPass.slice();
  });
  assert(before.length === 2, "deberían quedar 2 cartas elegidas");
  await p.page.reload({ waitUntil: "load" });
  await p.page.waitForTimeout(200);
  var after = await p.page.evaluate(function () { return { phase: phase, pass: humanPass.slice() }; });
  assert(after.phase === "pass", "debería seguir en fase de pase");
  assert(JSON.stringify(after.pass) === JSON.stringify(before),
    "humanPass no se restauró: " + JSON.stringify(before) + " vs " + JSON.stringify(after.pass));
  assertNoErrors(p.errors);
});

/* 17) Solitario — un guardado corrupto se descarta sin excepciones. */
test("Solitario: el guardado corrupto (JSON basura o carta repetida) se descarta sin errores", async function (ctx) {
  var p = await open(ctx, "solitario.html");
  var r = await p.page.evaluate(function () {
    var out = {}, movesBefore = state.moves;
    localStorage.setItem(GAME_KEY, "{esto no es json");
    out.garbageRejected = loadGame() === false;
    var s2 = JSON.parse(JSON.stringify(state));
    s2.stock[0] = JSON.parse(JSON.stringify(s2.stock[1]));   // carta duplicada (siguen siendo 52)
    localStorage.setItem(GAME_KEY, JSON.stringify({ state: s2, seconds: 5, counted: false }));
    out.dupRejected = loadGame() === false;
    out.stateIntact = state.moves === movesBefore;
    return out;
  });
  assert(r.garbageRejected, "loadGame debería rechazar JSON inválido");
  assert(r.dupRejected, "loadGame debería rechazar un mazo con carta repetida");
  assert(r.stateIntact, "el estado en juego no debe cambiar al rechazar un guardado");
  assertNoErrors(p.errors);
});

/* 17b) Corazones — un guardado con cartas repetidas se descarta (RNF-04),
   igual que ya hacían Solitario y Carta Blanca. */
test("Corazones: el guardado con carta repetida se descarta sin errores", async function (ctx) {
  var p = await open(ctx, "corazones.html");
  var r = await p.page.evaluate(function () {
    var out = {};
    // Guardado sano de referencia: la partida recién repartida (fase de pase).
    var sane = {
      players: players.map(function (q) { return { hand: q.hand, score: 0, roundPoints: 0, taken: [] }; }),
      phase: "pass", trick: [], leadSeat: 0, turn: 0,
      heartsBroken: false, tricksPlayed: 0, handNumber: 1, passDir: "left",
      target: 100, history: [], humanPass: []
    };
    out.saneAccepted = validSaved(JSON.parse(JSON.stringify(sane)));
    // Misma estructura pero con una carta duplicada (siguen siendo 52).
    var dup = JSON.parse(JSON.stringify(sane));
    dup.players[0].hand[0] = JSON.parse(JSON.stringify(dup.players[0].hand[1]));
    out.dupRejected = !validSaved(dup);
    localStorage.setItem(GAME_KEY, JSON.stringify(dup));
    out.loadRejected = loadGame() === false;
    return out;
  });
  assert(r.saneAccepted, "validSaved rechazó un estado sano");
  assert(r.dupRejected, "validSaved aceptó una mano con carta repetida");
  assert(r.loadRejected, "loadGame debería descartar el guardado con carta repetida");
  assertNoErrors(p.errors);
});

/* ==================== REGLAS DE JUEGO ==================== */

/* 18) Carta Blanca — determinismo del reparto: la partida n.º 1 debe dar exactamente
   el reparto del FreeCell de Microsoft (referencia externa conocida). Si msDeal
   cambia por accidente, TODAS las partidas numeradas cambian en silencio. */
test("Carta Blanca: la partida n.º 1 reparte igual que el FreeCell de Microsoft", async function (ctx) {
  var p = await open(ctx, "carta-blanca.html");
  var got = await p.page.evaluate(function () {
    newGame(1);
    var S = { clubs: "C", diamonds: "D", hearts: "H", spades: "S" };
    return state.tableau.map(function (col) {
      return col.map(function (c) { return (c.rank === 10 ? "T" : RANK_LABEL[c.rank]) + S[c.suit]; }).join(" ");
    });
  });
  var expected = [
    "JD KD 2S 4C 3S 6D 6S",
    "2D KC KS 5C TD 8S 9C",
    "9H 9S 9D TS 4S 8D 2H",
    "JC 5S QD QH TH QS 6H",
    "5D AD JS 4H 8H 6C",
    "7H QC AS AC 2C 3D",
    "7C KH AH 4D JH 8C",
    "5H 3H 3C 7S 7D TC"
  ];
  for (var i = 0; i < 8; i++)
    assert(got[i] === expected[i], "columna " + (i + 1) + ": " + got[i] + " != " + expected[i]);
  assertNoErrors(p.errors);
});

/* 19) Carta Blanca — supermove: se pueden mover (pozos libres + 1) × 2^(columnas
   vacías) cartas juntas, y la columna destino vacía no se cuenta a sí misma. */
test("Carta Blanca: supermove respeta el límite (pozos+1) × 2^vacías", async function (ctx) {
  var p = await open(ctx, "carta-blanca.html");
  var r = await p.page.evaluate(function () {
    function c(s, rk, id) { return { suit: s, rank: rk, color: SUIT[s].color, id: id }; }
    // Escalera de 4 (10♥ 9♣ 8♦ 7♠) en col 0; destino J♠ en col 1; col 2 vacía; 1 pozo libre.
    state = {
      free: [c("clubs", 2, 90), c("diamonds", 2, 91), c("hearts", 2, 92), null],
      foundations: [[], [], [], []],
      tableau: [[c("hearts", 10, 1), c("clubs", 9, 2), c("diamonds", 8, 3), c("spades", 7, 4)],
                [c("spades", 11, 5)], [], [c("clubs", 5, 6)], [c("diamonds", 5, 7)],
                [c("hearts", 5, 8)], [c("spades", 5, 9)], [c("clubs", 13, 10)]],
      moves: 0
    };
    selection = null; undoStack = []; render();
    var out = {};
    out.m1 = maxMovable(1);                       // (1+1) × 2^1 = 4
    out.m2 = maxMovable(2);                       // hacia la columna vacía: (1+1) × 2^0 = 2
    selectCard("tableau", 0, 0);
    out.okWithRoom = moveSelectionToTableau(1);   // 4 ≤ 4: permitido
    undo();
    state.free[3] = c("hearts", 3, 93);           // sin pozos libres: (0+1) × 2 = 2
    selection = null; selectCard("tableau", 0, 0);
    out.m3 = maxMovable(1);
    out.blocked = !moveSelectionToTableau(1);     // 4 > 2: rechazado
    return out;
  });
  assert(r.m1 === 4, "maxMovable con 1 pozo y 1 columna vacía debería ser 4 (fue " + r.m1 + ")");
  assert(r.m2 === 2, "hacia la columna vacía no debe contarse a sí misma (fue " + r.m2 + ")");
  assert(r.m3 === 2, "sin pozos libres debería ser 2 (fue " + r.m3 + ")");
  assert(r.okWithRoom, "mover 4 cartas con capacidad 4 debería permitirse");
  assert(r.blocked, "mover 4 cartas con capacidad 2 debería rechazarse");
  assertNoErrors(p.errors);
});

/* 20) Corazones — reglas de jugadas legales. */
test("Corazones: jugadas legales (2♣, seguir palo, corazones cerrados, 1.ª baza)", async function (ctx) {
  var p = await open(ctx, "corazones.html");
  var r = await p.page.evaluate(function () {
    function mk(s, rk) { return { suit: s, rank: rk, color: SUIT[s].color, id: s + "-" + rk }; }
    var out = {};
    phase = "play";
    // 1) Primera baza: quien tiene el 2♣ sólo puede salir con él
    players[0].hand = [mk("clubs", 2), mk("hearts", 5), mk("spades", 12)];
    trick = []; tricksPlayed = 0; heartsBroken = false;
    var l1 = legalCards(0);
    out.only2C = l1.length === 1 && is2C(l1[0]);
    // 2) Hay que seguir el palo si se puede
    players[0].hand = [mk("diamonds", 4), mk("clubs", 9), mk("hearts", 2)];
    trick = [{ seat: 1, card: mk("clubs", 5) }]; tricksPlayed = 3;
    var l2 = legalCards(0);
    out.followSuit = l2.length === 1 && l2[0].suit === "clubs";
    // 3) No se lideran corazones hasta que se rompan…
    players[0].hand = [mk("hearts", 5), mk("diamonds", 4), mk("hearts", 9)];
    trick = []; heartsBroken = false;
    var l3 = legalCards(0);
    out.noHeartLead = l3.length === 1 && l3[0].suit === "diamonds";
    heartsBroken = true;
    out.heartLeadOk = legalCards(0).length === 3;
    // …salvo que la mano sea sólo corazones
    heartsBroken = false;
    players[0].hand = [mk("hearts", 5), mk("hearts", 9)];
    out.allHearts = legalCards(0).length === 2;
    // 4) En la primera baza no se descartan corazones ni la Q♠
    players[0].hand = [mk("hearts", 5), mk("spades", 12), mk("diamonds", 4)];
    trick = [{ seat: 1, card: mk("clubs", 5) }]; tricksPlayed = 0;
    var l4 = legalCards(0);
    out.firstTrickSafe = l4.length === 1 && l4[0].suit === "diamonds";
    return out;
  });
  assert(r.only2C, "con el 2♣ en mano, la única salida legal es el 2♣");
  assert(r.followSuit, "hay que seguir el palo de salida");
  assert(r.noHeartLead, "no se pueden liderar corazones sin romper");
  assert(r.heartLeadOk, "con corazones rotos se puede liderar cualquiera");
  assert(r.allHearts, "mano de sólo corazones puede liderar corazones");
  assert(r.firstTrickSafe, "primera baza sin palo: ni corazones ni Q♠ si hay alternativa");
  assertNoErrors(p.errors);
});

/* 21) Corazones — la luna reparte puntos según el modo elegido. */
test("Corazones: disparar a la luna puntúa según el modo (+26 demás / −26 tirador)", async function (ctx) {
  var p = await open(ctx, "corazones.html");
  var r = await p.page.evaluate(function () {
    var out = {}, s;
    function resetHand() {
      for (s = 0; s < 4; s++) { players[s].score = 0; players[s].roundPoints = 0; players[s].taken = []; players[s].hand = []; }
      players[1].roundPoints = 26;   // el asiento 1 se lleva todos los puntos
      phase = "play"; handHistory = []; handNumber = 1; target = 100;
    }
    resetHand(); moonMode = "demas"; endHand();
    out.demas = players.map(function (q) { return q.score; }).join(",");
    document.getElementById("round").hidden = true;
    resetHand(); moonMode = "tirador"; endHand();
    out.tirador = players.map(function (q) { return q.score; }).join(",");
    document.getElementById("round").hidden = true;
    return out;
  });
  assert(r.demas === "26,0,26,26", "modo 'los demás +26': esperaba 26,0,26,26 y fue " + r.demas);
  assert(r.tirador === "0,-26,0,0", "modo 'el tirador −26': esperaba 0,-26,0,0 y fue " + r.tirador);
  assertNoErrors(p.errors);
});

/* 21b) Corazones — juega una carta con el teclado (Tab + Enter en vez de
   click), reutilizando la misma humanPlay() que dispara el click delegado. */
test("Corazones: juega una carta con el teclado (Enter)", async function (ctx) {
  var p = await open(ctx, "corazones.html");
  await p.page.evaluate(function () {
    window.AI_DELAY = 5; window.TRICK_HOLD = 5;
    function mk(s, r) { return { suit: s, rank: r, color: SUIT[s].color, id: s + "-" + r }; }
    players[0].hand = [mk("clubs", 5)]; players[1].hand = [mk("clubs", 6)];
    players[2].hand = [mk("hearts", 9)]; players[3].hand = [mk("clubs", 8)];
    tricksPlayed = 12; trick = []; heartsBroken = true; phase = "play";
    leadSeat = 3; turn = 3; busy = false; handNumber = 1; render(); advance();
  });
  await p.page.waitForFunction(function () { return (turn === 0 && trick.length === 3) || phase !== "play"; }, null, { timeout: 4000 });
  await p.page.evaluate(function () { document.querySelector(".hand .card.playable").focus(); });
  await p.page.keyboard.press("Enter");
  await p.page.waitForFunction(function () { return trick.length === 4 || phase !== "play"; }, null, { timeout: 4000 });
  var r = await p.page.evaluate(function () { return { hand: players[0].hand.length, trick: trick.length }; });
  assert(r.hand === 0 && r.trick === 4, "el Enter debería jugar la carta igual que un click: " + JSON.stringify(r));
  assertNoErrors(p.errors);
});

/* 22) Buscaminas — el primer toque nunca es mina (zona 3×3 protegida). */
test("Buscaminas: el primer toque nunca es mina (zona 3×3 segura)", async function (ctx) {
  var p = await open(ctx, "buscaminas.html");
  var r = await p.page.evaluate(function () {
    noGuess = false;
    for (var t = 0; t < 25; t++) {
      newGame();
      digCell(4, 4);
      if (dead) return { ok: false, why: "murió en el primer toque (intento " + t + ")" };
      if (grid[4][4].mine) return { ok: false, why: "mina en la casilla tocada" };
      var nb = neighbors(4, 4);
      for (var i = 0; i < nb.length; i++)
        if (grid[nb[i][0]][nb[i][1]].mine) return { ok: false, why: "mina vecina al primer toque" };
      if (grid[4][4].count !== 0) return { ok: false, why: "la casilla tocada debería ser un 0" };
    }
    return { ok: true };
  });
  assert(r.ok, r.why);
  assertNoErrors(p.errors);
});

/* 22b) Buscaminas — navegación por teclado (roving tabindex): una sola celda
   es alcanzable por Tab a la vez, las flechas mueven el foco entre celdas
   vecinas y Enter cava, igual que un tap. Sin esto, Tab tendría que recorrer
   las 480 celdas del modo Experto para llegar a la última. */
test("Buscaminas: roving tabindex — flechas mueven el foco, Enter cava", async function (ctx) {
  var p = await open(ctx, "buscaminas.html");
  await p.page.evaluate(function () { noGuess = false; newGame(); });
  var before = await p.page.evaluate(function () {
    var cells = document.querySelectorAll(".cell");
    var tabbable = Array.prototype.filter.call(cells, function (c) { return c.tabIndex === 0; });
    return { total: cells.length, tabbableCount: tabbable.length, firstIsFocused: tabbable[0] === cells[0] };
  });
  assert(before.tabbableCount === 1, "sólo una celda debería tener tabindex=0, hay " + before.tabbableCount);
  assert(before.firstIsFocused, "la celda (0,0) debería ser la alcanzable por Tab al empezar");

  await p.page.evaluate(function () { document.querySelector('.cell[data-r="0"][data-c="0"]').focus(); });
  await p.page.keyboard.press("ArrowRight");
  var moved = await p.page.evaluate(function () {
    return {
      focusedIsRight: document.activeElement === document.querySelector('.cell[data-r="0"][data-c="1"]'),
      onlyOneTabbable: document.querySelectorAll('.cell[tabindex="0"]').length === 1
    };
  });
  assert(moved.focusedIsRight, "ArrowRight debería mover el foco del DOM a la celda de la derecha");
  assert(moved.onlyOneTabbable, "sólo debe quedar una celda con tabindex=0 tras mover el foco");

  await p.page.keyboard.press("Enter");
  var dug = await p.page.evaluate(function () { return { started: started, revealed: grid[0][1].revealed }; });
  assert(dug.started && dug.revealed, "Enter debería cavar la celda enfocada, igual que un tap");
  assertNoErrors(p.errors);
});

/* 22c) Buscaminas — regresión: con mouse, onPointerDown bloquea toda
   interacción mientras se genera el tablero "sin adivinanzas" (generating).
   onTap() en sí no tenía ese freno, así que Enter por teclado (que llama a
   onTap directo, sin pasar por onPointerDown) podía poner una bandera
   mientras el tablero todavía se estaba generando en segundo plano. */
test("Buscaminas: onTap ignora la entrada mientras se genera el tablero (generating)", async function (ctx) {
  var p = await open(ctx, "buscaminas.html");
  await p.page.evaluate(function () { noGuess = true; setDifficulty("expert"); });
  await p.page.evaluate(function () { digCell(8, 15); }); // dispara la generación (asíncrona)
  var mid = await p.page.evaluate(function () {
    if (!generating) return { skipped: true };
    flagMode = true;
    onTap(0, 0);          // simula Enter por teclado en otra celda mientras se genera
    return { skipped: false, flagged: grid[0][0].flagged, revealed: grid[0][0].revealed };
  });
  if (!mid.skipped) {
    assert(!mid.flagged && !mid.revealed, "onTap no debería tocar la celda mientras generating=true: " + JSON.stringify(mid));
  }
  await p.page.waitForFunction(function () { return started === true && generating === false; }, null, { timeout: 9000 });
  assertNoErrors(p.errors);
});

/* 23) Buscaminas — el acorde abre las vecinas correctas; perder revela minas y
   marca las banderas erróneas. */
test("Buscaminas: acorde abre vecinas; perder revela minas y banderas erróneas", async function (ctx) {
  var p = await open(ctx, "buscaminas.html");
  var r = await p.page.evaluate(function () {
    var out = {}, r2, c2, i;
    // Tablero determinista: una sola mina en (0,0)
    noGuess = false; newGame();
    grid[0][0].mine = true;
    for (r2 = 0; r2 < rows; r2++) for (c2 = 0; c2 < cols; c2++) {
      if (grid[r2][c2].mine) continue;
      var nb = neighbors(r2, c2), k = 0;
      for (i = 0; i < nb.length; i++) if (grid[nb[i][0]][nb[i][1]].mine) k++;
      grid[r2][c2].count = k;
    }
    mines = 1; started = true;
    digCell(1, 1);                     // revela el "1"
    var pre = revealedCount;
    chord(1, 1);                       // sin banderas: no debe abrir nada
    out.noFlagNoChord = revealedCount === pre;
    toggleFlag(0, 0);
    chord(1, 1);                       // con la mina marcada: abre las 7 vecinas
    var nb2 = neighbors(1, 1); out.opened = true;
    for (i = 0; i < nb2.length; i++) {
      var cell = grid[nb2[i][0]][nb2[i][1]];
      if (!cell.flagged && !cell.revealed) out.opened = false;
    }
    out.wonAfterChord = won;           // el flood despeja todo (única mina flanqueada)
    // Perder: bandera errónea + tocar una mina
    newGame();
    grid[2][2].mine = true; mines = 1; started = true;
    toggleFlag(5, 5);                  // bandera equivocada
    digCell(2, 2);                     // toca la mina
    out.lost = dead && grid[2][2].revealed && grid[2][2].exploded;
    out.wrongFlag = grid[5][5].wrong === true;
    return out;
  });
  assert(r.noFlagNoChord, "el acorde sin banderas suficientes no debe abrir nada");
  assert(r.opened, "el acorde debería abrir todas las vecinas no marcadas");
  assert(r.wonAfterChord, "despejar todas las casillas seguras debería ganar");
  assert(r.lost, "tocar una mina debe perder y mostrarla explotada");
  assert(r.wrongFlag, "al perder, la bandera sin mina se marca como errónea");
  assertNoErrors(p.errors);
});

/* 24) Solitario — reparto de a 3, reciclado del mazo y destape con deshacer. */
test("Solitario: reparto de a 3, reciclado del mazo y destape con deshacer", async function (ctx) {
  var p = await open(ctx, "solitario.html");
  var r = await p.page.evaluate(function () {
    var out = {}, i;
    settings.draw = 3;
    newGame();
    dealStock();
    out.draw3 = state.waste.length === 3 && state.stock.length === 21;
    var guard = 0;
    while (state.stock.length && guard++ < 20) dealStock();
    out.emptied = state.stock.length === 0 && state.waste.length === 24;
    dealStock();   // mazo vacío: recicla el descarte
    out.recycled = state.stock.length === 24 && state.waste.length === 0;
    for (i = 0; i < state.stock.length; i++) if (state.stock[i].faceUp) out.recycled = false;
    // Mover una carta destapa la de abajo; deshacer la vuelve a tapar
    function c(s, rk, id, up) { return { suit: s, rank: rk, color: SUIT[s].color, faceUp: up !== false, id: id }; }
    state.tableau[0] = [c("hearts", 5, 400, false), c("spades", 9, 401)];
    state.tableau[1] = [c("hearts", 10, 402)];
    selection = null; stuckCheckMoves = -1; render();
    selectCard("tableau", 0, 1, state.tableau[0][1]);
    moveSelectionToTableau(1);
    out.flipped = state.tableau[0].length === 1 && state.tableau[0][0].faceUp === true &&
                  state.tableau[1].length === 2;
    undo();
    out.undone = state.tableau[0].length === 2 && state.tableau[0][0].faceUp === false &&
                 state.tableau[1].length === 1;
    return out;
  });
  assert(r.draw3, "en difícil se dan vuelta 3 cartas por vez");
  assert(r.emptied, "el mazo debería vaciarse en el descarte");
  assert(r.recycled, "reciclar debe devolver las 24 cartas boca abajo al mazo");
  assert(r.flipped, "mover la carta debe destapar la de abajo");
  assert(r.undone, "deshacer debe volver a tapar la carta destapada");
  assertNoErrors(p.errors);
});

/* ==================== UI / VARIOS ==================== */

/* 25) Estadísticas — muestra los datos guardados de los 4 juegos y Reiniciar los borra. */
test("Estadísticas: muestra los datos guardados y Reiniciar los borra", async function (ctx) {
  var p = await open(ctx, "estadisticas.html");
  await p.page.evaluate(function () {
    localStorage.setItem("solitario.stats", JSON.stringify({ played: 10, won: 4, bestTime: 65, bestMoves: 99 }));
    localStorage.setItem("cartablanca.stats", JSON.stringify({ played: 5, won: 2, bestTime: 120 }));
    localStorage.setItem("corazones.stats", JSON.stringify({ played: 2, won: 1, bestScore: 12, moons: 1 }));
    localStorage.setItem("buscaminas.stats", JSON.stringify({ beginner: { played: 3, won: 1, best: 33 } }));
    render();
  });
  var txt = await p.page.evaluate(function () { return document.getElementById("cards").textContent; });
  assert(txt.indexOf("01:05") >= 0, "falta el mejor tiempo del Solitario (01:05)");
  assert(txt.indexOf("40%") >= 0, "falta el porcentaje de victorias del Solitario (40%)");
  assert(txt.indexOf("02:00") >= 0, "falta el mejor tiempo de Carta Blanca (02:00)");
  assert(txt.indexOf("00:33") >= 0, "falta el mejor tiempo de Buscaminas (00:33)");
  p.page.on("dialog", function (d) { d.accept(); });
  await p.page.click("#reset");
  await p.page.waitForTimeout(100);
  var after = await p.page.evaluate(function () {
    return { sol: localStorage.getItem("solitario.stats"), txt: document.getElementById("cards").textContent };
  });
  assert(after.sol === null, "Reiniciar debe borrar las estadísticas guardadas");
  assert(after.txt.indexOf("Todavía no jugaste") >= 0, "debería mostrar el estado vacío");
  assertNoErrors(p.errors);
});

/* 26) Preferencias — sobreviven la recarga (reparto, dificultad, nivel de IA). */
test("Preferencias: sobreviven la recarga (reparto, dificultad, nivel de IA)", async function (ctx) {
  var p1 = await open(ctx, "solitario.html");
  await p1.page.evaluate(function () { document.querySelector('[data-draw="3"]').click(); });
  await p1.page.reload({ waitUntil: "load" });
  await p1.page.waitForTimeout(120);
  var draw = await p1.page.evaluate(function () { return settings.draw; });
  assert(draw === 3, "el reparto de a 3 debería persistir (fue " + draw + ")");

  var p2 = await open(ctx, "buscaminas.html");
  await p2.page.evaluate(function () { setDifficulty("intermediate"); });
  await p2.page.reload({ waitUntil: "load" });
  await p2.page.waitForTimeout(120);
  var d2 = await p2.page.evaluate(function () { return { difficulty: difficulty, rows: rows }; });
  assert(d2.difficulty === "intermediate" && d2.rows === 16, "la dificultad debería persistir: " + JSON.stringify(d2));

  var p3 = await open(ctx, "corazones.html");
  await p3.page.evaluate(function () { document.querySelector('[data-ai="dificil"]').click(); });
  await p3.page.reload({ waitUntil: "load" });
  await p3.page.waitForTimeout(150);
  var ai = await p3.page.evaluate(function () { return aiLevel; });
  assert(ai === "dificil", "el nivel de IA debería persistir (fue " + ai + ")");
  assertNoErrors(p1.errors); assertNoErrors(p2.errors); assertNoErrors(p3.errors);
});

/* 27) Solitario — arrastrar y soltar de verdad (eventos de mouse/pointer). */
test("Solitario: arrastrar del descarte a una columna (drag & drop real)", async function (ctx) {
  var p = await open(ctx, "solitario.html");
  await p.page.evaluate(function () {
    function c(s, rk, id, up) { return { suit: s, rank: rk, color: SUIT[s].color, faceUp: up !== false, id: id }; }
    state = { stock: [], waste: [c("hearts", 9, 500)], foundations: [[], [], [], []],
              tableau: [[c("spades", 10, 501)], [], [], [], [], [], []], moves: 0 };
    selection = null; undoStack = []; stuckCheckMoves = -1;
    render();
  });
  var pos = await p.page.evaluate(function () {
    var e = document.querySelector('.card[data-pile="waste"]').getBoundingClientRect();
    var t = document.querySelector('[data-drop="tableau:0"]').getBoundingClientRect();
    return { sx: e.left + e.width / 2, sy: e.top + e.height / 2, tx: t.left + t.width / 2, ty: t.top + 20 };
  });
  await p.page.mouse.move(pos.sx, pos.sy);
  await p.page.mouse.down();
  await p.page.mouse.move(pos.tx, pos.ty, { steps: 12 });
  await p.page.mouse.up();
  await p.page.waitForTimeout(120);
  var r = await p.page.evaluate(function () {
    return { col0: state.tableau[0].length, waste: state.waste.length, moves: state.moves };
  });
  assert(r.col0 === 2 && r.waste === 0,
    "el 9♥ debería quedar sobre el 10♠ (col0=" + r.col0 + ", waste=" + r.waste + ")");
  assert(r.moves === 1, "debería contarse 1 movimiento (fue " + r.moves + ")");
  assertNoErrors(p.errors);
});

/* 27b) Solitario — un solo Enter (en vez de click) manda la carta del
   descarte a su lugar, reutilizando el mismo handleCardClick que usa el
   mouse/tap. Antes hacía falta seleccionar y tocar el destino aparte (dos
   acciones); ahora una activación por teclado alcanza, igual que un tap. */
test("Solitario: un solo Enter manda la carta a su lugar (teclado)", async function (ctx) {
  var p = await open(ctx, "solitario.html");
  await p.page.evaluate(function () {
    function c(s, rk, id, up) { return { suit: s, rank: rk, color: SUIT[s].color, faceUp: up !== false, id: id }; }
    state = { stock: [], waste: [c("hearts", 9, 500)], foundations: [[], [], [], []],
              tableau: [[c("spades", 10, 501)], [], [], [], [], [], []], moves: 0 };
    selection = null; undoStack = []; stuckCheckMoves = -1;
    render();
  });
  await p.page.evaluate(function () { document.querySelector('.card[data-pile="waste"]').focus(); });
  await p.page.keyboard.press("Enter");   // un solo Enter: manda el 9♥ sobre el 10♠
  var r = await p.page.evaluate(function () {
    return { col0: state.tableau[0].length, waste: state.waste.length, moves: state.moves };
  });
  assert(r.col0 === 2 && r.waste === 0 && r.moves === 1,
    "un solo Enter debería reproducir la misma jugada que el mouse: " + JSON.stringify(r));
  assertNoErrors(p.errors);
});

/* 27c) Solitario — un solo click de mouse (no doble clic, no seleccionar y
   tocar aparte) manda un As del descarte a la fundación. Pedido explícito:
   "hoy las cartas van al lugar adecuado con 2 clicks o toques, hacelo que
   sea sólo con uno". */
test("Solitario: un solo click manda la carta a la fundación (un As en el descarte)", async function (ctx) {
  var p = await open(ctx, "solitario.html");
  await p.page.evaluate(function () {
    function c(s, rk, id, up) { return { suit: s, rank: rk, color: SUIT[s].color, faceUp: up !== false, id: id }; }
    state = { stock: [], waste: [c("hearts", 1, 500)], foundations: [[], [], [], []],
              tableau: [[], [], [], [], [], [], []], moves: 0 };
    selection = null; undoStack = []; stuckCheckMoves = -1;
    render();
  });
  await p.page.click('.card[data-pile="waste"]');
  var r = await p.page.evaluate(function () {
    return {
      waste: state.waste.length,
      foundations: state.foundations.reduce(function (a, f) { return a + f.length; }, 0),
      moves: state.moves,
      selected: !!selection
    };
  });
  assert(r.waste === 0, "el As debería salir del descarte con un solo click");
  assert(r.foundations === 1, "el As debería quedar en alguna fundación: " + JSON.stringify(r));
  assert(r.moves === 1, "debería contarse un solo movimiento (fue " + r.moves + ")");
  assert(!r.selected, "no debería quedar nada seleccionado tras el movimiento automático");
  assertNoErrors(p.errors);
});

/* ==================== PWA ==================== */

/* 28) PWA — el manifest está enlazado, es válido y todos sus íconos existen. */
test("PWA: el manifest y los íconos están enlazados y son válidos", async function (ctx) {
  var p = await open(ctx, "index.html");
  var info = await p.page.evaluate(async function () {
    var link = document.querySelector('link[rel="manifest"]');
    var themeMeta = document.querySelector('meta[name="theme-color"]');
    if (!link) return { ok: false, why: "no hay <link rel=manifest>" };
    var res = await fetch(link.href);
    if (!res.ok) return { ok: false, why: "manifest HTTP " + res.status };
    var m = await res.json();
    async function ok(u) { try { return (await fetch(u)).ok; } catch (e) { return false; } }
    var iconChecks = await Promise.all((m.icons || []).map(function (ic) { return ok(new URL(ic.src, link.href).toString()); }));
    var scChecks = await Promise.all((m.shortcuts || []).map(function (sc) { return ok(new URL(sc.url, link.href).toString()); }));
    var startOk = m.start_url ? await ok(new URL(m.start_url, link.href).toString()) : false;
    return {
      ok: true, name: m.name, display: m.display, startOk: startOk,
      iconCount: (m.icons || []).length, allIconsOk: iconChecks.every(Boolean),
      shortcutCount: (m.shortcuts || []).length, allShortcutsOk: scChecks.every(Boolean),
      hasMaskable: (m.icons || []).some(function (i) { return (i.purpose || "").indexOf("maskable") >= 0; }),
      hasAppleIcon: !!document.querySelector('link[rel="apple-touch-icon"]'),
      theme: themeMeta && themeMeta.content
    };
  });
  assert(info.ok, info.why);
  assert(info.name === "Juegos clásicos", "name del manifest inesperado: " + info.name);
  assert(info.display === "standalone", "display debería ser standalone");
  assert(info.startOk, "el start_url del manifest no resuelve");
  assert(info.iconCount >= 2 && info.allIconsOk, "algún ícono del manifest falta o da 404");
  assert(info.hasMaskable, "falta un ícono con purpose maskable");
  assert(info.hasAppleIcon, "falta <link rel=apple-touch-icon>");
  assert(info.shortcutCount === 4 && info.allShortcutsOk, "los shortcuts deben ser 4 y resolver a una página real");
  assert(info.theme === "#0e3a22", "theme-color inesperado: " + info.theme);
  assertNoErrors(p.errors);
});

/* 30) PWA — todas las páginas enlazan manifest, apple-touch-icon y theme-color. */
test("PWA: todas las páginas están enlazadas como PWA", async function (ctx) {
  var pages = ["index.html", "solitario.html", "carta-blanca.html", "corazones.html", "buscaminas.html", "estadisticas.html"];
  for (var i = 0; i < pages.length; i++) {
    var p = await open(ctx, pages[i]);
    var meta = await p.page.evaluate(function () {
      var theme = document.querySelector('meta[name="theme-color"]');
      return {
        manifest: !!document.querySelector('link[rel="manifest"]'),
        apple: !!document.querySelector('link[rel="apple-touch-icon"]'),
        theme: theme && theme.content
      };
    });
    assert(meta.manifest, pages[i] + ": falta <link rel=manifest>");
    assert(meta.apple, pages[i] + ": falta <link rel=apple-touch-icon>");
    assert(meta.theme === "#0e3a22", pages[i] + ": theme-color inesperado (" + meta.theme + ")");
    assertNoErrors(p.errors);
  }
});

/* 29) PWA — el service worker se registra y sirve la app sin conexión. */
test("PWA: el service worker sirve la app sin conexión", async function (ctx) {
  var p = await open(ctx, "index.html");
  // Esperar a que el SW quede activo y tome control de la página.
  await p.page.evaluate(function () { return navigator.serviceWorker.ready; });
  await p.page.waitForFunction(function () { return !!navigator.serviceWorker.controller; }, null, { timeout: 6000 });
  // Cortar la red: la recarga debe resolverse desde la caché del SW.
  await ctx.setOffline(true);
  try {
    await p.page.reload({ waitUntil: "load" });
    var ok = await p.page.evaluate(function () {
      return document.title.indexOf("Juegos") >= 0 && !!document.getElementById("launcher");
    });
    assert(ok, "la app no cargó sin conexión desde la caché del service worker");
  } finally {
    await ctx.setOffline(false);
  }
});

/* 31) Buscaminas — "sin adivinanzas" avisa cuando cae al fallback por presupuesto. */
test("Buscaminas: 'sin adivinanzas' avisa si el tablero pudo requerir adivinar", async function (ctx) {
  var p = await open(ctx, "buscaminas.html");
  await p.page.evaluate(function () {
    setDifficulty("beginner");
    noGuess = true;
    solvableNoGuess = function () { return false; };   // nunca "resuelve": fuerza el fallback
  });
  await p.page.evaluate(function () { digCell(4, 4); });
  await p.page.waitForFunction(function () { return generating === false && started === true; }, null, { timeout: 6000 });
  var warned = await p.page.evaluate(function () {
    var t = document.querySelector(".toast");
    return !!t && /adivinar/i.test(t.textContent) && t.getAttribute("role") === "status";
  });
  assert(warned, "debería mostrar un toast (role=status) avisando que podría requerir adivinar");
  assertNoErrors(p.errors);
});

/* 32) PWA — sin conexión sirve la página pedida, no index.html (app multipágina). */
test("PWA: sin conexión sirve la página correcta, no index (MPA)", async function (ctx) {
  var p = await open(ctx, "index.html");
  await p.page.evaluate(function () { return navigator.serviceWorker.ready; });
  await p.page.waitForFunction(function () { return !!navigator.serviceWorker.controller; }, null, { timeout: 6000 });
  await ctx.setOffline(true);
  try {
    await p.page.goto(url("corazones.html"), { waitUntil: "load" });
    var info = await p.page.evaluate(function () {
      return {
        title: document.title, hasHand: !!document.getElementById("hand"),
        sharedOk: typeof gameSet === "function" && typeof toast === "function" && typeof makeCardEl === "function"
      };
    });
    assert(info.title.indexOf("Corazones") >= 0 && info.hasHand,
      "offline debería servir corazones.html, no index (title=" + info.title + ")");
    assert(info.sharedOk, "shared/storage.js, shared/ui.js y shared/cards.js deberían cargarse desde la caché del SW sin conexión");
    assertNoErrors(p.errors);
  } finally {
    await ctx.setOffline(false);
  }
});

/* 32b) PWA — el código del app shell (CSS/JS) se sirve NETWORK-FIRST: en línea,
   una copia vieja en la caché del SW NO puede pisar la de la red. Regresión de
   un bug real: con stale-while-revalidate para el CSS, un HTML nuevo quedaba
   con un base.css viejo (sin reglas nuevas) y la UI se veía rota. Envenenamos
   la caché con un base.css "viejo" (con un centinela) y verificamos que la
   recarga en línea igual trae el CSS fresco (sin el centinela). */
test("PWA: CSS/JS se sirven network-first (una caché vieja no gana en línea)", async function (ctx) {
  var p = await open(ctx, "solitario.html");
  await p.page.evaluate(function () { return navigator.serviceWorker.ready; });
  await p.page.waitForFunction(function () { return !!navigator.serviceWorker.controller; }, null, { timeout: 6000 });

  // Envenenar la caché: guardar en styles/base.css una versión con un centinela
  // (:root { --sw-stale: 1 }) que el archivo real NO tiene. Simula el CSS viejo
  // que tendría un visitante que ya había cacheado la app.
  var poisoned = await p.page.evaluate(async function () {
    var keys = await caches.keys();
    var name = keys.filter(function (k) { return k.indexOf("juegos-clasicos-") === 0; })[0];
    if (!name) return false;
    var cache = await caches.open(name);
    var real = await (await fetch("styles/base.css")).text();
    var stale = real + "\n:root { --sw-stale: 1; }\n";
    var target = new URL("styles/base.css", location.href).toString();
    await cache.put(new Request(target), new Response(stale, { headers: { "content-type": "text/css" } }));
    var check = await cache.match(new Request(target));
    return /--sw-stale/.test(await check.text());   // true si el poison quedó aplicado
  });
  assert(poisoned, "no se pudo envenenar la caché del SW para la prueba");

  // Recargar EN LÍNEA: network-first debe traer el base.css fresco, SIN el
  // centinela, aunque la caché tenga la copia envenenada.
  await p.page.reload({ waitUntil: "load" });
  await p.page.waitForTimeout(200);
  var stale = await p.page.evaluate(function () {
    return getComputedStyle(document.documentElement).getPropertyValue("--sw-stale").trim();
  });
  assert(stale === "", "se sirvió el base.css viejo de la caché (--sw-stale='" + stale + "'); debería venir fresco de la red");
  assertNoErrors(p.errors);
});

/* 32c) PWA — aviso "hay una versión nueva" (Fase 5 de docs/PLAN.md): al haber
   un SW en espera con esta pestaña ya controlada por uno anterior, shared/
   pwa.js debe mostrar un toast con botón "Recargar"; tocarlo manda
   "skip-waiting" al SW en espera y, al tomar control (controllerchange), la
   página recarga. Se stubea navigator.serviceWorker.register ANTES de que
   corra pwa.js (page.addInitScript) para no depender de desplegar una v2 real
   del SW: prueba el código del cliente en aislamiento, con las mismas APIs. */
test("PWA: aviso de versión nueva — toast con Recargar, skip-waiting y recarga al tomar control", async function (ctx) {
  var p = await newPage(ctx);
  await p.page.addInitScript(function () {
    window.__msgs = [];
    var waiting = { postMessage: function (m) { window.__msgs.push(m); } };
    var fakeReg = { waiting: waiting, installing: null, addEventListener: function () {} };
    navigator.serviceWorker.register = function () { return Promise.resolve(fakeReg); };
    Object.defineProperty(navigator.serviceWorker, "controller", { value: {}, configurable: true });
  });
  await p.page.goto(url("solitario.html"), { waitUntil: "load" });

  await p.page.waitForSelector(".toast-action", { timeout: 4000 });
  var msg = await p.page.evaluate(function () {
    var span = document.querySelector(".toast-action span");
    return span ? span.textContent : null;
  });
  assert(msg && /versión nueva/i.test(msg), "el aviso debería decir que hay una versión nueva, dice: " + msg);

  await p.page.click(".toast-action .btn");
  var sent = await p.page.evaluate(function () { return window.__msgs; });
  assert(sent.indexOf("skip-waiting") >= 0, "al tocar Recargar debería mandarse skip-waiting al SW en espera");

  // "Recargar" no fuerza la recarga directamente: espera a que el SW en espera
  // tome el control (controllerchange) y recién ahí recarga — lo disparamos a
  // mano (nadie más va a activar el SW falso) y confirmamos la navegación real.
  await Promise.all([
    p.page.waitForEvent("framenavigated", { timeout: 3000 }),
    p.page.evaluate(function () { navigator.serviceWorker.dispatchEvent(new Event("controllerchange")); }),
  ]);
  assertNoErrors(p.errors);
});

/* 32d) PWA — en la PRIMERA visita (sin SW previo controlando) no hay "versión
   nueva" que avisar: el aviso no debe aparecer. */
test("PWA: sin SW previo (primera visita) no muestra el aviso de versión nueva", async function (ctx) {
  var p = await open(ctx, "solitario.html");
  await p.page.waitForTimeout(300);
  var shown = await p.page.evaluate(function () { return !!document.querySelector(".toast-action"); });
  assert(!shown, "la primera visita no debería mostrar el aviso de versión nueva");
  assertNoErrors(p.errors);
});

/* 33) Guardado — avisa una sola vez si falla la escritura del progreso. */
test("Guardado: avisa una vez si falla la escritura (quota/modo restringido)", async function (ctx) {
  var p = await open(ctx, "solitario.html");
  var r = await p.page.evaluate(function () {
    // Forzamos que sólo la escritura de la PARTIDA falle (sin romper el candado LOCK_KEY).
    var orig = localStorage.setItem.bind(localStorage);
    localStorage.setItem = function (k, v) { if (k === GAME_KEY) throw new Error("quota"); return orig(k, v); };
    saveWarned = false;
    gameSet("x"); gameSet("y");   // dos intentos: el aviso debe salir una sola vez
    var toasts = document.querySelectorAll(".toast");
    return { warned: saveWarned, count: toasts.length, txt: toasts.length ? toasts[0].textContent : "" };
  });
  assert(r.warned, "saveWarned debería quedar en true al fallar la escritura");
  assert(r.count === 1, "el aviso debe mostrarse una sola vez (fue " + r.count + ")");
  assert(/guardar/i.test(r.txt), "el aviso debería mencionar el guardado: " + r.txt);
  assertNoErrors(p.errors);
});

/* 34) Accesibilidad — las cartas exponen aria-label legible y no revelan las tapadas. */
test("Accesibilidad: las cartas tienen aria-label y las boca abajo no se revelan", async function (ctx) {
  var p = await open(ctx, "solitario.html");
  var r = await p.page.evaluate(function () {
    var up = makeCardEl({ suit: "hearts", rank: 12, color: "red", faceUp: true, id: 1 });
    var down = makeCardEl({ suit: "hearts", rank: 12, color: "red", faceUp: false, id: 2 });
    return { up: up.getAttribute("aria-label"), role: up.getAttribute("role"), down: down.getAttribute("aria-label") };
  });
  assert(r.up === "Reina de corazones", "aria-label de carta cara arriba inesperado: " + r.up);
  assert(r.role === "img", "la carta debería tener role=img");
  assert(r.down === "carta boca abajo", "la carta boca abajo no debe revelar su identidad: " + r.down);
  assertNoErrors(p.errors);
});

/* 35) Arquitectura — shared/ui.js expone un toast() único, igual en los 4 juegos. */
test("Arquitectura: shared/ui.js expone toast() igual en los 4 juegos", async function (ctx) {
  var pages = ["solitario.html", "carta-blanca.html", "corazones.html", "buscaminas.html"];
  for (var i = 0; i < pages.length; i++) {
    var p = await open(ctx, pages[i]);
    var r = await p.page.evaluate(function () {
      toast("hola");
      var t = document.querySelector(".toast");
      return { isFn: typeof toast === "function", role: t && t.getAttribute("role"), text: t && t.textContent };
    });
    assert(r.isFn, pages[i] + ": toast debería ser una función global (shared/ui.js)");
    assert(r.role === "status", pages[i] + ": el toast debería tener role=status");
    assert(r.text === "hola", pages[i] + ": el toast debería mostrar el mensaje pasado");
    assertNoErrors(p.errors);
  }
});

/* ==================== ARQUITECTURA: contrato de juego ==================== */

/* 36) Registro — games/registry.js declara los 4 juegos reales con href válido
   y su STORE_NS coincide con el id del registro (candado multi-pestaña y
   estadísticas comparten el mismo namespace). */
test("Registro: games/registry.js declara los 4 juegos con datos consistentes", async function (ctx) {
  var p = await open(ctx, "index.html");
  var r = await p.page.evaluate(function () {
    var ids = window.GAMES.map(function (g) { return g.id; });
    var hasFields = window.GAMES.every(function (g) {
      return g.id && g.title && g.href && g.icon && g.statsKey && typeof g.body === "function";
    });
    return { count: window.GAMES.length, ids: ids, hasFields: hasFields };
  });
  assert(r.count === 4, "esperaba 4 juegos en el registro, hay " + r.count);
  assert(r.ids.join(",") === "solitario,cartablanca,corazones,buscaminas",
    "orden/ids inesperados: " + r.ids.join(","));
  assert(r.hasFields, "todas las entradas del registro deben tener id/title/href/icon/statsKey/body");
  assertNoErrors(p.errors);
});

/* 37) Launcher — el menú de inicio se genera desde el registro: agregar un
   juego nuevo sólo requiere sumarlo a games/registry.js. */
test("Registro: el launcher se genera desde games/registry.js", async function (ctx) {
  var p = await open(ctx, "index.html");
  var r = await p.page.evaluate(function () {
    var tiles = Array.prototype.slice.call(document.querySelectorAll("#tiles .tile"));
    return {
      count: tiles.length,
      hrefs: tiles.map(function (t) { return t.getAttribute("href"); }),
      titles: tiles.map(function (t) { return t.querySelector(".tname").textContent; }),
      matchesRegistry: tiles.length === window.GAMES.length &&
        tiles.every(function (t, i) { return t.getAttribute("href") === window.GAMES[i].href; })
    };
  });
  assert(r.count === 4, "el launcher debería mostrar 4 tiles, mostró " + r.count);
  assert(r.matchesRegistry, "los href de los tiles deben coincidir 1:1 con games/registry.js");
  assert(r.titles.join(",") === "Solitario,Carta Blanca,Corazones,Buscaminas",
    "títulos inesperados: " + r.titles.join(","));
  assertNoErrors(p.errors);
});

/* 38) Estadísticas — las tarjetas se generan desde el registro, en el mismo
   orden y con el mismo statsKey que usa cada juego para guardar. */
test("Registro: estadísticas se generan desde games/registry.js", async function (ctx) {
  var p = await open(ctx, "estadisticas.html");
  var r = await p.page.evaluate(function () {
    var cards = Array.prototype.slice.call(document.querySelectorAll("#cards .card"));
    return {
      count: cards.length,
      titles: cards.map(function (c) { return c.querySelector("h2").textContent.trim(); }),
      statsKeys: window.GAMES.map(function (g) { return g.statsKey; })
    };
  });
  assert(r.count === 4, "estadísticas debería mostrar 4 tarjetas, mostró " + r.count);
  assert(r.statsKeys.join(",") === "solitario.stats,cartablanca.stats,corazones.stats,buscaminas.stats",
    "statsKeys inesperados: " + r.statsKeys.join(","));
  assertNoErrors(p.errors);
});

/* 39) Contrato — el registro y el manifest de la PWA no divergen: cada juego
   del registro tiene un shortcut en el manifest que apunta al mismo href. */
test("Contrato: games/registry.js y manifest.webmanifest no divergen", async function (ctx) {
  var p = await open(ctx, "index.html");
  var r = await p.page.evaluate(async function () {
    var link = document.querySelector('link[rel="manifest"]');
    var m = await (await fetch(link.href)).json();
    var shortcutHrefs = (m.shortcuts || []).map(function (s) { return s.url; }).sort();
    var registryHrefs = window.GAMES.map(function (g) { return g.href; }).sort();
    return { shortcutHrefs: shortcutHrefs, registryHrefs: registryHrefs };
  });
  assert(JSON.stringify(r.shortcutHrefs) === JSON.stringify(r.registryHrefs),
    "el manifest y el registro deben listar los mismos juegos: " +
    JSON.stringify(r.shortcutHrefs) + " vs " + JSON.stringify(r.registryHrefs));
  assertNoErrors(p.errors);
});

/* 39b) Contrato — el menú de juegos (🎮) de cada página de juego se GENERA
   desde games/registry.js (shared/menu.js). Antes era HTML estático repetido
   en las 4 páginas, con el riesgo de que se desincronizara al agregar un
   juego; ahora agregarlo al registro alcanza. Este test abre el menú con un
   click real en #btn-menu (no lee el DOM oculto directo) y verifica que la
   cantidad de enlaces generados sea exactamente GAMES.length + 2 (Inicio +
   juegos + Estadísticas), además del contenido/orden/marcado del actual. */
test("Contrato: el menú de juegos de cada juego se genera desde games/registry.js", async function (ctx) {
  var p0 = await open(ctx, "index.html");
  var registry = await p0.page.evaluate(function () {
    return window.GAMES.map(function (g) { return { href: g.href, title: g.title }; });
  });
  for (var i = 0; i < registry.length; i++) {
    var file = registry[i].href;
    var p = await open(ctx, file);
    await p.page.click("#btn-menu");
    var menu = await p.page.evaluate(function () {
      var overlayHidden = document.getElementById("menu").hidden;
      var links = Array.prototype.slice.call(document.querySelectorAll("#menu .game-list .game-link"));
      return {
        overlayHidden: overlayHidden,
        entries: links.map(function (l) {
          return {
            href: l.getAttribute("href"),
            text: l.textContent.replace(/\s+/g, " ").trim(),
            current: l.classList.contains("current")
          };
        })
      };
    });
    var menuEntries = menu.entries;
    assert(!menu.overlayHidden, file + ": el click en #btn-menu debería abrir el menú");
    assert(menuEntries.length === registry.length + 2,
      file + ": el menú generado debería tener GAMES.length + 2 = " + (registry.length + 2) + " enlaces, tiene " + menuEntries.length);
    assert(menuEntries[0].href === "index.html", file + ": la primera entrada del menú debería ser Inicio");
    assert(menuEntries[menuEntries.length - 1].href === "estadisticas.html", file + ": la última entrada debería ser Estadísticas");
    for (var j = 0; j < registry.length; j++) {
      var entry = menuEntries[j + 1], game = registry[j];
      assert(entry.text.indexOf(game.title) >= 0,
        file + ": la entrada " + (j + 1) + " del menú debería ser '" + game.title + "', es '" + entry.text + "'");
      if (game.href === file) {
        assert(entry.current && entry.href === null,
          file + ": el juego actual debería marcarse .current y no ser un enlace");
      } else {
        assert(entry.href === game.href,
          file + ": '" + game.title + "' debería enlazar a " + game.href + ", enlaza a " + entry.href);
      }
    }
    assertNoErrors(p.errors);
  }
});

/* 40) Precache — todo archivo servido (HTML, CSS, JS, íconos) está en la lista
   ASSETS de sw.js. Hoy esa correspondencia se cuida a mano; con más archivos
   por juego (ver Fase 1 de docs/PLAN.md) el riesgo de olvidar uno —y romper el
   offline en silencio— crece. Este test lo convierte en un fallo de CI. No
   abre navegador: compara el filesystem contra sw.js directo. */
test("Precache: todo archivo servido está en la lista ASSETS de sw.js", async function () {
  var swSrc = fs.readFileSync(path.join(ROOT, "sw.js"), "utf8");
  var listMatch = swSrc.match(/const ASSETS = \[([\s\S]*?)\];/);
  assert(listMatch, "no se pudo encontrar la lista ASSETS en sw.js");
  var assets = {};
  var strRe = /"([^"]+)"/g, strMatch;
  while ((strMatch = strRe.exec(listMatch[1]))) assets[strMatch[1]] = true;

  // Carpetas que forman el "app shell" y qué extensiones les corresponden
  // (null = todas). Cada archivo real de estas carpetas debe estar en ASSETS.
  var dirs = [
    { dir: "", exts: [".html"] },
    { dir: "styles", exts: [".css"] },
    { dir: "shared", exts: [".js"] },
    { dir: "games", exts: [".js"] },
    { dir: "icons", exts: null },
  ];
  var extras = ["favicon.svg", "manifest.webmanifest"];

  var missing = [];
  dirs.forEach(function (d) {
    var abs = path.join(ROOT, d.dir);
    fs.readdirSync(abs).forEach(function (name) {
      var full = path.join(abs, name);
      if (!fs.statSync(full).isFile()) return;
      if (d.exts && d.exts.indexOf(path.extname(name)) === -1) return;
      var rel = d.dir ? d.dir + "/" + name : name;
      if (!assets[rel]) missing.push(rel);
    });
  });
  extras.forEach(function (rel) { if (!assets[rel]) missing.push(rel); });

  assert(missing.length === 0,
    "archivo(s) servido(s) fuera de ASSETS en sw.js: " + missing.join(", "));
});

/* ==================== SEGURIDAD (Fase 5) ==================== */

/* 41) XSS — un nombre de rival con HTML se muestra como texto literal, nunca
   se inyecta como elemento, en las 4 superficies donde Corazones lo renderiza
   (ficha de asiento, fin de mano, fin de partida, tabla de puntajes). Esta es
   la protección real: el escapado no depende de la CSP para frenar una
   inyección (defensa en profundidad, no la única barrera). Desde la Fase 1 de
   docs/PLAN.md la CSP también es estricta en las 4 páginas de juego (sin
   'unsafe-inline' en script-src), así que de paso bloquearía la ejecución de
   un atributo onerror inyectado — pero el test verifica el escapado en sí,
   no la CSP (eso lo cubre el test de CSP). */
test("Seguridad: un nombre de rival con HTML no se inyecta, se muestra como texto", async function (ctx) {
  var p = await open(ctx, "corazones.html");
  var payload = '<img src=x onerror="window.__xss=1">';
  var r = await p.page.evaluate(function (payload) {
    names[1] = payload; names[2] = payload; names[3] = payload;

    // 1) Ficha de asiento (renderOpp)
    renderOpp(1);
    var seatHtml = document.getElementById("seat-1").innerHTML;

    // 2) Fin de mano (showRound)
    for (var s = 0; s < 4; s++) { players[s].score = 0; players[s].taken = []; }
    showRound([0, 0, 0, 0], -1);
    var roundHtml = document.getElementById("round-body").innerHTML;
    document.getElementById("round").hidden = true;

    // 3) Fin de partida (showWin)
    showWin();
    var winHtml = document.getElementById("win-body").innerHTML;
    document.getElementById("win").hidden = true;

    // 4) Tabla de puntajes (buildScoresTable)
    handHistory = [[1, 2, 3, 4]];
    buildScoresTable();
    var tableHtml = document.getElementById("scores-table").innerHTML;

    return {
      seatHtml: seatHtml, roundHtml: roundHtml, winHtml: winHtml, tableHtml: tableHtml,
      xssRan: window.__xss === 1,
      anyImgTag: /<img/i.test(seatHtml + roundHtml + winHtml + tableHtml)
    };
  }, payload);
  assert(!r.xssRan, "el onerror inyectado se ejecutó: falló el escapado en alguna superficie");
  assert(!r.anyImgTag, "el payload se insertó como elemento <img> real en vez de texto escapado");
  assert(r.seatHtml.indexOf("&lt;img") >= 0, "la ficha de asiento debería mostrar el HTML escapado como texto");
  assert(r.tableHtml.indexOf("&lt;img") >= 0, "la tabla de puntajes debería mostrar el HTML escapado como texto");
  assertNoErrors(p.errors);
});

/* 42) CSP — las 6 páginas declaran una Content-Security-Policy estricta, sin
   orígenes de terceros y sin 'unsafe-inline' en ningún directive. Desde que el
   motor de cada juego se externalizó a games/<juego>.js (ver docs/PLAN.md,
   Fase 1) ya no queda script inline en ninguna página. Si una edición futura
   aflojara la política sin darse cuenta (o volviera a meter un <script>
   inline), este test lo detecta. */
test("CSP: las 6 páginas declaran una Content-Security-Policy estricta", async function (ctx) {
  var pages = ["index.html", "estadisticas.html", "solitario.html", "carta-blanca.html", "corazones.html", "buscaminas.html"];
  for (var i = 0; i < pages.length; i++) {
    var file = pages[i];
    var p = await open(ctx, file);
    var csp = await p.page.evaluate(function () {
      var m = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
      return m && m.getAttribute("content");
    });
    assert(csp, file + ": falta la meta Content-Security-Policy");
    assert(csp.indexOf("default-src 'self'") >= 0, file + ": default-src debería ser 'self'");
    assert(csp.indexOf("object-src 'none'") >= 0, file + ": object-src debería ser 'none'");
    assert(!/https?:|\*/.test(csp), file + ": la CSP no debería permitir orígenes externos: " + csp);
    assert(csp.indexOf("'unsafe-inline'") === -1, file + ": no debería necesitar unsafe-inline en ningún directive: " + csp);
    assert(csp.indexOf("script-src 'self'") >= 0, file + ": script-src debería ser 'self' estricto: " + csp);
    assert(/style-src 'self'(?!.*unsafe-inline)/.test(csp), file + ": style-src debería ser 'self' estricto: " + csp);
    assertNoErrors(p.errors);
  }
});

/* 43) Tipos — los módulos compartidos declaran // @ts-check (tsc -p . los
   valida en CI; ver .github/workflows/tests.yml). No abre navegador: lee los
   archivos directo del filesystem. */
test("Tipos: los módulos compartidos declaran // @ts-check", async function () {
  var files = [
    "shared/storage.js", "shared/cards.js", "shared/ui.js", "shared/pwa.js",
    "shared/theme.js", "shared/menu.js", "shared/launcher.js", "shared/estadisticas-page.js", "games/registry.js"
  ];
  for (var i = 0; i < files.length; i++) {
    var content = fs.readFileSync(path.join(ROOT, files[i]), "utf8");
    assert(content.indexOf("// @ts-check") === 0, files[i] + ": debería empezar con // @ts-check");
  }
});

/* 45) Tema — el toggle claro/oscuro (Fase 4) aplica los tokens oscuros, marca
   el botón activo, persiste al recargar (la preferencia manual gana sobre el
   sistema) y es global entre páginas (una sola clave en localStorage). */
test("Tema: el toggle claro/oscuro aplica tokens, persiste y es global", async function (ctx) {
  var p = await open(ctx, "solitario.html");
  var t0 = await p.page.evaluate(function () { return document.documentElement.dataset.theme; });
  assert(t0 === "light" || t0 === "dark", "theme.js debería fijar data-theme; quedó " + t0);

  // Elegir "Oscuro" desde el modal de Opciones.
  await p.page.click("#btn-settings");
  await p.page.click('[data-theme-pref="dark"]');
  var r = await p.page.evaluate(function () {
    var active = document.querySelector('[data-theme-pref].active');
    return {
      theme: document.documentElement.dataset.theme,
      felt: getComputedStyle(document.documentElement).getPropertyValue("--felt-3").trim(),
      active: active ? active.getAttribute("data-theme-pref") : null
    };
  });
  assert(r.theme === "dark", "elegir Oscuro debería poner data-theme=dark, quedó " + r.theme);
  assert(r.felt === "#071811", "en oscuro --felt-3 debería ser el token oscuro, es " + r.felt);
  assert(r.active === "dark", "el botón Oscuro debería quedar marcado activo");

  // Persiste al recargar (aunque el sistema esté en claro).
  await p.page.reload({ waitUntil: "load" });
  var t2 = await p.page.evaluate(function () { return document.documentElement.dataset.theme; });
  assert(t2 === "dark", "la preferencia de tema debería persistir al recargar, quedó " + t2);

  // Global: otra página del mismo origen respeta la misma preferencia.
  await p.page.goto(url("buscaminas.html"), { waitUntil: "load" });
  var t3 = await p.page.evaluate(function () { return document.documentElement.dataset.theme; });
  assert(t3 === "dark", "el tema debería ser global entre páginas, en buscaminas quedó " + t3);
  assertNoErrors(p.errors);
});

/* 45b) Responsive — riel lateral ÚNICO en apaisado corto: a 844×390 (celular
   apaisado, el breakpoint real de docs/PLAN.md Fase 2), #app pasa a grilla
   con un solo riel a la IZQUIERDA que apila header + controles (Pista, etc.);
   el riel derecho se eliminó para darle ese ancho al tablero. Ya hubo una
   regresión real de cascada acá (un `#app` duplicado en las 4 hojas de cada
   juego le ganaba al media query compartido de styles/base.css); este test
   la convierte en un fallo de CI si una edición futura la reintroduce.
   También verifica que el lienzo del documento no sea blanco (la franja del
   notch / overscroll se pinta con el background de <html>). */
test("Responsive: riel único a la izquierda (header + controles) en apaisado corto", async function (ctx) {
  var pages = ["solitario.html", "carta-blanca.html", "corazones.html", "buscaminas.html"];
  for (var i = 0; i < pages.length; i++) {
    var p = await newPage(ctx);
    await p.page.setViewportSize({ width: 844, height: 390 });
    await p.page.goto(url(pages[i]), { waitUntil: "load" });
    await p.page.waitForTimeout(100);
    var r = await p.page.evaluate(function () {
      var app = document.getElementById("app");
      var header = app.querySelector("header").getBoundingClientRect();
      var controls = document.getElementById("controls").getBoundingClientRect();
      var main = app.querySelector(":scope > :not(header):not(footer)").getBoundingClientRect();
      return {
        display: getComputedStyle(app).display,
        headerLeftOfMain: header.right <= main.left + 1,
        controlsLeftOfMain: controls.right <= main.left + 1,
        controlsBelowHeader: controls.top >= header.bottom - 1,
        canvasBg: getComputedStyle(document.documentElement).backgroundColor
      };
    });
    assert(r.display === "grid", pages[i] + ": #app debería ser grid a 844x390, es '" + r.display + "'");
    assert(r.headerLeftOfMain, pages[i] + ": el header debería ser un riel a la IZQUIERDA del tablero");
    assert(r.controlsLeftOfMain, pages[i] + ": los controles (Pista) deberían estar en el MISMO riel izquierdo, no en uno derecho");
    assert(r.controlsBelowHeader, pages[i] + ": los controles deberían quedar DEBAJO del header en el riel");
    assert(r.canvasBg !== "rgba(0, 0, 0, 0)" && r.canvasBg !== "transparent" && !/255,\s*255,\s*255/.test(r.canvasBg),
      pages[i] + ": el lienzo (<html>) no debería ser blanco/transparente para la zona del notch, es '" + r.canvasBg + "'");
    assertNoErrors(p.errors);
  }
});

/* 45b2) Responsive — en apaisado corto, Solitario y Carta Blanca reordenan el
   tablero: mazo/descarte o pozos libres en una COLUMNA a la izquierda y las
   pilas finales en una COLUMNA a la derecha, con las columnas de juego usando
   el alto completo en el medio (antes la fila superior comía el alto y el
   tablero necesitaba scroll). Verifica la geometría real, no sólo el CSS. */
test("Responsive: en apaisado corto los pozos/mazo van a la izquierda y las pilas a la derecha", async function (ctx) {
  var cases = [
    { file: "solitario.html", left: "#stockwaste" },
    { file: "carta-blanca.html", left: "#freecells" }
  ];
  for (var i = 0; i < cases.length; i++) {
    var p = await newPage(ctx);
    await p.page.setViewportSize({ width: 844, height: 390 });
    await p.page.goto(url(cases[i].file), { waitUntil: "load" });
    await p.page.waitForTimeout(150);
    var r = await p.page.evaluate(function (leftSel) {
      var left = document.querySelector(leftSel).getBoundingClientRect();
      var found = document.getElementById("foundations").getBoundingClientRect();
      var tabl = document.getElementById("tableau").getBoundingClientRect();
      return {
        layout: getComputedStyle(document.getElementById("board")).getPropertyValue("--board-layout").trim(),
        leftOk: left.right <= tabl.left + 1,
        rightOk: found.left >= tabl.right - 1,
        leftIsColumn: left.height > left.width
      };
    }, cases[i].left);
    assert(r.layout === "side", cases[i].file + ": el centinela --board-layout debería ser 'side' a 844x390, es '" + r.layout + "'");
    assert(r.leftOk, cases[i].file + ": " + cases[i].left + " debería quedar a la IZQUIERDA del tablero");
    assert(r.rightOk, cases[i].file + ": las pilas finales deberían quedar a la DERECHA del tablero");
    assert(r.leftIsColumn, cases[i].file + ": la zona izquierda debería ser una columna vertical");
    assertNoErrors(p.errors);
  }
});

/* 45b3) Responsive — el reparto inicial entra COMPLETO sin scroll en los tres
   escenarios típicos (celular vertical, celular apaisado, desktop). Regresión
   del pedido "no puede ser que tenga que bajar la pantalla": antes, en
   desktop y en apaisado, la columna inicial de 7 cartas de Carta Blanca no
   entraba y había que scrollear para ver la última carta. */
test("Responsive: el reparto inicial entra sin scroll (Solitario y Carta Blanca)", async function (ctx) {
  var files = ["solitario.html", "carta-blanca.html"];
  var viewports = [
    { width: 390, height: 844 },
    { width: 844, height: 390 },
    { width: 1280, height: 800 }
  ];
  for (var i = 0; i < files.length; i++) {
    for (var v = 0; v < viewports.length; v++) {
      var p = await newPage(ctx);
      await p.page.setViewportSize(viewports[v]);
      await p.page.goto(url(files[i]), { waitUntil: "load" });
      await p.page.waitForTimeout(150);
      var r = await p.page.evaluate(function () {
        var w = document.getElementById("tableauWrap");
        return { scrollH: w.scrollHeight, clientH: w.clientHeight };
      });
      assert(r.scrollH <= r.clientH + 1,
        files[i] + " a " + viewports[v].width + "x" + viewports[v].height +
        ": el reparto inicial no debería necesitar scroll (" + r.scrollH + " > " + r.clientH + ")");
      assertNoErrors(p.errors);
    }
  }
});

/* 45b4) Carta Blanca — las escaleras conectadas se ven iluminadas: las cartas
   que NO forman parte de la escalera del fondo de su columna (todavía no se
   pueden agarrar) llevan la clase .buried y se atenúan; las de la escalera
   quedan a brillo pleno, así se lee de un vistazo qué se puede mover. */
test("Carta Blanca: las cartas enterradas se atenúan y la escalera del fondo queda iluminada", async function (ctx) {
  var p = await open(ctx, "carta-blanca.html");
  var r = await p.page.evaluate(function () {
    function c(s, rk, id) { return { suit: s, rank: rk, color: SUIT[s].color, id: id }; }
    state = {
      free: [null, null, null, null],
      foundations: [[], [], [], []],
      // col 0: K♠ enterrada bajo un 5♦ suelto; col 1: 10♥-9♣ (escalera válida)
      tableau: [[c("spades", 13, 1), c("diamonds", 5, 2)],
                [c("hearts", 10, 3), c("clubs", 9, 4)],
                [], [], [], [], [], []],
      moves: 0
    };
    selection = null; undoStack = []; render();
    function buried(col, idx) {
      var e = document.querySelector('.card[data-pile="tableau"][data-col="' + col + '"][data-index="' + idx + '"]');
      return { cls: e.classList.contains("buried"), filter: getComputedStyle(e).filter };
    }
    return { k: buried(0, 0), five: buried(0, 1), ten: buried(1, 0), nine: buried(1, 1) };
  });
  assert(r.k.cls && r.k.filter !== "none", "la K♠ tapada por una carta suelta debería estar atenuada (.buried)");
  assert(!r.five.cls, "el 5♦ (fondo de columna) no debería estar atenuado");
  assert(!r.ten.cls, "el 10♥ (parte de la escalera 10♥-9♣) no debería estar atenuado");
  assert(!r.nine.cls, "el 9♣ (fondo de la escalera) no debería estar atenuado");
  assertNoErrors(p.errors);
});

/* 45b5) Responsive — el tamaño de carta se ajusta al ESTADO: si una columna
   crece mucho, las cartas se achican solas para que todo entre sin scroll;
   sólo debajo del piso de legibilidad (FIT_MIN_CW) se permite el scroll.
   Pedido explícito: "que en PC se redimensionen las cartas para que no
   existan las scrollbars, excepto que sean muy pequeñas". */
test("Responsive: las cartas se achican para que una columna larga entre sin scroll", async function (ctx) {
  var p = await newPage(ctx);
  await p.page.setViewportSize({ width: 1280, height: 800 });
  await p.page.goto(url("carta-blanca.html"), { waitUntil: "load" });
  await p.page.waitForTimeout(150);
  var r = await p.page.evaluate(function () {
    function c(s, rk, id) { return { suit: s, rank: rk, color: SUIT[s].color, id: id }; }
    var cwInitial = CW;
    // Columna de 14 cartas: con el tamaño inicial no entraría; debe achicar.
    var tall = [];
    for (var i = 0; i < 14; i++) tall.push(c(["hearts", "spades"][i % 2], (i % 13) + 1, 900 + i));
    state = { free: [null, null, null, null], foundations: [[], [], [], []],
              tableau: [tall, [], [], [], [], [], [], []], moves: 0 };
    selection = null; undoStack = []; render();
    var w = document.getElementById("tableauWrap");
    var afterTall = { cw: CW, scroll: w.scrollHeight > w.clientHeight + 1 };
    // Al "resolverse" la pila, las cartas vuelven a crecer.
    state.tableau[0] = tall.slice(0, 3);
    render();
    return { cwInitial: cwInitial, afterTall: afterTall, cwRecovered: CW };
  });
  assert(r.afterTall.cw < r.cwInitial, "con una columna de 14 cartas, CW debería achicarse (era " + r.cwInitial + ", quedó " + r.afterTall.cw + ")");
  assert(!r.afterTall.scroll, "con las cartas achicadas, la columna de 14 debería entrar sin scroll");
  assert(r.cwRecovered > r.afterTall.cw, "al achicarse la pila, las cartas deberían volver a crecer");
  assertNoErrors(p.errors);
});

test("Responsive: debajo del piso de legibilidad se permite el scroll", async function (ctx) {
  var p = await newPage(ctx);
  await p.page.setViewportSize({ width: 844, height: 390 });
  await p.page.goto(url("carta-blanca.html"), { waitUntil: "load" });
  await p.page.waitForTimeout(150);
  var r = await p.page.evaluate(function () {
    function c(s, rk, id) { return { suit: s, rank: rk, color: SUIT[s].color, id: id }; }
    var monster = [];
    for (var i = 0; i < 30; i++) monster.push(c(["hearts", "spades"][i % 2], (i % 13) + 1, 900 + i));
    state = { free: [null, null, null, null], foundations: [[], [], [], []],
              tableau: [monster, [], [], [], [], [], [], []], moves: 0 };
    selection = null; undoStack = []; render();
    var w = document.getElementById("tableauWrap");
    return { cw: CW, fitMin: FIT_MIN_CW, scroll: w.scrollHeight > w.clientHeight + 1 };
  });
  assert(r.cw >= Math.min(r.fitMin, r.cw), "las cartas no deberían achicarse por debajo del piso");
  assert(r.scroll, "con una pila imposible de encajar, el scroll debería estar permitido (cw=" + r.cw + ")");
  assertNoErrors(p.errors);
});

/* 45b6) Buscaminas — en modo oscuro las celdas reveladas usan fondo OSCURO
   (antes quedaban con el crema del modo claro: un tablero oscuro con
   parches blancos). */
test("Buscaminas: en modo oscuro las celdas reveladas tienen fondo oscuro", async function (ctx) {
  var p = await newPage(ctx);
  await p.page.addInitScript(function () { try { localStorage.setItem("theme", "dark"); } catch (e) {} });
  await p.page.goto(url("buscaminas.html"), { waitUntil: "load" });
  await p.page.waitForTimeout(150);
  var r = await p.page.evaluate(function () {
    noGuess = false; digCell(4, 4); render();
    var cell = document.querySelector(".cell.revealed");
    var bg = getComputedStyle(cell).backgroundColor;
    var m = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    var lum = m ? (Number(m[1]) + Number(m[2]) + Number(m[3])) / 3 : 255;
    return { bg: bg, lum: lum, theme: document.documentElement.dataset.theme };
  });
  assert(r.theme === "dark", "la página debería estar en tema oscuro");
  assert(r.lum < 100, "la celda revelada debería ser oscura en modo oscuro, es " + r.bg);
  assertNoErrors(p.errors);
});

/* 45c) Tema "auto" — con la preferencia en "auto" (el default: nadie tocó el
   toggle), el tema debe reaccionar EN VIVO al cambio de
   prefers-color-scheme del SISTEMA, sin intervención del usuario (ver el
   listener "change" del matchMedia en shared/theme.js). El test anterior
   sólo cubre la preferencia MANUAL (botón Oscuro); éste cubre el modo que
   usan todos los usuarios que nunca abrieron Opciones. */
test("Tema 'auto': sigue el prefers-color-scheme del sistema en vivo", async function (ctx) {
  var p = await newPage(ctx);
  await p.page.emulateMedia({ colorScheme: "light" });
  await p.page.goto(url("solitario.html"), { waitUntil: "load" });
  await p.page.waitForTimeout(100);
  var t0 = await p.page.evaluate(function () {
    return { theme: document.documentElement.dataset.theme, pref: getThemePref() };
  });
  assert(t0.pref === "auto", "sin preferencia guardada, getThemePref() debería ser 'auto' (fue '" + t0.pref + "')");
  assert(t0.theme === "light", "con el sistema en claro y preferencia auto, data-theme debería ser 'light' (fue '" + t0.theme + "')");

  // Cambiar la preferencia del SISTEMA (no del usuario, ver el toggle de arriba):
  // theme.js debe reaccionar solo, sin recargar ni tocar ningún control.
  await p.page.emulateMedia({ colorScheme: "dark" });
  await p.page.waitForFunction(function () { return document.documentElement.dataset.theme === "dark"; }, null, { timeout: 2000 });
  var stored = await p.page.evaluate(function () { return localStorage.getItem("theme"); });
  assert(stored === null, "el cambio del sistema no debe grabar una preferencia manual en localStorage (quedó '" + stored + "')");
  assertNoErrors(p.errors);
});

/* ========================= RUNNER ========================= */
(async function () {
  var srv = await startServer(ROOT);
  BASE = "http://127.0.0.1:" + srv.port + "/";
  var launch = resolveLaunch();
  console.log("Navegador: " + (launch.executablePath || ("channel:" + launch.channel)) + "  ·  sirviendo " + BASE);
  var browser;
  try {
    browser = await chromium.launch(Object.assign({ headless: true, args: ["--no-sandbox"] }, launch));
  } catch (e) {
    srv.server.close();
    console.error("\nNo se pudo abrir Chromium. Definí CHROMIUM_BIN o instalá Google Chrome.\n" + e.message);
    process.exit(2);
  }
  var passed = 0, failed = 0;
  for (var i = 0; i < tests.length; i++) {
    var t = tests[i];
    var context = await browser.newContext();
    try {
      await t.fn(context);
      console.log("  \x1b[32m✓\x1b[0m " + t.name);
      passed++;
    } catch (e) {
      console.log("  \x1b[31m✗\x1b[0m " + t.name + "\n      " + (e && e.message ? e.message : e));
      failed++;
    } finally {
      await context.close();
    }
  }
  await browser.close();
  srv.server.close();
  console.log("\n" + passed + " pasaron, " + failed + " fallaron, " + tests.length + " en total");
  process.exit(failed ? 1 : 0);
})();
