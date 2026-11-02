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
  chk("the floor has its own heading", skill.includes("## Anti-patterns — the floor"));
  chk("it says the list is not complete here", skill.includes("a pattern is never dropped here, only detailed there"));
  chk("it routes to the complete list", skill.includes("references/06m-antipatterns.md"));
  const floor = skill.split("## Anti-patterns — the floor")[1].split("\n## ")[0];
  const bullets = floor.split("\n").filter((l) => l.startsWith("- "));
  chk("the floor stays short (<= 14 bullets)", bullets.length <= 14, `${bullets.length} bullets`);

  console.log("=== 2. the complete list is complete ===");
  chk("it is one list under a single heading", /## Anti-patterns/.test(anti));
  const entries = anti.split("\n").filter((l) => l.startsWith("- \u274c"));
  chk("the complete list carries the whole set (>= 40)", entries.length >= 40, `${entries.length} entries vs ${bullets.length} in the floor`);
  chk("the floor never invents a rule of its own", bullets.filter((b) => { const k = b.replace(/\s*\([^)]*\)\s*$/, "").slice(0, 28); return !anti.toLowerCase().includes(k.toLowerCase()); }).length <= 3, "at most 3 floor bullets are paraphrases");

  console.log("=== 3. every numbered pattern is still enforced somewhere ===");
  const markers = [...new Set([...anti.matchAll(/\bP\d{2}\b/g)].map((m) => m[0]))];
  chk("the list cites the rules it forbids breaking", markers.length >= 5, `${markers.length} markers`);
  const orphan = markers.filter((m) => !new RegExp(m + "\\b").test(tree));
  chk("no pattern is mentioned only in the list", orphan.length === 0, orphan.join(", ") || "all grounded");

  console.log("=== 4. the entries that exist because something went wrong ===");
  for (const e of [
    "Running parallel subagents that touch the same file",
    "Trusting a subagent's exit code or self-report",
    "Re-deriving context another live session already has",
    "empty handler or `coming soon` on a user-reachable path",
    "Fake, seed, demo or lorem-ipsum data on a path the user reads as their own",
    "An invented API signature, config key, endpoint, version or limit stated as fact",
    "Quietly deferring part of the ask",
    "Presenting a stub as complete because the tests written against it pass",
    "Vague commits or CHANGELOG placeholders",
    "Publishing anything beyond the configured release policy",
    "Publishing without testing the shipped artifact on publish",
    "Verifying against a cached/stale install",
    "Letting a document grow until edits start breaking",
    "Self-modifying the ASF's own rules",
  ]) {
    chk(`listed: ${e.slice(0, 42)}…`, anti.includes(e));
  }
  chk("the floor carries the delegation entry", skill.includes("parallel subagents that touch the same file"));
  chk("the floor carries the fabricated-review entry", skill.includes("fabricated compliance"));
  chk("the floor carries the completeness entry", skill.includes("Declaring done while specs are still"));
}
