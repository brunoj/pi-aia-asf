/**
 * Backfill: adopting a project's decisions when there is no register to read.
 *
 * The spec is "ASF writes one at the first opportunity by analysing what is already
 * there", and the trap in that sentence is *analysing*. A model can invent a plausible
 * rationale for a choice nobody made, and a register of invented rationale is worse than
 * an empty one: it is cited later as if it were history. So this module never writes a
 * record. It answers three questions ASF can answer from files and git alone —
 *
 *   is there a register at all, what evidence is there to recover decisions FROM,
 *   and which of that evidence is already covered by a record —
 *
 * and hands the list to the agent, who is the only party that can say what a choice was
 * for. What the agent writes is constrained by the schema: `origin: backfill` requires
 * `source: [path or commit]`, and `check` refuses a recovered record that cites nothing.
 * Non-destructive and idempotent by construction — a source already covered by a record
 * is not offered again, and a human-written file is never opened for writing.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

/** Where a register lives by default, and the one place backfill never reads as foreign. */
const ASF_DIR = ".asf";
const SKIP_DIRS = new Set([
  "node_modules", ".git", "dist", "build", "out", "coverage", "vendor", "__pycache__",
  ".venv", "venv", ".next", ".cache", "target", ".venv-test",
]);
const SOURCE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|kt|rb|php|cs|c|h|cpp|hpp|swift|scala|sql|sh)$/;
const MAX_DEPTH = 3;
const MAX_ENTRIES_PER_DIR = 200;

/**
 * One bounded walk over the project. A single options object, because the walk needs the
 * root (for relative paths), the current directory, the depth, the visitor, the
 * accumulator and two skip sets — seven positional parameters is how a call site silently
 * swaps two of them. `onFile` takes one object too: every visitor wanted all four.
 */
function walk({ root, dir = root, depth = 0, onFile, out, skipDirs = SKIP_DIRS, skipPaths = new Set() }) {
  if (depth > MAX_DEPTH) return out;
  let names = [];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return out;
  }
  // Filter FIRST, then cap. Capping the raw names meant a directory whose first 200
  // entries were node_modules/.git/dist never had its real source seen — so `hasSource`
  // said "no code here" for an ordinary repo and the whole offer was silently withheld.
  const kept = names.filter((n) => !skipDirs.has(n)).slice(0, MAX_ENTRIES_PER_DIR);
  for (const name of kept) {
    const abs = path.join(dir, name);
    let st;
    try {
      st = fs.lstatSync(abs);
    } catch {
      continue;
    }
    // A symlink out of the project is not "the project's files": following one reads, and
    // later cites, content the operator never put under the root.
    if (st.isSymbolicLink()) continue;
    if (st.isDirectory()) {
      // ASF's own home is not a foreign register, at any depth (a nested `.asf/` in a
      // monorepo is somebody else's ASF, not a document to adopt).
      if (name === ASF_DIR || skipPaths.has(abs)) continue;
      walk({ root, dir: abs, depth: depth + 1, onFile, out, skipDirs, skipPaths });
    } else if (st.isFile()) {
      onFile({ root, abs, name, out });
    }
  }
  return out;
}

const rel = (root, abs) => path.relative(root, abs).split(path.sep).join("/");

/** Does the project have any source at all? (A docs-only repo has nothing to recover.) */
/**
 * The register's own top-level directory (or directories), so a configured
 * `decisions.dir` is not offered back to the agent as a foreign ADR to "adopt".
 * Hard-coding `.asf` at depth 0 was the bug: with the register configured elsewhere, ASF
 * told the agent to duplicate its own records.
 */
function registerPaths(root, config = {}) {
  const out = new Set([path.join(root, ASF_DIR)]);
  const cfgd = String(config?.decisions?.dir || config?.["decisions.dir"] || "").trim();
  if (cfgd) {
    const abs = path.resolve(root, cfgd);
    // Only the register itself, never its parent: skipping the first path segment meant a
    // register configured at `docs/adr` hid every ADR under `docs/`, including the
    // project's genuine foreign ones.
    if (abs === root || abs.startsWith(root + path.sep)) out.add(abs);
  }
  return out;
}

export function hasSource(root) {
  try {
    const hit = walk({
      root,
      onFile: ({ name, out }) => {
        if (!out.done && SOURCE_EXT.test(name)) out.done = true;
      },
      out: { done: false },
    });
    return hit.done === true;
  } catch {
    return false;
  }
}

/**
 * ADR-shaped markdown that is NOT ASF's own register — MADR, eADR, Nygard, or a
 * hand-written `docs/decisions/`. Adopting these is the difference between a project
 * that "has no decisions" and one whose decisions were simply written by a human first.
 */
