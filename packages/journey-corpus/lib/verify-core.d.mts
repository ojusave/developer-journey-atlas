export interface PreparedDoc {
  original: string;
  lower: string;
  tokens: Array<{ tok: string; start: number; end: number }>;
}

export interface SupportingExcerpt {
  supported: boolean;
  coverage: number;
  excerpt: string | null;
  matchedTokens: string[];
  missingTokens: string[];
}

export function prepareDoc(content: string): PreparedDoc;
export function findSupportingExcerpt(
  docOriginal: string,
  docLower: string,
  tokens: PreparedDoc["tokens"],
  fieldText: string,
  opts?: { window?: number },
): SupportingExcerpt;
