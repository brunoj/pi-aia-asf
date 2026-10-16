/**
 * Security mapping suite (P36 + P37).
 *
 * The DoD line says "every applicable ASVS chapter checked". That is only
 * falsifiable if the chapter table is correct — and ASVS 5.0 re-numbered
 * relative to 4.0, so a table carrying 4.0 labels under a "5.0" heading makes
 * the line unfalsifiable: nobody can tell whether V5 was checked when nobody
 * agrees what V5 is.
 *
 * The list below is transcribed from the **source project** at tag
 * `v5.0.0_release` (OWASP/ASVS, `5.0/en/*.md`, each chapter's `# V<n> <Name>`
 * heading). Pinning it here is what turns 4.0/5.0 drift from a silent
 * documentation rot into a failing test.
 */
import fs from "node:fs";
import path from "node:path";

const REPO = new URL("..", import.meta.url).pathname;
const results = [];
const check = (name, cond, detail = "") => {
  results.push({ name, cond });
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};
const section = (s) => console.log(`\n=== ${s} ===`);

/** ASVS 5.0 chapters as published at tag v5.0.0_release. */
const ASVS_5_0 = [
  ["V1", "Encoding and Sanitization"],
  ["V2", "Validation and Business Logic"],
  ["V3", "Web Frontend Security"],
  ["V4", "API and Web Service"],
  ["V5", "File Handling"],
  ["V6", "Authentication"],
  ["V7", "Session Management"],
  ["V8", "Authorization"],
  ["V9", "Self-contained Tokens"],
  ["V10", "OAuth and OIDC"],
  ["V11", "Cryptography"],
  ["V12", "Secure Communication"],
  ["V13", "Configuration"],
  ["V14", "Data Protection"],
  ["V15", "Secure Coding and Architecture"],
  ["V16", "Security Logging and Error Handling"],
  ["V17", "WebRTC"],
];

/**
 * The ASVS 5.0 requirements that are simultaneously security and performance
 * requirements. Verified against the same tag. The point of pinning them is
 * that ASF must not maintain a second list of them (06c Rule 9).
 */
const ASVS_PERF_REQS = [
  { id: "15.1.3", mustMention: ["time-consuming", "timeout", "parallel"] },
  { id: "15.2.2", mustMention: ["availability"] },
  { id: "13.1.2", mustMention: ["concurrent connections", "connection pool"] },
  { id: "13.1.3", mustMention: ["resource", "timeout", "back-off", "retry"] },
  { id: "13.2.6", mustMention: ["parallel connections", "retry"] },
  { id: "4.3.1", mustMention: ["query cost"] },
  { id: "15.4.4", mustMention: ["thread starvation"] },
  { id: "15.4.3", mustMention: ["locks"] },
  { id: "16.5.2", mustMention: ["graceful degradation"] },
];

/** The 4.0-era labels that must NOT survive under a "5.0" heading. */
const ASVS_4_0_LEAKS = [
  "V1 (architecture)",
  "V2 (auth)",
  "V3 (session)",
  "V4 (access control)",
  "V5 (input validation)",
  "V6 (output encoding)",
  "V7 (crypto)",
  "V8 (errors)",
  "V14 (config)",
  "V15 (API)",
];

const h = fs.readFileSync(path.join(REPO, "skills", "aia-asf", "references", "06h-security.md"), "utf-8");
const k = fs.readFileSync(path.join(REPO, "skills", "aia-asf", "references", "06k-performance.md"), "utf-8");

// ─── asvs-5.0-chapter ──────────────────────────────────────────────────────
section("asvs-5.0-chapter — the table is the real one");

for (const [num, name] of ASVS_5_0) {
  const row = new RegExp(`\\|\\s*${num}\\s*\\|\\s*${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\|`);
  check(`${num} is present with its 5.0 name "${name}"`, row.test(h));
}

