import type { DecisionRecord } from "../decisions/schema.d.mts";

export interface GovernedHit {
  file: string;
  id: string;
  decision: string;
}

export interface ReopenHit {
  id: string;
  reopens_when: string;
}

export interface DecisionFacts {
  sourceChanged: boolean;
  governedTouched?: GovernedHit[];
  cited?: string[];
  recorded?: string[];
  unreadGoverned?: string[];
  read?: string[];
  reopens?: ReopenHit[];
}

export interface DecisionGap {
  gate: string;
  gap: string;
  remedy: string;
}

export function touchedGoverned(
  filesTouched: string[] | undefined,
  records: DecisionRecord[] | undefined,
  matchesAny: (p: string, g: string[] | undefined) => boolean,
): GovernedHit[];
export function reopensNow(objective: string | undefined, records: DecisionRecord[] | undefined): ReopenHit[];
export function decisionGaps(facts: DecisionFacts): DecisionGap[];
