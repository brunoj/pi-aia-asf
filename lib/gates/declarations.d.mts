export interface ObligationTrace {
  outcome: string;
  codePath: string;
  testFile?: string;
  assertion?: string;
}
export interface ObligationSignal {
  kind: "scan" | "test";
  pattern?: string;
  marker?: string;
  file?: string;
  assertion?: string;
}
export interface Obligation {
  id: string;
  requirement: string;
  area: string;
  priority: "must" | "should" | "nice-to-have";
  trigger: string[];
  class: "H" | "M" | "S";
  recurring?: boolean;
  signal?: ObligationSignal;
  trace: ObligationTrace;
}
export const TRIGGER_LITERALS: string[];
export const TRIGGER_PREFIXES: string[];
export const PRIORITIES: string[];
export const CLASSES: string[];
export const SIGNAL_KINDS: string[];
export function declarationPath(repoRoot: string): string;
export function validateTrigger(expr: string): string | null;
export function validateObligation(o: unknown, opts?: { strict?: boolean }): string[];
export function loadDeclarations(repoRoot: string): { ok: boolean; obligations: Obligation[]; problems: string[] };
export function assertSignalsExist(repoRoot: string, obligations: Obligation[]): string[];
export function renderRules(obligations: Obligation[], filter?: { area?: string; cls?: string }): string;
