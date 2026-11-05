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

270 compactions in window (1,130 corpus-wide; worst single session 562). In 47
runs the agent re-read the identical file within 15 calls *after* a compaction —
including `SKILL.md` itself. 3 identical-call loops straddle a compaction, and
pi-vigilant's LoopGuardian resets on compaction and on model change.

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
| mutating runs with **zero** validation | **74 / 217 (34%)** |
| edits before first validation | median 1, p90 11, max 53 |

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

*Tested:* 47 runs re-read an identical file immediately post-compaction
(including `SKILL.md`), 3 loops straddle a compaction where the loop guardian
reset. The trigger fires 270 times in 18 days — it is not a corner case.
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
