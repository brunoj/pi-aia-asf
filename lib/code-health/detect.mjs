/**
 * Code Health Gate — detection & metric planning.
 *
 * Pure module: given the project's file list, tool availability and config,
 * decide which metrics run, are skipped (language absent / tool missing) or
 * are disabled. No IO.
 */

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

/** A metric that the gate can run. */
export function planMetrics(config, languages, tools) {
  const plans = [];
  const hasJs = languages.has("javascript") || languages.has("typescript");
  const hasTs = languages.has("typescript");
  const hasPython = languages.has("python");
  // eslint/madge/dependency-cruiser are JS/TS-only; jscpd is language-agnostic.
  const anySource = languages.size > 0;

  const push = (plan) => plans.push(plan);

  if (!config.enabled) return plans;

  const f = config.function;
  if (hasJs) {
    push(metric("complexity", "function", "eslint", f.enabled && f.complexity.enabled, f.complexity.max, "max cyclomatic complexity", tools.eslint, "eslint"));
    push(metric("cognitiveComplexity", "function", "eslint-sonarjs", f.enabled && f.cognitiveComplexity.enabled, f.cognitiveComplexity.max, "max cognitive complexity", tools.eslintSonarjs, "eslint-plugin-sonarjs"));
    push(metric("maxLinesPerFunction", "function", "eslint", f.enabled && f.maxLinesPerFunction.enabled, f.maxLinesPerFunction.max, "max lines per function", tools.eslint, "eslint"));
    push(metric("maxDepth", "function", "eslint", f.enabled && f.maxDepth.enabled, f.maxDepth.max, "max nesting depth", tools.eslint, "eslint"));
    push(metric("maxParams", "function", "eslint", f.enabled && f.maxParams.enabled, f.maxParams.max, "max parameters", tools.eslint, "eslint"));
  }

  const m = config.module;
  if (hasJs) {
    push(metric("maxFileLines", "module", "eslint", m.enabled && m.maxFileLines.enabled, m.maxFileLines.max, "max lines per file", tools.eslint, "eslint"));
  }
  if (anySource) {
    push({
      key: "duplication",
      level: "module",
      tool: "jscpd",
      enabled: m.enabled && m.duplication.enabled,
      threshold: m.duplication.thresholdPercent,
      thresholdLabel: `max ${m.duplication.thresholdPercent}% duplicated`,
      toolAvailable: tools.jscpd,
      toolName: "jscpd",
      compare: "value",
      args: { thresholdPercent: m.duplication.thresholdPercent, minLines: m.duplication.minLines, minTokens: m.duplication.minTokens },
    });
  }
  if (hasJs) {
    push(metric("circularDependencies", "module", "madge", m.enabled && m.circularDependencies.enabled, 0, "no circular imports", tools.madge, "madge"));
  }

  const a = config.architecture;
  if (hasJs && a.dependencyRules.enabled) {
    push({
      key: "dependencyRules",
      level: "architecture",
      tool: "dependency-cruiser",
      enabled: a.enabled && true,
      threshold: 0,
      thresholdLabel: "no rule violations",
      toolAvailable: tools.dependencyCruiser,
      toolName: "dependency-cruiser",
      compare: "violations",
      args: { config: a.dependencyRules.config },
    });
  }

  return plans;
}

function metric(key, level, tool, enabled, threshold, thresholdLabel, toolAvailable, toolName) {
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
    args: {},
  };
}

/**
 * Tool availability check (pure): given a map of tool → boolean, mark each
 * plan as runnable / missing-tool / language-skipped / disabled.
 */
export function resolvePlans(plans, languages) {
  const hasJs = languages.has("javascript") || languages.has("typescript");
  const anySource = languages.size > 0;
  return plans.map((p) => {
    if (!p.enabled) return { ...p, status: "disabled", reason: "disabled in config" };
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
