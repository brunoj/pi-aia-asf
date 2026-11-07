/**
 * The parameter table.
 *
 * Adding a parameter here is the only way a parameter can exist: `/asf config`
 * refuses to show a key that is not in this table and not consumed by a named
 * gate (P47's guard), because a screen makes knobs cheap to add and unused knobs
 * are drift surface — which is why P25 deleted `.asf-test.json`.
 *
 * Its own module so the table reads as a table; the resolution logic next door
 * reads as logic.
 */
import { clamp, round2 } from "./math.mjs";

export const PARAMS = {
  // ── The one parameter that must NOT have a default (P33) ───────────────
  //
  // Every other parameter here can explain its own number. This one cannot, and
  // inventing one is the failure the spec names: ASF must not decide that a
  // consumer's endpoint is supposed to answer in 2s. With nobody having
  // declared a target the verdict is `no-default: needs a declared target` —
  // never a silent pass, and never a number ASF made up.
  "perf.target": {
    key: "perf.target",
    general: null,
    type: "string",
    band: null,
    requiresDeclaredTarget: true,
    meaning: "The declared performance target a scenario is judged against; with no target declared there is no verdict, only a measurement",
    source:
      "no defensible general default exists — a latency or throughput target is a product decision, and a number ASF invented would be a fabricated specification (06i). It must be declared by the spec it comes from.",
    gate: "measurement",
  },

  // ── Performance placement (P34) ──────────────────────────────────────────
  "perf.cheapBudgetSeconds": {
    key: "perf.cheapBudgetSeconds",
    general: 60,
    type: "number",
    band: { min: 30, max: 300 },
    source: "T2 measured locally: the query-count probe runs in milliseconds and a 30-sample statistical trial in seconds, so 60 s buys real coverage for seconds",
    calibrate: (c) =>
      c.suiteRuntimeMs
        ? {
            value: clamp(Math.round((c.suiteRuntimeMs / 1000) * 0.25), 30, 300),
            why: `25% of your ${Math.round(c.suiteRuntimeMs / 1000)} s full suite`,
          }
        : null,
    gate: "perf-placement",
    meaning: "Wall-clock budget for the CI-cheap performance tier (query-count tripwire, plan scan, one bounded load scenario)",
  },
  "perf.scheduledBudgetSeconds": {
    key: "perf.scheduledBudgetSeconds",
    general: 900,
    type: "number",
    band: { min: 300, max: 3600 },
    source: "T2 measured locally; bounded per 06b Rule 15 (nothing in a completion path may hang)",
    calibrate: (c) =>
      c.suiteRuntimeMs
        ? {
            value: clamp(Math.round((c.suiteRuntimeMs / 1000) * 4), 300, 3600),
            why: `4× your ${Math.round(c.suiteRuntimeMs / 1000)} s full suite`,
          }
        : null,
    gate: "perf-placement",
    meaning: "Wall-clock budget for the scheduled deep tier (scalability, stress, soak, resource ceiling)",
  },

  // ── Statistical comparison (P30/P31) ─────────────────────────────────────
  "bench.samples": {
    key: "bench.samples",
    general: 30,
    type: "number",
    band: { min: 20, max: 60 },
    source: "T2 measured locally: 30 samples gave 0/40 false fires on unchanged code and 40/40 detection at +10% extra work",
    calibrate: (c) =>
      c.observedCv != null && c.observedCv > 0.1
        ? { value: clamp(60, 20, 60), why: `run-to-run CV measured at ${(c.observedCv * 100).toFixed(1)}% — noisy, so more samples` }
        : null,
    gate: "bench",
    meaning: "Samples per arm in a benchmark comparison",
  },
  "bench.warmups": {
    key: "bench.warmups",
    general: 10,
    type: "number",
    band: { min: 5, max: 20 },
    source: "T1 https://nodejs.org/docs/latest-v26.x/api/benchmark.html — the runner performs ten warmup runs before sampling",
    calibrate: (c) =>
      c.observedCv != null && c.observedCv > 0.1
        ? { value: clamp(20, 5, 20), why: "noisy machine — more warmups, upward only" }
        : null,
    gate: "bench",
    meaning: "Warmup iterations before sampling begins",
  },
  "bench.significance": {
    key: "bench.significance",
    general: 0.01,
    type: "number",
    band: null,
    nonAdaptive: true,
    source: "T2 measured locally: p < 0.01 with a Hodges–Lehmann log-median ratio gave 0/40 false fires and 40/40 detection at +10%",
    calibrate: null,
    gate: "bench",
    meaning: "Significance level for the regression verdict. NON-ADAPTIVE: flexing it invalidates the comparison rather than tuning it.",
  },
  "bench.effectRatio": {
    key: "bench.effectRatio",
    general: 1.05,
    type: "number",
    band: { min: 1.02, max: 1.1 },
    source: "T2 measured locally (Hodges–Lehmann log-median ratio threshold)",
    calibrate: (c) =>
      c.noiseFloorRatio != null
        ? { value: clamp(round2(Math.max(1.02, c.noiseFloorRatio * 1.5)), 1.02, 1.1), why: `1.5× the measured noise floor (${c.noiseFloorRatio})` }
        : null,
    gate: "bench",
    meaning: "Minimum median slowdown ratio that counts as a regression, alongside significance",
  },
  "bench.loadAverageFactor": {
    key: "bench.loadAverageFactor",
    general: 1.0,
    type: "number",
    band: { min: 0.75, max: 1.0 },
    source: "T2 measured locally: with competing CPU load, detection of a +10% regression fell from 40/40 to 13/25 — a busy machine has no verdict",
    calibrate: (c) =>
      c.machineQuiet != null
        ? { value: c.machineQuiet ? 1.0 : 0.75, why: c.machineQuiet ? "machine measured quiet" : "machine measured busy — refuse earlier" }
        : null,
    gate: "bench",
    meaning: "Refuse to compare when load average exceeds this multiple of the core count",
  },

  // ── Scans (P30 phase 1) ──────────────────────────────────────────────────
  "scan.fullScanRows": {
    key: "scan.fullScanRows",
    general: 1000,
    type: "number",
    band: { min: 100, max: 10000 },
    source: "T3 — no fetched source sets this; it is a starting value to be justified or replaced, and is labelled as such",
    calibrate: (c) =>
      c.largestTableRows != null
        ? { value: clamp(Math.max(100, Math.round(c.largestTableRows / 10)), 100, 10000), why: `1/10th of your largest table (${c.largestTableRows} rows)` }
        : null,
    gate: "planScan",
    meaning: "Row count above which a full table scan is reported",
  },
  "scan.queryBudgetPerRequest": {
    key: "scan.queryBudgetPerRequest",
    general: 20,
    type: "number",
    band: { min: 5, max: 200 },
    source: "T2 measured locally: the N+1 fixture issued 11 queries at n=10 and 41 at n=40, so a fixed ceiling catches the scaling shape rather than the constant",
    calibrate: (c) =>
      c.typicalQueriesPerRequest != null
        ? { value: clamp(Math.round(c.typicalQueriesPerRequest * 3) || 20, 5, 200), why: `3× the measured typical (${c.typicalQueriesPerRequest})` }
        : null,
    gate: "queryBudget",
    meaning: "Queries per request above which the N+1 tripwire fires",
  },

  // ── Scalability (P32) ────────────────────────────────────────────────────
  "scale.linearity": {
    key: "scale.linearity",
    general: 0.7,
    type: "number",
    band: { min: 0.5, max: 0.9 },
    source: "T1 https://docs.aws.amazon.com/solutions/latest/performance-testing/understanding-test-types.html — sub-linear scaling indicates a shared resource bottleneck",
    calibrate: (c) =>
      c.loadSteps != null && c.loadSteps >= 5
        ? { value: 0.6, why: `${c.loadSteps} load steps measured — a slightly tighter curve is affordable` }
        : null,
    gate: "load",
    meaning: "Minimum throughput-per-load linearity before a bottleneck is reported",
  },

  // ── Enforcement economics (P43/P45) ─────────────────────────────────────
  "gate.falsePositiveBudget": {
    key: "gate.falsePositiveBudget",
    general: 0.05,
    type: "number",
    band: { min: 0.01, max: 0.1 },
    source: "T1 Laaber, Scheuner & Leitner (FSE'22) — keep the false-positive rate below a predefined budget, e.g. 5%",
    calibrate: (c) =>
      c.gateCriticality === "high"
        ? { value: 0.02, why: "this gate guards a security or data-loss path — tighter budget" }
        : c.gateCriticality === "low"
          ? { value: 0.1, why: "this gate is advisory — looser budget" }
          : null,
    gate: "authority",
    meaning: "Fraction of verdicts allowed to be false before the gate is demoted to warn",
  },
  "gate.blocksPerRunBudget": {
    key: "gate.blocksPerRunBudget",
    general: 3,
    type: "number",
    band: { min: 1, max: 8 },
    source: "T3 — derived from the PO's autonomy condition: a gate that blocks repeatedly in one run is interrupting the loop rather than guarding it",
    calibrate: (c) =>
      c.runLengthToolCalls != null && c.runLengthToolCalls > 400
        ? { value: clamp(5, 1, 8), why: `long run measured (${c.runLengthToolCalls} tool calls) — more blocks tolerated before demotion` }
        : null,
    gate: "authority",
    meaning: "Blocks per run above which the gate is flagged as over-eager and demoted",
  },

  // ── Non-adaptive validity rules ──────────────────────────────────────────
  // No band, no override. These are not tuning knobs; they are what makes a
  // verdict mean anything.
  "valid.scannedZeroIsPass": {
    key: "valid.scannedZeroIsPass",
    general: false,
    type: "boolean",
    band: null,
    nonAdaptive: true,
    source: "Standing rule: a check that examined nothing has not passed. The guard must say so, not pass silently.",
    calibrate: null,
    gate: "all",
    meaning: "Whether scanned: 0 may be read as a pass. It may not.",
  },
  "valid.interleavedComparison": {
    key: "valid.interleavedComparison",
    general: true,
    type: "boolean",
    band: null,
    nonAdaptive: true,
    source: "T1 Laaber et al. (FSE'22): randomize the order of test and control; T2 measured locally with interleaved randomized A/B",
    calibrate: null,
    gate: "bench",
    meaning: "Test and control must be interleaved in one process in randomized order.",
  },
  "valid.rawSamplesRetained": {
    key: "valid.rawSamplesRetained",
    general: true,
    type: "boolean",
    band: null,
    nonAdaptive: true,
    source: "T1 https://nodejs.org/docs/latest-v26.x/api/benchmark.html — the runner exposes raw samples so any comparison policy stays in higher-level tools",
    calibrate: null,
    gate: "bench",
    meaning: "Raw samples must be retained so a verdict can be re-derived and audited.",
  },
};
