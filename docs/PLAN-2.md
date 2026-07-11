# Plan 2 — Robustez, seguridad y consistencia

**Roadmap por fases (documento vivo)**

| Campo | Valor |
|---|---|
| Estado | **Fases 0-7 hechas** (D1/D2/D3 decididas — ver §"Decisiones"; Fase 7 con un bloqueo parcial de infraestructura, ver esa sección) |
| Versión | 1.2 |
| Fecha | 2026-07-11 |
| Origen | Auditoría integral de código y documentación (2026-07-11) |
| Relacionado | [PRD](./PRD.md) · [ARQUITECTURA](./ARQUITECTURA.md) · [PLAN](./PLAN.md) (cerrado) · [CHANGELOG](./CHANGELOG.md) |

> [PLAN.md](./PLAN.md) cerró su ciclo ("una necesidad concreta abre un plan
> nuevo, no reabre éste"). Este es ese plan nuevo: sale de una auditoría
> completa de los 4 motores, los módulos compartidos, el service worker, las
> 6 páginas, los CSS y los 4 documentos, que encontró hallazgos en 8
> categorías: bugs, seguridad, duplicaciones, incoherencias de documentación,
> inconsistencias menores/reglas, optimizaciones, tests faltantes y mejoras de
> robustez a largo plazo. Acá cada hallazgo tiene una fase, un dueño de
> decisión cuando la necesita, y una puerta de verificación.

---

## Principios de ejecución (heredados de PLAN.md, más uno nuevo)

- **Estático y sin build** (RNF-01): sin bundler ni framework.
- **Incremental**: cada fase es mergeable por separado y deja la suite verde y
  `tsc` limpio como puerta.
- **Verificación real, no aspiracional**: cada fix de bug o de seguridad llega
  con un test de regresión que **falla sobre el código viejo** (se verifica el
  test antes que el fix).
- **Sin abstracción prematura**: sólo se deduplica lo que ya tiene dos
  consumidores reales idénticos.
- **Nuevo — datos no confiables:** todo valor leído de `localStorage` se
  valida por tipo/rango antes de usarse, y NUNCA llega a `innerHTML` sin pasar
  por un formateador (`esc()`, `n()`, `fmtTime()`). El origen es compartido
  (`usuario.github.io`), así que localStorage no es de confianza.

## Orden elegido y por qué

Primero se refuerza la **red de verificación** (Fase 0): sin ella, las fases
de deduplicación serían fe, no verificación. Después **bugs** y **seguridad**
(el objetivo n.º 1 del producto), que son chicos y de alto valor. La
**documentación** sigue porque es barata y desbloquea decisiones. Las
**reglas/inconsistencias** requieren 3 decisiones de producto y van juntas.
La **deduplicación** va anteúltima porque es el trabajo de mayor riesgo y para
entonces la protege la Fase 0. **CI ampliado** y **rituales de largo plazo**
cierran.

---

## Secuencia de fases

### Fase 0 — Cimientos de verificación · _tamaño S_

Refuerza la red de tests antes de tocar nada.

1. **Desflaquear el test de teclado de Corazones** (el flake intermitente que
   ya reconoce PLAN.md, Fase 2). Buscar la causa raíz (con toda probabilidad
   una espera por tiempo fijo compitiendo con `AI_DELAY`/`advance()`) y
   reemplazarla por espera por condición. Un flake conocido en la puerta de CI
   erosiona la confianza en todas las fases siguientes.
2. **Regresión visual de estados intermedios.** Hoy `tests/visual.js` sólo
   compara el reparto inicial: una escalera apilada larga, una carta
   seleccionada, el pozo en modo difícil (abanico de 3) y el modo oscuro no
   están cubiertos — la regresión del "pip que se asoma en la franja"
   (corregida en 1.12.x) no la habría detectado ningún test. Agregar a
   `tests/screenshot.js` un modo de **estados deterministas** (inyectar por
   `page.evaluate` una escalera K→8, una carta seleccionada, el pozo en
   difícil — la técnica ya usada a mano en la sesión de rediseño) y capturas
   en oscuro; `visual.js` las compara como al resto. `docs/screenshots/dark/`
   pasa de documentación estática a referencia comparada por CI.

**Puerta:** suite verde 3 corridas seguidas (sin flake) + los estados nuevos
en `docs/screenshots/baseline/`.

### Fase 1 — Bugs · _tamaño S_

Cada ítem con su test de regresión (que falla sobre el código viejo).

1. **El teclado esquiva el bloqueo del autocompletado.** `handleCardClick` no
   chequea `autoTimer` (`games/solitario.js` y `games/carta-blanca.js`) y
   `keyActivate` lo invoca directo: Enter sobre una carta durante el
   autocompletado muta el estado en paralelo con `autoTick`. Fix: `if
   (autoTimer) return;` al inicio, simétrico con `handleEmptyColumn`/
   `handleFoundationClick`/`onPointerDown`.
2. **Estadística de "lunas" duplicable (Corazones).** `saveGame` no persiste
   durante `phase === "scoring"`, así que recargar con el modal de fin de mano
   abierto re-ejecuta `endHand` → `bumpStat("moons")` de nuevo. Fix propuesto:
   marcar la luna como contabilizada en el guardado (p. ej. persistir
   una vez resuelta la baza 13 un flag `moonCounted` junto al estado), o mover
   el bump al avance del modal (`round-next`), que sólo ocurre una vez.
3. **Reloj por timestamps (Solitario, Carta Blanca, Buscaminas).**
   `seconds++` por `setInterval` se estrangula en pestañas de fondo (Chrome:
   1/min): el tiempo real no se acumula y los "mejores tiempos" son
   engañables. Fix: acumular `Date.now()` entre reanudar/pausar (los hooks de
   `visibilitychange`/`pagehide` ya existen); el formato guardado sigue siendo
   `seconds` (compatible, sin migración).
4. **Botón "Recargar" potencialmente muerto (`shared/pwa.js`).** Si al click
   `reg.waiting` ya no existe, el botón se deshabilita y no pasa nada. Fix:
   fallback a `location.reload()` directo.

**Puerta:** suite verde + 4 tests nuevos verificados contra el código viejo.

### Fase 2 — Seguridad: datos no confiables de localStorage · _tamaño M_

Cierra la clase de inyección que la auditoría XSS de Fase 5 (vieja) no cubrió:
valores **numéricos** de localStorage concatenados en `innerHTML` sin validar
tipo, explotables desde otra página del mismo origen compartido.

1. **Helpers de validación en `shared/storage.js`** (`@ts-check`): `asNum(v,
   def)`, `asIntInRange(v, min, max, def)`, `asNumArray(v)`. Un solo lugar,
   la misma filosofía de "eliminar la clase de error" del proyecto.
2. **Corazones — `validSaved`/`loadGame` estrictos:** `score`/`roundPoints`
   numéricos, `turn`/`leadSeat` enteros 0–3 (hoy `turn: 7` pasa y rompe
   `advance()`), `tricksPlayed`/`handNumber` enteros, `history` de filas
   numéricas. Un guardado que no cumple se descarta (RNF-04).
3. **Estadísticas — nada crudo a `innerHTML`:** `bestMoves` y `bestScore`
   pasan por `h.n()` (los demás campos ya pasan); `renderOpp`/`buildScoresTable`
   quedan cubiertos por el punto 2.
4. **Tests espejo del test XSS de nombres:** payloads `<img onerror=...>` en
   `score`, `history`, `bestMoves`, `bestScore` → el guardado se descarta o el
   valor se neutraliza; y `turn: 7` no rompe la carga.

**Puerta:** suite verde + `tsc` limpio + payloads verificados contra el código
viejo.

### Fase 3 — Coherencia de documentación · _tamaño S_

Los ADR se declaran "documentos vivos"; que vuelvan a decir la verdad.

1. **ARQUITECTURA.md:** nota "**Actualización:** implementado en la Fase 4 de
   PLAN.md" donde §8 y §10 dicen que el modo oscuro "queda sin implementar"
   (mismo tratamiento que ya tiene la brecha de CSP); §5.1 corrige el
   contenido real de `cards.js` (no tiene `SUIT`/mazo/mezcla) y de
   `storage.js` (no tiene la validación de estado); el criterio de aceptación
   "Sin duplicación de `SUIT` ✅" se matiza (está 3× a propósito, por el orden
   distinto de Corazones).
2. **`shared/global.d.ts`:** el comentario sigue diciendo que los motores son
   "los `<script>` inline" — se externalizaron en la Fase 1 de PLAN.md.
3. **`games/carta-blanca.js` — comentario de `autoMoveSelection`:** decir la
   prioridad real (pozo libre antes que columna VACÍA), que es la correcta.
4. **PRD:** documentar el trade-off deliberado de `user-scalable=no` (RNF-02
   vs. WCAG 1.4.4 en RNF-08); RNF-07 se resuelve con la decisión D3 (Fase 6).
5. **Ritual anti-desfase** (se documenta acá, se adopta en Fase 7): al cerrar
   cada fase, `grep -rn "no implementado\|pendiente\|sin implementar" docs/`
   y confirmar que cada resultado sigue siendo verdad.

**Puerta:** relectura cruzada docs↔código; el grep del punto 5 sin
contradicciones.

### Fase 4 — Inconsistencias menores y reglas · _tamaño M_

> **D1 y D2 ya decididas** (2026-07-11, dueño del producto): D1 — Corazones
> pasa a contar "partidas jugadas" al repartir la 1.ª mano, igual que los
> otros 3 juegos. D2 — un empate al alcanzar el objetivo se resuelve con una
> mano de desempate. Ver el detalle de cada una en §"Decisiones".

1. **`theme-color` desalineado:** las 6 páginas y el manifest usan `#0e3a22`
   pero `tokens.css` exige que coincida con `--felt-3` (`#0d3a23`); además en
   modo oscuro la barra del navegador queda con el color claro. Fix: igualar
   los valores y actualizar el `<meta>` desde `shared/theme.js` al aplicar
   tema (o el par de `<meta media="(prefers-color-scheme: …)">`), y ajustar
   la nota de `tokens.css`.
2. **Bandera por teclado en Buscaminas:** tecla `F` en el `keydown` del
   tablero (equivalente a `onLong`), con test; hoy un usuario de teclado no
   puede plantar bandera sin tocar el mouse.
3. **Datos muertos:** `SEAT[].name` y `SEAT[].human` en `corazones.js` (nadie
   los lee; los nombres salen de `DEFAULT_NAMES`).
4. **Estilo:** unificar los símbolos de `SUIT` (Solitario usa `♠`,
   los otros dos el glifo literal `♠`).
5. Implementar D1 y D2 según lo decidido.

**Puerta:** suite verde + capturas sin diferencias no intencionales + D1/D2
resueltas y anotadas en el PRD.

### Fase 5 — Deduplicación · _tamaño L · el mayor riesgo del plan_

De menor a mayor riesgo, con la red de la Fase 0 ya puesta. El criterio del
proyecto se cumple: el "segundo consumidor real" ya existe (Solitario y Carta
Blanca comparten estas piezas casi byte a byte).

1. **`.idx`/`.pip` → `styles/cards.css`.** Tras el rediseño 1.12.x los bloques
   quedaron idénticos entre `solitario.css` y `carta-blanca.css`; la
   justificación de mantenerlos por juego hoy sólo aplica a Corazones, que
   pasa a ser el único override. Verificación: regresión visual (incluidos
   los estados intermedios de la Fase 0) byte-idéntica.
2. **`shared/drag.js`.** La maquinaria de arrastre (`onPointerDown/Move/Up/
   Cancel`, `cleanupListeners`, `getRunElements`, `beginDrag`, `positionDrag`,
   `dropTargetAt`, `finishDrag`, ~100 líneas) duplicada entre los dos
   solitarios, parametrizada por los callbacks que ya difieren
   (`getSelectionCards`, `moveSelectionTo*`). Extracción mecánica con diff por
   bloques, como la Fase 1 vieja.
3. **Reloj + deshacer (`snapshot`/`undo`) compartidos** — evaluado, **no
   extraído**: ver el detalle en Progreso. La duplicación remanente (~20
   líneas) resultó demasiado chica para justificar un archivo nuevo.

**Puerta:** suite completa verde + regresión visual completa + diff mecánico
documentado en el commit de cada extracción. Si un paso no da byte-idéntico
visual, se corta y se reevalúa (no se fuerza).

### Fase 6 — CI y tests de largo alcance · _tamaño S_

> **D3 ya decidida** (2026-07-11): job de humo Firefox en CI, como el de
> WebKit (reutilizando `--smoke`) — el PRD (RNF-07) promete compatibilidad
> con Firefox y hoy CI no lo corre.

1. **Presupuesto de peso:** test que suma los bytes de `ASSETS` contra un tope
   (p. ej. 400 KB) — convierte la métrica del PRD "interactivo < 2 s" en
   puerta de CI, al estilo de la guardia de `VERSION`.
2. **Job de humo Firefox** (D3), análogo al de WebKit ya existente.
3. **Accesibilidad automatizada:** axe-core (vendorizado en `tests/`, no en
   producción — RNF-01 no se toca) sobre las 6 páginas; convierte RNF-08 en
   verificable como ya se hizo con la CSP.
4. **Cadencia de dependencias de test:** Dependabot acotado a `tests/`
   (Playwright está clavado en 1.61.1 — bien por reproducibilidad, pero un
   Chromium viejo deja de parecerse a los navegadores reales).

**Puerta:** CI verde con los jobs/chequeos nuevos activos.

### Fase 7 — Rituales de largo plazo · _tamaño S_

> **Bloqueo parcial (2026-07-11):** el punto 1 (tags) se creó localmente
> para las 25 versiones (`v0.1.0`…`v1.18.0`, retroactivo incluido) pero
> `git push origin --tags` (y por tag individual) devuelve **403** del
> proxy de esta sesión, mientras que el push de ramas al mismo repo
> funciona sin problema — es una restricción de política del token de
> esta sesión sobre refs de tag, no un error de red ni de credenciales
> vencidas. Los puntos 2 y 3 no dependen de esto y están hechos. Ver el
> detalle en Progreso.

1. **Tags de release:** `git tag v1.x.y` al mergear cada versión del
   changelog (y retroactivo para la actual). Bisecar regresiones y
   correlacionar con `VERSION` del SW pasa a ser inmediato.
2. **Patrón de migración de esquema** documentado en
   [COMO-AGREGAR-UN-JUEGO.md](./COMO-AGREGAR-UN-JUEGO.md): hoy `v !== 1`
   descarta el guardado (piso correcto); cuando exista un `v: 2`, el patrón
   (migrar campo a campo, validar, descartar si falla) debe estar escrito
   antes de que cada juego improvise el suyo.
3. **Ritual de cierre de fase para docs** (definido en Fase 3, punto 5):
   adoptarlo como paso fijo del checklist de cada fase futura.

**Puerta:** tags publicados + ambos rituales escritos en los docs que tocan.
(Los tags están creados pero no publicados — ver el bloqueo arriba.)

---

## Lo que la auditoría encontró y este plan NO ataca (a propósito)

| Ítem | Por qué no |
|---|---|
| Optimizaciones de render (rebuild completo por jugada, snapshots JSON de deshacer) | Medidos contra la escala real (52 cartas, ≤400 snapshots de ~5 KB) no son un problema hoy. Optimizar sin síntoma es complejidad gratis. |
| `BroadcastChannel` para sincronizar pestañas | El candado actual (un solo dueño del guardado) ya evita la corrupción, que era el riesgo real. Sincronización viva es una feature, no robustez; va al backlog del PRD. |
| Exportar/importar estadísticas | Ya está en el backlog del PRD (§8). Este plan no lo re-prioriza. |
| Migrar motores a ES Modules / interfaz `mount/serialize/restore` | Misma decisión de PLAN.md y ARQUITECTURA.md: paga recién con un 5.º juego real. |

## Ritual de cierre de fase (checklist fijo desde Fase 7)

Nace informal en la Fase 3 (punto 5) y se usó, ya en la práctica, en todas
las fases de este plan. Se adopta acá como paso fijo del checklist de
**cualquier fase futura**, en éste o en un próximo `PLAN-N.md`:

1. **Test primero.** Para cada bug: un test de regresión que falle contra
   el código sin arreglar, después el fix, después el mismo test en verde.
   Nunca al revés.
2. **Grep anti-desfase.** `grep -rn "no implementado\|pendiente\|sin
   implementar" docs/` y confirmar que cada resultado sigue siendo
   verdad (si la fase implementó algo que un doc marcaba como pendiente,
   ese doc se corrige en la misma fase, no después).
3. **Suite completa verde** (`npm test` en `tests/`, ×3 corridas seguidas
   si la fase tocó algo con estado async/reloj/concurrencia), `tsc -p .`
   limpio, y regresión visual completa (`node visual.js`) sin diferencias
   no intencionales.
4. **`VERSION` de `sw.js`** subida si la fase tocó algún archivo servido
   (HTML/CSS/JS/íconos) — `tests/check-sw-version.sh` lo hace exigible.
5. **Docs actualizados en el mismo commit que el código:** entrada nueva en
   `CHANGELOG.md`, fila de estado + "Progreso" del plan marcados ✅.
6. **Tag de release** (`git tag vX.Y.Z` en el commit que cierra la
   versión) al mergear a `main` — ver Fase 7, punto 1. Sin esto, bisecar
   una regresión y correlacionarla con `VERSION` del SW exige adivinar
   el commit a mano.
7. **Commit → push a la rama de trabajo → merge `--ff-only` a `main`.**
   Nunca forzar un merge no fast-forward silenciosamente: si no es
   fast-forward, `main` avanzó por otro lado y hay que rebasar primero.

**Puerta:** los 7 pasos corridos, en orden, antes de marcar la fase ✅ en
la tabla de "Estado".

## Estado

Estado: ✅ Hecho · 🟡 En curso · ⬜ Pendiente.

| Fase | Alcance | Tamaño | Estado |
|---|---|:---:|:---:|
| 0 | Desflaquear + regresión visual de estados intermedios y oscuro | S | ✅ |
| 1 | 4 bugs (autoTimer, lunas, reloj, botón Recargar) | S | ✅ |
| 2 | Validación de localStorage + tests de inyección | M | ✅ |
| 3 | Documentación coherente con el código | S | ✅ |
| 4 | theme-color, bandera por teclado, D1, D2, limpieza | M | ✅ |
| 5 | Deduplicación (.idx/.pip → cards.css; shared/drag.js) | L | ✅ (alcance acotado; reloj/undo evaluados y no extraídos) |
| 6 | Presupuesto de peso, D3 (Firefox), axe-core, Dependabot | S | ✅ |
| 7 | Tags de release + rituales | S | 🟡 (rituales hechos; tags creados, no publicados — bloqueo de infraestructura) |

## Decisiones (tomadas 2026-07-11)

El dueño del producto adoptó las 3 recomendaciones.

| ID | Pregunta | Decisión | Fase | Estado |
|---|---|---|:---:|:---:|
| D1 | ¿"Partidas jugadas" de Corazones cuenta al empezar o al terminar? | Contar al repartir la 1.ª mano (consistente con los otros 3 juegos) | 4 | ✅ |
| D2 | ¿Empate al alcanzar el objetivo en Corazones? | Mano de desempate (regla habitual) | 4 | ✅ |
| D3 | ¿Job de Firefox en CI o ajustar RNF-07? | Job de humo Firefox (barato, cierra la promesa del PRD) | 6 | ✅ |

## Progreso

- **Fase 0 (hecha).**
  - **Flake real encontrado y corregido — no era el que documentaba
    PLAN.md.** El test "Corazones: juega una carta con el teclado (Enter)"
    ya no fallaba (su comentario describe una carrera distinta, entre
    `waitForFunction` y la lectura de `trick`/`phase`, que el propio código
    ya maneja bien con un `||`). Reproduciendo la suite completa en bucle
    apareció un flake real en OTRO test: "Solitario: un solo Enter manda la
    carta a su lugar (teclado)" (1 de cada ~8-10 corridas), con el resultado
    "no pasó nada" (`moves: 0`). Causa raíz: Solitario, Carta Blanca y
    Corazones cablean `new ResizeObserver(relayout).observe(...)` sobre el
    tablero; observar dispara una notificación inicial (spec de
    ResizeObserver) que entra al debounce de 120ms de `relayout`
    (`setSizes(); render();`). Si ese relayout diferido corre DESPUÉS del
    `render()` propio del test pero ANTES del `Enter` (dos `evaluate()`
    separados: uno arma el estado, otro hace `focus()`), reconstruye el DOM
    y se roba el foco — el Enter no le llega a nadie. Afecta a los 3 tests
    de teclado de los juegos de cartas (Solitario, Carta Blanca, Corazones);
    Buscaminas no, porque ya no tiene `ResizeObserver` (su tamaño es CSS
    puro desde la Fase 2 de PLAN.md). Fix: helper `settleRelayout()` en
    `tests/run.js`, documentado, llamado en los 3 tests entre el `render()`
    de prueba y el `focus()`. Verificado: 18 corridas completas de la suite
    seguidas sin fallos (antes, ~1 de cada 8-10 fallaba).
  - **Regresión visual de estados intermedios.** `tests/screenshot.js` suma
    un array `STATES` (5 estados: escalera larga apilada y carta
    seleccionada en Solitario y Carta Blanca, más el pozo en modo difícil
    en Solitario) armados a mano vía `page.evaluate` sobre `state`/
    `selection`/`settings` — exactamente la técnica usada ad hoc durante el
    rediseño de cartas de esta semana, ahora repetible. Además, las 6
    páginas en modo oscuro (antes documentación estática en
    `docs/screenshots/dark/`, sin comparar) se generan con
    `localStorage.setItem("theme","dark")` vía `addInitScript` y
    `tests/visual.js` las compara pixel a pixel igual que al resto (factoreado
    `compareDir()`, reutilizado para `baseline/` y `dark/`). 35 capturas
    comparadas (antes 24), 0 diferencias. Cada estado nuevo se revisó a mano
    antes de aceptarlo como referencia (incluida la escalera K♥-Q♠-J♦-10♣-9♥-8♠-7♦,
    el caso que motivó esta fase).
  - **Puerta:** 73/73 tests verdes (18 corridas seguidas), `tsc -p .` limpio,
    35/35 comparaciones visuales sin diferencias.

- **Fase 1 (hecha).** Los 4 bugs, cada uno con su test de regresión
  verificado **fallando sobre el código viejo** antes de aplicar el fix (el
  principio de esta fase, ver arriba).
  - **El teclado esquivaba el bloqueo del autocompletado.**
    `handleCardClick()` (el handler real detrás de `keyActivate` en las
    cartas) no chequeaba `autoTimer`, a diferencia de
    `handleEmptyColumn`/`handleFoundationClick`/`onPointerDown`: un Enter
    durante el autocompletado mutaba el estado en paralelo con `autoTick()`.
    Fix de una línea (`if (autoTimer) return;`) en Solitario y Carta Blanca.
    2 tests nuevos: fijan `autoTimer` a un valor verdadero SIN arrancar el
    interval real (aísla el guard de la interferencia de los propios ticks
    del autocompletado) y confirman que un Enter no aplica ninguna jugada.
  - **La estadística "lunas" (Corazones) se podía duplicar.** `saveGame()`
    no persiste durante `phase === "scoring"` (a propósito), así que un
    reload con el modal de fin de mano abierto restaura el estado ANTERIOR
    (baza llena, `phase: "play"`) y `loadGame()` vuelve a llamar
    `resolveTrick() → endHand()` para la MISMA mano — si hubo luna,
    `bumpStat("moons")` se contaba de nuevo. Fix: el bump se separó del
    cálculo (`endHand()`, que puede repetirse por reloads) y se ató al
    CIERRE del modal (`#round-next`, una acción del usuario que ocurre una
    sola vez por mano) con una variable `pendingMoonBump`. Test que llama
    `endHand()` dos veces seguidas (simulando el reload) antes de cerrar el
    modal una sola vez, y confirma `moons === 1` (antes daba 2).
  - **El reloj (Solitario, Carta Blanca, Buscaminas) subcontaba en pestañas
    en segundo plano.** `seconds++` por tick de `setInterval` no refleja el
    tiempo real cuando el navegador estrangula los intervals de una pestaña
    oculta (Chrome: ~1/min): un tick que llega tarde sólo suma 1, no el
    tiempo real transcurrido. Fix: reloj por timestamps (`timerAnchor =
    Date.now() - seconds*1000`; cada tick —y `stopTimer()`— RECALCULAN
    `seconds` desde `Date.now() - timerAnchor` en vez de incrementar).
    Mismo formato guardado (`seconds`), sin migración. 3 tests (uno por
    juego) usan `page.clock.fastForward()` (a diferencia de `clock.runFor`,
    NO dispara los ticks intermedios — reproduce exactamente el
    estrangulamiento) para confirmar que 130s de tiempo real en un solo
    tick se reflejan como ~130s, no como 1.
  - **El botón "Recargar" podía quedar muerto** (`shared/pwa.js`) si
    `reg.waiting` ya no estaba al momento del click (otra pestaña activó el
    SW en espera primero, o el navegador lo activó solo al no quedar
    clientes): el botón se deshabilitaba y no pasaba nada. Fix: si no hay
    `reg.waiting`, recarga directo (con el mismo flag `reloading` que ya
    usa el listener de `controllerchange`, para no recargar dos veces si
    ambos caminos coinciden). Test que fuerza `reg.waiting = null` entre
    que aparece el aviso y el click, y confirma que la página igual navega.
  - **`VERSION` de `sw.js` a `v1.26.0`** (los 4 archivos tocados son parte
    del app shell); capturas de referencia regeneradas (0 diferencias reales
    — sólo ruido de antialiasing bajo el umbral en 2 capturas).
  - **Puerta:** 80/80 tests verdes (5 corridas seguidas), `tsc -p .` limpio,
    35/35 comparaciones visuales.

- **Fase 2 (hecha).** Cierra la clase de inyección que la auditoría XSS
  original (ARQUITECTURA.md, Fase 5) no cubrió: valores NUMÉRICOS de
  localStorage concatenados en `innerHTML` sin validar tipo, explotables
  desde otra página del mismo origen compartido.
  - **Helpers de validación en `shared/storage.js`** (`@ts-check`, con sus
    tipos en `shared/global.d.ts`): `asNum(v, def)`, `asIntInRange(v, min,
    max, def)`, `asNumArray(v)` — devuelven el valor sólo si es del
    tipo/rango esperado, si no el `def` de repuesto. Un solo lugar, misma
    filosofía de "eliminar la clase de error" que ya usa el proyecto.
  - **Corazones — `validSaved`/`loadGame` estrictos.** Antes sólo se
    validaban las CARTAS (sin repetidas); `score`/`roundPoints` (por
    jugador), `turn`/`leadSeat`/`trick[].seat` (enteros 0–3),
    `tricksPlayed` (0–13), `handNumber` (entero positivo) y `passDir`
    (uno de los 4 valores válidos) no tenían ningún chequeo de tipo o
    rango — un guardado con `turn: 7` pasaba la validación y rompía
    `advance()` (`players[7]` no existe); un `score` con HTML llegaba
    crudo a `renderOpp()`. También se sumó validar cada fila de
    `handHistory` (números) y cada carta de `taken` (antes sólo se
    chequeaba que fuera un array). Test que arma un guardado sano de
    referencia y 5 variantes corruptas (turn, leadSeat, tricksPlayed como
    string, score con HTML, fila de history con HTML) — las 5 rechazadas,
    la sana aceptada.
  - **Estadísticas — `bestMoves` (Solitario) y `bestScore` (Corazones)**
    ahora pasan por `h.n()` antes de concatenarse (los demás campos ya lo
    hacían). Test que guarda un payload `<img onerror>` en ambos campos y
    confirma que ni se ejecuta ni aparece como `<img>` real en el HTML de
    las tarjetas.
  - **`VERSION` de `sw.js` a `v1.27.0`**; capturas de referencia
    regeneradas (0 diferencias — cambios puramente de lógica, sin CSS/HTML).
  - **Puerta:** 82/82 tests verdes (4 corridas seguidas), `tsc -p .`
    limpio, 35/35 comparaciones visuales.

- **Fase 3 (hecha).** Los ADR se declaran "documentos vivos"; se corrigieron
  las afirmaciones que ya no eran ciertas.
  - **ARQUITECTURA.md:** nota de actualización donde §8 y §10 decían que el
    modo oscuro "queda deliberadamente sin implementar" (se implementó en
    la Fase 4 de PLAN.md — mismo tratamiento que ya tenía la brecha de
    CSP). §5.1 corrige qué tiene realmente `cards.js` (no `SUIT`/mazo/
    mezcla — eso sigue por juego) y `storage.js` (los helpers de
    validación de TIPO de la Fase 2 sí están; la validación de FORMA de
    cada guardado sigue por juego). El criterio de aceptación "Sin
    duplicación de `SUIT` ✅" se matiza: está 3 veces a propósito (orden de
    palos distinto por juego, As como rango 14 en Corazones).
  - **`shared/global.d.ts`:** el comentario ya no dice que los motores son
    "los `<script>` inline" (se externalizaron en la Fase 1 de PLAN.md).
  - **`games/carta-blanca.js`:** el comentario de `autoMoveSelection` decía
    "pila final > columna > pozo libre"; la prioridad real del código es
    pila final > columna NO vacía > pozo libre > columna vacía (recién
    como último recurso). Sólo se corrigió el comentario; el código ya
    hacía lo correcto.
  - **PRD:** RNF-02 documenta el trade-off deliberado de `user-scalable=no`
    (evita el zoom accidental al tocar una carta dos veces) contra WCAG
    1.4.4/RNF-08 — antes no estaba explicitado como decisión, sólo vivía en
    el código. RNF-07 documenta la brecha real (CI no corre Firefox pese a
    prometer compatibilidad) y enlaza D3.
  - **Ritual anti-desfase, verificado (se adopta formalmente en la Fase 7):**
    `grep -rn "no implementado\|pendiente\|sin implementar" docs/` no
    encontró contradicciones — el resto de los resultados son entradas
    históricas del CHANGELOG/historial de revisiones (registro de un
    momento pasado, no afirmaciones vigentes) o ítems genuinamente
    pendientes (el job de Firefox, extender el test de contrato a
    persistencia, los íconos SVG).
  - **`VERSION` de `sw.js` a `v1.28.0`**: `games/carta-blanca.js` cambió (un
    comentario) y es un asset servido; se sube igual, consistente con la
    guardia de CI (no distingue cambios cosméticos de los de comportamiento).
  - **Puerta:** 82/82 tests verdes, `tsc -p .` limpio, grep de coherencia
    sin contradicciones.

