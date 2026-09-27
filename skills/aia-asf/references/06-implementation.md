# Phase 6 — Implementation Discipline

> **Also read `references/06c-code-quality.md`** — the modularity & maintainability
> standard. Structure code as small modules with one responsibility, keep shared
> functionality in exactly one implementation (SSOT, single escalation path),
> never hardcode what config should drive, and keep every module testable
> standalone outside the host.
>
> **Read on demand:** `references/06f-stability.md` when the deliverable makes
> external calls; `references/06g-test-design.md` when writing the test plan or
> non-trivial tests; `references/06h-security.md` when the deliverable handles
> untrusted input/secrets/agent tools.

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

## Challenge approved designs during implementation (M4)

A plan was approved, but that does not make it correct. When a spec's literal
reading creates **product tension** (e.g. feedback clusters rendered under the
"Plan" tab when "Plan = plans"), **stop and resolve it with the user before
implementing** — do not implement blindly and call it delivered.

- Tension detected → state it plainly, propose the fix, get a decision.
- Implement the *sensible* version, not the literal-but-wrong one.
- The user's words "implemented in a SENSIBLE way" are the acceptance bar.

## The delivery log is a claim; the code is the evidence (M5)

Before marking anything ✅ (a spec, a milestone, a delivery-log item):

1. **Trace the actual code path** — the function is called, not just defined.
2. Confirm the output is **consumed by a surface** (Rule 13).
3. Confirm the **operator-facing outcome test** passes (Rule 12).

A delivery log saying "IMP-006 delivered ✅" proves nothing. The code is the
evidence. External planning docs (IMPROVEMENT-PLAN.md, PLAN.md, delivery logs)
are inputs to spec capture — their ✅ markers are claims, never ground truth.

## Drift self-correction (P20) — stop, revert, self-correct, continue

**Drift** = the implementation is moving away from the approved plan/specs
(scope creep, a different approach sneaking in, a shortcut that changes
behavior). It is the most common silent failure of a long implementation.

**Named drift anti-patterns** (if you catch yourself doing any of these, you
are drifting):

- **Scope creep** — adding features/edge cases the plan did not call for
  ("while I'm here...").
- **Approach drift** — quietly switching from the approved approach to a
  different one because it "feels simpler".
- **Spec drift** — implementing a *sensible* variant of a spec without
  resolving the tension (M4 says: resolve it with the user first).
- **Gate drift** — skipping a gate "just this once" (tests, adversarial,
  browser verification).
- **Quality drift** — accepting a shortcut that changes behavior or leaves
  dead machinery, then marking it delivered (M5).

**Self-correction loop (autonomous, no user needed):**

1. **Detect** — compare what you are about to do against the plan/specs. If
   it is not in the plan, it is drift.
2. **Stop** — do not continue the drift; do not "finish it first".
3. **Revert** — undo the drifted change (git checkout / undo the edit). The
   revert is cheap; the drift is not.
4. **Self-correct** — re-read the plan/spec, implement the approved version.
5. **Continue** — resume the task list.

**Escalate to the user only when the plan/requirements themselves are the
problem** (a genuine conflict, a product-level tradeoff, a scope change).
Then: stop, state the conflict plainly, propose the resolution, get the
decision — do not silently pick a side. Everything else, self-correct and
continue; the human decides only on genuine conflicts.
