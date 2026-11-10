/**
 * Does every piece of evidence a gate demands have something that can produce it?
 *
 * Three tickets in a row were one bug wearing different clothes: the health gate
 * demanded a verdict only a pi slash command could produce; the completion gate
 * demanded browser verification no registered tool could record; the delivery report
 * rendered sections whose kinds nothing ever wrote. Each time a run was steered at a
 * gap its own hands could not close — the unwarranted loop the process rules forbid.
 *
 * The invariant is stated here, once, as a pure function over a package root, because
 * three different callers need to ask the same question and a second definition would
 * drift from the first:
 *
 *   - `test/test-evidence-kinds.mjs` asserts it against the repository;
 *   - `scripts/verify-published.mjs` asserts it against the copy npm just installed
 *     (the test directory is not shipped, so this is the only place the installed
 *     artifact's coverage can be checked);
 *   - `asf_evidence_check` answers it at runtime, so a session that suspects a broken
 *     install can ask instead of guessing.
 *
 * `root` is the package directory, not a project: this is a question about ASF's own
 * shipped code, and asking it about a user's repository would be meaningless.
 */

import fs from "node:fs";
import path from "node:path";

/** Files that could create a ledger entry. `.d.mts` are declarations, not code. */
function sourceFiles(root) {
  const out = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(path.join(root, dir), { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const rel = dir ? `${dir}/${e.name}` : e.name;
      if (e.isDirectory()) walk(rel);
      else if (/\.(ts|mjs)$/.test(e.name) && !e.name.endsWith(".d.mts")) out.push(rel);
    }
  };
  walk("lib");
  if (fs.existsSync(path.join(root, "index.ts"))) out.push("index.ts");
  return out;
}

/**
 * The kinds a gate actually blocks on.
 *
 * Derived from the two files that make completion decisions, not from a list someone
 * maintains: a hand-kept list rots the first time a gate starts requiring a kind and
 * nobody updates the list next door.
 */
function requiredKinds(root, entryKinds) {
  let text = "";
  for (const rel of ["lib/gates/ledger.mjs", "lib/gates/settle.mjs"]) {
    try {
      text += fs.readFileSync(path.join(root, rel), "utf8") + "\n";
    } catch {
      /* a missing gate file is reported by the shipped-file check, not here */
    }
  }
  const required = new Set(["suite-run", "health-run"]);
  for (const m of text.matchAll(/(?:has|kind ===)\s*\(\s*"([a-z-]+)"/g)) required.add(m[1]);
  for (const m of text.matchAll(/"([a-z-]+)"/g)) {
    const k = m[1];
    if (entryKinds.includes(k) && new RegExp(`(has|missing|latest|kind ===)[^\\n]*"${k}"`).test(text)) required.add(k);
  }
  return required;
}

/**
 * @param {string} root      the ASF package directory (contains lib/ and index.ts)
 * @param {string[]} entryKinds ENTRY_KINDS from the ledger — passed in rather than
 *                             imported so this stays a question about files, and so a
 *                             caller can ask it of any version's package directory
 * @returns {{orphans: string[], requiredOrphans: string[], producers: Record<string,string[]>,
 *            required: string[], kinds: string[], files: number}}
 */
export function evidenceCoverage(root, entryKinds) {
  // ledger.mjs only defines, validates and renders its own kinds, so counting it as a
  // producer would let the ledger certify itself.
  const files = sourceFiles(root).filter((f) => !f.endsWith("gates/ledger.mjs"));
  const sources = files.map((f) => ({ f, src: fs.readFileSync(path.join(root, f), "utf8") }));
  const producers = {};
  for (const kind of entryKinds) {
    producers[kind] = sources.filter(({ src }) => new RegExp(`kind:\\s*"${kind}"`).test(src)).map(({ f }) => f);
  }
  const orphans = entryKinds.filter((k) => producers[k].length === 0);
  const required = [...requiredKinds(root, entryKinds)];
  return {
    kinds: [...entryKinds],
    required,
    producers,
    orphans,
    requiredOrphans: required.filter((k) => !entryKinds.includes(k) || producers[k].length === 0),
    files: files.length,
  };
}

/**
 * A coverage result expressed as a gap, or null when the install is sound.
 *
 * An orphan a gate requires is the serious case: the run is steered at evidence it has
 * no hands to produce, which is the loop this module exists to prevent. An orphan
 * nothing requires is dead weight — reported, never blocking.
 */
export function coverageGap(coverage) {
  if (coverage.requiredOrphans.length) {
    return {
      gap: `the completion gate requires evidence of kind ${coverage.requiredOrphans.join(", ")}, but nothing in the installed package can record it`,
      remedy: "that evidence can never be produced, so no run can close on it — this is a broken ASF install, not unfinished work",
    };
  }
  if (coverage.orphans.length) {
    return {
      gap: `ledger kinds ${coverage.orphans.join(", ")} have no producer in the installed package`,
      remedy: "reported, not blocking: nothing requires them, so they are dead weight rather than an unclosable gap",
    };
  }
  return null;
}
