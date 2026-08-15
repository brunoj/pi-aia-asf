# Phase 6 — Implementation Discipline

> **Also read `references/06c-code-quality.md`** — the modularity & maintainability
> standard. Structure code as small modules with one responsibility, keep shared
> functionality in exactly one implementation (SSOT, single escalation path),
> never hardcode what config should drive, and keep every module testable
> standalone outside the host.

## Test-first

1. Write the failing test for the next behavior
2. Implement the minimum to pass
3. Run the suite; refactor; re-run
4. Only commit green

For web interfaces, browser tests via pi-aia-browser are part of the test suite, not an afterthought.

## Codebase isolation (STRICT)

- Work **only inside the project's codebase** (the repo the task belongs to).
- Do NOT modify: other project repos, `~/.pi/agent/`, global config, unrelated directories.
- If a legitimate need to touch another codebase arises (shared lib, dependency fix): **stop and ask the user**.
- Exception: the user explicitly instructs otherwise — then note the instruction and proceed.

## Browser testing (MANDATORY for web interfaces)

Any deliverable with a UI/web surface must be verified through the browser to replicate the user's real experience:

1. `browser_init` — start the browser
2. `browser_navigate` to the app URL (local dev server or deployed)
3. Walk the key user journeys: `browser_click`, `browser_type`, `browser_navigate`
4. Verify: page loads, journeys work, console has no errors (`browser_js`), screenshots for record (`browser_screenshot`)
5. Check responsiveness (desktop + mobile viewport)
6. `browser_close` when done

API-only verification is NOT sufficient for anything a human would see or click.

## Commit messages

`type: specific description of what and why`

- `feat:` new capability
- `fix:` bug fix
- `refactor:` structural change, no behavior change
- `docs:` documentation
- `test:` tests
- `chore:` tooling, deps, release

Examples:
- ✅ `fix: reset verification cooldown on new user task`
- ✅ `feat: add rate limiting middleware with 429 responses`
- ❌ `update stuff`, `fixes`, `wip`

## CHANGELOG

Every user-visible change gets an entry under `## [Unreleased]` or the released version, describing exactly what changed and why. No placeholder text.

## Specs during implementation

- New hard requirement discovered → `capture_spec` immediately
- Requirement changed → capture superseding spec (old → obsolete)
- When pi-vigilant injects its verification checklist → respond with `update_spec_status` + evidence
