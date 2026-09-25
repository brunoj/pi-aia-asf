# Code Health Gate — Implementation Plan

**Status:** draft — awaiting user approval (Gate 5)
**Target release:** pi-aia-asf 0.8.0 (minor — new feature)
**Owner:** Bruno Jakic / Ai Applied

---

## 1. Goal

ASF must help produce **nice, readable, maintainable code and architectural
solutions** — not just working code. Today the modularity standard
(`references/06c-code-quality.md`) is prescriptive but **judgment-based**:
the agent is told to extract modules when a function exceeds ~100 lines, but
nothing *measures* anything, nothing *monitors* an existing codebase for drift,
and the Phase 7 DoD boxes are self-assessed by the same agent that wrote the
code.

This plan adds a **Code Health Gate**: an objective, configurable, gated
measurement of convolution at three levels — **function**, **module**,
**architecture** — that runs on demand (`/asf health`), at delivery
(Phase 7 DoD), and as a blocking gate for large work (`/asf verify`).

The feature is **on by default** (`enabled: true`) with **sensible
conservative defaults**, so a project gets the gate automatically; the config
file only overrides.

---

## 2. Configuration

### 2.1 Where it lives

- **File:** `.asf-code-health.json` at the **project root** (the project ASF
  is working on — never inside ASF itself).
- **Optional:** no file = all defaults apply (feature is on, sensible values).
- The runner merges: **built-in defaults ← project config ← CLI flags**.

### 2.2 Full schema with defaults

```jsonc
{
  // ── master switch (default true) ─────────────────────────────────────
  "enabled": true,

  // ── gate semantics ───────────────────────────────────────────────────
  "gate": {
    // "block"  — a failed health check blocks delivery (Phase 7 / /asf verify)
    // "warn"   — failures are reported, delivery proceeds
    "mode": "block",
    // "large"  — gate enforced only for large work (like the M1 traceability gate)
    // "all"    — enforced for small work too
    // "off"    — never blocks; /asf health still reports
    "scope": "large"
  },

  // What happens when a metric is enabled but its tool is not installed:
  // "warn" — report shows SKIPPED (tool not found); gate does not fail on it
  // "fail" — gate fails: an enabled metric with no tool is a false green
  "missingTool": "warn",

  // ── level 1: function ────────────────────────────────────────────────
  "function": {
    "enabled": true,
    "complexity":           { "enabled": true, "max": 20 },
    "cognitiveComplexity":  { "enabled": true, "max": 15 },
    "maxLinesPerFunction":  { "enabled": true, "max": 50 },
    "maxDepth":             { "enabled": true, "max": 4 },
    "maxParams":            { "enabled": true, "max": 3 }
  },

  // ── level 2: module ──────────────────────────────────────────────────
  "module": {
    "enabled": true,
    "maxFileLines":         { "enabled": true, "max": 300 },
    "duplication": {
      "enabled": true,
      "thresholdPercent": 5,   // fail when >= 5% of lines are duplicated
      "minLines": 5,           // ignore clones smaller than this
      "minTokens": 50          // ignore clones smaller than this
    },
    "circularDependencies": { "enabled": true }   // any cycle = fail
  },

  // ── level 3: architecture ────────────────────────────────────────────
  "architecture": {
    "enabled": true,
    // Optional dependency-cruiser rule file (project root). When present and
    // enabled, violations of its rules (layering, no-circular, no-orphans,
    // dependency direction) fail the gate. Off by default: no rule file is
    // imposed on a project that did not write one.
    "dependencyRules": { "enabled": false, "config": ".asf-code-health.rules.mjs" }
  },

  // ── what is never measured ───────────────────────────────────────────
  "ignore": [
    "**/node_modules/**",
    "**/dist/**",
    "**/build/**",
    "**/coverage/**",
    "**/test/**",
    "**/tests/**",
    "**/__tests__/**",
    "**/fixtures/**",
    "**/*.test.*",
    "**/*.spec.*"
  ]
}
```

