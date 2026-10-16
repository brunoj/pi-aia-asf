/**
 * Type surface for the evidence ledger. The implementation stays plain ESM
 * JavaScript on purpose; this file is the boundary index.ts may rely on, so a
 * field that is not declared here is a type error at the call site rather than
 * a silent `any`.
 */
export interface LedgerEntry {
  kind: string;
  at?: string;
  [field: string]: unknown;
}
export interface SuiteRunEntry extends LedgerEntry {
  kind: "suite-run";
  command: string;
  exitCode: number;
  durationMs: number;
  testCount: number | "unknown";
  scope: "full" | "subset";
}
export interface Ledger {
  entries: LedgerEntry[];
  rejected: string[];
  append(candidate: Record<string, unknown>, opts?: { at?: string }): { ok: boolean; entry?: LedgerEntry; error?: string };
  has(kind: string, predicate?: (e: LedgerEntry) => boolean): boolean;
  count(kind: string): number;
  latest(kind: string): LedgerEntry | null;
}
export function createLedger(): Ledger;
export function validateEntry(entry: unknown): string | null;
export function deriveSuiteRun(
  command: unknown,
  exitCode: number,
  durationMs: number,
  output?: string,
): SuiteRunEntry | null;
export function deriveHealthRun(command: unknown, verdict?: string, scanned?: number, level?: string): LedgerEntry | null;
export function sessionFacts(
  ledger: Ledger,
  opts?: { scale?: "small" | "standard" | "major"; webTouched?: boolean },
): { missing: string[]; health: LedgerEntry | null; fullRuns: LedgerEntry[] };
export function renderLedger(ledger: Ledger): string;
export const ENTRY_KINDS: string[];
