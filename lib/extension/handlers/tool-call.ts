/**
 * tool_call: observe, then block only what is objectively blockable.
 *
 * Two jobs, in this order. First **observe**: turn what the extension watched
 * happen into evidence, because "I ran the full suite" and "I did not run the
 * full suite" must not be two sentences with no observable difference. Then
 * **block**: only rules decidable from the tool input plus session state, each
 * with an autonomous exit the agent can take itself.
 *
 * No gate here asks a human anything. `block: true, reason` returns the reason
 * to the model, which is agent-facing feedback; nothing calls a UI prompt to
 * seek approval. A blocker whose only exit is a human decision is misdesigned
 * and belongs in the report, not in the path.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { classifyToolCall, activationDecision } from "../../activation.mjs";
import { evaluateBlockers, BLOCKERS, failSafeBlock } from "../../gates/blockers.mjs";
import { deriveSuiteRun } from "../../gates/suite-runs.mjs";
import { noteTrackedCall, matchersFromConfig } from "../../gates/tracked.mjs";
import { observeDecisions } from "./observe-decisions.ts";
import { readProjectConfig } from "../../gates/config.mjs";
import { projectName, runRoot } from "../paths.ts";
import { loadState, saveState } from "../state.ts";
import { openAutoRun, gitDirty, numberConfig } from "../run.ts";
import { appendEvidence, queueSteer, reportGateError } from "../evidence.ts";
import { gateStats, pendingSuiteRuns, suiteRuns, recordVerdict } from "../gate-state.ts";
import { authority } from "../gate-state.ts";
import { runtime, BLIND_EDIT_NUDGE_AFTER } from "../runtime.ts";

type Input = Record<string, unknown>;
type Event = { toolName?: unknown; input?: Input; toolCallId?: unknown };

/** P6: a long blind-editing stretch gets one steer, never a block. */
function nudgeBlindEdits(file: Awaited<ReturnType<typeof loadState>>, path: string | null): void {
  runtime.blindMutations++;
  if (runtime.blindMutations < BLIND_EDIT_NUDGE_AFTER || runtime.blindNudged) return;
  runtime.blindNudged = true;
  const recent = (file.current?.filesTouched || (path ? [path] : [])).slice(-4).join(", ");
  queueSteer(
    `ASF: ${runtime.blindMutations} source changes this run without a test run${recent ? ` (latest: ${recent})` : ""}. ` +
      `Run the tests that cover them now — a regression found here is cheaper than one found after the next ${BLIND_EDIT_NUDGE_AFTER}. ` +
      `This is guidance, not a stop.`,
  );
  appendEvidence({ kind: "steer", gate: "blind-edits", count: runtime.blindMutations });
}

/** A source mutation either opens a run or feeds the one already open (P1). */
async function observeActivation(toolName: string, input: Input): Promise<void> {
  const call = classifyToolCall(toolName, input);
  if (!call.mutates || !call.source) return;
  // The mutation clock the publish floor compares the suite runs against. Set for
  // EVERY source mutation, a passive run included: "no steering" is not "no floor"
  // — the irreversibility floor holds in passive mode, so it must not be able to
  // publish on a green that predates the edit.
  runtime.lastMutationAt = Date.now();
  const project = projectName();
  const file = await loadState(project);
  const decision = activationDecision({ call, activeRun: file.current, passiveRunId: file.current?.passiveRunId });
  if (decision.activate) {
    await openAutoRun(`${toolName}${call.via && call.via !== "tool" ? `:${call.via}` : ""}`, call.path);
  } else if (file.current && file.current.phase !== "none") {
    const cur = file.current;
    cur.sourceMutated = true;
    cur.lastMutationAt = Date.now();
    if (call.path) {
      const list = (cur.filesTouched || []).filter((p) => p !== call.path);
      list.push(call.path);
      cur.filesTouched = list.slice(-10);
    }
    cur.updatedAt = new Date().toISOString();
    await saveState(project, file);
  }
  if (decision.reason !== "passive") nudgeBlindEdits(file, call.path || null);
}

