/**
 * The load budget (W1.4 / D3).
 *
 * Everything ASF marks "(always)" is paid by every agent on every session, and
 * nothing used to bound it — the always-read set had grown to ~94 KB of prose.
 * A guideline nobody enforces is a wish, so this is a test with a byte ceiling and a
 * pointer: when it fails, the answer is to move detail into an explicitly read
 * reference, not to raise the number.
 *
 * Splitting carries its own risk, and it is the one that actually matters: a rule
 * quietly becoming optional. So the budget ships with a preservation check — the
 * committed baseline of rule headings and P## markers must still resolve after any
 * split, and every pointer into an appendix must land on a real heading. The budget
 * can only be met by moving *detail*, never by losing a rule.
 */
import fs from "node:fs";
import path from "node:path";

export const BUDGET_BYTES = 24_000;

/**
 * The mandatory QA standard gets its own, higher ceiling — and the reason is on the
 * record rather than smuggled in. 06b is 23 rules that every agent must obey on every
 * change; when it was squeezed to the generic 24,000 the suite immediately caught the
 * operative text of Rules 15 and 19 (the disqualifier list, the backstop framing) being
 * pushed into an on-demand appendix. A mandatory rule that becomes an optional read is
 * not a cheaper standard, it is a weaker one, and ASF's own prime directive says cost
 * never wins against solidity. So the standard keeps its rules in the always-read file
 * and pays a documented ceiling instead; what got moved out is procedure and tables,
 * which is what a split is for.
 */
export const CEILINGS = {
  "references/06b-testing-qa.md": 28_000,
};

/** Total across the always-read set — what a session actually pays (was 88,515). */
export const TOTAL_BUDGET_BYTES = 76_000;

/** Files every agent reads on every session — these are the ones that cost. */
export const ALWAYS_READ = [
  "SKILL.md",
  "references/06b-testing-qa.md",
  "references/06c-code-quality.md",
  "references/06i-completeness.md",
];

export function checkBudget(skillDir, { always = ALWAYS_READ, budget = BUDGET_BYTES, ceilings = CEILINGS, totalBudget = TOTAL_BUDGET_BYTES } = {}) {
  const over = [];
  const sizes = {};
  for (const rel of always) {
    const abs = path.join(skillDir, rel);
    const cap = ceilings[rel] || budget;
    if (!fs.existsSync(abs)) {
      over.push({ file: rel, bytes: 0, cap, msg: "listed as always-read but the file is missing" });
      sizes[rel] = 0;
      continue;
    }
    const bytes = Buffer.byteLength(fs.readFileSync(abs));
    sizes[rel] = bytes;
    if (bytes > cap) {
      over.push({
        file: rel,
        bytes,
        cap,
        msg: `${bytes} bytes exceeds the ${cap}-byte ceiling; move procedure, examples and tables into an explicitly read reference (the rule statements stay here)`,
      });
    }
  }
  const total = Object.values(sizes).reduce((a, b) => a + b, 0);
  if (total > totalBudget) {
    over.push({ file: "(always-read total)", bytes: total, cap: totalBudget, msg: `the always-read set costs ${total} bytes per session; the total ceiling is ${totalBudget} — split by concern, do not trim rules` });
  }
  return { over, sizes, budget, totalBudget, total };
}

const RULE_HEADING = /^## Rule (\d+) — (.+)$/gm;
const P_MARKER = /\bP\d{2}\b/g;

/** Snapshot of what the normative content currently contains. */
export function ruleBaseline(skillDir) {
  const b = fs.readFileSync(path.join(skillDir, "references", "06b-testing-qa.md"), "utf8");
  const rules = [...b.matchAll(RULE_HEADING)].map((m) => ({ n: Number(m[1]), title: m[2].trim() }));
  const markers = new Set();
  for (const f of fs.readdirSync(path.join(skillDir, "references"))) {
    const text = fs.readFileSync(path.join(skillDir, "references", f), "utf8");
    for (const m of text.matchAll(P_MARKER)) markers.add(m[0]);
  }
  for (const m of fs.readFileSync(path.join(skillDir, "SKILL.md"), "utf8").matchAll(P_MARKER)) markers.add(m[0]);
  return { rules, markers: [...markers].sort() };
}

/**
 * After a split, nothing may have been lost.
 * @param {object} baseline  a previously captured ruleBaseline()
 */
export function verifyRulesPreserved(skillDir, baseline) {
  const problems = [];
  const now = ruleBaseline(skillDir);
  const nowRules = new Map(now.rules.map((r) => [r.n, r.title]));
  for (const r of baseline.rules) {
    if (!nowRules.has(r.n)) problems.push(`Rule ${r.n} — ${r.title} is gone from 06b-testing-qa.md`);
    else if (nowRules.get(r.n) !== r.title) problems.push(`Rule ${r.n} was retitled: "${r.title}" -> "${nowRules.get(r.n)}"`);
  }
  const nowMarkers = new Set(now.markers);
  for (const m of baseline.markers) {
    if (!nowMarkers.has(m)) problems.push(`${m} no longer appears anywhere in the normative content`);
  }

  // Pointers into an appendix must land. A pointer to a heading that was renamed is
  // how a rule becomes optional while still looking complete.
  for (const f of fs.readdirSync(path.join(skillDir, "references"))) {
    const text = fs.readFileSync(path.join(skillDir, "references", f), "utf8");
    for (const m of text.matchAll(/`([0-9a-z-]+\.md)`\s*(?:§|#)\s*`([^`]+)`/g)) {
      const target = path.join(skillDir, "references", m[1]);
      if (!fs.existsSync(target)) {
        problems.push(`${f} points at ${m[1]}, which does not exist`);
        continue;
      }
      const want = m[2].trim().toLowerCase().replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-");
      if (!want) continue;
      const heads = [...fs.readFileSync(target, "utf8").matchAll(/^#{1,6}\s+(.*)$/gm)].map((h) =>
        h[1].toLowerCase().replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-"),
      );
      if (!heads.includes(want)) problems.push(`${f} points at ${m[1]} §${m[2]}, which is not a heading there`);
    }
  }
  return { problems, rules: now.rules.length, markers: now.markers.length };
}
