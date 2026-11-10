/**
 * The work observers: what a tool call told ASF about the session.
 *
 * These are observers, not gates — none of them may stop the call it watches. What
 * they record is what the gates later ask about, so a missed observation shows up
 * as a missing piece of evidence at settle, which is where evidence is checked.
 * Extracted from the tool_call handler for the same reason `observe-decisions.ts`
 * exists: the handler's job is to decide, and reading the session is a different job.
 */
import { deriveSuiteRun } from "../../gates/suite-runs.mjs";
import { noteTrackedCall, matchersFromConfig } from "../../gates/tracked.mjs";
import { projectName } from "../paths.ts";
import { appendEvidence, queueSteer } from "../evidence.ts";
import { runtime } from "../runtime.ts";
import { pendingSuiteRuns, pendingCleanRoom } from "../gate-state.ts";
import type { Input, Event } from "./observed.ts";

/**
 * The clean-room install is something ASF *does*, not something it asserts: the
 * release pipeline packs the tarball, installs it into a fresh prefix and loads the
 * installed extension. When the session runs that pipeline, the outcome is recorded
 * from the command and its exit code — so the definition-of-done line about the
 * shipped artifact has a producer, and a run that never ran the pipeline has no
 * clean-room evidence to point at.
 */
export function observeCleanRoom(input: Input, event: Event): void {
  const command = typeof input.command === "string" ? input.command : "";
  if (!/verify-published\.mjs|npm\s+run\s+release/.test(command)) return;
  const pkg = projectName();
  pendingCleanRoom.set(String(event.toolCallId || Date.now()), { package: pkg, command });
}

export function observeSuiteAttempt(input: Input, event: Event): void {
  const command = typeof input.command === "string" ? input.command : undefined;
  if (!command) return;
  const started = Date.now();
  const derived = deriveSuiteRun(command);
  if (derived) {
    // Exit code and duration are filled in by tool_result; recording the attempt
    // here keeps the ledger chronological.
    (derived as Record<string, unknown>)._startedAt = started;
    pendingSuiteRuns.set(String(event.toolCallId || started), derived);
  }
  if (!/\basf-approve\b/.test(command)) return;
  // A bypass is recorded as friction, never as evidence the gate is wrong:
  // otherwise the exploit is to bypass a gate until it demotes.
  appendEvidence({
    kind: "gate-block",
    gate: "asf-approve",
    rule: "bypass-requested",
    reason: "asf-approve invoked — recorded as friction; a bypass request is not evidence that a gate is wrong",
    bypassed: true,
  });
}

/** A write to a web surface means browser verification is owed. */
export function observeWebTouch(input: Input): void {
  const touched = typeof input.path === "string" ? input.path : typeof input.file_path === "string" ? input.file_path : "";
  if (touched && /\.(tsx|jsx|html|vue|svelte|css)$/i.test(touched)) runtime.webTouched = true;
}

/**
 * What the session did with a browser, observed rather than reported. The browser
 * verification tool checks this list before it will record anything: a gate that
 * accepts "I checked it" is a gate that measures nothing.
 */
export function observeBrowserCall(toolName: string): void {
  if (!toolName.startsWith("browser_")) return;
  runtime.browserCalls.push({ tool: toolName, at: Date.now() });
  // A yes/no with receipts, not a log to mine.
  if (runtime.browserCalls.length > 200) runtime.browserCalls.splice(0, runtime.browserCalls.length - 200);
}

/**
 * A spec moving to met/not-met is an observed fact, not a claim: ASF sees the
 * call to the spec tool, so the delivery report can render real transitions without
 * anyone having to remember to record them. Only a transition with evidence counts —
 * the ledger's own validator says so, and a status change with nothing behind it is
 * the thing the completion floor exists to refuse.
 */
export function observeSpecTransition(toolName: string, input: Input): void {
  if (!/^(update_spec_status|update_spec\w*)$/.test(toolName)) return;
  const specId = typeof input.id === "string" ? input.id : typeof input.specId === "string" ? input.specId : "";
  const status = typeof input.status === "string" ? input.status : "";
  const evidence = typeof input.evidence === "string" ? input.evidence : "";
  if (!specId || !status) return;
  appendEvidence({ kind: "spec-transition", specId, status, evidence, by: "observed", at: new Date().toISOString() });
}

/**
 * What this call did to tracked work (a claimed ticket, an assigned issue).
 *
 * The gate needs to know that the session *owns* something, because the failure
 * it prevents is invisible in the source tree: an agent that ends its run with a
 * claimed item neither resolved nor parked has stopped, and written a paragraph
 * about it instead. Claim / resolve / park are read off the tool's name; a
 * narrated wait is read off the text the agent wrote for the reviewer.
 */
export function observeTrackedWork(toolName: string, input: Input, config: Record<string, unknown>): void {
  const kind = noteTrackedCall(runtime.tracked, { toolName, input, matchers: matchersFromConfig(config) });
  if (!kind) return;
  appendEvidence({ kind: "tracked", action: kind, tool: toolName, item: String(input.ticket_id || input.ticketId || input.id || "") || null });
  if (kind === "wait") {
    queueSteer(
      `ASF: you described tracked work as waiting — that is not a disposition ASF recognises, and the run cannot close on it. ` +
        `Park it where the reviewer sees it (parking is a marker, not a question, so "do not ask me" never forbids it), take the next ` +
        `action you control, or do the work that makes the wait end in one step and keep going.`,
    );
  }
}

