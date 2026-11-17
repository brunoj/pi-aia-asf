/**
 * Code Health Gate — CLI orchestration.
 *
 * Thin entry point used by `/asf health` and `/asf verify` (Gate 8):
 * load config → detect languages/tools → plan → run → evaluate → report.
 * `deps` is injectable for tests.
 */

import { loadConfig } from "./config.mjs";
import { detectLanguages, planMetrics, resolvePlans } from "./detect.mjs";
import { listSourceFiles, detectTools, runAll } from "./run.mjs";
import { evaluateRow, verdict, formatReport, jsonReport, diffRows, formatDiff, baselinePayload } from "./report.mjs";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { readPath, writePath } from "../home.mjs";
import { isMeasurableRoot } from "../project.mjs";

/** The path ASF reports and tests assert; derived from the home, never a second copy. */
export const BASELINE_FILE = writePath("", "baseline");

/** Parse CLI args: --diff, --json, --update-baseline, --verbose. */
export function parseArgs(args) {
  const flags = { diff: false, json: false, updateBaseline: false, verbose: false };
  for (const a of args || []) {
    if (a === "--diff") flags.diff = true;
    else if (a === "--json") flags.json = true;
    else if (a === "--update-baseline") flags.updateBaseline = true;
    else if (a === "--verbose") flags.verbose = true;
  }
  return flags;
}

/**
 * Run the gate. Returns { text, json, exitCode, healthy, rows, config }.
 */
export async function runHealth(projectRoot, args = [], deps = {}) {
  const flags = parseArgs(args);
  const config = await loadConfig(projectRoot, deps.readFile);
  // Measuring the wrong tree is worse than measuring nothing. A root that is not
  // a project (a home directory, a scratch parent) yields numbers that are real,
  // belong to nobody's run, and cannot be fixed by the run being gated — which is
  // exactly how an uncloseable completion gate is manufactured. Refuse, and let
  // the caller report NOT MEASURED.
  if (!isMeasurableRoot(projectRoot)) {
    const text =
      `Code Health Gate: NOT MEASURED — ${projectRoot} is not a project (no .git, no manifest, ` +
      `or it is the user's home directory). ASF will not report violations for code this run is ` +
      `not working on; point the measurement at the project, or record the gate as not measured.`;
    return { text, json: { measured: false, reason: "root is not a project" }, exitCode: 0, healthy: false, measured: false, rows: [], ran: 0, skipped: 0, config };
  }
  if (!config.enabled) {
    // A disabled gate is NOT a passed gate. Reporting `healthy: true` here is
    // how switching a gate off came to read as a green tick in the delivery
    // report ("Code Health Gate passed (or enabled:false ...)"). The honest
    // answer to "was the code measured?" is: no, it was not.
    const text = "Code Health Gate: not measured (enabled: false).";
    return { text, json: { enabled: false }, exitCode: 0, healthy: false, measured: false, rows: [], ran: 0, skipped: 0, config };
  }

  const { files, excluded } = listSourceFiles(projectRoot, config.ignore, { withExclusions: true });
  const languages = detectLanguages(files);
  const tools = deps.tools || detectTools(projectRoot, deps);
  const plans = resolvePlans(planMetrics({ config, languages, tools, files }), languages);
  const results = await runAll(plans, projectRoot, { ...deps, files, ignore: config.ignore, timeoutMs: config.toolTimeoutSeconds * 1000 });
  const rows = plans.map((p) => evaluateRow(p, results[p.key]));
  const v = verdict(rows, config);

  // Gate semantics: block only when configured to, and only for the scope.
  const gateBlocks = config.gate.mode === "block" && config.gate.scope !== "off";
  // "Not measured" is not a code failure to block a build on: a fresh project
  // with no devDeps, or a docs-only tree, must not be failed by a gate that ran
  // nothing. It is equally not a pass — verdictOf() reads `measured` and says
  // not-measured, so the honest answer survives without the exit code pretending
  // a measurement happened or the CLI punishing a missing toolchain.
  const exitCode = gateBlocks && !v.healthy && v.ran > 0 ? 1 : 0;

  const text = applyBaselineFlags({ text: formatReport(rows, config), rows, root: projectRoot, flags });

  const json = flags.json ? jsonReport(rows, config) : null;
  // `ran` and `skipped` are verdict()'s own counts, and they leave here because
  // they are the ONLY honest answer to "how much was actually measured" — see
  // lib/code-health/measure.mjs. `rows.length` counts metrics PLANNED.
  return { text, json, exitCode, healthy: v.healthy, measured: v.ran > 0, rows, ran: v.ran, skipped: v.skipped, excluded, config };
}

/**
 * `--update-baseline` and `--diff`, factored out of `runHealth` so the gate's
 * main path stays readable and the metric accounting stays in one place.
 */
function applyBaselineFlags({ text, rows, root, flags }) {
  if (flags.updateBaseline) {
    const payload = baselinePayload(rows);
    const file = writePath(root, "baseline");
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(payload, null, 2) + "\n", "utf-8");
    return `${text}\n\nBaseline updated: ${BASELINE_FILE}`;
  }
  if (!flags.diff) return text;
  // Home first, then the pre-home root file — a project that set a baseline
  // before the home existed must still diff against its own ratchet.
  const baselinePath = readPath(root, "baseline");
  let baselineRows = [];
  if (existsSync(baselinePath)) {
    try {
      const base = JSON.parse(readFileSync(baselinePath, "utf-8"));
      baselineRows = Object.entries(base.metrics || {}).map(([key, m]) => ({ key, value: m.value, status: m.status }));
    } catch {
      /* unreadable baseline → no diff */
    }
  }
  return `${text}\n\n${formatDiff(diffRows(rows, baselineRows))}`;
}

