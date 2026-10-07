# Testing & QA Standard (MANDATORY)

These rules are distilled from real failures in production sessions (pi-vigilant,
pi-aia-asf, pi-aia-browser, conversense, betamaxx). Each rule exists because
skipping it **shipped a broken artifact**. They are not optional.

> **Test design:** for *which* tests to write (risk-based derivation) and how
> to keep them reliable (determinism), see `references/06g-test-design.md` —
> read it in Phase 6 large work or when the logic under test is non-trivial.

---

## Rule 1 — Test the ARTIFACT you ship, not the source you wrote

Source passing ≠ shipped thing working. The packaging layer is a real failure surface.

> **Real failure:** `pi-aia-browser` 0.1.0. All source tests passed. But `package.json`
> declared `"postinstall": "node scripts/install-browser.mjs"` while the `files`
> allowlist omitted `scripts/`. The published tarball had no such file → every
> `npm install` aborted with `MODULE_NOT_FOUND`. The package was **100% broken for
> every user** while every source test was green.

Required before declaring a package done:

```bash
npm pack                       # or the equivalent build
tar tzf <pkg>-<ver>.tgz        # inspect the ACTUAL file list
```

- Verify every file the manifest/scripts reference is present in the list.
- Extract to a clean temp dir and load/run it from there.
- For anything installable: install it **from the registry/tarball**, not the repo.

## Rule 2 — Assert the OBSERVABLE END STATE, not intermediate artifacts

"Files are in the right place" and "config is correct" do not prove the feature works.

> **Real failure:** the `aia-asf` skill. Files shipped correctly, `pi.skills` manifest
> correct, description under the length limit — all intermediate checks passed. But the
> YAML description contained an unquoted colon (`The flow is: classify...`), so the
> frontmatter failed to parse and pi **silently skipped the skill**. It was invisible to
> the agent even with an explicit `--skill` path.

Ask: *what would the user observe?* Then assert exactly that.

| Weak (intermediate) | Strong (observable) |
|---|---|
| SKILL.md exists, manifest lists it | Agent reports the skill as available |
| Extension file present | Tool appears in the tool list and executes |
| Server process running | Real request returns correct response |
| Config contains the key | Behavior driven by the key actually changes |

## Rule 3 — Probe for SILENT failures

The worst bugs raise no error. Loaders skip malformed input; caches serve stale data.

- After any config/manifest/frontmatter change, **verify it parsed** (parse it yourself).
- Never treat "no error" as "it worked" — demand positive confirmation.
- Validate machine-read files with a real parser, not by eyeballing:

```bash
python3 -c "import yaml,sys; yaml.safe_load(open(sys.argv[1]).read())" file.yaml
node -e "JSON.parse(require('fs').readFileSync('f.json','utf8'))"
```

## Rule 4 — Read the ACTUAL error before changing anything

> **Real failure:** on the `MODULE_NOT_FOUND` install error the first fix was a *guess*
> at the `files` array. It happened to be right, but the reinstall still failed and the
> real signal — `Cannot find module '.../scripts/install-browser.mjs'` plus a stale npm
> cache — was sitting in the log the whole time.

1. Find and read the real error (log file, stderr, exit code).
2. State the root cause in one sentence.
3. Only then edit.

Never fix by pattern-matching on symptoms. Never retry unchanged and hope.

## Rule 5 — Clean-room verification (defeat caches and local state)

Your machine lies: caches, stale installs, leftover globals, symlinks.

```bash
npm cache clean --force
cd $(mktemp -d) && npm install <pkg>@<version>   # fresh dir, explicit version
```

- Verify the **installed version** is the one you just published.
- Remove/disable old copies first — a stale duplicate can serve your test and fake a pass.
- Confirm *which* copy answered (distinct log path, version string, marker).

> **Real failure:** a stale npm cache kept serving the broken 0.1.0 after 0.1.1 was
> published; the install kept failing with an error already fixed.

## Rule 6 — Every fixed bug gets a REGRESSION test

A bug fixed without a test will return. For each fix, add an assertion that fails on
the old code and passes on the new one, and keep it in the permanent suite.

## Rule 7 — Test triggers AND non-triggers

For anything conditional (skills, auto-activation, gates, hooks), correctness is
two-sided. Half a test suite hides half the bugs.

- **Triggers**: every case that must activate, activates.
- **Non-triggers**: every case that must NOT activate, stays silent (Q&A, one-liners,
  casual talk, unrelated domains).
- **Boundaries**: the ambiguous cases — assert it asks rather than guesses.

## Rule 8 — Test state machines for deadlock and bad transitions

