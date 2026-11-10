/**
 * Where a genuine request for input goes — decided from context, not hard-coded.
 *
 * PO policy (2026-11-10): "Long loops should always keep running until resolution or
 * absolutely requiring user input. If working on a betamaxx ticket, user input is
 * requested by moving the ticket to input required, etc — so user input should be
 * context aware."
 *
 * ASF already refuses to stop for anything it can do itself (see `settle.mjs`). What
 * it did NOT do was say *how* to ask when asking is legitimate. Both park sites — the
 * completion gate and the third identical refusal — told the agent "ask the PO" in
 * general terms. In a ticket session that is the wrong instruction: a question typed
 * into the CLI blocks the session on a human who is not watching it, while the
 * ticket system has a queue built for exactly this. The rule is therefore:
 *
 *  - **work item claimed + a park tool is registered** → park THAT item with THAT tool,
 *    then keep going with whatever does not depend on the answer;
 *  - **no parkable channel** → ask in the conversation, once, and keep going with
 *    independent work while the answer is pending.
 *
 * The channel is derived from what the session actually has: the open items come
 * from the tracked-work observer (`tracked.mjs`), and the park tool from the tools
 * pi reports as registered. Nothing here names a vendor — a project on Linear or
 * Jira gets the same routing, with the same matcher it already widens via
 * `gate.tracked.park`.
 *
 * Pure: inputs in, decision out, so the rule is tested without pi or a session.
 */

import { matchersFromConfig } from "./tracked.mjs";

/** Names of the tools available, from whatever shape the host reports them in. */
function toolNames(tools) {
  return (Array.isArray(tools) ? tools : [])
    .map((t) => (typeof t === "string" ? t : String((t && t.name) || "")))
    .filter(Boolean);
}

/**
 * Prefer the tool that asks for INPUT over one that flags for REVIEW: both match the
 * park matcher, but "this is not a real issue" (`flag_review`) is a different message
 * from "I need an answer" (`request_input`), and routing a question through the
 * review flag would tell the PO the work is invalid when it is merely blocked.
 */
const INPUT_FIRST = /(request[_-]?input|needs?[_-]?input|park|escalate)/i;

/**
 * Tools that park an item for a verdict rather than for an ANSWER. `flag_review`
 * means "this is not a real issue" — routing a question through it would tell the PO
 * the work is invalid when it is merely blocked, so it is never the ask channel even
 * though it is a legitimate way to park tracked work.
 */
const NOT_ASK = /flag[_-]?review|not[_-]?a[_-]?real/i;

export function pickParkTool(names, matchers) {
  const parkers = names.filter((n) => matchers.park.test(n) && !NOT_ASK.test(n));
  return parkers.find((n) => INPUT_FIRST.test(n)) || parkers[0] || null;
}

/**
 * The open work items, most recent claim first — the one being worked on is the one
 * the question is about. `seen` is the record of arrival order, so it is the tiebreak
 * when two claims land in the same millisecond (sorting on `at` alone left the OLDEST
 * claim first, and the question then went to the wrong ticket). Synthetic ids
 * (`tool:<name>`, recorded when a claim carried no item id) are kept but ranked last:
 * they cannot be passed to a park tool.
 */
function openItems(tracked) {
  const open = (tracked && tracked.open) || {};
  const order = (tracked && Array.isArray(tracked.seen) ? tracked.seen : []).reduce((m, id, i) => (m[id] = i, m), {});
  const rank = (id) => (id in order ? order[id] : -1);
  return Object.keys(open)
    .sort((a, b) => {
      const synthetic = Number(a.startsWith("tool:")) - Number(b.startsWith("tool:"));
      if (synthetic) return synthetic;
      const byTime = ((open[b] && open[b].at) || 0) - ((open[a] && open[a].at) || 0);
      return byTime || rank(b) - rank(a);
    })
    .map((id) => id);
}

/**
 * Resolve the input channel for this session.
 *
 * @returns {{kind:'work-item', tool:string, item:string|null, others:string[]} |
 *           {kind:'conversation', reason:string}}
 */
export function resolveInputChannel({ tracked, tools = [], config = {} } = {}) {
  const matchers = matchersFromConfig(config);
  const items = openItems(tracked);
  if (!items.length) return { kind: "conversation", reason: "no work item is claimed in this session" };
  const tool = pickParkTool(toolNames(tools), matchers);
  if (!tool) {
    // A claimed item with no way to park it is still a conversation — but say why,
    // so a missing integration is visible instead of silently degrading.
    return { kind: "conversation", reason: `work item "${items[0]}" is claimed but no tool to park it is registered` };
  }
  const real = items.filter((id) => !id.startsWith("tool:"));
  return { kind: "work-item", tool, item: real[0] || null, others: real.slice(1) };
}

/**
 * The instruction that accompanies a legitimate park. Always ends on "keep going":
 * parking is a marker on the item, not a stop of the run.
 */
export function routeAsk(question, channel) {
  const q = String(question || "").trim();
  if (channel && channel.kind === "work-item") {
    const target = channel.item ? `work item "${channel.item}"` : "the claimed work item";
    return (
      `Route it through the work item, not the CLI: call \`${channel.tool}\` on ${target} with this question ` +
      `(context, the one question, and the options if it is a choice). That moves the item to the ` +
      `needs-input queue where the PO answers it; a question typed here blocks the session on someone ` +
      `who is not watching it. Then keep going with every part of the work that does not depend on ` +
      `the answer. Question: ${q}`
    );
  }
  const why = channel && channel.reason ? ` (${channel.reason})` : "";
  return (
    `Ask it in the conversation, once and plainly${why}: ${q} ` +
    `Then keep going with every part of the work that does not depend on the answer — the run is ` +
    `not stopped, only this one decision waits.`
  );
}
