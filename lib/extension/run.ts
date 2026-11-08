/**
 * Opening, describing and closing a run: ids, cards, and the measurements a
 * run records about the machine it ran on.
 */

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { runRoot } from "./paths.ts";
import { cpus, loadavg } from "node:os";
import { renderRunCard, cardSummary, CARD_CEILING_BYTES } from "../run-card.mjs";
import { ledger, suiteRuns, gateStats } from "./gate-state.ts";
import { appendEvidence } from "./evidence.ts";
import { loadState, saveState } from "./state.ts";
import { projectName } from "./paths.ts";
import { runtime } from "./runtime.ts";
import { __resetRefusals } from "../gates/refusals.mjs";
import type { AsfState } from "./types.ts";

export function newRunId(): string {
  return `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function cardFor(state: AsfState | null, nextStep?: string, remedy?: string): string {
  if (!state) return "";
  const openDod = (runtime.lastSettleDecision?.missing || []).slice(0, 6);
  const step =
    nextStep ||
    (state.sourceMutated && !suiteRuns.some((r) => r.exitCode === 0 && (r.at ?? 0) >= (state.lastMutationAt ?? 0))
      ? "run the tests for what you changed, then the full suite"
      : state.phase === "implementation"
        ? "implement test-first; keep the suite green"
        : `advance the ${state.phase} phase`);
  return renderRunCard({
    phase: state.phase,
    scale: state.scale,
    workType: state.workType,
    objective: state.objective,
    openDod,
    nextStep: step,
    remedy,
    filesTouched: state.filesTouched,
    ticketId: state.ticketId,
    auto: state.auto,
    steers: state.steers,
  }).text;
}

/**
 * Open an ASF run because software work was seen (P1). `small` is the floor that
 * auto-opened runs get — validation and evidence, not the plan/approval gates,
 * which stay reserved for runs a human scales to `large`.
 */
export async function openAutoRun(trigger: string, path: string | null): Promise<AsfState> {
  const project = projectName();
  const file = await loadState(project);
  const now = new Date().toISOString();
  const state: AsfState = {
    phase: "implementation",
    scale: "small",
    startedAt: now,
    updatedAt: now,
    runId: newRunId(),
    auto: true,
    trigger,
    filesTouched: path ? [path] : [],
    sourceMutated: true,
    lastMutationAt: Date.now(),
    steers: 0,
    seenSteers: [],
  };
  file.current = state;
  await saveState(project, file);
  __resetRefusals();
  runtime.blindMutations = 0;
  runtime.blindNudged = false;
  runtime.lastMutationAt = Date.now();
  appendEvidence({ kind: "run-open", runId: state.runId, auto: true, trigger, project });
  runtime.pendingCard = { text: cardFor(state), reason: "activation" };
  return state;
}

/** Where this extension is installed — the declaration file ships beside it. */

export function extensionDir(): string {
  try {
    return dirname(fileURLToPath(import.meta.url));
  } catch {
    return process.cwd();
  }
}

/**
 * Project characteristics the adaptation band may calibrate within. Anything
 * not measured is simply absent, so the general default is used rather than a
 * guess — a default that cannot explain itself is a guess with better formatting.
 */
export function collectMeasurements(): Record<string, unknown> {
  const m: Record<string, unknown> = {};
  const last = [...ledger.entries].reverse().find((e: any) => e.kind === "suite-run" && e.scope === "full");
  if (last && typeof last.durationMs === "number") m.suiteRuntimeMs = last.durationMs;
  const cores = cpus()?.length;
  if (cores) m.cores = cores;
  const la = loadavg()?.[0];
  if (typeof la === "number" && cores) m.machineQuiet = la <= cores;
  return m;
}

/** Is the working tree dirty? Fail-open: an unknown state must not block. */
export function gitDirty(): boolean {
  const now = Date.now();
  if (runtime.dirtyCache && now - runtime.dirtyCache.at < 5000) return runtime.dirtyCache.dirty;
  let dirty = false;
  try {
    const out = execFileSync("git", ["status", "--porcelain"], { cwd: runRoot(), encoding: "utf-8", timeout: 5000 });
    dirty = String(out).trim().length > 0;
  } catch {
    // Not a repo, or git unavailable: we cannot claim the tree is dirty, and a
    // convenience gate must not block on its own blindness.
    dirty = false;
  }
  runtime.dirtyCache = { at: now, dirty };
  return dirty;
}

export function numberConfig(config: Record<string, unknown>, key: string, fallback: number): number {
  const v = config[key];
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

/** Small work is held to the reduced DoD — the scale rule is the trigger here. */
export function currentScale(state?: AsfState | null): "small" | "standard" | "major" {
  if (state?.scale === "small") return "small";
  if (state?.scale === "large") return "major";
  return runtime.lastScaleWasSmall ? "small" : "standard";
}

