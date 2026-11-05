export interface BlockerVerdict {
  gate: string;
  fired: boolean;
  scanned: number;
  rule?: string;
  reason?: string;
  detail?: string;
  error?: string;
  skipped?: string;
  steerOnly?: boolean;
}
export interface Blocker {
  name: string;
  run: (input: Record<string, unknown>, ctx?: Record<string, unknown>) => BlockerVerdict;
  failSafe: "block" | "allow";
  switch: string;
  criticality: "high" | "medium" | "low";
  bypassable: boolean;
  mode: "block" | "steer";
}
export const BLOCKERS: Blocker[];
export function evaluateBlockers(
  toolName: string,
  input: Record<string, unknown>,
  ctx?: Record<string, unknown>,
  opts?: { enabled?: Record<string, boolean> },
): {
  block: boolean;
  reason?: string;
  rule?: string;
  ruleText?: string | null;
  refusalStage?: number;
  fingerprint?: string;
  park?: { reason: string; question: string; item?: string };
  verdicts: BlockerVerdict[];
  steers?: Array<{ gate: string; reason: string }>;
};
export const RULE_TEXT: Record<string, string>;
export function refusalStage(gate: string, fingerprint: string): number;
export function __resetRefusals(): void;
export function blockSecretWrite(input: Record<string, unknown>, ctx?: Record<string, unknown>): BlockerVerdict;
export function blockTestSubset(input: Record<string, unknown>, ctx?: Record<string, unknown>): BlockerVerdict;
export function blockPushWithoutGreen(input: Record<string, unknown>, ctx?: Record<string, unknown>): BlockerVerdict;
export function blockDestructiveGitDirty(input: Record<string, unknown>, ctx?: Record<string, unknown>): BlockerVerdict;
