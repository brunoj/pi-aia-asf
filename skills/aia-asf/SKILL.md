---
name: aia-asf
description: Agentic Software Factory — run a complete, disciplined software development cycle. Use when the user wants to start a NEW software project, add a SIGNIFICANT FEATURE to an existing project, perform a MAJOR BUGFIX, or do an ARCHITECTURAL REFACTOR. The flow is: classify the work, ask questions until the intent is clear, research SOTA and existing packages, capture hard specifications (via capture_spec, shared with pi-vigilant), run adversarial analysis, produce a PLAN.md and get explicit user approval, then implement test-first with strict codebase isolation and mandatory browser testing of any web interfaces (pi-aia-browser). Do NOT activate for simple Q&A, one-line fixes, casual conversation, content writing, or non-software tasks. When in doubt about whether work qualifies as a project/feature/bugfix/refactor, ask the user.
---

# AIA Agentic Software Factory (ASF)

You are running the **Ai Applied Agentic Software Factory**. This skill codifies the full development flow used for real projects (conversense, betamaxx, mbee.me, pi-vigilant, and others). Follow the phases strictly, in order. Every phase has an explicit gate — never skip a gate.

> **Dependencies** (verify at Phase 0, warn if missing, do not proceed without them):
> - `pi-vigilant` — provides `capture_spec`, `get_task_specs`, `update_spec_status` and final-verification. If the tools are not available, tell the user: `pi install npm:pi-vigilant` and `/reload`.
> - `pi-smart-web-search` / `pi-smart-fetch` — `web_search`, `web_fetch`, `batch_web_fetch` for research. If missing: `pi install npm:pi-smart-web-search npm:pi-smart-fetch`.
> - `pi-aia-browser` — browser automation (`browser_init`, `browser_navigate`, …) for testing web interfaces. If missing: `pi install npm:pi-aia-browser` (installs Playwright + Chromium automatically).

---

## Phase 0 — Classify the work (gate)

Determine the work type. If it is not ASF work, **do not run the factory** — just help normally.

| Work type | ASF? |
|---|---|
| New software project | ✅ yes — full flow |
| Significant feature in an existing project | ✅ yes — full flow (research: medium depth) |
| Major bugfix (multi-file, behavior change, needs tests) | ✅ yes — lighter flow (research optional) |
| Architectural refactor | ✅ yes — full flow (research: low depth) |
| Simple Q&A, one-liner fix, casual talk, docs-only | ❌ no |
| Non-software tasks (LinkedIn, research-only, writing) | ❌ no |

If the user's request is ambiguous, **ask** before starting. State the classification explicitly:
`ASF: <new-project|feature|major-bugfix|refactor> — starting Phase 1 (intake).`

---

## Phase 1 — Intake: ask until it's clear (gate)

The factory **keeps asking until all is clear**. Never start planning or implementation on guesses.

Minimum intake checklist (ask anything not yet known, one question at a time or a short batch):

- **Goal** — what exactly is being built/changed? (one sentence)
- **Context** — existing system? which repo? what's there today?
- **Users / audience** — who uses this, and how?
- **Success criteria** — how will we know it's done and correct? (be concrete)
- **Constraints** — musts, must-nots, boundaries, budget, timeline
- **Preferences** — stack, language, platform, style (only if the user has them)
- **Definition of done** — tests? deploy? release? docs?

For each answer, **capture hard requirements immediately with `capture_spec`** (requirement, area, priority). Specs are the shared contract with pi-vigilant — it will re-verify them at the end.

**Gate 1**: You may only leave intake when the user has confirmed the summary of intent (restate it back in 3–5 bullet points and ask "is this correct?").

---

## Phase 2 — Research: SOTA and packages (adaptive depth)

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

**Gate 2**: present the research summary + recommendation to the user. Ask: "proceed with this approach, or adjust?" Do not enter planning until the approach is agreed.

---

## Phase 3 — Specifications (gate)

Turn the intake answers + research into the authoritative spec set.

1. Run `get_task_specs` to see what's already captured.
2. Fill gaps: for every requirement the user stated or approved, ensure a spec exists (`capture_spec`).
3. Decompose broad specs with `parentId` (e.g. "must be secure" → auth + encryption sub-specs).
4. Default priority is `must`; use `should` only when the user says "nice to have".
5. Areas: functionality, ui-ux, performance, security, error-handling, testing, documentation, compatibility, constraints, format, data, deployment, other.

**Gate 3**: show the full spec tree (`get_task_specs`) and get user sign-off: "specs correct — proceed to adversarial analysis?"

---

## Phase 4 — Adversarial analysis (gate)

Challenge the plan like a hostile reviewer before committing to it. For each spec and the overall design, ask and resolve:

- **Edge cases** — empty input, zero users, max load, missing data, concurrency
- **Failure modes** — what breaks, and how do we detect/recover?
- **Security** — auth, injection, data exposure, abuse
- **Maintainability** — will this be understandable in 6 months? who maintains it?
- **Dependencies** — are they maintained? license? size? alternatives?
- **Scope** — is anything here actually unnecessary? (cut it)
- **Feasibility** — is the SOTA research consistent with the specs?

For each finding: either capture a new spec, refine an existing one (supersede), or record the decision to accept the risk. **Ask the user about anything that changes scope.**

**Gate 4**: summarize adversarial findings + resolutions, get user confirmation.

---

## Phase 5 — Plan + approval gate

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

**Gate 5 — MANDATORY user approval**: present the plan and ask explicitly:
> "Plan ready. Do you approve starting implementation? (yes / changes needed)"

**Never start implementing before Gate 5 passes.** If the user says "go" without reading, still show the plan and confirm.

---

## Phase 6 — Implementation (test-first, disciplined)

Execute the task list milestone by milestone. Discipline rules:

1. **Test-first**: write/update tests before or with implementation; run them; only commit green.
2. **Codebase isolation**: work strictly inside the project's own codebase. Do NOT edit files in other repos, global config, or unrelated directories — **unless the user explicitly instructs otherwise**. If a change would touch another codebase, stop and ask.
3. **No scope creep**: if something new is discovered that changes specs, capture it, ask the user, and update the plan before implementing.
4. **Descriptive commits**: `git commit -m "type: specific description of what and why"` (e.g. `fix: verify specs before rotation`). No vague messages, no placeholders.
5. **Browser testing — MANDATORY for any web interface**: if the deliverable has a UI/website/web app, test it through `pi-aia-browser` (`browser_init`, `browser_navigate`, `browser_click`, `browser_type`, `browser_screenshot`, `browser_dom`, …) to replicate the user's real experience — not just curl/API checks. Verify: loads, key user journeys, responsive behavior, console errors.
6. **Let pi-vigilant do its job**: it will auto-continue after premature stops and verify specs at settle. When it asks for `update_spec_status` with evidence, do it.
7. **CHANGELOG discipline**: every user-visible change gets a CHANGELOG entry describing exactly what changed (no placeholder text).

---

## Phase 7 — Verification & delivery (gate)

1. Run the full test suite; fix failures; re-run until green.
2. Run `get_task_specs` and verify **every spec** with `update_spec_status` + concrete evidence (test output, build result, code inspection). Unverifiable → `partial` + ask the user. Never self-certify.
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

## References

- `references/01-intake.md` — question bank and probing techniques
- `references/02-research.md` — research playbook with search templates
- `references/04-adversarial.md` — adversarial checklist per area
- `references/05-plan.md` — PLAN.md template with examples
- `references/06-implementation.md` — coding discipline details
- `references/07-release.md` — release workflow (versioning, CHANGELOG, tags, npm, CI/CD)
