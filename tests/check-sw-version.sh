#!/usr/bin/env bash
# Guardia de la caché offline: si en este cambio se tocó algún archivo SERVIDO
# (el app shell: HTML, CSS, JS, íconos, manifest), la constante VERSION de
# sw.js tiene que haber subido también. Con network-first los usuarios online
# reciben lo último igual, pero la copia OFFLINE sólo se re-precachea cuando
# cambia VERSION: olvidarse el bump deja a los usuarios sin conexión con la
# versión vieja. Era el último paso manual del proyecto; esto lo convierte en
# un fallo de CI.
#
# Uso:  bash tests/check-sw-version.sh [ref-base]
#   - En un Pull Request, CI compara contra la rama base (GITHUB_BASE_REF).
#   - En un push, contra el commit anterior (HEAD~1).
#   - Local: pasale la base a mano, p. ej. `bash tests/check-sw-version.sh main`.
set -euo pipefail
cd "$(dirname "$0")/.."

BASE="${1:-}"
if [ -z "$BASE" ]; then
  if [ -n "${GITHUB_BASE_REF:-}" ]; then
    git fetch --quiet origin "$GITHUB_BASE_REF" || true
    BASE="origin/$GITHUB_BASE_REF"
  else
    BASE="HEAD~1"
  fi
fi
if ! git rev-parse --verify --quiet "$BASE" >/dev/null; then
  echo "check-sw-version: sin base para comparar ($BASE); se omite el chequeo."
  exit 0
fi

# Archivos servidos (los que forman el app shell precacheado).
CHANGED=$(git diff --name-only "$BASE"...HEAD -- \
  '*.html' 'styles/' 'shared/' 'games/' 'icons/' 'favicon.svg' 'manifest.webmanifest' \
  | grep -v '^docs/' | grep -v '^tests/' || true)

if [ -z "$CHANGED" ]; then
  echo "check-sw-version: no cambió ningún archivo servido; OK."
  exit 0
fi

OLD_VERSION=$(git show "$BASE":sw.js 2>/dev/null | grep -m1 'const VERSION' || echo "")
NEW_VERSION=$(grep -m1 'const VERSION' sw.js)

if [ "$OLD_VERSION" == "$NEW_VERSION" ]; then
  echo "✗ Cambiaron archivos servidos pero VERSION de sw.js sigue igual:"
  echo "$CHANGED" | sed 's/^/    /'
  echo "  VERSION actual: $NEW_VERSION"
  echo "  Subí VERSION en sw.js para que los clientes instalados re-precacheen la copia offline."
  exit 1
fi

echo "check-sw-version: VERSION subió ($OLD_VERSION -> $NEW_VERSION); OK."
