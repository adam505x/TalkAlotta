import { Client } from '@elastic/elasticsearch';
import { searchBody, VISUAL_FIELD } from './symbol-query.mjs';
import type { SymbolResult } from './opensymbols';

/**
 * Elasticsearch as the pictogram retrieval layer.
 *
 * What this replaces: the live ARASAAC search API call inside searchOnce. What
 * it deliberately does not replace: the scoring in lib/symbol-search.ts. This
 * module returns SymbolResult[] in Elastic's ranked order and nothing else, so
 * scoreCandidate, CONFIDENCE_THRESHOLD, needsReview, caregiver overrides and the
 * feedback boosts all keep working untouched. See NOTE ON RANKING below for why
 * that is the right split rather than a cop-out.
 *
 * Why Elastic rather than the ARASAAC API, for the sponsor question:
 *
 *   - The live API matches a term against one keyword at a time and returns
 *     whole pictograms. It has no notion of "paint brush" being closer to a
 *     pictogram keyworded "paintbrush" than to one keyworded "paint". BM25 over
 *     name/keywords/tags/categories with per-field boosts does.
 *   - Synonyms (lib/aliases.mjs) are applied inside one query. On the legacy
 *     path every alternate phrasing costs another HTTP round trip, and only
 *     fires after the first attempt has already failed.
 *   - ARASAAC's own safety flags (sex, violence) are indexed and surfaced as
 *     unsafeResult, which the live path never read at all.
 *   - It runs offline once indexed, so a hackathon demo does not depend on
 *     api.arasaac.org being reachable from the venue wifi.
 */

const LOCALE = process.env.OPENSYMBOLS_LOCALE || 'en';

export const SYMBOL_INDEX = process.env.ELASTIC_SYMBOL_INDEX || 'talkalotta-symbols';

/**
 * The preconfigured Elastic Inference endpoint for Jina's multimodal model.
 *
 * Preconfigured, meaning the leading dot: it exists on Elastic Cloud without
 * creating an inference endpoint and without a separate Jina API key. It takes
 * text, images and PDFs into one shared vector space, which is the whole point
 * here - the index stores an embedding of the pictogram IMAGE, and a plain text
 * query is embedded into the same space to find it.
 */
export const INFERENCE_ID =
  process.env.ELASTIC_INFERENCE_ID || '.jina-embeddings-v5-omni-small';

export { VISUAL_FIELD };

/**
 * How much of the ranking comes from the picture rather than the label.
 *
 * Off unless the index has actually been through the image pass, because an RRF
 * query against an empty semantic field returns nothing useful and would quietly
 * halve the quality of every board.
 */
function multimodalEnabled(): boolean {
  return (process.env.ELASTIC_MULTIMODAL || '').toLowerCase() === 'true';
}

let cached: Client | null | undefined;

/**
 * The client, or null when Elastic is not configured.
 *
 * Null rather than a throw: a missing key is the normal state on a laptop that
 * has only ever run the legacy path, and it should degrade to legacy silently
 * rather than take the board down.
 */
export function elasticClient(): Client | null {
  if (cached !== undefined) return cached;

  const node = process.env.ELASTIC_NODE;
  const apiKey = process.env.ELASTIC_API_KEY;
  if (!node || !apiKey) {
    cached = null;
    return null;
  }

  cached = new Client({
    node,
    auth: { apiKey },
    // Elastic Cloud Serverless speaks a slightly different API surface to a
    // self-hosted stack. Set ELASTIC_SERVER_MODE=stack for local Docker.
    serverMode:
      (process.env.ELASTIC_SERVER_MODE || 'serverless') === 'stack' ? 'stack' : 'serverless',
    // A board open blocks on this. Better a fast fall through to the legacy path
    // than a child staring at an empty grid.
    requestTimeout: Number(process.env.ELASTIC_TIMEOUT_MS || 4000),
    maxRetries: 1,
  });
  return cached;
}

/** True when the flag asks for Elastic and there are credentials to use. */
export function elasticEnabled(): boolean {
  const flag = (process.env.SYMBOL_SEARCH || 'legacy').toLowerCase();
  return flag === 'elastic' && elasticClient() !== null;
}

interface SymbolDoc {
  symbol_id: string;
  source: string;
  locale: string;
  name: string;
  keywords?: string[];
  tags?: string[];
  categories?: string[];
  search_text?: string;
  image_url: string;
  details_url?: string | null;
  license?: string | null;
  author?: string | null;
  schematic?: boolean;
  unsafe?: boolean;
  source_trust?: number;
}

/**
 * Unbounded BM25 into something that reads as a confidence.
 *
 * Saturating rather than dividing by the top hit: max-normalisation hands the
 * best result 1.0 even when the whole result set is rubbish, which is exactly
 * the case a confidence number exists to catch. score/(score+k) keeps a weak set
 * weak. k is roughly the score a merely-decent match lands on, so that match
 * comes out near 0.5.
 *
 * NOTE: this feeds SymbolResult.confidence for display and telemetry. It is NOT
 * what decides needsReview - see NOTE ON RANKING in elasticSearchSymbols.
 */
