/**
 * agent_before_settle: no "done" without evidence.
 *
 * Registered here and not on `agent_settled` because pi documents the latter as
 * final and notification-only, while `agent_before_settle` is the final
 * actionable boundary. Nothing here awaits a resumed run: the loop guard
 * documents a production hang caused by exactly that.
 *
 * Every continuation MUST carry content. pi commits `entries` and only then
 * re-checks whether the context can run another provider request; at settle time
 * the context ends with the assistant's own message, so a bare
 * `{ continue: true }` is refused with "agent_before_settle requested
 * continuation without runnable model context". A custom_message projects to a
 * user-role message, which is what makes the next request runnable.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { decideSettlement } from "../../gates/settle.mjs";
import { projectName } from "../paths.ts";
import { loadState, saveState, sanitizeSteerFields, archiveRun } from "../state.ts";
import { loadProjectSpecs, validateTrace } from "../specs.ts";
import { appendEvidence } from "../evidence.ts";
import { ledger, suiteRuns, pendingSteers, deliveredSteers } from "../gate-state.ts";
import { steerLedgerFor, steerContinuationsAllowed, parkedAlready } from "../steer.ts";
import { currentScale, measureRootFor } from "../run.ts";
import { runtime } from "../runtime.ts";
import { decisionGaps, touchedGoverned, reopensNow } from "../../gates/decisions.mjs";
import { matchesAny } from "../../decisions/glob.mjs";
import { registerAt, relativeTo } from "../../decisions/consult.mjs";
import { readProjectConfig } from "../../gates/config.mjs";
import { routeAsk } from "../../gates/input-channel.mjs";
import { channelFor } from "../channel.ts";
import type { AsfState, ProjectStateFile } from "../types.ts";

type Entry = Record<string, unknown>;
type SettleResult = { entries: Entry[]; continue: true } | undefined;

/** Queued steers go out first, once each; they ride the settle boundary. */
function drainSteers(prior: Entry[]): Entry[] {
  const entries: Entry[] = [...prior];
  if (runtime.pendingCard) {
    entries.push({ type: "custom_message", customType: "asf-run-card", content: runtime.pendingCard.text, display: true, details: { reason: runtime.pendingCard.reason } });
    runtime.pendingCard = null;
  }
  while (pendingSteers.length) {
    const text = pendingSteers.shift() as string;
    const key = text.replace(/\s+/g, " ").trim();
    if (deliveredSteers.has(key)) continue;
    deliveredSteers.add(key);
    entries.push({ type: "custom_message", customType: "asf-steer", content: text, display: true });
  }
  return entries;
}

/** A7: specs met during THIS run need a complete trace. */
/**
 * Exported for test/test-trace-gate.mjs: this is the gate's whole input, and it
 * shipped untested — which is how it came to resolve testFile against the wrong root.
 */
export async function untracedMetSpecs(startedAt: string | undefined, root: string): Promise<string[]> {
  try {
    const runStart = Date.parse(startedAt || "") || 0;
    const specs = (await loadProjectSpecs()) || [];
    return specs
      .filter((sp) => sp.status === "met")
      .filter((sp) => {
        const at = Date.parse(String((sp as { verifiedAt?: string }).verifiedAt || ""));
        return Number.isFinite(at) && at >= runStart;
      })
      .filter((sp) => !validateTrace(sp, root).ok)
      .map((sp) => sp.id);
  } catch {
    /* spec memory unreadable: this item cannot be judged, the rest still is */
    return [];
  }
}

/**
 * A park is asked ONCE. An autonomous run has no PO waiting to answer, so
 * re-parking every settle would be the same endless loop in a different costume.
 */
interface SettleContext {
  project: string;
  file: ProjectStateFile;
  state: AsfState;
  entries: Entry[];
  /** The host, so a park can ask what tools exist instead of assuming them. */
  pi?: ExtensionAPI;
}

