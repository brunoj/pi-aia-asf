/**
 * Gate authority and utility budget (P43 + P45).
 *
 * Gate authority today is a boolean someone sets by hand, and ASF already shows
 * both failure modes: a gate that cries wolf stays blocking until someone
 * disables the whole level (taking the real coverage with it), and a gate that
 * has never fired stays trusted forever because nothing measured it. Meanwhile
 * `gate.mode: warn` sits in the config surface as the escape hatch the guardrail
 * literature predicts.
 *
 * So authority is **earned and revocable**:
 *
 *   probation → active    requires a stated number of clean runs **plus at
 *                         least one caught case from a fixture**
 *   active    → demoted   automatic on exceeding the false-positive budget or
 *                         the blocks-per-run budget
 *   demoted   → active    requires the same proof again
 *
 * **Why the caught case is the whole design.** Promoting a gate after N quiet
 * runs is gameable in the worst way: a gate that never fires looks exactly like
 * a gate that works. Promotion therefore proves *power*, not quiet.
 *
 * **Autonomy.** Demotion is automatic and needs no human to notice it; the
 * human only sees the transition in the report. A gate that changes its own
 * power is exactly the kind of change that must be visible, never silent, so
 * every transition is an append-only record and the state is derived from it —
 * not hand-edited.
 */

export const STATES = ["probation", "active", "demoted"];

/** Runs a gate must be clean before promotion, and it must also have caught something. */
export const PROMOTION_RULE = {
  cleanRunsRequired: 5,
  caughtCasesRequired: 1,
};

/**
 * Append-only transition log with derived state.
 *
 * @param {object} store  { transitions: Array<{gate,from,to,at,reason,evidence}> }
 */
export function createAuthority(store = { transitions: [] }) {
  const log = store.transitions;

  function currentState(gate) {
    for (let i = log.length - 1; i >= 0; i--) {
      if (log[i].gate === gate) return log[i].to;
    }
    return "probation";
  }

  return {
    transitions: log,
    currentState,

    /**
     * Record a transition. Transitions without a reason are refused: an
     * unattributed change to a gate's power is the thing this exists to make
     * impossible.
     */
    transition(gate, to, reason, evidence = null) {
      if (!STATES.includes(to)) return { ok: false, error: `unknown state "${to}"` };
      if (!reason || !String(reason).trim()) {
        return { ok: false, error: `a gate changing its own power must state why (refused: no reason given for ${gate} → ${to})` };
      }
      const from = currentState(gate);
      if (from === to) return { ok: true, noChange: true };
      const t = { gate, from, to, at: new Date().toISOString(), reason: String(reason), evidence };
      log.push(t);
      return { ok: true, transition: t, report: `gate "${gate}": ${from} → ${to} — ${reason}` };
    },

    /**
     * Decide whether a gate may be promoted. Both halves are required.
     */
    eligibility(gate, { cleanRuns = 0, caughtCases = 0, falsePositives = 0, verdicts = 0 }) {
      const state = currentState(gate);
      const reasons = [];
      if (state === "active") return { promote: false, alreadyActive: true, reasons: [] };
      if (cleanRuns < PROMOTION_RULE.cleanRunsRequired) {
        reasons.push(`${cleanRuns}/${PROMOTION_RULE.cleanRunsRequired} clean runs`);
      }
      if (caughtCases < PROMOTION_RULE.caughtCasesRequired) {
        reasons.push(
          `${caughtCases}/${PROMOTION_RULE.caughtCasesRequired} caught fixture cases — a gate that never fires looks exactly like a gate that works, so promotion proves power, not quiet`,
        );
      }
      const fpRate = verdicts > 0 ? falsePositives / verdicts : 0;
      return { promote: reasons.length === 0, state, fpRate, reasons };
    },

    /**
     * Automatic demotion check (P45). Returns the report line when it fires, so
     * the caller can surface it and file the follow-up proposal.
     */
    checkBudget(gate, { falsePositives = 0, verdicts = 0, blocksThisRun = 0, budgets = {} }) {
      const fpBudget = budgets.falsePositiveBudget ?? 0.05;
      const blockBudget = budgets.blocksPerRunBudget ?? 3;
      const state = currentState(gate);
      if (state !== "active") return { demote: false, reasons: [] };

      const reasons = [];
      const fpRate = verdicts > 0 ? falsePositives / verdicts : 0;
      if (verdicts >= 10 && fpRate > fpBudget) {
        reasons.push(
          `false-positive rate ${(fpRate * 100).toFixed(1)}% exceeds the ${(fpBudget * 100).toFixed(0)}% budget (${falsePositives}/${verdicts} verdicts confirmed false)`,
        );
      }
      if (blocksThisRun > blockBudget) {
        reasons.push(`blocked ${blocksThisRun} times in one run (budget ${blockBudget}) — it is interrupting the loop rather than guarding it`);
      }
      if (reasons.length === 0) return { demote: false, reasons: [] };

      const r = this.transition(
        gate,
        "demoted",
        `automatic: ${reasons.join("; ")}. Which gate blocked correct work, and what changes so it does not again?`,
        { falsePositives, verdicts, blocksThisRun, fpBudget, blockBudget },
      );
      return { demote: true, reasons, report: r.report || null, error: r.error || null };
    },

    /**
     * Confirmed-false evidence. A bypass request is **not** evidence that a gate
     * is wrong — otherwise the exploit is to bypass a gate until it demotes.
     * Only a near-miss fixture the gate actually failed counts.
     */
    recordVerdict(gate, { fired, confirmedFalse = false, source = "run" }) {
      return { gate, fired, confirmedFalse, source, at: new Date().toISOString() };
    },
  };
}

/**
 * Render the authority + friction section for the delivery report: what the
 * enforcement layer decided, and what it charged.
 */
export function renderAuthority(authority, stats) {
  const lines = ["## Gate authority and friction"];
  const gates = Object.keys(stats);
  if (gates.length === 0) {
    lines.push("- (no gates produced verdicts this session — which is reported, not read as clean)");
  }
  for (const gate of gates) {
    const s = stats[gate];
    const state = authority.currentState(gate);
    lines.push(
      `- **${gate}** [${state}] — ${s.verdicts} verdicts, ${s.fired} fired, ${s.confirmedFalse} confirmed false, ${s.blocks} blocks this run`,
    );
  }
  const transitions = authority.transitions.slice(-8);
  if (transitions.length) {
    lines.push("- transitions:");
    for (const t of transitions) lines.push(`  - ${t.gate}: ${t.from} → ${t.to} — ${t.reason}`);
  }
  return lines.join("\n");
}
