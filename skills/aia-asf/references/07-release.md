# Phase 7 — Release Workflow

## Release policy (user-configurable)

**Default stance:** publishing is the user's decision — the factory prepares
everything and gets explicit approval before publishing. **A project may
define its own release policy** in `.asf-release.json` at the project root
(optional). The user definition takes precedence; the default is used only
in the absence of a user definition.

```json
{
  "when": "when the full suite is green and the bump is patch/minor → publish automatically; when the bump is major → send for final review; when the suite is not green → fix first, never publish",
  "how": "To publish: connect with npm using the credentials in ~/.npmrc (2FA token; verify with `npm whoami`), sync git (`git pull --rebase`), run `npm run release <level>`, then verify the published version from the registry in a clean install..."
}
```

- **`when`** — the user's **conditional rules**, in their own words: *"when X
  is true, publish automatically; when Y is true, do this…"*. The ASF
  evaluates them against the current state (suite green, bump scope, breaking
  change, credentials available) and acts: publish automatically, send for
  final review, or do something else (e.g. fix first, skip).
- **`how`** — the user's **instructions** for driving the release, with all
  technical details: credentials, git sync, publish steps, verification.
  It is **not a deterministic command list** — the ASF drives the release
  with judgment: it checks prerequisites, runs the verification gates,
  handles failures, and applies the ASF's own discipline (06b rules) while
  executing. A user `how` may add project-specific steps; it may not remove
  the mandatory verification below.
- **No file → default:** `when` = "always send for final review before
  publishing"; `how` = the standard workflow below.

## When release applies

- npm packages (pi extensions, libraries)
- GitHub releases
- Deployed applications
- NOT for internal-only experiments the user keeps local

## Steps

1. **Verify first** (mandatory, before any versioning):
   - typecheck / build passes
   - test suite green
   - all MUST specs `met` in pi-vigilant
   - every long-running verification command ran under an explicit timeout with a stated expected duration (06b Rule 15) — no unbounded waits
   - **re-run the dependency/security check (P17 RV loop):** `npm audit`
     (or osv-scanner) + secrets scan — a vulnerability discovered after the
     last run must not ship. The check is re-run **every release**, not
     just when dependencies change.
2. **Version bump** — semantic versioning:
   - `patch` (0.1.0 → 0.1.1): bug fixes
   - `minor` (0.1.0 → 0.2.0): new features, backward compatible
   - `major` (1.0.0): breaking changes
3. **CHANGELOG** — move `[Unreleased]` entries into the new version section; describe each change specifically.
4. **Tag** — `git tag vX.Y.Z`
5. **Push** — `git push --follow-tags`
6. **Publish** — per the release policy:
   - default: **only with explicit user approval** (npm: `npm publish`, ensure 2FA token + `npm login` state; GitHub release: via web or `gh release create`)
   - a `.asf-release.json` `when` rule may authorize automatic publishing for the stated conditions
7. **Test on publish / in production — ALWAYS, if applicable** (mandatory, not optional):
   - **Package:** install it **clean-room from the registry** (fresh dir, caches cleared, explicit version — 06b Rule 5), confirm the installed version is the one just published, and confirm the **observable end state** works (the tool/skill/extension loads and runs; any web surface exercised through `pi-aia-browser`).
   - **Deployed app:** smoke-test in **production** (health endpoint, key user journey) — a deploy that breaks prod is not a successful release.
   - **Not applicable** (internal-only experiment, no runtime surface): say so explicitly in the report (06b Rule 11).
   - If the published artifact is broken: **fix forward** (new patch), never pretend the release succeeded.

## CI/CD offer

After a successful release (or for a new project), **offer** to set up a CI/CD pipeline for publishing:

- GitHub Actions: test on push → version + publish on tag/release
- Requires the user's secrets (npm token, etc.) — never invent credentials
- Keep it minimal: test job + publish job, gated on tags

## Hygiene rules

- No auto-publish beyond the configured policy — default is explicit user approval
- Describe changes specifically in CHANGELOG (no placeholders)
- The version in package.json, the git tag, and the npm release must match
- If publishing fails partway, fix forward; never publish a second version with the same number
- **Test on publish / in production, if applicable — always** (step 7)