> **Real failure:** pi-vigilant gated a write on "all specs resolved", but the cooldown
> suppressed that very write → permanent deadlock. Found only by simulating the full
> multi-turn sequence.

- Drive the real sequence of transitions, not one isolated call.
- Check terminal states are reachable, and no state can block its own exit.
- Test repeat/idempotent invocations and out-of-order calls.

## Rule 9 — Browser testing is mandatory for any web surface

API/curl checks do not replicate what a human sees. Via `pi-aia-browser`:

1. `browser_init`, `browser_navigate` to the running app
2. Walk each key user journey with real clicks/typing
3. Assert rendered DOM content (`browser_dom`), not just HTTP 200
4. Check console errors via `browser_js`
5. `browser_screenshot` for the record; check mobile + desktop viewports

A 200 response with a blank or broken page is a **failure**.

**Silent async paths are the priority.** Fire-and-forget enrichment (an async
budgeted analysis that fills in a card title after render) fails silently — the
page renders, nobody notices the enrichment never landed. For any async/silent
surface: ingest through the real flow, then **wait for the enrichment to appear**
and assert it (e.g. ingest a report, wait for `agent_title` on the card). If it
never arrives, the wiring is dead — that is a failed test.

## Rule 10 — Definition of done (all must hold)

- [ ] Typecheck/build passes
- [ ] Full test suite green (not a subset) — **the gate never moves: this checkbox always means a full run, even when Rule 19 permitted subset runs earlier in the loop that led here**
- [ ] Regression test added for every bug fixed this cycle
- [ ] Triggers **and** non-triggers tested for conditional behavior
- [ ] Shipped artifact inspected (`npm pack` file list) and installed clean-room
- [ ] Observable end state verified as a user would experience it
- [ ] Web surfaces exercised through a real browser
- [ ] Every MUST spec `met` with concrete evidence (`update_spec_status`)
- [ ] **Spec-to-code traceability: every `met` spec carries `trace` (outcome → codePath → testFile + assertion); `/asf verify` mechanically validates it (large work)**
- [ ] **Code Health Gate passed (or `enabled: false` / `gate.mode: warn` with the report shown)**
- [ ] **Consumed by a surface: every delivered feature's output is visible in the product (UI or API) — nothing ships as dead machinery**
- [ ] **E2E behavioral test: every feature spec has a test through the real entry point asserting the operator-facing outcome**
- [ ] Unverifiable specs → `partial` + asked the user (never self-certified)
- [ ] **Every long-running command ran under an explicit timeout with a stated expected duration (no unbounded waits)**
- [ ] **No wait exceeded the 30 min (1800s) absolute ceiling — or it was explicitly waived for that single run, with a reason and a finite bound**
- [ ] **Delivery report complete (P14): every spec with status + evidence, every test run with result, every skipped/inconclusive check listed with reason, and the not-tested register (what was deliberately not tested and why)**
- [ ] **Stability line (06f): if the deliverable makes external calls, it has timeouts and bounded retries (idempotent only)**
- [ ] **Security line (06h): no secrets in the repo; no untrusted input reaches a shell/query/path unvalidated; no unbounded resource use on user-controlled input**

## Rule 11 — Report honestly

- Never claim a test passed that you did not run.
- Never say "verified" for something inferred or assumed.
- If a check was skipped or inconclusive, **say so explicitly** and say why.
- Distinguish "tests pass" from "feature works for the user" — Rule 2.
- If you discover you shipped something broken, say it plainly and fix it first.

## Rule 12 — Test the OPERATOR-FACING OUTCOME, not the machinery

> **Real failure (betamaxx audit):** `intelligence-budget.test.ts` and
> `service-session.test.ts` passed — they proved `analyze()` *works in
> isolation*. Nobody tested "does ingest actually call `analyze()`?". The tests
> proved the machinery, not the wiring. `intelligenceBudget.analyze()` shipped
> as **dead code** while every unit test was green.

Unit tests prove a component works in isolation. They do **not** prove the
feature is wired. For every feature spec, the deciding test is the one that
asserts the **operator-facing outcome** end-to-end:

- ❌ "`analyze()` returns a budget verdict" (machinery)
- ✅ "an ingested report eventually has an `agent_title` rendered on the card" (outcome)

If a unit test is green but the outcome test is missing, the feature is **not**
done — the wiring may be dead.

## Rule 13 — Nothing is delivered until CONSUMED BY A SURFACE

> **Real failure (betamaxx audit):** code commented *"Not yet consumed by a
> surface"* shipped as "delivered". Machinery (budget, runner, verdict
> contract) was built; the product behavior (cards titled by the agent) never
> happened.

- **Delivered = the output is visible in the product** (UI or API).
- Code commented "not yet consumed by a surface" is, by definition, **not
  delivered**.
