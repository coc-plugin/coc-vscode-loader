#!/usr/bin/env bash
set -euo pipefail

LOG_DIR="logs"
VSCODE_URL="https://raw.githubusercontent.com/microsoft/vscode/main/src/vscode-dts/vscode.d.ts"
COC_URL="https://raw.githubusercontent.com/neoclide/coc.nvim/master/typings/index.d.ts"

mkdir -p "$LOG_DIR"
TODAY=$(date +%Y-%m-%d)
LOG_FILE="$LOG_DIR/$TODAY.md"

# --- download latest files ---
TMP_VSCODE=$(mktemp)
TMP_COC=$(mktemp)
trap 'rm -f "$TMP_VSCODE" "$TMP_COC"' EXIT

echo "Downloading vscode.d.ts from $VSCODE_URL ..."
curl -sSL "$VSCODE_URL" -o "$TMP_VSCODE"
echo "Downloading coc.d.ts from $COC_URL ..."
curl -sSL "$COC_URL" -o "$TMP_COC"

# --- extract API names ---
extract_apis() {
  rg "^\s{0,1}export (interface|class|type|namespace|enum|const|function|let|var) " "$1" \
    | grep -oP '(?:interface|class|type|namespace|enum|const|function|let|var) \w+' \
    | sed 's/^[^ ]* //' | sort -u
}

OLD_VSCODE="vscode.d.ts"
OLD_COC="coc.d.ts"

compare_files() {
  local old_file="$1"
  local new_file="$2"
  local name="$3"

  if [ ! -f "$old_file" ]; then
    echo "## $name — NEW FILE (no previous version)" >> "$LOG_FILE"
    echo "status: new" >> "$LOG_FILE"
    cp "$new_file" "$old_file"
    echo "  - File created (first download)" >> "$LOG_FILE"
    return 0
  fi

  if cmp -s "$old_file" "$new_file"; then
    echo "## $name — 无变化" >> "$LOG_FILE"
    echo "status: unchanged" >> "$LOG_FILE"
    return 1
  fi

  # Extract APIs
  local old_apis_file=$(mktemp)
  local new_apis_file=$(mktemp)
  trap 'rm -f "$old_apis_file" "$new_apis_file"' EXIT

  extract_apis "$old_file" > "$old_apis_file" 2>/dev/null || true
  extract_apis "$new_file" > "$new_apis_file" 2>/dev/null || true

  local added=$(comm -13 "$old_apis_file" "$new_apis_file" 2>/dev/null || echo "")
  local removed=$(comm -23 "$old_apis_file" "$new_apis_file" 2>/dev/null || echo "")

  local old_size=$(wc -c < "$old_file")
  local new_size=$(wc -c < "$new_file")
  local old_lines=$(wc -l < "$old_file")
  local new_lines=$(wc -l < "$new_file")

  echo "## $name — 已更新" >> "$LOG_FILE"
  echo "status: changed" >> "$LOG_FILE"
  echo "- 旧: ${old_lines} 行 / ${old_size} 字节" >> "$LOG_FILE"
  echo "- 新: ${new_lines} 行 / ${new_size} 字节" >> "$LOG_FILE"

  if [ -n "$added" ]; then
    echo "" >> "$LOG_FILE"
    echo "### 新增 API ($(echo "$added" | wc -l))" >> "$LOG_FILE"
    echo "$added" | while IFS= read -r api; do
      [ -n "$api" ] && echo "- \`$api\`" >> "$LOG_FILE"
    done
  fi

  if [ -n "$removed" ]; then
    echo "" >> "$LOG_FILE"
    echo "### 移除 API ($(echo "$removed" | wc -l))" >> "$LOG_FILE"
    echo "$removed" | while IFS= read -r api; do
      [ -n "$api" ] && echo "- \`$api\`" >> "$LOG_FILE"
    done
  fi

  # Copy new files
  cp "$new_file" "$old_file"
  return 0
}

# --- generate log ---
{
  echo "# 类型文件同步检查 — $TODAY"
  echo ""
  echo "| 文件 | 状态 |"
  echo "|------|------|"
} > "$LOG_FILE"

VS_CHANGED=false
COC_CHANGED=false

vscode_result=$(compare_files "$OLD_VSCODE" "$TMP_VSCODE" "vscode.d.ts") && VS_CHANGED=true || true
coc_result=$(compare_files "$OLD_COC" "$TMP_COC" "coc.d.ts") && COC_CHANGED=true || true

# Insert status table at top (after first 3 lines)
{
  echo "# 类型文件同步检查 — $TODAY"
  echo ""
  echo "| 文件 | 状态 |"
  echo "|------|------|"
  if $VS_CHANGED; then
    echo "| vscode.d.ts | ✅ 已更新 |"
  else
    echo "| vscode.d.ts | ❌ 无变化 |"
  fi
  if $COC_CHANGED; then
    echo "| coc.d.ts | ✅ 已更新 |"
  else
    echo "| coc.d.ts | ❌ 无变化 |"
  fi
  echo ""
  echo "---"
  echo ""
  tail -n +4 "$LOG_FILE" > "${LOG_FILE}.tmp"
  mv "${LOG_FILE}.tmp" "$LOG_FILE"
}

echo "Log written to $LOG_FILE"

# Return whether anything changed
if $VS_CHANGED || $COC_CHANGED; then
  echo "has_changes=true"
  exit 0
else
  echo "has_changes=false"
  exit 0
fi
