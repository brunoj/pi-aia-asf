/**
 * The gates must measure the project the run is ABOUT.
 *
 * `runRoot()` is the git root of the session's cwd — correct for where state lives,
 * wrong for what to measure. A session started in a home directory that is itself a
 * git repo (common: `pi` launched from $HOME with checkouts underneath) had every
 * health gate measure the parent. It did: `asf_health` reported 363 model findings
 * from an unrelated project checked out under $HOME, and eslint, madge and jscpd all
 * timed out scanning a tree nobody was working in. A gate that measures the wrong
 * directory is worse than no gate — it blocks on findings in code the run must not
 * touch, or waves through the one project that is actually unhealthy.
 *
 * Built on throwaway repos rather than the real $HOME, so the assertion is about the
 * rule and not about what happens to be checked out on this machine.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

function git(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
}

/** parent repo, with a nested checkout inside it — the shape that broke. */
function makeTree() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "asf-mroot-"));
  fs.mkdirSync(path.join(root, "parent"), { recursive: true });
  fs.mkdirSync(path.join(root, "parent", "child"), { recursive: true });
  // The parent is committed BEFORE the child is initialised: `git add -A` in a repo
  // that contains a nested repository fails outright ("does not have a commit checked
  // out"), which is the real shape of a $HOME full of checkouts.
  const commit = (dir, file) => {
    git(dir, ["add", "--", file]);
    git(dir, ["-c", "user.email=a@b", "-c", "user.name=a", "commit", "-qm", "init"]);
  };
  git(path.join(root, "parent"), ["init", "-q"]);
  fs.writeFileSync(path.join(root, "parent", "p.mjs"), "export const p = 1;\n");
  commit(path.join(root, "parent"), "p.mjs");
  git(path.join(root, "parent", "child"), ["init", "-q"]);
  fs.writeFileSync(path.join(root, "parent", "child", "c.mjs"), "export const c = 1;\n");
  commit(path.join(root, "parent", "child"), "c.mjs");
  return { root, parent: path.join(root, "parent"), child: path.join(root, "parent", "child") };
}

