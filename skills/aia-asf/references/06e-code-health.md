# 06e — Code Health Gate

**Status: mandatory for large work (gate blocks), advisory for small work.**

The Code Health Gate is the objective counterpart to the judgment-based rules
in [06c-code-quality.md](06c-code-quality.md). Where 06c tells you *what* good
code looks like, 06e *measures* it and fails the gate when the measurement
crosses a threshold. It exists because judgment alone does not catch gradual
convolution: a function that grows 5 lines per cycle never triggers a review
until it is unreadable.

## 1. What it measures

Three levels, each with objective thresholds (all configurable):

| Level | Metric | Tool | Default threshold |
|---|---|---|---|
| function | cyclomatic complexity | eslint `complexity` | 20 |
| function | cognitive complexity | eslint `cognitive-complexity` (sonarjs) | 15 |
| function | lines per function | eslint `max-lines-per-function` | 50 |
| function | nesting depth | eslint `max-depth` | 4 |
| function | parameters | eslint `max-params` | 3 |
| module | lines per file | eslint `max-lines` | 300 |
| module | duplication | jscpd | 5% (min 5 lines / 50 tokens) |
| module | circular imports | madge `--circular` | any cycle = fail |
| architecture | dependency rules | dependency-cruiser | opt-in (off by default) |

Metrics for languages the project does not use are silently skipped. Metrics
whose tool is not installed are skipped (or fail the gate when
`missingTool: "fail"`).

## 2. Invocation

```
/asf health                # run the gate, print the report
/asf health --diff         # compare against the committed baseline
/asf health --update-baseline   # commit current values as the new baseline
/asf health --json         # machine-readable output
```

`/asf verify` (large work) runs the gate as **Gate 8** after the M1
traceability matrix. Small work shows the report but never blocks.

## 3. Configuration

Optional `.asf-code-health.json` at the project root. Merged over the defaults
(defaults ← project file ← CLI flags). Every level and every metric can be
switched on/off independently.

```json
{
  "enabled": true,
  "gate": { "mode": "block", "scope": "large" },
  "missingTool": "warn",
  "toolTimeoutSeconds": 120,
  "function": {
    "complexity": { "max": 20 },
    "cognitiveComplexity": { "max": 15 },
    "maxLinesPerFunction": { "max": 50 },
    "maxDepth": { "max": 4 },
    "maxParams": { "max": 3 }
  },
  "module": {
    "maxFileLines": { "max": 300 },
    "duplication": { "thresholdPercent": 5, "minLines": 5, "minTokens": 50 },
    "circularDependencies": {}
  },
  "architecture": {
    "dependencyRules": { "enabled": false, "config": ".asf-code-health.rules.mjs" }
  },
  "ignore": ["**/node_modules/**", "**/dist/**", "**/test/**", "**/*.test.*"]
}
```

Semantics:

- `enabled: false` — the gate is off entirely; `/asf health` reports
  "disabled" and the gate never fires.
- `gate.mode: "block"` (default) — violations fail the gate (exit 1).
  `"warn"` — violations are reported but the gate passes.
- `gate.scope: "large"` (default) — the gate blocks only large work.
  `"all"` — blocks small work too. `"off"` — never blocks.
- `missingTool: "warn"` (default) — a missing tool skips its metrics.
  `"fail"` — a missing tool fails the gate (you cannot verify what you
  cannot measure).
- `toolTimeoutSeconds` — hard bound on every tool spawn (Rule 15). A tool
  that exceeds it is killed and its metrics become errors.

## 4. Baseline & trend

`.asf-code-health-baseline.json` is **committed** so the trend survives across
machines and CI. `--diff` flags any metric that regressed since the baseline;
`--update-baseline` records the current values (run it deliberately, when the
code is in a state you want to hold the line at).

## 5. Tooling

Tools are invoked via `npx --no-install` — they must be devDependencies of the
project, never dependencies of pi-aia-asf. eslint is invoked with `--rule`
flags (not the project's own config) so the gate measures against *its*
thresholds, independent of what the project has configured. The gate never
installs anything.

## 6. Rules

1. **Run it before delivery.** Large work cannot be delivered with a failing
   gate (unless the user explicitly overrides).
2. **Fix the cause, not the threshold.** Raising a threshold requires a
   written justification in the commit message; silently raising it to make
   the gate pass is a violation of 06c Rule 1.
3. **The gate is a floor, not a ceiling.** Passing thresholds does not mean
   the code is good — 06c rules still apply.
4. **Never disable the gate to ship.** If a metric is genuinely inapplicable,
   disable that metric in `.asf-code-health.json` with a comment in the
   commit message, not the whole gate.
