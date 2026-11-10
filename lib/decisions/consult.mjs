/**
 * The consult surface: what the handlers and the tool actually call.
 *
 * Kept separate from `store.mjs` because the store is about files and this is
 * about a *run*: what is in context, what has been read, what has been cited,
 * and what a new decision has to satisfy before it is allowed to exist. The
 * rule it enforces is the cheap one that makes the whole register worth
 * building — a decision only governs work if it was in front of the agent when
 * that work was written.
 */

import fs from "node:fs";
import path from "node:path";
import { decisionsDir, ensureHome } from "../home.mjs";
import { loadRegister, governing, indexForCard, writeRecord, updateRecord, nextNumber, writeIndex, fileNameFor } from "./store.mjs";
import { validateRegister } from "./schema.mjs";

const ID_RE = /ADR-\d{4}/g;

/** Whether a named enforcement check exists — relative to the measured project. */
function existsIn(root, p) {
  try {
    return fs.existsSync(path.join(root, String(p)));
  } catch {
    return true;
  }
}

/** Read the register for a project. Reading never creates anything. */
export function registerAt(root, config) {
  const dir = decisionsDir(root, config || {});
  const { records, problems } = loadRegister(dir);
  const exists = (p) => existsIn(root, p);
  return { dir, records, problems: problems.concat(validateRegister(records, { exists })) };
}

/** The budgeted index for the run card. */
export function cardIndex(records, opts) {
  return indexForCard(records, opts);
}

/**
 * Which accepted decisions govern a file the agent is about to change and has
 * not read this run. That set is the whole read-before-edit floor.
 */
export function unreadGoverning(records, filePath, read) {
  return governing(records, filePath).filter((r) => !(read || []).includes(String(r.id)));
}

/**
 * Project-relative paths, because `applies_to` is written relative to the repo
 * and the run records absolute ones. A path outside the project is left alone —
 * it governs nothing, and silently dropping it would hide that fact.
 */
export function relativeTo(root, files) {
  return (files || [])
    .filter((f) => typeof f === "string" && f.trim())
    .map((f) => {
      const s = String(f).replace(/\\/g, "/");
      if (!path.isAbsolute(s)) return s;
      const rel = path.relative(root, s);
      return rel && !rel.startsWith("..") ? rel : s;
    });
}

/** Which accepted decisions a piece of text cites. */
export function citedIds(text, records) {
  const found = String(text || "").match(ID_RE) || [];
  const known = new Set((records || []).filter((r) => r.status === "accepted").map((r) => String(r.id)));
  return found.filter((id) => known.has(id));
}

/** What makes a record law rather than a suggestion. */
function hasAcceptanceEvidence(d) {
  return Boolean(String(d.from_spec || "").trim() || String(d.user_instructed || "").trim() || String(d.plan || "").trim());
}

/**
 * Default the status rather than refuse the record.
 *
 * A record with nothing behind it is a *proposal* — visible, never enforced —
 * which is the honest default and keeps an unattended run from having to ask.
 * Evidence (a spec id, the user's own words, an approved plan) is what promotes
 * it to law, and the validator still refuses `accepted` without it, so a
 * hand-written or imported record cannot skip the same bar.
 */
function defaultStatus(d) {
  if (d.status) return d.status;
  if (String(d.origin || "") === "backfill" && Array.isArray(d.source) && d.source.length) return "accepted";
  return hasAcceptanceEvidence(d) ? "accepted" : "proposed";
}

/**
 * Record a new decision.
 *
 * An invalid record is **not written**: a register full of half-records is worse
 * than a smaller one, because the half-records are the ones that get followed
 * into the code. The caller gets the fix list instead.
 */

/**
 * The set a write is validated against: what is on disk, plus whatever the caller
 * already loaded, minus the file this write replaces (it is being rewritten, not
 * duplicated).
 *
 * Deduplicated by FILE, never by id — two files carrying the same id is exactly
 * the corruption the validator has to be able to see, and a caller that passes the
 * records it just loaded must not turn every record into a duplicate of itself.
 */
