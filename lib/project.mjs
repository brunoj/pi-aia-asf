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
