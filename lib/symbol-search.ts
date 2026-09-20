import { and, eq, sql } from 'drizzle-orm';
import { normalizeKeyword, searchSymbolTerm, type SymbolResult } from './opensymbols';
import { searchArasaac } from './arasaac';
import { elasticEnabled, elasticSearchSymbols } from './elastic-symbols';
import { phrasingsFor } from './aliases.mjs';
import { compactTerm } from './symbol-query.mjs';
import { db, schema } from './db';
import type { WordRole } from './core-words';

/**
 * Searches the symbol library one concept at a time, rather than sending a
 * merged bag of words.
 *
 * Why per concept: a single joined query mixes unrelated ideas, and you cannot
 * tell which concept failed when the board looks wrong. Searching "paint brush"
 * and "apron" separately gives one clear result per button, and a per-button
 * confidence you can act on.
 *
 * The ported client (lib/opensymbols.js) is used exactly as it is. Its
 * tiered multi-source search stays; what is added here is:
 *   - a real confidence score, instead of a constant per source tier
 *   - caregiver overrides and past accepted choices winning over fresh results
 *   - retry with alternate phrasings before giving up on a concept
 */

const LOCALE = process.env.OPENSYMBOLS_LOCALE || 'en';

/**
 * Source trust, highest first.
 *
 * ARASAAC leads because every board should look like one set of pictures rather
 * than a mixture of drawing styles. Emoji are demoted hard for the same reason:
 * a single emoji among pictograms stands out as the odd one, whatever it depicts.
 */
const SOURCE_TRUST: Record<string, number> = {
  arasaac: 1.0,
  mulberry: 0.9,
  tawasol: 0.85,
  opensymbols: 0.78,
  twemoji: 0.5,
};

/**
 * ALIASES moved to lib/aliases.mjs so the Elasticsearch ingest script can read
 * the same list and build its synonym set from it. Behaviour here is unchanged:
 * matchConcept still retries a concept with these phrasings.
 */

export interface Candidate extends SymbolResult {
  /** 0 to 1. Real score, not a per-tier constant. */
  score: number;
  /** Where this candidate came from, for the review step. */
  origin: 'override' | 'learned' | 'library';
}

export interface ConceptMatch {
  term: string;
  label: string;
  role: WordRole;
  best: Candidate | null;
  alternatives: Candidate[];
  /** True when nothing scored well enough to accept without a look. */
  needsReview: boolean;
  queriedAs: string[];
}

/** Below this, never silently accept: surface it for the caregiver to confirm. */
export const CONFIDENCE_THRESHOLD = 0.55;

/**
 * Light singular/plural folding so "swings" matches a pictogram named "swing".
 *
 * Without this the scorer rejected an exact pictogram purely on a trailing s,
 * which is the wrong reason to send a caregiver to the review step.
 */
function stem(token: string): string {
  if (token.length > 4 && token.endsWith('ies')) return `${token.slice(0, -3)}y`;
  if (token.length > 4 && (token.endsWith('ches') || token.endsWith('shes') || token.endsWith('sses')))
    return token.slice(0, -2);
  if (token.length > 3 && token.endsWith('s') && !token.endsWith('ss')) return token.slice(0, -1);
  return token;
}

function tokenize(value: string): string[] {
  return normalizeKeyword(value)
    .split(/\s+/)
    .filter(Boolean)
    .map(stem);
}

/**
 * Real confidence: how well does this symbol's name actually answer the concept?
 *
 * Deliberately harsher than the old coverage rubric, which gave full marks when
 * merely half the query tokens appeared in the name, so "red paint" matching a
 * generic "paint" icon scored perfectly.
 */
function scoreCandidate(term: string, item: SymbolResult): number {
  const wanted = tokenize(term);
  const got = tokenize(item.name ?? '');
  if (wanted.length === 0 || got.length === 0) return 0;

  // Spacing is not a difference in meaning. ARASAAC keywords a paintbrush as
  // one token and the board asks for "paint brush"; token overlap scores that
  // zero, which is how the exactly-right pictogram used to end up in the review
  // queue. Compare the letters and ignore where the spaces fell.
  if (compactTerm(term) === compactTerm(item.name ?? '')) {
    return Math.max(0, Math.min(1, 1 * (0.8 + 0.2 * (SOURCE_TRUST[item.source] ?? 0.7))));
  }

  const wantedSet = new Set(wanted);
  const gotSet = new Set(got);
  const hits = wanted.filter((t) => gotSet.has(t)).length;

  // Every token of the concept must be present for a strong score.
  let score = hits / wanted.length;

  // Exact name match is the best possible signal, plurals folded.
  if (got.join(' ') === wanted.join(' ')) {
    score = 1;
  } else if (score === 1 && got.length > wanted.length) {
    // All tokens present but the symbol is more specific than asked for
    // ("paint brush cleaning"): mild penalty for the extra words.
    score -= Math.min(0.25, 0.08 * (got.length - wanted.length));
  }

  // Generic-icon penalty: the symbol dropped the qualifier entirely. This is the
  // "red paint returns a plain paint pot" case.
  if (hits < wanted.length) {
    const missing = wanted.filter((t) => !gotSet.has(t));
    score -= 0.2 * missing.length;
  }

  // Unrelated extra tokens in the symbol name reduce confidence a little.
  const noise = got.filter((t) => !wantedSet.has(t)).length;
  score -= Math.min(0.15, 0.04 * noise);

  // Source trust nudges, it does not dominate.
  const trust = SOURCE_TRUST[item.source] ?? 0.7;
  score = score * (0.8 + 0.2 * trust);

  if (item.unsafeResult) score -= 0.5;

  return Math.max(0, Math.min(1, score));
}

