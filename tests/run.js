/*
 * Tests de navegador para los juegos (Solitario, Carta Blanca, Corazones, Buscaminas).
 *
 * Corren los HTML reales en Chromium y verifican los flujos clave y las regresiones
 * ya encontradas. No hace falta servidor: se abren con file://.
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
