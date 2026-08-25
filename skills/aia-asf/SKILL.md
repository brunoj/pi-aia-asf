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
## Architecture / Design
## Milestones (M1..Mn with exit criteria)
## Task list (per milestone, checkboxes)
## Dependencies (with licenses)
## Risks & mitigations (from adversarial analysis)
## Definition of done (tests, deploy, release)
```

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
> logging with replay; nothing breaks existing functionality.

Execute the task list milestone by milestone. Discipline rules:

1. **Test-first**: write/update tests before or with implementation; run them; only commit green.
   Every bug fixed gets a **regression test** that fails on the old code. For conditional
   behavior (skills, gates, auto-activation) test **triggers AND non-triggers**.
2. **Codebase isolation**: work strictly inside the project's own codebase. Do NOT edit files in other repos, global config, or unrelated directories — **unless the user explicitly instructs otherwise**. If a change would touch another codebase, stop and ask.
3. **No scope creep**: if something new is discovered that changes specs, capture it, ask the user, and update the plan before implementing.
4. **Descriptive commits**: `git commit -m "type: specific description of what and why"` (e.g. `fix: verify specs before rotation`). No vague messages, no placeholders.
5. **Browser testing — MANDATORY for any web interface**: if the deliverable has a UI/website/web app, test it through `pi-aia-browser` (`browser_init`, `browser_navigate`, `browser_click`, `browser_type`, `browser_screenshot`, `browser_dom`, …) to replicate the user's real experience — not just curl/API checks. Verify: loads, key user journeys, responsive behavior, console errors. **Silent async paths included**: ingest through the real flow and wait for the enrichment to land (06b Rule 9).
6. **Let pi-vigilant do its job**: it will auto-continue after premature stops and verify specs at settle. When it asks for `update_spec_status` with evidence, do it.
7. **CHANGELOG discipline**: every user-visible change gets a CHANGELOG entry describing exactly what changed (no placeholder text).
8. **Challenge approved designs (M4)**: if a spec's literal reading creates product tension (e.g. feedback clusters under "Plan" when "Plan = plans"), stop and resolve it with the user before implementing — never implement blindly and call it delivered.
9. **Trace before claiming delivered (M5)**: the delivery log is a claim; the code is the evidence. Before marking anything ✅, trace the actual code path, confirm the output is consumed by a surface, and confirm the operator-facing outcome test passes.

---

## Phase 7 — Verification & delivery (gate)

Run the **Definition of Done checklist** in `references/06b-testing-qa.md` (Rule 10). Every box must hold.

Also check the **modularity DoD** from `references/06c-code-quality.md` (Phase 7 section): no duplicated shared logic, no hardcoded config values, every module tested standalone with the same calls it gets in the host, architecture writeup exists, existing functionality still green.

**Large work:** run `/asf verify` — it mechanically validates the **spec-to-code traceability matrix** (M1): every `met` spec must carry `trace` (outcome → codePath → testFile + assertion), testFile must exist, assertion must appear in it. FAIL rows block delivery. **Verify ingested specs from external planning docs too** — the doc's ✅ markers are claims, not evidence.

1. Run the full test suite (all of it, not a subset); fix failures; re-run until green.
2. **Verify the artifact a user would actually get**: inspect the packaged file list
   (`npm pack` → `tar tzf`), install/load it clean-room in a fresh dir with caches
   cleared, confirm the installed version is the one just built, and confirm the
   **observable end state** (the tool/skill/page actually appears and works) — not just
   that files are in place. Any web surface must be exercised through `pi-aia-browser`.
3. Run `get_task_specs` and verify **every spec** with `update_spec_status` + concrete evidence (test output, build result, code inspection). Unverifiable → `partial` + ask the user. Never self-certify.
4. **Report honestly**: never claim a check you didn't run; state explicitly anything
   skipped or inconclusive, and distinguish "tests pass" from "works for the user".
3. If the project is a library/package that the user publishes (npm, GitHub release): **offer** to run the release (see `references/07-release.md`): version bump, CHANGELOG, git tag, push. **Publishing is always the user's decision** — never publish without explicit approval. Optionally offer to set up a CI/CD pipeline for publishing.
4. Present a completion summary: what was built, specs met, tests passing, how to use it.

---

## Anti-patterns

- ❌ Starting implementation without Gate 5 approval
- ❌ Planning on assumptions — always ask
- ❌ Skipping research for new projects
- ❌ Editing other codebases without explicit permission
- ❌ Verifying a UI only via API/curl — browser testing is mandatory
- ❌ Vague commits or CHANGELOG placeholders
- ❌ Declaring done while specs are still `open`
- ❌ Publishing anything without the user's explicit go-ahead
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
- ❌ Breaking existing functionality during a refactor — refactoring preserves behavior
- ❌ Marking a spec delivered from the delivery log instead of tracing the code — the log is a claim
- ❌ Shipping machinery no surface consumes — delivered = visible in the product (UI or API)
- ❌ Trusting unit tests as proof of wiring — assert the operator-facing outcome end-to-end
- ❌ Trusting an external plan's ✅ (IMPROVEMENT-PLAN / delivery log) — ingest its items as specs and verify them
- ❌ Implementing a spec literally when it creates product tension — challenge it and resolve with the user

## References

- `references/01-intake.md` — question bank and probing techniques (incl. external planning docs, M6)
- `references/02-research.md` — research playbook with search templates
- `references/04-adversarial.md` — adversarial checklist per area
- `references/05-plan.md` — PLAN.md template with examples (incl. spec-to-code traceability matrix)
- `references/06-implementation.md` — coding discipline details (incl. M4 challenge designs, M5 trace before claiming)
- `references/06b-testing-qa.md` — **mandatory testing & QA standard** (14 rules + definition of done)
- `references/06c-code-quality.md` — **mandatory modularity & maintainability standard** (8 rules, SSOT, testable-standalone, single escalation path)
- `references/07-release.md` — release workflow (versioning, CHANGELOG, tags, npm, CI/CD)
