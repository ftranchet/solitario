# Changelog

Todos los cambios notables de **Juegos clásicos** se documentan en este archivo.

El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y el
proyecto adhiere (de forma aproximada) a [Versionado Semántico](https://semver.org/lang/es/).

> Las versiones anteriores a `1.1.0` se reconstruyeron a partir del historial de
> Git (el repo no tenía etiquetas). Las fechas corresponden a los commits.

## [No publicado]

### Corregido

- **Service worker servía CSS/JS viejo con HTML nuevo (íconos rotos tras
  actualizar).** El SW cacheaba el CSS/JS con estrategia *stale-while-
  revalidate* (copia de caché primero). Al cambiar estilos en varias fases sin
  subir `VERSION`, un visitante que ya tenía la app cacheada recibía el HTML
  nuevo (con íconos SVG) junto al `styles/base.css` viejo (sin la regla
  `.icon`): los íconos se renderizaban a su tamaño intrínseco (~62px, negros,
  desbordando los botones) y la interfaz se veía rota. Se corrigió de dos
  formas: (1) el código del app shell (HTML, CSS y JS) pasa a **network-first**
  —en línea, las tres piezas se traen siempre de la misma versión y no pueden
  desincronizarse aunque se olvide subir `VERSION`; sin conexión se sirve la
  copia cacheada—; los binarios estáticos (íconos, favicon, manifest) siguen
  *stale-while-revalidate* porque casi nunca cambian y una copia vieja no rompe
  nada. (2) Se subió `VERSION` (ahora `v1.10.0`) para que el SW nuevo reemplace
  al viejo y re-precachee limpio en los clientes que ya tenían la caché
  envenenada. **Test de regresión nuevo**: envenena la caché con un `base.css`
  sin `.icon` y verifica que la recarga en línea igual sirve el CSS fresco.
- **Íconos rotos aunque el CSS esté viejo/ausente (defensa en profundidad).**
  Además del arreglo del service worker, se blindó el problema en dos capas
  más para que un "bloque negro" no vuelva a pasar aunque el CSS de `.icon` no
  llegue:
  - **Atributos de presentación en cada `<svg class="icon">`** (`width`,
    `height`, `fill="none"`, `stroke="currentColor"`, `stroke-width`): sin la
    regla CSS de `.icon`, el ícono ahora degrada a un trazo chico en vez de
    renderizar como un bloque negro a tamaño intrínseco. Con el CSS presente
    la regla gana y el aspecto no cambia (capturas byte-idénticas al baseline).
    **Test nuevo** que verifica que los 63 íconos llevan esos atributos.
  - **Auto-actualización del SW en `shared/pwa.js`**: se registra con
    `updateViaCache: "none"` (el navegador siempre chequea `sw.js` contra la
    red, no contra su caché HTTP) y, cuando un SW nuevo toma el control tras
    una actualización, la página se **recarga una sola vez** sola. Así un
    visitante que quedó con un SW viejo se recupera sin tener que borrar la
    caché a mano.
- **Buscaminas se rompía en navegadores sin container queries.** Al pasar el
  dimensionado del tablero a CSS (Fase 2) quedó dependiendo 100% de las
  unidades `cqw`/`cqh` (soporte desde ~2022), sin respaldo tras eliminar el
  `setSizes()` de JS. Se agregó un `@supports not (width: 1cqw)` que fija un
  tamaño de celda razonable, así el tablero degrada a algo funcional en vez de
  romperse en un navegador viejo.

### Cambiado

- **Diseño (Fase 3 de PLAN.md): íconos SVG en vez de emoji.** Los emojis de
  la interfaz "de chrome" (menú de juegos, opciones, pista, nueva, deshacer,
  victoria, navegación entre pantallas, y el estado de Buscaminas —mina,
  bandera, caritas—) se reemplazaron por una familia de íconos SVG
  minimalista inline (trazo, sin CDN de íconos, respeta la CSP estricta).
  Antes se veían distinto en iOS/Android/Windows (los emojis usan la fuente
  del sistema); ahora son consistentes en todas las plataformas. Nueva clase
  `.icon` compartida en `styles/base.css`. Los palos de las cartas (♠♥♦♣) y
  los contadores del HUD (⏱🃏💣) quedan fuera de este cambio a propósito. Sin
  cambios de comportamiento (53 tests verdes, `tsc -p .` limpio; ninguno de
  los tests dependía del texto de los emojis reemplazados). Ver
  [PLAN.md](./PLAN.md), Fase 3.
- **Arquitectura (Fase 2 de PLAN.md): riel lateral en apaisado corto +
  Buscaminas a CSS.** En `@media (orientation: landscape) and (max-height:
  500px)`, el header y el footer de los 4 juegos pasan de barras horizontales
  a rieles laterales (izquierdo/derecho), así el tablero usa el alto completo
  de la pantalla en vez de quedar apretado entre dos barras. De paso se
  corrigió un bug de cascada real: `#app` estaba redefinido idéntico en las 4
  hojas de estilo de cada juego y esa copia le ganaba al override compartido
  en `styles/base.css`; se consolidó en un solo lugar. El dimensionado de
  Buscaminas (`setSizes()` en JS, medía el contenedor en cada `resize`) se
  reemplazó por CSS puro (`container-type: size` + `calc()`/`min()`/`max()`
  con unidades `cqw`/`cqh` + `aspect-ratio: 1` por celda), con la misma
  fórmula de tamaño (piso 16px, techo 44px/60px) pero ahora basada en el
  contenedor real en vez de `window.innerWidth` — más correcto con el riel
  lateral, que reduce el ancho disponible sin cambiar el de la ventana. Sin
  cambios visuales fuera de apaisado corto (capturas idénticas al baseline de
  la Fase 0 en los otros 3 breakpoints) ni de comportamiento (53 tests
  verdes). Ver [PLAN.md](./PLAN.md), Fase 2.
- **Arquitectura (Fase 1 de PLAN.md): motor de cada juego externalizado + CSP
  estricta.** El `<script>` inline de Solitario, Carta Blanca, Corazones y
  Buscaminas (900-1400 líneas cada uno) se movió a `games/<juego>.js` como
  `<script src>` clásico (mismo scope global, sin ES Modules), byte-idéntico
  al bloque original — verificado por `diff`, sin cambiar una línea de lógica.
  Al no quedar JS inline, `script-src` de las 4 páginas de juego quitó
  `'unsafe-inline'`: **CSP estricta en las 6 páginas sin excepción**. `sw.js`
  precachea los 4 archivos nuevos y sube a `v1.8.0`. Sin cambios de
  comportamiento ni visuales (53 tests verdes, `tsc -p .` limpio; capturas
  comparadas contra el baseline de la Fase 0). Ver [PLAN.md](./PLAN.md),
  Fase 1.

### Agregado

- **Fase 0 de PLAN.md: base y red de seguridad.** Capturas de referencia de
  las 6 páginas en 4 breakpoints (`docs/screenshots/baseline/`, generadas con
  `tests/screenshot.js`) para detectar regresiones visuales en las próximas
  fases. Nuevo test de precache: compara el filesystem contra la lista
  `ASSETS` de `sw.js` y falla si se sirve un archivo no cacheado.

### Corregido

- **Buscaminas:** `onLong()` (bandera por toque largo / clic derecho) ahora
  también ignora la entrada mientras se genera el tablero "sin adivinanzas"
  (`generating`), igual que `onTap()`. Hoy no era alcanzable durante la
  generación (lo bloquea `onPointerDown`), pero deja la función simétrica con
  `onTap` y cierra la misma trampa latente que la auditoría anterior corrigió
  para el teclado.

### Cambiado

- **Documentación:** se consolidó el trabajo hacia adelante en un nuevo
  [PLAN.md](./PLAN.md) (plan por fases desde Fase 0) y se retiraron de
  `ARQUITECTURA.md` las propuestas "Fase 7+" (§12/§13), que quedaban duplicadas.
  `ARQUITECTURA.md` pasa a ser el registro de lo ya construido; el roadmap del
  PRD (§8) apunta a PLAN.md. Se corrigieron referencias y comentarios
  desactualizados (p. ej. una nota de `shared/ui.js` que citaba una fase que
  finalmente no se hizo).

## [1.3.0] — 2026-07-08

Reorganización completa del código en una capa compartida (`shared/`,
`styles/`, `games/registry.js`), sin cambios visuales ni de comportamiento en
ningún juego. Ver [ARQUITECTURA.md](./ARQUITECTURA.md) para el detalle
completo de las 6 fases.

### Cambiado

- **Arquitectura (Fase 1).** La persistencia (candado multi-pestaña + guardado
  de la partida en curso) se extrajo a un módulo compartido `shared/storage.js`,
  usado por los cuatro juegos. Elimina ~30 líneas duplicadas por juego; cada
  juego sólo declara su namespace (`window.STORE_NS`). Sin cambios de
  comportamiento (39 tests verdes; el módulo se sirve también sin conexión).
  Ver [ARQUITECTURA.md](./ARQUITECTURA.md).
- **Arquitectura (Fase 2).** El componente de carta se extrajo a
  `shared/cards.js` (`cardFace`, `rankName`, `cardLabel`, `makeCardEl`) y el
  "chrome" idéntico de la carta (fondo, colores de palo, dorso) a
  `styles/cards.css`, compartidos por Solitario, Carta Blanca y Corazones. Sin
  cambios visuales (verificado por screenshots antes/después) ni de comportamiento
  (39 tests verdes). El layout del índice (`.idx`/`.pip`) sigue por juego porque
  varía a propósito; unificarlo queda para la Fase 6 (decisión de diseño).
- **Arquitectura (Fase 0).** Se agregaron `styles/tokens.css` (design tokens:
  paleta, colores de palo) y `styles/base.css` (reset, fondo, `header`,
  `#controls`, `.btn` y `.toast`, todo verificado como byte-idéntico antes de
  extraerlo), enlazados desde las 6 páginas. `styles/cards.css` pasó a consumir
  los tokens. Sin cambios visuales (screenshots de las 6 páginas) ni de
  comportamiento.
- **Arquitectura (Fase 3).** La función `toast()` (idéntica en los 4 juegos) se
  extrajo a `shared/ui.js`. Nuevo test verifica que los 4 juegos comparten el
  mismo `toast()`. El HUD/header y los modales de cada juego **no** se
  generalizaron: su contenido difiere de verdad entre juegos; unificarlos queda
  para cuando exista el contrato de juego (Fase 4), para no introducir
  abstracción prematura. 40 tests verdes.
- **Arquitectura (Fase 4).** Nuevo `games/registry.js`: registro declarativo de
  los 4 juegos (`id`, `title`, `href`, `icon`, `statsKey`, `body()`). El
  launcher (`index.html`) y `estadisticas.html` ahora **generan** sus
  tiles/tarjetas desde el registro en vez de tenerlos hardcodeados; agregar un
  juego a esas dos pantallas pasa a ser una sola edición. Cuatro tests nuevos
  de "contrato" verifican que el registro, el launcher, estadísticas y los
  `shortcuts` del manifest no divergen. **No** se migró el motor de cada juego
  a una interfaz `mount/newGame/serialize/restore` (ver ARQUITECTURA.md, Fase 4,
  para la justificación: sería el cambio de mayor riesgo del proyecto para
  beneficio externo nulo hoy). Sin cambios visuales (screenshots del launcher y
  de estadísticas con datos). 44 tests verdes.
- **Arquitectura (Fase 5): tipos, CSP y auditoría de seguridad.**
  - **Seguridad:** auditoría completa de XSS — el único input de usuario de
    toda la suite (nombres de rivales en Corazones) ya se escapaba
    correctamente en los 4 puntos donde llega a `innerHTML`. Test de
    regresión nuevo con un payload `<img onerror=...>`.
  - **CSP:** las 6 páginas declaran `Content-Security-Policy`. Se
    externalizaron los últimos scripts inline (registro del SW a
    `shared/pwa.js`; namespace de persistencia a un atributo `data-store-ns`;
    lógica de `index.html`/`estadisticas.html` a `shared/launcher.js` /
    `shared/estadisticas-page.js`) y el `<style>` restante de las 6 páginas a
    `styles/<página>.css`. Resultado: `index.html`/`estadisticas.html` con CSP
    **totalmente estricta**; los 4 juegos, estrictos salvo `'unsafe-inline'`
    en `script-src` (el motor de cada juego sigue siendo un `<script>` inline
    a propósito, ver Fase 4). Verificado corriendo toda la suite **con la CSP
    puesta**: cualquier violación real se ve como error de consola y tira el
    test.
  - **Tipos:** `// @ts-check` + JSDoc en los 7 archivos de `shared/` y
    `games/registry.js`, con `shared/global.d.ts` (declaraciones ambientales)
    y un `tsconfig.json` en modo `strict`. Validado con el compilador real de
    TypeScript: 0 errores. Paso nuevo en el CI (`.github/workflows/tests.yml`).
  - Sin cambios visuales (screenshots de las 6 páginas) ni de comportamiento.
    47 tests verdes en total.
- **Arquitectura (Fase 6): navegación por teclado, foco visible y responsive.**
  - **Teclado (RNF-08):** antes no existía ningún soporte (cero `tabindex`,
    cero `keydown`). Nuevo `keyActivate()` en `shared/ui.js` da `tabindex="0"`
    a un elemento y activa Enter/Espacio llamando a la **misma función que ya
    usa el click** — nunca una reimplementación de reglas. Aplicado a cartas y
    huecos clickeables en Solitario/Carta Blanca, a las cartas jugables de
    Corazones. Buscaminas usa el patrón WAI-ARIA de **roving tabindex** (una
    sola celda alcanzable por Tab a la vez, flechas para moverse, Enter para
    cavar) en vez de dar tabindex a las 480 celdas de un tablero Experto.
  - **Foco visible:** `:focus-visible` (dorado de marca) en botones, cartas y
    celdas.
  - **`prefers-reduced-motion` completo:** extendido a todas las animaciones
    decorativas de los 4 juegos (antes sólo cubría una) y al confeti (JS):
    `celebrate()` no dibuja nada si el usuario lo prefiere así.
  - **Responsive:** se encontró y corrigió un desperdicio real de espacio en
    pantallas anchas (el tablero de Buscaminas, por ejemplo, quedaba diminuto
    en una esquina en desktop) subiendo el techo de tamaño de carta/celda a
    partir de 1100px de ancho.
  - **No implementado, a propósito:** temas claro/oscuro (decisión de diseño
    que requiere validación visual humana) y paleta apta para daltónicos
    (repriorizada hacia abajo: los palos ya se distinguen por forma, no sólo
    por color).
  - Verificado con screenshots (foco visible, breakpoints responsive) y 4
    tests nuevos que disparan eventos de teclado reales (no llaman a la
    función de juego directamente). 51 tests verdes en total.

### Corregido

- **Auditoría final antes de mergear a `main`.** Revisión completa de las 6
  fases en conjunto (no sólo cada una por separado), buscando bugs de
  integración, duplicación remanente y documentación desactualizada:
  - **Buscaminas:** `onTap()` (el punto de entrada compartido por mouse y
    teclado) no frenaba la entrada mientras el tablero "sin adivinanzas" se
    generaba en segundo plano (`generating === true`). Con mouse esto no se
    notaba porque `onPointerDown` ya bloqueaba todo antes de llegar a
    `onTap`, pero el atajo de teclado de la Fase 6 llama a `onTap()`
    directo, así que se podía poner una bandera durante la generación. Se
    agregó el mismo freno que ya tenía `digCell()`. Nuevo test de regresión
    que dispara el escenario real (genera un tablero Experto y prueba
    `onTap` en otra celda mientras `generating` sigue en `true`).
  - **Solitario / Carta Blanca:** el patrón `el.onclick = fn; keyActivate(el,
    fn);` se repetía idéntico 6 veces (3 por juego) en los huecos clickeables
    (mazo, columna vacía, fundación vacía). Se extrajo a `clickActivate(el,
    fn)` en `shared/ui.js`.
  - Dos reglas de foco nuevas (`.recycle:focus-visible` etc.) usaban el hex
    `#e8b44a` en vez de `var(--gold)`, rompiendo la convención de tokens
    seguida en el resto de la Fase 0 (mismo valor, sin cambio visual).
  - **Documentación desactualizada:** el README seguía diciendo "cada juego
    es un único archivo HTML autocontenido, sin dependencias" — ya no es
    cierto tras las Fases 0-6. `tests/README.md` no mencionaba ninguno de los
    tests de registro, seguridad, tipos o teclado agregados en las Fases 4-6.
    `ARQUITECTURA.md` seguía encabezado como "Propuesta" pese a estar
    implementada. El changelog acumulaba las 6 fases bajo "[No publicado]"
    sin cortar versión pese a haberse mergeado a `main` varias veces durante
    la sesión; se corta como `1.3.0` acá.
  - Verificado: `tsc -p .` limpio y 52/52 tests verdes (1 nuevo) después de
    cada corrección.

## [1.2.0] — 2026-07-07

Refinamientos de la PWA (revisión propia) y mejoras a partir de un feedback
externo de código.

### Agregado

- **Accesibilidad (primera pasada):** las cartas exponen un `aria-label`
  legible (p. ej. «Reina de corazones») con `role="img"`, de modo que los
  lectores de pantalla dejan de leer los símbolos `♠♥♦♣` sueltos. Las cartas
  boca abajo **no** revelan su identidad. Los avisos (toast) y el estado de
  Corazones se anuncian con `role="status"` / `aria-live`.
- **Buscaminas:** aviso cuando el modo «sin adivinanzas» no logra un tablero
  garantizado dentro del presupuesto de generación (la partida podría requerir
  adivinar). Antes caía a un tablero normal en silencio.
- **Guardado:** aviso **único** cuando no se puede guardar el progreso
  (almacenamiento lleno o modo restringido), en vez de fallar en silencio.
- **Tests:** fallback de «sin adivinanzas», offline por página (MPA), aviso de
  guardado y `aria-label` de las cartas (39 en total).

### Cambiado

- **Corazones:** la mano usa **delegación de eventos** (un único listener) en
  lugar de un listener por carta en cada render, consistente con
  Solitario/Carta Blanca.
- **Service worker:**
  - `activate` limpia sólo las cachés propias (por prefijo); no toca las de
    otras apps del mismo origen (p. ej. `usuario.github.io`).
  - _network-first_ sólo cachea respuestas OK (una 404/500 transitoria no pisa
    la copia buena precacheada).
  - Sin conexión sirve la copia de **la página pedida**; ya no cae a
    `index.html` (evita mostrar una página bajo la URL de otra en una app
    multipágina).
- **iOS instalado:** las cabeceras de los juegos, el launcher y estadísticas
  respetan `env(safe-area-inset-top)` para no quedar tapados por la barra de
  estado.

## [1.1.0] — 2026-07-07

### Agregado

- **PWA (Progressive Web App):** la suite ahora es instalable y se puede jugar
  **sin conexión**.
  - `manifest.webmanifest` con nombre, colores de marca, `display: standalone`,
    íconos y accesos directos (shortcuts) a los cuatro juegos.
  - Service worker (`sw.js`) que precachea el _app shell_ (los HTML, íconos y
    manifest) e implementa _network-first_ para documentos y
    _stale-while-revalidate_ para estáticos.
  - Juego de íconos PNG (`icons/`): 192 y 512 px (`any`), 192 y 512 px
    (`maskable`) y `apple-touch-icon` de 180 px para iOS.
  - Metadatos PWA en las 6 páginas (`manifest`, `apple-touch-icon`,
    `apple-mobile-web-app-*`, `mobile-web-app-capable`, `description`) y registro
    del service worker.
- **Documentación de producto:** PRD (`docs/PRD.md`) con seguimiento de
  requisitos, este changelog y el historial de revisiones.
- **Tests:** dos pruebas nuevas de PWA (manifest e íconos válidos; el service
  worker sirve la app sin conexión). El servidor de pruebas ahora sirve
  `.webmanifest`/`.json` con el MIME correcto.

## [1.0.0] — 2026-07-02

### Agregado

- Suite de tests de navegador ampliada a 32 casos: persistencia, reglas de juego
  y UI.

### Corregido

- Bugs de lógica, validaciones reforzadas y renders optimizados en los cuatro
  juegos.

## [0.9.0] — 2026-06-25

### Agregado

- Suite de tests de navegador (Playwright) que abre los HTML reales.
- Workflow de GitHub Actions que corre los tests en cada push y Pull Request.

### Corregido

- Corazones: cuelgue al terminar la mano (colisión `history` vs `window.history`).
- Cinco problemas de UX y robustez repartidos por los juegos.

## [0.5.0] — 2026-06-24

### Agregado

- Buscaminas con generador «sin adivinanzas» (tableros resolubles por lógica).
- Marca **Carta Blanca** y logo nuevo en menús y estadísticas.
- Corazones: se muestran las cartas de cada mano; rivales con nombre editable y
  tabla de puntajes.

### Corregido

- Varios bugs de render en Corazones y mayor robustez general.

## [0.3.0] — 2026-06-23

### Agregado

- **Launcher** de inicio (`index.html`) que enlaza toda la suite.
- **Carta Blanca** (FreeCell), **Corazones** (Hearts) y **Buscaminas**.
- Pantalla de estadísticas.

### Corregido

- Bug de timers y mejoras de robustez.

## [0.1.0] — 2026-06-21 a 2026-06-22

### Agregado

- **Solitario** (Klondike) inicial, luego renombrado a la app principal.
- Persistencia de preferencias y de la partida en curso con `localStorage`.
- Cartas responsive a dos colores, festejo al ganar, resaltado de «Nueva» cuando
  no hay jugadas, doble clic para mover, y crédito de autor.

[No publicado]: https://github.com/ftranchet/solitario/compare/main...HEAD
