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

**ASF is always on when software is being changed.** The extension watches tool calls: the first change to a source file (an edit/write, a bash heredoc / `sed -i` / scripted write into source, or a `pi -p --no-extensions` worker with write tools) opens a `small` run automatically. Docs, assets and loose `/tmp` scratch never activate it, and nothing activates for Q&A or research.

An automatic run is held to a **floor**, not a ceremony: it cannot settle until a passing test run that started after the last source change is recorded (a lint or typecheck does not count), and any spec marked met during the run must carry `trace.outcome` + `trace.codePath`. Missing evidence is **steered**, never stopped: each gap is raised once, an identical steer never repeats, and an unclosable gap is reported as unverified. The run only parks for input ASF cannot obtain itself (plan approval, an irreversible step with no safe path, a credential, a deliverable-shaping choice).

Three refusals always hold, including in passive mode: a secret written into a tracked file, a push/publish without a recorded full-suite green, and a destructive git command on a dirty tree. A repeated identical refusal escalates from refuse, to refuse with the rule text, to parking for the PO.

Run state is stored per git work-tree root (or absolute path outside git), so `cd` into a subdirectory keeps the run. Deleting the state file does not end a run — it is restored and the deletion is recorded.

Large work (new project, significant feature, major bugfix, architectural refactor) runs the full gated flow above. You can also start a session explicitly:

```
/asf new          — start a new software project
/asf feature      — add a feature
/asf bugfix       — major bugfix
/asf refactor     — architectural refactor
/asf status       — show current phase + state
/asf health       — run the code health gate (function/module/architecture)
/asf approve      — mark PLAN.md as approved (Gate 5)
/asf abort        — end the session (the legitimate way to end a run)
/asf passive      — silence steering for THIS run only (the three refusals stay)
```

## Dependencies (required)

| Package | Provides | Install |
|---|---|---|
| **pi-vigilant** | `capture_spec`, `get_task_specs`, `update_spec_status`, final verification | `pi install npm:pi-vigilant` |
| **pi-smart-web-search** | `web_search` | `pi install npm:pi-smart-web-search` |
| **pi-smart-fetch** | `web_fetch`, `batch_web_fetch` | `pi install npm:pi-smart-fetch` |
| **pi-aia-browser** | `browser_init`, `browser_navigate`, … (Playwright + Chromium, auto-installed) | `pi install npm:pi-aia-browser` |

**Optional:** `pi-intercom` (`intercom` — message other live pi sessions directly) is **not** a dependency; ASF works without it. Install it only if you want delegation between sessions: `pi install npm:pi-intercom`.

The extension warns at startup (and on `/asf` with no args) when any dependency is missing.

## Install

```bash
pi install npm:pi-aia-asf
```

Then `/reload`.

## How it works

- **Skill** (`skills/aia-asf/SKILL.md`) — the workflow itself, with per-phase reference guides in `references/`. The skill uses **progressive disclosure**: only SKILL.md (the phase flow + gates + a reference index) loads by default; each reference is a small single-concern doc the agent reads on demand when its phase needs it (the index's "Read when" column tells it which). Small work reads at most the testing + code-quality standards; large work reads the ones its phase calls for.
- **Extension** (`index.ts`) — `/asf` commands, per-project phase state (`~/.pi/agent/skills/aia-asf/projects/<project>/state.json`), dependency checks.
- **Specs shared with pi-vigilant** — ASF drives `capture_spec` during intake; pi-vigilant re-verifies every spec at task end and blocks "done" while MUST specs are open. One spec file, two systems.

## Code Health Gate

`/asf health` measures convolution **objectively** at three levels — function
(complexity, cognitive complexity, lines, depth, params), module (file lines,
duplication, circular imports) and architecture (optional dependency rules) —
and fails the gate when a threshold is crossed. It is **on by default** with
conservative thresholds; configure via `.asf-code-health.json` at the project
root (every level/metric can be disabled independently). For large work it is
**Gate 8** in `/asf verify`. See `skills/aia-asf/references/06e-code-health.md`.

```json
{
  "enabled": true,
  "gate": { "mode": "block", "scope": "large" },
  "missingTool": "warn",
  "function": { "complexity": { "max": 20 }, "maxDepth": { "max": 4 } },
  "module": { "duplication": { "thresholdPercent": 5 } }
}
```

Flags: `--diff` (compare vs committed `.asf-code-health-baseline.json`),
`--update-baseline`, `--json`. Tools are invoked via `npx --no-install` — they
must be project devDependencies (eslint, eslint-plugin-sonarjs, jscpd, madge,
dependency-cruiser); the gate never installs anything.

## Release policy (configurable)

Publishing is the user's decision **by default** — the factory prepares the
release and gets explicit approval. A project can define its own release
policy in `.asf-release.json` at the project root (optional):

```json
{
  "when": "when the full suite is green and the bump is patch/minor → publish automatically; when the bump is major → send for final review; when the suite is not green → fix first, never publish",
  "how": "To publish: connect with npm using the credentials in ~/.npmrc (2FA token; verify with `npm whoami`), sync git (`git pull --rebase`), run `npm run release <level>`, then verify the published version from the registry in a clean install..."
}
```

- **`when`** — user-stated conditional rules the ASF evaluates against the
  current state (suite green, bump scope, credentials) and acts on.
- **`how`** — user-stated instructions with all technical details; the ASF
  drives the release with judgment, not as a deterministic command list.
- No file → default: always send for final review; standard workflow in
  `references/07-release.md`.
- **Always test on publish / in production, if applicable** — verify the
  shipped artifact from the registry (clean-room install) or smoke-test prod.

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
