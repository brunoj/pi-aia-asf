/**
 * The eslint half of the gate: config generation, the spawn, and the counting.
 *
 * Its own module so `run.mjs` stays the runner: a metric that needs a
 * hand-written config is the one part with a real trick in it.
 */
import { writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { listSourceFiles } from "./files.mjs";
import { resolveTools, ASF_ROOT } from "./tools.mjs";
import { exec } from "./exec.mjs";

function writeEslintConfig(rules, tools, root) {
  const imports = [];
  let pluginsSrc = "{}";
  const langOpts = ['ecmaVersion: "latest"', 'sourceType: "module"'];
  // Resolve each package's real entry point instead of guessing a path: the
  // plugin's main file moves between major versions (lib/index.js → cjs/plugin.js).
  const entry = (name) => {
    for (const base of [ASF_ROOT, root]) {
      try {
        return pathToFileURL(createRequire(join(base, "package.json")).resolve(name)).href;
      } catch { /* try the next base */ }
    }
    return null;
  };
  const sonarjsEntry = tools.pkgs.sonarjs && entry("eslint-plugin-sonarjs");
  if (sonarjsEntry) {
    // CJS plugin with __esModule: the real plugin object is a nested default.
    imports.push(`import sonarjsMod from ${JSON.stringify(sonarjsEntry)};\nconst sonarjs = sonarjsMod.default || sonarjsMod;`);
    pluginsSrc = "{ sonarjs }";
  }
  const tsParserEntry = tools.pkgs.tsParser && entry("@typescript-eslint/parser");
  if (tsParserEntry) {
    imports.push(`import tsParserMod from ${JSON.stringify(tsParserEntry)};\nconst tsParser = tsParserMod.default || tsParserMod;`);
    langOpts.push("parser: tsParser");
    langOpts.push('parserOptions: { ecmaVersion: "latest", sourceType: "module", ecmaFeatures: { jsx: true } }');
  }
  const body = `${imports.join("\n")}
export default [{
  files: ["**/*.js", "**/*.mjs", "**/*.cjs", "**/*.jsx", "**/*.ts", "**/*.tsx", "**/*.mts", "**/*.cts"],
  languageOptions: { ${langOpts.join(", ")} },
  plugins: ${pluginsSrc},
  rules: ${JSON.stringify(rules, null, 2)},
}];
`;
  const file = join(tmpdir(), `asf-eslint-${process.pid}-${Math.random().toString(36).slice(2, 8)}.mjs`);
  writeFileSync(file, body, "utf-8");
  return file;
}

const ESLINT_RULES = {
  complexity: (max) => ["error", max],
  cognitiveComplexity: (max) => ["error", max],
  maxLinesPerFunction: (max) => ["error", { max }],
  maxDepth: (max) => ["error", max],
  maxParams: (max) => ["error", max],
  maxFileLines: (max) => ["error", { max }],
};

const ESLINT_RULE_IDS = {
  complexity: "complexity",
  cognitiveComplexity: "cognitive-complexity",
  maxLinesPerFunction: "max-lines-per-function",
  maxDepth: "max-depth",
  maxParams: "max-params",
  maxFileLines: "max-lines",
};

/** Run eslint once for all eslint-backed plans; return key → violation count. */
/** Which rules to ask eslint for, and the plugin namespace sonarjs needs. */
function eslintRules(eslintPlans) {
  const rules = {};
  for (const p of eslintPlans) {
    const ruleId = ESLINT_RULE_IDS[p.key];
    if (!ruleId) continue;
    // eslint 9 flat config uses the bare rule name; the plugin namespace is
    // only for sonarjs.
    rules[p.tool === "eslint-sonarjs" ? `sonarjs/${ruleId}` : ruleId] = ESLINT_RULES[p.key](p.threshold);
  }
  return rules;
}

/** Why this run cannot measure, or null when it can. */
function eslintBlocker(files, tools) {
  if (!tools.bins.eslint) return "eslint is not available — it ships with pi-aia-asf; reinstall the package";
  if (files.some((f) => /\.tsx?$/.test(f)) && !tools.typescriptParser) {
    return "@typescript-eslint/parser is not available — it ships with pi-aia-asf; reinstall the package";
  }
  return null;
}

async function spawnEslint({ execFn, bin, rules, tools, root, timeoutMs }) {
  const configFile = writeEslintConfig(rules, tools, root);
  const files = listSourceFiles(root, null).filter((f) => /\.(js|jsx|mjs|cjs|ts|tsx|mts|cts)$/.test(f));
  const args = ["--no-config-lookup", "--config", configFile, "--format", "json", ...files];
  try {
    return await execFn(bin, args, { cwd: root, timeoutMs });
  } finally {
    try { rmSync(configFile, { force: true }); } catch { /* best effort */ }
  }
}

/** Parse eslint's JSON into rule → count, plus the rules it did not know. */
function countByRule(stdout) {
  const data = JSON.parse(stdout);
  const counts = {};
  const unavailable = new Set();
  for (const file of data) {
    for (const msg of file.messages || []) {
      if (msg.ruleId) counts[msg.ruleId] = (counts[msg.ruleId] || 0) + 1;
      // A rule the installed eslint does not know (e.g. sonarjs plugin absent)
      // is reported as a message, not a config error — treat as unavailable.
      if (msg.ruleId && /was not found/.test(msg.message || "")) unavailable.add(msg.ruleId);
    }
  }
  return { counts, unavailable };
}

function toValues(eslintPlans, { counts, unavailable }) {
  const out = {};
  for (const p of eslintPlans) {
    // The reported id carries the plugin namespace for sonarjs rules; counting
    // the bare name silently reported 0 violations for every sonarjs metric.
    const bare = ESLINT_RULE_IDS[p.key];
    const ruleId = p.tool === "eslint-sonarjs" ? `sonarjs/${bare}` : bare;
    out[p.key] = unavailable.has(ruleId) ? { value: 0, unavailable: true } : { value: counts[ruleId] || 0 };
  }
  return out;
}

export async function runEslint(plans, root, { execFn = exec, timeoutMs = 120_000 } = {}) {
  const eslintPlans = plans.filter((p) => (p.tool === "eslint" || p.tool === "eslint-sonarjs") && p.status === "run");
  if (eslintPlans.length === 0) return {};
  const files = listSourceFiles(root, null).filter((f) => /\.(js|jsx|mjs|cjs|ts|tsx|mts|cts)$/.test(f));
  if (files.length === 0) return {};
  const tools = resolveTools(root);
  const blocker = eslintBlocker(files, tools);
  if (blocker) return { __error: blocker };

  const res = await spawnEslint({ execFn, bin: tools.bins.eslint, rules: eslintRules(eslintPlans), tools, root, timeoutMs });
  if (res.timedOut) return { __error: `eslint timed out after ${timeoutMs / 1000}s` };
  if (res.code !== 0 && !res.stdout) return { __error: `eslint failed: ${(res.stderr || "").slice(0, 300)}` };
  let parsed;
  try {
    parsed = countByRule(res.stdout);
  } catch {
    return { __error: `eslint produced no JSON: ${(res.stderr || res.stdout || "").slice(0, 200)}` };
  }
  return toValues(eslintPlans, parsed);
}

/** Run jscpd; return { value: duplication percentage } or { error }. */
