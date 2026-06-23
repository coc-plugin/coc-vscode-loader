#!/bin/bash
# Restore real snapshot after testing

CACHE_DIR="$HOME/.config/coc/converter-cache"
SNAPSHOT="$CACHE_DIR/baseline-snapshot.json"
BACKUP="$CACHE_DIR/baseline-snapshot.json.bak"
MARKERS="$CACHE_DIR/changed-markers.json"

if [ -f "$BACKUP" ]; then
  cp "$BACKUP" "$SNAPSHOT"
  rm -f "$BACKUP" "$MARKERS"
  echo "✓ Restored real snapshot, cleared test markers"
  echo "  Run :CocRestart to apply"
else
  echo "✗ No backup found at $BACKUP"
  echo "  Cannot restore automatically."
fi
