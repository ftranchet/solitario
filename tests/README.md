# Tests

Tests de navegador (Playwright) que abren los HTML reales en Chromium y verifican
los flujos clave, las reglas de juego, la persistencia y las regresiones ya
corregidas. No hace falta configurar nada: `run.js` levanta su propio servidor
HTTP local (localStorage se comporta igual que en producción).

## Cómo correrlos

```bash
cd tests
npm install
npm test
```

Salida esperada: una línea `✓` por test y al final `N pasaron, 0 fallaron`.
El proceso devuelve código distinto de cero si algún test falla (sirve para CI).

## Qué navegador usa

`run.js` busca Chromium en este orden:

1. `CHROMIUM_BIN` (o `CHROME_BIN`) si apunta a un ejecutable.
2. `PLAYWRIGHT_BROWSERS_PATH` (Chromium preinstalado, p. ej. en Claude Code web).
3. El Google Chrome instalado en el sistema (`channel: "chrome"`).

Si no encuentra ninguno, definí la ruta a mano:

```bash
CHROMIUM_BIN="/ruta/a/chrome" npm test
```

> Se usa `playwright-core` (no descarga navegadores) para que la instalación sea
> liviana y funcione tanto acá como en tu máquina con Chrome ya instalado.

## Qué cubre

**Humo y regresiones**

| Test | Qué valida |
|------|-----------|
| Carga sin errores (×6) | Las 6 pantallas cargan sin errores de consola/página |
| Corazones · fin de mano | **Regresión**: el modal de puntajes aparece al terminar la mano (bug `history` vs `window.history`) |
| Corazones · partida completa | Jugar de punta a punta por la UI llega al modal de victoria |
| Corazones · dos pestañas | Coordinación entre pestañas: un único "dueño" del guardado |
| Buscaminas · sin adivinanzas | La generación en Experto completa y revela (no congela; trabajo troceado) |
| Solitario · victoria | El modal de victoria aparece |
| Solitario · autocompletar | El autocompletado corta al no haber progreso (no cicla de más) |
| Solitario · escalera parcial | **Regresión**: atasco/pistas detectan mover parte de una escalera cuando expone una carta que sube a la fundación |
| Solitario · victoria única | **Regresión**: deshacer y rehacer tras ganar no duplica las estadísticas |
| Carta Blanca · victoria | El modal de victoria aparece |
| Carta Blanca · autocompletar | `autoWinnable` detecta la partida resuelta sin mutar el estado real |
| Buscaminas · reloj restaurado | **Regresión**: al restaurar una partida el reloj espera la próxima jugada |

**Persistencia**

| Test | Qué valida |
|------|-----------|
| Solitario / Carta Blanca / Buscaminas · recarga | La partida guardada se restaura idéntica al recargar |
| Corazones · pase | Las cartas elegidas para pasar sobreviven la recarga |
| Solitario · guardado corrupto | JSON basura o mazo con carta repetida se descartan sin errores |
| Carta Blanca · duplicados | `validState` rechaza mazos con cartas repetidas |

**Reglas de juego**

| Test | Qué valida |
|------|-----------|
| Carta Blanca · partida n.º 1 | El reparto numerado coincide con el FreeCell de Microsoft (determinismo del LCG) |
| Carta Blanca · supermove | Límite (pozos libres + 1) × 2^columnas vacías; el destino vacío no se cuenta |
| Corazones · jugadas legales | 2♣ obligado, seguir palo, corazones cerrados, primera baza sin puntos |
| Corazones · luna | Puntaje en ambos modos (+26 a los demás / −26 al tirador) |
| Buscaminas · primer toque | Nunca es mina (zona 3×3 protegida) |
| Buscaminas · acorde y derrota | El acorde abre las vecinas correctas; perder revela minas y banderas erróneas |
| Solitario · mazo | Reparto de a 3, reciclado boca abajo, destape al mover y deshacer |

**UI / varios**

| Test | Qué valida |
|------|-----------|
| Estadísticas | Muestra los datos guardados de los 4 juegos; Reiniciar los borra |
| Preferencias | Reparto, dificultad y nivel de IA sobreviven la recarga |
| Solitario · drag & drop | Arrastre real con eventos de mouse/pointer del descarte a una columna |

**PWA**

