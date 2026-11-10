export interface ParsedFrontMatter {
  data: Record<string, unknown>;
  body: string;
  errors: string[];
}
export function parseFrontMatter(text: string): ParsedFrontMatter;
export function serializeFrontMatter(
  data: Record<string, unknown>,
  body: string,
  order?: string[],
): string;
