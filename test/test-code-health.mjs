/**
 * Code Health Gate tests.
 *
 * Layers:
 *  1. Pure modules (config / detect / report) — no IO.
 *  2. Full pipeline via runHealth with fake tools (deterministic, fast) —
 *     triggers AND non-triggers, config switches, gate semantics, diff,
 *     missing tools, timeouts.
 *  3. Real-tool integration: the REAL exec + the REAL global eslint against
 *     real fixture files (clean → HEALTHY, god-file → violations).
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.dirname(HERE);
const jiti = createJiti(import.meta.url, { interopDefault: true });

const config = await jiti.import(path.join(REPO, "lib", "code-health", "config.mjs"));
const detect = await jiti.import(path.join(REPO, "lib", "code-health", "detect.mjs"));
const report = await jiti.import(path.join(REPO, "lib", "code-health", "report.mjs"));
const run = await jiti.import(path.join(REPO, "lib", "code-health", "run.mjs"));
const health = await jiti.import(path.join(REPO, "lib", "code-health", "index.mjs"));

const results = [];
function check(name, cond, detail = "") {
  results.push({ name, cond });
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}
function section(s) {
  console.log(`\n=== ${s} ===`);
}

const tempDirs = [];
function makeProject(files) {
  const dir = fs.mkdtempSync(path.join(REPO, "test", ".tmp-ch-"));
  tempDirs.push(dir);
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(dir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }
  return dir;
}
function rm(name) {
  fs.rmSync(name, { recursive: true, force: true });
}

const TOOLS_ALL = { eslint: true, eslintSonarjs: true, jscpd: true, madge: true, dependencyCruiser: true, typescriptParser: true };

/** Fake execFn: canned eslint JSON / jscpd report / madge exit. */
function fakeExec({ eslintJson = null, eslintError = null, jscpdPercent = 0, madgeExit = 0, madgeOut = "", sleepMs = 0 } = {}) {
  return async (cmd, args, opts = {}) => {
    if (sleepMs > 0) {
      // Honor the bounded timeout the real exec would enforce.
      const bound = Math.min(sleepMs, opts.timeoutMs || 120_000);
      await new Promise((r) => setTimeout(r, bound));
      return { code: -1, stdout: "", stderr: "", timedOut: true };
    }
    if (args.includes("eslint")) {
      if (eslintError) return { code: 1, stdout: "", stderr: eslintError, timedOut: false };
      return { code: 0, stdout: JSON.stringify(eslintJson || []), stderr: "", timedOut: false };
    }
    if (args.includes("jscpd")) {
      const outDir = args[args.indexOf("--output") + 1];
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(
        path.join(outDir, "jscpd-report.json"),
        JSON.stringify({ statistics: { total: { percentage: jscpdPercent } } }),
      );
      return { code: jscpdPercent >= 5 ? 1 : 0, stdout: "", stderr: "", timedOut: false };
    }
    if (args.includes("madge")) {
      return { code: madgeExit, stdout: madgeOut, stderr: "", timedOut: false };
    }
    if (args.includes("depcruise")) {
      return { code: 0, stdout: "", stderr: "", timedOut: false };
    }
    return { code: 0, stdout: "", stderr: "", timedOut: false };
  };
}

// ════════════════════════════════════════════════════════════════════════
// 1 — config (pure)
// ════════════════════════════════════════════════════════════════════════
section("1. config: defaults, merge, normalize");
{
  const d = config.DEFAULT_CONFIG;
  check("defaults: enabled true", d.enabled === true);
  check("defaults: gate block/large", d.gate.mode === "block" && d.gate.scope === "large");
  check("defaults: missingTool warn", d.missingTool === "warn");
  check("defaults: complexity 20", d.function.complexity.max === 20);
  check("defaults: cognitive 15", d.function.cognitiveComplexity.max === 15);
  check("defaults: maxLinesPerFunction 50", d.function.maxLinesPerFunction.max === 50);
  check("defaults: maxDepth 4 / maxParams 3", d.function.maxDepth.max === 4 && d.function.maxParams.max === 3);
  check("defaults: maxFileLines 300", d.module.maxFileLines.max === 300);
  check("defaults: duplication 5/5/50", d.module.duplication.thresholdPercent === 5 && d.module.duplication.minLines === 5 && d.module.duplication.minTokens === 50);
  check("defaults: circular enabled", d.module.circularDependencies.enabled === true);
  check("defaults: dependencyRules off", d.architecture.dependencyRules.enabled === false);
  check("defaults: toolTimeoutSeconds 120", d.toolTimeoutSeconds === 120);

  const merged = config.mergeConfig(d, { function: { complexity: { max: 30 } } });
  check("merge: only the given value changes", merged.function.complexity.max === 30 && merged.function.maxDepth.max === 4 && merged.module.maxFileLines.max === 300);

  const norm = config.normalizeConfig({ enabled: false, gate: { mode: "nonsense" }, function: { complexity: { max: "abc" } }, toolTimeoutSeconds: -5 });
  check("normalize: enabled false kept", norm.enabled === false);
  check("normalize: bad gate.mode falls back", norm.gate.mode === "block");
  check("normalize: bad max falls back", norm.function.complexity.max === 20);
  check("normalize: bad timeout falls back", norm.toolTimeoutSeconds === 120);
  check("normalize: garbage input → defaults", config.normalizeConfig("x").enabled === true);
}

