// @ts-check
/*
 * shared/storage.js — Persistencia común de la suite: candado multi-pestaña +
 * guardado de la partida en curso.
 *
 * Se carga como <script> CLÁSICO (no módulo) ANTES del script del juego, así
 * define variables/funciones GLOBALES —igual que cuando esto estaba embebido en
 * cada juego— y tanto el juego como los tests las siguen viendo:
 *   window.GAME_KEY, LOCK_KEY, TAB_ID, saveOwner, saveWarned,
 *   refreshSaveLock(), gameSet(), gameDel().
 *
 * La página debe declarar su namespace en el <html>, sin script inline (así
 * no hace falta 'unsafe-inline' en script-src para la CSP; ver
 * docs/ARQUITECTURA.md, Fase 5):
 *   <html lang="es" data-store-ns="solitario">
 *   ...
 *   <script src="shared/storage.js"></script>
 *
 * PREFS_KEY y STATS_KEY siguen en cada juego (no todos las usan igual).
 *
 * Coordinación multi-pestaña: si abrís dos pestañas del mismo juego, sólo la
 * "dueña" persiste la partida (renueva un candado con marca de tiempo). Así dos
 * pestañas no se pisan la misma clave de localStorage.
 */
(function () {
  var NS = document.documentElement.dataset.storeNs;
  if (!NS) throw new Error("shared/storage.js: falta data-store-ns en <html>");

  window.GAME_KEY = NS + ".game";
  window.LOCK_KEY = NS + ".lock";
  var TAB_KEY = NS + ".tab";

  window.TAB_ID = (function () {
    var v; try { v = sessionStorage.getItem(TAB_KEY); } catch (e) {}
    if (!v) {
      v = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      try { sessionStorage.setItem(TAB_KEY, v); } catch (e) {}
    }
    return v;
  })();

  window.saveOwner = false;
  window.saveWarned = false;

  window.refreshSaveLock = function () {
    var l = null; try { l = JSON.parse(/** @type {string} */ (localStorage.getItem(LOCK_KEY))); } catch (e) {}
    var alive = l && typeof l.t === "number" && (Date.now() - l.t) < 6000;
    if (!alive || l.id === TAB_ID) {
      try { localStorage.setItem(LOCK_KEY, JSON.stringify({ id: TAB_ID, t: Date.now() })); } catch (e) {}
      try { l = JSON.parse(/** @type {string} */ (localStorage.getItem(LOCK_KEY))); } catch (e) {}
      saveOwner = !!(l && l.id === TAB_ID);
    } else saveOwner = false;
  };
  refreshSaveLock();
  setInterval(refreshSaveLock, 2500);

  /** @param {string} v */
  window.gameSet = function (v) {
    refreshSaveLock();
    if (!saveOwner) return;
    try { localStorage.setItem(GAME_KEY, v); }
    catch (e) {
      if (!saveWarned) {
        saveWarned = true;
        if (typeof toast === "function") toast("No se pudo guardar el progreso (almacenamiento lleno o restringido).");
      }
    }
  };
  window.gameDel = function () { if (saveOwner) { try { localStorage.removeItem(GAME_KEY); } catch (e) {} } };
})();

/**
 * Validación de valores que vienen de `localStorage` (partida guardada o
 * estadísticas): el origen es COMPARTIDO (p. ej. usuario.github.io), así que
 * otra página del mismo origen podría escribir ahí cualquier cosa — un
 * string donde se espera un número, que después algún juego concatena crudo
 * en `innerHTML` (ver docs/PLAN-2.md, Fase 2). Devuelven el valor sólo si es
 * del tipo/rango esperado; si no, el `def` de repuesto.
 * @param {unknown} v
 * @param {number} def
 */
function asNum(v, def) { return (typeof v === "number" && isFinite(v)) ? v : def; }
/**
 * @param {unknown} v
 * @param {number} min
 * @param {number} max
 * @param {number} def
 */
function asIntInRange(v, min, max, def) {
  return (typeof v === "number" && isFinite(v) && Math.floor(v) === v && v >= min && v <= max) ? v : def;
}
/**
 * @param {unknown} v
 * @returns {number[]}
 */
function asNumArray(v) {
  if (!Array.isArray(v)) return [];
  var out = [];
  for (var i = 0; i < v.length; i++) out.push(asNum(v[i], 0));
  return out;
}

/**
 * makeStats(key) — fábrica mínima de lectura/escritura de estadísticas.
 * `loadStats`/`saveStats`/`bumpStat(field)` eran idénticas en los 4 juegos
 * (leer JSON de localStorage, reescribirlo, sumar 1 a un contador); se
 * extraen acá. `recordWin`/`recordMatchEnd` (qué campos agrega cada juego al
 * ganar: tiempo+movimientos, sólo tiempo, puntaje de partida, récord por
 * dificultad) siguen por juego a propósito — difieren de verdad, así que
 * generalizarlos sería forzar una interfaz común sin un beneficio real.
 * @param {string} key
 */
function makeStats(key) {
  /** @returns {Record<string, any>} */
  function load() {
    try { return JSON.parse(/** @type {string} */ (localStorage.getItem(key))) || {}; }
    catch (e) { return {}; }
  }
  /** @param {Record<string, any>} s */
  function save(s) { try { localStorage.setItem(key, JSON.stringify(s)); } catch (e) {} }
  return {
    load: load,
    save: save,
    /** @param {string} field */
    bump: function (field) { var s = load(); s[field] = (s[field] || 0) + 1; save(s); }
  };
}
