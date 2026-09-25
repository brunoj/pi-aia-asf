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
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const BASELINE_FILE = ".asf-code-health-baseline.json";

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
  if (!config.enabled) {
    const text = "Code Health Gate: disabled (enabled: false).";
    return { text, json: { enabled: false }, exitCode: 0, healthy: true, rows: [], config };
  }

  const files = listSourceFiles(projectRoot, config.ignore);
  const languages = detectLanguages(files);
  const tools = deps.tools || detectTools(projectRoot, deps);
  const plans = resolvePlans(planMetrics(config, languages, tools), languages);
  const results = await runAll(plans, projectRoot, { ...deps, timeoutMs: config.toolTimeoutSeconds * 1000 });
  const rows = plans.map((p) => evaluateRow(p, results[p.key]));
  const v = verdict(rows, config);

  // Gate semantics: block only when configured to, and only for the scope.
  const gateBlocks = config.gate.mode === "block" && config.gate.scope !== "off";
  const exitCode = gateBlocks && !v.healthy ? 1 : 0;

  let text = formatReport(rows, config);

  if (flags.updateBaseline) {
    const payload = baselinePayload(rows);
    writeFileSync(join(projectRoot, BASELINE_FILE), JSON.stringify(payload, null, 2) + "\n", "utf-8");
    text += `\n\nBaseline updated: ${BASELINE_FILE}`;
  } else if (flags.diff) {
    const baselinePath = join(projectRoot, BASELINE_FILE);
    let baselineRows = [];
    if (existsSync(baselinePath)) {
      try {
        const base = JSON.parse(readFileSync(baselinePath, "utf-8"));
        baselineRows = Object.entries(base.metrics || {}).map(([key, m]) => ({ key, value: m.value, status: m.status }));
      } catch {
        /* unreadable baseline → no diff */
      }
    }
    const changes = diffRows(rows, baselineRows);
    text += "\n\n" + formatDiff(changes);
  }

  const json = flags.json ? jsonReport(rows, config) : null;
  return { text, json, exitCode, healthy: v.healthy, rows, config };
}

export { BASELINE_FILE };
