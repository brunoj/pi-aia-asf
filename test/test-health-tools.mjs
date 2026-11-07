/**
 * The health gate must MEASURE, not skip.
 *
 * The failure this pins: detectTools() looked only in the *project's*
 * node_modules, so a project without eslint/jscpd/madge got eight
 * "tool not installed" skips and the gate reported nothing while looking
 * healthy. The tools are now ASF's own dependencies and resolve ASF-first.
 */

import { test } from "node:test";
import assert from "node:assert";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;

const { resolveTools, missingTools, ASF_ROOT } = await import("../lib/code-health/tools.mjs");
const { detectTools, runEslint, runJscpd, runMadge, listSourceFiles } = await import("../lib/code-health/run.mjs");

function fixture(files) {
  const dir = mkdtempSync(join(tmpdir(), "asf-health-"));
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(dir, rel);
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, content, "utf-8");
  }
  return dir;
}

test("the health tools are declared as ASF's own dependencies", () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf-8"));
  const deps = { ...pkg.dependencies, ...pkg.optionalDependencies };
  for (const name of ["eslint", "eslint-plugin-sonarjs", "@typescript-eslint/parser", "jscpd", "madge"]) {
    assert.ok(deps[name], `${name} must be a dependency: the gate cannot measure without it`);
  }
});

