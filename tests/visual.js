/*
 * Regresión visual automática: recaptura las pantallas (6 páginas × 4
 * breakpoints, los estados deterministas de los juegos de cartas y las 6
 * páginas en modo oscuro — ver tests/screenshot.js) con la MISMA semilla
 * determinista que usa screenshot.js y las compara pixel a pixel contra la
 * referencia commiteada en docs/screenshots/baseline/ y docs/screenshots/dark/.
 * Falla si alguna difiere más que el umbral.
 *
 * Uso:   cd tests && node visual.js
 *        (para actualizar la referencia tras un cambio visual INTENCIONAL:
 *         node screenshot.js  y commitear las capturas nuevas)
 *
 * El umbral (TOLERANCE) absorbe diferencias de antialiasing/fuentes entre
 * entornos (local vs. CI); una regresión de layout real lo supera por mucho.
 */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { PNG } = require("pngjs");
const pixelmatch = require("pixelmatch");

const ROOT = path.resolve(__dirname, "..");
const BASELINE = path.join(ROOT, "docs", "screenshots", "baseline");
const DARK_BASELINE = path.join(ROOT, "docs", "screenshots", "dark");
const FRESH = path.join(__dirname, ".visual-tmp");
const FRESH_DARK = path.join(__dirname, ".visual-tmp-dark");
const TOLERANCE = 0.015;   // proporción de píxeles distintos tolerada (1.5%)

// 1) Recapturar con la misma herramienta (semilla determinista incluida).
fs.rmSync(FRESH, { recursive: true, force: true });
fs.rmSync(FRESH_DARK, { recursive: true, force: true });
execFileSync(process.execPath, [
  path.join(__dirname, "screenshot.js"),
  path.relative(ROOT, FRESH),
  path.relative(ROOT, FRESH_DARK),
], { stdio: "inherit", cwd: __dirname });

// 2) Comparar contra la referencia (baseline claro + dark).
let failed = 0, compared = 0;
function compareDir(baselineDir, freshDir, label) {
  for (const name of fs.readdirSync(baselineDir).sort()) {
    if (!name.endsWith(".png")) continue;
    const tag = label + name;
    const freshFile = path.join(freshDir, name);
    if (!fs.existsSync(freshFile)) { console.log("  ✗ " + tag + ": falta en la captura nueva"); failed++; continue; }
    const a = PNG.sync.read(fs.readFileSync(path.join(baselineDir, name)));
    const b = PNG.sync.read(fs.readFileSync(freshFile));
    if (a.width !== b.width || a.height !== b.height) {
      console.log("  ✗ " + tag + ": tamaños distintos (" + a.width + "x" + a.height + " vs " + b.width + "x" + b.height + ")");
      failed++; continue;
    }
    const diff = pixelmatch(a.data, b.data, null, a.width, a.height, { threshold: 0.12 });
    const ratio = diff / (a.width * a.height);
    compared++;
    if (ratio > TOLERANCE) {
      console.log("  ✗ " + tag + ": " + (ratio * 100).toFixed(2) + "% de píxeles distintos (umbral " + TOLERANCE * 100 + "%)");
      failed++;
    } else {
      console.log("  ✓ " + tag + (diff ? " (" + (ratio * 100).toFixed(3) + "%)" : ""));
    }
  }
}
compareDir(BASELINE, FRESH, "");
compareDir(DARK_BASELINE, FRESH_DARK, "dark/");

console.log("\n" + compared + " comparadas, " + failed + " con diferencias sobre el umbral");
if (failed) {
  console.log("Si el cambio visual es INTENCIONAL: regenerá la referencia con `node screenshot.js` y commiteala.");
  process.exit(1);
}
