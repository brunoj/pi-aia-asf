/**
 * /asf — the command surface.
 *
 * A table, not a switch: each subcommand is a named function in its own module,
 * so the dispatcher stays a dispatcher and every answer is testable on its own.
 */

import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { setPhase, runApprove } from "./session.ts";
import { cmdVerify } from "./verify.ts";
import { cmdStatus, cmdHealth, cmdRules, cmdConfig, cmdReport, cmdGates, cmdCard } from "./inspect.ts";
import { cmdPassive, cmdAbort, helpText, markSmallScale } from "./run-control.ts";

type Command = (args: string[], ctx: ExtensionCommandContext) => Promise<string> | string;

const COMMANDS: Record<string, Command> = {
  new: (_a, ctx) => setPhase(ctx, { phase: "intake", workType: "new-project", scale: "large" }),
  feature: (_a, ctx) => setPhase(ctx, { phase: "intake", workType: "feature", scale: "large" }),
  bugfix: (_a, ctx) => setPhase(ctx, { phase: "intake", workType: "major-bugfix", scale: "large" }),
  refactor: (_a, ctx) => setPhase(ctx, { phase: "intake", workType: "refactor", scale: "large" }),
  small: (_a, ctx) => {
    markSmallScale();
    return setPhase(ctx, { phase: "implementation", scale: "small" });
  },
  status: () => cmdStatus(),
  verify: (_a, ctx) => cmdVerify(ctx),
  health: (a) => cmdHealth(a),
  rules: (a) => cmdRules(a),
  config: (a) => cmdConfig(a),
  report: (a) => cmdReport(a),
  gates: () => cmdGates(),
  card: () => cmdCard(),
  passive: () => cmdPassive(),
  abort: (_a, ctx) => cmdAbort(ctx),
};

/** The command body stays a string-returning function so the gate text is testable. */
export async function runAsf(args: string[], ctx: ExtensionCommandContext): Promise<string> {
  const sub = (args[0] || "").toLowerCase();
  const command = COMMANDS[sub];
  return command ? await command(args, ctx) : helpText();
}

export function registerCommands(pi: ExtensionAPI): void {
  pi.registerCommand("asf", {
    description:
      "Agentic Software Factory — /asf new|feature|bugfix|refactor|small|status|verify|health|passive|card|abort",
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      const argv = args.trim() ? args.trim().split(/\s+/) : [];
      const out = await runAsf(argv, ctx);
      if (out) ctx.ui.notify(out, "info");
    },
  });

  pi.registerCommand("asf-approve", {
    description: "Record Gate 5 plan approval (requires PLAN.md) and begin implementation",
    handler: async (_args: string, ctx: ExtensionCommandContext) => {
      ctx.ui.notify(await runApprove(), "info");
    },
  });
}
