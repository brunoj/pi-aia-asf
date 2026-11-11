# Experiment: can ASF's review find an unstated assumption?

**Plan item:** `PLAN-egm-adoption.md` M2 — *"a design with a planted unstated assumption →
at least one reviewer reports it"*, exit criterion *"planted assumption found in ≥ 2 of 3
runs"*.

**Date:** 2026-11-10 · **Version under test:** `pi-aia-asf@0.19.0` + working tree

## Method

One design artifact — kept in this folder as [`design-under-review.md`](design-under-review.md) — describing ASF's own run-state store in
prose. It is deliberately a *plausible, weaker* version of the real system, with **one
load-bearing assumption never stated**:

> that only one pi session writes a project's state at a time

The design says writes go through "a single `save()`" — which reads as safe and is not:
the real serialisation is per-process, so two sessions on one project clobber each other's
open run. Nothing in the artifact mentions concurrency, and the reviewers were not told to
look for anything.

Three independent reviewer sessions (`subagent`, `reviewer` agent, host model, fresh
context each), identical neutral brief:

> Review the software design document at `/tmp/asf-exp/design.md`. Read the file yourself.
> Report findings, each with severity (Blocker | Major | Nit), scope (file:lines), the
> finding, and a recommendation. If you find nothing wrong, state explicitly what you
> examined and why you concluded it is sound.

## Result — 2 of 3 found it

| run | named the unstated single-writer assumption? | what it said |
| --- | --- | --- |
| 1 | **yes** | *"multi-process is unaddressed… `runMirror` and `saveQueue` are module-level Maps, so serialization is per-process only… Two sessions on one project clobber each other's open run; the rename is atomic, the read-modify-write is not. §Non-goals excludes cross-machine but is silent on two sessions on one machine"* |
| 2 | **yes** | flagged the multi-writer case as unaddressed, then found the concrete mechanism: `mergeMonotonic` returns `incoming` when either side has no `current`, so *"a writer that clears the run always wins on write"* — and the contradiction that `loadState` treats `current: null` as suspicious while `saveState` treats it as authoritative |
| 3 | no | reviewed the changed code instead of the artifact and never reached the concurrency question |

**≥ 2 of 3 → the M2 exit criterion is met.**

## What the run also exposed (the honest part)

1. **The artifact is not a sufficient review surface on its own.** Runs 2 and 3 spent much
   of their effort on the repository rather than the document, because ASF's own run state
   steered them (they received *"the run state for this project was cleared on disk outside
   ASF"* and chased it). Artifact-first is the rule; this run shows a reviewer will still
   wander into the live tree unless the brief fences it. Run 3 never reviewed the design at
   all — which is exactly why the criterion is 2-of-3 and not 3-of-3.
2. **The hazard is real, observed, and unfixed.** During the experiment the parent session
   received the *"run state cleared on disk outside ASF; the active run was restored"* steer
   — the multi-writer condition run 1 described, live. `runMirror`/`saveQueue` are
   per-process and `mergeMonotonic` short-circuits on a null `current`. **Open item**, not
   fixed here: it needs its own run with a test that drives two writers, not a patch slipped
   into a release run.
3. **The review found eight real defects in code written hours earlier**, all reproduced and
   fixed in this run before release: `coverage()` ignored the register's own glob matcher
   (so `src/**` covered `srcfoo/`), the directory cap was applied before the skip filter,
   symlinks were followed out of the root, a configured `decisions.dir` was offered back as
   a foreign ADR (and its whole parent tree was skipped), the inventory cap evicted the
   highest-value evidence, commit subjects were used as citation values, and the steer told
   the agent to copy-paste a provenance path. Each now has a test and a mutation.
4. **One reviewer refused to run the suite on a read-only mandate** and said so with the
   exact commands instead of pretending. That is the correct behaviour for a reviewer, and
   the reason "did you run the tests" is a gate on the *implementation* session, not on the
   review.

## Reproduce

```bash
# three fresh reviewer contexts, same neutral brief, one artifact
cd /home/brunoj/pi-aia-asf
pi -p "Review the software design document at $PWD/docs/experiments/design-under-review.md.\
Read the file yourself. Report findings with severity, scope (file:lines), the finding,\
and a recommendation. If you find nothing wrong, state what you examined and why it is sound."
```

## Verdict

M2's accuracy criterion is met on its own terms (2 of 3), with the failure mode recorded
rather than smoothed over: one reviewer never engaged the artifact, and the artifact alone
did not keep the other two out of the live tree.
