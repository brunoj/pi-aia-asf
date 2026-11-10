---
id: ADR-0001
status: accepted
title: "Run completion is an agent action that asks the gate's own question"
decision: A run closes only through `closeRun`, reached either by the settle gate or by `asf_run_complete`, and both call the same `evaluateRun`. An agent-requested close on an unfinished run is refused with the gaps listed.
decided: 2026-11-10
applies_to: [lib/extension/handlers/settle.ts, lib/extension/tools/run-complete.ts]
tags: [run-lifecycle, completion-gate, settle]
from_spec: 
user_instructed: ensure you properly complete and mark as completed every run, so you judge the next run separately again
plan: 
origin: agent
source: []
supersedes: []
reopens_when: 
enforced: false
checks: [test/test-run-complete.mjs]
---

## Decision

`evaluateRun(project, state)` is the single judge of "is this run done". `judgeAndSettle` and the `asf_run_complete` tool both call it. `closeRun` is the only writer of run history and the only clearer of `current`.

## Context

Runs had no agent-callable completion. They closed only when the settle gate happened to pass, or when a human typed `/asf abort`. This project carried a single run opened three days earlier that had absorbed four releases and several unrelated changes in its `filesTouched`, so the gate was judging today's work against Monday's evidence and nothing settled. The user's instruction was to "properly complete and mark as completed every run, so you judge the next run separately again".

## Options considered

- **Let the agent close a run freely** — rejected: an exit around the completion gate, worse than the bug.
- **A second "is it done" implementation for the tool** — rejected: two judges drift, and the drift appears as a run the agent closed that the gate still counts as open.
- **Auto-close on staleness alone** — rejected as the sole mechanism: it would close runs that were merely paused mid-task and lose their steering.

## Consequences

A finished run archives to `history` and clears `current`, so the next work opens a fresh run judged on its own facts. `run-close` evidence carries `by` (`auto` from the gate, `asf_run_complete` from the agent), so a close that happened outside the gate is visible.
