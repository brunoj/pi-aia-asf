#!/usr/bin/env node
/**
 * Install the released version into the live pi extension directory, and PROVE the
 * copy that runs is the copy the registry serves.
 *
 * Why this exists: a release published 0.18.0, the registry gate confirmed it was
 * installable, the published-artifact gate loaded it in a throwaway prefix — and the
 * session went on running 0.17.13. `~/.pi/agent/npm/package.json` pinned `^0.17.13`,
 * and a caret on a `0.x` version does not span a minor, so nothing ever upgraded it.
 * The fix was believed installed and verified; the verification read a version string
 * from the wrong copy. A release whose local install was never checked can print
 * "released" while the developer's ASF is a different program.
 *
 * So this does two things no earlier gate did:
 *
 *  1. installs the released version into the live extension dir (the pin is rewritten
 *     by npm, which is what `^0.17.13` could never do);
 *  2. compares the installed tree against the registry tarball file-by-file by
 *     sha256 — a version string that matches while the bytes differ is exactly the
 *     failure mode above, so version equality alone is not the check.
 *
 * With no pi extension directory on the machine (CI, another developer) it reports
 * that and succeeds: this gate is about THIS machine running what was released, and
 * refusing to release elsewhere would be a false failure.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");

/** Where pi loads extensions from, unless the operator says otherwise. */
export function extensionDir(env = process.env) {
  const explicit = env.PI_EXTENSION_DIR;
  if (typeof explicit === "string" && explicit.trim()) return path.resolve(explicit);
  return path.join(os.homedir(), ".pi", "agent", "npm");
}

/** A directory is a pi extension dir only if npm treats it as one. */
export function isExtensionDir(dir) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
    return !!pkg && typeof pkg.dependencies === "object" && pkg.dependencies !== null;
  } catch {
    return false;
  }
}

