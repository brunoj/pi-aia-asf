/**
 * Backfill: recovering a project's decisions when there is no register.
 *
 * The spec says ASF writes one at the first opportunity by analysing what is already
 * there. The failure mode that rule invites is a model inventing a rationale nobody wrote,
 * so the design under test here is that ASF does the part it can prove (what exists, what
 * is covered, what is missing) and the agent does the part that needs understanding — and
 * the schema is what enforces that, not a prompt asking nicely.
 *
 * Negative controls, all run and required to fire:
 *   - a project WITH a register is never offered a backfill
 *   - a project with no source (docs only) is never offered one
 *   - the offer happens ONCE per run, and a new run gets one again
 *   - a recovered record that cites no source is refused (so "analysed" cannot be faked)
 *   - a recovered record with a source is accepted immediately — no human promotion
 *   - coverage is read from the records, so a second pass offers only what is uncovered
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { projectKey, __clearProjectCache } from "../lib/project.mjs";
import { homeStateDir } from "../lib/home.mjs";
import { hasSource, findForeignAdrs, inventory, coverage, backfillSteer } from "../lib/decisions/backfill.mjs";
import { matchesAny } from "../lib/decisions/glob.mjs";
import { loadRegister } from "../lib/decisions/store.mjs";

let pass = 0, fail = 0;
const chk = (name, cond, detail = "") => {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${cond ? "" : " — "}${!cond && detail ? detail : cond && detail ? " — " + detail : ""}`);
  if (!cond) fail++;
  else pass++;
};

const PREV = process.cwd();

function project(prefix) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), `asf-bf-${prefix}-`)));
  __clearProjectCache();
  const key = projectKey(root);
  const w = (rel, text) => {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, text ?? `export const x = 1;\n`);
    return abs;
  };
  return {
    root,
    decisionsDir: path.join(root, ".asf", "decisions"),
    write: w,
    cleanup() {
      try { process.chdir(PREV); } catch { /* gone */ }
      fs.rmSync(root, { recursive: true, force: true });
      try { fs.rmSync(homeStateDir(root, key), { recursive: true, force: true }); } catch { /* never written */ }
      __clearProjectCache();
    },
    enter() { process.chdir(root); __clearProjectCache(); },
  };
}

