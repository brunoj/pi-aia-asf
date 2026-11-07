/**
 * Code Health Gate — execution.
 *
 * IO layer: list source files, spawn the metric tools with bounded timeouts
 * (06b Rule 15), collect results. `exec` is injectable for tests (fake tools).
 */

import { readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { spawn } from "node:child_process";
import { writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { scanModel } from "./model.mjs";
import { resolveTools, missingTools, ASF_ROOT } from "./tools.mjs";
import { listSourceFiles } from "./files.mjs";

export { listSourceFiles };

/** Run a command with a hard timeout; resolve on exit. */
export function exec(cmd, args, { cwd, timeoutMs = 120_000, env } = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ code: -1, stdout, stderr, timedOut, error: err.message });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? -1, stdout, stderr, timedOut });
    });
  });
}

/**
 * Detect which metric tools are available. Resolution is ASF-first (see
 * tools.mjs): the gate ships its own toolchain, so a project without eslint is
 * still measured rather than skipped.
 */
export function detectTools(root) {
  const tools = resolveTools(root);
  return {
    eslint: tools.eslint,
    eslintSonarjs: tools.eslintSonarjs,
    jscpd: tools.jscpd,
    madge: tools.madge,
    dependencyCruiser: tools.dependencyCruiser,
    typescriptParser: tools.typescriptParser,
    bins: tools.bins,
    pkgs: tools.pkgs,
    sources: tools.sources,
    missing: missingTools(tools),
  };
}

/**
 * Build a flat-config eslint config for the requested rules and write it to a
 * temp file. Deterministic on purpose: `--no-config-lookup` means the project's
 * own config cannot change what the gate measures, and the plugin/parser are
 * imported by absolute file URL so they resolve from ASF's install.
 */
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
export async function runEslint(plans, root, { execFn = exec, timeoutMs = 120_000 } = {}) {
  const eslintPlans = plans.filter((p) => (p.tool === "eslint" || p.tool === "eslint-sonarjs") && p.status === "run");
  if (eslintPlans.length === 0) return {};
  const files = listSourceFiles(root, null).filter((f) => /\.(js|jsx|mjs|cjs|ts|tsx|mts|cts)$/.test(f));
  if (files.length === 0) return {};
  const tools = resolveTools(root);
  if (!tools.bins.eslint) {
    return { __error: "eslint is not available — it ships with pi-aia-asf; reinstall the package" };
  }
  const hasTs = files.some((f) => /\.tsx?$/.test(f));
  if (hasTs && !tools.typescriptParser) {
    return { __error: "@typescript-eslint/parser is not available — it ships with pi-aia-asf; reinstall the package" };
  }
  const rules = {};
  for (const p of eslintPlans) {
    const ruleId = ESLINT_RULE_IDS[p.key];
    if (!ruleId) continue;
    // eslint 9 flat config uses the bare rule name; the plugin namespace is
    // only for sonarjs.
    rules[p.tool === "eslint-sonarjs" ? `sonarjs/${ruleId}` : ruleId] = ESLINT_RULES[p.key](p.threshold);
  }
  const configFile = writeEslintConfig(rules, tools, root);
  const args = ["--no-config-lookup", "--config", configFile, "--format", "json", ...files];
  let res;
  try {
    res = await execFn(tools.bins.eslint, args, { cwd: root, timeoutMs });
  } finally {
    try { rmSync(configFile, { force: true }); } catch { /* best effort */ }
  }
  if (res.timedOut) return { __error: `eslint timed out after ${timeoutMs / 1000}s` };
  if (res.code !== 0 && !res.stdout) return { __error: `eslint failed: ${(res.stderr || "").slice(0, 300)}` };
  let data;
  try {
    data = JSON.parse(res.stdout);
  } catch {
    return { __error: `eslint produced no JSON: ${(res.stderr || res.stdout || "").slice(0, 200)}` };
  }
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
  const out = {};
  for (const p of eslintPlans) {
    // The reported id carries the plugin namespace for sonarjs rules; counting
    // the bare name silently reported 0 violations for every sonarjs metric.
    const bare = ESLINT_RULE_IDS[p.key];
    const ruleId = p.tool === "eslint-sonarjs" ? `sonarjs/${bare}` : bare;
    if (unavailable.has(ruleId)) {
      out[p.key] = { value: 0, unavailable: true };
    } else {
      out[p.key] = { value: counts[ruleId] || 0 };
    }
  }
  return out;
}

