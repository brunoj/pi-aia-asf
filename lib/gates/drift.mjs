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
/** Is this backticked token a checkable claim at all, and which kind? */
function classifyClaim(raw) {
  if (!raw) return null;
  if (/\s/.test(raw) && !/^\w+#\w+$/.test(raw)) return null;
  const cleaned = raw.replace(/^\.\//, "").replace(/:[0-9]+(-[0-9]+)?$/, "");
  const isPath = cleaned.includes("/") || /\.[a-z0-9]{1,6}$/i.test(cleaned);
  const isSymbol = /^[A-Za-z_$][\w$]*(\([^)]*\))?$/.test(cleaned) || /^\w+#\w+$/.test(cleaned);
  if (!isPath && !isSymbol) return null;
  const kind = isPath && !cleaned.endsWith("()") ? "file" : "symbol";
  return { kind, value: cleaned.replace(/\(\)$/, "") };
}

export function extractClaims(text) {
  const claims = [];
  const seen = new Set();
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    BACKTICK.lastIndex = 0;
    let mm;
    while ((mm = BACKTICK.exec(lines[i]))) {
      const raw = mm[1].trim();
      const claim = classifyClaim(raw);
      if (!claim) continue;
      const key = `${claim.kind}:${claim.value}`;
      if (seen.has(key)) continue;
      seen.add(key);
      claims.push({ ...claim, line: i + 1, raw });
    }
  }
  return claims;
}

const SKIP_DIRS = new Set([".git", "node_modules", "dist", "coverage"]);

function walk(dir, { fs, out = [], depth = 0 } = {}) {
  if (depth > 8) return out;
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) walk(p, { fs, out, depth: depth + 1 });
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
/** An artifact may be handed over with its text, or named by path. */
function artifactText(artifact, repoRoot, fs) {
  if (artifact.text !== undefined) return artifact.text;
  if (!artifact.path) return undefined;
  try {
    return fs.readFileSync(`${repoRoot}/${artifact.path}`.replace("//", "/"), "utf8");
  } catch {
    return undefined;
  }
}

/** Does this symbol appear anywhere in the scanned sources? (cached) */
function makeSymbolProbe(sources, fs, cache) {
  return (name) => {
    if (cache.has(name)) return cache.get(name);
    const re = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
    for (const f of sources) {
      let body = "";
      try {
        body = fs.readFileSync(f, "utf8");
      } catch {
        continue;
      }
      if (re.test(body)) {
        cache.set(name, true);
        return true;
      }
    }
    cache.set(name, false);
    return false;
  };
}

/**
 * @param {object} input
 * @param {Array<{path:string, text:string}>} input.artifacts  the task's own artifacts
 * @param {string} input.repoRoot
 * @param {object} input.fs                                     injectable for tests
 * @param {string[]} [input.ignore]                             claim values to skip (documented exceptions)
 */
/** Check one artifact's claims against the code. */
function checkArtifact(artifact, probe) {
  // An artifact that could not be read is examined-nothing, never a clean result.
  const text = artifactText(artifact, probe.repoRoot, probe.fs);
  if (text === undefined) return { unread: artifact.path || "(unnamed artifact)", claims: [], unresolved: [] };
  const claims = [];
  const unresolved = [];
  for (const c of extractClaims(text)) {
    if (probe.ignored.has(c.value)) continue;
    claims.push({ ...c, artifact: artifact.path });
    const ok = c.kind === "file" ? probe.sourceSet.has(c.value) : probe.hasSymbol(c.value);
    if (!ok) unresolved.push({ ...c, artifact: artifact.path });
  }
  return { unread: null, claims, unresolved };
}

export function checkDrift({ artifacts = [], repoRoot, fs, ignore = [] }) {
  const sources = walk(repoRoot, { fs });
  const probe = {
    repoRoot,
    fs,
    ignored: new Set(ignore),
    sourceSet: new Set(sources.map((p) => p.replace(`${repoRoot}/`, ""))),
    hasSymbol: makeSymbolProbe(sources, fs, new Map()),
  };

  const claims = [];
  const unresolved = [];
  const unread = [];
  for (const artifact of artifacts) {
    const r = checkArtifact(artifact, probe);
    if (r.unread) unread.push(r.unread);
    claims.push(...r.claims);
    unresolved.push(...r.unresolved);
  }

  const checked = claims.length;
  return {
    checked,
    unresolved,
    // A scan that looked at nothing is not a clean scan. Reported separately so a
    // caller cannot mistake "0 unresolved" for "the artifact still matches the code".
    unread,
    status: checked === 0 ? (unread.length ? "no-artifacts" : "no-claims") : unresolved.length ? "drift" : "clean",
    // Only a stale claim blocks the document-accuracy tick. "no-claims" and
    // "no-artifacts" are examined-nothing: they never block, and they never tick.
    blocking: unresolved.length > 0,
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
