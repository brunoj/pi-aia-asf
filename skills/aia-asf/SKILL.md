---
name: aia-asf
description: >-
  Agentic Software Factory — run a complete, disciplined software development
  cycle. Use when the user wants to start a NEW software project, add a
  SIGNIFICANT FEATURE to an existing project, perform a MAJOR BUGFIX, or do an
  ARCHITECTURAL REFACTOR — and also for SMALL software changes (small features,
  minor bugfixes, small refactors), which run AUTOMATICALLY with no intake
  questions, no PLAN.md, and no approval. LARGE work (new projects, significant
  features, major bugfixes, architectural refactors) runs the full gated flow:
  classify, ask until intent is clear, research SOTA and packages, capture hard
  specifications (via capture_spec, shared with pi-vigilant), run adversarial
  analysis, produce a PLAN.md and get explicit user approval, then implement
  test-first with strict codebase isolation and mandatory browser testing of web
  interfaces (pi-aia-browser). Do NOT activate for simple Q&A, one-line fixes,
  casual conversation, content writing, or non-software tasks. When in doubt,
  ask the user.
---

# AIA Agentic Software Factory (ASF)

You are running the **Ai Applied Agentic Software Factory**. This skill codifies the full development flow used for real projects (conversense, betamaxx, mbee.me, pi-vigilant, and others). Follow the phases strictly, in order. Every phase has an explicit gate — never skip a gate.

> **Dependencies** (verify at Phase 0, warn if missing, do not proceed without them):
> - `pi-vigilant` — provides `capture_spec`, `get_task_specs`, `update_spec_status` and final-verification. If the tools are not available, tell the user: `pi install npm:pi-vigilant` and `/reload`.
> - `pi-smart-web-search` / `pi-smart-fetch` — `web_search`, `web_fetch`, `batch_web_fetch` for research. If missing: `pi install npm:pi-smart-web-search npm:pi-smart-fetch`.
> - `pi-aia-browser` — browser automation (`browser_init`, `browser_navigate`, …) for testing web interfaces. If missing: `pi install npm:pi-aia-browser` (installs Playwright + Chromium automatically).

---

## Phase 0 — Classify the work (gate)

Determine the work type **and scale**. If it is not ASF work, **do not run the factory** — just help normally.

| Work type | ASF? | Scale | Flow |
|---|---|---|---|
| New software project | ✅ | **large** | full flow |
| Significant feature | ✅ | **large** | full flow (research: medium) |
| Small feature | ✅ | **small** | automatic |
| Major bugfix (multi-file, behavior change, needs tests) | ✅ | **large** | lighter flow (research optional) |
| Minor bugfix (one area, no contract change) | ✅ | **small** | automatic |
| Architectural refactor | ✅ | **large** | full flow (research: low) |
| Small refactor (renames, restructure of one module) | ✅ | **small** | automatic |
| Simple Q&A, one-liner fix, casual talk, docs-only | ❌ | — | — |
| Non-software tasks (LinkedIn, research-only, writing) | ❌ | — | — |

**Scale rule — the core behavior difference:**

- **Large work** runs the full gated flow: intake questions → research → specs → adversarial → PLAN.md → **explicit approval** → implementation → verification.
- **Small work runs automatically**: no intake question barrage (at most ONE clarifying question, only if truly ambiguous), no research, no PLAN.md, no approval gate. State the intent in one or two sentences, capture specs, implement test-first, verify, deliver. Do not ask permission to start; do not stop for sign-off. If it turns out to be larger than expected mid-way, re-classify, say so, and switch to the full flow with approval.
- When in doubt about scale, **default to small and start working** — the user prefers action over questions. Re-classify upward if the work grows.

If the user's request is ambiguous, **ask** before starting. State the classification explicitly:
`ASF: <new-project|feature|major-bugfix|refactor> <large|small> — starting Phase 1 (intake).`

---

## Phase 1 — Intake: ask until it's clear (gate)

> **Scale check — applies to LARGE work only.** For **small** work: skip the question bank. If the request is clear enough to act, state your understanding in one or two sentences and proceed immediately. Ask at most ONE clarifying question, and only when genuinely ambiguous.

The factory **keeps asking until all is clear**. Never start planning or implementation on guesses.

Minimum intake checklist (ask anything not yet known, one question at a time or a short batch):