// ════════════════════════════════════════════════════════════════════════
// 2 — detect (pure)
// ════════════════════════════════════════════════════════════════════════
section("2. detect: languages, plans, resolve");
{
  const langs = detect.detectLanguages(["a.js", "b.ts", "c.py"]);
  check("languages detected", langs.has("javascript") && langs.has("typescript") && langs.has("python"));

  const cfg = config.DEFAULT_CONFIG;
  const plans = detect.planMetrics(cfg, new Set(["javascript"]), TOOLS_ALL);
  check("JS project plans all function+module metrics", plans.length >= 8);
  check("dependencyRules not planned when off", !plans.some((p) => p.key === "dependencyRules"));

  const withRules = config.mergeConfig(cfg, { architecture: { dependencyRules: { enabled: true } } });
  const plans2 = detect.planMetrics(withRules, new Set(["typescript"]), TOOLS_ALL);
  check("dependencyRules planned when enabled", plans2.some((p) => p.key === "dependencyRules"));

  const python = detect.planMetrics(cfg, new Set(["python"]), TOOLS_ALL);
  const resolved = detect.resolvePlans(python, new Set(["python"]));
  check("python project: eslint metrics skipped (no JS)", resolved.filter((p) => p.tool === "eslint").every((p) => p.status === "skip-lang"));
  check("python project: jscpd still runs", resolved.find((p) => p.key === "duplication").status === "run");

  const missing = detect.resolvePlans(detect.planMetrics(cfg, new Set(["javascript"]), { ...TOOLS_ALL, eslint: false }), new Set(["javascript"]));
  check("missing eslint → skip-tool", missing.filter((p) => p.tool === "eslint").every((p) => p.status === "skip-tool"));

  const disabled = detect.resolvePlans(detect.planMetrics(config.mergeConfig(cfg, { module: { enabled: false } }), new Set(["javascript"]), TOOLS_ALL), new Set(["javascript"]));
  check("module.enabled:false → module metrics disabled", disabled.filter((p) => p.level === "module").every((p) => p.status === "disabled"));
}

// ════════════════════════════════════════════════════════════════════════
// 3 — report (pure)
// ════════════════════════════════════════════════════════════════════════
section("3. report: evaluate, verdict, diff");
{
  const cfg = config.DEFAULT_CONFIG;
  const plan = { key: "complexity", level: "function", threshold: 20, thresholdLabel: "max 20", status: "run" };
  const pass = report.evaluateRow(plan, { value: 5 });
  const fail = report.evaluateRow(plan, { value: 25 });
  check("value under threshold passes", pass.status === "pass");
  check("value over threshold fails", fail.status === "fail");

  const circ = report.evaluateRow({ key: "circularDependencies", level: "module", threshold: 0, thresholdLabel: "no circular imports", status: "run" }, { value: 1 });
  check("any cycle fails", circ.status === "fail");

  const rows = [pass, fail];
  const v = report.verdict(rows, cfg);
  check("verdict not healthy with a failure", v.healthy === false && v.failures === 1);

  const text = report.formatReport(rows, cfg);
  check("report names the failing metric", text.includes("complexity") && text.includes("NOT healthy"));

  const disabled = report.formatReport([], config.mergeConfig(cfg, { enabled: false }));
  check("disabled report states disabled", disabled.includes("disabled"));

  const base = report.baselinePayload([{ key: "complexity", value: "5", status: "pass" }, { key: "duplication", value: "3%", status: "pass" }]);
  const changes = report.diffRows(
    [{ key: "complexity", value: "9", status: "pass" }, { key: "duplication", value: "8%", status: "fail" }],
    Object.entries(base.metrics).map(([k, m]) => ({ key: k, value: m.value, status: m.status })),
  );
  check("diff flags both regressions", changes.length === 2 && changes.every((c) => c.change === "worse"));
}

