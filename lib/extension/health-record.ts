/**
 * Recording a health verdict — one definition, three callers.
 *
 * The completion gate asks for a recorded health verdict. It used to be that
 * only the `asf_health` tool recorded one, while `/asf health` and `/asf verify`
 * printed the same measurement and left no trace: a human could run the command,
 * see HEALTHY, and the gate would stay open with nothing to show for it. Either
 * a measurement is evidence or it is not — so every path that produces the
 * verdict records it, and `by:` says who produced it.
 *
 * The counting rules and the wording are in `lib/code-health/measure.mjs`
 * (pure, tested without a harness); this file only supplies the ledger, the
 * evidence trail and the run's scale.
 */

import { ledger } from "./gate-state.ts";
import { appendEvidence } from "./evidence.ts";
import { currentScale } from "./run.ts";
import { healthRunEntry, measuredMetrics, skippedMetrics } from "../code-health/measure.mjs";
import type { HealthVerdictSource, HealthRecord } from "../code-health/measure.d.mts";

export type { HealthVerdictSource, HealthRecord } from "../code-health/measure.d.mts";
export { measuredMetrics, measureSummary, recordLine } from "../code-health/measure.mjs";

const LEVELS = ["small", "standard", "major"];

/**
 * Append the verdict to the ledger and the evidence trail.
 *
 * `level` falls back to the run's scale, so a bare `/asf health` still records
 * at a level the gate can judge.
 */
export function recordHealthVerdict(res: HealthVerdictSource | null | undefined, opts: { by: string; level?: string }): HealthRecord {
  const level = LEVELS.includes(String(opts?.level)) ? String(opts.level) : currentScale();
  const entry = healthRunEntry(res, level);
  const appended = ledger.append(entry);
  appendEvidence({ ...entry, by: opts.by });
  return {
    verdict: entry.verdict,
    scanned: measuredMetrics(res as { ran?: number }),
    skipped: skippedMetrics(res),
    level,
    recorded: !!appended.ok,
    error: appended.ok ? "" : String(appended.error),
  };
}
