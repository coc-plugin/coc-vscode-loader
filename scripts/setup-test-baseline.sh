#!/bin/bash
# Setup test data for cross-version change detection
# Creates a fake "old version" snapshot so autoCheck() detects changes on restart.

set -e

CACHE_DIR="$HOME/.config/coc/converter-cache"
SNAPSHOT="$CACHE_DIR/baseline-snapshot.json"
BACKUP="$CACHE_DIR/baseline-snapshot.json.bak"
MARKERS="$CACHE_DIR/changed-markers.json"

echo "=== Phase 1: Setup test data ==="

# 1. Check build is up to date
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_DIR="$(cd "$SCRIPT_DIR/../plugin" && pwd)"
if [ "$PLUGIN_DIR/lib/index.js" -ot "$PLUGIN_DIR/src/baseline.ts" ]; then
  echo "⚠ WARNING: lib/index.js is older than src/baseline.ts"
  echo "  Run: cd plugin && npm run build"
  echo "  Then run this script again."
  exit 1
fi
echo "✓ Build is up to date"

# 2. Backup current snapshot
if [ -f "$SNAPSHOT" ]; then
  cp "$SNAPSHOT" "$BACKUP"
  echo "✓ Backed up current snapshot → $BACKUP"
else
  echo "✗ No existing snapshot found. Start coc at least once first."
  exit 1
fi

# 3. Clear any existing test markers
rm -f "$MARKERS"
echo "✓ Cleared existing markers"

# 4. Create fake old snapshot
node -e "
const fs = require('fs');
const s = JSON.parse(fs.readFileSync('$SNAPSHOT', 'utf-8'));

// Set version to something old — triggers autoCheck() version mismatch
s.version = '0.0.0';
s.timestamp = 1000000000000;

const changed = ['vscode-prettier-vscode', 'vscode-eslint', 'vscode-biome', 'vscode-tailwindcss'];
const deleted = ['vscode-gitignore'];

for (const name of changed) {
  if (!s.baseline[name]) {
    console.log('  skipping ' + name + ' (not in snapshot)');
    continue;
  }
  const entry = s.baseline[name];
  const files = Object.keys(entry).filter(k => !k.startsWith('_'));
  if (files.length > 0) {
    entry[files[0]] = '0000000000000000000000000000000000000000000000000000000000000000';
    console.log('  modified ' + name + ' → ' + files[0]);
  }
}

for (const name of deleted) {
  if (s.baseline[name]) {
    delete s.baseline[name];
    console.log('  deleted ' + name);
  }
}

fs.writeFileSync('$SNAPSHOT', JSON.stringify(s));
console.log('');
console.log('✓ Wrote fake old snapshot (version: 0.0.0)');
"

echo ""
echo "=== Phase 2: Restart coc ==="
echo "  Run :CocRestart in nvim"
echo ""
echo "  Expected: notification about N changed plugins"
echo ""
echo "=== Phase 3: Verify markers file ==="
echo "  After the notification, run this to check:"
echo "    ls -la $MARKERS"
echo "    cat $MARKERS"
echo ""
echo "  If markers file exists, the file was written correctly."
echo "  Then close nvim, reopen, and run:"
echo "    ls -la $MARKERS"
echo "    cat $MARKERS"
echo ""
echo "  If markers file still exists but [changed] is not in TUI, let me know."
echo ""

echo "=== To restore real snapshot ==="
echo "  cp $BACKUP $SNAPSHOT"
echo "  rm -f $MARKERS"
echo "  :CocRestart"
