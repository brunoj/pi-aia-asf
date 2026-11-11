/**
 * Specs: pi-vigilant's task store, read under the same project key as run
 * state, plus the trace check the completion gate applies.
 */

import { readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { runRoot } from "./paths.ts";
import { homedir } from "node:os";
import path from "node:path";
import type { SpecItem } from "./types.ts";
import { legacyKey, SKILLS_DIR, projectName } from "./paths.ts";

export const SPEC_DIR = join(SKILLS_DIR, "spec-memory", "projects");

/**
 * Where the spec store is read from. `ASF_STATE_ROOT` redirects it, exactly as it
 * redirects run state (ADR-0002): the store is written by pi-vigilant under ~/.pi,
 * so a suite that wanted to drive the trace gate had no way to do it without writing
 * into the developer's real spec memory — which is why this gate shipped with no test
 * and shipped with a broken root.
 */
export function specDir(): string {
  const override = process.env.ASF_STATE_ROOT;
  return override ? join(path.resolve(override), "spec-memory", "projects") : SPEC_DIR;
}

export function specTaskFileFor(project: string): string {
  return join(specDir(), project, "current-task.json");
}

export async function loadSpecs(project: string): Promise<SpecItem[] | null> {
  const file = specTaskFileFor(project);
  if (!existsSync(file)) return null;
  try {
    const task = JSON.parse(await readFile(file, "utf-8")) as {
      areas?: Record<string, SpecItem[]>;
    };
    return Object.values(task.areas || {}).flat();
  } catch {
    return null;
  }
}

/** Mechanical M1 validation of a met spec's trace. */
export function validateTrace(spec: SpecItem, root: string = runRoot()): { ok: boolean; reason: string } {
  const t = spec.trace;
  if (!t || !t.outcome || !t.codePath) {
    return {
      ok: false,
      reason: "met but trace incomplete — outcome + codePath required (add via update_spec_status trace)",
    };
  }
  if (t.testFile) {
    // Resolved against the project the run is ABOUT, not the session workspace: a
    // session started in a parent directory would otherwise look for the test at
    // <parent>/test/x.mjs, never find it, and re-raise the same gap forever.
    const abs = isAbsolute(t.testFile) ? t.testFile : join(root, t.testFile);
    if (!existsSync(abs)) {
      return { ok: false, reason: `testFile not found: ${t.testFile}` };
    }
    if (t.assertion) {
      let content = "";
      try {
        content = readFileSync(abs, "utf-8");
      } catch {
        /* unreadable → treat as missing */
      }
      if (!content.includes(t.assertion)) {
        return { ok: false, reason: `assertion not found in ${t.testFile}: "${t.assertion}"` };
      }
    }
  }
  return {
    ok: true,
    reason: !t.testFile
      ? "trace complete (no testFile — ensure this is verifiable by inspection, or add an E2E test per 06b Rule 14)"
      : "trace complete",
  };
}

// ─── Dependency check ──────────────────────────────────────────────────────

/**
 * The spec store for this project. pi-vigilant >= 0.9 writes it under the same
 * root-based key ASF uses (pinned vectors in both suites); older versions wrote
 * it under the basename, which is read as a fallback so an un-upgraded
 * pi-vigilant does not make ASF go blind to specs.
 */
export async function loadProjectSpecs(): Promise<SpecItem[] | null> {
  return (await loadSpecs(projectName())) ?? (await loadSpecs(legacyKey()));
}
