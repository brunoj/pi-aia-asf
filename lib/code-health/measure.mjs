/**
 * What a health verdict actually measured — the pure half.
 *
 * `scanned` is the number three readers must agree on: the ledger's
 * "examined nothing, not a pass" rule, the report's own `HEALTHY — N metric(s)
 * checked, M skipped` line, and the summary line the agent reads after the
 * report. It used to be `rows.length`, and `rows` counts every metric PLANNED —
 * including the ones that never ran because a tool was missing. So a project
 * where eight of nine metrics could not run was recorded as a nine-metric
 * audit, the ledger's zero-rule became unreachable, and the tool's summary
 * contradicted the report printed directly above it.
 *
 * The honest number already existed: `verdict()` returns `ran`, which counts
 * pass+fail and deliberately EXCLUDES error rows. Counting `status !==
 * "skipped"` instead would count errors as measured and put the three readers
 * back out of agreement — which is the bug this file exists to prevent.
 *
 * Pure and dependency-free on purpose: the recording glue lives beside the
 * ledger, and this is what the tests can pin without a harness.
 */

/**
 * Metrics actually measured. Skipped, disabled and error rows are NOT counted.
 *
 * Both spellings are accepted because the two objects that travel through this
 * file use different names for the same fact: the gate's verdict says `ran`,
 * the recorded ledger entry says `scanned`. A summary that read only one of them
 * would print "0 metric(s) measured" over an eight-metric audit — which is the
 * exact contradiction this module exists to prevent, so it is read from
 * whichever field the caller has.
 */
export function measuredMetrics(res) {
  if (Number.isFinite(res?.ran)) return Number(res.ran);
  if (Number.isFinite(res?.scanned)) return Number(res.scanned);
  return 0;
}

/** Metrics that were planned but never ran. */
export function skippedMetrics(res) {
  return Number.isFinite(res?.skipped) ? Number(res.skipped) : 0;
}

/** pass/fail/warn — the same reading the exit code and the report use. */
export function verdictOf(res) {
  if (res?.exitCode === 1) return "fail";
  return res?.healthy ? "pass" : "warn";
}

/** The one wording, so no caller can invent a contradictory one. */
export function measureSummary(res, level) {
  const skipped = skippedMetrics(res);
  return `${measuredMetrics(res)} metric(s) measured${skipped ? `, ${skipped} skipped` : ""}, level ${level}`;
}

/** The ledger entry: `scanned` is what ran, never what was planned. */
export function healthRunEntry(res, level) {
  return { kind: "health-run", level, verdict: verdictOf(res), scanned: measuredMetrics(res) };
}

/**
 * What the reader is told after a recording.
 *
 * A verdict over zero metrics is spelled out as not-a-pass: the failure mode
 * this guards against is an agent (or a human) reading a green-looking line that
 * summarised a measurement of nothing at all.
 */
export function recordLine(rec) {
  const recorded = rec.recorded
    ? "recorded as evidence; the completion gate's health gap is now closed."
    : `NOT recorded (${rec.error})`;
  const nothing = rec.scanned === 0
    ? " Nothing was actually measured — a verdict over zero metrics is not a pass, " +
      "and installing the missing tools is what closes this properly."
    : "";
  return `verdict: ${rec.verdict} (${measureSummary(rec, rec.level)}) — ${recorded}${nothing}`;
}
