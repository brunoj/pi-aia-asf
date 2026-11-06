/**
 * pi-aia-asf — Ai Applied Agentic Software Factory.
 *
 * Small extension complementing the aia-asf skill:
 *  - `/asf` commands (new, feature, bugfix, refactor, status, abort)
 *  - per-project phase state (JSON in ~/.pi/agent/skills/aia-asf/projects/<project>/state.json)
 *  - startup + first-run dependency check (pi-vigilant, web search/fetch, browser)
 *
 * The actual workflow lives in skills/aia-asf/SKILL.md — this extension only
 * provides state and commands. Safe to load even when dependencies are missing:
 * it warns instead of crashing.
 */

import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { cpus, loadavg } from "node:os";
import { execFileSync } from "node:child_process";

import { createLedger, deriveSuiteRun, renderLedger } from "./lib/gates/ledger.mjs";
import { evaluateBlockers, BLOCKERS, RULE_TEXT, refusalStage, __resetRefusals } from "./lib/gates/blockers.mjs";
import { createAuthority, renderAuthority } from "./lib/gates/authority.mjs";
import { decideSettlement, renderCompletionGate, MAX_STEERS, MAX_IDENTICAL_STEERS, steerFingerprint } from "./lib/gates/settle.mjs";
import { projectKey as resolveProjectKey, __clearProjectCache } from "./lib/project.mjs";
import { classifyToolCall, activationDecision, isSourcePath, bashWritesSource } from "./lib/activation.mjs";
import { renderRunCard, cardSummary, CARD_CEILING_BYTES } from "./lib/run-card.mjs";
import { cli as configCli, screenModel, assertParametersAreConsumed, readProjectConfig } from "./lib/gates/config.mjs";
import { loadDeclarations, renderRules, assertSignalsExist } from "./lib/gates/declarations.mjs";
import { renderDeliveryReport, renderChecklist } from "./lib/gates/report.mjs";
import { PARAMS } from "./lib/gates/defaults.mjs";

// ─── Types ─────────────────────────────────────────────────────────────────

type AsfPhase =
  | "none"
  | "classify"
  | "intake"
  | "research"
  | "specs"
  | "adversarial"
  | "plan"
  | "implementation"
  | "verification";

type AsfScale = "small" | "large";

interface AsfState {
  workType?: "new-project" | "feature" | "major-bugfix" | "refactor";
  scale?: AsfScale;
  phase: AsfPhase;
  planApproved?: boolean;
  startedAt?: string;
  updatedAt: string;
  /** P1: identity and provenance of the run. */
  runId?: string;
  /** True when the software-work detector opened this run, not a human. */
  auto?: boolean;
  /** What opened it: a command, or the shape of the work seen. */
  trigger?: string;
  /** One line: what this run is for. Goes on the card. */
  objective?: string;
  /** Claimed ticket, when this run is Betamaxx work. */
  ticketId?: string;
  /** P4 working-set anchor: paths this run has changed. */
  filesTouched?: string[];
  /** True once this run changed source — the completion floor then needs a test. */
  sourceMutated?: boolean;
  /** Steers issued, and the exact gaps already raised (never raised twice). */
  steers?: number;
  seenSteers?: string[];
  /** The run the PO silenced with `/asf passive`. */
  passiveRunId?: string;
  /** Epoch ms of the last source mutation in this run. */
  lastMutationAt?: number;
  /** Set when the run needs input ASF genuinely cannot supply. */
  parked?: { reason: string; question: string; at: string };
}

/** Definition-of-done checks (references/06b-testing-qa.md, Rule 10). */
const QA_CHECKLIST: Array<{ key: string; label: string }> = [
  { key: "build", label: "Typecheck/build passes" },
  { key: "tests", label: "Full test suite green (not a subset) — the gate; Rule 19 never relaxes this checkbox" },
  { key: "regression", label: "Regression test added for every bug fixed this cycle" },
  { key: "triggers", label: "Triggers AND non-triggers tested for conditional behavior" },
  { key: "artifact", label: "Shipped artifact inspected (npm pack file list) + clean-room install" },
  { key: "observable", label: "Observable end state verified as a user would experience it" },
  { key: "browser", label: "Every interface the change TOUCHES exercised through a real browser during the build (06b Rule 9) — page + action + assertion named; n/a with reason if none" },
  { key: "specs", label: "Every MUST spec 'met' with concrete evidence" },
  { key: "trace", label: "Spec-to-code traceability: every met spec has outcome → codePath → test" },
  { key: "code-health", label: "Code Health Gate passed (or enabled:false / gate.mode:warn with the report shown)" },
  { key: "model", label: "Model (06j): every relationship the change touches has a written ownership declaration; store writes have invariant + non-effect tests (06g §3); /asf health model level passes or its findings are accepted with a reason; n/a with reason if no persistence touched" },
  { key: "surface", label: "Every delivered feature is consumed by a surface (UI or API) — nothing dead" },
  { key: "e2e", label: "Feature specs have an end-to-end behavioral test through the real entry point" },
  { key: "honest", label: "Skipped/inconclusive checks reported explicitly" },
];

/** Spec-to-code traceability (M1) — mirrors pi-vigilant's Trace. */
interface Trace {
  outcome: string;
  codePath: string;
  testFile?: string;
  assertion?: string;
}

interface SpecItem {
  id: string;
  requirement: string;
  area: string;
  priority: string;
  status: string;
  trace?: Trace;
}

interface ProjectStateFile {
  current: AsfState | null;
  history: Array<{ workType: string; phase: AsfPhase; startedAt: string; endedAt: string }>;
}

// ─── Constants & helpers ───────────────────────────────────────────────────

const SKILLS_DIR = join(homedir(), ".pi", "agent", "skills");
const STATE_DIR = join(SKILLS_DIR, "aia-asf", "projects");

/**
 * The state key for the current project.
 *
 * This used to be `cwd.split("/").pop()`, which broke enforcement twice over:
 * `cd`-ing into a subdirectory mid-session lost the run (so the gates went quiet
 * while work continued), and two checkouts sharing a basename shared a state
 * file (so one project's green suite satisfied another's push gate). It is now
 * the git work-tree root, falling back to the absolute cwd.
 */
function projectName(): string {
  return resolveProjectKey();
}

function stateFileFor(project: string): string {
  return join(STATE_DIR, project, "state.json");
}

/**
 * The pre-0.15 key (cwd basename). Used only to find run state written by an
 * older ASF, and spec memory written by pi-vigilant < 0.9.
 */
