---
id: ADR-0008
status: accepted
title: "Parallel fan-out is chosen by a measured estimate, and the measured default is serial"
decision: "Run work packages serially unless the fan-out estimate shows the critical path shortens; a measured case where subagent dispatch did not shorten it is recorded as a refusal, not ignored."
decided: 2026-11-10
applies_to: ["lib/parallel-estimate.mjs", "skills/aia-asf/references/05-plan.md", "skills/aia-asf/references/06d-delegation.md"]
tags: [parallel, fan-out, delegation, measurement, m5]
from_spec: 
user_instructed: "estimate whether parallel fan-out is faster for PLAN-egm-adoption.md M5 using available tools, without fabricating a result"
plan: PLAN-egm-adoption.md#M5
origin: agent
source: ["PLAN-egm-adoption.md M5", "/tmp/m5/parallel", "/tmp/m5/serial"]
supersedes: []
reopens_when: a genuinely large change (multiple days of agent work) is available to measure, where each package needs its own test loop
enforced: false
checks: [test/test-parallel-switch.mjs, test/test-delegation.mjs]
---

## Decision

Parallel implementation is chosen by the estimate in `lib/parallel-estimate.mjs`, never by
enthusiasm, and the measured default is **serial**. Where fan-out was measured and did not
shorten the critical path, the refusal is recorded here rather than quietly dropped, so the
next run does not re-litigate it from nothing.

## Context and Problem Statement

M5's exit criterion is "documented measured speed-up or an explicit 'not worth it'". The
plan's own framing (line 30, quoting the source material) is that most coding tasks involve
fewer truly parallelisable tasks than research — so the burden of proof sits on fan-out, and
an unmeasured "parallel is faster" in the skill text would be a claim wearing a number's
clothes.

## Measurement

Three independent work packages (each: one new gate module plus its own test file), run as
subagents through `subagent` in parallel mode, against the same packages done serially.

| arm | result | wall clock from start |
| --- | --- | --- |
| parallel (3 subagents, own worktrees, own test loops) | 3/3 succeeded | last package landed at **+1096 s** (~18 min) |
| serial (the same three modules written directly) | 3/3 written | **0.75 s** |

**These arms are not comparable, and saying so is the finding.** The serial arm was the
assistant writing modules whose design it already held in context: no dispatch, no worktree,
no per-thread cold start, no independent test loop. The parallel arm paid subagent dispatch,
worktree creation, a cold context per thread, and a full test cycle inside each thread. The
0.75 s figure therefore does **not** prove serial is 1400× faster, and no speed-up claim for
either direction can honestly be made from it.

What the measurement does establish:

1. Fan-out has a large fixed cost per package (dispatch + cold context + its own suite run),
   so it can only pay when a package is big enough to amortise that cost.
2. For small, well-specified packages, fan-out is dramatically slower than doing the work
   directly — which is exactly the case the estimator must refuse.
3. A speed-up claim for LARGE changes remains **unmeasured**. No large change was available
   in this run; inventing one to satisfy a checkbox would have been the sloppy version of
   this ticket. `reopens_when` names what would close it.

## Options considered

- **Ship fan-out as the default for multi-package plans** — rejected: buys a 15× token bill
  with no measured shortening of the critical path, and the plan itself flags this.
- **Record a speed-up from these arms** — rejected: the arms measure different things; the
  number would be a fabrication with a table around it.
- **Record the refusal with its scope and the missing measurement named** — chosen: the
  criterion is "measured speed-up or an explicit not-worth-it", and an honest refusal that
  states what is still owed is worth more than a number that means nothing.

## Consequences

- The estimator, not the agent's mood, decides; `test-parallel-switch.mjs` and
  `test-delegation.mjs` are the teeth, and `enforced: false` says so honestly — the
  measurement itself is not gated by a test.
- A run that fans out without the estimate shortening the critical path is following a
  decision that was recorded as a refusal.
- The unmeasured large-change case is now a named open item with a re-entry condition,
  instead of a checkbox that reads as done.
