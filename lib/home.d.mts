export const ASF_DIR: string;
export const STATE_SUBDIR: string;
export const DECISIONS_SUBDIR: string;
export const GITIGNORE_BODY: string;

export interface AsfFileSpec {
  home: string;
  legacy: string;
}
export const FILES: Record<string, AsfFileSpec>;

export function asfDir(root: string): string;
export function homeStateDir(root: string, key: string): string;
export function decisionsDir(root: string, config?: Record<string, unknown> | null): string;
export function writePath(root: string, key: string): string;
export function readPath(root: string, key: string): string;
export function readHomeFile(root: string, key: string): string | undefined;
export function ensureHome(root: string, opts?: { decisions?: boolean }): string;
