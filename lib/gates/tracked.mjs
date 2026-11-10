/**
 * "Waiting" is not a disposition.
 *
 * On 2026-11-09 an agent working a claimed ticket ended its run with this on the
 * card: *"Left In Progress at testing — deliberately not resolved, because the
 * user-visible outcome still isn't confirmed, and not parked, since you told me
 * not to ask you for anything."* Nothing was blocked, nothing was parked, the
 * run closed, and the work stopped. That is a stop wearing a status report.
 *
 * It was ASF's fault, not the agent's. The contract names four things that may
 * halt a run — plan approval, an irreversible action with no safe path, an
 * unobtainable credential, a deliverable-shaping either/or. "The other side has
 * not replied" is none of them, so the agent had no legal state to stand in and
 * improvised an illegal one. A contract that forbids stopping without naming
 * what to do instead does not produce persistence; it produces narratives.
 *
 * So the illegal state is named, and the legal answers are exactly three. They
 * are all actions, and the agent can take every one of them — which is what
 * makes this gap steerable rather than the 2026-11-07 kind that loops forever.
 *
 * What this is: a **tripwire over tool names and the agent's own prose**, not an
 * authority over ticket state. It cannot see a tracker's database, and its
 * vocabulary is a small illustrative set, widened per project through
 * `gate.tracked.*`. A tool named `grabWorkItem` is invisible to it until someone
 * says so. That is acceptable because the cost of a miss is a run that settles
 * early; the cost of a false alarm is one steer.
 */

/** The only three things an agent may do with work it cannot finish right now. */
export const DISPOSITIONS = [
  "park it where a reviewer sees it (the needs-input queue) — parking is a marker, not a question, so a 'do not ask me' instruction never forbids it",
  "take the next action you control, now, in this run",
  "if you are genuinely waiting on someone else, do the work that makes the wait end in one step — the test that will confirm the outcome, the draft, the verification you can run today — and then keep going",
];

/**
 * Tool names that open a tracked item. Matched on the tool name, never on shell
 * text: `bmx_claim`, `linear_claim`, `ticket_assign`. A bash command is not a
 * claim, because `git commit` is not one either.
 */
const CLAIM_RE = /(^|[_-])(claim|assign|take|acquire)([_-]|$)/i;
/** Tool names that close one. `submit_resolution`, `resolve_ticket`, `finish`… */
const RESOLVE_RE = /(^|[_-])(resolve|resolution|finish|complete|close|deliver)([_-]|$)/i;
/** Tool names that park one where a human sees it. */
// `flag_review` is a park: it puts the item in front of the PO for a verdict. It was
// missing, so an agent that flagged a ticket for review ("this claim is not a real
// issue") was still steered to park it — a false alarm on a disposition it had
// already taken, and the one steer that cannot be satisfied by doing more work.
const PARK_RE = /(^|[_-])(park|escalate|needs?[_-]?input|request[_-]?input|request[_-]?review|block[_-]?review|flag[_-]?review|hand[_-]?off)([_-]|$)/i;
/** Tool names whose text the agent writes for a human to read. */
const NARRATE_RE = /(^|[_-])(progress|status|update|comment|note|report)([_-]|$)/i;

/**
 * The confession. An agent narrating a wait has usually said it out loud, in the
 * very message meant for the reviewer. Deliberately narrow: it must describe
 * leaving work unfinished, not merely mention a test or a queue.
 */
const WAITING_ALTERNATIVES = [
  "(left|stays?|kept|remain(?:s|ing)?)\\s+(?:it\\s+)?(in\\s+progress|in\\s+the\\s+queue|unresolved|not\\s+resolved|open\\s+deliberately)",
  "deliberately\\s+not\\s+(resolved|closed|parked|finished)",
  "not\\s+parked",
  "waiting\\s+(for|on)\\s+(the|their|your|a\\s+reply|them)",
  "as\\s+soon\\s+as\\s+(they|he|she|it)\\s+repl(?:y|ies|ied)",
  "it\\s+flips\\s+(the\\s+moment|when|once)",
  "pend(?:ing|s)\\s+(their|the|his|her)\\s+repl(?:y|ies)",
  "until\\s+(they|he|she|it)\\s+(repl(?:y|ies|ied)|answers?|responds?)",
  "resume[sd]?\\s+(when|once|the\\s+moment)",
];
const WAITING_RE = new RegExp(WAITING_ALTERNATIVES.join("|"), "i");

/**
 * The matchers as one value, so a project can widen them.
 *
 * `gate.tracked.claim` / `.resolve` / `.park` / `.wait` in the project config each
 * add patterns to the built-in set (a string, or an array of strings). They widen,
 * never replace: a project that forgets `claim` would stop tracking its own claims,
 * and a gate that can be switched off by a typo in a config file is not a floor.
 */
