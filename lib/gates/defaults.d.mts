export interface ParamSpec {
  key: string;
  general: number | string | boolean;
  type: "number" | "boolean" | "string";
  band: { min: number; max: number } | null;
  source: string;
  calibrate: ((ctx: Record<string, unknown>) => { value: number; why: string } | null) | null;
  gate: string;
  meaning: string;
  nonAdaptive?: boolean;
}
export interface ResolvedParam {
  key: string;
  value: unknown;
  origin: "default" | "project" | "calibrated" | "override";
  general: unknown;
  band: { min: number; max: number } | null;
  source: string;
  why: string;
  gate: string;
  nonAdaptive: boolean;
}
export const PARAMS: Record<string, ParamSpec>;
export const NON_ADAPTIVE: string[];
export function clamp(v: number, min: number, max: number): number;
export function resolveParam(
  key: string,
  tiers?: { projectConfig?: Record<string, unknown>; measurements?: Record<string, unknown>; overrides?: Record<string, unknown> },
): ResolvedParam;
export function resolveAll(tiers?: {
  projectConfig?: Record<string, unknown>;
  measurements?: Record<string, unknown>;
  overrides?: Record<string, unknown>;
}): Record<string, ResolvedParam>;
export function explainParam(key: string, tiers?: Record<string, unknown>): string;
export function validateParam(key: string, value: unknown): string | null;
