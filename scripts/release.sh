#!/usr/bin/env bash
# pi-aia-asf release script — auto-version + changelog + tag + push + publish.
#
# Usage:   npm run release [patch|minor|major]   (default: patch)
# Requires: npm login (done once), git remote configured, gh CLI for PR-less push
#   or a configured git remote with push access.
set -euo pipefail

LEVEL="${1:-patch}"
case "$LEVEL" in
  patch|minor|major) ;;
  *) echo "Usage: npm run release [patch|minor|major]" >&2; exit 1 ;;
esac

# Must be run from the repo root
cd "$(dirname "$0")/.."

# Sanity checks
[ -f package.json ] || { echo "package.json not found" >&2; exit 1; }
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || { echo "not a git repo" >&2; exit 1; }
git diff --quiet || { echo "working tree dirty — commit or stash first" >&2; exit 1; }
npm whoami >/dev/null 2>&1 || { echo "not logged in to npm — run 'npm login' first" >&2; exit 1; }

OLD_VERSION=$(node -p "require('./package.json').version")
NEW_VERSION=$(npm version "$LEVEL" --no-git-tag-version)

# Update changelog: give the release its own version section.
# If [Unreleased] already holds real entries (the normal case — you write them
# as you work), MOVE them under the new version heading. Inserting a
# "(describe changes)" placeholder on top of them left two '### Added' blocks
# plus a placeholder to hand-delete, which happened for 0.10.0 and again for
# 0.11.0. Only fall back to the placeholder when [Unreleased] is genuinely empty.
TODAY=$(date +%Y-%m-%d)
node - "$NEW_VERSION" "$TODAY" <<'EOF'
const fs = require('fs');
const [v, today] = process.argv.slice(2);
const vv = v.replace(/^v/, '');
let cl = fs.readFileSync('CHANGELOG.md', 'utf-8');
if (!cl.includes(`## [${vv}]`)) {
  const re = /(## \[Unreleased\]\n)([\s\S]*?)(?=\n## \[|$)/;
  const m = cl.match(re);
  const body = m ? m[2].trim() : '';
  const section = body
    ? `## [Unreleased]\n\n## [${vv}] - ${today}\n\n${body}\n`
    : `## [Unreleased]\n\n## [${vv}] - ${today}\n\n### Added\n\n- (describe changes for ${vv})\n`;
  if (m) cl = cl.replace(re, () => section);
  else cl = cl.replace('## [Unreleased]\n', section + '\n');
  fs.writeFileSync('CHANGELOG.md', cl);
}
EOF

git add package.json CHANGELOG.md
[ -f package-lock.json ] && git add package-lock.json
git commit -m "chore: release $NEW_VERSION"
# Annotated on purpose: `git push --follow-tags` only pushes annotated tags, so a
# lightweight tag here would leave the release untagged on GitHub.
git tag -a "$NEW_VERSION" -m "Release $NEW_VERSION"

# Push and publish
git push --follow-tags
git push origin "$NEW_VERSION"
npm publish

echo ""
echo "✅ Released $OLD_VERSION → $NEW_VERSION"
echo "   Tag:   $NEW_VERSION"
echo "   npm:   npm:pi-aia-asf@$NEW_VERSION"
echo "   NOTE:  Update CHANGELOG.md's '### Added' section if needed, then commit."