- **Goal** — what exactly is being built/changed? (one sentence)
- **Context** — existing system? which repo? what's there today?
- **Users / audience** — who uses this, and how?
- **Success criteria** — how will we know it's done and correct? (be concrete)
- **Constraints** — musts, must-nots, boundaries, budget, timeline
- **Preferences** — stack, language, platform, style (only if the user has them)
- **Definition of done** — tests? deploy? release? docs?
- **External planning docs** — are there IMPROVEMENT-PLAN.md / PLAN.md / requirements docs / delivery logs / ticket lists? Locate them (repo root, `docs/`, referenced by the user); they are inputs to spec capture, not ground truth.

For each answer, **capture hard requirements immediately with `capture_spec`** (requirement, area, priority). Specs are the shared contract with pi-vigilant — it will re-verify them at the end.

**Gate 1** (large only): You may only leave intake when the user has confirmed the summary of intent (restate it back in 3–5 bullet points and ask "is this correct?"). Small work does not pass through this gate.

---

## Phase 2 — Research: SOTA and packages (adaptive depth)

> **Small work skips research entirely.** If implementation needs a library you don't know, a single quick search is enough — no research summary, no Gate 2.

| Work type | Research depth |
|---|---|
| New project | **Mandatory, full** — SOTA approaches, frameworks, existing packages, reference implementations |
| Significant feature | **Mandatory, medium** — existing packages/libraries, similar features in the wild |
| Major bugfix | **Optional** — only if the fix changes scope or needs new tech |
| Refactor | **Low** — best practices for the target architecture |

Research method (use `web_search` + `web_fetch`/`batch_web_fetch`):
1. Search for the topic + "best practices" / "comparison" / "2026"
2. Search for existing npm/pip packages: `npm search <topic>` or web search
3. Fetch the 2–3 most relevant results and extract concrete facts
4. **Cite sources** in the research summary — every claim about a package/library gets a URL
5. Summarize findings + a **recommendation** (which approach, which packages, with rationale)

**Gate 2** (large only): present the research summary + recommendation to the user. Ask: "proceed with this approach, or adjust?" Do not enter planning until the approach is agreed.

---

## Phase 3 — Specifications (gate)

Turn the intake answers + research into the authoritative spec set.

1. Run `get_task_specs` to see what's already captured.
2. Fill gaps: for every requirement the user stated or approved, ensure a spec exists (`capture_spec`).
3. **Ingest external planning docs (M6):** every actionable item in an external planning doc (IMPROVEMENT-PLAN.md, PLAN.md, requirements docs, delivery logs, ticket lists) becomes a captured spec with `sourceQuote` pointing at the doc + item id. The doc's own ✅/delivered markers are **claims, not evidence** — each item gets traced and verified like any other spec.
4. Decompose broad specs with `parentId` (e.g. "must be secure" → auth + encryption sub-specs).
5. Default priority is `must`; use `should` only when the user says "nice to have".
6. Areas: functionality, ui-ux, performance, security, error-handling, testing, documentation, compatibility, constraints, format, data, deployment, other.

**Gate 3** (large only): show the full spec tree (`get_task_specs`) and get user sign-off: "specs correct — proceed to adversarial analysis?" Small work: capture specs silently, no sign-off needed.

---

## Phase 4 — Adversarial analysis (gate)

> **Small work:** skip the formal gate. Do a quick mental pass over edge cases and failure modes while implementing; if something real surfaces, fix it or capture a spec. No user checkpoint.

> **Large work:** read `references/04-adversarial.md` for the full checklist
> (per-spec, architecture, security, code-quality, traceability lenses). For
> security, also read `references/06h-security.md` — write the one-page threat
> model (trust boundaries + STRIDE + registry) as part of the plan. For
> stability, ask the `references/06f-stability.md` questions about every
> external call in the design.

Challenge the plan like a hostile reviewer before committing to it. For each spec and the overall design, ask and resolve:

- **Edge cases** — empty input, zero users, max load, missing data, concurrency
- **Failure modes** — what breaks, and how do we detect/recover?
- **Security** — auth, injection, data exposure, abuse
- **Maintainability** — will this be understandable in 6 months? who maintains it?
- **Dependencies** — are they maintained? license? size? alternatives?
- **Scope** — is anything here actually unnecessary? (cut it)
- **Feasibility** — is the SOTA research consistent with the specs?

For each finding: either capture a new spec, refine an existing one (supersede), or record the decision to accept the risk. **Ask the user about anything that changes scope.**

**Then have it reviewed by agents that were not in this conversation** (large work).
The checklist above, asked by the agent that wrote the plan, is a checklist — familiarity
is what hides blind spots. Spawn the six lenses from `agents/` against the **artifact
file** plus the source it references (never the transcript), merge with `asf-synthesizer`,
and treat a reviewer whose citations do not resolve as `not run` rather than clean. Full
mechanics, budget and the A/B rule: `references/04-adversarial.md`.

