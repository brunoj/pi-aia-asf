/**
 * Code Health Gate — model level (P27).
 *
 * Two objective fitness functions over persistence code, per
 * references/06j-data-model.md. Dependency-free: no tool to install, no parser,
 * no network — a model gate that cannot run never gates.
 *
 * **This is a tripwire, not an authority.** It asks one mechanical question —
 * *is there a deletion decision here that nobody wrote down?* — and it will miss
 * stores and dialects it has not been told about. That is why the obligation
 * lives in the DoD checkbox (06b Rule 20) and in the invariant tests (06g §3),
 * not here. A clean scan is not a pass; it means the tripwire did not catch
 * anything.
 *
 * The pattern set below is deliberately **illustrative, not exhaustive**. The
 * gate is not "we recognise these six spellings of cascade" — the gate is
 * "a cascade requires a declaration". Projects add their own dialect with
 * `model.extraCascadePatterns` rather than waiting for a release (06c Rule 3:
 * config drives behaviour).
 *
 *   undeclared-cascade     a cascade declaration with no ownership declaration
 *   delete-then-reinsert   rebuild-by-delete over one table/collection
 *
 * Both are waivable with `asf-model-accept: <reason>` — greppable, so an accepted
 * exception stays visible instead of becoming a silent pass.
 */

/**
 * Declarations whose documented meaning is "deleting the parent takes the
 * children". Relational, ORM-mapped and object-store alike — the *concept* is
 * what matters, not which store expresses it. Extend via config.
 */
