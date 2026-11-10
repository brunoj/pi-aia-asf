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

  // Model level (P27, references/06j-data-model.md): a tripwire that asks
  // whether a deletion decision was written down. Built in — no tool to be
  // missing. The pattern set is illustrative; projects add their own dialect
  // with extraCascadePatterns rather than waiting for a release.
  model: {
    enabled: true,
    requireDeclaration: true, // cascade requires an asf-model: declaration
    deleteRebuild: true, // delete + reinsert of the same target
    // A cascade written by hand in a store with no FK action to inspect —
    // MongoDB, Firestore, DynamoDB, CouchDB, Redis, Elasticsearch. Without it
    // the model gate reads as SQL-only, which is the blind spot 06j §5 names.
    handWrittenCascade: true,
    declarationWindowLines: 8,
    rebuildWindowLines: 30,
    extraCascadePatterns: [],
    extraHandWrittenPatterns: [],
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
/** A metric block: `{ enabled, max }` with the defaults filled in. */
function limitBlock(obj, fallback, withEnabled = true) {
  const block = withEnabled ? { enabled: bool(obj.enabled, true) } : {};
  if (typeof fallback === "number") block.max = num(obj.max, fallback);
  return block;
}

function patternList(value, fallback) {
  if (!Array.isArray(value) || value.length === 0) return fallback;
  return value.filter((x) => typeof x === "string" && x.length > 0);
}

function functionSection(f, d) {
  const metric = (name) => (isPlainObject(f[name]) ? f[name] : {});
  return {
    enabled: bool(f.enabled, d.function.enabled),
    complexity: limitBlock(metric("complexity"), d.function.complexity.max),
    cognitiveComplexity: limitBlock(metric("cognitiveComplexity"), d.function.cognitiveComplexity.max),
    maxLinesPerFunction: limitBlock(metric("maxLinesPerFunction"), d.function.maxLinesPerFunction.max),
    maxDepth: limitBlock(metric("maxDepth"), d.function.maxDepth.max),
    maxParams: limitBlock(metric("maxParams"), d.function.maxParams.max),
  };
}

function moduleSection(m, d) {
  const metric = (name) => (isPlainObject(m[name]) ? m[name] : {});
  const dup = metric("duplication");
  return {
    enabled: bool(m.enabled, d.module.enabled),
    maxFileLines: limitBlock(metric("maxFileLines"), d.module.maxFileLines.max),
    duplication: {
      enabled: bool(dup.enabled, true),
      thresholdPercent: num(dup.thresholdPercent, d.module.duplication.thresholdPercent),
      minLines: num(dup.minLines, d.module.duplication.minLines),
      minTokens: num(dup.minTokens, d.module.duplication.minTokens),
    },
    circularDependencies: limitBlock(metric("circularDependencies"), undefined),
  };
}

function architectureSection(a, d) {
  const depRules = isPlainObject(a.dependencyRules) ? a.dependencyRules : {};
  const config = typeof depRules.config === "string" && depRules.config ? depRules.config : d.architecture.dependencyRules.config;
  return {
    enabled: bool(a.enabled, d.architecture.enabled),
    dependencyRules: { enabled: bool(depRules.enabled, false), config },
  };
}

function modelSection(md, d) {
  return {
    enabled: bool(md.enabled, d.model.enabled),
    requireDeclaration: bool(md.requireDeclaration, d.model.requireDeclaration),
    deleteRebuild: bool(md.deleteRebuild, d.model.deleteRebuild),
    handWrittenCascade: bool(md.handWrittenCascade, d.model.handWrittenCascade),
    declarationWindowLines: num(md.declarationWindowLines, d.model.declarationWindowLines),
    rebuildWindowLines: num(md.rebuildWindowLines, d.model.rebuildWindowLines),
    extraCascadePatterns: patternList(md.extraCascadePatterns, []),
    extraHandWrittenPatterns: patternList(md.extraHandWrittenPatterns, []),
  };
}

export function normalizeConfig(raw) {
  const d = DEFAULT_CONFIG;
  if (!isPlainObject(raw)) return structuredClone(d);
  const section = (key) => (isPlainObject(raw[key]) ? raw[key] : {});
  const g = section("gate");
  const ignore = Array.isArray(raw.ignore) && raw.ignore.every((x) => typeof x === "string") && raw.ignore.length > 0;
  return {
    enabled: bool(raw.enabled, d.enabled),
    gate: {
      mode: oneOf(g.mode, ["block", "warn"], d.gate.mode),
      scope: oneOf(g.scope, ["large", "all", "off"], d.gate.scope),
    },
    missingTool: oneOf(raw.missingTool, ["warn", "fail"], d.missingTool),
    toolTimeoutSeconds: num(raw.toolTimeoutSeconds, d.toolTimeoutSeconds),
    function: functionSection(section("function"), d),
    module: moduleSection(section("module"), d),
    architecture: architectureSection(section("architecture"), d),
    model: modelSection(section("model"), d),
    ignore: ignore ? raw.ignore : [...d.ignore],
  };
}

/**
 * Load the project config: `.asf/code-health.json`, falling back to the root
 * `.asf-code-health.json` that older releases wrote.
 *
 * The path comes from the home table rather than a literal here, because "everything
 * ASF authors lives under `.asf/`" is one decision with one table of names — a second
 * place that hardcodes a location is how a file ends up written in one place and read
 * from another. `readFile` is injectable for tests.
 */
export async function loadConfig(projectRoot, readFile = null) {
  const fs = readFile || (await import("node:fs/promises")).readFile;
  const { readPath } = await import("../home.mjs");
  let raw = null;
  try {
    raw = JSON.parse(await fs(readPath(projectRoot, "healthConfig"), "utf-8"));
  } catch {
    raw = null; // no file, or unreadable/invalid → defaults
  }
  return normalizeConfig(raw);
}
