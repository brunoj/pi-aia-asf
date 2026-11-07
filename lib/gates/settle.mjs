/**
 * The completion gate (P41) — no "done" without evidence, and **no stops**.
 *
 * What remains here after the guard took the verifiable obligations is what a
 * spec **cannot** express: a spec says what the deliverable must have, not what
 * actually happened in this session.
 *
 * **The stop policy (PO, 2026-11-05).** The loop runs unmolested. This gate never
 * halts a run and never asks a human anything except when the input is genuinely
 * unobtainable: plan approval, an irreversible action with no safe path, a
 * credential ASF cannot get, or a deliverable-shaping either/or that cannot be
 * inferred from the artifacts. Everything else is a steer.
 *
 * **What replaced the cap.** The old rule was `MAX_CONTINUATIONS = 2`, then the
 * gate declined to ask again. A fixed cap is the wrong instrument under "no
 * stops": two is far too few for an honest implement → test → fix → verify loop,
 * and any number is too many for a spin. The invariant that actually matters is
 * **an identical steer is never issued twice** — a spin is by definition repeated
 * identical work, so bounding *repetition* removes the pathology (1,400
 * unvalidated mutating calls and 843 minutes of loops in the traces) without ever
 * stopping work that is progressing.
 *
 * **No waiting inside the handler.** The guard documents a real production hang
 * where waiting inside a settle handler for the resumed run's own settle event
 * blocked the handler from ever returning. So this module decides; index.ts acts;
 * neither awaits a resumed run.
 */

import { sessionFacts } from "./ledger.mjs";

/**
 * A REPORTING number only — never a stop, and no longer referenced by any
 * decision. It is kept so tooling that prints "steer N" has a number to name;
 * there is no cap on warranted work, and a real gap is re-raised forever.
 */
export const MAX_STEERS = 12;

/**
 * The only four things that may park a run. Anything not matched here is the
 * agent's to solve, and it gets steered rather than escalated.
 */
const PARK_PATTERNS = [
  { re: /plan approval|gate 5|approve the plan/i, reason: "plan-approval", question: "Approve the plan so the run can proceed?" },
  { re: /credential|api key|secret|token|permission denied|unauthorised|unauthorized|access denied/i, reason: "unobtainable-credential", question: "ASF cannot obtain a credential or permission this run needs — can you supply it?" },
  { re: /irreversible|force-?push|drop (the )?(table|database|data)|delete (the )?(branch|release) with unmerged/i, reason: "irreversible-action", question: "The only remaining step is irreversible with no safe path — do you authorise it?" },
  { re: /cannot be inferred|either\/or|choose between|which (of the )?(two|options)/i, reason: "deliverable-shaping-choice", question: "A choice that changes the deliverable's shape cannot be inferred from the artifacts — which option?" },
];

/** A lint or a typecheck is not a test run; the floor must not be closable by one. */
const CHECK_ONLY = /\b(eslint|tsc|typecheck|lint|prettier|biome|check)\b/;

/**
 * Gaps an autonomous agent CANNOT close, because closing them means a human
 * typing something ASF has no tool for (a slash command, a click, a key).
 *
 * This is the 2026-11-07 loop: the gate demanded "/asf health", which is a pi
 * slash command. The agent has no tool that records a health verdict, so it
 * could never clear the gap, and every settle asked again — an autonomous loop
 * steered forever at a wall. A gap of that shape is a REPORTING item, never a
 * blocker: the delivery report says it is unverified, and the run settles.
 *
 * Anything the agent CAN do (run tests, run the asf_health tool, verify in the
 * browser, add a trace) stays a blocker. When you add a gate, it must have an
 * agent-side action; if it does not, it belongs here.
 */
