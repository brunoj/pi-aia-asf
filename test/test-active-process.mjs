/**
 * The active process (0.15.0): ASF at all times when software is developed.
 *
 * Every assertion here drives the REAL registered handlers (tool_call,
 * tool_result, agent_before_settle, input, session_compact) the way pi does,
 * against a throwaway project. Each leak found by the bypass audit of the
 * 0.14.x traces has a test, and each guard has a negative control proving the
 * test can fail.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { classifyToolCall, bashWritesSource, isSourcePath, activationDecision, delegatesUnguardedWrites } from "../lib/activation.mjs";
import { projectKey, __clearProjectCache, sanitizeRoot } from "../lib/project.mjs";
import { renderRunCard, CARD_CEILING_BYTES } from "../lib/run-card.mjs";
import { evaluateBlockers, BLOCKERS, __resetRefusals, RULE_TEXT } from "../lib/gates/blockers.mjs";
import { isTestCommand, deriveSuiteRun } from "../lib/gates/ledger.mjs";

const STATE_DIR = path.join(os.homedir(), ".pi", "agent", "skills", "aia-asf", "projects");
const originalCwd = process.cwd();

let pass = 0, fail = 0;
const chk = (name, cond, detail = "") => {
  if (cond) { console.log(`  PASS  ${name}${detail ? " — " + detail : ""}`); pass++; }
  else { console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`); fail++; }
};

function project(prefix, { git = false } = {}) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), `asf-active-${prefix}-`)));
  if (git) execFileSync("git", ["init", "-q"], { cwd: root });
  __clearProjectCache();
  const key = projectKey(root);
  return {
    root,
    key,
    stateFile: path.join(STATE_DIR, key, "state.json"),
    read() { try { return JSON.parse(fs.readFileSync(this.stateFile, "utf8")); } catch { return null; } },
    cleanup() {
      try { process.chdir(originalCwd); } catch { /* gone */ }
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(path.join(STATE_DIR, key), { recursive: true, force: true });
    },
  };
}

