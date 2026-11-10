---
id: ADR-0004
status: accepted
title: "No scale means small, and the card prints what the gate judges by"
decision: "A run with no recorded scale is judged as `small`; the run card, `/asf status` and `/asf verify` all print the judged scale."
decided: 2026-11-10
applies_to: [lib/gates/ledger.mjs, lib/gates/settle.mjs, lib/extension/run.ts#currentScale]
tags: [scale, gates, settlement]
from_spec: 
user_instructed: "If no scale, assume small."
plan: 
origin: backfill
source: ["lib/extension/run.ts:currentScale", "lib/gates/settle.mjs:decideSettlement", "lib/gates/ledger.mjs:sessionFacts"]
supersedes: []
reopens_when: the PO asks for unscaled runs to be judged against a higher floor
enforced: true
checks: [test/test-scale-policy.mjs]
---

## Decision

`currentScale()` returns `small` for an unset scale, and `sessionFacts`/`decideSettlement` default to `small` when no scale is passed. Explicit `large` still judges major, explicit `standard` still judges standard — the default can only narrow, never widen.

## Context

PO policy, stated directly: "If no scale, assume small." Previously an unscaled run was judged **standard** unless an earlier `/asf small` in the same process had flipped a global flag. So the same run got a different verdict depending on what a previous run had done, and the run card printed "unset" while the gate demanded standard's `/asf health` and full suite. Sessions stuck that way were unreadable from the card alone.

## Options considered

- **Refuse to judge an unscaled run** — rejected: it blocks the common case, since auto-opened runs are never scaled by a human.
- **Keep the process-wide flag** — rejected: cross-run state that makes today's verdict depend on yesterday's command is the bug, not the fix. `runtime.lastScaleWasSmall` and `markSmallScale()` were deleted rather than left as decoration.

## Consequences

Card, status and verify print the scale the gate actually judges by, so an unset run reads "unset — judged small". The small floor still holds: changed source with no passing test run is still blocked.