**Gate 4** (large only): the findings and resolutions go in a file
(`review-report.md`); chat carries the path, the Blocker/Major/Nit counts and the
reviewer status table — not the report body. Get the user's confirmation on what remains.

**Artifacts, not walls of text (all gates).** Plans, spec trees and review reports are
written to files and named by path; the chat shows the path and the counts. A large
document pasted into chat is paid on every turn afterwards, and it cannot be handed to a
fresh-context reviewer anyway — only a file can.

---

## Phase 5 — Plan + approval gate

> **Small work: SKIP this phase entirely.** No PLAN.md, no approval — go straight to Phase 6 (implementation).

Write `PLAN.md` in the project root (repo root, or cwd if no repo). **Present it as an
artifact**: write the file, tell the user the path and the open decisions; do not paste the
plan into chat for approval — the reviewer lenses of Phase 4 read that same file, and a
copy in the transcript is paid for twice. Structure:

```markdown
# <Project> — Plan

## Goal
## Context
## Approach (from research, cited)
## Decisions (ADRs — one per significant decision)
## Quality requirements (ISO 25010 scenarios)
## Architecture / Design
## Architecture evaluation (ATAM-lite)
## Views (context / runtime / deployment — optional)
## Milestones (M1..Mn with exit criteria)
## Task list (per milestone, checkboxes)
## Dependencies (with licenses)
## Risks & mitigations (from adversarial analysis)
## Definition of done (tests, deploy, release)
```

The full template with examples is in `references/05-plan.md` — read it before
writing the plan.

Keep the plan **implementation-ready**: any competent engineer (or agent) can execute the task list without re-deriving decisions.

**Gate 5 — MANDATORY user approval (large only)**: present the plan and ask explicitly:
> "Plan ready. Do you approve starting implementation? (yes / changes needed)"

**Never start implementing before Gate 5 passes — for LARGE work.** If the user says "go" without reading, still show the plan and confirm. Small work never reaches this gate.

---

## Phase 6 — Implementation (test-first, disciplined)

> **Mandatory reads before writing code** — each is the standard, this list is only the
> routing: `references/06b-testing-qa.md` (the QA standard: test the shipped artifact,
> assert the observable end state, probe for silent failures, read the actual error,
> verify clean-room, regression-test every fix) · `references/06c-code-quality.md`
> (small modules, SSOT, no hardcoding, testable outside the host — **Documents are code
> too** per Rule 9: when a document outgrows editability, split it and keep the parent
> as index) · `references/06i-completeness.md`: **Read `references/06i-completeness.md`
> before implementing** and again before claiming done — ship the real thing or say what
> is not real · `references/06d-delegation.md` (before delegating).
>
> **Read on demand (only if they apply):** `06f-stability.md` external calls · `06g-test-design.md` non-trivial
> tests · `06h-security.md` untrusted input, secrets, agent-like tool surfaces ·
> `06k-performance.md` the spec contains a number, or the change adds a query, loop,
> job, cache or endpoint.

Execute the task list milestone by milestone. Discipline rules — the wording here is
the gate condition; the standard lives in the reference named on each line:

1. **Test-first** — tests before or with the code, run them, commit only green; every fixed bug gets a regression test that fails on the old code; conditional behaviour tests triggers **and non-triggers** (06b Rules 6, 7).
2. **Codebase isolation** — only this project's files, unless the user explicitly says otherwise; if a change would touch another repo, stop and ask.
3. **No scope creep** — a new discovery that changes specs gets captured, asked about, and the plan updated *before* implementing.
4. **Descriptive commits** — `type: what and why`. No vague messages, no placeholders.
5. **Browser testing is mandatory for every interface the change TOUCHES, in the build** — the trigger is *can this change reach a rendered surface*, not whether the project has a UI; exercise it through `pi-aia-browser` before committing that change, and report page + action + assertion, or `n/a` with a reason; if the browser tool is unavailable, **say so rather than letting it read as passed** (06b Rule 9).
6. **Bounded waits — ALWAYS (06b Rule 15)** — every call that waits on the system gets an explicit hard timeout sized to a stated expected duration; absolute ceiling 30 min (1800s), waivable only for a **single run** stated beforehand with a reason, and the waiver **does not persist** — it resets immediately after that run; hitting the ceiling is a bug signal to diagnose, not patience. A 50,000-second hang is a failure to investigate.
7. **Let pi-vigilant do its job** — when it asks for `update_spec_status` with evidence, provide it.
8. **CHANGELOG discipline** — every user-visible change gets an entry saying what changed; no placeholder text.
9. **Challenge approved designs (M4)** — a literal reading that creates product tension is resolved with the user *before* implementing, never implemented blindly and called delivered.
10. **Trace before claiming delivered (M5)** — the delivery log is a claim, the code is the evidence: trace the code path, confirm a surface consumes its output, confirm the operator-facing test passes.
11. **No stubs, no fake data, no invented facts** — finish it or state the discrepancy plainly (06i).
12. **The model is asserted, not assumed** for any change that WRITES to a store — the trigger is what the change writes, not where the diff lives; declare ownership per relationship and test the **non-effect** (seed the referencing rows, assert the tables the change does not name are unchanged). A green suite is not evidence here. Capture the obligations as MUST specs so the completion guard verifies them (06b Rule 20, 06j, 06g §3).

