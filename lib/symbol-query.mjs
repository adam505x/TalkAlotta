/**
 * The pictogram query, in one place.
 *
 * Shared rather than duplicated because scripts/check-symbols.mjs is the thing
 * that decides whether the swap was worth making. A comparison script running a
 * near-copy of the real query proves nothing about the real query, and the first
 * version of this code had already drifted.
 *
 * Plain JS with a .d.mts beside it, matching lib/aliases.mjs, so both the app
 * and the node scripts can import it without a build step.
 */

/**
 * A term with everything but letters and digits stripped out.
 *
 * This is the compound-noun fix. ARASAAC keywords a paintbrush as the single
 * token "paintbrush", the board asks for "paint brush", and no amount of
 * stemming or synonym expansion connects two tokens to one. Stripping both
 * sides to "paintbrush" does, symmetrically and without a word list.
 *
 * Verified cases: paint brush -> paintbrush (pictogram 2523), seat belt ->
 * seatbelt, teddy bear -> teddybear.
 */
export function compactTerm(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * The lexical query.
 *
 * The ordering principle, learned the hard way: THE LITERAL TERM MUST OUTRANK
 * ITS OWN SYNONYMS. Applying the synonym set at full weight made "story" return
 * nothing but book and read pictograms, because ALIASES lists those as
 * equivalents and BM25 has no reason to prefer the word actually asked for. So
 * the literal clauses run against aac_index, which has no synonym filter, and
 * the synonym-expanded clause sits underneath them at a deliberately low boost
 * where it can rescue a miss but never overturn a hit.
 *
 * Clause by clause:
 *   compact  - exact match on the space-stripped form. Very precise, so it can
 *              carry a high boost safely.
 *   phrase   - "paint brush" adjacent beats a pictogram merely mentioning paint.
 *   literal  - ordinary per-field BM25 on the word as typed.
 *   cross    - a two-word concept split across two keywords ("teddy" on one,
 *              "bear" on another). Operator and, because a partial cross-field
 *              match is usually a generic icon.
 *   synonym  - the ALIASES and dialect sets. Low boost, by design.
 *   fuzzy    - for the caregiver typing into PictureSheet. Generated board words
 *              are never misspelled, so this stays weak; real weight here starts
 *              matching "cat" to "cot".
 */
export function lexicalQuery(term) {
  const compact = compactTerm(term);

  const should = [
    {
      multi_match: {
        query: term,
        type: 'phrase',
        fields: ['name^6', 'keywords^4', 'search_text^2'],
        analyzer: 'aac_index',
        boost: 4,
      },
    },
    {
      multi_match: {
        query: term,
        type: 'best_fields',
        fields: ['name^4', 'keywords^3', 'search_text^2', 'tags^1', 'categories^0.5'],
        analyzer: 'aac_index',
        boost: 2,
      },
    },
    {
      multi_match: {
        query: term,
        type: 'cross_fields',
        fields: ['name^2', 'keywords^2', 'search_text'],
        operator: 'and',
        analyzer: 'aac_index',
      },
    },
    {
      // The only clause that sees synonyms, and the weakest of the real ones.
      multi_match: {
        query: term,
        type: 'best_fields',
        fields: ['name^4', 'keywords^3', 'search_text^2'],
        boost: 0.5,
      },
    },
    {
      multi_match: {
        query: term,
        type: 'best_fields',
        fields: ['name', 'keywords'],
        fuzziness: 'AUTO:5,9',
        prefix_length: 2,
        analyzer: 'aac_index',
        boost: 0.3,
      },
    },
  ];

  if (compact.length > 2) {
    should.unshift({ term: { compact: { value: compact, boost: 8 } } });
  }

  return { bool: { should, minimum_should_match: 1 } };
}

/**
 * Source trust and the schematic preference, as multipliers on the text score.
 *
 * The same two product rules the legacy path applies, moved to where retrieval
 * happens so they shape which candidates survive the size cut rather than only
 * reordering whatever came back. SOURCE_TRUST is written onto each document as
 * source_trust at ingest.
 *
 * Schematic pictograms are the plainer line drawings; they read better small and
 * with a visual impairment, so they get a nudge, not a filter. A schematic
 * pictogram of the wrong thing is still the wrong thing.
 */
export function withRankingSignals(query) {
  return {
    function_score: {
      query,
      functions: [
        { field_value_factor: { field: 'source_trust', factor: 1, missing: 0.7, modifier: 'none' } },
        { filter: { term: { schematic: true } }, weight: 1.08 },
      ],
      score_mode: 'multiply',
      boost_mode: 'multiply',
    },
  };
}

/** The field holding the image embedding. Only populated by the image pass. */
export const VISUAL_FIELD = 'visual';

/**
 * The whole search body, lexical or hybrid.
 *
 * Shared with the check script for the same reason the query is: deciding
 * whether multimodal earns its place means measuring the body the app actually
 * sends, not an approximation of it.
 *
 * Hybrid is reciprocal rank fusion, not a weighted sum: the BM25 score and the
 * vector similarity are on incompatible scales, and RRF only needs the two
 * orderings. Keyword search stays a full half of the ranking, which matters for
 * AAC - a pictogram is schematic line art, so for a named concrete concept a
 * strong ARASAAC keyword beats visual similarity. The picture half earns its
 * place on the fuzzy cases.
 */
export function searchBody(term, { size = 12, multimodal = false } = {}) {
  const lexical = withRankingSignals(lexicalQuery(term));
  if (!multimodal) return { query: lexical, size };

  return {
    retriever: {
      rrf: {
        retrievers: [
          { standard: { query: lexical } },
          { standard: { query: { match: { [VISUAL_FIELD]: { query: term } } } } },
        ],
        rank_window_size: Math.max(50, size * 4),
        rank_constant: 20,
      },
    },
    size,
  };
}