/**
 * The best this symbol scores against any phrasing of the concept.
 *
 * scoreCandidate compares surface strings, so it cannot know that a pictogram
 * labelled "soft drink" is the right answer for "fizzy drink". Retrieval already
 * knows - the synonym set told it - and without this the search finds the right
 * picture and the scorer then sends it to the review queue anyway.
 *
 * Phrasings are passed in rather than looked up per candidate, because this runs
 * once for every keyword of every hit.
 */
function scoreConcept(phrasings: string[], item: SymbolResult): number {
  let best = 0;
  for (const phrasing of phrasings) {
    best = Math.max(best, scoreCandidate(phrasing, item));
    if (best >= 1) break;
  }
  return best;
}

/**
 * Drops exact repeats, keeping every distinct KEYWORD of a pictogram.
 *
 * The key includes the name on purpose. lib/arasaac.ts and lib/elastic-symbols.ts
 * both emit one result per keyword, precisely so the scorer can compare the term
 * against the keyword that actually matched. Keying on imageUrl alone collapsed
 * a pictogram to whichever keyword happened to come first, so searching "granny"
 * kept only the candidate named "grandmother" and scored it zero - throwing away
 * the "granny" keyword sitting on the very same pictogram.
 *
 * Duplicate PICTURES are collapsed later, by collapseByImage, once the scores
 * exist to choose the best keyword with.
 */
