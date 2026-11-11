/**
 * ASF audits its own normative content (W2.2).
 *
 * Positive: the real skill tree has no dangling links, no orphan reference, no
 * un-indexed file, and valid frontmatter.
 *
 * Negative controls (both must fire): a broken relative link, and a reference file
 * that exists but is never indexed — the two ways ASF's routing silently rots.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { auditDocs } from "../scripts/audit-docs.mjs";

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

  console.log("=== 1. the real tree is clean ===");
  const r = auditDocs(skillDir);
  for (const p of r.problems.slice(0, 10)) console.log(`        ! ${p.file}: ${p.msg}`);
  chk("no problems in the real skill tree", r.problems.length === 0, `${r.problems.length} problem(s)`);
  chk("it actually checked something", r.checked > 10, `${r.checked} link/anchor reference(s)`);
  chk("references are present", r.references >= 18, `${r.references} references`);
  chk("reviewer personas are present", r.agents >= 7, `${r.agents} agents`);

  console.log("=== 2. negative control: a dangling link must be reported ===");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "asf-docs-"));
  try {
    const a = path.join(tmp, "broken-link");
    copyTree(skillDir, a);
    const skill = path.join(a, "SKILL.md");
    fs.appendFileSync(skill, "\nSee [the estimator](references/no-such-reference-xyz.md) for details.\n");
    const r1 = auditDocs(a);
    chk("a relative link to a missing file is reported", r1.problems.some((p) => p.msg.includes("no-such-reference-xyz")), r1.problems.map((p) => p.msg).slice(0, 2).join("; "));

    console.log("=== 3. negative control: an orphan reference must be reported ===");
    const b = path.join(tmp, "orphan");
    copyTree(skillDir, b);
    fs.writeFileSync(
      path.join(b, "references", "06z-orphan.md"),
      "# Orphan\n\nNobody is routed here.\n", // no "Read when" line either
    );
    const r2 = auditDocs(b);
    chk("a reference not indexed in SKILL.md is reported", r2.problems.some((p) => p.msg.includes("never be routed")), r2.problems.map((p) => p.msg).slice(0, 2).join("; "));
    chk("a reference with no 'Read when' is reported", r2.problems.some((p) => p.msg.includes("Read when")));

    console.log("=== 4. negative control: a dead anchor must be reported ===");
    const c = path.join(tmp, "dead-anchor");
    copyTree(skillDir, c);
    fs.appendFileSync(
      path.join(c, "SKILL.md"),
      "\nSee [browser procedure](references/06b-appendix.md#no-such-heading-xyz).\n",
    );
    const r3 = auditDocs(c);
    chk("an anchor that matches no heading is reported", r3.problems.some((p) => p.msg.includes("no-such-heading-xyz")));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// ─── proposals must be backed by counted evidence (spc-1793872167441-28764) ───
//
// A proposal without a measurement is speculation, and the rule that forbids it was for
// years a sentence in a document nothing checked. This makes it a claim that can fail:
// every `### P<n>` in the research doc must carry a `*Tested:*` line, and that line must
// contain a number — "counted" evidence, not an adjective.
/** The section that carries the proposals, up to the next `##` heading. */
function proposalSection(md) {
  const lines = md.split(/\r?\n/);
  const out = [];
  let inSection = false;
  for (const line of lines) {
    if (/^## /.test(line)) { inSection = /^## .*Proposals/i.test(line); continue; }
    if (inSection) out.push(line);
  }
  return out.join("\n");
}

function untestedProposals(md) {
  const lines = proposalSection(md).split(/\r?\n/);
  const out = [];
  let current = null;
  let tested = false;
  let counted = false;
  let counting = false;
  const flush = () => {
    if (current && !(tested && counted)) out.push(current);
    current = null; tested = false; counted = false; counting = false;
  };
  for (const line of lines) {
    const head = /^### (P\d+)\b/.exec(line);
    if (head) { flush(); current = head[1]; continue; }
    if (current && /\*Tested:\*/.test(line)) { tested = true; counting = true; if (/\d/.test(line)) counted = true; continue; }
    // The Tested block is the paragraph it starts: a wrapped line still counts, but the
    // block ENDS at the blank line, so digits in unrelated prose below cannot buy a pass.
    if (current && counting) {
      if (!line.trim()) { counting = false; continue; }
      if (/^#{1,4} |^-{3,}/.test(line)) { counting = false; continue; }
      if (/\d/.test(line)) counted = true;
    }
  }
  flush();
  return out;
}

{
  const file = path.join(path.dirname(new URL(import.meta.url).pathname), "..", "RESEARCH-trace-improvements.md");
  const md = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  const proposals = (proposalSection(md).match(/^### P\d+/gm) || []).length;
  chk("the trace-evidence research doc exists and carries proposals", proposals >= 4, `${proposals} proposals`);
  chk("every proposal is backed by a counted measurement", untestedProposals(md).length === 0, JSON.stringify(untestedProposals(md)));

  // Negative control: drop one proposal's measurement and the check must name it.
  const stripped = md.replace(/\*Tested:\*[^\n]*(\n[^\n]*)*\n\n/, "*Tested:* measured against the traces.\n\n");
  chk("NEGATIVE: a measurement with no number in it is not counted evidence", untestedProposals(stripped).length === 1, JSON.stringify(untestedProposals(stripped)));
  const removed = md.replace(/\*Tested:\*[^\n]*\n/, "");
  chk("NEGATIVE: a proposal with no Tested line at all is reported", untestedProposals(removed).length >= 1, JSON.stringify(untestedProposals(removed).slice(0, 2)));
}
