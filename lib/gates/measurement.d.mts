export interface MeasurementClaim {
  kind: "latency" | "throughput" | "regression";
  [field: string]: unknown;
}
export const CONTRACTS: Record<string, { required: string[]; hint: string }>;
export function checkMeasurementContract(claim: MeasurementClaim | null): {
  ok: boolean;
  missing: string[];
  claim: MeasurementClaim | null;
  hint?: string;
  note?: string;
};
export function detectBareNumericClaim(text: unknown): {
  matched: string;
  percentile: string;
  threshold: string;
  unit: string;
  missing: string[];
} | null;
export function compareSamples(
  control: number[],
  test: number[],
  opts?: { alpha?: number; minRatio?: number },
): Record<string, unknown>;
export function machineBusy(opts: { loadAverage?: number; cores?: number; factor?: number }): { busy: boolean; reason: string };
export function median(a: number[]): number;
export function percentile(a: number[], q: number): number;
export function coefficientOfVariation(a: number[]): number;
export function hodgesLehmann(a: number[], b: number[]): number;
export function wilcoxonRankSum(a: number[], b: number[]): { u: number; z: number; p: number };
export function renderMeasurement(claim: MeasurementClaim): string;
