export const OBSERVATION_TOOLS: string[];

/** Did the session actually drive a browser? */
export function browserDriven(calls: Array<string | { tool?: string }> | undefined): boolean;

/** Why this verification cannot be recorded, or null if it can. */
export function verifyGap(
  fields?: { page?: string; action?: string; assertion?: string },
  calls?: Array<string | { tool?: string }>,
): string | null;

/** A reason nobody could disagree with is not a reason. */
export function placeholderReason(reason: unknown): boolean;

/** Why this n/a cannot be recorded, or null if it can. */
export function naGap(fields?: { reason?: string }): string | null;

/** The ledger entry for a verification. */
export function verifyEntry(
  fields?: { page?: string; action?: string; assertion?: string },
  by?: string,
): { kind: "browser-verify"; page: string; action: string; assertion: string; by: string };

/** The ledger entry for a structured n/a. */
export function naEntry(
  fields?: { reason?: string },
  by?: string,
): { kind: "browser-na"; reason: string; by: string };
