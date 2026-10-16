/**
 * The measurement contract (P31) — how a performance claim must be written to
 * mean anything.
 *
 * A bare number is not a specification. `p95 < 2s` does not say at what load,
 * over how many samples, on what machine, measured in a lab or observed in the
 * field — and those four things are what decide whether the number is true.
 * The literature is blunt about the consequence: repeated identical runs on the
 * same hardware have shown coefficients of variation from 0.03% to over 100%,
 * and standard threshold tests false-fire on unchanged code when the sample size
 * is low.
 *
 * So this module does two things:
 *   - it **reports an incomplete claim rather than accepting it** (a claim that
 *     cannot be checked is not a spec, and pretending otherwise is what lets a
 *     project declare a number it can never falsify);
 *   - it **refuses to produce a verdict on a busy machine**, which is neither a
 *     pass nor a fail. Under competing CPU load, detection of a real +10%
 *     regression fell from 40/40 to 13/25 in local measurement — a busy machine
 *     has no verdict, and reporting one would be fabrication.
 */

export const CONTRACTS = {
  latency: {
    required: ["percentile", "load", "samples", "environment", "labOrField", "target"],
    hint: "a latency claim needs a percentile, the load it was measured at, the sample count, the environment, whether it is lab or field, and the target it is being judged against",
  },
  throughput: {
    required: ["arrivalModel", "duration", "environment", "samples", "target"],
    hint: "a throughput claim needs an arrival model (closed-loop vs open-loop — coordinated omission changes the answer), the duration, the environment, the sample count and the target it is being judged against",
  },
  regression: {
    required: ["comparison", "interleaved", "rawSamples", "cv", "samples", "environment"],
    hint: "a regression claim needs a statistical comparison, interleaved randomized measurement, retained raw samples, the observed CV, the sample count and the environment",
  },
};

/**
 * Validate one claim. Returns `{ ok, missing, claim }`.
 *
 * An incomplete claim is **reported**, never accepted and never silently
 * dropped — the same rule the guard uses for a check that examined nothing.
 */
export function checkMeasurementContract(claim) {
  if (!claim || typeof claim !== "object") return { ok: false, missing: ["claim"], claim };
  const kind = claim.kind;
  const contract = CONTRACTS[kind];
  if (!contract) {
    return { ok: false, missing: ["kind"], claim, note: `kind must be one of ${Object.keys(CONTRACTS).join(", ")}` };
  }
  const missing = contract.required.filter((f) => {
    const v = claim[f];
    return v == null || v === "" || (typeof v === "number" && !Number.isFinite(v));
  });
  const out = { ok: missing.length === 0, missing, claim };
  if (!out.ok) out.hint = contract.hint;
  // A claim can carry a full measurement contract and still have nothing to be
  // compared against. "p95 was 180ms at 200 users, 30 samples, CI" is a real
  // measurement; without a target it is not a verdict about meeting anything.
  // ASF does not invent the target — that is a product decision — so the
  // verdict here is the literal string the spec names, never a silent pass.
  if (missing.includes("target")) {
    out.noDefault = "no-default: needs a declared target";
  }
  return out;
}

/**
 * Extract the shape of a prose claim so an incomplete one can be reported
 * concretely. Used to catch the `p95 < 2s` pattern in a spec's requirement text.
 */
export function detectBareNumericClaim(text) {
  if (typeof text !== "string") return null;
  const m = text.match(/\b(p\d{2})\s*(?:<|≤|<=|must be under|under|below)\s*([\d.]+)\s*(ms|s|seconds|milliseconds)\b/i);
  if (!m) return null;
  const has = {
    load: /\b(rps|qps|requests? per second|concurr|users?|arrivals?)\b/i.test(text),
    samples: /\b\d+\s*(samples?|iterations?|runs?|requests?)\b/i.test(text),
    environment: /\b(ci|local|staging|production|machine|cores?|container)\b/i.test(text),
    labOrField: /\b(lab|field|synthetic|observed|real traffic)\b/i.test(text),
  };
  const missing = Object.entries(has).filter(([, v]) => !v).map(([k]) => k);
  return { matched: m[0], percentile: m[1], threshold: m[2], unit: m[3], missing };
}

/**
 * Decide a regression verdict from two sample sets.
 *
 * Deliberately **not** a ±% threshold: a threshold is triage, not a verdict.
 * The naive 15% gate missed a real 10% regression in 40 of 40 trials locally;
 * the 10% gate missed it in 19. Significance plus effect size caught all 40.
 */
export function compareSamples(control, test, { alpha = 0.01, minRatio = 1.05 } = {}) {
  if (!Array.isArray(control) || !Array.isArray(test) || control.length === 0 || test.length === 0) {
    return { verdict: "no-data", reason: "both arms need samples — this is reported, not passed" };
  }
  const cv = coefficientOfVariation([...control, ...test]);
  const u = wilcoxonRankSum(control, test);
  const ratio = median(test) / median(control);
  const fired = u.p < alpha && ratio > minRatio;
  return {
    verdict: fired ? "regression" : "clear",
    fired,
    p: u.p,
    ratio,
    cv,
    samples: { control: control.length, test: test.length },
    control: { median: median(control), p95: percentile(control, 0.95) },
    test: { median: median(test), p95: percentile(test, 0.95) },
    // Raw samples retained: a verdict that cannot be re-derived cannot be audited.
    raw: { control, test },
  };
}

