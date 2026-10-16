/**
 * Model-blind-spot research suite (D1 + D2).
 *
 * These deliverables are research that feeds implementation, so the thing worth
 * pinning is not prose quality — it is the two ways research fails silently:
 *
 *   1. an inventory that stops being re-derived when the gate set grows, so it
 *      keeps claiming blindness that has since been fixed (or hides coverage
 *      nobody built);
 *   2. a quotation nobody can find, which is worse than no citation because it
 *      invites downstream reuse and reads as evidence.
 *
 * Both have actually happened in this document's history, which is why the
 * checks below are structural rather than a word count.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DOC = fs.readFileSync(path.join(ROOT, "docs/research/model-blind-spots.md"), "utf8");
const SRC = fs.readFileSync(path.join(ROOT, "docs/research/SOURCES.md"), "utf8");

const results = [];
const check = (name, cond, detail = "") => {
  results.push({ name, cond });
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};
const section = (s) => console.log(`\n=== ${s} ===`);

const part2Start = DOC.indexOf("## Part 2");
const part3Start = DOC.indexOf("## Part 3");
const part2 = DOC.slice(part2Start, part3Start);
const withdrawn = part2.slice(part2.indexOf("### Sourcing integrity"));

// ── 1. the three parts exist ────────────────────────────────────────────────
section("structure");
check("Part 1 is the inventory", DOC.includes("## Part 1 — Deliverable 1"));
check("Part 2 is established practice", part2Start > 0);
check("Part 3 states the implications", part3Start > part2Start);

// ── 2. the inventory is complete and contiguous ─────────────────────────────
section("the inventory");
const classNames = [...DOC.matchAll(/^\*\*(\d+)\. (.+?)\.\*\*/gm)].map((m) => ({
  n: Number(m[1]),
  name: m[2],
}));
const nums = classNames.map((c) => c.n);
check(
  "classes are numbered contiguously 1..N with no gap or duplicate",
  nums.length >= 14 && nums.every((n, i) => n === i + 1),
  `found ${nums.length}: ${nums.join(",")}`,
);
check("the inventory names at least 14 defect classes", nums.length >= 14, `${nums.length}`);

// ── 3. the inventory is re-derived against the CURRENT gate set ─────────────
section("re-derivation against the current gate set");
check("the audit says it was taken in two passes", DOC.includes("Pass 1 (as taken)") && DOC.includes("Pass 2"));
check("pass 2 explains why a stale inventory is a defect", /over-claiming blindness/.test(DOC));
// Every class must be re-scored — a row per class, with an enforcement class.
const scoredRows = [...part2.matchAll(/^\|\s*(\d+)\s*\|/gm)].map((m) => Number(m[1]));
const reScored = [...DOC.matchAll(/^\|\s*(\d+)\s*\|\s*[^|]+\|\s*[^|]+\|\s*(?:\*\*)?(H|M|S|M\/S|—)(?:\*\*)?\s*\|/gm)].map((m) => Number(m[1]));
check(
  "every class is re-scored in the current-coverage table",
  nums.length >= 14 && nums.every((n) => reScored.includes(n)),
  `scored: ${reScored.join(",")}`,
);
check("the re-scoring uses the H/M/S enforcement classes", /H hard blocker|M mechanical verdict|S self-attested/.test(DOC) || /\*\*H\*\* hard/.test(DOC));
check(
  "the uninspected classes are named rather than averaged away",
  /nothing inspects it/.test(DOC) && /remain completely uninspected/.test(DOC),
);
const uninspected = [...DOC.matchAll(/^\|\s*(\d+)\s*\|\s*[^|]+\|\s*\*\*nothing inspects it\*\*/gm)].map((m) => Number(m[1]));
check("at least one class is reported as fully uninspected", uninspected.length >= 1, uninspected.join(","));
check(
  "the count of uninspected classes is stated as a number",
  /(\d+) classes?[^.\n]*remain completely uninspected|— ([3-9][\d, ]*) — remain completely uninspected/i.test(DOC) ||
    /Six classes/.test(DOC),
);

// ── 4. vigilant is audited too (the mandate says "ASF and vigilant") ────────
section("the vigilant half of the audit");
check("vigilant's own subsystems are audited", /And vigilant\?/.test(DOC) && /Loop Guardian/.test(DOC));
check("the audit names what vigilant inspects, not just that it exists", /Spec verification|Completeness guard|Obligations container/.test(DOC));
check(
  "the audit states the consequence: nobody else inspects those classes",
  /if ASF does not inspect them, nobody does|nobody does/.test(DOC),
);
check(
  "the package boundary is respected — no design check is proposed for vigilant",
  /what crosses the boundary is the \*\*specification\*\*, never the check|specification, never the check/.test(DOC),
);

