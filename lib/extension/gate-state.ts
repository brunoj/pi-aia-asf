/**
 * Session gate state: the ledger, the authority, and the counters the handlers
 * mutate. One module so a handler can append evidence without importing the
 * extension entry point (which would be an import cycle).
 */

import { createLedger } from "../gates/ledger.mjs";
import { createAuthority } from "../gates/authority.mjs";

export const ledger = createLedger();
export const authority = createAuthority();

export interface GateStat {
  verdicts: number;
  fired: number;
  confirmedFalse: number;
  blocks: number;
}
export const gateStats: Record<string, GateStat> = {};

/** suite-run attempts awaiting their result, keyed by toolCallId. */
export const pendingSuiteRuns = new Map<string, Record<string, unknown>>();

/**
 * A release/clean-room command that has started and is waiting for its exit code.
 * Paired with `tool_result`, so the recorded result is what the command returned
 * rather than what anyone says it returned.
 */
export const pendingCleanRoom = new Map<string, { package: string; command: string }>();
/** Completed suite runs — the fact the push gate checks for. */
export const suiteRuns: Array<{ scope: string; exitCode: number; command: string; durationMs: number; testCount: number | string; at?: number }> = [];
/** Memoised dirty-tree answer, refreshed at most once per tool call. */
export let dirtyCache: { at: number; dirty: boolean } | null = null;

export let lastSettleDecision: { missing: string[] } | null = null;

export let webTouched = false;
export let impactStated = false;

// ─── P1/P4/P5/P6 runtime state ─────────────────────────────────────────────────

/** A card waiting to be delivered at the next actionable boundary. */
export let pendingCard: { text: string; reason: string } | null = null;
/** P5: machine-authored turns since the last human one, and the last re-anchor. */
export let machineTurnsSinceHuman = 0;
export let lastReanchorAt = 0;
export const REANCHOR_AFTER_MACHINE_TURNS = 25;
export const REANCHOR_MIN_INTERVAL_MS = 30 * 60 * 1000;
/** P6: source mutations since the last test run in this run. */
export let blindMutations = 0;
export let blindNudged = false;
export const BLIND_EDIT_NUDGE_AFTER = 11;
/** Steers ASF wants to deliver (blocker steers, ladder rule text, nudges). */
export const pendingSteers: string[] = [];
/** Never deliver the same steer text twice in a session. */
export const deliveredSteers = new Set<string>();

/**
 * P2: persisted evidence is deduplicated by content. The traces held 97,278
 * gate-verdict entries with 13 distinct contents — every session wrote the
 * byte-identical verdict at every settle. After the first write it carries no
 * information. Events (gate-block, suite-run, transitions) are never deduped:
 * they are what a trace study measures.
 */
/**
 * The lifecycle vocabulary: things that happened, recorded for the transcript and the
 * report, read by no gate. It has to be stated next to `ENTRY_KINDS` (the evidence a gate
 * judges) because the two were drifting apart — kinds emitted but absent from both came
 * back from the ledger as `unknown entry kind` and were written up as rejected evidence.
 * `test-evidence-kinds.mjs` asserts every kind ASF emits lands in exactly one of them.
 */
export const EVENT_KINDS = new Set([
  "gate-error", "run-restored", "gate-block", "suite-run", "spec-transition",
  "browser-verify", "browser-na", "health-run", "run-open", "run-close", "park",
  "steer", "passive",
  // Emitted since the list was written; each was being rejected by the ledger validator.
  "run-cleared", "state-migrated", "park-suppressed", "tracked",
  "decision-read", "decision-cite", "decision-record", "decision-supersede", "decision-unread",
]);
export const persistedVerdicts = new Set<string>();
export let passiveHeartbeatWritten = false;
/** Re-anchoring is time-rate-limited AND count-limited per run. */
export const MAX_REANCHORS_PER_RUN = 5;
export let reanchorsThisRun = 0;

/** Record one gate verdict. `scanned: 0` is examined-nothing, never a pass. */
export function recordVerdict(gate: string, v: { fired?: boolean; scanned?: number }): void {
  const s = (gateStats[gate] ||= { verdicts: 0, fired: 0, confirmedFalse: 0, blocks: 0 });
  s.verdicts++;
  if (v.fired) s.fired++;
  if (v.scanned === 0) s.confirmedFalse++;
}
