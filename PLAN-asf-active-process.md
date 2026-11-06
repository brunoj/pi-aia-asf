# PLAN — ASF as an active process (P1)

Status: **awaiting approval.** No normative file touched yet.
Evidence base: `RESEARCH-trace-improvements.md` §2 F1–F3, §5, §8.
Classification: **LARGE** — this changes ASF's own rules, so it runs under P22
with approval gates. Target release: `0.15.0`.

## Why

In 18 days of telemetry with ASF installed, ASF's process **never ran**: 0 reads
of the installed skill, 0 `/asf` invocations, 0 phase transitions, while 22,547
tool calls went by. The enforcement that exists is unreachable — `validateTrace()`
(`index.ts:154`) is only reachable through `/asf verify`, and on disk **59 of 103
`met` specs carry no trace** (16/16 in betamaxx, 21/21 in pocketmag, where nobody
drove the command; against 10/11 and 7/7 where it was used).

Opt-in activation is therefore the defect, not the baseline.

## Requirements (PO, verbatim intent)

1. When developing software, ASF is active as the process — automatically.
2. The agent is prompted to use ASF for guidance **and** verification.
3. It is enforced.
4. **No stops.** The loop runs unmolested unless there is absolutely-required
   user input.
5. The irreversibility floor stays (confirmed explicitly).

## Design

### 1. Activation — automatic, on software work

In the existing `tool_call` hook (`index.ts:694`), when the project has no active
run: a mutating call (`edit`/`write`) against source or ships-config
(`.ts .js .mjs .cjs .py .go .rs .java .kt .c .h .cpp .rb .php .swift .sql .vue
.svelte`, `package.json`, `pyproject.toml`, `Dockerfile`, `*.tf`) inside a **git
work tree**, at the **2nd** such call in the session, opens a run at scale
`small` with `auto: true`, `trigger: "software-work"`.

Does **not** activate: docs/markup/assets-only edits, non-git directories,
generated paths, `node_modules`, browsing/research/ticket work. ASF stays a
stranger to sessions that are not software work.

### 2. Guidance — the active-run card

`custom_message`, **≤1.5 KB**, at auto-open, at `session_start`, and at
`session_compact`, only while a run is active. Contents: phase, scale, the open
DoD lines, **the next single step**, and that step's `Autonomous exit:` remedy.
Ceiling registered in `lib/skill-budget.mjs` so it cannot creep.

### 3. Steering to the end of the loop — no stops

`lib/gates/settle.mjs` today caps at `MAX_CONTINUATIONS = 2` then declines to ask
again. Under this plan the cap is replaced by **de-duplication**:

- continuation budget: **unbounded**
- **an identical steer is never issued twice** — if a continuation produced zero
  state change, the ask changes (next open DoD item / next gate remedy)
- if nothing can progress without a human ⇒ that is the park case, and it is one
  of the four absolutely-required inputs below
- unclosable gaps are written into the delivery report as **unverified** (the
  existing `exhausted` path) — reported, never a stop
- no cost-based stop; overruns are recorded in telemetry, only the PO halts a run

Every continuation still honours the pi 1.5.0 boundary contract: `entries`
carrying a `custom_message` **plus** `continue: true` — a bare `continue` is
invalid (the 0.14.1 bug, `test/test-boundary-continuation.mjs`).

### 4. Absolutely-required user input — the only park reasons

1. plan approval (Gate 5, `large` only)
2. an irreversible action with no safe path
3. a credential/permission it cannot obtain
4. a deliverable-shaping either/or that cannot be inferred from the artifacts

Anything else: continue.

### 5. Enforcement floor at settle (auto-run)

1. source mutated ⇒ a validation must have run in the session
2. specs met **in this run** ⇒ complete `trace.outcome` + `trace.codePath`
   (automatic, no longer waiting for a human to type `/asf verify`)
3. push/publish ⇒ recorded full-suite green — **unchanged**
4. `large` ⇒ the existing gates (plan approval, adversarial, browser QA) unchanged

### 6. Gate disposition

