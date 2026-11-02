/**
 * Task-scoped drift (W2.1).
 *
 * Repo-wide documentation drift was considered and rejected: it presumes the
 * documentation exists and is maintained, and products legitimately evolve, so a
 * repo-wide check produces permanent noise that gets switched off — which is worse
 * than never having it. What is checked instead is narrower and always available:
 * the claims THIS task wrote about itself (its PLAN.md, its captured specs, its
 * design document) against the code as it stands now.
 *
 * That is the same claim/evidence split as everywhere else in ASF: an artifact that
 * names `lib/gates/ledger.mjs` or `deriveSuiteRun()` is making a checkable assertion.
 * If the file is gone or the symbol no longer exists, the artifact is stale and the
 * delivery report is describing something that is not there.
 *
 * A scan that extracts no claims is reported as such. "Nothing found" and "nothing
 * looked at" are different results, and conflating them is how a guard goes green
 * while doing nothing.
 */

const SOURCE_EXT = /\.(ts|mts|tsx|js|mjs|cjs|jsx|py|go|rs|java|kt|swift|c|cc|cpp|h|hpp|rb|php|sh|sql|json|yaml|yml)$/i;
const BACKTICK = /`([^`\n]{2,140})`/g;

/**
 * Pull the checkable assertions out of an artifact.
 * Kinds:
 *   file   — a backticked path (contains "/" or carries a source/document extension)
 *   symbol — a backticked identifier, optionally call-shaped `foo()` or `Foo#bar`
 */
export function extractClaims(text) {
  const claims = [];
  const seen = new Set();
  let m;
  let line = 1;
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    BACKTICK.lastIndex = 0;
    let mm;
    while ((mm = BACKTICK.exec(lines[i]))) {
      const raw = mm[1].trim();
      if (!raw || /\s/.test(raw) && !/^\w+#\w+$/.test(raw)) continue;
      const cleaned = raw.replace(/^\.\//, "").replace(/:[0-9]+(-[0-9]+)?$/, "");
      const isPath = cleaned.includes("/") || /\.[a-z0-9]{1,6}$/i.test(cleaned);
      const isSymbol = /^[A-Za-z_$][\w$]*(\([^)]*\))?$/.test(cleaned) || /^\w+#\w+$/.test(cleaned);
      if (!isPath && !isSymbol) continue;
      const kind = isPath && !cleaned.endsWith("()") ? "file" : "symbol";
      const value = cleaned.replace(/\(\)$/, "");
      const key = `${kind}:${value}`;
      if (seen.has(key)) continue;
      seen.add(key);
      claims.push({ kind, value, line: i + 1, raw });
    }
  }
  return claims;
}

function walk(dir, fs, out = [], depth = 0) {
  if (depth > 8) return out;
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.name === ".git" || e.name === "node_modules" || e.name === "dist" || e.name === "coverage") continue;
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) walk(p, fs, out, depth + 1);
    else if (SOURCE_EXT.test(e.name)) out.push(p);
  }
  return out;
}

/**
 * @param {object} input
 * @param {Array<{path:string, text:string}>} input.artifacts  the task's own artifacts
 * @param {string} input.repoRoot
 * @param {object} input.fs                                     injectable for tests
 * @param {string[]} [input.ignore]                             claim values to skip (documented exceptions)
 */
export function checkDrift({ artifacts = [], repoRoot, fs, ignore = [] }) {
  const ignored = new Set(ignore);
  const sources = walk(repoRoot, fs);
  const sourceSet = new Set(sources.map((p) => p.replace(`${repoRoot}/`, "")));
  const symbolCache = new Map();
  const hasSymbol = (name) => {
    if (symbolCache.has(name)) return symbolCache.get(name);
    const re = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
    for (const f of sources) {
      let body = "";
      try {
        body = fs.readFileSync(f, "utf8");
      } catch {
        continue;
      }
      if (re.test(body)) {
        symbolCache.set(name, true);
        return true;
      }
    }
    symbolCache.set(name, false);
    return false;
  };

  const claims = [];
  const unresolved = [];
  for (const artifact of artifacts) {
    for (const c of extractClaims(artifact.text)) {
      if (ignored.has(c.value)) continue;
      claims.push({ ...c, artifact: artifact.path });
      const ok = c.kind === "file" ? sourceSet.has(c.value) : hasSymbol(c.value);
      if (!ok) unresolved.push({ ...c, artifact: artifact.path });
    }
  }

  const checked = claims.length;
  return {
    checked,
    unresolved,
    // A scan that looked at nothing is not a clean scan. Reported separately so a
    // caller cannot mistake "0 unresolved" for "the artifact still matches the code".
    status: checked === 0 ? "no-claims" : unresolved.length ? "drift" : "clean",
    sourcesScanned: sources.length,
  };
}

/**
 * Render the finding the way the delivery report wants it: name the artifact and the
 * stale claim, so the operator can act without re-reading the document.
 */
export function renderDrift(result) {
  if (result.status === "no-claims") {
    return "drift: no checkable claims were found in the task artifacts — this is not a pass, the artifact names no files or symbols";
  }
  if (!result.unresolved.length) return `drift: clean — ${result.checked} claim(s) in the task artifacts all resolve against the source`;
  return [
    `drift: ${result.unresolved.length} of ${result.checked} claim(s) in the task artifacts no longer resolve:`,
    ...result.unresolved.map((u) => `  ${u.artifact}:${u.line} — ${u.kind} ${u.value}`),
  ].join("\n");
}
