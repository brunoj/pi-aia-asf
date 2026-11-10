export interface DecisionRecord extends Record<string, unknown> {
  id?: string;
  status?: string;
  title?: string;
  decision?: string;
  decided?: string | number;
  applies_to?: string[];
  body?: string;
  __file?: string;
}

export interface DecisionProblem {
  severity: "error" | "notice";
  file?: string;
  id?: string;
  field?: string;
  message: string;
}

export interface ValidateContext {
  byId?: Map<string, DecisionRecord>;
  planApproved?: boolean;
  now?: number;
  exists?: (p: string) => boolean;
}

export const STATUSES: string[];
export const ORIGINS: string[];
export const FIELD_ORDER: string[];
export const REQUIRED_FIELDS: string[];
export const BODY_SECTIONS: string[];
export const ACCEPTANCE_FIELDS: string[];

export function sectionsOf(body: string | undefined): Record<string, string>;
export function validateRecord(rec: DecisionRecord, ctx?: ValidateContext): DecisionProblem[];
export function validateRegister(records: DecisionRecord[], ctx?: ValidateContext): DecisionProblem[];
