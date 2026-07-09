/* ---------- Dificultades ---------- */
var DIFFS = {
  beginner:     { rows: 9,  cols: 9,  mines: 10, label: "Principiante" },
  intermediate: { rows: 16, cols: 16, mines: 40, label: "Intermedio" },
  expert:       { rows: 16, cols: 30, mines: 99, label: "Experto" }
};

/* ---------- Estado ---------- */
var difficulty = "beginner";
var rows, cols, mines, grid;
var started = false, dead = false, won = false;
var generating = false, genToken = 0;   // generación "sin adivinanzas" en curso (asíncrona)
var flags = 0, revealedCount = 0;
var seconds = 0, timerId = null;
var flagMode = false;
var noGuess = true;        // generar tableros resolubles por lógica (sin adivinar)
var hintTimer = null;
var focusedCell = { r: 0, c: 0 };   // celda con tabindex="0" (roving tabindex, ver render())

/* ---------- Construcción ---------- */
function makeGrid() {
  grid = [];
  for (var r = 0; r < rows; r++) {
    var row = [];
    for (var c = 0; c < cols; c++) row.push({ mine: false, revealed: false, flagged: false, count: 0, exploded: false, wrong: false });
    grid.push(row);
  }
}
function neighbors(r, c) {
  var out = [];
  for (var dr = -1; dr <= 1; dr++)
    for (var dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      var nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) out.push([nr, nc]);
    }
  return out;
}
function placeMinesAt(sr, sc) {
  var r, c, i;
  for (r = 0; r < rows; r++) for (c = 0; c < cols; c++) { grid[r][c].mine = false; grid[r][c].count = 0; }
  var forbidden = {};
  forbidden[sr + "," + sc] = 1;
  var safe = neighbors(sr, sc);
  for (i = 0; i < safe.length; i++) forbidden[safe[i][0] + "," + safe[i][1]] = 1;
  var spots = [];
  for (r = 0; r < rows; r++)
    for (c = 0; c < cols; c++)
      if (!forbidden[r + "," + c]) spots.push([r, c]);
  // mezcla parcial (Fisher-Yates) y tomamos las primeras "mines"
  var m = Math.min(mines, spots.length);
  for (i = 0; i < m; i++) {
    var j = i + Math.floor(Math.random() * (spots.length - i));
    var t = spots[i]; spots[i] = spots[j]; spots[j] = t;
    grid[spots[i][0]][spots[i][1]].mine = true;
  }
  for (r = 0; r < rows; r++)
    for (c = 0; c < cols; c++) {
      if (grid[r][c].mine) continue;
      var nb = neighbors(r, c), k = 0;
      for (i = 0; i < nb.length; i++) if (grid[nb[i][0]][nb[i][1]].mine) k++;
      grid[r][c].count = k;
    }
}
/* ¿El tablero actual se puede resolver con pura lógica (sin adivinar) arrancando
   en (sr,sc)? Usa reglas básicas, subconjuntos (1-2) y recuento global de minas. */
