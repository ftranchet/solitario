/*
 * Captura screenshots de las 6 páginas en los 4 breakpoints del plan (ver
 * docs/PLAN.md, Fase 0 y Fase 2): vertical, apaisado corto, tablet y desktop
 * ancho; más un puñado de ESTADOS deterministas de los juegos de cartas
 * (escalera larga apilada, carta seleccionada, pozo en modo difícil) y las 6
 * páginas en modo OSCURO (ver docs/PLAN-2.md, Fase 0). No es parte de la
 * suite de tests (no hace assertions); es una herramienta manual/de CI para
 * comparar regresiones visuales antes/después de un cambio (tests/visual.js
 * la usa para eso).
 *
 * Uso:   cd tests && node screenshot.js [carpeta-baseline] [carpeta-oscuro]
 * Por defecto guarda en docs/screenshots/baseline/ y docs/screenshots/dark/.
 *
 * Los breakpoints replican los que ya usa el CSS/JS de cada juego:
 *   - vertical:        max-width 700px (por debajo de min-width:700px)
 *   - apaisado-corto:  max-height 480px (dispara los estilos de landscape)
 *   - tablet:          entre 700 y 1100px de ancho
 *   - desktop-ancho:   min-width 1100px (techo de tamaño de carta/celda)
 *
 * Los estados y el modo oscuro se capturan en un solo breakpoint (desktop
 * ancho): no dependen del layout responsive, ya cubierto por el barrido de
 * arriba.
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const { chromium } = require("playwright-core");

const ROOT = path.resolve(__dirname, "..");
const PAGES = [
  "index.html",
  "solitario.html",
  "carta-blanca.html",
  "corazones.html",
  "buscaminas.html",
  "estadisticas.html",
];
const BREAKPOINTS = [
  { name: "vertical", width: 390, height: 844 },
  { name: "apaisado-corto", width: 844, height: 390 },
  { name: "tablet", width: 820, height: 1180 },
  { name: "desktop-ancho", width: 1440, height: 900 },
];
const STATE_VIEWPORT = { width: 1440, height: 900 };

/* Estados intermedios deterministas: antes SÓLO se comparaba el reparto
   inicial (repartido con la semilla fija de más abajo), así que una
   regresión visual que sólo aparece con el tablero avanzado —como el pip
   central que se asomaba en la franja de una escalera apilada, corregido en
   1.12.x— no la habría detectado ningún test (ver docs/PLAN-2.md, Fase 0).
   Cada `setup` corre en la página (vía page.evaluate) y arma el estado a
   mano con `state`/`selection`/`settings`, las mismas globals que ya leen
   los tests de tests/run.js — no valida reglas, es sólo para mostrar el
   layout. */
