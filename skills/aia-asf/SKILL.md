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

**Gate 4** (large only): summarize adversarial findings + resolutions, get user confirmation.

---

## Phase 5 — Plan + approval gate

> **Small work: SKIP this phase entirely.** No PLAN.md, no approval — go straight to Phase 6 (implementation).

Write `PLAN.md` in the project root (repo root, or cwd if no repo). Structure:

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

> **Read `references/06b-testing-qa.md` before writing tests.** It is the mandatory QA
> standard, distilled from real shipped-broken failures. Non-negotiable highlights:
> **test the shipped artifact, not just the source** (inspect `npm pack` output);
> **assert the observable end state**, not intermediate files; **probe for silent
> failures** (a malformed manifest/frontmatter is skipped without any error);
> **read the actual error before editing**; **verify clean-room** (caches serve stale
> builds); **add a regression test for every bug fixed**.

> **Read `references/06c-code-quality.md` before structuring code.** It is the mandatory
> modularity & maintainability standard: small well-readable modules plugged in where
> needed; **one implementation for shared functionality** (single escalation path,
> SSOT); no hardcoding (config-driven); **testable outside the host then integrated
> verbatim** (same modules in tests and production); refactor what is too complex to
> understand; layered with clear boundaries and an architecture writeup; full I/O debug
> logging with replay; nothing breaks existing functionality. **Documents are code too
> (Rule 9): when a document outgrows editability (failing edits, truncation, multi-topic
> bloat), split it by topic and keep the parent as an index — never let it grow until
> editing breaks.**

> **Read `references/06i-completeness.md` before implementing, and again before claiming
> done.** Ship the real thing or say out loud what is not real: no `// TODO` /
> not-implemented paths on a user-reachable code path, no fake or seed data the user will
> read as their own, no invented facts presented as checked, no silently deferred scope,
> no built-but-never-wired module. A stub is legitimate only when the user asked for one
> — and then it is declared, never silent.

> **Read `references/06d-delegation.md` before delegating.** Work may be delegated two ways:
> **intercom** (message another live pi session that owns relevant context — always `list`
> first, say what you want back, and treat their findings as evidence, not proof; **optional** —
> only when the user has installed `pi-intercom`, ASF works without it), and
> **subagents** (spawn an isolated `pi -p` process when the OUTCOME matters more than the
> trace — scoped codebase research, independent parallel fixes, fresh-perspective review).
> Two verified hard limits: **never run parallel subagents against the same file** — tested,
> 4 concurrent writers left only 1 of 4 edits, silently, all exiting 0 — and **exit code 0
> does not mean success**, so always validate the returned output against what you asked for.

> **Read on demand (only if they apply):** `references/06f-stability.md` if the
> deliverable makes external calls; `references/06g-test-design.md` for the
> test plan or non-trivial tests; `references/06h-security.md` if the
> deliverable handles untrusted input, secrets, or agent-like tool surfaces.

Execute the task list milestone by milestone. Discipline rules:

1. **Test-first**: write/update tests before or with implementation; run them; only commit green.
   Every bug fixed gets a **regression test** that fails on the old code. For conditional
   behavior (skills, gates, auto-activation) test **triggers AND non-triggers**.
