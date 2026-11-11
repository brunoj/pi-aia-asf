/**
 * Run state on disk: how it is read, and how it is written without losing a
 * concurrent update.
 */

import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname } from "node:path";
import type { AsfState, ProjectStateFile } from "./types.ts";
import { appendEvidence, queueSteer } from "./evidence.ts";
import { stateFileFor, legacyStateFileFor, projectName, legacyKey } from "./paths.ts";

/**
 * Every place this project's run state could legitimately be, current home first.
 *
 * Two migrations meet here: the pre-home machine-local directory
 * (~/.pi/agent/skills/aia-asf/projects) and the pre-0.15 basename key. Both are
 * **copied, never moved** — an older copy stays exactly where it was, so an
 * upgrade or a rollback can always find it again.
 */
function stateCandidates(project: string): string[] {
  const here = stateFileFor(project);
  const out: string[] = [];
  const oldKey = legacyKey();
  for (const candidate of [legacyStateFileFor(project), stateFileFor(oldKey), legacyStateFileFor(oldKey)]) {
    if (candidate !== here && !out.includes(candidate)) out.push(candidate);
  }
  return out;
}

/** Adopt a live run from an older location, recording where it came from. */
async function adoptState(project: string): Promise<ProjectStateFile | null> {
  for (const file of stateCandidates(project)) {
    if (!existsSync(file)) continue;
    try {
      const data = JSON.parse(await readFile(file, "utf-8")) as ProjectStateFile;
      if (!data || !data.current) continue;
      await saveState(project, data);
      appendEvidence({ kind: "state-migrated", from: file, project });
      return data;
    } catch {
      /* an unreadable older copy is not adopted */
    }
  }
  return null;
}

export async function loadState(project: string): Promise<ProjectStateFile> {
  const file = stateFileFor(project);
  if (!existsSync(file)) {
    // One-time adoption: a run opened under an older layout is adopted, not
    // orphaned — an upgrade must never silently end an active run.
    const adopted = await adoptState(project);
    if (adopted) return adopted;
    return restoreFromMirror(project, { current: null, history: [] }, "missing");
  }
  try {
    const data = JSON.parse(await readFile(file, "utf-8")) as ProjectStateFile;
    if (!data || typeof data !== "object") return restoreFromMirror(project, { current: null, history: [] }, "corrupt");
    if (!data.history) data.history = [];
    if (!data.current) return restoreFromMirror(project, data, "cleared");
    sanitizeSteerFields(data.current);
    return data;
  } catch {
    return restoreFromMirror(project, { current: null, history: [] }, "corrupt");
  }
}

export async function restoreFromMirror(project: string, data: ProjectStateFile, how: string): Promise<ProjectStateFile> {
  const mirrored = runMirror.get(project);
  if (!mirrored) return data;
  data.current = JSON.parse(JSON.stringify(mirrored));
  try {
    await saveState(project, data);
  } catch {
    /* the in-memory copy still enforces for this session */
  }
  appendEvidence({ kind: "run-restored", runId: mirrored.runId, how, project });
  queueSteer(`ASF: the run state for this project was ${how} on disk outside ASF; the active run was restored. End a run with /asf abort, not by deleting its state.`);
  return data;
}

/**
 * In-process mirror of the active run, per project. Deleting or emptying
 * state.json used to end enforcement silently — the next load simply found no
 * run. Every legitimate end of a run goes through saveState (abort, close,
 * auto-close), which updates the mirror; a run that disappears from disk while
 * the mirror still holds it is restored and the disappearance is recorded.
 */
export const runMirror = new Map<string, AsfState>();

/**
 * How much each run has been steered, held IN THIS PROCESS.
 *
 * The 2026-11-07 loop: the bound on identical steers lived only in state.json.
 * A concurrent writer (the tool_call handler saves the same file on every source
 * mutation) could put an older copy back, and the counter restarted — so the
 * same gap was re-asked forever and the autonomous loop never ended. The state
 * file is now a *record*; this map is the *authority* for this session. A run's
 * steer count can go up, never down, and an identical steer is never issued
 * twice in the same process no matter what the file says.
 */

export function sanitizeSteerFields(state: AsfState | null | undefined): void {
  if (!state) return;
  if (typeof state.steers !== "number" || !Number.isFinite(state.steers) || state.steers < 0) state.steers = 0;
  if (!Array.isArray(state.seenSteers)) state.seenSteers = [];
  state.seenSteers = (state.seenSteers as unknown[]).filter((x): x is string => typeof x === "string" && x.trim().length > 0);
  if (!Array.isArray(state.filesTouched)) state.filesTouched = [];
  else state.filesTouched = (state.filesTouched as unknown[]).filter((f): f is string => typeof f === "string" && f.trim().length > 0).slice(-10);
  if (typeof state.lastMutationAt !== "number" || !Number.isFinite(state.lastMutationAt)) state.lastMutationAt = 0;
}

/**
 * Saves are SERIALIZED per project.
 *
 * Eleven code paths save the same file (activation, settle, park, close, abort,
 * restore…). Each one read-modify-writes it, so two overlapping saves let an
 * older copy land last — which is how the 2026-11-07 loop survived its own
 * bound: the settle handler wrote the steer counter, a source-mutation save put
 * an older copy back, and the counter restarted. Writes are now queued per
 * project, so a save cannot interleave with another.
 */
export const saveQueue = new Map<string, Promise<void>>();

