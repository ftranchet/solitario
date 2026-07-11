# PRD — Juegos clásicos

**Documento de Requisitos de Producto (Product Requirements Document)**

| Campo | Valor |
|---|---|
| Producto | **Juegos clásicos** (marca de cartas: _Carta Blanca_) |
| Versión del documento | 1.8 |
| Estado | Vigente |
| Última actualización | 2026-07-11 |
| Responsable | Francisco Tranchet |
| Repositorio | `ftranchet/solitario` |

> Este PRD es un documento vivo. El seguimiento de cambios se lleva en dos
> lugares complementarios: el **Historial de revisiones** (más abajo, cambios del
> _documento_) y el [CHANGELOG](./CHANGELOG.md) (cambios del _producto_). Cada
> requisito tiene un ID estable (`RF-*`, `RNF-*`) y un estado en la
> [Matriz de seguimiento](#9-matriz-de-seguimiento-de-requisitos).

---

## Historial de revisiones

| Versión | Fecha | Autor | Cambios |
|---|---|---|---|
| 1.8 | 2026-07-11 | F. Tranchet + IA | PLAN-2.md, Fase 4: RF-COR-03 documenta la mano de desempate en Corazones ante un empate en el liderazgo (decisión D2). |
| 1.7 | 2026-07-11 | F. Tranchet + IA | PLAN-2.md, Fase 3 (coherencia de documentación): RNF-02 documenta el trade-off deliberado de `user-scalable=no` contra WCAG 1.4.4/RNF-08; RNF-07 documenta la brecha real (CI no corre Firefox) y enlaza la decisión D3. |
| 1.6 | 2026-07-11 | F. Tranchet + IA | El roadmap (§8) apunta al nuevo [PLAN-2.md](./PLAN-2.md) (robustez, seguridad y consistencia, salido de la auditoría integral del 2026-07-11); PLAN.md queda enlazado como plan completado. |
| 1.5 | 2026-07-09 | F. Tranchet + IA | Auditoría de merge: la matriz (§9) marca implementados "Temas claro/oscuro" y "Aviso de actualización del SW" (Fases 4 y 5 de PLAN.md); §1 y RNF-01 dejan de describir cada juego como "un único archivo HTML autocontenido" (desde la capa compartida es una página delgada + módulos compartidos); RF-PWA-05 refleja la estrategia de caché vigente (network-first para HTML/CSS/JS). |
| 1.4 | 2026-07-08 | F. Tranchet + IA | El roadmap (§8) pasa a apuntar al nuevo [PLAN.md](./PLAN.md) (plan de trabajo por fases desde Fase 0); §8 conserva sólo el backlog de ideas sin planificar. Se agrega PLAN.md a las referencias (§10). |
| 1.3 | 2026-07-08 | F. Tranchet + IA | Se completa RNF-08 (accesibilidad): navegación por teclado y foco visible en los 4 juegos. Se retira "temas claro/oscuro" del roadmap de alta prioridad (pasa a decisión de diseño pendiente). |
| 1.2 | 2026-07-07 | F. Tranchet + IA | Refinamientos de PWA (safe-area iOS, caché por prefijo, offline por página) y mejoras del feedback: accesibilidad (RNF-08), aviso de fallback en Buscaminas (RF-BM-06) y aviso de guardado (RNF-04). |
| 1.1 | 2026-07-07 | F. Tranchet + IA | Se agregan los requisitos de PWA (RF-PWA-*, RNF-05) y offline; se documenta el estado actual del producto. |
| 1.0 | 2026-07-07 | F. Tranchet + IA | Primera versión del PRD: visión, alcance, requisitos funcionales de los cuatro juegos, no funcionales y matriz de seguimiento. |

---

## 1. Resumen ejecutivo

**Juegos clásicos** es una suite de juegos de mesa/cartas al estilo de los que
traía Windows, pensada para jugarse en el navegador de un celular o de una
computadora, sin instalar nada y sin conexión a Internet.

Cada juego es una **página HTML delgada** que carga una capa compartida propia
del proyecto (`shared/`, `styles/`, `games/registry.js`) y su propio motor en
`games/<juego>.js` — todo JavaScript y CSS vanilla, **sin dependencias externas
ni build** (ver [ARQUITECTURA.md](./ARQUITECTURA.md)). Una pantalla de inicio
(`index.html`) funciona como _launcher_ y una pantalla de **Estadísticas**
agrega los resultados de todos los juegos; ambas se generan desde el registro
declarativo de juegos. La persistencia (partida en curso, preferencias y
estadísticas) usa `localStorage`, por lo que todo vive en el dispositivo del
usuario.

Desde la versión 1.1 el producto es una **PWA**: instalable en la pantalla de
inicio y jugable completamente offline.

## 2. Objetivos y métricas de éxito

### Objetivos

- **O1.** Ofrecer juegos clásicos fieles, rápidos y agradables en móvil y escritorio.
- **O2.** Cero fricción: sin registro, sin instalación obligatoria, sin backend.
- **O3.** Jugar sin conexión y poder «instalar» la app como si fuera nativa.
- **O4.** Base de código simple y sin dependencias, fácil de mantener y testear.

### Métricas de éxito

| Métrica | Objetivo |
|---|---|
| La app carga y es jugable sin conexión tras la primera visita | Sí (RNF-05) |
| Instalable (criterios de PWA de Chrome/Edge) | Sí |
| Suite de tests en verde en cada push/PR | 100 % |
| Errores de consola en carga de cualquier pantalla | 0 |
| Tiempo hasta interactivo en móvil de gama media | < 2 s |

## 3. Público objetivo

- **Jugador casual** que quiere una partida rápida en el celular (colectivo,
  sala de espera) sin descargar una app de una tienda ni ver publicidad.
- **Nostálgico** de los juegos clásicos de escritorio.
- **Usuario sin conexión estable** (datos limitados, subte, avión): necesita que
  funcione offline.

## 4. Alcance

### Dentro de alcance

- Cuatro juegos: Solitario, Carta Blanca, Corazones y Buscaminas.
- Launcher, estadísticas y persistencia local.
- Instalación como PWA y juego offline.
- Español (es) como único idioma.

### Fuera de alcance (por ahora)

- Multijugador en red / cuentas de usuario / backend.
- Sincronización entre dispositivos.
- Sonido y música.
- Publicación en tiendas de aplicaciones (App Store / Play Store).
- Internacionalización a otros idiomas.

## 5. Requisitos funcionales

### 5.1 Launcher y navegación

- **RF-NAV-01.** La pantalla de inicio muestra los cuatro juegos y un acceso a
  Estadísticas.
- **RF-NAV-02.** Desde cualquier juego se puede volver al inicio y saltar a otro
  juego (botón 🎮).

### 5.2 Solitario (Klondike)

- **RF-SOL-01.** Reparto Klondike con robo de a 1 o de a 3 (preferencia
  persistente); reciclado del mazo.
- **RF-SOL-02.** Movimientos válidos entre columnas, a fundaciones y desde el
  descarte, con arrastrar-y-soltar y un solo toque/clic (manda la carta a su
  lugar de un tirón si hay un destino legal).
- **RF-SOL-03.** Deshacer, pistas, detección de atasco y autocompletado.
- **RF-SOL-04.** Detección de victoria (una sola vez) y registro de estadísticas.
- **RF-SOL-05.** La partida en curso se guarda y se restaura al recargar.

### 5.3 Carta Blanca (FreeCell)

- **RF-CB-01.** Tablero FreeCell con 8 columnas, 4 celdas libres y 4 fundaciones.
- **RF-CB-02.** Reparto numerado determinista compatible con el FreeCell de
  Microsoft (partida n.º 1 = reparto de referencia).
- **RF-CB-03.** «Supermove» limitado por `(celdas libres + 1) × 2^(columnas vacías)`.
- **RF-CB-04.** Autocompletado sin mutar el estado, victoria y persistencia.

### 5.4 Corazones (Hearts)

- **RF-COR-01.** Cuatro jugadores (1 humano + 3 IA con niveles), pase de cartas y
  reglas estándar (salida con 2♣, seguir palo, corazones cerrados, 1.ª baza sin puntos).
- **RF-COR-02.** «Disparar a la luna» con modo configurable (+26 a los demás o
  −26 al tirador).
- **RF-COR-03.** Modal de fin de mano con puntajes e historial; fin de partida al
  alcanzar el objetivo, salvo empate en el menor puntaje (2+ jugadores), en
  cuyo caso se juega una mano de desempate en vez de declarar ganador por
  orden de asiento (PLAN-2.md, decisión D2).
- **RF-COR-04.** Coordinación entre pestañas: un único «dueño» del guardado.
- **RF-COR-05.** Persistencia de la mano en curso, incluidas las cartas elegidas
  para pasar.

### 5.5 Buscaminas

- **RF-BM-01.** Tres dificultades (principiante, intermedio, experto).
- **RF-BM-02.** El primer toque nunca es mina (zona 3×3 protegida).
- **RF-BM-03.** Modo «sin adivinanzas» opcional (tableros resolubles por lógica).
- **RF-BM-04.** Banderas, acorde (chord) y estados de victoria/derrota.
- **RF-BM-05.** El tablero (minas incluidas) se restaura idéntico al recargar; el
  reloj espera la próxima jugada tras restaurar.
- **RF-BM-06.** Si «sin adivinanzas» no logra un tablero garantizado dentro del
  presupuesto de generación, se avisa al usuario (la partida podría requerir
  adivinar) en vez de caer a un tablero normal en silencio.

### 5.6 Estadísticas

- **RF-EST-01.** Agrega partidas jugadas, ganadas, mejores tiempos/puntajes y, en
  Buscaminas, resultados por dificultad.
- **RF-EST-02.** Botón para reiniciar (borrar) todas las estadísticas.

### 5.7 PWA

- **RF-PWA-01.** Web App Manifest con nombre, colores de marca, íconos (incluido
  `maskable`) y `display: standalone`, servido y enlazado en todas las páginas.
- **RF-PWA-02.** La app es **instalable** en Android/desktop y agregable a la
  pantalla de inicio en iOS (`apple-touch-icon` + metas).
- **RF-PWA-03.** Un service worker precachea el _app shell_ y sirve la app **sin
  conexión** después de la primera visita.
- **RF-PWA-04.** Accesos directos (shortcuts) del manifest a cada uno de los
  cuatro juegos.
- **RF-PWA-05.** Estrategia de actualización: el código del _app shell_ (HTML,
  CSS y JS) usa _network-first_ (en línea siempre llegan las tres piezas de la
  misma versión; sin conexión se sirve la copia cacheada) y los binarios
  estáticos (íconos, favicon, manifest) _stale-while-revalidate_; una nueva
  versión del service worker limpia las cachés viejas, y cuando hay una
  versión nueva esperando se avisa con un botón «Recargar» en vez de
  reemplazar el código sin preguntar.

## 6. Requisitos no funcionales

- **RNF-01 · Sin dependencias / sin build.** Todo es HTML/CSS/JS vanilla, sin
  frameworks, bundlers ni CDNs; el sitio es 100 % estático (apto para GitHub
  Pages). El código común vive en una capa compartida propia (`shared/`,
  `styles/`, `games/registry.js`) que las páginas enlazan directo.
- **RNF-02 · Responsive y táctil.** Funciona en móvil y escritorio; respeta las
  _safe areas_ (notch) y evita el zoom accidental. El layout se adapta a la
  orientación real: en apaisado corto los juegos de cartas mueven pozos/mazo y
  pilas finales a columnas laterales (y los controles a rieles), y el reparto
  inicial siempre entra sin scroll.
  **Trade-off deliberado con RNF-08:** los 4 juegos declaran
  `user-scalable=no` en el viewport (evita el zoom accidental al tocar dos
  veces sobre una carta, un problema táctil real). Esto entra en tensión con
  WCAG 1.4.4 (Resize Text), que pide permitir el zoom del usuario; además
  iOS ya lo ignora en la práctica (Safari permite pellizcar para agrandar
  igual). Se aceptó el trade-off a favor de la experiencia táctil del juego;
  queda documentado acá para que sea una decisión explícita, no un
  descuido de accesibilidad.
- **RNF-03 · Privacidad.** No hay backend ni analítica; todos los datos quedan en
  `localStorage` del dispositivo.
- **RNF-04 · Robustez.** Un guardado corrupto (JSON inválido o baraja con cartas
  repetidas) se descarta sin romper la partida en curso. Si la escritura del
  progreso falla (almacenamiento lleno o modo restringido), se avisa una vez en
  vez de fallar en silencio.
- **RNF-05 · Offline-first.** Tras la primera carga, todas las pantallas
  funcionan sin conexión.
- **RNF-06 · Calidad.** Suite de tests de navegador (Playwright) que corre los
  HTML reales; CI en cada push/PR. Cero errores de consola al cargar.
- **RNF-07 · Compatibilidad.** Navegadores modernos (Chromium, Firefox, Safari)
  en sus versiones actuales. CI corre la suite completa en Chromium y un
  humo en WebKit y en Firefox (`docs/PLAN-2.md`, decisión D3 y Fase 6).
- **RNF-08 · Accesibilidad (a11y).** Las cartas exponen `aria-label` legible
  para lectores de pantalla (sin revelar las cartas boca abajo) y los
  avisos/estado se anuncian (`role="status"` / `aria-live`). Navegación por
  teclado completa: cartas y celdas alcanzables por Tab (roving tabindex en
  Buscaminas) y operables con Enter/Espacio, igual que un click; foco visible
  (`:focus-visible`) en botones, cartas y celdas.

## 7. Arquitectura y decisiones técnicas

- **Estático, sin build.** Sin framework ni bundler: máxima portabilidad y
  mantenibilidad, se sirve desde cualquier hosting estático. Páginas delgadas
  + capa compartida (`shared/`, `styles/`) + motor por juego (`games/`).
- **Persistencia en `localStorage`** con validación defensiva del estado al
  cargar (RNF-04).
- **PWA con rutas relativas.** El manifest (`start_url`/`scope` relativos) y el
  service worker resuelven todo con `new URL(path, self.location)`, de modo que
  la app funciona igual en la raíz de un dominio o en un subdirectorio
  (p. ej. `usuario.github.io/solitario/`).
- **Íconos** generados a partir del SVG de marca en cinco variantes (`any` 192/512,
  `maskable` 192/512, `apple-touch-icon` 180).
- **Versión del service worker** (`VERSION` en `sw.js`): subirla publica una
  versión nueva y purga las cachés anteriores.

## 8. Roadmap / próximos pasos

El plan de trabajo por fases vive en documentos propios:

➡️ **[docs/PLAN-2.md](./PLAN-2.md)** — robustez, seguridad y consistencia
(vigente, salido de la auditoría integral del 2026-07-11).

➡️ **[docs/PLAN.md](./PLAN.md)** — externalizar motores, layouts por
orientación, modo oscuro, aviso de actualización (completado).

**Backlog de ideas todavía sin planificar** (fuera de las fases actuales):

| Prioridad | Idea |
|---|---|
| Baja | Captura de pantalla y `screenshots` en el manifest para una ficha de instalación más rica. |
| Baja | Sonido opcional y vibración táctil. |
| Baja | Exportar/importar estadísticas (respaldo manual). |
| Baja | Más solitarios (Spider, Golf) reutilizando el motor de cartas. |

## 9. Matriz de seguimiento de requisitos

Estado: ✅ Implementado · 🟡 Parcial · ⬜ Pendiente.

| ID | Requisito | Estado | Desde |
|---|---|:---:|---|
| RF-NAV-01/02 | Launcher y navegación | ✅ | 0.3.0 |
| RF-SOL-01..05 | Solitario completo | ✅ | 1.0.0 |
| RF-CB-01..04 | Carta Blanca completo | ✅ | 1.0.0 |
| RF-COR-01..05 | Corazones completo | ✅ | 1.0.0 |
| RF-BM-01..05 | Buscaminas completo | ✅ | 1.0.0 |
| RF-BM-06 | Aviso de fallback en «sin adivinanzas» | ✅ | 1.2.0 |
| RF-EST-01/02 | Estadísticas | ✅ | 0.5.0 |
| RF-PWA-01 | Manifest enlazado y válido | ✅ | 1.1.0 |
| RF-PWA-02 | Instalable (Android/desktop/iOS) | ✅ | 1.1.0 |
| RF-PWA-03 | Service worker offline | ✅ | 1.1.0 |
| RF-PWA-04 | Shortcuts a los juegos | ✅ | 1.1.0 |
| RF-PWA-05 | Estrategia de actualización | ✅ | 1.1.0 |
| RNF-01..04 | Sin build, responsive, privacidad, robustez | ✅ | — |
| RNF-05 | Offline-first | ✅ | 1.1.0 |
| RNF-06 | Tests + CI | ✅ | 0.9.0 |
| RNF-07 | Compatibilidad navegadores modernos | ✅ | — |
| RNF-08 | Accesibilidad (etiquetas, anuncios, teclado, foco visible) | ✅ | Fase 6 |
| — | Temas claro/oscuro | ✅ | 1.4.0 (Fase 4 de PLAN.md) |
| — | Aviso de actualización del SW | ✅ | 1.4.0 (Fase 5 de PLAN.md) |

## 10. Referencias

- [PLAN-2.md](./PLAN-2.md) — plan vigente: robustez, seguridad y consistencia.
- [PLAN.md](./PLAN.md) — plan de trabajo por fases anterior (completado).
- [CHANGELOG.md](./CHANGELOG.md) — historial de cambios del producto.
- [ARQUITECTURA.md](./ARQUITECTURA.md) — registro de la arquitectura ya
  construida (capa compartida) que permite escalar a más juegos sin romper nada.
- [README del proyecto](../README.md) — cómo correrlo y jugar.
- [tests/README.md](../tests/README.md) — qué cubre la suite de tests.
