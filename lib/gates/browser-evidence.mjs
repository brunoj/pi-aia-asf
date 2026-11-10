/**
 * What counts as browser evidence, decided apart from anything that reads a
 * ledger or a tool result.
 *
 * The completion gate requires browser verification whenever a UI file is touched.
 * A gate like that needs an agent-side action (or the run is steered at a gap it
 * cannot close — the health loop, one layer down), and an action that accepts any
 * claim makes the gate decorative. So the two rules that decide whether evidence is
 * real live here, where they can be tested without a browser, a pi process, or a
 * session:
 *
 *  - a verification is only real if the session actually drove a browser, and names
 *    the page, the action and the assertion;
 *  - an n/a is only real if a reviewer could disagree with its reason.
 *
 * `calls` is passed in by the caller (the extension knows it from the tool calls it
 * observed), so this module stays pure and the check itself is the thing under test.
 */

/**
 * The calls that mean the session LOOKED at or CHANGED a page. `browser_diagnose`
 * and `browser_logs` are deliberately absent: they report on the daemon, not on the
 * interface a user sees, so they cannot verify a surface.
 */
export const OBSERVATION_TOOLS = [
  "browser_navigate", "browser_screenshot", "browser_dom", "browser_js",
  "browser_click", "browser_type", "browser_scroll", "browser_wait",
  "browser_console", "browser_tabs", "browser_back", "browser_forward", "browser_reload",
];

/** Did the session actually drive a browser? */
export function browserDriven(calls) {
  const tools = (Array.isArray(calls) ? calls : [])
    .map((c) => (typeof c === "string" ? c : String(c?.tool || "")));
  return tools.some((tool) => OBSERVATION_TOOLS.includes(tool));
}

function blank(v) {
  return typeof v !== "string" || !v.trim();
}

/**
 * Why this verification cannot be recorded, or null if it can. The three fields are
 * mandatory because that is the minimum a reviewer can go and repeat themselves;
 * "verified the page" is not repeatable and so proves nothing.
 */
export function verifyGap({ page, action, assertion } = {}, calls = []) {
  const missing = [["page", page], ["action", action], ["assertion", assertion]]
    .filter(([, v]) => blank(v))
    .map(([k]) => k);
  if (missing.length) {
    return `browser-verify needs ${missing.join(", ")} — name the page, what you did there, and what you asserted, so the reviewer can repeat it`;
  }
  if (!browserDriven(calls)) {
    return "no browser call was made this session, so there is nothing to verify with. Drive the page with pi-aia-browser (browser_navigate / browser_click / browser_screenshot …) and record again — ASF records what happened, it does not accept that it did.";
  }
  return null;
}

/**
 * A reason nobody could disagree with is not a reason. Short affirmatives and
 * placeholder nouns are refused so that an n/a stays auditable rather than becoming
 * the escape hatch around the gate.
 */
export function placeholderReason(reason) {
  if (typeof reason !== "string") return true;
  // Symbols and punctuation strip away; what is left is counted. An empty string has
  // zero words, so the word rule below already refuses "", "!!!" and "n/a" — an
  // explicit `if (!r)` here was removed because no mutation of it failed a test, and
  // a guard that cannot be failed is not a guard, it is decoration.
  const r = reason.toLowerCase().replace(/[^a-z0-9/ ]/g, "").trim();
  if (r.split(/\s+/).filter(Boolean).length < 3) return true;
  return /^(n ?a|none|nil|na|not applicable|no|nope|nothing|no ui|no browser)\b/.test(r);
}

/** Why this n/a cannot be recorded, or null if it can. */
export function naGap({ reason } = {}) {
  if (blank(reason)) return "browser-na needs a reason — say why no browser surface is involved";
  if (placeholderReason(reason)) {
    return `"${String(reason).trim()}" is not a reason a reviewer can check. Say what the change touches and why no interface is involved (e.g. "server-side retry policy only; no UI consumes this module")`;
  }
  return null;
}

/** The ledger entry for a verification, built in one place so gate and tool agree. */
export function verifyEntry({ page, action, assertion } = {}, by = "tool") {
  // `?? ""` and not `String(x)`: String(undefined) is the literal "undefined", which
  // would sail through a validator looking like a real page name.
  return {
    kind: "browser-verify",
    page: (page ?? "").trim(),
    action: (action ?? "").trim(),
    assertion: (assertion ?? "").trim(),
    by,
  };
}

/** The ledger entry for a structured n/a. */
export function naEntry({ reason } = {}, by = "tool") {
  return { kind: "browser-na", reason: (reason ?? "").trim(), by };
}
