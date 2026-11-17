export function projectRoot(cwd?: string): string;
export function sanitizeRoot(root: string): string;
export function projectKey(cwd?: string): string;
export function __clearProjectCache(): void;
export declare function gitRoot(dir: string): string | null;
/** A directory that is a project: a repo, an `.asf`, or a language manifest. */
export declare function isProjectRoot(root: string | null | undefined): boolean;
/** A project ASF may report violations for — never the user's home directory. */
export declare function isMeasurableRoot(root: string | null | undefined, home?: string | null): boolean;
