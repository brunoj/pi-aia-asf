/**
 * The forbidden list (anti-patterns) — rebuilt after the original uncommitted suite
 * was lost.
 *
 * The list split in two on purpose: a short floor that is always read, and the complete
 * list that is read when it bites. Both halves have to be guarded — the floor against
 * growing back into a wall, the full list against losing an entry nobody re-reads.
 */
import fs from "node:fs";
import path from "node:path";

const chk = (name, cond, detail) => {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
  if (!cond) process.exitCode = 1;
};

export async function run({ extDir }) {
  const base = path.join(extDir, "skills", "aia-asf");
  const skill = fs.readFileSync(path.join(base, "SKILL.md"), "utf8");
  const anti = fs.readFileSync(path.join(base, "references", "06m-antipatterns.md"), "utf8");
  const refsDir = path.join(base, "references");
  const tree = fs.readdirSync(refsDir).map((f) => fs.readFileSync(path.join(refsDir, f), "utf8")).join("\n") + skill;

  console.log("=== 1. the floor exists, is short, and points somewhere ===");
  chk("the floor has its own heading", skill.includes("## Anti-patterns — the floor (always read)"));
  chk("it says the list is not complete here", skill.includes("the floor, not the list"));
  chk("it routes to the complete list", skill.includes("references/06m-antipatterns.md"));
  const floor = skill.split("## Anti-patterns — the floor")[1].split("\n## ")[0];
  const bullets = floor.split("\n").filter((l) => l.startsWith("- "));
  chk("the floor stays short (<= 12 bullets)", bullets.length <= 12, `${bullets.length} bullets`);

  console.log("=== 2. the complete list keeps its sections ===");
  for (const s of ["Delegation and orchestration", "Completeness and evidence", "Release and versioning", "Research and grounding", "Documentation", "Process"]) {
    chk(`section: ${s}`, anti.includes(`## ${s}`));
  }

  console.log("=== 3. every numbered pattern is still enforced somewhere ===");
  const markers = [...new Set([...anti.matchAll(/\bP\d{2}\b/g)].map((m) => m[0]))];
  chk("the list carries numbered patterns", markers.length >= 15, `${markers.length} markers`);
  const orphan = markers.filter((m) => !new RegExp(m + "\\b").test(tree));
  chk("no pattern is mentioned only in the list", orphan.length === 0, orphan.join(", ") || "all grounded");

  console.log("=== 4. the entries that exist because something went wrong ===");
  for (const e of [
    "Launching parallel subagents that touch the same file",
    "Treating a subagent's exit code",
    "Forcing a subagent to re-derive context",
    "A stub or fake path",
    "A quiet fallback to canned / lorem-ipsum data",
    "An invented fact about the product",
    "Quietly deferring part of the ask",
    "Declaring a feature done because the tests written against it pass",
    "Skipping versioning, changelog, or commit",
    "Publishing without being asked",
    "Researching from the training set",
    "Letting a document grow until edits start breaking",
    "Self-modifying the ASF's own rules",
  ]) {
    chk(`listed: ${e.slice(0, 42)}…`, anti.includes(e));
  }
  chk("the floor carries the delegation trio", skill.includes("subagents that touch the same file") && skill.includes("exit code") && skill.includes("re-derive"));
  chk("the floor carries the completeness trio", skill.includes("stub path") && skill.includes("quiet fallback") && skill.includes("invented fact"));
}
