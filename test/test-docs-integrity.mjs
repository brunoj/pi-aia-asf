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