const HUMAN_ONLY = /\/asf\s+\w+|type\s+\/|ask the (po|user|human)|needs? (your|the po's?) (input|approval|key)/i;

/** Can the agent close this gap itself? */
export function agentClosable(gap) {
  return !HUMAN_ONLY.test(String(gap || ""));
}

/**
 * Split gaps into what may BLOCK and what is only REPORTED. Every caller that
 * builds a missing list goes through this, so a gate cannot quietly start
 * blocking on something the agent has no hands for.
 */
export function splitGaps(gaps = []) {
  const blocking = [];
  const reported = [];
  for (const g of gaps) (agentClosable(g) ? blocking : reported).push(g);
  return { blocking, reported };
}

export function classifyPark(missing = []) {
  for (const m of missing) {
    for (const p of PARK_PATTERNS) {
      if (p.re.test(m)) return { reason: p.reason, question: p.question, item: m };
    }
  }
  return null;
}

/** Stable identity of a steer: the exact set of gaps it asks about. */
export function steerFingerprint(missing = []) {
  return [...missing].map((m) => String(m).replace(/\s+/g, " ").trim()).sort().join("|");
}

/**
 * Decide whether the session may settle.
 *
 * @param {object} ledger     the evidence ledger
 * @param {object} opts
 * @param {'small'|'standard'|'major'} [opts.scale]
 * @param {boolean} [opts.webTouched]
 * @param {number} [opts.continuationsSoFar]   steers issued so far (legacy name, kept)
 * @param {string[]} [opts.seenSteers]         fingerprints already issued
 * @param {boolean} [opts.sourceMutated]       this run changed source
 * @param {boolean} [opts.testRunRecorded]     a real test run was recorded
 * @param {string[]} [opts.reportFields]
 * @param {string[]} [opts.untracedMet]       ids of specs marked met IN THIS RUN without outcome+codePath
 */
/** The floor for an active run: source changed ⇒ a *test* run, not a check. */
function validationGap(ledger, { sourceMutated, testRunRecorded }) {
  if (!sourceMutated || testRunRecorded) return [];
  const hasOnlyChecks = (ledger.entries || []).some(
    (e) => e.kind === "suite-run" && CHECK_ONLY.test(String(e.command || "")),
  );
  return [
    hasOnlyChecks
      ? "source changed but only a lint/typecheck ran — run the tests (a check does not close this)"
      : "source changed this run but no passing test run was recorded (run the tests that cover the change)",
  ];
}

/** A spec marked met during this run must say what it delivers and where. */
function traceGap(untracedMet) {
  if (!untracedMet.length) return [];
  const shown = untracedMet.slice(0, 6).join(", ");
  const more = untracedMet.length > 6 ? ` +${untracedMet.length - 6}` : "";
  return [`spec(s) marked met this run without a trace (outcome + codePath): ${shown}${more} — add it with update_spec_status trace`];
}

/** Can the delivery report be rendered from what was observed? */
function reportGaps(ledger, { reportFields, webTouched }) {
  if (!reportFields.length) return [];
  const gaps = [];
  if (!ledger.latest("health-run")) gaps.push("the delivery report cannot be rendered: no health verdict was recorded this session");
  const seen = new Set(
    ledger.entries
      .filter((e) => e.kind === "spec-transition" || e.kind === "perf-scenario" || e.kind === "browser-verify" || e.kind === "browser-na")
      .map((e) => e.kind),
  );
  if (webTouched && !seen.has("browser-verify") && !seen.has("browser-na")) {
    gaps.push("the delivery report is missing its browser section");
  }
  return gaps;
}

/**
 * A REAL gap is never a stop. The 2026-11-07 loop was unwarranted (it steered
 * over a pi slash command the agent has no tool for) — the cure is to remove
 * unclosable and repeated-no-reason steers, NOT to cap warranted work. So this
 * gate keeps asking for as long as the gap is real: it re-raises the same gap
 * with an escalating count instead of settling, and it never claims an upper
 * bound it does not have.
 */
function blockDecision({ missing, reported, fingerprint, continuationsSoFar, seenSteers }) {
  const attempt = continuationsSoFar + 1;
  const repeat = seenSteers.includes(fingerprint);
  const lead = repeat
    ? `ASF completion gate: still open after ${attempt - 1} previous steer(s). Missing:`
    : `ASF completion gate: this run cannot be declared done yet. Missing:`;
  return {
    block: true,
    missing,
    reported,
    fingerprint,
    steer: attempt,
    continuation:
      `${lead}\n- ${missing.join(
        "\n- ",
      )}\n\nAddress exactly these and finish. Nothing here stops you, and there is no ` +
      `ceiling on warranted work: this gap is re-raised until it is closed (steer ${attempt}). ` +
      `Only an action ASF cannot take is ever parked or dropped.`,
    report: null,
  };
}

/** Every gap this run still has — assembled in one place, split once. */
function collectGaps(ledger, opts) {
  const facts = sessionFacts(ledger, { scale: opts.scale, webTouched: opts.webTouched });
  // Splitting earlier was a bug: gaps pushed after the split skipped the
  // human-only filter and could block on something the agent has no hands for.
  return [
    ...facts.missing,
    ...validationGap(ledger, opts),
    ...traceGap(opts.untracedMet),
    ...reportGaps(ledger, opts),
  ];
}

export function decideSettlement(ledger, opts = {}) {
  const { webTouched = false, continuationsSoFar = 0, seenSteers = [] } = opts;
  const gaps = collectGaps(ledger, { scale: "standard", webTouched, untracedMet: [], reportFields: [], ...opts });

  const split = splitGaps(gaps);
  const missing = split.blocking;
  const reportedOnly = split.reported;

  if (missing.length === 0) {
    return {
      block: false,
      missing: [],
      reported: reportedOnly,
      report: reportedOnly.length
        ? `completion gate: ${reportedOnly.length} gap(s) need a human action ASF cannot take — reported as unverified, not blocking: ${reportedOnly.join("; ")}`
        : null,
      fingerprint: "",
      steer: continuationsSoFar,
    };
  }

  const fingerprint = steerFingerprint(missing);

  // The only legitimate park: something ASF cannot supply. Everything else is
  // the agent's to do, and it gets pushed back to work rather than escalated.
  const park = classifyPark(missing);
  if (park) {
    return {
      block: false,
      missing,
      reported: reportedOnly,
      park,
      fingerprint,
      steer: continuationsSoFar,
      report: `completion gate: parked for the PO — ${park.reason}: ${park.question}`,
    };
  }

  return blockDecision({ missing, reported: reportedOnly, fingerprint, continuationsSoFar, seenSteers });
}

/**
 * Render the completion-gate section for the delivery report. Gaps stay visible
 * as gaps — the honest alternative to a green tick that means nothing.
 */
export function renderCompletionGate(decision) {
  const lines = ["## Completion gate"];
  const reported = (decision && decision.reported) || [];
  if (!decision || !decision.missing || !decision.missing.length) {
    lines.push(reported.length
      ? `- ${reported.length} gap(s) need a human action ASF has no tool for — reported, not blocking:` + reported.map((g) => `\n  - ${g} (not verified)`).join("")
      : "- all session facts recorded: health verdict, full-suite green run, browser verification or structured n/a, delivery-report sections");
    return lines.join("\n");
  }
  const why = decision.park ? ` (parked for the PO: ${decision.park.reason})` : "";
  lines.push(`- ${decision.missing.length} evidence gap(s)${why}:`);
  for (const m of decision.missing) lines.push(`  - ${m}`);
  for (const r of reported) lines.push(`  - ${r} (needs a human action; reported, not blocking)`);
  lines.push("- these are **not verified**; the delivery report must not present them as done");
  return lines.join("\n");
}