async function handlePark(ctx: SettleContext, parkRequest: { reason: string; question: string }): Promise<SettleResult> {
  const { project, file, state, entries, pi } = ctx;
  const park = parkRequest;
  const parkKey = `${state.runId || "run"}|${park.reason}`;
  const already = parkedAlready.has(parkKey);
  if (already) {
    appendEvidence({ kind: "park-suppressed", reason: park.reason });
  } else {
    parkedAlready.add(parkKey);
    const channel = channelFor(pi as unknown as Parameters<typeof channelFor>[0]);
    entries.push({
      type: "custom_message",
      customType: "asf-park",
      content: `ASF: this needs input ASF cannot supply — ${park.question}\n${routeAsk(park.question, channel)}`,
      display: true,
      details: { park, channel },
    });
  }
  state.parked = { reason: park.reason, question: park.question, at: new Date().toISOString() };
  await saveState(project, file);
  appendEvidence({ kind: "park", reason: park.reason, question: park.question });
  // Only continue while there is something NEW to say; a repeat park is
  // recorded and the run settles.
  return entries.some((e) => e.customType === "asf-park") ? { entries, continue: true } : undefined;
}

/** The steer counter is monotonic: the in-process memory is the authority. */
interface BlockRequest {
  steer?: number;
  fingerprint?: string;
  continuation?: string;
  missing: string[];
}

async function handleBlock(
  ctx: SettleContext & { mem: { count: number; seen: Set<string> } },
  decision: BlockRequest,
): Promise<SettleResult> {
  const { project, file, state, entries, mem } = ctx;
  mem.count += 1;
  if (decision.fingerprint) mem.seen.add(decision.fingerprint);
  state.steers = Math.max(typeof decision.steer === "number" ? decision.steer : 0, mem.count);
  state.seenSteers = [...new Set([...(state.seenSteers || []), ...(decision.fingerprint ? [decision.fingerprint] : [])])].slice(-50);
  state.updatedAt = new Date().toISOString();
  await saveState(project, file);
  entries.push({
    type: "custom_message",
    customType: "asf-completion-gate",
    content: decision.continuation || "",
    display: true,
    details: { missing: decision.missing, steer: decision.steer },
  });
  return { entries, continue: true };
}

/**
 * Close a run: archive it to history and clear `current`.
 *
 * The next piece of work then opens its own run and is judged on its own facts. A run
 * that is never closed accretes everything the session does — this project once carried
 * a single run opened three days earlier, with four releases and several unrelated
 * changes inside its `filesTouched`, so the gate was judging today's work against
 * Monday's evidence and nothing could settle.
 *
 * `by` records who closed it: the gate itself (`auto`) or the agent asking
 * (`asf_run_complete`), so a run that closed without the gate passing is visible.
 */
export async function closeRun(state: AsfState, file: ProjectStateFile, { project, by = "auto" }: { project: string; by?: string }): Promise<void> {
  const { duplicate } = archiveRun(file, state, { by });
  // A second close of the same run is recorded, not silently swallowed: it means two
  // sessions wrote one project's state, which is the condition the ledger is for.
  appendEvidence({ kind: "run-close", runId: state.runId, auto: by === "auto", by, duplicate });
  file.current = null;
  await saveState(project, file);
}

/** No run (or a passive one): deliver any pending card/steer, never judge. */
function noRunResult(project: string, entries: Entry[], priorCount: number): SettleResult {
  if (entries.length <= priorCount) return undefined;
  if (!steerContinuationsAllowed(steerLedgerFor(`${project}|no-run`))) return undefined;
  return { entries, continue: true };
}

/**
 * The decision floor's facts, read from the register at settle time.
 *
 * Returns null when the project switched the floor off. A register that cannot
 * be read must not stop the run from closing — the register's own checks report
 * that; the completion gate does not punish it.
 */
function decisionFacts(state: AsfState) {
  try {
    // The register follows the code (ADR-0005). Reading it at the session workspace
    // meant a session started in a parent repo judged every run against an empty
    // register while the tool wrote the real one under the project — a floor that
    // could never fire.
    const root = measureRootFor(state);
    const cfg = readProjectConfig(root);
    if (cfg["gate.decisions.at_settle"] === false) return [];
    const { records } = registerAt(root, cfg);
    const touched = relativeTo(root, state.filesTouched || []);
    const governedTouched = touchedGoverned(touched, records, matchesAny);
    const ids = [...new Set(governedTouched.map((g: { id: string }) => g.id))];
    return decisionGaps({
      sourceChanged: !!state.sourceMutated,
      governedTouched,
      cited: runtime.decisionsCited,
      recorded: runtime.decisionsRecorded,
      unreadGoverned: ids,
      read: runtime.decisionsRead,
      reopens: reopensNow(state.objective, records),
    });
  } catch (e) {
    return [];
  }
}

