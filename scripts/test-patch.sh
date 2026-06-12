#!/usr/bin/env bash
# Quick test: patch an existing converted extension for binary server support
# Usage: bash scripts/test-patch.sh <name> <binary> [args]
set -euo pipefail

NAME="${1:?usage: $0 <name> <binary> [args]}"
BIN="${2:-deno}"
ARGS="${3:-}"
LANGUAGES="${4:-typescript, javascript}"

BUILD="$HOME/.config/coc/converter-cache/$NAME/build"

if [ ! -f "$BUILD/lib/index.js" ]; then
  echo "❌ Build not found at $BUILD"
  echo "   Run 'bash scripts/test-convert.sh' first"
  exit 1
fi

echo "=== Patching $NAME (binary: $BIN, args: $ARGS) ==="
cp "$BUILD/lib/index.js" "$BUILD/lib/index.js.bak"

python3 << PYEOF
import re, json

with open('$BUILD/lib/index.js') as f:
    c = f.read()

patches = 0

# 1. Inject _serverPath
old = 'if (!serverModule || !fs.existsSync(serverModule)) {\n    }'
new = '''if (!serverModule || !fs.existsSync(serverModule)) {
    try {
      const _sp = require("path").join(__dirname, "..", "server", "$BIN");
      if (require("fs").existsSync(_sp)) serverModule = _sp;
    } catch {}
  }'''
if old in c:
    c = c.replace(old, new)
    patches += 1
    print('✅ _serverPath injected')
else:
    print('❌ _serverPath: pattern not found')

# 2. module → command
ARGS_JSON = json.dumps([x.strip() for x in '$ARGS'.split(',') if x.strip()])
if ARGS_JSON != '[]':
    pat = r'\{ module:\s*serverModule,\s*transport:\s*\w+\.TransportKind\.ipc\s*\}'
    repl = '{ command: serverModule, args: ' + ARGS_JSON + ' }'
    c2, n = re.subn(pat, repl, c)
    if n > 0:
        c = c2
        patches += 1
        print(f'✅ command mode (args: {ARGS_JSON})')
    else:
        print('❌ command mode: pattern not found')
else:
    print('⏭️  args empty, skipping command patch')

# 3. Fix documentSelector
langs = [x.strip() for x in '$LANGUAGES'.split(',') if x.strip()]
if langs:
    sel = ', '.join(f'{{ scheme: "file", language: "{l}" }}' for l in langs)
    pat = r'documentSelector:\s*\[\s*\{[^}]*language:\s*[\'"][^\'"]*[\'"][^}]*\}\s*\]'
    repl = f'documentSelector: [{sel}]'
    c2, n = re.subn(pat, repl, c)
    if n > 0:
        c = c2
        patches += 1
        print(f'✅ documentSelector → {langs}')
    else:
        print('❌ documentSelector: pattern not found')

with open('$BUILD/lib/index.js', 'w') as f:
    f.write(c)

print(f'\nTotal: {patches} patch(es) applied')

# Summary
for check, pat in [
    ('_sp', '_sp'),
    ('command', 'command: serverModule'),
    ('args', f'args: {ARGS_JSON}'),
]:
    print(f'  {"✅" if pat in c else "❌"} {check}')
PYEOF

echo "---"
echo "Backup saved at lib/index.js.bak"
echo "Run: node -e 'require(\"$BUILD/lib/index.js\")' 2>&1 | head -5"