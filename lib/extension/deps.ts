/**
 * Startup dependency check: pi-vigilant, web search/fetch, browser. Warns,
 * never crashes — ASF must load even when a companion is missing.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export interface DependencyCheck {
  name: string;
  package: string;
  present: boolean;
  hint: string;
}

export function checkDependencies(): DependencyCheck[] {
  // Detect the tools by looking for the packages that register them.
  // Tools are registered by extensions at runtime, so we check the
  // installed packages in ~/.pi/agent/npm and the extensions dir.
  const npmDir = join(homedir(), ".pi", "agent", "npm", "node_modules");
  const extDir = join(homedir(), ".pi", "agent", "extensions");
  const gitDir = join(homedir(), ".pi", "agent", "git");

  const checks: DependencyCheck[] = [
    {
      name: "pi-vigilant (spec-memory: capture_spec / get_task_specs / update_spec_status)",
      package: "pi-vigilant",
      present: existsSync(join(npmDir, "pi-vigilant")) || existsSync(join(extDir, "pi-vigilant")) || existsSync(join(gitDir, "github.com", "brunoj", "pi-vigilant")),
      hint: "pi install npm:pi-vigilant",
    },
    {
      name: "pi-smart-web-search (web_search)",
      package: "pi-smart-web-search",
      present: existsSync(join(npmDir, "pi-smart-web-search")),
      hint: "pi install npm:pi-smart-web-search",
    },
    {
      name: "pi-smart-fetch (web_fetch / batch_web_fetch)",
      package: "pi-smart-fetch",
      present: existsSync(join(npmDir, "pi-smart-fetch")),
      hint: "pi install npm:pi-smart-fetch",
    },
    {
      name: "pi-aia-browser (browser_init / browser_navigate / …)",
      package: "pi-aia-browser",
      present:
        existsSync(join(npmDir, "pi-aia-browser")) ||
        existsSync(join(extDir, "pi-aia-browser")) ||
        existsSync(join(extDir, "pi-browser")) ||
        existsSync(join(gitDir, "github.com", "brunoj", "pi-aia-browser")),
      hint: "pi install npm:pi-aia-browser (installs Playwright + Chromium)",
    },
  ];

  return checks;
}

export function dependencySummary(): string {
  const checks = checkDependencies();
  const missing = checks.filter((c) => !c.present);
  if (missing.length === 0) {
    return "All ASF dependencies present: pi-vigilant, pi-smart-web-search, pi-smart-fetch, pi-aia-browser ✓";
  }
  return (
    "⚠️ ASF dependencies missing — install before starting a project:\n" +
    missing.map((m) => `  - ${m.name}\n    → ${m.hint}`).join("\n")
  );
}

// ─── Extension registration ────────────────────────────────────────────────

// ─── Enforcement session state ─────────────────────────────────────────────
//
// What the extension *observed*, not what the agent asserted. The ledger is
// written from tool traffic and there is no model-callable way to append to it:
// if the agent could append an entry it would append a convenient one.
