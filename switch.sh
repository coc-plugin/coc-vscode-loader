#!/usr/bin/env bash
# Switch coc-vscode-loader between local dev and npm release
set -euo pipefail

EXT_DIR="$HOME/.config/coc/extensions/node_modules"
PKG_DIR="$(dirname "$EXT_DIR")"
PLUGIN_NAME="coc-vscode-loader"
LOCAL_PATH=$(cd "$(dirname "$0")/plugin" && pwd)
CACHE_ROOT="$HOME/.config/coc/converter-cache"

usage() {
  echo "Usage: $0 {local|npm|status}"
  echo ""
  echo "  local    Switch to local development version ($LOCAL_PATH)"
  echo "  npm      Switch to npm published version"
  echo "  status   Show current version and source"
  echo ""
  echo "  local mode auto-detects coc-vscode-registry/ sibling and uses local registry."
  echo "  No env vars needed."
  exit 1
}

cleanup_plugins() {
  echo "=== Cleaning up all coc-vscode-loader installed plugins ==="
  node -e "
    const fs = require('fs');
    const path = require('path');
    const pkgPath = '$PKG_DIR/package.json';
    if (!fs.existsSync(pkgPath)) { console.log('No package.json found, skipping'); process.exit(0); }

    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    const deps = pkg.dependencies || {};
    const locked = pkg.locked || [];

    // Collect all coc-* plugins except coc-vscode-loader itself
    const toRemove = new Set();
    for (const [name, val] of Object.entries(deps)) {
      if (name.startsWith('coc-') && name !== '$PLUGIN_NAME' && typeof val === 'string' && val.startsWith('file:')) {
        toRemove.add(name);
      }
    }
    for (const name of locked) {
      if (name.startsWith('coc-') && name !== '$PLUGIN_NAME') {
        toRemove.add(name);
      }
    }

    const names = [...toRemove];
    if (names.length === 0) {
      console.log('No installed plugins to clean');
    } else {
      console.log('Removing plugins: ' + names.join(', '));
    }

    // Remove from package.json dependencies
    for (const name of names) {
      delete deps[name];
    }
    pkg.dependencies = deps;

    // Remove from locked array
    pkg.locked = locked.filter(n => !names.includes(n));

    // Remove lastUpdate
    delete pkg.lastUpdate;

    // Write back
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

    // Remove plugin directories from node_modules/
    const nmDir = '$EXT_DIR';
    for (const name of names) {
      const dir = path.join(nmDir, name);
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
        console.log('  Removed: ' + dir);
      }
    }
  "

  # Remove entire converter-cache
  if [ -d "$CACHE_ROOT" ]; then
    rm -rf "$CACHE_ROOT"
    echo "  Removed cache: $CACHE_ROOT"
  fi
}

case "${1:-}" in
  local)
    cleanup_plugins
    echo "Switching to local dev version..."
    rm -rf "$EXT_DIR/$PLUGIN_NAME"
    ln -s "$LOCAL_PATH" "$EXT_DIR/$PLUGIN_NAME"

    # Ensure plugin is listed in package.json dependencies so coc discovers it
    node -e "
      const fs = require('fs');
      const pkgPath = '$PKG_DIR/package.json';
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      const deps = pkg.dependencies || (pkg.dependencies = {});
      if (!deps['$PLUGIN_NAME']) {
        deps['$PLUGIN_NAME'] = '*';
        fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
        console.log('Added $PLUGIN_NAME to package.json');
      }
    "

    # Ensure lib/index.js is up to date
    if [ -f "$LOCAL_PATH/package.json" ]; then
      echo "  Building plugin..."
      (cd "$LOCAL_PATH" && npm run build 2>&1 | tail -3)
    fi

    echo "✅ Now using local version: $LOCAL_PATH"
    ;;

  npm)
    cleanup_plugins
    echo "Switching to npm published version..."
    rm -rf "$EXT_DIR/$PLUGIN_NAME"

    # Remove all file: deps + retired node_modules (npm 11 moves them aside then chokes)
    node -e "
      const fs = require('fs');
      const path = require('path');
      const pkgPath = '$PKG_DIR/package.json';
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      const deps = pkg.dependencies || {};
      const fileDeps = Object.entries(deps).filter(([,v]) => v.startsWith('file:'));
      fs.writeFileSync(pkgPath + '.bak', JSON.stringify({
        fileDeps: Object.fromEntries(fileDeps),
        rest: Object.fromEntries(Object.entries(deps).filter(([,v]) => !v.startsWith('file:'))),
      }));
      delete pkg.dependencies['$PLUGIN_NAME'];
      for (const [k] of fileDeps) delete deps[k];
      fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
      // Clean retired dirs left by npm 11
      const nm = '$EXT_DIR';
      if (fs.existsSync(nm)) {
        for (const d of fs.readdirSync(nm)) {
          if (d.startsWith('.')) {
            fs.rmSync(nm + '/' + d, { recursive: true, force: true });
          }
        }
      }
    "
    cd "$PKG_DIR" && npm install "$PLUGIN_NAME" --legacy-peer-deps 2>&1 | tail -3

    # Restore package.json
    node -e "
      const fs = require('fs');
      const pkgPath = '$PKG_DIR/package.json';
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      const bak = JSON.parse(fs.readFileSync(pkgPath + '.bak', 'utf-8'));
      pkg.dependencies = bak.rest;
      pkg.dependencies['$PLUGIN_NAME'] = 'latest';
      Object.assign(pkg.dependencies, bak.fileDeps);
      fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
      fs.unlinkSync(pkgPath + '.bak');
    "
    echo "✅ Now using npm version: $(npm view $PLUGIN_NAME version 2>/dev/null || echo 'latest')"
    ;;

  status)
    if [ -L "$EXT_DIR/$PLUGIN_NAME" ]; then
      target=$(node -p "require('fs').realpathSync('$EXT_DIR/$PLUGIN_NAME')" 2>/dev/null || echo "$EXT_DIR/$PLUGIN_NAME")
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