function git(dir, args) {
  return execFileSync("git", args, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
}

const ADR = `# Adopt Postgres over SQLite

Status: accepted

## Context

We need a server database.

## Consequences

Ops runs backups.
`;

const RECOVERED = {
  id: "ADR-0001",
  status: "accepted",
  title: "Tests run through the custom runner",
  decision: "run the suite with bash test/run-all.sh; a per-file run is not a suite",
  applies_to: ["test/**"],
  origin: "backfill",
  source: ["test/run-all.sh"],
};

export async function run({ events, invokeCommand }) {
  const on = (ev) => events.filter((e) => e.ev === ev).map((e) => e.fn);
  const toolCall = async (toolName, input) => {
    let out;
    for (const fn of on("tool_call")) out = (await fn({ toolName, input, toolCallId: `tc-${Math.random()}` })) || out;
    return out;
  };
  const settleAll = async () => {
    const log = [];
    let out;
    for (const fn of on("agent_before_settle")) {
      out = await fn({ type: "agent_before_settle", outcome: "completed", entries: [], context: { canContinue: false } });
    }
    for (const e of out?.entries || []) if (e.customType === "asf-steer") log.push(String(e.content || ""));
    return { out, steers: log.join("\n"), card: (out?.entries || []).filter((e) => e.customType === "asf-run-card").map((e) => String(e.content || "")).join("\n") };
  };
  const tool = (name) => (globalThis.__tools || []).find((t) => t.name === name);
  const text = (r) => String(r?.content?.[0]?.text || "");
  /**
   * The observer watches tool CALLS; the filesystem is what `hasSource` reads. A fixture
   * that only fires the event without writing the file tests a project with no code — so
   * every "agent wrote code here" step does both, or the offer under test would be
   * correctly withheld and the check would pass for the wrong reason.
   */
  const touch = async (p2, rel, content = "export const x = 1;\n") => {
    p2.write(rel, content);
    await toolCall("write", { path: rel, content });
  };

  console.log("=== 1. what ASF can prove from the files alone ===");
  const p = project("inv");
  p.enter();
  try {
    p.write("lib/mod.mjs");
    p.write("tsconfig.json", "{}");
    p.write(".eslintrc.json", "{}");
    p.write(".github/workflows/ci.yml", "name: ci\n");
    p.write("package.json", JSON.stringify({ name: "x", dependencies: { zod: "3", jiti: "2" } }));
    p.write("docs/decisions/0001-postgres.md", ADR);
    p.write(".asf/.gitignore", "state/\n");
    p.write(".asf/decisions/INDEX.md", "# generated\n");
    git(p.root, ["init", "-q"]);
    git(p.root, ["add", "-A"]);
    git(p.root, ["-c", "user.email=a@b", "-c", "user.name=a", "commit", "-qm", "feat!: choose postgres"]);

    chk("a project with code has source to recover", hasSource(p.root));
    const docsOnly = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "asf-bf-docs-")));
    fs.writeFileSync(path.join(docsOnly, "README.md"), "# docs\n");
    fs.mkdirSync(path.join(docsOnly, "docs"), { recursive: true });
    fs.writeFileSync(path.join(docsOnly, "docs/guide.md"), "# guide\n");
    chk("a docs-only project does not", !hasSource(docsOnly));
    chk("and a missing directory is not treated as having source", !hasSource(path.join(docsOnly, "nope")));
    fs.rmSync(docsOnly, { recursive: true, force: true });

    const foreign = findForeignAdrs(p.root);
    chk("an already-written ADR is found", foreign.some((f) => f.file === "docs/decisions/0001-postgres.md"), JSON.stringify(foreign));
    chk("its status is read", foreign.some((f) => /accepted/.test(f.status)));
    chk("ASF's own register is never counted as foreign", !foreign.some((f) => f.file.startsWith(".asf/")), JSON.stringify(foreign));

    const inv = inventory(p.root);
    const kinds = new Set(inv.map((i) => i.kind));
    chk("configs are offered as evidence", kinds.has("config"), [...kinds].join(","));
    chk("the CI workflow is offered (CI is an enforced decision)", inv.some((i) => i.file.includes("workflows/ci.yml")));
    chk("dependencies are offered with the names", inv.some((i) => i.kind === "deps" && /zod/.test(i.hint)));
    chk("a course-changing commit is offered from history", inv.some((i) => i.kind === "history"));
    chk("every candidate says WHY it is worth reading", inv.every((i) => i.hint && i.hint.length > 8));
    chk("node_modules and .git are never walked", !inv.some((i) => /node_modules|\/\.git\//.test(i.file)));

    console.log("=== 2. coverage makes it idempotent ===");
    const recs = [{ id: "ADR-0001", status: "accepted", source: ["docs/decisions/0001-postgres.md"], applies_to: ["db/**"] }];
    const c1 = coverage(recs, inv, matchesAny);
    chk("a cited source is covered", c1.covered.some((s) => s.file === "docs/decisions/0001-postgres.md"));
    chk("uncited sources stay uncovered", c1.uncovered.some((s) => s.file === "tsconfig.json"));
    const c2 = coverage([], inv, matchesAny);
    chk("with no records nothing is covered", c2.covered.length === 0 && c2.uncovered.length === inv.length);

    console.log("=== 2b. the cases the first fixtures could not reach (found in review) ===");
    {
      // A glob that covers a sibling directory marks unrelated work as already recovered,
      // and the failure is silent in the unsafe direction: the agent is never offered it.
      const boundary = coverage(
        [{ id: "A", status: "accepted", applies_to: ["src/**"], source: [] }],
        [{ file: "src/a.ts", kind: "source", hint: "x" }, { file: "srcfoo/x.ts", kind: "source", hint: "x" }, { file: "testdata/y.ts", kind: "source", hint: "x" }],
        matchesAny,
      );
      chk("a record for src/** covers src/a.ts", boundary.covered.some((i) => i.file === "src/a.ts"));
      chk("NEGATIVE: src/** does NOT cover srcfoo/x.ts (prefix matching would)", !boundary.covered.some((i) => i.file === "srcfoo/x.ts"), JSON.stringify(boundary.covered));
      chk("NEGATIVE: test/** does not cover testdata/", !(coverage([{ id: "A", status: "accepted", applies_to: ["test/**"] }], [{ file: "testdata/y.ts", kind: "source", hint: "x" }], matchesAny).covered.length));
      const near = coverage([{ id: "A", status: "accepted", source: ["docs/decisions"] }], [{ file: "docs/decisions-other/x.md", kind: "adr", hint: "x" }], matchesAny);
      chk("NEGATIVE: a near-miss directory prefix in source[] covers nothing", near.covered.length === 0, JSON.stringify(near.covered));
    }
    {
      // The 200-entry cap was applied to the RAW names, so a directory whose first entries
      // were node_modules/.git/dist hid the source entirely and the offer was withheld.
      // The cap is per directory and applies AFTER the skip filter, so build output does
      // not eat the budget the real directories need to be seen at all.
      const crowded = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "asf-bf-crowd-")));
      for (const junk of ["node_modules", "dist", "coverage", "build", "out", "vendor", "target", "__pycache__", ".venv", ".cache", ".next"]) {
        fs.mkdirSync(path.join(crowded, junk), { recursive: true });
        fs.writeFileSync(path.join(crowded, junk, "generated.ts"), "export const g = 1;\n");
      }
      for (let i = 0; i < 195; i++) fs.mkdirSync(path.join(crowded, `zpack${String(i).padStart(3, "0")}`));
      fs.mkdirSync(path.join(crowded, "zsrc"), { recursive: true });
      fs.writeFileSync(path.join(crowded, "zsrc", "real.ts"), "export const a = 1;\n");
      chk("NEGATIVE: skipped build output does not consume the entry budget the source needs", hasSource(crowded));
      const deepOnly = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "asf-bf-deep-")));
      fs.mkdirSync(path.join(deepOnly, "a", "b", "c", "d"), { recursive: true });
      fs.writeFileSync(path.join(deepOnly, "a", "b", "c", "d", "deep.ts"), "export const d = 1;\n");
      chk("the walk depth is a real bound, stated not silently wrong (deep-only reads as no source)", !hasSource(deepOnly), "depth bound not enforced");
      const linked = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "asf-bf-link-")));
      const outside = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "asf-bf-outside-")));
      fs.writeFileSync(path.join(outside, "secret.ts"), "export const s = 1;\n");
      fs.symlinkSync(path.join(outside, "secret.ts"), path.join(linked, "linked.ts"));
      chk("NEGATIVE: a symlink out of the root is not read as the project's own source", !hasSource(linked), "symlink followed");
      fs.rmSync(crowded, { recursive: true, force: true });
      fs.rmSync(linked, { recursive: true, force: true });
      fs.rmSync(outside, { recursive: true, force: true });
    }
    {
      // A register configured elsewhere must never be offered back as a foreign ADR to adopt.
      const cfgd = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "asf-bf-cfgdir-")));
      fs.mkdirSync(path.join(cfgd, "docs", "adr"), { recursive: true });
      fs.writeFileSync(path.join(cfgd, "docs", "adr", "0001-ours.md"), ADR);
      fs.writeFileSync(path.join(cfgd, "lib.ts"), "export const a = 1;\n");
      const cfg = { "decisions.dir": "docs/adr" };
      chk("NEGATIVE: the configured register is not offered as foreign", findForeignAdrs(cfgd, cfg).length === 0, JSON.stringify(findForeignAdrs(cfgd, cfg)));
      chk("and the same file IS foreign when the register lives at .asf (the default)", findForeignAdrs(cfgd).length === 1, JSON.stringify(findForeignAdrs(cfgd)));
      fs.mkdirSync(path.join(cfgd, "docs", "decisions"), { recursive: true });
      fs.writeFileSync(path.join(cfgd, "docs", "decisions", "0002-theirs.md"), ADR);
      chk("a genuine foreign ADR is still found alongside it", findForeignAdrs(cfgd, cfg).some((f) => f.file === "docs/decisions/0002-theirs.md"), JSON.stringify(findForeignAdrs(cfgd, cfg)));
      fs.writeFileSync(path.join(cfgd, "docs", "decision-tree.md"), "# decision tree\n\nhow to branch\n");
      chk("NEGATIVE: `decision-tree.md` is documentation, not an ADR to adopt", !findForeignAdrs(cfgd, cfg).some((f) => f.file.includes("decision-tree")), JSON.stringify(findForeignAdrs(cfgd, cfg)));
      fs.rmSync(cfgd, { recursive: true, force: true });
    }
    {
      // The cap truncated in insertion order, so generic source evicted the ADRs and CI.
      const big = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "asf-bf-big-")));
      for (let i = 0; i < 60; i++) { fs.mkdirSync(path.join(big, "src"), { recursive: true }); fs.writeFileSync(path.join(big, "src", `m${i}.ts`), "export const x=1;\n"); }
      fs.mkdirSync(path.join(big, "docs", "decisions"), { recursive: true });
      fs.writeFileSync(path.join(big, "docs", "decisions", "0001-key.md"), ADR);
      fs.mkdirSync(path.join(big, ".github", "workflows"), { recursive: true });
      fs.writeFileSync(path.join(big, ".github", "workflows", "ci.yml"), "name: ci\n");
      const capped = inventory(big, { limit: 12 });
      chk("NEGATIVE: under the cap the ADR survives, not the 60 source files", capped.some((i) => i.kind === "adr"), JSON.stringify(capped.map((i) => i.kind)));
      chk("and the CI workflow survives too", capped.some((i) => i.file.includes("ci.yml")));
      chk("generic source files are what get dropped", !capped.some((i) => i.kind === "source" && /m4[0-9]/.test(i.file)) || capped.filter((i) => i.kind === "source").length < 12);
      git(big, ["init", "-q"]);
      git(big, ["add", "-A"]);
      git(big, ["-c", "user.email=a@b", "-c", "user.name=a", "commit", "-qm", "refactor!: split the store"]);
      const hist = inventory(big).filter((i) => i.kind === "history");
      chk("history cites a commit SHA, not a truncated subject", hist.every((i) => /^[0-9a-f]{7,40}$/.test(i.file)), JSON.stringify(hist.map((i) => i.file)));
      chk("and the subject is in the hint where a reader can see it", hist.every((i) => /split the store/.test(i.hint)), JSON.stringify(hist.map((i) => i.hint)));
      fs.rmSync(big, { recursive: true, force: true });
    }

    console.log("=== 3. the steer says what to do and never says stop ===");
    const steer = backfillSteer({ records: [], foreign, uncovered: inv, hasSource: true });
    chk("an empty register with evidence produces the offer", typeof steer === "string" && steer.length > 100);
    chk("it names the action that closes it", /asf_decisions action=record/.test(steer));
    chk("it requires citing where it came from", /source: \[/.test(steer));
    chk("NEGATIVE: it does not hand the agent a path to copy-paste as provenance", !/source: \[[a-z]/i.test(steer) && /actually read/.test(steer), (steer.match(/source: \[[^\]]*\]/) || [""])[0]);
    chk("the ceiling it names is the ceiling it uses", /5 records is enough/.test(backfillSteer({ records: [], foreign: [], uncovered: [{ file: "a.ts", kind: "source", hint: "x" }], hasSource: true, max: 5 })) && /3 records is enough/.test(backfillSteer({ records: [], foreign: [], uncovered: [{ file: "a.ts", kind: "source", hint: "x" }], hasSource: true, max: 3 })));
    chk("it forbids inventing a rationale", /not documented \(recovered\)/.test(steer) && /never invent/i.test(steer));
    chk("it bounds the work", /5 records is enough/.test(steer));
    chk("it adopts rather than duplicates an existing ADR", /Adopt an existing ADR/.test(steer));
    chk("and it never tells the agent to stop", !/\bstop\b|\bhalt\b|cannot continue/i.test(steer));
    chk("a project WITH a register is never offered one", backfillSteer({ records: [{ id: "ADR-0001" }], foreign, uncovered: inv, hasSource: true }) === null);
    chk("a project with no source is never offered one", backfillSteer({ records: [], foreign: [], uncovered: [], hasSource: false }) === null);
    // The case that actually distinguishes the guard from the empty-list guard: there IS
    // something to say, but the project has no code for a decision to be about.
    chk("not even when candidates exist but the project has no code",
      backfillSteer({ records: [], foreign: [{ file: "docs/decisions/a.md", title: "T", status: "" }], uncovered: [], hasSource: false }) === null);
    chk("nothing to recover means no steer at all", backfillSteer({ records: [], foreign: [], uncovered: [], hasSource: true }) === null);
  } finally {
    p.cleanup();
  }

  console.log("=== 4. live: writing code in a register-less project offers once ===");
  const q = project("live");
  q.enter();
  try {
    for (const fn of on("session_start")) await fn({}, { getModel: () => ({ contextWindow: 200_000 }) });
    q.write("tsconfig.json", "{}");
    q.write("package.json", JSON.stringify({ name: "x", dependencies: { zod: "3" } }));
    await touch(q, "src/a.ts", "export const a = 1;\n");
    const first = await settleAll();
    chk("the first source write offers the backfill", /no decision register/.test(first.steers), first.steers.slice(0, 90));
    chk("the offer carries the candidate list", /- .*src\/a\.ts|package\.json|tsconfig/.test(first.steers) || /Where to look/.test(first.steers));
    chk("the run card says a register is missing", /no decision register/i.test(first.card), first.card.replace(/\n/g, " ").slice(0, 90));

    await touch(q, "src/b.ts", "export const b = 1;\n");
    await toolCall("edit", { path: "src/a.ts", content: "export const a = 2;\n" });
    const second = await settleAll();
    const offers = (first.steers + second.steers).match(/no decision register/g) || [];
    chk("and it is offered ONCE per run, not once per write", offers.length === 1, `${offers.length} offers`);

    console.log("=== 5. the agent writes the records; ASF does not invent them ===");
    const dec = tool("asf_decisions");
    chk("asf_decisions exposes bootstrap", JSON.stringify(dec?.parameters || {}).includes("bootstrap"));
    const boot = text(await dec.execute("t-boot", { action: "bootstrap" }));
    chk("bootstrap reports candidates rather than writing", /candidate source|no register/i.test(boot) && /action=record/.test(boot), boot.slice(0, 90));
    chk("bootstrap found the real files", /tsconfig\.json|package\.json/.test(boot));

    const fake = await dec.execute("t-fake", {
      action: "record",
      title: "Tests run through the custom runner",
      decision: RECOVERED.decision,
      applies_to: ["test/**"],
      origin: "backfill",
      body: "## Decision\nx\n\n## Context\ny\n\n## Options considered\n- a\n- b\n\n## Consequences\nz\n",
    });
    // The guarantee is not "the file is never written" — an unsubstantiated record is
    // demoted to `proposed`, which the register deliberately never enforces. That is the
    // load-bearing property: a fabricated rationale cannot govern anyone's edits.
    chk("a recovered record citing NOTHING is not written as accepted", !loadRegister(q.decisionsDir).records.some((r) => r.status === "accepted" && !(r.source || []).length), JSON.stringify(loadRegister(q.decisionsDir).records.map((r) => r.status)));
    chk("and the register check flags the unprovenanced record", /provenance|cite source/i.test(text(await dec.execute("t-chk", { action: "check" }))), text(await dec.execute("t-chk2", { action: "check" })).slice(0, 110));

    const good = await dec.execute("t-good", {
      action: "record",
      title: RECOVERED.title,
      decision: RECOVERED.decision,
      applies_to: RECOVERED.applies_to,
      origin: "backfill",
      source: ["package.json"],
      body: "## Decision\nrun the suite with bash test/run-all.sh\n\n## Context\nthe repo has a custom runner\n\n## Options considered\n- the custom runner\n- per-file invocation\n\n## Consequences\none command, one verdict\n",
    });
    chk("a recovered record WITH a source is written", /Recorded ADR-/.test(text(good)), text(good).slice(0, 90));
    const written = loadRegister(q.decisionsDir).records;
    const recovered = written.find((r) => (r.source || []).includes("package.json"));
    chk("and it is ACCEPTED immediately — no human promotion needed for an unattended run",
      !!recovered && recovered.status === "accepted" && recovered.origin === "backfill", JSON.stringify(written.map((r) => [r.status, r.origin, r.source])));
    chk("it carries provenance", !!recovered && recovered.source.includes("package.json"));

    const after = await settleAll();
    chk("once a register exists, the offer stops", !/no decision register/.test(after.steers), after.steers.slice(0, 80));

    const boot2 = text(await dec.execute("t-boot2", { action: "bootstrap" }));
    const listed = boot2.split("not covered")[1] || "";
    chk("a second bootstrap pass offers only what is still uncovered",
      /record\(s\)/.test(boot2) && !/package\.json/.test(listed) && /src\/a\.ts/.test(listed), boot2.slice(0, 110));

    console.log("=== 5b. a scratch write outside the project is not 'code in this project' ===");
    // The false positive that fired for real: a session whose workspace is a non-repo
    // directory (/home/x) wrote a scratch file under /tmp, the root fell back to the
    // session root, and the agent was offered a register for $HOME — complete with
    // ADRs to "adopt" from an unrelated checkout that happened to live under it.
    const sc = project("scratch");
    sc.enter();
    try {
      for (const fn of on("session_start")) await fn({}, { getModel: () => ({ contextWindow: 200_000 }) });
      sc.write("package.json", JSON.stringify({ name: "y", dependencies: { zod: "3" } }));
      const outside = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "asf-bf-outside-")));
      const scratchFile = path.join(outside, "v.ts");
      fs.writeFileSync(scratchFile, "export const v = 1;\n");
      await toolCall("write", { path: scratchFile, content: "export const v = 1;\n" });
      const so = await settleAll();
      chk("NEGATIVE: a write OUTSIDE the project does not offer a register for the session root",
        !/no decision register/.test(so.steers), so.steers.slice(0, 100) || "(no steer)");
      // And it must not SPEND the run's one offer: a write that really is in the
      // project still has to get it.
      await touch(sc, "src/a.ts", "export const a = 1;\n");
      const sn = await settleAll();
      chk("and the scratch write did not spend the offer a real source write still gets",
        /no decision register/.test(sn.steers), sn.steers.slice(0, 100) || "(no steer)");
      fs.rmSync(outside, { recursive: true, force: true });
    } finally {
      sc.cleanup();
    }

    console.log("=== 6. a new run gets its own offer ===");
    const r = project("second-run");
    r.enter();
    try {
      for (const fn of on("session_start")) await fn({}, { getModel: () => ({ contextWindow: 200_000 }) });
      await touch(r, "src/a.ts", "export const a = 1;\n");
      const one = await settleAll();
      chk("first run in a fresh project is offered", /no decision register/.test(one.steers));
      // Abort ends the run; the next source write opens a new one, which must be offered again.
      await invokeCommand("asf", "abort");
      await touch(r, "src/z.ts", "export const z = 1;\n");
      const two = await settleAll();
      chk("the NEXT run is offered too (per-run, not per-session)", /no decision register/.test(two.steers), two.steers.slice(0, 80) || "no offer on the second run");
    } finally {
      r.cleanup();
    }

    console.log("=== 7. a project with a register is left alone ===");
    const s = project("has-register");
    s.enter();
    try {
      fs.mkdirSync(s.decisionsDir, { recursive: true });
      fs.writeFileSync(path.join(s.decisionsDir, "0001-style.md"), `---
id: ADR-0001
status: accepted
title: Naming
decision: name modules by concern, never by type
decided: 2026-11-01
applies_to: ["src/**"]
origin: user
user_instructed: "concern over type, always"
---

## Decision
name modules by concern, never by type

## Context
why

## Options considered
- by concern
- by type

## Consequences
clearer folders
`);
      for (const fn of on("session_start")) await fn({}, { getModel: () => ({ contextWindow: 200_000 }) });
      await touch(s, "src/a.ts", "export const a = 1;\n");
      const got = await settleAll();
      chk("an existing register means no backfill offer", !/no decision register/.test(got.steers), got.steers.slice(0, 80));
      // The card is rendered when a run opens, so the register has to exist first. This is
      // the positive direction of the injection check the suite already has in the negative.
      chk("and the card shows what governs the code", /decisions in force/.test(got.card) && /by concern/.test(got.card), got.card.replace(/\n/g, " ").slice(0, 140));
      const b = text(await tool("asf_decisions").execute("t-b", { action: "bootstrap" }));
      chk("and bootstrap says so instead of listing work", /nothing to backfill|1 record/.test(b), b.slice(0, 80));
    } finally {
      s.cleanup();
    }
  } finally {
    q.cleanup();
  }

  console.log(`\n${pass}/${pass + fail} checks passed`);
  if (fail > 0) process.exit(1);
}