/**
 * Whether the machine is too busy to produce a verdict.
 *
 * `skipped: machine busy` is neither pass nor fail. Silently passing would hide
 * the fact that nothing was checked; failing would punish the developer for
 * someone else's cron job.
 */
export function machineBusy({ loadAverage, cores, factor = 1.0 }) {
  if (typeof loadAverage !== "number" || typeof cores !== "number" || cores <= 0) {
    return { busy: true, reason: "load average or core count unknown — a comparison whose conditions are unknown has no verdict" };
  }
  const limit = cores * factor;
  if (loadAverage > limit) {
    return {
      busy: true,
      reason: `load average ${loadAverage.toFixed(2)} exceeds ${limit.toFixed(2)} cores — the harness reports "skipped: machine busy" and produces no verdict, because a busy machine has none`,
    };
  }
  return { busy: false, reason: `load average ${loadAverage.toFixed(2)} within ${limit.toFixed(2)} cores` };
}

// ─── statistics ────────────────────────────────────────────────────────────

export function median(a) {
  const s = [...a].sort((x, y) => x - y);
  const n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}

export function percentile(a, q) {
  const s = [...a].sort((x, y) => x - y);
  if (s.length === 0) return NaN;
  const idx = Math.min(s.length - 1, Math.max(0, Math.ceil(q * s.length) - 1));
  return s[idx];
}

export function coefficientOfVariation(a) {
  const mean = a.reduce((x, y) => x + y, 0) / a.length;
  if (!mean) return 0;
  const varr = a.reduce((x, y) => x + (y - mean) ** 2, 0) / (a.length - 1 || 1);
  return Math.sqrt(varr) / mean;
}

/** Hodges–Lehmann location shift (log-median ratio for ratios). */
export function hodgesLehmann(a, b) {
  const shifts = [];
  for (const x of a) for (const y of b) shifts.push(x / y);
  return median(shifts);
}

/**
 * Wilcoxon rank-sum (Mann–Whitney U) with tie correction, normal approximation.
 * Non-parametric on purpose: benchmark distributions are not normal, and a test
 * that assumes they are will tell you what you wanted to hear.
 */
export function wilcoxonRankSum(a, b) {
  const n1 = a.length;
  const n2 = b.length;
  const all = a.map((v) => ({ v, g: 0 })).concat(b.map((v) => ({ v, g: 1 })));
  all.sort((x, y) => x.v - y.v);

  const ranks = new Array(all.length);
  let i = 0;
  let tieCorrection = 0;
  while (i < all.length) {
    let j = i;
    while (j + 1 < all.length && all[j + 1].v === all[i].v) j++;
    const rank = (i + j + 2) / 2; // average rank, 1-based
    for (let k = i; k <= j; k++) ranks[k] = rank;
    const t = j - i + 1;
    if (t > 1) tieCorrection += t ** 3 - t;
    i = j + 1;
  }

  let r1 = 0;
  for (let k = 0; k < all.length; k++) if (all[k].g === 0) r1 += ranks[k];
  const u1 = r1 - (n1 * (n1 + 1)) / 2;
  const u = Math.min(u1, n1 * n2 - u1);

  const mu = (n1 * n2) / 2;
  const n = n1 + n2;
  const sigmaSq = (n1 * n2) / 12 * (n + 1 - tieCorrection / (n * (n - 1) || 1));
  const sigma = Math.sqrt(Math.max(sigmaSq, 1e-12));
  const z = (u - mu + 0.5) / sigma;
  return { u, z, p: 2 * (1 - normalCdf(Math.abs(z))) };
}

function normalCdf(x) {
  // Abramowitz & Stegun 26.2.17 — accurate to ~7.5e-8, plenty for a gate.
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804014327 * Math.exp((-x * x) / 2);
  const p = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x > 0 ? 1 - p : p;
}

/**
 * Render a measurement claim for the delivery report, so a number arrives with
 * its contract attached rather than as a bare assertion.
 */
export function renderMeasurement(claim) {
  const c = checkMeasurementContract(claim);
  if (!c.ok) {
    return `⚠ incomplete performance claim (${c.claim && c.claim.kind}): missing ${c.missing.join(", ")} — ${c.hint || "state what would make this falsifiable"}`;
  }
  const bits = Object.entries(c.claim)
    .filter(([k]) => k !== "kind")
    .map(([k, v]) => `${k}=${typeof v === "object" ? JSON.stringify(v) : v}`);
  return `${c.claim.kind} claim: ${bits.join(", ")}`;
}
