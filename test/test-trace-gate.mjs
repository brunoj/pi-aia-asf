import fs from "node:fs"; import os from "node:os"; import path from "node:path";
import { execFileSync } from "node:child_process";

/**
 * The trace gate (A7): a spec marked met DURING this run must say what it delivers
 * (outcome) and where (codePath), and a claimed testFile must really carry the
 * claimed assertion.
 *
 * This suite exists because the gate shipped with no test at all, and shipped broken:
 * it resolved testFile against runRoot() — the directory pi was started in — so any
 * session opened in a parent directory looked for <parent>/test/x.mjs, never found it,
 * and re-raised "spec(s) marked met without a trace" forever, however complete the
 * trace was. The wrong-root case is a first-class check here, not an afterthought.
 */
const MARKER = "asserts the delivered outcome holds";

export async function run({ events, loadTs }) {
  let pass = 0, fail = 0;
  const chk = (n, c, d) => { console.log(`  ${c ? "PASS" : "FAIL"}  ${n}${d ? " — " + d : ""}`); c ? pass++ : fail++; };
  const on = (ev) => events.filter((e) => e.ev === ev).map((e) => e.fn);

  const { validateTrace, specDir } = await loadTs("lib/extension/specs.ts");
  const { projectName } = await loadTs("lib/extension/paths.ts");
  const { openAutoRun } = await loadTs("lib/extension/run.ts");
  const { loadState } = await loadTs("lib/extension/state.ts");
  const { untracedMetSpecs, evaluateRun } = await loadTs("lib/extension/handlers/settle.ts");

  // Session workspace R, with the actual project nested inside it as its own repo —
  // the shape that broke the gate: pi started above the code it is changing.
  const R = fs.mkdtempSync(path.join(os.tmpdir(), "asf-trace-ws-"));
  execFileSync("git", ["init", "-q"], { cwd: R });
  const P = path.join(R, "proj");
  fs.mkdirSync(path.join(P, "test"), { recursive: true });
  fs.writeFileSync(path.join(P, "test", "test-x.mjs"), `check("${MARKER}", true);\n`);
  execFileSync("git", ["init", "-q"], { cwd: P });

  const trace = (over = {}) => ({ outcome: "the operator sees X", codePath: "a.ts -> b.ts", ...over });
  const prev = process.cwd();
  try {
    process.chdir(R);
    const { __clearProjectCache } = await import("../lib/project.mjs"); __clearProjectCache();
    await on("session_start").reduce(async (m, fn) => { await m; return fn({}); }, Promise.resolve());

    // The run must exist BEFORE the specs are dated: the gate judges only specs
    // verified at/after state.startedAt, so a fixture dated earlier is filtered out
    // and every check below would pass vacuously.
    const touched = path.join(P, "src", "a.ts");
    fs.mkdirSync(path.dirname(touched), { recursive: true });
    fs.writeFileSync(touched, "export const a = 1;\n");
    await openAutoRun("trace gate", touched);
    const st = (await loadState(projectName())).current;
    chk("a run is open, about the nested project rather than the workspace", !!st, JSON.stringify(st?.filesTouched));
    const t0 = Date.parse(st?.startedAt || "") || Date.now();

    const inRun = new Date(t0 + 1000).toISOString();
    const specs = [
      { id: "S1-good", status: "met", verifiedAt: inRun, trace: trace({ testFile: "test/test-x.mjs", assertion: MARKER }) },
      { id: "S2-badassert", status: "met", verifiedAt: inRun, trace: trace({ testFile: "test/test-x.mjs", assertion: "this string is not in the file" }) },
      { id: "S3-notrace", status: "met", verifiedAt: inRun },
      { id: "S6-nocodepath", status: "met", verifiedAt: inRun, trace: { outcome: "only half a trace" } },
      { id: "S4-prevrun", status: "met", verifiedAt: new Date(t0 - 86400000).toISOString() },
      { id: "S5-open", status: "in-progress", verifiedAt: inRun },
    ];
    const dir = path.join(specDir(), projectName());
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "current-task.json"), JSON.stringify({ taskId: "t", areas: { a: specs } }));

    // ── the rule itself ────────────────────────────────────────────────────────
    chk("a complete trace whose test lives in the project passes", validateTrace(specs[0], P).ok, validateTrace(specs[0], P).reason);
    chk("NEGATIVE: an assertion the file does not contain is not a trace", !validateTrace(specs[1], P).ok, validateTrace(specs[1], P).reason);
    chk("NEGATIVE: a met spec with no trace is not a trace", !validateTrace(specs[2], P).ok, validateTrace(specs[2], P).reason);
    chk("NEGATIVE: outcome WITHOUT codePath is not a trace either", !validateTrace(specs[3], P).ok, validateTrace(specs[3], P).reason);
    chk("a trace with no testFile is accepted as inspectable, and says so",
      validateTrace({ id: "x", status: "met", trace: trace() }, P).ok
      && /no testFile/.test(validateTrace({ id: "x", status: "met", trace: trace() }, P).reason));
    chk("an absolute testFile is honoured as given",
      validateTrace({ id: "y", status: "met", trace: trace({ testFile: path.join(P, "test/test-x.mjs"), assertion: MARKER }) }, R).ok);

    // ── the bug, pinned ────────────────────────────────────────────────────────
    const wrong = validateTrace(specs[0], R);
    chk("the WRONG ROOT is what made a complete trace fail (the shipped bug)",
      !wrong.ok && /testFile not found/.test(wrong.reason), wrong.reason);

    // ── the gate, through the real run state ───────────────────────────────────
    const measured = await untracedMetSpecs(st.startedAt, P);
    chk("the gate lists the incomplete traces", measured.includes("S2-badassert") && measured.includes("S3-notrace") && measured.includes("S6-nocodepath"), measured.join(","));
    chk("NEGATIVE: a complete trace is NOT listed when measured against its own project", !measured.includes("S1-good"), measured.join(","));
    chk("a spec met in an EARLIER run is not this run's business", !measured.includes("S4-prevrun"), measured.join(","));
    chk("a spec that is not met is not this run's business", !measured.includes("S5-open"), measured.join(","));

    const stale = await untracedMetSpecs(st.startedAt, R);
    chk("NEGATIVE: measured against the session workspace, the same complete trace is rejected (the bug at the gate)",
      stale.includes("S1-good"), stale.join(","));

    // The completion gate itself must use the measured root, not the workspace.
    const verdict = await evaluateRun(projectName(), st);
    const missing = (verdict.missing || []).join(" | ");
    chk("the completion gate does not re-raise a trace that is genuinely complete",
      !/S1-good/.test(missing), missing.slice(0, 160));
    chk("and it DOES re-raise the ones that are not", /S2-badassert/.test(missing) && /S3-notrace/.test(missing) && /S6-nocodepath/.test(missing), missing.slice(0, 160));

    console.log(`\n${fail === 0 ? "OK" : "NOT OK"}  test-trace-gate: ${pass} passed, ${fail} failed`);
    return { pass, fail };
  } finally {
    process.chdir(prev);
    fs.rmSync(R, { recursive: true, force: true });
  }
}
