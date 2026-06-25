# Tests

Tests de navegador (Playwright) que abren los HTML reales en Chromium y verifican
los flujos clave y las regresiones ya corregidas. No hace falta servidor: las
páginas se cargan con `file://`.

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

| Test | Qué valida |
|------|-----------|
| Carga sin errores (×6) | Las 6 pantallas cargan sin errores de consola/página |
| Corazones · fin de mano | **Regresión**: el modal de puntajes aparece al terminar la mano (bug `history` vs `window.history`) |
| Corazones · partida completa | Jugar de punta a punta por la UI llega al modal de victoria |
| Corazones · dos pestañas | Coordinación entre pestañas: un único "dueño" del guardado |
| Buscaminas · sin adivinanzas | La generación en Experto completa y revela (no congela; trabajo troceado) |
| Solitario · victoria | El modal de victoria aparece |
| Solitario · autocompletar | El autocompletado corta al no haber progreso (no cicla de más) |
| Carta Blanca · victoria | El modal de victoria aparece |

## Notas

- Cada test corre en un contexto aislado (almacenamiento limpio).
- Para acelerar, algunos tests reducen los tiempos de animación de la IA y el
  objetivo de puntaje mediante variables globales del juego (`AI_DELAY`,
  `TRICK_HOLD`, `target`).