### 2.3 On/off selection — every level, every metric

| Switch | Default | Effect |
|---|---|---|
| `enabled` | `true` | Master switch. `false` → `/asf health` reports "disabled", gate never fires. |
| `gate.mode` / `gate.scope` | `block` / `large` | Whether and when a failed check blocks delivery. |
| `function.enabled` | `true` | Whole function level. |
| `function.<metric>.enabled` | `true` | Individual metric. |
| `module.enabled` / `module.<metric>.enabled` | `true` | Same, module level. |
| `architecture.enabled` | `true` | Architecture level (dependencyRules sub-switch default `false`). |
| `missingTool` | `warn` | Enabled metric + missing tool → skip (warn) or fail. |

### 2.4 Why these defaults (sensible, conservative)

- **complexity 20** — ESLint's own default; flags genuinely tangled control
  flow, not normal branching.
- **cognitiveComplexity 15** — SonarJS recommended default; catches nesting
  that cyclomatic complexity misses.
- **maxLinesPerFunction 50** — ESLint's default; a 50-line function is still
  comfortably readable.
- **maxDepth 4 / maxParams 3** — ESLint defaults.
- **maxFileLines 300** — ESLint's default; above this, a file is doing more
  than one thing (06c Rule 1).
- **duplication 5%** — jscpd's own docs use 5% as the example gate; below it
  is normal (boilerplate, generated-like code), above it is copy-paste debt.
- **circularDependencies: any cycle = fail** — cycles are never acceptable
  (06c Rule 6: one-way dependencies); madge `--circular` exits non-zero.
- **dependencyRules off by default** — layering rules are project-specific;
  imposing none is honest. When a project writes its rule file, it opts in.

---

## 3. Architecture

### 3.1 Modules (one responsibility each — 06c Rule 1)

```
skills/aia-asf/references/06e-code-health.md   ← the standard (doc, SSOT for rules)
lib/code-health/config.mjs                     ← defaults + merge + validation (pure)
lib/code-health/detect.mjs                     ← language/tool detection (pure)
lib/code-health/run.mjs                        ← spawn tools, collect results (pure-ish)
lib/code-health/report.mjs                     ← aggregate, threshold, pass/fail (pure)
lib/code-health/index.mjs                      ← CLI entry: /asf health (thin)
index.ts                                       ← /asf health command + verify gate + DoD
test/test-code-health.mjs                      ← fixture suite
```

### 3.2 Boundaries and data flow (one-way)

```
.asf-code-health.json ──► config.mjs ──► detect.mjs ──► run.mjs ──► report.mjs ──► index.mjs
                                                                              │
project files ───────────────────────────────────────────────────────────────┘
                                                                              ▼
                                                          /asf health (report to user)
                                                          /asf verify (gate section)
                                                          Phase 7 DoD (checklist line)
```

- `config.mjs` — pure: defaults + project JSON + CLI overrides; no IO beyond
  reading the config file it is given. **SSOT for all thresholds** (Rule 2).
- `detect.mjs` — pure: given the project root, decide which languages are
  present (package.json/tsconfig → JS/TS; pyproject → Python; …) and which
  tools are available (spawn `npx --no-install <tool> --version`). A metric
  whose languages are absent is **silently skipped** (not a failure — ASF
  works on any language); a metric whose language is present but whose tool is
  missing follows `missingTool`.
- `run.mjs` — spawns the tools with the project's own devDependencies
  (`npx --no-install`), bounded by an explicit timeout (06b Rule 15: every
  wait carries its own bound; default 120s per tool, configurable via
  `toolTimeoutSeconds`). Never installs anything.
- `report.mjs` — pure: metric → value → threshold → status
  (`pass` / `fail` / `skipped` / `disabled`); produces the table and the
  overall verdict. Fully unit-testable without any tool installed.
- `index.mjs` — thin CLI: parse args (`--diff`, `--json`, `--verbose`),
  orchestrate, print. Testable standalone (06c Rule 4: same modules in tests
  and production).

