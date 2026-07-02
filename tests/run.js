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
  var types = { ".html": "text/html; charset=utf-8", ".svg": "image/svg+xml", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".ico": "image/x-icon" };
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
