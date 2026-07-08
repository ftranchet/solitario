# Plan de trabajo — Juegos clásicos

**Roadmap por fases (documento vivo)**

| Campo | Valor |
|---|---|
| Estado | Vigente (Fases 0-2 hechas) |
| Versión | 1.2 |
| Fecha | 2026-07-08 |
| Relacionado | [PRD](./PRD.md) · [ARQUITECTURA](./ARQUITECTURA.md) · [CHANGELOG](./CHANGELOG.md) |

> Este es el plan de trabajo **hacia adelante**. Reemplaza y consolida las
> propuestas "Fase 7+" que vivían en `ARQUITECTURA.md` (ya retiradas de ahí para
> no duplicar). El trabajo de reorganización interna ya hecho (la capa
> compartida `shared/` + `styles/` + `games/registry.js`) está documentado en
> `ARQUITECTURA.md` y se da por **terminado**; acá arranca una secuencia nueva
> desde **Fase 0**, ordenada por los tres objetivos del producto.

---

## Objetivos que guían el plan

1. **Robusto y seguro** — agregar un juego debe ser fácil, rápido y sin riesgo
   de romper lo existente.
2. **Adaptable** — se ve bien en cualquier pantalla (PC, celular, tablet) y en
   cualquier orientación (vertical/horizontal).
3. **Estético** — minimalista, prolijo, con sensación de app nativa.

## Principios de ejecución (no negociables)

- **Estático y sin build** (RNF-01): sigue siendo HTML/CSS/JS servible desde
  cualquier hosting estático y jugable offline. Sin bundler ni framework.
- **Incremental**: cada fase es **mergeable por separado** y deja la suite de
  tests **verde** y `tsc` **limpio** como puerta.
- **Verificación real, no aspiracional**: diff de contenido para movimientos
  mecánicos, screenshots antes/después para lo visual, y correr la suite con la
  CSP endurecida como red de seguridad.
- **Sin abstracción prematura**: no se generaliza nada "por las dudas"; una
  pieza se comparte recién cuando hay un segundo consumidor real.

---

## Secuencia de fases

### Fase 0 — Base y red de seguridad · _prep, sin cambios de comportamiento_

Sienta las bases para que todas las fases siguientes sean seguras.

- **Baseline visual**: capturas de referencia de las 6 páginas en los 4
  breakpoints (vertical, apaisado corto, tablet, desktop ancho) para comparar
  regresiones a lo largo del plan.
- **Test de precache automático**: extender el test de contrato para verificar
  que **todo archivo servido** (HTML, CSS, JS, íconos) esté en la lista
  `ASSETS` de `sw.js`. Hoy esa correspondencia se cuida a mano; con más archivos
  por juego (Fase 1) el riesgo de olvidar uno —y romper el offline en
  silencio— crece. Este test convierte ese riesgo en un fallo de CI.

**Puerta:** suite verde + el test nuevo falla si se agrega un archivo fuera de
`ASSETS`.

### Fase 1 — Externalizar el motor de cada juego · _objetivo 1 (robustez + seguridad)_

- Mover el `<script>` inline de cada juego (900–1400 líneas) a
  `games/<juego>.js`, como `<script src>` **clásico** (mismo scope global,
  mismas variables que hoy leen los tests) y **sin cambiar una línea** de esa
  lógica.
- Al dejar de haber JS inline, la CSP de los 4 juegos puede quitar
  `'unsafe-inline'` de `script-src` → **CSP estricta en las 6 páginas sin
  excepción**.
- Es el **habilitante** del resto: un motor en su propio archivo es más fácil
  de iterar (Fases 3 y 5) y queda cubierto por el test de precache de la Fase 0.

**Por qué es seguro:** es el mismo movimiento mecánico ya usado con éxito al
extraer el CSS (Fase 0 del refactor anterior) y los scripts triviales
(`pwa.js`, `launcher.js`). **No** es migrar a la interfaz `mount/serialize/
restore` ni a ES Modules (ver "Fuera de alcance").

