/**
 * The baseline tool (0.21.0).
 *
 * The completion gate now distinguishes "this run broke the suite" from "the
 * suite was already broken" — but only against a baseline ASF MEASURED itself.
 * That distinction is worthless without something that records the baseline, so
 * `asf_baseline` is the producer the gate's new `baseline-run` kind needs.
 *
 * The checks that matter here are the negative ones: a baseline is a claim about
 * a commit, so a tool that could record one from a dirty tree, a non-repo, or a
 * subset would manufacture exactly the false "these failures predate my change"
 * the gate is meant to refuse.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createLedger } from "../lib/gates/ledger.mjs";
import { execFileSync as gitExec } from "node:child_process";

const REPO = path.resolve(import.meta.dirname, "..");
const { createJiti } = await import("jiti");
const jiti = createJiti(import.meta.url);

let pass = 0, fail = 0;
const chk = (name, cond, detail = "") => {
  if (cond) { console.log(`  PASS  ${name}${detail ? " — " + detail : ""}`); pass++; }
  else { console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`); fail++; }
};
const section = (s) => console.log(`\n=== ${s} ===`);

function git(dir, ...args) {
  return gitExec("git", args, { cwd: dir, stdio: "ignore" });
}
function makeRepo({ committed = true } = {}) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "asf-base-")));
  git(dir, "init", "-q");
  git(dir, "config", "user.email", "t@t");
  git(dir, "config", "user.name", "t");
  git(dir, "config", "commit.gpgsign", "false");
  fs.writeFileSync(path.join(dir, "a.js"), "export const a = 1;\n");
  if (committed) { git(dir, "add", "-A"); git(dir, "commit", "-q", "-m", "base"); }
  return dir;
}

/** Capture the tool the way pi registers it, and drive it with a fake spawn. */
async function loadTool(execFn) {
  const tools = [];
  const pi = { registerTool: (def) => tools.push(def) };
  const mod = await jiti.import(path.join(REPO, "lib", "extension", "tools", "baseline.ts"));
  mod.registerBaselineTool(pi, { execFn });
  const tool = tools.find((t) => t.name === "asf_baseline");
  return { tool, state: mod.__baselineToolState };
}

/**
 * The tool measures the project the RUN is about: `measureRoot()` derives it from
 * the session's state and, failing that, its cwd. Each case here is a different
 * project, so the session has to be standing in it — otherwise the second case
 * silently measures the first one's repository, and a refusal passes for the
 * wrong reason.
 */
async function pointAt(dir) {
  process.chdir(dir);
}

const PYTEST_RED = { code: 1, stdout: "FAILED tests/a.py::test_old\n1 failed, 47 passed\n", stderr: "", timedOut: false };

/**
 * The tool spawns through one injected `exec`, so a fake sees the tool's own git
 * calls too. Git stays real (the worktree has to exist for the check to mean
 * anything); only the suite command is faked.
 */
const realExec = (await import("../lib/code-health/exec.mjs")).exec;
function fakeExec(result = PYTEST_RED) {
  return async (cmd, args, opts) => {
    if (/git$/.test(String(cmd))) return realExec(cmd, args, opts);
    return result;
  };
}

section("1. a measured baseline is recorded as evidence, not claimed");
{
  const dir = makeRepo();
  const calls = [];
  const spy = async (cmd, args, opts) => { calls.push({ cmd, args: args || [], cwd: opts && opts.cwd }); return fakeExec()(cmd, args, opts); };
  const { tool } = await loadTool(spy);
  await pointAt(dir);
  chk("the tool is registered", !!tool);
  process.chdir(dir);
  const res = await tool.execute("t1", { command: "pytest -q" });
  chk("it reports the failures it saw", res.details.failing === 1, JSON.stringify(res.details));
  chk("it reports the commit it measured", /^[0-9a-f]{7,}$/.test(res.details.head), res.details.head);
  chk("the baseline is a full-suite run", /full suite/i.test(res.content[0].text), res.content[0].text.slice(0, 90));
  // The whole point of the worktree: the baseline must be taken at the commit,
  // not in the agent's working tree, and never by moving HEAD under the agent.
  const suite = calls.filter((c) => /pytest/.test((c.args || []).join(" ")));
  chk("it ran the suite in a detached worktree, not the working tree", suite.length === 1 && suite[0].cwd !== dir && /asf-baseline-/.test(suite[0].cwd), suite[0] && suite[0].cwd);
  chk("it never stashes, resets or checks out in the agent's tree", !calls.some((c) => /\b(stash|reset|checkout)\b/.test((c.args || []).join(" "))), calls.map((c) => (c.args || []).join(" ")).join(" | ").slice(0, 120));
  process.chdir(REPO);
}

section("2. what it refuses");
{
  process.chdir(REPO);
  const dir = makeRepo({ committed: false }); // no commit yet
  const { tool } = await loadTool(fakeExec());
  await pointAt(dir);
  const res = await tool.execute("t2", { command: "pytest -q" });
  process.chdir(REPO);
  chk("a repository with no commit cannot produce a baseline", res.details.recorded === false && /git/.test(res.content[0].text), res.content[0].text.slice(0, 90));
}
{
  process.chdir(REPO);
  const dir = makeRepo();
  const { tool } = await loadTool(fakeExec());
  await pointAt(dir);
  process.chdir(dir);
  const notTest = await tool.execute("t3", { command: "eslint ." });
  chk("a lint is not a baseline", notTest.details.recorded === false && /test-suite/.test(notTest.content[0].text), notTest.content[0].text.slice(0, 90));
  const subset = await tool.execute("t4", { command: "pytest tests/a.py" });
  chk("a subset is not a baseline", subset.details.recorded === false && /subset/i.test(subset.content[0].text), subset.content[0].text.slice(0, 110));
  process.chdir(REPO);
}
{
  // A spawn that fails must not become an empty (and therefore permissive) baseline.
  process.chdir(REPO);
  const dir = makeRepo();
  // A spawn that throws (the real exec resolves an `error` field; a broken
  // injection can throw) must record nothing rather than an empty baseline.
  const { tool } = await loadTool(async () => { throw new Error("spawn failed"); });
  await pointAt(dir);
  process.chdir(dir);
  const res = await tool.execute("t5", { command: "pytest -q" });
  chk("a failed spawn records nothing", res.details.recorded === false, JSON.stringify(res.details));
  process.chdir(REPO);
}

section("3. the entry it writes is the entry the gate accepts");
{
  process.chdir(REPO);
  const dir = makeRepo();
  const { tool } = await loadTool(fakeExec());
  await pointAt(dir);
  process.chdir(dir);
  const res = await tool.execute("t6", { command: "pytest -q" });
  process.chdir(REPO);
  const entry = {
    kind: "baseline-run", command: "pytest -q", exitCode: res.details.exitCode,
    durationMs: 10, failing: ["tests/a.py::test_old"], scope: "full", head: res.details.head,
  };
  const l = createLedger();
  const ok = l.append(entry);
  chk("the recorded shape passes the ledger validator", ok.ok === true, String(ok.error));
  chk("and a baseline missing its head is refused", l.append({ ...entry, head: "" }).ok === false);
  chk("a subset baseline is refused", l.append({ ...entry, scope: "subset" }).ok === false);
  chk("a baseline without failing names is refused", l.append({ ...entry, failing: undefined }).ok === false);
}

console.log(`\n${pass}/${pass + fail} checks passed`);
if (fail) { console.log("FAILED"); process.exit(1); }
