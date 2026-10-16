export const CONFIG_FILE: string;
export function configPath(projectDir: string): string;
export function readProjectConfig(projectDir: string): Record<string, unknown>;
export function writeProjectConfig(projectDir: string, values: Record<string, unknown>): string;
export function validateDraft(draft: Record<string, unknown>): string[];
export function assertParametersAreConsumed(
  projectConfig?: Record<string, unknown>,
  opts?: { knownGates?: string[] },
): string[];
export interface ScreenRow {
  id: string;
  label: string;
  description: string;
  currentValue: string;
  values?: string[];
  origin: string;
  band: string;
  general: string;
  why: string;
  nonAdaptive: boolean;
  type: string;
  meaning?: string;
}
export function screenModel(opts?: {
  projectDir?: string;
  measurements?: Record<string, unknown>;
  overrides?: Record<string, unknown>;
}): ScreenRow[];
export function cli(opts: {
  action: string;
  key?: string;
  value?: string;
  projectDir?: string;
  measurements?: Record<string, unknown>;
  overrides?: Record<string, unknown>;
}): string;
export { PARAMS, NON_ADAPTIVE } from "./defaults.d.mjs";
