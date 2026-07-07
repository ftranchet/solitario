# Juegos clásicos

Suite de juegos clásicos al estilo de los que traía Windows, hechos para jugar
en el navegador (celular o escritorio). Cada juego es un único archivo HTML
autocontenido, sin dependencias.

La pantalla de inicio (`index.html`) es un launcher con los cuatro juegos.

Es una **PWA**: se puede **instalar** en la pantalla de inicio y jugar **sin
conexión**. Tras la primera visita, un service worker (`sw.js`) precachea todo
el _app shell_ y sirve los juegos offline. Ver el [PRD](docs/PRD.md) para los
requisitos y el [CHANGELOG](docs/CHANGELOG.md) para el historial de cambios.

## Juegos

- **Solitario** (`solitario.html`)
- **Carta Blanca** (`carta-blanca.html`)
- **Corazones** (`corazones.html`)
- **Buscaminas** (`buscaminas.html`)

Desde cualquier juego se puede saltar a otro con el botón 🎮, y hay una pantalla
de **Estadísticas** (`estadisticas.html`).

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

- [`docs/PRD.md`](docs/PRD.md) — Documento de Requisitos de Producto, con la
  matriz de seguimiento de requisitos y el historial de revisiones.
- [`docs/CHANGELOG.md`](docs/CHANGELOG.md) — historial de cambios del producto
  (formato _Keep a Changelog_).