### 3.3 Tools (project devDeps, never ASF deps)

| Metric | Tool | Invocation | Fails when |
|---|---|---|---|
| complexity / maxDepth / maxParams / maxLinesPerFunction | `eslint` | `npx --no-install eslint --format json <files>` (rules via `--rule` flags, no project config required) | any violation |
| cognitiveComplexity | `eslint-plugin-sonarjs` | same, if plugin present | any violation |
| maxFileLines | `eslint` (`max-lines`) | same | any violation |
| duplication | `jscpd` | `npx --no-install jscpd --threshold <n> --min-lines <n> --min-tokens <n> --reporters json <files>` | exit != 0 |
| circularDependencies | `madge` | `npx --no-install madge --circular --extensions ts,js,tsx,jsx <entry>` | exit != 0 |
| dependencyRules | `dependency-cruiser` | `npx --no-install depcruise --config <file> --fail-on <rules> <files>` | exit != 0 |

**Why `--rule` flags instead of a generated ESLint config:** the gate must not
depend on the project's own lint config (which may be absent, or may already
disable these rules). The gate measures *its* thresholds, explicitly, and
reports them. If the project has its own stricter config, that is additive.

---

## 4. Gate semantics

1. **`/asf health`** — always available. Runs the checks, prints the table:
   `metric | value | threshold | status`, then the verdict
   (`HEALTHY` / `N VIOLATIONS`). Exit code 0/1. `--diff` compares against the
   previous run's report (stored at `.asf/code-health-last.json`, project
   root, gitignored) and flags **what got worse** — the trend signal that
   triggers refactoring before a file becomes unreadable.
2. **Phase 7 DoD** — new checklist line (06b Rule 10): "Code Health Gate
   passed (or `enabled: false` / `gate.mode: warn` with the report shown)".
3. **`/asf verify`** (large work) — a new section after the M1 traceability
   matrix: `CODE HEALTH (Gate 8):` with the verdict. `gate.mode: block` +
   `gate.scope: large` → a failed gate is listed as a FAIL row, same as a
   broken traceability row.
4. **Small work** — `/asf health` is still run and reported (the agent shows
   the table), but `gate.scope: large` means it never blocks the automatic
   small-work flow. `gate.scope: all` opts into blocking for small work too.