function solvableNoGuess(sr, sc) {
  var R = rows, C = cols, total = R * C - mines, revealedSafe = 0, r, c, k;
  var rev = [], flag = [];
  for (r = 0; r < R; r++) { rev[r] = []; flag[r] = []; for (c = 0; c < C; c++) { rev[r][c] = false; flag[r][c] = false; } }
  function reveal(r0, c0) {
    var st = [[r0, c0]];
    while (st.length) {
      var p = st.pop(), cr = p[0], cc = p[1];
      if (rev[cr][cc] || flag[cr][cc] || grid[cr][cc].mine) continue;
      rev[cr][cc] = true; revealedSafe++;
      if (grid[cr][cc].count === 0) {
        var nb = neighbors(cr, cc);
        for (var i = 0; i < nb.length; i++) if (!rev[nb[i][0]][nb[i][1]] && !flag[nb[i][0]][nb[i][1]]) st.push(nb[i]);
      }
    }
  }
  reveal(sr, sc);
  var changed = true, guard = 0, lim = R * C * 4;
  while (changed && revealedSafe < total && guard++ < lim) {
    changed = false;
    // Reglas básicas (1 y 2)
    for (r = 0; r < R; r++) for (c = 0; c < C; c++) {
      if (!rev[r][c] || grid[r][c].count === 0) continue;
      var nb = neighbors(r, c), cov = [], fl = 0;
      for (k = 0; k < nb.length; k++) { if (flag[nb[k][0]][nb[k][1]]) fl++; else if (!rev[nb[k][0]][nb[k][1]]) cov.push(nb[k]); }
      if (!cov.length) continue;
      var rem = grid[r][c].count - fl;
      if (rem === 0) { for (k = 0; k < cov.length; k++) reveal(cov[k][0], cov[k][1]); changed = true; }
      else if (rem === cov.length) { for (k = 0; k < cov.length; k++) flag[cov[k][0]][cov[k][1]] = true; changed = true; }
    }
    if (changed) continue;
    // Regla 3: subconjuntos (1-2). Aplica el primer hallazgo y recalcula.
    var cons = [];
    for (r = 0; r < R; r++) for (c = 0; c < C; c++) {
      if (!rev[r][c] || grid[r][c].count === 0) continue;
      var nb2 = neighbors(r, c), cov2 = [], fl2 = 0;
      for (k = 0; k < nb2.length; k++) { if (flag[nb2[k][0]][nb2[k][1]]) fl2++; else if (!rev[nb2[k][0]][nb2[k][1]]) cov2.push(nb2[k][0] * C + nb2[k][1]); }
      if (cov2.length) cons.push({ cells: cov2, rem: grid[r][c].count - fl2 });
    }
    var done = false, i2, j2, x, y;
    for (i2 = 0; i2 < cons.length && !done; i2++) for (j2 = 0; j2 < cons.length && !done; j2++) {
      if (i2 === j2) continue;
      var A = cons[i2], B = cons[j2];
      if (A.cells.length >= B.cells.length) continue;
      var sub = true;
      for (x = 0; x < A.cells.length; x++) if (B.cells.indexOf(A.cells[x]) < 0) { sub = false; break; }
      if (!sub) continue;
      var diff = [];
      for (y = 0; y < B.cells.length; y++) if (A.cells.indexOf(B.cells[y]) < 0) diff.push(B.cells[y]);
      var rd = B.rem - A.rem;
      if (rd === 0) { for (y = 0; y < diff.length; y++) reveal((diff[y] / C) | 0, diff[y] % C); changed = true; done = true; }
      else if (rd === diff.length) { for (y = 0; y < diff.length; y++) flag[(diff[y] / C) | 0][diff[y] % C] = true; changed = true; done = true; }
    }
    if (changed) continue;
    // Regla 4: recuento global de minas
    var flagged = 0, unk = [], u;
    for (r = 0; r < R; r++) for (c = 0; c < C; c++) { if (flag[r][c]) flagged++; else if (!rev[r][c]) unk.push([r, c]); }
    var remM = mines - flagged;
    if (remM === 0 && unk.length) { for (u = 0; u < unk.length; u++) reveal(unk[u][0], unk[u][1]); changed = true; }
    else if (remM === unk.length && unk.length) { for (u = 0; u < unk.length; u++) flag[unk[u][0]][unk[u][1]] = true; changed = true; }
  }
  return revealedSafe === total;
}
/* "Sin adivinanzas": probar tableros hasta hallar uno resoluble por pura lógica.
   El trabajo (hasta ~1.8s en Experto) se trocea en tandas cortas que ceden el hilo
   entre sí, de modo que el navegador nunca se congela: sigue repintando y respondiendo. */
