/**
 * Starting and silencing a run. Passive is per-RUN: a permanent switch would be
 * a bypass of "ASF at all times", so it does not exist.
 */

import { projectName } from "../paths.ts";
import { loadState, saveState } from "../state.ts";
import { appendEvidence } from "../evidence.ts";
import { newRunId } from "../run.ts";
import { dependencySummary } from "../deps.ts";
import { setPhase } from "./session.ts";
import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { runtime } from "../runtime.ts";

export async function cmdPassive(): Promise<string> {
  const project = projectName();
  const file = await loadState(project);
  if (!file.current || file.current.phase === "none") {
    return "No active ASF run — nothing to make passive. The next software work will open one.";
  }
  file.current.passiveRunId = file.current.runId || newRunId();
  file.current.runId = file.current.passiveRunId;
  file.current.updatedAt = new Date().toISOString();
  await saveState(project, file);
  appendEvidence({ kind: "passive", runId: file.current.runId, by: "command" });
  return "ASF: this run is passive — the irreversibility gates still hold, steers and the completion floor are off until the run ends. The next run is enforced again.";
}

export async function cmdAbort(ctx: ExtensionCommandContext): Promise<string> {
  return await setPhase(ctx, { phase: "none" });
}

export function helpText(): string {
  return (
    "ASF commands:\n" +
    "  /asf new        — start a new software project (large, gated)\n" +
    "  /asf feature    — add a feature to an existing project (large, gated)\n" +
    "  /asf bugfix     — major bugfix (large, gated)\n" +
    "  /asf refactor   — architectural refactor (large, gated)\n" +
    "  /asf small      — small change: the floor (a real test run, evidence) without plan/approval gates\n" +
    "  /asf passive    — silence steers for THIS run only (irreversibility gates still hold)\n" +
    "  /asf card       — show the active run card\n" +
    "  /asf status     — show current phase\n" +
    "  /asf health     — run the code health gate (function/module/architecture)\n" +
    "  /asf verify     — run the definition-of-done QA gate\n" +
    "  /asf rules [H|M|S|area] — list declared obligations and what enforces them\n" +
    "  /asf report [--checklist] — the delivery report, assembled from observed evidence\n" +
    "  /asf config [--get [k] | --set k=v | --unset k | --explain k | --check | --screen] — every ASF parameter, with its origin\n" +
    "  /asf gates      — gate verdicts, authority state and friction for this session\n" +
    "  /asf abort      — end the current session\n\n" +
    dependencySummary()
  );
}

/** `small` is a scale the next run inherits; recorded here, not in the switch. */
export function markSmallScale(): void {
  runtime.lastScaleWasSmall = true;
}
