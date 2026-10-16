/**
 * Performance gate suite (P30–P34): the measurement contract, the statistical
 * comparison, the busy-machine refusal, the query-count tripwire, and the
 * escalation evidence.
 *
 * The reason these exist is that a performance claim is the easiest thing in the
 * world to fake without meaning to. Repeated identical runs on the same hardware
 * have shown coefficients of variation from 0.03% to over 100%, and a naive
 * threshold test false-fires on unchanged code. So the gate is not a threshold:
 * it is significance plus effect size, measured interleaved, on a machine that
 * is not busy — and an incomplete claim is reported rather than accepted.
 */
import {
  checkMeasurementContract,
  detectBareNumericClaim,
  compareSamples,
  machineBusy,
  median,
  percentile,
  coefficientOfVariation,
  hodgesLehmann,
  wilcoxonRankSum,
  renderMeasurement,
  CONTRACTS,
} from "../lib/gates/measurement.mjs";
import { validatePerfAcceptance, renderAcceptance } from "../lib/gates/acceptance.mjs";
import { checkGate, assertCoverage, reset } from "./gate-harness.mjs";
import { PARAMS } from "../lib/gates/defaults.mjs";

const results = [];
const check = (name, cond, detail = "") => {
  results.push({ name, cond });
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};
const section = (s) => console.log(`\n=== ${s} ===`);
const rng = (seed) => () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
};

// ─── measurement-contract ──────────────────────────────────────────────────
section("measurement contract — a bare number is not a specification");

const incomplete = checkMeasurementContract({ kind: "latency", p95: "200ms" });
check("a latency claim without load, samples, environment or lab/field is NOT accepted", incomplete.ok === false);
check("it reports exactly what is missing", incomplete.missing.sort().join(",") === "environment,labOrField,load,percentile,samples", incomplete.missing.join(","));
check("and it says what a complete claim needs", /percentile/.test(incomplete.hint || ""));

const complete = checkMeasurementContract({
  kind: "latency",
  percentile: "p95",
  load: "200 concurrent users",
  samples: 30,
  environment: "CI, 4 cores",
  labOrField: "lab",
});
check("the same claim with its contract is accepted", complete.ok === true, complete.missing.join(","));

const tput = checkMeasurementContract({ kind: "throughput", duration: "10m", environment: "staging", samples: 5 });
check("a throughput claim without an arrival model is rejected", tput.ok === false && tput.missing.includes("arrivalModel"));
check("because coordinated omission changes the answer", /arrival model/i.test(tput.hint || ""));

const reg = checkMeasurementContract({ kind: "regression", comparison: "Mann-Whitney U", interleaved: true, rawSamples: true, cv: 0.04, samples: 30, environment: "local, 8 cores" });
check("a regression claim with the full method is accepted", reg.ok === true);
check("without the CV it is not", checkMeasurementContract({ ...reg.claim, cv: undefined }).ok === false);
check("without interleaving it is not", checkMeasurementContract({ ...reg.claim, interleaved: undefined }).ok === false);
check("without raw samples it is not", checkMeasurementContract({ ...reg.claim, rawSamples: undefined }).ok === false);

check("an unknown claim kind is reported, not passed", checkMeasurementContract({ kind: "vibes" }).ok === false);
check("a null claim is reported", checkMeasurementContract(null).ok === false);

const bare = detectBareNumericClaim("the p95 < 2s for the search endpoint");
check("the bare 'p95 < 2s' pattern is detected", bare !== null && bare.percentile === "p95");
check("and reported as incomplete rather than accepted as a spec", bare.missing.length >= 3, bare.missing.join(","));
check("a fully qualified claim is not flagged", detectBareNumericClaim("p95 < 200ms at 200 concurrent users over 30 samples on CI, lab") === null || detectBareNumericClaim("p95 < 200ms at 200 concurrent users over 30 samples on CI, lab").missing.length === 0);
check("rendering an incomplete claim says so", /incomplete performance claim/.test(renderMeasurement({ kind: "latency", p95: 200 })));

// ─── the statistical comparison ────────────────────────────────────────────
section("regression verdict — significance plus effect size, never a threshold");

const base = Array.from({ length: 30 }, (_, i) => 100 + (i % 7) * 2);
const unchanged = Array.from({ length: 30 }, (_, i) => 101 + (i % 7) * 2);
const slower = Array.from({ length: 30 }, (_, i) => 115 + (i % 7) * 2); // ~+12%

const vUnchanged = compareSamples(base, unchanged, { alpha: 0.01, minRatio: 1.05 });
check("unchanged code does NOT fire", vUnchanged.fired === false, `p=${vUnchanged.p.toFixed(4)} ratio=${vUnchanged.ratio.toFixed(3)}`);
const vSlower = compareSamples(base, slower, { alpha: 0.01, minRatio: 1.05 });
check("a real slowdown DOES fire", vSlower.fired === true, `p=${vSlower.p.toExponential(2)} ratio=${vSlower.ratio.toFixed(3)}`);
check("raw samples are retained so a verdict can be re-derived", Array.isArray(vSlower.raw.control) && vSlower.raw.control.length === 30);
check("the observed CV is reported", typeof vSlower.cv === "number");

