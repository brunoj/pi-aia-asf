/**
 * What a decision record has to contain to be trusted.
 *
 * The register is only worth having if a record cannot *look* authoritative while
 * saying nothing. CI practice for ADRs is deliberately narrow — catch the things
 * that are obviously wrong, leave judgement to review — so these rules are
 * mechanical: required fields, known statuses, non-empty sections, real option
 * lists, id/filename agreement, supersession that points both ways, and the
 * acceptance evidence that makes `status: accepted` mean something.
 *
 * Two severities. **error** blocks a `decisions/**` change (it is obviously
 * wrong); **notice** is reported and never blocks (it is a human call — an
 * overdue review date, an unknown field, two decisions whose scopes overlap).
 * A judgement call dressed up as a gate produces noise, and noise is how a check
 * gets switched off.
 */

export const STATUSES = ["proposed", "accepted", "superseded", "deprecated", "retired", "rejected"];
export const ORIGINS = ["agent", "user", "backfill", "imported"];

export const FIELD_ORDER = [
  "id", "status", "title", "decision", "decided", "applies_to", "tags", "owners",
  "from_spec", "user_instructed", "plan", "origin", "source",
  "supersedes", "superseded_by", "review_by", "reopens_when",
  "enforced", "checks", "specs",
];

export const REQUIRED_FIELDS = ["id", "status", "title", "decided", "applies_to", "decision"];
export const BODY_SECTIONS = ["Decision", "Context", "Options considered", "Consequences"];
/** What `status: accepted` must be able to point at. */
export const ACCEPTANCE_FIELDS = ["from_spec", "user_instructed", "plan", "origin"];

const ID_RE = /^ADR-\d{4}$/;
const MIN_RULE_CHARS = 15;

/**
 * Find a section by the word it must start with, not by an exact heading.
 *
 * MADR writes "Context and Problem Statement" and "Decision Outcome"; a plain
 * record writes "Context" and "Decision". Both are the same section, and a
 * register that rejected the MADR spelling would push people away from the
 * format that has a decade of tooling behind it.
 */
function sectionText(sections, name) {
  if (Object.prototype.hasOwnProperty.call(sections, name)) return sections[name];
  const re = new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
  const key = Object.keys(sections).find((k) => re.test(k.trim()));
  return key === undefined ? undefined : sections[key];
}

const err = (rec, field, message) => ({ severity: "error", file: rec.__file, id: rec.id, field, message });
const notice = (rec, field, message) => ({ severity: "notice", file: rec.__file, id: rec.id, field, message });

function filled(v) {
  if (Array.isArray(v)) return v.filter((x) => String(x ?? "").trim()).length > 0;
  return String(v ?? "").trim().length > 0;
}

/** `## Section` bodies of a record, keyed by heading text. */
export function sectionsOf(body) {
  const out = {};
  let current = null;
  for (const line of String(body ?? "").split(/\r?\n/)) {
    const h = /^##\s+(.+?)\s*$/.exec(line);
    if (h) {
      current = h[1];
      out[current] = "";
      continue;
    }
    if (current) out[current] += `${line}\n`;
  }
  return out;
}

function countBullets(text) {
  return String(text || "").split(/\r?\n/).filter((l) => /^\s*[-*]\s+\S/.test(l)).length;
}

const OPTIONS_UNDOCUMENTED = /not documented|recovered/i;

function checkRequired(rec, problems) {
  for (const f of REQUIRED_FIELDS) {
    if (!filled(rec[f])) problems.push(err(rec, f, `required field "${f}" is missing or empty`));
  }
}

/** The id must agree with itself and with the file it lives in. */
function checkId(rec, problems) {
  if (!rec.id) return;
  if (!ID_RE.test(String(rec.id))) {
    problems.push(err(rec, "id", `id "${rec.id}" must look like ADR-0007`));
    return;
  }
  const num = String(rec.__file || "").match(/(\d{4})/);
  if (rec.__file && num && !String(rec.id).endsWith(num[1])) {
    problems.push(err(rec, "id", `id ${rec.id} does not match the file name ${rec.__file}`));
  }
}

function checkShape(rec, problems) {
  checkId(rec, problems);
  if (rec.status && !STATUSES.includes(rec.status)) {
    problems.push(err(rec, "status", `status "${rec.status}" is not one of ${STATUSES.join(", ")}`));
  }
  if (rec.origin && !ORIGINS.includes(String(rec.origin))) {
    problems.push(notice(rec, "origin", `origin "${rec.origin}" is unknown (expected ${ORIGINS.join(", ")})`));
  }
  for (const k of Object.keys(rec)) {
    if (k.startsWith("__") || k === "body") continue;
    if (!FIELD_ORDER.includes(k)) problems.push(notice(rec, k, `unknown field "${k}" is not read by ASF and will be ignored`));
  }
}

function checkRuleNotTopic(rec, problems) {
  const rule = String(rec.decision || "").trim();
  const title = String(rec.title || "").trim();
  if (!rule || !title) return;
  if (rule.length < MIN_RULE_CHARS) {
    problems.push(err(rec, "decision", `"${rule}" is too short to be a rule — say what must be done, not what the topic is`));
  }
  if (rule.toLowerCase() === title.toLowerCase()) {
    problems.push(err(rec, "decision", "the decision merely restates the title — an index line has to be actionable on its own"));
  }
}