function generateNoGuess(sr, sc, done) {
  var token = ++genToken;
  var t0 = Date.now(), budget = (rows * cols >= 400 ? 1800 : 900), attempts = 0;
  (function slice() {
    if (token !== genToken) return;        // cancelado (p. ej. "Nueva partida" o cambio de opciones)
    var s0 = Date.now();
    while (attempts < 6000 && (Date.now() - t0) < budget) {
      attempts++;
      placeMinesAt(sr, sc);
      if (solvableNoGuess(sr, sc)) { done(false); return; }   // tablero garantizado por lógica
      if (Date.now() - s0 >= 12) { setTimeout(slice, 0); return; }   // cede el hilo y deja repintar
    }
    done(true);   // sin suerte dentro del presupuesto: queda el último tablero (podría requerir suerte)
  })();
}

/* ---------- Acciones ---------- */
function floodReveal(r, c) {
  var stack = [[r, c]];
  while (stack.length) {
    var p = stack.pop(), cell = grid[p[0]][p[1]];
    if (cell.revealed || cell.flagged || cell.mine) continue;
    cell.revealed = true; revealedCount++;
    if (cell.count === 0) {
      var nb = neighbors(p[0], p[1]);
      for (var i = 0; i < nb.length; i++) {
        var n = grid[nb[i][0]][nb[i][1]];
        if (!n.revealed && !n.flagged && !n.mine) stack.push(nb[i]);
      }
    }
  }
}
function digCell(r, c) {
  if (dead || won || generating) return;
  var cell = grid[r][c];
  if (cell.revealed || cell.flagged) return;
  if (!started) {
    if (noGuess) {
      // Generación troceada: no congela la UI. La carita muestra el ícono de espera mientras tanto.
      generating = true;
      generateNoGuess(r, c, function (fellBack) {
        generating = false;
        started = true; startTimer(); recordPlayed();
        finishDig(r, c); render();
        // "Sin adivinanzas" no es una garantía absoluta: si se agotó el presupuesto
        // de generación, avisamos que este tablero podría requerir adivinar.
        if (fellBack) toast("El tablero era muy complejo de generar: esta partida podría requerir adivinar.");
      });
      return;   // onTap llamará a render() y mostrará el estado "generando"
    }
    placeMinesAt(r, c); started = true; startTimer(); recordPlayed();
  }
  finishDig(r, c);
}
function finishDig(r, c) {
  var cell = grid[r][c];
  if (cell.mine) { cell.revealed = true; cell.exploded = true; loseGame(); return; }
  floodReveal(r, c);
  if (checkWin()) winGame();
}
function chord(r, c) {
  if (dead || won) return;
  var cell = grid[r][c];
  if (!cell.revealed || cell.count === 0) return;
  var nb = neighbors(r, c), f = 0, i;
  for (i = 0; i < nb.length; i++) if (grid[nb[i][0]][nb[i][1]].flagged) f++;
  if (f !== cell.count) return;
  for (i = 0; i < nb.length; i++) {
    var n = grid[nb[i][0]][nb[i][1]];
    if (!n.flagged && !n.revealed) { digCell(nb[i][0], nb[i][1]); if (dead) return; }
  }
}
function toggleFlag(r, c) {
  if (dead || won) return;
  var cell = grid[r][c];
  if (cell.revealed) return;
  cell.flagged = !cell.flagged;
  flags += cell.flagged ? 1 : -1;
}
function checkWin() { return !dead && revealedCount === rows * cols - mines; }
function loseGame() {
  dead = true; stopTimer();
  for (var r = 0; r < rows; r++)
    for (var c = 0; c < cols; c++) {
      var cell = grid[r][c];
      if (cell.mine && !cell.flagged) cell.revealed = true;
      if (cell.flagged && !cell.mine) cell.wrong = true;
    }
  gameDel();
}
function winGame() {
  won = true; stopTimer();
  for (var r = 0; r < rows; r++)
    for (var c = 0; c < cols; c++)
      if (grid[r][c].mine && !grid[r][c].flagged) { grid[r][c].flagged = true; flags++; }
  var record = recordWin();   // una sola fuente de verdad: buscaminas.stats
  gameDel();
  document.getElementById("win-stats").textContent = DIFFS[difficulty].label + " · " + fmtTime(seconds);
  document.getElementById("win-record").hidden = !record;
  document.getElementById("win").hidden = false;
  celebrate();
}