const STATES = [
  {
    page: "solitario.html",
    name: "solitario--estado-escalera",
    setup: function () {
      function c(s, rk, id, up) { return { suit: s, rank: rk, color: SUIT[s].color, faceUp: up !== false, id: id }; }
      state = {
        stock: [c("clubs", 2, 900, false), c("diamonds", 5, 901, false)],
        waste: [c("hearts", 4, 902)],
        foundations: [[c("spades", 1, 903), c("spades", 2, 904)], [c("hearts", 1, 905)], [], []],
        tableau: [
          [c("clubs", 9, 906, false), c("diamonds", 3, 907)],
          [c("spades", 5, 908, false), c("hearts", 7, 909, false), c("clubs", 6, 910)],
          [],
          [c("diamonds", 8, 911)],
          [c("clubs", 4, 912, false), c("spades", 9, 913)],
          [c("hearts", 2, 914, false), c("diamonds", 10, 915, false), c("clubs", 3, 916)],
          // Escalera larga apilada: K♥ Q♠ J♦ 10♣ 9♥ 8♠ 7♦ (7 cartas, alternando color)
          [c("hearts", 13, 917), c("spades", 12, 918), c("diamonds", 11, 919), c("clubs", 10, 920),
            c("hearts", 9, 921), c("spades", 8, 922), c("diamonds", 7, 923)],
        ],
        moves: 12,
      };
      selection = null; undoStack = []; stuckCheckMoves = -1;
      render();
    },
  },
  {
    page: "solitario.html",
    name: "solitario--estado-seleccion",
    setup: function () {
      function c(s, rk, id, up) { return { suit: s, rank: rk, color: SUIT[s].color, faceUp: up !== false, id: id }; }
      state = {
        stock: [c("clubs", 2, 900, false)],
        waste: [c("hearts", 4, 901)],
        foundations: [[c("spades", 1, 902)], [], [], []],
        tableau: [
          [c("clubs", 9, 903, false), c("diamonds", 3, 904)],
          [c("spades", 5, 905, false), c("clubs", 6, 906)],
          [c("hearts", 13, 907)],
          [c("diamonds", 8, 908)],
          [],
          [c("clubs", 4, 909, false), c("spades", 9, 910), c("hearts", 8, 911)],
          [c("diamonds", 10, 912)],
        ],
        moves: 8,
      };
      selection = { pile: "tableau", col: 5, index: 1 };   // 9♠ + 8♥ seleccionados
      undoStack = []; stuckCheckMoves = -1;
      render();
    },
  },
  {
    page: "solitario.html",
    name: "solitario--estado-pozo-dificil",
    setup: function () {
      function c(s, rk, id, up) { return { suit: s, rank: rk, color: SUIT[s].color, faceUp: up !== false, id: id }; }
      settings.draw = 3;
      state = {
        stock: [c("clubs", 2, 900, false)],
        waste: [c("hearts", 4, 901), c("diamonds", 3, 902), c("spades", 8, 903)],
        foundations: [[c("spades", 1, 904)], [], [], []],
        tableau: [
          [c("clubs", 9, 905, false), c("diamonds", 6, 906)],
          [c("hearts", 13, 907)],
          [],
          [c("diamonds", 8, 908)],
          [c("clubs", 4, 909, false), c("spades", 9, 910)],
          [c("hearts", 2, 911, false), c("clubs", 3, 912)],
          [c("diamonds", 10, 913)],
        ],
        moves: 5,
      };
      selection = null; undoStack = []; stuckCheckMoves = -1;
      render();
    },
  },
  {
    page: "carta-blanca.html",
    name: "carta-blanca--estado-escalera",
    setup: function () {
      function c(s, rk, id) { return { suit: s, rank: rk, color: SUIT[s].color, id: id }; }
      state = {
        free: [c("clubs", 2, 900), null, c("diamonds", 5, 901), null],
        foundations: [[c("spades", 1, 902), c("spades", 2, 903)], [c("hearts", 1, 904)], [], []],
        tableau: [
          [c("clubs", 9, 905), c("diamonds", 3, 906)],
          [c("spades", 5, 907), c("hearts", 7, 908), c("clubs", 6, 909)],
          [],
          [c("diamonds", 8, 910)],
          [c("clubs", 4, 911), c("spades", 9, 912)],
          [c("hearts", 2, 913), c("diamonds", 10, 914)],
          [c("clubs", 3, 915)],
          // Escalera larga apilada: K♥ Q♠ J♦ 10♣ 9♥ 8♠ 7♦ 6♣ (8 cartas)
          [c("hearts", 13, 916), c("spades", 12, 917), c("diamonds", 11, 918), c("clubs", 10, 919),
            c("hearts", 9, 920), c("spades", 8, 921), c("diamonds", 7, 922), c("clubs", 6, 923)],
        ],
        moves: 15,
      };
      selection = null; undoStack = [];
      render();
    },
  },
  {
    page: "carta-blanca.html",
    name: "carta-blanca--estado-seleccion",
    setup: function () {
      function c(s, rk, id) { return { suit: s, rank: rk, color: SUIT[s].color, id: id }; }
      state = {
        free: [c("clubs", 2, 900), null, null, null],
        foundations: [[c("spades", 1, 901)], [], [], []],
        tableau: [
          [c("clubs", 9, 902), c("diamonds", 3, 903)],
          [c("spades", 5, 904), c("clubs", 6, 905)],
          [c("hearts", 13, 906)],
          [c("diamonds", 8, 907)],
          [],
          [c("clubs", 4, 908), c("spades", 9, 909), c("hearts", 8, 910)],
          [c("diamonds", 10, 911)],
          [],
        ],
        moves: 6,
      };
      selection = { pile: "tableau", col: 5, index: 1 };   // 9♠ + 8♥ seleccionados
      undoStack = [];
      render();
    },
  },
];

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

