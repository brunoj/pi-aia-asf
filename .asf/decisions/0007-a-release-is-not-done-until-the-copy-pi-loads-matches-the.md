---
id: ADR-0007
status: accepted
title: "A release is not done until the copy pi loads matches the registry byte-for-byte"
decision: "The last gate of `npm run release` installs the published version into the live pi extension directory and compares the installed tree against the registry tarball by sha256; version equality alone is not accepted as proof."
decided: 2026-11-10
applies_to: [scripts/install-local.mjs, scripts/release.sh]
tags: [release, packaging, verification]
from_spec: 
user_instructed: "ensure you properly complete and mark as completed every run, so you judge the next run separately again" — and the standing PO instruction not to be sloppy about releases
plan: 
origin: agent
source: ["scripts/install-local.mjs", "scripts/release.sh:local install gate"]
supersedes: []
reopens_when: extensions are installed by a package manager that owns the version pin, or pi gains its own install/upgrade command
enforced: true
checks: [test/test-install-local.mjs]
---

## Decision

`scripts/install-local.mjs` runs as the final gate of `npm run release`. It resolves the live extension directory (`$PI_EXTENSION_DIR`, else `~/.pi/agent/npm`), runs `npm install <name>@<version>` there so the pin itself is rewritten, then downloads the registry tarball and compares every file against `node_modules/<name>` by sha256. Any missing, extra or differing file fails the release. With no pi extension directory on the machine it reports that and succeeds, because refusing to release from CI would be a false failure.

## Context

0.18.0 passed every existing gate — typecheck, the full suite, the "publish landed" poll, and the published-artifact test that installs the tarball into a throwaway prefix and imports it. The release was reported, and the session went on running **0.17.13**: `~/.pi/agent/npm/package.json` pinned `^0.17.13`, and a caret on a `0.x` version does not span a minor, so nothing ever upgraded it. The fixes believed installed and verified were never installed at all, and the earlier "installed version confirmed" check read a version string from the wrong copy.

Every gate read either the working tree or the registry. None read the copy pi actually loads — which is the only copy whose behaviour anyone experiences.

## Options considered

- **Compare version strings only** — rejected: it is the check that already lied. A hand-patched or partially installed copy reports the right version while running different code, so the test asserts the byte comparison catches what the version check does not.
- **Tell the operator to install it manually** — rejected: the gap existed precisely because installing was a step someone had to remember, and the failure was invisible.
- **Fail every release when the local dir is absent** — rejected: CI and other contributors have no pi install; that turns an environment difference into a release blocker.

## Consequences

A release now cannot print "released" while the developer's ASF is a different program. The gate also repairs the common case silently (it installs), and when it fails it names the differing files and prints the exact repair command, so "the install is stale" is actionable rather than a mystery. `BMX_SKIP_LOCAL_INSTALL=1` skips it, the same escape hatch the published-artifact gate uses.
