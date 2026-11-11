---
id: ADR-0010
status: accepted
title: "A closed run stays closed: the close is monotonic, tombstoned by runId"
decision: "A run that has been archived stays closed: `archiveRun` tombstones the runId in `closedRuns`, `mergeMonotonic` refuses to write a tombstoned run back as `current`, and `restoreFromMirror` restores only runs that were never closed. A close is a monotonic fact, not a field that the last writer wins."
decided: 2026-11-11
applies_to: [lib/extension/state.ts#mergeMonotonic, lib/extension/state.ts#restoreFromMirror, test/test-two-writer.mjs]
tags: [run-lifecycle, state, concurrency, settle]
from_spec: spc-1794362451095-21082
user_instructed: ensure you properly complete and marknas completed every run, so you judge the next run separately again
plan: 
origin: agent
source: ["lib/extension/state.ts:mergeMonotonic", "lib/extension/state.ts:restoreFromMirror", "test/test-two-writer.mjs", ".asf/state/home-brunoj/state.json (one run archived twice, still open afterwards)"]
supersedes: []
reopens_when: "If run state moves to a store with its own concurrency control (a lock, a single writer per project, or per-session keys), the tombstone becomes redundant and this can be retired."
enforced: true
checks: [test/test-two-writer.mjs, test/test-run-complete.mjs, test/test-active-process.mjs]
---

## Decision

A close is monotonic. Once a run is archived, no write may make it `current` again —
not a stale save from another session, and not the in-process mirror.

## Context

Two pi sessions working in one project key wrote the same state file. The result, read
off disk afterwards: the same run archived to `history` twice (01:19 and 01:21) and still
present in `current`. The run had been settled, resurrected, and settled again — so the
work that followed was judged against a run the completion gate had already closed, which
is precisely what the user's standing instruction forbids ("judge the next run separately
again").

Two mechanisms caused it, and they pull in opposite directions:

- `mergeMonotonic` merged the fields the gate depends on (`steers`, `seenSteers`,
  `filesTouched`) but returned `incoming` wholesale whenever one side had no `current`.
  A session holding a copy loaded before the close wrote its stale open run straight back.
- `runMirror` exists to survive state vanishing **outside** ASF (a hand-delete, a cleared
  directory) and restores `current` whenever the file has none. It could not tell an
  external deletion from a close ASF had just performed, so it restored exactly what the
  gate had settled. That is where the live "run state cleared outside ASF; the active run
  was restored" notice came from on a run nobody had deleted.

## Options considered

- **Last-writer-wins with a warning.** Rejected: the warning arrives after the damage, and
  the run that follows is still judged against a settled run.
- **A lock or a single writer per project.** The honest fix for the whole class, but it is
  a deployment change (who owns the lock, what happens to a session that dies holding it)
  and does not help the sessions already running. Rejected as a prerequisite; noted in
  `reopens_when`.
- **Compare `updatedAt` and keep the newer `current`.** Rejected: clocks and queue order do
  not make a close lose. A close is not a value with a freshness ordering.
- **Tombstone the closed runId (chosen).** Small, local, and it distinguishes the two cases
  the mirror cannot otherwise tell apart. Keyed by `runId`, so a new run — which always
  gets a new id — is never affected.

ADR-0001 owns who may close a run and the single writer of run history (including the
tombstone write in `archiveRun`). This record governs what happens to that fact
afterwards, in the merge and in the mirror.

## Consequences

A closed run cannot come back, from either the file or the mirror, and the two-writer
interleaving is now a test (`test/test-two-writer.mjs`) rather than an incident report.
The mirror keeps its original job: a run deleted outside ASF is still restored and the
disappearance is recorded, because there is no tombstone for it.

The tombstone list is bounded (last 20 closes), on write and on merge, so a long-lived
project key cannot grow the state file through it.

This closes the loss/duplication half of the multi-writer problem. It does not make
concurrent sessions agree on a single view of an *open* run — two writers still each see
their own `filesTouched` until one saves — which is what the deferred concurrency work is
for.
