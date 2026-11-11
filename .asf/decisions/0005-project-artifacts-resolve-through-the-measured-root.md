---
id: ADR-0005
status: accepted
title: "Everything that belongs to the CODE resolves through the measured root, not the session workspace"
decision: "Anything that measures, judges or reads an artifact of the code under work resolves through `measureRoot()`/`measureRootSync()` (git root of the most recently touched file, contained in the workspace): health, the decision register, a spec trace's `testFile`, the project config, Gate 5's PLAN.md and the config screen. Run state stays at `runRoot()`."
decided: 2026-11-10
applies_to: [lib/extension/run.ts#measureRoot, lib/extension/run.ts#measureRootSync, lib/extension/tools/health.ts, lib/extension/tools/decisions.ts, lib/extension/specs.ts#validateTrace, lib/extension/channel.ts#configFor, lib/extension/commands/session.ts#runApprove, lib/extension/commands/inspect.ts#cmdConfig, lib/extension/handlers/tool-call.ts#registerToolCallHandler]
tags: [measurement, workspace, gates]
from_spec: 
user_instructed: 
plan: 
origin: backfill
source: ["lib/extension/run.ts:measureRoot", "lib/extension/tools/health.ts", "lib/extension/tools/decisions.ts", "lib/extension/specs.ts:validateTrace", "lib/extension/commands/session.ts:runApprove"]
supersedes: []
reopens_when: a run legitimately spans two repositories that must be measured together
enforced: true
checks: [test/test-measure-root.mjs, test/test-trace-gate.mjs]
---

## Decision

Anything that MEASURES, JUDGES or READS an artifact of the code resolves through the measured root — the git root of the most recently touched file, constrained to a root that contains the session workspace. That is health, the decision register, a spec trace's `testFile`, the project's `.asf/config.json`, Gate 5's `PLAN.md` and the config screen. Anything that LOCATES state keeps `runRoot()`. The two roots answer different questions and must never be conflated.

## Context

All of these used the session workspace, and the family was found one symptom at a time. A session started in a parent repository (a home directory that is itself a checkout is the common case) had every gate measure that parent: `asf_health` reported 363 findings from an unrelated project checked out under `$HOME`, and every measurement tool then timed out scanning a tree nobody was working in. A gate that measures the wrong directory is worse than no gate — it blocks on findings in code the run must not touch, or waves through the one project that is actually unhealthy. The same bug put the decision register's ADRs one level above the code they described, and — the instance that finally named the family — resolved a spec's `testFile` against the workspace, so the completion gate answered "testFile not found" to a trace that was complete and re-raised the same gap forever, however many times the agent added the trace. The project config and Gate 5 read the parent's config and refused a `PLAN.md` that existed in the project.

## Options considered

- **Ask the user which project** — rejected: the run already knows what it changed.
- **Use the touched file's root unconditionally** — rejected: a stray path in `/tmp` would drag the measurement to someone's scratch directory, hence the containment guard.
- **Move state with the measurement root** — rejected: a root that moved mid-run would orphan the run's own ledger.

## Consequences

Health, verify/inspect, the decision register, a trace's `testFile`, the project config, Gate 5's plan and the config screen follow the code; run state does not move. `test-measure-root.mjs` pins both guards — the nested checkout and the touched path outside the workspace — and now pins the config/PLAN/screen consumers too; `test-trace-gate.mjs` pins the trace consumer, with the wrong-root case as a first-class check. Nothing may add a new project-artifact read on `runRoot()`; if it needs a root, it asks which of the two it means.
