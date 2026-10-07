# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **06b Rule 19 — test selection for the inner loop (P25)**. Rule 10's
  "full test suite green (not a subset)" is a **gate**, and it stays exactly
  where it is: the run before a commit is always the full suite. What Rule 19
  relaxes is only the **intermediate red-green-refactor runs inside a single
  change** — the runs on code you are still editing. The rule is the user's
  own: **run a partial, impact-area subset only when certain that is
  warranted; if not certain, or the blast radius *might* be larger, always run
  full. Default is full** — so the burden of proof sits on the subset, and the
  cheap direction to be wrong in is also the safe one.
- **"Certain" is evidence, not a feeling.** A subset run must be preceded by a
  stated **impact statement** — changed files, tests selected, and *why nothing
  else can be reached*. Restating the file list does not qualify; no statement
  means not certain, which means full. On top of that, a **mechanical
  disqualifier list** removes judgment wherever "might be bigger" is the
  honest answer: shared/global state, dependencies and lockfile, build/test/CI
  config or the harness itself, schema/migrations/shared fixtures, public
  contracts and shared types, cross-module refactor/rename/move/delete — and
  **any changed file with no entry in the test-impact map**, so a project that
  has not built a map always runs full. The relaxation only ever applies where
  the mapping is known, never where it is guessed.
- **Deliberately not built**: the drafted coin toss and `iteration % N`
  counter are gone. An LLM cannot roll a dice — asked to flip one it picks the
  answer that skips the slow run — and an undefined iteration boundary means
  the trigger silently never fires. A subset streak also cannot survive a
  commit, because every commit is full-gated. Below a measured ~90s full-suite
  runtime the assessment is skipped entirely and the suite is just run.
- **Wired in**: `06b-testing-qa.md` Rule 10's checkbox now says in place that
  the gate never moves; `06-implementation.md` test-first steps 3 and 4 name
  the loop/gate split; `SKILL.md` gains two anti-patterns (a subset run with no
  impact statement, and a subset run passed off as the Rule 10 checkbox) and
  the index count moves to 19 rules. Covered by
  `test/test-test-selection.mjs` (26 assertions), which includes a regression
  guard that **fails if the coin-toss or iteration-counter design ever returns**.

## [0.9.2] - 2026-10-04

### Added

- **`references/06i-completeness.md` — the completeness standard (P24, mandatory)**.
  Newer models increasingly ship work that *looks* finished: a function whose body is
  a placeholder, a screen populated with invented records, a report citing a limit
  nobody checked. Green tests do not catch it — the tests get written against the
  stub, so the fake looks verified. The reference states the core rule (**ship the
  real thing, or say out loud what is not real**), the banned patterns (`TODO` /
  `not implemented` / `coming soon` on a user-reachable path, fake or seed data the
  user reads as their own, invented facts stated as checked, silently deferred scope,
  built-but-never-wired, mocks in production paths, config nothing sets), the
  exceptions that must be **declared, never silent** (the user asked for a scaffold,
  an approved deferral, a fake at a test seam), how to prove it is real (exercise each
  part through the entry point the user will use and name that action in the delivery
  report), and a completeness DoD.
- **Wired in, not bolted on**: Phase 6 gains a mandatory read block and discipline
  rule 11; Phase 7 gains the completeness DoD check; the anti-pattern list gains six
  entries (stub wearing a name, fake data the user reads as their own, invented facts
  stated as fact, quietly deferred scope, stub presented as complete because its own
  tests pass, unexplained deliberate stub); the reference index marks 06i as always
  read. Proportionality holds — small work reads only the core rule and the DoD.

### Requires

- The enforcement side lives in **pi-vigilant 0.6.2**, which scans the files a
  session changed for stub / fabricated-data / fact-hole markers at final
  verification and puts the `file:line` evidence in front of the agent. The rule and
  the check are the same proposal: the agent must finish the work or state the
  discrepancy.


## [0.9.1] - 2026-10-03

### Fixed

- **Extension no longer loads on pi >= 1.0** — pi 1.0 changed the command
  contract to `registerCommand(name, { description, handler })`, where
  `handler(args: string, ctx)` returns void and user-visible output goes
  through `ctx.ui.notify()`. `/asf` and `/asf-approve` were registered as bare
  functions taking `(args: string[], ctx)` and returning their text, so pi
  1.0.1 refused to load the package at all:
  `Command "/asf" registered by extension ".../index.ts" must define handler()`.
  Both commands now use the options-object form; the argument string is split
  into subcommand + flags and every gate report is notified. Subcommand
  behaviour is unchanged.

### Tests

