/**
 * Type surface for suite-run recognition (the observer half of the ledger, split
 * out of `ledger.mjs` in 0.17.5). The implementation is plain ESM JavaScript;
 * this is what index.ts and the handlers may rely on.
 */
export interface SuiteRunEntry {
  kind: "suite-run";
  command: string;
  exitCode: number;
  durationMs: number;
  testCount: number | "unknown";
  scope: "full" | "subset";
  impactStated: boolean;
  at?: number;
  [field: string]: unknown;
}

export function isTestCommand(command: unknown): boolean;
export function deriveSuiteRun(
  command: unknown,
  outcome?: { exitCode?: number; durationMs?: number; output?: string },
): SuiteRunEntry | null;

/** The newest entry that was a FULL run (subset runs never satisfy an exit floor). */
export function lastFullRun(suiteRuns?: SuiteRunEntry[]): SuiteRunEntry | null;

/** The green an exit floor accepts, or why it does not. */
export function greenFullRun(
  suiteRuns?: SuiteRunEntry[],
  since?: number,
): { run: SuiteRunEntry | null; ok: boolean; why: string };