function dedupe(items: SymbolResult[]): SymbolResult[] {
  const seen = new Set<string>();
  return items.filter((i) => {
    const key = i.imageUrl
      ? `${i.imageUrl}::${(i.name ?? '').toLowerCase()}`
      : `${i.repoKey}:${i.name}`;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * One entry per picture, keeping the best-scoring keyword for each.
 *
 * Runs after sorting, so the first occurrence of an image is its highest score.
 * This is what stops the caregiver's replace-picture sheet showing the same
 * drawing three times under three different labels.
 */
function collapseByImage(candidates: Candidate[]): Candidate[] {
  const seen = new Set<string>();
  return candidates.filter((c) => {
    const key = c.imageUrl || `${c.repoKey}:${c.name}`;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * One round of library search for a single phrasing.
 *
 * Dispatches on SYMBOL_SEARCH. The legacy path below is untouched and stays the
 * safety net: Elastic being misconfigured, unreachable, out of trial or simply
 * empty for this term must never be the reason a board opens blank in front of a
 * child. Any throw or an empty result set falls through to the live libraries.
 *
 * Note the empty-result fallback is deliberate and not just an error guard. A
 * term genuinely absent from the index is indistinguishable, from here, from an
 * index that was never ingested, and the legacy path costs one HTTP call to
 * rule it out.
 */
async function searchOnce(term: string, limit: number): Promise<SymbolResult[]> {
  if (elasticEnabled()) {
    try {
      const hits = await elasticSearchSymbols(term, { locale: LOCALE, limit });
      if (hits.length > 0) {
        const best = hits.reduce((max, item) => Math.max(max, scoreCandidate(term, item)), 0);
        if (best >= CONFIDENCE_THRESHOLD) return dedupe(hits);

        // Weak, so widen exactly as the legacy path does. Returning a poor
        // Elastic hit just because Elastic answered would make the flag a
        // downgrade for every word ARASAAC covers badly: the index always has
        // SOMETHING to say, so without this the OpenSymbols rescue could never
        // fire again and words like "granny" would quietly get worse.
        const rescued = await rescueFromOpenSymbols(term, limit);
        return dedupe([...hits, ...rescued]);
      }
      console.warn(`[symbol-search] elastic returned nothing for "${term}", using libraries`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[symbol-search] elastic failed for "${term}" (${message}), using libraries`);
    }
  }

  return legacySearchOnce(term, limit);
}

/**
 * The OpenSymbols widening, shared by both retrieval paths.
 *
 * Mulberry and Tawasol first because they are drawn closest to ARASAAC, then a
 * general search. Failures are swallowed: this is already the fallback, and a
 * dead OpenSymbols must not take down a board that has usable pictograms.
 */
async function rescueFromOpenSymbols(term: string, limit: number): Promise<SymbolResult[]> {
  const [favored, general] = await Promise.all([
    searchSymbolTerm({
      term,
      locale: LOCALE,
      limit,
      preferredLibraries: ['tawasol', 'mulberry'],
    }).catch(() => null),
    searchSymbolTerm({ term, locale: LOCALE, limit }).catch(() => null),
  ]);

  const rescued: SymbolResult[] = [];
  if (favored) rescued.push(...favored.results);
  if (general) rescued.push(...general.results);
  return rescued;
}

/**
 * The original live-library search, kept whole.
 *
 * ARASAAC is asked first and, when it answers well, is the only source used, so
 * the board stays visually consistent. OpenSymbols is only brought in to rescue a
 * word ARASAAC handles badly, such as "paint brush", where ARASAAC's closest
 * match is a paint roller and Mulberry has an exact paint brush.
 */
async function legacySearchOnce(term: string, limit: number): Promise<SymbolResult[]> {
  const preferred = await searchArasaac(term, { locale: LOCALE, limit });

  const bestPreferred = preferred.reduce(
    (max, item) => Math.max(max, scoreCandidate(term, item)),
    0,
  );
  if (bestPreferred >= CONFIDENCE_THRESHOLD) {
    return dedupe(preferred);
  }

  // ARASAAC results stay in the pool, so if nothing better turns up the closest
  // pictogram is still offered rather than nothing at all.
  return dedupe([...preferred, ...(await rescueFromOpenSymbols(term, limit))]);
}

/** Caregiver override for this word, if any. Always wins. */
function overrideFor(term: string): Candidate | null {
  const row = db
    .select()
    .from(schema.symbolOverrides)
    .where(eq(schema.symbolOverrides.term, term))
    .get();
  if (!row) return null;
  return {
    id: `override-${row.id}`,
    name: term,
    locale: LOCALE,
    repoKey: row.source ?? 'override',
    license: row.license,
    author: row.author,
    imageUrl: row.imageUrl,
    detailsUrl: null,
    sourceUrl: row.imageUrl,
    searchString: term,
    unsafeResult: false,
    hc: false,
    extension: '',
    source: 'opensymbols',
    tier: 0,
    confidence: 1,
    score: 1,
    origin: 'override',
  };
}

/**
 * The learning layer, reading. Image URLs this caregiver has accepted before for
 * this word get a boost, so past choices carry forward.
 */
function learnedBoosts(term: string): Map<string, number> {
  const rows = db
    .select({
      imageUrl: schema.symbolFeedback.imageUrl,
      action: schema.symbolFeedback.action,
      n: sql<number>`count(*)`,
    })
    .from(schema.symbolFeedback)
    .where(eq(schema.symbolFeedback.term, term))
    .groupBy(schema.symbolFeedback.imageUrl, schema.symbolFeedback.action)
    .all();

  const boosts = new Map<string, number>();
  for (const r of rows) {
    if (!r.imageUrl) continue;
    const current = boosts.get(r.imageUrl) ?? 0;
    const delta = r.action === 'accepted' ? 0.15 * r.n : r.action === 'rejected' ? -0.3 * r.n : 0;
    boosts.set(r.imageUrl, current + delta);
  }
  return boosts;
}

export async function matchConcept(
  term: string,
  role: WordRole,
  { limit = 8 }: { limit?: number } = {},
): Promise<ConceptMatch> {
  const label = term;
  const queriedAs: string[] = [];

  const override = overrideFor(term);

  const boosts = learnedBoosts(term);
  const phrasings = phrasingsFor(term);

  let pool: Candidate[] = [];

  for (const phrasing of phrasings) {
    queriedAs.push(phrasing);
    const raw = await searchOnce(phrasing, limit);
    const scored = raw.map<Candidate>((item) => {
      const base = scoreConcept(phrasings, item);
      const boosted = Math.max(0, Math.min(1, base + (boosts.get(item.imageUrl) ?? 0)));
      return {
        ...item,
        score: boosted,
        origin: (boosts.get(item.imageUrl) ?? 0) > 0 ? 'learned' : 'library',
      };
    });
    pool = dedupe([...pool, ...scored] as SymbolResult[]) as Candidate[];

    // Retry with an alternate phrasing only if nothing good turned up.
    const bestSoFar = Math.max(0, ...pool.map((c) => c.score));
    if (bestSoFar >= CONFIDENCE_THRESHOLD) break;
  }

  pool.sort((a, b) => b.score - a.score);

  // Collapse after sorting and with the override already in front, so a pinned
  // picture wins and never appears twice.
  const ranked = collapseByImage(override ? [override, ...pool] : pool);
  const best = ranked[0] ?? null;

  return {
    term,
    label,
    role,
    best,
    alternatives: ranked.slice(1, 6),
    needsReview: !override && (!best || best.score < CONFIDENCE_THRESHOLD),
    queriedAs,
  };
}

export async function matchConcepts(
  concepts: { term: string; role: WordRole }[],
): Promise<ConceptMatch[]> {
  // Concepts are independent, so search them at once rather than in series.
  return Promise.all(concepts.map((c) => matchConcept(c.term, c.role)));
}

export function recordFeedback(
  term: string,
  action: 'accepted' | 'rejected' | 'replaced',
  symbol: { id?: string | number | null; imageUrl?: string | null },
) {
  db.insert(schema.symbolFeedback)
    .values({
      term,
      action,
      symbolId: symbol.id != null ? String(symbol.id) : null,
      imageUrl: symbol.imageUrl ?? null,
    })
    .run();
}

export { and, eq };