/* ---------- Interacción ---------- */
function onTap(r, c) {
  if (dead || won || generating) return;
  if (started) startTimer();   // reanuda el reloj de una partida restaurada
  var cell = grid[r][c];
  if (flagMode && !cell.revealed) { toggleFlag(r, c); render(); return; }
  if (cell.revealed) { chord(r, c); render(); return; }
  digCell(r, c); render();
}
function onLong(r, c) {
  if (dead || won || generating) return;   // simétrico con onTap: no aceptar entrada mientras se genera el tablero
  if (started) startTimer();   // reanuda el reloj de una partida restaurada
  var cell = grid[r][c];
  if (cell.revealed) { chord(r, c); render(); return; }
  toggleFlag(r, c); render();
}

var press = null;
var MOVE_TOL = 18;   // tolerancia de movimiento del toque largo (px): los dedos "tiemblan" al apretar
function cellOf(target) {
  var t = target && target.closest ? target.closest(".cell") : null;
  if (!t || t.dataset.r == null) return null;
  return [parseInt(t.dataset.r, 10), parseInt(t.dataset.c, 10)];
}
function onPointerDown(e) {
  if (generating) return;                     // ignora toques mientras se genera el tablero
  var rc = cellOf(e.target);
  if (!rc) return;
  if (e.button === 2) { e.preventDefault(); onLong(rc[0], rc[1]); return; } // clic derecho = bandera
  if (e.button != null && e.button > 0) return;
  if (press) return;                          // ya hay un toque en curso: ignorar dedos extra
  clearHint();
  press = { r: rc[0], c: rc[1], fired: false, sx: e.clientX, sy: e.clientY, id: e.pointerId };
  var pr = press;
  press.timer = setTimeout(function () { if (press === pr) { press.fired = true; onLong(press.r, press.c); } }, 380);
}
function onPointerUp(e) {
  if (!press || e.pointerId !== press.id) return;
  clearTimeout(press.timer);
  if (!press.fired) onTap(press.r, press.c);
  press = null;
}
function onPointerMoveDoc(e) {
  if (!press || e.pointerId !== press.id) return;
  if (Math.abs(e.clientX - press.sx) > MOVE_TOL || Math.abs(e.clientY - press.sy) > MOVE_TOL) {
    clearTimeout(press.timer); press = null;
  }
}
function onPointerCancel() { if (press) { clearTimeout(press.timer); press = null; } }

/* ---------- Reloj ---------- */
function startTimer() { if (timerId) return; timerId = setInterval(function () { seconds++; updateHUD(); }, 1000); }
function stopTimer() { if (timerId) clearInterval(timerId); timerId = null; }
function fmtTime(s) { var m = Math.floor(s / 60), x = s % 60; return (m < 10 ? "0" : "") + m + ":" + (x < 10 ? "0" : "") + x; }

