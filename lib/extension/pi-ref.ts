/**
 * The extension API handle, set once when register() runs.
 *
 * Its own module so every other module can read it without importing index.ts,
 * which would make the whole extension one import cycle.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

let piRef: ExtensionAPI | null = null;

export function setPiRef(pi: ExtensionAPI): void {
  piRef = pi;
}

export function getPiRef(): ExtensionAPI | null {
  return piRef;
}
