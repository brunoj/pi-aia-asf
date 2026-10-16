/**
 * `/asf config` — the configuration core (P47).
 *
 * Today ASF's configuration is four hand-edited JSON files with no
 * discoverability and no validation: a reviewer cannot see what is configured,
 * an agent cannot ask, and a typo is discovered by the gate silently not
 * running. This module is the testable core; index.ts wires it to pi's
 * `SettingsList` for the interactive screen.
 *
 * The guard that keeps the surface from rotting: **a parameter may exist only if
 * it is in the parameter table and is consumed by a named gate.** A screen makes
 * knobs cheap to add, and unused knobs are drift surface — which is why P25
 * deleted `.asf-test.json`.
 *
 * Writes are explicit. The screen edits a draft; nothing persists until
 * confirmed, and the diff is shown first. `gate.mode: warn` should be hard to
 * set accidentally and easy to see.
 */

import fs from "node:fs";
import path from "node:path";
import { PARAMS, NON_ADAPTIVE, resolveAll, resolveParam, explainParam, validateParam } from "./defaults.mjs";

export const CONFIG_FILE = ".asf-config.json";

export function configPath(projectDir) {
  return path.join(projectDir, CONFIG_FILE);
}

export function readProjectConfig(projectDir) {
  const file = configPath(projectDir);
  if (!fs.existsSync(file)) return {};
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf-8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (e) {
    // A broken config file is reported, never silently treated as "no config":
    // the latter would let a typo make a gate look unconfigured and pass.
    return { __error: `${file}: could not be parsed (${e.message})` };
  }
}

export function writeProjectConfig(projectDir, values) {
  const file = configPath(projectDir);
  fs.writeFileSync(file, JSON.stringify(values, null, 2) + "\n", "utf-8");
  return file;
}

/**
 * Validate a whole draft before anything is written. Returns a list of problems;
 * an empty list means the draft may be persisted.
 */
export function validateDraft(draft) {
  const problems = [];
  for (const [k, v] of Object.entries(draft || {})) {
    if (k.startsWith("__")) continue;
    const p = validateParam(k, v);
    if (p) problems.push(`${k}: ${p}`);
  }
  return problems;
}

/**
 * The guard: every key present anywhere must be in the table and consumed by a
 * named gate. Also catches a config file that still carries a key nobody reads.
 */
export function assertParametersAreConsumed(projectConfig = {}, { knownGates } = {}) {
  const problems = [];
  for (const k of Object.keys(projectConfig)) {
    if (k.startsWith("__")) continue;
    if (!PARAMS[k]) {
      problems.push(`${k}: not in the parameter table — a parameter exists only if it is in the table and consumed by a named gate, or it is deleted`);
      continue;
    }
    if (knownGates && !knownGates.includes(PARAMS[k].gate)) {
      problems.push(`${k}: consumed by gate "${PARAMS[k].gate}", which no longer exists`);
    }
  }
  for (const [k, spec] of Object.entries(PARAMS)) {
    if (!spec.gate) problems.push(`${k}: has no consuming gate`);
    if (!spec.source || !String(spec.source).trim()) problems.push(`${k}: has no source — a default that cannot explain itself is a guess with better formatting`);
    if ((spec.band == null) !== !!spec.nonAdaptive) {
      problems.push(`${k}: a band requires adaptability, and a non-adaptive constant must not have one`);
    }
  }
  return problems;
}

/**
 * The screen model: one row per parameter, each showing value, origin, band and
 * source. This is what `SettingsList` renders.
 */
export function screenModel({ projectDir, measurements = {}, overrides = {} } = {}) {
  const projectConfig = readProjectConfig(projectDir);
  const resolved = resolveAll({ projectConfig, measurements, overrides });
  return Object.keys(PARAMS).map((key) => {
    const r = resolved[key];
    const spec = PARAMS[key];
    return {
      id: key,
      label: key,
      description: `${spec.meaning}\n  gate: ${spec.gate}\n  source: ${spec.source}`,
      currentValue: formatValue(r.value),
      // Non-adaptive parameters are shown but not cycled: they are displayed
      // facts about the method, not knobs.
      values: spec.nonAdaptive ? undefined : candidateValues(spec),
      origin: r.origin,
      band: r.band ? `${r.band.min} .. ${r.band.max}` : "non-adaptive",
      general: formatValue(r.general),
      why: r.why,
      nonAdaptive: !!spec.nonAdaptive,
      type: spec.type,
    };
  });
}

function candidateValues(spec) {
  if (spec.type === "boolean") return ["true", "false"];
  if (spec.type === "number" && spec.band) {
    const { min, max } = spec.band;
    const step = Math.max(1, Math.round((max - min) / 8));
    const out = [];
    for (let v = min; v <= max; v += step) out.push(String(v));
    if (out[out.length - 1] !== String(max)) out.push(String(max));
    return out;
  }
  return undefined;
}

function formatValue(v) {
  return typeof v === "boolean" || typeof v === "number" ? String(v) : JSON.stringify(v);
}

/** `--get` / `--set` / `--explain` — the screen is a convenience, not the only door. */
export function cli({ action, key, value, projectDir, measurements = {}, overrides = {} }) {
  const projectConfig = readProjectConfig(projectDir);
  const tiers = { projectConfig, measurements, overrides };

  if (action === "explain") {
    if (!key) return "usage: /asf config --explain <key>";
    try {
      return explainParam(key, tiers);
    } catch (e) {
      return String(e.message || e);
    }
  }

  if (action === "get") {
    if (key) {
      try {
        const r = resolveParam(key, tiers);
        return `${r.key} = ${formatValue(r.value)}  [${r.origin}]  (${r.why})`;
      } catch (e) {
        return String(e.message || e);
      }
    }
    const rows = screenModel({ projectDir, measurements, overrides });
    return rows
      .map((r) => `${r.id} = ${r.currentValue}  [${r.origin}]  band ${r.band}${r.nonAdaptive ? "  (non-adaptive)" : ""}`)
      .join("\n");
  }

  if (action === "set") {
    if (!key) return "usage: /asf config --set <key>=<value>";
    const problem = validateParam(key, coerce(value));
    if (problem) return `refused: ${problem}`;
    const next = { ...projectConfig, [key]: coerce(value) };
    delete next.__error;
    const file = writeProjectConfig(projectDir, next);
    const r = resolveParam(key, { projectConfig: next, measurements, overrides });
    return `wrote ${key} = ${formatValue(r.value)} [${r.origin}] to ${file}`;
  }

  if (action === "unset") {
    if (!key) return "usage: /asf config --unset <key>";
    const next = { ...projectConfig };
    delete next[key];
    delete next.__error;
    writeProjectConfig(projectDir, next);
    return `cleared ${key}; it now resolves to the general default (${resolveParam(key, { projectConfig: next, measurements, overrides }).general})`;
  }

  if (action === "check") {
    const problems = assertParametersAreConsumed(projectConfig, {
      knownGates: [...new Set(Object.values(PARAMS).map((p) => p.gate))],
    });
    return problems.length ? `configuration problems:\n- ${problems.join("\n- ")}` : "configuration is consistent: every key is in the table and consumed by a named gate";
  }

  return "usage: /asf config [--get [key] | --set k=v | --unset k | --explain k | --check]";
}

function coerce(v) {
  if (v === "true") return true;
  if (v === "false") return false;
  const n = Number(v);
  return typeof v === "string" && v !== "" && Number.isFinite(n) ? n : v;
}

export { PARAMS, NON_ADAPTIVE };
