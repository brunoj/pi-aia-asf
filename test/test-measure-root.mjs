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

export async function run({ loadTs }) {
  let pass = 0, fail = 0;
  const chk = (n, c, d) => { console.log(`  ${c ? "PASS" : "FAIL"}  ${n}${d ? " — " + d : ""}`); c ? pass++ : fail++; };
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
    return fail === 0;
  } finally {
    process.chdir(prev);
    fs.rmSync(t.root, { recursive: true, force: true });
  }
}
