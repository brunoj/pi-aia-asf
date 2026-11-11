/**
 * /asf verify — the Definition of Done gate.
 *
 * Large work additionally runs the mechanical spec-to-code traceability gate
 * (M1) and the code health gate (8). Both are measured here, never asserted.
 */

import { projectName, runRoot } from "../paths.ts";
import { measureRoot } from "../run.ts";
import { loadState } from "../state.ts";
import { loadProjectSpecs, validateTrace } from "../specs.ts";
import { QA_CHECKLIST, type SpecItem } from "../types.ts";
import { setPhase } from "./session.ts";
import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

/** One met spec's trace, rendered so a FAIL row says exactly what is missing. */
function renderTraceRow(spec: SpecItem, root: string): { ok: boolean; lines: string[] } {
  const check = validateTrace(spec, root);
  const lines = [`  [${check.ok ? "PASS" : "FAIL"}] ${spec.id}: ${check.reason}`];
  if (!check.ok || !spec.trace) return { ok: check.ok, lines };
  lines.push(`       outcome: ${spec.trace.outcome}`);
  lines.push(`       code path: ${spec.trace.codePath}`);
  if (spec.trace.testFile) {
    lines.push(`       test: ${spec.trace.testFile}${spec.trace.assertion ? ` (asserts "${spec.trace.assertion}")` : ""}`);
  }
  return { ok: true, lines };
}

/** M1 — every spec met during this task carries outcome + code path (+ test). */
async function traceabilitySection(): Promise<string[]> {
  const specs = await loadProjectSpecs();
  if (!specs || specs.length === 0) {
    return [
      "  (no spec-memory task found — capture specs with capture_spec, incl. items from external planning docs)",
    ];
  }
  const metSpecs = specs.filter((s) => s.status === "met");
  if (metSpecs.length === 0) {
    return ["  (no specs marked met yet — traceability applies when closing specs)"];
  }
  const lines: string[] = [];
  let allOk = true;
  // Same root the completion gate uses: a trace's testFile lives in the project the
  // specs describe, which is not necessarily where pi was started.
  const root = await measureRoot();
  for (const spec of metSpecs) {
    const row = renderTraceRow(spec, root);
    if (!row.ok) allOk = false;
    lines.push(...row.lines);
  }
  lines.push(
    allOk
      ? "\n  ✓ All met specs have complete traces."
      : "\n  ✗ GATE NOT PASSED — resolve FAIL rows before delivery (attach trace via update_spec_status).",
  );
  return lines;
}

/** Gate 8 — objective convolution measurement, on the real working tree. */
async function healthSection(): Promise<string[]> {
  const { runHealth } = await import("../../code-health/index.mjs");
  const { recordHealthVerdict, recordLine } = await import("../health-record.ts");
  const health = await runHealth(await measureRoot(), []);
  // Same rule as the tool and the slash command: a measurement that is produced
  // is a measurement that is recorded.
  const rec = recordHealthVerdict(health, { by: "verify" });
  const lines = ["\nCODE HEALTH (Gate 8 — large work):", health.text, recordLine(rec)];
  if (health.exitCode === 1) {
    lines.push("\n  ✗ GATE NOT PASSED — resolve code-health violations before delivery.");
  } else if (!health.healthy && health.config?.gate?.mode === "warn") {
    lines.push("\n  ⚠ warn mode: violations reported but not blocking.");
  } else {
    lines.push("\n  ✓ Code health gate passed.");
  }
  return lines;
}

function checklistSection(): string[] {
  const lines = [
    "\nDefinition of Done checklist (references/06b-testing-qa.md Rule 10):",
    "Read references/06b-testing-qa.md. Confirm EACH item with concrete evidence",
    "(command output, file list, screenshot). Do not tick anything you did not run.",
    "",
  ];
  QA_CHECKLIST.forEach((c, i) => lines.push(`  ${i + 1}. [ ] ${c.label}`));
  lines.push("\nThen run get_task_specs and close every spec with update_spec_status.");
  lines.push("Unverifiable → 'partial' + ask the user. Never self-certify.");
  return lines;
}

function scaleLine(scale: string | undefined): string {
  const suffix =
    scale === "large"
      ? " — mechanical traceability gate ACTIVE"
      : " (floor only — no mechanical traceability gate)";
  // Unset is judged small (PO policy); say so instead of printing a bare "unset".
  return `Scale: ${scale || "unset — judged small"}${suffix}`;
}

export async function cmdVerify(ctx: ExtensionCommandContext): Promise<string> {
  const project = projectName();
  const state = await loadState(project);
  if (!state.current) return "No active ASF session — nothing to verify.";
  await setPhase(ctx, { phase: "verification" });
  const scale = state.current.scale;
  const lines = [
    `ASF verification gate (${project}) — Definition of Done.`,
    scaleLine(scale),
  ];
  if (scale === "large") {
    lines.push("\nSPEC-TO-CODE TRACEABILITY (M1 — large work):", ...(await traceabilitySection()));
    lines.push(...(await healthSection()));
  }
  lines.push(...checklistSection());
  return lines.join("\n");
}
