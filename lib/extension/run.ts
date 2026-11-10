/**
 * Opening, describing and closing a run: ids, cards, and the measurements a
 * run records about the machine it ran on.
 */

import { execFileSync } from "node:child_process";
import { runRoot, projectName } from "./paths.ts";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { projectRoot as projectRootOf } from "../project.mjs";
import { ensureHome } from "../home.mjs";
import { cpus, loadavg } from "node:os";
import { renderRunCard, cardSummary, CARD_CEILING_BYTES } from "../run-card.mjs";
import { ledger, suiteRuns, gateStats } from "./gate-state.ts";
import { appendEvidence } from "./evidence.ts";
import { loadState, saveState } from "./state.ts";
import { runtime } from "./runtime.ts";
import { __resetRefusals } from "../gates/refusals.mjs";
import { cardIndex, registerAt } from "../decisions/consult.mjs";
import { readProjectConfig } from "../gates/config.mjs";
import type { AsfState } from "./types.ts";

export function newRunId(): string {
  return `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * The decision index, budgeted separately from the card.
 *
 * It rides the card's delivery because a register nobody has in context is a
 * register nobody follows — but it does not share the card's ceiling, so adding
 * a decision can never push the DoD list off the card. Titles are rules, so
 * three lines steer; that is the whole point of the format.
 */
function decisionBlock(root: string): string {
  try {
    const cfg = readProjectConfig(root);
    if (cfg["gate.decisions.inject"] === false) return "";
    const { records } = registerAt(root, cfg);
    const lines = cardIndex(records, {
      max: Number(cfg["gate.decisions.max_lines"]) || 3,
      bytes: Number(cfg["gate.decisions.max_bytes"]) || 600,
    });
    if (!lines.length) return "";
    return `\ndecisions in force:\n${lines.map((l) => `  ${l}`).join("\n")}\n  (asf_decisions action=get before changing governed code)`;
  } catch {
    // A broken register is reported by the register's own checks; it must never
    // be a reason for the card to disappear.
    return "";
  }
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
  const card = renderRunCard({
    phase: state.phase,
    // The scale the gate judges by, not the raw field: an unset scale is judged
    // small, and a card that printed "unset" (or the raw value) while the gate held
    // the run to another scale is how a stuck run became unreadable.
    scale: currentScale(state),
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
  return card + decisionBlock(runRoot());
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
  // The home is created when a run opens, not when a file is first needed: the
  // `.gitignore` inside it must exist before the first telemetry write, or the
  // ledger shows up as untracked noise in the user's `git status`.
  try {
    ensureHome(runRoot());
  } catch {
    /* a read-only project must not stop a run from opening */
  }
  await saveState(project, file);
  __resetRefusals();
  runtime.blindMutations = 0;
  runtime.blindNudged = false;
  runtime.lastMutationAt = Date.now();
  appendEvidence({ kind: "run-open", runId: state.runId, auto: true, trigger, project });
  runtime.pendingCard = { text: cardFor(state), reason: "activation" };
  return state;
}

/**
 * The project the gates should MEASURE.
 *
 * `runRoot()` is the git root of the session's cwd, which is right for where state
 * lives and wrong for what to measure: a session started in a parent repository
 * (a home directory that is itself a git repo is the common case) would have every
 * gate measure that parent. It did — `asf_health` reported 363 model findings from an
 * unrelated project checked out underneath $HOME, and every measurement tool then
 * timed out scanning a tree nobody was working in. A gate that measures the wrong
 * directory is worse than no gate: it blocks on findings in code the run must not
 * touch, or waves through the one project that is actually unhealthy.
 *
 * The run already knows what it changed, so the answer is taken from there: the git
 * root of the most recently touched file wins. It is deliberately NOT used to locate
 * state — a root that moved mid-run would orphan the run's own ledger — only to
 * decide what a measurement looks at.
 */
export async function measureRoot(): Promise<string> {
  const fallback = runRoot();
  try {
    const state = await loadState(projectName());
    const touched = (state?.current?.filesTouched || []) as string[];
    for (let i = touched.length - 1; i >= 0; i--) {
      const f = touched[i];
      if (!f || !f.includes("/")) continue;
      const root = projectRootOf(dirname(f));
      // Only a root that CONTAINS the session root counts as a better answer: a
      // stray touched path outside the workspace must not drag the measurement to
      // someone's scratch directory.
      if (root && (root === fallback || root.startsWith(fallback + "/"))) return root;
    }
  } catch {
    /* measurement falls back to the session root; a broken guess is worse than none */
  }
  return fallback;
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

/**
 * The scale every gate judges a run by.
 *
 * PO policy: "If no scale, assume small." A run nobody scaled — auto-opened, or one
 * whose scale was never written (`/asf verify` calls setPhase without one) — is held
 * to the small floor: a real test run and evidence, not the health audit and full
 * suite that standard demands. Only an explicit reading widens it. This used to fall
 * back to standard unless an earlier `/asf small` had flipped a process-wide flag, so
 * the same unscaled run was judged differently depending on what an earlier run in
 * the same process had done — and the card, which printed the raw field, said "small"
 * while the gate demanded standard's ceremony.
 */
export function currentScale(state?: AsfState | null): "small" | "standard" | "major" {
  // Compared as strings: "standard" is not an AsfScale today, but a state file may
  // carry it (hand-edited, or written by a newer ASF), and it must keep its meaning.
  const raw = String(state?.scale ?? "");
  if (raw === "large") return "major";
  if (raw === "standard") return "standard";
  return "small";
}

