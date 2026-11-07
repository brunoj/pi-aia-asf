/**
 * Evidence ledger (P42) — claims become artefacts.
 *
 * Today "I ran the full suite" and "I did not run the full suite" are two
 * sentences with no observable difference, so a completion gate has nothing to
 * check against. This module is the thing that makes P41's checks possible.
 *
 * **The rule that decides whether any of this is worth anything: entries are
 * written by the extension, derived from observed tool traffic, and there is no
 * model-callable way to append one.** If the agent could append an entry it
 * would append a convenient one, and the ledger would be theatre. The agent's
 * account of itself is testimony; what the extension watched happen is evidence.
 *
 * Entries are durable and excluded from model context (pi's documented use for
 * `appendEntry`), so this costs no prompt budget — which matters given how
 * dense ASF's instructions already are.
 *
 * Where a value cannot be observed without guessing, it is `unknown`, never 0
 * and never inferred: a check that examined nothing reports scanned: 0 and is
 * not a pass.
 */

/** Entry kinds the ledger accepts. Anything else is rejected at append time. */
export const ENTRY_KINDS = [
  "suite-run",
  "health-run",
  "browser-verify",
  "browser-na",
  "clean-room",
  "spec-transition",
  "gate-verdict",
  "gate-block",
  "perf-scenario",
];

/**
 * Validate an entry's shape. An entry with the wrong shape is not evidence of
 * anything, and a gate that gates on shape cannot accept a prose claim.
 */
/** Per-kind validators: a table, so a new kind is a row and not a new branch. */
const VALIDATORS = {
  "suite-run": (e) => {
    if (typeof e.command !== "string" || !e.command.trim()) return "suite-run requires command";
    if (typeof e.exitCode !== "number") return "suite-run requires exitCode (number)";
    if (typeof e.durationMs !== "number") return "suite-run requires durationMs (number)";
    if (!("testCount" in e)) return "suite-run requires testCount (number, or 'unknown')";
    if (e.testCount !== "unknown" && typeof e.testCount !== "number")
      return "suite-run testCount must be a number or the string 'unknown'";
    return null;
  },
  "health-run": (e) => {
    if (!["small", "standard", "major"].includes(e.level)) return "health-run requires level (small|standard|major)";
    if (!["pass", "warn", "fail"].includes(e.verdict)) return "health-run requires verdict (pass|warn|fail)";
    if (typeof e.scanned !== "number") return "health-run requires scanned (number)";
    return null;
  },
  "browser-verify": (e) => need(e, "page") || need(e, "action") || need(e, "assertion"),
  "browser-na": (e) => need(e, "reason"),
  "clean-room": (e) => need(e, "package") || (["pass", "fail"].includes(e.result) ? null : "clean-room requires result (pass|fail)"),
  "spec-transition": (e) => need(e, "specId") || need(e, "status") || need(e, "evidence"),
  "gate-verdict": (e) => {
    if (need(e, "gate")) return need(e, "gate");
    if (typeof e.fired !== "boolean") return "gate-verdict requires fired (boolean)";
    if (typeof e.scanned !== "number") return "gate-verdict requires scanned (number)";
    return null;
  },
  "gate-block": (e) => need(e, "gate") || need(e, "rule") || need(e, "reason"),
  "perf-scenario": (e) =>
    need(e, "name") || need(e, "arrivalModel") || need(e, "duration") || need(e, "environment") || need(e, "labOrField"),
};

function need(entry, k, t = "string") {
  if (typeof entry[k] !== t || (t === "string" && !entry[k].trim())) return `${entry.kind} requires "${k}" (${t})`;
  return null;
}

export function validateEntry(entry) {
  if (!entry || typeof entry !== "object") return "entry is not an object";
  if (!ENTRY_KINDS.includes(entry.kind)) return `unknown entry kind "${entry.kind}"`;
  const validate = VALIDATORS[entry.kind];
  if (!validate) return `unhandled entry kind "${entry.kind}"`;
  return validate(entry);
}

/**
 * The ledger itself. In-memory per session, persisted through `pi.appendEntry`
 * by the caller (index.ts) — this module is pure so it can be tested without a
 * host.
 */
export function createLedger() {
  /** @type {Array<object>} */
  const entries = [];
  /** @type {Array<string>} */
  const rejected = [];

  return {
    entries,
    rejected,
    /**
     * Append an entry. Invalid entries are REJECTED AND RECORDED, never
     * silently dropped: a ledger that quietly loses entries is worse than one
     * that refuses loudly, because the completion gate would then report an
     * absence as if it were a fact.
     */
    append(candidate, { at = new Date().toISOString() } = {}) {
      const problem = validateEntry(candidate);
      if (problem) {
        rejected.push(`${problem}`);
        return { ok: false, error: problem };
      }
      const entry = { ...candidate, at };
      entries.push(entry);
      return { ok: true, entry };
    },
    has(kind, predicate) {
      return entries.some((e) => e.kind === kind && (!predicate || predicate(e)));
    },
    count(kind) {
      return entries.filter((e) => e.kind === kind).length;
    },
    latest(kind) {
      for (let i = entries.length - 1; i >= 0; i--) if (entries[i].kind === kind) return entries[i];
      return null;
    },
  };
}

