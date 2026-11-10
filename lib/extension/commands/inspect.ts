/**
 * The read-only commands: status, health, rules, config, report, gates, card.
 * Each answers a question with something measured, not something asserted.
 */

import { projectName, runRoot } from "../paths.ts";
import { loadState } from "../state.ts";
import { ledger, authority, gateStats } from "../gate-state.ts";
import { runtime } from "../runtime.ts";
import { cardFor, collectMeasurements, currentScale, extensionDir, measureRoot } from "../run.ts";
import { renderLedger } from "../../gates/ledger.mjs";
import { renderAuthority } from "../../gates/authority.mjs";
import { renderCompletionGate } from "../../gates/settle.mjs";
import { cli as configCli, screenModel, assertParametersAreConsumed, readProjectConfig } from "../../gates/config.mjs";
import { loadDeclarations, renderRules, assertSignalsExist } from "../../gates/declarations.mjs";
import { renderDeliveryReport, renderChecklist } from "../../gates/report.mjs";
import { PARAMS } from "../../gates/defaults.mjs";

export async function cmdStatus(): Promise<string> {
  const project = projectName();
  const state = await loadState(project);
  if (!state.current) return "No active ASF session.";
  const cur = state.current;
  const floor =
    currentScale(cur) === "small" ? " (floor: a real test run and evidence; no plan/approval gates)" : "";
  const auto = cur.auto ? " — opened automatically by software work" : "";
  return (
    `ASF status (${project}):\n` +
    `  work type: ${cur.workType || "unset"}\n` +
    `  scale: ${cur.scale ? cur.scale : `unset — judged ${currentScale(cur)}`}${floor}${auto}\n` +
    `  phase: ${cur.phase}\n` +
    `  plan approved: ${cur.planApproved ? "yes" : "no"}\n` +
    (cur.passiveRunId && cur.passiveRunId === cur.runId ? `  passive: this run only\n` : "") +
    (cur.parked ? `  PARKED: ${cur.parked.question}\n` : "") +
    `  started: ${cur.startedAt || "?"}\n` +
    `  history: ${state.history.length} completed session(s)`
  );
}

/** Code Health Gate: objective measurement at function / module / architecture level. */
export async function cmdHealth(args: string[]): Promise<string> {
  const { runHealth } = await import("../../code-health/index.mjs");
  const { recordHealthVerdict, recordLine } = await import("../health-record.ts");
  const res = await runHealth(await measureRoot(), args.slice(1));
  // The command records what it measured. Before this, only the asf_health TOOL
  // recorded: a human could run /asf health, read HEALTHY, and leave the
  // completion gate's health gap open with no trace that anything was measured.
  const rec = recordHealthVerdict(res, { by: "command" });
  const tail =
    res.exitCode === 1
      ? "\n\n✗ GATE FAILED — resolve the violations before delivery."
      : res.config?.gate?.mode === "warn" && !res.healthy
        ? "\n\n(warn mode: violations reported, gate not blocking)"
        : "";
  return `${res.text}${tail}\n\n${recordLine(rec)}`;
}

/** "What enforces anything around browser testing?" — answered from the registry. */
export function cmdRules(args: string[]): string {
  const pkgDir = extensionDir();
  const { obligations, problems } = loadDeclarations(pkgDir);
  if (problems.length) return `ASF declaration has problems:\n- ${problems.join("\n- ")}`;
  const filter = args[1];
  const cls = ["H", "M", "S"].includes((filter || "").toUpperCase()) ? filter.toUpperCase() : undefined;
  const area = cls ? undefined : filter;
  const drift = assertSignalsExist(pkgDir, obligations);
  const text = renderRules(obligations, { area, cls });
  return text + (drift.length ? `\n\nDeclaration/test drift:\n- ${drift.join("\n- ")}` : "");
}

/**
 * One screen for every parameter — a convenience, not the only door: the flags
 * validate identically, so a typo is refused here rather than discovered later
 * by a gate that silently stopped running.
 */
export function cmdConfig(args: string[]): string {
  const a = args.map((s) => s.trim()).filter(Boolean);
  const flag = (a[1] || "--get").toLowerCase();
  const projectDir = runRoot();
  const measurements = collectMeasurements();
  if (flag === "--screen" || flag === "screen") {
    return screenModel({ projectDir, measurements })
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

/** The delivery report is ASSEMBLED from what was observed; a gap stays a gap. */
export function cmdReport(args: string[]): string {
  if (args[1] === "--checklist") return renderChecklist();
  return renderDeliveryReport({
    ledger,
    authority,
    gateStats,
    completion: runtime.lastSettleDecision || { missing: [] },
  });
}

/** What the enforcement layer decided, and what it charged. */
export function cmdGates(): string {
  return [
    renderLedger(ledger),
    renderAuthority(authority, gateStats),
    renderCompletionGate(runtime.lastSettleDecision || { missing: [] }),
  ].join("\n\n");
}

export async function cmdCard(): Promise<string> {
  const file = await loadState(projectName());
  if (!file.current || file.current.phase === "none") return "No active ASF run.";
  return cardFor(file.current);
}