// ── 5. the meta-finding is reported with its current status ─────────────────
section("the meta-finding");
check("the non-effect finding is stated", /asserts the intended effect/.test(DOC) && /non-effect/.test(DOC));
check("and it is given a status rather than left as a permanent claim", /Status of the meta-finding now/.test(DOC));
check("the H/M distinction is used to say what is still only a suggestion", /assertion nobody is compelled to write is a\nsuggestion|compelled to write/.test(DOC));

// ── 6. sourcing discipline — the reason this suite exists ───────────────────
section("sourcing discipline");
check("evidence classes are declared up front", /Evidence classes/.test(part2) && /\*\*T1\*\*/.test(part2) && /\*\*T3\*\*/.test(part2));
check("T3 is explicitly not allowed to be a rule", /never a rule/.test(part2));

// An attribution must resolve to a URL somewhere in its own subsection — the
// line-based version was too strict (a URL often sits on the line after
// "Source:") and too lenient (a bare "Source:" with no URL anywhere is the
// exact shape the fabricated quotes arrived in).
const subsections = part2.split(/\n(?=### )/);
const unsourced = subsections.filter(
  (s) => /\bSources? (fetched|below)?:|^Source:/m.test(s) && !/https?:\/\//.test(s) && !/\*\*T3\*\*/.test(s),
);
check(
  "every sourced subsection in Part 2 resolves to a URL, or is labelled T3",
  subsections.filter((s) => /^Source:|^Sources fetched/m.test(s)).length >= 4 && unsourced.length === 0,
  unsourced.length ? unsourced[0].split("\n")[0].slice(0, 60) : "ok",
);

// The claims that could not be verified must be recorded as withdrawn, and must
// not survive as quotations elsewhere in Part 2.
check("a withdrawn list exists so the deletion is auditable", /### Sourcing integrity/.test(part2) && /Removed from the earlier draft/.test(withdrawn));
const droppedPhrases = [
  "orphans-by-policy",
  "humans forget filters",
  "paid for the trash folder twice",
  "objective integrity assessment",
];
for (const phrase of droppedPhrases) {
  const beforeWithdrawn = part2.slice(0, part2.indexOf("### Sourcing integrity"));
  const quotedElsewhere = new RegExp(`["""]${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i").test(beforeWithdrawn);
  check(`"${phrase}" survives only as a record, not as a quotation`, !quotedElsewhere);
  check(`"${phrase}" is listed in the withdrawn table`, withdrawn.toLowerCase().includes(phrase.toLowerCase()));
}
check("the withdrawn list records HOW each was checked", /exact-phrase search/i.test(withdrawn) && /404/.test(withdrawn));
check("a claim that could not be sourced may not carry a gate", /the gate is not built on it/.test(part2));

// ── 7. SOURCES.md carries the record ────────────────────────────────────────
section("SOURCES.md");
check("the model research has a SOURCES.md section", /## Model blindness/.test(SRC));
check("SOURCES.md declares the evidence classes", /T1\*\* fetched and read|T1.* fetched and read/.test(SRC));
check("SOURCES.md keeps the withdrawn table", /### Withdrawn/.test(SRC));
check("SOURCES.md marks the Rails option list as not-read", /not\*\* read|not read in this pass/i.test(SRC));
// Every T1 row must actually carry a URL — a T1 with no URL is a T3.
const t1Rows = SRC.split("\n").filter((l) => /^\|.*\*\*T1\*\*/.test(l));
const t1NoUrl = t1Rows.filter((l) => !/https?:\/\//.test(l));
check("every T1 row in SOURCES.md carries a URL", t1Rows.length >= 4 && t1NoUrl.length === 0, `${t1Rows.length} T1 rows`);

// ── 8. the deliverables feed implementation, not just prose ─────────────────
section("feeding implementation");
check("the aggregate rules are mapped to the incident, not just quoted", /mapping to the incident is exact/.test(part2));
check("the two-user methodology is carried into 06g", /06g §3/.test(part2));
check("the fitness-function finding identifies the existing harness", /already is a fitness-function harness/.test(part2));
check("prevention-vs-recovery is stated (the mandate)", /prevention\*\*, not symptom management|not symptom management/.test(DOC));

const failed = results.filter((r) => !r.cond);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.log(`\nFAILURES:\n${failed.map((f) => `  - ${f.name}`).join("\n")}`);
  process.exit(1);
}