export function matchersFromConfig(config = {}) {
  const extra = (key) => {
    const v = config[`gate.tracked.${key}`];
    const list = Array.isArray(v) ? v : typeof v === "string" ? [v] : [];
    return list.filter((x) => typeof x === "string" && x.trim()).map((x) => x.trim());
  };
  const build = (base, key) => {
    const add = extra(key);
    return add.length ? new RegExp(`${base.source}|${add.map(escapeRe).join("|")}`, "i") : base;
  };
  // The empty alternative is the trap here: `a|b|` matches the empty string, so a
  // dangling `|` turns "does this text confess a wait" into "yes, always" — a gate
  // that trips on everything is as useless as one that trips on nothing, and it is
  // far harder to notice. Every union below is guarded by `add.length`.
  const waitAdd = extra("wait");
  const waitSource = waitAdd.length
    ? `${WAITING_ALTERNATIVES.join("|")}|${waitAdd.map(escapeRe).join("|")}`
    : WAITING_ALTERNATIVES.join("|");
  return {
    claim: build(CLAIM_RE, "claim"),
    resolve: build(RESOLVE_RE, "resolve"),
    park: build(PARK_RE, "park"),
    wait: new RegExp(waitSource, "i"),
  };
}

function escapeRe(source) {
  return source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Identify the item a call is about, so one ticket is one entry. */
function itemId(input) {
  if (!input || typeof input !== "object") return null;
  for (const k of ["ticket_id", "ticketId", "id", "issue", "issue_id", "work_item_id"]) {
    const v = input[k];
    if (typeof v === "string" && v.trim()) return v.trim().slice(0, 60);
    if (typeof v === "number") return String(v);
  }
  return null;
}

function textOf(input) {
  if (!input || typeof input !== "object") return "";
  const parts = [];
  for (const k of ["text", "body", "comment", "message", "summary", "reason", "note", "status"]) {
    const v = input[k];
    if (typeof v === "string") parts.push(v);
  }
  return parts.join("\n").slice(0, 4000);
}

/** Fresh tracked-work state. `open` maps an item id to what opened it. */
export function createTracked() {
  return { open: {}, waits: [], seen: [] };
}

function openItem(tracked, id, toolName) {
  if (tracked.open[id]) return;
  tracked.open[id] = { at: Date.now(), by: toolName };
  tracked.seen.push(id);
}

function closeItem(tracked, id) {
  delete tracked.open[id];
}

/**
 * Record what a tool call did to tracked work.
 *
 * Returns a short label for the evidence trail (`claim` / `resolve` / `park` /
 * `wait` / null). Never throws on odd input: this is an observer on the hot path.
 */
export function noteTrackedCall(tracked, { toolName = "", input = {}, matchers } = {}) {
  const m = matchers || matchersFromConfig();
  if (!tracked || !toolName) return null;
  const id = itemId(input) || `tool:${toolName}`;
  if (m.park.test(toolName)) {
    closeItem(tracked, id);
    return "park";
  }
  if (m.resolve.test(toolName)) {
    closeItem(tracked, id);
    return "resolve";
  }
  if (m.claim.test(toolName)) {
    openItem(tracked, id, toolName);
    return "claim";
  }
  if (NARRATE_RE.test(toolName) && m.wait.test(textOf(input))) {
    // Narrating a wait does not make it legal; it makes it visible to the gate.
    openItem(tracked, id, toolName);
    if (!tracked.waits.includes(id)) tracked.waits.push(id);
    return "wait";
  }
  return null;
}

/**
 * Gaps for work left dangling at settle time.
 *
 * Wording matters: these gaps must survive `splitGaps`, so they never say "ask
 * the PO", "needs your input" or a slash command — a gap that reads like a human
 * action is routed to the report and stops blocking, which would make this guard
 * decorative. It names only moves the agent can make itself.
 */
export function danglingGaps(tracked) {
  const ids = Object.keys(tracked && tracked.open ? tracked.open : {});
  if (!ids.length) return [];
  const how = DISPOSITIONS.map((d, i) => `${i + 1}) ${d}`).join(" ");
  return ids.map((id) => {
    const waited = tracked.waits.includes(id);
    return (
      `tracked work "${id}" is still open and this run is ending with it neither resolved nor parked` +
      (waited ? " — and the agent has just narrated waiting for it, which is not a state ASF recognises" : "") +
      `. Nothing here stops you. Do one of: ${how}. A run does not close while tracked work dangles.`
    );
  });
}

/** True when nothing is dangling (used by tests and by the run card). */
export function trackedClear(tracked) {
  return Object.keys(tracked && tracked.open ? tracked.open : {}).length === 0;
}
