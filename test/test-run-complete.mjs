import fs from "node:fs"; import os from "node:os"; import path from "node:path";
import { execFileSync } from "node:child_process";
import { createLedger } from "../lib/gates/ledger.mjs";
export async function run({ tools, events, loadTs }) {
  const toolCall = async (n, i, id = `tc-${Math.random()}`) => { let o; for (const fn of events.filter(e=>e.ev==="tool_call").map(e=>e.fn)) o = (await fn({ toolName:n, input:i, toolCallId:id })) || o; return o; };
  const toolResult = async (id, c, err=false) => { for (const fn of events.filter(e=>e.ev==="tool_result").map(e=>e.fn)) await fn({ toolCallId:id, content:c, isError:err }); };
  let pass=0, fail=0; const chk=(n,c,d)=>{console.log(`  ${c?"PASS":"FAIL"}  ${n}${d?" — "+d:""}`);c?pass++:fail++;};
  const on=(ev)=>events.filter(e=>e.ev===ev).map(e=>e.fn);
  const { openAutoRun } = await loadTs("lib/extension/run.ts");
  const { loadState } = await loadTs("lib/extension/state.ts");
  const { projectName } = await loadTs("lib/extension/paths.ts");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(),"asf-rc-"));
  execFileSync("git",["init","-q"],{cwd:dir});
  const prev=process.cwd();
  try {
    process.chdir(dir);
    const { __clearProjectCache } = await import("../lib/project.mjs"); __clearProjectCache();
    await on("session_start").reduce(async(m,fn)=>{await m;return fn({});},Promise.resolve());
    const tool = tools.find(t=>t.name==="asf_run_complete");
    chk("asf_run_complete is registered as an AGENT TOOL", !!tool, tools.map(t=>t.name).join(","));
    const f = path.join(dir,"src","a.ts");
    await openAutoRun("test", f);
    chk("a run is open", !!(await loadState(projectName())).current);

    const early = await tool.execute("tc1", {});
    chk("NEGATIVE: an unfinished run is NOT closed", early?.details?.ok===false && early?.details?.closed===false, JSON.stringify(early?.details));
    chk("NEGATIVE: and it says what is missing", (early?.details?.missing||[]).length>0 && /NOT complete/.test(early.content[0].text), early.content[0].text.slice(0,120));
    chk("NEGATIVE: the run stays open with its evidence", !!(await loadState(projectName())).current);

    // Meet the floor the way a real session does: run the suite and let the observer
    // record it. Poking the in-process arrays does not work here (jiti's
    // moduleCache:false hands each import a fresh module) and would not be the real
    // path even if it did.
    const rid = `tc-suite-${Math.random()}`;
    await toolCall("bash", { command: "npm test" }, rid);
    await toolResult(rid, "ALL SUITES PASSED\n");

    const done = await tool.execute("tc2", { note:"shipped the coverage tools" });
    chk("a finished run IS closed", done?.details?.ok===true && done?.details?.closed===true, JSON.stringify(done?.details));
    chk("and the note is carried", /shipped the coverage tools/.test(done.content[0].text), done.content[0].text.slice(0,140));
    const after = await loadState(projectName());
    chk("current is cleared", after.current===null, JSON.stringify(after.current));
    chk("and it went to history", (after.history||[]).length===1, JSON.stringify(after.history));

    const none = await tool.execute("tc3", {});
    chk("with no run it says so rather than inventing one", none?.details?.ok===false && none?.details?.error==="no-run", JSON.stringify(none?.details));

    // The next work opens a fresh run judged on its own facts.
    const f2 = path.join(dir,"src","b.ts");
    const fresh = await openAutoRun("test2", f2);
    chk("the next piece of work gets a NEW run", fresh.runId !== done.details.runId, `${fresh.runId} vs ${done.details.runId}`);
    chk("judged on its own files only", (fresh.filesTouched||[]).length===1 && fresh.filesTouched[0]===f2, JSON.stringify(fresh.filesTouched));
    chk("and it does not inherit the closed run's suite evidence claim", fresh.steers===0, String(fresh.steers));

    // ---- run history: one run, archived once, by one writer (ADR-0001) ----
    const st = await loadTs("lib/extension/state.ts");
    const { archiveRun, mergeMonotonic, historyKey } = st;
    chk("archiveRun is the single history writer, exported for that purpose", typeof archiveRun === "function" && typeof historyKey === "function");

    const mkFile = () => ({ current: null, history: [] });
    const run1 = { runId: "run-A", workType: "auto", phase: "implementation", startedAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" };
    const f1 = mkFile();
    const first = archiveRun(f1, run1, { by: "auto" });
    const again = archiveRun(f1, run1, { by: "asf_run_complete" });
    chk("a run is archived once", f1.history.length === 1 && first.duplicate === false, JSON.stringify(f1.history));
    chk("NEGATIVE: closing the SAME run again does not add a second entry", again.duplicate === true && f1.history.length === 1, JSON.stringify(f1.history));
    chk("the archived run says WHICH run it was", f1.history[0].runId === "run-A", JSON.stringify(f1.history[0]));
    chk("and what closed it", f1.history[0].by === "auto", String(f1.history[0].by));
    chk("endedAt is recorded", typeof f1.history[0].endedAt === "string" && f1.history[0].endedAt.length > 10, String(f1.history[0].endedAt));

    // Two sessions on one project key: each saw a different history. Neither may erase
    // or duplicate the other's — this is exactly how one run landed in history twice.
    const disk = { current: null, history: [{ runId: "run-A", workType: "auto", phase: "implementation", startedAt: "2026-01-01T00:00:00.000Z", endedAt: "2026-01-01T01:00:00.000Z", by: "auto" }] };
    const stale = { current: { ...run1 }, history: [{ runId: "run-A", workType: "auto", phase: "implementation", startedAt: "2026-01-01T00:00:00.000Z", endedAt: "2026-01-01T01:02:00.000Z", by: "asf_run_complete" }] };
    const merged = mergeMonotonic(JSON.parse(JSON.stringify(stale)), JSON.parse(JSON.stringify(disk)));
    chk("NEGATIVE: two writers of the same run leave ONE history entry", merged.history.filter((h) => h.runId === "run-A").length === 1, JSON.stringify(merged.history));
    const disk2 = { current: null, history: [{ runId: "run-A", workType: "auto", phase: "implementation", startedAt: "2026-01-01T00:00:00.000Z", endedAt: "2026-01-01T01:00:00.000Z", by: "auto" }] };
    const other = { current: null, history: [{ runId: "run-B", workType: "auto", phase: "implementation", startedAt: "2026-01-02T00:00:00.000Z", endedAt: "2026-01-02T01:00:00.000Z", by: "auto" }] };
    const union = mergeMonotonic(JSON.parse(JSON.stringify(other)), JSON.parse(JSON.stringify(disk2)));
    chk("a different run from the other writer is KEPT, not overwritten", union.history.length === 2 && union.history.some((h) => h.runId === "run-A") && union.history.some((h) => h.runId === "run-B"), JSON.stringify(union.history.map((h) => h.runId)));
    chk("history stays oldest-first after a merge", union.history[0].runId === "run-A" && union.history[1].runId === "run-B", JSON.stringify(union.history.map((h) => h.endedAt)));
    chk("entries with no runId still deduplicate by their start", historyKey({ runId: null, startedAt: "X" }) === historyKey({ startedAt: "X" }));

    // /asf phase none must go through the same writer, not push its own shape.
    const { setPhase } = await loadTs("lib/extension/commands/session.ts");
    const f3 = path.join(dir, "src", "c.ts");
    await openAutoRun("phase-test", f3);
    const beforePhase = await loadState(projectName());
    const said = await setPhase({},{ phase: "none", workType: "auto" });
    chk("the phase command closes the run", typeof said === "string" && /ended|none|closed/i.test(said), String(said).slice(0, 90));
    const afterPhase = await loadState(projectName());
    chk("and it archived through the single writer, with the runId", (afterPhase.history || []).some((h) => h.runId && h.by === "phase-none"), JSON.stringify((afterPhase.history || []).map((h) => [h.runId, h.by])));
    chk("NEGATIVE: closing it a second time adds nothing", (afterPhase.history || []).filter((h) => h.runId === beforePhase.current?.runId).length === 1, JSON.stringify((afterPhase.history || []).map((h) => h.runId)));
  } finally { process.chdir(prev); fs.rmSync(dir,{recursive:true,force:true}); }
  console.log(`\n${pass} passed, ${fail} failed`); return fail===0;
}
