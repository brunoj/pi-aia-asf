#!/usr/bin/env bash
#
# Prepares the local dependencies the ASF test harness needs.
#
# The harness loads index.ts through jiti exactly as pi does, so the tests
# exercise the real shipped extension and the real shipped skill text.
#
# Safe to re-run.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Node resolves bare imports from the importing file's directory upward, and the
# extension under test is the repo-root index.ts — so deps go in the repo root.
NM="$(cd "$HERE/.." && pwd)/node_modules"

PI_ROOT="${PI_ROOT:-$(npm root -g 2>/dev/null)/@earendil-works/pi-coding-agent}"
if [ ! -d "$PI_ROOT" ]; then
  echo "error: cannot find pi-coding-agent. Set PI_ROOT to its install path." >&2
  exit 1
fi

PI_NM="$PI_ROOT/node_modules"
for dep in jiti typebox; do
  if [ ! -d "$PI_NM/$dep" ]; then
    echo "error: $PI_NM/$dep not found" >&2
    exit 1
  fi
done

mkdir -p "$NM"
ln -sfn "$PI_NM/jiti" "$NM/jiti"
ln -sfn "$PI_NM/typebox" "$NM/typebox"
ln -sfn "$PI_ROOT" "$NM/@earendil-works-pi-coding-agent-tmp" 2>/dev/null || true
rm -f "$NM/@earendil-works-pi-coding-agent-tmp"
mkdir -p "$NM/@earendil-works"
ln -sfn "$PI_ROOT" "$NM/@earendil-works/pi-coding-agent"

echo "test dependencies ready"
