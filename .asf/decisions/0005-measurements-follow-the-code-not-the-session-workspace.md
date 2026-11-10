---
id: ADR-0005
status: accepted
title: "Measurements follow the code the run is changing, not the session workspace"
decision: "Measurements and the decision register resolve through `measureRoot()` (git root of the most recently touched file, contained in the workspace); run state stays at `runRoot()`."
decided: 2026-11-10
applies_to: [lib/extension/run.ts#measureRoot, lib/extension/tools/health.ts, lib/extension/tools/decisions.ts]
tags: [measurement, workspace, gates]
from_spec: 
user_instructed: 
plan: 
origin: backfill
source: ["lib/extension/run.ts:measureRoot", "lib/extension/tools/health.ts", "lib/extension/tools/decisions.ts"]
supersedes: []
reopens_when: a run legitimately spans two repositories that must be measured together
enforced: true
checks: [test/test-measure-root.mjs]
---

## Decision

Anything that MEASURES or produces knowledge about the code resolves through `measureRoot()` — the git root of the most recently touched file, constrained to a root that contains the session workspace. Anything that LOCATES state keeps `runRoot()`.

## Context

Both used the session workspace. A session started in a parent repository (a home directory that is itself a checkout is the common case) had every gate measure that parent: `asf_health` reported 363 findings from an unrelated project checked out under `$HOME`, and every measurement tool then timed out scanning a tree nobody was working in. A gate that measures the wrong directory is worse than no gate — it blocks on findings in code the run must not touch, or waves through the one project that is actually unhealthy. The same bug put the decision register's ADRs one level above the code they described.

## Options considered

- **Ask the user which project** — rejected: the run already knows what it changed.
- **Use the touched file's root unconditionally** — rejected: a stray path in `/tmp` would drag the measurement to someone's scratch directory, hence the containment guard.
- **Move state with the measurement root** — rejected: a root that moved mid-run would orphan the run's own ledger.

## Consequences

Health, verify/inspect and the decision register follow the code; run state does not move. `test-measure-root.mjs` pins both guards — the nested checkout and the touched path outside the workspace.
