/**
 * Reading and writing the register.
 *
 * Three rules shape this module:
 *
 *   1. **The file is the record.** Nothing is cached in memory as an authority;
 *      every consult re-reads, so a hand edit takes effect on the next tool call.
 *   2. **Never overwrite a human's words.** `writeRecord` refuses when the file
 *      exists. Rewriting a record nobody asked it to rewrite is how a tool ends
 *      up owning the project's own documentation.
 *   3. **A broken record is reported, never skipped.** A file that will not parse
 *      becomes a problem with the file name, not an entry in a shorter list —
 *      "no decisions" and "no decisions could be read" must not look the same.
 */

import fs from "node:fs";
import path from "node:path";
import { parseFrontMatter, serializeFrontMatter } from "./parse.mjs";
import { FIELD_ORDER } from "./schema.mjs";
import { matchesAny } from "./glob.mjs";

export const INDEX_FILE = "INDEX.md";

const readText = (file) => {
  try {
    return fs.readFileSync(file, "utf-8");
  } catch {
    return undefined;
  }
}

/** Every `NNNN-*.md` in the directory, sorted by number. */
function recordFiles(dir) {
  let names = [];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return [];
  }
  return names
    .filter((n) => n.endsWith(".md") && n !== INDEX_FILE && /^\d{4}-.*\.md$/.test(n))
    .sort();
}

/**
 * Load the register.
 * @returns {{records: object[], problems: {severity:string,file:string,message:string}[]}}
 */
export function loadRegister(dir) {
  const records = [];
  const problems = [];
  for (const name of recordFiles(dir)) {
    const file = path.join(dir, name);
    const text = readText(file);
    if (text === undefined) {
      problems.push({ severity: "error", file: name, field: "file", message: "cannot be read" });
      continue;
    }
    const { data, body, errors } = parseFrontMatter(text);
    for (const e of errors) problems.push({ severity: "error", file: name, field: "front matter", message: e });
    records.push({ ...data, body, __file: name });
  }
  return { records, problems };
}

/** Highest number in use, so a new record never collides with an existing one. */
export function nextNumber(dir) {
  let max = 0;
  for (const name of recordFiles(dir)) {
    const n = Number(name.slice(0, 4));
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max + 1;
}

export function slugify(title) {
  return String(title || "decision")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "decision";
}

export function fileNameFor(id, title) {
  const num = String(id || "").match(/\d{4}/);
  return `${num ? num[0] : "0000"}-${slugify(title)}.md`;
}

/** Front matter only: the body and the loader's `__file` are not fields. */
function fieldsOf(data) {
  const out = {};
  for (const [k, v] of Object.entries(data || {})) {
    if (k === "body" || k.startsWith("__")) continue;
    out[k] = v;
  }
  return out;
}

/**
 * Write a new record. Refuses to touch an existing file — a superseding record
 * is a *new* file, and the old one keeps its history with `status: superseded`
 * set by whoever supersedes it (which is why `updateRecord` exists and is
 * separate, narrower, and only ever edits fields ASF owns).
 */
export function writeRecord(dir, data, body) {
  const name = fileNameFor(data.id, data.title);
  const file = path.join(dir, name);
  if (fs.existsSync(file)) return { file, created: false, reason: "exists" };
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, serializeFrontMatter(fieldsOf(data), body ?? data.body, FIELD_ORDER), "utf-8");
  return { file, created: true };
}

/**
 * Set fields on an existing record (status, superseded_by). Rewrites the file
 * with the same body. Not for creating.
 */
export function updateRecord(dir, id, patch) {
  const found = recordFiles(dir).find((n) => readText(path.join(dir, n))?.includes(`id: ${id}`));
  if (!found) return { created: false, reason: "not-found" };
  const file = path.join(dir, found);
  const { data, body, errors } = parseFrontMatter(readText(file));
  if (errors.length) return { created: false, reason: `unparseable: ${errors[0]}` };
  fs.writeFileSync(file, serializeFrontMatter({ ...fieldsOf(data), ...fieldsOf(patch) }, body, FIELD_ORDER), "utf-8");
  return { file, created: true };
}

/** One index line per record: the rule first, because the index is the retrieval surface. */
export function indexLine(r) {
  const scope = (r.applies_to || []).join(", ") || "—";
  const flag = r.status === "accepted" ? "" : ` [${r.status}${r.superseded_by ? ` by ${r.superseded_by}` : ""}]`;
  return `- **${r.id}** ${String(r.decision || r.title || "").trim()} _(${scope})_${flag}`;
}

/**
 * Render the generated index. Hand edits to this file are lost by design — the
 * records are the source, the index is a view of them, and a second hand-edited
 * copy of the truth is how the two start disagreeing.
 */
export function renderIndex(records) {
  const order = ["accepted", "proposed", "superseded", "deprecated", "retired", "rejected"];
  const sorted = [...(records || [])].sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status) || String(a.id).localeCompare(String(b.id)));
  const lines = [
    "# Decisions",
    "",
    "Generated by ASF from the records in this directory — edit the records, not this file.",
    "",
  ];
  for (const status of order) {
    const rows = sorted.filter((r) => r.status === status);
    if (!rows.length) continue;
    lines.push(`## ${status}`, ...rows.map(indexLine), "");
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

export function writeIndex(dir, records) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, INDEX_FILE), renderIndex(records), "utf-8");
  return path.join(dir, INDEX_FILE);
}

/**
 * The accepted decisions that govern a path — the set a tool call is checked
 * against. `proposed` records are excluded on purpose: an unconfirmed idea must
 * inform the agent, never block it.
 */
export function governing(records, filePath) {
  return (records || []).filter((r) => r.status === "accepted" && matchesAny(filePath, r.applies_to || []));
}

/**
 * The budgeted index for the run card: accepted first, then proposed, clipped to
 * `max` rows and `bytes` total. The register earns its context cost by being a
 * list of one-line rules, not a library of essays.
 */
export function indexForCard(records, { max = 12, bytes = 900 } = {}) {
  // A reversed decision never goes on the card. INDEX.md keeps it as history with
  // a flag, which is right for a human reading the repo; a card line is read by an
  // agent as "this governs", and two records that both look current is exactly how
  // a reversed decision gets followed. `proposed` stays (flagged) — it is a live
  // idea that has not been confirmed, not one that was withdrawn.
  const closed = new Set(["superseded", "deprecated", "retired", "rejected"]);
  const live = (records || []).filter((r) => !closed.has(String(r.status)));
  const ranked = [...live].sort((a, b) => (a.status === "accepted" ? 0 : 1) - (b.status === "accepted" ? 0 : 1));
  const out = [];
  let used = 0;
  for (const r of ranked.slice(0, max)) {
    const line = indexLine(r).replace(/\*\*/g, "").replace(/_/g, "");
    if (used + line.length > bytes) break;
    used += line.length;
    out.push(line);
  }
  return out;
}
