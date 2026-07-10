# Juegos clásicos

Suite de juegos clásicos al estilo de los que traía Windows, hechos para jugar
en el navegador (celular o escritorio). Sin build ni dependencias externas:
cada juego es una página HTML delgada que enlaza una capa compartida propia
del proyecto (`shared/`, `styles/`, `games/registry.js`) y su propio motor en
`games/<juego>.js` — ver [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md) y
[`docs/PLAN.md`](docs/PLAN.md).

La pantalla de inicio (`index.html`) es un launcher con los cuatro juegos,
generado a partir de `games/registry.js`.

Es una **PWA**: se puede **instalar** en la pantalla de inicio y jugar **sin
conexión**. Tras la primera visita, un service worker (`sw.js`) precachea todo
el _app shell_ y sirve los juegos offline. Ver el [PRD](docs/PRD.md) para los
requisitos y el [CHANGELOG](docs/CHANGELOG.md) para el historial de cambios.

## Juegos

- **Solitario** (`solitario.html`)
- **Carta Blanca** (`carta-blanca.html`)
- **Corazones** (`corazones.html`)
- **Buscaminas** (`buscaminas.html`)

Desde cualquier juego se puede saltar a otro con el botón de menú (🎮), y hay
una pantalla de **Estadísticas** (`estadisticas.html`).

## Tests

Hay una suite de tests de navegador (Playwright) que corre los HTML reales y
verifica los flujos clave y las regresiones corregidas:

```bash
cd tests
npm install
npm test
```

Ver [`tests/README.md`](tests/README.md) para más detalle.

## Documentación

- [`docs/COMO-AGREGAR-UN-JUEGO.md`](docs/COMO-AGREGAR-UN-JUEGO.md) — checklist
  paso a paso para sumar un juego nuevo (cada paso tiene su test de contrato).
- [`docs/PLAN.md`](docs/PLAN.md) — plan de trabajo por fases (desde Fase 0):
  qué sigue y en qué orden.
- [`docs/PRD.md`](docs/PRD.md) — Documento de Requisitos de Producto, con la
  matriz de seguimiento de requisitos y el historial de revisiones.
- [`docs/CHANGELOG.md`](docs/CHANGELOG.md) — historial de cambios del producto
  (formato _Keep a Changelog_).
- [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md) — registro de la arquitectura
  ya construida (capa compartida, registro de juegos, tipos, CSP, accesibilidad)
  y su seguimiento por fases.