| Test | Qué valida |
|------|-----------|
| PWA · manifest e íconos | El manifest está enlazado, es válido y todos sus íconos existen (incluye `maskable` y `apple-touch-icon`) |
| PWA · todas las páginas | Las 6 páginas enlazan manifest + apple-touch-icon + theme-color |
| PWA · offline | El service worker se registra y sirve la app sin conexión (recarga con la red cortada) |
| PWA · offline por página (MPA) | Sin conexión se sirve la página pedida, no `index.html`; `shared/*.js` también se sirven desde caché |
| PWA · CSS/JS network-first | **Regresión**: en línea, una copia vieja del CSS en la caché del SW no pisa la de la red (evita HTML nuevo + CSS viejo → íconos rotos) |
| Buscaminas · aviso "sin adivinanzas" | Avisa cuando el tablero pudo requerir adivinar (se agotó el presupuesto de generación) |
| Guardado · aviso de fallo | Avisa una sola vez si falla la escritura del progreso (quota / modo restringido) |
| Accesibilidad · `aria-label` | Las cartas exponen `aria-label` legible; las boca abajo no revelan su identidad |

**Arquitectura (registro de juegos y contrato)**

| Test | Qué valida |
|------|-----------|
| `shared/ui.js` · toast | Los 4 juegos comparten el mismo `toast()` |
| Registro · datos | `games/registry.js` declara los 4 juegos con todos los campos requeridos |
| Registro · launcher | El menú de inicio se genera iterando el registro (mismos hrefs/títulos) |
| Registro · estadísticas | Las tarjetas de estadísticas se generan iterando el registro |
| Contrato · registro vs. manifest | Los `shortcuts` del manifest y el registro no divergen |
| Precache | Todo archivo servido (HTML, CSS, JS, íconos) está en la lista `ASSETS` de `sw.js`; un archivo nuevo fuera de la lista rompe el test (ver docs/PLAN.md, Fase 0) |

**Seguridad y tipos**

| Test | Qué valida |
|------|-----------|
| Seguridad · XSS | Un nombre de rival con HTML (`<img onerror=...>`) se muestra como texto, nunca se inyecta, en las 4 superficies de Corazones |
| CSP | Las 6 páginas declaran una `Content-Security-Policy` estricta, sin `unsafe-inline` en ningún directive (el motor de cada juego vive en `games/<juego>.js` desde la Fase 1 de docs/PLAN.md) |
| Tipos | Los módulos compartidos (`shared/*.js`, `games/registry.js`) mantienen `// @ts-check` (`tsc -p .` los valida en CI); el motor de cada juego en `games/<juego>.js` queda deliberadamente fuera (ver docs/PLAN.md, Fase 1) |
| Íconos · degradación | **Regresión**: cada `<svg class="icon">` lleva atributos de presentación (`fill="none"`, `width/height`, `stroke`) para degradar a un trazo chico —no a un bloque negro— si el CSS de `.icon` no llega |

**Accesibilidad (navegación por teclado)**

| Test | Qué valida |
|------|-----------|
| Solitario / Carta Blanca · teclado | Enter/Espacio selecciona y mueve una carta, igual que un click (sin simular mouse) |
| Corazones · teclado | Enter juega una carta de la mano, igual que un click |
| Buscaminas · roving tabindex | Una sola celda es alcanzable por Tab a la vez; las flechas mueven el foco; Enter cava |
| Buscaminas · `generating` | `onTap` ignora la entrada (por teclado o mouse) mientras el tablero "sin adivinanzas" se genera en segundo plano |

## Screenshots (verificación visual manual)

`screenshot.js` no es parte de la suite (no hace assertions): captura las 6
páginas en los 4 breakpoints del plan (vertical, apaisado corto, tablet,
desktop ancho) para comparar regresiones visuales a mano entre fases.

```bash
cd tests
node screenshot.js [carpeta-salida]   # por defecto docs/screenshots/baseline
```

`docs/screenshots/baseline/` guarda la referencia de la Fase 0 (ver
docs/PLAN.md); las fases siguientes comparan contra esas capturas.

## Notas

- Cada test corre en un contexto aislado (almacenamiento limpio).
- Para acelerar, algunos tests reducen los tiempos de animación de la IA y el
  objetivo de puntaje mediante variables globales del juego (`AI_DELAY`,
  `TRICK_HOLD`, `target`).
