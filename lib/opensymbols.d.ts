// Type surface for the ported JS client (lib/opensymbols.js), kept as-is from
// the opensymbols-test prototype.
export interface SymbolResult {
  id: string | number;
  name: string;
  locale: string;
  repoKey: string;
  license: string | null;
  author: string | null;
  imageUrl: string;
  detailsUrl: string | null;
  sourceUrl: string | null;
  searchString: string;
  unsafeResult: boolean;
  hc: boolean;
  extension: string;
  source: 'twemoji' | 'mulberry' | 'tawasol' | 'arasaac' | 'opensymbols';
  tier: number;
  confidence: number;
}

export function extractKeywords(input: string): string[];
export function normalizeKeyword(value: unknown): string;
export function getTwemojiMatch(term: string): SymbolResult | null;
export function getAccessToken(secret: string): Promise<string>;
export function searchSymbolTerm(args: {
  term: string;
  locale?: string;
  limit?: number;
  preferredLibraries?: string[];
}): Promise<{ q: string; locale: string; totalResults: number; results: SymbolResult[] }>;
export function searchOpenSymbolsImages(args: {
  query: string;
  locale?: string;
  limit?: number;
}): Promise<{
  q: string;
  locale: string;
  keywords: string[];
  totalResults: number;
  results: SymbolResult[];
}>;