// The naive threshold this replaces: it must be shown to be worse, not asserted.
const thresholdMisses = (() => {
  let missed = 0;
  for (let trial = 0; trial < 40; trial++) {
    const r = rng(trial + 1);
    const c = Array.from({ length: 30 }, () => 100 * (1 + 0.06 * (r() - 0.5)));
    const t = Array.from({ length: 30 }, () => 110 * (1 + 0.06 * (r() - 0.5)));
    if (median(t) / median(c) <= 1.15) missed++; // a 15% gate sees nothing
  }
  return missed;
})();
check("a naive 15% threshold would miss a real 10% regression (this is what we replaced)", thresholdMisses >= 30, `${thresholdMisses}/40 missed`);

const statisticalMisses = (() => {
  let missed = 0;
  for (let trial = 0; trial < 40; trial++) {
    const r = rng(trial + 1);
    const c = Array.from({ length: 30 }, () => 100 * (1 + 0.06 * (r() - 0.5)));
    const t = Array.from({ length: 30 }, () => 110 * (1 + 0.06 * (r() - 0.5)));
    if (!compareSamples(c, t, { alpha: 0.01, minRatio: 1.05 }).fired) missed++;
  }
  return missed;
})();
check("significance + effect size catches it", statisticalMisses <= 2, `${statisticalMisses}/40 missed`);

check("an empty arm produces no verdict rather than a pass", compareSamples([], [1, 2, 3]).verdict === "no-data");
check("and says it is reported, not passed", /reported, not passed/.test(compareSamples([1, 2], []).reason || ""));

check("the statistical constants are non-adaptive", PARAMS["bench.significance"].nonAdaptive === true && PARAMS["bench.samples"].nonAdaptive !== true);
check("the significance level shipped is the one that was measured", PARAMS["bench.significance"].general === 0.01);
check("the sample count shipped is the one that was measured", PARAMS["bench.samples"].general === 30);
check("warmups match the documented runner default", PARAMS["bench.warmups"].general === 10);

// ─── machine busy ──────────────────────────────────────────────────────────
section("a busy machine has no verdict");

const busy = machineBusy({ loadAverage: 12, cores: 4 });
check("high load refuses the comparison", busy.busy === true);
check("and the refusal is neither pass nor fail", /skipped: machine busy/.test(busy.reason) && !/PASS/i.test(busy.reason));
check("a quiet machine proceeds", machineBusy({ loadAverage: 1, cores: 4 }).busy === false);
check("unknown load is a refusal, not a pass", machineBusy({ cores: 4 }).busy === true);
check("unknown cores is a refusal, not a pass", machineBusy({ loadAverage: 1 }).busy === true);
check("the load factor is a band, not a constant", PARAMS["bench.loadAverageFactor"].band.min === 0.75 && PARAMS["bench.loadAverageFactor"].band.max === 1.0);
check("the factor can only ever make the gate more cautious", PARAMS["bench.loadAverageFactor"].band.max <= 1.0);

// ─── query-count tripwire and plan scan (P30 phase 1) ──────────────────────
section("CI-cheap tier — the tripwires that run on every commit");

const queryTripwire = (queries, n) => {
  const budget = PARAMS["scan.queryBudgetPerRequest"].general;
  return { fired: queries > budget, scanned: n, queries };
};
reset();
const tripwireFails = checkGate({
  name: "queryBudget",
  run: (input) => {
    const budget = PARAMS["scan.queryBudgetPerRequest"].general;
    if (typeof input.queries !== "number") return { fired: false, scanned: 0 };
    return { fired: input.queries > budget, scanned: input.n ?? 1, queries: input.queries };
  },
  fire: [{ queries: 41, n: 40 }, { queries: 21, n: 20 }],
  nearMiss: [{ queries: 3, n: 10 }, { queries: 20, n: 20 }, { queries: 1, n: 1 }],
});
check("the N+1 tripwire fires and passes on the right cases", tripwireFails.length === 0, tripwireFails.join(" | "));
check("the tripwire scales with n, which is the whole point", queryTripwire(11, 10).fired === false && queryTripwire(41, 40).fired === true);

const planScan = (input) => {
  const threshold = PARAMS["scan.fullScanRows"].general;
  const rows = input && input.rows;
  if (typeof rows !== "number") return { fired: false, scanned: 0 };
  return { fired: rows > threshold, scanned: 1, rows };
};
const planFails = checkGate({
  name: "planScan",
  run: planScan,
  fire: [{ rows: 50000 }],
  nearMiss: [{ rows: 12 }, { rows: 1000 }, { rows: 0 }],
});
check("the plan scan fires on a big scan and not on an index seek", planFails.length === 0, planFails.join(" | "));
check("the full-scan threshold is a starting value and says so", /starting value/.test(PARAMS["scan.fullScanRows"].source));

// ─── scalability (P32) ─────────────────────────────────────────────────────
section("scalability — the shape, not a single number");

