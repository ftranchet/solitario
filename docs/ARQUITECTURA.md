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
| 0 | Estructura de carpetas (`/shared`, `/styles`) + design tokens | ✅ |
| 1 | `storage.js` (persistencia compartida) | ✅ |
| 2 | `cards.js` + `cards.css` (chrome) | ✅ |
| 3 | `ui.js` (toast) | ✅ |
| 4 | Contrato + registro de juegos | ✅ (alcance acotado) |
| 5 | Tipos (`@ts-check`) + CSP + auditoría XSS | ✅ (alcance acotado) |
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
