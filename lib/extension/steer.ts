/**
 * How much each run has been steered — held in this process, which is the
 * authority; state.json is only the record.
 */

import { appendEvidence } from "./evidence.ts";

export const steerMemory = new Map<string, { count: number; seen: Set<string>; guidance: number }>();
/** (runId|reason) already parked in this process — a park is asked once. */
export const parkedAlready = new Set<string>();

/**
 * Guidance-only continuations (card, steers) are capped per session. The
 * completion gate has its own bound; this one covers the paths that continue a
 * run merely to say something.
 */
export const MAX_GUIDANCE_CONTINUATIONS = 24;
/**
 * Per-RUN, not per-process: a long session runs many runs, and each deserves
 * its cards. A run kept alive purely by its own advice is the pathology.
 */
export function steerContinuationsAllowed(mem: { guidance: number }): boolean {
  if (mem.guidance >= MAX_GUIDANCE_CONTINUATIONS) {
    appendEvidence({ kind: "steer", gate: "guidance-cap", suppressed: true });
    return false;
  }
  mem.guidance++;
  return true;
}
export function steerLedgerFor(key: string): { count: number; seen: Set<string>; guidance: number } {
  let m = steerMemory.get(key);
  if (!m) {
    m = { count: 0, seen: new Set<string>(), guidance: 0 };
    if (steerMemory.size > 64) steerMemory.clear();
    steerMemory.set(key, m);
  }
  return m;
}

/** Coerce a loaded run state's steer fields — a hand-edited or raced file must not disable the bound. */
/**
 * Coerce the fields the gate reads into the types it assumes. A hand-edited or
 * older-version file must never be able to (a) throw inside the handler or
 * (b) make every later save fail — so this runs on load AND on both sides of a
 * merge, not only on the steer fields it was originally written for.
 */
