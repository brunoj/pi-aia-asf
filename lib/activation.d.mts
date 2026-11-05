export interface CallClass {
  mutates: boolean;
  source: boolean;
  path: string | null;
  via: string | null;
}
export function isSourcePath(p: unknown): boolean;
export function bashWritesSource(cmd: unknown): { writes: boolean; via?: string };
export function classifyToolCall(toolName: unknown, input: unknown): CallClass;
export function activationDecision(o?: {
  call?: CallClass;
  activeRun?: { phase?: string; runId?: string } | null;
  passiveRunId?: string | null;
}): { activate: boolean; reason?: string };
export const SOURCE_EXTENSIONS: string[];
export function delegatesUnguardedWrites(cmd: unknown): boolean;
