/**
 * Delivery report suite (P35) — the report is assembled from artefacts.
 *
 * The DoD checklist already existed and was already good; what it lacked was any
 * connection to evidence. These checks pin the three things that make the
 * difference: the checklist carries each item's enforcement class, the evidence
 * and gate sections are rendered from what the harness observed, and a gap stays
 * visible as a gap instead of becoming a green tick.
 */
import { renderDeliveryReport, renderChecklist, DOD_ITEMS } from "../lib/gates/report.mjs";
import { createLedger } from "../lib/gates/ledger.mjs";
import { createAuthority } from "../lib/gates/authority.mjs";
import { validateSecurityAcceptance, securityGate } from "../lib/gates/acceptance.mjs";

const results = [];
const check = (name, cond, detail = "") => {
  results.push({ name, cond });
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};
const section = (s) => console.log(`\n=== ${s} ===`);

section("the delivery report exists and carries its sections");

const ledger = createLedger();
ledger.append({ kind: "health-run", level: "standard", verdict: "pass", scanned: 41 });
ledger.append({ kind: "suite-run", command: "npm test", exitCode: 0, durationMs: 8400, testCount: 73, scope: "full" });
ledger.append({ kind: "browser-verify", page: "/settings", action: "click save", assertion: "success toast appears" });
ledger.append({ kind: "spec-transition", specId: "spc-1", status: "met", evidence: "npm test → 73 passing" });

const authority = createAuthority();
authority.transition("push-without-recorded-green", "active", "5 clean runs and 1 caught fixture case");

const report = renderDeliveryReport({
  ledger,
  authority,
  gateStats: { "push-without-recorded-green": { verdicts: 20, fired: 3, confirmedFalse: 0, blocks: 2 } },
  completion: { missing: [] },
});

