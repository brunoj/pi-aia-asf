export interface GateTransition {
  gate: string;
  from: string;
  to: string;
  at: string;
  reason: string;
  evidence?: unknown;
}
export interface GateStat {
  verdicts: number;
  fired: number;
  confirmedFalse: number;
  blocks: number;
}
export interface Authority {
  transitions: GateTransition[];
  currentState(gate: string): string;
  transition(
    gate: string,
    to: string,
    reason?: string,
    evidence?: unknown,
  ): { ok: boolean; noChange?: boolean; transition?: GateTransition; report?: string; error?: string };
  eligibility(
    gate: string,
    stats: { cleanRuns?: number; caughtCases?: number; falsePositives?: number; verdicts?: number },
  ): { promote: boolean; alreadyActive?: boolean; state?: string; fpRate?: number; reasons: string[] };
  checkBudget(
    gate: string,
    opts: {
      falsePositives?: number;
      verdicts?: number;
      blocksThisRun?: number;
      budgets?: { falsePositiveBudget?: number; blocksPerRunBudget?: number };
    },
  ): { demote: boolean; reasons: string[]; report?: string | null; error?: string | null };
  recordVerdict(gate: string, v: { fired: boolean; confirmedFalse?: boolean; source?: string }): Record<string, unknown>;
}
export function createAuthority(store?: { transitions: GateTransition[] }): Authority;
export function renderAuthority(authority: Authority, stats: Record<string, GateStat>): string;
export const STATES: string[];
export const PROMOTION_RULE: { cleanRunsRequired: number; caughtCasesRequired: number };