---

## Phase 7 — Verification & delivery (gate)

Every DoD below must hold; each line is the gate condition, the checklist lives in the
reference named on it:

- **QA DoD** (06b Rule 10) — all boxes, including the evidence and gate lines from
  `/asf gates` (P42/P45). **`scanned: 0` is never a pass**: a check that examined
  nothing is reported as examined-nothing, and a gap stays a gap instead of a tick.
- **Modularity DoD** (06c) — no duplicated shared logic, no hardcoded config, every
  module tested standalone with the calls it gets in the host, architecture writeup
  exists, existing functionality still green. **Documents too (06c Rule 9)**: no document
  so large that editing it is fragile — if one you worked on started causing edit
  failures or truncation, it was split by topic with the parent kept as index.
- **stability DoD** (06f) — external calls have timeouts and bounded retries, idempotent only.
- **security DoD** (06h) — no secrets in the repo, no unvalidated input reaching a
  shell/query/path, no unbounded resource use on user input; every agent-like tool
  least-privilege with an abuse-case test.
- **Completeness DoD** (06i) — no stub, placeholder or fabricated data on a
  user-reachable path unless declared; every part of the ask reachable from where the
  user enters it, with the exercising command named; nothing quietly moved to later.
- **Performance DoD** (06k) — every numeric claim carries its measurement contract
  (percentile, load, samples, environment, lab-or-field); a bare `p95 < 2s` is
  **reported as an incomplete claim, not accepted**; the CI-cheap tier ran per commit,
  the scheduled tier before release, and a run that did not happen is listed as not run.
