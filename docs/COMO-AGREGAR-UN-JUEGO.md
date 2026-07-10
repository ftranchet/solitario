# Cómo agregar un juego nuevo

Checklist paso a paso para sumar el 5.º juego (o el que sea) **sin romper
nada**. Casi cada paso tiene un test de contrato que lo verifica: si te
olvidás de algo, lo va a decir la suite, no un usuario.

## Los 6 pasos

1. **El motor: `games/<nombre>.js`** (mismo nombre que el HTML: el test de
   contrato lo deriva del `href`). Toda la lógica y el render del juego, como
   `<script>` clásico (sin ES Modules: las globals `state`/`grid`/etc. las
   leen los tests). Elegí además un `id` estable, corto y sin guiones (es el
   prefijo de localStorage: `<id>.game`, `<id>.prefs`, `<id>.stats`); para un
   juego nuevo conviene que nombre e id coincidan (Carta Blanca es la
   excepción histórica: archivo `carta-blanca`, id `cartablanca`).
   - Persistencia: declarar `data-store-ns="<id>"` en `<html>` te da gratis
     `gameSet()`/`gameDel()`/`GAME_KEY` y el candado multi-pestaña
     (`shared/storage.js`). Estadísticas: `makeStats("<id>.stats")`.
   - Incluí `v: 1` en el JSON del guardado y rechazá versiones desconocidas
     al cargar (`if (data.v != null && data.v !== 1) return false`).
   - Validá el guardado al cargar (forma, rangos y **sin elementos
     repetidos**): RNF-04, un guardado corrupto se descarta sin romper.

2. **La página: `<id>.html`.** Copiá la estructura de un juego existente
   (buscaminas.html es la más simple). Lo obligatorio, verificado por el
   test **"Contrato: la estructura de cada página de juego"**:
   - `<html lang="es" data-store-ns="<id>">` — debe coincidir con el `id`
     del registro.
   - El meta viewport con `viewport-fit=cover` (safe areas del notch) y la
     **misma CSP** que las demás páginas (test de CSP).
   - Scripts en este orden: `shared/theme.js`, `shared/pwa.js`,
     `games/registry.js` (en `<head>`); `shared/ui.js`, `shared/storage.js`,
     (`shared/cards.js` si usa cartas), `shared/menu.js` y **al final**
     `games/<id>.js` (en el cierre de `<body>`).
   - Hojas de estilo en orden: `styles/tokens.css` → `styles/base.css` →
     `styles/game.css` → (`styles/cards.css` si usa cartas) →
     `styles/<id>.css`.
   - Estructura de `#app`: `header` (con `.brand`, `.hud`, `.actions`),
     el tablero en el medio, `footer#controls`. El riel lateral de apaisado
     (styles/base.css) depende de esa forma.
   - Modales: `#menu` con `.game-list` VACÍO (lo llena `shared/menu.js`
     desde el registro), `#help`, `#settings` con el toggle de **Tema**
     (3 botones `[data-theme-pref]`), y los botones de cierre con id
     terminado en `-close` (habilita Escape y el foco atrapado de
     `shared/ui.js`).

3. **El CSS propio: `styles/<id>.css`.** Sólo lo específico del juego: el
   chrome común (body, cabecera, modales, menú, segmented, `.pill`) ya viene
   de `styles/game.css`. Consumí los tokens de `styles/tokens.css` (colores)
   para que el modo oscuro se propague solo; si hardcodeás una superficie
   clara, agregá su override `[data-theme="dark"]`.

4. **El registro: `games/registry.js`.** Agregá la entrada `{ id, title,
   href, icon, statsKey, body() }`. Con esto el launcher, Estadísticas y el
   menú 🎮 de todos los juegos se actualizan SOLOS (tests de registro/menú).

5. **La PWA:** sumá el shortcut en `manifest.webmanifest` (test de contrato
   registro↔manifest) y los archivos nuevos a `ASSETS` de `sw.js` (el test
   de precache falla si falta alguno). **Subí `VERSION` de `sw.js`** — la
   guardia de CI (`tests/check-sw-version.sh`) lo exige si cambian assets.

6. **Verificá:** `cd tests && npm test` (la suite completa con tu juego
   cargando en todos los tamaños), `tsc -p .` limpio, y regenerá las
   capturas si cambiaste algo visual (`node screenshot.js`, deterministas).

## Qué NO hace falta

- Tocar `index.html`, `estadisticas.html` ni los menús de los otros juegos:
  se generan desde el registro.
- Ningún build: todo es estático (RNF-01).
- Migrar el motor a una interfaz común: se decidirá recién cuando un juego
  real lo necesite (ver ARQUITECTURA.md, Fase 4).
