/**
 * Code Health Gate — execution.
 *
 * IO layer: list source files, spawn the metric tools with bounded timeouts
 * (06b Rule 15), collect results. `exec` is injectable for tests (fake tools).
 */

import { readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { scanModel } from "./model-scan.mjs";
import { resolveTools, missingTools, ASF_ROOT } from "./tools.mjs";
import { listSourceFiles } from "./files.mjs";

export { listSourceFiles };

export { exec } from "./exec.mjs";
import { exec } from "./exec.mjs";

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
export { runEslint } from "./eslint-run.mjs";
import { runEslint } from "./eslint-run.mjs";
export async function runJscpd(plan, root, { execFn = exec, timeoutMs = 120_000, tmpDir = null } = {}) {
  const { thresholdPercent, minLines, minTokens } = plan.args;
  // Never write inside the measured repo: a gate that dirties the tree it
  // measures trips ASF's own dirty-tree guards and pollutes a user's project.
  const outDir = tmpDir || join(tmpdir(), `asf-jscpd-${process.pid}-${Math.random().toString(36).slice(2, 8)}`);
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
  } finally {
    // Clean up only the directory this call created; a caller's tmpDir is theirs.
    if (!tmpDir) rmSync(outDir, { recursive: true, force: true });
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
