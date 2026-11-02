/**
 * Review guards (W1.1, W1.2, W1.3, W1.6, W2.4, W3.3).
 *
 * The behaviour is tested against fixtures, and each guard also has a control that
 * must fail: the guard for "a reviewer that read nothing" is only real if a report
 * citing an unread file is actually rejected.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  verifyCitations,
  reviewerStatus,
  normalizeFindings,
  abAllowed,
  REVIEW_DEFAULTS,
  LENSES,
} from "../lib/review.mjs";

const chk = (name, cond, detail) => {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
  if (!cond) process.exitCode = 1;
};

export async function run({ extDir }) {
  const base = path.join(extDir, "skills", "aia-asf");
  const skill = fs.readFileSync(path.join(base, "SKILL.md"), "utf8");
  const adv = fs.readFileSync(path.join(base, "references", "04-adversarial.md"), "utf8");
  const deleg = fs.readFileSync(path.join(base, "references", "06d-delegation.md"), "utf8");

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "asf-rev-"));
  fs.writeFileSync(path.join(tmp, "ledger.ts"), "export const A = 1;\nexport const B = 2;\n");

  console.log("=== 1. citations must resolve (W1.6) ===");
  const good = verifyCitations({
    findings: [{ severity: "Blocker", scope: "ledger.ts:1-2", finding: "x", recommendation: "y" }],
    repoRoot: tmp,
    fs,
  });
  chk("a report citing lines it could have read is accepted", good.status === "completed", good.status);

  // The observed fabrication: asked about nope.ts, the subagent answered about ledger.ts.
  const fabricated = verifyCitations({
    findings: [{ severity: "Blocker", scope: "does-not-exist.ts:1-2", finding: "RETRY_BUDGET is 7", recommendation: "y" }],
    repoRoot: tmp,
    fs,
  });
  chk("a report citing a file that is not there is rejected", fabricated.accepted.length === 0, fabricated.rejected[0]?.reason);
  chk("…and the report is recorded not run, never zero findings", fabricated.status === "not run", fabricated.status);

  const outOfRange = verifyCitations({
    findings: [{ severity: "Major", scope: "ledger.ts:40-90", finding: "x", recommendation: "y" }],
    repoRoot: tmp,
    fs,
  });
  chk("a range outside the file is rejected", outOfRange.accepted.length === 0, outOfRange.rejected[0]?.reason);

  const noCite = verifyCitations({ findings: [{ severity: "Nit", scope: "", finding: "x", recommendation: "y" }], repoRoot: tmp, fs });
  chk("a finding with no citation is rejected", noCite.accepted.length === 0, noCite.rejected[0]?.reason);

  console.log("=== 2. reviewer status honesty (W1.2) ===");
  const st = reviewerStatus({
    results: [
      { lens: "asf-design-critic", output: "findings…", citationCheck: { accepted: [{}], status: "completed" } },
      { lens: "asf-zoom-out", timedOut: true },
      { lens: "asf-structural", output: "   " },
      { lens: "asf-comprehension", output: "x", citationCheck: { accepted: [], status: "not run" } },
    ],
  });
  chk("one lens completed", st.completed === 1, `${st.completed} completed`);
  chk("timeout, empty output and unread citations are all 'not run'", st.notRun.length === 3, st.notRun.join(", "));
  chk("a not-run lens contributes zero findings to the count", st.rows.find((r) => r.lens === "asf-zoom-out").findings === 0);
  chk("the status table renders every lens", st.render().includes("asf-zoom-out") && st.render().includes("| Reviewer | Status |"));

  console.log("=== 3. findings schema and dedup (W1.3) ===");
  const n = normalizeFindings([
    { severity: "Nit", scope: "a.ts:1", finding: "wording", recommendation: "reword" },
    { severity: "Blocker", scope: "b.ts:2", finding: "cascade empties orders", recommendation: "add FK" },
    { severity: "Blocker", scope: "b.ts:2", finding: "Cascade empties ORDERS.", recommendation: "add FK" },
    { severity: "Major", scope: "c.ts:3" },
    { severity: "Critical", scope: "d.ts:1", finding: "x", recommendation: "y" },
  ]);
  chk("duplicates across lenses are merged", n.findings.length === 2, `${n.findings.length} kept`);
  chk("Blockers sort first", n.findings[0].severity === "Blocker");
  chk("a finding without severity/scope/recommendation is rejected", n.rejected.length === 2, n.rejected.map((r) => Object.keys(r).join("+")).join(" | "));
  chk("an unknown severity is rejected", n.rejected.some((r) => r.severity === "Critical"));

  console.log("=== 4. A/B at the blocker boundary only (W3.3) ===");
  chk("A/B allowed for a blocker re-review", abAllowed({ phase: "blocker-rereview", severities: ["Blocker"], config: REVIEW_DEFAULTS }).allowed);
  chk("A/B refused for a first pass", !abAllowed({ phase: "first-pass", severities: ["Blocker"], config: REVIEW_DEFAULTS }).allowed);
  chk("A/B refused when no blocker was found", !abAllowed({ phase: "blocker-rereview", severities: ["Nit"], config: REVIEW_DEFAULTS }).allowed);
  chk("budget defaults are generous but bounded", REVIEW_DEFAULTS.maxReviewers === 6 && REVIEW_DEFAULTS.maxReaudits === 2 && REVIEW_DEFAULTS.maxConcurrent === 3 && REVIEW_DEFAULTS.tokenCeilingMultiple === 6, JSON.stringify(REVIEW_DEFAULTS));
  chk("all six lenses have personas", LENSES.every((l) => fs.existsSync(path.join(base, "agents", `${l.replace("asf-", "")}.md`))), LENSES.length + " lenses");

  console.log("=== 5. the normative text says what the code enforces ===");
  chk("Phase 4 reviews with fresh contexts (W1.1)", /fresh|not in this conversation|no conversation history/.test(adv) && adv.includes("agents/"));
  chk("the artifact is the review surface (W1.5)", adv.includes("artifact is the review surface") && skill.includes("written to files and named by path"));
  chk("cite or abstain is stated (W1.6)", adv.includes("Cite or be `not run`") || adv.includes("cite or abstain"));
  chk("not run is never zero findings (W1.2)", adv.includes("never** as \"zero findings\"") || deleg.includes("never counted as a"));
  chk("critique first, no unearned agreement (W2.4)", adv.includes("Critique first") && adv.includes("never agree by default"));
  chk("severity vocabulary is fixed (W1.3)", adv.includes("Blocker | Major | Nit"));
  chk("the worker brief names the file partition (W2.3)", deleg.includes("File partition"));
  chk("the join runs the full suite after the rebase (W3.2)", deleg.includes("full**") && deleg.includes("rebase"));
  chk("a reviewer with no tool path is stopped, not faked", adv.includes("record the review as `not run`"));

  fs.rmSync(tmp, { recursive: true, force: true });
}
