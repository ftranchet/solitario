# Juegos clásicos

Suite de juegos clásicos al estilo de los que traía Windows, hechos para jugar
en el navegador (celular o escritorio). Cada juego es un único archivo HTML
autocontenido, sin dependencias.

La pantalla de inicio (`index.html`) es un launcher con los cuatro juegos.

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
