import type { DecisionRecord, DecisionProblem } from "./schema.d.mts";

export const INDEX_FILE: string;

export interface LoadedRegister {
  records: DecisionRecord[];
  problems: DecisionProblem[];
}
export interface WriteResult {
  file?: string;
  created: boolean;
  reason?: string;
}

export function loadRegister(dir: string): LoadedRegister;
export function nextNumber(dir: string): number;
export function slugify(title: string): string;
export function fileNameFor(id: string | undefined, title: string): string;
export function writeRecord(dir: string, data: DecisionRecord, body?: string): WriteResult;
export function updateRecord(dir: string, id: string, patch: Record<string, unknown>): WriteResult;
export function indexLine(r: DecisionRecord): string;
export function renderIndex(records: DecisionRecord[]): string;
export function writeIndex(dir: string, records: DecisionRecord[]): string;
export function governing(records: DecisionRecord[] | undefined, filePath: string): DecisionRecord[];
export function indexForCard(
  records: DecisionRecord[] | undefined,
  opts?: { max?: number; bytes?: number },
): string[];
