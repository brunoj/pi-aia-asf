/**
 * The model gate's pattern tables.
 *
 * Kept apart from the scanners so the scanner reads as logic and the tables read
 * as a list: adding a dialect is a table edit, not a code change.
 */

export const CASCADE_DECL_RES = [
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
export const HANDWRITTEN_CASCADE_RES = [
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
export const PARENT_REF_RE =
  /(?:^|[{,(\s])(?!id\b|_id\b|pk\b|key\b|rowId\b|selfId\b)[A-Za-z][A-Za-z0-9]*(?:Id|_id)\s*[:=]/;

/**
 * The same reference written as ES6 object shorthand — `deleteMany({ userId })`
 * rather than `deleteMany({ userId: userId })`. Extremely common, and anchored
 * to a brace pair so a bare `orderId` sitting in an enclosing parameter list
 * does not turn an unrelated delete into a finding.
 */
export const PARENT_REF_SHORTHAND_RE = /\{[^{}]*\b(?!id\b|_id\b|pk\b|key\b|rowId\b|selfId\b)[A-Za-z][A-Za-z0-9]*(?:Id|_id)\b[^{}]*\}/;

/** Writes and deletions, matched on verb shape rather than store dialect. */
export const DELETE_VERBS = /^(deleteMany|deleteOne|deleteAll|destroyAll|bulkDelete|delete|remove|removeAll|destroy)$/i;
export const INSERT_VERBS = /^(insertMany|insertOne|createMany|bulkCreate|bulkWrite|insert|insertAll|save|upsert|create)$/i;
/** Verbs that also exist on in-memory collections — trusted only in store files. */
export const AMBIGUOUS_VERBS = /^(delete|remove|removeAll|destroy|save|upsert|create|insert)$/i;

/** Method calls, matched on the verb; the target is resolved per call. */
export const VERB_RE = /\.([A-Za-z_$][\w$]*)\s*\(/g;
export const SQL_DELETE_RE = /\bDELETE\s+FROM\s+([`"\[]?[\w.]+)/gi;
export const SQL_INSERT_RE = /\bINSERT\s+INTO\s+([`"\[]?[\w.]+)/gi;
export const NAMED_TARGET_RE = /\b(?:collection|from|table|model|entity)\s*\(\s*["']([\w.\-]+)["']/i;

/** What a call at `idx` acts on: a named target, else the receiver's last name. */
export function targetBefore(line, idx) {
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
export const PERSISTENCE_SIGNAL_RE =
  /\b(createTable|CREATE\s+TABLE|migrat|schema|@Entity|@Table|__tablename__|@@model|defineSchema|collection|repository|session|transaction|BEGIN|COMMIT)\b/i;

/** Statements that name a table; used to find the child of a cascade. */
export const SQL_TABLE_RE = /\b(?:ALTER|CREATE|DROP)\s+TABLE\s+(?:IF\s+(?:NOT\s+)?EXISTS\s+)?([`"\[]?[\w.]+)/i;
export const DECL_BLOCK_RE = /^\s*(?:class|model|type|table|collection|resource|entity)\s+["']?([A-Za-z_][\w]*)["']?/im;
export const TABNAME_RE = /__tablename__\s*=\s*["']([\w.]+)["']/i;

/** `asf-model:` declares; `asf-model-accept:` waives. Both stay greppable. */
export const TAG_RE = /asf-model(-accept)?\s*:/i;

export const IDENT = (s) =>
  String(s || "")
    .replace(/[`"\[\]\s]/g, "")
    .split(".")
    .pop()
    .toLowerCase();

/** Compile project-supplied dialect additions; invalid patterns are dropped. */

export const PERSISTENCE_PATH_RE =
  /(\/|^)(migrations?|alembic|db|dao|repositories?|repos?|models?|entities|stores?|collections?|schema|persistence)\/|\.sql$|\.prisma$/i;