| gate | today | under this plan |
|---|---|---|
| `test-subset-without-impact` (71) | blocks | **auto-comply**: run the full suite, loop continues |
| `destructive-git-dirty-tree` (9) | blocks | **stays** — refuses the action, not the loop |
| `secret-in-tracked-file` (4) | blocks | **stays** |
| `push-without-recorded-green` (4) | blocks | **stays** |

### 7. Escape hatch

`/asf abort` (exists) and `/asf passive` (new, per-session) for detector false
positives. Passive means no card, no steering, no verdicts — but the three
irreversibility refusals remain, because they are not process gates.

## Files to touch

`index.ts` (detector, card, `/asf passive`, settle wiring) ·
`lib/gates/settle.mjs` (de-duplication instead of cap; park taxonomy) ·
`lib/gates/` (`test-subset` → auto-comply) · `lib/skill-budget.mjs` (card
ceiling) · `skills/aia-asf/SKILL.md` + `references/06d-delegation.md`,
`06i-completeness.md` (normative text) · tests below.

## Acceptance criteria

| # | check | test |
|---|---|---|
| A1 | 2nd source edit in a git repo opens a run with `auto: true` | `test/test-auto-activation.mjs` |
| A2 | docs-only / non-git / `node_modules` never activate | same |
| A3 | card ≤1.5 KB, injected at open + `session_start` + `session_compact`, never twice identically | `test/test-run-card.mjs` |
| A4 | no continuation is ever bare — pi's `canContinue` oracle | `test/test-boundary-continuation.mjs` (extend) |
| A5 | identical steer never repeated; state change refreshes the budget; zero-progress changes the ask | `test/test-steer-no-stop.mjs` |
| A6 | settle blocks only on the four floor items; everything else steers or reports unverified | `test/test-settle-floor.mjs` |
| A7 | met specs from this run without traces block settle; specs from earlier runs do not | same |
| A8 | `/asf passive` silences card+steering+verdicts but keeps the three refusals | `test/test-passive.mjs` |
| A9 | negative control: removing the floor makes A6 fail; the floor never moves, the suite does | `test/test-settle-floor.mjs` |
| A10 | published artifact installs and the extension loads (release gate) | `scripts/verify-published.mjs` |

## What must not weaken

Negative controls, clean-room published-artifact verification, the registry-landed
poll, ownership-proof process cleanup, and the four release gates. The three
irreversibility refusals are part of the floor and are asserted by A9.

## Honest gaps

- The detector is a heuristic. `auto: true` + `trigger` are recorded so the next
  trace study can measure its false-positive rate — **this plan ships unmeasured
  on that axis** and A2 is the only pre-implementation defence.
- "Guidance is followed" is still unverified: no ASF run exists in the corpus to
  measure uplift against. A1–A9 prove the machinery; the first live run is the
  test of whether the agent obeys the card.
- Unbounded continuation removes the only accidental brake on a confused agent.
  The de-duplication rule (A5) is the substitute, and it is the item most likely
  to be wrong in practice.

## As built (0.15.0) — deviations from this plan, decided during implementation

- **Activation on the FIRST source mutation, not the 2nd, and in non-git
  directories too.** "At all times" cannot be met by a threshold: a one-edit
  change is still a change. Non-git directories
  are keyed by absolute path, so they get a run too. Docs/assets/`node_modules`/
  loose `/tmp` scratch still never activate (A2).
- **Bash writes count.** Heredocs, `sed -i`, scripted `open(...,'w')`, redirects,
  `tee`, `patch`, and `pi -p --no-extensions` workers with write tools are source
  mutations of the run (the bypass audit's loose count was 194 — an upper bound).
- **Project key is the git root**, not the cwd basename (subdir `cd` lost the run;
  shared basenames shared a run). Specs are still read under pi-vigilant's key.
- **Validation means a passing test that started after the last change.**
- **De-duplication has a reporting ceiling** (`MAX_STEERS = 12`): beyond it gaps
  are reported, not asked — the work is never halted.
- **State deletion is not a way to end a run** (in-process mirror + restore).
- **Tests:** A1–A9 live in `test/test-active-process.mjs`, `test/test-gates.mjs`
  and `test/test-boundary-continuation.mjs` rather than the per-item file names
  above. The card ceiling is registered as `RUN_CARD_BYTES` in
  `lib/skill-budget.mjs` and asserted equal to the renderer's.
