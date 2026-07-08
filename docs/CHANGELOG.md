# Changelog

Todos los cambios notables de **Juegos clásicos** se documentan en este archivo.

El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y el
proyecto adhiere (de forma aproximada) a [Versionado Semántico](https://semver.org/lang/es/).

> Las versiones anteriores a `1.1.0` se reconstruyeron a partir del historial de
> Git (el repo no tenía etiquetas). Las fechas corresponden a los commits.

## [No publicado]

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
