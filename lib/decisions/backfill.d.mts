export interface SourceItem { file: string; kind: string; hint: string }
export interface ForeignAdr { file: string; title: string; status: string }
export declare function hasSource(root: string): boolean;
export declare function findForeignAdrs(root: string, config?: Record<string, unknown>): ForeignAdr[];
export declare function inventory(root: string, opts?: { limit?: number; config?: Record<string, unknown> }): SourceItem[];
export declare function coverage(
  records: unknown[] | undefined,
  sources: SourceItem[] | undefined,
  matchesAny: (file: string, patterns: string[]) => boolean,
): { covered: SourceItem[]; uncovered: SourceItem[] };
export declare function backfillSteer(opts?: {
  records?: unknown[];
  foreign?: ForeignAdr[];
  uncovered?: SourceItem[];
  hasSource?: boolean;
  max?: number;
}): string | null;
