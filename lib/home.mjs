/**
 * The ASF home — one directory in the project: `.asf/`.
 *
 * Before this, ASF's footprint was a scatter of root dotfiles (`.asf-config.json`,
 * `.asf-code-health-baseline.json`) plus `PLAN.md` in the repo root: four names a
 * contributor has to guess, nothing to point a reviewer at, and no place for the
 * things ASF still needed (the decision register, run state). One directory, one
 * rule: **every file ASF authors lives under `.asf/`**, and the old root names are
 * still *read* so an existing project never loses its configuration mid-run.
 *
 * The split inside the home is deliberate:
 *
 *   .asf/config.json                  durable, tracked   — project configuration
 *   .asf/PLAN.md                      durable, tracked   — the current plan
 *   .asf/code-health-baseline.json    durable, tracked   — the health ratchet
 *   .asf/decisions/                   durable, tracked   — the decision register
 *   .asf/.gitignore                   durable, tracked   — `state/`
 *   .asf/state/<projectKey>/          ephemeral, ignored — run state, evidence
 *
 * Telemetry is git-ignored because it is append-only: a ledger that dirties the
 * tree on every tool call would defeat the "tree is clean" precondition ASF
 * requires before an irreversible action, and it is machine-local noise nobody
 * reviews. Durable knowledge is tracked because it *is* meant to be reviewed.
 *
 * A `.gitignore` inside the home is honoured by git whether or not it is
 * committed, so the ignore rule holds from the first run, not from the first commit.
 */

import fs from "node:fs";
import path from "node:path";

export const ASF_DIR = ".asf";
export const STATE_SUBDIR = "state";
export const DECISIONS_SUBDIR = "decisions";
export const GITIGNORE_BODY = "# ASF telemetry: append-only, machine-local, never reviewed.\nstate/\n";

/**
 * Every ASF-authored file: its name inside the home and the root name it used to
 * have. `legacy` is read-only — a compatibility path, never a write target.
 */
export const FILES = {
  config: { home: "config.json", legacy: ".asf-config.json" },
  baseline: { home: "code-health-baseline.json", legacy: ".asf-code-health-baseline.json" },
  plan: { home: "PLAN.md", legacy: "PLAN.md" },
};

export function asfDir(root) {
  return path.join(root, ASF_DIR);
}

/** Where the run state lives now. `key` is the project key (git-root based). */
export function homeStateDir(root, key) {
  return path.join(asfDir(root), STATE_SUBDIR, key);
}

/** Where the decision register lives, honouring `decisions.dir` from config. */
export function decisionsDir(root, config) {
  const custom = config && config.decisions && config.decisions.dir;
  if (typeof custom === "string" && custom.trim()) {
    return path.isAbsolute(custom) ? custom : path.join(root, custom);
  }
  return path.join(asfDir(root), DECISIONS_SUBDIR);
}

/**
 * The path to *write* a given ASF file: always inside the home.
 * @param {string} root project root
 * @param {keyof typeof FILES} key
 */
export function writePath(root, key) {
  const f = FILES[key];
  if (!f) throw new Error(`asf-home: unknown file "${key}"`);
  return path.join(asfDir(root), f.home);
}

/**
 * The path to *read* a given ASF file: the home first, then the pre-home root
 * name. Falling back matters — a project configured before this change would
 * otherwise wake up unconfigured, and an unconfigured gate reads as a passing gate.
 */
export function readPath(root, key) {
  const f = FILES[key];
  if (!f) throw new Error(`asf-home: unknown file "${key}"`);
  const modern = path.join(asfDir(root), f.home);
  if (fs.existsSync(modern)) return modern;
  const legacy = path.join(root, f.legacy);
  // Compare the resolved paths, not the names: `PLAN.md` is the same file name in
  // two directories, and comparing names would decide it is not a legacy path at all.
  if (legacy !== modern && fs.existsSync(legacy)) return legacy;
  return modern;
}

/** Read an ASF file's text through the home-first, legacy-falling resolver. */
export function readHomeFile(root, key) {
  const file = readPath(root, key);
  try {
    return fs.readFileSync(file, "utf-8");
  } catch {
    return undefined;
  }
}

/**
 * Create the home if it is not there and make sure telemetry is ignored.
 *
 * Idempotent and non-destructive: an existing `.gitignore` is only *appended to*
 * when the `state/` rule is missing, never rewritten — a project may have added
 * its own rules to it.
 */
export function ensureHome(root, { decisions = true } = {}) {
  const dir = asfDir(root);
  fs.mkdirSync(dir, { recursive: true });
  if (decisions) fs.mkdirSync(path.join(dir, DECISIONS_SUBDIR), { recursive: true });
  const ignore = path.join(dir, ".gitignore");
  const want = "state/";
  let body = "";
  try {
    body = fs.readFileSync(ignore, "utf-8");
  } catch {
    body = "";
  }
  if (!body.split(/\r?\n/).some((l) => l.trim() === want)) {
    fs.writeFileSync(ignore, body.trim() ? `${body.replace(/\n$/, "")}\n${want}\n` : GITIGNORE_BODY, "utf-8");
  }
  return dir;
}
