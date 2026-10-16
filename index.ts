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
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { cpus, loadavg } from "node:os";
import { execFileSync } from "node:child_process";

import { createLedger, deriveSuiteRun, renderLedger } from "./lib/gates/ledger.mjs";
import { evaluateBlockers, BLOCKERS } from "./lib/gates/blockers.mjs";
import { createAuthority, renderAuthority } from "./lib/gates/authority.mjs";
import { decideSettlement, renderCompletionGate, MAX_CONTINUATIONS } from "./lib/gates/settle.mjs";
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

function projectName(): string {
  try {
    return process.cwd().split(/[\\/]/).pop() || "default";
  } catch {
    return "default";
  }
}

function stateFileFor(project: string): string {
  return join(STATE_DIR, project, "state.json");
}

async function loadState(project: string): Promise<ProjectStateFile> {
  const file = stateFileFor(project);
  if (!existsSync(file)) {
    return { current: null, history: [] };
  }
  try {
    return JSON.parse(await readFile(file, "utf-8")) as ProjectStateFile;
  } catch {
    return { current: null, history: [] };
  }
}

async function saveState(project: string, data: ProjectStateFile): Promise<void> {
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
const suiteRuns: Array<{ scope: string; exitCode: number; command: string; durationMs: number; testCount: number | string }> = [];
/** Memoised dirty-tree answer, refreshed at most once per tool call. */
let dirtyCache: { at: number; dirty: boolean } | null = null;

/** Bounded: beyond the cap the gate reports the gap instead of nagging forever. */
let continuationsRequested = 0;
let lastSettleDecision: { missing: string[]; exhausted?: boolean } | null = null;
let webTouched = false;
let impactStated = false;

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
function currentScale(): "small" | "standard" | "major" {
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
        };
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
          `  scale: ${state.current.scale || "unset"}${state.current.scale === "small" ? " (automatic — no gates)" : ""}\n` +
          `  phase: ${state.current.phase}\n` +
          `  plan approved: ${state.current.planApproved ? "yes" : "no"}\n` +
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
                ? " (automatic — no mechanical gate)"
                : ""
          }`,
        ];

        if (scale === "large") {
          const specs = await loadSpecs(project);
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
      default:
        return (
          "ASF commands:\n" +
          "  /asf new        — start a new software project (large, gated)\n" +
          "  /asf feature    — add a feature to an existing project (large, gated)\n" +
          "  /asf bugfix     — major bugfix (large, gated)\n" +
          "  /asf refactor   — architectural refactor (large, gated)\n" +
          "  /asf small      — small change, automatic (no gates)\n" +
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
      "Agentic Software Factory — /asf new|feature|bugfix|refactor|small|status|verify|health|abort",
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
  pi.on("tool_call", (event) => {
    try {
      const toolName = String((event as { toolName?: unknown }).toolName || "");
      const input = (event as { input?: Record<string, unknown> }).input || {};

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
        return { block: true, reason: res.reason };
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
        suiteRuns.push({
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
  pi.on("agent_before_settle", () => {
    try {
      const decision = decideSettlement(ledger, {
        scale: currentScale(),
        webTouched,
        continuationsSoFar: continuationsRequested,
      });
      lastSettleDecision = decision;
      appendEvidence({
        kind: "gate-verdict",
        gate: "completion",
        fired: decision.missing.length > 0,
        scanned: ledger.entries.length,
      });
      if (decision.block && continuationsRequested < MAX_CONTINUATIONS) {
        continuationsRequested++;
        // One bounded continuation naming exactly what is missing. No UI prompt:
        // this sends the agent back to work, it does not ask anyone anything.
        return { continue: true };
      }
      return undefined;
    } catch {
      return undefined;
    }
  });
}
