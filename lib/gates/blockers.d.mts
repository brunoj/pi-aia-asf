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
  opts?: { ctx?: Record<string, unknown>; enabled?: Record<string, boolean> },
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
/** Re-run the fail-safe-block rules from the raw input alone, when the gate itself could not run. */
export function failSafeBlock(input: Record<string, unknown>): { block: true; reason: string } | undefined;
export function blockSecretWrite(input: Record<string, unknown>, ctx?: Record<string, unknown>): BlockerVerdict;
export function blockTestSubset(input: Record<string, unknown>, ctx?: Record<string, unknown>): BlockerVerdict;
export function blockPushWithoutGreen(input: Record<string, unknown>, ctx?: Record<string, unknown>): BlockerVerdict;
export function blockDestructiveGitDirty(input: Record<string, unknown>, ctx?: Record<string, unknown>): BlockerVerdict;
