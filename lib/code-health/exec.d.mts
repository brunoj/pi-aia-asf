/**
 * Type surface for the bounded spawn used by the health gate and the baseline
 * tool. The implementation is plain ESM JavaScript.
 */
export interface ExecResult {
  /** Process exit code, or -1 when it could not be spawned or was killed. */
  code: number;
  stdout: string;
  stderr: string;
  /** True when the hard timeout fired and the child was killed. */
  timedOut: boolean;
  /** Spawn failure reason (ENOENT and friends); absent on a normal exit. */
  error?: string;
}

export function exec(
  cmd: string,
  args: string[],
  opts?: { cwd?: string; timeoutMs?: number; env?: Record<string, string> },
): Promise<ExecResult>;
