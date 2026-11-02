/**
 * The load budget and its preservation check (W1.4).
 *
 * Positive: the always-read set fits the byte ceiling, and the committed rule
 * baseline still resolves.
 *
 * Negative controls, both run and required to fire:
 *   - 3 KB appended to an always-read reference must be reported as over budget
 *   - a rule heading deleted from the tree must be reported as lost
 * A budget that does not fail when the file grows is not a budget.
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { checkBudget, verifyRulesPreserved, ruleBaseline, ALWAYS_READ, BUDGET_BYTES, CEILINGS, TOTAL_BUDGET_BYTES } from "../lib/skill-budget.mjs";

const chk = (name, cond, detail) => {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
  if (!cond) process.exitCode = 1;
};

function copyTree(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const a = path.join(src, e.name);
    const b = path.join(dst, e.name);
    if (e.isDirectory()) copyTree(a, b);
    else fs.copyFileSync(a, b);
  }
}

export async function run({ extDir }) {
  const skillDir = path.join(extDir, "skills", "aia-asf");
  const baselinePath = path.join(extDir, "test", "fixtures", "rule-baseline.json");

  console.log("=== 1. always-read set fits its ceilings ===");
  const r = checkBudget(skillDir);
  for (const [file, bytes] of Object.entries(r.sizes)) {
    const cap = CEILINGS[file] || BUDGET_BYTES;
    chk(`${file} within ${cap} bytes`, bytes <= cap, `${bytes} bytes`);
  }
  chk(`always-read total within ${r.totalBudget}`, r.total <= r.totalBudget, `${r.total} bytes`);
  chk("nothing reported over ceiling", r.over.length === 0, r.over.map((o) => `${o.file}: ${o.bytes}`).join("; "));
  console.log(`  INFO  always-read total: ${r.total} bytes across ${ALWAYS_READ.length} file(s)`);

  console.log("=== 2. the rule baseline still resolves (a split may not lose a rule) ===");
  chk("a committed rule baseline exists", fs.existsSync(baselinePath), baselinePath);
  if (fs.existsSync(baselinePath)) {
    const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
    const v = verifyRulesPreserved(skillDir, baseline);
    chk("no rule heading lost", v.problems.filter((p) => p.startsWith("Rule")).length === 0, v.problems.join("; "));
    chk("no P## marker lost", v.problems.filter((p) => p.startsWith("P")).length === 0, v.problems.join("; "));
    chk("every appendix pointer lands", v.problems.filter((p) => p.includes("points at")).length === 0, v.problems.join("; "));
    chk("baseline is not vacuous", baseline.rules.length >= 20 && baseline.markers.length >= 20, `${baseline.rules.length} rules, ${baseline.markers.length} markers`);
  }

  console.log("=== 3. negative control: growth must be reported ===");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "asf-budget-"));
  try {
    const grown = path.join(tmp, "grown");
    copyTree(skillDir, grown);
    const target = path.join(grown, "references", "06b-testing-qa.md");
    fs.appendFileSync(target, `\n\n${"padding ".repeat(512).repeat(6)}\n`); // ~18 KB of filler
    const g = checkBudget(grown);
    const flagged = g.over.find((o) => o.file === "references/06b-testing-qa.md");
    chk("appending 3 KB+ to an always-read reference is reported", !!flagged, flagged ? `${flagged.bytes} bytes` : "NOT REPORTED — the budget is decorative");

    console.log("=== 4. negative control: a lost rule must be reported ===");
    const lost = path.join(tmp, "lost");
    copyTree(skillDir, lost);
    const b = path.join(lost, "references", "06b-testing-qa.md");
    const text = fs.readFileSync(b, "utf8");
    const stripped = text.replace(/^## Rule 23 — .*$/m, "## Rule 23 — (heading removed by a careless split)");
    chk("the fixture actually removed the rule heading", stripped !== text);
    fs.writeFileSync(b, stripped);
    const baseline = fs.existsSync(baselinePath) ? JSON.parse(fs.readFileSync(baselinePath, "utf8")) : ruleBaseline(skillDir);
    const v2 = verifyRulesPreserved(lost, baseline);
    chk("a deleted rule heading is reported as lost", v2.problems.some((p) => p.includes("Rule 23")), v2.problems.slice(0, 2).join("; ") || "NOT REPORTED");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
