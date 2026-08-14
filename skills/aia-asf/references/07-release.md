# Phase 7 — Release Workflow

Publishing is **always the user's decision**. The factory prepares everything; the user gives the final go.

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
2. **Version bump** — semantic versioning:
   - `patch` (0.1.0 → 0.1.1): bug fixes
   - `minor` (0.1.0 → 0.2.0): new features, backward compatible
   - `major` (1.0.0): breaking changes
3. **CHANGELOG** — move `[Unreleased]` entries into the new version section; describe each change specifically.
4. **Tag** — `git tag vX.Y.Z`
5. **Push** — `git push --follow-tags`
6. **Publish** — only with explicit user approval:
   - npm: `npm publish` (ensure 2FA token, `npm login` state)
   - GitHub release: via web or `gh release create` if installed

## CI/CD offer

After a successful release (or for a new project), **offer** to set up a CI/CD pipeline for publishing:

- GitHub Actions: test on push → version + publish on tag/release
- Requires the user's secrets (npm token, etc.) — never invent credentials
- Keep it minimal: test job + publish job, gated on tags

## Hygiene rules

- No auto-publish — always explicit user approval
- Describe changes specifically in CHANGELOG (no placeholders)
- The version in package.json, the git tag, and the npm release must match
- If publishing fails partway, fix forward; never publish a second version with the same number