- Before marking a spec `met`, answer: *where does a user/operator see this?*
  If nowhere — it is not done.

## Rule 14 — Every feature spec ships an E2E behavioral test through the REAL entry point

- The E2E test drives the **real entry point** (HTTP endpoint, CLI, UI) with a
  mocked boundary (agent, DB), and asserts the operator-facing outcome.
- This catches dead wiring in one test: ingest → `analyze()` → persist → render.
- **Scale note:** mandatory for feature specs in **large/gated work**. For small
  work, required only when the change touches a surface/wiring; otherwise the
  standard test-first rules above suffice.

## Rule 15 — Bound every long-running operation: state the expected duration, then enforce it

> **Real failure (user report):** package installs / platform startups / test
> harnesses hung for up to **50,000 seconds** while the agent waited, doing
> nothing. An unbounded wait is not patience — it is a silent stall.

- **State the expected duration before running.** "This install should take
  ~2 min", "first platform startup ~10 min", "suite ~3 min". The expectation is
  part of the command, not an afterthought.
- **ALWAYS wrap it in a hard timeout** — `timeout 300 …` for shell commands, an
  explicit `timeout` parameter for tool calls. Never run unbounded.
- **Exceeding the bound is a bug signal, not a slow command.** Kill it and
  diagnose immediately: what is it blocking on (network, lock, hung process,
  missing dependency, waiting for input)? Fix the root cause.
- **If the bound proves too short, raise it deliberately** — state the new
  expectation and the reason ("first-time platform startup needs 10 min;
  bound raised to 900s"). Never silently extend, never remove the bound.
- **A hang that outlives its expected duration is a failure to investigate,**
  not a wait to endure. If you cannot verify something within a bounded time,
  say so explicitly (Rule 11) instead of waiting indefinitely.

### Every waiting call carries its own explicit timeout

This applies to **every tool call or command that waits on the system** — not
just the obviously slow ones. Testing is where this bites hardest: a test
harness, dev server, daemon, browser launch, or watcher can block forever on a
port, a lock, a prompt, or a process that never exits.

- Shell: `timeout <seconds> <command>` — always.
- Tool calls: pass the tool's explicit `timeout` parameter — always.
- Pick the bound from the **stated expected duration**, with headroom. A test
  suite you expect to take 30s gets ~120s, not 3000s.
- "I'll just run it and see" is the failure mode this rule exists to prevent.

### The absolute ceiling — 30 minutes, no exceptions unless explicitly waived

> **Real failure (user report):** tool calls waited forever for the system to
> react and the whole process kept hanging — especially during testing.

**No single wait may exceed 30 minutes (1800s).** This is a hard ceiling, not a
default and not a target:

- **It is a backstop, not a substitute for a per-call bound.** The ceiling never
  replaces the real timeout: a 30s suite still gets a ~120s bound. If your only
  bound is 1800s, you have not bounded anything — you have deferred the hang.
- **Never exceed it.** If a command genuinely needs longer, that is a signal to
  restructure it (run it in the background and poll with bounded checks, split
  it into stages, or reduce the work) — not to raise the number.
- **When the ceiling is hit, kill the wait and diagnose.** Hitting 30 minutes is
  a bug signal and a failure to investigate: find what it is blocking on
  (network, lock, hung process, missing dependency, waiting on stdin) and fix
  the root cause. Never re-run the same unbounded wait hoping for a different
  result.

**Explicit per-run waiver.** The ceiling can be disabled, but only deliberately
and only for a **single run**:

- The agent must **state it explicitly before running** — what is being run, why
  it legitimately needs more than 30 minutes, and the new bound. For example:
  *"Waiving the 30-min ceiling for this one run: full integration suite against
  a cold container build, expected ~45 min, bound 3600s."*
- A waiver covers **that one run only**. It **does not persist**, does not carry
  over to the next command, and **resets immediately afterwards** — the next
  wait is bounded by 30 minutes again.
- A waiver still requires a **finite bound**. Waiving the ceiling means choosing
  a larger explicit number, never running unbounded.
- Blanket or standing waivers are not allowed. If waivers are needed repeatedly,
  that is a defect in the setup — report it (Rule 11) instead of normalizing it.

**Applies at both scales.** Small work is not exempt: a hang wastes the same
time regardless of how the task was classified.

## Rule 16 — Determinism: a flaky test is a defect

A test that fails intermittently is a **defect in the test**, not bad luck.

- Never "re-run into green" — that is hiding a broken test (Rule 11).
- Fix it immediately (inject the clock, seed randomness, own the data, poll
  instead of sleep, no order dependence, no real network in unit tests) — the
  full rules are in `references/06g-test-design.md`.
- If a test cannot be made deterministic, **delete it and say so** in the
  delivery report (Rule 11) — a flaky test is worse than no test because it
  erodes trust in the whole suite.

## Rule 17 — Delivery report (P14): the fields that make it verifiable

The completion summary is not a narrative — it is a **report with fields** a
reviewer can check:

- **Specs:** each spec → status (`met`/`partial`/`not-met`) → evidence
  (test name + output, build result, code inspection).
- **Tests:** each suite → command → result (pass/fail/skip) → count. State
  which suites you ran and which you did not.
- **Skipped/inconclusive:** every check not run or inconclusive, with the
  reason (Rule 11).
- **Not-tested register:** what was deliberately not tested and why (e.g.
  "payment webhook: no sandbox credentials — covered by contract test only").
  An honest register beats a silent gap.
- **Artifact:** what was shipped (version, file list) and how it was verified
  clean-room (Rule 5).

## Rule 18 — Escaped-defect feedback loop (P21)

When a defect escapes to the user (a bug report, a failed integration, a
production incident), the fix is not the end — the **loop** is:

1. Fix it (with a regression test, Rule 6).
2. **Ask: which gate should have caught this?** Answer honestly — the
   missing test technique (06g), the missing check (06b Rule 10), the
   missing adversarial question (04-adversarial), the missing stability
   pattern (06f), the missing security check (06h).
3. **Close the gap** — add the check/rule/test so the same class of defect
   cannot escape again. If the gap is in the ASF itself, that is a proposal
   (docs/research/improvement-proposals.md), not a silent edit (P22).
4. Record the loop in the delivery report (Rule 17) — what escaped, what
   caught it, what changed.

> **Real failure:** a package shipped with a broken `files` allowlist; the
> fix landed but the *gap* ("no test inspects the packaged artifact") was not
> closed until Rule 1 was added. The loop is what prevents the next one.

## Rule 19 — Test selection for the inner loop (P25; the DoD gate never moves)

Rule 10's full-suite checkbox is a **gate**, not a loop constraint. The gate
never relaxes. What this rule relaxes is the **intermediate** runs inside one
change's own red-green-refactor cycle (06-implementation "Test-first" steps
1-3) — the runs that happen *before* the commit-gate run, on code you are
still editing.