/**
 * Judge a run: the same decision the completion gate makes, in one place.
 *
 * Exported because the agent needs to ask the same question before it claims a run is
 * finished (`asf_run_complete`). Two implementations of "is this run done" drift, and
 * the drift shows up as a run the agent closed and the gate still thinks is open —
 * which is how a run from three days ago was still being carried into new work.
 */
export async function evaluateRun(project: string, state: AsfState) {
  // Only a passing test that STARTED after the last source change validates it.
  const since = typeof state.lastMutationAt === "number" ? state.lastMutationAt : 0;
  const testRunRecorded = suiteRuns.some((r) => r.exitCode === 0 && (r.at ?? 0) >= since);
  // Traces are checked against the project the run is about (the code the specs
  // describe), not the directory pi happened to be started in.
  const untracedMet = await untracedMetSpecs(state.startedAt, measureRootFor(state));
  // The in-process ledger is the authority; the file is a record that may be
  // stale, raced or hand-edited. max() means a counter can never go down.
  const mem = steerLedgerFor(`${project}|${state.runId || "run"}`);
  sanitizeSteerFields(state);
  return decideSettlement(ledger, {
    untracedMet,
    scale: currentScale(state),
    webTouched: runtime.webTouched,
    continuationsSoFar: Math.max(state.steers || 0, mem.count),
    seenSteers: [...new Set([...(state.seenSteers || []), ...mem.seen])],
    sourceMutated: !!state.sourceMutated,
    testRunRecorded,
    tracked: runtime.tracked,
    decisionGaps: decisionFacts(state),
  });
}

async function judgeAndSettle(ctx: SettleContext, priorCount: number): Promise<SettleResult> {
  const { project, file, state, entries } = ctx;
  const mem = steerLedgerFor(`${project}|${state.runId || "run"}`);
  const decision = await evaluateRun(project, state);
  runtime.lastSettleDecision = decision;
  appendEvidence({ kind: "gate-verdict", gate: "completion", fired: decision.missing.length > 0, missing: decision.missing });

  if (decision.park) return await handlePark(ctx, decision.park as { reason: string; question: string });
  if (decision.block) return await handleBlock({ ...ctx, mem }, decision as BlockRequest);
  if (decision.missing.length === 0 && state.auto) await closeRun(state, file, { project });
  // A continuation for guidance alone is also bounded: an agent that keeps
  // producing new distinct steers must not be kept alive by its own advice.
  if (entries.length > priorCount && steerContinuationsAllowed(mem)) return { entries, continue: true };
  return undefined;
}

/**
 * An internal error is NOT a pass. Silently returning undefined let the run
 * settle with its evidence gaps unexamined — the gate simply vanished. The error
 * is recorded and surfaced once, deduped on the error CLASS: an I/O error's
 * message carries a random tmp filename, so keying on it would make every
 * occurrence look new and the gate would apologise forever.
 */
function gateErrorResult(e: unknown): SettleResult {
  const msg = `ASF: the completion gate hit an internal error and could not judge this run: ${(e && (e as Error).message) || String(e)}. Record it and continue; the gate did not pass, it failed to run.`;
  appendEvidence({ kind: "gate-error", error: String((e && (e as Error).message) || e).slice(0, 300) });
  const key = `gate-error|${(e && (e as { code?: string }).code) || (e && (e as Error).name) || "unknown"}`;
  if (deliveredSteers.has(key)) return undefined;
  deliveredSteers.add(key);
  return { entries: [{ type: "custom_message", customType: "asf-gate-error", content: msg, display: true }], continue: true };
}

export function registerSettleHandler(pi: ExtensionAPI): void {
  pi.on("agent_before_settle", async (event) => {
    try {
      if (!event || typeof event !== "object") return undefined;
      const ev = event as unknown as { entries?: Entry[] };
      const prior: Entry[] = Array.isArray(ev?.entries) ? [...ev.entries] : [];
      const priorCount = prior.length;
      const project = projectName();
      const file = await loadState(project);
      const state = file.current;
      const entries = drainSteers(prior);

      if (!state || state.phase === "none" || (state.passiveRunId && state.passiveRunId === state.runId)) {
        if (!state && !runtime.passiveHeartbeatWritten) {
          runtime.passiveHeartbeatWritten = true;
          appendEvidence({ kind: "passive", by: "no-run" });
        }
        return noRunResult(project, entries, priorCount) as never;
      }
      return (await judgeAndSettle({ project, file, state, entries, pi }, priorCount)) as never;
    } catch (e) {
      return gateErrorResult(e) as never;
    }
  });
}
