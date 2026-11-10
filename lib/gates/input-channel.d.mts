import type { TrackedState } from "./tracked.mjs";

/** The channel a genuine request for input goes through, resolved from context. */
export type InputChannel =
  | { kind: "work-item"; tool: string; item: string | null; others: string[] }
  | { kind: "conversation"; reason: string };

/** Names of the available tools, from whatever shape the host reports them in. */
export function pickParkTool(names: string[], matchers: { park: RegExp }): string | null;

/** Resolve the input channel for this session. */
export function resolveInputChannel(opts?: {
  tracked?: TrackedState | null;
  tools?: Array<string | { name?: string }> | null;
  config?: Record<string, unknown>;
}): InputChannel;

/** The instruction that accompanies a legitimate park; always ends on "keep going". */
export function routeAsk(question: string, channel: InputChannel | null | undefined): string;