const CASCADE_DECL_RES = [
  { marker: "ON DELETE CASCADE", re: /\bON\s+DELETE\s+CASCADE\b/i },
  { marker: "onDelete: Cascade", re: /\bon_?delete\s*[:=]\s*:?\s*["']?cascade["']?/i },
  { marker: "on_delete=models.CASCADE", re: /\bon_delete\s*=\s*\w+\.CASCADE\b/ },
  { marker: "dependent: :destroy", re: /\bdependent\s*(?::|=>)\s*:(?:destroy|delete_all)\b/ },
  { marker: "cascade remove", re: /\b(?:CascadeType\s*\.\s*(?:REMOVE|ALL)|DeleteBehavior\s*\.\s*Cascade|orphanRemoval\s*=\s*true)\b/ },
  { marker: 'cascade = "…delete…"', re: /\bcascade\s*=\s*["'][^"']*delete/i },
];

/**
 * Hand-written cascades in stores that enforce nothing (P27, 06j §5).
 *
 * A relational FK action and an ORM mapping attribute at least announce
 * themselves. In a document, key-value, wide-column or search store there is no
 * constraint to declare, so the cascade exists only as code someone wrote —
 * which is exactly where an instance silently inherits its parent's lifecycle.
 * These patterns look for a MULTI-delete driven by a reference to another
 * entity: the shape of "when the parent goes, these go too", implemented by
 * hand and nowhere written down.
 *
 * Illustrative, not exhaustive: a project adds its own dialect with
 * `extraHandWrittenPatterns`. A fire here asks for a declaration; it does not
 * claim the ownership is wrong — that judgement stays in review.
 */
const HANDWRITTEN_CASCADE_RES = [
  { marker: "MongoDB/Mongoose deleteMany by reference", store: "document", re: /\.(?:deleteMany|remove|bulkDelete|destroyAll)\s*\(/ },
  {
    // Firestore spells a field name as an argument, not as a key:
    // `where('postId', '==', id)`. The recursive subcollection delete is the
    // classic way an instance inherits its parent's lifecycle here, and there
    // is no constraint to enforce it — so the reference is a quoted field name.
    marker: "Firestore collectionGroup / recursive delete",
    store: "document",
    re: /\.collectionGroup\s*\(|\bdeleteCollectionGroup\b|\bdeleteDoc\b|\.where\s*\(/i,
    refRe: /["'`][\w.]*?(?:Id|_id)["'`]/,
  },
  { marker: "DynamoDB batch/point delete", store: "wide-column", re: /\b(?:DeleteItem|BatchWriteItem|deleteItem|batchWrite)\b/ },
  {
    // CouchDB has no cascade either: a set of documents is selected and marked
    // `_deleted` in one bulk write. The selection IS the ownership decision, so
    // this dialect carries its own reference test (null = the marker suffices).
    marker: "CouchDB bulk delete",
    store: "document",
    re: /_deleted\s*[:=]\s*true|\bbulkDocs\s*\([^)]*_deleted/i,
    refRe: null,
  },
  {
    // A key-pattern wipe is the key-value store's cascade: everything under the
    // parent's prefix goes with it. The `*` is the reference — there is no key
    // to look for, so this dialect carries its own.
    marker: "Redis key-pattern wipe",
    store: "key-value",
    re: /\.(?:keys|scan)\s*\([^)]*\*|\b(?:del|unlink)\s*\(/i,
    refRe: /["'`][^"'`]*\*|\b\w*(?:Id|_id)\b/,
  },
  { marker: "Elasticsearch delete-by-query", store: "search", re: /(?:\.|_)delete_?by_?\s*query\s*\(|\bdeleteByQuery\b/i },
];

/**
 * A key that names ANOTHER entity rather than the row's own identity. This is
 * what turns "a delete happened" into "a cascade was implemented by hand":
 * `deleteOne({ id })` is a row removing itself, `deleteMany({ userId })` is one
 * entity deciding the fate of another.
 */
const PARENT_REF_RE =
  /(?:^|[{,(\s])(?!id\b|_id\b|pk\b|key\b|rowId\b|selfId\b)[A-Za-z][A-Za-z0-9]*(?:Id|_id)\s*[:=]/;

/**
 * The same reference written as ES6 object shorthand — `deleteMany({ userId })`
 * rather than `deleteMany({ userId: userId })`. Extremely common, and anchored
 * to a brace pair so a bare `orderId` sitting in an enclosing parameter list
 * does not turn an unrelated delete into a finding.
 */
const PARENT_REF_SHORTHAND_RE = /\{[^{}]*\b(?!id\b|_id\b|pk\b|key\b|rowId\b|selfId\b)[A-Za-z][A-Za-z0-9]*(?:Id|_id)\b[^{}]*\}/;

/** Writes and deletions, matched on verb shape rather than store dialect. */
const DELETE_VERBS = /^(deleteMany|deleteOne|deleteAll|destroyAll|bulkDelete|delete|remove|removeAll|destroy)$/i;
const INSERT_VERBS = /^(insertMany|insertOne|createMany|bulkCreate|bulkWrite|insert|insertAll|save|upsert|create)$/i;
/** Verbs that also exist on in-memory collections — trusted only in store files. */
const AMBIGUOUS_VERBS = /^(delete|remove|removeAll|destroy|save|upsert|create|insert)$/i;

/** Method calls, matched on the verb; the target is resolved per call. */
const VERB_RE = /\.([A-Za-z_$][\w$]*)\s*\(/g;
const SQL_DELETE_RE = /\bDELETE\s+FROM\s+([`"\[]?[\w.]+)/gi;
const SQL_INSERT_RE = /\bINSERT\s+INTO\s+([`"\[]?[\w.]+)/gi;
const NAMED_TARGET_RE = /\b(?:collection|from|table|model|entity)\s*\(\s*["']([\w.\-]+)["']/i;

/** What a call at `idx` acts on: a named target, else the receiver's last name. */
function targetBefore(line, idx) {
  const before = line.slice(0, idx);
  const named = NAMED_TARGET_RE.exec(before);
  if (named) return named[1];
  let cleaned = before.replace(/\s+$/, "");
  if (cleaned.endsWith("))")) cleaned = cleaned.replace(/\([^()]*\)$/, "");
  cleaned = cleaned.replace(/[.(\s]+$/, "");
  const m = /([A-Za-z_$][\w$]*)$/.exec(cleaned);
  return m ? m[1] : null;
}

/** A file that demonstrably talks to a store — needed to trust ambiguous verbs. */
const PERSISTENCE_SIGNAL_RE =
  /\b(createTable|CREATE\s+TABLE|migrat|schema|@Entity|@Table|__tablename__|@@model|defineSchema|collection|repository|session|transaction|BEGIN|COMMIT)\b/i;

/** Statements that name a table; used to find the child of a cascade. */
const SQL_TABLE_RE = /\b(?:ALTER|CREATE|DROP)\s+TABLE\s+(?:IF\s+(?:NOT\s+)?EXISTS\s+)?([`"\[]?[\w.]+)/i;
const DECL_BLOCK_RE = /^\s*(?:class|model|type|table|collection|resource|entity)\s+["']?([A-Za-z_][\w]*)["']?/im;
const TABNAME_RE = /__tablename__\s*=\s*["']([\w.]+)["']/i;

/** `asf-model:` declares; `asf-model-accept:` waives. Both stay greppable. */
const TAG_RE = /asf-model(-accept)?\s*:/i;

const IDENT = (s) =>
  String(s || "")
    .replace(/[`"\[\]\s]/g, "")
    .split(".")
    .pop()
    .toLowerCase();

/** Compile project-supplied dialect additions; invalid patterns are dropped. */
export function extraCascadePatterns(cfg) {
  const out = [];
  for (const p of (cfg && cfg.extraCascadePatterns) || []) {
    if (typeof p !== "string" || !p) continue;
    try {
      out.push({ marker: `custom: ${p}`, re: new RegExp(p, "i") });
    } catch {
      /* invalid regex — ignore rather than crash the gate */
    }
  }
  return out;
}

/**
 * Project-supplied dialect for the hand-written-cascade rule, same contract as
 * extraCascadePatterns: a bad regex is skipped, never fatal. A project whose
 * store is not in the illustrative set adds its own spelling rather than
 * waiting for a release.
 */
export function extraPatterns(list, markerPrefix) {
  const out = [];
  for (const p of list || []) {
    if (typeof p !== "string" || !p) continue;
    try {
      out.push({ marker: `${markerPrefix}: ${p}`, store: "project-declared", re: new RegExp(p, "i") });
    } catch {
      /* invalid regex — ignore rather than crash the gate */
    }
  }
  return out;
}

/** The collection/table a statement acts on, when it names one. */
export function targetOfStatement(stmt) {
  const named = /\b(?:collection|from|table|model|entity|index)\s*\(\s*["']([\w.\-]+)["']/i.exec(stmt);
  if (named) return named[1];
  const receiver = /(?:^|[\s;}])([A-Za-z_$][\w$]*)\s*(?:\.\s*(?:deleteMany|deleteOne|delete|remove|bulkDelete|destroyAll|deleteByQuery|bulkDocs|keys|scan|del|unlink|deleteItem|batchWrite)\s*\()/i.exec(stmt);
  return receiver ? receiver[1] : null;
}

/** Distance in lines to the nearest preceding asf-model tag, or null. */
export function nearestTag(lines, idx, windowLines) {
  for (let d = 0; d <= windowLines; d++) {
    const i = idx - d;
    if (i < 0) break;
    const m = TAG_RE.exec(lines[i]);
    if (m) return { distance: d, accept: Boolean(m[1]) };
  }
  return null;
}

/** The table/collection a cascade at `idx` belongs to (the child, not the parent). */
export function childTableAt(lines, idx, lookback = 12) {
  for (let i = idx; i >= Math.max(0, idx - lookback); i--) {
    const t = SQL_TABLE_RE.exec(lines[i]);
    if (t) return IDENT(t[1]);
    const tn = TABNAME_RE.exec(lines[i]);
    if (tn) return IDENT(tn[1]);
    const c = DECL_BLOCK_RE.exec(lines[i]);
    if (c) return IDENT(c[1]);
  }
  return null;
}

/** Text of the statement containing `idx` (SQL: back to ; and forward to ;). */
export function enclosingStatement(lines, idx, span = 15) {
  let start = idx;
  while (start > 0 && !/[;]\s*$/.test(lines[start - 1]) && idx - start < span) start--;
  let end = idx;
  while (end < lines.length - 1 && !/[;]\s*$/.test(lines[end]) && end - idx < span) end++;
  return lines.slice(start, end + 1).join("\n");
}

/** Delete/insert events, matched on verb shape — no per-store dialect table. */
function collectEvents(lines, trustedFile) {
  const deletes = [];
  const inserts = [];
  const add = (arr, line, target) => {
    const t = IDENT(target);
    if (t && t.length > 1) arr.push({ line, target: t });
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const m of line.matchAll(SQL_DELETE_RE)) add(deletes, i, m[1]);
    for (const m of line.matchAll(SQL_INSERT_RE)) add(inserts, i, m[1]);

    VERB_RE.lastIndex = 0;
    let m;
    while ((m = VERB_RE.exec(line))) {
      const verb = m[1];
      // `map.delete(x)` and `list.remove(x)` are not persistence calls: trust the
      // ambiguous verbs only where the file demonstrably talks to a store.
      if (AMBIGUOUS_VERBS.test(verb) && !trustedFile) continue;
      const target = targetBefore(line, m.index);
      if (DELETE_VERBS.test(verb)) add(deletes, i, target);
      else if (INSERT_VERBS.test(verb)) add(inserts, i, target);
    }
  }
  return { deletes, inserts };
}

/**
 * Scan one file's text. Pure — no IO. `cfg` is the `model` config block.
 * Returns findings sorted by line.
 */
export function scanModelSource(relPath, text, cfg = {}) {
  const lines = String(text).split(/\r?\n/);
  const findings = [];
  // File-level opt-out lives here so every entry point honours it. It stays
  // greppable — an opt-out nobody can find is a silent pass.
  if (/\basf-model-ignore\b/i.test(text)) return findings;
  const window = cfg.rebuildWindowLines || 30;
  const tagWindow = cfg.declarationWindowLines || 8;
  const cascades = [...CASCADE_DECL_RES, ...extraCascadePatterns(cfg)];

  // ── F1: a cascade that nobody declared ───────────────────────────────────
  if (cfg.requireDeclaration !== false) {
    for (let i = 0; i < lines.length; i++) {
      const hit = cascades.find((c) => c.re.test(lines[i]));
      if (!hit) continue;
      if (nearestTag(lines, i, tagWindow)) continue;
      const child = childTableAt(lines, i);
      findings.push({
        rule: "undeclared-cascade",
        file: relPath,
        line: i + 1,
        table: child,
        marker: hit.marker,
        message: `${hit.marker}${child ? ` on ${child}` : ""} has no ownership declaration — add \`asf-model: ${child || "<child>"} -> <parent> = composition|instance|ledger, owner: <who>\` within ${tagWindow} lines above (06j §2).`,
      });
    }
  }

  // ── F2: rebuild-by-delete over one table/collection ─────────────────────
  if (cfg.deleteRebuild !== false) {
    const { deletes, inserts } = collectEvents(lines, PERSISTENCE_SIGNAL_RE.test(text) || PERSISTENCE_PATH_RE.test(relPath));
    const reported = new Set();
    for (const d of deletes) {
      for (const ins of inserts) {
        if (ins.target !== d.target) continue;
        if (Math.abs(ins.line - d.line) > window) continue;
        const key = `${d.target}:${d.line}`;
        if (reported.has(key)) continue;
        reported.add(key);
        if (nearestTag(lines, Math.max(d.line, ins.line), tagWindow)) continue;
        findings.push({
          rule: "delete-then-reinsert",
          file: relPath,
          line: d.line + 1,
          table: d.target,
          marker: "delete + insert",
          message: `${d.target} is deleted (line ${d.line + 1}) and re-inserted (line ${ins.line + 1}) within ${window} lines — rebuild-by-delete destroys row identity and any state attached to those rows (06j M3). Upsert on a stable identity, or waive with \`asf-model-accept: <reason>\`.`,
        });
      }
    }
  }

  // ── F3: a cascade implemented by hand in a store that enforces nothing ───
  //
  // The store-agnostic half of the gate. MongoDB, Firestore, DynamoDB, CouchDB,
  // Redis and Elasticsearch have no FK action to inspect, so "the parent takes
  // the children" exists only as a delete someone wrote. Catching it here is
  // the difference between a model gate that reads as SQL-only and one that
  // actually asks the question wherever the defect can happen.
  if (cfg.handWrittenCascade !== false) {
    const handWritten = [...HANDWRITTEN_CASCADE_RES, ...extraPatterns(cfg.extraHandWrittenPatterns, "custom hand-written cascade")];
    for (let i = 0; i < lines.length; i++) {
      const hit = handWritten.find((c) => c.re.test(lines[i]));
      if (!hit) continue;
      // The delete must be driven by a reference to another entity, else every
      // ordinary `deleteOne({ id })` in a Mongo project would fire. `refRe: null`
      // means the dialect's own marker already carries that meaning.
      const stmt = enclosingStatement(lines, i);
      const refRe = hit.refRe === undefined ? PARENT_REF_RE : hit.refRe;
      if (refRe && !refRe.test(stmt) && !PARENT_REF_SHORTHAND_RE.test(stmt)) continue;
      if (nearestTag(lines, i, tagWindow)) continue;
      const child = childTableAt(lines, i) || targetOfStatement(stmt);
      findings.push({
        rule: "handwritten-cascade",
        file: relPath,
        line: i + 1,
        table: child,
        marker: hit.marker,
        store: hit.store,
        message: `${hit.marker}${child ? ` over ${child}` : ""} deletes by a reference to another entity — in a ${hit.store} store nothing enforces that, so this IS the cascade decision. Add \`asf-model: ${child || "<child>"} -> <parent> = composition|instance|ledger, owner: <who>\` within ${tagWindow} lines above, or \`asf-model-accept: <reason>\` (06j §2, §5).`,
      });
    }
  }

  return findings.sort((a, b) => a.line - b.line || a.rule.localeCompare(b.rule));
}

/** File names that are persistence-shaped even when the extension is not. */
const PERSISTENCE_PATH_RE =
  /(\/|^)(migrations?|alembic|db|dao|repositories?|repos?|models?|entities|stores?|collections?|schema|persistence)\/|\.sql$|\.prisma$/i;

const SQL_EXT_RE = /\.sql$/i;
/** Schema DSLs are persistence code even though they are not "source". */
const DSL_EXT_RE = /\.(?:prisma|proto|avsc|edn)$/i;
const CODE_EXT_RE = /\.(?:js|jsx|mjs|cjs|ts|tsx|mts|cts|py|rb|php|java|kt|cs|go|rs|ex|exs|scala)$/i;

/** Which of the listed files should the model level look at? */
export function isModelRelevant(relPath) {
  return SQL_EXT_RE.test(relPath) || DSL_EXT_RE.test(relPath) || CODE_EXT_RE.test(relPath);
}

/**
 * Does the project have anything for this level to inspect? Name-based, so a
 * project whose persistence layer sits somewhere unusual sees `scanned: 0` in
 * the report rather than a silent pass — say so in the delivery report.
 */
export function hasPersistenceFiles(files) {
  return (files || []).some((f) => SQL_EXT_RE.test(f) || DSL_EXT_RE.test(f) || PERSISTENCE_PATH_RE.test(f));
}

/**
 * Scan a project. `files` and `readFile` are injectable for tests.
 * Returns { findings, scanned, errors }.
 */
export async function scanModel(root, { files, readFile, config } = {}) {
  const fs = readFile || (await import("node:fs/promises")).readFile;
  const list = files || (await import("./run.mjs")).listSourceFiles(root, null);
  const findings = [];
  const errors = [];
  let scanned = 0;

  for (const rel of list) {
    if (!isModelRelevant(rel)) continue;
    let text;
    try {
      text = await fs(`${root}/${rel}`, "utf-8");
    } catch (err) {
      errors.push(`${rel}: ${err.message}`);
      continue;
    }
    if (/\basf-model-ignore\b/i.test(text)) continue; // file-level opt-out, greppable
    scanned++;
    findings.push(...scanModelSource(rel, text, config));
  }

  return { findings, scanned, errors };
}

export const MODEL_RULES = ["undeclared-cascade", "delete-then-reinsert", "handwritten-cascade"];