**The rule, in the user's own words: run a partial (impact-area) subset only
when certain that this is warranted; if not certain, or if the blast radius
might be greater than the impact area, always run full. Default is full.**

- **Burden of proof is on the subset, not on the full run.** Silence,
  uncertainty, or "probably fine" all mean full. A subset run requires an
  affirmative, checkable case.
- **A subset run requires a stated impact statement** in the transcript,
  before the run: the changed files, the tests selected because of them, and
  *why nothing else can be reached*. A file list alone is not an impact
  statement — restating the diff is not an argument for why the blast radius
  stops there. No statement, or a statement that does not argue the
  boundary → **not certain → full.**
- **Certainty is impossible by definition (no judgment call — always full)**
  when the changed footprint includes any of:
  - shared/global state, a singleton, a cache, env/config, a feature flag
  - `package.json`, the lockfile, or any dependency
  - build, test, lint, or CI config, or the test harness itself
  - a DB schema, a migration, or a shared fixture
  - a public API/contract, CLI args, or a wire/shared type
  - a cross-module refactor, a rename, a file move, or a deletion
  - **any changed file with no entry in the project's test-impact map** — a
    project that has not built a map always runs full; the relaxation only
    ever applies where the mapping is known, never where it is guessed.
- **The ~90s-and-under guard**: if the full suite's own measured runtime is
  small enough that an assessment costs more than just running it, skip the
  assessment and run full — state the measured number once rather than
  re-litigating it every iteration.
- **Reporting stays honest (Rule 11/17) no matter which path was taken.** A
  subset run is reported as a subset run — "ran N/M suites (impact-area: X);
  full suite not run this iteration" — never as "suite green". The Rule 10
  checkbox is only ever satisfied by an actual full run, shown in this cycle,
  regardless of how many subset runs preceded it.
- **Never an escape from a failing test.** Selection decides *which* suites
  run; it never decides whether a failing test counts. A failing test is
  fixed or deleted (Rule 16), never excluded from the run that would have
  caught it.
- **If a defect escapes that a full run would have caught**, that is Rule 18:
  the fix must say so, and the certainty bar for that class of change tightens
  (added to the "certainty is impossible" list above if it recurs).

This does not change Rule 10, Rule 11, or the commit-gate workflow: a project
that commits after every green run already runs full before every commit, so
Rule 19 only ever saves the intermediate runs inside a single change — it
never reduces what runs before anything is committed.