- **Fase 4 (hecha).** Con D1 y D2 ya decididas por el dueño del producto
  (2026-07-11), esta fase las implementó junto con el resto del alcance.
  - **`theme-color` alineado con `--felt-3` y sincronizado con el tema.**
    Las 6 páginas y el manifest usaban `#0e3a22`, distinto de
    `--felt-3: #0d3a23`; se igualaron. Además, `<meta name="theme-color">`
    quedaba fijo en ese verde claro aunque el usuario eligiera modo oscuro
    (la barra del navegador en Android/iOS no acompañaba). `shared/
    theme.js` ahora sincroniza el `<meta>` con el `--felt-3` YA RESUELTO
    por CSS (no lo duplica a mano) en cada cambio de tema — con un
    best-effort en la carga inicial (antes de que el CSS esté listo, no
    encuentra nada y no importa) y una llamada de respaldo garantizada una
    vez que el DOM/CSS está listo. Test que fuerza el modo oscuro y
    confirma que el `<meta>` pasa a `#071811` (el `--felt-3` oscuro).
  - **Bandera por teclado en Buscaminas (tecla F).** Antes un usuario de
    teclado no podía plantar una bandera en absoluto (el modo bandera y el
    toque largo dependen del mouse/touch). `F` llama a `onLong(r, c)`, la
    misma función que ya usa el toque largo — mismo criterio que el resto
    de la navegación por teclado del proyecto (nunca reimplementar la
    regla, sólo invocar el handler real). Mencionado en el modal "Cómo
    jugar". Test que planta y saca una bandera con F.
  - **D1 — "partidas jugadas" de Corazones.** Se contaba sólo al terminar
    la partida completa (`recordMatchEnd()`, disparado por `showWin()`);
    una partida abandonada a mitad de camino no sumaba nada, a diferencia
    de los otros 3 juegos. Ahora `newMatch()` cuenta al repartir la 1.ª
    mano (`bumpStat("played")`), y se sacó el conteo duplicado de
    `recordMatchEnd()`. Test que llama `newMatch()` y confirma `played
    === 1` de inmediato, sin jugar ni terminar nada.
  - **D2 — empate en Corazones.** Al alcanzar el objetivo, un empate en el
    MENOR puntaje (2+ jugadores) lo resolvía en silencio el sort estable
    de `showWin()`, favoreciendo al de asiento más bajo. `endHand()` ahora
    sólo marca `pendingOver = true` si alguien llegó al objetivo Y el
    líder es único; con empate, se juega una mano más (el flujo normal de
    "Continuar" ya reparte la siguiente mano cuando `pendingOver` es
    falso, así que no hizo falta tocar nada más). Test con dos escenarios:
    empate en 100 → sigue jugando; líder único en 100 → termina.
  - **Limpieza:** `SEAT[].name`/`SEAT[].human` en Corazones (nadie los
    leía; los nombres salen de `DEFAULT_NAMES`/`names`) y los símbolos de
    `SUIT` en Solitario (escapes `♠` → glifos literales, igual que
    Carta Blanca y Corazones).
  - **`VERSION` de `sw.js` a `v1.29.0`**; capturas de referencia
    regeneradas (0 diferencias).
  - **Puerta:** 85/85 tests verdes (incluida la partida completa por la UI
    corrida 5 veces seguidas, para confirmar que D2 no introduce
    inestabilidad con `target` bajo), `tsc -p .` limpio, 35/35
    comparaciones visuales.

