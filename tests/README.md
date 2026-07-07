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
| PWA · offline | El service worker se registra y sirve la app sin conexión (recarga con la red cortada) |

## Notas

- Cada test corre en un contexto aislado (almacenamiento limpio).
- Para acelerar, algunos tests reducen los tiempos de animación de la IA y el
  objetivo de puntaje mediante variables globales del juego (`AI_DELAY`,
  `TRICK_HOLD`, `target`).
