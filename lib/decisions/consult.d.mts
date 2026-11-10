import type { DecisionRecord, DecisionProblem } from "./schema.d.mts";

export interface Register {
  dir: string;
  records: DecisionRecord[];
  problems: DecisionProblem[];
}

export interface DecisionResult {
  ok: boolean;
  file?: string;
  id?: string;
  superseded?: string;
  by?: string;
  problems?: DecisionProblem[];
}

export interface AddArgs {
  record: DecisionRecord;
  body?: string;
  config?: Record<string, unknown> | null;
  planApproved?: boolean;
  read?: DecisionRecord[];
}

export interface SupersedeArgs extends AddArgs {
  id: string;
  by?: string;
}

export function registerAt(root: string, config?: Record<string, unknown> | null): Register;
/**
 * Project-relative paths: `applies_to` is written relative to the repo while a
 * run records absolute ones, and the two must be compared on the same footing.
 */
export function relativeTo(root: string, files: string[] | undefined): string[];
export function cardIndex(records: DecisionRecord[] | undefined, opts?: { max?: number; bytes?: number }): string[];
export function unreadGoverning(
  records: DecisionRecord[] | undefined,
  filePath: string,
  read: string[] | undefined,
): DecisionRecord[];
export function citedIds(text: string | undefined, records: DecisionRecord[] | undefined): string[];
export function addDecision(root: string, args: AddArgs): DecisionResult;
export function supersedeDecision(root: string, args: SupersedeArgs): DecisionResult;
export function refreshIndex(root: string, config?: Record<string, unknown> | null): { file: string; count: number };