/**
 * Monotonic fields: once a run has been steered, or has touched a file, an older
 * copy of the state must never erase that. Eleven code paths read-modify-write
 * this file; the queue serializes the WRITES, and this merge closes the window
 * the queue cannot: a caller that loaded the state before another caller saved
 * it still writes a stale snapshot. Re-reading inside the lock and merging the
 * monotonic fields makes a lost update impossible for the fields that matter to
 * the completion gate.
 */
/** How many completed runs a project keeps. Older ones are not needed to judge a run. */
const MAX_HISTORY = 20;

/**
 * What makes two history entries the SAME run. The runId when it has one; the start
 * otherwise, so entries written before runIds were recorded still deduplicate.
 */
export function historyKey(e: { runId?: string | null; startedAt?: string } | null | undefined): string {
  if (!e) return "|";
  return `${e.runId || ""}|${e.startedAt || ""}`;
}

/**
 * Archive one finished run — the ONLY way a run enters history.
 *
 * Idempotent by run identity, because the same close can reach here twice: two sessions
 * on one project key each hold their own in-memory copy, and a close from one can be
 * replayed after the other restored the run (observed live as one run archived twice,
 * minutes apart). Without this, "the next run is judged separately" is not actually
 * guaranteed by the record, and nothing in the entry identified which run it was.
 */
export function archiveRun(file: ProjectStateFile, state: AsfState | null | undefined, { by = "auto" }: { by?: string } = {}): { duplicate: boolean } {
  const now = new Date().toISOString();
  const entry = {
    runId: state?.runId || null,
    workType: state?.workType || "auto",
    phase: state?.phase || "none",
    startedAt: state?.startedAt || state?.updatedAt || now,
    endedAt: now,
    by,
  };
  const key = historyKey(entry);
  const list = Array.isArray(file.history) ? file.history : [];
  if (list.some((h) => historyKey(h) === key)) return { duplicate: true };
  file.history = [...list, entry].slice(-MAX_HISTORY);
  return { duplicate: false };
}

/** Union two histories by run identity — neither side may erase or duplicate the other's. */
function mergeHistory(incoming: ProjectStateFile, onDisk: ProjectStateFile | null): void {
  const list = Array.isArray(onDisk?.history) ? [...(onDisk?.history || [])] : [];
  for (const h of Array.isArray(incoming.history) ? incoming.history : []) {
    if (!list.some((x) => historyKey(x) === historyKey(h))) list.push(h);
  }
  list.sort((x, y) => String(x.endedAt || "").localeCompare(String(y.endedAt || "")));
  incoming.history = list.slice(-MAX_HISTORY);
}

export function mergeMonotonic(incoming: ProjectStateFile, onDisk: ProjectStateFile | null): ProjectStateFile {
  // History is merged on EVERY path, including the one-sided ones below: a run closed by
  // one session must not be erased by another session that still holds the run open, and
  // must not be able to land twice.
  mergeHistory(incoming, onDisk);
  const a = incoming.current;
  const b = onDisk?.current;
  // Both sides are sanitized: the on-disk copy can be hand-edited or written by
  // an older version, and spreading a non-array field here threw inside the
  // settle handler — which then settled the run silently (a gate bypass).
  sanitizeSteerFields(a);
  sanitizeSteerFields(b);
  if (!a || !b) return incoming;
  if (a.runId !== b.runId) return incoming; // a different run: no merge
  a.steers = Math.max(Number(a.steers) || 0, Number(b.steers) || 0);
  a.seenSteers = [...new Set([...(a.seenSteers || []), ...(b.seenSteers || [])])].filter((x) => typeof x === "string" && x.trim()).slice(-50);
  // Chronological: the on-disk list is older, the incoming one carries the new
  // entry. Appending the incoming entries AFTER the on-disk ones keeps
  // newest-last, which is what the slice(-10) below trims.
  const touched = [...(b.filesTouched || [])];
  for (const f of a.filesTouched || []) if (!touched.includes(f)) touched.push(f);
  a.filesTouched = touched.slice(-10);
  if (typeof b.lastMutationAt === "number") a.lastMutationAt = Math.max(Number(a.lastMutationAt) || 0, b.lastMutationAt);
  if (!a.parked && b.parked) a.parked = b.parked;
  return incoming;
}

export async function readStateFile(file: string): Promise<ProjectStateFile | null> {
  try {
    const parsed = JSON.parse(await readFile(file, "utf-8")) as ProjectStateFile;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export async function writeStateFile(project: string, data: ProjectStateFile): Promise<void> {
  const file = stateFileFor(project);
  await mkdir(dirname(file), { recursive: true });
  const merged = mergeMonotonic(data, await readStateFile(file));
  // Write-then-rename: a reader never sees a half-written file.
  const tmp = `${file}.tmp-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
  await writeFile(tmp, JSON.stringify(merged, null, 2), "utf-8");
  await rename(tmp, file);
}

export async function saveState(project: string, data: ProjectStateFile): Promise<void> {
  if (data.current) runMirror.set(project, JSON.parse(JSON.stringify(data.current)));
  else runMirror.delete(project);
  const snapshot = JSON.parse(JSON.stringify(data)) as ProjectStateFile;
  const prev = saveQueue.get(project) || Promise.resolve();
  const next = prev.then(() => writeStateFile(project, snapshot), () => writeStateFile(project, snapshot));
  saveQueue.set(project, next.catch(() => undefined));
  await next;
}

// ─── Spec-memory read (shared with pi-vigilant) ────────────────────────────

