# Propuesta de arquitectura — Juegos clásicos

**ADR / RFC de arquitectura (documento vivo)**

| Campo | Valor |
|---|---|
| Estado | **Aceptada** — en ejecución |
| Versión | 0.2 |
| Fecha | 2026-07-08 |
| Autor | Francisco Tranchet + IA |
| Relacionado | [PRD](./PRD.md) · [CHANGELOG](./CHANGELOG.md) |

> Este documento propone reorganizar el proyecto para que **agregar juegos no
> rompa nada** y para que la suite sea **robusta, segura y visualmente
> consistente en múltiples pantallas**. Es una propuesta: no cambia código
> todavía. El seguimiento vive en la sección [10. Estado y seguimiento](#10-estado-y-seguimiento).

---

## 1. Contexto

Hoy cada juego es **un único archivo HTML autocontenido** (HTML + CSS + JS
inline), sin dependencias ni build. Eso fue la decisión correcta cuando había
un solo juego. Con 4 juegos + PWA + suite de tests, esa misma regla
(**RNF-01** del PRD) pasó a ser la principal fuente de riesgo.

### El problema, en concreto

El código común está **duplicado 4 veces** (una por juego) y tiende a
desincronizarse. Ejemplos reales del repo actual:

| Duplicado en los 4 juegos | Dónde |
|---|---|
| `SUIT` / `RANK_LABEL`, `cardFace()`, `makeCardEl()`, `cardLabel()` | render de cartas |
| `toast()`, helper `el()` | UI |
| Candado multi-pestaña completo: `TAB_ID`, `LOCK_KEY`, `refreshSaveLock()`, `saveOwner`, `gameSet()`, `gameDel()`, aviso de guardado | persistencia |
| Lectura/escritura de stats (`STATS_KEY`) | estadísticas |
| Bloque `<head>` de PWA + registro del service worker | 6 páginas |
| Valores de diseño (verde fieltro, dorado, sombras, radios), `safe-area`, header | CSS |

**Costo observado:** cada arreglo transversal de esta sesión (safe-area de iOS,
aviso de guardado, `aria-label`, delegación de eventos) se aplicó entre **4 y 6
veces**, a mano. Agregar un 5.º juego hoy significa copiar ~50 KB de _shell_ y
volver a heredar todos los bugs.

## 2. Objetivos y no-objetivos

### Objetivos

- **O1.** Agregar un juego nuevo sin tocar (ni arriesgar) los existentes.
- **O2.** Un solo lugar por cada pieza común (persistencia, cartas, UI, PWA, stats).
- **O3.** Robustez verificable: contrato de juego + tests que lo hagan cumplir.
- **O4.** Seguridad razonable (CSP, sin XSS por `innerHTML`).
- **O5.** Sistema de diseño consistente y buen comportamiento multi-pantalla.
- **O6.** Seguir siendo **estático** (apto para GitHub Pages) y **offline**.

### No-objetivos

- **No** adoptar un framework de UI (React/Svelte/…). Ver [§4](#4-alternativas-consideradas).
- **No** dejar de ser una PWA multipágina (mantenemos URLs por juego).
- **No** un big-bang: la migración es **incremental**, con los tests verdes en
  cada paso.

## 3. Decisión propuesta

**Extraer el código común a una capa compartida de módulos vanilla + CSS,
sin framework y (al inicio) sin paso de build.** Cada juego pasa a ser una
página HTML **delgada** que:

1. enlaza el CSS compartido (design tokens + base + cartas),
2. importa los módulos compartidos (persistencia, cartas, UI, PWA, stats),
3. carga su propio módulo con **sólo la lógica y las reglas** del juego.

Se mantiene el modelo **multipágina** (una URL/archivo por juego) para no
perder el trabajo de PWA/offline ya hecho.

Robustez: adoptar **chequeo de tipos gradual** con `// @ts-check` + JSDoc en la
capa compartida (cero build). Si más adelante conviene, graduar a TypeScript
real con esbuild.

## 4. Alternativas consideradas

| Alternativa | Veredicto | Motivo |
|---|---|---|
| **Módulos vanilla compartidos** (propuesta) | ✅ Elegida | Elimina la duplicación, sin toolchain, sigue estático/offline; los tests actuales sirven de red. |
| Seguir con un archivo por juego | ❌ | Es exactamente el problema: no escala a más juegos. |
| Build ligero (esbuild/Vite) desde el día 1 | 🟡 Después | Da minify, hashing de caché y TS real, pero suma toolchain. Se puede sumar en una 2.ª etapa sin rehacer nada. |
| Framework (React/Svelte/Solid) | ❌ | Juegos imperativos con drag y render a mano; el framework cobra un bundler y una reescritura para resolver algo que los módulos ya resuelven. |
| SPA con router en vez de MPA | ❌ | Tiraría el modelo offline por página ya funcionando; complica el SW sin beneficio claro. |

## 5. Arquitectura objetivo

### 5.1 Estructura de carpetas (propuesta)

```
/
  index.html                 launcher (se arma desde el registro de juegos)
  estadisticas.html          agrega stats leyendo el registro
  solitario.html             página delgada -> importa shared + games/solitario
  carta-blanca.html
  corazones.html
  buscaminas.html
  games/
    solitario.js             sólo reglas/estado/dibujo del Solitario
    carta-blanca.js
    corazones.js
    buscaminas.js
    registry.js              lista declarativa de juegos (el contrato)
  shared/
    cards.js                 SUIT/RANK, mazo, mezcla (LCG), makeCardEl, cardLabel (a11y)
    msdeal.js                reparto FreeCell determinista (hoy embebido en Carta Blanca)
    storage.js               candado multi-pestaña, gameSet/gameDel, aviso, validación
    stats.js                 lectura/escritura y agregación de estadísticas
    ui.js                    toast, modal, header/HUD, safe-area
    pwa.js                   registro del service worker
    a11y.js                  helpers de accesibilidad
  styles/
    tokens.css               design tokens (colores, radios, sombras, escalas)
    base.css                 reset, layout, header, safe-area
    cards.css                componente “carta”
    themes.css               claro/oscuro, alto contraste, palos daltónicos
  sw.js  manifest.webmanifest  icons/  tests/  docs/
```

### 5.2 Contrato de juego

Cada juego implementa una interfaz común; el _shell_ compartido le da
persistencia, PWA, header, stats y a11y “gratis”.

```js
/**
 * @typedef {Object} Game
 * @property {string} id            Identificador estable, p. ej. "solitario".
 * @property {string} title         Nombre visible, p. ej. "Solitario".
 * @property {string} icon          Emoji o SVG para el launcher.
 * @property {(root: HTMLElement) => void} mount   Arma la UI dentro de root.
 * @property {(seed?: number) => void} newGame     Empieza una partida nueva.
 * @property {() => object} serialize              Estado serializable para guardar.
 * @property {(data: object) => boolean} restore   Valida y restaura; false si es inválido.
 * @property {StatsSchema} stats                   Cómo se agregan sus estadísticas.
 * @property {() => void} [destroy]                Limpieza (listeners, timers).
 */
```

`registry.js` declara los juegos disponibles. **Agregar un juego = agregarlo al
registro + implementar el contrato.** El launcher y la pantalla de estadísticas
se generan a partir del registro (no se editan a mano por cada juego nuevo).

## 6. Plan por fases (incremental, tests verdes en cada paso)

Cada fase es mergeable por separado y no debe romper los 39 tests.

- **Fase 0 — Estructura y diseño.** Crear `/shared`, `/styles`, `/games`.
  Extraer los **design tokens** y el CSS base/cartas a `/styles` y enlazarlos
  (dedupe visual, sin cambiar el aspecto).
- **Fase 1 — Persistencia (`storage.js`).** Lo más duplicado y más riesgoso:
  candado multi-pestaña + `gameSet/gameDel` + aviso de guardado + validación.
  Un solo lugar, bien testeado.
- **Fase 2 — Cartas (`cards.js` + `cards.css`).** Componente de carta unificado,
  `SUIT`/`RANK`, `cardLabel` (a11y), reparto determinista (`msdeal.js`).
- **Fase 3 — UI (`ui.js`).** `toast`, modal, header/HUD, safe-area.
- **Fase 4 — Contrato + registro.** Definir la interfaz, migrar cada juego a
  implementarla; regenerar launcher y estadísticas desde `registry.js`.
- **Fase 5 — Tipos + seguridad.** `// @ts-check` + JSDoc en `/shared`; CSP sin
  `unsafe-inline` (habilitado al externalizar el JS) + auditoría de XSS.
- **Fase 6 — Diseño y a11y.** Temas (claro/oscuro, `prefers-reduced-motion`),
  responsive con container queries, navegación por teclado y foco visible.

## 7. Seguridad

- **XSS / `innerHTML`.** Los juegos arman HTML por concatenación. Hay input de
  usuario (los **nombres editables de rivales en Corazones**). Hoy `renderOpp`
  usa `esc()` — correcto —, pero hay que **auditar que todos** los puntos que
  interpolan nombres estén escapados (modal de puntajes, etc.) y centralizarlo
  en un helper seguro (o `textContent`).
- **CSP.** Hoy no se puede aplicar una `Content-Security-Policy` estricta porque
  el JS es inline. **Externalizar el JS (Fase 1+) habilita** una CSP sin
  `unsafe-inline` — la mejor mejora de seguridad, y la desbloquea el propio
  refactor.
- **Superficie ya buena:** sin backend, sin dependencias de terceros, sin CDNs;
  validación defensiva del estado al cargar; SW con caché por prefijo.

## 8. Diseño y multi-pantalla

- **Design tokens** en `tokens.css` (colores de marca, radios, sombras, escalas
  de espaciado y tipografía) → consistencia real y temas fáciles.
- **Temas:** claro/oscuro (respetando `prefers-color-scheme`), alto contraste y
  opción de **palos aptos para daltónicos** (4 colores en vez de 2).
- **Responsive:** container queries para el tablero; mejores layouts en apaisado
  y en pantallas grandes (hoy se capa el ancho y se desaprovecha el desktop);
  `prefers-reduced-motion` para las animaciones.
- **Componente de carta** único con variantes; opción de figuras J/Q/K para pulir.

## 9. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| **Los tests dependen de globals** (`state`, `players`, `phase`, `legalCards`, `makeCardEl`, `digCell`, `grid`…). Al pasar a módulos, dejan de estar en `window` y **los tests se rompen**. | Exponer una **superficie de test** explícita (p. ej. `window.__test = { ... }` sólo fuera de producción) y/o migrar los tests junto con cada fase. Sumar **tests unitarios puros** de reglas/solver, que no dependen del DOM. |
| Más archivos → el SW debe precachear todo y versionar la caché. | Generar la lista de precache desde un manifiesto y **subir `VERSION`** en cada deploy (ya documentado en el SW). |
| Regresiones visuales al extraer CSS. | Extraer sin cambiar valores primero (Fase 0); comparar por screenshot. |
| Migración a medias que deje el repo inconsistente. | Fases pequeñas y **mergeables**, con los 39 tests verdes como puerta. |
| Perder el “abrir el `.html` desde `file://`”. | Trade-off aceptado: ya hay PWA + hosting; se documenta. |

## 10. Estado y seguimiento

Estado: ✅ Hecho · 🟡 En curso · ⬜ Pendiente · 💡 Propuesto.

| Fase | Alcance | Estado |
|---|---|:---:|
| 0 | Estructura de carpetas (`/shared`, `/styles`) + design tokens | 🟡 |
| 1 | `storage.js` (persistencia compartida) | ✅ |
| 2 | `cards.js` + `cards.css` (chrome) | ✅ |
| 3 | `ui.js` | 💡 |
| 4 | Contrato + registro de juegos | 💡 |
| 5 | Tipos (`@ts-check`) + CSP + auditoría XSS | 💡 |
| 6 | Temas, responsive, a11y por teclado | 💡 |

**Progreso**

- **Fase 1 (hecha).** El candado multi-pestaña + `gameSet`/`gameDel`/`GAME_KEY`
  se extrajeron a `shared/storage.js`, cargado como `<script>` clásico (para
  preservar el acceso global del que dependen juegos y tests). Cada juego sólo
  declara su namespace (`window.STORE_NS`). Se eliminaron ~30 líneas duplicadas
  por juego, sin cambios de comportamiento: **39/39 tests verdes**, incluida la
  verificación de que el módulo se sirve **offline** desde la caché del SW.
- **Fase 2 (hecha).** El componente de carta (`cardFace`, `rankName`,
  `cardLabel`, `makeCardEl`) se extrajo a `shared/cards.js`, y el "chrome"
  idéntico de la carta (fondo, colores de palo, dorso) a `styles/cards.css`,
  compartidos por los 3 juegos con cartas. **Sin cambios visuales** (verificado
  por screenshots antes/después) ni de comportamiento (39/39 tests).
  El layout del índice (`.idx`/`.pip`) sigue por juego porque **varía a
  propósito** (Corazones apila rango y palo; Solitario/Carta Blanca los ponen en
  fila). Unificarlo cambiaría el aspecto de Corazones: es una **decisión de
  diseño** que queda para la Fase 6.
- **Fase 0 (en curso).** Ya existen `/shared` y `/styles`. Falta extraer los
  design tokens (colores, radios, sombras, escalas) a `styles/tokens.css`.

### Criterios de aceptación (cuando esté todo)

- Agregar un juego = implementar el contrato + registrarlo; **cero** ediciones
  en los otros juegos.
- Un **test de contrato** verifica que todo juego del registro: carga sin
  errores, persiste y restaura, registra stats, tiene shortcut en el manifest y
  queda cacheado offline.
- Una CSP estricta (sin `unsafe-inline`) activa.
- Sin duplicación de `SUIT`/cartas/persistencia/UI/stats entre juegos.

## 11. Decisión

**Aceptada.** El trabajo se ejecuta por fases (ver §10). Cada fase es mergeable
por separado y mantiene los 39 tests verdes como puerta.