- The test harness mock now enforces the real `RegisteredCommand` contract
  (it accepted any shape before, which is how this shipped) and exposes
  `invokeCommand()`, which calls a registered command exactly as pi does and
  captures `ctx.ui.notify()` output.
- New `test/test-command-contract.mjs` (16 checks): contract enforcement with a
  negative control, arg-as-string parsing, case-insensitive subcommands,
  void return, notify-based output, no bare-function registration left.


## [0.9.0] - 2026-09-27

### Added

- **Indexed reference structure (P-index)** — SKILL.md now carries a reference
  index table (file → covers → read when) so the agent finds the right
  section on demand; each reference is a small single-concern doc with a
  "Read when / Skip when" header. Default context cost is unchanged (SKILL.md
  only); large work reads at most the 3–4 references its phase needs.
- **`references/06f-stability.md`** — stability patterns (timeouts, bounded
  retries, circuit breaker, bulkheads, bounded result sets, fail fast,
  graceful shutdown) + error-handling design rules + observability DoD for
  service-like deliverables (health endpoint, structured logs, correlation
  IDs, runbook) (P06, P08, P07).
- **`references/06g-test-design.md`** — risk-based test derivation
  (likelihood × impact, technique selection table) + determinism rules
  (P10, P11).
- **`references/06h-security.md`** — one-page threat model (trust boundaries,
  STRIDE, registry), ASVS 5.0-based DoD with chapter/level selection,
  supply-chain & secrets gates, and the agent/tool-surface chapter (P15,
  P16, P17, P18).

### Changed

- **05-plan.md** — PLAN.md template extended: Decisions (ADRs, P01), Quality
  requirements (ISO 25010 scenarios, P02), Architecture evaluation (ATAM-lite,
  P03), optional Views (P04).
- **04-adversarial.md** — added security lens (threat model) and architecture
  lens (ATAM-lite) applied on every review (P15, P03).
- **06c-code-quality.md** — deep-module principle (interface simpler than
  implementation, P05), code smells in 5 groups (P09), characterization
  baseline for refactoring untested code (P13).
- **06b-testing-qa.md** — Rule 16 determinism (flaky = defect, P11), Rule 17
  delivery report fields incl. not-tested register (P14), Rule 18
  escaped-defect feedback loop (P21); DoD extended with delivery-report,
  stability and security lines.
- **06e-code-health.md** — report-only depth metric (P05) + supply-chain
  (npm audit/osv-scanner) and secrets (gitleaks) gates with config (P17).
- **07-release.md** — verify-first now re-runs the dependency/security check
  before every release (P17 RV loop).
- **06-implementation.md** — drift self-correction: named anti-patterns,
  stop → revert → self-correct → continue, escalate only on genuine
  conflicts (P20).
- **06d-delegation.md** — Part 3: independent reviewer gate for large work
  (fresh-context hostile reviewer, blockers vs suggestions, autonomous
  triage, human only on genuine conflicts) (P19).
- **SKILL.md** — ASF self-modification policy: facts may be updated in the
  same change; standards change only via the review process (P22).
- **test/test-improvements.mjs** — new suite (84 checks) verifying the
  indexed structure and that each proposal landed in its designated file.
- **Configurable release policy (P23)** — `.asf-release.json` at the project
  root (optional): `when` (user-stated conditional rules: "when X is true,
  publish automatically; when Y is true, do this…") and `how` (user-stated
  instructions with all technical details that the ASF drives with judgment,
  not a deterministic command list). Default with no file = current stance
  (always send for final review); user definition takes precedence.
  **Test on publish / in production, if applicable — always** (package →
  clean-room registry install + observable end state; deployed app → prod
  smoke test). The ASF's own release procedure is codified via the same
  mechanism (repo `.asf-release.json`).

## [0.8.1] - 2026-09-25

### Added

- (describe changes for 0.8.1)


## [0.8.0] - 2026-09-12

### Added