export function findForeignAdrs(root, config = {}) {
  const found = [];
  const skipPaths = registerPaths(root, config);
  walk({
    root,
    skipPaths,
    onFile: ({ root: r, abs, name }) => {
      if (!name.toLowerCase().endsWith(".md")) return;
      const relPath = rel(r, abs);
      const inAdrDir = /(^|\/)(adrs?|decisions?|architecture-decisions?)\//i.test(relPath);
      // `/decision/i` alone matched `decision-tree.md` and `how-decisions-are-made.md`,
      // offering prose documentation as an ADR to adopt. An ADR is a numbered record, or a
      // file that says ADR on the tin.
      const namedAdr = /^(adr|decision)[-_]?\d+/i.test(name) || /\bADR\b/.test(name);
      if (!inAdrDir && !namedAdr) return;
      let title = "";
      let status = "";
      try {
        const text = fs.readFileSync(abs, "utf8");
        title = (text.match(/^#\s+(.+)$/m) || [])[1] || name.replace(/\.md$/i, "");
        status = ((text.match(/^\s*(?:status)\s*:\s*(.+)$/im) || [])[1] || "").trim();
      } catch {
        return;
      }
      found.push({ file: relPath, title: title.trim(), status });
    },
    out: found,
  });
  return found.sort((a, b) => a.file.localeCompare(b.file));
}

const CONFIG_PATTERNS = [
  [/^(tsconfig|jsconfig).*\.json$/, "compiler settings — strictness and targets are decisions"],
  [/^(\.eslintrc|eslint\.config|biome\.json|prettier\.)/, "lint/format rules — what the project refuses to allow"],
  [/^pyproject\.toml$/, "build/lint/test tooling choices"],
  [/^(Cargo\.toml|go\.mod|composer\.json|pom\.xml|build\.gradle)$/, "language and dependency policy"],
  [/^(dockerfile|containerfile)(\.|$)/i, "runtime/packaging choice"],
  [/^(docker-)?compose\.ya?ml$/, "topology of the running system"],
  [/^makefile$|^justfile$/i, "how the project is built and checked"],
  [/^(jest|vitest|pytest|playwright|cypress)\.config\./, "what is tested and how"],
  [/^\.github\/workflows\/.+\.ya?ml$/, "what CI makes mandatory — an enforced decision"],
  [/^(security|code-health)\.json$|^\.(nvmrc|python-version|tool-versions)$/, "declared environment/policy"],
];

/**
 * The evidence a register can be recovered from, as paths plus why each is worth a look.
 * Deliberately a LIST OF PLACES, not conclusions: reading them and deciding what was
 * chosen is the agent's job, and the schema makes the agent cite the one it used.
 */
/**
 * Commits that changed course — BREAKING, reverts, `refactor!:`. A commit is evidence of
 * a decision the code alone cannot show; the SHA is the citation, the subject is the hint.
 * Its own function because `inventory` was 52 lines and this half has nothing to do with
 * the file walk.
 */
function gitHistory(root) {
  try {
    const log = execFileSync("git", ["log", "--format=%H %s", "-n", "400"], { cwd: root, encoding: "utf8", timeout: 4000, stdio: ["ignore", "pipe", "ignore"] });
    return log
      .split("\n")
      .filter((l) => /BREAKING|revert|refactor|!:/i.test(l))
      .slice(0, 8)
      .map((line) => ({ sha: line.slice(0, 40).trim(), subject: line.slice(40).trim().slice(0, 70) }))
      .filter((h) => h.sha);
  } catch {
    return []; // no git, no history — the rest of the inventory stands
  }
}

export function inventory(root, { limit = 40, config = {} } = {}) {
  const sources = [];
  const seen = new Set();
  const add = (file, kind, hint) => {
    if (!file || seen.has(`${kind}:${file}`)) return;
    seen.add(`${kind}:${file}`);
    sources.push({ file, kind, hint });
  };

  const skipPaths = registerPaths(root, config);
  walk({
    root,
    skipPaths,
    onFile: ({ root: r, abs, name }) => {
      const relPath = rel(r, abs);
      for (const [re, hint] of CONFIG_PATTERNS) {
        if (re.test(name.toLowerCase()) || re.test(relPath.toLowerCase())) add(relPath, "config", hint);
      }
      if (SOURCE_EXT.test(name)) add(relPath, "source", "code — conventions here are decisions someone made");
    },
    out: sources,
  });

  for (const f of ["PLAN.md", "docs/PLAN.md", ".asf/PLAN.md", "ARCHITECTURE.md", "docs/ARCHITECTURE.md", "README.md"]) {
    if (fs.existsSync(path.join(root, f))) add(f, "plan", "stated intent — check it against what the code actually does");
  }
  for (const a of findForeignAdrs(root, config)) add(a.file, "adr", `already-written decision (${a.status || "no status"}) — adopt it, do not duplicate it`);

  for (const h of gitHistory(root)) {
    // Cite the SHA, keep the subject in the hint. A truncated commit subject used as the
    // citation value tells the agent to record prose as provenance, and `check` only
    // tests that `source` is non-empty — so the provenance field would be decoration.
    add(h.sha, "history", `a commit that changed course: ${h.subject}`);
  }

  if (fs.existsSync(path.join(root, "package.json"))) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
      const deps = Object.keys(pkg.dependencies || {}).slice(0, 12).join(", ");
      if (deps) add("package.json", "deps", `dependencies chosen: ${deps}`);
    } catch {
      /* unreadable manifest is not a reason to lose the rest */
    }
  }
  // Rank before the cap. Truncating in insertion order put generic source files first and
  // dropped the ADRs, CI workflows and dependency lists — the highest-value evidence — in
  // any repo with more than `limit` source files.
  const rank = { adr: 0, plan: 1, config: 2, deps: 3, history: 4, source: 5 };
  return sources.sort((a, b) => (rank[a.kind] ?? 9) - (rank[b.kind] ?? 9) || a.file.localeCompare(b.file)).slice(0, limit);
}