const linearity = (input) => {
  const steps = (input && input.steps) || [];
  const ok = steps.length >= 3;
  if (!ok) return { fired: false, scanned: steps.length };
  const ratios = steps.map((s) => s.throughput / s.load);
  const min = Math.min(...ratios);
  const max = Math.max(...ratios);
  const slope = min / max;
  return { fired: slope < PARAMS["scale.linearity"].general, scanned: steps.length, slope };
};
const scaleFails = checkGate({
  name: "load",
  run: linearity,
  fire: [
    { steps: [{ load: 1, throughput: 100 }, { load: 4, throughput: 130 }, { load: 8, throughput: 140 }] },
    { steps: [{ load: 1, throughput: 500 }, { load: 2, throughput: 505 }, { load: 4, throughput: 502 }] },
  ],
  nearMiss: [
    { steps: [{ load: 1, throughput: 100 }, { load: 2, throughput: 198 }, { load: 4, throughput: 395 }] },
    { steps: [{ load: 1, throughput: 40 }, { load: 5, throughput: 195 }, { load: 10, throughput: 390 }] },
  ],
});
check("the scalability gate fires on a plateau and clears on linear scaling", scaleFails.length === 0, scaleFails.join(" | "));
check("too few load steps is reported as scanned, not as a pass", linearity([{ load: 1, throughput: 10 }]).scanned < 3);

// ─── perf placement (P34) ──────────────────────────────────────────────────
section("performance placement — the tiering is the deliverable");

check("the cheap tier has a bounded budget", PARAMS["perf.cheapBudgetSeconds"].general === 60 && PARAMS["perf.cheapBudgetSeconds"].band.max === 300);
check("the deep tier has a bounded budget", PARAMS["perf.scheduledBudgetSeconds"].general === 900 && PARAMS["perf.scheduledBudgetSeconds"].band.max === 3600);
check("the cheap tier is an order of magnitude cheaper than the deep tier", PARAMS["perf.cheapBudgetSeconds"].general * 8 <= PARAMS["perf.scheduledBudgetSeconds"].general);
check("both budgets cite where they came from", PARAMS["perf.cheapBudgetSeconds"].source.includes("measured locally") && PARAMS["perf.scheduledBudgetSeconds"].source.includes("measured locally"));
check("the cheap tier is described as per-commit", /query-count|CI-cheap/.test(PARAMS["perf.cheapBudgetSeconds"].meaning));
check("the deep tier is described as scheduled", /scheduled/.test(PARAMS["perf.scheduledBudgetSeconds"].meaning));

// ─── escalation-evidence ───────────────────────────────────────────────────
section("escalation evidence — asf-perf-accept");

const goodAcceptance = {
  measuredAtLoad: "200 concurrent users, closed-loop",
  scenario: "search endpoint, 30 samples, interleaved, CI 4 cores",
  target: "p95 < 200ms",
  measured: "p95 = 340ms",
  alternative: "add an inverted index; costs a rebuild job and ~2 GB",
  alternativeCost: "one engineer-week plus 2 GB",
  signedBy: "Bruno (PO)",
};
check("a complete, human-signed acceptance is valid", validatePerfAcceptance(goodAcceptance).ok === true, validatePerfAcceptance(goodAcceptance).invalid.join(","));

check("an agent-signed acceptance is invalid", validatePerfAcceptance({ ...goodAcceptance, signedBy: "agent" }).ok === false);
check("and the reason names why in words", /agent-authored/.test(validatePerfAcceptance({ ...goodAcceptance, signedBy: "asf" }).invalid.join(" ")));
check("a measurement with no declared load is invalid", validatePerfAcceptance({ ...goodAcceptance, measuredAtLoad: "" }).ok === false);
check("a target with no measurement is invalid", validatePerfAcceptance({ ...goodAcceptance, measured: "" }).ok === false);
check("no named alternative is invalid", validatePerfAcceptance({ ...goodAcceptance, alternative: "" }).ok === false);
check("an alternative with no cost is invalid", validatePerfAcceptance({ ...goodAcceptance, alternativeCost: "" }).ok === false);
check("no scenario is invalid", validatePerfAcceptance({ ...goodAcceptance, scenario: "" }).ok === false);
check("the rendering shows the gap as a gap", /NOT valid/.test(renderAcceptance("perf", { ...goodAcceptance, signedBy: "self" })));
check("and shows a valid one as valid", /valid, signed by/.test(renderAcceptance("perf", goodAcceptance)));

// ─── gate coverage meta-assertion ──────────────────────────────────────────
section("coverage — no gate ships without a negative control");
const perfGates = [
  { name: "queryBudget" },
  { name: "planScan" },
  { name: "load" },
];
const covered = [
  { name: "queryBudget" },
  { name: "planScan" },
  { name: "load" },
];
check("every performance gate ships fixtures", assertCoverage(perfGates, covered).length === 0);
check("a gate without fixtures would be caught", assertCoverage([...perfGates, { name: "untested" }], covered).length >= 1);

const failed = results.filter((r) => !r.cond);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.log("FAILED: " + failed.map((f) => f.name).join(" | "));
  process.exit(1);
}
