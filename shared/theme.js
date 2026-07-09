// @ts-check
/*
 * shared/theme.js — Tema claro/oscuro (Fase 4 de docs/PLAN.md).
 *
 * Se carga como <script> CLÁSICO y PRIMERO en el <head> (antes de las hojas de
 * estilo), así fija `data-theme` en <html> ANTES del primer pintado y no hay
 * "flash" del tema equivocado.
 *
 * Preferencia global —una sola para toda la suite— en localStorage["theme"]:
 *   (sin valor) / "auto"  -> sigue el sistema (prefers-color-scheme)
 *   "light"               -> siempre claro
 *   "dark"                -> siempre oscuro
 *
 * El CSS sólo mira `:root[data-theme="dark"]` (ver styles/tokens.css); acá
 * resolvemos "auto" a claro/oscuro concreto y escuchamos cambios del sistema.
 * Expone getThemePref()/setThemePref() para la UI de preferencias y cablea
 * solo cualquier control con [data-theme-pref] que exista en la página.
 */
(function () {
  var KEY = "theme";
  function pref() {
    try {
      var v = localStorage.getItem(KEY);
      return (v === "light" || v === "dark") ? v : "auto";
    } catch (e) { return "auto"; }
  }
  function systemDark() {
    return typeof window.matchMedia === "function" &&
      matchMedia("(prefers-color-scheme: dark)").matches;
  }
  function apply() {
    var p = pref();
    var dark = p === "dark" || (p === "auto" && systemDark());
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  }
  apply();

  // Cambios del tema del sistema: sólo afectan cuando la preferencia es "auto".
  if (typeof window.matchMedia === "function") {
    var mq = matchMedia("(prefers-color-scheme: dark)");
    var onSystemChange = function () { if (pref() === "auto") apply(); };
    if (typeof mq.addEventListener === "function") mq.addEventListener("change", onSystemChange);
    else if (typeof mq.addListener === "function") mq.addListener(onSystemChange);   // Safari viejo
  }

  window.getThemePref = pref;
  /** @param {string} p  "auto" | "light" | "dark" */
  window.setThemePref = function (p) {
    try {
      if (p === "light" || p === "dark") localStorage.setItem(KEY, p);
      else localStorage.removeItem(KEY);   // "auto" es la ausencia de valor
    } catch (e) {}
    apply();
  };

  // Cablea los controles de tema (p. ej. el segmented de Opciones). Marca el
  // botón activo según la preferencia y persiste al tocar. Funciona en
  // cualquier página que tenga botones [data-theme-pref], sin código por juego.
  function wireControls() {
    var btns = document.querySelectorAll("[data-theme-pref]");
    function refresh() {
      var p = pref();
      for (var i = 0; i < btns.length; i++) {
        var el = /** @type {HTMLElement} */ (btns[i]);
        el.classList.toggle("active", el.getAttribute("data-theme-pref") === p);
      }
    }
    for (var i = 0; i < btns.length; i++) {
      (function (el) {
        el.addEventListener("click", function () {
          window.setThemePref(el.getAttribute("data-theme-pref") || "auto");
          refresh();
        });
      })(/** @type {HTMLElement} */ (btns[i]));
    }
    refresh();
  }
  if (document.readyState !== "loading") wireControls();
  else addEventListener("DOMContentLoaded", wireControls);
})();
