/**
 * The decision floor at settle.
 *
 * "Decisions are consulted, not available" is only real if a run that changed
 * governed code and never engaged with the register cannot close. This is the
 * pure half of that check — the caller hands it facts (which governed files were
 * touched, what was cited, what was recorded), and it returns gaps.
 *
 * Every gap here is closable by one agent action, which is the rule the
 * 2026-11-07 loop taught: a gap the agent has no hands for is a bug, not a gate.
 */

/** Files this run touched that an accepted decision claims. */
export function touchedGoverned(filesTouched, records, matchesAny) {
  const accepted = (records || []).filter((r) => r.status === "accepted");
  const out = [];
  for (const f of filesTouched || []) {
    const hit = accepted.find((r) => matchesAny(String(f), r.applies_to || []));
    if (hit) out.push({ file: String(f), id: String(hit.id), decision: String(hit.decision || "") });
  }
  return out;
}

/**
 * A `reopens_when` that the objective itself satisfies is a decision that should
 * have been re-opened before this code was written. Substring matching is
 * deliberately crude here — it is a prompt to look, and the agent closes it by
 * superseding or by recording why it still holds.
 */
export function reopensNow(objective, records) {
  const text = String(objective || "").toLowerCase();
  if (text.length < 12) return [];
  return (records || [])
    .filter((r) => r.status === "accepted" && String(r.reopens_when || "").length >= 8)
    .filter((r) => {
      const needle = String(r.reopens_when).toLowerCase().trim();
      return text.includes(needle) || needle.includes(text);
    })
    .map((r) => ({ id: String(r.id), reopens_when: String(r.reopens_when) }));
}

/**
 * The gaps. `sourceChanged` gates the whole thing: a run that wrote no source
 * cannot have violated a decision about source.
 */
export function decisionGaps(facts) {
  if (!facts || !facts.sourceChanged) return [];
  const gaps = [];
  const engaged = (facts.cited || []).length > 0 || (facts.recorded || []).length > 0;
  const governed = facts.governedTouched || [];
  if (governed.length && !engaged) {
    const first = governed[0];
    gaps.push({
      gate: "decisions",
      gap: `this run changed code an accepted decision governs (${first.file} → ${first.id}) and never cited it or recorded a decision of its own`,
      remedy: `cite the decision you followed (name ${first.id} where you state the approach) — or, if you are deliberately going a different way, record that with asf_decisions action=record (or action=supersede ${first.id}) so the next agent inherits the real rule and not the stale one`,
    });
  }
  const unread = (facts.unreadGoverned || []).filter((id) => !(facts.read || []).includes(id));
  if (unread.length) {
    gaps.push({
      gate: "decisions",
      gap: `${unread.join(", ")} govern(s) files this run changed and ${unread.length === 1 ? "was" : "were"} never read this run`,
      remedy: `read ${unread[0]} with asf_decisions action=get id=${unread[0]}, then either follow it or record the decision that overrides it`,
    });
  }
  for (const r of facts.reopens || []) {
    gaps.push({
      gate: "decisions",
      gap: `${r.id} says it reopens when "${r.reopens_when}" — and this run's objective says exactly that`,
      remedy: `re-open it: asf_decisions action=supersede id=${r.id} with the new decision, or record why it still holds`,
    });
  }
  return gaps;
}
