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
  } finally { process.chdir(prev); fs.rmSync(dir,{recursive:true,force:true}); }
  console.log(`\n${pass} passed, ${fail} failed`); return fail===0;
}
