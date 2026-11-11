/**
 * Suite runs and health runs, derived from observed tool traffic.
 *
 * A suite run is a fact only because the extension *saw* the command and the
 * exit code — never because the agent said it ran the tests. This module owns
 * the recognition (what counts as a runner, what counts as a subset) and the
 * one question the exit floors ask: is the LAST full run green, and did it
 * start after the last source change?
 *
 * Split out of `ledger.mjs` (0.17.5) because the ledger is the entry store and
 * this is the observer; they changed for different reasons and together they
 * outgrew the file limit ASF enforces on everyone else.
 */

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
    // a test file executed directly: node tests/x.test.js, tsx foo.spec.ts, node test/x.mjs
    // (the directory may be the FIRST path segment — `(^|/)` after `node ` never matched that)
    String.raw`\b(node|tsx|ts-node|bun|deno\s+run|python3?)\s+[^\s|;&]*\.(test|spec)\.(js|mjs|cjs|ts|tsx|py)\b`,
    String.raw`\b(node|tsx|bun|python3?)\s+(?:[^\s|;&]*/)?(tests?|__tests__|spec)/[^\s|;&]+\.(js|mjs|cjs|ts|py)\b`,
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
  const directFile = /\b(node|tsx|ts-node|bun|deno\s+run|python3?)\s+[^\s|;&]*(\.(test|spec)\.(js|mjs|cjs|ts|tsx|py)|(?:[^\s|;&]*\/)?(tests?|__tests__|spec)\/[^\s|;&]+\.(js|mjs|cjs|ts|py))\b/.test(command)
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

/**
 * The suite runs an exit floor reads.
 *
 * `some(green)` is not a floor: it lets a session publish on a green from
 * before the last edit, and it lets a green from earlier in the session outrank
 * a red that came after it. The floor is the LAST full run, and it must have
 * started after the last source mutation — the same rule the settle floor uses
 * (`run.ts`), so the two cannot disagree about what "green" means.
 */
export function lastFullRun(suiteRuns = []) {
  if (!Array.isArray(suiteRuns)) return null;
  for (let i = suiteRuns.length - 1; i >= 0; i--) {
    const r = suiteRuns[i];
    if (r && r.scope === "full") return r;
  }
  return null;
}

/** The green that opens an exit floor, or null with the reason it is not green. */
export function greenFullRun(suiteRuns = [], since = 0) {
  const run = lastFullRun(suiteRuns);
  if (!run) return { run: null, ok: false, why: "no full-suite run recorded in this session" };
  if (run.exitCode !== 0) return { run, ok: false, why: `the last full suite run exited ${run.exitCode}` };
  if ((run.at ?? 0) < (Number(since) || 0)) {
    return { run, ok: false, why: "the last full-suite green predates the most recent source change" };
  }
  return { run, ok: true, why: "" };
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
