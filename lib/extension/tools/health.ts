/**
 * asf_health — the agent's own way to produce a health verdict.
 *
 * The completion gate requires a recorded health verdict, and until 0.15.2 the
 * ONLY way one was recorded was the ledger recognising a bash command that
 * looked like `/asf health` — a pi slash command the agent cannot type. An
 * autonomous run was therefore steered forever at a gap it had no hands for
 * (the 2026-11-07 loop). Any gate that blocks must have an agent-side action;
 * this is that action for the health gate.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import { currentScale } from "../run.ts";
import { recordHealthVerdict, recordLine } from "../health-record.ts";

interface HealthResult {
  text: string;
  healthy: boolean;
  exitCode: number;
  rows?: unknown[];
  /** Metrics actually measured (pass+fail). Skipped and error rows are NOT in it. */
  ran?: number;
  skipped?: number;
}

async function runHealthGate(scope: string): Promise<HealthResult> {
  const { runHealth } = await import("../../code-health/index.mjs");
  const { runRoot } = await import("../paths.ts");
  const args = scope ? [`--scope=${scope}`] : [];
  // Measure the RUN's project, not process.cwd(): a session started in $HOME
  // (or any parent) would otherwise measure everything under it — 960 phantom
  // findings from site-packages, on a repo that is actually healthy.
  return (await runHealth(runRoot(), args)) as HealthResult;
}

/**
 * A recorded verdict is the point: measuring without recording clears nothing.
 * The counting rules and the wording live in health-record.ts so the tool, the
 * slash command and `/asf verify` cannot drift into disagreeing with each other.
 */
async function measureAndRecord(levelIn: string, scopeIn: string) {
  const res = await runHealthGate(scopeIn);
  const level: string = ["small", "standard", "major"].includes(levelIn) ? levelIn : currentScale();
  const rec = recordHealthVerdict(res, { by: "tool", level });
  return {
    text: `${res.text}\n\n${recordLine(rec)}`,
    details: { verdict: rec.verdict, scanned: rec.scanned, level: rec.level, recorded: rec.recorded, by: "tool", error: rec.error },
  };
}

export function registerHealthTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "asf_health",
    label: "ASF Health",
    description:
      "Run ASF's code health gate (function/module/architecture) on this project and " +
      "record the verdict as evidence. This is the agent-side equivalent of /asf health " +
      "and it is what clears the completion gate's health gap — call it instead of " +
      "waiting for a human to type /asf health.",
    promptSnippet: "Run the code health gate and record its verdict",
    parameters: Type.Object({
      level: Type.Optional(
        StringEnum(["small", "standard", "major"] as const, {
          description: "Health level to record; defaults to the run's scale.",
        }),
      ),
      scope: Type.Optional(
        Type.String({ description: "Optional scope passed to the health gate (e.g. 'function')." }),
      ),
    }),
    async execute(_toolCallId: string, params: { level?: unknown; scope?: unknown }) {
      try {
        const levelIn = typeof params?.level === "string" ? params.level : "";
        const scopeIn = typeof params?.scope === "string" ? params.scope : "";
        const out = await measureAndRecord(levelIn, scopeIn);
        return { content: [{ type: "text", text: out.text }], details: out.details };
      } catch (e) {
        return {
          content: [{ type: "text", text: `asf_health failed: ${(e && (e as Error).message) || String(e)}` }],
          details: { verdict: "unknown", scanned: 0, level: "standard", recorded: false, by: "tool", error: String((e as Error)?.message || e) },
        };
      }
    },
  });
}
