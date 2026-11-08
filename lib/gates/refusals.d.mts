/**
 * Type surface for the refusal ladder (split out of `blockers.mjs` in 0.17.5).
 */

/** Normative text per refusal, injected on the second identical fire. */
export const RULE_TEXT: Record<string, string>;

/** Which fire of this identical refusal is this? 1 = first time. */
export function refusalStage(gate: string, fingerprint: unknown): number;

/** Test hook, and the same reset a new run performs. */
export function __resetRefusals(): void;
