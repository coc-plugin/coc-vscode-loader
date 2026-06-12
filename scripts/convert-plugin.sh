#!/usr/bin/env bash
# Convert a VS Code extension from GitHub and install to coc
set -euo pipefail

NAME="${1:-}"
REPO="${2:-}"
SUBDIR="${3:-}"

usage() {
  echo "Usage: $0 <name> <github-repo> [subdir]"
  echo ""
  echo "Examples:"
  echo "  $0 eslint microsoft/vscode-eslint"
  echo "  $0 volar vuejs/language-tools extensions/vscode"
  exit 1
}

[ -z "$NAME" ] && usage
[ -z "$REPO" ] && usage

ROOT=$(cd "$(dirname "$0")/.." && pwd)
SRC_DIR="/tmp/coc-convert-src-$NAME"
OUT_DIR="/tmp/coc-convert-out-$NAME"
DEST_DIR="$HOME/.config/coc/extensions/node_modules/coc-$NAME"
EXT_PKG="$HOME/.config/coc/extensions/package.json"

echo "==> Cloning $REPO ..."
rm -rf "$SRC_DIR"
git clone --depth=1 "https://github.com/$REPO.git" "$SRC_DIR"

INPUT="$SRC_DIR"
if [ -n "$SUBDIR" ]; then
  INPUT="$SRC_DIR/$SUBDIR"
fi

echo "==> Converting ..."
rm -rf "$OUT_DIR"
npx tsx "$ROOT/converter/src/cli.ts" convert "$INPUT" -o "$OUT_DIR"

echo "==> Installing dependencies ..."
cd "$OUT_DIR"
npm install --legacy-peer-deps

echo "==> Building ..."
node esbuild.mjs

echo "==> Installing to coc ..."
rm -rf "$DEST_DIR"
mkdir -p "$(dirname "$DEST_DIR")"
cp -r "$OUT_DIR" "$DEST_DIR"

echo "==> Registering in extensions/package.json ..."
node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('$EXT_PKG', 'utf-8'));
pkg.dependencies['coc-$NAME'] = 'file:$DEST_DIR';
pkg.lastUpdate = Date.now();
fs.writeFileSync('$EXT_PKG', JSON.stringify(pkg, null, 2));
"

echo ""
echo "✅ coc-$NAME installed!"
echo "   Run ':CocRestart' to activate."
