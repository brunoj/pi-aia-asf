import type { Ledger } from "./ledger.d.mjs";
export interface SettleDecision {
  block: boolean;
  missing: string[];
  continuation?: string;
  report?: string | null;
  exhausted?: boolean;
}
export function decideSettlement(
  ledger: Ledger,
  opts?: {
    scale?: "small" | "standard" | "major";
    webTouched?: boolean;
    continuationsSoFar?: number;
    reportFields?: string[];
  },
): SettleDecision;
export function renderCompletionGate(decision: { missing: string[]; exhausted?: boolean }): string;
export const MAX_CONTINUATIONS: number;
