# ASF improvement proposals from execution-trace analysis

Status: **research only — no ASF behaviour changed.** Produced 2026-11-05.
Scripts and raw JSON: `/home/brunoj/asf-trace-research/` (`analyze-traces.mjs`,
`mine-human-turns.mjs`, `loop-forensics.mjs`, `loop-escalation.mjs`,
`measure-compliance.mjs`, `final-window.mjs`, plus `results2.json`,
`human-turns.json`, `loop-escalation.json`, `compliance.json`, `final-window.txt`).
Sources: `SOURCES.md` in the same directory.

Rule of this document, set by the requester: **no proposal without counted
evidence from the traces, and no proposal that has not been at least
perfunctorily tested against them.** Proposals that failed that bar are listed
in §5 with the number that killed them, because a rejected proposal is a
finding too.

---

## 1. Corpus and method

| | |
|---|---|
| sessions on box | 203 JSONL files, 1.5 GB (`~/.pi/agent/sessions`) |
| sessions with ASF telemetry | 13 |
| **ASF-installed window** | **2026-10-18T07:54Z → 2026-11-05** (~18 days) |
| tool calls in window | 22,547 |
| runs in window | 253 (a run = activity burst, gap ≤ 30 min) |
| human turns in window | 80 |
| machine-authored "user" turns in window | 6,977 |

The window matters. The earliest `asf-evidence` entry anywhere in the corpus is
`2026-10-18T07:54Z`, which matches the `0.13.x` publish times. Attributing the
whole corpus to ASF would have blamed ASF for behaviour that predates it — and
in one case (§5 R1) it would have produced a proposal duplicating a dependency
that already works.

Method: deterministic signals only — identical tool+args repetition, consecutive
assistant-text similarity, error/retry chains, edit-vs-validation posture,
turn authorship. No LLM judging, because step-level attribution by LLM judge
runs at ~40% accuracy on published benchmarks (SOURCES.md), so this document
reports **counted patterns and verbatim samples** and never claims precise
root-cause attribution.

---

## 2. Findings

### F1 — ASF's normative workflow has never actually run on this box

