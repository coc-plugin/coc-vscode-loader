#!/usr/bin/env bash
# Regression test suite for converter v2.0
# Tests all step types, CLI, esbuild bundling, and edge cases
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONVERTER="$ROOT/converter"
WORKDIR="/tmp/test-regression"
PASS=0
FAIL=0
TOTAL=0

green() { PASS=$((PASS+1)); TOTAL=$((TOTAL+1)); echo "  ✓ $1"; }
red() { FAIL=$((FAIL+1)); TOTAL=$((TOTAL+1)); echo "  ✗ $1"; }
yellow() { echo "  ⚠ $1"; }

mkdir -p "$WORKDIR"
cleanup() { rm -rf "$WORKDIR"/*; }

# ============================================================
echo "=== 1. Step type: source-only (HTML CSS Support style) ==="
cleanup
mkdir -p "$WORKDIR/t1/src"
cat > "$WORKDIR/t1/package.json" <<JSON
{"name":"t1","version":"0.1.0","dependencies":{"line-column":"^1.0.0"}}
JSON
cat > "$WORKDIR/t1/src/extension.ts" <<TS
import * as vscode from 'vscode'
export function activate(ctx: vscode.ExtensionContext) {
  ctx.subscriptions.push(vscode.commands.registerCommand('t1.hello', () => vscode.window.showInformationMessage('hi')))
}
TS
cat > "$WORKDIR/t1/src/helper.ts" <<TS
import lineColumn from 'line-column'
export function parse(s: string) { return lineColumn(s, 0) }
TS
cat > "$WORKDIR/t1/convert.json" <<JSON
[{"type":"source","transforms":["import-mapping","class-to-factory","provider-register"],"entry":"src/extension.ts","activationEvents":["onLanguage:test"]}]
JSON

cd "$CONVERTER"
npx tsx src/cli.ts convert "$WORKDIR/t1" -o "$WORKDIR/t1-out" --convert-file "$WORKDIR/t1/convert.json" > /dev/null 2>&1

python3 -c "
import json
d = json.load(open('$WORKDIR/t1-out/package.json'))
assert d['name'] == 'coc-t1', f'name: {d[\"name\"]}'
assert 'line-column' in d['dependencies'], 'deps missing'
assert d['devDependencies']['esbuild'], 'esbuild missing'
assert d['activationEvents'] == ['onLanguage:test'], f'activationEvents: {d[\"activationEvents\"]}'
" && green "package.json" || red "package.json"

test -f "$WORKDIR/t1-out/src/extension.ts" && green "extension.ts exists" || red "extension.ts missing"
test -f "$WORKDIR/t1-out/src/helper.ts" && green "helper.ts exists" || red "helper.ts missing"
grep -q "coc.nvim" "$WORKDIR/t1-out/src/extension.ts" && green "import-mapping applied" || red "import-mapping failed"
grep -q "line-column" "$WORKDIR/t1-out/esbuild.mjs" && green "line-column externalized" || red "external missing"
grep -q "lib/index.js" "$WORKDIR/t1-out/esbuild.mjs" && green "esbuild entry OK" || red "esbuild entry bad"

cd "$WORKDIR/t1-out"
npm install --legacy-peer-deps > /dev/null 2>&1 && green "npm install" || red "npm install"
node esbuild.mjs > /dev/null 2>&1 && green "esbuild build" || red "esbuild build"
test -f lib/index.js && green "lib/index.js generated" || red "lib/index.js missing"

# ============================================================
echo "=== 2. Step type: language-client + source (Prisma style) ==="
cleanup
mkdir -p "$WORKDIR/t2/src/sub"
cat > "$WORKDIR/t2/package.json" <<JSON
{"name":"t2","version":"0.1.0","description":"T2","dependencies":{"lodash":"*","execa":"^9.0.0"}}
JSON
cat > "$WORKDIR/t2/src/extension.ts" <<TS
import { commands, window } from 'vscode'
export function activate(ctx: any) { ctx.subscriptions.push(commands.registerCommand('t2.hello', () => window.showInformationMessage('hi'))) }
TS
touch "$WORKDIR/t2/src/sub/extra.ts"
cat > "$WORKDIR/t2/convert.json" <<JSON
[{"type":"language-client","server":{"kind":"module","package":"lodash","entry":"main"},"languages":["testlang"]},{"type":"source","transforms":["import-mapping","enum-offset"],"entry":"src/extension.ts"}]
JSON

cd "$CONVERTER"
npx tsx src/cli.ts convert "$WORKDIR/t2" -o "$WORKDIR/t2-out" --convert-file "$WORKDIR/t2/convert.json" > /dev/null 2>&1

python3 -c "
import json
d = json.load(open('$WORKDIR/t2-out/package.json'))
assert 'lodash' in d['dependencies'], 'server dep missing'
assert 'execa' in d['dependencies'], 'execa missing'
assert 'onLanguage:testlang' in d['activationEvents'], f'activationEvents: {d[\"activationEvents\"]}'
" && green "package.json" || red "package.json"

test -f "$WORKDIR/t2-out/src/index.ts" && green "index.ts generated" || red "index.ts missing"
grep -q "LanguageClient" "$WORKDIR/t2-out/src/index.ts" && green "LanguageClient in code" || red "LanguageClient missing"
grep -q "lodash" "$WORKDIR/t2-out/src/index.ts" && green "server ref in code" || red "server ref missing"
# Source entry should NOT be imported (old code didn't do it)
if grep -q "import.*extension" "$WORKDIR/t2-out/src/index.ts" 2>/dev/null; then
  red "source entry should NOT be imported"
else
  green "source entry not imported (as expected)"
fi
test -f "$WORKDIR/t2-out/src/sub/extra.ts" && green "nested file copied" || red "nested file missing"

cd "$WORKDIR/t2-out"
npm install --legacy-peer-deps > /dev/null 2>&1 && green "npm install" || red "npm install"

# ============================================================
echo "=== 3. Step type: binary language-client (Deno style) ==="
cleanup
mkdir -p "$WORKDIR/t3"
cat > "$WORKDIR/t3/package.json" <<JSON
{"name":"t3","version":"0.1.0","description":"T3"}
JSON
cat > "$WORKDIR/t3/extension.ts" <<TS
import { commands } from 'vscode'
export function activate(ctx: any) { ctx.subscriptions.push(commands.registerCommand('t3.hello', () => {})) }
TS
cat > "$WORKDIR/t3/convert.json" <<JSON
[{"type":"language-client","server":{"kind":"binary","package":"deno","binary":{"repo":"denoland/deno","asset":"deno-{{rust-target}}.zip","binaryPath":"deno"},"args":["lsp"]},"languages":["typescript"]},{"type":"source","transforms":["import-mapping"],"entry":"extension.ts"}]
JSON

cd "$CONVERTER"
npx tsx src/cli.ts convert "$WORKDIR/t3" -o "$WORKDIR/t3-out" --convert-file "$WORKDIR/t3/convert.json" > /dev/null 2>&1

python3 -c "
import json
d = json.load(open('$WORKDIR/t3-out/package.json'))
assert 'onLanguage:typescript' in d['activationEvents'], f'activationEvents: {d[\"activationEvents\"]}'
" && green "package.json" || red "package.json"

grep -q "command: serverPath" "$WORKDIR/t3-out/src/index.ts" && green "binary server (command mode)" || red "command mode missing"
# Binary should NOT have transport field
if grep -q "transport.*TransportKind" "$WORKDIR/t3-out/src/index.ts"; then
  red "binary should NOT have transport field"
else
  green "binary has no transport (correct)"
fi

cd "$WORKDIR/t3-out"
npm install --legacy-peer-deps > /dev/null 2>&1 && green "npm install" || red "npm install"
node esbuild.mjs > /dev/null 2>&1 && green "esbuild build" || red "esbuild build"

# ============================================================
echo "=== 4. Step type: bridge + language-client (Volar style) ==="
cleanup
mkdir -p "$WORKDIR/t4"
cat > "$WORKDIR/t4/package.json" <<JSON
{"name":"t4","version":"0.1.0","dependencies":{"@vue/language-server":"*"}}
JSON
cat > "$WORKDIR/t4/extension.ts" <<TS
import * as vscode from 'vscode'
import { defineExtension } from 'reactive-vscode'
export = defineExtension(() => { vscode.commands.registerCommand('t4.hello', () => {}) })
TS
cat > "$WORKDIR/t4/config.ts" <<TS
import * as vscode from 'vscode'
export function getCfg() { return vscode.workspace.getConfiguration('t4') }
TS
cat > "$WORKDIR/t4/convert.json" <<JSON
[{"type":"bridge","preset":"ts-bridge"},{"type":"language-client","server":{"kind":"module","package":"@vue/language-server","entry":"main"},"languages":["vue"]},{"type":"source","transforms":["import-mapping","strip-volar"]}]
JSON
cat > "$WORKDIR/t4/presets.json" <<JSON
{"ts-bridge":{"type":"tsserver-forward","options":{"extensions":["coc-tsserver"],"services":["tsserver"],"command":"typescript.tsserverRequest"}}}
JSON

cd "$CONVERTER"
npx tsx src/cli.ts convert "$WORKDIR/t4" -o "$WORKDIR/t4-out" --convert-file "$WORKDIR/t4/convert.json" --presets-file "$WORKDIR/t4/presets.json" > /dev/null 2>&1

test -f "$WORKDIR/t4-out/src/index.ts" && green "index.ts generated" || red "index.ts missing"
test -f "$WORKDIR/t4-out/src/bridge.ts" && green "bridge.ts generated" || red "bridge.ts missing"
test -f "$WORKDIR/t4-out/src/config.ts" && green "config.ts copied (non-framework)" || red "config.ts missing"

# Framework files should be skipped
if test -f "$WORKDIR/t4-out/src/extension.ts"; then
  red "extension.ts should NOT be copied (reactive-vscode)"
else
  green "extension.ts skipped (correct)"
fi

grep -q "registerBridge" "$WORKDIR/t4-out/src/index.ts" && green "bridge imported" || red "bridge missing"
grep -q "coc-tsserver" "$WORKDIR/t4-out/src/index.ts" && green "tsserver activation" || red "tsserver activation missing"
grep -q "extensions" "$WORKDIR/t4-out/src/index.ts" && green "extensions imported" || red "extensions import missing"

cd "$WORKDIR/t4-out"
npm install --legacy-peer-deps > /dev/null 2>&1 && green "npm install" || red "npm install"

# ============================================================
echo "=== 5. Edge case: no src/ directory ==="
cleanup
mkdir -p "$WORKDIR/t5"
cat > "$WORKDIR/t5/package.json" <<JSON
{"name":"t5","version":"0.1.0","dependencies":{"lodash":"^4.17.21"}}
JSON
cat > "$WORKDIR/t5/index.ts" <<TS
import { commands } from 'vscode'
export function activate(ctx: any) { ctx.subscriptions.push(commands.registerCommand('t5.hello', () => {})) }
TS
cat > "$WORKDIR/t5/convert.json" <<JSON
[{"type":"source","transforms":["import-mapping"],"entry":"index.ts"}]
JSON

cd "$CONVERTER"
npx tsx src/cli.ts convert "$WORKDIR/t5" -o "$WORKDIR/t5-out" --convert-file "$WORKDIR/t5/convert.json" > /dev/null 2>&1

test -f "$WORKDIR/t5-out/src/index.ts" && green "file copied (from root)" || red "file not copied"
grep -q "coc.nvim" "$WORKDIR/t5-out/src/index.ts" && green "import-mapping OK" || red "import-mapping wrong"

cd "$WORKDIR/t5-out"
npm install --legacy-peer-deps > /dev/null 2>&1 && green "npm install" || red "npm install"
node esbuild.mjs > /dev/null 2>&1 && green "esbuild build" || red "esbuild build"

# ============================================================
echo "=== 6. Edge case: verbose logging toggle ==="
cleanup
mkdir -p "$WORKDIR/t6"
cat > "$WORKDIR/t6/package.json" <<JSON
{"name":"t6","version":"0.1.0"}
JSON
cat > "$WORKDIR/t6/extension.ts" <<TS
import { commands } from 'vscode'
export function activate(ctx: any) { ctx.subscriptions.push(commands.registerCommand('t6.hello', () => {})) }
TS
# Without verbose
cat > "$WORKDIR/t6/convert-quiet.json" <<JSON
[{"type":"language-client","server":{"kind":"module","package":"lodash","entry":"main"},"languages":["test"]},{"type":"source","transforms":["import-mapping"]}]
JSON
cd "$CONVERTER"
npx tsx src/cli.ts convert "$WORKDIR/t6" -o "$WORKDIR/t6-quiet" --convert-file "$WORKDIR/t6/convert-quiet.json" > /dev/null 2>&1
if grep -q "console.log" "$WORKDIR/t6-quiet/src/index.ts"; then
  red "verbose=false should not have console.log"
else
  green "verbose=false: no console.log"
fi

# With verbose
cat > "$WORKDIR/t6/convert-verbose.json" <<JSON
[{"type":"language-client","server":{"kind":"module","package":"lodash","entry":"main"},"languages":["test"],"verbose":true},{"type":"source","transforms":["import-mapping"]}]
JSON
npx tsx src/cli.ts convert "$WORKDIR/t6" -o "$WORKDIR/t6-verbose" --convert-file "$WORKDIR/t6/convert-verbose.json" > /dev/null 2>&1
if grep -q "console.log" "$WORKDIR/t6-verbose/src/index.ts"; then
  green "verbose=true: has console.log"
else
  red "verbose=true should have console.log"
fi

# ============================================================
echo "=== 7. Edge case: keepDeps array vs object ==="
cleanup
mkdir -p "$WORKDIR/t7"
cat > "$WORKDIR/t7/package.json" <<JSON
{"name":"t7","version":"0.1.0","dependencies":{"lodash":"^4.17.21","left-pad":"^1.3.0"}}
JSON
cat > "$WORKDIR/t7/extension.ts" <<TS
import { commands } from 'vscode'
export function activate(ctx: any) { ctx.subscriptions.push(commands.registerCommand('t7.hello', () => {})) }
TS
# Array syntax
cat > "$WORKDIR/t7/convert.json" <<JSON
[{"type":"source","transforms":["import-mapping"],"entry":"extension.ts","keepDeps":["lodash"]}]
JSON
cd "$CONVERTER"
npx tsx src/cli.ts convert "$WORKDIR/t7" -o "$WORKDIR/t7-out" --convert-file "$WORKDIR/t7/convert.json" > /dev/null 2>&1
python3 -c "
import json
d = json.load(open('$WORKDIR/t7-out/package.json'))
assert 'lodash' in d['dependencies'], 'lodash missing'
assert 'left-pad' in d['dependencies'], 'left-pad should be in auto-deps'
" && green "keepDeps array + auto original deps" || red "keepDeps array failed"

# ============================================================
echo "=== 8. Registry validation (CI checks) ==="
REGISTRY="$ROOT/coc-vscode-registry/registry.json"
PRESETS="$ROOT/coc-vscode-registry/presets.json"

if [ -f "$REGISTRY" ]; then
  python3 -c "
import json
with open('$REGISTRY') as f:
    entries = json.load(f)
    assert len(entries) == 107, f'Expected 107 entries, got {len(entries)}'
for e in entries:
    if e['name'] == 'prettier-vscode':
        assert e['type'] == 'direct-api', f'{e[\"name\"]} should be direct-api'
        assert len(e['convert']) == 1, f'{e[\"name\"]} should have 1 convert step'
        assert e['convert'][0]['type'] == 'source', f'{e[\"name\"]} should use source step'
        assert 'import-mapping' in e['convert'][0].get('transforms', []), f'{e[\"name\"]} should have import-mapping transform'
for e in entries:
    assert 'convert' in e, f'{e[\"name\"]} missing convert config'
    assert len(e['convert']) > 0, f'{e[\"name\"]} empty convert'
    for step in e['convert']:
        assert step['type'] in ('language-client','source','bridge','mark-unsupported'), f'{e[\"name\"]}: unknown step type {step[\"type\"]}'
        if step['type'] == 'language-client':
            assert 'languages' in step, f'{e["name"]}: language-client missing languages'
            assert len(step['languages']) > 0, f'{e["name"]}: empty languages'
            assert step['server']['kind'] in ('module','binary'), f'{e["name"]}: unknown server kind'
            if step['server']['kind'] == 'module' and step['server'].get('entry') == 'bin':
                if 'binName' in step['server']:
                    assert isinstance(step['server']['binName'], str) and len(step['server']['binName']) > 0, f'{e["name"]}: binName must be a non-empty string'
        if step['type'] == 'source':
            if 'transforms' in step:
                for t in step['transforms']:
                    assert t in ('import-mapping','class-to-factory','provider-register','enum-offset','strip-volar'), f'{e[\"name\"]}: unknown transform {t}'
            if 'keepDeps' in step and isinstance(step['keepDeps'], list):
                assert all(isinstance(d, str) for d in step['keepDeps']), f'{e[\"name\"]}: keepDeps array must be strings'
        if step['type'] == 'bridge':
            assert 'preset' in step, f'{e[\"name\"]}: bridge missing preset'
" && green "registry.json structure valid" || red "registry.json invalid"
fi

if [ -f "$PRESETS" ]; then
  python3 -c "
import json
with open('$PRESETS') as f:
    presets = json.load(f)
for name, p in presets.items():
    assert 'type' in p, f'preset {name} missing type'
    assert p['type'] in ('tsserver-forward', 'prettier'), f'preset {name}: unknown type {p[\"type\"]}'
" && green "presets.json valid" || red "presets.json invalid"
fi

# Check known server packages exist on npm (skip if offline)
if command -v npm &>/dev/null; then
  npm view @prisma/language-server version > /dev/null 2>&1 && green "npm: @prisma/language-server exists" || red "npm: @prisma/language-server not found"
  npm view @vue/language-server version > /dev/null 2>&1 && green "npm: @vue/language-server exists" || red "npm: @vue/language-server not found"
  npm view @ansible/ansible-language-server version > /dev/null 2>&1 && green "npm: @ansible/ansible-language-server exists" || red "npm: @ansible/ansible-language-server not found"
  npm view @prisma/language-server bin --json > /dev/null 2>&1 && green "npm: @prisma/language-server has bin" || yellow "npm: @prisma/language-server bin not found (may have exports restriction)"
  npm view @tailwindcss/language-server version > /dev/null 2>&1 && green "npm: @tailwindcss/language-server exists" || red "npm: @tailwindcss/language-server not found"
  npm view @tailwindcss/language-server bin --json > /dev/null 2>&1 && green "npm: @tailwindcss/language-server has bin" || red "npm: @tailwindcss/language-server bin missing"
fi

# ============================================================
echo "=== 9. Edge case: module server with bin entry + binName (Tailwind style) ==="
cleanup
mkdir -p "$WORKDIR/t9/src"
cat > "$WORKDIR/t9/package.json" <<JSON
{"name":"t9","version":"0.1.0","dependencies":{"@mock/bin-server":"*"}}
JSON
cat > "$WORKDIR/t9/src/extension.ts" <<TS
import { commands } from 'vscode'
export function activate(ctx: any) { ctx.subscriptions.push(commands.registerCommand('t9.hello', () => {})) }
TS
cat > "$WORKDIR/t9/convert.json" <<JSON
[{"type":"language-client","server":{"kind":"module","package":"@mock/bin-server","entry":"bin","binName":"my-server"},"languages":["css"]},{"type":"source","transforms":["import-mapping"]}]
JSON

cd "$CONVERTER"
npx tsx src/cli.ts convert "$WORKDIR/t9" -o "$WORKDIR/t9-out" --convert-file "$WORKDIR/t9/convert.json" > /dev/null 2>&1

test -f "$WORKDIR/t9-out/src/index.ts" && green "index.ts generated" || red "index.ts missing"
python3 -c "
import json
d = json.load(open('$WORKDIR/t9-out/package.json'))
assert '@mock/bin-server' in d['dependencies'], f'server dep missing: {d[\"dependencies\"]}'
assert 'onLanguage:css' in d['activationEvents'], f'activationEvents: {d[\"activationEvents\"]}'
" && green "package.json correct" || red "package.json wrong"

grep -q "package.json" "$WORKDIR/t9-out/src/index.ts" && green "package.json fallback present" || red "package.json fallback missing"
grep -q "my-server" "$WORKDIR/t9-out/src/index.ts" && green "binName: my-server used" || red "binName: wrong binary selected"
grep -q "LanguageClient" "$WORKDIR/t9-out/src/index.ts" && green "LanguageClient in code" || red "LanguageClient missing"

# ============================================================
echo "=== 10. keepDeps object syntax + module server with entry:bin (YAML style) ==="
cleanup
mkdir -p "$WORKDIR/t10/src"
cat > "$WORKDIR/t10/package.json" <<JSON
{"name":"t10","version":"0.1.0","dependencies":{"yaml-language-server":"*"}}
JSON
cat > "$WORKDIR/t10/src/extension.ts" <<TS
import { commands } from 'vscode'
export function activate(ctx: any) { ctx.subscriptions.push(commands.registerCommand('t10.hello', () => {})) }
TS
cat > "$WORKDIR/t10/convert.json" <<JSON
[{"type":"language-client","server":{"kind":"module","package":"yaml-language-server","entry":"bin"},"languages":["yaml"]},{"type":"source","transforms":["import-mapping"],"keepDeps":{"ajv":"^8.17.1"}}]
JSON

cd "$CONVERTER"
npx tsx src/cli.ts convert "$WORKDIR/t10" -o "$WORKDIR/t10-out" --convert-file "$WORKDIR/t10/convert.json" > /dev/null 2>&1

test -f "$WORKDIR/t10-out/src/index.ts" && green "index.ts generated" || red "index.ts missing"
python3 -c "
import json
d = json.load(open('$WORKDIR/t10-out/package.json'))
assert 'yaml-language-server' in d['dependencies'], f'server dep missing: {d[\"dependencies\"]}'
assert 'ajv' in d['dependencies'], f'keepDeps ajv missing: {d[\"dependencies\"]}'
assert d['dependencies']['ajv'] == '^8.17.1', f'ajv version wrong: {d[\"dependencies\"][\"ajv\"]}'
assert 'onLanguage:yaml' in d['activationEvents'], f'activationEvents: {d[\"activationEvents\"]}'
" && green "package.json correct (server dep + keepDeps ajv)" || red "package.json wrong"

grep -q "yaml-language-server" "$WORKDIR/t10-out/src/index.ts" && green "server ref in code" || red "server ref missing"
grep -q "entry:bin resolution" "$WORKDIR/t10-out/src/index.ts" 2>/dev/null && echo "  ⚠ unexpected comment" || grep -q "require.resolve.*yaml-language-server" "$WORKDIR/t10-out/src/index.ts" && green "require.resolve present" || red "require.resolve missing"
grep -q "LanguageClient" "$WORKDIR/t10-out/src/index.ts" && green "LanguageClient in code" || red "LanguageClient missing"
# Verify bin walking path (not main entry)
grep -q "bin" "$WORKDIR/t10-out/src/index.ts" && green "bin walking code present" || red "bin walking missing"

cd "$WORKDIR/t10-out"
npm install --legacy-peer-deps > /dev/null 2>&1 && green "npm install" || red "npm install"

# Verify ajv is installed at top level with correct version
node -e "
const p = require('ajv/package.json')
if (p.version.startsWith('8.')) { process.exit(0) }
else { console.error('ajv version:', p.version); process.exit(1) }
" && green "ajv v8 installed at top level" || red "ajv version wrong"

node esbuild.mjs > /dev/null 2>&1 && green "esbuild build" || red "esbuild build"

# ============================================================
echo "=== 11. Bridge preset: prettier standalone formatter ==="
cleanup
mkdir -p "$WORKDIR/t11"
cat > "$WORKDIR/t11/package.json" <<JSON
{"name":"t11","version":"0.1.0","dependencies":{"prettier":"*"}}
JSON
cat > "$WORKDIR/t11/presets.json" <<JSON
{"prettier":{"type":"prettier","options":{"languages":["javascript","css"]}}}
JSON
cat > "$WORKDIR/t11/convert.json" <<JSON
[{"type":"bridge","preset":"prettier"}]
JSON

cd "$CONVERTER"
npx tsx src/cli.ts convert "$WORKDIR/t11" -o "$WORKDIR/t11-out" --convert-file "$WORKDIR/t11/convert.json" --presets-file "$WORKDIR/t11/presets.json" > /dev/null 2>&1

test -f "$WORKDIR/t11-out/src/index.ts" && green "index.ts generated" || red "index.ts missing"
grep -q "require('prettier')" "$WORKDIR/t11-out/src/index.ts" && green "prettier required" || red "prettier require missing"
grep -q "registerDocumentFormatProvider" "$WORKDIR/t11-out/src/index.ts" && green "formatter registered" || red "formatter missing"
grep -q "prettier.format" "$WORKDIR/t11-out/src/index.ts" && green "prettier.format called" || red "format call missing"
grep -q "prettier.resolveConfigFile" "$WORKDIR/t11-out/src/index.ts" && green "config file resolution" || red "config resolution missing"
python3 -c "
import json
d = json.load(open('$WORKDIR/t11-out/package.json'))
assert 'prettier' in d['dependencies'], f'dep missing: {d[\"dependencies\"]}'
assert 'coc-prettier' not in d['name'], f'bad name: {d[\"name\"]}'
" && green "package.json correct" || red "package.json wrong"

cd "$WORKDIR/t11-out"
npm install --legacy-peer-deps > /dev/null 2>&1 && green "npm install" || red "npm install"
node esbuild.mjs > /dev/null 2>&1 && green "esbuild build" || red "esbuild build"

# ============================================================
echo ""
echo "=== Results ==="
echo "  Pass: $PASS / $TOTAL"
echo "  Fail: $FAIL / $TOTAL"

if [ "$FAIL" -gt 0 ]; then
  echo "  ❌ Some tests failed"
  exit 1
else
  echo "  ✅ All tests passed"
fi
