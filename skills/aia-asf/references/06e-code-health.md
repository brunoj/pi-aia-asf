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
| design | module depth (interface vs implementation) | report-only heuristic | report-only (never gates) |
| supply chain | dependency vulnerabilities | npm audit / osv-scanner | warn (high/critical fails) |
| secrets | secrets in repo | gitleaks | warn (any finding fails) |
| model | undeclared cascade / rebuild-by-delete | built-in scan (P27) | any finding fails |

**Depth metric (P05, report-only):** a heuristic that flags **shallow
pass-through modules** — modules whose interface is nearly as large as their
implementation (e.g. a wrapper that forwards every call with no added
abstraction). It is **never a gate**: depth is a judgment call (06c Rule 1
Deep modules), and the heuristic only *surfaces candidates* for review.

**Supply chain & secrets (P17):** `npm audit`/`osv-scanner` and `gitleaks`
run as part of the gate. They are **warn by default** (report, don't block)
for small work; for large work a high/critical vulnerability in a runtime
dependency or any secret finding blocks delivery. See
`references/06h-security.md` for the full rules.

**Model level (P27):** two objective fitness functions over persistence code —
a cascade with no ownership declaration, and the delete-then-reinsert signature.
Built in (no tool to install, so it can never be skipped for a missing
dependency), and it reports the concrete `file:line` and the fix. It is a
**tripwire, not an authority**: the pattern set is illustrative and
store-agnostic in principle, so a clean scan means it caught nothing, not that
the model is sound — the obligation sits in the DoD (06b Rule 20) and the
invariant tests (06g §3). Full rules in
[06j-data-model.md](06j-data-model.md).

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

All three paths — the `/asf health` command, `/asf verify`, and the
**`asf_health` tool** — record the verdict as evidence, so any of them closes the
completion gate's health gap. An autonomous run uses the tool: a slash command is
something the agent cannot type, and a gap it cannot close is a bug, not a gate.

**What `scanned` counts.** It is the number of metrics that actually ran
(pass/fail), never the number of metrics planned. Skipped metrics (tool not
installed, level off) and disabled ones (no persistence in the project) are not
in it, and neither are rows that errored. So `scanned: 0` means the gate examined
nothing — which the ledger prints as *"examined nothing, not a pass"* rather than
letting a green-looking line summarise a measurement of nothing at all. If every
metric is skipped, installing the toolchain is what closes the gap properly;
re-running the gate does not.

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
  "model": {
    "enabled": true,
    "requireDeclaration": true,
    "deleteRebuild": true,
    "declarationWindowLines": 8,
    "rebuildWindowLines": 30,
    "extraCascadePatterns": []
  },
  "supplyChain": {
    "npmAudit": { "enabled": true, "failOn": "high" },
    "osvScanner": { "enabled": false }
  },
  "secrets": {
    "gitleaks": { "enabled": true }
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
   disable that metric in `.asf/code-health.json` (the old root
   `.asf-code-health.json` is still read, so projects configured before the move
   keep their thresholds) with a comment in the commit message, not the whole gate.

## When the gate itself is the problem: `asf_evidence_check`

Every rule above has the same shape: the gate demands evidence, and there is an agent
action that produces it. When that symmetry breaks, the run does not fail — it is
steered, and steered, and steered, at a gap its own hands cannot close. That is the
2026-11-07 loop, and it has reappeared three times in different clothes: a health
verdict only a slash command could record, browser verification no tool could write, a
delivery report rendering sections nothing ever produced.

So the symmetry is now checked rather than hoped for. `asf_evidence_check` reads
ASF's own installed files and answers one question: does every evidence kind a gate
requires have something in the package that can record it?

```
asf_evidence_check                       # whole picture: sound, or broken and how
asf_evidence_check { kind: "browser-verify" }   # who records this kind, or nobody
```

**If it reports an unproducible required kind, stop trying to close the gap.** That is
a broken install, not unfinished work — no amount of effort produces evidence nothing
in the package can write. Say so, and say what it named.

The same invariant is asserted against the repository in
`test/test-evidence-kinds.mjs`, and against the copy npm actually serves in
`scripts/verify-published.mjs` — the test directory is not shipped, so without that
last one a broken tarball would reproduce the loop for every user while the repo
stayed green.