/** A suite run becomes evidence only because we saw the command, not the claim. */
function observeSuiteAttempt(input: Input, event: Event): void {
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
function observeWebTouch(input: Input): void {
  const touched = typeof input.path === "string" ? input.path : typeof input.file_path === "string" ? input.file_path : "";
  if (touched && /\.(tsx|jsx|html|vue|svelte|css)$/i.test(touched)) runtime.webTouched = true;
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
function observeTrackedWork(toolName: string, input: Input, config: Record<string, unknown>): void {
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

/** Gate switches the project turned off, as evaluateBlockers wants them. */
function blockerSwitches(config: Record<string, unknown>): Record<string, boolean> {
  const enabled: Record<string, boolean> = {};
  for (const b of BLOCKERS) {
    const k = b.switch.replace(/^gate\./, "");
    if (config[`gate.block.${k}`] === false || config[b.switch] === false) enabled[b.switch] = false;
  }
  return enabled;
}

function emitVerdicts(res: { verdicts?: Array<{ gate: string; fired?: boolean; scanned?: number }> }): void {
  for (const v of res.verdicts || []) {
    recordVerdict(v.gate, v);
    appendEvidence({ kind: "gate-verdict", gate: v.gate, fired: !!v.fired, scanned: typeof v.scanned === "number" ? v.scanned : 0 });
  }
}

/** Steer-mode gates never refuse: they queue guidance and let the call run. */
function emitSteers(res: { steers?: Array<{ gate: string; reason: string }> }): void {
  for (const s of res.steers || []) {
    appendEvidence({ kind: "steer", gate: s.gate, reason: String(s.reason || "").slice(0, 300) });
    queueSteer(`ASF (${s.gate}): ${s.reason}`);
  }
}

/** P3 third rung: park for the PO rather than refuse a fourth time. */
async function parkRun(park: { reason: string; question: string }): Promise<void> {
  appendEvidence({ kind: "park", reason: park.reason, question: park.question });
  try {
    const project = projectName();
    const file = await loadState(project);
    if (file.current) {
      file.current.parked = { reason: park.reason, question: park.question, at: new Date().toISOString() };
      await saveState(project, file);
    }
  } catch {
    /* the block below still holds */
  }
}

/** P45: a gate that blocks repeatedly in one run is interrupting, not guarding. */
function checkDemotion(pi: ExtensionAPI, gate: string, config: Record<string, unknown>): void {
  const s = (gateStats[gate] ||= { verdicts: 0, fired: 0, confirmedFalse: 0, blocks: 0 });
  s.blocks++;
  const budgets = {
    falsePositiveBudget: numberConfig(config, "gate.falsePositiveBudget", 0.05),
    blocksPerRunBudget: numberConfig(config, "gate.blocksPerRunBudget", 3),
  };
  const check = authority.checkBudget(gate, {
    blocksThisRun: s.blocks,
    verdicts: gateStats[gate]?.verdicts || 0,
    falsePositives: gateStats[gate]?.confirmedFalse || 0,
    budgets,
  });
  if (!check.demote || !check.report) return;
  try {
    (pi as unknown as { appendEntry?: (t: string, d?: unknown) => void }).appendEntry?.("asf-gate-transition", {
      gate,
      to: "demoted",
      reason: check.reasons.join("; "),
    });
  } catch {
    /* reported where possible */
  }
}

/** P3 second rung: the refusal carries the rule itself, not just the veto. */
function refusalReason(res: Record<string, unknown>, park: { question: string } | undefined): string {
  const ruleText = res.ruleText as string | null | undefined;
  const stage = res.refusalStage as number | undefined;
  const base = String(res.reason || "");
  if (ruleText) {
    return `${base}\n\nThis is the ${stage === 2 ? "second" : `${stage}th`} identical refusal — the rule, so it sticks: ${ruleText}`;
  }
  if (park) return `${base}\n\nParked for the PO: ${park.question} Continue with other work meanwhile; only this action waits.`;
  return base;
}

interface Refusal {
  pi: ExtensionAPI;
  res: Record<string, unknown> & { reason?: string; rule?: string };
  park: { reason: string; question: string } | undefined;
  config: Record<string, unknown>;
}

async function handleBlock({ pi, res, park, config }: Refusal): Promise<{ block: true; reason: string }> {
  const gate = res.rule || "unknown";
  appendEvidence({ kind: "gate-block", gate, rule: res.rule || gate, reason: String(res.reason || "").slice(0, 400) });
  checkDemotion(pi, gate, config);
  return { block: true, reason: refusalReason(res, park) };
}

/**
 * Everything the call is watched for. Each observer is fenced on purpose: an
 * observer that cannot run must not stop the work it is watching, and none of
 * them is a gate — a missed observation shows up as a missing piece of evidence
 * at settle, which is where evidence is checked.
 */
async function observeCall({ toolName, input, ev, config }: { toolName: string; input: Input; ev: Event; config: Record<string, unknown> }): Promise<void> {
  try {
    await observeActivation(toolName, input);
  } catch {
    /* activation is an observer: it never breaks the call it watches */
  }
  observeSuiteAttempt(input, ev);
  observeWebTouch(input);
  observeTrackedWork(toolName, input, config);
  try {
    observeDecisions(toolName, input, config);
  } catch {
    /* never blocks the work it watches */
  }
}

/** The blockers, with the session facts they are allowed to consult. */
function runBlockers(toolName: string, input: Input, config: Record<string, unknown>) {
  return evaluateBlockers(toolName, input, {
    ctx: {
      suiteRuns,
      dirty: () => gitDirty(),
      impactStated: runtime.impactStated,
      trackedPaths: undefined,
      // The publish floor is the settle floor: the LAST full run, green, and
      // started after the last source change — not "any green this session".
      lastMutationAt: runtime.lastMutationAt,
    },
    enabled: blockerSwitches(config),
  });
}

export function registerToolCallHandler(pi: ExtensionAPI): void {
  pi.on("tool_call", async (event) => {
    try {
      const ev = event as Event;
      const toolName = String(ev.toolName || "");
      const input = ev.input || {};
      // Read once, hand it to whoever needs it: the gate below and the tracked-work
      // matcher both ask, and a second read is a second answer to the same question.
      const config = readProjectConfig(runRoot());
      await observeCall({ toolName, input, ev, config });

      const res = runBlockers(toolName, input, config);
      emitVerdicts(res);
      emitSteers(res);

      const park = (res as { park?: { reason: string; question: string } }).park;
      if (park) await parkRun(park);
      if (!res.block) return undefined;
      return await handleBlock({ pi, res: res as Refusal["res"], park, config });
    } catch (e) {
      // An observer must never break the thing it observes — so this does not
      // stop the work. But it must not look like a clean pass either, and it must
      // not hand anyone a way past the irreversibility floor: an error raised
      // before the blockers ran is re-checked against the rules that guard
      // irreversible actions, from the raw tool input alone.
      reportGateError("tool_call gate", e);
      return failSafeBlock((event as { input?: Input } | null)?.input || {});
    }
  });
}