// ════════════════════════════════════════════════════════════════════════
// 4 — pipeline: triggers AND non-triggers (fake tools)
// ════════════════════════════════════════════════════════════════════════
section("4. pipeline: clean project → HEALTHY, exit 0");
{
  const dir = makeProject({ "src/a.js": "export function add(a, b) { return a + b; }\n", "src/b.js": "export const x = 1;\n" });
  const res = await health.runHealth(dir, [], { tools: TOOLS_ALL, execFn: fakeExec() });
  check("healthy", res.healthy === true);
  check("exit 0", res.exitCode === 0);
  check("report says HEALTHY", res.text.includes("HEALTHY"));
  rm(dir);
}

section("5. pipeline: god-file → function/module violations");
{
  const dir = makeProject({ "src/god.js": "function god() {\n" + "  if (true) { if (true) { if (true) { if (true) { if (true) { return 1; } } } } }\n".repeat(60) + "}\n" });
  const eslintJson = [
    { filePath: "src/god.js", messages: [
      { ruleId: "max-lines-per-function", message: "x" },
      { ruleId: "max-depth", message: "x" },
      { ruleId: "max-lines", message: "x" },
    ] },
  ];
  const res = await health.runHealth(dir, [], { tools: TOOLS_ALL, execFn: fakeExec({ eslintJson }) });
  check("not healthy", res.healthy === false);
  check("exit 1 (gate block)", res.exitCode === 1);
  check("maxLinesPerFunction fails", res.rows.find((r) => r.key === "maxLinesPerFunction")?.status === "fail");
  check("maxDepth fails", res.rows.find((r) => r.key === "maxDepth")?.status === "fail");
  check("maxFileLines fails", res.rows.find((r) => r.key === "maxFileLines")?.status === "fail");
  rm(dir);
}

section("6. pipeline: duplication over threshold fails");
{
  const dir = makeProject({ "src/a.js": "const a = 1;\n", "src/b.js": "const b = 2;\n" });
  const res = await health.runHealth(dir, [], { tools: TOOLS_ALL, execFn: fakeExec({ jscpdPercent: 8.4 }) });
  check("duplication row fails", res.rows.find((r) => r.key === "duplication")?.status === "fail");
  check("value shown as percentage", res.rows.find((r) => r.key === "duplication")?.value === "8.4%");
  rm(dir);
}

section("7. pipeline: circular import fails");
{
  const dir = makeProject({ "src/a.js": "import './b.js';\n", "src/b.js": "import './a.js';\n" });
  const res = await health.runHealth(dir, [], { tools: TOOLS_ALL, execFn: fakeExec({ madgeExit: 1, madgeOut: "Found 2 circular dependencies!" }) });
  check("circular row fails", res.rows.find((r) => r.key === "circularDependencies")?.status === "fail");
  check("cycle count parsed", res.rows.find((r) => r.key === "circularDependencies")?.value === "2 cycle(s)");
  rm(dir);
}

section("8. pipeline: raised threshold → pass");
{
  const dir = makeProject({ "src/god.js": "function god() { return 1; }\n" });
  // With the threshold raised to 500, a real eslint run reports no violation.
  const eslintJson = [{ filePath: "src/god.js", messages: [] }];
  const cfgFile = path.join(dir, ".asf-code-health.json");
  fs.writeFileSync(cfgFile, JSON.stringify({ function: { maxLinesPerFunction: { max: 500 } } }));
  const res = await health.runHealth(dir, [], { tools: TOOLS_ALL, execFn: fakeExec({ eslintJson }) });
  check("raised threshold passes", res.rows.find((r) => r.key === "maxLinesPerFunction")?.status === "pass");
  rm(dir);
}

