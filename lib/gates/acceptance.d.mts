export interface Acceptance {
  [field: string]: unknown;
}
export const REQUIRED_PERF: string[];
export const REQUIRED_SECURITY: string[];
export function validatePerfAcceptance(
  acceptance: Acceptance | null,
  now?: Date,
): { ok: boolean; invalid: string[]; acceptance: Acceptance | null };
export function validateSecurityAcceptance(
  acceptance: Acceptance | null,
  now?: Date,
): { ok: boolean; invalid: string[]; expired?: boolean; acceptance: Acceptance | null };
export function securityGate(input: {
  findings?: { id?: string; title?: string; severity?: string }[];
  acceptances?: Acceptance[];
  followUps?: { finding?: string; ticket?: string }[];
}): { ok: boolean; open: string[] };
export function renderAcceptance(kind: "perf" | "security", acceptance: Acceptance): string;
