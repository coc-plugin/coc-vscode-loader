#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONVERTER="$ROOT/converter"
WORKDIR="/tmp/test-converter-v2"
PASS=0
FAIL=0

green() { echo "  ✓ $1"; }
red() { echo "  ✗ $1"; FAIL=$((FAIL+1)); }

mkdir -p "$WORKDIR"

cleanup() { rm -rf "$WORKDIR"/*; }

# ============================================================
echo "=== Test 1: source-only (HTML CSS Support style) ==="
cleanup
mkdir -p "$WORKDIR/t1/src"
cat > "$WORKDIR/t1/package.json" <<JSON
{"name":"test-html","version":"0.1.0","description":"HTML test","dependencies":{"line-column":"^1.0.0"}}
JSON
cat > "$WORKDIR/t1/src/extension.ts" <<TS
import * as vscode from 'vscode'
import lineColumn from 'line-column'
export function activate(ctx: vscode.ExtensionContext) {
  lineColumn("test", 0)
  ctx.subscriptions.push(vscode.commands.registerCommand('test.hello', () => vscode.window.showInformationMessage('hi')))
}
TS
cat > "$WORKDIR/t1/src/provider.ts" <<TS
import lineColumn from 'line-column'
export function parse(s: string) { return lineColumn(s, 0) }
TS
cat > "$WORKDIR/t1/convert.json" <<JSON
[{"type":"source","transforms":["import-mapping","class-to-factory","provider-register"],"entry":"src/extension.ts","activationEvents":["onLanguage:html","onLanguage:css"]}]
JSON

cd "$CONVERTER"
npx tsx src/cli.ts convert "$WORKDIR/t1" -o "$WORKDIR/t1-out" --convert-file "$WORKDIR/t1/convert.json" 2>&1

# Verify
python3 -c "
import json
d = json.load(open('$WORKDIR/t1-out/package.json'))
assert 'line-column' in d['dependencies'], 'missing line-column in deps'
assert 'esbuild' in d['devDependencies'], 'missing esbuild'
assert 'coc-test-html' == d['name'], 'wrong name'
print('  package.json OK')
" && green "package.json" || red "package.json"

grep -q "coc.nvim" "$WORKDIR/t1-out/src/extension.ts" && green "import-mapping" || red "import-mapping"
grep -q "provider.ts" <(ls "$WORKDIR/t1-out/src/") && green "provider.ts copied" || red "provider.ts not copied"
grep -q "line-column" "$WORKDIR/t1-out/esbuild.mjs" && green "line-column externalized" || red "line-column not external"

# Try esbuild
cd "$WORKDIR/t1-out"
npm install --legacy-peer-deps 2>/dev/null && green "npm install" || red "npm install"
node esbuild.mjs 2>&1 && green "esbuild build" || red "esbuild build"

# ============================================================
echo ""
echo "=== Test 2: language-client + source (Prisma style) ==="
cleanup
mkdir -p "$WORKDIR/t2/src/plugins/prisma-language-server"
cat > "$WORKDIR/t2/package.json" <<JSON
{"name":"test-prisma","version":"6.0.0","description":"Prisma test","dependencies":{"@prisma/language-server":"workspace:*","execa":"^9.0.0","zod":"^3.0.0","minimatch":"^10.0.0"}}
JSON
cat > "$WORKDIR/t2/src/extension.ts" <<TS
import { commands, window } from 'vscode'
export function activate(ctx: any) {
  ctx.subscriptions.push(commands.registerCommand('prisma.hello', () => window.showInformationMessage('hi')))
}
TS
touch "$WORKDIR/t2/src/plugins/prisma-language-server/index.ts"
cat > "$WORKDIR/t2/convert.json" <<JSON
[{"type":"language-client","server":{"kind":"module","package":"@prisma/language-server","entry":"bin"},"languages":["prisma"]},{"type":"source","transforms":["import-mapping","enum-offset"],"entry":"src/extension.ts"}]
JSON

cd "$CONVERTER"
npx tsx src/cli.ts convert "$WORKDIR/t2" -o "$WORKDIR/t2-out" --convert-file "$WORKDIR/t2/convert.json" 2>&1

python3 -c "
import json
d = json.load(open('$WORKDIR/t2-out/package.json'))
assert '@prisma/language-server' in d['dependencies'], 'missing server dep'
assert d['dependencies']['@prisma/language-server'] == '*', 'workspace should be *'
assert 'execa' in d['dependencies'], 'missing execa'
assert 'zod' in d['dependencies'], 'missing zod'
print('  package.json OK')
" && green "package.json" || red "package.json"

grep -q "src/index.ts" <(ls "$WORKDIR/t2-out/src/") && green "index.ts generated" || red "index.ts missing"
grep -q "import './extension'" "$WORKDIR/t2-out/src/index.ts" && green "extension imported" || red "extension not imported"
grep -q "LanguageClient" "$WORKDIR/t2-out/src/index.ts" && green "LanguageClient in code" || red "LanguageClient missing"
grep -q "'onLanguage:prisma'" "$WORKDIR/t2-out/package.json" && green "activationEvents" || red "activationEvents missing"

cd "$WORKDIR/t2-out"
npm install --legacy-peer-deps 2>/dev/null && green "npm install" || red "npm install"

# ============================================================
echo ""
echo "=== Test 3: binary language-client (Deno style) ==="
cleanup
mkdir -p "$WORKDIR/t3/src"
cat > "$WORKDIR/t3/package.json" <<JSON
{"name":"test-deno","version":"0.1.0","description":"Deno test"}
JSON
cat > "$WORKDIR/t3/src/extension.ts" <<TS
import { commands } from 'vscode'
export function activate(ctx: any) { ctx.subscriptions.push(commands.registerCommand('test.deno', () => {})) }
TS
cat > "$WORKDIR/t3/convert.json" <<JSON
[{"type":"language-client","server":{"kind":"binary","package":"deno","binary":{"repo":"denoland/deno","asset":"deno-{{rust-target}}.zip","binaryPath":"deno"},"args":["lsp"]},"languages":["typescript"]},{"type":"source","transforms":["import-mapping"],"entry":"src/extension.ts"}]
JSON

cd "$CONVERTER"
npx tsx src/cli.ts convert "$WORKDIR/t3" -o "$WORKDIR/t3-out" --convert-file "$WORKDIR/t3/convert.json" 2>&1

python3 -c "
import json
d = json.load(open('$WORKDIR/t3-out/package.json'))
assert 'onLanguage:typescript' in d['activationEvents'], 'activationEvents wrong'
print('  package.json OK')
" && green "package.json" || red "package.json"

grep -q "command: serverPath" "$WORKDIR/t3-out/src/index.ts" && green "command-based server" || red "command-based server"
grep -q "server.*deno" "$WORKDIR/t3-out/src/index.ts" && green "binary path" || red "binary path missing"

cd "$WORKDIR/t3-out"
npm install --legacy-peer-deps 2>/dev/null && green "npm install" || red "npm install"
node esbuild.mjs 2>&1 && green "esbuild build" || red "esbuild build"

# ============================================================
echo ""
echo "=== Test 4: bridge + language-client (Volar style) ==="
cleanup
mkdir -p "$WORKDIR/t4/src"
cat > "$WORKDIR/t4/package.json" <<JSON
{"name":"test-volar","version":"0.1.0","description":"Volar test","dependencies":{"typescript":"^5.0.0"}}
JSON
cat > "$WORKDIR/t4/src/extension.ts" <<TS
import { commands } from 'vscode'
export function activate(ctx: any) { ctx.subscriptions.push(commands.registerCommand('test.volar', () => {})) }
TS
cat > "$WORKDIR/t4/convert.json" <<JSON
[{"type":"bridge","preset":"ts-bridge"},{"type":"language-client","server":{"kind":"module","package":"typescript","entry":"main"},"languages":["vue"]},{"type":"source","transforms":["import-mapping"],"entry":"src/extension.ts"}]
JSON

cd "$CONVERTER"
npx tsx src/cli.ts convert "$WORKDIR/t4" -o "$WORKDIR/t4-out" --convert-file "$WORKDIR/t4/convert.json" 2>&1

grep -q "registerBridge" "$WORKDIR/t4-out/src/index.ts" && green "bridge imported" || red "bridge missing"
grep -q "from './bridge'" "$WORKDIR/t4-out/src/index.ts" && green "bridge import" || red "bridge import missing"
grep -q "src/bridge.ts" <(ls "$WORKDIR/t4-out/src/") && green "bridge.ts generated" || red "bridge.ts missing"

cd "$WORKDIR/t4-out"
npm install --legacy-peer-deps 2>/dev/null && green "npm install" || red "npm install"

# ============================================================
echo ""
echo "=== Test 5: no src/ directory (Deno source style) ==="
cleanup
mkdir -p "$WORKDIR/t5"
cat > "$WORKDIR/t5/package.json" <<JSON
{"name":"test-nosrc","version":"0.1.0","description":"No src dir test","dependencies":{"execa":"^9.0.0"}}
JSON
cat > "$WORKDIR/t5/extension.ts" <<TS
import { commands } from 'vscode'
export function activate(ctx: any) { ctx.subscriptions.push(commands.registerCommand('test.nosrc', () => {})) }
TS
cat > "$WORKDIR/t5/convert.json" <<JSON
[{"type":"source","transforms":["import-mapping"],"entry":"extension.ts"}]
JSON

cd "$CONVERTER"
npx tsx src/cli.ts convert "$WORKDIR/t5" -o "$WORKDIR/t5-out" --convert-file "$WORKDIR/t5/convert.json" 2>&1

test -f "$WORKDIR/t5-out/src/extension.ts" && green "extension.ts copied" || red "extension.ts not copied"
grep -q "coc.nvim" "$WORKDIR/t5-out/src/extension.ts" && green "import-mapping OK" || red "import-mapping failed"

cd "$WORKDIR/t5-out"
npm install --legacy-peer-deps 2>/dev/null && green "npm install" || red "npm install"
node esbuild.mjs 2>&1 && green "esbuild build" || red "esbuild build"

# ============================================================
echo ""
echo "=== Results ==="
echo "  Pass: $PASS"
echo "  Fail: $FAIL"
[ "$FAIL" -eq 0 ] && echo "  All tests passed!" || echo "  $FAIL test(s) failed"