section("9. pipeline: module.enabled:false → skipped, healthy");
{
  const dir = makeProject({ "src/a.js": "const a = 1;\n" });
  fs.writeFileSync(path.join(dir, ".asf-code-health.json"), JSON.stringify({ module: { enabled: false } }));
  const res = await health.runHealth(dir, [], { tools: TOOLS_ALL, execFn: fakeExec({ jscpdPercent: 90 }) });
  check("duplication disabled", res.rows.find((r) => r.key === "duplication")?.status === "disabled");
  check("healthy despite fake dup", res.healthy === true);
  rm(dir);
}

section("10. pipeline: enabled:false → disabled, no tools spawned");
{
  const dir = makeProject({ "src/a.js": "const a = 1;\n" });
  fs.writeFileSync(path.join(dir, ".asf-code-health.json"), JSON.stringify({ enabled: false }));
  let spawned = 0;
  const res = await health.runHealth(dir, [], { tools: TOOLS_ALL, execFn: async () => { spawned++; return { code: 0, stdout: "[]", stderr: "", timedOut: false }; } });
  check("reports disabled", res.text.includes("disabled"));
  check("exit 0", res.exitCode === 0);
  check("no tools spawned", spawned === 0);
  rm(dir);
}

section("11. pipeline: gate.mode:warn → violations reported, exit 0");
{
  const dir = makeProject({ "src/god.js": "function god() { return 1; }\n" });
  fs.writeFileSync(path.join(dir, ".asf-code-health.json"), JSON.stringify({ gate: { mode: "warn" } }));
  const eslintJson = [{ filePath: "src/god.js", messages: [{ ruleId: "max-lines-per-function", message: "x" }] }];
  const res = await health.runHealth(dir, [], { tools: TOOLS_ALL, execFn: fakeExec({ eslintJson }) });
  check("violation reported", res.healthy === false);
  check("exit 0 in warn mode", res.exitCode === 0);
  rm(dir);
}

section("12. pipeline: missingTool:fail + tool absent → gate fails");
{
  const dir = makeProject({ "src/a.js": "const a = 1;\n" });
  fs.writeFileSync(path.join(dir, ".asf-code-health.json"), JSON.stringify({ missingTool: "fail" }));
  const res = await health.runHealth(dir, [], { tools: { ...TOOLS_ALL, eslint: false }, execFn: fakeExec() });
  check("missing eslint → skip-tool", res.rows.find((r) => r.key === "complexity")?.status === "skipped");
  check("skipped tool fails the gate", res.healthy === false);
  check("exit 1", res.exitCode === 1);
  rm(dir);
}

section("13. pipeline: python-only → JS metrics skipped, HEALTHY");
{
  const dir = makeProject({ "app.py": "def main():\n    return 1\n" });
  const res = await health.runHealth(dir, [], { tools: TOOLS_ALL, execFn: fakeExec({ jscpdPercent: 0 }) });
  check("eslint metrics skipped", res.rows.filter((r) => r.tool === "eslint" || r.tool === "eslint-sonarjs" || r.tool === "madge").every((r) => r.status === "skipped"));
  check("healthy", res.healthy === true);
  rm(dir);
}

section("14. pipeline: --diff flags regressions vs committed baseline");
{
  const dir = makeProject({ "src/a.js": "const a = 1;\n" });
  fs.writeFileSync(path.join(dir, ".asf-code-health-baseline.json"), JSON.stringify({
    generatedAt: new Date().toISOString(),
    metrics: { complexity: { value: "0", status: "pass" }, duplication: { value: "2%", status: "pass" } },
  }));
  const eslintJson = [{ filePath: "src/a.js", messages: [{ ruleId: "complexity", message: "x" }] }];
  const res = await health.runHealth(dir, ["--diff"], { tools: TOOLS_ALL, execFn: fakeExec({ eslintJson, jscpdPercent: 9 }) });
  check("diff flags complexity worse", res.text.includes("complexity: worse"));
  check("diff flags duplication worse", res.text.includes("duplication: worse"));
  rm(dir);
}

section("15. pipeline: --update-baseline writes the committed baseline");
{
  const dir = makeProject({ "src/a.js": "const a = 1;\n" });
  const res = await health.runHealth(dir, ["--update-baseline"], { tools: TOOLS_ALL, execFn: fakeExec() });
  const baseline = JSON.parse(fs.readFileSync(path.join(dir, ".asf-code-health-baseline.json"), "utf-8"));
  check("baseline written", baseline.metrics && typeof baseline.metrics.complexity === "object");
  check("report mentions baseline update", res.text.includes("Baseline updated"));
  rm(dir);
}