/* ---------- Íconos SVG (Fase 3 de docs/PLAN.md, reemplazan a los emojis) ---------- */
var ICON_MINE = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="15" r="6.5"/><path d="M11 8.5C10.3 7 12.7 6.6 12.2 4.8"/><circle cx="12.2" cy="4.2" r="1"/></svg>';
var ICON_FLAG = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3v18"/><path d="M6 4h11l-3 3.5L17 11H6"/></svg>';
var ICON_FLAG_WRONG = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><line x1="5" y1="5" x2="19" y2="19"/><line x1="19" y1="5" x2="5" y2="19"/></svg>';
var ICON_FACE_IDLE = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M8.5 15c1 1 2.2 1.5 3.5 1.5s2.5-.5 3.5-1.5"/><circle cx="9" cy="9.5" r="1"/><circle cx="15" cy="9.5" r="1"/></svg>';
var ICON_FACE_WON = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M8.5 15c1 1 2.2 1.5 3.5 1.5s2.5-.5 3.5-1.5"/><rect x="6.5" y="8.3" width="4.5" height="2.6" rx="1"/><rect x="13" y="8.3" width="4.5" height="2.6" rx="1"/><line x1="11" y1="9.6" x2="13" y2="9.6"/></svg>';
var ICON_FACE_DEAD = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M8.5 16.5c1-1 2.2-1.5 3.5-1.5s2.5.5 3.5 1.5"/><line x1="7.8" y1="8.3" x2="10.2" y2="10.7"/><line x1="10.2" y1="8.3" x2="7.8" y2="10.7"/><line x1="13.8" y1="8.3" x2="16.2" y2="10.7"/><line x1="16.2" y1="8.3" x2="13.8" y2="10.7"/></svg>';
var ICON_FACE_BUSY = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5l3 2"/></svg>';
var ICON_DIG = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M2 22 9 15"/><path d="M13 5.5 18.5 11l-8 8L5 13.5Z"/><path d="M15.5 3 21 8.5"/></svg>';

/* ---------- Render ---------- */
// Navegación por teclado: "roving tabindex" (patrón WAI-ARIA para grillas).
// Sólo UNA celda tiene tabindex="0" a la vez (focusedCell); las flechas mueven
// el foco del DOM entre celdas vecinas y Enter/Espacio dispara onTap(r, c), la
// misma acción que un tap. El resto del tablero queda con tabindex="-1": así
// Tab no obliga a recorrer cientos de celdas para salir del tablero.
function render() {
  var board = document.getElementById("board");
  var hadFocus = board.contains(document.activeElement);
  if (focusedCell.r >= rows) focusedCell.r = rows - 1;
  if (focusedCell.c >= cols) focusedCell.c = cols - 1;
  var html = [];
  for (var r = 0; r < rows; r++) {
    for (var c = 0; c < cols; c++) {
      var cell = grid[r][c];
      var cls = "cell", content = "";
      if (cell.revealed) {
        cls += " revealed";
        if (cell.mine) { cls += cell.exploded ? " mine exploded" : " mine"; content = ICON_MINE; }
        else if (cell.count > 0) { cls += " n" + cell.count; content = cell.count; }
      } else {
        cls += " covered";
        if (cell.flagged) content = cell.wrong ? ICON_FLAG_WRONG : ICON_FLAG;
      }
      var ti = (r === focusedCell.r && c === focusedCell.c) ? "0" : "-1";
      html.push('<div class="' + cls + '" data-r="' + r + '" data-c="' + c + '" tabindex="' + ti + '">' + content + '</div>');
    }
  }
  board.innerHTML = html.join("");
  if (hadFocus) {
    var fe = board.querySelector('.cell[data-r="' + focusedCell.r + '"][data-c="' + focusedCell.c + '"]');
    if (fe) fe.focus();
  }
  document.documentElement.style.setProperty("--cols", cols);
  document.documentElement.style.setProperty("--rows", rows);
  updateHUD();
  document.getElementById("smiley").innerHTML = generating ? ICON_FACE_BUSY : (won ? ICON_FACE_WON : (dead ? ICON_FACE_DEAD : ICON_FACE_IDLE));
  var mode = document.getElementById("btn-mode");
  mode.innerHTML = flagMode ? ICON_FLAG + " Bandera" : ICON_DIG + " Cavar";
  mode.classList.toggle("active", flagMode);
  saveGame();
}
function updateHUD() {
  document.getElementById("time").textContent = fmtTime(seconds);
  document.getElementById("mines").textContent = mines - flags;
}