- **Fase 5 (hecha, alcance acotado) — el mayor riesgo del plan, y el que
  más justificó ir de menor a mayor riesgo con la red de la Fase 0 ya
  puesta.**
  - **`.idx`/`.pip` → `styles/cards.css`.** Extracción mecánica de los
    bloques ya idénticos entre `solitario.css` y `carta-blanca.css` a
    `cards.css`, dejando el override en `corazones.css`.
    **Bug real encontrado por la propia regresión visual, no por
    inspección:** el primer intento dio 4 capturas de Corazones con
    ~2% de píxeles distintos (por encima del umbral) — nada que se
    notara a simple vista (un "fantasma" sutil en los dígitos del
    índice/pip de la mano abanicada). La causa: CSS cascada por
    DECLARACIÓN, no por regla completa — `corazones.css` sobreescribe
    `.card .idx`/`.card .pip` pero nunca mencionaba `right`/
    `justify-content` (en `.idx`) ni `left`/`top`/`transform` (en
    `.pip`), propiedades que ahora SÍ pone la regla compartida de
    `cards.css`; esas propiedades se filtraban igual, aunque el override
    de Corazones cargara después, porque el override nunca las tocaba.
    Fix: el override de Corazones ahora resetea esas propiedades
    explícitamente (`right: auto`, `justify-content: flex-start`,
    `left: auto`, `top: auto`, `transform: none`), documentado con un
    comentario que explica la regla general ("un override que participa
    de un cascade compartido tiene que ser completo para cada propiedad
    que la base define, no sólo las que difieren"). Verificado
    byte-idéntico (0 diferencias) después del fix.
  - **`shared/drag.js`.** Extrae la máquina de puntero
    (pointerdown/move/up/cancel, capa flotante, umbral de 8px de
    arrastre, buscar el `data-drop` bajo el soltado) que era casi
    idéntica entre Solitario y Carta Blanca (~100 líneas cada uno).
    Diseño: `makeDragController(cfg)`, una fábrica que closure-iza el
    estado privado (`pending`/`drag`, que se confirmó por grep que NO se
    leían desde ningún otro lugar del juego) y recibe sólo los 6 puntos
    donde los dos motores de verdad difieren (`extraPile`: "waste" vs.
    "free"; `offset()`: `OFFSET_UP` vs. `OFFSET`; `canDrag(src)`:
    siempre `true` en Solitario vs. `canSelectTableau()` en Carta
    Blanca; `selectionIndex(src)`; `tryDrop(dropAttr)`: Carta Blanca
    suma la rama del pozo libre; `onClick(src)`: la firma de
    `handleCardClick` difiere en un argumento). El resto —lectura/
    escritura de los globals `autoTimer`/`selection`/`CW`/`CH`/
    `startTimer`/`render`/`checkWin`/`getSelectionCards`, ya declarados
    igual en ambos juegos— se lee directo, sin pasarlo por `cfg` (son
    `<script>` clásicos de un solo scope global, no módulos).
    **Verificación real, no sólo el test automático existente:** el test
    de Playwright ya cubría el drag & drop de Solitario; para Carta
    Blanca (sin test de drag dedicado) se armó un script de verificación
    aparte con arrastre de puntero real, que confirmó (a) una escalera
    VÁLIDA de 2 cartas se arrastra como grupo y mueve las dos, y (b) una
    escalera INVÁLIDA (mismo color) NO inicia el arrastre (`canDrag`
    corta antes) ni se mueve nada — el primer intento de este chequeo
    dio un falso positivo (parecía que sí arrastraba) por un error del
    propio script de verificación, no del código: el click apuntaba al
    centro de la carta de arriba, pero esa zona está tapada por la carta
    de abajo en el DOM (mismo problema de solapamiento visual que llevó
    al rediseño de cartas de esta semana); apuntando a la franja
    superior expuesta, el comportamiento resultó correcto.
    `shared/global.d.ts` suma las declaraciones ambientales para estos
    globals (mismo patrón que `SUIT`/`RANK_LABEL` para `cards.js`).
  - **Reloj + deshacer (`snapshot`/`undo`) — evaluado, NO extraído.** El
    bloque de reloj ya había quedado 100% byte-idéntico entre los dos
    juegos tras el fix de timestamps de la Fase 1 (confirmado por
    `diff`); `snapshot()` también es idéntico; `undo()` difiere en UNA
    línea (`stuckCheckMoves = -1`, un concepto que sólo existe en
    Solitario). La duplicación remanente es de ~20 líneas — extraerla a
    un archivo compartido nuevo habría costado MÁS líneas de las que
    ahorra (script tag ×2, entrada en `sw.js`, entrada en el test de
    `@ts-check`, declaraciones en `global.d.ts`, el propio archivo con
    su comentario de cabecera), a diferencia de `drag.js` (~100 líneas,
    ganancia neta clara) y la consolidación de CSS (también ganancia
    clara). Se documenta acá la decisión en vez de forzar la extracción
    por completar la lista original — mismo criterio que ya aplica el
    proyecto en otras fases ("sólo se deduplica lo que ya tiene dos
    consumidores reales" no alcanza si además no es una ganancia neta).
  - **`VERSION` de `sw.js` a `v1.30.0`** (`shared/drag.js` nuevo, sumado
    a `ASSETS`); capturas de referencia sin diferencias.
  - **Puerta:** 85/85 tests verdes (3 corridas seguidas), `tsc -p .`
    limpio, 35/35 comparaciones visuales (incluida la corrección del bug
    de CSS encontrado en el camino), verificación manual de drag & drop
    en Carta Blanca (válido e inválido) además del test automático de
    Solitario.

- **Fase 6 (hecha) — CI y tests de largo alcance.**
  - **Presupuesto de peso.** Nuevo test que suma los bytes de todo lo
    listado en `ASSETS` de `sw.js` y lo compara contra un tope de 400 KB
    (el total actual ronda 341 KB), con el mismo criterio explícito que
    `check-sw-version.sh` exige para `VERSION`: si el crecimiento es
    intencional, subir el tope a mano, no ampliarlo en silencio. Convierte
    la promesa de "interactivo < 2 s" del PRD en una puerta de CI.
  - **Job de humo Firefox (D3).** Mismo patrón que el job de WebKit ya
    existente: instala Firefox con Playwright en el job de CI y corre
    `PW_BROWSER=firefox npm test -- --smoke`. `tests/run.js` ganó una
    tercera rama en el selector de navegador (`chromium`/`webkit`/
    `firefox`, vía `playwright-core`). Cierra la promesa de compatibilidad
    con Firefox del RNF-07 con verificación real en CI, no sólo
    documentada. **Sin verificación local completa:** el entorno de
    sandbox de esta sesión bloquea la descarga del binario de Firefox
    (`403 request rejected` contra el CDN de Playwright); el cambio
    replica exactamente el job de WebKit ya probado, y CI (con acceso de
    red completo) sí lo ejecuta de punta a punta.
  - **Accesibilidad automatizada con axe-core.** Vendorizado como
    devDependency de `tests/` (nunca se sirve en producción — RNF-01
    intacto), corre sobre las 6 páginas y encontró 3 problemas reales que
    la Fase 4 (RNF-08) no había cubierto porque axe audita cosas que el
    ojo y los tests manuales de teclado no marcan:
    1. **Faltaba un `<main>` landmark** en `solitario.html`,
       `carta-blanca.html`, `corazones.html`, `buscaminas.html` y
       `estadisticas.html` (el `<div id="app">`/`<div id="wrap">` raíz
       pasó a `<main id="app">`/`<main id="wrap">`; `index.html` ya tenía
       uno). Sin landmark, un lector de pantalla no puede saltar directo
       al contenido principal.
    2. **Faltaba un `<h1>` único** en las 4 páginas de juego (el
       `<div class="title">` pasó a `<h1 class="title">`); `.title` en
       `styles/game.css` suma `margin: 0` para no cambiar el layout
       (antes heredaba el margen 0 implícito de un `<div>`, un `<h1>`
       trae margen propio del user-agent stylesheet).
    3. **Contraste insuficiente** en `.empty` de `styles/estadisticas.css`
       (el texto "Todavía no jugaste ninguna partida"): `opacity: 0.6`
       contra el fondo claro de la tarjeta daba 3.94:1, por debajo del
       mínimo WCAG AA de 4.5:1 para texto normal. Subido a `opacity: 0.7`
       (5.32:1 en claro, 6.30:1 en oscuro), documentado con la cuenta
       exacta en un comentario.
    La regla `meta-viewport` se desactivó a propósito en el test (el
    viewport fijo — `user-scalable` implícito en `viewport-fit=cover` — es
    intencional en una PWA táctil, no un descuido).
  - **Dependabot** (`.github/dependabot.yml`, nuevo): vigila
    `tests/package.json` semanalmente. Playwright sigue clavado a
    `1.61.1` a propósito (reproducibilidad de las capturas deterministas
    de `screenshot.js`); Dependabot avisa de versiones nuevas para
    decidir el bump a mano, no lo aplica solo — documentado en un
    comentario dentro del propio YAML.
  - **`VERSION` de `sw.js` a `v1.31.0`** (los 5 HTML tocados y
    `styles/game.css`/`styles/estadisticas.css` cambiaron); capturas de
    referencia sin diferencias.
  - **Puerta:** 92/92 tests verdes (3 corridas seguidas, incluidos los 6
    tests nuevos de axe-core y el de presupuesto de peso), `tsc -p .`
    limpio, 35/35 comparaciones visuales sin diferencias.

- **Fase 7 (hecha con un bloqueo parcial) — rituales de largo plazo.**
  - **Patrón de migración de esquema** (punto 2): documentado en
    [COMO-AGREGAR-UN-JUEGO.md](./COMO-AGREGAR-UN-JUEGO.md), nueva sección
    "Cuándo cambia el formato de guardado". El piso actual (`v !== 1` →
    descartar) es correcto mientras exista una sola forma de guardado por
    juego; el patrón escrito de antemano (migrar con una función dedicada
    `migrateV1()`, validar el resultado con el MISMO validador que un
    guardado nativo, descartar si la migración o la validación fallan,
    nunca reescribir el guardado en el momento —el próximo `gameSet()` ya
    lo persiste en la forma nueva—, y un test de regresión que siembra un
    payload `v: 1` real) evita que cada juego improvise el suyo el día que
    haga falta un `v: 2`.
  - **Ritual de cierre de fase** (punto 3): formalizado como una sección
    nueva de este documento ("Ritual de cierre de fase", antes de
    "Estado"), con los 7 pasos que ya se venían siguiendo de hecho en las
    Fases 0-6 (test primero, grep anti-desfase, suite+tsc+visual,
    `VERSION`, docs en el mismo commit, tag de release, commit → push →
    merge `--ff-only`) — ahora escritos como checklist fijo para cualquier
    fase futura, en éste o en un próximo `PLAN-N.md`.
  - **Grep anti-desfase corrido sobre el propio cierre:** `grep -rn "no
    implementado\|pendiente\|sin implementar" docs/` encontró una
    contradicción real y vigente: RNF-07 del PRD todavía describía "CI no
    corre Firefox" como brecha abierta, cuando la Fase 6 ya la cerró.
    Corregido (RNF-07 ahora dice sólo lo que es cierto hoy). El resto de
    los resultados son registro histórico deliberado (entradas de
    CHANGELOG y de la propia narrativa de Progreso de este plan, que
    describen una brecha que era cierta EN ESE MOMENTO) o un ítem
    genuinamente pendiente y ya documentado como tal (extender el test de
    contrato de registro a "persiste y restaura", ARQUITECTURA.md §10).
  - **Tags de release (punto 1) — bloqueo de infraestructura, no de
    diseño.** Se reconstruyeron y crearon localmente los 25 tags
    `v0.1.0`…`v1.18.0` (retroactivo incluido), mapeando cada versión del
    changelog al commit real que la cierra cruzando fecha + contenido de
    cada entrada contra `git log` (documentado acá para que quede
    reproducible si hace falta rehacerlo): `v0.1.0`→`870d380`,
    `v0.3.0`→`4455cdc`, `v0.5.0`→`a1dcc52`, `v0.9.0`→`51e58ed`,
    `v1.0.0`→`525077a`, `v1.1.0`→`8bf6d7f`, `v1.2.0`→`e157e83`,
    `v1.3.0`→`2c880d7`, `v1.4.0`→`20780d5`, `v1.5.0`→`3400c83`,
    `v1.6.0`→`ae4c6c2`, `v1.7.0`→`e1500f4`, `v1.8.0`→`db4f149`,
    `v1.9.0`→`be6a228`, `v1.10.0`→`9e6f6ff`, `v1.11.0`→`38a76cc`,
    `v1.12.0`→`b06aa9d` (incluye el commit "(ajuste)" que la propia entrada
    del changelog de 1.12.0 ya describe), `v1.12.1`→`6f04526`,
    `v1.12.2`→`625cd30`, `v1.13.0` a `v1.18.0` → los commits
    `"X.Y.Z: ..."` ya explícitos en el log. **`git push origin --tags` (y
    por tag individual) devuelve 403** mientras el push de ramas al mismo
    repo funciona sin problema — confirmado que no es un problema de CA/
    red (el resto de esta sesión empujó y mergeó ramas sin inconvenientes)
    sino una restricción de política sobre refs de tag para el token de
    esta sesión. Los tags quedan creados en el checkout local (que es
    efímero) pero no publicados en `origin`; alguien con permisos de
    push de tags sobre `ftranchet/solitario` tiene que correr algo
    equivalente a `git push origin v0.1.0 v0.3.0 v0.5.0 v0.9.0 v1.0.0
    v1.1.0 v1.2.0 v1.3.0 v1.4.0 v1.5.0 v1.6.0 v1.7.0 v1.8.0 v1.9.0 v1.10.0
    v1.11.0 v1.12.0 v1.12.1 v1.12.2 v1.13.0 v1.14.0 v1.15.0 v1.16.0
    v1.17.0 v1.18.0` (los commits de arriba, si hay que recrearlos) para
    cerrar este punto.
  - **Puerta:** rituales 2 y 3 completos y verificados (grep sin
    contradicciones tras la corrección de RNF-07); punto 1 con el mapeo
    completo y reproducible pero sin publicar (ver arriba).

- **Post-plan — segunda auditoría integral (2026-07-11, publicada en
  1.20.0).** Con las 8 fases cerradas se corrió una segunda auditoría de
  código y documentación completa, siguiendo el "Ritual de cierre de fase"
  ya formalizado (test primero para cada bug). Lo encontrado y arreglado —
  detalle completo en el CHANGELOG, versión 1.20.0: 2 bugs visuales de modo
  oscuro (verde "líder" de Corazones a 2.58:1 de contraste; fichas del
  launcher blancas contra la política "Oscuro total"), 2 huecos de RNF-04
  contra guardados artesanales (manos desparejas en Corazones que
  crasheaban la IA; dificultad falsa/mina revelada en Buscaminas que
  contaminaba estadísticas), 1 inconsistencia entre juegos (el
  autocompletado de Solitario no arrancaba el reloj; Carta Blanca sí),
  deduplicación del CSS de carta que la Fase 5 no había cubierto (~80
  líneas de solitario.css/carta-blanca.css → cards.css/game.css, verificado
  byte-idéntico por la regresión visual ANTES de regenerar referencias),
  token `--gold-rgb` para eliminar los ~48 dorados hardcodeados, código
  muerto (`asNumArray`, parámetro `mid` de `scoreRow`), y regresión visual
  ampliada a 40 capturas (los 5 estados intermedios ahora también en
  oscuro). 4 tests nuevos (96 en total), cada uno verificado en rojo
  contra el código sin arreglar antes del fix.