function resolveLaunch() {
  var bin = process.env.CHROMIUM_BIN || process.env.CHROME_BIN;
  if (bin && fs.existsSync(bin)) return { executablePath: bin };
  var base = process.env.PLAYWRIGHT_BROWSERS_PATH || "/opt/pw-browsers";
  var candidates = [path.join(base, "chromium")];
  try {
    fs.readdirSync(base).forEach(function (d) {
      if (!/^chromium[-_]/.test(d)) return;
      candidates.push(path.join(base, d, "chrome-linux", "chrome"));
    });
  } catch (e) {}
  for (var i = 0; i < candidates.length; i++) {
    try { if (fs.existsSync(candidates[i])) return { executablePath: candidates[i] }; } catch (e) {}
  }
  return { channel: "chrome" };
}

(async function () {
  var outDir = path.resolve(ROOT, process.argv[2] || "docs/screenshots/baseline");
  var darkOutDir = path.resolve(ROOT, process.argv[3] || "docs/screenshots/dark");
  fs.mkdirSync(outDir, { recursive: true });
  fs.mkdirSync(darkOutDir, { recursive: true });

  var srv = await startServer(ROOT);
  var base = "http://127.0.0.1:" + srv.port + "/";
  var launch = resolveLaunch();
  var browser = await chromium.launch(Object.assign({ headless: true, args: ["--no-sandbox"] }, launch));

  for (var i = 0; i < BREAKPOINTS.length; i++) {
    var bp = BREAKPOINTS[i];
    // reducedMotion: las animaciones (reparto escalonado, pulsos) se apagan y
    // la captura muestra siempre el estado FINAL estable — sin esto, el
    // momento exacto de la captura variaría entre corridas y la comparación
    // pixel a pixel de tests/visual.js sería ruidosa.
    var context = await browser.newContext({
      viewport: { width: bp.width, height: bp.height },
      reducedMotion: "reduce",
    });
    for (var j = 0; j < PAGES.length; j++) {
      var page = await context.newPage();
      // Math.random determinista (LCG con semilla fija): los repartos salen
      // SIEMPRE iguales, así las capturas son reproducibles y sirven para la
      // regresión visual automática (tests/visual.js compara pixel a pixel).
      await page.addInitScript(function () {
        var seed = 20260710;
        Math.random = function () { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
      });
      await page.goto(base + PAGES[j], { waitUntil: "load" });
      await page.waitForTimeout(200);
      var name = PAGES[j].replace(".html", "") + "--" + bp.name + ".png";
      await page.screenshot({ path: path.join(outDir, name) });
      console.log("  " + name);
      await page.close();
    }
    await context.close();
  }

  // Estados deterministas de los juegos de cartas (ver comentario de STATES).
  {
    var stateContext = await browser.newContext({ viewport: STATE_VIEWPORT, reducedMotion: "reduce" });
    for (var s = 0; s < STATES.length; s++) {
      var st = STATES[s];
      var statePage = await stateContext.newPage();
      await statePage.goto(base + st.page, { waitUntil: "load" });
      await statePage.waitForTimeout(200);
      await statePage.evaluate(st.setup);
      await statePage.waitForTimeout(100);
      var stateName = st.name + ".png";
      await statePage.screenshot({ path: path.join(outDir, stateName) });
      console.log("  " + stateName);
      await statePage.close();
    }
    await stateContext.close();
  }

  // Modo oscuro: las 6 páginas, un solo breakpoint (antes docs/screenshots/dark/
  // era documentación estática sin comparar; ver docs/PLAN-2.md, Fase 0).
  {
    var darkContext = await browser.newContext({ viewport: STATE_VIEWPORT, reducedMotion: "reduce" });
    for (var d = 0; d < PAGES.length; d++) {
      var darkPage = await darkContext.newPage();
      // localStorage antes de que cargue theme.js (primer script del <head>):
      // aplica "dark" ANTES del primer pintado, igual que el toggle real.
      await darkPage.addInitScript(function () { try { localStorage.setItem("theme", "dark"); } catch (e) {} });
      await darkPage.addInitScript(function () {
        var seed = 20260710;
        Math.random = function () { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
      });
      await darkPage.goto(base + PAGES[d], { waitUntil: "load" });
      await darkPage.waitForTimeout(200);
      var darkName = PAGES[d].replace(".html", "") + ".png";
      await darkPage.screenshot({ path: path.join(darkOutDir, darkName) });
      console.log("  dark/" + darkName);
      await darkPage.close();
    }
    await darkContext.close();
  }

  await browser.close();
  srv.server.close();
  console.log("Listo: " + outDir + " (+ " + darkOutDir + ")");
})();