// ─── Derivation from observed tool traffic ─────────────────────────────────
//
// These functions turn "the extension watched a tool run" into an entry. They
// are the only way entries get created, which is the whole point.

/**
 * Recognise a full test-suite run from a bash invocation and its outcome.
 * Returns null when the command is not a test run — an unrecognised command is
 * not evidence, and is not silently counted as one either.
 */
/**
 * Test-runner recognition. The first version matched `npm test`/vitest/jest/
 * pytest/go/cargo/make only; on the real traces that missed 64% of test
 * invocations (custom runners: `bash test/run-all.sh`, `node test-runner.js`,
 * `timeout 300 node tests/e2e/x.test.js`). Under the completion floor a missed
 * runner is a false "no test ran" steer, so the net is wide and the subset rule
 * is explicit: a run naming one test file is a subset, a runner script is full.
 */
const TEST_RUNNER = new RegExp(
  [
    String.raw`(^|[\s&;|(])(npm|pnpm|yarn|bun)\s+(run\s+)?test(:[\w-]+)?\b`,
    String.raw`\b(vitest|jest|pytest|mocha|ava|tap|rspec|phpunit|minitest|nextest)\b`,
    String.raw`\b(go|cargo|deno|bun|dotnet|mvn|gradle|gradlew|mix|swift|zig|make|just|tox|nox)\s+test\b`,
    String.raw`\bpython3?\s+-m\s+(pytest|unittest)\b`,
    String.raw`\bnpx\s+(playwright|vitest|jest|mocha)\s+test\b|\bnpx\s+(vitest|jest|mocha)\b`,
    String.raw`\bnode\s+--test\b`,
    // runner scripts: run-all.sh, test-runner.js, run_tests.py, scripts/test.sh
    String.raw`(^|[\s/])(run[-_]?all|test[-_]?runner|run[-_]?tests?|tests?)\.(sh|js|mjs|cjs|ts|py)\b`,
    // a test file executed directly: node tests/x.test.js, tsx foo.spec.ts
    String.raw`\b(node|tsx|ts-node|bun|deno\s+run|python3?)\s+[^\s|;&]*\.(test|spec)\.(js|mjs|cjs|ts|tsx|py)\b`,
    String.raw`\b(node|tsx|bun|python3?)\s+[^\s|;&]*(^|/)(tests?|__tests__|spec)/[^\s|;&]+\.(js|mjs|cjs|ts|py)\b`,
  ].join("|"),
);
/** A lint/typecheck/format is a check, never a test run. */
const CHECK_ONLY_CMD = /^\s*(npm\s+run\s+)?(lint|typecheck|check|format|prettier|eslint|tsc|biome)\b/;

export function isTestCommand(command) {
  if (typeof command !== "string") return false;
  if (CHECK_ONLY_CMD.test(command) && !/\btest\b/.test(command)) return false;
  return TEST_RUNNER.test(command);
}

export function deriveSuiteRun(command, { exitCode = 0, durationMs = 0, output = "" } = {}) {
  if (typeof command !== "string") return null;
  if (!isTestCommand(command)) return null;
  const directFile = /\b(node|tsx|ts-node|bun|deno\s+run|python3?)\s+[^\s|;&]*(\.(test|spec)\.(js|mjs|cjs|ts|tsx|py)|(^|\/)(tests?|__tests__|spec)\/[^\s|;&]+\.(js|mjs|cjs|ts|py))\b/.test(command)
    && !/(run[-_]?all|test[-_]?runner|run[-_]?tests?)\./.test(command);
  const isSubset = directFile || /--\s*(grep|testPathPattern|filter)\b|-t\s+\S+|\brun\s+\S+\.spec\b|--to-grep|-k\s+\S+|--testNamePattern/.test(command);
  const parsed = parseTestCounts(output);
  return {
    kind: "suite-run",
    command: command.slice(0, 400),
    exitCode,
    durationMs,
    // Runner output differs (vitest, jest, pytest, go test). Counts are recorded
    // only where they can actually be read — never inferred, never 0 by default.
    testCount: parsed == null ? "unknown" : parsed,
    scope: isSubset ? "subset" : "full",
    impactStated: false, // filled by the caller when the impact area was declared
  };
}