- **Code Health Gate** — objective, configurable measurement of code
  convolution at three levels, replacing pure judgment with measurable
  thresholds (references/06e-code-health.md):
  - **function** — cyclomatic complexity (20), cognitive complexity (15),
    lines per function (50), nesting depth (4), parameters (3) via eslint
    (`--rule` flags, not the project's own config);
  - **module** — lines per file (300) via eslint, duplication (5% / min 5
    lines / 50 tokens) via jscpd, circular imports (any cycle = fail) via
    madge;
  - **architecture** — optional dependency-cruiser rules (off by default).
- **`/asf health`** — runs the gate and prints a `metric | value | threshold |
  status` table with a verdict; exit 1 when the gate fails. Flags: `--diff`
  (regression trend vs the committed baseline), `--update-baseline`, `--json`.
- **Gate 8 in `/asf verify`** — large work runs the code health gate after the
  M1 traceability matrix; block mode fails the gate, warn mode reports only.
- **`.asf-code-health.json`** — optional project config, merged over defaults
  (defaults ← project ← CLI). On/off at every level: master `enabled`,
  per-level, per-metric. `gate.mode` block|warn, `gate.scope` large|all|off,
  `missingTool` warn|fail, `toolTimeoutSeconds` (default 120s, Rule 15).
- **Committed baseline** — `.asf-code-health-baseline.json` is committed so the
  trend survives across machines/CI; `--diff` flags any regression.
- **Test suites** — `test/test-code-health.mjs` (73 checks: pure modules,
  pipeline triggers + non-triggers with fake tools, real-exec timeout,
  real-eslint integration) and `test/test-code-health-ext.mjs` (12 checks
  through the real `/asf health` + `/asf verify` command handlers with a real
  eslint).

## [0.7.0] - 2026-09-11

### Added

- **Absolute wait ceiling — 30 minutes (06b Rule 15)** — no single wait may
  exceed 30 min (1800s). Addresses the reported failure where tool calls waited
  forever for the system to react and the whole process kept hanging,
  especially during testing. The ceiling is a **backstop, never a substitute**
  for a real per-call bound: a 30s suite still gets ~120s, and a lone 1800s
  bound is treated as not having bounded anything. Hitting the ceiling means
  kill the wait and diagnose the blocking cause — it is a bug signal, not
  patience.
- **Explicit per-run waiver** — the ceiling can be disabled, but only
  deliberately and only for a **single run**: stated before running, with the
  reason and a finite larger bound. A waiver does not persist, does not carry
  over, and resets immediately afterwards. Blanket/standing waivers are
  disallowed; repeated need for waivers is a setup defect to report (Rule 11).
- **"Every waiting call carries its own explicit timeout"** — makes the rule
  cover *every* tool call or command that waits on the system, not just the
  obviously slow ones, with testing called out as the highest-risk area
  (harnesses, servers, daemons, browsers hanging on ports, locks and prompts).
  Bounds are sized from the stated expected duration with headroom.
- New Definition-of-Done item for the ceiling; ceiling applies at **both
  scales** (small work is not exempt).
- **Durable test suite in `test/`** — the ASF suites were previously only in
  `/tmp` and would have been lost. `npm test` now runs 67 checks (timeouts,
  ceiling, delegation, docs-rule) against the real shipped skill text;
  `test/setup.sh` prepares the jiti harness against the installed pi.

### Verification

- 67/67 checks pass (`npm test`): 13 timeouts, 17 ceiling, 19 delegation,
  18 docs-rule.
- The 17 new ceiling checks were confirmed to **fail 11/17 on the pre-change
  text** before implementation, proving they assert real content.
- SKILL.md YAML frontmatter re-verified as parsing (pi silently skips skills
  with malformed frontmatter).


## [0.6.1] - 2026-08-28

### Removed

- **pi-intercom is no longer a dependency** (reversal of the 0.4.0 addition,
  per user decision): removed from `dependencies` in package.json and from the
  runtime dependency check — `/asf` summary is back to the four required
  packages (pi-vigilant, pi-smart-web-search, pi-smart-fetch, pi-aia-browser).
  ASF works fully without it; intercom is documented as an **optional** tool
  (`pi install npm:pi-intercom`) in the README, 06d-delegation.md, and the
  SKILL.md delegation note. Rationale: a hard dependency broke the workspace
  installer's `--skip=pi-intercom` semantics (npm pulled it back in via
  pi-aia-asf), and delegation is a nice-to-have, not a requirement.

## [0.6.0] - 2026-08-28

### Added

- **06c Rule 9 — Documents are code: refactor them when they outgrow
  editability** (new mandatory rule, Ai Applied tenet): when a document starts
  causing writing/editing issues (edit-tool matching failures, truncation,
  multi-topic bloat, every change touching the same big file), it is time to
  refactor it — split by topic, keep the parent as an index/map, keep
  cross-references exact, preserve content (Rule 8 applied to documents),
  verify, and refactor before it hurts rather than after.
- **Wiring**: 06c "Where this applies" (Phase 6 + Phase 7), 06c anti-patterns
  (letting a document grow until edits break; wall-of-prose SKILL.md), SKILL.md
  Phase 6 note, Phase 7 modularity DoD (documents too), SKILL.md anti-pattern,
  and the reference index (now 9 rules).

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
