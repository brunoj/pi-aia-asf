# pi-aia-asf — Ai Applied Agentic Software Factory

Codifies the full, disciplined software development flow used on real projects (conversense, betamaxx, mbee.me, pi-vigilant): **classify → intake → research → specs → adversarial analysis → plan with approval gate → test-first implementation → verification & delivery**.

It turns "let's build something" into a gated pipeline where nothing is implemented on assumptions, every hard requirement is captured as a verifiable spec, and nothing ships without evidence.

## What it does

| Phase | Gate | What happens |
|---|---|---|
| 0. Classify | must be ASF work | New project / feature / major bugfix / refactor — or *not* ASF (skill stays quiet) |
| 1. Intake | user confirms intent | Ask until goal, success criteria, constraints are all clear |
| 2. Research | approach agreed | SOTA + existing packages via `web_search`/`web_fetch`, cited |
| 3. Specs | user signs off | Every hard requirement → `capture_spec` (shared with pi-vigilant) |
| 4. Adversarial | findings confirmed | Edge cases, failure modes, security, maintainability challenged |
| 5. Plan | **explicit approval** | `PLAN.md` in repo root — no implementation before approval |
| 6. Implement | tests green | Test-first, strict codebase isolation, browser-tested UIs |
| 7. Verify & deliver | specs met | Every spec verified with evidence; release offered, never auto-published |

## Activation

The skill activates when the user's request is a **new software project, significant feature, major bugfix, or architectural refactor**. It does **not** activate for Q&A, one-liners, casual conversation, or non-software tasks. When in doubt, it asks.

You can also force/start a session explicitly:

```
/asf new          — start a new software project
/asf feature      — add a feature
/asf bugfix       — major bugfix
/asf refactor     — architectural refactor
/asf status       — show current phase + state
/asf approve      — mark PLAN.md as approved (Gate 5)
/asf abort        — end the session
```

## Dependencies (required)

| Package | Provides | Install |
|---|---|---|
| **pi-vigilant** | `capture_spec`, `get_task_specs`, `update_spec_status`, final verification | `pi install npm:pi-vigilant` |
| **pi-smart-web-search** | `web_search` | `pi install npm:pi-smart-web-search` |
| **pi-smart-fetch** | `web_fetch`, `batch_web_fetch` | `pi install npm:pi-smart-fetch` |
| **pi-aia-browser** | `browser_init`, `browser_navigate`, … (Playwright + Chromium, auto-installed) | `pi install npm:pi-aia-browser` |
| **pi-intercom** | `intercom` — message other live pi sessions directly (delegation, cross-session verification) | `pi install npm:pi-intercom` |

`pi-intercom` is also declared in `dependencies` in `package.json`, so `npm install` of this package pulls it in. It is intentionally **not bundled** into the tarball: bundling it would conflict with a top-level `pi install npm:pi-intercom` (tool name collision), so the tool must be installed at top level to register.

The extension warns at startup (and on `/asf` with no args) when any dependency is missing.

## Install

```bash
pi install npm:pi-aia-asf
```

Then `/reload`.

## How it works

- **Skill** (`skills/aia-asf/SKILL.md`) — the workflow itself, with per-phase reference guides in `references/`.
- **Extension** (`index.ts`) — `/asf` commands, per-project phase state (`~/.pi/agent/skills/aia-asf/projects/<project>/state.json`), dependency checks.
- **Specs shared with pi-vigilant** — ASF drives `capture_spec` during intake; pi-vigilant re-verifies every spec at task end and blocks "done" while MUST specs are open. One spec file, two systems.

## Hygiene rules enforced

- Test-first; only green commits
- **Strict codebase isolation** — the project never touches other repos unless the user explicitly says so
- **Mandatory browser testing** of any web interface (real user experience, not just curl)
- Descriptive commits + CHANGELOG entries (no placeholders)
- **Publishing is always the user's decision** — ASF prepares the release (version + CHANGELOG + tag), optionally offers CI/CD setup, but never auto-publishes

## Development

```bash
npm run check   # typecheck
npm test        # see repo for test suites
npm run release patch|minor|major   # test → version → CHANGELOG → tag → push
```

## License

MIT © Bruno Jakic, Ai Applied