function parseTestCounts(output) {
  if (!output || typeof output !== "string") return null;
  const patterns = [
    /\bTests:\s*(\d+)\s+passed\b/,            // jest
    /(\d+)\s+tests?\s+passed/,                 // vitest / pytest style
    /(\d+)\s+passing\b/,                       // mocha
    /\bok\s+\.\.\.\s+(\d+)\s+tests?/,          // go test
  ];
  for (const re of patterns) {
    const m = output.match(re);
    if (m) return Number(m[1]);
  }
  return null;
}

/** Recognise an `/asf health` invocation from the command text. */
export function deriveHealthRun(command, { verdict, scanned, level } = {}) {
  if (typeof command !== "string" || !/asf\s+health\b/.test(command)) return null;
  return {
    kind: "health-run",
    level: level || guessLevel(command),
    verdict: verdict || "unknown",
    scanned: typeof scanned === "number" ? scanned : 0,
  };
}

function guessLevel(command) {
  if (/--major\b/.test(command)) return "major";
  if (/--small\b/.test(command)) return "small";
  return "standard";
}

// ─── What the completion gate may conclude ─────────────────────────────────

/**
 * The four session facts P41 checks. A spec says what the deliverable must
 * have; only the harness knows what actually happened this session.
 */
export function sessionFacts(ledger, { scale = "standard", webTouched = false } = {}) {
  const missing = [];

  // `/asf health` is a delivery-time check for standard/major runs. An
  // auto-opened small run carries the floor (a real test run, see settle.mjs),
  // not the full delivery ceremony — otherwise every one-file fix is steered
  // toward a health audit nobody asked for.
  const health = ledger.latest("health-run");
  if (scale !== "small") {
    if (!health) {
      missing.push("the code health gate has not been run this session — call the asf_health tool (its verdict is recorded, not claimed)");
    } else if (health.verdict === "unknown") {
      missing.push("the code health gate ran but produced no verdict — call the asf_health tool again; a run without a verdict is not a pass");
    }
  }

  const fullRuns = ledger.entries.filter((e) => e.kind === "suite-run" && e.scope === "full");
  const green = fullRuns.filter((e) => e.exitCode === 0);
  if (scale !== "small") {
    if (fullRuns.length === 0) {
      missing.push("the full test suite was not run this session (a subset is not a full run; state the impact area if a subset is genuinely intended)");
    } else if (green.length === 0) {
      missing.push("the full test suite ran but never exited 0 this session");
    }
  }

  if (webTouched) {
    const verified = ledger.has("browser-verify");
    const na = ledger.has("browser-na");
    if (!verified && !na) {
      missing.push("a web surface is touched but no browser verification was recorded — verify it, or record a structured n/a with a reason");
    }
  }

  return { missing, health, fullRuns };
}

/**
 * Render the ledger section for the delivery report. Rendered from entries, so
 * what the reviewer reads is what was observed, not what was asserted.
 */
/** One ledger entry as one line. A table, so a new kind is a row. */
const RENDERERS = {
  "suite-run": (e) =>
    `- suite run: \`${e.command}\` → exit ${e.exitCode}, ${e.testCount} tests (${e.scope}), ${Math.round(e.durationMs / 1000)} s`,
  "health-run": (e) =>
    `- /asf health (${e.level}): ${e.verdict}, scanned ${e.scanned}${e.scanned === 0 ? " — **examined nothing, not a pass**" : ""}`,
  "browser-verify": (e) => `- browser: ${e.page} → ${e.action} → asserts "${e.assertion}"`,
  "browser-na": (e) => `- browser n/a: ${e.reason}`,
  "clean-room": (e) => `- clean-room ${e.package}: ${e.result}`,
  "spec-transition": (e) => `- spec ${e.specId} → ${e.status}: ${String(e.evidence).slice(0, 120)}`,
  "gate-verdict": (e) => `- gate ${e.gate}: ${e.fired ? "FIRED" : "clear"}, scanned ${e.scanned}${e.scanned === 0 ? " (**not a pass**)" : ""}`,
  "gate-block": (e) =>
    `- gate ${e.gate} blocked ${e.rule}: ${e.reason}${e.bypassed ? ` — BYPASSED${e.bypassReason ? ` (${e.bypassReason})` : ""}` : ""}`,
  "perf-scenario": (e) => `- perf ${e.name}: ${e.arrivalModel}, ${e.duration}, ${e.environment}, ${e.labOrField}`,
};

export function renderLedger(ledger) {
  const lines = ["## Evidence ledger"];
  if (ledger.entries.length === 0) {
    lines.push("- (no evidence recorded this session — nothing was observed running)");
  }
  for (const e of ledger.entries) {
    const render = RENDERERS[e.kind];
    if (render) lines.push(render(e));
  }
  if (ledger.rejected.length) {
    lines.push(`- rejected entries (${ledger.rejected.length}): ${ledger.rejected.slice(0, 3).join("; ")}${ledger.rejected.length > 3 ? " …" : ""}`);
  }
  return lines.join("\n");
}
