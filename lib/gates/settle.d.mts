import type { Ledger } from "./ledger.d.mjs";
export interface ParkRequest {
  reason: string;
  question: string;
  item?: string;
}
export interface SettleDecision {
  block: boolean;
  missing: string[];
  continuation?: string;
  report?: string | null;
  exhausted?: boolean;
  park?: ParkRequest;
  fingerprint?: string;
  steer?: number;
}
export function decideSettlement(
  ledger: Ledger,
  opts?: {
    scale?: "small" | "standard" | "major";
    webTouched?: boolean;
    continuationsSoFar?: number;
    seenSteers?: string[];
    sourceMutated?: boolean;
    testRunRecorded?: boolean;
    reportFields?: string[];
    untracedMet?: string[];
  },
): SettleDecision;
export function renderCompletionGate(decision: { missing: string[]; exhausted?: boolean; park?: ParkRequest }): string;
export function classifyPark(missing?: string[]): ParkRequest | null;
export function steerFingerprint(missing?: string[]): string;
export const MAX_IDENTICAL_STEERS: number;
export const MAX_STEERS: number;
