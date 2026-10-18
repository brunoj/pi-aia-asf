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

# The gates run before anything is versioned, tagged or published. They used to
# live only in habit: a release could ship with a type error or a red suite
# because nothing between "npm run release" and npm publish ever ran them.
echo "── gate: typecheck ──────────────────────────────────────────"
npm run --silent check || { echo "release refused: typecheck failed" >&2; exit 1; }
echo "── gate: test suite ─────────────────────────────────────────"
npm test || { echo "release refused: test suite failed" >&2; exit 1; }

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

# Gate: the publish actually landed. `npm publish` exits 0 when npm ACCEPTS the
# upload; npm can then hold the version in its staging queue for minutes, during
# which the packument may not list it and the tarball is not installable. Without
# this poll the script printed "✅ Released" for a version nobody could install.
echo "── gate: publish landed ─────────────────────────────────────"
PKG_NAME=$(node -p "require('./package.json').name")
node - "$PKG_NAME" "${NEW_VERSION#v}" <<'EOF' || exit 1
const [name, version] = process.argv.slice(2);
const tarball = `https://registry.npmjs.org/${encodeURIComponent(name)}/-/${name}-${version}.tgz`;
const url = `https://registry.npmjs.org/${encodeURIComponent(name)}?t=${Date.now()}`;
// npm routinely holds a fresh publish in staging for several minutes; a narrow
// window calls real releases INCOMPLETE and trains people to ignore the gate.
const DEADLINE = Date.now() + 1_200_000;
const START = Date.now();
const landed = async () => {
  try {
    const res = await fetch(url, { headers: { "Cache-Control": "no-cache" } });
    if (!res.ok) return false;
    const doc = await res.json();
    if (!doc.versions?.[version]) return false;
    // Listing the version is not enough — an install needs the bytes.
    const t = await fetch(tarball, { method: "HEAD" });
    return t.ok;
  } catch {
    return false;
  }
};
(async () => {
  let attempt = 0;
  while (Date.now() < DEADLINE) {
    attempt++;
    if (await landed()) {
      console.log(`published: ${name}@${version} is installable from the registry`);
      return;
    }
    // Say something while waiting: a silent 20 minutes looks like a hung script.
    if (attempt % 6 === 0) console.log(`  waiting for npm to serve ${name}@${version} — ${Math.round((Date.now() - START) / 1000)}s`);
    await new Promise((r) => setTimeout(r, 5_000));
  }
  console.error(
    `release INCOMPLETE: ${name}@${version} is not installable after 20 minutes.\n` +
      `npm most likely holds it in its staging queue (security review), or rejected it.\n` +
      `The git tag exists but nobody can install this version — check\n` +
      `https://www.npmjs.com/package/${name} and the security-holds page, then\n` +
      `re-publish (a still-staged version cannot be re-published: it 409s).`,
  );
  process.exit(1);
})();
EOF

# Gate: the PUBLISHED artifact. Every gate above reads the working tree, which is how
# a package ships a tarball missing a module its own entry point imports with a green
# suite (pi-aia-browser 0.2.1). This installs the version from the registry into a
# throwaway prefix, imports the installed extension and requires the skill and the
# declared obligations to be present in the installed copy.
if [ "${BMX_SKIP_PUBLISHED_VERIFY:-}" != "1" ]; then
  echo "── gate: published artifact verified ─────────────────────"
  node scripts/verify-published.mjs "${NEW_VERSION#v}" || {
    echo "release INCOMPLETE: ${NEW_VERSION} is on the registry but the installed artifact does not load" >&2
    exit 1
  }
fi

echo ""
echo "✅ Released $OLD_VERSION → $NEW_VERSION"
echo "   Tag:   $NEW_VERSION"
echo "   npm:   npm:pi-aia-asf@$NEW_VERSION"
echo "   NOTE:  Update CHANGELOG.md's '### Added' section if needed, then commit."
