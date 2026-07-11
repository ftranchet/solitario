// @ts-check
/*
 * shared/pwa.js — Registro del service worker + aviso de actualización.
 *
 * Idéntico en las 6 páginas; se carga como <script> CLÁSICO, ANTES que
 * shared/ui.js (que ni siquiera se enlaza en index.html/estadisticas.html) —
 * por eso el aviso se arma acá mismo con DOM plano en vez de reusar toast().
 * Extraído para poder aplicar una Content-Security-Policy sin `unsafe-inline`
 * en script-src (ver docs/ARQUITECTURA.md, Fase 5): un <script src="..."> externo
 * no cuenta como "inline" para la CSP, aunque el contenido sea el mismo de
 * siempre.
 *
 * Actualización con aviso (Fase 5 de docs/PLAN.md): `sw.js` ya NO llama
 * self.skipWaiting() en su instalación, así que cuando hay una versión nueva
 * el SW queda "esperando" (`registration.waiting`) sin tomar el control todavía
 * — el viejo sigue sirviendo esta pestaña hasta que el usuario decide recargar.
 * Flujo:
 *   - `updateViaCache: "none"`: el navegador nunca sirve sw.js desde su caché
 *     HTTP al chequear actualizaciones — siempre lo trae de la red, así detecta
 *     una versión nueva enseguida.
 *   - Si ya hay un SW esperando (`registration.waiting`) o aparece uno nuevo
 *     (`updatefound` → el `installing` pasa a "installed"), y esta pestaña ya
 *     tenía un SW activo controlándola (si no, es la primera visita: nada que
 *     avisar), mostramos un aviso con botón "Recargar".
 *   - Al tocar "Recargar": le mandamos "skip-waiting" al SW en espera (dispara
 *     el listener de `message` en sw.js) y recargamos apenas toma el control
 *     (`controllerchange`). Si otra pestaña dispara la actualización primero,
 *     esta también recarga al recibir ese mismo evento — todas las pestañas
 *     quedan sincronizadas en la misma versión.
 */
if ("serviceWorker" in navigator) {
  var hadController = !!navigator.serviceWorker.controller;
  var reloading = false;

  /** @param {ServiceWorkerRegistration} reg */
  function showUpdateToast(reg) {
    if (document.querySelector(".toast-action")) return; // ya se está mostrando
    var t = document.createElement("div");
    t.className = "toast toast-action";
    t.setAttribute("role", "status");
    var span = document.createElement("span");
    span.textContent = "Hay una versión nueva.";
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn primary";
    btn.textContent = "Recargar";
    btn.onclick = function () {
      btn.disabled = true;
      if (reg.waiting) reg.waiting.postMessage("skip-waiting");
      // Si el SW en espera ya no está (otra pestaña lo activó primero, o el
      // navegador lo activó solo al no quedar clientes) no hay a quién
      // mandarle skip-waiting: recargamos directo en vez de dejar el botón
      // deshabilitado sin que pase nada. `reloading` evita una recarga
      // doble si el controllerchange real llega igual, justo después.
      else if (!reloading) { reloading = true; location.reload(); }
    };
    t.appendChild(span);
    t.appendChild(btn);
    document.body.appendChild(t);
    setTimeout(function () { t.classList.add("show"); }, 10);
  }

  navigator.serviceWorker.addEventListener("controllerchange", function () {
    if (hadController && !reloading) {
      reloading = true;
      location.reload();
    }
  });

  addEventListener("load", function () {
    navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).then(function (reg) {
      if (!hadController) return; // primera visita: no hay "versión nueva" que avisar
      if (reg.waiting) { showUpdateToast(reg); return; }
      reg.addEventListener("updatefound", function () {
        var installing = reg.installing;
        if (!installing) return;
        var worker = installing;
        worker.addEventListener("statechange", function () {
          if (worker.state === "installed" && navigator.serviceWorker.controller) {
            showUpdateToast(reg);
          }
        });
      });
    }).catch(function () {});
  });
}