function sha256(file) {
  return createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

/** Every file under `dir`, as sorted relative paths. Directories are not content. */
export function tree(dir) {
  const out = [];
  const walk = (rel) => {
    for (const entry of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
      const r = rel ? path.join(rel, entry.name) : entry.name;
      if (entry.isDirectory()) walk(r);
      else if (entry.isFile()) out.push(r);
    }
  };
  walk("");
  return out.sort();
}

/**
 * Compare the installed copy against the registry tarball.
 *
 * Returns the differences, not a boolean: "the install is stale" is the finding, but
 * WHICH files differ is what tells you whether it is the whole version or one file
 * someone patched by hand.
 */
export function diffTrees(installedDir, extractedDir) {
  const a = tree(installedDir);
  const b = tree(extractedDir);
  const only = (x, y) => x.filter((f) => !y.includes(f));
  const missing = only(b, a); // in the registry, not installed
  const extra = only(a, b); // installed but never published
  const changed = a
    .filter((f) => b.includes(f))
    .filter((f) => sha256(path.join(installedDir, f)) !== sha256(path.join(extractedDir, f)));
  return { missing, extra, changed, same: !missing.length && !extra.length && !changed.length };
}

/** Download and extract the published tarball; returns the `package/` directory. */
export function fetchPublished(name, version, workDir) {
  const tarball = `https://registry.npmjs.org/${encodeURIComponent(name)}/-/${name}-${version}.tgz`;
  const tgz = path.join(workDir, `${name}-${version}.tgz`);
  const buf = execFileSync("curl", ["-fsSL", "--max-time", "120", tarball], { maxBuffer: 256 * 1024 * 1024 });
  fs.writeFileSync(tgz, buf);
  const out = path.join(workDir, "extracted");
  fs.mkdirSync(out, { recursive: true });
  execFileSync("tar", ["xzf", tgz, "-C", out], { stdio: "pipe" });
  const inner = path.join(out, "package");
  if (!fs.existsSync(inner)) throw new Error(`tarball for ${name}@${version} has no package/ directory`);
  return inner;
}

/**
 * The installed copy's version, and whether it is the one just released.
 *
 * Split out because the version string is the check that LIED once (it was read from
 * the wrong copy), so it deserves its own test rather than being an inline read.
 */
export function checkVersion(dir, name, version) {
  const target = path.join(dir, "node_modules", name, "package.json");
  if (!fs.existsSync(target)) {
    return { ok: false, installed: null, message: `${path.dirname(target)} does not exist — pi cannot load it` };
  }
  const installed = JSON.parse(fs.readFileSync(target, "utf8")).version;
  if (installed !== version) {
    return {
      ok: false,
      installed,
      message:
        `${target} is version ${installed}, not ${version}.\n` +
        `A caret pin on a 0.x version does not span a minor — check the pin in ${path.join(dir, "package.json")}.`,
    };
  }
  return { ok: true, installed, message: "" };
}

/** Install `name@version` into the live extension dir, rewriting the pin. */
export function install(dir, name, version) {
  execFileSync("npm", ["install", "--no-audit", "--no-fund", `${name}@${version}`], {
    cwd: dir,
    stdio: "pipe",
    encoding: "utf8",
    timeout: 900_000,
  });
  const pkgFile = path.join(dir, "node_modules", name, "package.json");
  const installed = JSON.parse(fs.readFileSync(pkgFile, "utf8")).version;
  const pinned = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8")).dependencies?.[name];
  return { installed, pinned };
}

export async function main(argv = process.argv.slice(2)) {
  const args = argv.filter((a) => !a.startsWith("--"));
  const verifyOnly = argv.includes("--verify-only");
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  const name = pkg.name;
  const version = (args[0] || pkg.version || "").replace(/^v/, "");
  const dir = extensionDir();

  if (!isExtensionDir(dir)) {
    console.log(`local install: no pi extension directory at ${dir} — nothing to install here`);
    return 0;
  }
  if (!verifyOnly && !installStep(dir, name, version)) return 1;
  return verifyAgainstRegistry(dir, name, version);
}

/** Install, reporting the pin npm ended up with. False = the install did not happen. */
function installStep(dir, name, version) {
  console.log(`local install: npm install ${name}@${version} in ${dir}`);
  try {
    const { installed, pinned } = install(dir, name, version);
    console.log(`  installed ${installed} (pin ${pinned})`);
    return true;
  } catch (e) {
    console.error(
      `local install FAILED: could not install ${name}@${version} into ${dir}\n${String(e.stderr || e.message).slice(0, 600)}\n` +
        `Run it yourself:  cd ${dir} && npm install ${name}@${version}`,
    );
    return false;
  }
}

/** The two checks that make this a gate rather than an npm wrapper: version, then bytes. */
function verifyAgainstRegistry(dir, name, version) {
  const target = path.join(dir, "node_modules", name);
  if (!fs.existsSync(target)) {
    console.error(`local install FAILED: ${target} does not exist after install — pi cannot load it`);
    return 1;
  }
  const v = checkVersion(dir, name, version);
  if (!v.ok) {
    console.error(`local install FAILED: ${v.message}`);
    return 1;
  }

  const work = fs.mkdtempSync(path.join(os.tmpdir(), "asf-install-verify-"));
  try {
    const published = fetchPublished(name, version, work);
    const d = diffTrees(target, published);
    if (!d.same) {
      console.error(`local install FAILED: the copy pi loads is not the published artifact.`);
      for (const f of d.missing) console.error(`  not installed:  ${f}`);
      for (const f of d.changed) console.error(`  differs:      ${f}`);
      for (const f of d.extra) console.error(`  not published: ${f}`);
      console.error(`Fix: rm -rf ${target} && cd ${dir} && npm install ${name}@${version}`);
      return 1;
    }
    console.log(`local install verified: ${name}@${version} in ${dir} matches the registry byte-for-byte (${tree(published).length} files)`);
    return 0;
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((code) => process.exit(code)).catch((e) => {
    console.error(`local install check errored: ${String(e && e.stack || e).slice(0, 500)}`);
    process.exit(1);
  });
}
