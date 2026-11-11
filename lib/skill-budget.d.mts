export declare const BYTES_PER_TOKEN: number;
export declare const ALWAYS_READ_SHARE: number;
export declare const MIN_CONTEXT_WINDOW: number;
export declare const RUN_CARD_BYTES: number;
export declare const ALWAYS_READ: string[];
export declare function tokensFor(bytes: number): number;
export declare function budgetFor(contextWindow?: number): { contextWindow: number; tokens: number; assumed: boolean };
export interface BudgetOver { file: string; bytes: number; tokens?: number; msg: string }
export declare function checkBudget(
  skillDir: string,
  opts?: { always?: string[]; contextWindow?: number },
): { over: BudgetOver[]; sizes: Record<string, number>; total: number; tokens: number; budget: { contextWindow: number; tokens: number; assumed: boolean }; share: number };
export declare function ruleBaseline(skillDir: string): { rules: { n: number; title: string }[]; markers: string[] };
export declare function verifyRulesPreserved(skillDir: string, baseline: unknown): { problems: string[]; rules: number; markers: number };
