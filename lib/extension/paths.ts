/**
 * Where ASF keeps things on disk, and how a project is named.
 *
 * Its own module because both the run-state store and the spec store need these,
 * and having either import the other for them made an import cycle.
 */

import { join } from "node:path";
import { basename } from "node:path";
import { homedir } from "node:os";
import { projectKey as resolveProjectKey, projectRoot as resolveProjectRoot } from "../project.mjs";
import { homeStateDir } from "../home.mjs";

export const SKILLS_DIR = join(homedir(), ".pi", "agent", "skills");
/**
 * The pre-home location, machine-local. Read-only now: kept so an upgrade never
 * orphans a run that is mid-flight under an older ASF.
 */
export const STATE_DIR = join(SKILLS_DIR, "aia-asf", "projects");

/**
 * The state key for the current project.
 *
 * This used to be `cwd.split("/").pop()`, which broke enforcement twice over:
 * `cd`-ing into a subdirectory mid-session lost the run (so the gates went quiet
 * while work continued), and two checkouts sharing a basename shared a state
 * file (so one project's green suite satisfied another's push gate). It is now
 * the git work-tree root, falling back to the absolute cwd.
 */
export function projectName(): string {
  return resolveProjectKey();
}

/**
 * Where a run's state lives: `.asf/state/<projectKey>/state.json` in the project.
 *
 * It sits inside the home but is git-ignored by `.asf/.gitignore`: it is
 * append-only telemetry, and a ledger that dirtied the tree on every tool call
 * would defeat the "tree is clean" precondition ASF demands before an
 * irreversible action.
 */
export function stateFileFor(project: string): string {
  return join(homeStateDir(runRoot(), project), "state.json");
}

/** The machine-local path an older ASF used. Read-only; never written. */
export function legacyStateFileFor(project: string): string {
  return join(STATE_DIR, project, "state.json");
}

/**
 * The run's project root (the git work-tree root of the session's cwd).
 *
 * Everything that reads or measures "the project" must use this rather than
 * process.cwd(): a session started in $HOME would otherwise measure the whole
 * home directory and gate work on findings that are not the project's.
 */
export function runRoot(): string {
  try {
    return resolveProjectRoot();
  } catch {
    return process.cwd();
  }
}

/**
 * The pre-0.15 key (cwd basename). Used only to find run state written by an
 * older ASF, and spec memory written by pi-vigilant < 0.9.
 */
export function legacyKey(): string {
  try {
    return basename(process.cwd()) || "default";
  } catch {
    return "default";
  }
}
