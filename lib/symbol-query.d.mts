/** Type surface for lib/symbol-query.mjs, which is plain JS so scripts can import it. */
export declare const VISUAL_FIELD: string;
export declare function compactTerm(value: string): string;
export declare function lexicalQuery(term: string): Record<string, unknown>;
export declare function withRankingSignals(query: unknown): Record<string, unknown>;
export declare function searchBody(
  term: string,
  options?: { size?: number; multimodal?: boolean },
): Record<string, unknown>;
