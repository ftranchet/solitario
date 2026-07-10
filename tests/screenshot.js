/*
 * Captura screenshots de las 6 páginas en los 4 breakpoints del plan (ver
 * docs/PLAN.md, Fase 0 y Fase 2): vertical, apaisado corto, tablet y desktop
 * ancho. No es parte de la suite de tests (no hace assertions); es una
 * herramienta manual para comparar regresiones visuales antes/después de una
 * fase.
 *
 * Uso:   cd tests && node screenshot.js [carpeta-salida]
 * Por defecto guarda en docs/screenshots/baseline/.
 *
 * Los breakpoints replican los que ya usa el CSS/JS de cada juego:
 *   - vertical:        max-width 700px (por debajo de min-width:700px)
 *   - apaisado-corto:  max-height 480px (dispara los estilos de landscape)
 *   - tablet:          entre 700 y 1100px de ancho
 *   - desktop-ancho:   min-width 1100px (techo de tamaño de carta/celda)
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
  fs.mkdirSync(outDir, { recursive: true });

  var srv = await startServer(ROOT);
  var base = "http://127.0.0.1:" + srv.port + "/";
  var launch = resolveLaunch();
  var browser = await chromium.launch(Object.assign({ headless: true, args: ["--no-sandbox"] }, launch));

  for (var i = 0; i < BREAKPOINTS.length; i++) {
    var bp = BREAKPOINTS[i];
    var context = await browser.newContext({ viewport: { width: bp.width, height: bp.height } });
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

  await browser.close();
  srv.server.close();
  console.log("Listo: " + outDir);
})();
