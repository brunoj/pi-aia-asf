/**
 * Type surface for the delivery report. Plain ESM JavaScript implementation;
 * this is the boundary index.ts may rely on.
 */
import type { Ledger } from "./ledger.d.mjs";
import type { Authority, GateStat } from "./authority.d.mjs";
export interface DodItem {
  id: string;
  text: string;
  klass: "H" | "M" | "S";
  enforcedBy: string;
  verified: boolean;
}
export const DOD_ITEMS: DodItem[];
export function renderDeliveryReport(input: {
  ledger: Ledger;
  authority: Authority;
  gateStats?: Record<string, GateStat>;
  completion?: { missing: string[]; exhausted?: boolean };
  perfAcceptances?: Record<string, unknown>[];
  securityAcceptances?: Record<string, unknown>[];
  measurements?: string[];
  notes?: string[];
}): string;
export function renderChecklist(): string;
