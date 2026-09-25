/**
 * Code Health Gate — execution.
 *
 * IO layer: list source files, spawn the metric tools with bounded timeouts
 * (06b Rule 15), collect results. `exec` is injectable for tests (fake tools).
 */

import { readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { spawn } from "node:child_process";

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

/** Recursively list source files under root, skipping ignored dirs/files. */
export function listSourceFiles(root, ignorePatterns) {
  const ignoreDirs = new Set(["node_modules", ".git", "dist", "build", "coverage", "test", "tests", "__tests__", "fixtures", ".next", ".cache"]);
  const out = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const abs = join(dir, e.name);
      const rel = relative(root, abs);
      if (e.isDirectory()) {
        if (ignoreDirs.has(e.name) || rel.split(sep).some((part) => ignoreDirs.has(part))) continue;
        walk(abs);
      } else if (e.isFile()) {
        if (/\.(test|spec)\.[^.]+$/.test(e.name)) continue;
        if (ignorePatterns && ignorePatterns.some((p) => p.includes(e.name))) continue;
        out.push(rel);
      }
    }
  };
  walk(root);
  return out;
}

/** Detect which metric tools are available in the project. */
export function detectTools(root, { execFn = exec, timeoutMs = 30_000 } = {}) {
  const bin = (name) => existsSync(join(root, "node_modules", ".bin", name));
  const pkg = (name) => existsSync(join(root, "node_modules", name));
  const eslint = bin("eslint");
  const eslintSonarjs = eslint && pkg("eslint-plugin-sonarjs");
  const jscpd = bin("jscpd") || pkg("jscpd");
  const madge = bin("madge") || pkg("madge");
  const dependencyCruiser = bin("depcruise") || pkg("dependency-cruiser");
  const typescriptParser = pkg("@typescript-eslint/parser");
  return { eslint, eslintSonarjs, jscpd, madge, dependencyCruiser, typescriptParser };
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
  const hasTs = files.some((f) => /\.tsx?$/.test(f));
  const args = ["--no-eslintrc", "--format", "json"];
  if (hasTs) {
    if (!detectTools(root).typescriptParser) {
      return { __error: "TypeScript parser (@typescript-eslint/parser) not installed — cannot lint .ts files" };
    }
    args.push("--parser", "@typescript-eslint/parser");
  }
  for (const p of eslintPlans) {
    const ruleId = ESLINT_RULE_IDS[p.key];
    if (!ruleId) continue;
    const rule = ESLINT_RULES[p.key](p.threshold);
    args.push("--rule", JSON.stringify({ [ruleId]: rule }));
  }
  args.push(...files);
  const res = await execFn("npx", ["--no-install", "eslint", ...args], { cwd: root, timeoutMs });
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
    const ruleId = ESLINT_RULE_IDS[p.key];
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
  const res = await execFn("npx", ["--no-install", "jscpd", ...args], { cwd: root, timeoutMs });
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
  const res = await execFn("npx", ["--no-install", "madge", "--circular", "--extensions", "js,jsx,ts,tsx,mjs,cjs", root], { cwd: root, timeoutMs });
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
  const res = await execFn("npx", ["--no-install", "depcruise", "--config", cfg, "--output-type", "err", "--fail-on", "error", ...files], { cwd: root, timeoutMs });
  if (res.timedOut) return { error: `dependency-cruiser timed out after ${timeoutMs / 1000}s` };
  return { value: res.code === 0 ? 0 : 1 };
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
  }
  return results;
}