**Puerta:** el `.js` extraído es byte-idéntico al bloque original (diff) +
suite verde con la CSP endurecida.

### Fase 2 — Adaptabilidad por orientación y pantalla · _objetivo 2 (responsive)_

- **Layout apaisado en celular** (el hueco real, hoy no cubierto): en
  `@media (orientation: landscape) and (max-height: 500px)`, reubicar los
  controles del header/footer a un **riel lateral** para que el tablero use el
  alto disponible. Verificado por screenshot en ese breakpoint.
- **Buscaminas a CSS**: reemplazar su `setSizes()` de JS por dimensionado CSS
  (`aspect-ratio`, `grid-template-columns: repeat(var(--cols), 1fr)` y
  container queries). Es el único juego donde delegar el tamaño a CSS es seguro
  (grilla de celdas, sin drag). Los juegos de cartas **conservan** su
  posicionamiento por JS: su drag/abanicado lee `CW/CH`, así que moverlo a CSS
  sería reescribir el motor (fuera de alcance por riesgo).

**Puerta:** screenshots comparados en los 4 breakpoints + suite verde.

### Fase 3 — Íconos SVG consistentes · _objetivo 3 (estética)_

- Reemplazar los emojis (💣 🚩 🙂 🎉 🎮 ⚙ 💡 ↶ …) por una familia de íconos
  **SVG minimalista inline** (estilo Lucide/Phosphor). Inline y del mismo
  origen para respetar la CSP estricta (sin fuente de íconos por CDN).
  - **3a — decorativos**: header, opciones, pista, nueva, deshacer, victoria.
    Swap directo, bajo riesgo.
  - **3b — estado de Buscaminas**: mina, bandera, bandera errónea y las caritas
    (🙂/😎/😵/⏳). Toca el `render()`, va con tests.
- Unifica el aspecto entre iOS, Android y Windows (los emojis se ven distinto
  en cada uno y rompen la estética).

**Puerta:** screenshots + tests de Buscaminas verdes.

### Fase 4 — Modo oscuro · _objetivo 3 (estética, requiere decisión de diseño)_

- **No se implementa a ciegas.** Primero se presentan 2–3 paletas concretas
  (p. ej. fieltro esmeralda muy oscuro, cartas gris carbón en vez de blanco
  puro) para elegir una.
- Recién elegida: overrides de los tokens en `tokens.css` bajo
  `@media (prefers-color-scheme: dark)` + un toggle manual persistido en
  preferencias. La arquitectura de tokens ya existente hace que la mecánica sea
  barata; lo que necesita criterio humano es la paleta.

**Puerta:** paleta aprobada + screenshots claro/oscuro de las 6 páginas.

### Fase 5 — Pulido de interacción y actualización · _objetivo 3 + robustez_

- **View Transitions API** como **mejora progresiva** (`if (document.
  startViewTransition)`) y detrás de `prefers-reduced-motion`: animar
  fluidamente los cambios de DOM (carta → fundación, recoger baza) sin pelearse
  con las animaciones actuales.
- **Aviso "hay una versión nueva, recargá"**: `sw.js` ya tiene el listener
  `skip-waiting` sin usar; falta el lado del cliente (detectar
  `registration.waiting`/`updatefound`/`controllerchange` y mostrar un `toast`
  con acción "Recargar"). Cierra un ítem del roadmap del PRD y elimina código
  muerto.

**Puerta:** suite verde; el pulido no debe alterar el resultado de ningún test
existente (es puramente visual y progresivo).

---

## Fuera de alcance (decisiones tomadas, no pendientes)

