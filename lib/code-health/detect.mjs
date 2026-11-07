/**
 * Code Health Gate — detection & metric planning.
 *
 * Pure module: given the project's file list, tool availability and config,
 * decide which metrics run, are skipped (language absent / tool missing) or
 * are disabled. No IO.
 */

import { hasPersistenceFiles } from "./model-scan.mjs";

/** Languages the gate's metrics understand. */
export const LANGUAGES = {
  javascript: { name: "JavaScript", exts: [".js", ".jsx", ".mjs", ".cjs"] },
  typescript: { name: "TypeScript", exts: [".ts", ".tsx", ".mts", ".cts"] },
  python: { name: "Python", exts: [".py"] },
};

/**
 * Detect which languages are present in a file list.
 * Returns a Set of language keys ("javascript", "typescript", "python", …).
 */
export function detectLanguages(filePaths) {
  const present = new Set();
  for (const p of filePaths) {
    for (const [key, lang] of Object.entries(LANGUAGES)) {
      if (lang.exts.some((ext) => p.endsWith(ext))) present.add(key);
    }
  }
  return present;
}

/**
 * A metric the gate can run. One object rather than eight positional arguments:
 * the call sites differ only in which of these they name.
 */
function metric(spec) {
  const { key, level, tool, enabled, threshold, thresholdLabel, toolAvailable, toolName } = spec;
  return {
    key,
    level,
    tool,
    enabled,
    threshold,
    thresholdLabel,
    toolAvailable,
    toolName,
    // eslint/madge/depcruise report VIOLATION COUNTS: any violation fails.
    // jscpd reports a measured percentage: value > threshold fails.
    compare: tool === "jscpd" ? "value" : "violations",
    // Why a metric is off, in the report's own words — a disabled metric that
    // cannot say why reads as a pass.
    disableReason: spec.disableReason,
    args: spec.args || {},
  };
}

/** The five eslint function-level metrics, all reading one config block. */
function functionMetrics(f, tools) {
  const eslint = ({ key, threshold, thresholdLabel, enabled }) =>
    metric({ key, level: "function", tool: "eslint", enabled, threshold, thresholdLabel, toolAvailable: tools.eslint, toolName: "eslint" });
  return [
    eslint({ key: "complexity", threshold: f.complexity.max, thresholdLabel: "max cyclomatic complexity", enabled: f.enabled && f.complexity.enabled }),
    metric({
      key: "cognitiveComplexity",
      level: "function",
      tool: "eslint-sonarjs",
      enabled: f.enabled && f.cognitiveComplexity.enabled,
      threshold: f.cognitiveComplexity.max,
      thresholdLabel: "max cognitive complexity",
      toolAvailable: tools.eslintSonarjs,
      toolName: "eslint-plugin-sonarjs",
    }),
    eslint({ key: "maxLinesPerFunction", threshold: f.maxLinesPerFunction.max, thresholdLabel: "max lines per function", enabled: f.enabled && f.maxLinesPerFunction.enabled }),
    eslint({ key: "maxDepth", threshold: f.maxDepth.max, thresholdLabel: "max nesting depth", enabled: f.enabled && f.maxDepth.enabled }),
    eslint({ key: "maxParams", threshold: f.maxParams.max, thresholdLabel: "max parameters", enabled: f.enabled && f.maxParams.enabled }),
  ];
}

/** Duplication is measured, not counted: value > threshold fails. */
function duplicationPlan(m, tools) {
  return metric({
    key: "duplication",
    level: "module",
    tool: "jscpd",
    enabled: m.enabled && m.duplication.enabled,
    threshold: m.duplication.thresholdPercent,
    thresholdLabel: `max ${m.duplication.thresholdPercent}% duplicated`,
    toolAvailable: tools.jscpd,
    toolName: "jscpd",
    args: { thresholdPercent: m.duplication.thresholdPercent, minLines: m.duplication.minLines, minTokens: m.duplication.minTokens },
  });
}

function dependencyRulesPlan(a, tools) {
  return metric({
    key: "dependencyRules",
    level: "architecture",
    tool: "dependency-cruiser",
    enabled: a.enabled,
    threshold: 0,
    thresholdLabel: "no rule violations",
    toolAvailable: tools.dependencyCruiser,
    toolName: "dependency-cruiser",
    args: { config: a.dependencyRules.config },
  });
}

/**
 * Model level (P27): built in, so it needs no tool — but it only has something
 * to say when the project has persistence to inspect.
 */
function modelPlan(md, files) {
  return metric({
    key: "modelFindings",
    level: "model",
    tool: "asf-model",
    enabled: md.enabled && hasPersistenceFiles(files),
    disableReason: md.enabled ? "no persistence files (no .sql, migrations/, models/, entities/)" : "disabled in config",
    threshold: 0,
    thresholdLabel: "no undeclared cascade / rebuild-by-delete",
    toolAvailable: true,
    toolName: "asf model scan (built in)",
    args: { model: md },
  });
}

/** Which metrics this project's languages and config actually call for. */
export function planMetrics({ config, languages, tools, files = [] }) {
  if (!config.enabled) return [];
  const hasJs = languages.has("javascript") || languages.has("typescript");
  const plans = [];
  const f = config.function;
  const m = config.module;
  const a = config.architecture;

  if (hasJs) plans.push(...functionMetrics(f, tools));
  if (hasJs) {
    plans.push(metric({ key: "maxFileLines", level: "module", tool: "eslint", enabled: m.enabled && m.maxFileLines.enabled, threshold: m.maxFileLines.max, thresholdLabel: "max lines per file", toolAvailable: tools.eslint, toolName: "eslint" }));
    plans.push(metric({ key: "circularDependencies", level: "module", tool: "madge", enabled: m.enabled && m.circularDependencies.enabled, threshold: 0, thresholdLabel: "no circular imports", toolAvailable: tools.madge, toolName: "madge" }));
  }
  // jscpd is language-agnostic: it runs whenever there is any source at all.
  if (languages.size > 0) plans.push(duplicationPlan(m, tools));
  if (hasJs && a.dependencyRules.enabled) plans.push(dependencyRulesPlan(a, tools));
  plans.push(modelPlan(config.model, files));
  return plans;
}

/**
 * Tool availability check (pure): given a map of tool → boolean, mark each
 * plan as runnable / missing-tool / language-skipped / disabled.
 */
export function resolvePlans(plans, languages) {
  const hasJs = languages.has("javascript") || languages.has("typescript");
  const anySource = languages.size > 0;
  return plans.map((p) => {
    if (!p.enabled) return { ...p, status: "disabled", reason: p.disableReason || "disabled in config" };
    if (p.tool === "eslint" || p.tool === "eslint-sonarjs" || p.tool === "madge") {
      if (!hasJs) return { ...p, status: "skip-lang", reason: "no JS/TS sources" };
    }
    if (p.tool === "jscpd" && !anySource) {
      return { ...p, status: "skip-lang", reason: "no source files" };
    }
    if (!p.toolAvailable) return { ...p, status: "skip-tool", reason: `tool not installed: ${p.toolName}` };
    return { ...p, status: "run" };
  });
}