/** Run jscpd; return { value: duplication percentage } or { error }. */
export async function runJscpd(plan, root, { execFn = exec, timeoutMs = 120_000, tmpDir = null } = {}) {
  const { thresholdPercent, minLines, minTokens } = plan.args;
  const outDir = tmpDir || join(root, ".asf-code-health-tmp");
  const args = [
    "--threshold", String(thresholdPercent),
    "--min-lines", String(minLines),
    "--min-tokens", String(minTokens),
    "--reporters", "json",
    "--output", outDir,
    "--ignore", "**/node_modules/**,**/dist/**,**/build/**,**/coverage/**,**/test/**,**/tests/**,**/__tests__/**,**/fixtures/**,**/*.test.*,**/*.spec.*",
    root,
  ];
  const bin = resolveTools(root).bins.jscpd;
  if (!bin) return { error: "jscpd is not available — it ships with pi-aia-asf; reinstall the package" };
  const res = await execFn(bin, args, { cwd: root, timeoutMs });
  if (res.timedOut) return { error: `jscpd timed out after ${timeoutMs / 1000}s` };
  const reportPath = join(outDir, "jscpd-report.json");
  try {
    const text = await (await import("node:fs/promises")).readFile(reportPath, "utf-8");
    const report = JSON.parse(text);
    const pct = report?.statistics?.total?.percentage;
    if (typeof pct !== "number") return { error: "jscpd report missing statistics.total.percentage" };
    return { value: Math.round(pct * 10) / 10 };
  } catch (err) {
    return { error: `jscpd report unreadable: ${err.message}` };
  }
}

/** Run madge --circular; return { value: cycle count } or { error }. */
export async function runMadge(plan, root, { execFn = exec, timeoutMs = 120_000 } = {}) {
  const bin = resolveTools(root).bins.madge;
  if (!bin) return { error: "madge is not available — it ships with pi-aia-asf; reinstall the package" };
  const res = await execFn(bin, ["--circular", "--extensions", "js,jsx,ts,tsx,mjs,cjs", root], { cwd: root, timeoutMs });
  if (res.timedOut) return { error: `madge timed out after ${timeoutMs / 1000}s` };
  const text = res.stdout + res.stderr;
  if (res.code === 0) return { value: 0 };
  const match = text.match(/(\d+)\s+circular dependenc/i);
  return { value: match ? Number(match[1]) : 1 };
}

/** Run dependency-cruiser; return { value: 0|1 } or { error }. */
export async function runDepcruise(plan, root, { execFn = exec, timeoutMs = 120_000 } = {}) {
  const cfg = plan.args.config;
  const files = listSourceFiles(root, null).filter((f) => /\.(js|jsx|mjs|cjs|ts|tsx|mts|cts)$/.test(f));
  if (files.length === 0) return { value: 0 };
  const bin = resolveTools(root).bins.depcruise;
  if (!bin) return { error: "dependency-cruiser is not available — install it in the project to use this metric" };
  const res = await execFn(bin, ["--config", cfg, "--output-type", "err", "--fail-on", "error", ...files], { cwd: root, timeoutMs });
  if (res.timedOut) return { error: `dependency-cruiser timed out after ${timeoutMs / 1000}s` };
  return { value: res.code === 0 ? 0 : 1 };
}

/**
 * Run the model level (P27). Built in: no spawn, no tool to be missing. Any
 * finding fails the level unless waived in-source with `asf-model-accept:`.
 */
export async function runModelScan(plan, root, opts = {}) {
  const res = await scanModel(root, { files: opts.files, readFile: opts.readFile, config: plan.args.model });
  return {
    value: res.findings.length,
    findings: res.findings,
    scanned: res.scanned,
    error: res.errors.length ? `unreadable file(s): ${res.errors.join("; ")}` : undefined,
  };
}

/** Run all plans; returns key → result. */
export async function runAll(plans, root, opts = {}) {
  const results = {};
  const runnable = plans.filter((p) => p.status === "run");
  const eslintResults = await runEslint(runnable, root, opts);
  if (eslintResults.__error) {
    for (const p of runnable.filter((x) => x.tool === "eslint" || x.tool === "eslint-sonarjs")) {
      results[p.key] = { error: eslintResults.__error };
    }
  } else {
    for (const [key, value] of Object.entries(eslintResults)) results[key] = value;
  }
  for (const p of runnable) {
    if (p.tool === "eslint" || p.tool === "eslint-sonarjs") continue;
    if (p.tool === "jscpd") results[p.key] = await runJscpd(p, root, opts);
    else if (p.tool === "madge") results[p.key] = await runMadge(p, root, opts);
    else if (p.tool === "dependency-cruiser") results[p.key] = await runDepcruise(p, root, opts);
    else if (p.tool === "asf-model") results[p.key] = await runModelScan(p, root, opts);
  }
  return results;
}