| signature | count |
|---|---|
| reads of the **installed** `SKILL.md` / `references/*` | **0** (0 of 13 sessions) |
| `/asf …` invocations by a human | **0** |
| `asf-gate-transition` / `asf-spec` / `asf-feedback` entries in 1.5 GB | **0** |
| `PLAN.md` writes in window | 4 (all in ASF's own repo) |
| `subagent` (reviewer) calls in window | 7 (feature shipped 0.14.0, one day before this study) |
| any path-touch of `skills/aia-asf` | 93 — all of them *editing* the repo copy |

Mechanism, read from the code rather than guessed: `index.ts` registers exactly
three handlers — `tool_call` (l.694), `tool_result` (l.790),
`agent_before_settle` (l.830). Nothing injects the rules at session start, and
`SKILL.md` is 25,689 bytes that the model must choose to read. So the rules
never enter context, and what ran for 18 days was the passive gate machinery
alone.

### F2 — passive telemetry is noise-scale

95,218 `gate-verdict` entries in 18 days, written at every settle with **zero**
active runs. This is the same mechanism that made the bare-`continue` bug
interrupt unrelated sessions (measured 181 s vs 3.4 s baseline); 0.14.1 scoped
the *completion gate*, but the verdict-writing path still runs unconditionally.

### F3 — one gate does 80% of the blocking, and blocks are not being learned

88 in-window blocks: `test-subset-without-impact` **71**, `destructive-git-dirty-tree` 9,
`secret-in-tracked-file` 4, `push-without-recorded-green` 4.

In the worst session that gate blocked **69 times, 64 of them repeats of the
same gate** (93% repeat rate) — the agent hit the identical wall all day. The
block text is *not* the problem: every sampled reason already carries an
`Autonomous exit:` remedy (verified verbatim in `final-window.txt`). The problem
is that nothing makes a block stick, which is consistent with F1: the agent is
being punished by rules it has never seen.

### F4 — compaction erases the rules and the work

270 compactions in window (1,130 corpus-wide; worst single session 562). After a
compaction the agent re-issues an identical call within the next 15 in **86 runs /
135 calls** — composition: `read` 84, `bmx_list_tickets` 19, `bash` 12,
`bmx_get_ticket` 8, `browser_*` 7, `get_task_specs` 1, `get_feedback_checkpoints` 1.
**Zero** of them were ASF skill files — the earlier "including `SKILL.md` itself"
line came from a looser unwindowed metric and is withdrawn. 3 identical-call loops
straddle a compaction, and pi-vigilant's LoopGuardian resets on compaction and on
model change.

### F5 — the human is 0.4% of the user-role context

In window: 6,977 machine turns at 2,762 chars average (Betamaxx ticket
injections) versus 80 human turns at 340 chars — **99.6% of user-role characters
are machine-authored**. Verbatim drift complaint from the corpus: *"it looks like
you are running some basic scripts instead of a fully fledged pi agent …, as was
my explicit instruction of how this should work"*.

### F6 — verification is NOT the weak point (and small work is)

| | |
|---|---|
| releases with a suite run in the same session | 5 / 5 |
| pushes with no suite run anywhere in the session | **1** of 117 |
| pushes with no suite run in the prior 30 min | 29 of 117 |
| human turns ever challenging verification | **1** in the whole corpus |
| test-file writes vs source-file writes | 949 vs 1,258 |
| `browser_*` calls in window | 731 |
| mutating runs with **zero** validation | **74 / 217 (34%)** — see the correction below |
| edits before first validation | median 1, p90 11, max 53 |

**Corrected on the population ASF will own** (`p6-remeasure.mjs`): of **170** runs
in window, **121** mutated source or ships-config inside a git work tree, and
**61 of those (50%) contained no validation at all — 1,400 unvalidated mutating
calls**. Docs-only mutating runs were just **3**, so the original 34% was *not*
inflated by them; the population is almost entirely real code work. Worst runs:
183 mutations with no validation (conversense), then 95 / 84 / 83 / 73 / 71 in
ASF's own repo. Counterweight that must be quoted with it: only **1 of 117 pushes**
lacked a suite run anywhere in its session — so this is long blind editing
stretches, not unverified shipping.

Big work verifies. The leak is the *small, frequent* edit that never gets a
test — 34% of mutating runs.

### F7 — loops are real but already handled in-window

In window: 66 identical-call runs ≥3 (6 ≥5), 165 wasted calls, 194 minutes inside
loops. pi-vigilant's LoopGuardian steered 7 times; 2 loops continued 6 calls
past a steer; **0 continued past a human stop**. Corpus-wide the picture is
worse (328 runs, 906 wasted calls, 99 human loop complaints — *"you are
looping"*, *"repeating the same thing for hours on end"*) but the Guardian
shipped 2026-09-12, so most of that predates it.

---

## 3. Proposals

Each carries the evidence that produced it, the test already run against the
traces, and what would falsify it. None is implemented.

### P1 — Inject an active-run card (addresses F1) — **must**

When project state has `current.phase !== "none"`, ASF appends a bounded
`custom` entry at session start and after each compaction: phase, scale, the
DoD lines still open, the next gate and its `Autonomous exit:` remedy. Roughly
1.2 KB, against a 76 KB always-read ceiling (`lib/skill-budget.mjs`).

*Tested:* trigger frequency measured — 270 compactions and 253 runs in window;
payload size bounded by the existing budget module; the 0.14.1 scoping guard
(`state.current.phase !== "none"`) already exists and is covered by
`test/test-boundary-continuation.mjs` (16 passed).
*Falsified if:* a live ASF run shows the card is ignored (agent still fails the
gate it was told about). **This uplift is currently unverified — no ASF run
exists to measure against.**

### P2 — Scope telemetry to active runs (addresses F2) — **must**

Write `gate-verdict` only when a run is active; keep a session-level `passive`
counter so "the extension is alive" stays observable without 95k rows of noise.

*Tested:* measured 95,218 verdicts in window with 0 active runs → the change
takes it to ~0; the guard pattern is already implemented and tested for the
settle path.
*Falsified if:* a gate ever needs a verdict from a passive session to justify a
block. It does not — blocks are recorded separately (`gate-block`).

### P3 — Escalate a repeated block instead of re-blocking it (addresses F3) — **should**

Same gate blocked ≥3 times in one session ⇒ stop re-issuing the same refusal:
either auto-comply with the stated `Autonomous exit:` (run the full suite) or
hard-stop and ask, and put the rule text into context as `custom_message` the
first time it fires.

*Tested:* repeat rate measured — 64 of 69 blocks in the worst session were
repeats of one gate; 71 of 88 in-window blocks were `test-subset-without-impact`.
A threshold of 3 would have escalated in 2 sessions rather than blocking 69
times.
*Falsified if:* the repeats were the agent deliberately choosing the shortcut
each time with the remedy in view. Sampled reasons show the remedy is in the
message, so the escalation must *change state* (auto-comply or stop), not just
restate.

### P4 — Re-anchor after compaction (addresses F4) — **should**

Compaction is a context event ASF can observe. On compaction: re-inject the P1
card, and re-arm obligations whose evidence lived in the summarised range.

*Tested:* 86 runs / 135 identical calls re-issued immediately post-compaction, 3
loops straddle a compaction where the loop guardian reset. The trigger fires 270
times in 18 days — it is not a corner case.
*Withdrawn from this proposal after checking:* (i) "re-reads include `SKILL.md`
itself" — measured **0** ASF-skill re-reads; (ii) "re-arm obligations" —
pi-vigilant persists obligations to disk (`lib/obligations.ts:346` reads them back),
so they already survive compaction and need no ASF help.
*Caveat that cannot be closed from traces:* a post-compaction re-read is only
*waste* if the agent had the content and forgot it did; from JSONL the two are
indistinguishable, so 135 calls is an upper bound on the saving, not an estimate
of it.
*Falsified if:* re-anchoring proves to be redundant because pi-vigilant's
summary already carries the run state (it currently does not — the summaries in
the corpus contain no phase/DoD information).

### P5 — Injection hygiene (addresses F5) — **should**

Two halves. ASF side: after N machine-authored turns without human input,
re-anchor the active spec (same mechanism as P1) so injected ticket prose cannot
quietly replace the brief. Betamaxx side: bound injection verbosity — 2.7 KB per
ticket message is the current cost of a heartbeat.

*Tested:* crowding measured at 99.6% of user-role characters; the drift
complaint is verbatim in the corpus.
*Falsified if:* re-anchoring inflates context without reducing drift — needs a
live run to measure, same caveat as P1.

### P6 — Small-edit verification nudge (addresses F6) — **nice-to-have**

A *nudge, not a gate*: after K consecutive mutating calls with no validation in
the current run, inject one line suggesting the touched tests. K = 11 (the
measured p90), so ~90% of runs are untouched by it.

*Tested:* 74 of 217 mutating runs had zero validation; median edits-before-first
validation is 1, so the healthy majority is left alone by construction at K=11.
*Falsified if:* nudges are ignored, or the 34% are legitimately non-code runs
(docs, notes, config) — **this must be re-measured split by file type before
implementation**; it is the weakest-tested proposal here.

---

## 4. Where ASF is not being run / used properly, and the mitigation

The honest answer is stronger than "sometimes skipped": in 18 days of telemetry
**ASF as a workflow was never invoked at all** (F1). The failure modes and their
mitigations:

| how ASF fails to be used | mitigation |
|---|---|
| rules never read (0 reads) — nothing forces them into context | P1 active-run card |
| no entry point anyone uses (0 `/asf` invocations) | P1 makes the active state visible; the entry point needs to be discoverable from the board, not from a 25 KB file |
| gates punish rules the agent never saw (93% repeat blocks) | P3 escalate, don't re-block |
| enforcement machinery runs on sessions it has no business judging (95k verdicts, 0 runs) | P2 scope to active runs |
| rules read once are lost to compaction (270 compactions) | P4 re-anchor |
| injected ticket text outvotes the brief 250:1 | P5 hygiene + re-anchor |
| small edits skip verification (34% of runs) | P6 bounded nudge |

---

## 5. Proposals rejected by their own test

| rejected proposal | the number that killed it |
|---|---|
| add a loop guard to ASF | F7 — pi-vigilant's LoopGuardian (since 2026-09-12) fires and holds: 7 steers, 2 loops +6 calls, 0 past a human stop. The 99 loop complaints are mostly pre-Guardian. Would duplicate a declared dependency. |
| "ASF must force more testing" | F6 — releases 5/5 verified, 1/117 pushes unverified, and exactly **1** human turn in 1.5 GB ever challenged verification. |
| move ASF state out of the installed skill dir (fear: `pi install` wipes it) | **falsified by experiment** — a marker state file survived `pi install npm:pi-aia-asf@0.14.1`. No proposal. |
| rewrite gate-block messages to carry the remedy | they already do, verbatim (`Autonomous exit:` in every sampled reason) |
| user-repetition as a quality KPI | invalid metric — 8,673 "repetitions" turned out to be Betamaxx daemon templates; after authorship filtering, 80 human turns remain |

## 6. Measurement defects found and fixed (so these numbers can be audited)

1. First validation regex matched only 5,525 of 15,209 test invocations
   (**64% missed** — custom runners like `node test-runner.js`,
   `tests/e2e/full-pipeline.test.js`), which manufactured a false "validation
   deficit". Fixed; the corrected figure is F6.
2. Tool errors were first matched to calls by timestamp, so identical-edit
   retries read 0. Matched by `toolCallId` instead → 16 retry calls, worst run 4.
3. `measure-compliance.mjs` dropped the `custom` branch, so in-window gate-blocks
   read `{}` — my bug, not the data. Measured properly in `final-window.mjs`.
4. Unwindowed counts attributed pre-install behaviour to ASF (the 99 loop
   complaints, the 328 loops). Windowing changed the conclusion, not just the
   decimals.

## 7. Limitations

Single machine, single user, 18-day window, 13 sessions. **No ASF run exists in
the corpus**, so every uplift claim in §3 is a frequency/cost argument, not an
outcome measurement — the first live `/asf` run is the real test. Classifiers
(machine-vs-human, friction) are regex-based and were validated by reading
samples, not by annotated ground truth. Session JSONL carries usage only for
some sessions, so cost is not compared here.

---

## 8. Decisions

### P1 — decided 2026-11-05, with a scope increase from the PO

Accepted as proposed (D1 `custom_message`, ≤1.5 KB, once per `session_start`
and once per `session_compact`; D2 offer line in a git repo with no state, and
never auto-open state on a non-software session; D3 the `/asf verify` trace
check runs automatically at settle for an active run, scoped to specs met in
this run; D4 card gets its own ceiling in `lib/skill-budget.mjs`).

The PO then raised it above what I proposed:

> When developing software, ASF should be active as the process and the agent
> should both be prompted to use ASF for guidance and verification AND it
> should be enforced.

So P1 is no longer "a card when a run exists". A run that only appears after a
human types `/asf …` would have appeared **0 times in the 18 measured days**
(§2 F1), which makes opt-in activation the defect, not the baseline. ASF must
**activate on software work**, prompt for guidance *and* verification, and
enforce. Two facts found while designing this, both from disk:

- ASF is used as a **toolbox, not a process**: 232 specs exist across 11
  projects (betamaxx 62, conversense 48, reddawn 45) while ASF's own state dir
  holds nothing but a test probe.
- A **correct gate that cannot fire**: `validateTrace()` (`index.ts:154`) is
  reached only through `/asf verify`, invoked 0 times. On disk, **59 of 103
  `met` specs have no trace** — 16/16 in betamaxx and 21/21 in pocketmag, where
  nobody drove `/asf verify`, against 10/11 and 7/7 where it was used.

Knobs decided: `small` keeps a **floor** (validation-ran + met-spec traces) while
plan/adversarial/browser stay reserved for `large`; continuation is **unbounded**
with **no identical steer ever issued twice** (de-duplication replaces
`MAX_CONTINUATIONS`); the three irreversibility refusals stay, and
`test-subset-without-impact` becomes **auto-comply**. Written up as
`PLAN-asf-active-process.md`, awaiting approval to implement.

The PO also fixed the stop policy: **no stops** — gates steer, the loop runs
unmolested, and a run parks only for absolutely-required user input (plan
approval, irreversible action with no safe path, an unobtainable
credential/permission, or a deliverable-shaping either/or). No cost-based stop
either; overruns are recorded, only the PO halts a run.

### P4 — decided 2026-11-05, reduced to a nice-to-have

Card re-injection on `session_compact` is already covered by P1. Two sub-claims
were withdrawn after checking (see F4): the `SKILL.md` re-read claim (measured 0)
and "re-arm obligations" (pi-vigilant already persists them to disk). What
survives is a **working-set anchor** — after a compaction the card lists the ~10
paths this run touched, plus the claimed ticket id. ~200 bytes inside a card we
inject anyway; benefit is an upper bound (135 calls / 18 days), not an estimate,
and the next trace study decides whether it was worth it.

### P3 — decided 2026-11-05, PO delegated the call

Three-step ladder for the three irreversibility refusals: refuse + remedy →
refuse + inject the rule text as `custom_message` → **park** as absolutely-required
input on the third identical fire. Justified by the measured 53% repeat rate on
those gates (9 of 17 blocks), worst case `secret-in-tracked-file` at 3 of 4.

### P6 — upgraded from nice-to-have to **should** after re-measurement

The published 34% was measured on all mutating runs. On the population
`PLAN-asf-active-process.md` will actually activate ASF for, it is **50% (61 of
121 runs, 1,400 unvalidated mutating calls)**, and docs-only runs were only 3 —
so excluding them did not soften the number, it sharpened it.

This is not absorbed by P1's settle floor: requiring validation *by settle* still
allows 183 blind edits first. So the mid-run nudge stays, as a **steer only** —
after **K = 11** (the measured p90) unvalidated source mutations in the current
run, one bounded line naming the touched files and their discoverable test
counterparts. Never a block, per the stop policy.

*Falsified if:* the blind stretches turn out to be deliberate (exploration before
a test is writable) — the traces cannot tell, and the 1 of 117 pushes figure is
the strongest argument that they partly are. The nudge is cheap precisely for
that reason.

### P5 — decided 2026-11-05, made injector-agnostic

ASF counts turns by `pi.on("input")` → `event.source` (`interactive` typed,
`rpc` API, `extension` via `sendUserMessage`) — **no per-injector patterns, no
product-specific regexes**, on the PO's instruction that Betamaxx is a separate
project and ASF must not be biased toward it. After **N = 25** machine-authored
turns since the last human turn, and at most once per 30 minutes, a run that is
active re-anchors its brief (objective + open specs).

Deliberate limitation: `input` reports only the *kind* of source, not which
extension sent it, so telemetry records aggregate injected bytes and does **not**
attribute them per injector. Attribution would require sniffing the text — which
is exactly the bias the PO ruled out. No Betamaxx ticket is raised; the measured
aggregate (≈19 MB of injected context over 18 days) stands as a general note that
extensions injecting context should keep it short.

Honesty retained: the volume is measured, the harm is **n=1** (one human turn in
1.5 GB complaining about drift), which is why the re-anchor is rare, bounded, and
only ever fires on an active run. The 99.6% figure itself is regex-classified —
session JSONL stores no provenance field — while the runtime mechanism is exact.

### P2 — decided 2026-11-05, as option (a)

Measured: **97,278 `gate-verdict` entries with 13 distinct contents** — each of
the 13 sessions wrote a byte-identical verdict at every settle (conversense
37,237, betamaxx 24,833, `distinct: 1`). Decided: write a verdict only when its
content changes (97,278 → 13), and one `passive` heartbeat per session with no
active run. `gate-block` and `suite-run` are events, not state, and stay as they
are — they are how this whole study was measured. The status board is unaffected
(it derives from claim state and `bmx_set_status`).
