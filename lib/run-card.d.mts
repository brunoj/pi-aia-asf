export const CARD_CEILING_BYTES: number;
export interface RunCardInput {
  phase?: string;
  scale?: string;
  workType?: string;
  objective?: string;
  openDod?: string[];
  nextStep?: string;
  remedy?: string;
  filesTouched?: string[];
  ticketId?: string;
  auto?: boolean;
  steers?: number;
}
export function renderRunCard(o?: RunCardInput): { text: string; bytes: number; over: boolean };
export function cardSummary(o?: RunCardInput): string;
