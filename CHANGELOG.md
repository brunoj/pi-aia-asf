# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
