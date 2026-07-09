# Plan de trabajo — Juegos clásicos

**Roadmap por fases (documento vivo)**

| Campo | Valor |
|---|---|
| Estado | Vigente (Fases 0-2 y 4 hechas; Fase 3 revertida a emojis) |
| Versión | 1.5 |
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
| 3 | Íconos SVG (decorativos + estado de Buscaminas) | 3 | ↩️ revertido a emojis |
| 4 | Modo oscuro (paleta a elegir) | 3 | ✅ |
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
- **Fase 3 (hecha).** Familia de íconos SVG minimalista inline (trazo,
  `stroke-width: 2`, sin relleno — estilo Lucide/Phosphor) reemplazando los
  emojis de la interfaz "de chrome" (no del contenido de juego: los palos
  ♠♥♦♣ de las cartas quedan igual). Nueva clase `.icon` en `styles/base.css`
  (`width/height: 1.1em`, hereda el `font-size` del contexto — botón, celda de
  Buscaminas, carita, ícono de menú — sin overrides por breakpoint).
  - **3a — decorativos.** `header` (menú de juegos), `opciones`, `pista`,
    `nueva`, `deshacer` y `victoria` en los 4 juegos; el menú de navegación
    (`.game-list`, 6 íconos × 4 páginas: Inicio/Solitario/Carta Blanca —ya
    era SVG—/Corazones/Buscaminas/Estadísticas); `games/registry.js` (los
    íconos del launcher y de las tarjetas de Estadísticas comparten la MISMA
    fuente que el menú, ya soportaba `<svg>` inline desde la Fase 4 vieja de
    ARQUITECTURA.md); y los íconos propios de `index.html`/`estadisticas.html`
    (título, enlaces cruzados Inicio ↔ Estadísticas).
  - **3b — estado de Buscaminas.** `render()` en `games/buscaminas.js` pasa de
    `textContent` (emoji) a `innerHTML` (SVG) para: mina revelada, bandera,
    bandera errónea, y las 4 caritas (esperando/ganó/perdió/generando). El
    botón de modo (Cavar/Bandera) también. Sin tests rotos: ninguno dependía
    del texto del emoji, sólo de clases/estado del juego.
  - **Iteración de diseño (no a ciegas).** Se armó un prototipo aislado
    (`tests/screenshot.js`-style, HTML suelto + captura) para revisar cada
    ícono antes de propagarlo a los 6 archivos. Dos correcciones reales
    encontradas ahí: (1) "Nueva" y "Deshacer" habían quedado con el mismo
    trazo por error de copy-paste — se diferenciaron (+ vs. flecha de
    "volver"); (2) el ícono de bomba, con la chispa pegada al círculo, se leía
    como un reloj o el símbolo de Marte (♂), no como una bomba — se separó la
    chispa del cuerpo con un fusible curvo. El ícono de "victoria" (medalla)
    se veía bien chico pero no leía como "victoria" a 56px (el tamaño real
    del modal de victoria); se cambió a un trofeo clásico, más reconocible a
    ese tamaño.
  - **Texto de ayuda.** Los modales "Cómo jugar" mencionaban los botones por
    su emoji viejo ("Tocá 💡 Pista", "Opciones ⚙"); se les sacó el emoji
    (ya no coincide con el botón real) y quedó sólo el nombre en negrita.
  - **Deliberadamente fuera de alcance.** Los contadores del HUD (⏱ tiempo,
    🃏 movimientos, 💣 minas) y el texto decorativo dentro de oraciones
    (🎊/🥳/🎉 en los mensajes de victoria, 💔/🌙 de Corazones, 📋 Puntajes)
    no son "íconos de chrome" en el sentido del punto 3a — quedan para una
    fase futura si hiciera falta.
  - **Puerta:** 53/53 tests verdes, `tsc -p .` limpio, capturas en los 4
    breakpoints de los 6 juegos + estados especiales (menú abierto, modal de
    victoria, celda con mina/bandera, las 4 caritas de Buscaminas) revisadas
    una por una. `docs/screenshots/baseline/` se regeneró como nueva
    referencia para la Fase 4.
  - **Post-Fase 3 (feedback):** se iteró sobre dos íconos flojos (Solitario →
    cartas en abanico, Buscaminas → mina con púas), pero el set SVG en general
    no convenció, así que **se revirtió todo a los emojis** (estado previo a la
    Fase 3). Queda pendiente una **solución superadora** (íconos a la vez
    minimalistas y lindos) antes de reintentarlo. Lo que **sí quedó** de haber
    depurado el problema de "íconos rotos tras actualizar": el service worker
    pasó a **network-first** para HTML/CSS/JS (antes el CSS iba cache-first y
    podía servirse viejo con un HTML nuevo) y `shared/pwa.js` auto-actualiza el
    SW (registro con `updateViaCache:"none"` + recarga única al tomar control
    un SW nuevo). Los atributos de degradación de los SVG se fueron con el
    revert (ya no hay SVG de UI que degradar).
