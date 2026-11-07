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
import { ledger } from "../gate-state.ts";
import { appendEvidence } from "../evidence.ts";
import { currentScale } from "../run.ts";

interface HealthResult {
  text: string;
  healthy: boolean;
  exitCode: number;
  rows?: unknown[];
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

/** A recorded verdict is the point: measuring without recording clears nothing. */
async function measureAndRecord(levelIn: string, scopeIn: string) {
  const res = await runHealthGate(scopeIn);
  const verdict = res.exitCode === 1 ? "fail" : res.healthy ? "pass" : "warn";
  const scanned = Array.isArray(res.rows) ? res.rows.length : 0;
  const level: string = ["small", "standard", "major"].includes(levelIn) ? levelIn : currentScale();
  const appended = ledger.append({ kind: "health-run", level, verdict, scanned });
  appendEvidence({ kind: "health-run", level, verdict, scanned, by: "tool" });
  const recorded = appended.ok
    ? "recorded as evidence; the completion gate's health gap is now closed."
    : `NOT recorded (${appended.error})`;
  return {
    text: `${res.text}\n\nverdict: ${verdict} (${scanned} metric(s) measured, level ${level}) — ${recorded}`,
    details: { verdict, scanned, level, recorded: appended.ok, by: "tool", error: "" },
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
