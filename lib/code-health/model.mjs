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

// The walker lives in files.mjs: importing it from run.mjs made the pair circular.
import {
  CASCADE_DECL_RES,
  HANDWRITTEN_CASCADE_RES,
  PARENT_REF_RE,
  PARENT_REF_SHORTHAND_RE,
  PERSISTENCE_SIGNAL_RE,
  PERSISTENCE_PATH_RE,
  DELETE_VERBS,
  INSERT_VERBS,
  AMBIGUOUS_VERBS,
  VERB_RE,
  SQL_DELETE_RE,
  SQL_INSERT_RE,
  NAMED_TARGET_RE,
  SQL_TABLE_RE,
  DECL_BLOCK_RE,
  TABNAME_RE,
  TAG_RE,
  IDENT,
  targetBefore,
} from "./model-patterns.mjs";


/**
 * Declarations whose documented meaning is "deleting the parent takes the
 * children". Relational, ORM-mapped and object-store alike — the *concept* is
 * what matters, not which store expresses it. Extend via config.
 */
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
/** F1: a cascade that nobody declared. */
function undeclaredCascades(lines, relPath, { cascades, tagWindow }) {
  const findings = [];
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
  return findings;
}

/** F2: rebuild-by-delete over one table/collection. */
function deleteRebuilds(lines, relPath, { tagWindow, window, text }) {
  const persisted = PERSISTENCE_SIGNAL_RE.test(text) || PERSISTENCE_PATH_RE.test(relPath);
  const { deletes, inserts } = collectEvents(lines, persisted);
  const findings = [];
  const reported = new Set();
  for (const d of deletes) {
    for (const ins of inserts) {
      if (ins.target !== d.target || Math.abs(ins.line - d.line) > window) continue;
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
  return findings;
}

/**
 * F3: a cascade implemented by hand in a store that enforces nothing.
 *
 * The store-agnostic half of the gate. MongoDB, Firestore, DynamoDB, CouchDB,
 * Redis and Elasticsearch have no FK action to inspect, so "the parent takes the
 * children" exists only as a delete someone wrote. Catching it here is the
 * difference between a model gate that reads as SQL-only and one that actually
 * asks the question wherever the defect can happen.
 */
function handwrittenCascades(lines, relPath, { cfg, tagWindow }) {
  const handWritten = [...HANDWRITTEN_CASCADE_RES, ...extraPatterns(cfg.extraHandWrittenPatterns, "custom hand-written cascade")];
  const findings = [];
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
  return findings;
}

export function scanModelSource(relPath, text, cfg = {}) {
  const lines = String(text).split(/\r?\n/);
  // File-level opt-out lives here so every entry point honours it. It stays
  // greppable — an opt-out nobody can find is a silent pass.
  if (/\basf-model-ignore\b/i.test(text)) return [];
  const ctx = {
    cfg,
    text,
    window: cfg.rebuildWindowLines || 30,
    tagWindow: cfg.declarationWindowLines || 8,
  };
  const findings = [];
  if (cfg.requireDeclaration !== false) {
    findings.push(...undeclaredCascades(lines, relPath, { cascades: [...CASCADE_DECL_RES, ...extraCascadePatterns(cfg)], tagWindow: ctx.tagWindow }));
  }
  if (cfg.deleteRebuild !== false) findings.push(...deleteRebuilds(lines, relPath, ctx));
  if (cfg.handWrittenCascade !== false) findings.push(...handwrittenCascades(lines, relPath, ctx));
  return findings.sort((a, b) => a.line - b.line || a.rule.localeCompare(b.rule));
}

export const MODEL_RULES = ["undeclared-cascade", "delete-then-reinsert", "handwritten-cascade"];
