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

/** @typedef {'default'|'project'|'calibrated'|'override'|'no-default'} ValueOrigin */

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
export { PARAMS } from "./params.mjs";
import { PARAMS } from "./params.mjs";
import { clamp } from "./math.mjs";
export { clamp } from "./math.mjs";

/** Values that must never be moved by calibration or a project file. */
export const NON_ADAPTIVE = Object.values(PARAMS)
  .filter((p) => p.nonAdaptive)
  .map((p) => p.key);


/**
 * Resolve one parameter through the three tiers.
 *
 * @param {string} key
 * @param {{projectConfig?: object, measurements?: object, overrides?: object}} [tiers]
 * @returns {{key:string,value:any,origin:ValueOrigin,general:any,band:object|null,source:string,why:string,gate:string,nonAdaptive:boolean}}
 */
const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
const bandText = (band) => (band ? `${band.min}–${band.max}` : "n/a");

/** A parameter with no defensible default says so rather than guessing. */
function resolveDeclaredTarget({ base, key, projectConfig, overrides }) {
  const declared = has(overrides, key) ? overrides[key] : has(projectConfig, key) ? projectConfig[key] : null;
  if (declared == null || declared === "") {
    return { ...base, value: null, origin: "no-default", why: "no-default: needs a declared target" };
  }
  return { ...base, value: declared, origin: "project", why: "declared target" };
}

/** The general value is the only value; an attempt to move it is reported, not obeyed. */
function resolveNonAdaptive({ base, spec, key, projectConfig, overrides }) {
  const attempted = has(overrides, key) || has(projectConfig, key);
  return {
    ...base,
    value: spec.general,
    origin: "default",
    why: attempted
      ? `NON-ADAPTIVE: a configured value for "${key}" was ignored — flexing it invalidates the measurement rather than tuning it`
      : "non-adaptive validity constant",
  };
}

function resolveOverride({ base, spec, key, overrides }) {
  const v = overrides[key];
  const inBand = spec.band ? v >= spec.band.min && v <= spec.band.max : true;
  return {
    ...base,
    value: v,
    origin: "override",
    // Outside the band is only reachable by explicit user configuration, and
    // then it must be visible as such rather than looking like a default.
    why: inBand
      ? `explicit override (within band ${bandText(spec.band)})`
      : `explicit override OUTSIDE the band ${spec.band ? bandText(spec.band) : ""} — visible as an override, not as a default`,
  };
}

function resolveProject({ base, spec, key, projectConfig }) {
  const raw = projectConfig[key];
  if (spec.type === "number" && typeof raw !== "number") {
    return { ...base, value: spec.general, origin: "default", why: `project value ignored: "${key}" must be a number` };
  }
  if (!spec.band) return { ...base, value: raw, origin: "project", why: "project configuration" };
  const v = clamp(raw, spec.band.min, spec.band.max);
  return {
    ...base,
    value: v,
    origin: "project",
    why: v === raw
      ? `project configuration (band ${bandText(spec.band)})`
      : `project asked for ${raw}; clamped into the band to ${v}`,
  };
}

function resolveCalibrated(base, spec, measurements) {
  const cal = spec.calibrate ? spec.calibrate(measurements) : null;
  if (!cal) return { ...base, value: spec.general, origin: "default", why: "general default (no project configuration, no calibration input)" };
  const v = spec.band ? clamp(cal.value, spec.band.min, spec.band.max) : cal.value;
  return { ...base, value: v, origin: "calibrated", why: cal.why };
}

/**
 * Resolve one parameter from the most specific tier that supplies it.
 * @param {string} key
 * @param {{projectConfig?: object, measurements?: object, overrides?: object}} [tiers]
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

  const ctx = { base, spec, key, projectConfig, overrides, measurements };
  if (spec.requiresDeclaredTarget) return resolveDeclaredTarget(ctx);
  if (spec.nonAdaptive) return resolveNonAdaptive(ctx);
  if (has(overrides, key)) return resolveOverride(ctx);
  if (has(projectConfig, key)) return resolveProject(ctx);
  return resolveCalibrated(base, spec, measurements);
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
