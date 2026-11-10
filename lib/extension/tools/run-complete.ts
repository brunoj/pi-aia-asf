/**
 * asf_run_complete — the agent's way to finish a run.
 *
 * A run used to close only when the completion gate happened to pass at settle time,
 * or when a human typed `/asf abort`. Neither is an action the agent can take, so a run
 * that had genuinely finished stayed open and swallowed the next piece of work: this
 * project carried one run opened three days earlier, holding four releases and several
 * unrelated changes in its `filesTouched`, and the gate judged today's work against
 * Monday's evidence. Nothing settled, and the loop never closed.
 *
 * It asks the SAME question the gate asks (`evaluateRun`), so the tool and the gate
 * cannot disagree about what "done" means. And it fails closed: an unfinished run is
 * refused with the gaps listed. A tool that closed runs on request would be an exit
 * around the completion gate, which is worse than the bug it fixes.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { projectName } from "../paths.ts";
import { loadState } from "../state.ts";
import { evaluateRun, closeRun } from "../handlers/settle.ts";

/** One details shape for every branch: branches that disagree about which fields
 *  exist make the host read `error` as required and reject the tool. */
function details() {
  return {
    action: "run-complete",
    ok: false,
    closed: false,
    error: "",
    runId: "",
    note: "",
    missing: [] as string[],
  };
}

async function completeRun(note: string) {
  const project = projectName();
  const file = await loadState(project);
  const state = file.current;
  if (!state || state.phase === "none") {
    return {
      text: "No active ASF run to complete — the next piece of work opens a fresh one.",
      res: { ...details(), error: "no-run" },
    };
  }

  const decision = await evaluateRun(project, state);
  const missing = decision.missing || [];
  if (missing.length > 0) {
    // Refusing is the whole point: this is the gate's own verdict, not a formality.
    return {
      text:
        `Run ${state.runId} is NOT complete — the definition of done still has ${missing.length} gap(s):\n` +
        missing.map((m: string) => `- ${m}`).join("\n") +
        `\n\nClose those and call it again. The run stays open and keeps its evidence.`,
      res: { ...details(), runId: state.runId || "", missing },
    };
  }

  const runId = state.runId || "run";
  await closeRun(state, file, { project, by: "asf_run_complete" });
  return {
    text:
      `Run ${runId} complete (${state.phase}${state.scale ? `, ${state.scale}` : ""})` +
      `${note ? ` — ${note}` : ""}. It is archived to history and the next piece of work ` +
      `opens a fresh run, judged on its own facts.`,
    res: { ...details(), ok: true, closed: true, runId, note },
  };
}

export function registerRunCompleteTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "asf_run_complete",
    label: "ASF Complete Run",
    description:
      "Finish the current ASF run so the NEXT piece of work is judged on its own facts. " +
      "Call it when the work this run was opened for is genuinely done — tests run, evidence " +
      "recorded, released if it was a release. It asks the same question the completion gate " +
      "asks, so it cannot be used to get around the gate: an unfinished run is refused with " +
      "the gaps listed, and the run stays open.",
    promptSnippet: "Mark the current run complete (only if its definition of done is met)",
    parameters: Type.Object({
      note: Type.Optional(
        Type.String({ description: "One line on what the run delivered; recorded with the closure." }),
      ),
    }),

    async execute(_toolCallId: string, params: { note?: unknown }) {
      const note = typeof params?.note === "string" ? params.note.trim() : "";
      const { text, res } = await completeRun(note);
      return { content: [{ type: "text" as const, text }], details: res };
    },
  });
}
