# Plan 2 — Robustez, seguridad y consistencia

**Roadmap por fases (documento vivo)**

| Campo | Valor |
|---|---|
| Estado | **Propuesto** (ninguna fase iniciada) |
| Versión | 1.0 |
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

### Fase 4 — Inconsistencias menores y reglas · _tamaño M · 2 decisiones_

> **Decisiones de producto** (no se implementan a ciegas, como el modo oscuro
> en su momento):
>
> - **D1 — "Partidas jugadas":** en Solitario/Carta Blanca/Buscaminas cuenta
>   al *empezar*; en Corazones, al *terminar* la partida. Opciones: (a)
>   Corazones cuenta al repartir la primera mano —consistente con el resto,
>   **recomendada**—, o (b) se re-rotula la fila en Estadísticas
>   ("Partidas terminadas").
> - **D2 — Empate al alcanzar el objetivo en Corazones:** hoy gana el
>   empatado con menor asiento (favorece al humano en silencio). Opciones:
>   (a) jugar una mano de desempate —regla habitual, **recomendada**—, o
>   (b) declarar victoria compartida y mostrarla como tal.

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
3. **Reloj + deshacer (`snapshot`/`undo`) compartidos**, aprovechando que la
   Fase 1 ya tocó el reloj en ambos (la duplicación transitoria del fix de
   timestamps se paga acá).

**Puerta:** suite completa verde + regresión visual completa + diff mecánico
documentado en el commit de cada extracción. Si un paso no da byte-idéntico
visual, se corta y se reevalúa (no se fuerza).

### Fase 6 — CI y tests de largo alcance · _tamaño S · 1 decisión_

> **D3 — Firefox:** el PRD (RNF-07) promete compatibilidad con Firefox pero
> CI no lo corre. Opciones: (a) job de humo Firefox como el de WebKit
> (**recomendada**: son ~10 líneas de workflow reutilizando `--smoke`), o
> (b) ajustar RNF-07 para prometer sólo lo verificado.

1. **Presupuesto de peso:** test que suma los bytes de `ASSETS` contra un tope
   (p. ej. 400 KB) — convierte la métrica del PRD "interactivo < 2 s" en
   puerta de CI, al estilo de la guardia de `VERSION`.
2. **D3** según lo decidido.
3. **Accesibilidad automatizada:** axe-core (vendorizado en `tests/`, no en
   producción — RNF-01 no se toca) sobre las 6 páginas; convierte RNF-08 en
   verificable como ya se hizo con la CSP.
4. **Cadencia de dependencias de test:** Dependabot acotado a `tests/`
   (Playwright está clavado en 1.61.1 — bien por reproducibilidad, pero un
   Chromium viejo deja de parecerse a los navegadores reales).

**Puerta:** CI verde con los jobs/chequeos nuevos activos.

### Fase 7 — Rituales de largo plazo · _tamaño S_

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

---

## Lo que la auditoría encontró y este plan NO ataca (a propósito)

| Ítem | Por qué no |
|---|---|
| Optimizaciones de render (rebuild completo por jugada, snapshots JSON de deshacer) | Medidos contra la escala real (52 cartas, ≤400 snapshots de ~5 KB) no son un problema hoy. Optimizar sin síntoma es complejidad gratis. |
| `BroadcastChannel` para sincronizar pestañas | El candado actual (un solo dueño del guardado) ya evita la corrupción, que era el riesgo real. Sincronización viva es una feature, no robustez; va al backlog del PRD. |
| Exportar/importar estadísticas | Ya está en el backlog del PRD (§8). Este plan no lo re-prioriza. |
| Migrar motores a ES Modules / interfaz `mount/serialize/restore` | Misma decisión de PLAN.md y ARQUITECTURA.md: paga recién con un 5.º juego real. |

## Estado

Estado: ✅ Hecho · 🟡 En curso · ⬜ Pendiente.

| Fase | Alcance | Tamaño | Estado |
|---|---|:---:|:---:|
| 0 | Desflaquear + regresión visual de estados intermedios y oscuro | S | ⬜ |
| 1 | 4 bugs (autoTimer, lunas, reloj, botón Recargar) | S | ⬜ |
| 2 | Validación de localStorage + tests de inyección | M | ⬜ |
| 3 | Documentación coherente con el código | S | ⬜ |
| 4 | theme-color, bandera por teclado, D1, D2, limpieza | M | ⬜ |
| 5 | Deduplicación (.idx/.pip → cards.css; shared/drag.js; reloj/undo) | L | ⬜ |
| 6 | Presupuesto de peso, D3 (Firefox), axe-core, Dependabot | S | ⬜ |
| 7 | Tags de release + rituales | S | ⬜ |

## Decisiones pendientes del dueño del producto

| ID | Pregunta | Recomendación | Fase |
|---|---|---|:---:|
| D1 | ¿"Partidas jugadas" de Corazones cuenta al empezar o al terminar? | Contar al repartir la 1.ª mano (consistente con los otros 3 juegos) | 4 |
| D2 | ¿Empate al alcanzar el objetivo en Corazones? | Mano de desempate (regla habitual) | 4 |
| D3 | ¿Job de Firefox en CI o ajustar RNF-07? | Job de humo Firefox (barato, cierra la promesa del PRD) | 6 |

## Progreso

_(se completa al ejecutar cada fase, con el detalle de lo hecho y lo dejado
afuera, como en PLAN.md)_
