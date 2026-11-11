/**
 * Evidence: what gets appended to the ledger, and what is persisted to the
 * session file. Deduplicated by content for verdicts, never for events.
 */

import { ledger, persistedVerdicts, EVENT_KINDS, pendingSteers, deliveredSteers } from "./gate-state.ts";
import { getPiRef } from "./pi-ref.ts";
import { ENTRY_KINDS } from "../gates/ledger.mjs";

export function verdictSignature(entry: Record<string, unknown>): string {
  const { ts, at, timestamp, ...rest } = entry as Record<string, unknown> & { ts?: unknown; at?: unknown; timestamp?: unknown };
  return JSON.stringify(rest, Object.keys(rest).sort());
}

/** Should this evidence entry be persisted to the session file? */
export function shouldPersist(entry: Record<string, unknown>, seen: Set<string>): boolean {
  const kind = String(entry.kind || "");
  if (EVENT_KINDS.has(kind)) return true;
  const sig = verdictSignature(entry);
  if (seen.has(sig)) return false;
  seen.add(sig);
  return true;
}

export function queueSteer(text: string) {
  const key = text.replace(/\s+/g, " ").trim();
  if (!key || deliveredSteers.has(key) || pendingSteers.includes(text)) return;
  pendingSteers.push(text);
}

/**
 * An internal gate error must never be able to look like a pass.
 *
 * Every ASF handler is fenced, because an observer must not break the work it
 * watches. Fencing *without* reporting is exactly how the 2026-11-07 loop became
 * possible: a gate demanded something, the code that would have shown why
 * swallowed its own error, and the agent was steered forever toward an action
 * that could not register. So a swallowed error is (a) recorded as evidence and
 * (b) told to the agent once, as a steer — guidance, never a stop.
 *
 * The settle gate has a stronger channel (it returns the entry inline, so the
 * agent sees it in the same turn); the tool handlers do not, so they use this.
 */
export function reportGateError(gate: string, e: unknown) {
  const message = String((e as Error | null)?.message || e || "unknown");
  appendEvidence({ kind: "gate-error", gate, error: message.slice(0, 300) });
  const cls = (e as { code?: string } | null)?.code || (e as Error | null)?.name || "unknown";
  queueSteer(
    `ASF: the ${gate} hit an internal error (${cls}: ${message.slice(0, 140)}) and did not run. ` +
      `That is not a pass — the check failed to execute. Re-issue the action; if it repeats, ` +
      `this is an ASF bug to report, not a rule to satisfy.`,
  );
}


/**
 * Record something the session did.
 *
 * There are TWO vocabularies here and conflating them was a bug: the ledger holds the
 * evidence a gate can judge (`ENTRY_KINDS` — a suite run, a health verdict), while the
 * lifecycle events (`EVENT_KINDS` — run opened, steered, parked) are transcript history
 * no gate reads. Sending a lifecycle event through the ledger validator made it come back
 * as `unknown entry kind "steer"` and get written to the transcript as
 * `asf-evidence-rejected` — a fake failure on every event, which is exactly the noise that
 * makes a real rejected entry impossible to see. So the kind decides the channel, and a
 * kind in NEITHER vocabulary is the genuine bug.
 */
export function appendEvidence(entry: Record<string, unknown>) {
  const kind = String((entry as { kind?: unknown }).kind || "");
  if (kind && !ENTRY_KINDS.includes(kind) && EVENT_KINDS.has(kind)) {
    try {
      (getPiRef() as unknown as { appendEntry?: (t: string, d?: unknown) => void } | null)?.appendEntry?.("asf-event", entry);
    } catch {
      /* history is not worth failing a turn over */
    }
    // The early return is the whole rule: without it the event falls through to the
    // ledger below and is rejected there, which is the behaviour this replaced.
    return { ok: true as const, entry, event: true };
  }
  const res = ledger.append(entry);
  if (res.ok) {
    if (!shouldPersist(res.entry as Record<string, unknown>, persistedVerdicts)) return res;
    try {
      // Durable and excluded from model context: evidence costs no prompt budget.
      (getPiRef() as unknown as { appendEntry?: (t: string, d?: unknown) => void } | null)?.appendEntry?.("asf-evidence", res.entry);
    } catch {
      /* the in-memory ledger is the source of truth for this session */
    }
  } else {
    try {
      (getPiRef() as unknown as { appendEntry?: (t: string, d?: unknown) => void } | null)?.appendEntry?.("asf-evidence-rejected", { problem: res.error });
    } catch {
      /* reported where possible */
    }
  }
  return res;
}

/** Is the working tree dirty? Fail-open: an unknown state must not block. */
