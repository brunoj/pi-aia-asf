/**
 * Acceptance and escalation evidence (P32, P37, security DoD).
 *
 * Both ASF acceptances exist to stop the agent declaring its own work done, so
 * the validation is about **who signed it and what it was measured against**,
 * not about the prose.
 *
 * `asf-perf-accept` — a performance target was missed and the agent proposes to
 * ship anyway. It must carry: a measurement at a declared load, the scenario it
 * was measured against, the named structural alternative and its cost, and a
 * human signature. **An agent-authored acceptance is invalid** — the party that
 * missed the target is not the party that may waive it.
 *
 * `asf-security-accept` — a security finding is being accepted rather than
 * fixed. It must carry: the finding, a compensating control, an expiry, and a
 * human signature. An expired acceptance is an **open finding**, not a closed
 * one.
 *
 * Neither is ever auto-approved, and neither is ever a way to make a number
 * disappear.
 */

export const REQUIRED_PERF = ["measuredAtLoad", "scenario", "target", "measured", "alternative", "alternativeCost", "signedBy"];
export const REQUIRED_SECURITY = ["finding", "severity", "compensatingControl", "expiresAt", "signedBy"];

/** The agent may never be the signer — that is the whole point of the acceptance. */
const AGENT_SIGNERS = /^(agent|asf|pi|assistant|model|ai|self)$/i;

function isBlank(v) {
  return v == null || (typeof v === "string" && !v.trim()) || (Array.isArray(v) && v.length === 0);
}

/**
 * @param {object} acceptance
 * @param {Date} [now]  injectable for tests
 * @returns {{ok: boolean, invalid: string[], acceptance: object}}
 */
export function validatePerfAcceptance(acceptance, now = new Date()) {
  const invalid = [];
  if (!acceptance || typeof acceptance !== "object") return { ok: false, invalid: ["acceptance"], acceptance };

  for (const f of REQUIRED_PERF) if (isBlank(acceptance[f])) invalid.push(f);

  // A number without a load is not a measurement.
  if (!isBlank(acceptance.measured) && isBlank(acceptance.measuredAtLoad)) invalid.push("measuredAtLoad");
  if (!isBlank(acceptance.signedBy) && AGENT_SIGNERS.test(String(acceptance.signedBy).trim())) {
    invalid.push("signedBy (an agent-authored acceptance is invalid — the party that missed the target cannot waive it)");
  }
  return { ok: invalid.length === 0, invalid, acceptance };
}

export function validateSecurityAcceptance(acceptance, now = new Date()) {
  const invalid = [];
  if (!acceptance || typeof acceptance !== "object") return { ok: false, invalid: ["acceptance"], acceptance };

  for (const f of REQUIRED_SECURITY) if (isBlank(acceptance[f])) invalid.push(f);
  if (!isBlank(acceptance.signedBy) && AGENT_SIGNERS.test(String(acceptance.signedBy).trim())) {
    invalid.push("signedBy (an agent-authored acceptance is invalid)");
  }
  if (!isBlank(acceptance.severity) && !["critical", "high", "medium", "low"].includes(String(acceptance.severity).toLowerCase())) {
    invalid.push("severity (critical|high|medium|low)");
  }

  let expired = false;
  if (!isBlank(acceptance.expiresAt)) {
    const exp = new Date(acceptance.expiresAt);
    if (Number.isNaN(exp.getTime())) invalid.push("expiresAt (not a date)");
    else if (exp.getTime() < now.getTime()) expired = true;
  }
  return { ok: invalid.length === 0 && !expired, invalid, expired, acceptance };
}

/**
 * Decide whether the security DoD line is satisfiable.
 *
 * High findings must be closed or carry a valid, unexpired, human-signed
 * acceptance. Medium findings must be closed or have a filed follow-up ticket —
 * an acceptance is not enough at Medium, because an acceptance at Medium is how
 * a backlog of Mediums becomes invisible.
 */
export function securityGate({ findings = [], acceptances = [], followUps = [] } = {}) {
  const open = [];
  for (const f of findings) {
    const sev = String(f.severity || "").toLowerCase();
    if (sev === "high" || sev === "critical") {
      const acc = acceptances.find((a) => a.finding === f.id || a.finding === f.title);
      if (!acc) {
        open.push(`${f.id || f.title} (${sev}): no acceptance — must be fixed`);
        continue;
      }
      const v = validateSecurityAcceptance(acc);
      if (v.expired) open.push(`${f.id || f.title} (${sev}): acceptance EXPIRED — an expired acceptance is an open finding, not a closed one`);
      else if (!v.ok) open.push(`${f.id || f.title} (${sev}): acceptance invalid, missing ${v.invalid.join(", ")}`);
    } else if (sev === "medium") {
      const hasTicket = followUps.some((t) => t.finding === f.id || t.finding === f.title);
      if (!hasTicket) open.push(`${f.id || f.title} (medium): neither closed nor filed as a follow-up ticket`);
    }
  }
  return { ok: open.length === 0, open };
}

/** Render an acceptance for the delivery report, gaps shown as gaps. */
export function renderAcceptance(kind, acceptance) {
  const v = kind === "perf" ? validatePerfAcceptance(acceptance) : validateSecurityAcceptance(acceptance);
  if (v.ok) return `${kind === "perf" ? "asf-perf-accept" : "asf-security-accept"}: valid, signed by ${acceptance.signedBy}`;
  const bits = [];
  if (v.expired) bits.push("EXPIRED");
  if (v.invalid.length) bits.push(`missing/invalid: ${v.invalid.join(", ")}`);
  return `⚠ ${kind === "perf" ? "asf-perf-accept" : "asf-security-accept"} is NOT valid — ${bits.join("; ")}`;
}
