/**
 * The browser evidence, recorded from what the session actually did.
 *
 * A gate that asks for browser verification and offers no way to give it is the
 * health-loop defect one layer down: the agent is steered at a gap its own hands
 * cannot close. So there are two agent-callable tools, mirroring `asf_health`.
 *
 * But a tool that accepted "I verified it" would make the gate decorative, and a
 * decorative gate is worse than none: it reads as coverage. So neither tool takes
 * the agent's word for the part that can be checked. The rules that decide what
 * counts live in `lib/gates/browser-evidence.mjs` (pure, tested without a browser);
 * this file supplies the two things only the session knows — which browser calls
 * were made, and where to append the entry.
 */
import { verifyGap, naGap, verifyEntry, naEntry } from "../gates/browser-evidence.mjs";
import { appendEvidence } from "./evidence.ts";
import { runtime } from "./runtime.ts";

export type BrowserRecord = {
  ok: boolean;
  error?: string;
  scanned?: number;
  summary?: string;
  details?: Record<string, unknown>;
};

/** What the session has actually done with a browser, as ASF observed it. */
export function observedBrowserCalls(): Array<{ tool: string; at: number }> {
  return runtime.browserCalls || [];
}

function refuse(error: string, extra: Record<string, unknown> = {}): BrowserRecord {
  return { ok: false, error, details: { error, ...extra } };
}

/**
 * Record that a web surface was verified. Refused if the session never drove a
 * browser, or if any of page/action/assertion is missing.
 */
export function recordBrowserVerify(input: { page?: string; action?: string; assertion?: string }): BrowserRecord {
  const calls = observedBrowserCalls();
  const gap = verifyGap(input || {}, calls);
  if (gap) return refuse(gap, { observed: calls.map((c) => c.tool) });
  const res = appendEvidence({ ...verifyEntry(input || {}), at: new Date().toISOString() });
  if (!res.ok) return refuse(`the ledger refused the entry: ${res.error}`, { page: input?.page });
  return {
    ok: true,
    scanned: calls.length,
    summary: `browser verified: ${String(input?.page).trim()} → ${String(input?.action).trim()} → asserts "${String(input?.assertion).trim()}" (after ${calls.length} browser action(s) this session)`,
    details: { ...verifyEntry(input || {}), scanned: calls.length },
  };
}

/**
 * Record that no browser surface applies. The reason must be a sentence a reviewer
 * can push back on — that is the only thing that makes an n/a evidence instead of an
 * exit.
 */
export function recordBrowserNa(input: { reason?: string }): BrowserRecord {
  const gap = naGap(input || {});
  if (gap) return refuse(gap, { reason: input?.reason });
  const res = appendEvidence({ ...naEntry(input || {}), at: new Date().toISOString() });
  if (!res.ok) return refuse(`the ledger refused the entry: ${res.error}`, { reason: input?.reason });
  return {
    ok: true,
    scanned: observedBrowserCalls().length,
    summary: `browser n/a recorded: ${String(input?.reason).trim()}`,
    details: { ...naEntry(input || {}) },
  };
}
