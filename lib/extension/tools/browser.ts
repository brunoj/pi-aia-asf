/**
 * asf_browser_verify / asf_browser_na — the agent's own hands for the browser
 * evidence the completion gate requires.
 *
 * The gate requires it whenever a UI file is touched (`ledger.mjs` completeness,
 * and again in the delivery report), but until now the only registered tools were
 * `asf_health` and `asf_decisions`. Any session that edited a tsx/html/css file was
 * therefore steered at a gap it had no hands for — the same defect as the health
 * loop, one layer down. Every gate that can block gets an agent-side action.
 *
 * The recording rules (and the refusals) live in `browser-record.ts`, so the tools
 * stay thin and the gate cannot disagree with the tool about what counts.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { recordBrowserVerify, recordBrowserNa } from "../browser-record.ts";

function text(res: { ok: boolean; summary?: string; error?: string }) {
  return res.ok ? (res.summary || "recorded") : `not recorded — ${res.error}`;
}

export function registerBrowserTools(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "asf_browser_verify",
    label: "ASF Browser Verify",
    description:
      "Record that a web surface was verified through a real browser: the page, the action " +
      "you performed, and the assertion you saw hold. ASF refuses this if the session made " +
      "no browser call — it records what happened, it does not accept that it did. Use it " +
      "after driving the page with pi-aia-browser; it is what clears the completion gate's " +
      "browser gap.",
    promptSnippet: "Record browser verification of a web surface",
    parameters: Type.Object({
      page: Type.String({ description: "The page or route verified (URL or screen name)." }),
      action: Type.String({ description: "What you did there (clicked submit, loaded the list)." }),
      assertion: Type.String({ description: "What you saw that proves it works, as the reviewer would repeat it." }),
    }),
    async execute(_toolCallId: string, params: { page?: unknown; action?: unknown; assertion?: unknown }) {
      const res = recordBrowserVerify({
        page: typeof params?.page === "string" ? params.page : "",
        action: typeof params?.action === "string" ? params.action : "",
        assertion: typeof params?.assertion === "string" ? params.assertion : "",
      });
      return { content: [{ type: "text", text: text(res) }], details: { ...(res.details || {}), ok: res.ok } };
    },
  });

  pi.registerTool({
    name: "asf_browser_na",
    label: "ASF Browser N/A",
    description:
      "Record that no browser surface is involved, with a reason a reviewer can disagree with. " +
      "\"n/a\", \"none\" and friends are refused — the point of a structured n/a is that someone " +
      "can check it. Use this when a UI file was touched but no interface actually consumes it.",
    promptSnippet: "Record why no browser surface applies",
    parameters: Type.Object({
      reason: Type.String({ description: "Why no interface is involved, as a sentence a reviewer could dispute." }),
    }),
    async execute(_toolCallId: string, params: { reason?: unknown }) {
      const res = recordBrowserNa({ reason: typeof params?.reason === "string" ? params.reason : "" });
      return { content: [{ type: "text", text: text(res) }], details: { ...(res.details || {}), ok: res.ok } };
    },
  });
}
