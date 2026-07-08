/*
 * games/registry.js — Registro declarativo de los juegos de la suite.
 *
 * Este es el "contrato" que un juego nuevo debe cumplir para aparecer en el
 * launcher (index.html) y en Estadísticas (estadisticas.html): agregarlo a
 * este array es la ÚNICA edición necesaria en esas dos páginas (antes había
 * que tocar el launcher Y estadísticas.html a mano, con el riesgo de que se
 * desincronicen con el manifest de la PWA).
 *
 * Se carga como <script> CLÁSICO y expone `window.GAMES`.
 *
 * Este registro NO migra la lógica de cada juego (motor, reglas, render del
 * tablero): eso sigue viviendo en <juego>.html, que ya funciona, está
 * testeado y no necesita moverse para resolver la duplicación real que existe
 * hoy en el launcher/estadísticas. Ver docs/ARQUITECTURA.md, Fase 4, para la
 * discusión completa de qué se generalizó acá y qué se dejó deliberadamente
 * afuera (la interfaz mount/newGame/serialize/restore del boceto original).
 *
 * Campos de cada entrada:
 *   id        Identificador estable (prefijo de localStorage: "solitario" ->
 *             "solitario.stats"). Debe coincidir con el STORE_NS del juego.
 *   title     Nombre visible (launcher, tarjeta de estadísticas, shortcuts).
 *   href      Archivo HTML del juego.
 *   icon      HTML del ícono (emoji o <svg> inline), usado en el launcher y
 *             en la tarjeta de estadísticas.
 *   statsKey  Clave de localStorage con las estadísticas del juego.
 *   body(stats, h)  Devuelve el HTML de adentro de la tarjeta de
 *             Estadísticas para ESTE juego ("" si nunca se jugó, y
 *             estadisticas.html muestra el estado vacío estándar). Recibe el
 *             objeto de stats ya parseado ({} si no hay guardado) y los
 *             helpers de formato (`h.n`, `h.fmtTime`, `h.rate`, `h.row`,
 *             `h.rowPlayed`) para que todas las tarjetas luzcan consistentes.
 */
(function () {
  // Ícono de Carta Blanca: un naipe blanco de espadas (compartido por el
  // launcher y Estadísticas, que antes tenían cada uno su propia copia).
  var CARTA_BLANCA_ICON =
    '<svg viewBox="0 0 32 32" width="1em" height="1em" aria-hidden="true">' +
    '<rect x="9" y="6" width="17" height="23" rx="3" fill="rgba(0,0,0,0.13)"/>' +
    '<rect x="6" y="3.5" width="18" height="24" rx="3" fill="#fff" stroke="#c9a44a" stroke-width="1.4"/>' +
    '<text x="15" y="21" text-anchor="middle" font-family="Georgia,\'Times New Roman\',serif" ' +
    'font-weight="bold" font-size="16" fill="#1a1a1a">&#9824;</text></svg>';

  window.GAMES = [
    {
      id: "solitario",
      title: "Solitario",
      href: "solitario.html",
      icon: "🃏",
      statsKey: "solitario.stats",
      body: function (st, h) {
        if (!h.n(st.played)) return "";
        return h.rowPlayed(st) +
          h.row("Mejor tiempo", h.fmtTime(st.bestTime)) +
          (st.bestMoves ? h.row("Menos movimientos", st.bestMoves) : "");
      }
    },
    {
      id: "cartablanca",
      title: "Carta Blanca",
      href: "carta-blanca.html",
      icon: CARTA_BLANCA_ICON,
      statsKey: "cartablanca.stats",
      body: function (st, h) {
        if (!h.n(st.played)) return "";
        return h.rowPlayed(st) + h.row("Mejor tiempo", h.fmtTime(st.bestTime));
      }
    },
    {
      id: "corazones",
      title: "Corazones",
      href: "corazones.html",
      icon: "❤️",
      statsKey: "corazones.stats",
      body: function (st, h) {
        if (!h.n(st.played)) return "";
        return h.rowPlayed(st) +
          h.row("Menor puntaje final", (st.bestScore != null ? st.bestScore : "—")) +
          h.row("Lunas disparadas", h.n(st.moons));
      }
    },
    {
      id: "buscaminas",
      title: "Buscaminas",
      href: "buscaminas.html",
      icon: "💣",
      statsKey: "buscaminas.stats",
      // Buscaminas no tiene "jugadas/ganadas" globales: se agrupa por
      // dificultad, así que arma su propia tabla en vez de usar rowPlayed().
      body: function (bm, h) {
        var diffs = [["beginner", "Principiante"], ["intermediate", "Intermedio"], ["expert", "Experto"]];
        var any = diffs.some(function (d) { return bm[d[0]] && h.n(bm[d[0]].played); });
        if (!any) return "";
        var out = '<table><thead><tr><th>Nivel</th><th class="num">Jugadas</th>' +
          '<th class="num">Ganadas</th><th class="num">Mejor</th></tr></thead><tbody>';
        for (var i = 0; i < diffs.length; i++) {
          var d = bm[diffs[i][0]] || {};
          out += '<tr><td>' + diffs[i][1] + '</td><td class="num">' + h.n(d.played) + '</td><td class="num">' +
            h.n(d.won) + ' (' + h.rate(h.n(d.won), h.n(d.played)) + ')</td><td class="num">' + h.fmtTime(d.best) + '</td></tr>';
        }
        return out + '</tbody></table>';
      }
    }
  ];
})();
