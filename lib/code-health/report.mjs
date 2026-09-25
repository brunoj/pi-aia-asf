/**
 * Code Health Gate — evaluation & reporting.
 *
 * Pure module: results + plans → rows + verdict; text formatting; diff against
 * a baseline. No IO.
 */

/** Evaluate a metric result against its plan. */
export function evaluateRow(plan, result) {
  if (plan.status === "disabled") {
    return { key: plan.key, level: plan.level, value: "—", threshold: plan.thresholdLabel, status: "disabled", reason: plan.reason };
  }
  if (plan.status === "skip-lang") {
    return { key: plan.key, level: plan.level, value: "—", threshold: plan.thresholdLabel, status: "skipped", reason: plan.reason };
  }
  if (plan.status === "skip-tool") {
    return { key: plan.key, level: plan.level, value: "—", threshold: plan.thresholdLabel, status: "skipped", reason: plan.reason };
  }
  if (result && result.error) {
    return { key: plan.key, level: plan.level, value: "error", threshold: plan.thresholdLabel, status: "error", reason: result.error };
  }
  if (result && result.unavailable) {
    return { key: plan.key, level: plan.level, value: "—", threshold: plan.thresholdLabel, status: "skipped", reason: "rule not available in installed eslint" };
  }
  const value = result ? result.value : null;
  const compare = plan.compare || "value";
  const failed = value === null || value === undefined
    ? true
    : compare === "violations"
      ? value > 0
      : value > plan.threshold;
  return {
    key: plan.key,
    level: plan.level,
    value: formatValue(plan.key, value),
    threshold: plan.thresholdLabel,
    status: failed ? "fail" : "pass",
    reason: failed ? `value ${value} exceeds ${plan.thresholdLabel}` : "",
  };
}

function formatValue(key, value) {
  if (value === null || value === undefined) return "?";
  if (key === "duplication") return `${value}%`;
  if (key === "circularDependencies") return `${value} cycle(s)`;
  return String(value);
}

/** Aggregate rows into a verdict. */
export function verdict(rows, config) {
  const failures = rows.filter((r) => r.status === "fail");
  const errors = rows.filter((r) => r.status === "error");
  const skipped = rows.filter((r) => r.status === "skipped");
  const ran = rows.filter((r) => r.status === "pass" || r.status === "fail");
  // missingTool: "fail" — a skipped tool is a gate failure (can't verify).
  const missingIsFailure = config?.missingTool === "fail" && skipped.length > 0;
  // With missingTool "warn" (default), skipped metrics never fail the gate —
  // a fresh project without devDeps must not fail. ran === 0 + skipped === 0
  // means nothing to measure (no source files) → healthy.
  const healthy = failures.length === 0 && errors.length === 0 && !missingIsFailure;
  return { healthy, failures: failures.length, errors: errors.length, skipped: skipped.length, ran: ran.length };
}

/** Human-readable report. */
export function formatReport(rows, config) {
  if (!config.enabled) {
    return "Code Health Gate: disabled (enabled: false).";
  }
  const lines = [];
  lines.push("Code Health Gate report");
  lines.push("──────────────────────");
  if (rows.length === 0) {
    lines.push("(no metrics to run — no source files, or all levels disabled)");
  }
  for (const row of rows) {
    const mark =
      row.status === "fail" ? "✗" :
      row.status === "pass" ? "✓" :
      row.status === "error" ? "!" :
      row.status === "skipped" ? "–" : "·";
    lines.push(`${mark} ${row.level.padEnd(12)} ${row.key.padEnd(22)} ${String(row.value).padEnd(10)} ${row.threshold}${row.reason ? "  (" + row.reason + ")" : ""}`);
  }
  const v = verdict(rows, config);
  lines.push("──────────────────────");
  if (v.healthy && v.ran === 0 && v.skipped > 0) {
    lines.push(`UNVERIFIED — no metric could run (${v.skipped} skipped: tools missing). Set missingTool: "fail" to enforce.`);
  } else if (v.healthy) {
    lines.push(`HEALTHY — ${v.ran} metric(s) checked${v.skipped ? `, ${v.skipped} skipped` : ""}`);
  } else if (v.failures === 0 && v.errors === 0 && v.skipped > 0) {
    lines.push(`NOT healthy — ${v.skipped} metric(s) skipped (missingTool: "fail"). Install the tools or lower the bar.`);
  } else {
    lines.push(`${v.failures} violation(s), ${v.errors} error(s)${v.skipped ? `, ${v.skipped} skipped` : ""} — NOT healthy`);
  }
  return lines.join("\n");
}

/** Machine-readable report. */
export function jsonReport(rows, config) {
  return {
    enabled: config.enabled,
    generatedAt: new Date().toISOString(),
    rows: rows.map((r) => ({
      key: r.key,
      level: r.level,
      value: r.value,
      threshold: r.threshold,
      status: r.status,
      reason: r.reason || "",
    })),
    verdict: config.enabled ? verdict(rows, config) : { healthy: true, failures: 0, errors: 0, skipped: 0, ran: 0 },
  };
}

/**
 * Diff the current rows against a baseline (previous report's rows).
 * Flags metrics that got WORSE: value increased (for max-threshold metrics),
 * or a metric that was pass and is now fail.
 */
export function diffRows(currentRows, baselineRows) {
  const byKey = new Map(baselineRows.map((r) => [r.key, r]));
  const changes = [];
  for (const row of currentRows) {
    if (row.status !== "pass" && row.status !== "fail") continue;
    const prev = byKey.get(row.key);
    if (!prev) {
      changes.push({ key: row.key, change: "new", detail: `new metric: ${row.value}` });
      continue;
    }
    const prevNum = numeric(prev.value);
    const curNum = numeric(row.value);
    if (prevNum !== null && curNum !== null) {
      if (curNum > prevNum) {
        changes.push({ key: row.key, change: "worse", detail: `${prev.value} → ${row.value}` });
      }
    } else if (prev.status === "pass" && row.status === "fail") {
      changes.push({ key: row.key, change: "worse", detail: `${prev.value} → ${row.value}` });
    }
  }
  return changes;
}

function numeric(value) {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return null;
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

/** Baseline payload (committed .asf-code-health-baseline.json). */
export function baselinePayload(rows) {
  return {
    generatedAt: new Date().toISOString(),
    metrics: Object.fromEntries(
      rows
        .filter((r) => r.status === "pass" || r.status === "fail")
        .map((r) => [r.key, { value: r.value, status: r.status }]),
    ),
  };
}

/** Format a diff for display. */
export function formatDiff(changes) {
  if (changes.length === 0) return "No metric regressed since the baseline.";
  const lines = ["Metric regressions vs baseline:"];
  for (const c of changes) {
    lines.push(`  ✗ ${c.key}: ${c.change} (${c.detail})`);
  }
  return lines.join("\n");
}