- **Fase 4 (hecha) — paleta "Oscuro total" (cartas negras).** Modo claro/oscuro
  con la arquitectura de tokens ya existente:
  - **`shared/theme.js`** (módulo nuevo, `@ts-check`): resuelve la
    preferencia global (`localStorage["theme"]`: `auto`/`light`/`dark`,
    default `auto`) y fija `data-theme` en `<html>`. Se carga **primero** en
    el `<head>` de las 6 páginas (antes de las hojas de estilo) para que el
    tema quede aplicado **antes del primer pintado** — sin flash. En `auto`
    sigue `prefers-color-scheme` y escucha cambios del sistema en vivo. Expone
    `getThemePref()`/`setThemePref()` y cablea solo cualquier control
    `[data-theme-pref]` de la página.
  - **`styles/tokens.css`**: un bloque `:root[data-theme="dark"]` con la paleta
    Oscuro total (fieltro más oscuro, **cartas gris carbón** vía
    `--card-face-top`/`--paper-*`, palos claros) + un bloque de **overrides**
    para las superficies con color hardcodeado que no salen de tokens
    (`.card-modal` y sus controles, `.seg-btn`, `.game-link`, inputs, dorso de
    la carta, tarjetas de Estadísticas). Todo lo demás se propaga solo porque
    ya leía los tokens. Se tokenizó el blanco de la cara de la carta
    (`--card-face-top`, antes `#fff` hardcodeado en `cards.css`) para poder
    oscurecerla sin tocar el componente.
  - **Toggle en Opciones**: un segmented `Tema: Auto / Claro / Oscuro` (con
    `data-theme-pref`) en el modal de Opciones de los 4 juegos, consistente
    con el control de "Dificultad". La preferencia es **global** (una sola
    para toda la suite) y las 6 páginas la respetan (todas cargan
    `theme.js`), aunque el launcher y Estadísticas no tengan su propio toggle
    (siguen la preferencia guardada o el sistema).
  - **Elección de paleta:** se presentaron 3 paletas con capturas reales
    (Esmeralda oscuro, Grafito nocturno, Oscuro total). Se implementó primero
    Esmeralda (la de menor riesgo) y, tras revisarla, se cambió por **Oscuro
    total** a pedido: un modo oscuro de verdad con las cartas negras. Es la que
    más superficies toca, pero todas se resolvieron con el bloque de overrides
    (sin tocar el modo claro). Cambiar de paleta sigue siendo editar los dos
    bloques de `tokens.css`.
  - **Puerta:** 55/55 tests verdes (uno nuevo: el toggle aplica los tokens
    oscuros + persiste + es global entre páginas; `theme.js` sumado al test de
    `@ts-check` y al de precache), `tsc -p .` limpio, **modo claro
    byte-idéntico** al baseline (los overrides sólo aplican con
    `data-theme="dark"`), y capturas claro/oscuro de las 6 páginas
    (`docs/screenshots/dark/`) + todos los modales (Opciones, menú, ayuda,
    victoria, puntajes) revisados en oscuro.
