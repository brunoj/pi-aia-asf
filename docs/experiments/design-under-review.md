# Design: durable run state for ASF

## Purpose

ASF keeps per-run state (phase, scale, files touched, steers seen, evidence) so that a
session that dies mid-run can be resumed and the next run is judged separately from the
last one. State lives at `.asf/state/<project-key>/state.json`.

## Design

`state.json` holds `current` (the open run) and `history` (closed runs, newest first).

1. **Open.** When a mutation is observed and no run is open, ASF opens one: it writes
   `current` with a fresh `runId`, `phase: implementation`, `scale: small`, and the file
   that triggered it.
2. **Update.** Each observed mutation appends to `filesTouched`, refreshes
   `lastMutationAt`, and appends evidence entries (bounded to the last 200).
3. **Close.** When the completion gate reports no gaps, ASF writes `current` into
   `history` and clears `current`. The next mutation opens a new run.
4. **Resume.** A session that finds `current` on disk treats it as the open run and
   continues it. Evidence already recorded stays valid.

## Recovery

If `state.json` is unparseable, ASF writes a fresh file with `current: null` and moves the
unparseable bytes to `state.json.corrupt-<timestamp>` so the evidence is not lost. The
operator is told the path.

## Failure handling

Writes go through a single `save()` that serialises the state object and writes it in one
`writeFileSync` call. Reads go through `load()` which returns a default object when the
file is absent.

## Non-goals

- Cross-machine state (ASF is a local tool).
- A database. A JSON file is the record; it is human-readable and diffable, which is what
  makes a wrong gate decision debuggable.
