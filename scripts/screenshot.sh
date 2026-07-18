#!/usr/bin/env bash
# Regenerate README screenshots from the example config via freeze.
#
# Requires:
#   - charmbracelet/freeze on PATH (go install github.com/charmbracelet/freeze@latest)
#   - the project built (pnpm build)
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT"

if ! command -v freeze >/dev/null 2>&1; then
  echo "screenshot.sh: freeze not on PATH" >&2
  echo "  install with: go install github.com/charmbracelet/freeze@latest" >&2
  exit 1
fi

if [[ ! -f dist/index.js ]]; then
  echo "screenshot.sh: dist/ missing, running pnpm build" >&2
  pnpm build
fi

mkdir -p assets

CONFIG="$ROOT/config.example.yaml"
NODE_BIN="${NODE:-node}"

shoot() {
  local path="$1" out="$2" title="$3"
  echo "  rendering $out (--demo \"$path\")"
  TERMINAL_WHICH_KEY_CONFIG="$CONFIG" "$NODE_BIN" "$ROOT/dist/index.js" \
    --demo "$path" \
    | freeze \
        --language ansi \
        --window \
        --background "#1d1f21" \
        --padding 20 \
        --border.radius 8 \
        --shadow.blur 16 \
        --shadow.x 0 \
        --shadow.y 6 \
        --font.family "JetBrains Mono" \
        --font.size 14 \
        --line-height 1.3 \
        --width 720 \
        --output "$out"
}

shoot ""  assets/demo-root.png "root menu"
shoot "o" assets/demo-open.png "open submenu"

echo "wrote:"
ls -1 assets/*.png
