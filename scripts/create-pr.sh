#!/usr/bin/env bash
# Create a pull request from the current changes
set -euo pipefail

BRANCH="${1:-}"
TITLE="${2:-}"
DESCRIPTION="${3:-}"

usage() {
  echo "Usage: $0 <branch-name> [title] [description]"
  echo ""
  echo "  Creates a PR from current changes"
  echo ""
  echo "Examples:"
  echo "  $0 fix/foo              # branch name only, auto title"
  echo "  $0 feat/bar \"Add bar\" \"Closes #123\""
  exit 1
}

[ -z "$BRANCH" ] && usage

if [ -z "$(git status --porcelain)" ]; then
  echo "❌ No changes to commit"
  exit 1
fi

if [ -z "$TITLE" ]; then
  BRANCH_NAME=$(basename "$BRANCH")
  TITLE=$(echo "$BRANCH_NAME" | sed 's/[-_]/ /g' | sed 's/\b\(.\)/\u\1/g')
fi

# Branch first, then commit (avoids dirty main)
git add -A
git checkout -b "$BRANCH"
git commit -m "$TITLE"
git push origin "$BRANCH" -u

PR_URL=$(gh pr create \
  --base main \
  --head "$BRANCH" \
  --title "$TITLE" \
  --body "${DESCRIPTION:-"Automated PR. See commits for details."}" 2>&1)

echo ""
echo "✅ PR created: $PR_URL"
echo "✅ Branch: $BRANCH"
echo ""
echo "After merge: git checkout main && git pull"
