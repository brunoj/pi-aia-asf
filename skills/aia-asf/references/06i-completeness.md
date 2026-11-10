# Completeness — no stubs, no fabricated data, no invented facts

**Read when:** before writing implementation, and again before claiming done — for
every deliverable with real behaviour. **Skip when:** never. Small work needs only
the Core rule and the DoD checklist at the bottom.

Work can *look* finished: the right function name over a placeholder body, a screen of
invented records, a report citing a limit nobody checked. Green tests do not disprove
it — they were written against the stub.

## Core rule

**Ship the real thing, or say out loud what is not real.**

Complete means: the user can use what they asked for, through the entry point they
will actually use. Not: the files exist, the suite is green, the shape looks right.
There is no third option — an undeclared gap is a defect, however tidy it looks.

## Never ship silently

| Pattern | Why it is a lie |
|---|---|
| `// TODO`, `FIXME`, `not implemented`, `coming soon`, `pass`, empty handler, `throw new Error("not implemented")` on a user-reachable path | The feature is absent; the name says it is present |
| Fake / seed / demo data on a user path — hardcoded users, invented prices, lorem ipsum, `example.com`, `+1 555-…`, `dummy`/`fake`/`sample` records | The user reads invention as their own data |
| Invented facts presented as checked — API signatures, config keys, endpoints, version numbers, limits, quotas | Confidence without verification is the expensive kind of wrong |
| Silently deferred scope — "v1 covers X" when X+Y was asked | A stub with better marketing |
| Built-but-never-wired — the module exists and is tested, but nothing calls it, no route reaches it, no surface consumes it | The user cannot get to the feature at all |
| Mocks or fakes in production code paths | Test seams belong at test seams (06b) |
| A config/env value the code reads but nothing sets, or a key the code never reads | The switch does nothing |

## Legitimate exceptions — declared, never silent

1. **The user asked for it**: a scaffold, spike, stub, mock or placeholder was the
   requested deliverable. Keep it, and state in the delivery report that it is
   deliberate and what it stands in for.
2. **An approved deferral**: a scope conflict, missing credential, or external
   dependency stopped part of the work. Record it as an open item: what is missing,
   why, what remains.
3. **A fake at a test seam**: legitimate, and stays out of shipped paths.

Anything else: **finish it.** If it cannot be finished in this run, the discrepancy
goes in the final message in plain words — never discovered by the user through use.

## Prove it is real (Phase 7)

- **Exercise each part through the entry point the user will use** — the CLI command,
  the HTTP request, the UI action, the installed package — and name that action in the
  delivery report. "Implemented the export endpoint" is a claim; "`curl -s
  localhost:3000/export.csv` returned 412 rows" is evidence.
- **Data-shaped output**: show one real record end to end. If data is seeded, label it
  seeded and say where the real source plugs in.
- **Factual claims**: cite where verified (doc URL, tool output, schema, measured run)
  or mark it unverified. Never launder an assumption into a statement of fact.
- **The host audits you**: `pi-vigilant` scans the files this session changed for
  stub / fabricated-data / fact-hole markers and puts the findings in front of you at
  completion. Resolve every finding or explain it — and a clean scan is *not* proof of
  completeness: deferral and wiring remain your check, not the scanner's.

## Your own artifacts are part of the deliverable (task-scoped drift)

The plan and the spec tree are artifacts too, and they make checkable claims: a PLAN.md
naming `lib/gates/suite-runs.mjs` asserts that file exists. When the code moved and the
artifact did not, the delivery report describes something that is not there — the same
defect as a stub, further from the user's eye.

Before claiming done, run `checkDrift` from `lib/gates/drift.mjs` against **this
task's own artifacts** (PLAN.md, spec tree, design doc) and put its status in the
delivery report; the invocation is in 06f, section 5.

What the drift check deliberately does **not** do (and why a check that produces
permanent noise gets switched off) is in 06f, section 5.

## Active process (enforced by the harness)

- The first source change (edit/write, a bash write into source, or a
  `--no-extensions` worker with write tools) opens a `small` run. Docs and `/tmp`
  scratch do not.
- **Floor:** a passing test run that started after the last change (a lint is not
  a test); a spec met this run needs `trace.outcome` + `trace.codePath`.
- A **warranted** gap (one you can close) is re-raised until closed — no ceiling on
  real work. An **unwarranted** one (only a human, or a pi slash command, can close
  it) is reported **unverified** and never blocks: that was the 2026-11-07 loop.
- Always refused, even under `/asf passive`: secret in a tracked file, push without
  full-suite green, destructive git on a dirty tree.
- `/asf passive` = this run only. `/asf abort` ends a run; deleting state does not.

## Waiting is not a disposition

Four things may halt a run: plan approval, an irreversible step, a credential, a
deliverable choice. **"The other side has not replied" is not one of them.** Never
leave tracked work — a claimed ticket, an assigned issue — in an intermediate state
with an explanation of why it is stuck: that is a stop wearing a status report, and
the run may not close on it (case study in 06f).

Three dispositions, all yours to take: **park it where a reviewer sees it** (a
marker, not a question — "don't ask me" never forbids it); **take the next action you
control, now** (there is always one); or, waiting on someone else, **make the wait end
in one step** — the test that confirms the outcome, the draft mail, the check you can
run today — then keep going.

A claimed item with no disposition is a gap like any other; narrating a wait in a
progress message raises it on the spot.

## Definition of Done — completeness

- [ ] No claimed/tracked item left without a disposition: resolved, parked, or acted on.

- [ ] No stub, unimplemented path, placeholder or fabricated data remains on a
      user-reachable path — or it is declared to the user with the reason.
- [ ] Every part of the ask is reachable from where the user enters it; the delivery
      report names the command / request / action that exercised each part.
- [ ] Nothing asked for was quietly moved to "later" without the user being told.
- [ ] No claim in the deliverable or the report is presented as verified when it was not.
- [ ] The task's own artifacts (PLAN.md, spec tree, design doc) still resolve against the
      code — the drift check ran and its status (`clean` / `drift` / `no-claims`) is in
      the delivery report. `no-claims` is not a tick.
