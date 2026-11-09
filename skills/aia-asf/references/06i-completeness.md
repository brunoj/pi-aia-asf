# Completeness — no stubs, no fabricated data, no invented facts

**Read when:** before writing implementation, and again before claiming done — for
every deliverable with real behaviour. **Skip when:** never. Small work needs only
the Core rule and the DoD checklist at the bottom.

Newer models can produce work that *looks* finished: a function with the right name
whose body is a placeholder, a screen populated with invented records, a report that
cites a limit nobody checked. Green tests do not disprove it — the tests were written
against the stub. This reference is the standing answer.

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
that names `lib/gates/suite-runs.mjs` or `deriveSuiteRun()` is asserting those exist. When the
code has moved and the artifact has not, the delivery report describes something that is
not there — which is the same defect as a stub, just further from the user's eye.

Before claiming done, run the drift check against **this task's own artifacts**:

```bash
node --input-type=module -e "
import {checkDrift, renderDrift} from './lib/gates/drift.mjs';
import fs from 'node:fs';
const arts = ['PLAN.md'].filter(f => fs.existsSync(f)).map(path => ({path, text: fs.readFileSync(path,'utf8')}));
console.log(renderDrift(checkDrift({artifacts: arts, repoRoot: process.cwd(), fs})));
"
```

Three things this deliberately does **not** do:

- It does not scan the whole repo's documentation. Repo-wide docs drift presumes the
  documentation exists and is maintained, and products legitimately evolve — a check that
  produces permanent noise gets switched off, which is worse than never having it.
- It does not treat "0 unresolved" as a pass on its own. `status: "no-claims"` means the
  artifact named no files or symbols at all, and that is reported as examined-nothing,
  never as clean (06b Rule 10: `scanned: 0` is never a pass).
- It does not replace the traceability matrix. Drift says the artifact still describes
  the code; the matrix says the spec was actually delivered.

## Active process (enforced by the harness)

- The first source change (edit/write, a bash write into source, or a
  `--no-extensions` worker with write tools) opens a `small` run. Docs and `/tmp`
  scratch do not.
- **Floor:** a passing test run that started after the last change (a lint is not
  a test); a spec met this run needs `trace.outcome` + `trace.codePath`.
- A gap is steered once, never twice; unclosable gaps are reported **unverified**.
  Park only for: plan approval, irreversible step, credential, deliverable choice.
- Always refused, even under `/asf passive`: secret in a tracked file, push without
  full-suite green, destructive git on a dirty tree.
- `/asf passive` = this run only. `/asf abort` ends a run; deleting state does not.

## Definition of Done — completeness

- [ ] No stub, unimplemented path, placeholder or fabricated data remains on a
      user-reachable path — or it is declared to the user with the reason.
- [ ] Every part of the ask is reachable from where the user enters it; the delivery
      report names the command / request / action that exercised each part.
- [ ] Nothing asked for was quietly moved to "later" without the user being told.
- [ ] No claim in the deliverable or the report is presented as verified when it was not.
- [ ] The task's own artifacts (PLAN.md, spec tree, design doc) still resolve against the
      code — the drift check ran and its status (`clean` / `drift` / `no-claims`) is in
      the delivery report. `no-claims` is not a tick.
