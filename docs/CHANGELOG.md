# Changelog

Todos los cambios notables de **Juegos clásicos** se documentan en este archivo.

El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y el
proyecto adhiere (de forma aproximada) a [Versionado Semántico](https://semver.org/lang/es/).

> Las versiones anteriores a `1.1.0` se reconstruyeron a partir del historial de
> Git (el repo no tenía etiquetas). Las fechas corresponden a los commits.

## [No publicado]

_(nada por ahora — la Fase 1 de PLAN-2.md ya se publicó en 1.13.0)_

## [1.13.0] — 2026-07-11

PLAN-2.md, Fases 0 y 1: cimientos de verificación + 4 bugs reales
encontrados en la auditoría integral, cada uno con un test de regresión
verificado fallando contra el código anterior antes de aplicar el fix.

### Agregado

- **`docs/PLAN-2.md`** — plan de robustez, seguridad y consistencia, salido de
  la auditoría integral de código y documentación (2026-07-11): 8 fases
  incrementales (desflaquear/regresión visual de estados intermedios, 4 bugs,
  validación de localStorage, coherencia de docs, reglas/inconsistencias con
  2 decisiones de producto, deduplicación, CI ampliado y rituales de largo
  plazo), cada una con su puerta de verificación. PLAN.md y el PRD (§8) lo
  enlazan como plan vigente. Las decisiones D1 (Corazones cuenta "partidas
  jugadas" al repartir la 1.ª mano), D2 (empate en Corazones → mano de
  desempate) y D3 (job de humo Firefox en CI) quedaron tomadas; se
  implementan en las Fases 4 y 6.
- **PLAN-2.md, Fase 0 — cimientos de verificación de tests (hecha).**
  Se encontró y corrigió un flake real de CI (distinto del que documentaba
  PLAN.md): los 3 tests de teclado de los juegos de cartas (Solitario, Carta
  Blanca, Corazones) podían perder el foco justo antes del `Enter` cuando el
  relayout diferido por el `ResizeObserver` del tablero reconstruía el DOM
  entre medio; nuevo helper `settleRelayout()` en `tests/run.js`, verificado
  con 18 corridas completas de la suite sin fallos. `tests/screenshot.js` y
  `tests/visual.js` suman estados deterministas (escalera larga apilada,
  carta seleccionada, pozo en modo difícil) y comparan también las 6 páginas
  en modo oscuro (antes documentación estática sin verificar). 35
  comparaciones visuales (antes 24), 0 diferencias; 73/73 tests, `tsc -p .`
  limpio.

### Corregido

- **El teclado esquivaba el bloqueo del autocompletado (Solitario, Carta
  Blanca).** `handleCardClick()` no chequeaba `autoTimer` (a diferencia de
  los demás handlers): un Enter durante el autocompletado mutaba el estado
  en paralelo con la animación automática.
- **La estadística "lunas" de Corazones se podía duplicar** al recargar la
  página con el modal de fin de mano abierto (`saveGame()` no persiste en
  ese momento, así que el reload repetía el cálculo de la mano). El conteo
  ahora queda atado al cierre del modal, que ocurre una sola vez.
- **El reloj (Solitario, Carta Blanca, Buscaminas) subcontaba el tiempo en
  pestañas de fondo**, donde el navegador estrangula los `setInterval`.
  Pasa a calcularse por diferencia de timestamps en vez de sumar 1 por
  tick, así un tick tardío igual refleja el tiempo real transcurrido.
- **El botón "Recargar" del aviso de actualización podía quedar sin
  efecto** si el service worker en espera ya no estaba disponible al
  tocarlo; ahora recarga la página directamente en ese caso.

### Cambiado

- **`VERSION` de `sw.js` a `v1.26.0`** y capturas de referencia regeneradas.

## [1.12.2] — 2026-07-11

### Cambiado

- **El pip central baja al 67% de la altura de la carta (Solitario y Carta
  Blanca)**: centrado en el espacio libre DEBAJO del índice, queda a la misma
  distancia del índice y del borde inferior en todas las cartas, y ya no roza
  las figuras con cola (la Q era el peor caso). Verificado con las 4 reinas y
  con escaleras apiladas (el pip sigue sin asomarse en la franja visible).
- **`VERSION` de `sw.js` a `v1.25.0`** y capturas de referencia regeneradas.

## [1.12.1] — 2026-07-11

### Cambiado

- **Pip central más grande en Solitario y Carta Blanca** (`0.85 × ancho de
  carta`, antes `0.72`) y apenas más abajo (60% de la altura), para que el
  palo se distinga mejor sin pisar el índice superior ni asomarse en la
  franja visible de las cartas apiladas de una escalera.
- **`VERSION` de `sw.js` a `v1.24.0`** y capturas de referencia regeneradas.

## [1.12.0] — 2026-07-11

### Cambiado

- **Cartas rediseñadas para mayor legibilidad (Solitario y Carta Blanca).**
  Número y palo ahora tienen el MISMO tamaño y ocupan los extremos superiores
  de la carta (número arriba-izquierda, palo arriba-derecha), aprovechando
  todo el ancho de la franja visible cuando las cartas están apiladas. El
  palo grande (pip) pasó de la esquina inferior derecha al CENTRO de la
  carta, más grande, para distinguirlo de un vistazo — el patrón clásico de
  las cartas físicas. Corazones conserva su cara anterior (índice apilado en
  la esquina izquierda y pip abajo a la derecha): con la mano abanicada en
  horizontal el pip central asomaba detrás de cada carta y se chocaba
  visualmente con el índice apilado de la siguiente.
- **`VERSION` de `sw.js` a `v1.23.0`** y capturas de referencia regeneradas.

## [1.11.0] — 2026-07-10

Paquete de estética (los puntos B, C y E del plan acordado; A y D quedaron
descartados por ahora).

### Agregado

- **La cascada de cartas clásica al ganar (Solitario y Carta Blanca).** El
  guiño a Windows: al completar la partida, las cartas de las 4 pilas
  finales salen despedidas desde su posición real, rebotan contra el piso
  perdiendo energía y dejan ESTELA (el canvas no se borra entre frames, ésa
  es la gracia). Nueva `cascade()` en `shared/ui.js`, dibujada con los
  colores de los tokens (funciona en claro y oscuro), 4 cartas por tanda
  cada ~300ms, tope de 15s, y se corta igual que el confeti (nueva partida
  o cerrar el modal). Corazones y Buscaminas conservan su confeti. Respeta
  `prefers-reduced-motion`.
- **Reparto animado (los 3 juegos de cartas).** Al empezar una partida (o
  mano) nueva, las cartas entran con un fundido escalonado (~20ms por
  carta, `animation-delay` por columna/posición). Puramente decorativo: la
  clase `.deal` sólo va en el PRIMER render de la partida nueva, así no
  interfiere con el patrón síncrono de render/verificación que hizo
  descartar View Transitions en los motores (Fase 5 de PLAN.md).

### Cambiado

- **El cambio de tema hace un fundido suave.** View Transitions API en el
  ÚNICO lugar donde encaja: el toggle de tema (y el cambio de tema del
  sistema en modo auto). El cambio es puramente visual y la preferencia
  queda guardada sincrónicamente (`getThemePref()`); mejora progresiva con
  guarda de `prefers-reduced-motion` y fallback al cambio instantáneo. El
  test del toggle ahora espera el atributo en vez de leerlo en el mismo
  tick.
- **Viñeta sutil en el fieltro.** Una capa extra del gradiente oscurece
  apenas los bordes de la mesa (profundidad de paño real), en claro y en
  oscuro, sin tocar la CSP (gradientes CSS puros).
- **Buscaminas en oscuro: el verde de las celdas cubiertas se profundizó**
  para acompañar el resto del tablero oscuro (antes conservaba el verde
  brillante del modo claro).
- **Las capturas de referencia se toman con `reducedMotion: "reduce"`**:
  las animaciones nuevas se apagan y la regresión visual compara siempre el
  estado final estable (sin ruido por el instante de la captura).
- **`VERSION` de `sw.js` a `v1.21.0`.**

## [1.10.0] — 2026-07-10

Rediseño del riel de apaisado (a partir de un bug real en teléfonos bajos) y
un paquete de robustez: checklist ejecutable para juegos nuevos, guardia de
CI para la caché offline, barrido multi-pantalla, regresión visual
automática, guardados versionados, humo en WebKit y modales accesibles.

### Corregido

- **El botón Pista quedaba FUERA de la pantalla en apaisados bajos (y el
  riel no scrolleaba).** La fila del header del riel crecía más allá del
  viewport sin activar su overflow, empujando los controles afuera. El riel
  se rediseñó: los controles del pie (Pista, Cavar, Puntajes, Pasar) son
  ahora la fila FIJA de abajo — siempre visibles, al alcance del pulgar — y
  el header es la parte flexible que scrollea si no entra. De paso quedó más
  prolijo: HUD en fila compacta, los botones de ícono (🎮 ⚙ ?) comparten una
  fila de a tres, y a 320px de alto (iPhone SE apaisado) entra TODO, incluso
  Corazones en fase de pase. Test de regresión a 320px.

### Agregado

- **`docs/COMO-AGREGAR-UN-JUEGO.md` + test de contrato de estructura.** El
  checklist paso a paso para el 5.º juego, con su contraparte ejecutable: un
  test verifica en cada página de juego el orden de los scripts compartidos,
  que `data-store-ns` coincida con el `id` del registro (si divergen, el
  candado multi-pestaña y las stats se desincronizan en silencio), el toggle
  de Tema en Opciones, `viewport-fit=cover` y el orden de las hojas de
  estilo (tokens → base → game).
- **Guardia de CI para la caché offline (`tests/check-sw-version.sh`).** Si
  un cambio toca archivos servidos (HTML/CSS/JS/íconos/manifest) sin subir
  `VERSION` de `sw.js`, el CI falla. Era el último paso manual del proyecto.
- **Barrido de humo multi-pantalla.** Los 4 juegos cargan en 6 tamaños
  (desde iPhone SE en ambas orientaciones hasta desktop ancho) sin errores
  de consola y sin desborde horizontal.
- **Regresión visual automática.** `tests/screenshot.js` ahora usa un
  `Math.random` determinista (semilla fija): los repartos salen siempre
  iguales y las 24 capturas son reproducibles. El nuevo `tests/visual.js`
  las recaptura y compara pixel a pixel contra
  `docs/screenshots/baseline/` (pixelmatch, umbral 1.5% para absorber
  antialiasing); corre en CI. Un cambio visual no intencional rompe el
  build; uno intencional se resuelve regenerando la referencia.
- **Guardados versionados (`v: 1`).** Los 4 juegos incluyen la versión del
  formato en el JSON de partida y descartan versiones futuras desconocidas
  (mejor partida nueva que restaurar mal); los guardados legados sin `v`
  siguen cargando. Prepara migraciones ante actualizaciones.
- **Humo en WebKit (Safari) en CI.** Nuevo modo `npm test -- --smoke` (carga
  de las 6 páginas + metadatos PWA) y selector de navegador
  (`PW_BROWSER=webkit`); un job nuevo de CI lo corre sobre el motor de
  Safari, el hueco de compatibilidad más probable (dvh, container queries,
  safe-areas).
- **Modales accesibles (`shared/ui.js`).** Escape cierra los modales
  descartables (clickeando su propio botón `-close`, así corre la misma
  lógica — p. ej. cerrar la victoria también frena el confeti); el foco
  entra al abrir, Tab queda atrapado adentro (patrón WAI-ARIA de diálogo) y
  vuelve a donde estaba al cerrar; `role="dialog"`/`aria-modal`. El fin de
  mano de Corazones NO se cierra con Escape (su único botón avanza el
  juego). Tests nuevos.
- **`VERSION` de `sw.js` a `v1.20.0`.** (73 tests en total.)

## [1.9.0] — 2026-07-10

### Cambiado

- **El tamaño de carta se ajusta al estado real de la partida (adiós
  scrollbars).** `setSizes()` en Solitario y Carta Blanca ya no usa una
  fórmula fija: parte del máximo que permite el ancho y ACHICA las cartas
  hasta que la columna más alta del tablero entre completa sin scroll,
  recalculando en cada jugada (si una pila crece, las cartas se achican
  solas; al deshacerse, vuelven a crecer). Debajo de un piso de legibilidad
  (~52px de carta) deja de achicar y permite el scroll — mejor scrollear que
  cartas ilegibles. El tamaño inicial en todos los breakpoints queda igual
  que antes (±1px): el cambio se nota recién cuando una columna crece.

### Corregido

- **Buscaminas en modo oscuro: las celdas reveladas quedaban BLANCAS.**
  Conservaban el fondo crema del modo claro (un tablero oscuro con parches
  blancos). Ahora en `data-theme="dark"` usan fondo gris carbón (misma
  política que cartas y modales), los números pasan a variantes claras de
  sus colores clásicos para mantener contraste, y la mina/bandera errónea/
  explosión y la carita reseteadora también se oscurecen.
- **`VERSION` de `sw.js` a `v1.19.0`.**

### Agregado

- **Tests (69 en total):** una columna de 14 cartas achica las cartas y entra
  sin scroll (y vuelven a crecer al deshacerse); una pila imposible respeta
  el piso de legibilidad y permite scroll; las celdas reveladas de
  Buscaminas son oscuras en tema oscuro.

## [1.8.0] — 2026-07-10

Ajustes del apaisado a partir de probarlo en un teléfono real (con notch).

### Cambiado

- **Riel único a la IZQUIERDA en apaisado corto.** El riel derecho (que sólo
  tenía los botones del pie, como Pista) se eliminó: ahora header y controles
  se apilan en un solo riel izquierdo (#app pasa a grilla de 2 columnas:
  riel | tablero) y el tablero gana esos ~112px de ancho — las cartas pasan
  de ~55 a ~66px en Carta Blanca y de ~61 a ~74px en Solitario en un celular
  típico. Los botones multilínea del riel usan esquinas redondeadas normales
  (el "pill" de 999px se veía ovalado con dos líneas de texto).

### Corregido

- **Franja BLANCA en la zona del notch (apaisado con viewport-fit=cover).**
  El fondo verde es un gradiente en `body` (una imagen, no un color), y las
  zonas que el navegador pinta con el color del lienzo —la franja de la zona
  segura junto al notch, el rebote del scroll— quedaban blancas. `<html>`
  ahora declara `background-color: var(--felt-3)` (respeta claro/oscuro),
  así esas franjas son del mismo verde que el resto.
- **El bloque compacto de `max-height: 480px` pisaba el riel lateral.**
  `styles/game.css` (que carga después de `base.css`) redefinía el padding
  de header/#controls también en apaisado, pisando el del riel y PERDIENDO
  el `env(safe-area-inset-left)` del notch. Ahora ese bloque aplica sólo en
  vertical (`orientation: portrait`). El tablero además respeta
  `safe-area-inset-right` cuando el notch queda del otro lado.
- **Columnas solapadas intermitentes al rotar (Solitario/Carta Blanca).** El
  tamaño de carta se recalculaba sólo con el evento `resize` de la ventana;
  al rotar el teléfono (o al entrar/salir el riel), el tamaño real del
  tablero puede cambiar DESPUÉS del último `resize` y el cálculo quedaba
  hecho con dimensiones viejas. Ahora un `ResizeObserver` sobre el tablero
  mismo (la mesa en Corazones) dispara el recálculo cada vez que su tamaño
  real cambia, con el mismo debounce de siempre.
- **Scrollbars gruesas en PC.** Las zonas que scrollean dentro del juego
  (columnas de Solitario/Carta Blanca con pilas largas, tablero Experto de
  Buscaminas en pantallas angostas) usan ahora una scrollbar fina y
  translúcida (`scrollbar-width: thin`) en vez de la barra por defecto del
  escritorio.
- **`VERSION` de `sw.js` a `v1.18.0`.**

## [1.7.0] — 2026-07-10

Layout adaptado a la orientación real de la pantalla en los juegos de cartas
y mejor lectura del tablero en Carta Blanca.

### Cambiado

- **Solitario y Carta Blanca: layout lateral en apaisado corto.** Con el
  teléfono en horizontal (el mismo breakpoint del riel lateral,
  `landscape + max-height: 500px`), la fila superior deja de comer el alto de
  la pantalla: los **pozos libres** (Carta Blanca) o el **mazo y el descarte**
  (Solitario) pasan a una columna a la IZQUIERDA del tablero y las **pilas
  finales** a una columna a la DERECHA, con las columnas de juego usando el
  alto completo en el medio. El tablero pasa de flex a una grilla con
  `grid-template-areas` que rota entre los dos layouts, y un centinela
  `--board-layout` le dice a `setSizes()` qué fórmula de tamaño usar (en
  lateral mandan el ancho total —pozos + columnas + pilas— y el alto de la
  columna lateral de 4). El abanico del descarte de Solitario (robo de a 3)
  se abre hacia abajo en ese modo. En vertical no cambia nada: la fila
  superior clásica queda igual que siempre.
- **El reparto inicial entra completo sin scroll.** En Carta Blanca, la
  fórmula de alto ahora garantiza que la columna inicial de 7 cartas + la
  fila superior entren en el alto disponible (antes en desktop y apaisado
  había que scrollear para ver la última carta de cada columna: las cartas
  eran un poco más grandes, pero tapadas). Test de regresión en 3 viewports
  (celular vertical, celular apaisado, desktop) para los dos juegos.
- **Carta Blanca: las escaleras conectadas se ven iluminadas.** Las cartas
  que todavía no se pueden agarrar (no forman parte de la escalera conectada
  del fondo de su columna) se atenúan (`.buried`, con `filter` para que
  funcione igual en claro y oscuro); los grupos que sí se conectan quedan a
  brillo pleno, así se lee de un vistazo qué se puede mover y el palo y
  número de cada carta se distinguen mejor.
- **`VERSION` de `sw.js` a `v1.17.0`.**

### Agregado

- **Tests (66 en total):** layout lateral en apaisado corto (geometría real:
  pozos/mazo a la izquierda del tablero, pilas a la derecha, en columna),
  reparto inicial sin scroll (2 juegos × 3 viewports) y cartas enterradas
  atenuadas vs. escalera del fondo iluminada.

## [1.6.0] — 2026-07-09

### Cambiado

- **Solitario y Carta Blanca: un solo toque/clic manda la carta a su lugar.**
  Antes hacía falta tocar una carta dos veces (o doble clic) para que fuera
  sola a la fundación o a una columna válida; el primer toque sólo la
  seleccionaba. Ahora ese mismo movimiento automático (`autoMoveSelection()`,
  sin cambios en la lógica de "a dónde va") se dispara con el primer toque:
  si hay un destino legal, la carta viaja de inmediato; si no lo hay, el
  toque la selecciona igual que antes (para arrastrarla o elegir el destino
  a mano tocando otra pila). RF-SOL-02 y la ayuda "Cómo jugar" de ambos
  juegos se actualizan para reflejarlo. Sin cambios en Corazones (ya juega
  con un solo toque) ni en Buscaminas (no aplica: no hay "carta" que mover).
  Tests nuevos con click real de mouse (no sólo teclado) que verifican el
  movimiento en una sola acción; los dos tests de teclado existentes se
  simplificaron de dos activaciones a una.

## [1.5.0] — 2026-07-09

Segunda pasada de la auditoría de merge (1.4.0): cierra el hueco real que
quedaba en "agregar un juego sin romper nada" (el menú de navegación seguía
hardcodeado) y deduplica boilerplate menor de los 4 motores. Sin cambios
visuales: verificado comparando los estilos computados de las 6 páginas
(3 viewports × claro/oscuro) contra la versión 1.4.0 — cero diferencias.

### Cambiado

- **El menú de juegos (🎮) ahora se GENERA desde `games/registry.js`.** Era el
  único lugar donde "agregar un juego = una sola edición en el registro" no
  se cumplía todavía: el `<div id="menu">` de las 4 páginas de juego tenía el
  listado de juegos escrito a mano, con el SVG de Carta Blanca duplicado 4
  veces. Nuevo `shared/menu.js` arma `.game-list` iterando `window.GAMES`
  (marca el juego actual comparando `data-store-ns` de `<html>` contra el
  `id` del registro, que ya coincidían 1:1). Las 4 páginas suman
  `<script src="games/registry.js">` (mismo lugar que ya tenía
  `index.html`/`estadisticas.html`) y `<script src="shared/menu.js">` antes
  del motor. El test de contrato del menú (antes leía HTML estático) ahora
  hace un click real en `#btn-menu` y verifica el DOM generado.
- **`el()` y el debounce del `resize` a `shared/ui.js`.** `function el(tag,
  cls, html)` estaba duplicada idéntica en Solitario, Carta Blanca y
  Corazones (Buscaminas no la usa); el patrón `resizeTimer` +
  `clearTimeout`/`setTimeout` del listener de `resize` estaba duplicado
  idéntico en los mismos 3 motores. Se extraen a `el()` y `debounce(fn, ms)`
  compartidas (`@ts-check` estricto).
- **`loadStats`/`saveStats`/`bumpStat` a `shared/storage.js`.** Nueva
  `makeStats(key)` (fábrica mínima: `{load, save, bump}`) reemplaza la
  implementación idéntica que repetían los 4 motores. `recordWin`/
  `recordMatchEnd` siguen por juego a propósito: agregan campos distintos
  (tiempo+movimientos, sólo tiempo, puntaje de partida, récord por
  dificultad) y generalizarlos sería forzar una interfaz común sin beneficio
  real.
- **`VERSION` de `sw.js` a `v1.15.0`** (asset nuevo `shared/menu.js`).

### Corregido

- **`celebrate()` (confeti) reasignaba el tamaño del canvas en cada evento
  `resize` sin debounce.** Arrastrar el borde de la ventana (o rotar el
  celular) durante los ~4.5s de animación disparaba `canvas.width =
  window.innerWidth` decenas de veces por segundo — cada asignación fuerza
  un reflow del canvas. Ahora usa el `debounce()` compartido (mismo criterio
  que ya aplicaba el `resize` de cada motor).
- **Buscaminas: el respaldo para navegadores sin container queries (`cqw`)
  podía forzar scroll horizontal en pantallas angostas.** El respaldo fijaba
  `--cell: 32px` sin importar el ancho disponible; un tablero Intermedio (16
  columnas) en un celular común ya desbordaba (16 × 32px = 512px). Ahora es
  un respaldo en capas: el piso incondicional de 32px se mantiene para
  navegadores sin `min()`/`max()` en CSS (~pre-2020), y donde sí hay
  `min()`/`max()` (la mayoría del hueco 2020-2022 sin `cqw` todavía) se
  refina con una fórmula basada en el ancho de ventana con el mismo piso de
  legibilidad (16px) y techo (44px) que ya usa el camino principal. Un
  tablero Experto (30 columnas) puede seguir necesitando scroll — el piso de
  legibilidad no da para 30 columnas en un celular — igual que ya acepta el
  camino principal con `cqw`.

### Agregado

- **Tests (61 en total):** riel lateral (`#app` debe quedar en
  `flex-direction: row` a 844×390, el breakpoint apaisado corto de
  docs/PLAN.md Fase 2 — ya hubo una regresión real de cascada ahí) y tema
  "auto" (con `page.emulateMedia({ colorScheme })`, verifica que
  `shared/theme.js` reacciona en vivo al cambio de `prefers-color-scheme`
  del sistema sin que el usuario toque nada, cubriendo el modo por defecto
  que usan todos los usuarios que nunca abrieron Opciones).

## [1.4.0] — 2026-07-09

Cierre de las fases del [PLAN.md](./PLAN.md) (0-5) más una auditoría general
de merge: bugs visuales, deduplicación de CSS/JS, robustez de guardados y
documentación puesta al día.

### Agregado

- **Tests (59 en total):** un test de contrato nuevo verifica que el **menú de
  juegos (🎮)** de las 4 páginas de juego coincide con `games/registry.js`
  (mismos juegos, mismo orden, mismos href, el actual marcado como tal). El
  menú es HTML estático repetido en las 4 páginas; hasta ahora nada detectaba
  si al agregar un juego se olvidaba actualizar uno (mismo mecanismo que el
  contrato registro vs. manifest). Otro test nuevo cubre el rechazo de
  guardados con cartas repetidas en Corazones (ver Corregido).
- **Fase 0 de PLAN.md: base y red de seguridad.** Capturas de referencia de
  las 6 páginas en 4 breakpoints (`docs/screenshots/baseline/`, generadas con
  `tests/screenshot.js`) para detectar regresiones visuales en las próximas
  fases. Nuevo test de precache: compara el filesystem contra la lista
  `ASSETS` de `sw.js` y falla si se sirve un archivo no cacheado.
- **Aviso "hay una versión nueva" (Fase 5 de PLAN.md).** `sw.js` ya no llama
  `self.skipWaiting()` en `install`: un SW nuevo queda **en espera**
  (`registration.waiting`) en vez de tomar el control solo, así el SW viejo
  sigue sirviendo la pestaña hasta que el usuario decide actualizar.
  `shared/pwa.js` detecta ese estado (al registrar, o vía `updatefound` →
  `installing` llega a `"installed"` con un `controller` ya activo) y muestra
  un aviso flotante con botón **"Recargar"** (nueva variante `.toast-action`
  en `styles/base.css`, interactiva y sin autodescarte — se arma con DOM
  plano en `pwa.js` en vez de reusar `toast()` de `shared/ui.js`, porque
  `pwa.js` se carga igual en las 6 páginas y dos de ellas no enlazan
  `shared/ui.js`). Al tocar "Recargar" se manda `"skip-waiting"` al SW en
  espera (el listener de `message` en `sw.js` existía sin usar) y la página
  recarga cuando ese SW toma el control; si otra pestaña dispara la
  actualización primero, ésta también recarga al recibir el mismo evento, así
  todas quedan sincronizadas en la misma versión. Reemplaza el auto-reload
  silencioso que se había agregado como parche durante la Fase 3. Dos tests
  nuevos (57 en total), `tsc -p .` limpio, `VERSION` de `sw.js` a `v1.13.0`.
  Ver [PLAN.md](./PLAN.md), Fase 5.
- **Modo oscuro (Fase 4 de PLAN.md), paleta "Oscuro total".** La suite ahora
  tiene tema claro/oscuro. Nuevo módulo `shared/theme.js` (cargado primero en
  el `<head>`, sin flash) que fija `data-theme` en `<html>` según una
  preferencia **global** en `localStorage`: `auto` (sigue el sistema, por
  defecto), `light` o `dark`. Los tokens oscuros viven en un único bloque
  `:root[data-theme="dark"]` de `styles/tokens.css` + un bloque de overrides
  para las superficies con color hardcodeado (modales, controles); como el
  resto del CSS ya leía los tokens, el tema se propaga solo. Se agregó un
  control **Tema (Auto/Claro/Oscuro)** al modal de Opciones de los 4 juegos.
  De tres paletas presentadas con capturas se eligió **"Oscuro total"**: un
  modo oscuro de verdad, con **cartas gris carbón** (no blancas), modales
  oscuros y texto/palos claros. Modo claro **byte-idéntico** al anterior (los
  overrides sólo aplican con `data-theme="dark"`). 55 tests verdes (uno nuevo
  verifica que el toggle aplica los tokens, persiste y es global), `tsc -p .`
  limpio. Ver [PLAN.md](./PLAN.md), Fase 4.

### Corregido

- **La carta sugerida por la Pista se veía atenuada en Solitario y Carta
  Blanca.** La clase `.hint` se usaba a la vez para el texto de ayuda chico de
  los modales (`font-size: 12.5px; opacity: 0.65`) y para la carta/casilla
  resaltada por la Pista (`.card.hint`), así que la carta sugerida heredaba el
  65% de opacidad y se veía APAGADA en vez de destacada, peleando con su
  animación dorada. El texto de ayuda pasa a llamarse `.hint-txt` (como ya
  hacían Corazones y Buscaminas) y la carta resaltada queda a opacidad plena.
- **Carta Blanca: el selector de Tema (Opciones) estaba sin estilos.** Al
  agregar el toggle de tema (Fase 4) a los 4 modales de Opciones, Carta Blanca
  quedó sin las reglas `.seg`/`.seg-btn` (su hoja nunca las tuvo porque su
  modal no tenía segmented controls antes): los botones Auto/Claro/Oscuro se
  veían como botones nativos sin formato. La consolidación del chrome en
  `styles/game.css` (ver Cambiado) los estila igual que en los otros juegos.
- **Corazones: un guardado con cartas repetidas ahora se descarta (RNF-04).**
  `validSaved()` validaba forma y cantidad (52) pero no unicidad: un guardado
  corrupto con la misma carta dos veces pasaba la validación (Solitario y
  Carta Blanca ya lo rechazaban). Test de regresión nuevo.
- **Corazones: la ayuda describía "disparar a la luna" sólo en su modo por
  defecto** (los demás +26), sin mencionar que en Opciones se puede elegir el
  modo "vos −26".
- **Service worker servía CSS/JS viejo junto con HTML nuevo (UI rota tras
  actualizar).** El SW cacheaba el CSS/JS con estrategia *stale-while-
  revalidate* (copia de caché primero). Al cambiar estilos en varias fases sin
  subir `VERSION`, un visitante que ya tenía la app cacheada recibía el HTML
  nuevo junto a un `styles/base.css` viejo, y la interfaz se veía rota. Se
  corrigió en varias capas:
  - **Network-first para el código del app shell** (HTML, CSS y JS): en línea
    las tres piezas se traen siempre de la misma versión y no pueden
    desincronizarse aunque se olvide subir `VERSION`; sin conexión se sirve la
    copia cacheada. Los binarios (íconos, favicon, manifest) siguen
    *stale-while-revalidate* (casi nunca cambian, desincronizarse no rompe
    nada). **Test de regresión** que envenena la caché con un `base.css` viejo
    (con un centinela) y verifica que la recarga en línea igual trae el fresco.
  - **Auto-actualización del SW en `shared/pwa.js`**: registro con
    `updateViaCache: "none"` (el navegador siempre chequea `sw.js` contra la
    red, no contra su caché HTTP) y, cuando un SW nuevo toma el control tras
    una actualización, la página se **recarga una sola vez** sola. Así un
    visitante que quedó con un SW viejo se recupera sin borrar la caché a mano.
  - Se sube `VERSION` en cada cambio de assets para forzar el re-precache
    limpio en clientes con la caché vieja.
- **Buscaminas:** `onLong()` (bandera por toque largo / clic derecho) ahora
  también ignora la entrada mientras se genera el tablero "sin adivinanzas"
  (`generating`), igual que `onTap()`. Hoy no era alcanzable durante la
  generación (lo bloquea `onPointerDown`), pero deja la función simétrica con
  `onTap` y cierra la misma trampa latente que la auditoría anterior corrigió
  para el teclado.
- **Buscaminas se rompía en navegadores sin container queries.** Al pasar el
  dimensionado del tablero a CSS (Fase 2) quedó dependiendo 100% de las
  unidades `cqw`/`cqh` (soporte desde ~2022), sin respaldo tras eliminar el
  `setSizes()` de JS. Se agregó un `@supports not (width: 1cqw)` que fija un
  tamaño de celda razonable, así el tablero degrada a algo funcional en vez de
  romperse en un navegador viejo.

### Cambiado

- **Deduplicación del "chrome" de las páginas de juego → `styles/game.css`.**
  Las reglas repetidas byte-idénticas en las 4 hojas de cada juego (body y
  tipografía, cabecera —marca/HUD/acciones—, modales, segmented buttons, menú
  de juegos, `.pill` y sus media queries de 700px/1100px/480px) se
  consolidaron en una hoja nueva `styles/game.css` que enlazan sólo las 4
  páginas de juego (~150 líneas menos por hoja; `index.html`/
  `estadisticas.html` no la cargan porque su layout scrollea y no tienen
  modales de juego). Sin cambios visuales: verificado comparando los
  **estilos computados** de todos los elementos de las 6 páginas antes y
  después (3 viewports × claro/oscuro, con repartos deterministas); las únicas
  diferencias son los dos arreglos intencionales de arriba. De paso se retiró
  CSS muerto (`.game-link .soon`, `.game-link.disabled`, y `.sub`/`.danger`
  en `estadisticas.css`, sin ningún uso en el HTML/JS).
- **Deduplicación del festejo (confeti) → `shared/ui.js`.** `celebrate()` y
  `stopConfetti()` estaban repetidas idénticas en los 4 motores (~50 líneas
  × 4); ahora viven en `shared/ui.js` (con `@ts-check` estricto, cubierto por
  `tsc` en CI), mismo movimiento que ya se hizo con `toast()` y
  `clickActivate()`. Sigue respetando `prefers-reduced-motion`.
- **`VERSION` de `sw.js` a `v1.14.0`** (asset nuevo `styles/game.css` +
  cambios de CSS/JS) para refrescar la copia offline de los clientes
  instalados.
- **Documentación puesta al día tras la auditoría:** la matriz del PRD marcaba
  "Temas claro/oscuro" y "Aviso de actualización del SW" como pendientes
  (están implementados desde las Fases 4 y 5 de PLAN.md); el PRD seguía
  describiendo cada juego como "un único archivo HTML autocontenido" (desde
  la capa compartida ya no lo es) y RF-PWA-05 describía la estrategia de
  caché vieja; `ARQUITECTURA.md` citaba un total de tests desactualizado; un
  comentario de `games/registry.js` decía que el motor vivía en
  `<juego>.html` (vive en `games/<juego>.js` desde la Fase 1); y este
  changelog acumulaba dos tandas de secciones Agregado/Corregido/Cambiado
  bajo "[No publicado]" (se fusionaron y se corta la versión 1.4.0 acá).
- **View Transitions API: se probó y se descartó (Fase 5 de PLAN.md), con
  evidencia.** Se intentó envolver el `render()` de los 4 motores en
  `document.startViewTransition()` como mejora progresiva. Rompió tests de
  teclado/drag de inmediato; una reproducción mínima aislada confirmó la
  causa raíz: el callback de `startViewTransition()` no corre
  sincrónicamente (el navegador lo encola para una tarea posterior), y los 4
  motores —además de varios tests— dependen del patrón "actuar y verificar
  el DOM ya actualizado en el mismo tick". Forzarlo habría exigido un
  refactor bastante más grande que "pulido progresivo" y en tensión directa
  con la puerta de la fase (no alterar ningún test existente). Los dos casos
  que motivaban el pedido (carta → fundación, recoger baza) ya tienen
  animación dedicada y probada (`.card.land`, `#trick.collect.to-*`), así que
  el costo no se justificaba. Se revirtió por completo, sin dejar código
  muerto. Ver [PLAN.md](./PLAN.md), Fase 5.
- **Íconos: se probó pasarlos a SVG (Fase 3) y se volvió a emojis.** La Fase 3
  reemplazó los emojis de la interfaz por un set de íconos SVG minimalista
  (para verse igual en iOS/Android/Windows), pero el resultado no convenció
  estéticamente, así que se **revirtió a los emojis** de siempre. Queda
  pendiente una solución superadora (un set de íconos que sea a la vez
  minimalista y lindo) antes de volver a intentarlo. La Fase 3 dejó igual dos
  aprendizajes que **sí se conservan**: el arreglo del service worker
  (network-first) y la auto-actualización del SW (ver arriba), que nacieron de
  depurar el problema de "íconos rotos tras actualizar".
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
- **Documentación:** se consolidó el trabajo hacia adelante en un nuevo
  [PLAN.md](./PLAN.md) (plan por fases desde Fase 0) y se retiraron de
  `ARQUITECTURA.md` las propuestas "Fase 7+" (§12/§13), que quedaban duplicadas.
  `ARQUITECTURA.md` pasa a ser el registro de lo ya construido; el roadmap del
  PRD (§8) apunta a PLAN.md. Se corrigieron referencias y comentarios
  desactualizados (p. ej. una nota de `shared/ui.js` que citaba una fase que
  finalmente no se hizo).
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
