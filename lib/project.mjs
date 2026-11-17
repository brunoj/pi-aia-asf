/**
 * Project identity for ASF state.
 *
 * The old key was `process.cwd().split("/").pop()` — the last path segment. That
 * silently broke enforcement two ways, both found by auditing the 0.14.x traces:
 *
 *   1. `cd` into a subdirectory mid-session and the run's state file is simply
 *      not found any more, so the gates go quiet while real work continues.
 *   2. Two different checkouts that happen to share a basename (`~/work/api` and
 *      `~/other/api`) resolve to the SAME state file, so one project's run
 *      satisfies another project's gates.
 *
 * The key is therefore the **git work-tree root** when there is one, else the
 * absolute cwd — sanitized for the filesystem, with a hash suffix when truncated
 * so long paths cannot collide.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { ASF_DIR, DECISIONS_SUBDIR } from "./home.mjs";

/** What makes a directory a project rather than a place to stand. */
const PROJECT_MARKERS = [
  "package.json", "pyproject.toml", "setup.py", "go.mod", "Cargo.toml",
  "composer.json", "pom.xml", "build.gradle", "mix.exs",
];

/** cwd -> key. Bounded below so a long session in many repos cannot grow it without limit. */
const CACHE = new Map();
const CACHE_MAX = 64;

function safeCwd() {
  try {
    return process.cwd();
  } catch {
    return "default";
  }
}

/** The git work-tree root for `cwd`, or `cwd` itself when it is not a repo. */
export function projectRoot(cwd = safeCwd()) {
  try {
    const out = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 2000,
    }).trim();
    if (out) return out;
  } catch {
    /* not a repo, no git, or git too slow — the cwd is the honest answer */
  }
  return cwd;
}

/**
 * The git work-tree root for `dir`, or **null** when it is not a repo.
 *
 * `projectRoot` above deliberately answers with the directory it was given when git
 * finds nothing, because a state key has to be something. That echo is wrong for
 * callers asking "which project does this file belong to": told that `<project>/src`
 * is a root, ASF reads `<project>/src/.asf/decisions`, finds nothing, and concludes the
 * project has no decisions. This variant says null and lets the caller decide.
 */
export function gitRoot(dir) {
  try {
    const out = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd: dir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 2000,
    }).trim();
    return out || null;
  } catch {
    return null;
  }
}

/**
 * Is this directory a project, or just where the shell happened to be?
 *
 * One list, one definition: the health gate and the run card both ask, and when
 * they disagreed the card could tell an agent to bootstrap a register for a
 * directory that is not a project while the gate measured violations in it.
 */
/**
 * Does `.asf/` here hold anything a human authored or reviewed?
 *
 * `.asf/` alone cannot be a project marker: ASF creates it itself when it writes run
 * state, so on any directory ASF has ever run in — a home directory included — the
 * marker confirms itself. A telemetry-only home (`state/`, its `.gitignore`, an empty
 * `decisions/`) is ASF's own footprint, not evidence of a project; durable content is.
 */
function hasAsfSubstance(root) {
  const durable = ["config.json", "PLAN.md", "code-health-baseline.json", "code-health.json"];
  for (const f of durable) {
    if (existsSync(join(root, ASF_DIR, f))) return true;
  }
  try {
    const dir = join(root, ASF_DIR, DECISIONS_SUBDIR);
    if (readdirSync(dir).some((n) => n.endsWith(".md"))) return true;
  } catch {
    /* no register */
  }
  return false;
}

export function isProjectRoot(root) {
  try {
    if (typeof root !== "string" || !root.startsWith("/")) return false;
    if (existsSync(join(root, ".git"))) return true;
    if (hasAsfSubstance(root)) return true;
    for (const m of PROJECT_MARKERS) {
      if (existsSync(join(root, m))) return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * A directory ASF may measure and report violations for.
 *
 * Two shapes are refused, and they are refused because the numbers they produce
 * are real, belong to no run, and cannot be fixed by the run being gated:
 *
 *   - the user's home directory, by name (a session started in `$HOME` falls back
 *     to it, and the 2,349-steer loop's verdict came from measuring exactly that);
 *   - a directory that is not itself a project but is the PARENT of several — a
 *     workspace of unrelated checkouts, which is what home looks like.
 *
 * A plain directory of source files stays measurable: refusing that would deny the
 * gate to a legitimate script folder, which is a different problem from this one.
 */
export function isMeasurableRoot(root, home = null) {
  if (typeof root !== "string" || !root.startsWith("/")) return false;
  const h = home || homedir();
  try {
    if (resolve(root) === resolve(h)) return false;
  } catch {
    /* an unresolvable home does not make a root unmeasurable */
  }
  if (isProjectRoot(root)) return true;
  return countChildProjects(root) < 2;
}

/** How many checkouts sit directly under a directory (hidden trees ignored). */
function countChildProjects(dir) {
  try {
    const names = [];
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      if (!ent.isDirectory() || ent.name.startsWith(".") || ent.name === "node_modules") continue;
      names.push(ent.name);
      if (names.length > 12) break; // a workspace has plenty; this is a yes/no question
    }
    return names.filter((n) => isProjectRoot(join(dir, n))).length;
  } catch {
    return 0;
  }
}

/** Filesystem-safe key for a root path. Deterministic, collision-resistant. */
export function sanitizeRoot(root) {
  let key = String(root || "")
    .replace(/^[/\\]+/, "")
    .replace(/[/\\]+/g, "-")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 72);
  if (!key) key = "default";
  const full = String(root || "");
  if (full.length > 72) {
    const h = createHash("sha1").update(full).digest("hex").slice(0, 8);
    key = `${key.replace(/-+$/, "")}-${h}`;
  }
  return key;
}

/** The state key for a directory. Cached; the cache is bounded and clearable. */
export function projectKey(cwd = safeCwd()) {
  const hit = CACHE.get(cwd);
  if (hit) return hit;
  const key = sanitizeRoot(projectRoot(cwd));
  if (CACHE.size >= CACHE_MAX) CACHE.clear();
  CACHE.set(cwd, key);
  return key;
}

/** Test hook: the cache must not leak identity between fixtures. */
export function __clearProjectCache() {
  CACHE.clear();
}
