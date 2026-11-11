/**
 * Session lifecycle commands: starting, scaling, approving and ending a run.
 */

import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { existsSync } from "node:fs";
import type { AsfPhase, AsfScale, AsfState } from "../types.ts";
import { projectName } from "../paths.ts";
import { readPath } from "../../home.mjs";
import { loadState, saveState, archiveRun } from "../state.ts";
import { measureRootFor, newRunId } from "../run.ts";
import { __resetRefusals } from "../../gates/refusals.mjs";

export interface PhaseChange {
  phase: AsfPhase;
  workType?: AsfState["workType"];
  scale?: AsfScale;
}

export async function setPhase(ctx: ExtensionCommandContext, change: PhaseChange): Promise<string> {
  const { phase, workType, scale } = change;
  const project = projectName();
  const state = await loadState(project);
  const now = new Date().toISOString();

  if (state.current && phase === "none") {
    // The same single writer the settle gate uses (ADR-0001). This command used to push
    // its own history entry, which is how "closeRun is the only history writer" became
    // false in the code and how one run could be archived twice with two different shapes.
    archiveRun(state, state.current, { by: "phase-none" });
    state.current = null;
  } else {
    if (!state.current) {
      state.current = {
        workType,
        phase: "classify",
        startedAt: now,
        updatedAt: now,
        runId: newRunId(),
        auto: false,
        trigger: "command",
        steers: 0,
        seenSteers: [],
      };
      __resetRefusals();
    }
    if (workType) state.current.workType = workType;
    if (scale) state.current.scale = scale;
    state.current.phase = phase;
    state.current.updatedAt = now;
  }

  await saveState(project, state);
  return state.current ? `ASF phase → ${phase}${workType ? ` (${workType})` : ""}` : "ASF session ended.";
}

/**
 * Gate 5. Approving must approve something that exists: a plan the user never
 * saw cannot be approved, so a missing PLAN.md is a refusal, not a rubber stamp.
 */
export async function runApprove(): Promise<string> {
  const project = projectName();
  const state = await loadState(project);
  if (!state.current) return "No active ASF session — start one with /asf new|feature|bugfix|refactor.";

  // Home first, then the root: a task started under an older ASF keeps its plan
  // where it wrote it, and Gate 5 refuses on the same file it would approve.
  const planPath = readPath(measureRootFor(state.current), "plan");
  if (!existsSync(planPath)) {
    return (
      `No PLAN.md found in ${measureRootFor(state.current)} (looked for ${planPath}).\n` +
      "Gate 5 approves a written plan — write PLAN.md and present it to the user first."
    );
  }

  state.current.planApproved = true;
  state.current.phase = "implementation";
  state.current.updatedAt = new Date().toISOString();
  await saveState(project, state);
  return (
    "Plan approved ✓ — Gate 5 passed, implementation may begin.\n" +
    "Test-first, strict codebase isolation, regression test per bug fixed.\n" +
    "Run /asf verify before delivery."
  );
}