function validationSet(dir, probe, read) {
  const byFile = new Map();
  for (const r of [...loadRegister(dir).records, ...(read || [])]) {
    const key = String(r.__file || "");
    if (key && key === String(probe.__file)) continue;
    byFile.set(key || `#${byFile.size}`, r);
  }
  return [probe, ...byFile.values()];
}

export function addDecision(root, { record, body, config, planApproved, read }) {
  ensureHome(root);
  const dir = decisionsDir(root, config || {});
  const data = { ...record };
  data.status = defaultStatus(data);
  if (!data.id) data.id = `ADR-${String(nextNumber(dir)).padStart(4, "0")}`;
  if (!data.decided) data.decided = new Date().toISOString().slice(0, 10);
  const probe = { ...data, body: body ?? data.body, __file: fileNameFor(data.id, data.title) };
  const problems = validateRegister(validationSet(dir, probe, read), { planApproved: planApproved === true, exists: (p) => existsIn(root, p) });
  // Only this record's own faults may refuse it. The register's existing
  // records are passed in so collisions (duplicate ids, overlapping scopes,
  // one-sided supersession) are caught — but a neighbour's formatting is not
  // this write's problem, and refusing on it would make a register unwritable.
  const blocking = problems.filter((p) => p.severity === "error" && (p.id === data.id || p.file === probe.__file || !p.id));
  if (blocking.length) return { ok: false, problems: blocking, file: undefined };
  const written = writeRecord(dir, data, body ?? data.body);
  if (!written.created) return { ok: false, problems: [{ severity: "error", field: "id", message: `${written.file} already exists — a decision is superseded, never rewritten` }], file: written.file };
  const refreshed = loadRegister(dir);
  writeIndex(dir, refreshed.records);
  return { ok: true, file: written.file, id: data.id, problems: problems.filter((p) => p.severity === "notice") };
}

/**
 * Replace a decision. The old record keeps its history and gains
 * `superseded_by`; the new one names it in `supersedes`. Both halves are written
 * together, because a one-way link leaves two records looking current — which is
 * exactly how an agent ends up following a decision that was reversed.
 */
export function supersedeDecision(root, { by, id, record, body, config, planApproved, read }) {
  const dir = decisionsDir(root, config || {});
  const loaded = loadRegister(dir).records;
  const older = loaded.find((r) => String(r.id) === String(id));
  if (!older) return { ok: false, problems: [{ severity: "error", field: "id", message: `${id} is not in the register` }] };
  // The id is decided BEFORE validation: the bidirectional check asks what the
  // old record will say about the new one, and that cannot be answered after the
  // new record has already been written. Validating the pair as it will exist is
  // the only order in which a legitimate supersession can be written at all.
  const newId = String(record.id || `ADR-${String(nextNumber(dir)).padStart(4, "0")}`);
  // The register this function already opened is the authority for what exists —
  // a caller that forgot to pass `read` (or passed a stale one) must not make a
  // legitimate supersession look like a link to nothing.
  const known = [...new Map([...loaded, ...(read || [])].map((r) => [String(r.id), r])).values()].map((r) =>
    String(r.id) === String(id) ? { ...r, status: "superseded", superseded_by: newId } : r,
  );
  const created = addDecision(root, {
    record: { ...record, id: newId, supersedes: [String(id)] },
    body,
    config,
    planApproved,
    read: known,
  });
  if (!created.ok) return created;
  const back = updateRecord(dir, String(id), { status: "superseded", superseded_by: created.id });
  if (!back.created) return { ok: false, problems: [{ severity: "error", field: "supersedes", message: `could not mark ${id} superseded (${back.reason})` }] };
  const refreshed = loadRegister(dir);
  writeIndex(dir, refreshed.records);
  return { ok: true, file: back.file, id: created.id, superseded: String(id), by: String(by || "agent") };
}

/** Re-generate the index from the records (the records are the source). */
export function refreshIndex(root, config) {
  const dir = decisionsDir(root, config || {});
  const { records } = loadRegister(dir);
  return { file: writeIndex(dir, records), count: records.length };
}
