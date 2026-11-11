import fs from "node:fs"; import os from "node:os"; import path from "node:path";
import { execFileSync } from "node:child_process";

/**
 * Two pi sessions, one project key.
 *
 * The completion gate's whole promise is that a run is judged on its own facts and then
 * closed. Eleven code paths read-modify-write the project state file; the save queue
 * serializes writes but cannot help a caller that LOADED the state before another caller
 * SAVED it. This suite drives exactly that interleaving, because the observed failure was
 * not hypothetical: a run closed at 01:19, closed again at 01:21, and still open in
 * `current` afterwards — the next run was not judged separately.
 */
export async function run({ loadTs }) {
  let pass = 0, fail = 0;
  const chk = (n, c, d) => { console.log(`  ${c ? "PASS" : "FAIL"}  ${n}${d ? " — " + d : ""}`); c ? pass++ : fail++; };

  const st = await loadTs("lib/extension/state.ts");
  const { mergeMonotonic, archiveRun } = st;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "asf-2w-"));
  execFileSync("git", ["init", "-q"], { cwd: dir });
  const prev = process.cwd();

  const runX = { runId: "run-X", workType: "auto", phase: "implementation", startedAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:30:00.000Z", steers: 0, seenSteers: [], filesTouched: [path.join(dir, "a.ts")] };
  const closedX = { runId: "run-X", workType: "auto", phase: "implementation", startedAt: "2026-01-01T00:00:00.000Z", endedAt: "2026-01-01T01:00:00.000Z", by: "auto" };

  try {
    process.chdir(dir);
    const { __clearProjectCache } = await import("../lib/project.mjs"); __clearProjectCache();

    console.log("=== 1. a closed run stays closed ===");
    // Session A closes run X.
    const aFile = { current: JSON.parse(JSON.stringify(runX)), history: [] };
    archiveRun(aFile, aFile.current, { by: "auto" });
    aFile.current = null;
    // Session B loaded run X BEFORE A closed it and now saves its stale copy.
    const bFile = { current: JSON.parse(JSON.stringify(runX)), history: [] };
    const merged = mergeMonotonic(JSON.parse(JSON.stringify(bFile)), JSON.parse(JSON.stringify(aFile)));
    chk("NEGATIVE: a stale writer cannot resurrect a run another session closed", merged.current === null, JSON.stringify(merged.current));
    chk("the closed run is in history exactly once", (merged.history || []).filter((h) => h.runId === "run-X").length === 1, JSON.stringify((merged.history || []).map((h) => [h.runId, h.endedAt])));

    console.log("=== 2. a run nobody closed is NOT collateral damage ===");
    const open = { current: JSON.parse(JSON.stringify(runX)), history: [] };
    const other = { current: JSON.parse(JSON.stringify(runX)), history: [] };
    const kept = mergeMonotonic(JSON.parse(JSON.stringify(other)), JSON.parse(JSON.stringify(open)));
    chk("an open run survives a merge untouched", kept.current?.runId === "run-X", JSON.stringify(kept.current?.runId));
    chk("nothing was tombstoned for a run that is still open", !(kept.closedRuns || []).includes("run-X"), JSON.stringify(kept.closedRuns));

    console.log("=== 3. the NEXT run is judged separately ===");
    const runY = { ...runX, runId: "run-Y", startedAt: "2026-01-02T00:00:00.000Z", filesTouched: [path.join(dir, "b.ts")] };
    const next = mergeMonotonic(
      { current: JSON.parse(JSON.stringify(runY)), history: [], closedRuns: ["run-X"] },
      { current: null, history: [JSON.parse(JSON.stringify(closedX))], closedRuns: ["run-X"] },
    );
    chk("a NEW run opens normally even though an earlier run is closed", next.current?.runId === "run-Y", JSON.stringify(next.current?.runId));
    chk("and it carries its own files only", (next.current?.filesTouched || []).length === 1 && next.current.filesTouched[0].endsWith("b.ts"), JSON.stringify(next.current?.filesTouched));

    console.log("=== 4. the tombstone list cannot grow without bound ===");
    let file = { current: null, history: [] };
    for (let i = 0; i < 60; i++) {
      const r = { runId: `run-${i}`, workType: "auto", phase: "implementation", startedAt: `2026-01-0${1 + (i % 8)}T00:00:0${i % 10}.000Z` };
      archiveRun(file, r, { by: "auto" });
    }
    chk("history is capped", (file.history || []).length <= 20, String((file.history || []).length));
    chk("the closed-run list is capped too", Array.isArray(file.closedRuns) && file.closedRuns.length <= 20, String((file.closedRuns || []).length));
    chk("the most recent close is still tombstoned", (file.closedRuns || []).includes("run-59"), JSON.stringify((file.closedRuns || []).slice(-3)));

    // The cap must hold on the MERGE path too, not only on the writer's own list: two
    // sessions each carrying a long tombstone list must not grow the file without bound.
    const many = (n, off) => Array.from({ length: n }, (_, i) => `r${off + i}`);
    const capped = mergeMonotonic(
      { current: null, history: [], closedRuns: many(60, 0) },
      { current: null, history: [], closedRuns: many(60, 100) },
    );
    chk("the tombstone list stays capped through a merge", (capped.closedRuns || []).length <= 20, String((capped.closedRuns || []).length));
    chk("the most recent closes are the ones kept", (capped.closedRuns || []).includes("r159") && !(capped.closedRuns || []).includes("r0"), JSON.stringify((capped.closedRuns || []).slice(0, 3)));

    console.log("=== 5. the real path: two sessions through loadState/saveState ===");
    const { projectName } = await loadTs("lib/extension/paths.ts");
    const { openAutoRun } = await loadTs("lib/extension/run.ts");
    const { closeRun } = await loadTs("lib/extension/handlers/settle.ts");
    const project = projectName();
    const f = path.join(dir, "src", "live.ts");
    await openAutoRun("two-writer", f);
    const live = await st.loadState(project);
    const openRunId = live.current?.runId;
    chk("a run is open", !!openRunId, String(openRunId));

    // Session B holds a copy loaded before the close.
    const staleCopy = JSON.parse(JSON.stringify(live));
    // Session A closes it through the only closer ASF has.
    await closeRun(live.current, live, { project, by: "asf_run_complete" });
    const afterClose = await st.loadState(project);
    chk("the close cleared current", afterClose.current === null, JSON.stringify(afterClose.current));
    chk("and recorded the close", (afterClose.closedRuns || []).includes(openRunId), JSON.stringify(afterClose.closedRuns));

    // Session B now saves its stale copy — the interleaving that resurrected the run live.
    await st.saveState(project, staleCopy);
    const afterStale = await st.loadState(project);
    chk("NEGATIVE: the stale save did not resurrect the closed run", afterStale.current === null, JSON.stringify(afterStale.current));
    chk("NEGATIVE: and it did not archive the run a second time", (afterStale.history || []).filter((h) => h.runId === openRunId).length === 1, JSON.stringify((afterStale.history || []).map((h) => [h.runId, h.endedAt])));

    // The next piece of work must still get a fresh, separately judged run.
    const f2 = path.join(dir, "src", "next.ts");
    const fresh = await openAutoRun("two-writer-next", f2);
    chk("the next work gets a NEW run", fresh.runId !== openRunId, `${fresh.runId} vs ${openRunId}`);
    chk("judged on its own files only", (fresh.filesTouched || []).length === 1 && fresh.filesTouched[0] === f2, JSON.stringify(fresh.filesTouched));
    const final = await st.loadState(project);
    chk("the closed run is still archived exactly once", (final.history || []).filter((h) => h.runId === openRunId).length === 1, JSON.stringify((final.history || []).map((h) => h.runId)));
  } finally {
    process.chdir(prev); fs.rmSync(dir, { recursive: true, force: true });
  }
  console.log(`\n${pass} passed, ${fail} failed`); return fail === 0;
}
