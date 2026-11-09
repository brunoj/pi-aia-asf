/** Type surface for the tracked-work gate (`tracked.mjs`). */

export interface TrackedItem {
  at: number;
  by: string;
}

export interface TrackedState {
  /** Open items by id. A key here is work with no disposition yet. */
  open: Record<string, TrackedItem>;
  /** Ids whose agent has narrated a wait instead of acting. */
  waits: string[];
  /** Every id ever opened, for the evidence trail. */
  seen: string[];
}

export declare const DISPOSITIONS: string[];

export interface TrackedMatchers {
  claim: RegExp;
  resolve: RegExp;
  park: RegExp;
  wait: RegExp;
}

/** Built-in matchers, widened (never replaced) by `gate.tracked.*` in the project config. */
export function matchersFromConfig(config?: Record<string, unknown>): TrackedMatchers;

export function createTracked(): TrackedState;

export function noteTrackedCall(
  tracked: TrackedState,
  call: { toolName?: string; input?: Record<string, unknown>; matchers?: TrackedMatchers },
): "claim" | "resolve" | "park" | "wait" | null;

export function danglingGaps(tracked: TrackedState | undefined): string[];

export function trackedClear(tracked: TrackedState | undefined): boolean;
