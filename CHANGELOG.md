# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.5.0] - 2026-08-28

### Added

- **06b Rule 15 — bound every long-running operation** (new mandatory QA rule):
  state the expected duration before running any long command (package installs,
  platform/test-harness startup, browser/daemon launches, full suites); ALWAYS
  wrap it in a hard timeout (`timeout N …` / tool timeout parameter); exceeding
  the bound is a bug signal — kill and diagnose the root cause; if the bound
  proves too short, raise it deliberately with a reason. Rooted in the user
  report of package hangs lasting up to 50,000 seconds with the agent waiting
  idle. Added to the Rule 10 definition-of-done checklist.
- **SKILL.md discipline rule 6 — Bounded waits — ALWAYS** (renumbered rules
  7–10): the same rule at the phase level, with the 50,000-second hang as the
  anti-example.
- **07-release.md**: "Verify first" step now requires every long-running
  verification command to have run under an explicit timeout with a stated
  expected duration.

## [0.4.0] - 2026-08-28

### Added

- **Delegation reference `references/06d-delegation.md`** — codifies the two
  delegation mechanisms available to ASF work: **intercom** (message another
  live pi session that owns relevant context — `list` first, say what you want
  back, treat peer findings as evidence, not proof) and **subagents** (spawn an
  isolated `pi -p` process when the OUTCOME matters more than the trace — scoped
  codebase research, independent parallel fixes, fresh-perspective review).
- **Two verified hard limits, backed by experiment** (both documented as
  anti-patterns in SKILL.md):
  - **Never run parallel subagents against the same file.** Tested: 4 concurrent
    whole-file writers left only 1 of 4 edits, silently, all exiting 0 — the
    no-mutual-dependencies rule is enforced by physics, not preference.
  - **Exit code 0 does not mean success.** Tested: a subagent asked to read a
    non-existent file exited 0. Always validate the returned output.
- **`pi-intercom` as a declared dependency** (`dependencies` in package.json,
  `^0.10.1`) — `npm install` pulls it in. Intentionally **not bundled**: a
  bundled copy conflicts with a top-level `pi install npm:pi-intercom`
  (tool-name collision, verified), so the tool must be installed top-level to
  register. Added to the ASF runtime dependency check (`/asf` summary now lists
  all five: pi-vigilant, pi-smart-web-search, pi-smart-fetch, pi-aia-browser,
  pi-intercom).
- **SKILL.md wiring** — Phase 6 delegation note, reference index entry, and
  three new anti-patterns (same-file parallel subagents, trusting subagent exit
  codes/self-reports, re-deriving context another live session already has).

### Changed

- README dependencies table now lists pi-intercom with the not-bundled rationale.

## [0.3.0] - 2026-08-25

### Added

- **Mechanical spec-to-code traceability gate in `/asf verify`** (large work
  only) — reads the shared spec-memory task and validates every `met` spec's
  trace (`outcome → codePath → testFile + assertion`); `testFile` must exist
  and `assertion` must appear in it. Outputs a traceability matrix with
  PASS/FAIL rows and refuses delivery on FAIL (`GATE NOT PASSED`). Small work
  keeps the checklist only — no mechanical gate (scale proportionality).
- **New QA rules (06b-testing-qa.md)**: Rule 12 — test the operator-facing
  outcome, not the machinery (Betamaxx dead-code failure); Rule 13 — nothing
  is delivered until consumed by a surface (UI or API); Rule 14 — every
  feature spec ships an E2E behavioral test through the real entry point.
  Rule 9 extended for silent async paths; Rule 10 DoD extended (traceability,
  consumed-by-surface, E2E).
- **M4 — challenge approved designs during implementation** (06-implementation.md):
  product tension → resolve with the user before implementing.
- **M5 — the delivery log is a claim; the code is the evidence**: trace the
  actual code path before marking anything delivered.
- **M6 — external planning docs are specs, not ground truth** (01-intake.md +
  SKILL.md Phase 1/3): locate IMPROVEMENT-PLAN.md / PLAN.md / requirements
  docs / delivery logs / tickets, ingest every actionable item as a captured
  spec; their ✅ markers are claims, not evidence.
- **Adversarial traceability lens** (04-adversarial.md): operator-facing
  outcome + code path + where dead wiring hides.
- **PLAN.md traceability matrix** (05-plan.md): spec → outcome → code path →
  test.
- DoD checklist extended; anti-patterns added (delivery-log trust, machinery
  without a surface, unit tests as wiring proof, external plan checkmarks,
  literal implementation of tension-creating specs).

### Changed

- `/asf verify` output now shows scale and, for large work, the mechanical
  traceability matrix before the DoD checklist.

### Requires

- pi-vigilant 0.1.3+ (provides the `trace` field on specs).


## [0.2.2] - 2026-08-14

### Added

