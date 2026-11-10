---
id: ADR-0003
status: accepted
title: "Gate-demanded evidence must be producible, defined in exactly one place"
decision: "Every evidence kind a gate REQUIRES must have a producer in the installed package, and that invariant is defined once in `lib/gates/evidence-coverage.mjs`."
decided: 2026-11-10
applies_to: [lib/gates/evidence-coverage.mjs, lib/extension/tools/evidence-check.ts, scripts/verify-published.mjs]
tags: [gates, evidence, release]
from_spec: 
user_instructed: 
plan: 
origin: backfill
source: ["lib/gates/evidence-coverage.mjs", "lib/extension/tools/evidence-check.ts", "scripts/verify-published.mjs"]
supersedes: []
reopens_when: a new gate requires an evidence kind before a producer exists for it
enforced: true
checks: [test/test-evidence-kinds.mjs]
---

## Decision

`lib/gates/evidence-coverage.mjs` is the single definition of the invariant. The repo test, the `asf_evidence_check` tool and `scripts/verify-published.mjs` all consume it, and the release script imports it **from the installed copy**, not from the working tree.

## Context

A gate can steer a run at evidence the installed package cannot produce. That is an uncloseable loop: no amount of effort clears it, and the agent keeps being steered at a gap it did not create. It happened with `perf-scenario`, required by a gate that nothing could satisfy; the kind was dropped rather than left as a permanent trap.

## Options considered

- **Assert coverage in the repo test only** — rejected: the repo is not what users install, and `test/` does not ship.
- **Duplicate the assertion in the release script** — rejected: two definitions drift, and the drift appears as a green release that cannot produce its own evidence.
- **Ship the release harness too** — rejected: installing from the registry into a throwaway prefix is a release-time act; a package cannot do that to itself.

## Consequences

Any check added to `scripts/verify-published.mjs` must delegate to shipped code, or it is a check only a releaser can run — the script's header says so. `asf_evidence_check` lets a user reproduce the assertion at any time from their own install.
