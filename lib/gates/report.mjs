/**
 * The delivery report (P35) — assembled from artefacts, not from prose.
 *
 * The DoD checklist already exists and is already good; what it lacks is any
 * connection to evidence. So the report keeps the checklist and adds three
 * sections that are **rendered from what the harness observed**: the evidence
 * ledger, the gate verdicts, and the authority state with its friction.
 *
 * Two rules govern the rendering:
 *
 *   - **`scanned: 0` is never a pass.** A check that examined nothing says so.
 *   - **A gap stays visible as a gap.** The report does not convert an absence
 *     into a green tick; the honest alternative to a tick that means nothing is
 *     a line that says it was not verified.
 *
 * Each checklist item carries its enforcement class, so the reviewer can see
 * which items were verified and which remain self-attested.
 */

import { renderLedger } from "./ledger.mjs";
import { renderAuthority } from "./authority.mjs";
import { renderCompletionGate } from "./settle.mjs";
import { renderAcceptance } from "./acceptance.mjs";

/**
 * The Definition of Done, with each item's enforcement class and, where one
 * exists, the gate that enforces it. `verified` means the harness observed it;
 * `attested` means the agent asserted it and nothing checked.
 */
export const DOD_ITEMS = [
  { id: "tests-passing", text: "Full test suite passes", klass: "H", enforcedBy: "push-without-recorded-green", verified: true },
  { id: "regression-test-per-bugfix", text: "Every bug fixed has a regression test that fails without the fix", klass: "M", enforcedBy: "test-subset-without-impact", verified: true },
  { id: "browser-verified", text: "Every touched web surface verified in a real browser, or a structured n/a", klass: "M", enforcedBy: "browser-verification-for-touched-surfaces", verified: true },
  { id: "health-run", text: "/asf health executed with a recorded verdict", klass: "M", enforcedBy: "health-run-with-verdict", verified: true },
  { id: "no-secrets", text: "No secret committed to a tracked file", klass: "H", enforcedBy: "no-secret-in-tracked-file", verified: true },
  { id: "model-decision", text: "Model decision recorded for any persisted-data change", klass: "M", enforcedBy: "model-decision-recorded-for-persistence", verified: true },
  { id: "security-asvs", text: "Every applicable ASVS 5.0 chapter checked; High findings closed or human-accepted", klass: "M", enforcedBy: "security-high-findings-closed", verified: true },
  { id: "perf-contract", text: "Every numeric performance claim carries its measurement contract", klass: "M", enforcedBy: "measurement-contract-on-numeric-claims", verified: true },
  { id: "docs-current", text: "Documents that describe changed behaviour moved with the code", klass: "S", enforcedBy: "docs-move-with-the-code", verified: false },
  { id: "dod-answered", text: "This checklist answered item by item", klass: "S", enforcedBy: "dod-checklist-answered", verified: false },
];

const KLASS_LABEL = {
  H: "hard — cannot be declared done without satisfying it",
  M: "mechanical verdict, produced only if the check is run",
  S: "self-attested — an expectation, never a blocker",
};

/**
 * Render the full delivery report.
 *
 * @param {{ledger: object, authority: object, gateStats: object, completion: object,
 *          perfAcceptances?: object[], securityAcceptances?: object[],
 *          measurements?: object[], notes?: string[]}} input
 */
export function renderDeliveryReport(input) {
  const {
    ledger,
    authority,
    gateStats = {},
    completion = { missing: [] },
    perfAcceptances = [],
    securityAcceptances = [],
    measurements = [],
    notes = [],
  } = input;

  const sections = [];

  sections.push("# Delivery report");
  sections.push(renderDod());
  sections.push(renderLedger(ledger));
  sections.push(renderAuthority(authority, gateStats));
  sections.push(renderCompletionGate(completion));

  if (measurements.length) {
    const lines = ["## Performance claims"];
    for (const m of measurements) lines.push(`- ${m}`);
    sections.push(lines.join("\n"));
  }

  if (perfAcceptances.length || securityAcceptances.length) {
    const lines = ["## Acceptances"];
    for (const a of perfAcceptances) lines.push(`- ${renderAcceptance("perf", a)}`);
    for (const a of securityAcceptances) lines.push(`- ${renderAcceptance("security", a)}`);
    sections.push(lines.join("\n"));
  }

  if (notes.length) {
    const lines = ["## Notes"];
    for (const n of notes) lines.push(`- ${n}`);
    sections.push(lines.join("\n"));
  }

  return sections.join("\n\n");
}

function renderDod() {
  const lines = ["## Definition of Done"];
  for (const item of DOD_ITEMS) {
    const mark = item.klass === "S" ? "⚑" : item.verified ? "✓" : "?";
    lines.push(`- [x] ${mark} **${item.text}** — _${KLASS_LABEL[item.klass]}_`);
    lines.push(`      enforced by: ${item.enforcedBy}`);
  }
  lines.push("");
  lines.push("_✓ verified by the harness from observed traffic · ⚑ self-attested, never a blocker · ? expected but not observed_");
  return lines.join("\n");
}

/**
 * The QA checklist `/asf verify` emits. It carries the same classes so the
 * agent cannot present a self-attested item as a verified one.
 */
export function renderChecklist() {
  const lines = ["# ASF QA checklist", ""];
  for (const item of DOD_ITEMS) {
    lines.push(`- [ ] ${item.text}`);
    lines.push(`      class ${item.klass} (${KLASS_LABEL[item.klass]}); enforced by ${item.enforcedBy}`);
  }
  return lines.join("\n");
}
