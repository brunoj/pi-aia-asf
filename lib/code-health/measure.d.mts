export interface HealthVerdictSource {
  healthy?: boolean;
  exitCode?: number;
  ran?: number;
  skipped?: number;
}

export interface HealthRecord {
  verdict: string;
  scanned: number;
  skipped: number;
  level: string;
  recorded: boolean;
  error: string;
}

export function measuredMetrics(res: HealthVerdictSource | null | undefined): number;
export function skippedMetrics(res: HealthVerdictSource | null | undefined): number;
export function verdictOf(res: HealthVerdictSource | null | undefined): string;
export function measureSummary(res: HealthVerdictSource | null | undefined, level: string): string;
export function healthRunEntry(
  res: HealthVerdictSource | null | undefined,
  level: string,
): { kind: "health-run"; level: string; verdict: string; scanned: number };
export function recordLine(rec: HealthRecord): string;