| Ítem | Por qué no |
|---|---|
| Interfaz `mount/newGame/serialize/restore` + un solo `game-shell.html` | Es la reescritura de mayor riesgo del proyecto para beneficio nulo con 4 juegos que ya andan. Paga su costo recién con un **5.º juego real**; ahí se define en base a lo que ese juego necesite. La Fase 1 es el primer paso hacia ese shell. |
| Migración a ES Modules (big-bang) | Sacaría `state`/`grid`/`players` de `window` y rompería los tests que dependen de esas globals. El objetivo de seguridad (quitar `unsafe-inline`) **no la requiere** (lo logra un `<script src>` clásico). Reconsiderar sólo de forma oportunista. |
| Bundler / Vite / TypeScript real | Contradice RNF-01 (sin build, 100% estático). El chequeo de tipos ya se cubre con `@ts-check` + `tsc` en CI sobre `shared/`. El único dolor real (cache-busting del SW) se resuelve con un script mínimo si se vuelve recurrente, no con un bundler. |
| Paleta apta para daltónicos (4 colores de palo) | Los palos ya se distinguen por **forma** (♠♥♦♣), y rojo-negro no es la confusión típica de protanopia/deuteranopia. No es un gap real. |

## Estado

Estado: ✅ Hecho · 🟡 En curso · ⬜ Pendiente.

| Fase | Alcance | Objetivo | Estado |
|---|---|:---:|:---:|
| 0 | Baseline visual + test de precache automático | 1 | ✅ |
| 1 | Externalizar el motor → CSP estricta en las 6 páginas | 1 | ✅ |
| 2 | Layout apaisado en celular + Buscaminas a CSS | 2 | ✅ |
| 3 | Íconos SVG (decorativos + estado de Buscaminas) | 3 | ⬜ |
| 4 | Modo oscuro (paleta a elegir) | 3 | ⬜ |
| 5 | View Transitions + aviso de actualización del SW | 3 | ⬜ |

## Progreso

- **Fase 0 (hecha).** Capturas de referencia de las 6 páginas en los 4
  breakpoints (`docs/screenshots/baseline/`, generadas con el nuevo
  `tests/screenshot.js`) para comparar regresiones visuales en las fases
  siguientes. Nuevo test de precache (`tests/run.js`) que compara el
  filesystem contra la lista `ASSETS` de `sw.js` sin abrir navegador: falla si
  se sirve un archivo (HTML, CSS, JS, ícono) que no está precacheado.
  Verificado agregando un archivo fuera de `ASSETS` a propósito (el test lo
  detecta) y quitándolo (vuelve a pasar). 53/53 tests verdes.
