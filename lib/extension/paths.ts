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

export const SKILLS_DIR = join(homedir(), ".pi", "agent", "skills");
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

export function stateFileFor(project: string): string {
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
