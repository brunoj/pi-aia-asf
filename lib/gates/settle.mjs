/**
 * The completion gate (P41) — no "done" without evidence.
 *
 * What remains here after the guard took the verifiable obligations is what a
 * spec **cannot** express: a spec says what the deliverable must have, not what
 * actually happened in this session. Four session facts, and only the harness
 * knows them.
 *
 * **Autonomy.** This gate never asks a human anything — it pushes the agent back
 * to work, which is what an autonomous loop does with an incomplete run.
 *
 * **Loop safety.** Exactly one bounded continuation, with a hard cap. The guard's
 * own continuation discipline is reused rather than reinvented, because a gate
 * that nags is a gate that gets switched off.
 *
 * **No waiting inside the handler.** The guard documents a real production hang
 * where waiting inside a settle handler for the resumed run's own settle event
 * blocked the handler from ever returning. So this module decides; index.ts
 * acts; neither awaits a resumed run.
 */

import { sessionFacts } from "./ledger.mjs";

/** Hard cap on continuations per session. Beyond it the gate reports and stops. */
export const MAX_CONTINUATIONS = 2;

/**
 * Decide whether the session may settle.
 *
 * @param {object} ledger     the evidence ledger
 * @param {object} opts
 * @param {'small'|'standard'|'major'} opts.scale
 * @param {boolean} opts.webTouched
 * @param {number} opts.continuationsSoFar
 * @param {string[]} [opts.reportFields]  required delivery-report fields
 */
export function decideSettlement(ledger, { scale = "standard", webTouched = false, continuationsSoFar = 0, reportFields = [] } = {}) {
  const facts = sessionFacts(ledger, { scale, webTouched });
  const missing = [...facts.missing];

  if (reportFields.length) {
    const recorded = ledger.latest("health-run");
    // The delivery report's own fields are checked for presence, not quality:
    // presence is objective, quality is the reviewer's judgement.
    const seen = new Set(
      ledger.entries.filter((e) => e.kind === "spec-transition" || e.kind === "perf-scenario" || e.kind === "browser-verify" || e.kind === "browser-na").map((e) => e.kind),
    );
    if (!recorded) missing.push("the delivery report cannot be rendered: no health verdict was recorded this session");
    if (webTouched && !seen.has("browser-verify") && !seen.has("browser-na")) {
      missing.push("the delivery report is missing its browser section");
    }
  }

  if (missing.length === 0) {
    return { block: false, missing: [], report: null };
  }

  if (continuationsSoFar >= MAX_CONTINUATIONS) {
    // Bounded. Beyond the cap the gate reports the gap and lets the run finish:
    // an unbounded gate becomes a loop, and a loop is worse than a gap.
    return {
      block: false,
      missing,
      exhausted: true,
      report:
        `completion gate: ${missing.length} evidence gap(s) remain after ${MAX_CONTINUATIONS} continuations. ` +
        `Reported rather than blocking again — the delivery report must state these as unverified.`,
    };
  }

  return {
    block: true,
    missing,
    continuation:
      `ASF completion gate: this run cannot be declared done yet. Missing:\n- ${missing.join(
        "\n- ",
      )}\n\nAddress exactly these and finish. This is the ${continuationsSoFar + 1}${
        continuationsSoFar === 0 ? "st" : continuationsSoFar === 1 ? "nd" : "rd"
      } of at most ${MAX_CONTINUATIONS} continuations; after that the gaps are reported rather than re-requested.`,
    report: null,
  };
}

/**
 * Render the completion-gate section for the delivery report. Gaps stay visible
 * as gaps — the honest alternative to a green tick that means nothing.
 */
export function renderCompletionGate(decision) {
  const lines = ["## Completion gate"];
  if (!decision.missing.length) {
    lines.push("- all session facts recorded: health verdict, full-suite green run, browser verification or structured n/a, delivery-report sections");
    return lines.join("\n");
  }
  lines.push(`- ${decision.missing.length} evidence gap(s)${decision.exhausted ? " (continuation budget exhausted — reported, not blocking)" : ""}:`);
  for (const m of decision.missing) lines.push(`  - ${m}`);
  lines.push("- these are **not verified**; the delivery report must not present them as done");
  return lines.join("\n");
}
