# Plan de trabajo — Juegos clásicos

**Roadmap por fases (documento vivo)**

| Campo | Valor |
|---|---|
| Estado | Vigente |
| Versión | 1.0 |
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
| 0 | Baseline visual + test de precache automático | 1 | ⬜ |
| 1 | Externalizar el motor → CSP estricta en las 6 páginas | 1 | ⬜ |
| 2 | Layout apaisado en celular + Buscaminas a CSS | 2 | ⬜ |
| 3 | Íconos SVG (decorativos + estado de Buscaminas) | 3 | ⬜ |
| 4 | Modo oscuro (paleta a elegir) | 3 | ⬜ |
| 5 | View Transitions + aviso de actualización del SW | 3 | ⬜ |