check("it is a delivery report", /^# Delivery report/.test(report));
check("it carries the Definition of Done", /## Definition of Done/.test(report));
check("it carries the evidence ledger", /## Evidence ledger/.test(report));
check("it carries gate authority and friction", /## Gate authority and friction/.test(report));
check("it carries the completion gate", /## Completion gate/.test(report));
check("the suite run appears as observed, not asserted", /npm test.*exit 0.*73 tests/s.test(report));
check("the browser verification appears with its assertion", /success toast appears/.test(report));
check("the health verdict appears with its scanned count", /scanned 41/.test(report));
check("the gate transition is shown", /probation → active/.test(report));
check("the friction count is shown", /2 blocks this run/.test(report));

section("each DoD item carries its enforcement class");
check("every item declares a class", DOD_ITEMS.every((i) => ["H", "M", "S"].includes(i.klass)));
check("every item names what enforces it", DOD_ITEMS.every((i) => !!i.enforcedBy));
check("hard items are labelled as hard", /hard — cannot be declared done/.test(report));
check("self-attested items are labelled as never a blocker", /self-attested — an expectation, never a blocker/.test(report));
check("a self-attested item is not rendered as verified", !/✓ \*\*Documents that describe changed behaviour/.test(report));
check("a harness-verified item is rendered as verified", /✓ \*\*Full test suite passes/.test(report));
check("the legend explains the marks", /verified by the harness from observed traffic/.test(report));

section("gaps stay visible as gaps");
const emptyLedger = createLedger();
const gapReport = renderDeliveryReport({
  ledger: emptyLedger,
  authority: createAuthority(),
  gateStats: {},
  completion: { missing: ["the full test suite was not run this session"], exhausted: true },
});
check("an empty ledger says nothing was observed", /no evidence recorded this session/.test(gapReport));
check("a missing fact is named, not hidden", /full test suite was not run/.test(gapReport));
check("and is explicitly marked not verified", /not verified/.test(gapReport));
check("the completion gate reports rather than blocking forever", /continuation budget exhausted/.test(gapReport));

const zeroScan = createLedger();
zeroScan.entries.push({ kind: "health-run", level: "standard", verdict: "pass", scanned: 0 });
const zeroReport = renderDeliveryReport({ ledger: zeroScan, authority: createAuthority(), gateStats: {}, completion: { missing: [] } });
check("scanned: 0 is never rendered as a pass", /examined nothing, not a pass/.test(zeroReport), zeroReport.match(/health[^\n]*/)?.[0]);

section("acceptances in the report");
const now = new Date("2026-01-15T00:00:00Z");
const withAcceptance = renderDeliveryReport({
  ledger,
  authority: createAuthority(),
  gateStats: {},
  completion: { missing: [] },
  securityAcceptances: [
    { finding: "SEC-1", severity: "high", compensatingControl: "WAF rule", expiresAt: "2026-01-01T00:00:00Z", signedBy: "Bruno (PO)" },
    { finding: "SEC-2", severity: "high", compensatingControl: "rate limit", expiresAt: "2026-06-01T00:00:00Z", signedBy: "agent" },
  ],
});
check("an expired acceptance is shown as expired", /EXPIRED/.test(withAcceptance));
check("an agent-signed acceptance is shown as not valid", /NOT valid/.test(withAcceptance));

section("security gate (P36 DoD line)");
const sg = securityGate({
  findings: [
    { id: "SEC-1", severity: "high", title: "IDOR on /orders/:id" },
    { id: "SEC-2", severity: "medium", title: "missing rate limit" },
  ],
  acceptances: [],
  followUps: [],
});
check("an unaccepted High finding is open", sg.ok === false && sg.open.some((o) => o.includes("SEC-1")));
check("an unfollowed Medium finding is open", sg.open.some((o) => o.includes("SEC-2")));

const sgOk = securityGate({
  findings: [
    { id: "SEC-1", severity: "high", title: "IDOR on /orders/:id" },
    { id: "SEC-2", severity: "medium", title: "missing rate limit" },
  ],
  acceptances: [{ finding: "SEC-1", severity: "high", compensatingControl: "ownership check in middleware", expiresAt: "2099-01-01", signedBy: "Bruno (PO)" }],
  followUps: [{ finding: "SEC-2", ticket: "PROJ-42" }],
});
check("a signed acceptance closes the High finding", sgOk.ok === true, sgOk.open.join("; "));
check("a filed ticket closes the Medium", sgOk.open.length === 0);

const expiredGate = securityGate({
  findings: [{ id: "SEC-9", severity: "high", title: "ssrf" }],
  acceptances: [{ finding: "SEC-9", severity: "high", compensatingControl: "egress allowlist", expiresAt: "2020-01-01", signedBy: "Bruno (PO)" }],
  followUps: [],
});
check("an expired acceptance leaves the finding OPEN", expiredGate.ok === false && /EXPIRED/.test(expiredGate.open[0]), expiredGate.open.join("; "));

const agentSigned = validateSecurityAcceptance({ finding: "x", severity: "high", compensatingControl: "c", expiresAt: "2099-01-01", signedBy: "self" }, now);
check("an agent-signed security acceptance is invalid", agentSigned.ok === false, agentSigned.invalid.join("; "));

const mediumAccepted = securityGate({
  findings: [{ id: "SEC-3", severity: "medium", title: "verbose errors" }],
  acceptances: [{ finding: "SEC-3", severity: "medium", compensatingControl: "c", expiresAt: "2099-01-01", signedBy: "Bruno (PO)" }],
  followUps: [],
});
check("an acceptance alone does not close a Medium — it needs a ticket", mediumAccepted.ok === false, mediumAccepted.open.join("; "));

section("the emitted QA checklist");
const checklist = renderChecklist();
check("the checklist carries the model line", /Model decision recorded/.test(checklist));
check("every checklist item shows its class", (checklist.match(/class [HMS] /g) || []).length === DOD_ITEMS.length);
check("and names its enforcer", /enforced by /.test(checklist));

const failed = results.filter((r) => !r.cond);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.log("FAILED: " + failed.map((f) => f.name).join(" | "));
  process.exit(1);
}
