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

/** An identical steer is never issued twice. */
export const MAX_IDENTICAL_STEERS = 1;
/**
 * Absolute ceiling on distinct steers per session. Beyond it the gaps are
 * reported and the run is allowed to settle — this is a reporting boundary, not
 * a stop: the work is never halted, only the asking.
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
export function decideSettlement(ledger, opts = {}) {
  const {
    scale = "standard",
    webTouched = false,
    continuationsSoFar = 0,
    seenSteers = [],
    sourceMutated = false,
    testRunRecorded = false,
    reportFields = [],
    untracedMet = [],
  } = opts;

  const facts = sessionFacts(ledger, { scale, webTouched });
  const missing = [...facts.missing];

  // The floor for an active run: source changed ⇒ a *test* run, not a check.
  // 50% of the runs ASF will own (61 of 121) contained no validation at all.
  if (sourceMutated && !testRunRecorded) {
    const hasOnlyChecks = (ledger.entries || []).some(
      (e) => e.kind === "suite-run" && CHECK_ONLY.test(String(e.command || "")),
    );
    missing.push(
      hasOnlyChecks
        ? "source changed but only a lint/typecheck ran — run the tests (a check does not close this)"
        : "source changed this run but no passing test run was recorded (run the tests that cover the change)",
    );
  }

  // A spec marked met during this run must say what it delivers and where.
  // Specs met in earlier runs are not re-litigated here.
  if (untracedMet.length) {
    missing.push(
      `spec(s) marked met this run without a trace (outcome + codePath): ${untracedMet.slice(0, 6).join(", ")}${untracedMet.length > 6 ? ` +${untracedMet.length - 6}` : ""} — add it with update_spec_status trace`,
    );
  }

  if (reportFields.length) {
    const recorded = ledger.latest("health-run");
    const seen = new Set(
      ledger.entries.filter((e) => e.kind === "spec-transition" || e.kind === "perf-scenario" || e.kind === "browser-verify" || e.kind === "browser-na").map((e) => e.kind),
    );
    if (!recorded) missing.push("the delivery report cannot be rendered: no health verdict was recorded this session");
    if (webTouched && !seen.has("browser-verify") && !seen.has("browser-na")) {
      missing.push("the delivery report is missing its browser section");
    }
  }

  if (missing.length === 0) return { block: false, missing: [], report: null, fingerprint: "", steer: continuationsSoFar };

  const fingerprint = steerFingerprint(missing);

  // The only legitimate park: something ASF cannot supply. Everything else is
  // the agent's to do, and it gets pushed back to work rather than escalated.
  const park = classifyPark(missing);
  if (park) {
    return {
      block: false,
      missing,
      park,
      fingerprint,
      steer: continuationsSoFar,
      report: `completion gate: parked for the PO — ${park.reason}: ${park.question}`,
    };
  }

  // Never issue the same steer twice. If the identical gap came back, the agent
  // either fixed it (it would not be missing) or the steer did not land; asking
  // again in the same words is the definition of a loop. Report and let settle.
  if (seenSteers.includes(fingerprint) && MAX_IDENTICAL_STEERS <= 1) {
    return {
      block: false,
      missing,
      exhausted: true,
      fingerprint,
      steer: continuationsSoFar,
      report:
        `completion gate: ${missing.length} evidence gap(s) remain and this exact gap was already raised — ` +
        `it is not asked twice. The delivery report must state these as unverified.`,
    };
  }

  // Reporting boundary, not a stop.
  if (continuationsSoFar >= MAX_STEERS) {
    return {
      block: false,
      missing,
      exhausted: true,
      fingerprint,
      steer: continuationsSoFar,
      report:
        `completion gate: ${missing.length} evidence gap(s) remain after ${MAX_STEERS} steers. ` +
        `Reported rather than re-requested — the delivery report must state these as unverified.`,
    };
  }

  return {
    block: true,
    missing,
    fingerprint,
    steer: continuationsSoFar + 1,
    continuation:
      `ASF completion gate: this run cannot be declared done yet. Missing:\n- ${missing.join(
        "\n- ",
      )}\n\nAddress exactly these and finish. Nothing here stops you — keep working. ` +
      `This gap has not been raised before, so it is raised once (steer ${continuationsSoFar + 1} of at most ${MAX_STEERS}); an identical one never comes back.`,
    report: null,
  };
}

/**
 * Render the completion-gate section for the delivery report. Gaps stay visible
 * as gaps — the honest alternative to a green tick that means nothing.
 */
export function renderCompletionGate(decision) {
  const lines = ["## Completion gate"];
  if (!decision || !decision.missing || !decision.missing.length) {
    lines.push("- all session facts recorded: health verdict, full-suite green run, browser verification or structured n/a, delivery-report sections");
    return lines.join("\n");
  }
  const why = decision.park ? ` (parked for the PO: ${decision.park.reason})` : decision.exhausted ? " (raised once, not re-requested — reported, not blocking)" : "";
  lines.push(`- ${decision.missing.length} evidence gap(s)${why}:`);
  for (const m of decision.missing) lines.push(`  - ${m}`);
  lines.push("- these are **not verified**; the delivery report must not present them as done");
  return lines.join("\n");
}
