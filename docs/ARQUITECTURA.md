# Arquitectura — Juegos clásicos

**ADR de arquitectura (documento vivo)**

| Campo | Valor |
|---|---|
| Estado | **Aceptada — implementada** (Fases 0-6 completas); **Fase 7+ propuesta**, pendiente de aprobación (§12) y **revisada contra un feedback externo (§13)** |
| Versión | 0.5 |
| Fecha | 2026-07-08 |
| Autor | Francisco Tranchet + IA |
| Relacionado | [PRD](./PRD.md) · [CHANGELOG](./CHANGELOG.md) |

> Este documento registra por qué y cómo se reorganizó el proyecto para que
> **agregar juegos no rompa nada** y para que la suite sea **robusta, segura y
> accesible en múltiples pantallas**. Las 6 fases del plan (§6) ya están
> implementadas; el detalle de qué se hizo y qué se dejó deliberadamente
> afuera en cada una vive en la sección [10. Estado y seguimiento](#10-estado-y-seguimiento).
> La sección [12](#12-próxima-secuencia-propuesta-fase-7) revisa esos alcances
> acotados uno por uno y propone una nueva secuencia — **todavía no ejecutada**.
> La sección [13](#13-revisión-de-un-feedback-externo-y-secuencia-revisada-fase-7)
> contrasta esa secuencia con un feedback externo de arquitectura/diseño y la
> reordena (Fases 7-12) — también **pendiente de aprobación**.

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

### 5.1 Estructura de carpetas

> Actualizado post-Fase 6 para reflejar lo **realmente implementado** (la
> versión original de esta sección era aspiracional; §10 y §12.1 explican
> cada diferencia — `msdeal.js` y `a11y.js` no se crearon como archivos
> aparte a propósito, `games/*.js` con el motor de cada juego es la Fase 7
> propuesta en §12.2, todavía no implementada).

```
/
  index.html                 launcher (se arma desde games/registry.js)
  estadisticas.html          agrega stats leyendo el registro
  solitario.html             motor todavía inline (ver §12.2, Fase 7 propuesta)
  carta-blanca.html
  corazones.html
  buscaminas.html
  games/
    registry.js              lista declarativa de juegos (el contrato liviano, §5.2)
  shared/
    cards.js                 SUIT/RANK, mazo, mezcla (LCG), makeCardEl, cardLabel (a11y)
    storage.js               candado multi-pestaña, gameSet/gameDel, aviso, validación
    ui.js                    toast, keyActivate/clickActivate (a11y de teclado)
    pwa.js                   registro del service worker
    launcher.js              lógica propia de index.html
    estadisticas-page.js     lógica propia de estadisticas.html
    global.d.ts              declaraciones ambientales para @ts-check
  styles/
    tokens.css               design tokens (colores, radios, sombras, escalas)
    base.css                 reset, layout, header, safe-area, toast
    cards.css                componente “carta” (chrome compartido)
    <juego>.css / launcher.css / estadisticas.css   CSS propio de cada página
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

> **Nota (post-Fase 4):** lo implementado es un contrato **más liviano** que el
> boceto de arriba: `{ id, title, href, icon, statsKey, body(stats, h) }` (ver
> `games/registry.js`). Cubre exactamente lo que hoy es responsabilidad del
> launcher/estadísticas. Los campos `mount`/`newGame`/`serialize`/`restore`/
> `destroy` quedan como diseño de referencia para el día que se agregue un
> juego que realmente necesite compartir el ciclo de vida con el shell — no se
> implementaron para los 4 juegos actuales porque hacerlo hoy no resuelve
> ningún problema real y sí introduce el riesgo más alto de todo este trabajo
> (ver el detalle en Fase 4, §10).

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

> Estado real tras la auditoría de la Fase 5: ver el detalle en §10. Resumen:
> la suite ya escapaba correctamente el único input de usuario que existe
> (nombres de rivales en Corazones); se agregó CSP estricta en todas las
> páginas salvo `script-src` en los 4 juegos (brecha documentada, ligada a no
> haber migrado el motor de cada juego fuera del `<script>` inline).

- **XSS / `innerHTML`.** Los juegos arman HTML por concatenación. Hay input de
  usuario (los **nombres editables de rivales en Corazones**). `renderOpp`,
  `showRound`, `showWin`/`scoreRow` y `buildScoresTable` usan `esc()` en los
  cuatro puntos donde un nombre llega a `innerHTML`; dos usos adicionales sin
  `esc()` son seguros porque bajan por `.textContent`. Test de regresión con
  un payload `<img onerror=...>` cubre las 4 superficies.
- **CSP.** Aplicada vía `<meta>` en las 6 páginas. `index.html`/
  `estadisticas.html`: estricta (sin `unsafe-inline` en ningún directive). Los
  4 juegos: `script-src` necesita `'unsafe-inline'` (motor todavía inline,
  decisión de la Fase 4); `style-src` y el resto son estrictos en las 6.
- **Superficie ya buena:** sin backend, sin dependencias de terceros, sin CDNs;
  validación defensiva del estado al cargar; SW con caché por prefijo.

## 8. Diseño y multi-pantalla

> Estado real tras la Fase 6: ver el detalle en §10. Resumen: se implementó
> navegación por teclado completa, foco visible y `prefers-reduced-motion`
> completo; se corrigió un desperdicio de espacio real en desktop. Los temas
> claro/oscuro quedan deliberadamente **sin implementar** (decisión de diseño
> que requiere criterio visual humano, no una extracción mecánica); la opción
> de paleta apta para daltónicos se **reevaluó como de menor prioridad** de lo
> que se pensaba al escribir este documento.

- **Design tokens** en `tokens.css` (colores de marca, radios, sombras, escalas
  de espaciado y tipografía) → consistencia real y temas fáciles.
- **Temas:** claro/oscuro (respetando `prefers-color-scheme`) — **no
  implementado**, ver §10. Alto contraste y **palos aptos para daltónicos** (4
  colores en vez de 2) — **repriorizado hacia abajo**, ver §10.
- **Responsive:** mejores layouts en pantallas grandes (antes se capaba el
  ancho y se desaprovechaba el desktop) — **hecho** con un ajuste acotado
  (subir el techo de tamaño de carta/celda en pantallas anchas), no con
  container queries (no hicieron falta para resolver el defecto real
  encontrado). `prefers-reduced-motion` — **hecho**, completo en los 4 juegos.
- **Navegación por teclado y foco visible** (ítem "Alta prioridad" del
  roadmap) — **hecho**: las cartas/celdas son alcanzables por teclado y
  Enter/Espacio reproduce la misma acción que un click, sin duplicar reglas
  de juego. Ver §10 para el detalle, en particular el caso de Buscaminas
  (roving tabindex, no 480 tab-stops).
- **Componente de carta** único con variantes; opción de figuras J/Q/K para
  pulir — no abordado, queda como pulido menor a futuro.

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
| 0 | Estructura de carpetas (`/shared`, `/styles`) + design tokens | ✅ |
| 1 | `storage.js` (persistencia compartida) | ✅ |
| 2 | `cards.js` + `cards.css` (chrome) | ✅ |
| 3 | `ui.js` (toast) | ✅ |
| 4 | Contrato + registro de juegos | ✅ (alcance acotado) |
| 5 | Tipos (`@ts-check`) + CSP + auditoría XSS | ✅ (alcance acotado) |
| 6 | Temas, responsive, a11y por teclado | ✅ (alcance acotado; temas afuera) |

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
- **Fase 0 (hecha).** `styles/tokens.css` define los design tokens (paleta
  verde fieltro, dorado, superficies claras, colores de palo) y
  `styles/base.css` los consume en las reglas verificadas como **byte-idénticas**
  en las 6 páginas: reset, fondo del body, `header`, `#controls`, `.btn` (y sus
  variantes `:active`/`:disabled`/`.ghost`/`.primary`) y `.toast`/`.toast.show`.
  `styles/cards.css` (Fase 2) también pasó a consumir los tokens. Cada página
  conserva su propio `body {}` para lo que sí varía (layout fijo de los juegos
  vs. scroll del launcher/estadísticas) y sus reglas específicas
  (`.btn.attention`, `.btn.active`, `.card-modal .btn.primary`, etc.), que no
  eran idénticas y por lo tanto no se movieron. **Sin cambios visuales**
  (screenshots de las 6 páginas) ni de comportamiento (39/39 tests antes de
  sumar los de Fase 3).
- **Fase 3 (hecha, alcance acotado).** Se extrajo `shared/ui.js` con la función
  `toast()` —idéntica en los 4 juegos salvo por el helper `el()` que Buscaminas
  no tiene; la versión compartida no depende de `el()`—. El resto de lo listado
  originalmente bajo "ui.js" (header/HUD y modal) **no se generalizó**: el HUD
  difiere en contenido real entre juegos (tiempo/movimientos vs. mano/objetivo)
  y los modales tienen contenido propio por juego (victoria vs. fin de mano vs.
  ayuda); forzar una interfaz común ahí sería una abstracción prematura antes de
  tener el contrato de juego (Fase 4). Se decidió honestamente **no** incluirlos
  para no acumular complejidad sin un beneficio real todavía.
- **Fase 4 (hecha, alcance deliberadamente acotado).** Se creó
  `games/registry.js`: un array declarativo (`window.GAMES`) con `id`, `title`,
  `href`, `icon`, `statsKey` y `body(stats, helpers)` (el HTML de la tarjeta de
  Estadísticas de ESE juego). `index.html` (launcher) y `estadisticas.html`
  ahora **generan** sus tiles/tarjetas iterando el registro, en vez de tenerlos
  hardcodeados; el botón "Reiniciar estadísticas" también itera el registro
  para borrar las claves. **Esto sí resuelve una duplicación real y de alto
  riesgo:** antes, agregar un 5.º juego exigía editar a mano `index.html`,
  `estadisticas.html` y `manifest.webmanifest` (shortcuts) por separado, sin
  nada que avisara si se olvidaba uno o quedaban desincronizados. Ahora sólo
  hay que sumarlo a `games/registry.js` (el manifest de la PWA sigue siendo un
  archivo aparte porque su *sintaxis* la define el estándar de Web App
  Manifest, pero un **test de contrato** nuevo verifica que registro y
  manifest listen exactamente los mismos juegos, así que una futura
  desincronización la detecta la suite, no un usuario).

  **Lo que NO se hizo, a propósito.** El boceto original de §5.2 (interfaz
  `Game` con `mount(root)`, `newGame()`, `serialize()`, `restore()`,
  `destroy()`) **no se implementó** para los 4 juegos existentes. Migrar el
  motor de cada juego (~900 a ~1400 líneas por archivo) a esa interfaz habría
  sido, por lejos, el cambio de mayor riesgo de todo este trabajo — reescribir
  cómo cada juego arranca, consulta el DOM y guarda su estado, para un
  beneficio externo nulo hoy: los 4 juegos ya andan, ya están testeados y no
  necesitan "montarse" en ningún otro lado. Esa interfaz sólo paga su costo el
  día que se agregue un **5.º juego real**: ahí, si conviene compartir más que
  el registro (por ejemplo un layout de tablero o un bucle de turnos), se
  define recién en base a lo que ese juego concreto necesita — no antes, por
  las dudas. Hacerlo ahora habría sido la abstracción prematura que este mismo
  documento advierte evitar en la sección de No-objetivos.
- **Test de contrato (nuevo).** Cuatro tests verifican: (1) el registro declara
  los 4 juegos con todos los campos requeridos; (2) el launcher se genera desde
  el registro (mismos hrefs/títulos, mismo orden); (3) estadísticas se genera
  desde el registro (mismos `statsKey`); (4) el registro y los `shortcuts` del
  manifest **no divergen**. 44/44 tests verdes; sin cambios visuales
  (screenshots del launcher y de estadísticas con datos).
- **Fase 5 (hecha, alcance deliberadamente acotado).** Tipos + CSP + auditoría XSS.

  **Auditoría de XSS (resultado: la suite ya era segura).** Se revisó cada
  punto donde datos con input libre del usuario (los **nombres editables de
  rivales en Corazones**, el único "texto libre" de toda la suite) llegan a
  `innerHTML`. Los cuatro puntos que lo hacen (`renderOpp`, `showRound`,
  `showWin`/`scoreRow`, `buildScoresTable`) ya usaban `esc()`. Dos usos de
  `playerName()` sin `esc()` resultaron seguros porque bajan por `.textContent`
  (no interpreta HTML); se documentaron con un comentario en vez de agregarles
  `esc()` (hacerlo ahí sería un bug: doble-escapado visible). Se encontraron y
  corrigieron 2 atributos `style="..."` inline en `corazones.html` (movidos a
  clases CSS) porque bloqueaban un `style-src` estricto. **Test de regresión
  nuevo:** inyecta `<img src=x onerror=...>` como nombre de rival y verifica
  que no se ejecuta y que las 4 superficies lo muestran como texto escapado.

  **CSP.** Las 6 páginas declaran `Content-Security-Policy` vía `<meta>` (el
  hosting estático no permite headers HTTP custom). Se logró una política
  **estricta de verdad**, no aspiracional:
  - Se externalizaron los últimos scripts inline triviales: el registro del
    service worker (idéntico en las 6 páginas) a `shared/pwa.js`; el
    namespace de persistencia (`window.STORE_NS`) pasó a ser un atributo
    `data-store-ns` en `<html>` (sin script); y la lógica propia de
    `index.html`/`estadisticas.html` a `shared/launcher.js` /
    `shared/estadisticas-page.js`.
  - Se extrajo el `<style>` restante de las 6 páginas a `styles/<página>.css`
    (mecánico, sin lógica, verificado por screenshot), lo que permite
    `style-src 'self'` estricto **en las 6 páginas sin excepción**.
  - Resultado: `index.html` y `estadisticas.html` (sin ningún script inline)
    tienen `script-src 'self'` **sin** `'unsafe-inline'`. Los 4 juegos
    **siguen necesitando `'unsafe-inline'` en script-src**, documentado como
    brecha conocida: su motor (900-1400 líneas) sigue siendo un `<script>`
    inline a propósito (ver Fase 4 — migrarlo sería el mismo riesgo alto que
    ya se descartó). Todo lo demás (`style-src`, `img-src`, `object-src
    'none'`, `base-uri`, `form-action`) es estricto en las 6 páginas.
  - **Verificación real, no aspiracional:** correr la suite completa CON la
    CSP aplicada sirve de red de seguridad — cualquier violación real
    (recurso bloqueado, script no permitido) aparece como `console.error` y
    tira el test correspondiente (`assertNoErrors`). Los 47 tests pasan con
    la CSP puesta, incluidos drag & drop, modales, IA de Corazones y el
    service worker. Test nuevo dedicado verifica el contenido exacto de la
    CSP en las 6 páginas (para detectar si una edición futura la afloja sin
    querer).

  **Tipos (`// @ts-check` + JSDoc).** Se agregó a los 7 archivos de la capa
  compartida (`shared/storage.js`, `cards.js`, `ui.js`, `pwa.js`, `launcher.js`,
  `estadisticas-page.js`, `games/registry.js`) junto con `shared/global.d.ts`
  (declaraciones ambientales para las globals que cruzan archivos: `SUIT`,
  `toast`, `GAME_KEY`, `GAMES`, etc.) y un `tsconfig.json` en modo **`strict`**.
  Validado con el compilador real de TypeScript (`tsc -p .`), no a ojo: **0
  errores**. El chequeo corrigió 2 usos reales de `localStorage.getItem()`
  (puede devolver `null`) sin el guard correspondiente, y se sumaron
  null-checks a dos `getElementById()` en `launcher.js`/`estadisticas-page.js`
  (defensivo; el elemento siempre existe hoy). Se agregó como paso de CI en
  `.github/workflows/tests.yml` y un test verifica que los 7 archivos
  mantienen la directiva `// @ts-check`.

  **Lo que NO se hizo, a propósito.** Los `<script>` inline con el motor de
  cada juego (solitario.html, etc.) **no llevan `@ts-check`**: tiparlos
  retroactivamente (900-1400 líneas por archivo, sin módulos, con variables
  compartidas entre docenas de funciones) es un esfuerzo grande para un
  beneficio incierto hoy, y typarlos mal sería peor que no typarlos. Es la
  misma decisión de "no tocar el motor" de la Fase 4, aplicada a tipos en vez
  de a la interfaz de juego.
- **Fase 6 (hecha, alcance deliberadamente acotado).** Navegación por teclado,
  foco visible, `prefers-reduced-motion` y un ajuste responsive concreto.

  **Navegación por teclado (el gap más grande y real: hoy no existía en
  absoluto).** Se auditó primero: cero `tabindex` en cartas/celdas, cero
  `keydown` en los 4 juegos — ni siquiera Tab llegaba a una carta. Se agregó
  `keyActivate(el, handler)` a `shared/ui.js`: da `tabindex="0"` a un elemento
  y activa `handler` con Enter/Espacio. La regla que se mantuvo en los 4
  juegos: `handler` es siempre la **misma función que ya usa el click/tap**
  (`handleCardClick`, `humanPlay`, `togglePass`, `onTap`…), nunca una reimplementación
  — así el teclado no puede desincronizarse de las reglas de juego.
  - Solitario / Carta Blanca: `keyActivate` en `attachDrag()` (cartas) y en
    los 3 huecos clickeables (fundaciones vacías, columnas vacías, mazo).
  - Corazones: `keyActivate` en las cartas `.playable` de `renderHand()`,
    mismo callback que ya usa el click delegado en `#hand`.
  - Buscaminas: **no** se usó `keyActivate` (tabindex fijo por celda). Un
    tablero Experto tiene 480 celdas; darles tabindex="0" a todas habría hecho
    Tab inutilizable. Se implementó el patrón WAI-ARIA de **roving
    tabindex**: una sola celda (`focusedCell`) tiene `tabindex="0"` en un
    momento dado, las flechas mueven el foco real del DOM entre celdas
    vecinas (sin disparar ninguna acción), y Enter/Espacio llama a
    `onTap(r, c)` — la misma función que ya usa el mouse. Como Buscaminas
    reconstruye `board.innerHTML` en cada `render()` (perdiendo el foco del
    DOM), `render()` restaura el foco a `focusedCell` después de reemplazar
    el HTML si el tablero lo tenía antes.
  - **Verificación real, no aspiracional:** 4 tests nuevos, uno por juego,
    que enfocan un elemento con `.focus()` y disparan `page.keyboard.press
    ("Enter"/"ArrowRight"/...)` — no llaman a la función de juego
    directamente, pasan por el evento de teclado real y verifican que el
    estado cambia igual que con mouse (o, en Buscaminas, que el foco del DOM
    se mueve y sólo una celda es tabbable a la vez).
  - **Foco visible:** `:focus-visible` (sólo aparece con teclado, no al
    clickear con mouse/touch) en `.btn` (`base.css`), `.card`
    (`cards.css`) y `.cell` (`buscaminas.css`), con el dorado de marca.
    Verificado por screenshot en los 3 casos.

  **`prefers-reduced-motion` completo.** Antes sólo cubría `.card.land` en
  Solitario/Carta Blanca y la animación de recoger baza en Corazones. Se
  extendió a las animaciones decorativas restantes en los 4 juegos
  (`.btn.attention`, `.win-emoji`, `.card.hint`/`.hint-target`,
  `.cell.hint`) y al confeti (JS, no CSS): `celebrate()` corta antes de
  dibujar nada si `matchMedia("(prefers-reduced-motion: reduce)").matches`.

  **Responsive: un defecto real, no un rediseño especulativo.** Se
  capturaron screenshots en 3 breakpoints adicionales (apaisado de celular,
  tablet, desktop ancho) para buscar defectos concretos antes de tocar nada.
  Se encontró uno real: en desktop ancho, los 4 juegos topeaban el tamaño de
  carta/celda con un máximo fijo en px pensado para no verse "gigante" en
  pantallas grandes, dejando el tablero chico y descentrado con mucho espacio
  vacío (Buscaminas era el peor caso: 9×9 celdas de 44px en una pantalla de
  1600px). Se subió ese techo cuando `window.innerWidth >= 1100` (mismo
  breakpoint que ya usaba el CSS para tipografía), verificado con
  screenshots antes/después en los 4 juegos y en los otros 2 breakpoints
  (para confirmar que no se rompió el caso angosto/apaisado). **No** se
  implementaron container queries: no hicieron falta para resolver el
  defecto real encontrado.

  **Lo que NO se hizo, a propósito.**
  - **Temas claro/oscuro.** Es una decisión de **diseño estético**, no una
    extracción mecánica como las de las Fases 0-5: requiere criterio visual
    humano sobre decenas de colores, y la identidad actual (mesa de fieltro
    verde) no tiene un "modo claro" obvio sin una sesión de diseño real.
    Implementarlo sin esa validación arriesgaba entregar algo que se ve mal,
    que es peor que no tenerlo. Queda como propuesta, no como código.
  - **Paleta apta para daltónicos (4 colores de palo).** Al planificar esta
    fase se revisó el argumento original del ADR y se lo encontró más débil
    de lo que parecía: los palos ya se distinguen por **forma** (♠♥♦♣ son
    glifos distintos, no sólo puntos de color), y la distinción real
    rojo-vs-negro (sin matiz) no es el caso típicamente problemático para las
    formas más comunes de daltonismo (protanopia/deuteranopia, que confunden
    rojo-verde, no rojo-negro). Se repriorizó por debajo de la navegación por
    teclado, que era una falla dura (cero soporte) y no parcial.

### Criterios de aceptación (cuando esté todo)

- Agregar un juego al **launcher y a estadísticas** = sumarlo a
  `games/registry.js`; **cero** ediciones en las otras páginas. ✅ (Fase 4)
- Un **test de contrato** verifica que el registro no diverge del launcher, de
  estadísticas ni del manifest (shortcuts). ✅ (Fase 4) — pendiente extenderlo
  a "persiste y restaura" y "queda cacheado offline" el día que el registro
  también describa la persistencia de cada juego (hoy eso lo cubren los tests
  específicos de cada juego, no el test de contrato).
- Una CSP estricta activa en las 6 páginas. ✅ (Fase 5) — completa en
  `index.html`/`estadisticas.html`; en los 4 juegos, estricta salvo
  `'unsafe-inline'` en `script-src` (brecha documentada, ligada a no migrar el
  motor de cada juego — ver Fase 4).
- Sin duplicación de `SUIT`/cartas/persistencia/UI/stats entre juegos. ✅ (Fases 0-3)

## 11. Decisión

**Aceptada.** El trabajo se ejecuta por fases (ver §10). Cada fase es mergeable
por separado y mantiene los 39 tests verdes como puerta.

## 12. Próxima secuencia propuesta (Fase 7+)

> **Estado de esta sección: propuesta, no aprobada.** Revisa cada "alcance
> acotado" dejado por las Fases 0-6 (§10) y propone qué hacer con cada uno,
> con el mismo criterio de riesgo/beneficio usado en todo este documento. No
> se implementa nada de lo que sigue hasta una confirmación explícita.

### 12.1 Inventario: qué quedó afuera y qué se propone hacer con eso

| Origen | Alcance acotado | Propuesta |
|---|---|---|
| Fase 3 | Header/HUD y modal sin generalizar | **Sin acción.** Sigue sin haber un 5.º juego que lo necesite; forzarlo ahora sería la misma abstracción prematura que se evitó en su momento. |
| Fase 4 | Interfaz `Game` completa (`mount/newGame/serialize/restore/destroy`, §5.2) no implementada | **Sin acción por ahora.** Paga su costo recién con un 5.º juego real (ver Fase 4, §10). |
| Fase 4 | `shared/msdeal.js` (repartidor determinista de Carta Blanca) nunca se extrajo | **Sin acción como refactor aislado** — hoy sólo lo usa un juego, no hay duplicación que resolver. Sólo tiene sentido si viene *junto* con una funcionalidad nueva que lo reutilice (ver 12.4). |
| Fase 4/10 | El test de contrato no verifica "persiste y restaura" ni "cacheado offline" por juego | **Se resuelve en Fase 8** (12.3), extendiéndolo para cubrir también los archivos de cada juego. |
| Fase 5 | CSP con `'unsafe-inline'` en `script-src` de los 4 juegos (motor inline) | **Se resuelve en Fase 7** (12.2) — es el gap más repetido de todo el documento y ahora tiene una vía segura para cerrarlo. |
| Fase 5 | Sin `@ts-check` en los motores de juego | **Sin fase dedicada.** Se recomienda adopción oportunista (al tocar una función, tipar esa función) en vez de una migración de una vez — mismo riesgo/beneficio que ya se documentó en Fase 5. |
| Fase 6 | Temas claro/oscuro no implementados | **Fase 9** (12.4): decisión de diseño humana, no una extracción mecánica. Se proponen mockups concretos, no código. |
| Fase 6 | Paleta apta para daltónicos deprioritizada | **Se cierra sin acción.** Al revisarlo de nuevo el argumento sigue siendo débil: los palos ya se distinguen por forma (♠♥♦♣), y rojo-negro no es la confusión típica de protanopia/deuteranopia. No es un gap real, es una decisión ya tomada. |
| §5.1 | `shared/a11y.js` (planeado en la estructura de carpetas) nunca se creó | **Se cierra sin acción.** Los helpers de a11y terminaron donde tenía sentido cada uno (`keyActivate` en `ui.js`, `cardLabel` en `cards.js`); crear un archivo aparte ahora sólo movería código sin motivo. Se actualiza §5.1 para reflejar la estructura real en vez de la aspiracional. |
| §9 (riesgos) | "Los tests dependen de globals" (ligado a una futura migración a módulos ES) | **Se cierra sin acción.** Migrar a módulos sigue siendo un no-objetivo explícito (§2); el riesgo sólo existe si eso cambia. |
| PRD (roadmap) | "Aviso de actualización del SW" | **Se resuelve en Fase 8** (12.3) — `sw.js` ya tiene el listener `skip-waiting` sin usar, esperando el lado del cliente. |

### 12.2 Fase 7 (propuesta, prioridad alta): externalizar el motor de cada juego

**Qué.** Mover el `<script>` inline de cada juego (900-1400 líneas) a un
archivo externo del mismo origen — `solitario.html` pasaría a tener
`<script src="games/solitario.js"></script>` en vez del bloque inline,
**sin cambiar una sola línea de ese código**. Se mantienen los `<script>`
clásicos (no módulos): mismo scope global, mismas variables que hoy leen los
tests (`state`, `grid`, `players`…).

**Por qué es distinto de lo que ya se descartó.** Esto **no** es migrar a la
interfaz `Game` de §5.2 (eso sigue sin hacer falta, ver 12.1). Es exactamente
el mismo movimiento mecánico que ya funcionó tres veces en este trabajo: la
extracción de CSS inline en la Fase 0 y la de los últimos scripts triviales
(`pwa.js`, `launcher.js`, namespace vía `data-store-ns`) en la Fase 5. Mover
contenido byte-idéntico a un archivo aparte es de bajo riesgo porque es
verificable mecánicamente (diff de contenido) y no toca lógica.

**Qué resuelve.** Cierra **el gap de CSP más repetido del documento**: un
script externo del mismo origen ya cumple `script-src 'self'` sin
`'unsafe-inline'` (a diferencia de uno inline). Las 6 páginas quedarían con
CSP estricta sin excepciones — no sólo `index.html`/`estadisticas.html`.

**Cómo se verificaría.** El mismo método usado en todo el documento:
diff de contenido contra el HTML original (el `.js` extraído debe ser
idéntico al bloque que estaba entre `<script>` y `</script>`), suite completa
verde, y correr los tests con la CSP ya endurecida como red de seguridad
(igual que en Fase 5). Sin cambios de comportamiento esperados.

### 12.3 Fase 8 (propuesta, prioridad media): cerrar los dos huecos "vivos"

Dos items quedaron explícitamente como pendientes de extender, no como
decisiones cerradas — se proponen juntos porque comparten el mismo tema
(mantener el registro/SW honestos a medida que crece la suite):

1. **Extender el test de contrato** (Fase 4) para verificar que **todos** los
   archivos de cada juego (HTML, y tras la Fase 7 también su `.js`) están en
   la lista `ASSETS` de `sw.js`. Hoy esa verificación es manual; con más
   archivos por juego (después de la Fase 7) el riesgo de un olvido crece, y
   este tipo de bug ya se dio una vez en la auditoría final de esta sesión.
2. **Aviso de "hay una versión nueva, recargá"**: `sw.js` ya tiene, sin usar,
   el listener `self.addEventListener("message", ...skip-waiting...)`. Falta
   el lado del cliente: detectar `registration.waiting` /
   `updatefound`/`controllerchange` y mostrar un `toast` con acción "Recargar"
   que llame `postMessage("skip-waiting")`. Es código muerto real hoy — o se
   completa o se saca; completarlo además cierra un ítem que ya estaba en el
   roadmap del PRD.

### 12.4 Fase 9 (propuesta, requiere decisión humana): temas claro/oscuro

No se propone implementar una paleta a ciegas. Se propone presentar 2-3
propuestas visuales concretas (paleta clara alternativa a la mesa de fieltro
verde, manteniendo dorado/marca) para que se elija una antes de tocar CSS —
mismo criterio ya documentado en Fase 6: es una decisión de diseño, no una
extracción mecánica.

**Oportunidad relacionada (opcional, sólo si hay interés):** si en algún
momento se quiere una funcionalidad de "partida numerada/con semilla" para
Solitario (jugar la misma partida que otra persona, tipo "Solitaire #1247"),
ahí sí valdría la pena extraer `shared/msdeal.js` — reutilizando el mismo
mezclador determinista que hoy sólo usa Carta Blanca — porque resolvería una
duplicación real *a la vez que* entrega una función nueva. No se propone
como refactor aislado (ver 12.1).

### 12.5 Fuera de la secuencia propuesta

- **Auditoría responsive más profunda.** Sólo si aparece un defecto concreto
  reportado — no especular con más breakpoints sin un problema real (mismo
  criterio que ya se aplicó en Fase 6).
- **Variantes de arte para figuras (J/Q/K).** Cosmético, sin impacto
  funcional; no justifica una fase propia.
- Los ítems ya marcados "sin acción" en 12.1 (paleta daltónica, riesgo de
  globals, `shared/a11y.js`, `@ts-check` en motores) — se consideran
  **resueltos por decisión**, no pendientes.

## 13. Revisión de un feedback externo y secuencia revisada (Fase 7+)

> **Estado: propuesta, no aprobada.** Esta sección contrasta un feedback
> externo de arquitectura/diseño (recibido 2026-07-08) contra la secuencia ya
> propuesta en §12, con el mismo criterio de riesgo/beneficio de todo el
> documento. El feedback está bien orientado a los tres objetivos del producto
> (escalar sin romper, adaptabilidad y estética) y coincide en varios puntos
> con lo que ya se había planeado; en otros conflaciona un cambio de bajo
> riesgo con uno de alto, o propone algo técnicamente inviable sin reescribir
> el motor. Acá se separa cada cosa y se reordena la secuencia.

### 13.1 Reconciliación punto por punto

| Feedback | Veredicto | Razón / dónde encaja |
|---|---|---|
| **Externalizar el motor a `.js` para quitar `unsafe-inline` de la CSP** | ✅ **De acuerdo — es la prioridad 1.** | Es exactamente la **Fase 7** que ya se propuso en §12.2. Máximo acuerdo entre feedback y ADR: cierra el gap de CSP más repetido del documento con un movimiento mecánico verificable (diff byte-idéntico). Ver 13.2. |
| **Migrar a ES Modules (`type="module"`)** | 🟡 **Innecesario para el objetivo; oportunista después.** | El objetivo de seguridad (quitar `unsafe-inline`) se logra con un `<script src>` **clásico** — no hace falta módulos. Migrar a módulos saca `state`/`grid`/`players` de `window` y **rompe ~57 tests** que hoy leen esas globals (riesgo ya listado en §9). Sigue siendo no-objetivo (§2); se reconsidera recién con el juego n.º 5 o ante una colisión concreta, no como big-bang. |
| **Interfaz `mount/newGame/serialize/restore` + un solo `game-shell.html` dinámico** | ⏸️ **Diferido — el feedback conflaciona dos cosas.** | Esto **no** es la Fase 7 del ADR (esa es sólo la extracción mecánica). Es la interfaz `Game` completa de §5.2 + un shell que cargue el juego elegido: la reescritura de mayor riesgo del proyecto, para beneficio externo nulo con 4 juegos que ya andan. Paga su costo recién con un **5.º juego real** (§12.1). La Fase 7 es, de hecho, el **primer paso habilitante** hacia ese shell futuro. |
| **Build step (Vite) + TypeScript real** | ❌ **No ahora.** | Contradice **RNF-01** (sin build, 100% estático), que es un requisito de producto, no una preferencia. El 90% del valor de TS ya lo da `@ts-check` + JSDoc + `tsc` en CI sobre `shared/` (0 errores, `strict`). El único dolor real que un build resolvería —**cache-busting del SW**— se cubre, si se vuelve recurrente, con un script de ~20 líneas en CI que hashea la lista de assets, no con un bundler. |
| **Eliminar `setSizes()` y usar `aspect-ratio`/`clamp`/`grid auto-fit`** | 🟡 **Parcial — inviable tal cual en los juegos de cartas.** | En Solitario/Carta Blanca/Corazones, `CW`/`CH` **no son sólo CSS**: la lógica JS los lee para el hit-testing del drag (`dropTargetAt(cardLeft+CW*0.5, …)`), el abanicado (`fan=CW*0.30`), la altura de columna y los offsets de apilado. El tablero está **posicionado absolutamente por JS**; "borrar `setSizes()`" = reescribir el motor de layout (el mismo riesgo alto ya descartado). **Sí aplica a Buscaminas** (grilla de celdas sin drag): ahí la migración a CSS (`aspect-ratio:1`, container queries, `grid-template-columns: repeat(N,1fr)`) es viable y de bajo riesgo. Se hace acotado a Buscaminas, no en bloque. |
| **Layouts específicos para landscape en móvil** | ✅ **De acuerdo — es el mejor hallazgo del feedback.** | **Gap real y no cubierto:** la Fase 6 sólo atacó desktop ancho (techo de tamaño ≥1100px); nunca el celular apaisado, donde el alto colapsa y header/footer se comen el tablero. Alto valor, riesgo moderado, cae dentro del objetivo 2. Ver Fase 8 (13.2). |
| **Sustituir emojis por SVG consistentes** | ✅ **De acuerdo — nuevo y válido.** | El ADR sólo lo rozó (arte de figuras, "cosmético"). Los emojis (💣 🚩 🙂 🎉 🎮 ⚙) se ven distinto por SO y rompen la estética minimalista (objetivo 3). **Los SVG deben ir inline** (sin fuente de íconos por CDN) para respetar la CSP estricta — buena sinergia con el objetivo 1. Ver Fase 9 (13.2). |
| **Modo oscuro (dark mode)** | ✅ **De acuerdo — ya estaba planeado (§12.4).** | Coincide con la Fase 9 del ADR. La mecánica es barata (overrides de ~10 tokens en `tokens.css` bajo `@media (prefers-color-scheme: dark)`); lo que necesita criterio humano es la paleta (fieltro→esmeralda muy oscuro, blanco→gris carbón). Se presentan 2-3 propuestas antes de tocar CSS. Ver Fase 10. |
| **View Transitions API / animaciones FLIP** | 🟡 **Sí, pero como pulido final y progresivo.** | Lindo y moderno (objetivo 3), pero sobre un tablero posicionado a mano e imperativo puede pelearse con las animaciones `.card.land` y el drag actuales. Se hace **sólo como mejora progresiva** (`if (document.startViewTransition)`) y detrás de `prefers-reduced-motion`. Va al final, después de externalizar el motor (más fácil de iterar en un `.js`). Ver Fase 12. |

### 13.2 Secuencia revisada

Reordena §12 incorporando lo válido del feedback. Mismo método de siempre:
cada fase mergeable por separado, **tests verdes como puerta**, verificación
real (diff/screenshot/suite con la CSP puesta), y nada se implementa hasta
confirmación explícita.

- **Fase 7 — Externalizar el motor de cada juego (prioridad alta, bajo riesgo).**
  Mover el `<script>` inline (900-1400 líneas) a `games/<juego>.js` **sin cambiar
  una línea**, como `<script src>` clásico (mismas globals, mismos tests). Cierra
  `unsafe-inline` en `script-src` de los 4 juegos → CSP estricta en las 6 páginas
  sin excepción. Es el **habilitante** de todo lo demás. (= §12.2.)
- **Fase 8 — Landscape en móvil (prioridad alta, riesgo moderado).** Reubicar
  los controles de header/footer a un riel lateral en
  `@media (orientation: landscape) and (max-height: 500px)` para maximizar el
  tablero. Verificado por screenshot en ese breakpoint, sin tocar reglas de
  juego. *(Nuevo, del feedback — el gap responsive que la Fase 6 no cubrió.)*
- **Fase 9 — Íconos SVG (riesgo bajo→moderado).** Familia SVG minimalista
  **inline** (respeta la CSP), en dos pasos: (1) íconos decorativos de UI
  (🎮 ⚙ 💡 🎉 ↶) — swap directo, bajo riesgo; (2) estado de Buscaminas
  (💣 🚩 ❌ 🙂/😎/😵/⏳) — toca el render, va con tests. *(Nuevo, del feedback.)*
- **Fase 10 — Modo oscuro (requiere decisión de diseño).** Presentar 2-3
  paletas concretas; recién ahí, overrides de tokens bajo
  `prefers-color-scheme: dark`. (= §12.4, y coincide con el feedback.)
- **Fase 11 — Cerrar los dos huecos "vivos" (prioridad media).** (a) Extender el
  test de contrato para verificar que todos los archivos de cada juego (HTML +
  el nuevo `.js` de la Fase 7) están en `ASSETS` de `sw.js`. (b) Aviso de
  "nueva versión, recargá" (el listener `skip-waiting` de `sw.js` ya existe sin
  usar). (= §12.3.)
- **Fase 12 — Pulido de movimiento (opcional, progresivo).** View Transitions
  como mejora progresiva y detrás de `prefers-reduced-motion`; y, acotada a
  Buscaminas, migrar su dimensionado a CSS (container queries / `aspect-ratio`),
  el único caso donde la idea "delegar a CSS" del feedback aplica sin reescribir
  el motor. *(Nuevo/pulido.)*

**Se mantienen diferidos (feedback reexaminado, la razón previa sigue en pie):**
interfaz `Game` completa + `game-shell.html` (recién con el juego n.º 5, §12.1);
migración a ES Modules big-bang (no la exige el objetivo de seguridad;
oportunista); bundler/Vite (contra RNF-01); paleta daltónica (§10, los palos ya
se distinguen por forma).