function legacyKey(): string {
  try {
    return basename(process.cwd()) || "default";
  } catch {
    return "default";
  }
}

/**
 * The spec store for this project. pi-vigilant >= 0.9 writes it under the same
 * root-based key ASF uses (pinned vectors in both suites); older versions wrote
 * it under the basename, which is read as a fallback so an un-upgraded
 * pi-vigilant does not make ASF go blind to specs.
 */
async function loadProjectSpecs(): Promise<SpecItem[] | null> {
  return (await loadSpecs(projectName())) ?? (await loadSpecs(legacyKey()));
}

async function loadState(project: string): Promise<ProjectStateFile> {
  const file = stateFileFor(project);
  if (!existsSync(file)) {
    // One-time migration: a run opened under the old basename key is adopted,
    // not orphaned — an upgrade must never silently end an active run.
    const legacy = stateFileFor(legacyKey());
    if (legacy !== file && existsSync(legacy)) {
      try {
        const data = JSON.parse(await readFile(legacy, "utf-8")) as ProjectStateFile;
        if (data && data.current) {
          await saveState(project, data);
          await writeFile(legacy, JSON.stringify({ current: null, history: data.history || [], movedTo: project }, null, 2), "utf-8");
          return data;
        }
      } catch {
        /* unreadable legacy state is not adopted */
      }
    }
    return restoreFromMirror(project, { current: null, history: [] }, "missing");
  }
  try {
    const data = JSON.parse(await readFile(file, "utf-8")) as ProjectStateFile;
    if (!data || typeof data !== "object") return restoreFromMirror(project, { current: null, history: [] }, "corrupt");
    if (!data.history) data.history = [];
    if (!data.current) return restoreFromMirror(project, data, "cleared");
    return data;
  } catch {
    return restoreFromMirror(project, { current: null, history: [] }, "corrupt");
  }
}

