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
 *
 * This file WIRES the extension and nothing else: every behaviour lives in
 * lib/extension/, so a handler can be read and tested without the entry point.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { setPiRef } from "./lib/extension/pi-ref.ts";
import { registerHealthTool } from "./lib/extension/tools/health.ts";
import { registerDecisionsTool } from "./lib/extension/tools/decisions.ts";
import { registerBrowserTools } from "./lib/extension/tools/browser.ts";
import { registerEvidenceCheckTool } from "./lib/extension/tools/evidence-check.ts";
import { registerRunCompleteTool } from "./lib/extension/tools/run-complete.ts";
import { registerCommands } from "./lib/extension/commands/index.ts";
import { registerToolCallHandler } from "./lib/extension/handlers/tool-call.ts";
import { registerToolResultHandler } from "./lib/extension/handlers/tool-result.ts";
import { registerSettleHandler } from "./lib/extension/handlers/settle.ts";
import { registerLifecycleHandlers } from "./lib/extension/handlers/lifecycle.ts";

export { shouldPersist } from "./lib/extension/evidence.ts";

export default function register(pi: ExtensionAPI): void {
  setPiRef(pi);
  registerHealthTool(pi);
  registerDecisionsTool(pi);
  registerBrowserTools(pi);
  registerEvidenceCheckTool(pi);
  registerRunCompleteTool(pi);
  registerCommands(pi);
  registerToolCallHandler(pi);
  registerToolResultHandler(pi);
  registerSettleHandler(pi);
  registerLifecycleHandlers(pi);
}
