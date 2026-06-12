#!/usr/bin/env bash
# Switch coc-vscode-loader between local dev and npm release
set -euo pipefail

EXT_DIR="$HOME/.config/coc/extensions/node_modules"
PLUGIN_NAME="coc-vscode-loader"
LOCAL_PATH=$(cd "$(dirname "$0")/../plugin" && pwd)

usage() {
  echo "Usage: $0 {local|npm|status}"
  echo ""
  echo "  local    Switch to local development version ($LOCAL_PATH)"
  echo "  npm      Switch to npm published version"
  echo "  status   Show current version and source"
  exit 1
}

case "${1:-}" in
  local)
    echo "Switching to local dev version..."
    rm -rf "$EXT_DIR/$PLUGIN_NAME"
    ln -s "$LOCAL_PATH" "$EXT_DIR/$PLUGIN_NAME"
    echo "✅ Now using local version: $LOCAL_PATH"
    ;;

  npm)
    echo "Switching to npm published version..."
    rm -rf "$EXT_DIR/$PLUGIN_NAME"

    # Fix extensions/package.json temporarily to avoid npm errors
    node -e "
      const fs = require('fs');
      const pkgPath = '$HOME/.config/coc/extensions/package.json';
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      delete pkg.dependencies['$PLUGIN_NAME'];
      fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
    "
    cd "$HOME/.config/coc/extensions" && npm install "$PLUGIN_NAME" --legacy-peer-deps 2>&1 | tail -3

    # Restore to npm version
    node -e "
      const fs = require('fs');
      const pkgPath = '$HOME/.config/coc/extensions/package.json';
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      pkg.dependencies['$PLUGIN_NAME'] = 'latest';
      fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
    "
    echo "✅ Now using npm version: $(npm view $PLUGIN_NAME version 2>/dev/null || echo 'latest')"
    ;;

  status)
    if [ -L "$EXT_DIR/$PLUGIN_NAME" ]; then
      target=$(readlink -f "$EXT_DIR/$PLUGIN_NAME")
      echo "📎 Local dev: $target"
      echo "🔧 Mode: LOCAL"
    elif [ -d "$EXT_DIR/$PLUGIN_NAME" ]; then
      version=$(node -p "require('$EXT_DIR/$PLUGIN_NAME/package.json').version" 2>/dev/null || echo "unknown")
      echo "📦 npm version: $version"
      echo "🔧 Mode: npm"
    else
      echo "❌ Plugin not found at $EXT_DIR/$PLUGIN_NAME"
      exit 1
    fi
    echo ""
    echo "Run ':CocRestart' for changes to take effect."
    ;;

  *)
    usage
    ;;
esac