/* ---------- Pista ---------- */
function clearHint() {
  if (hintTimer) { clearTimeout(hintTimer); hintTimer = null; }
  var hs = document.querySelectorAll(".cell.hint");
  for (var i = 0; i < hs.length; i++) hs[i].classList.remove("hint");
}
function safeByLogic() {
  for (var r = 0; r < rows; r++)
    for (var c = 0; c < cols; c++) {
      var cell = grid[r][c];
      if (!cell.revealed || cell.count === 0) continue;
      var nb = neighbors(r, c), f = 0, covered = [], i;
      for (i = 0; i < nb.length; i++) {
        var n = grid[nb[i][0]][nb[i][1]];
        if (n.flagged) f++;
        else if (!n.revealed) covered.push(nb[i]);
      }
      if (f === cell.count && covered.length) return covered[0];
    }
  return null;
}
function anySafe() {
  for (var r = 0; r < rows; r++)
    for (var c = 0; c < cols; c++) {
      var cell = grid[r][c];
      if (!cell.revealed && !cell.flagged && !cell.mine) return [r, c];
    }
  return null;
}
function onHint() {
  if (dead || won) { toast("Tocá la carita para empezar de nuevo."); return; }
  var rc = started ? (safeByLogic() || anySafe()) : anySafe();
  if (!rc) { toast("No hay una jugada segura."); return; }
  clearHint();
  var e = document.querySelector('.cell[data-r="' + rc[0] + '"][data-c="' + rc[1] + '"]');
  if (e) { e.classList.add("hint"); hintTimer = setTimeout(clearHint, 2200); }
}

/* ---------- Festejo ---------- */
var confettiRAF = null;
function stopConfetti() {
  if (confettiRAF) { cancelAnimationFrame(confettiRAF); confettiRAF = null; }
  var c = document.querySelector(".confetti-canvas");
  if (c) { if (c._onResize) window.removeEventListener("resize", c._onResize); c.remove(); }
}
function celebrate() {
  stopConfetti();
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  var canvas = document.createElement("canvas");
  canvas.className = "confetti-canvas";
  document.body.appendChild(canvas);
  var ctx = canvas.getContext("2d");
  function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
  resize(); canvas._onResize = resize; window.addEventListener("resize", resize);
  var colors = ["#e8b44a", "#c62828", "#1f7a46", "#1f6fd0", "#ffffff", "#ff7ab6"];
  var N = Math.max(80, Math.min(200, Math.round(window.innerWidth / 4)));
  var parts = [];
  for (var i = 0; i < N; i++) parts.push({
    x: Math.random() * canvas.width, y: -20 - Math.random() * canvas.height,
    w: 6 + Math.random() * 6, h: 8 + Math.random() * 8,
    vx: -1.5 + Math.random() * 3, vy: 2 + Math.random() * 3.5,
    rot: Math.random() * Math.PI, vr: -0.2 + Math.random() * 0.4,
    color: colors[Math.floor(Math.random() * colors.length)]
  });
  var DURATION = 4500, start = Date.now();
  function frame() {
    var elapsed = Date.now() - start;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    var fade = elapsed > DURATION - 900 ? Math.max(0, (DURATION - elapsed) / 900) : 1;
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      p.x += p.vx; p.y += p.vy; p.vy += 0.02; p.rot += p.vr;
      if (p.y > canvas.height + 20) { p.y = -20; p.x = Math.random() * canvas.width; }
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.globalAlpha = fade; ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore();
    }
    if (elapsed < DURATION) confettiRAF = requestAnimationFrame(frame);
    else stopConfetti();
  }
  confettiRAF = requestAnimationFrame(frame);
}

/* ---------- Aviso breve ---------- */
// toast() vive en shared/ui.js.