- **Fase 1 (hecha).** El `<script>` inline de cada juego (900–1400 líneas) se
  movió a `games/<juego>.js` como `<script src>` clásico, sin cambiar una
  línea de la lógica: el contenido de cada archivo nuevo se comparó por
  `diff` contra el bloque original y es **byte-idéntico**. Mismo scope global,
  mismas variables que ya leían los tests (`state`, `players`, `grid`, etc.).
  - **CSP estricta en las 6 páginas sin excepción:** al no quedar JS inline,
    `script-src` de los 4 juegos pasó a `'self'` (sin `'unsafe-inline'`),
    igual que ya tenían `index.html`/`estadisticas.html`. El test de CSP se
    simplificó a una sola lista (antes distinguía "estrictas" de "con script
    inline"); ya no hace falta la distinción.
  - `sw.js` suma los 4 archivos nuevos a `ASSETS` (detectado y forzado por el
    test de precache de la Fase 0) y sube `VERSION` a `v1.8.0` para que los
    clientes instalados tomen la app shell nueva.
  - `tsconfig.json`: el `include` de `games/**/*.js` se acotó a
    `games/registry.js` explícito. Con `checkJs: true` global, `tsc` habría
    empezado a tipar los motores recién externalizados (sin `// @ts-check` ni
    JSDoc) y roto la puerta de CI con cientos de errores — deliberadamente
    **no** se tipan (misma decisión que ARQUITECTURA.md, Fase 5, aplicada
    ahora al archivo en vez de al `<script>` inline).
  - Sin cambios de comportamiento ni visuales: 53/53 tests verdes (incluida
    la suite completa corrida con la CSP endurecida) y `tsc -p .` limpio;
    capturas después de la fase comparadas contra el baseline de la Fase 0
    (mismo layout y estilos; sólo difieren las cartas repartidas, que son
    aleatorias en cada carga).
- **Fase 2 (hecha).**
  - **Riel lateral en apaisado corto.** Nueva regla compartida en
    `styles/base.css` bajo `@media (orientation: landscape) and
    (max-height: 500px)`: `#app` pasa de columna a fila, el `header` se
    convierte en el riel izquierdo y `#controls` (footer) en el riel derecho
    (ambos al 100% del alto, ancho fijo ~112px), así el tablero (`#board`/
    `#play`, el hijo del medio) usa el alto completo en vez de quedar
    apretado entre dos barras horizontales. Los selectores usan el ancestro
    (`header .actions`, `#controls .btn.pill`, etc.) para ganarle en
    especificidad a las reglas `.brand`/`.hud`/`.actions`/`.pill` que cada
    juego declara sin media query, sin tener que duplicar la regla 4 veces.
    - **Bug encontrado y corregido en el camino:** `#app` estaba redefinido
      *idéntico* en las 4 hojas de estilo de cada juego (no sólo en
      `base.css`); por regla de cascada (igual especificidad, orden de
      archivo), esa copia le ganaba a mi `@media` en `base.css` y el layout
      no rotaba a fila. Se resolvió consolidando `#app` en `base.css` (una
      sola definición) y quitando la copia de las 4 hojas — de paso, un
      dedupe real.
    - **Ajuste:** "Buscaminas" es una sola palabra que no entra en 112px;
      se le agregó `overflow-wrap: break-word` al título del riel para que
      parta en dos líneas en vez de desbordar (Solitario/Corazones ya
      entraban en una línea).
    - Verificado con capturas en los 4 breakpoints de los 4 juegos: en
      vertical/tablet/desktop-ancho el layout es **byte-idéntico** al
      baseline de la Fase 0 (la media query no aplica fuera de apaisado
      corto); en apaisado corto, los 4 juegos muestran el riel con todos
      los botones visibles y el tablero usando el alto completo.
  - **Buscaminas a CSS.** `setSizes()` (JS: medía `#boardWrap` en cada
    resize y fijaba `--cell` en px) se eliminó junto con su listener de
    `resize` — 20 líneas menos en `games/buscaminas.js`. El tamaño de celda
    ahora lo calcula CSS puro en `styles/buscaminas.css`:
    - `#boardWrap` es un *query container* (`container-type: size`).
    - `--cell` es un `min()`/`max()` en `calc()` con unidades de container
      query (`cqw`/`cqh`) que replica **la misma fórmula** que tenía el JS
      (ajusta por ancho y por alto disponibles, con el mismo piso de 16px y
      el mismo techo de 44px/60px — 60px vía `@container boardwrap
      (min-width: 1100px)`, el equivalente en container query del viejo
      `window.innerWidth >= 1100`).
    - `.cell` usa `aspect-ratio: 1` en vez de `width`+`height` explícitos
      (mencionado en el plan original).
    - JS sólo sigue declarando `--cols`/`--rows` (la **forma** del tablero,
      no un tamaño en píxeles — eso no es sizing, es estado del juego).
    - **Mejora de correctitud, no buscada a propósito:** el techo de 60px
      ahora se decide por el ancho del *contenedor* (`boardwrap`), no de la
      ventana entera. Con el riel lateral de este mismo Fase 2, el JS viejo
      (`window.innerWidth >= 1100`) habría usado el ancho de ventana
      completo para decidir el techo aunque el tablero tuviera bastante
      menos espacio real (por los rieles) — el CSS nuevo no tiene ese
      problema.
    - Verificado: tamaños de celda calculados (siempre cuadrados, por
      `getBoundingClientRect`) en los 4 breakpoints × 3 dificultades
      coinciden con los que calculaba el JS viejo; capturas idénticas en
      apariencia a las de antes de la migración.
  - **Puerta:** 53/53 tests verdes (repetido 3 veces para descartar el flake
    intermitente ya conocido de un test de teclado de Corazones, ajeno a
    esta fase) + capturas comparadas en los 4 breakpoints. `docs/screenshots/
    baseline/` se regeneró con el estado post-Fase 2 (nueva referencia para
    la Fase 3).
