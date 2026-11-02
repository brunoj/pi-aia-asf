/**
 * The operator-facing / agent-like tool surface (P48, P18) — rebuilt after the
 * original uncommitted suite was lost.
 *
 * The rule is worth having because it is *conditional*: a security chapter that
 * applies to everything applies, in practice, to nothing. What must be guaranteed is
 * that the check exists when the deliverable really has a model-reachable surface, and
 * that it stays proportional.
 */
import fs from "node:fs";
import path from "node:path";

const chk = (name, cond, detail) => {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
  if (!cond) process.exitCode = 1;
};

export async function run({ extDir }) {
  const base = path.join(extDir, "skills", "aia-asf");
  const read = (f) => fs.readFileSync(path.join(base, "references", f), "utf8");
  const sec = read("06h-security.md");
  const qa = read("06b-testing-qa.md");
  const skill = fs.readFileSync(path.join(base, "SKILL.md"), "utf8");
  const index = fs.readFileSync(path.join(extDir, "index.ts"), "utf8");
  const cfg = fs.readFileSync(path.join(extDir, "lib", "gates", "config.mjs"), "utf8");

  console.log("=== 1. the chapter exists and is conditional ===");
  chk("06h has the agent/tool-surface chapter", /## 4\. Agent\/tool-surface chapter/.test(sec));
  chk("it applies only when applicable", sec.includes("Applies **only** when the deliverable has agent-like tool surfaces"));
  chk("the trigger names the concrete cases", /LLM\s+agent with tools|plugin system|extension that exposes capabilities/.test(sec));
  chk("it is proportional, not a wall", sec.includes("strictly proportional") && sec.includes("One-liner (small surface)") && sec.includes("Full list (large surface)"));
  chk("it lives inside 06h, not as a stray reference", sec.includes("not a separate reference"));

  console.log("=== 2. the classes are named ===");
  for (const c of ["Least privilege", "Human-in-the-loop", "output is validated", "Audit"]) {
    chk(`class present: ${c}`, sec.includes(c));
  }
  chk("destructive actions need confirmation", /publish, delete,\s*\n?\s*pay, deploy|publish, delete, pay, deploy/.test(sec));

  console.log("=== 3. consumption is a DoD item, not a vibe ===");
  chk("06b Rule 12 requires operator-facing consumption", qa.includes("## Rule 12 — Operator-facing features are consumed by a surface"));
  chk("dead code is a defect", qa.includes("dead code is a defect"));
  chk("the DoD line exists in SKILL.md", skill.includes("every delivered feature is consumed by a real surface"));
  chk("the gate is registered in the extension", index.includes('key: "surface"'));

  console.log("=== 4. the surface cannot rot silently ===");
  chk("a parameter may exist only if it is honoured", /may exist only if/.test(cfg));
  chk("an honoured parameter must be documented", /documented/.test(cfg));
  chk("an undocumented parameter is a defect", /defect/.test(cfg));
}
