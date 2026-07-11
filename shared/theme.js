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
  // <meta name="theme-color"> no puede leer variables CSS (es un atributo
  // HTML), así que se sincroniza acá con --felt-3 para que la barra del
  // navegador (Android/iOS) también pase a oscuro en vez de quedarse
  // siempre con el verde claro. Lee el valor YA RESUELTO por CSS (no lo
  // duplica a mano): si tokens.css cambia --felt-3, esto se actualiza solo.
  // En la primerísima llamada (antes de que carguen las hojas de estilo,
  // que van DESPUÉS de este script en el <head>) puede no encontrar nada
  // todavía — no importa, el <meta> ya arranca con el valor claro correcto
  // en el HTML, y wireControls() vuelve a llamar esto una vez que el CSS
  // esté listo.
  function syncThemeColorMeta() {
    var meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) return;
    var felt = getComputedStyle(document.documentElement).getPropertyValue("--felt-3").trim();
    if (felt) meta.setAttribute("content", felt);
  }
  function apply() {
    var p = pref();
    var dark = p === "dark" || (p === "auto" && systemDark());
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    syncThemeColorMeta();
  }
  apply();

  // Cambios del tema del sistema: sólo afectan cuando la preferencia es "auto".
  if (typeof window.matchMedia === "function") {
    var mq = matchMedia("(prefers-color-scheme: dark)");
    var onSystemChange = function () { if (pref() === "auto") applyWithFade(); };
    if (typeof mq.addEventListener === "function") mq.addEventListener("change", onSystemChange);
    else if (typeof mq.addListener === "function") mq.addListener(onSystemChange);   // Safari viejo
  }

  // Cambio de tema con fundido suave: View Transitions API como mejora
  // progresiva. Éste es el ÚNICO lugar donde encaja (la Fase 5 de PLAN.md la
  // descartó para el render de los juegos porque su callback no corre
  // sincrónicamente y los motores dependen de "actuar y verificar en el
  // mismo tick"): acá el cambio es puramente visual, la preferencia ya quedó
  // guardada en localStorage de forma síncrona, y quien necesite el valor
  // inmediato lee getThemePref(), no el atributo. Respeta reduced-motion.
  function applyWithFade() {
    var reduce = typeof window.matchMedia === "function" &&
      matchMedia("(prefers-reduced-motion: reduce)").matches;
    var withTransition = /** @type {any} */ (document).startViewTransition;
    if (typeof withTransition === "function" && !reduce) withTransition.call(document, apply);
    else apply();
  }

  window.getThemePref = pref;
  /** @param {string} p  "auto" | "light" | "dark" */
  window.setThemePref = function (p) {
    try {
      if (p === "light" || p === "dark") localStorage.setItem(KEY, p);
      else localStorage.removeItem(KEY);   // "auto" es la ausencia de valor
    } catch (e) {}
    applyWithFade();
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
  if (document.readyState !== "loading") { wireControls(); syncThemeColorMeta(); }
  else addEventListener("DOMContentLoaded", function () { wireControls(); syncThemeColorMeta(); });
})();
