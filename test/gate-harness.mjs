/**
 * Gate harness (P44) — every gate ships with a negative control.
 *
 * The failure this exists to prevent is not a gate that wrongly blocks; it is a
 * gate that silently stops checking anything and still reports green. A check
 * that examines nothing and a check that examined everything look identical from
 * the outside unless something measures both. So each gate must demonstrate two
 * behaviours, not one:
 *
 *   fire      — an input that MUST make it fire (proof it can detect)
 *   near-miss — an input that MUST NOT fire (proof it is not firing on
 *               everything, and the test that protects correct work)
 *
 * **A gate whose near-miss starts failing is a bug in the gate, not a test to
 * update.** That sentence is here because the human failure mode under time
 * pressure is always to relax the test.
 *
 * `scanned: 0` is never a pass, in the gates and in the tests of the gates.
 */

/**
 * A fixture is either a bare input, or `{ input, ctx }` when the gate needs
 * session state (a recorded suite run, a dirty tree, a stated impact area).
 *
 * @typedef {any | {input: any, ctx?: any}} GateFixture
 * @typedef {object} GateDefinition
 * @property {string} name
 * @property {(input: any, ctx?: any) => {fired: boolean, [k:string]: any}} run   the real gate
 * @property {GateFixture|Array<GateFixture>} fire      case(s) that must make it fire
 * @property {GateFixture|Array<GateFixture>} nearMiss  case(s) that must NOT make it fire
 * @property {string} [rule]              rule id this gate enforces
 * @property {('H'|'M'|'S')} [class]
 */

const results = [];

function asArray(v) {
  return Array.isArray(v) ? v : [v];
}

/** A fixture may be a bare input or `{ input, ctx }`. */
function unwrap(f) {
  if (f && typeof f === "object" && !Array.isArray(f) && "input" in f) {
    return { input: f.input, ctx: f.ctx ?? {} };
  }
  return { input: f, ctx: {} };
}

/**
 * Run one gate's two fixtures. Returns the failures so a suite can aggregate
 * them and assert on the total.
 */
export function checkGate(def) {
  const fails = [];
  if (!def || typeof def.name !== "string" || !def.name) {
    fails.push("gate definition requires a name");
    return fails;
  }
  if (typeof def.run !== "function") {
    fails.push(`${def.name}: gate has no run() — nothing to verify`);
    return fails;
  }

  const fires = asArray(def.fire);
  const misses = asArray(def.nearMiss);

  if (fires.length === 0) fails.push(`${def.name}: no fire fixture — a gate cannot ship without a case that must make it fire`);
  if (misses.length === 0) fails.push(`${def.name}: no near-miss fixture — a gate cannot ship without a case that must make it pass`);

  fires.forEach((fixture, i) => {
    const { input, ctx } = unwrap(fixture);
    let v = null;
    let err = null;
    try {
      v = def.run(input, ctx);
    } catch (e) {
      err = (e && e.message) || String(e);
    }
    if (err) fails.push(`${def.name}: fire fixture[${i}] threw (${err}) — a gate must report, not crash`);
    else if (!v || v.fired !== true) fails.push(`${def.name}: fire fixture[${i}] did not fire — the gate has lost its power`);
    else if (v.scanned === 0) fails.push(`${def.name}: fire fixture[${i}] fired while scanned: 0 — a check that examined nothing has not passed`);
  });

  misses.forEach((fixture, i) => {
    const { input, ctx } = unwrap(fixture);
    let v = null;
    let err = null;
    try {
      v = def.run(input, ctx);
    } catch (e) {
      err = (e && e.message) || String(e);
    }
    if (err) fails.push(`${def.name}: near-miss fixture[${i}] threw (${err}) — a gate must report, not crash`);
    else if (v && v.fired === true)
      fails.push(`${def.name}: near-miss fixture[${i}] fired — the gate is eating correct work. This is a bug in the GATE, not a test to update.`);
  });

  results.push({ name: def.name, fails });
  return fails;
}

/**
 * The meta-assertion: the count of gates with a negative control equals the
 * count of gates. A gate cannot be added without one, and cannot be added and
 * quietly left untested.
 *
 * @param {GateDefinition[]} gates  every gate the extension registers
 * @param {GateDefinition[]} covered  every gate that ships fixtures
 */
export function assertCoverage(gates, covered) {
  const fails = [];
  const coveredNames = new Set(covered.map((g) => g.name));
  for (const g of gates) {
    if (!coveredNames.has(g.name)) {
      fails.push(`${g.name}: registered but has no negative-control fixtures — no gate ships without two fixtures`);
    }
  }
  for (const g of covered) {
    if (!gates.some((x) => x.name === g.name)) {
      fails.push(`${g.name}: fixtures exist for a gate that is not registered — dead test scaffolding`);
    }
  }
  if (gates.length !== covered.length) {
    fails.push(`coverage mismatch: ${gates.length} gates registered, ${covered.length} with fixtures`);
  }
  results.push({ name: "coverage", fails });
  return fails;
}

/** Aggregate every checkGate/assertCoverage result collected so far. */
export function summarize() {
  const all = [];
  for (const r of results) for (const f of r.fails) all.push(f);
  return { total: results.length, failures: all };
}

export function reset() {
  results.length = 0;
}

/**
 * Helper for gates whose "did it look at anything" answer must be honest.
 * A gate returning scanned: 0 reports it; nothing downstream may read it as a
 * pass, and this function makes that a single obvious call site.
 */
export function verdict({ fired, scanned, detail = "", error = null }) {
  const v = { fired: !!fired, scanned, detail };
  if (error) v.error = error;
  if (scanned === 0) {
    // The guard does not overclaim: examining nothing is reported as such.
    v.fired = false;
    v.reported = "scanned: 0 — nothing was examined, so this is not a pass";
  }
  return v;
}