2. **Codebase isolation**: work strictly inside the project's own codebase. Do NOT edit files in other repos, global config, or unrelated directories — **unless the user explicitly instructs otherwise**. If a change would touch another codebase, stop and ask.
3. **No scope creep**: if something new is discovered that changes specs, capture it, ask the user, and update the plan before implementing.
4. **Descriptive commits**: `git commit -m "type: specific description of what and why"` (e.g. `fix: verify specs before rotation`). No vague messages, no placeholders.
5. **Browser testing — MANDATORY for any web interface**: if the deliverable has a UI/website/web app, test it through `pi-aia-browser` (`browser_init`, `browser_navigate`, `browser_click`, `browser_type`, `browser_screenshot`, `browser_dom`, …) to replicate the user's real experience — not just curl/API checks. Verify: loads, key user journeys, responsive behavior, console errors. **Silent async paths included**: ingest through the real flow and wait for the enrichment to land (06b Rule 9).
6. **Bounded waits — ALWAYS (06b Rule 15)**: **every** tool call or command that waits on the system gets an explicit, reasonable **hard timeout** (`timeout N …` or the tool's `timeout` parameter) — never run unbounded. State the expected duration first and size the bound to it with headroom (a 30s suite gets ~120s, not 3000s). This matters most **during testing**, where harnesses, servers, daemons and browsers hang on ports, locks and prompts. **Absolute ceiling: no single wait may exceed 30 min (1800s).** The ceiling is a backstop, never a substitute for the real per-call bound. When it is hit: kill the wait and diagnose what it is blocking on — that is a bug signal, not patience. The ceiling may be **waived only for a single run**, stated explicitly beforehand with a reason and a finite larger bound; the waiver **does not persist** and resets immediately after that run. A 50,000-second hang is a failure to investigate.
7. **Let pi-vigilant do its job**: it will auto-continue after premature stops and verify specs at settle. When it asks for `update_spec_status` with evidence, do it.
8. **CHANGELOG discipline**: every user-visible change gets a CHANGELOG entry describing exactly what changed (no placeholder text).
9. **Challenge approved designs (M4)**: if a spec's literal reading creates product tension (e.g. feedback clusters under "Plan" when "Plan = plans"), stop and resolve it with the user before implementing — never implement blindly and call it delivered.
10. **Trace before claiming delivered (M5)**: the delivery log is a claim; the code is the evidence. Before marking anything ✅, trace the actual code path, confirm the output is consumed by a surface, and confirm the operator-facing outcome test passes.
11. **No stubs, no fake data, no invented facts (`references/06i-completeness.md`)**: the deliverable is the real implementation. Finish it, or state the discrepancy plainly to the user — what is missing, why, what remains. Never let the user discover the gap by using the product.

---

## Phase 7 — Verification & delivery (gate)

Run the **Definition of Done checklist** in `references/06b-testing-qa.md` (Rule 10). Every box must hold.

Also check the **modularity DoD** from `references/06c-code-quality.md` (Phase 7 section): no duplicated shared logic, no hardcoded config values, every module tested standalone with the same calls it gets in the host, architecture writeup exists, existing functionality still green. **Documents too (06c Rule 9)**: no document so large that editing it is fragile — if a doc you worked on started causing edit failures/truncation, it was refactored (split by topic, parent kept as index, cross-references updated).

Also check the **stability DoD** (`references/06f-stability.md`): if the deliverable makes external calls, it has timeouts and bounded retries (idempotent only). And the **security DoD** (`references/06h-security.md`): no secrets in the repo, no untrusted input reaches a shell/query/path unvalidated, no unbounded resource use on user-controlled input; for agent-like tool surfaces, every tool is least-privilege with an abuse-case test.

Also check the **completeness DoD** (`references/06i-completeness.md`): no stub, placeholder, unimplemented path or fabricated data left on a user-reachable path (or declared to the user with the reason); every part of the ask reachable from where the user enters it, with the exercising command/request/action named in the delivery report; nothing asked for quietly moved to "later"; no claim presented as verified when it was not. `pi-vigilant` scans the changed files for these markers at completion — resolve every finding or explain it; a clean scan is not proof of completeness.

**Large work:** run `/asf verify` — it mechanically validates the **spec-to-code traceability matrix** (M1): every `met` spec must carry `trace` (outcome → codePath → testFile + assertion), testFile must exist, assertion must appear in it. FAIL rows block delivery. **Verify ingested specs from external planning docs too** — the doc's ✅ markers are claims, not evidence.

**Independent reviewer gate (large work, P19):** before delivery, run the
independent review (fresh-context hostile reviewer, blockers vs suggestions;
see `references/06d-delegation.md` Part 3). Triage autonomously — fix safe
blockers, apply safe suggestions, escalate to the user **only** on genuine
conflicts (conflicting requirements, product-level tradeoffs, scope
conflicts). Record the review + triage in the delivery report.

**Code Health Gate (large work, Gate 8):** run `/asf health` — it measures convolution objectively at function / module / architecture level (see `references/06e-code-health.md`) and fails the gate when thresholds are crossed. The gate is **on by default** with conservative thresholds; configure via `.asf-code-health.json` at the project root. **Fix the cause, not the threshold** (06e Rule 2). Small work shows the report but never blocks.

1. Run the full test suite (all of it, not a subset); fix failures; re-run until green.
2. **Verify the artifact a user would actually get**: inspect the packaged file list
   (`npm pack` → `tar tzf`), install/load it clean-room in a fresh dir with caches
   cleared, confirm the installed version is the one just built, and confirm the
   **observable end state** (the tool/skill/page actually appears and works) — not just
   that files are in place. Any web surface must be exercised through `pi-aia-browser`.
3. Run `get_task_specs` and verify **every spec** with `update_spec_status` + concrete evidence (test output, build result, code inspection). Unverifiable → `partial` + ask the user. Never self-certify.
4. **Report honestly**: never claim a check you didn't run; state explicitly anything
   skipped or inconclusive, and distinguish "tests pass" from "works for the user".
5. If the project is a library/package that the user publishes (npm, GitHub release): **check the release policy** — read `.asf-release.json` at the project root if present (see `references/07-release.md`). It defines **when** (user-stated conditional rules: "when X is true, publish automatically; when Y is true, do this…") and **how** (instructions the ASF drives with judgment — credentials, git sync, publish steps). If the policy authorizes automatic publishing for the current state, drive the release per `how`; otherwise **offer** to run the release and get explicit approval (the default stance: publishing is the user's decision). **Always test on publish / in production, if applicable** — verify the shipped artifact from the registry / smoke-test prod, never assume it works. Optionally offer to set up a CI/CD pipeline for publishing.
6. Present a completion summary: what was built, specs met, tests passing, how to use it.

---

## Anti-patterns

- ❌ Starting implementation without Gate 5 approval
- ❌ Planning on assumptions — always ask
- ❌ Skipping research for new projects
- ❌ Editing other codebases without explicit permission
- ❌ Verifying a UI only via API/curl — browser testing is mandatory
- ❌ Vague commits or CHANGELOG placeholders
- ❌ Declaring done while specs are still `open`
- ❌ Publishing anything beyond the configured release policy — no `.asf-release.json` means the default: always get the user's explicit go-ahead
- ❌ Publishing without testing the shipped artifact on publish / in production (if applicable)
- ❌ Shipping a package without inspecting the packaged file list (`npm pack`)
- ❌ Treating "no error" as "it worked" — malformed config is skipped **silently**
- ❌ Verifying against a cached/stale install, or with an old duplicate still present
- ❌ Guessing at a fix before reading the actual error message
- ❌ Fixing a bug without adding a regression test
- ❌ Claiming something was verified when it was assumed
- ❌ Asking a barrage of intake questions for small work — small runs automatically
- ❌ Writing PLAN.md / demanding approval for small work — that's the large-work gate only
- ❌ Waiting for sign-off when the work is small; when in doubt, default to small and start
- ❌ One giant file / god-object that "does everything" — small well-readable modules, plugged in
- ❌ Copy-pasting shared logic instead of importing the one authoritative module (SSOT)
- ❌ A "test copy" of a module that differs from the production version — same modules everywhere
- ❌ Hardcoding values (model names, thresholds, URLs) that config should drive
- ❌ Escalation/fallback logic re-implemented per caller instead of one shared escalation path
- ❌ Shipping a module that cannot run/test standalone outside the host
- ❌ Refactoring without the architecture writeup (see `references/06c-code-quality.md`)
- ❌ Letting a document grow until edits start breaking instead of splitting it (06c Rule 9)
- ❌ Running parallel subagents that touch the same file — edits are silently lost (see `references/06d-delegation.md`)
- ❌ Trusting a subagent's exit code or self-report instead of verifying the actual code/test result
- ❌ Re-deriving context another live session already has instead of asking it over intercom
- ❌ Breaking existing functionality during a refactor — refactoring preserves behavior
- ❌ Marking a spec delivered from the delivery log instead of tracing the code — the log is a claim
- ❌ Shipping machinery no surface consumes — delivered = visible in the product (UI or API)
- ❌ A `// TODO`, `not implemented`, empty handler or `coming soon` on a user-reachable path — that is an absent feature wearing a name
- ❌ Fake, seed, demo or lorem-ipsum data on a path the user reads as their own
- ❌ An invented API signature, config key, endpoint, version or limit stated as fact — verify it or mark it unverified
- ❌ Quietly deferring part of the ask ("v1 does X") instead of finishing it or telling the user
- ❌ Presenting a stub as complete because the tests written against it pass
- ❌ Leaving a deliberate stub unexplained — if the user asked for a scaffold, say so in the report
- ❌ Trusting unit tests as proof of wiring — assert the operator-facing outcome end-to-end
- ❌ Trusting an external plan's ✅ (IMPROVEMENT-PLAN / delivery log) — ingest its items as specs and verify them
- ❌ Implementing a spec literally when it creates product tension — challenge it and resolve with the user
- ❌ Shallow pass-through modules that add no abstraction; a new layer that hides nothing (06c P05)
- ❌ Refactoring untested code without a characterization baseline (06c P13)
- ❌ Fixing a smell instance by instance instead of the design (06c P09)
- ❌ Drift: scope creep, approach drift, gate drift — stop, revert, self-correct (06-implementation P20)
- ❌ Shipping a delivery summary without the report fields: spec status + evidence, test results, skipped checks, not-tested register (06b Rule 17)
- ❌ Letting an escaped defect teach nothing — ask which gate should have caught it and close the gap (06b Rule 18)
- ❌ Self-modifying the ASF's own rules during a task run — standards change only via the review process (P22)

## Reference index (read on demand — never load all)

Each reference is a small, single-concern doc. **Read only the ones your
current phase needs** — the "Read when" column is the index. Small work
reads at most 06b + 06c; large work reads the ones its phase calls for.

| File | Covers | Read when |
|---|---|---|
| `01-intake.md` | question bank, probing, external planning docs (M6) | Phase 1 (large) |
| `02-research.md` | research playbook, search templates | Phase 2 (large) |
| `04-adversarial.md` | adversarial checklist (spec/architecture/security lenses) | Phase 4 (large) |
| `05-plan.md` | PLAN.md template + ADRs + quality scenarios + ATAM-lite + views | Phase 5 (large) |
| `06-implementation.md` | coding discipline, M4/M5, drift self-correction (P20) | Phase 6 |
| `06b-testing-qa.md` | **mandatory** testing & QA standard (18 rules + DoD) | before writing tests (always) |
| `06c-code-quality.md` | **mandatory** modularity standard (9 rules, deep modules, smells) | before structuring code |
| `06d-delegation.md` | intercom & subagents + independent reviewer gate (P19) | before delegating; Phase 7 review (large) |
| `06e-code-health.md` | Code Health Gate (+ depth, supply-chain, secrets metrics) | Gate 8 (large) |
| `06f-stability.md` | stability patterns + error handling + observability (P06/P07/P08) | **if the deliverable makes external calls or is a service** |
| `06g-test-design.md` | risk-based test derivation + determinism | Phase 6 large (test plan) / non-trivial tests |
| `06h-security.md` | threat model, ASVS DoD, supply chain, agent tools | Phase 4/5 large; small = one line |
| `06i-completeness.md` | **mandatory** no stubs / no fabricated data / no invented facts + completeness DoD | before implementing and before claiming done (always) |
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
