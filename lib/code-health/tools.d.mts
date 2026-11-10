/** Where ASF is installed — the base for resolving its own bundled toolchain. */
export const ASF_ROOT: string;

export interface ResolvedTools {
  eslint?: string;
  sonarjs?: string;
  tsParser?: string;
  jscpd?: string;
  madge?: string;
  depcruise?: string;
  /** Where each tool was found: "asf" | "project" | "path" | undefined when missing. */
  sources: Record<string, string | undefined>;
  missing: string[];
  [key: string]: unknown;
}

/** Resolve the health toolchain ASF-first: ASF's install, then the project, then PATH. */
export function resolveTools(projectRoot: string, opts?: { asfRoot?: string }): ResolvedTools;

/** The required tools that could not be found; empty means the gate can measure. */
export function missingTools(tools: ResolvedTools): string[];