/* ---------- Persistencia ---------- */
var PREFS_KEY = "buscaminas.prefs", STATS_KEY = "buscaminas.stats";
// El candado multi-pestaña y gameSet/gameDel/GAME_KEY viven en shared/storage.js.
function loadStats() { try { return JSON.parse(localStorage.getItem(STATS_KEY)) || {}; } catch (e) { return {}; } }
function saveStats(s) { try { localStorage.setItem(STATS_KEY, JSON.stringify(s)); } catch (e) {} }
function statFor(s, d) { if (!s[d]) s[d] = { played: 0, won: 0 }; return s[d]; }
function recordPlayed() { var s = loadStats(); statFor(s, difficulty).played++; saveStats(s); }
function recordWin() {
  var s = loadStats(), d = statFor(s, difficulty);
  d.won++;
  var record = d.best == null || seconds < d.best;
  if (record) d.best = seconds;
  saveStats(s);
  return record;
}
function savePrefs() { try { localStorage.setItem(PREFS_KEY, JSON.stringify({ difficulty: difficulty, noGuess: noGuess })); } catch (e) {} }
function loadPrefs() {
  try {
    var p = JSON.parse(localStorage.getItem(PREFS_KEY));
    if (p) {
      if (DIFFS[p.difficulty]) difficulty = p.difficulty;
      if (typeof p.noGuess === "boolean") noGuess = p.noGuess;
    }
  } catch (e) {}
}
function saveGame() {
  try {
    if (!started || dead || won) { gameDel(); return; }
    var g = [];
    for (var r = 0; r < rows; r++) for (var c = 0; c < cols; c++) {
      var x = grid[r][c];
      g.push((x.mine ? 1 : 0) | (x.revealed ? 2 : 0) | (x.flagged ? 4 : 0) | (x.count << 3));
    }
    gameSet(JSON.stringify({ difficulty: difficulty, rows: rows, cols: cols, mines: mines, seconds: seconds, g: g }));
  } catch (e) {}
}
function loadGame() {
  try {
    var d = JSON.parse(localStorage.getItem(GAME_KEY));
    if (!d || !DIFFS[d.difficulty] || !Array.isArray(d.g)) return false;
    if (d.rows * d.cols !== d.g.length) return false;
    if (typeof d.mines !== "number" || d.mines < 1) return false;
    // Las minas del tablero guardado deben coincidir con el contador (guardado corrupto)
    var mineBits = 0;
    for (var k = 0; k < d.g.length; k++) {
      var vk = d.g[k];
      if (typeof vk !== "number" || vk < 0) return false;
      if (vk & 1) mineBits++;
    }
    if (mineBits !== d.mines) return false;
    difficulty = d.difficulty; rows = d.rows; cols = d.cols; mines = d.mines;
    seconds = (typeof d.seconds === "number" && d.seconds >= 0) ? d.seconds : 0;
    makeGrid();
    flags = 0; revealedCount = 0;
    for (var r = 0; r < rows; r++) for (var c = 0; c < cols; c++) {
      var v = d.g[r * cols + c], cell = grid[r][c];
      cell.mine = !!(v & 1); cell.revealed = !!(v & 2); cell.flagged = !!(v & 4); cell.count = v >> 3;
      if (cell.flagged) flags++;
      if (cell.revealed) revealedCount++;
    }
    started = true; dead = false; won = false;
    // El reloj no arranca acá: se reanuda con la próxima jugada (onTap/onLong),
    // así abrir la pestaña para mirar no suma tiempo.
    render();
    return true;
  } catch (e) { return false; }
}

/* ---------- Nueva partida ---------- */
function newGame() {
  stopConfetti(); clearHint(); stopTimer();
  generating = false; genToken++;          // cancela una generación "sin adivinanzas" en curso
  if (press) { clearTimeout(press.timer); press = null; }  // cancela long-press pendiente
  var d = DIFFS[difficulty];
  rows = d.rows; cols = d.cols; mines = d.mines;
  makeGrid();
  focusedCell = { r: 0, c: 0 };
  started = false; dead = false; won = false;
  flags = 0; revealedCount = 0; seconds = 0;
  document.getElementById("win").hidden = true;
  render();
}
function setDifficulty(diff) {
  if (!DIFFS[diff]) return;
  difficulty = diff; savePrefs(); updateSettingsUI(); newGame();
}
function setNoGuess(v) {
  noGuess = v; savePrefs(); updateSettingsUI();
  if (started) newGame();   // si ya empezaste, re-reparte para aplicar el modo
}
function updateSettingsUI() {
  var i, a = document.querySelectorAll("[data-diff]");
  for (i = 0; i < a.length; i++) a[i].classList.toggle("active", a[i].dataset.diff === difficulty);
  var b = document.querySelectorAll("[data-noguess]");
  for (i = 0; i < b.length; i++) b[i].classList.toggle("active", (b[i].dataset.noguess === "1") === noGuess);
}

