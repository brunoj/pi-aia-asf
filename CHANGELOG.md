# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
