/**
 * Review guards (W1.2, W1.3, W1.6, W3.3).
 *
 * These are the rules that decide whether a review actually happened, so they are
 * code and not prose: a rule about trustworthiness that lives only in markdown is a
 * rule an agent can satisfy by nodding (06b Rule 20's argument, applied to review).
 *
 * The failure this exists for is observed, not hypothetical: a read-only subagent
 * asked to report from a file that did not exist returned a confident reading of a
 * *different* file and exited 0. Exit status and confidence are both cheap. A citation
 * that resolves is not.
 */

export const REVIEW_DEFAULTS = Object.freeze({
  maxReviewers: 6,
  abForBlockers: true,
  maxReaudits: 2,
  maxConcurrent: 3,
  tokenCeilingMultiple: 6,
});

export const LENSES = Object.freeze([
  "asf-design-critic",
  "asf-codebase-fitness",
  "asf-zoom-out",
  "asf-comprehension",
  "asf-implementation-readiness",
  "asf-structural",
]);

export const SEVERITIES = Object.freeze(["Blocker", "Major", "Nit"]);

const FINDING = /^###\s+(.+?)\s+—\s+(Blocker|Major|Nit)\s*$/im;
const SCOPE = /\*\*Scope:\*\*\s*`?([^`\n]+?)`?\s*$/m;

/**
 * Resolve every `path` or `path:lines` a reviewer cited.
 * A citation that does not exist, or a line range outside the file, means the
 * reviewer cannot have read it: the report is rejected and recorded `not run`.
 */
/** `path:12-34` → file and range. */
function parseScope(scope) {
  const m = /^\s*(?:`?)([^\s:`]+)((?::\d+(?:-\d+)?)?)`?/.exec(scope || "");
  if (!m) return null;
  return {
    file: m[1],
    from: m[2] ? Number(m[2].slice(1).split("-")[0]) : null,
    to: m[2] && m[2].includes("-") ? Number(m[2].split("-")[1]) : null,
  };
}

/** Line count of a cited file, read once per file. */
function lineCount(abs, { fs, readCache }) {
  if (!readCache.has(abs)) readCache.set(abs, fs.readFileSync(abs, "utf8").split("\n").length);
  return readCache.get(abs);
}

/**
 * Why this finding's citation cannot stand, or null when it can.
 * A citation that cannot be resolved is not a weaker citation — it is no finding.
 */
function citationProblem(f, probe) {
  const cite = parseScope(f.scope);
  if (!cite || !cite.file) return "no resolvable citation in the scope";
  const abs = `${probe.repoRoot}/${cite.file.replace(/^\.\//, "")}`;
  if (!probe.existsCache.has(abs)) probe.existsCache.set(abs, probe.fs.existsSync(abs));
  if (!probe.existsCache.get(abs)) return `cited file does not exist: ${cite.file}`;
  if (!cite.from) return null;
  const lines = lineCount(abs, probe);
  if (cite.from > lines || (cite.to && cite.to > lines)) {
    return `cited range ${cite.file}:${cite.from}-${cite.to ?? cite.from} is outside the file (${lines} lines)`;
  }
  return null;
}

export function verifyCitations({ findings = [], repoRoot, fs, minCoverage = 1 }) {
  const probe = { repoRoot, fs, existsCache: new Map(), readCache: new Map() };
  const accepted = [];
  const rejected = [];
  for (const f of findings) {
    const problem = citationProblem(f, probe);
    if (problem) rejected.push({ ...f, reason: problem });
    else accepted.push(f);
  }

  const coverage = findings.length ? accepted.length / findings.length : 0;
  return {
    accepted,
    rejected,
    coverage: Number(coverage.toFixed(2)),
    // A report where nothing resolves is not a clean review — it is an absent one.
    status: findings.length === 0 ? "no-findings-submitted" : accepted.length === 0 ? "not run" : coverage < minCoverage ? "partial" : "completed",
  };
}

/**
 * Per-reviewer status. A lens that timed out, crashed, returned nothing, or had every
 * citation rejected is `not run` — never "zero findings".
 */
export function reviewerStatus({ results = [] }) {
  const rows = [];
  for (const r of results) {
    let status;
    if (r.error || r.timedOut) status = "not run";
    else if (!r.output || !String(r.output).trim()) status = "not run";
    else if (r.citationCheck && r.citationCheck.status === "not run") status = "not run";
    else status = "completed";
    rows.push({ lens: r.lens, status, findings: status === "completed" ? (r.citationCheck?.accepted.length ?? 0) : 0 });
  }
  return {
    rows,
    completed: rows.filter((r) => r.status === "completed").length,
    notRun: rows.filter((r) => r.status === "not run").map((r) => r.lens),
    render() {
      return ["| Reviewer | Status |", "| --- | --- |", ...rows.map((r) => `| \`${r.lens}\` | ${r.status} |`)].join("\n");
    },
  };
}

/** Findings must carry severity, scope and a recommendation — and merge across lenses. */
export function normalizeFindings(list = []) {
  const out = [];
  const seen = new Set();
  const invalid = [];
  for (const f of list) {
    if (!SEVERITIES.includes(f.severity) || !f.scope || !f.recommendation) {
      invalid.push(f);
      continue;
    }
    const key = `${f.severity}|${String(f.scope).replace(/\s+/g, " ")}|${String(f.finding).toLowerCase().replace(/\W+/g, " ").trim()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(f);
  }
  const rank = { Blocker: 0, Major: 1, Nit: 2 };
  out.sort((a, b) => rank[a.severity] - rank[b.severity]);
  return { findings: out, rejected: invalid };
}

/**
 * A/B duplication lifts recall, and recall is the expensive property — it is bought at
 * the blocker boundary, nowhere else.
 */
export function abAllowed({ phase, severities = [], config = REVIEW_DEFAULTS }) {
  if (!config.abForBlockers) return { allowed: false, reason: "review.abForBlockers is off" };
  if (phase !== "blocker-rereview") return { allowed: false, reason: `A/B is only for a blocker re-review, not "${phase}"` };
  if (!severities.includes("Blocker")) return { allowed: false, reason: "no blocker was reported, so there is nothing to re-review" };
  return { allowed: true, reason: "blocker boundary — two instances of the lens to lift recall" };
}

export { FINDING, SCOPE };
