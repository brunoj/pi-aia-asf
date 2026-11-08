/**
 * Type surface for the evidence ledger. The implementation stays plain ESM
 * JavaScript on purpose; this file is the boundary index.ts may rely on, so a
 * field that is not declared here is a type error at the call site rather than
 * a silent `any`.
 *
 * Suite-run recognition lives in `suite-runs.d.mjs` (split out in 0.17.5): the
 * ledger stores entries, the observer decides what a tool call proved.
 */
export interface LedgerEntry {
  kind: string;
  at?: string;
  [field: string]: unknown;
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
export function sessionFacts(
  ledger: Ledger,
  opts?: { scale?: "small" | "standard" | "major"; webTouched?: boolean },
): { missing: string[]; health: LedgerEntry | null; fullRuns: LedgerEntry[] };
export function renderLedger(ledger: Ledger): string;
export const ENTRY_KINDS: string[];