5. **Refactor work** — the health report is the **input evidence** for
   `ASF: refactor` intake: the plan must name the metric it brings back under
   threshold, and Phase 7 re-runs health and asserts the metric improved
   (the refactor's regression test *is* the gate).

---

## 5. Reliability mechanisms (why this works, not just a wish)

1. **Objective thresholds** — every rule is a number. "Too convoluted" is
   decided by `complexity > 20`, not by the agent noticing.
2. **Independent signal** — the measurement comes from eslint/jscpd/madge,
   not from the agent's self-assessment. The agent cannot "forget" the DoD
   box when the gate fails.
3. **Gated, not suggested** — `gate.mode: block` + `gate.scope: large` makes
   it a delivery blocker, exactly like the M1 traceability matrix.
4. **Traceable like specs** — the runner is a real script with a fixture
   suite: a god-file fixture fails, a clean fixture passes, a cycle fixture
   fails, a duplication fixture fails (triggers **and** non-triggers, 06b
   Rule 7). The gate's own regression test is the fixture suite.
5. **No false green from missing tools** — a metric whose language is present
   but whose tool is missing is visibly `SKIPPED (tool not found)` in the
   report; `missingTool: "fail"` turns that into a gate failure. A metric for
   an absent language is skipped silently (ASF works on any language).
6. **Bounded, never hanging** — every tool spawn carries an explicit timeout
   (default 120s, `toolTimeoutSeconds` configurable); a hung linter fails the
   check instead of stalling the session (06b Rule 15).

---

## 6. Test plan (fixtures, triggers AND non-triggers)

`test/test-code-health.mjs` — drives `lib/code-health/*` directly (pure
modules) plus one integration path through `index.mjs` with real tools where
available (eslint/jscpd/madge are devDeps of the fixture, not of ASF; if
absent, the integration test asserts the graceful-skip path instead).

| # | Fixture | Expect |
|---|---|---|
| 1 | clean small project (few small functions, no dup, no cycle) | `HEALTHY`, exit 0 |
| 2 | god-file: one 500-line function, nesting depth 6 | `fail` on maxLinesPerFunction / maxDepth / maxFileLines |
| 3 | two files with a 40-line copy-pasted block | `fail` on duplication (≥5%) |
| 4 | `a.ts` imports `b.ts` imports `a.ts` | `fail` on circularDependencies |
| 5 | config: `function.complexity.max: 30` on fixture 2 | `pass` (threshold raised) |
| 6 | config: `module.enabled: false` on fixture 3 | duplication skipped, `pass` |
| 7 | config: `enabled: false` | report "disabled", exit 0, no tools spawned |
| 8 | config: `gate.mode: warn` on fixture 2 | verdict "N VIOLATIONS (warn)" but exit 0 |
| 9 | config: `missingTool: fail` + eslint absent | gate fails with "tool not found" |
| 10 | Python-only project (no JS/TS) | JS metrics silently skipped, `HEALTHY` |
| 11 | config merge: project overrides one value, rest default | only the override changes |
| 12 | `--diff`: run on fixture 3 after adding the copy-paste | flags duplication as **new/worse** |
| 13 | tool timeout: fake `eslint` that sleeps | fails with timeout, does not hang |

Plus: `test-docs-rule.mjs` extension — `06e-code-health.md` exists and is
referenced from SKILL.md (documents-are-code, Rule 9: the reference doc stays
a focused map, not a wall).

---

## 7. Implementation phases

1. **`lib/code-health/config.mjs`** — defaults + merge + validation. Pure.
   Unit tests 5–8, 11.
2. **`lib/code-health/detect.mjs`** — language/tool detection. Unit tests 9, 10.
3. **`lib/code-health/report.mjs`** — aggregation + verdict. Unit tests 1–8.
4. **`lib/code-health/run.mjs`** — tool spawning with timeouts. Unit tests
   2–4, 13 (fake tools on PATH).
5. **`lib/code-health/index.mjs`** — CLI (`/asf health`, `--diff`, `--json`).
   Integration test 12.
6. **`references/06e-code-health.md`** — the standard: metric table, defaults,
   config schema, gate semantics, anti-patterns (god-file, copy-paste,
   cycle, layer violation, "refactor for fun"). Keep it a map, not a wall.
7. **`index.ts`** — `/asf health` subcommand; `/asf verify` Gate 8 section;
   Phase 7 DoD line in SKILL.md; Phase 4/5 mentions (adversarial: run
   `/asf health` on the existing code; PLAN.md: name the metric a refactor
   brings under threshold).
8. **README + CHANGELOG** — config table, defaults, gate semantics.
9. **Release 0.8.0** — test first (full suite + fixture suite), version bump,
   CHANGELOG, annotated tag, push, `npm publish`, local install.

---

## 8. Open decisions (for the user)

1. **`gate.scope` default `large`** — small work gets the report but no
   block. OK, or should small work also block (`all`)?
2. **`missingTool` default `warn`** — visible skip, not a hard fail. OK, or
   should it default to `fail` for strictness (a project with eslint metrics
   enabled but no eslint installed would be blocked until installed)?
3. **`dependencyRules` off by default** — layering rules are opt-in via a
   project rule file. OK, or should ASF ship a small default rule set
   (e.g. `no-circular`, `no-orphans`) that projects can extend?
4. **`toolTimeoutSeconds` default 120s** per tool spawn. OK?
5. **Baseline file location** `.asf/code-health-last.json` (gitignored) for
   `--diff`. OK, or should the baseline be committed (`.asf-code-health-baseline.json`)
   so the trend survives across machines/CI?
