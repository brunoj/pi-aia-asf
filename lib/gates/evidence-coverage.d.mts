export interface EvidenceCoverage {
  kinds: string[];
  required: string[];
  producers: Record<string, string[]>;
  orphans: string[];
  requiredOrphans: string[];
  files: number;
}

export interface CoverageGap {
  gap: string;
  remedy: string;
}

/** Does every ledger kind have a producer in the package at `root`? */
export function evidenceCoverage(root: string, entryKinds: string[]): EvidenceCoverage;

/** The coverage result as a completion gap, or null when the install is sound. */
export function coverageGap(coverage: EvidenceCoverage): CoverageGap | null;