test("ASF ships its own toolchain (resolved from ASF, not the project)", () => {
  const dir = fixture({ "src/a.mjs": "export const a = 1;\n" }); // a project with NO node_modules
  try {
    const tools = resolveTools(dir);
    assert.equal(tools.eslint, true, "eslint must be found without the project installing it");
    assert.equal(tools.eslintSonarjs, true, "the sonarjs plugin must be found too");
    assert.equal(tools.jscpd, true);
    assert.equal(tools.madge, true);
    assert.equal(tools.typescriptParser, true);
    assert.deepEqual(missingTools(tools), []);
    assert.equal(tools.sources.eslint, "asf", `eslint should resolve from ASF, got ${tools.sources.eslint}`);
    assert.ok(tools.bins.eslint && tools.bins.eslint.startsWith(ASF_ROOT), "the eslint binary must be ASF's own, never npx");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("detectTools reports availability for a project that has no tools of its own", () => {
  const dir = fixture({ "src/a.mjs": "export const a = 1;\n" });
  try {
    const t = detectTools(dir);
    assert.equal(t.eslint, true);
    assert.equal(t.jscpd, true);
    assert.equal(t.madge, true);
    assert.deepEqual(t.missing, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("every metric MEASURES on a fixture instead of skipping", async () => {
  // A function with real branching + too many params, a duplicated block, and a
  // circular import pair.
  const dir = fixture({
    "src/complex.mjs": [
      "export function branchy(a, b, c, d, e, f) {",
      "  if (a) { if (b) { if (c) { return 1; } } }",
      "  for (const x of [1, 2]) { if (x) { while (d) { d--; } } }",
      "  switch (e) { case 1: return 2; case 2: return 3; default: break; }",
      "  return f ? 4 : 5;",
      "}",
      "",
    ].join("\n"),
    "src/dup-a.mjs": "export function one() {\n  const a = 1;\n  const b = 2;\n  const c = a + b;\n  const d = c * 2;\n  const e = d - 1;\n  const f = e / 2;\n  const g = f + 3;\n  return g;\n}\n",
    "src/dup-b.mjs": "export function two() {\n  const a = 1;\n  const b = 2;\n  const c = a + b;\n  const d = c * 2;\n  const e = d - 1;\n  const f = e / 2;\n  const g = f + 3;\n  return g;\n}\n",
    "src/cyc-a.mjs": 'import { b } from "./cyc-b.mjs";\nexport const a = () => b;\n',
    "src/cyc-b.mjs": 'import { a } from "./cyc-a.mjs";\nexport const b = () => a;\n',
  });
  try {
    const plans = [
      { key: "complexity", tool: "eslint", status: "run", threshold: 3 },
      { key: "cognitiveComplexity", tool: "eslint-sonarjs", status: "run", threshold: 3 },
      { key: "maxParams", tool: "eslint", status: "run", threshold: 3 },
    ];
    const eslint = await runEslint(plans, dir);
    assert.ok(!eslint.__error, `eslint must run, got ${eslint.__error}`);
    for (const key of ["complexity", "cognitiveComplexity", "maxParams"]) {
      assert.equal(typeof eslint[key]?.value, "number", `${key} must be measured, got ${JSON.stringify(eslint[key])}`);
      assert.ok(!eslint[key].unavailable, `${key} must not be reported unavailable`);
      assert.ok(eslint[key].value > 0, `${key} must find the violation in the fixture, got ${eslint[key].value}`);
    }

    const jscpd = await runJscpd({ args: { thresholdPercent: 5, minLines: 5, minTokens: 30 } }, dir);
    assert.ok(typeof jscpd.value === "number", `jscpd must measure, got ${JSON.stringify(jscpd)}`);
    assert.ok(jscpd.value > 0, `jscpd must see the duplicated block, got ${jscpd.value}`);

    const madge = await runMadge({}, dir);
    assert.ok(typeof madge.value === "number", `madge must measure, got ${JSON.stringify(madge)}`);
    assert.ok(madge.value >= 1, `madge must see the circular pair, got ${madge.value}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("eslint is spawned by absolute path — never npx (which installs a different version)", async () => {
  const dir = fixture({ "src/a.mjs": "export function f(a,b,c,d) { if (a) { return 1; } return 2; }\n" });
  try {
    let cmd = null;
    let args = null;
    const fakeExec = async (c, a) => {
      cmd = c;
      args = a;
      return { code: 0, stdout: "[]", stderr: "", timedOut: false };
    };
    await runEslint([{ key: "complexity", tool: "eslint", status: "run", threshold: 3 }], dir, { execFn: fakeExec });
    assert.ok(cmd, "eslint must be spawned");
    assert.notEqual(cmd, "npx", "the gate must not go through npx");
    assert.ok(cmd.startsWith("/"), `eslint must be an absolute path, got ${cmd}`);
    assert.ok(/eslint$/.test(cmd), `the binary must be eslint, got ${cmd}`);
    assert.ok(args.includes("--no-config-lookup"), "the project's own eslint config must not change what the gate measures");
    assert.ok(args.includes("--config"), "the gate must supply its own config");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the whole gate MEASURES on a project with no tools installed (no skip-tool rows)", async () => {
  const dir = fixture({
    "src/complex.mjs": [
      "export function branchy(a, b, c, d, e, f) {",
      "  if (a) { if (b) { if (c) { return 1; } } }",
      "  for (const x of [1, 2]) { if (x) { while (d) { d--; } } }",
      "  switch (e) { case 1: return 2; case 2: return 3; default: break; }",
      "  return f ? 4 : 5;",
      "}",
      "",
    ].join("\n"),
    "src/cyc-a.mjs": 'import { b } from "./cyc-b.mjs";\nexport const a = () => b;\n',
    "src/cyc-b.mjs": 'import { a } from "./cyc-a.mjs";\nexport const b = () => a;\n',
  });
  try {
    const { runHealth } = await import("../lib/code-health/index.mjs");
    const res = await runHealth(dir, []);
    const skipped = (res.rows || []).filter((r) => r.status === "skip-tool");
    assert.deepEqual(skipped.map((r) => r.metric), [], "no metric may be skipped for a missing tool: they ship with ASF");
    // A measured row carries a number; a skipped one carries "—".
    const measured = (res.rows || []).filter((r) => /^\d+(\.\d+)?$/.test(String(r.value ?? "")));
    assert.ok(measured.length >= 4, `at least four metrics must produce a number, got ${JSON.stringify((res.rows || []).map((r) => [r.key, r.value, r.status]))}`);
    assert.equal(res.healthy, false, "the fixture has real violations, so the gate must fail rather than pass silently");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("vendored and generated trees are not measured as project source", () => {
  const dir = fixture({
    "src/real.mjs": "export const real = 1;\n",
    ".local/lib/python/site-packages/pkg/mod.py": "print('vendor')\n",
    ".venv/lib/python3.14/site-packages/x.py": "print('vendor')\n",
    "node_modules/dep/index.js": "module.exports = 1;\n",
    "vendor/lib.go": "package main\n",
    "third_party/x.rb": "puts 1\n",
    "dist/out.mjs": "export const built = 1;\n",
  });
  try {
    const files = listSourceFiles(dir, null);
    assert.ok(files.includes("src/real.mjs"), `the real source must be listed, got ${JSON.stringify(files)}`);
    for (const bad of files.filter((f) => /site-packages|node_modules|vendor|third_party|\.venv|dist\//.test(f))) {
      assert.fail(`vendored/generated file was scanned as project source: ${bad}`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