export async function run({ loadTs, events, invokeCommand }) {
  let pass = 0, fail = 0;
  const chk = (n, c, d) => { console.log(`  ${c ? "PASS" : "FAIL"}  ${n}${d ? " — " + d : ""}`); c ? pass++ : fail++; };
  const asfText = async (args) => {
    const r = await invokeCommand("asf", args);
    const list = r?.notices || (Array.isArray(r) ? r : []);
    return list.map((n) => (typeof n === "string" ? n : n?.message || "")).join("\n");
  };
  const toolCall = async (n, i, id = `tc-${Math.random()}`) => {
    for (const fn of events.filter((e) => e.ev === "tool_call").map((e) => e.fn)) await fn({ toolName: n, input: i, toolCallId: id });
  };
  const { measureRoot, openAutoRun } = await loadTs("lib/extension/run.ts");
  const { runRoot } = await loadTs("lib/extension/paths.ts");
  const { __clearProjectCache } = await import("../lib/project.mjs");

  const t = makeTree();
  const prev = process.cwd();
  try {
    process.chdir(t.parent);
    __clearProjectCache();

    console.log("=== the parent-repo session shape ===");
    chk("the nested checkout is really a separate repo", t.child.startsWith(t.parent + "/") && runRoot() === t.parent, `${t.parent} / ${t.child}`);
    chk("runRoot() follows the session, which is what STATE needs", runRoot() === t.parent, runRoot());

    console.log("=== nothing touched ===");
    chk("with no touched files it measures the session root", (await measureRoot()) === t.parent, await measureRoot());

    console.log("=== work happening in the nested checkout ===");
    await openAutoRun("test", path.join(t.child, "c.mjs"));
    chk("a run touching the nested checkout MEASURES that checkout", (await measureRoot()) === t.child, await measureRoot());
    chk("and state did not move with it", runRoot() === t.parent, runRoot());

    console.log("=== a directory is not a project just because a file lives in it ===");
    // projectRoot() echoes its argument when git finds no repo (a state key has to be
    // something). Used as a project probe that made `<parent>/plain` look like a root, so
    // ASF read `<parent>/plain/.asf/decisions`, found nothing, and treated the project as
    // having no decisions at all. A non-repo directory must never be chosen.
    const plain = path.join(t.parent, "plain");
    fs.mkdirSync(plain, { recursive: true });
    fs.writeFileSync(path.join(plain, "d.mjs"), "export const d = 1;\n");
    await openAutoRun("test", path.join(plain, "d.mjs"));
    chk("a touched file in a NON-git subdirectory keeps the session root", (await measureRoot()) === t.parent, await measureRoot());
    const { projectOf } = await loadTs("lib/extension/run.ts");
    // The subdirectory belongs to the enclosing repo — it must never be reported as its
    // own project, which is exactly what the echo used to do.
    chk("a non-git subdirectory resolves to the ENCLOSED repo, not to itself", projectOf(path.join(plain, "d.mjs"), t.parent) === t.parent, String(projectOf(path.join(plain, "d.mjs"), t.parent)));
    // And a file with no repo anywhere above it has no project at all (this is the shape
    // that made a register read come up empty and look like "no decisions").
    const noRepo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "asf-norepo-")));
    fs.writeFileSync(path.join(noRepo, "e.mjs"), "export const e = 1;\n");
    chk("a file in no repository at all has no project", projectOf(path.join(noRepo, "e.mjs"), noRepo) === null, String(projectOf(path.join(noRepo, "e.mjs"), noRepo)));
    fs.rmSync(noRepo, { recursive: true, force: true });

    console.log("=== a file directly inside a repo still names it ===");
    // The mirror case: git root == the file's own directory is legitimate, not an echo.
    await openAutoRun("test", path.join(t.parent, "p.mjs"));
    chk("a file in the repo root measures the repo", (await measureRoot()) === t.parent, await measureRoot());
    chk("projectOf() resolves a repo-root file to that root", projectOf(path.join(t.child, "c.mjs"), t.parent) === t.child, String(projectOf(path.join(t.child, "c.mjs"), t.parent)));
    chk("projectOf() refuses a path outside the workspace", projectOf(path.join(os.tmpdir(), "elsewhere", "z.ts"), t.parent) === null);

    console.log("=== it does not wander outside the workspace ===");
    // A stray absolute path (a scratch dir, an unrelated checkout) must not drag the
    // measurement out of the workspace; the session root is the safe answer.
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "asf-outside-"));
    fs.writeFileSync(path.join(outside, "x.ts"), "export const x = 1;\n");
    git(outside, ["init", "-q"]);
    fs.writeFileSync(path.join(outside, "y.ts"), "export const y = 1;\n");
    git(outside, ["add", "--", "y.ts"]);
    git(outside, ["-c", "user.email=a@b", "-c", "user.name=a", "commit", "-qm", "i"]);
    await openAutoRun("test", path.join(outside, "y.ts"));
    const got = await measureRoot();
    chk("a touched path outside the workspace does not move the measurement", got === t.parent, got);
    fs.rmSync(outside, { recursive: true, force: true });

    console.log(`\n${pass} passed, ${fail} failed`);
    console.log("=== the project's OWN artifacts follow the code, not the session ===");
    // One family, one root. The trace gate resolved a spec's testFile against
    // runRoot(); the project config, Gate 5's PLAN.md and the config screen did the
    // same to the project's own files — a session started above the code read the
    // WRONG config and refused a PLAN.md that existed. Driven through the real
    // registered graph (tool_call + the asf command), because a hand-imported module
    // gets its own runtime and would prove nothing.
    const { runApprove } = await loadTs("lib/extension/commands/session.ts");
    fs.mkdirSync(path.join(t.parent, ".asf"), { recursive: true });
    fs.mkdirSync(path.join(t.child, ".asf"), { recursive: true });
    fs.writeFileSync(path.join(t.parent, ".asf", "config.json"), "{}\n");
    fs.writeFileSync(path.join(t.child, ".asf", "config.json"), JSON.stringify({ not_a_real_gate: 5 }));
    fs.writeFileSync(path.join(t.child, "PLAN.md"), "# plan\n");

    await toolCall("edit", { path: path.join(t.child, "c.mjs") });
    const inChild = await asfText("config --check");
    chk("the config screen checks the config of the project under work",
      /not_a_real_gate/.test(inChild), inChild.slice(0, 70));
    chk("Gate 5 finds the PLAN.md that exists in the project under work",
      !/No PLAN\.md found/.test(await runApprove()), (await runApprove()).slice(0, 60));

    await toolCall("edit", { path: path.join(t.parent, "p.mjs") });
    const inParent = await asfText("config --check");
    chk("NEGATIVE: with the work in the parent, the child's bad config is not blamed on it",
      /configuration is consistent/.test(inParent), inParent.slice(0, 70));
    const planParent = await runApprove();
    chk("NEGATIVE: and a missing plan is reported against the PARENT, not the child",
      /No PLAN\.md found/.test(planParent) && !/child/.test(planParent), planParent.slice(0, 80));

    // Nothing touched yet resolves at the session root: a config sitting in some other
    // checkout cannot hijack a session that is not working there.
    const fresh = fs.mkdtempSync(path.join(os.tmpdir(), "asf-mroot-idle-"));
    execFileSync("git", ["init", "-q"], { cwd: fresh });
    const prevFresh = process.cwd();
    process.chdir(fresh);
    __clearProjectCache();
    const idle = await asfText("config --check");
    chk("with nothing touched yet, the session root is the project", /configuration is consistent/.test(idle), idle.slice(0, 70));
    process.chdir(prevFresh);
    fs.rmSync(fresh, { recursive: true, force: true });

    return fail === 0;
  } finally {
    process.chdir(prev);
    fs.rmSync(t.root, { recursive: true, force: true });
  }
}
