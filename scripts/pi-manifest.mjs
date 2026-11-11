/*
 * pi's own package manifest, and the pin it holds for this extension.
 *
 * A separate module because it is a different subject from "install the tarball and
 * compare bytes": pi loads the packages listed in `~/.pi/agent/settings.json`, and a
 * stale exact pin there reinstalls an old version over the one you just verified — which
 * is why a release that verified 0.19.0 later found 0.17.13 loaded. Keeping it here also
 * keeps install-local a script rather than a 300-line file.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * pi's own package manifest — the list pi *syncs* from, which is a second source of
 * truth for what ASF is, and the one that had never been checked.
 *
 * The tree check proves what is on disk right now. It cannot see that pi keeps
 * `~/.pi/agent/settings.json` with `npm:pi-aia-asf@0.17.13` in `packages`, and re-syncs
 * from it: the install can be byte-perfect and still be silently downgraded to the pinned
 * version the next time pi touches its packages. That is not hypothetical — it happened,
 * which is why a release that verified 0.19.0 found 0.17.13 installed afterwards.
 */
export function settingsPath(env = process.env) {
  const explicit = env.PI_SETTINGS;
  if (typeof explicit === "string" && explicit.trim()) return path.resolve(explicit);
  return path.join(os.homedir(), ".pi", "agent", "settings.json");
}

/** What the manifest pins `name` to (e.g. `npm:pi-aia-asf@0.17.13`), or null if absent. */
export function manifestPin(file, name) {
  try {
    const settings = JSON.parse(fs.readFileSync(file, "utf8"));
    const entry = (settings.packages || []).find((p) => typeof p === "string" && p === name || (typeof p === "string" && p.startsWith(`npm:${name}@`)) || p?.name === name);
    if (typeof entry === "string") return entry;
    return entry ? String(entry.source || entry.version || "") : null;
  } catch {
    return null;
  }
}

/** The version inside a pin, or null when it is not a plain `name@version`. */
export function pinVersion(pin) {
  const m = /@([^@/]+)$/.exec(String(pin || ""));
  return m ? m[1] : null;
}

/**
 * Bring the manifest pin in line with what was released. Only ever rewrites an entry
 * that already exists — adding a package pi was never asked to load is not this
 * script's business — and it keeps the file's formatting rather than re-emitting it.
 */
export function syncManifest(file, name, version) {
  const settings = JSON.parse(fs.readFileSync(file, "utf8"));
  const list = Array.isArray(settings.packages) ? settings.packages : [];
  const want = `npm:${name}@${version}`;
  let before = null;
  let changed = false;
  const next = list.map((entry) => {
    const isUs = typeof entry === "string" ? entry === name || entry.startsWith(`npm:${name}@`) : entry?.name === name;
    if (!isUs) return entry;
    before = typeof entry === "string" ? entry : String(entry.source || entry.version || "");
    if (before === want) return entry;
    changed = true;
    return typeof entry === "string" ? want : { ...entry, source: want, version };
  });
  if (!changed) return { changed: false, before, after: before, entries: list.length };
  // Rewritten structurally, never by regex on the file: the pin sits inside an array and a
  // stray quote elsewhere must not be able to corrupt pi's config. Every other key is
  // carried through untouched, and settings.json is JSON with no comments to preserve.
  fs.writeFileSync(file, JSON.stringify({ ...settings, packages: next }, null, 2) + "\n", "utf8");
  return { changed: true, before, after: want, entries: list.length };
}

/**
 * The third check: pi's manifest must pin what was released. A stale pin is repaired
 * rather than reported, because the alternative is a release that silently reverts to an
 * older ASF the next time pi syncs — and the reason this gate exists at all is that a
 * believed-installed release turned out to be a different program.
 */
export function manifestStep({ file, name, version, skip = false } = {}) {
  if (skip) return 0;
  if (!fs.existsSync(file)) {
    console.log(`local install: no pi manifest at ${file} — nothing pins ${name} here`);
    return 0;
  }
  const pin = manifestPin(file, name);
  if (!pin) {
    console.log(`local install: ${name} is not listed in ${file} — pi loads it from ${extensionDir()} alone`);
    return 0;
  }
  const pinned = pinVersion(pin);
  if (pinned === version) {
    console.log(`local install: pi manifest pins ${pin} — a package sync will reinstall this release`);
    return 0;
  }
  try {
    const r = syncManifest(file, name, version);
    console.log(`local install: pi manifest pinned ${r.before}, which would have reinstalled that version over this one — repinned to ${r.after}`);
    return 0;
  } catch (e) {
    console.error(
      `local install FAILED: the pi manifest at ${file} pins ${pin}, not ${version}, and it could not be repaired safely.\n` +
        `${String(e.message).slice(0, 200)}\nFix it yourself: edit "packages" in ${file} to "npm:${name}@${version}".`,
    );
    return 1;
  }
}