/* ---------- Inicio y eventos ---------- */
loadPrefs();
if (!loadGame()) newGame();
updateSettingsUI();

window.addEventListener("pagehide", saveGame);
document.addEventListener("visibilitychange", function () { if (document.hidden) saveGame(); });

var board = document.getElementById("board");
board.addEventListener("pointerdown", onPointerDown);
board.addEventListener("contextmenu", function (e) { e.preventDefault(); });
window.addEventListener("pointerup", onPointerUp);
window.addEventListener("pointermove", onPointerMoveDoc);
window.addEventListener("pointercancel", onPointerCancel);

// Navegación por teclado (roving tabindex, ver comentario en render()).
board.addEventListener("focusin", function (e) {
  var rc = cellOf(e.target);
  if (!rc) return;
  if (focusedCell.r === rc[0] && focusedCell.c === rc[1]) return;
  var prev = board.querySelector('.cell[tabindex="0"]');
  if (prev) prev.tabIndex = -1;
  e.target.tabIndex = 0;
  focusedCell = { r: rc[0], c: rc[1] };
});
board.addEventListener("keydown", function (e) {
  var rc = cellOf(e.target);
  if (!rc) return;
  var r = rc[0], c = rc[1];
  if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") { e.preventDefault(); onTap(r, c); return; }
  var nr = r, nc = c;
  if (e.key === "ArrowUp") nr = Math.max(0, r - 1);
  else if (e.key === "ArrowDown") nr = Math.min(rows - 1, r + 1);
  else if (e.key === "ArrowLeft") nc = Math.max(0, c - 1);
  else if (e.key === "ArrowRight") nc = Math.min(cols - 1, c + 1);
  else return;
  e.preventDefault();
  var target = board.querySelector('.cell[data-r="' + nr + '"][data-c="' + nc + '"]');
  if (target) target.focus();   // el "focusin" de arriba actualiza tabindex/focusedCell
});

document.getElementById("smiley").onclick = newGame;
document.getElementById("btn-new").onclick = newGame;
document.getElementById("btn-mode").onclick = function () { flagMode = !flagMode; render(); };
document.getElementById("btn-hint").onclick = onHint;
document.getElementById("btn-help").onclick = function () { document.getElementById("help").hidden = false; };
document.getElementById("help-close").onclick = function () { document.getElementById("help").hidden = true; };
document.getElementById("btn-menu").onclick = function () { document.getElementById("menu").hidden = false; };
document.getElementById("menu-close").onclick = function () { document.getElementById("menu").hidden = true; };
document.getElementById("btn-settings").onclick = function () { updateSettingsUI(); document.getElementById("settings").hidden = false; };
document.getElementById("settings-close").onclick = function () { document.getElementById("settings").hidden = true; };
document.getElementById("win-new").onclick = newGame;
document.getElementById("win-close").onclick = function () { document.getElementById("win").hidden = true; stopConfetti(); };

(function () {
  var i, ds = document.querySelectorAll("[data-diff]");
  for (i = 0; i < ds.length; i++) (function (btn) {
    btn.onclick = function () { setDifficulty(btn.dataset.diff); };
  })(ds[i]);
  var ng = document.querySelectorAll("[data-noguess]");
  for (i = 0; i < ng.length; i++) (function (btn) {
    btn.onclick = function () { setNoGuess(btn.dataset.noguess === "1"); };
  })(ng[i]);
})();
