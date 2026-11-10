/**
 * tool_result: complete the evidence for an observed suite run.
 *
 * The exit code and duration are what make a suite run a fact rather than an
 * attempt, and they come from what the tool returned — not from what the agent
 * says it returned. Test counts are recorded only where a known runner's output
 * can actually be read; otherwise they stay 'unknown', never 0.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { deriveSuiteRun } from "../../gates/suite-runs.mjs";
import { appendEvidence, reportGateError } from "../evidence.ts";
import { pendingSuiteRuns, pendingCleanRoom, suiteRuns } from "../gate-state.ts";
import { runtime } from "../runtime.ts";

type ResultEvent = { toolCallId?: unknown; content?: unknown; isError?: boolean };

function outputOf(content: unknown): string {
  return typeof content === "string" ? content : JSON.stringify(content ?? "");
}

function completeSuiteRun(event: ResultEvent, pending: Record<string, unknown>): void {
  const startedAt = typeof pending._startedAt === "number" ? pending._startedAt : Date.now();
  const derived = deriveSuiteRun(String(pending.command || ""), {
    exitCode: event.isError ? 1 : 0,
    durationMs: Date.now() - startedAt,
    output: outputOf(event.content),
  });
  if (!derived) return;
  delete (derived as Record<string, unknown>)._startedAt;
  // P6: any real test run ends the blind stretch.
  runtime.blindMutations = 0;
  runtime.blindNudged = false;
  suiteRuns.push({
    at: startedAt,
    scope: derived.scope,
    exitCode: derived.exitCode,
    command: derived.command,
    durationMs: derived.durationMs,
    testCount: derived.testCount,
  });
  appendEvidence({ ...derived });
}

function completeCleanRoom(pending: { package: string; command: string }, isError?: boolean): void {
  appendEvidence({
    kind: "clean-room",
    package: pending.package,
    result: isError ? "fail" : "pass",
    command: pending.command,
    by: "observed",
    at: new Date().toISOString(),
  });
}

export function registerToolResultHandler(pi: ExtensionAPI): void {
  pi.on("tool_result", (event) => {
    try {
      const ev = event as ResultEvent;
      const id = String(ev.toolCallId || "");
      const cleanRoom = pendingCleanRoom.get(id);
      if (cleanRoom) {
        pendingCleanRoom.delete(id);
        completeCleanRoom(cleanRoom, ev.isError);
      }
      const pending = pendingSuiteRuns.get(id);
      if (!pending) return undefined;
      pendingSuiteRuns.delete(id);
      completeSuiteRun(ev, pending);
      return undefined;
    } catch (e) {
      // Swallowing this one silently is how the publish floor becomes an
      // unclosable gap: the run happened, the recorder failed, and the gate then
      // demands a run that can never register.
      reportGateError("suite recorder", e);
      return undefined;
    }
  });
}
