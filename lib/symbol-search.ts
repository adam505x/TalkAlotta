import { and, eq, sql } from 'drizzle-orm';
import { getTwemojiMatch, normalizeKeyword, searchSymbolTerm, type SymbolResult } from './opensymbols';
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

/** Source trust, highest first. Mulberry and Tawasol are cleaner AAC artwork. */
const SOURCE_TRUST: Record<string, number> = {
  mulberry: 1.0,
  tawasol: 0.95,
  twemoji: 0.8,
  opensymbols: 0.75,
  arasaac: 0.6,
};

/**
 * Seed of the canonical concept dictionary: alternate phrasings to retry when a
 * concept scores badly. Deterministic, so it is cacheable rather than guessed at
 * each time.
 * TODO(aliases): grow this as real scenarios expose more failures.
 */
const ALIASES: Record<string, string[]> = {
  finished: ['done', 'all done', 'complete'],
  toilet: ['bathroom', 'wc', 'potty'],
  sore: ['pain', 'hurt', 'ouch'],
  thirsty: ['thirst', 'drink'],
  hungry: ['hunger', 'eat'],
  television: ['tv', 'watch tv'],
  teddy: ['teddy bear', 'soft toy'],
  coat: ['jacket'],
  mum: ['mother', 'mom'],
  dad: ['father'],
  me: ['myself', 'i'],
  'thank you': ['thanks'],
  story: ['book', 'read'],
};

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

function tokenize(value: string): string[] {
  return normalizeKeyword(value).split(/\s+/).filter(Boolean);
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

  const wantedSet = new Set(wanted);
  const gotSet = new Set(got);
  const hits = wanted.filter((t) => gotSet.has(t)).length;

  // Every token of the concept must be present for a strong score.
  let score = hits / wanted.length;

  // Exact name match is the best possible signal.
  if (normalizeKeyword(item.name) === normalizeKeyword(term)) {
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

/** ARASAAC safety net so a concept never comes back empty. */
async function arasaacFallback(term: string, limit: number): Promise<SymbolResult[]> {
  try {
    const q = encodeURIComponent(normalizeKeyword(term) || term);
    const res = await fetch(
      `https://api.arasaac.org/v1/pictograms/${LOCALE.slice(0, 2)}/search/${q}`,
    );
    if (!res.ok) return [];
    const payload = (await res.json()) as unknown;
    const items = Array.isArray(payload) ? payload : [];
    return items.slice(0, limit).flatMap((item: Record<string, unknown>) => {
      const id = (item?._id ?? item?.id) as string | number | undefined;
      if (!id) return [];
      const imageUrl = `https://static.arasaac.org/pictograms/${id}/${id}_300.png`;
      return [
        {
          id,
          name: String(item?.keyword ?? term),
          locale: LOCALE,
          repoKey: 'arasaac',
          license: 'ARASAAC',
          author: 'ARASAAC',
          imageUrl,
          detailsUrl: `https://arasaac.org/pictogram/${id}`,
          sourceUrl: imageUrl,
          searchString: term,
          unsafeResult: false,
          hc: false,
          extension: 'png',
          source: 'arasaac' as const,
          tier: 4,
          confidence: 0.55,
        },
      ];
    });
  } catch {
    return [];
  }
}

function dedupe(items: SymbolResult[]): SymbolResult[] {
  const seen = new Set<string>();
  return items.filter((i) => {
    const key = i.imageUrl || `${i.repoKey}:${i.name}`;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** One round of library search for a single phrasing. */
async function searchOnce(term: string, limit: number): Promise<SymbolResult[]> {
  const collected: SymbolResult[] = [];

  const emoji = getTwemojiMatch(term);
  // Only trust an emoji when it matches the whole concept, which is what stopped
  // filler words being promoted to the top of the board.
  if (emoji && normalizeKeyword(emoji.name) === normalizeKeyword(term)) {
    collected.push(emoji);
  }

  const [favored, general] = await Promise.all([
    searchSymbolTerm({
      term,
      locale: LOCALE,
      limit,
      preferredLibraries: ['tawasol', 'mulberry'],
    }).catch(() => null),
    searchSymbolTerm({ term, locale: LOCALE, limit }).catch(() => null),
  ]);

  if (favored) collected.push(...favored.results);
  if (general) collected.push(...general.results);

  if (collected.length === 0) {
    collected.push(...(await arasaacFallback(term, limit)));
  }

  return dedupe(collected);
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
  const phrasings = [term, ...(ALIASES[term] ?? [])];

  let pool: Candidate[] = [];

  for (const phrasing of phrasings) {
    queriedAs.push(phrasing);
    const raw = await searchOnce(phrasing, limit);
    const scored = raw.map<Candidate>((item) => {
      const base = scoreCandidate(term, item);
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

  const ranked = override ? [override, ...pool] : pool;
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
