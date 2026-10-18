#!/usr/bin/env node
/*
 * Post-publish verification of the PUBLISHED pi-aia-asf artifact.
 *
 * `npm publish` exiting 0 only means npm accepted the upload, and the packument can
 * list a version whose tarball is not installable yet. Every other gate here reads
 * the working tree, so none of them can see what is inside the tarball — which is
 * how pi-aia-browser 0.2.1 shipped a daemon whose imported file was not in the
 * package, green suite and all.
 *
 * This script treats the working tree as irrelevant. It asks the registry for the
 * version, installs it from the registry into a throwaway prefix (with the peer deps
 * the pi host normally provides), imports the installed extension and requires its
 * default export to be the activate function — and requires the skill and the
 * declared obligations to be present in the installed copy, because an ASF release
 * whose skill did not ship is an empty deliverable that installs without error.
 *
 * Usage:   node scripts/verify-published.mjs [version]     (default: package.json version)
 * Exit 0 only if every check passes.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = dirname(dirname(fileURLToPath(import.meta.url)));
const pkg = JSON.parse(readFileSync(join(REPO, "package.json"), "utf8"));
const NAME = pkg.name;
const VERSION = process.argv[2] || pkg.version;

const results = [];
const check = (name, cond, detail = "") => {
  results.push({ name, cond });
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${!cond && detail ? "  — " + String(detail).slice(0, 300) : ""}`);
};

// ---------------------------------------------------------------------------
console.log(`── 1 — the registry actually serves ${NAME}@${VERSION} ──────`);
// ---------------------------------------------------------------------------
let doc = null;
try {
  const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(NAME)}?t=${Date.now()}`, {
    headers: { "Cache-Control": "no-cache" },
  });
  if (res.ok) doc = await res.json();
} catch (e) {
  check("the registry is reachable", false, e.message);
}
const entry = doc?.versions?.[VERSION];
check(`the registry has ${NAME}@${VERSION}`, !!entry, doc ? `latest=${doc["dist-tags"]?.latest}` : "no packument");
check(`${VERSION} is the latest dist-tag`, doc?.["dist-tags"]?.latest === VERSION, `latest=${doc?.["dist-tags"]?.latest}`);

let tarballOk = false;
let tarballDetail = "no tarball url";
if (entry?.dist?.tarball) {
  try {
    const h = await fetch(entry.dist.tarball, { method: "HEAD" });
    tarballOk = h.ok;
    tarballDetail = `HTTP ${h.status}`;
  } catch (e) {
    tarballDetail = e.message;
  }
}
check("the published tarball is fetchable", tarballOk, tarballDetail);
check("the registry recorded a shasum", /^[0-9a-f]{40}$/.test(entry?.dist?.shasum || ""), entry?.dist?.shasum || "(none)");

// ---------------------------------------------------------------------------
console.log("\n── 2 — install it from the registry into a fresh prefix ─────");
// ---------------------------------------------------------------------------
const tmp = mkdtempSync(join(tmpdir(), "asf-published-"));
const installDir = join(tmp, "install");
mkdirSync(installDir, { recursive: true });

// The pi host provides these at runtime; a bare prefix has no host, so install them
// at the versions the suite pins — otherwise the load check fails on a missing peer
// rather than on anything about this package.
const peers = Object.entries(pkg.devDependencies || {})
  .filter(([n]) => (pkg.peerDependencies || {})[n])
  .map(([n, v]) => `${n}@${v}`);

let installErr = "";
try {
  execFileSync(
    "npm",
    ["install", "--prefix", installDir, "--ignore-scripts", "--no-audit", "--no-fund", "--silent", "--no-cache", `${NAME}@${VERSION}`, ...peers],
    { encoding: "utf8", timeout: 600000, maxBuffer: 32 * 1024 * 1024 },
  );
} catch (e) {
  installErr = String(e.stderr || e.message).slice(0, 500);
}
check(`npm installs ${NAME}@${VERSION} from the registry`, installErr === "", installErr);

const pkgDir = join(installDir, "node_modules", NAME);
// Derive what must be there from what package.json promises, rather than from a
// second list here that could drift from the real one.
const required = [];
for (const f of pkg.files || []) {
  if (!f.endsWith("/")) required.push(f);
  else if (f !== "skills/") required.push(f.replace(/\/$/, ""));
}
const absent = required.filter((f) => !existsSync(join(pkgDir, f)));
check("the installed copy contains everything files allowlists", absent.length === 0, absent.join(", "));
check("the skill is installed", existsSync(join(pkgDir, "skills", "aia-asf", "SKILL.md")), "skills/aia-asf/SKILL.md missing");
check(
  "the declared obligations are installed",
  existsSync(join(pkgDir, "obligations.d")) && readdirSync(join(pkgDir, "obligations.d")).length > 0,
  "obligations.d/ missing or empty — the guard would verify nothing",
);

if (absent.length > 0) finish();

// ---------------------------------------------------------------------------
console.log("\n── 3 — the INSTALLED extension actually loads ───────────────");
// ---------------------------------------------------------------------------
function findTsxLoader() {
  const cands = [join(REPO, "node_modules", "tsx", "dist", "loader.mjs")];
  try {
    const g = execFileSync("npm", ["root", "-g"], { encoding: "utf8", timeout: 30000 }).trim();
    cands.push(join(g, "tsx", "dist", "loader.mjs"));
    cands.push(join(g, "@earendil-works", "pi-coding-agent", "node_modules", "tsx", "dist", "loader.mjs"));
  } catch {}
  try {
    const npxBase = join(process.env.HOME || "/root", ".npm", "_npx");
    for (const hash of readdirSync(npxBase)) cands.push(join(npxBase, hash, "node_modules", "tsx", "dist", "loader.mjs"));
  } catch {}
  return cands.find((p) => existsSync(p)) || null;
}

const loader = findTsxLoader();
check("a tsx loader is available to import the .ts extension", !!loader, "install tsx or run from a checkout");
if (!loader) finish();

const wrapper = join(tmp, "load-check.mjs");
writeFileSync(
  wrapper,
  `const mod = await import(${JSON.stringify("file://" + join(pkgDir, "index.ts"))});
console.log(JSON.stringify({ type: typeof mod.default, keys: Object.keys(mod).slice(0, 8) }));\n`,
);

const run = spawnSync(process.execPath, ["--import", `file://${loader}`, wrapper], {
  cwd: installDir,
  encoding: "utf8",
  timeout: 120000,
  env: { ...process.env, PI_CODING_AGENT_DIR: join(tmp, "pihome") },
});
let loaded = null;
try {
  loaded = JSON.parse(String(run.stdout || "").trim().split("\n").filter(Boolean).pop());
} catch {}
check("the installed extension imports cleanly", run.status === 0 && !!loaded, (run.stderr || run.stdout || "").slice(-300));
check("its default export is the activate function pi calls", loaded?.type === "function", JSON.stringify(loaded));

finish();

function finish() {
  const failed = results.filter((r) => !r.cond);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  try { rmSync(tmp, { recursive: true, force: true }); } catch {}
  if (failed.length) {
    console.log(`PUBLISHED ARTIFACT NOT VERIFIED: ${NAME}@${VERSION} — ${failed.map((f) => f.name).join(" | ")}`);
    process.exit(1);
  }
  console.log(`PUBLISHED ARTIFACT VERIFIED: ${NAME}@${VERSION} installs from the registry and the installed extension loads`);
  process.exit(0);
}
