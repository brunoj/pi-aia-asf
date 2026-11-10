/**
 * Mutable session state.
 *
 * Every field here is written by a handler and read by a later one, so it lives
 * in a single object rather than as loose module-level `let`s: an imported
 * binding is read-only across modules, and a scattered global is what made the
 * 2026-11-07 loop possible in the first place (state nobody owned).
 */

import { createTracked, type TrackedState } from "../gates/tracked.mjs";

/** P5: machine turns before a re-anchor is due. */
export const REANCHOR_AFTER_MACHINE_TURNS = 25;
/** P5: and never more often than this, however many turns pass. */
export const REANCHOR_MIN_INTERVAL_MS = 30 * 60 * 1000;
/** P6: source mutations without a test before the blind-edit nudge. */
export const BLIND_EDIT_NUDGE_AFTER = 11;

export interface RuntimeState {
  /** Memoised dirty-tree answer, refreshed at most once per tool call. */
  dirtyCache: { at: number; dirty: boolean } | null;
  lastSettleDecision: { missing: string[] } | null;
  webTouched: boolean;
  impactStated: boolean;
  /** A card waiting to be delivered at the next actionable boundary. */
  pendingCard: { text: string; reason: string } | null;
  /** P5: machine-authored turns since the last human one, and the last re-anchor. */
  machineTurnsSinceHuman: number;
  lastReanchorAt: number;
  /** P6: source mutations since the last test run in this run. */
  blindMutations: number;
  blindNudged: boolean;
  /**
   * In-process mirror of the active run's `lastMutationAt`, kept so an exit
   * floor can ask "did a test run start after the last edit?" without a file
   * read on every tool call. Session-scoped on purpose, exactly like the suite
   * runs it is compared against: after a restart there are no recorded runs and
   * no mutations, so the two clocks can only disagree about the past.
   */
  lastMutationAt: number;
  passiveHeartbeatWritten: boolean;
  lastScaleWasSmall: boolean;
  /** Re-anchoring is count-limited per run. */
  reanchorsThisRun: number;
  /**
   * Tracked work opened this session (a claimed ticket, an assigned issue) and
   * whether it has a disposition. Session-scoped on purpose: a claim made before
   * a restart is re-opened by the agent's own progress text if it is still dangling.
   */
  tracked: TrackedState;
  /**
   * Decision ids this run has actually read through the tool. The read-before-edit
   * floor is about the decision being *in context* when the code is written — a
   * register nobody opened is a register nobody followed.
   */
  decisionsRead: string[];
  /** Decisions already steered on: one steer per decision per run, not per call. */
  decisionsSteered: string[];
  /** Accepted decisions the agent cited (in a plan, a message or a tool call). */
  decisionsCited: string[];
  /** Decisions this run wrote. Recording is engaging with the register too. */
  decisionsRecorded: string[];
  /**
   * Every `browser_*` call the session made, as ASF observed it. This is what
   * makes browser verification evidence rather than a claim: the tool checks the
   * session actually drove a browser before it will record that it was verified.
   * Bounded — it is a yes/no with receipts, not a log to mine.
   */
  browserCalls: Array<{ tool: string; at: number }>;
}

export const runtime: RuntimeState = {
  dirtyCache: null,
  lastSettleDecision: null,
  webTouched: false,
  impactStated: false,
  pendingCard: null,
  machineTurnsSinceHuman: 0,
  lastReanchorAt: 0,
  blindMutations: 0,
  blindNudged: false,
  lastMutationAt: 0,
  passiveHeartbeatWritten: false,
  lastScaleWasSmall: false,
  reanchorsThisRun: 0,
  tracked: createTracked(),
  decisionsRead: [],
  decisionsSteered: [],
  decisionsCited: [],
  decisionsRecorded: [],
  browserCalls: [],
};
