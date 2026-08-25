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
import { homedir } from "node:os";

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
  { key: "tests", label: "Full test suite green (not a subset)" },
  { key: "regression", label: "Regression test added for every bug fixed this cycle" },
  { key: "triggers", label: "Triggers AND non-triggers tested for conditional behavior" },
  { key: "artifact", label: "Shipped artifact inspected (npm pack file list) + clean-room install" },
  { key: "observable", label: "Observable end state verified as a user would experience it" },
  { key: "browser", label: "Web surfaces exercised through a real browser (n/a if none)" },
  { key: "specs", label: "Every MUST spec 'met' with concrete evidence" },
  { key: "trace", label: "Spec-to-code traceability: every met spec has outcome → codePath → test" },
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

export default function register(pi: ExtensionAPI): void {
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

  pi.registerCommand("asf", async (args: string[], ctx: ExtensionCommandContext) => {
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
          "  /asf verify     — run the definition-of-done QA gate\n" +
          "  /asf abort      — end the current session\n\n" +
          dependencySummary()
        );
    }
  });

  // Plan-approval helper: /asf approve marks the plan as approved (records Gate 5)
  pi.registerCommand("asf-approve", async (_args: string[], ctx: ExtensionCommandContext) => {
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
  });
}
