#!/usr/bin/env bash
# Create a pull request from the current changes
set -euo pipefail

BRANCH="${1:-}"
TITLE="${2:-}"
DESCRIPTION="${3:-}"

usage() {
  echo "Usage: $0 <branch-name> [title] [description]"
  echo ""
  echo "  Creates a PR from current changes, pushes to a new branch"
  echo ""
  echo "Examples:"
  echo "  $0 fix/save-meta    # branch name only, auto-generates title"
  echo "  $0 feat/foo \"Add foo feature\" \"Closes #123\""
  exit 1
}

[ -z "$BRANCH" ] && usage

# Check for uncommitted changes
if [ -z "$(git status --porcelain)" ]; then
  echo "❌ No changes to commit"
  exit 1
fi

# Auto-generate title from branch name if not provided
if [ -z "$TITLE" ]; then
  BRANCH_NAME=$(basename "$BRANCH")
  TITLE=$(echo "$BRANCH_NAME" | sed 's/[-_]/ /g' | sed 's/\b\(.\)/\u\1/g')
fi

# Stage, commit, push, create PR
git add -A
git commit -m "$TITLE"
git checkout -b "$BRANCH"
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
echo "To merge: gh pr merge $BRANCH --squash"
