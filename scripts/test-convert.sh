#!/usr/bin/env bash
# Test conversion + build pipeline for a VS Code extension
# Usage: bash scripts/test-convert.sh <name> <repo> [subdir]
set -euo pipefail

NAME="${1:?usage: $0 <name> <repo> [subdir]}"
REPO="${2:?usage: $0 <name> <repo> [subdir]}"
SUBDIR="${3:-}"
CACHE_ROOT="$HOME/.config/coc/converter-cache"
BUILD="$CACHE_ROOT/$NAME/build"
SOURCE="$CACHE_ROOT/$NAME/source"
CONVERTER="$(cd "$(dirname "$0")/../converter" && pwd)"

echo "=== Testing $NAME ($REPO) ==="

# Clean
rm -rf "$BUILD"
mkdir -p "$CACHE_ROOT/$NAME"

# Clone
if [ ! -d "$SOURCE" ]; then
  echo "[1/5] Cloning $REPO..."
  git clone --depth=1 "https://github.com/$REPO.git" "$SOURCE"
else
  echo "[1/5] Updating $REPO..."
  git -C "$SOURCE" pull
fi

INPUT="$SOURCE${SUBDIR:+/$SUBDIR}"

# Convert
echo "[2/5] Converting..."
npx tsx "$CONVERTER/src/cli.ts" convert "$INPUT" -o "$BUILD"

# npm install
echo "[3/5] npm install..."
cd "$BUILD"
npm install --legacy-peer-deps 2>&1 | tail -3

# esbuild
echo "[4/5] Building..."
node esbuild.mjs 2>&1

# Post-build patches (simulating what the plugin pipeline does)
if [ -f "$BUILD/lib/index.js" ]; then
  echo "[4b/5] Applying patches..."

  # Count patches applied
  PATCHES=0

  # Patch 1: Check if serverBinary info is available and apply
  if [ -n "${SERVER_REPO:-}" ]; then
    BIN_PATH="${SERVER_BIN:-deno}"
    ARGS="${SERVER_ARGS:-}"

    # Inject _serverPath resolution
    python3 -c "
with open('$BUILD/lib/index.js') as f:
    c = f.read()
old = 'if (!serverModule || !fs.existsSync(serverModule)) {\n    }'
new = 'if (!serverModule || !fs.existsSync(serverModule)) {\n    try {\n      const _sp = require(\"path\").join(__dirname, \"..\", \"server\", \"$BIN_PATH\");\n      if (require(\"fs\").existsSync(_sp)) serverModule = _sp;\n    } catch {}\n  }'
c = c.replace(old, new)
with open('$BUILD/lib/index.js', 'w') as f:
    f.write(c)
" && PATCHES=$((PATCHES+1))

    # Replace module with command
    if [ -n "$ARGS" ]; then
      python3 -c "
import re
with open('$BUILD/lib/index.js') as f:
    c = f.read()
c = re.sub(r'\{ module:\s*serverModule,\s*transport:\s*\w+\.TransportKind\.ipc\s*\}', '{ command: serverModule, args: $ARGS }', c)
with open('$BUILD/lib/index.js', 'w') as f:
    f.write(c)
" && PATCHES=$((PATCHES+1))
    fi

    # Fix documentSelector
    LANG_SEL=$(echo "$LANGUAGES" | python3 -c "
import sys, json
langs = [x.strip() for x in sys.stdin.read().split(',') if x.strip()]
sel = ', '.join(f'{{ scheme: \"file\", language: \"{l}\" }}' for l in langs)
print(sel)
")
    if [ -n "$LANG_SEL" ]; then
      python3 -c "
import re
with open('$BUILD/lib/index.js') as f:
    c = f.read()
c = re.sub(r'documentSelector:\s*\[\s*\{[^}]*language:\s*['\"][^'\"]*['\"][^}]*\}\s*\]', 'documentSelector: [$LANG_SEL]', c)
with open('$BUILD/lib/index.js', 'w') as f:
    f.write(c)
" && PATCHES=$((PATCHES+1))
    fi

    echo "  ✅ $PATCHES patch(es) applied"
  fi
fi

# Check output
echo "[5/5] Result:"
if [ -f "$BUILD/lib/index.js" ]; then
  echo "  ✅ lib/index.js ($(wc -c < "$BUILD/lib/index.js") bytes)"
else
  echo "  ❌ lib/index.js not found"
  exit 1
fi

# Show generated entry
echo ""
echo "--- generated entry: src/index.ts ---"
if [ -f "$BUILD/src/index.ts" ]; then
  grep -v "^import\|^\/\/" "$BUILD/src/index.ts" | head -40
else
  echo "(no src/index.ts - using original extension.ts)"
  head -40 "$BUILD/src/extension.ts" 2>/dev/null || echo "(no source)"
fi
echo ""
echo "=== Done ==="
