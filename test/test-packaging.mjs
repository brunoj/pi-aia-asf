/**
 * THE ARTIFACT GATE.
 *
 * Why this exists: pi-aia-browser shipped 0.2.1 with a tarball missing a file its
 * own daemon imported, and every gate stayed green — typecheck reads the working
 * tree, the suite runs from the working tree, and `npm publish` only reports that
 * the upload was accepted. ASF has the same shape (index.ts + lib/ + skills/ +
 * obligations.d/ behind a hand-maintained `files` allowlist) and had no test for it.
 *
 * So this checks the PACKED file set — what npm would actually publish — and then
 * requires every file and directory package.json says it ships to really be there,
 * and every relative import inside the artifact to resolve inside it.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname, resolve as rresolve, relative } from "node:path";

const HERE = dirname(new URL(import.meta.url).pathname);
const REPO = join(HERE, "..");
const results = [];
const check = (name, cond, detail = "") => {
  results.push({ name, cond });
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${!cond && detail ? "  — " + String(detail).slice(0, 300) : ""}`);
};

const pkg = JSON.parse(readFileSync(join(REPO, "package.json"), "utf8"));

// ---------------------------------------------------------------------------
console.log("── 1 — the packed file set ──────────────────────────────────");
// ---------------------------------------------------------------------------
let packed = [];
let packErr = "";
try {
  const out = execFileSync("npm", ["pack", "--dry-run", "--json"], {
    cwd: REPO, encoding: "utf8", timeout: 180000, maxBuffer: 32 * 1024 * 1024,
  });
  const j = JSON.parse(out);
  const entry = Array.isArray(j) ? j[0] : j;
  packed = (entry?.files ?? []).map((f) => (f.path || "").replace(/^\.\//, "")).filter(Boolean);
} catch (e) {
  packErr = String(e.stderr || e.message).slice(0, 400);
}

check("npm pack --dry-run succeeds", packErr === "", packErr);
check("the artifact is not empty", packed.length > 0, `${packed.length} files`);
check("the extension entry point ships", packed.includes("index.ts"), packed.slice(0, 6).join(" "));
check(
  "the skill ships — ASF's instructions are the deliverable",
  packed.some((f) => f.startsWith("skills/aia-asf/")),
  packed.filter((f) => f.startsWith("skills/aia-asf/")).length + " skill files",
);
check(
  "the normative reference files ship with the skill",
  packed.filter((f) => /skills\/aia-asf\/references\/.*\.md$/.test(f)).length >= 5,
  packed.filter((f) => /references\/.*\.md$/.test(f)).length + " reference files",
);
check(
  "the lib/ modules ship",
  packed.some((f) => f.startsWith("lib/")),
  packed.filter((f) => f.startsWith("lib/")).slice(0, 3).join(" ") || "no lib/ entries",
);
check(
  "the declared obligations ship (the guard verifies them; without the file they silently do not exist)",
  packed.some((f) => f.startsWith("obligations.d/")),
  packed.filter((f) => f.startsWith("obligations.d/")).join(" ") || "no obligations.d/ entries",
);

// ---------------------------------------------------------------------------
console.log("\n── 2 — package.json's promises are kept ────────────────────");
// ---------------------------------------------------------------------------
for (const entry of pkg.files || []) {
  if (entry.endsWith("/")) {
    const dir = entry.replace(/\/$/, "");
    check(`files says "${entry}" — and it has content`, packed.some((f) => f.startsWith(dir + "/")), "nothing under it was packed");
  } else {
    check(`files says "${entry}" — and it is in the tarball`, packed.includes(entry), "not packed");
  }
}
check(
  "pi.extensions points at a file that ships",
  (pkg.pi?.extensions || []).length > 0 &&
    (pkg.pi.extensions || []).every((e) => packed.includes(String(e).replace(/^\.\//, ""))),
  JSON.stringify(pkg.pi?.extensions),
);
check(
  "pi.skills point at directories that ship",
  (pkg.pi?.skills || []).length > 0 &&
    (pkg.pi.skills || []).every((s) => packed.some((f) => f.startsWith(String(s).replace(/^\.\//, "") + "/"))),
  JSON.stringify(pkg.pi?.skills),
);
check("the version is plain semver (the release gate compares it to the registry)", /^\d+\.\d+\.\d+$/.test(pkg.version), pkg.version);

// ---------------------------------------------------------------------------
console.log("\n── 3 — every relative import inside the artifact resolves inside it ──");
// ---------------------------------------------------------------------------
const IMPORT_RE = /(?:from\s+|import\s*\(\s*|require\s*\(\s*)(["'])(\.\.?\/[^"']+?)\1/g;
const shipped = new Set(packed);
const missing = [];
let followed = 0;
for (const rel of packed) {
  if (!/\.(ts|mts|js|mjs)$/.test(rel)) continue;
  const abs = join(REPO, rel);
  if (!existsSync(abs)) continue;
  for (const m of readFileSync(abs, "utf8").matchAll(IMPORT_RE)) {
    const relTarget = relative(REPO, rresolve(dirname(abs), m[2])).replace(/\\/g, "/");
    followed++;
    // pi loads .ts directly (jiti) and this package imports its own modules with a
    // `.js` specifier; and a .d.mts declaration file names its sibling as
    // `./x.d.mjs`, which is the ESM declaration convention, not a missing file. The
    // resolver has to follow the same mapping the loader does, or it invents defects.
    const base = relTarget.replace(/\.d\.mjs$/, ".d.mts").replace(/\.mjs$/, ".mts").replace(/\.js$/, ".ts");
    const cands = [
      relTarget,
      base,
      base.replace(/\.ts$/, ""),
      base.replace(/\.mts$/, ""),
      `${base}.ts`,
      `${base}.mts`,
      join(dirname(relTarget), "index.ts").replace(/\\/g, "/"),
    ];
    if (!cands.some((c) => shipped.has(c))) missing.push(`${rel}: ${m[2]}`);
  }
}
// Without this floor the section is vacuous: a scanner that matched nothing would
// "prove" every import resolves.
check("the scanner really followed the shipped modules' imports", followed >= 3, `${followed} imports checked`);
check("no relative import in the artifact points outside it", missing.length === 0, missing.slice(0, 6).join(" | "));

check(
  "the release script gates on the published artifact",
  existsSync(join(REPO, "scripts", "verify-published.mjs")),
  "scripts/verify-published.mjs missing — a release would publish unverified bytes",
);

const failed = results.filter((r) => !r.cond);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.log("FAILED: " + failed.map((f) => f.name).join(" | "));
  process.exit(1);
}
