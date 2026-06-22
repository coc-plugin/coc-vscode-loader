#!/usr/bin/env bash
# Test Vim TUI — validates coc-vscode-loader works with Vim (not Neovim)
# Usage:
#   bash scripts/test-vim-tui.sh          # Interactive: open Vim with TUI
#   bash scripts/test-vim-tui.sh headless # Headless: run environment checks
set -euo pipefail

PLUGIN_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PLUGIN_DIR"
TMP_OUT=/tmp/vim-tui-test.txt

ensure_local_dev() {
  echo "=== Ensuring local dev mode ==="
  bash switch.sh status 2>/dev/null | grep -q 'LOCAL' || bash switch.sh local
}

vim_headless() {
  vim -E -s -c "redir! > $TMP_OUT" "$@" -c 'redir END' -c 'qall!' >/dev/null 2>&1
  if [ -f "$TMP_OUT" ]; then
    cat "$TMP_OUT"
    rm -f "$TMP_OUT"
  fi
}

headless_check() {
  echo "=== Headless checks ==="

  # 1. Verify Vim version >= 9.0
  VIM_VER=$(vim --version | head -1 | grep -oP '\d+\.\d+' | head -1)
  echo "Vim version: $VIM_VER"

  # 2. Verify required Vim functions
  echo "--- Required functions ---"
  vim_headless -c 'echo "NVIM:".has("nvim")
    echo "PROP_ADD:".exists("*prop_add")
    echo "PROP_TYPE_ADD:".exists("*prop_type_add")
    echo "WIN_GETID:".exists("*win_getid")
    echo "SETBUFVAR:".exists("*setbufvar")
    echo "SETWINVAR:".exists("*setwinvar")
    echo "HLGET:".exists("*hlget")
    echo "INPUT:".exists("*input")'
  echo "---"

  # 3. Verify coc.nvim is on runtimepath
  echo "--- coc.nvim check ---"
  vim_headless -c 'echo "RT:".globpath(&rtp, "autoload/coc.nvim")'
  echo "---"

  # 4. Build check
  echo "--- Build check ---"
  if [ ! -f plugin/lib/index.js ]; then
    echo "Building plugin..."
    (cd plugin && npm run build)
  fi
  echo "Build: OK (lib/index.js: $(wc -c < plugin/lib/index.js) bytes)"

  # 5. TypeScript check
  (cd plugin && npx tsc --noEmit 2>&1 | grep -v "TS5107" | grep -v "Visit") && echo "TypeScript: OK"

  echo ""
  echo "=== All environment checks passed ==="
}

interactive_test() {
  echo "=== Starting Vim with TUI ==="
  echo ""
  echo "  Run these commands inside Vim:"
  echo ""
  echo "  :CocCommand loader.open     ← Open TUI (split window)"
  echo "  j/k                         ← Navigate"
  echo "  /                           ← Search (uses input() in Vim)"
  echo "  i / u / X                   ← Install/update/uninstall"
  echo "  q                           ← Close"
  echo "  :CocRestart                 ← Restart"
  echo ""
  echo "Press ENTER to start Vim (or Ctrl-C to skip)..."
  read -rn1

  vim -c "CocCommand loader.open" "$@"
}

case "${1:-}" in
  headless)
    ensure_local_dev
    headless_check
    ;;
  *)
    ensure_local_dev
    headless_check
    echo ""
    echo "=== Building plugin ==="
    (cd plugin && npm run build 2>&1 | tail -1)
    echo ""
    interactive_test "$@"
    ;;
esac