export async function run({ events, invokeCommand }) {
  const on = (ev) => events.filter((e) => e.ev === ev).map((e) => e.fn);
  const toolCall = async (toolName, input, id = `tc-${Math.random()}`) => {
    let out;
    for (const fn of on("tool_call")) out = (await fn({ toolName, input, toolCallId: id })) || out;
    return out;
  };
  const toolResult = async (id, content, isError = false) => { for (const fn of on("tool_result")) await fn({ toolCallId: id, content, isError }); };
  const settle = async (entries = []) => {
    let out;
    for (const fn of on("agent_before_settle")) out = await fn({ type: "agent_before_settle", outcome: "completed", entries, context: { canContinue: false } });
    return out;
  };

  console.log("=== 1. activation detects software work through every channel ===");
  chk("edit of a .ts file is a source mutation", classifyToolCall("edit", { path: "src/a.ts" }).source === true);
  chk("write of a .sh file is a source mutation (was missed: 117 in traces)", classifyToolCall("write", { path: "scripts/release.sh" }).source === true);
  chk("Dockerfile / Makefile count as source", isSourcePath("Dockerfile") && isSourcePath("build/Makefile"));
  chk("NEGATIVE: a markdown edit is not source", classifyToolCall("edit", { path: "README.md" }).source === false);
  chk("NEGATIVE: /tmp scratch is not source", isSourcePath("/tmp/scratch.js") === false);
  chk("bash heredoc into a .js file is a source write", bashWritesSource("cat > src/x.js <<'EOF'\nconsole.log(1)\nEOF").writes === true);
  chk("bash python open(...,'w') edit is a source write", bashWritesSource("python3 - <<'PY'\np='index.ts'; open(p,'w').write(s)\nPY").writes === true);
  chk("bash sed -i on source is a source write", bashWritesSource("sed -i 's/a/b/' lib/x.mjs").writes === true);
  chk("NEGATIVE: grep is not a write", bashWritesSource("grep -rn foo lib/x.mjs").writes === false);
  chk("NEGATIVE: a test run is not a write", bashWritesSource("node test/x.test.js > /tmp/out.log").writes === false);
  chk("NEGATIVE: reading a file with cat is not a write", bashWritesSource("cat lib/x.mjs | head").writes === false);

  console.log("=== 2. hand-spawned workers without extensions are not invisible ===");
  chk("pi -p --no-extensions with default tools is counted as source mutation", delegatesUnguardedWrites('pi -p "fix the bug" --no-extensions') === true);
  chk("pi -p --no-extensions -t edit,write is counted", delegatesUnguardedWrites('pi -p "x" --no-extensions -t read,edit,write') === true);
  chk("the classifier counts that worker as a source mutation of the parent run", classifyToolCall("bash", { command: 'pi -p "fix it" --no-extensions' }).source === true);
  chk("NEGATIVE: the documented read-only reviewer fallback is not a mutation", delegatesUnguardedWrites('pi -p "<brief>" --no-extensions --no-skills -t read,grep,find,ls') === false);
  chk("NEGATIVE: a worker WITH extensions is guarded by its own ASF", delegatesUnguardedWrites('pi -p "x"') === false);

  console.log("=== 3. project identity ===");
  const sub = project("ident", { git: true });
  try {
    fs.mkdirSync(path.join(sub.root, "packages", "api"), { recursive: true });
    __clearProjectCache();
    chk("a subdirectory of a repo resolves to the repo's key (cd no longer loses the run)",
      projectKey(path.join(sub.root, "packages", "api")) === projectKey(sub.root));
    chk("NEGATIVE: two different roots with the same basename get different keys",
      sanitizeRoot("/a/work/api") !== sanitizeRoot("/b/other/api"));
  } finally { sub.cleanup(); }

  console.log("=== 4. the first source edit opens a run — in a NON-git directory too ===");
  const p = project("live");
  process.chdir(p.root);
  __clearProjectCache();
  for (const fn of on("session_start")) await fn({});
  try {
    chk("before any edit there is no run", p.read()?.current == null);
    await toolCall("bash", { command: "ls -la" });
    chk("NEGATIVE: a read-only command does not open a run", p.read()?.current == null);
    await toolCall("edit", { path: path.join(p.root, "src", "a.ts") });
    const st = p.read();
    chk("the FIRST source edit opens a run (no two-call threshold)", st?.current?.phase === "implementation", JSON.stringify(st?.current)?.slice(0, 120));
    chk("the auto-run is small-scale: the floor, not the plan/approval ceremony", st?.current?.scale === "small" && st?.current?.auto === true);
    chk("the run records the file it touched", (st?.current?.filesTouched || []).some((f) => f.endsWith("a.ts")));

    console.log("=== 5. the completion floor: source changed => a passing test ===");
    const r1 = await settle();
    const gate = (r1?.entries || []).find((e) => e.customType === "asf-completion-gate");
    chk("an untested change cannot settle silently", !!gate && r1.continue === true, JSON.stringify(r1)?.slice(0, 100));
    chk("the steer says a passing test run is missing", /no passing test run/.test(gate?.content || ""));
    chk("the run card was delivered with the first boundary", (r1?.entries || []).some((e) => e.customType === "asf-run-card"));
    chk("NEGATIVE: the small floor does NOT demand /asf health", !/asf health/.test(gate?.content || ""));

    // a lint is not a test
    await toolCall("bash", { command: "npx eslint src" }, "lint-1");
    await toolResult("lint-1", "ok");
    chk("a lint is not recognised as a test run", isTestCommand("npx eslint src") === false && isTestCommand("npm run typecheck") === false);

    // a real test run closes the floor; custom runners count
    chk("custom runner `bash test/run-all.sh` is a test run", isTestCommand("bash test/run-all.sh"));
    chk("`node tests/e2e/full.test.js` is a (subset) test run", deriveSuiteRun("timeout 300 node tests/e2e/full.test.js", 0, 1, "")?.scope === "subset");
    chk("`node --test` is a test run", isTestCommand("node --test"));
    await toolCall("bash", { command: "bash test/run-all.sh" }, "t-1");
    await toolResult("t-1", "ALL SUITES PASSED");
    const r2 = await settle();
    chk("after a passing test the run settles", !r2 || !(r2.entries || []).some((e) => e.customType === "asf-completion-gate"), JSON.stringify(r2)?.slice(0, 100));
    chk("an auto-run whose floor is met closes itself", p.read()?.current == null);

    console.log("=== 5b. a green run from BEFORE an edit does not validate it ===");
    await toolCall("edit", { path: path.join(p.root, "src", "late.ts") });
    const rs = await settle();
    chk("an edit after the last green test is held to the floor again", (rs?.entries || []).some((e) => e.customType === "asf-completion-gate"), JSON.stringify(rs)?.slice(0, 90));
    await invokeCommand("asf", "abort");

    console.log("=== 5c. A7: a spec met in THIS run without a trace holds the run ===");
    {
      const specDir = path.join(os.homedir(), ".pi", "agent", "skills", "spec-memory", "projects", path.basename(p.root));
      fs.mkdirSync(specDir, { recursive: true });
      try {
        await toolCall("edit", { path: path.join(p.root, "src", "spec.ts") });
        await toolCall("bash", { command: "bash test/run-all.sh" }, "t-spec");
        await toolResult("t-spec", "ALL SUITES PASSED");
        const old = new Date(Date.now() - 86400000).toISOString();
        const now = new Date(Date.now() + 1000).toISOString();
        fs.writeFileSync(path.join(specDir, "current-task.json"), JSON.stringify({ areas: { functionality: [
          { id: "spc-old", status: "met", verifiedAt: old },
          { id: "spc-new", status: "met", verifiedAt: now },
          { id: "spc-ok", status: "met", verifiedAt: now, trace: { outcome: "x", codePath: "a -> b" } },
        ] } }));
        const rt = await settle();
        const g = (rt?.entries || []).find((e) => e.customType === "asf-completion-gate")?.content || "";
        chk("the untraced spec met this run is named", /spc-new/.test(g), g.slice(0, 120));
        chk("NEGATIVE: a spec met in an earlier run is not re-litigated", !/spc-old/.test(g));
        chk("NEGATIVE: a traced spec is not flagged", !/spc-ok/.test(g));
      } finally {
        fs.rmSync(specDir, { recursive: true, force: true });
        await invokeCommand("asf", "abort");
      }
    }

    console.log("=== 6. /asf passive silences THIS run only ===");
    await toolCall("write", { path: path.join(p.root, "src", "b.ts"), content: "x" });
    chk("the next edit opens a fresh run", p.read()?.current?.phase === "implementation");
    const firstRun = p.read().current.runId;
    await invokeCommand("asf", "passive");
    const rp = await settle();
    chk("a passive run is not steered at settle", !rp || !(rp.entries || []).some((e) => e.customType === "asf-completion-gate"));
    // A full green was recorded above, so push is legitimately open here; the
    // refusals that must survive passive are the secret and destructive ones.
    execFileSync("git", ["init", "-q"], { cwd: p.root });
    fs.writeFileSync(path.join(p.root, "dirty.txt"), "uncommitted work");
    const secretOut = await toolCall("write", { path: path.join(p.root, "src", "k.ts"), content: 'const k = "AKIA' + 'ABCDEFGHIJKLMNOP";' });
    chk("A8: passive keeps the secret refusal", secretOut?.block === true, JSON.stringify(secretOut)?.slice(0, 80));
    const destr = await toolCall("bash", { command: ["git", "clean", "-fd"].join(" ") });
    chk("A8: passive keeps the destructive-git refusal on a dirty tree", destr?.block === true, JSON.stringify(destr)?.slice(0, 80));
    await invokeCommand("asf", "abort");
    await toolCall("edit", { path: path.join(p.root, "src", "c.ts") });
    const after = p.read()?.current;
    chk("after the passive run ends, the NEXT source edit is enforced again", after?.phase === "implementation" && after.runId !== firstRun && after.passiveRunId == null);

    console.log("=== 7. deleting state.json does not end enforcement ===");
    fs.rmSync(p.stateFile, { force: true });
    const r3 = await settle();
    chk("the run is restored from the in-process mirror", p.read()?.current?.runId === after.runId);
    chk("and the restore is surfaced, not silent", (r3?.entries || []).some((e) => /restored/.test(String(e.content))), JSON.stringify(r3)?.slice(0, 120));
    fs.writeFileSync(p.stateFile, "{ not json");
    const r4 = await settle();
    chk("a corrupted state file is restored too", p.read()?.current?.runId === after.runId, JSON.stringify(r4)?.slice(0, 60));
    await invokeCommand("asf", "abort");
    chk("NEGATIVE: /asf abort really ends the run (the mirror follows legitimate ends)", (await settle()) === undefined || p.read()?.current == null);
    chk("and it stays ended", p.read()?.current == null);

    console.log("=== 8. blind editing gets one steer, never a block ===");
    let blocked = false;
    for (let i = 0; i < 12; i++) {
      const out = await toolCall("edit", { path: path.join(p.root, "src", `f${i}.ts`) });
      if (out?.block) blocked = true;
    }
    chk("12 unvalidated source edits are never blocked", blocked === false);
    const r5 = await settle();
    const nudges = (r5?.entries || []).filter((e) => e.customType === "asf-steer" && /without a test run/.test(String(e.content)));
    chk("exactly one blind-edit steer is delivered", nudges.length === 1, `got ${nudges.length}`);
    chk("the steer names the files", /f1[01]\.ts/.test(nudges[0]?.content || ""));
    const r6 = await settle();
    chk("NEGATIVE: the identical steer is not delivered again", !(r6?.entries || []).some((e) => e.customType === "asf-steer" && /without a test run/.test(String(e.content))));
    await invokeCommand("asf", "abort");
  } finally {
    p.cleanup();
  }

  console.log("=== 9. refusal ladder: refuse, then the rule, then park ===");
  __resetRefusals();
  const ctx = { suiteRuns: [], dirty: () => true };
  const push = { command: "git push origin main" };
  const a = evaluateBlockers("bash", push, ctx);
  const b = evaluateBlockers("bash", push, ctx);
  const c = evaluateBlockers("bash", push, ctx);
  chk("1st identical refusal: refuse with the autonomous exit", a.block && /Autonomous exit/.test(a.reason) && !a.ruleText);
  chk("2nd: refuse and carry the rule text", b.block && b.ruleText === RULE_TEXT["push-without-recorded-green"]);
  chk("3rd: park for the PO (still refused — never silently allowed)", c.block && !!c.park);
  __resetRefusals();
  chk("NEGATIVE: a new run starts the ladder over", !evaluateBlockers("bash", push, ctx).ruleText);

  console.log("=== 10. the irreversibility floor cannot be removed without failing here ===");
  // Negative control for the whole stop policy: "no stops" must never erode the
  // three refusals that protect irreversible state.
  for (const name of ["secret-in-tracked-file", "push-without-recorded-green", "destructive-git-dirty-tree"]) {
    const bl = BLOCKERS.find((x) => x.name === name);
    chk(`${name} still REFUSES (mode block)`, bl?.mode === "block");
  }
  chk("secret check blocks on its own failure", BLOCKERS.find((x) => x.name === "secret-in-tracked-file")?.failSafe === "block");
  const subsetRes = evaluateBlockers("bash", { command: "npx vitest run src/a.test.ts -t foo" }, { suiteRuns: [], dirty: () => false });
  chk("test-subset-without-impact steers instead of refusing", subsetRes.block === false && (subsetRes.steers || []).some((s) => s.gate === "test-subset-without-impact"), JSON.stringify(subsetRes.steers)?.slice(0, 80));

  console.log("=== 11. the run card is bounded ===");
  const huge = renderRunCard({ phase: "implementation", scale: "large", objective: "x".repeat(5000), openDod: Array(50).fill("y".repeat(200)), filesTouched: Array(40).fill("/a/very/long/path/file.ts") });
  chk(`the card never exceeds ${CARD_CEILING_BYTES} bytes`, Buffer.byteLength(huge.text) <= CARD_CEILING_BYTES, `${Buffer.byteLength(huge.text)} bytes`);
  chk("activation never re-opens an active run", activationDecision({ call: { mutates: true, source: true }, activeRun: { phase: "implementation", runId: "r" } }).activate === false);

  console.log(`\n${pass} passed, ${fail} failed`);
  return fail === 0;
}