function saturate(score: number, k: number): number {
  if (!Number.isFinite(score) || score <= 0) return 0;
  return score / (score + k);
}

const SCORE_K = Number(process.env.ELASTIC_SCORE_K || 14);

/**
 * Search the pictogram index for one concept.
 *
 * Returns ONE SymbolResult PER KEYWORD, not per pictogram, mirroring
 * searchArasaac exactly. That is load-bearing: scoreCandidate compares the term
 * against a single name, so collapsing a pictogram's keywords into one result
 * would hide the keyword that actually matched and send good pictograms to the
 * review step.
 *
 * NOTE ON RANKING - why Elastic's score does not override scoreCandidate:
 *
 * matchConcept re-scores every candidate with scoreCandidate and sorts by it.
 * Array.prototype.sort is stable, so candidates that tie on scoreCandidate stay
 * in the order this function returned them. Elastic's ranking therefore decides
 * which pictograms reach the pool and breaks ties inside it, while the product
 * rules that scoreCandidate encodes - the generic-icon penalty, the unsafe
 * penalty, exact-match preference - stay in charge of the confidence a caregiver
 * is shown. Letting a raw _score set needsReview would have meant retuning
 * CONFIDENCE_THRESHOLD against a number with no fixed meaning, and every board
 * in the app depends on that threshold.
 */
export async function elasticSearchSymbols(
  term: string,
  {
    locale = LOCALE,
    limit = 12,
    multimodal,
  }: { locale?: string; limit?: number; multimodal?: boolean } = {},
): Promise<SymbolResult[]> {
  const query = term.trim();
  if (!query) return [];

  const client = elasticClient();
  if (!client) return [];

  // One pictogram yields several SymbolResults, so ask for a floor of documents
  // rather than the caller's limit: five keywords on the top hit would otherwise
  // crowd every other pictogram out of the pool.
  const size = Math.max(limit, 12);

  // Per-call override, defaulting to the flag. Measured, the picture half helps
  // descriptive multi-word queries ("a place to sit down" -> "be seated") and
  // mildly hurts named vocabulary, which is all the board ever asks for. So the
  // board path leaves this alone and a caller that knows it is handling a
  // caregiver's free-text description can opt in. See docs/elasticsearch.md.
  const useMultimodal = multimodal ?? multimodalEnabled();
  const body = searchBody(query, { size, multimodal: useMultimodal });

  const res = await client.search<SymbolDoc>({
    index: SYMBOL_INDEX,
    ...body,
    // The embedding is large and never read by the app. Excluding it keeps a
    // board open from dragging megabytes of vectors over the wire.
    _source: { excludes: [VISUAL_FIELD, `${VISUAL_FIELD}.*`] },
  } as Parameters<typeof client.search>[0]);

  const hits = res.hits?.hits ?? [];

  // RRF scores are reciprocal ranks, roughly 0.01 to 0.05, so the saturation
  // constant tuned for BM25 is meaningless against them. Fall back to relative
  // position within the set, which is all an RRF score ever expressed anyway.
  const topScore = hits.length > 0 ? Number(hits[0]?._score ?? 0) : 0;

  const out: SymbolResult[] = [];
  const seen = new Set<string>();

  for (const hit of hits) {
    const doc = hit._source;
    if (!doc || !doc.image_url) continue;

    const raw = Number(hit._score ?? 0);
    const confidence = useMultimodal
      ? topScore > 0
        ? Math.max(0.1, raw / topScore)
        : 0
      : saturate(raw, SCORE_K);

    // Every keyword on the pictogram becomes its own candidate, same as the
    // live ARASAAC client, so the scorer can compare the term against each.
    const names = [doc.name, ...(doc.keywords ?? [])]
      .map((n) => (n ?? '').trim())
      .filter(Boolean);
    if (names.length === 0) names.push(query);

    for (const name of names) {
      const key = `${doc.symbol_id}:${name.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);

      out.push({
        id: doc.symbol_id,
        name,
        locale: doc.locale || locale,
        repoKey: doc.source || 'arasaac',
        license: doc.license ?? null,
        author: doc.author ?? null,
        imageUrl: doc.image_url,
        detailsUrl: doc.details_url ?? null,
        sourceUrl: doc.image_url,
        searchString: query,
        // ARASAAC flags these per pictogram. The live search path never read
        // them; indexing meant they became free to honour.
        unsafeResult: Boolean(doc.unsafe),
        hc: Boolean(doc.schematic),
        extension: 'png',
        source: (doc.source as SymbolResult['source']) || 'arasaac',
        tier: 1,
        confidence,
      });
    }
  }

  return out;
}