check("the table has exactly 17 chapter rows", (h.match(/^\|\s*V\d+\s*\|/gm) || []).length === 17, String((h.match(/^\|\s*V\d+\s*\|/gm) || []).length));
check("no ASVS 4.0-era label survives under the 5.0 heading", ASVS_4_0_LEAKS.every((leak) => !h.includes(leak)), ASVS_4_0_LEAKS.filter((l) => h.includes(l)).join(" | "));
check("the numbering is contiguous V1..V17", (() => {
  const nums = (h.match(/^\|\s*V(\d+)\s*\|/gm) || []).map((m) => Number(m.match(/\d+/)[0]));
  return nums.length === 17 && nums.every((n, i) => n === i + 1);
})());
check("the source and tag are named so a reviewer can re-verify", /v5\.0\.0_release/.test(h));
check("the DoD line is still there", /applicable ASVS chapter checks pass/.test(h));
check("the table explains why it is pinned", /unfalsifiable/.test(h));
check("chapter selection is still by deliverable type", /By deliverable type/.test(h));
check("and still pruned rather than run whole", /do not run the whole list/.test(h));

section("the four deliverable types still map to chapters");
for (const t of ["Web/API service", "CLI / local tool", "Library/package", "Agent/tool surface"]) {
  check(`${t} maps to chapters`, new RegExp(`\\| ${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\| V`).test(h));
}
check("a CLI does not get the session chapters", !/\| CLI \/ local tool \|.*V7/.test(h));
check("a CLI does not get the auth chapters", !/\| CLI \/ local tool \|.*V6/.test(h));

// ─── asvs-performance-requirements ─────────────────────────────────────────
section("asvs-performance-requirements — one list, not two");

for (const req of ASVS_PERF_REQS) {
  const present = new RegExp(`\\*\\*${req.id.replace(".", "\\.")}\\*\\*`).test(k);
  check(`ASVS ${req.id} is reachable from 06k`, present);
  // Anchor on the mapping-table row, not the first incidental mention: a row
  // that names the ID without carrying its substance is exactly the drift here.
  const row = new RegExp(`^\\|\\s*\\*\\*${req.id.replace(".", "\\.")}\\*\\*[^|]*\\|`, "m");
  const line = (k.split("\n").find((l) => row.test(l)) || "").toLowerCase();
  const missing = req.mustMention.filter((w) => !line.includes(w.toLowerCase()));
  check(`ASVS ${req.id} carries its substance (${req.mustMention.join(", ")})`, missing.length === 0, missing.length ? `missing: ${missing.join(", ")}` : "");
}

check("06h names the performance requirement IDs too", ["15.1.3", "13.1.2", "13.1.3", "4.3.1", "16.5.2"].every((id) => h.includes(id)), ["15.1.3", "13.1.2", "13.1.3", "4.3.1", "16.5.2"].filter((id) => !h.includes(id)).join(","));
check("06h refuses to maintain a second list", /refuses to maintain two lists/.test(h));
check("and points at 06k rather than restating it", /06k-performance\.md/.test(h));
const flat = (t) => t.replace(/\s+/g, " ");
check("one abuse-case run is shared, not duplicated", /one abuse-case load run/i.test(flat(h)) && /run it once; cite the same evidence/i.test(flat(k)), flat(k).match(/.{0,60}run it once.{0,60}/i)?.[0]);
check("06k cross-references the security DoD", /security DoD line in 06h/.test(k));

section("no security checklist has accumulated alongside ASVS");
const refs = fs.readdirSync(path.join(REPO, "skills", "aia-asf", "references"));
const checklistFiles = refs.filter((f) => /security[-_]?checklist/i.test(f));
check("no separate security checklist file exists", checklistFiles.length === 0, checklistFiles.join(","));
check("06h is the single security source", refs.filter((f) => /security/i.test(f)).length === 1, refs.filter((f) => /security/i.test(f)).join(","));
check("06k is registered as the performance source", refs.includes("06k-performance.md"));

section("the shared evidence is falsifiable, not aspirational");
check("the abuse case names what it attacks", /most expensive endpoint/.test(k));
check("the resource ceiling runs AT the declared limit", /run \*\*at\*\* the limit/.test(k));
check("soak is measured in hours", /≥ 1 hour/.test(k));
check("and a short soak is called out as an anti-pattern", /10-minute ["'“‘]?soak/i.test(k));

const failed = results.filter((r) => !r.cond);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.log("FAILED: " + failed.map((f) => f.name).join(" | "));
  process.exit(1);
}