function checkBody(rec, problems) {
  const sections = sectionsOf(rec.body);
  for (const s of BODY_SECTIONS) {
    const text = sectionText(sections, s);
    if (text === undefined) {
      problems.push(err(rec, "body", `missing "## ${s}" section`));
      continue;
    }
    if (!text.trim()) problems.push(err(rec, "body", `"## ${s}" is empty`));
  }
  const opts = sectionText(sections, "Options considered") || "";
  if (opts.trim() && countBullets(opts) < 2 && !OPTIONS_UNDOCUMENTED.test(opts)) {
    problems.push(err(rec, "body", "a decision with one option is not a decision — list 2+ real alternatives, or write \"not documented (recovered)\""));
  }
}

function checkAcceptance(rec, problems, ctx) {
  if (rec.status !== "accepted") return;
  const hasSpec = filled(rec.from_spec);
  const hasQuote = filled(rec.user_instructed);
  const hasPlan = filled(rec.plan) && ctx.planApproved === true;
  const recovered = String(rec.origin) === "backfill" && filled(rec.source);
  if (!hasSpec && !hasQuote && !hasPlan && !recovered) {
    problems.push(err(
      rec,
      "status",
      "status: accepted needs sufficient instruction — from_spec, user_instructed, an approved plan, or origin: backfill with source[]; until then it is proposed",
    ));
  }
  if (String(rec.origin) === "backfill" && !filled(rec.source)) {
    problems.push(err(rec, "source", "a recovered decision must cite where it came from — source: [path or commit]"));
  }
}

function checkSupersession(rec, problems, byId) {
  const target = (id) => {
    if (!id) return undefined;
    if (!byId.has(String(id))) {
      problems.push(err(rec, "supersedes", `points at ${id}, which is not in the register`));
      return undefined;
    }
    return byId.get(String(id));
  };
  if (rec.status === "superseded" && !filled(rec.superseded_by)) {
    problems.push(err(rec, "superseded_by", "status: superseded must name the record that replaced it"));
  }
  if (filled(rec.supersedes)) {
    const ids = Array.isArray(rec.supersedes) ? rec.supersedes : [rec.supersedes];
    for (const id of ids) {
      const older = target(id);
      if (older && String(older.superseded_by || "") !== String(rec.id)) {
        problems.push(err(rec, "supersedes", `${id} does not point back at ${rec.id} — supersession has to link both ways or both records look current`));
      }
    }
  }
  if (filled(rec.superseded_by)) target(rec.superseded_by);
}

/** `enforced: true` is a claim that a check exists — so the check must exist. */
function checkEnforcedClaims(rec, problems, ctx) {
  if (rec.enforced !== true) return;
  if (!filled(rec.checks)) {
    problems.push(err(rec, "checks", "enforced: true claims a check exists — name it in checks: [...] or set enforced: false"));
    return;
  }
  if (!ctx.exists) return;
  for (const c of (Array.isArray(rec.checks) ? rec.checks : [rec.checks])) {
    if (!ctx.exists(String(c))) problems.push(err(rec, "checks", `check "${c}" does not exist — a missing check is not enforcement`));
  }
}

function checkEnforcement(rec, problems, ctx) {
  checkEnforcedClaims(rec, problems, ctx);
  if (rec.review_by && !Number.isNaN(Date.parse(String(rec.review_by))) && Date.parse(String(rec.review_by)) < ctx.now) {
    problems.push(notice(rec, "review_by", `review was due ${rec.review_by} — re-confirm it or supersede the record`));
  }
}

/**
 * Validate one record.
 * @param {Record<string, unknown>} rec parsed front matter with `body` and `__file`
 * @param {{byId?: Map<string,object>, planApproved?: boolean, now?: number, exists?: (p:string)=>boolean}} [ctx]
 */
export function validateRecord(rec, ctx = {}) {
  const problems = [];
  const at = { now: Date.now(), ...ctx, byId: ctx.byId || new Map() };
  checkRequired(rec, problems);
  checkShape(rec, problems);
  checkRuleNotTopic(rec, problems);
  checkBody(rec, problems);
  checkAcceptance(rec, problems, at);
  checkSupersession(rec, problems, at.byId);
  checkEnforcement(rec, problems, at);
  return problems;
}

/**
 * Validate a whole register: per-record rules plus the cross-record ones —
 * duplicate ids, and two accepted decisions whose scope overlaps without any
 * supersession between them. The overlap is a *notice*: whether they truly
 * contradict each other is a human judgement, and ASF saying so is more useful
 * than a gate that guesses.
 */
export function validateRegister(records, ctx = {}) {
  const at = { now: Date.now(), ...ctx };
  const byId = new Map();
  const problems = [];
  for (const r of records || []) {
    const id = String(r.id || "");
    if (id && byId.has(id)) problems.push(err(r, "id", `duplicate id ${id} (also ${byId.get(id).__file})`));
    else if (id) byId.set(id, r);
  }
  for (const r of records || []) problems.push(...validateRecord(r, { ...at, byId }));
  const active = (records || []).filter((r) => r.status === "accepted");
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const a = active[i];
      const b = active[j];
      const linked = [a.supersedes, a.superseded_by, b.supersedes, b.superseded_by].flat().filter(Boolean).map(String);
      if (linked.includes(String(b.id)) || linked.includes(String(a.id))) continue;
      if ((a.applies_to || []).some((g) => (b.applies_to || []).includes(g))) {
        problems.push(notice(a, "applies_to", `${a.id} and ${b.id} are both accepted and govern the same paths with no supersession between them — check they do not contradict`));
      }
    }
  }
  return problems;
}
