/**
 * The active-run card (P1).
 *
 * The traces were unambiguous: in 18 days with ASF installed the agent read the
 * installed `SKILL.md` **0 times** and typed `/asf` **0 times**, so the rules
 * never entered context and only the passive gates ever ran. A 25 KB file nobody
 * is forced to read is a suggestion, not a process.
 *
 * The card is the fix: a small, bounded `custom_message` carrying the state the
 * agent cannot infer — phase, scale, what is still open, and the *one* next step
 * with its autonomous exit. It is injected at activation, at `session_start`, and
 * after `session_compact`, because compaction is exactly when the previous card
 * stopped existing.
 *
 * The byte ceiling is not politeness. This text enters the model's context on
 * every injection, so it has a budget the same way code has a test suite, and
 * `test/test-active-process.mjs` fails the build when it is exceeded; the
 * ceiling is registered as RUN_CARD_BYTES in lib/skill-budget.mjs.
 */

export const CARD_CEILING_BYTES = 1536;

const bytes = (s) => Buffer.byteLength(String(s || ""), "utf8");

function clip(s, n) {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  return t.length <= n ? t : `${t.slice(0, Math.max(0, n - 1))}…`;
}

/**
 * @param {object} o
 * @param {string} o.phase            the run's current phase
 * @param {string} o.scale            the JUDGED scale: small | standard | major
 * @param {string} [o.workType]
 * @param {string} [o.objective]      one line: what this run is for
 * @param {string[]} [o.openDod]      DoD lines still unticked
 * @param {string} [o.nextStep]       the single next action
 * @param {string} [o.remedy]         that step's `Autonomous exit:` text
 * @param {string[]} [o.filesTouched] recent paths this run changed (P4 anchor)
 * @param {string} [o.ticketId]       claimed Betamaxx ticket, when this is ticket work
 * @param {boolean} [o.auto]          opened automatically by the detector
 * @param {number} [o.steers]         how many times ASF has steered this run
 */
/** The card's fixed parts: header, body and the closing invariant lines. */
function cardParts(o) {
  const head = [
    `ASF run — ${o.phase || "unknown"} (${o.scale || "unset"}${o.auto ? ", auto" : ""})${o.workType ? ` · ${o.workType}` : ""}`,
  ];
  if (o.objective) head.push(`objective: ${clip(o.objective, 120)}`);
  if (o.ticketId) head.push(`ticket: ${o.ticketId}`);

  const body = [];
  if (o.nextStep) body.push(`next: ${clip(o.nextStep, 160)}`);
  if (o.remedy) body.push(`     ↳ ${clip(o.remedy, 200)}`);

  const dod = Array.isArray(o.openDod) ? o.openDod.filter(Boolean).slice(0, 6) : [];
  const dodLines = dod.length ? [`open (${dod.length}): ${dod.map((d) => clip(d, 60)).join("; ")}`] : [];

  const files = Array.isArray(o.filesTouched) ? o.filesTouched.filter(Boolean).slice(-8) : [];
  const fileLines = files.length ? [`this run has changed: ${files.join(", ")}`] : [];

  const tail = [
    "This run is ASF-governed: guidance and verification are active, and the run",
    "is steered until its loop closes. Nothing here stops you — the only halts",
    "are irreversible actions and input ASF genuinely cannot supply.",
  ];
  return { head, body, dodLines, fileLines, tail };
}

/** Assemble one candidate card: drop sections, then shorten the remedy. */
function assembleCard(parts, o, { withDod, withFiles, remedyLimit }) {
  const { head, body, dodLines, fileLines, tail } = parts;
  const lines = [...head];
  if (body.length) {
    const b = [...body];
    if (remedyLimit !== undefined && o.remedy) b[1] = `     ↳ ${clip(o.remedy, remedyLimit)}`;
    lines.push(...b);
  }
  if (withDod) lines.push(...dodLines);
  if (withFiles) lines.push(...fileLines);
  lines.push(...tail);
  return lines.join("\n");
}

export function renderRunCard(o = {}) {
  const parts = cardParts(o);
  // Priority order when the budget is tight: the DoD list goes first, then the
  // working-set anchor, then the remedy text is shortened. Phase, objective and
  // the next step are never dropped — a card without "what now" is decoration.
  let text = assembleCard(parts, o, { withDod: true, withFiles: true });
  if (bytes(text) > CARD_CEILING_BYTES) text = assembleCard(parts, o, { withDod: true, withFiles: false });
  if (bytes(text) > CARD_CEILING_BYTES) text = assembleCard(parts, o, { withDod: false, withFiles: false, remedyLimit: 120 });
  if (bytes(text) > CARD_CEILING_BYTES) text = assembleCard(parts, o, { withDod: false, withFiles: false, remedyLimit: 60 });

  // Last resort, and it must never be reached by design: keep the header and the
  // next step. The ceiling still holds, so the invariant is kept by truncation
  // rather than by exception.
  if (bytes(text) > CARD_CEILING_BYTES) {
    text = `${parts.head.join("\n")}\nnext: ${clip(o.nextStep || "advance the run", 160)}`;
  }

  return { text, bytes: bytes(text), over: bytes(text) > CARD_CEILING_BYTES };
}

/** One-line summary for `/asf status` and for evidence entries. */
export function cardSummary(o = {}) {
  const bits = [o.phase || "none", o.scale || "unset"];
  if (o.auto) bits.push("auto");
  if (o.steers) bits.push(`${o.steers} steer(s)`);
  return bits.join(" · ");
}