section("16. pipeline: a hanging tool fails with timeout, does not hang");
{
  const dir = makeProject({ "src/a.js": "const a = 1;\n" });
  fs.writeFileSync(path.join(dir, ".asf-code-health.json"), JSON.stringify({ toolTimeoutSeconds: 1 }));
  const start = Date.now();
  const res = await health.runHealth(dir, [], { tools: TOOLS_ALL, execFn: fakeExec({ sleepMs: 5000 }) });
  const elapsed = Date.now() - start;
  check("timeout reported as error", res.rows.some((r) => r.status === "error" && r.reason.includes("timed out")));
  check("did not hang (bounded)", elapsed < 4000, `${elapsed}ms`);
  rm(dir);
}

section("16b. pipeline: no tools at all → UNVERIFIED, not a gate failure");
{
  const dir = makeProject({ "src/a.js": "const a = 1;\n" });
  const res = await health.runHealth(dir, [], { tools: { eslint: false, eslintSonarjs: false, jscpd: false, madge: false, dependencyCruiser: false, typescriptParser: false }, execFn: fakeExec() });
  check("not a failure (warn semantics)", res.healthy === true);
  check("exit 0", res.exitCode === 0);
  check("report says UNVERIFIED", res.text.includes("UNVERIFIED"));
  rm(dir);
}

section("17. real exec: kills a hanging process at the timeout");
{
  const start = Date.now();
  const res = await run.exec("sleep", ["30"], { timeoutMs: 800 });
  const elapsed = Date.now() - start;
  check("real exec timed out", res.timedOut === true);
  check("real exec bounded", elapsed < 5000, `${elapsed}ms`);
}

// ════════════════════════════════════════════════════════════════════════
// 18 — real-tool integration (global eslint)
// ════════════════════════════════════════════════════════════════════════
section("18. real eslint: clean fixture passes, god-file fails");
{
  const hasEslint = fs.existsSync("/usr/bin/eslint");
  if (!hasEslint) {
    check("global eslint available (skipped)", true, "no /usr/bin/eslint — skipping real-tool test");
  } else {
    const fake = fakeExec();
    const realExec = async (cmd, args, opts) => {
      // Rewrite npx --no-install eslint → the global binary; fake jscpd/madge
      // (not installed on this machine) so only eslint is exercised for real.
      const i = args.indexOf("eslint");
      if (i >= 0) {
        return run.exec("/usr/bin/eslint", args.slice(i + 1), { cwd: opts.cwd, timeoutMs: opts.timeoutMs });
      }
      if (args.includes("jscpd") || args.includes("madge")) return fake(cmd, args, opts);
      return run.exec(cmd, args, opts);
    };
    // Realistic tool map: global eslint present, sonarjs plugin NOT installed.
    const realTools = { ...TOOLS_ALL, eslintSonarjs: false };
    const clean = makeProject({ "src/a.js": "export function add(a, b) { return a + b; }\n" });
    const resClean = await health.runHealth(clean, [], { tools: realTools, execFn: realExec });
    check("clean fixture healthy with real eslint", resClean.healthy === true, resClean.text.split("\n").slice(0, 3).join(" | "));
    rm(clean);

    const god = makeProject({
      "src/god.js":
        "function god() {\n" +
        Array.from({ length: 120 }, (_, i) => `  if (x${i}) { if (y${i}) { if (z${i}) { return ${i}; } } }`).join("\n") +
        "\n}\n",
    });
    const resGod = await health.runHealth(god, [], { tools: realTools, execFn: realExec });
    check("god-file fails with real eslint", resGod.healthy === false, resGod.rows.filter((r) => r.status === "fail").map((r) => r.key).join(","));
    check("cognitiveComplexity skipped (plugin absent), not failed", resGod.rows.find((r) => r.key === "cognitiveComplexity")?.status === "skipped");
    check("maxLinesPerFunction fails on real violation", resGod.rows.find((r) => r.key === "maxLinesPerFunction")?.status === "fail");
    rm(god);
  }
}

// Cleanup
for (const dir of tempDirs) {
  fs.rmSync(dir, { recursive: true, force: true });
}

const failed = results.filter((r) => !r.cond);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length > 0) {
  console.log("FAILED:");
  for (const f of failed) console.log(`  - ${f.name}`);
  process.exit(1);
}
