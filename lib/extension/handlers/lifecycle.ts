/**
 * Turn and session boundaries.
 *
 * A nudge delivered at settle arrives when the run is already ending. On a turn
 * that executed tools another turn follows anyway, so an appended
 * custom_message is in context for that next request; `continue` is left
 * untouched — ASF never forces or stops a turn from here.
 *
 * The card is re-delivered whenever context was reset — a new session, a resumed
 * one, or a compaction, which is exactly when the previous card stopped
 * existing. In 18 days the installed SKILL.md was read 0 times; the card is
 * where the rules actually live.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { __clearProjectCache } from "../../project.mjs";
import { projectName } from "../paths.ts";
import { loadState } from "../state.ts";
import { cardFor } from "../run.ts";
import { appendEvidence } from "../evidence.ts";
import { pendingSteers, deliveredSteers, MAX_REANCHORS_PER_RUN } from "../gate-state.ts";
import { runtime, REANCHOR_AFTER_MACHINE_TURNS, REANCHOR_MIN_INTERVAL_MS } from "../runtime.ts";

type Entry = Record<string, unknown>;

function takeCard(): Entry | null {
  if (!runtime.pendingCard) return null;
  const card = runtime.pendingCard;
  runtime.pendingCard = null;
  return { type: "custom_message", customType: "asf-run-card", content: card.text, display: true, details: { reason: card.reason } };
}

function takeSteers(): Entry[] {
  const entries: Entry[] = [];
  while (pendingSteers.length) {
    const text = pendingSteers.shift() as string;
    const key = text.replace(/\s+/g, " ").trim();
    if (deliveredSteers.has(key)) continue;
    deliveredSteers.add(key);
    entries.push({ type: "custom_message", customType: "asf-steer", content: text, display: true });
  }
  return entries;
}

async function rearmCard(reason: string): Promise<void> {
  try {
    const file = await loadState(projectName());
    if (file.current && file.current.phase !== "none") {
      runtime.pendingCard = { text: cardFor(file.current), reason };
    }
  } catch {
    /* a missing card is a gap, never a crash */
  }
}

/**
 * P5: provenance comes from pi itself — `interactive`, `rpc` or `extension` —
 * never from the text. ASF does not know or care which extension injected a turn.
 */
async function noteProvenance(source: string): Promise<void> {
  if (source !== "extension") {
    runtime.machineTurnsSinceHuman = 0;
    return;
  }
  runtime.machineTurnsSinceHuman++;
  const due =
    runtime.machineTurnsSinceHuman >= REANCHOR_AFTER_MACHINE_TURNS &&
    Date.now() - runtime.lastReanchorAt >= REANCHOR_MIN_INTERVAL_MS;
  if (!due) return;
  const file = await loadState(projectName());
  if (!file.current || file.current.phase === "none" || runtime.reanchorsThisRun >= MAX_REANCHORS_PER_RUN) return;
  runtime.lastReanchorAt = Date.now();
  runtime.machineTurnsSinceHuman = 0;
  runtime.reanchorsThisRun++;
  runtime.pendingCard = { text: cardFor(file.current), reason: "reanchor" };
  appendEvidence({ kind: "steer", gate: "reanchor", machineTurns: REANCHOR_AFTER_MACHINE_TURNS });
}

export function registerLifecycleHandlers(pi: ExtensionAPI): void {
  pi.on("turn_end", async (event) => {
    try {
      const e = event as unknown as { entries?: Entry[]; toolResults?: unknown[] };
      if (!Array.isArray(e.toolResults) || e.toolResults.length === 0) return undefined;
      if (!runtime.pendingCard && pendingSteers.length === 0) return undefined;
      const entries: Entry[] = Array.isArray(e.entries) ? [...e.entries] : [];
      const card = takeCard();
      if (card) entries.push(card);
      entries.push(...takeSteers());
      return { entries } as never;
    } catch {
      return undefined;
    }
  });

  pi.on("session_start", async () => {
    __clearProjectCache();
    runtime.machineTurnsSinceHuman = 0;
    await rearmCard("session_start");
  });

  pi.on("session_compact", async () => {
    await rearmCard("session_compact");
  });

  pi.on("input", async (event) => {
    try {
      const source = String((event as { source?: unknown }).source || "interactive");
      await noteProvenance(source);
    } catch {
      /* an observer never alters input */
    }
    return { action: "continue" } as never;
  });

  pi.on("before_agent_start", async () => {
    try {
      if (!runtime.pendingCard) return undefined;
      const card = runtime.pendingCard;
      runtime.pendingCard = null;
      return { message: { customType: "asf-run-card", content: card.text, display: true, details: { reason: card.reason } } };
    } catch {
      return undefined;
    }
  });
}
