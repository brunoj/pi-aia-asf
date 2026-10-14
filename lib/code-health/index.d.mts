/**
 * Type surface for the Code Health gate, which stays plain ESM JavaScript
 * (lib/code-health/*.mjs) on purpose: it is a build-time harness that shells
 * out to linters, and rewriting it in TypeScript would buy nothing.
 *
 * This file is the boundary — what index.ts is allowed to rely on. It is
 * hand-maintained, and that is deliberate: a field added to `runHealth`'s
 * return that is not declared here becomes a type error at the call site
 * instead of a silent `any`. Before this file, the whole gate was `any` and
 * `npm run check` could not have noticed.
 */

export interface HealthRow {
  key: string;
  value: number | null;
  status: string;
  [extra: string]: unknown;
}

export interface HealthConfig {
  enabled: boolean;
  /** "block" makes violations fail the gate; "warn" reports without blocking. */
  gate: { mode: "block" | "warn" | string; scope: string };
  ignore?: string[];
  [extra: string]: unknown;
}

export interface HealthResult {
  /** Human-readable report — what the `/asf health` command prints. */
  text: string;
  /** Populated only with `--json`. */
  json: unknown;
  /** 1 only when the gate is configured to block and the verdict is unhealthy. */
  exitCode: 0 | 1;
  healthy: boolean;
  rows: HealthRow[];
  config: HealthConfig;
}

export interface HealthDeps {
  readFile?: (path: string) => string | null;
  tools?: unknown;
  [extra: string]: unknown;
}

export declare function runHealth(
  projectRoot: string,
  args?: string[],
  deps?: HealthDeps,
): Promise<HealthResult>;

export declare function parseArgs(args: string[]): Record<string, boolean | string>;

export declare const BASELINE_FILE: string;