- **Model DoD** (06j) — when the change writes to a store: written ownership
  declaration per relationship, invariant and non-effect tests green, `/asf health'
  model level passing or its findings accepted with a reason.
- **Traceability (M1, large work)** — `/asf verify` validates the spec-to-code matrix:
  every `met` spec carries outcome → codePath → testFile + assertion, the file exists,
  the assertion appears in it. FAIL rows block delivery. Ingested specs from external
  planning docs are verified the same way — a ✅ in someone else's doc is a claim.
- **Independent reviewer gate (large work, P19)** — run the zero-context review of Phase 4
  against the finished change, not just the plan; triage autonomously and escalate only
  genuine conflicts. A reviewer whose report does not resolve is `not run`
  (`references/06d-delegation.md` Part 3).
- **Code Health Gate (large work, Gate 8)** — `/asf health` (06e); on by default;
  **fix the cause, not the threshold** (06e Rule 2). Small work shows it, never blocks.

1. Run the **full** test suite, not a subset; fix and re-run until green.
2. **Verify the artifact a user would actually get** — inspect the packaged file list (`npm pack` → `tar tzf`), load it clean-room with caches cleared, confirm the installed version is the one just built, and confirm the observable end state. Any web surface goes through `pi-aia-browser`.
3. `get_task_specs`, then verify **every spec** with `update_spec_status` + concrete evidence. Unverifiable → `partial` + ask. Never self-certify.
4. **Report honestly** — never claim a check you did not run; say what was skipped or inconclusive; distinguish "tests pass" from "works for the user".
5. **Release** — **check the release policy**: read `.asf-release.json` if present (07-release.md); if it authorizes publishing for the current state, drive the release per `how`, otherwise offer it and get explicit approval. **Always test on publish / in production if applicable** — verify the shipped artifact from the registry, never assume.
6. Present the completion summary: what was built, specs met, tests passing, how to use it.

---

## Anti-patterns — the floor

These are the ones that have shipped real defects. The complete list (45 entries) is in
`references/06m-antipatterns.md` — read it before implementing and before claiming
done; a pattern is never dropped here, only detailed there.
- ❌ Starting implementation without Gate 5 approval
- ❌ Verifying a UI only via API/curl — browser testing is mandatory (06b Rule 9)
- ❌ Reporting "browser tested" without the page, action and assertion; a missing browser tool must be said out loud, never read as passed (06b Rule 9)
- ❌ A green suite that never populated the table the change destroys (06j, 06g §3)
- ❌ Reporting a clean model scan as a passed check when the scan looked at nothing (06j §5)
- ❌ Shipping a gate with only a fire fixture — a near-miss must prove it can tell the difference (06b Rule 23)
- ❌ Relaxing a failing near-miss test to make the suite pass — that is a bug in the gate (06b Rule 23)
- ❌ Accepting a reviewer report whose cited files and lines do not resolve — that is fabricated compliance, record it as `not run` (06d)
- ❌ Claiming something was verified when it was assumed
- ❌ Treating "no error" as "it worked" — malformed config is skipped **silently**
- ❌ Publishing without testing the shipped artifact on publish / in production (if applicable)
- ❌ Declaring done while specs are still `open`
- ❌ Running parallel subagents that touch the same file — edits are silently lost (06d)

## Reference index (read on demand — never load all)

Each reference is a small, single-concern doc. **Read only the ones your
current phase needs** — the "Read when" column is the index. Small work
reads at most 06b + 06c; large work reads the ones its phase calls for.

| File | Covers | Read when |
|---|---|---|
| `01-intake.md` | question bank, probing, external planning docs (M6) | Phase 1 (large) |
| `02-research.md` | research playbook, search templates | Phase 2 (large) |
| `04-adversarial.md` | adversarial checklist (spec/architecture/data-model/security lenses) | Phase 4 (large) |
| `05-plan.md` | PLAN.md template + ADRs + quality scenarios + ATAM-lite + views + ownership table | Phase 5 (large) |
| `06-implementation.md` | coding discipline, M4/M5, drift self-correction (P20) | Phase 6 |
| `06b-testing-qa.md` | **mandatory** testing & QA standard (23 rules + DoD, incl. the measurement contract, performance placement and the gate rules) | before writing tests (always) |
| `06b-appendix.md` | the long-form procedures behind 06b Rules 9, 15, 19 (browser verification, bounded waits, inner-loop selection, enforcement classes) | applying those rules, not reading them |
| `06m-antipatterns.md` | the complete forbidden list (45 entries) behind the floor in SKILL.md | before implementing and before claiming done |
| `06c-code-quality.md` | **mandatory** modularity standard (9 rules, deep modules, smells) | before structuring code |
| `06d-delegation.md` | intercom & subagents + independent reviewer gate (P19) | before delegating; Phase 7 review (large) |
| `06e-code-health.md` | Code Health Gate (+ depth, supply-chain, secrets, model metrics) | Gate 8 (large) |
| `06f-stability.md` | stability patterns + error handling + observability (P06/P07/P08) | **if the deliverable makes external calls or is a service** |
| `06g-test-design.md` | risk-based test derivation + determinism + invariant/non-effect tests (P27) | Phase 6 large (test plan) / non-trivial tests |
| `06h-security.md` | threat model, ASVS DoD, supply chain, agent tools | Phase 4/5 large; small = one line |
| `06i-completeness.md` | **mandatory** no stubs / no fabricated data / no invented facts + completeness DoD | before implementing and before claiming done (always) |
| `06j-data-model.md` | **mandatory when the work writes to a store** — ownership classes, model rules M1-M8, legitimate exceptions, invariant/non-effect tests + model DoD | before implementing any store write, and before claiming done |
| `06k-performance.md` | **the measurement contract (Rule 21), CI-cheap vs scheduled placement (Rule 22), load scenarios, gate rules (Rule 23)** — one abuse-case run shared with 06h | any numeric claim in the spec, any new query/endpoint/loop/job; Phase 7 large |
| `07-release.md` | release workflow + **configurable release policy** (`.asf-release.json`: when/how) + test-on-publish | before publishing |

## ASF self-modification policy (P22)

The ASF's own rules, gates, and standards are **normative content** — they
must never be self-modified during a task run (no "while I'm here, let me
improve the rule").

- **Facts may be updated in the same change**: package versions, external
  tool behavior, SOTA findings, URLs — these are non-normative and stay
  current.
- **Standards change only through the review process**: propose it in
  `docs/research/improvement-proposals.md`, review it, get approval, then
  implement (the same flow that produced this version).
- **Escalate, don't edit**: if a task reveals the ASF's own rules are wrong
  or missing, that is a proposal + a user decision, not a silent edit.
- **Rule 9 applies to the ASF too**: if SKILL.md or a reference outgrows
  editability, split it by topic and keep the parent as an index — via the
  review process.