/**
 * Which inventory items a record already accounts for.
 *
 * This is what makes backfill idempotent: run it twice and the second pass offers only
 * what is genuinely still uncovered, because coverage is read from the records on disk
 * rather than from a marker file that can lie.
 */
export function coverage(records, sources, matchesAny) {
  const recs = records || [];
  const cited = new Set();
  for (const r of recs) {
    for (const s of [].concat(r.source || [])) cited.add(String(s).trim());
    for (const g of [].concat(r.applies_to || [])) cited.add(String(g).trim());
  }
  const globs = [...cited].filter((c) => /[*?]/.test(c));
  const exact = new Set([...cited].filter((c) => !/[*?]/.test(c)));
  const covered = [];
  const uncovered = [];
  for (const s of sources || []) {
    // `matchesAny` is the register's own glob matcher and it is the only correct answer:
    // the hand-rolled prefix match earlier let `src/**` cover `srcfoo/x.ts`, which marks
    // unrelated work as done and stops offering it — the unsafe direction to be wrong in.
    const hit = exact.has(s.file) || (globs.length > 0 && matchesAny(s.file, globs));
    (hit ? covered : uncovered).push(s);
  }
  return { covered, uncovered };
}

/**
 * The one steer that starts a backfill. Null when there is nothing to do: a project with
 * a register, or with no source to recover from, is left alone.
 *
 * It names the action that closes it and the ceiling on the work, because an open-ended
 * "go analyse the repo" is the kind of gap that never closes — and it says plainly that
 * ASF will not write the rationale, which is the whole point.
 */
export function backfillSteer({ records = [], foreign = [], uncovered = [], hasSource: sourceExists = true, max = 5 } = {}) {
  if ((records || []).length > 0) return null;
  if (!sourceExists) return null;
  const items = [];
  for (const f of foreign) items.push({ file: f.file, kind: "adr", hint: `already-written decision${f.status ? ` (${f.status})` : ""} — adopt it rather than writing a new one` });
  for (const u of uncovered) if (!items.some((i) => i.file === u.file)) items.push(u);
  if (!items.length) return null;
  const rows = items.slice(0, max).map((i) => `  - ${i.file} — ${i.hint}`).join("\n");
  return (
    `ASF: this project has no decision register, and this run is changing code in it. Recover the decisions that are ` +
    `already there rather than leaving the next agent to rediscover them — ASF will not write them for you, because a ` +
    `recovered rationale has to come from someone who can read the code (that is you, not a template).\n` +
    `Where to look:\n${rows}\n` +
    `For each one you can substantiate: asf_decisions action=record with origin: backfill and source: [<the path you actually read>] — ` +
    `a recovered record is accepted immediately and steers from the next run. Adopt an existing ADR instead of duplicating ` +
    `it. Write what the code and configs show; where the reason is not documented, write "not documented (recovered)" — ` +
    `never invent a rationale, because ASF will not write a reason nobody read. ${items.length > max ? `${items.length - max} more candidate(s): asf_decisions action=bootstrap. ` : ""}` +
    `${max} records is enough to start — this is a floor, not a migration, and it is one steer per run.`
  );
}
