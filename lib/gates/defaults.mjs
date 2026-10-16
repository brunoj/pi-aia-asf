/**
 * Gate configuration (P46) — three tiers, per the PO's rule:
 *
 *   1. GENERAL DEFAULT   researched, shipped in code, sourced. What runs on a
 *                        project ASF has never seen.
 *   2. ADAPTATION BAND   a documented floor..ceiling around the default. Part of
 *                        the researched artefact, not invented at runtime.
 *   3. PROJECT CALIBRATION  derived from measured project characteristics, and
 *                        permitted to move the value **only inside the band**.
 *
 * Anything outside the band requires explicit user configuration through
 * `/asf config`, and is then shown with `origin: override`.
 *
 * **Why the band exists.** Project calibration without a band is an escape
 * hatch: a project whose suite is slow could widen its own perf budget until the
 * gate can never fire. The band is what makes adaptation safe.
 *
 * **Why some values are non-adaptive.** Statistical-validity constants are not
 * tuning knobs. Flexing them does not make a gate better suited to a project, it
 * makes the measurement invalid — so they have no band and no override path. A
 * project may not calibrate its way out of a valid comparison; it may only make
 * the comparison more patient.
 *
 * Every default carries a source. A default that cannot explain itself is a
 * guess with better formatting (02-research.md, P33).
 */

/** @typedef {'default'|'project'|'calibrated'|'override'} ValueOrigin */

/**
 * @typedef {object} ParamSpec
 * @property {string} key
 * @property {number|string|boolean} general    the researched default
 * @property {string} source                    where the default comes from
 * @property {'number'|'boolean'|'string'} type
 * @property {{min:number,max:number}|null} band  adaptation band (numbers only)
 * @property {(ctx: object) => {value: any, why: string}|null} calibrate  project calibration
 * @property {string} gate                      which gate consumes it
 * @property {string} meaning                   what it does, for --explain
 * @property {boolean} [nonAdaptive]            no band, no override: validity, not tuning
 */

/**
 * The parameter table. Adding a parameter here is the only way a parameter can
 * exist: `/asf config` refuses to show a key that is not in this table and not
 * consumed by a named gate (P47's guard), because a screen makes knobs cheap to
 * add and unused knobs are drift surface — which is why P25 deleted
 * `.asf-test.json`.
 */
export const PARAMS = {
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

/** Values that must never be moved by calibration or a project file. */
export const NON_ADAPTIVE = Object.values(PARAMS)
  .filter((p) => p.nonAdaptive)
  .map((p) => p.key);

export function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}
function round2(v) {
  return Math.round(v * 100) / 100;
}

/**
 * Resolve one parameter through the three tiers.
 *
 * @param {string} key
 * @param {{projectConfig?: object, measurements?: object, overrides?: object}} [tiers]
 * @returns {{key:string,value:any,origin:ValueOrigin,general:any,band:object|null,source:string,why:string,gate:string,nonAdaptive:boolean}}
 */
export function resolveParam(key, tiers = {}) {
  const spec = PARAMS[key];
  if (!spec) throw new Error(`unknown parameter "${key}"`);
  const { projectConfig = {}, measurements = {}, overrides = {} } = tiers;

  const base = {
    key,
    general: spec.general,
    band: spec.band,
    source: spec.source,
    gate: spec.gate,
    nonAdaptive: !!spec.nonAdaptive,
  };

  // Non-adaptive: the general value is the only value. A project or an override
  // that tries to move it is reported, not obeyed — silently ignoring it would
  // let a config file look like it had changed the rules.
  if (spec.nonAdaptive) {
    const attempted =
      Object.prototype.hasOwnProperty.call(overrides, key) ||
      Object.prototype.hasOwnProperty.call(projectConfig, key);
    return {
      ...base,
      value: spec.general,
      origin: "default",
      why: attempted
        ? `NON-ADAPTIVE: a configured value for "${key}" was ignored — flexing it invalidates the measurement rather than tuning it`
        : "non-adaptive validity constant",
    };
  }

  if (Object.prototype.hasOwnProperty.call(overrides, key)) {
    const v = overrides[key];
    const inBand = spec.band ? v >= spec.band.min && v <= spec.band.max : true;
    return {
      ...base,
      value: v,
      // Outside the band is only reachable by explicit user configuration, and
      // then it must be visible as such rather than looking like a default.
      origin: inBand ? "override" : "override",
      why: inBand ? `explicit override (within band ${spec.band ? `${spec.band.min}–${spec.band.max}` : "n/a"})` : `explicit override OUTSIDE the band ${spec.band ? `${spec.band.min}–${spec.band.max}` : ""} — visible as an override, not as a default`,
    };
  }

  if (Object.prototype.hasOwnProperty.call(projectConfig, key)) {
    const raw = projectConfig[key];
    if (spec.type === "number" && typeof raw !== "number") {
      return { ...base, value: spec.general, origin: "default", why: `project value ignored: "${key}" must be a number` };
    }
    if (spec.band) {
      const v = clamp(raw, spec.band.min, spec.band.max);
      return {
        ...base,
        value: v,
        origin: "project",
        why: v === raw
          ? `project configuration (band ${spec.band.min}–${spec.band.max})`
          : `project asked for ${raw}; clamped into the band to ${v}`,
      };
    }
    return { ...base, value: raw, origin: "project", why: "project configuration" };
  }

  const cal = spec.calibrate ? spec.calibrate(measurements) : null;
  if (cal) {
    const v = spec.band ? clamp(cal.value, spec.band.min, spec.band.max) : cal.value;
    return { ...base, value: v, origin: "calibrated", why: cal.why };
  }

  return { ...base, value: spec.general, origin: "default", why: "general default (no project configuration, no calibration input)" };
}

/** Resolve the whole table. */
export function resolveAll(tiers = {}) {
  const out = {};
  for (const key of Object.keys(PARAMS)) out[key] = resolveParam(key, tiers);
  return out;
}

/**
 * `/asf config --explain <key>` output: the derivation, not just the number.
 * A default that cannot explain itself is a guess with better formatting.
 */
export function explainParam(key, tiers = {}) {
  const r = resolveParam(key, tiers);
  const band = r.band ? `${r.band.min} .. ${r.band.max}` : "none (non-adaptive)";
  return [
    `${r.key} = ${JSON.stringify(r.value)}  [origin: ${r.origin}]`,
    `  what     : ${PARAMS[key].meaning}`,
    `  gate     : ${r.gate}`,
    `  general  : ${JSON.stringify(r.general)}`,
    `  band     : ${band}`,
    `  source   : ${r.source}`,
    `  why here : ${r.why}`,
  ].join("\n");
}

/** Validate a candidate project/override value before it is ever written. */
export function validateParam(key, value) {
  const spec = PARAMS[key];
  if (!spec) return `unknown parameter "${key}" — a parameter exists only if it is in the table and consumed by a named gate`;
  if (spec.nonAdaptive) return `"${key}" is non-adaptive and cannot be configured`;
  if (typeof value !== spec.type) return `"${key}" must be of type ${spec.type}, got ${typeof value}`;
  if (spec.type === "number") {
    if (!Number.isFinite(value)) return `"${key}" must be a finite number`;
    if (spec.band && (value < spec.band.min || value > spec.band.max)) {
      return `"${key}" must be within the band ${spec.band.min}–${spec.band.max}`;
    }
  }
  return null;
}