async function restoreFromMirror(project: string, data: ProjectStateFile, how: string): Promise<ProjectStateFile> {
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
const runMirror = new Map<string, AsfState>();

async function saveState(project: string, data: ProjectStateFile): Promise<void> {
  if (data.current) runMirror.set(project, JSON.parse(JSON.stringify(data.current)));
  else runMirror.delete(project);
  const file = stateFileFor(project);
  await mkdir(join(STATE_DIR, project), { recursive: true });
  await writeFile(file, JSON.stringify(data, null, 2), "utf-8");
}

// ─── Spec-memory read (shared with pi-vigilant) ────────────────────────────

const SPEC_DIR = join(SKILLS_DIR, "spec-memory", "projects");

function specTaskFileFor(project: string): string {
  return join(SPEC_DIR, project, "current-task.json");
}

async function loadSpecs(project: string): Promise<SpecItem[] | null> {
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
function validateTrace(spec: SpecItem): { ok: boolean; reason: string } {
  const t = spec.trace;
  if (!t || !t.outcome || !t.codePath) {
    return {
      ok: false,
      reason: "met but trace incomplete — outcome + codePath required (add via update_spec_status trace)",
    };
  }
  if (t.testFile) {
    const abs = join(process.cwd(), t.testFile);
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

interface DependencyCheck {
  name: string;
  package: string;
  present: boolean;
  hint: string;
}

function checkDependencies(): DependencyCheck[] {
  // Detect the tools by looking for the packages that register them.
  // Tools are registered by extensions at runtime, so we check the
  // installed packages in ~/.pi/agent/npm and the extensions dir.
  const npmDir = join(homedir(), ".pi", "agent", "npm", "node_modules");
  const extDir = join(homedir(), ".pi", "agent", "extensions");
  const gitDir = join(homedir(), ".pi", "agent", "git");

  const checks: DependencyCheck[] = [
    {
      name: "pi-vigilant (spec-memory: capture_spec / get_task_specs / update_spec_status)",
      package: "pi-vigilant",
      present: existsSync(join(npmDir, "pi-vigilant")) || existsSync(join(extDir, "pi-vigilant")) || existsSync(join(gitDir, "github.com", "brunoj", "pi-vigilant")),
      hint: "pi install npm:pi-vigilant",
    },
    {
      name: "pi-smart-web-search (web_search)",
      package: "pi-smart-web-search",
      present: existsSync(join(npmDir, "pi-smart-web-search")),
      hint: "pi install npm:pi-smart-web-search",
    },
    {
      name: "pi-smart-fetch (web_fetch / batch_web_fetch)",
      package: "pi-smart-fetch",
      present: existsSync(join(npmDir, "pi-smart-fetch")),
      hint: "pi install npm:pi-smart-fetch",
    },
    {
      name: "pi-aia-browser (browser_init / browser_navigate / …)",
      package: "pi-aia-browser",
      present:
        existsSync(join(npmDir, "pi-aia-browser")) ||
        existsSync(join(extDir, "pi-aia-browser")) ||
        existsSync(join(extDir, "pi-browser")) ||
        existsSync(join(gitDir, "github.com", "brunoj", "pi-aia-browser")),
      hint: "pi install npm:pi-aia-browser (installs Playwright + Chromium)",
    },
  ];

  return checks;
}

function dependencySummary(): string {
  const checks = checkDependencies();
  const missing = checks.filter((c) => !c.present);
  if (missing.length === 0) {
    return "All ASF dependencies present: pi-vigilant, pi-smart-web-search, pi-smart-fetch, pi-aia-browser ✓";
  }
  return (
    "⚠️ ASF dependencies missing — install before starting a project:\n" +
    missing.map((m) => `  - ${m.name}\n    → ${m.hint}`).join("\n")
  );
}

// ─── Extension registration ────────────────────────────────────────────────

// ─── Enforcement session state ─────────────────────────────────────────────
//
// What the extension *observed*, not what the agent asserted. The ledger is
// written from tool traffic and there is no model-callable way to append to it:
// if the agent could append an entry it would append a convenient one.

const ledger = createLedger();
const authority = createAuthority();

interface GateStat {
  verdicts: number;
  fired: number;
  confirmedFalse: number;
  blocks: number;
}
const gateStats: Record<string, GateStat> = {};

/** Set when register() runs; the ledger writes entries through it. */
let piRef: ExtensionAPI | null = null;

/** suite-run attempts awaiting their result, keyed by toolCallId. */
const pendingSuiteRuns = new Map<string, Record<string, unknown>>();
/** Completed suite runs — the fact the push gate checks for. */
const suiteRuns: Array<{ scope: string; exitCode: number; command: string; durationMs: number; testCount: number | string; at?: number }> = [];
/** Memoised dirty-tree answer, refreshed at most once per tool call. */
let dirtyCache: { at: number; dirty: boolean } | null = null;

let lastSettleDecision: { missing: string[]; exhausted?: boolean } | null = null;
let webTouched = false;
let impactStated = false;

// ─── P1/P4/P5/P6 runtime state ─────────────────────────────────────────────────

/** A card waiting to be delivered at the next actionable boundary. */
let pendingCard: { text: string; reason: string } | null = null;
/** P5: machine-authored turns since the last human one, and the last re-anchor. */
let machineTurnsSinceHuman = 0;
let lastReanchorAt = 0;
export const REANCHOR_AFTER_MACHINE_TURNS = 25;
export const REANCHOR_MIN_INTERVAL_MS = 30 * 60 * 1000;
/** P6: source mutations since the last test run in this run. */
let blindMutations = 0;
let blindNudged = false;
export const BLIND_EDIT_NUDGE_AFTER = 11;
/** Steers ASF wants to deliver (blocker steers, ladder rule text, nudges). */
const pendingSteers: string[] = [];
/** Never deliver the same steer text twice in a session. */
const deliveredSteers = new Set<string>();

/**
 * P2: persisted evidence is deduplicated by content. The traces held 97,278
 * gate-verdict entries with 13 distinct contents — every session wrote the
 * byte-identical verdict at every settle. After the first write it carries no
 * information. Events (gate-block, suite-run, transitions) are never deduped:
 * they are what a trace study measures.
 */
const EVENT_KINDS = new Set(["run-restored", "gate-block", "suite-run", "spec-transition", "browser-verify", "browser-na", "health-run", "perf-scenario", "run-open", "run-close", "park", "steer", "passive"]);
const persistedVerdicts = new Set<string>();
let passiveHeartbeatWritten = false;

function verdictSignature(entry: Record<string, unknown>): string {
  const { ts, at, timestamp, ...rest } = entry as Record<string, unknown> & { ts?: unknown; at?: unknown; timestamp?: unknown };
  return JSON.stringify(rest, Object.keys(rest).sort());
}

/** Should this evidence entry be persisted to the session file? */
export function shouldPersist(entry: Record<string, unknown>, seen: Set<string>): boolean {
  const kind = String(entry.kind || "");
  if (EVENT_KINDS.has(kind)) return true;
  const sig = verdictSignature(entry);
  if (seen.has(sig)) return false;
  seen.add(sig);
  return true;
}

function queueSteer(text: string) {
  const key = text.replace(/\s+/g, " ").trim();
  if (!key || deliveredSteers.has(key) || pendingSteers.includes(text)) return;
  pendingSteers.push(text);
}

function newRunId(): string {
  return `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function cardFor(state: AsfState | null, nextStep?: string, remedy?: string): string {
  if (!state) return "";
  const openDod = (lastSettleDecision?.missing || []).slice(0, 6);
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
async function openAutoRun(trigger: string, path: string | null): Promise<AsfState> {
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
  blindMutations = 0;
  blindNudged = false;
  appendEvidence({ kind: "run-open", runId: state.runId, auto: true, trigger, project });
  pendingCard = { text: cardFor(state), reason: "activation" };
  return state;
}

/** Where this extension is installed — the declaration file ships beside it. */
function extensionDir(): string {
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
function collectMeasurements(): Record<string, unknown> {
  const m: Record<string, unknown> = {};
  const last = [...ledger.entries].reverse().find((e: any) => e.kind === "suite-run" && e.scope === "full");
  if (last && typeof last.durationMs === "number") m.suiteRuntimeMs = last.durationMs;
  const cores = cpus()?.length;
  if (cores) m.cores = cores;
  const la = loadavg()?.[0];
  if (typeof la === "number" && cores) m.machineQuiet = la <= cores;
  return m;
}

function recordVerdict(gate: string, v: { fired?: boolean; scanned?: number }) {
  const s = (gateStats[gate] ||= { verdicts: 0, fired: 0, confirmedFalse: 0, blocks: 0 });
  s.verdicts++;
  if (v.fired) s.fired++;
  // scanned: 0 is recorded as examined-nothing. It is never a pass, here or in
  // the report, and the ledger keeps the number so the claim can be audited.
  if (v.scanned === 0) s.confirmedFalse++;
}

function appendEvidence(entry: Record<string, unknown>) {
  const res = ledger.append(entry);
  if (res.ok) {
    if (!shouldPersist(res.entry as Record<string, unknown>, persistedVerdicts)) return res;
    try {
      // Durable and excluded from model context: evidence costs no prompt budget.
      (piRef as unknown as { appendEntry?: (t: string, d?: unknown) => void } | null)?.appendEntry?.("asf-evidence", res.entry);
    } catch {
      /* the in-memory ledger is the source of truth for this session */
    }
  } else {
    try {
      (piRef as unknown as { appendEntry?: (t: string, d?: unknown) => void } | null)?.appendEntry?.("asf-evidence-rejected", { problem: res.error });
    } catch {
      /* reported where possible */
    }
  }
  return res;
}

/** Is the working tree dirty? Fail-open: an unknown state must not block. */
function gitDirty(): boolean {
  const now = Date.now();
  if (dirtyCache && now - dirtyCache.at < 5000) return dirtyCache.dirty;
  let dirty = false;
  try {
    const out = execFileSync("git", ["status", "--porcelain"], { cwd: process.cwd(), encoding: "utf-8", timeout: 5000 });
    dirty = String(out).trim().length > 0;
  } catch {
    // Not a repo, or git unavailable: we cannot claim the tree is dirty, and a
    // convenience gate must not block on its own blindness.
    dirty = false;
  }
  dirtyCache = { at: now, dirty };
  return dirty;
}

function numberConfig(config: Record<string, unknown>, key: string, fallback: number): number {
  const v = config[key];
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

/** Small work is held to the reduced DoD — the scale rule is the trigger here. */
function currentScale(state?: AsfState | null): "small" | "standard" | "major" {
  if (state?.scale === "small") return "small";
  if (state?.scale === "large") return "major";
  return lastScaleWasSmall ? "small" : "standard";
}
let lastScaleWasSmall = false;

export default function register(pi: ExtensionAPI): void {
  piRef = pi;
  // Startup check: warn once per session if deps are missing (unless disabled)
  // The extension loads at startup; log to console so it surfaces in logs.

  const setPhase = async (ctx: ExtensionCommandContext, phase: AsfPhase, workType?: AsfState["workType"], scale?: AsfScale): Promise<string> => {
    const project = projectName();
    const state = await loadState(project);
    const now = new Date().toISOString();

    if (state.current && phase === "none") {
      state.history.push({
        workType: state.current.workType || "unknown",
        phase: state.current.phase,
        startedAt: state.current.startedAt || now,
        endedAt: now,
      });
      state.current = null;
    } else {
      if (!state.current) {
        state.current = {
          workType,
          phase: "classify",
          startedAt: now,
          updatedAt: now,
          runId: newRunId(),
          auto: false,
          trigger: "command",
          steers: 0,
          seenSteers: [],
        };
        __resetRefusals();
      }
      if (workType) state.current.workType = workType;
      if (scale) state.current.scale = scale;
      state.current.phase = phase;
      state.current.updatedAt = now;
    }

    await saveState(project, state);
    return state.current ? `ASF phase → ${phase}${workType ? ` (${workType})` : ""}` : "ASF session ended.";
  };

  // pi >= 1.0 contract: registerCommand(name, { description, handler }) where
  // handler receives the raw argument STRING and returns void — output goes to
  // ctx.ui.notify(). The command body stays a string-returning function so the
  // gate text is testable without a UI.
  const runAsf = async (
    args: string[],
    ctx: ExtensionCommandContext,
  ): Promise<string> => {
    const sub = (args[0] || "").toLowerCase();

    switch (sub) {
      case "new":
        return await setPhase(ctx, "intake", "new-project", "large");
      case "feature":
        return await setPhase(ctx, "intake", "feature", "large");
      case "bugfix":
        return await setPhase(ctx, "intake", "major-bugfix", "large");
      case "refactor":
        return await setPhase(ctx, "intake", "refactor", "large");
      case "small":
        lastScaleWasSmall = true;
        return await setPhase(ctx, "implementation", undefined, "small");
      case "status": {
        const project = projectName();
        const state = await loadState(project);
        if (!state.current) return "No active ASF session.";
        return (
          `ASF status (${project}):\n` +
          `  work type: ${state.current.workType || "unset"}\n` +
          `  scale: ${state.current.scale || "unset"}${state.current.scale === "small" ? " (floor: a real test run and evidence; no plan/approval gates)" : ""}${state.current.auto ? " — opened automatically by software work" : ""}\n` +
          `  phase: ${state.current.phase}\n` +
          `  plan approved: ${state.current.planApproved ? "yes" : "no"}\n` +
          (state.current.passiveRunId && state.current.passiveRunId === state.current.runId ? `  passive: this run only\n` : "") +
          (state.current.parked ? `  PARKED: ${state.current.parked.question}\n` : "") +
          `  started: ${state.current.startedAt || "?"}\n` +
          `  history: ${state.history.length} completed session(s)`
        );
      }
      case "verify": {
        // Gate 7: force an explicit, itemised QA pass before delivery.
        // Large work: mechanical spec-to-code traceability gate (M1).
        const project = projectName();
        const state = await loadState(project);
        if (!state.current) return "No active ASF session — nothing to verify.";
        await setPhase(ctx, "verification");
        const scale = state.current.scale;
        const lines: string[] = [
          `ASF verification gate (${project}) — Definition of Done.`,
          `Scale: ${scale || "unset"}${
            scale === "large"
              ? " — mechanical traceability gate ACTIVE"
              : scale === "small"
                ? " (floor only — no mechanical traceability gate)"
                : ""
          }`,
        ];

        if (scale === "large") {
          const specs = await loadProjectSpecs();
          lines.push("\nSPEC-TO-CODE TRACEABILITY (M1 — large work):");
          if (!specs || specs.length === 0) {
            lines.push(
              "  (no spec-memory task found — capture specs with capture_spec, incl. items from external planning docs)",
            );
          } else {
            const metSpecs = specs.filter((s) => s.status === "met");
            if (metSpecs.length === 0) {
              lines.push(
                "  (no specs marked met yet — traceability applies when closing specs)",
              );
            } else {
              let allOk = true;
              for (const spec of metSpecs) {
                const check = validateTrace(spec);
                if (!check.ok) allOk = false;
                lines.push(`  [${check.ok ? "PASS" : "FAIL"}] ${spec.id}: ${check.reason}`);
                if (check.ok && spec.trace) {
                  lines.push(`       outcome: ${spec.trace.outcome}`);
                  lines.push(`       code path: ${spec.trace.codePath}`);
                  if (spec.trace.testFile) {
                    lines.push(
                      `       test: ${spec.trace.testFile}${spec.trace.assertion ? ` (asserts "${spec.trace.assertion}")` : ""}`,
                    );
                  }
                }
              }
              lines.push(
                allOk
                  ? "\n  ✓ All met specs have complete traces."
                  : "\n  ✗ GATE NOT PASSED — resolve FAIL rows before delivery (attach trace via update_spec_status).",
              );
            }
          }
        }

        if (scale === "large") {
          // Gate 8: Code Health — objective convolution measurement.
          const { runHealth } = await import("./lib/code-health/index.mjs");
          const health = await runHealth(process.cwd(), []);
          lines.push("\nCODE HEALTH (Gate 8 — large work):");
          lines.push(health.text);
          if (health.exitCode === 1) {
            lines.push("\n  ✗ GATE NOT PASSED — resolve code-health violations before delivery.");
          } else if (!health.healthy && health.config?.gate?.mode === "warn") {
            lines.push("\n  ⚠ warn mode: violations reported but not blocking.");
          } else {
            lines.push("\n  ✓ Code health gate passed.");
          }
        }

        lines.push(
          "\nDefinition of Done checklist (references/06b-testing-qa.md Rule 10):",
        );
        lines.push(
          "Read references/06b-testing-qa.md. Confirm EACH item with concrete evidence",
        );
        lines.push(
          "(command output, file list, screenshot). Do not tick anything you did not run.",
        );
        lines.push("");
        QA_CHECKLIST.forEach((c, i) => lines.push(`  ${i + 1}. [ ] ${c.label}`));
        lines.push(
          "\nThen run get_task_specs and close every spec with update_spec_status.",
        );
        lines.push(
          "Unverifiable → 'partial' + ask the user. Never self-certify.",
        );
        return lines.join("\n");
      }
      case "health": {
        // Code Health Gate: objective measurement of convolution at function /
        // module / architecture level (references/06e-code-health.md).
        const { runHealth } = await import("./lib/code-health/index.mjs");
        const res = await runHealth(process.cwd(), args.slice(1));
        const tail =
          res.exitCode === 1
            ? "\n\n✗ GATE FAILED — resolve the violations before delivery."
            : res.config?.gate?.mode === "warn" && !res.healthy
              ? "\n\n(warn mode: violations reported, gate not blocking)"
              : "";
        return res.text + tail;
      }
      case "rules": {
        // The registry question with an answer: "what enforces anything around
        // browser testing?" used to require reading every reference file.
        const here = process.cwd();
        const pkgDir = extensionDir();
        const { obligations, problems } = loadDeclarations(pkgDir);
        if (problems.length) {
          return `ASF declaration has problems:\n- ${problems.join("\n- ")}`;
        }
        const filter = args[1];
        const cls = ["H", "M", "S"].includes((filter || "").toUpperCase()) ? filter.toUpperCase() : undefined;
        const area = cls ? undefined : filter;
        const drift = assertSignalsExist(pkgDir, obligations);
        const text = renderRules(obligations, { area, cls });
        return text + (drift.length ? `\n\nDeclaration/test drift:\n- ${drift.join("\n- ")}` : "");
      }
      case "config": {
        // One screen for every parameter. The screen is a convenience, not the
        // only door: --get/--set/--explain/--check work headless with the same
        // validation, so a typo is refused here rather than discovered later by
        // a gate silently not running.
        const a = args.map((s) => s.trim()).filter(Boolean);
        const flag = (a[1] || "--get").toLowerCase();
        const projectDir = process.cwd();
        const measurements = collectMeasurements();
        if (flag === "--screen" || flag === "screen") {
          const rows = screenModel({ projectDir, measurements });
          return rows
            .map(
              (r) =>
                `${r.id} = ${r.currentValue}  [${r.origin}]  band ${r.band}${r.nonAdaptive ? "  (NON-ADAPTIVE)" : ""}\n    ${r.meaning ?? r.description.split("\n")[0]}`,
            )
            .join("\n");
        }
        if (flag === "--check") {
          const problems = assertParametersAreConsumed(readProjectConfig(projectDir), {
            knownGates: [...new Set(Object.values(PARAMS).map((p: { gate: string }) => p.gate))],
          });
          return problems.length ? `configuration problems:\n- ${problems.join("\n- ")}` : "configuration is consistent";
        }
        const action = flag === "--set" ? "set" : flag === "--unset" ? "unset" : flag === "--explain" ? "explain" : "get";
        let key: string | undefined = a[2];
        let value: string | undefined;
        if (action === "set" && key && key.includes("=")) {
          const [k, ...rest] = key.split("=");
          key = k;
          value = rest.join("=");
        }
        return configCli({ action, key, value, projectDir, measurements });
      }
      case "report": {
        // The delivery report is ASSEMBLED, not written (P35). Everything below
        // comes from what the harness observed this session; a gap stays visible
        // as a gap rather than becoming a tick.
        const checklist = args[1] === "--checklist";
        return checklist
          ? renderChecklist()
          : renderDeliveryReport({
              ledger,
              authority,
              gateStats,
              completion: lastSettleDecision || { missing: [] },
            });
      }
      case "gates": {
        // What the enforcement layer decided, and what it charged.
        return [
          renderLedger(ledger),
          renderAuthority(authority, gateStats),
          renderCompletionGate(lastSettleDecision || { missing: [] }),
        ].join("\n\n");
      }
      case "abort":
        return await setPhase(ctx, "none");
      case "passive": {
        // Silences THIS run only. The next run that software work opens is
        // enforced again — a permanent per-session or per-project switch would be
        // a bypass of "ASF at all times", so it does not exist.
        const project = projectName();
        const file = await loadState(project);
        if (!file.current || file.current.phase === "none") return "No active ASF run — nothing to make passive. The next software work will open one.";
        file.current.passiveRunId = file.current.runId || newRunId();
        file.current.runId = file.current.passiveRunId;
        file.current.updatedAt = new Date().toISOString();
        await saveState(project, file);
        appendEvidence({ kind: "passive", runId: file.current.runId, by: "command" });
        return "ASF: this run is passive — the irreversibility gates still hold, steers and the completion floor are off until the run ends. The next run is enforced again.";
      }
      case "card": {
        const file = await loadState(projectName());
        if (!file.current || file.current.phase === "none") return "No active ASF run.";
        return cardFor(file.current);
      }
      default:
        return (
          "ASF commands:\n" +
          "  /asf new        — start a new software project (large, gated)\n" +
          "  /asf feature    — add a feature to an existing project (large, gated)\n" +
          "  /asf bugfix     — major bugfix (large, gated)\n" +
          "  /asf refactor   — architectural refactor (large, gated)\n" +
          "  /asf small      — small change: the floor (a real test run, evidence) without plan/approval gates\n" +
          "  /asf passive    — silence steers for THIS run only (irreversibility gates still hold)\n" +
          "  /asf card       — show the active run card\n" +
          "  /asf status     — show current phase\n" +
          "  /asf health     — run the code health gate (function/module/architecture)\n" +
          "  /asf verify     — run the definition-of-done QA gate\n" +
          "  /asf rules [H|M|S|area] — list declared obligations and what enforces them\n" +
          "  /asf report [--checklist] — the delivery report, assembled from observed evidence\n" +
          "  /asf config [--get [k] | --set k=v | --unset k | --explain k | --check | --screen] — every ASF parameter, with its origin\n" +
          "  /asf gates      — gate verdicts, authority state and friction for this session\n" +
          "  /asf abort      — end the current session\n\n" +
          dependencySummary()
        );
    }
  };

  pi.registerCommand("asf", {
    description:
      "Agentic Software Factory — /asf new|feature|bugfix|refactor|small|status|verify|health|passive|card|abort",
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      const argv = args.trim() ? args.trim().split(/\s+/) : [];
      const out = await runAsf(argv, ctx);
      if (out) ctx.ui.notify(out, "info");
    },
  });

  // Plan-approval helper: /asf-approve records Gate 5 approval (requires PLAN.md)
  const runApprove = async (ctx: ExtensionCommandContext): Promise<string> => {
    const project = projectName();
    const state = await loadState(project);
    if (!state.current) return "No active ASF session — start one with /asf new|feature|bugfix|refactor.";

    // Gate 5 must approve something that actually exists: refuse to rubber-stamp
    // when no PLAN.md is present (a plan the user never saw cannot be approved).
    const planPath = join(process.cwd(), "PLAN.md");
    if (!existsSync(planPath)) {
      return (
        `No PLAN.md found in ${process.cwd()}.\n` +
        "Gate 5 approves a written plan — write PLAN.md and present it to the user first."
      );
    }

    state.current.planApproved = true;
    state.current.phase = "implementation";
    state.current.updatedAt = new Date().toISOString();
    await saveState(project, state);
    return (
      "Plan approved ✓ — Gate 5 passed, implementation may begin.\n" +
      "Test-first, strict codebase isolation, regression test per bug fixed.\n" +
      "Run /asf verify before delivery."
    );
  };

  pi.registerCommand("asf-approve", {
    description: "Record Gate 5 plan approval (requires PLAN.md) and begin implementation",
    handler: async (_args: string, ctx: ExtensionCommandContext) => {
      ctx.ui.notify(await runApprove(ctx), "info");
    },
  });

  // ── tool_call: observe, then block only what is objectively blockable ────
  //
  // Two jobs, in this order. First **observe**: turn what the extension watched
  // happen into evidence, because "I ran the full suite" and "I did not run the
  // full suite" must not be two sentences with no observable difference. Then
  // **block**: only rules decidable from the tool input plus session state, each
  // with an autonomous exit the agent can take itself.
  //
  // No gate here asks a human anything. `block: true, reason` returns the reason
  // to the model, which is agent-facing feedback; nothing calls a UI prompt to
  // seek approval. A blocker whose only exit is a human decision is misdesigned
  // and belongs in the report, not in the path.
  pi.on("tool_call", async (event) => {
    try {
      const toolName = String((event as { toolName?: unknown }).toolName || "");
      const input = (event as { input?: Record<string, unknown> }).input || {};

      // ── P1: software work opens (or feeds) an ASF run — at all times ───────
      // Edit/write AND bash write constructs, on the FIRST source mutation.
      // An observer failure here must not block the work, so it is fenced.
      try {
        const call = classifyToolCall(toolName, input);
        if (call.mutates && call.source) {
          const project = projectName();
          const file = await loadState(project);
          const decision = activationDecision({ call, activeRun: file.current, passiveRunId: file.current?.passiveRunId });
          if (decision.activate) {
            await openAutoRun(`${toolName}${call.via && call.via !== "tool" ? `:${call.via}` : ""}`, call.path);
          } else if (file.current && file.current.phase !== "none") {
            const cur = file.current;
            cur.sourceMutated = true;
            cur.lastMutationAt = Date.now();
            if (call.path) {
              const list = (cur.filesTouched || []).filter((p) => p !== call.path);
              list.push(call.path);
              cur.filesTouched = list.slice(-10);
            }
            cur.updatedAt = new Date().toISOString();
            await saveState(project, file);
          }
          // P6: a long blind-editing stretch gets one steer, never a block.
          if (decision.reason !== "passive") {
            blindMutations++;
            if (blindMutations >= BLIND_EDIT_NUDGE_AFTER && !blindNudged) {
              blindNudged = true;
              const recent = (file.current?.filesTouched || (call.path ? [call.path] : [])).slice(-4).join(", ");
              queueSteer(
                `ASF: ${blindMutations} source changes this run without a test run${recent ? ` (latest: ${recent})` : ""}. ` +
                  `Run the tests that cover them now — a regression found here is cheaper than one found after the next ${BLIND_EDIT_NUDGE_AFTER}. ` +
                  `This is guidance, not a stop.`,
              );
              appendEvidence({ kind: "steer", gate: "blind-edits", count: blindMutations });
            }
          }
        }
      } catch {
        /* activation is an observer: it never breaks the call it watches */
      }

      // Observe: a full test-suite run becomes evidence only because we saw it.
      const command = typeof input.command === "string" ? input.command : undefined;
      if (command) {
        const started = Date.now();
        const derived = deriveSuiteRun(command, 0, 0, "");
        if (derived) {
          // Exit code and duration are filled in by the tool_result handler;
          // recording the attempt here keeps the ledger chronological.
          (derived as Record<string, unknown>)._startedAt = started;
          pendingSuiteRuns.set((event as { toolCallId?: string }).toolCallId || String(started), derived);
        }
        if (/\basf-approve\b/.test(command)) {
          // A bypass is recorded as friction, never as evidence the gate is
          // wrong: otherwise the exploit is to bypass a gate until it demotes.
          appendEvidence({
            kind: "gate-block",
            gate: "asf-approve",
            rule: "bypass-requested",
            reason: "asf-approve invoked — recorded as friction; a bypass request is not evidence that a gate is wrong",
            bypassed: true,
          });
        }
      }

      // Observe: a write to a web surface means browser verification is owed.
      const touched = typeof input.path === "string" ? input.path : typeof input.file_path === "string" ? input.file_path : "";
      if (touched && /\.(tsx|jsx|html|vue|svelte|css)$/i.test(touched)) webTouched = true;

      const config = readProjectConfig(process.cwd());
      const enabled: Record<string, boolean> = {};
      for (const b of BLOCKERS) {
        const k = b.switch.replace(/^gate\./, "");
        if (config[`gate.block.${k}`] === false || config[b.switch] === false) enabled[b.switch] = false;
      }

      const res = evaluateBlockers(toolName, input, {
        suiteRuns,
        dirty: () => gitDirty(),
        impactStated,
        trackedPaths: undefined,
      }, { enabled });

      for (const v of res.verdicts || []) {
        recordVerdict(v.gate, v);
        appendEvidence({ kind: "gate-verdict", gate: v.gate, fired: !!v.fired, scanned: typeof v.scanned === "number" ? v.scanned : 0 });
      }

      // Steer-mode gates never refuse: they queue guidance and let the call run.
      for (const s of (res as { steers?: Array<{ gate: string; reason: string }> }).steers || []) {
        appendEvidence({ kind: "steer", gate: s.gate, reason: String(s.reason || "").slice(0, 300) });
        queueSteer(`ASF (${s.gate}): ${s.reason}`);
      }

      // P3 third rung: park for the PO rather than refuse a fourth time.
      const park = (res as { park?: { reason: string; question: string; item?: string } }).park;
      if (park) {
        appendEvidence({ kind: "park", reason: park.reason, question: park.question });
        try {
          const project = projectName();
          const file = await loadState(project);
          if (file.current) {
            file.current.parked = { reason: park.reason, question: park.question, at: new Date().toISOString() };
            await saveState(project, file);
          }
        } catch {
          /* the block below still holds */
        }
      }

      if (res.block) {
        const gate = res.rule || "unknown";
        const s = (gateStats[gate] ||= { verdicts: 0, fired: 0, confirmedFalse: 0, blocks: 0 });
        s.blocks++;
        appendEvidence({ kind: "gate-block", gate, rule: res.rule || gate, reason: String(res.reason || "").slice(0, 400) });
        // Automatic demotion check (P45): a gate that blocks repeatedly in one
        // run is interrupting the loop rather than guarding it.
        const budgets = {
          falsePositiveBudget: numberConfig(config, "gate.falsePositiveBudget", 0.05),
          blocksPerRunBudget: numberConfig(config, "gate.blocksPerRunBudget", 3),
        };
        const check = authority.checkBudget(gate, {
          blocksThisRun: s.blocks,
          verdicts: gateStats[gate]?.verdicts || 0,
          falsePositives: gateStats[gate]?.confirmedFalse || 0,
          budgets,
        });
        if (check.demote && check.report) {
          try {
            (pi as unknown as { appendEntry?: (t: string, d?: unknown) => void }).appendEntry?.("asf-gate-transition", {
              gate,
              to: "demoted",
              reason: check.reasons.join("; "),
            });
          } catch {
            /* reported where possible */
          }
        }
        // P3 second rung: the refusal carries the rule itself, not just the veto.
        const ruleText = (res as { ruleText?: string | null }).ruleText;
        const stage = (res as { refusalStage?: number }).refusalStage;
        const reason = ruleText
          ? `${res.reason}\n\nThis is the ${stage === 2 ? "second" : `${stage}th`} identical refusal — the rule, so it sticks: ${ruleText}`
          : park
            ? `${res.reason}\n\nParked for the PO: ${park.question} Continue with other work meanwhile; only this action waits.`
            : res.reason;
        return { block: true, reason };
      }
      return undefined;
    } catch {
      // An observer must never break the thing it observes. The fail-safe for
      // the secret rule lives inside evaluateBlockers, where it is explicit.
      return undefined;
    }
  });

  // ── tool_result: complete the evidence for an observed suite run ────────
  //
  // The exit code and duration are what make a suite run a fact rather than an
  // attempt, and they come from what the tool returned — not from what the
  // agent says it returned. Test counts are recorded only where a known runner's
  // output can actually be read; otherwise they stay 'unknown', never 0.
  pi.on("tool_result", (event) => {
    try {
      const id = String((event as { toolCallId?: unknown }).toolCallId || "");
      const pending = pendingSuiteRuns.get(id);
      if (!pending) return undefined;
      pendingSuiteRuns.delete(id);

      const content = (event as { content?: unknown }).content;
      const output = typeof content === "string" ? content : JSON.stringify(content ?? "");
      const isError = !!(event as { isError?: boolean }).isError;
      const startedAt = typeof pending._startedAt === "number" ? pending._startedAt : Date.now();
      const derived = deriveSuiteRun(
        String(pending.command || ""),
        isError ? 1 : 0,
        Date.now() - startedAt,
        output,
      );
      if (derived) {
        delete (derived as Record<string, unknown>)._startedAt;
        // P6: any real test run ends the blind stretch.
        blindMutations = 0;
        blindNudged = false;
        suiteRuns.push({
          at: startedAt,
          scope: derived.scope,
          exitCode: derived.exitCode,
          command: derived.command,
          durationMs: derived.durationMs,
          testCount: derived.testCount,
        });
        appendEvidence({ ...derived });
      }
      return undefined;
    } catch {
      return undefined;
    }
  });

  // ── agent_before_settle: no "done" without evidence ───────────────────
  //
  // Registered here and not on `agent_settled` because pi documents the latter
  // as final and notification-only, while `agent_before_settle` is the final
  // actionable boundary. And nothing here awaits a resumed run: the loop guard
  // documents a production hang caused by exactly that.
  pi.on("agent_before_settle", async (event) => {
    try {
      // Boundary entries REPLACE the proposal field, so earlier handlers' entries
      // (other extensions) are carried forward, never dropped.
      // Not a boundary event we understand: never request a continuation on a
      // contract we cannot see (pi always passes an object here).
      if (!event || typeof event !== "object") return undefined;
      const ev = event as unknown as { entries?: Array<Record<string, unknown>> };
      const prior: Array<Record<string, unknown>> = Array.isArray(ev?.entries) ? [...ev.entries] : [];
      // The completion gate belongs to an ASF run — which, since P1, software
      // work opens automatically. A plain question in a scratch directory has no
      // run and is never judged.
      const project = projectName();
      const file = await loadState(project);
      const state = file.current;

      // Queued steers (P3 rule text, P6 nudge, steer-mode gates) go out first,
      // once each. They never stop anything; they ride the settle boundary
      // because it is the only point a custom_message reaches the model.
      const steerEntries: Array<Record<string, unknown>> = [...prior];
      const priorCount = prior.length;
      if (pendingCard) {
        steerEntries.push({ type: "custom_message", customType: "asf-run-card", content: pendingCard.text, display: true, details: { reason: pendingCard.reason } });
        pendingCard = null;
      }
      while (pendingSteers.length) {
        const text = pendingSteers.shift() as string;
        const key = text.replace(/\s+/g, " ").trim();
        if (deliveredSteers.has(key)) continue;
        deliveredSteers.add(key);
        steerEntries.push({ type: "custom_message", customType: "asf-steer", content: text, display: true });
      }

      if (!state || state.phase === "none" || (state.passiveRunId && state.passiveRunId === state.runId)) {
        if (!state && !passiveHeartbeatWritten) {
          passiveHeartbeatWritten = true;
          appendEvidence({ kind: "passive", by: "no-run" });
        }
        return (steerEntries.length > priorCount ? { entries: steerEntries, continue: true } : undefined) as never;
      }

      // Only a passing test that STARTED after the last source change validates
      // it. A green run from before the edit says nothing about the edit.
      const since = typeof state.lastMutationAt === "number" ? state.lastMutationAt : 0;
      const testRunRecorded = suiteRuns.some((r) => r.exitCode === 0 && (r.at ?? 0) >= since);
      // A7: specs met during THIS run (verifiedAt after the run started) need a
      // complete trace. Automatic — no longer waiting for someone to type /asf verify.
      let untracedMet: string[] = [];
      try {
        const runStart = Date.parse(state.startedAt || "") || 0;
        const specs = (await loadProjectSpecs()) || [];
        untracedMet = specs
          .filter((sp) => sp.status === "met")
          .filter((sp) => {
            const at = Date.parse(String((sp as { verifiedAt?: string }).verifiedAt || ""));
            return Number.isFinite(at) && at >= runStart;
          })
          .filter((sp) => !validateTrace(sp).ok)
          .map((sp) => sp.id);
      } catch {
        /* spec memory unreadable: this item cannot be judged, the rest still is */
      }
      const decision = decideSettlement(ledger, {
        untracedMet,
        scale: currentScale(state),
        webTouched,
        continuationsSoFar: state.steers || 0,
        seenSteers: state.seenSteers || [],
        sourceMutated: !!state.sourceMutated,
        testRunRecorded,
      });
      lastSettleDecision = decision;
      appendEvidence({
        kind: "gate-verdict",
        gate: "completion",
        fired: decision.missing.length > 0,
        missing: decision.missing,
      });

      if (decision.park) {
        state.parked = { reason: decision.park.reason, question: decision.park.question, at: new Date().toISOString() };
        await saveState(project, file);
        appendEvidence({ kind: "park", reason: decision.park.reason, question: decision.park.question });
        steerEntries.push({
          type: "custom_message",
          customType: "asf-park",
          content: `ASF: this needs input ASF cannot supply — ${decision.park.question}\nAsk the PO through the project's input channel (for ticket work: park the ticket), then continue with anything that does not depend on it.`,
          display: true,
          details: { park: decision.park },
        });
        return { entries: steerEntries, continue: true } as never;
      }

      if (decision.block) {
        state.steers = decision.steer;
        state.seenSteers = [...(state.seenSteers || []), decision.fingerprint || ""].slice(-50);
        state.updatedAt = new Date().toISOString();
        await saveState(project, file);
        // The continuation MUST carry content. pi commits `entries` and only
        // then re-checks whether the context can run another provider request;
        // at settle time the context ends with the assistant's own message, so
        // a bare `{ continue: true }` is refused with "agent_before_settle
        // requested continuation without runnable model context". A
        // custom_message projects to a user-role message, which is what makes
        // the next request runnable.
        steerEntries.push({
          type: "custom_message",
          customType: "asf-completion-gate",
          content: decision.continuation,
          display: true,
          details: { missing: decision.missing, steer: decision.steer },
        });
        return { entries: steerEntries, continue: true } as never;
      }

      if (decision.missing.length === 0 && state.auto) {
        // An auto-opened run whose floor is met closes itself: the next piece
        // of software work opens a fresh one with a fresh card.
        file.history.push({ workType: state.workType || "auto", phase: state.phase, startedAt: state.startedAt || state.updatedAt, endedAt: new Date().toISOString() });
        appendEvidence({ kind: "run-close", runId: state.runId, auto: true });
        file.current = null;
        await saveState(project, file);
      }
      return (steerEntries.length > priorCount ? { entries: steerEntries, continue: true } : undefined) as never;
    } catch {
      return undefined;
    }
  });

  // ── turn_end: steers land mid-run, where they can still change the work ──
  //
  // A nudge delivered at settle arrives when the run is already ending. On a
  // turn that executed tools another turn follows anyway, so an appended
  // custom_message is in context for that next request; `continue` is left
  // untouched — ASF never forces or stops a turn from here.
  pi.on("turn_end", async (event) => {
    try {
      const e = event as unknown as { entries?: Array<Record<string, unknown>>; toolResults?: unknown[]; outcome?: string };
      if (!Array.isArray(e.toolResults) || e.toolResults.length === 0) return undefined;
      if (!pendingCard && pendingSteers.length === 0) return undefined;
      const entries: Array<Record<string, unknown>> = Array.isArray(e.entries) ? [...e.entries] : [];
      if (pendingCard) {
        entries.push({ type: "custom_message", customType: "asf-run-card", content: pendingCard.text, display: true, details: { reason: pendingCard.reason } });
        pendingCard = null;
      }
      while (pendingSteers.length) {
        const text = pendingSteers.shift() as string;
        const key = text.replace(/\s+/g, " ").trim();
        if (deliveredSteers.has(key)) continue;
        deliveredSteers.add(key);
        entries.push({ type: "custom_message", customType: "asf-steer", content: text, display: true });
      }
      return { entries } as never;
    } catch {
      return undefined;
    }
  });

  // ── session_start / session_compact: the card is where the rules live ──
  //
  // In 18 days the installed SKILL.md was read 0 times. The card is re-delivered
  // whenever context was reset — a new session, a resumed one, or a compaction,
  // which is exactly when the previous card stopped existing.
  const rearmCard = async (reason: string) => {
    try {
      const file = await loadState(projectName());
      if (file.current && file.current.phase !== "none") {
        pendingCard = { text: cardFor(file.current), reason };
      }
    } catch {
      /* a missing card is a gap, never a crash */
    }
  };
  pi.on("session_start", async () => {
    __clearProjectCache();
    machineTurnsSinceHuman = 0;
    await rearmCard("session_start");
  });
  pi.on("session_compact", async () => {
    await rearmCard("session_compact");
  });

  // ── input: who is talking (P5) ────────────────────────────────────────────────
  //
  // Provenance from pi itself — `interactive`, `rpc` or `extension` — never from
  // the text. ASF does not know or care which extension injected a turn.
  pi.on("input", async (event) => {
    try {
      const source = String((event as { source?: unknown }).source || "interactive");
      if (source === "extension") {
        machineTurnsSinceHuman++;
        if (machineTurnsSinceHuman >= REANCHOR_AFTER_MACHINE_TURNS && Date.now() - lastReanchorAt >= REANCHOR_MIN_INTERVAL_MS) {
          const file = await loadState(projectName());
          if (file.current && file.current.phase !== "none") {
            lastReanchorAt = Date.now();
            machineTurnsSinceHuman = 0;
            pendingCard = { text: cardFor(file.current), reason: "reanchor" };
            appendEvidence({ kind: "steer", gate: "reanchor", machineTurns: REANCHOR_AFTER_MACHINE_TURNS });
          }
        }
      } else {
        machineTurnsSinceHuman = 0;
      }
    } catch {
      /* an observer never alters input */
    }
    return { action: "continue" } as never;
  });

  // ── before_agent_start: deliver a pending card with the run that needs it ──
  pi.on("before_agent_start", async () => {
    try {
      if (!pendingCard) return undefined;
      const card = pendingCard;
      pendingCard = null;
      return { message: { customType: "asf-run-card", content: card.text, display: true, details: { reason: card.reason } } };
    } catch {
      return undefined;
    }
  });
}
