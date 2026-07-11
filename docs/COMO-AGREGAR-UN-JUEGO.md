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
     (`shared/cards.js` si usa cartas, `shared/drag.js` si además arrastra
     con puntero estilo Solitario/Carta Blanca — Corazones no lo necesita,
     su interacción es sólo clic/toque), `shared/menu.js` y **al final**
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

## Cuándo cambia el formato de guardado (migración de esquema)

Hoy los 4 juegos tienen `v: 1` y el piso es "todo o nada": `if (data.v !=
null && data.v !== 1) return false` descarta cualquier guardado que no sea
exactamente `v: 1` (correcto mientras sólo existió una forma). El día que
un juego necesite cambiar la FORMA del guardado (agregar un campo
obligatorio, partir uno en dos, cambiar un enum), ese piso se queda corto:
tirar toda la partida en curso de un usuario por un cambio que el propio
código sabe traducir es peor experiencia de la necesaria. El patrón a
seguir, para no improvisarlo distinto en cada juego:

1. **Subí `v` a 2** en el juego que cambia (los otros 3 quedan en su propio
   `v` — no es un valor compartido entre juegos).
2. **Escribí una función de migración** `migrateV1(data)` que devuelve el
   objeto en la forma de `v: 2` (o `null` si no puede migrarlo — datos
   faltantes, tipo inesperado). Vive junto al resto de la persistencia del
   juego, no en `shared/storage.js` (la migración es 100% específica del
   juego; `shared/storage.js` no conoce la forma de ningún guardado).
3. **En el loader:** si `data.v === 2`, validar y usar directo; si
   `data.v === 1`, pasar por `migrateV1()` y validar el resultado con el
   MISMO validador que usa un guardado `v: 2` fresco (nunca un validador
   aparte para datos migrados — si pasa la migración tiene que ser
   indistinguible de un guardado nativo); si `migrateV1()` devuelve `null`
   o la validación falla, descartar como hoy (RNF-04: nunca romper, en el
   peor caso se pierde la partida en curso, no el resto del estado).
   Cualquier `data.v` que no sea ni 1 ni 2 se descarta (un guardado de una
   versión FUTURA, escrito por una versión más nueva de la app, no se
   intenta interpretar).
4. **No hace falta reescribir el guardado migrado en el momento**: el
   próximo `gameSet()` (la próxima jugada) ya lo persiste en `v: 2`: la
   migración vive sólo en el camino de lectura.
5. **Test de regresión obligatorio** (mismo patrón que ya cubre el rechazo
   de guardados corruptos): sembrar un `localStorage` con un payload
   `v: 1` real, recargar, y verificar que la partida se restaura
   correctamente en la forma `v: 2`.
6. **Cuándo ya no hace falta la migración**: cuando el `v: 1` real deja de
   aparecer en guardados de usuarios activos (regla práctica: cuando el
   PRD lo decida, no una fecha fija) se puede borrar `migrateV1()` y volver
   al piso simple `if (data.v !== N) return false` — documentado en el
   changelog como un cambio deliberado, no un descuido.
