/**
 * Code Health Gate — configuration.
 *
 * Pure module: defaults + merge + normalization. No IO beyond reading the
 * config file it is handed. SSOT for every threshold (06c Rule 2).
 */

/** Built-in defaults — the gate is ON with conservative values. */
export const DEFAULT_CONFIG = {
  enabled: true,

  gate: {
    mode: "block", // "block" | "warn"
    scope: "large", // "large" | "all" | "off"
  },

  missingTool: "warn", // "warn" | "fail"

  // Per-tool spawn bound (06b Rule 15: every wait carries its own timeout).
  toolTimeoutSeconds: 120,

  function: {
    enabled: true,
    complexity: { enabled: true, max: 20 },
    cognitiveComplexity: { enabled: true, max: 15 },
    maxLinesPerFunction: { enabled: true, max: 50 },
    maxDepth: { enabled: true, max: 4 },
    maxParams: { enabled: true, max: 3 },
  },

  module: {
    enabled: true,
    maxFileLines: { enabled: true, max: 300 },
    duplication: { enabled: true, thresholdPercent: 5, minLines: 5, minTokens: 50 },
    circularDependencies: { enabled: true },
  },

  architecture: {
    enabled: true,
    dependencyRules: { enabled: false, config: ".asf-code-health.rules.mjs" },
  },

  ignore: [
    "**/node_modules/**",
    "**/dist/**",
    "**/build/**",
    "**/coverage/**",
    "**/test/**",
    "**/tests/**",
    "**/__tests__/**",
    "**/fixtures/**",
    "**/*.test.*",
    "**/*.spec.*",
  ],
};

/** Deep-merge `overrides` onto `base`, returning a new object. */
export function mergeConfig(base, overrides) {
  if (overrides === undefined || overrides === null) return structuredClone(base);
  if (typeof overrides !== "object" || Array.isArray(overrides)) return structuredClone(base);
  const out = structuredClone(base);
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) continue;
    if (
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      typeof out[key] === "object" &&
      out[key] !== null &&
      !Array.isArray(out[key])
    ) {
      out[key] = mergeConfig(out[key], value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/** Coerce a value to a positive finite number, falling back to `fallback`. */
function num(value, fallback) {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function bool(value, fallback) {
  return typeof value === "boolean" ? value : fallback;
}

function oneOf(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

/**
 * Normalize a raw config object (from .asf-code-health.json) into a complete
 * config with every field typed. Unknown keys are dropped; wrong types fall
 * back to the default for that field.
 */
export function normalizeConfig(raw) {
  const d = DEFAULT_CONFIG;
  if (!isPlainObject(raw)) return structuredClone(d);
  const g = isPlainObject(raw.gate) ? raw.gate : {};
  const f = isPlainObject(raw.function) ? raw.function : {};
  const m = isPlainObject(raw.module) ? raw.module : {};
  const a = isPlainObject(raw.architecture) ? raw.architecture : {};
  const metric = (obj, name) => (isPlainObject(obj[name]) ? obj[name] : {});

  const complexity = metric(f, "complexity");
  const cognitive = metric(f, "cognitiveComplexity");
  const linesFn = metric(f, "maxLinesPerFunction");
  const depth = metric(f, "maxDepth");
  const params = metric(f, "maxParams");
  const fileLines = metric(m, "maxFileLines");
  const dup = metric(m, "duplication");
  const circ = metric(m, "circularDependencies");
  const depRules = metric(a, "dependencyRules");

  return {
    enabled: bool(raw.enabled, d.enabled),
    gate: {
      mode: oneOf(g.mode, ["block", "warn"], d.gate.mode),
      scope: oneOf(g.scope, ["large", "all", "off"], d.gate.scope),
    },
    missingTool: oneOf(raw.missingTool, ["warn", "fail"], d.missingTool),
    toolTimeoutSeconds: num(raw.toolTimeoutSeconds, d.toolTimeoutSeconds),
    function: {
      enabled: bool(f.enabled, d.function.enabled),
      complexity: { enabled: bool(complexity.enabled, true), max: num(complexity.max, d.function.complexity.max) },
      cognitiveComplexity: { enabled: bool(cognitive.enabled, true), max: num(cognitive.max, d.function.cognitiveComplexity.max) },
      maxLinesPerFunction: { enabled: bool(linesFn.enabled, true), max: num(linesFn.max, d.function.maxLinesPerFunction.max) },
      maxDepth: { enabled: bool(depth.enabled, true), max: num(depth.max, d.function.maxDepth.max) },
      maxParams: { enabled: bool(params.enabled, true), max: num(params.max, d.function.maxParams.max) },
    },
    module: {
      enabled: bool(m.enabled, d.module.enabled),
      maxFileLines: { enabled: bool(fileLines.enabled, true), max: num(fileLines.max, d.module.maxFileLines.max) },
      duplication: {
        enabled: bool(dup.enabled, true),
        thresholdPercent: num(dup.thresholdPercent, d.module.duplication.thresholdPercent),
        minLines: num(dup.minLines, d.module.duplication.minLines),
        minTokens: num(dup.minTokens, d.module.duplication.minTokens),
      },
      circularDependencies: { enabled: bool(circ.enabled, true) },
    },
    architecture: {
      enabled: bool(a.enabled, d.architecture.enabled),
      dependencyRules: {
        enabled: bool(depRules.enabled, false),
        config: typeof depRules.config === "string" && depRules.config ? depRules.config : d.architecture.dependencyRules.config,
      },
    },
    ignore: Array.isArray(raw.ignore) && raw.ignore.every((x) => typeof x === "string") && raw.ignore.length > 0
      ? raw.ignore
      : [...d.ignore],
  };
}

/**
 * Load the project config: read `.asf-code-health.json` if present, normalize.
 * `readFile` is injectable for tests.
 */
export async function loadConfig(projectRoot, readFile = null) {
  const fs = readFile || (await import("node:fs/promises")).readFile;
  let raw = null;
  try {
    const text = await fs(`${projectRoot}/.asf-code-health.json`, "utf-8");
    raw = JSON.parse(text);
  } catch {
    raw = null; // no file, or unreadable/invalid → defaults
  }
  return normalizeConfig(raw);
}
