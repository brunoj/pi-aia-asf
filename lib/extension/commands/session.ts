/**
 * Session lifecycle commands: starting, scaling, approving and ending a run.
 */

import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { join } from "node:path";
import { existsSync } from "node:fs";
import type { AsfPhase, AsfScale, AsfState } from "../types.ts";
import { projectName, runRoot } from "../paths.ts";
import { loadState, saveState } from "../state.ts";
import { newRunId } from "../run.ts";
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
    state.history.push({
      workType: state.current.workType || "unknown",
      phase: state.current.phase,
      startedAt: state.current.startedAt || now,
      endedAt: now,
    });
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

  const planPath = join(runRoot(), "PLAN.md");
  if (!existsSync(planPath)) {
    return (
      `No PLAN.md found in ${runRoot()}.\n` +
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
