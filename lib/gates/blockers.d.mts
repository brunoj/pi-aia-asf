export interface BlockerVerdict {
  gate: string;
  fired: boolean;
  scanned: number;
  rule?: string;
  reason?: string;
  detail?: string;
  error?: string;
  skipped?: string;
}
export interface Blocker {
  name: string;
  run: (input: Record<string, unknown>, ctx?: Record<string, unknown>) => BlockerVerdict;
  failSafe: "block" | "allow";
  switch: string;
  criticality: "high" | "medium" | "low";
  bypassable: boolean;
}
export const BLOCKERS: Blocker[];
export function evaluateBlockers(
  toolName: string,
  input: Record<string, unknown>,
  ctx?: Record<string, unknown>,
  opts?: { enabled?: Record<string, boolean> },
): { block: boolean; reason?: string; rule?: string; verdicts: BlockerVerdict[] };
export function blockSecretWrite(input: Record<string, unknown>, ctx?: Record<string, unknown>): BlockerVerdict;
export function blockTestSubset(input: Record<string, unknown>, ctx?: Record<string, unknown>): BlockerVerdict;
export function blockPushWithoutGreen(input: Record<string, unknown>, ctx?: Record<string, unknown>): BlockerVerdict;
export function blockDestructiveGitDirty(input: Record<string, unknown>, ctx?: Record<string, unknown>): BlockerVerdict;
