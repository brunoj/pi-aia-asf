/**
 * The extension-side adapter for the input-channel gate.
 *
 * `lib/gates/input-channel.mjs` holds the RULE (pure, testable). This holds the two
 * facts it needs from a live session — the project's config and the tools the host
 * reports — so both park sites ask the same question the same way. They used to each
 * resolve the channel inline, which is how two renderings of one rule drift apart.
 *
 * Both readers degrade rather than throw. A park that cannot resolve its channel
 * falls back to asking in the conversation; a park that cannot run at all would be a
 * gate taking down the thing it observes, which is the worse failure by a wide margin.
 */
import { readProjectConfig } from "../gates/config.mjs";
import { resolveInputChannel } from "../gates/input-channel.mjs";
import { measureRootSync } from "./run.ts";
import { runtime } from "./runtime.ts";

/** Project config for the matcher widening, or nothing if it cannot be read. */
export function configFor(): Record<string, unknown> {
  try {
    return readProjectConfig(measureRootSync()) || {};
  } catch {
    return {};
  }
}

/**
 * Where this session's legitimate question belongs, from what it actually has:
 * the items it claimed and the tools the host reports. `getAllTools` is optional on
 * the host and may throw, so a failure degrades to "no park tool" rather than to a
 * crash — an observer that breaks the work it observes is worse than a generic ask.
 */
export function channelFor(pi?: { getAllTools?: () => Array<string | { name?: string }> }) {
  let tools: Array<string | { name?: string }> = [];
  try {
    tools = pi?.getAllTools?.() || [];
  } catch {
    tools = [];
  }
  try {
    return resolveInputChannel({ tracked: runtime.tracked, tools, config: configFor() });
  } catch {
    return { kind: "conversation", reason: "the input channel could not be resolved" } as const;
  }
}