- **Mandatory modularity & maintainability standard** (`references/06c-code-quality.md`) — 8 rules distilled from Bruno's Tunnel-project philosophy (small well-readable modules plugged in where needed; one authoritative implementation for shared functionality with a single escalation path; no hardcoding — config-driven; fully testable outside the host then integrated verbatim, same modules in tests and production; refactor what is too complex to understand; layered with clear one-way boundaries and an architecture writeup; full I/O debug logging with replay of stored data; nothing may break existing functionality) and reinforced by external research (SSOT, testability as design property, ports-and-adapters seams).

### Changed

- **Phase 6** now requires reading `06c-code-quality.md` before structuring code; **Phase 7** verification includes the modularity DoD (no duplicated shared logic, no hardcoded config values, standalone-tested modules, architecture writeup, existing functionality green).
- **Phase 4** adversarial analysis gains a code-quality lens (duplication, single escalation path, standalone testability, hardcoded values); **Phase 5** PLAN.md architecture section now requires the SSOT map, layering rules, and standalone-testability notes.
- Anti-patterns extended: god-objects, copy-pasted shared logic, test copies of modules, hardcoding, per-caller escalation logic, untestable-standalone modules, behavior-breaking refactors.


## [0.2.1] - 2026-08-14

### Added

- **Scale-based flow.** Every ASF activation is now classified **small** or **large**:
  - **Small** (small features, minor bugfixes, small refactors) — runs **automatically**: no intake question barrage (at most one clarifying question), no research, no adversarial gate, no PLAN.md, no approval. State the intent, capture specs silently, implement test-first, verify, deliver.
  - **Large** (new projects, significant features, major bugfixes, architectural refactors) — full gated flow unchanged: intake → research → specs → adversarial → PLAN.md → **explicit approval** → implementation → verification.
  - When in doubt, **default to small and start working**; re-classify upward if the work grows.
- **`/asf small`** command — starts a small session directly in implementation phase. `/asf status` now shows the scale (`automatic — no gates` for small).

### Changed

- All gates (1–5) explicitly apply to large work only; Phase 2 (research) and Phase 5 (PLAN.md + approval) are skipped entirely for small work.
- References `01-intake`, `04-adversarial`, `05-plan` annotated with the scale rule.
- Anti-patterns: no question barrage or PLAN.md/approval demand for small work; when in doubt, start small.


## [0.2.0] - 2026-08-14

### Added

- **Mandatory testing & QA standard** (`references/06b-testing-qa.md`) — 11 rules distilled from real shipped-broken failures: test the packaged artifact (not just source), assert the observable end state, probe for silent failures, read the actual error before editing, clean-room verification against stale caches, a regression test for every bug fixed, test triggers *and* non-triggers, state-machine deadlock tests, mandatory browser testing for web surfaces, a definition-of-done checklist, and honest reporting.
- **`/asf verify`** — an explicit definition-of-done gate that itemises the 9 required checks, points at the QA standard, and forbids self-certifying unverifiable specs.

### Changed

- Phase 6 and Phase 7 of the skill now require the QA standard; Phase 7 additionally requires verifying the packaged artifact and the observable end state, plus honest reporting of skipped or inconclusive checks.
- Anti-patterns extended: shipping without inspecting the packaged file list, treating "no error" as success, verifying against a stale install, guessing before reading the error, fixing without a regression test, and claiming assumed verification.

### Fixed

- **`/asf-approve` rubber-stamped Gate 5.** It marked the plan approved even when no `PLAN.md` existed — approving a plan the user had never seen. It now refuses unless `PLAN.md` is present, and advances the phase to implementation on success.


## [0.1.1] - 2026-08-14

### Fixed

- **The `aia-asf` skill was never loaded.** Its YAML frontmatter description contained an unquoted colon (`The flow is: classify the work...`); a colon followed by a space starts a mapping in YAML, so the frontmatter failed to parse and pi silently skipped the skill. The extension's `/asf` commands worked, but the workflow skill itself was unavailable. The description is now a YAML block scalar with no inline colon.


### Added

- Initial release of the Ai Applied Agentic Software Factory.
- ASF skill with 8 gated phases: classify, intake, research, specs, adversarial analysis, plan (approval gate), test-first implementation, verification & delivery.
- Per-phase reference guides (intake question bank, research playbook, adversarial checklist, PLAN.md template, implementation discipline, release workflow).
- `/asf` commands: new, feature, bugfix, refactor, status, approve, abort.
- Per-project phase state tracking in `~/.pi/agent/skills/aia-asf/projects/<project>/state.json`.
- Dependency checks at startup and on `/asf` (pi-vigilant, pi-smart-web-search, pi-smart-fetch, pi-aia-browser).
- Specs shared with pi-vigilant via `capture_spec` / `get_task_specs` / `update_spec_status`.
- Strict codebase isolation rule (project never touches other repos unless the user says so).
- Mandatory pi-aia-browser testing for any web interface.
- Release workflow: prepare version + CHANGELOG + tag + push; publishing always requires explicit user approval.
