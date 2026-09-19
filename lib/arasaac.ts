import type { SymbolResult } from './opensymbols';

/**
 * ARASAAC pictograms, the primary picture source.
 *
 * Why this is primary rather than a fallback: every picture coming from one
 * library means the whole board looks like one set. Mixing emoji, line-art SVGs
 * and photographic icons on the same board is harder to read than any one of
 * them alone, and visual consistency matters more in AAC than picking the single
 * best image per word.
 *
 * A probe across the starter vocabulary found a usable ARASAAC pictogram for
 * every word tried, so this is a safe default. OpenSymbols stays available as a
 * fallback for the handful of words ARASAAC does not cover well, for example
 * "paint brush", where ARASAAC's closest match is a paint roller.
 *
 * Endpoint and licence: the search API needs no key. Pictograms are CC BY-NC-SA,
 * which is fine for a hackathon but non-commercial. Mulberry (CC BY-SA) is the
 * route to a commercial release, and it is already reachable through the
 * OpenSymbols client.
 */

const SEARCH = (locale: string, word: string) =>
  `https://api.arasaac.org/api/pictograms/${locale}/search/${encodeURIComponent(word)}`;

const IMAGE = (id: string | number) =>
  `https://static.arasaac.org/pictograms/${id}/${id}_300.png`;

interface ArasaacKeyword {
  keyword?: string;
  plural?: string;
  meaning?: string;
}

interface ArasaacHit {
  _id?: number;
  id?: number;
  keywords?: ArasaacKeyword[];
  schematic?: boolean;
  tags?: string[];
}

/**
 * One SymbolResult per KEYWORD, not per pictogram.
 *
 * A pictogram carries several keywords ("drink", "beverage"), and the scorer
 * needs to compare the search term against each one separately. Collapsing to a
 * single name would hide the keyword that actually matched.
 */
export async function searchArasaac(
  term: string,
  { locale = 'en', limit = 12 }: { locale?: string; limit?: number } = {},
): Promise<SymbolResult[]> {
  const query = term.trim();
  if (!query) return [];

  let hits: ArasaacHit[] = [];
  try {
    const res = await fetch(SEARCH(locale.slice(0, 2) || 'en', query), {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return [];
    const payload: unknown = await res.json();
    hits = Array.isArray(payload) ? (payload as ArasaacHit[]) : [];
  } catch {
    // Offline, blocked or the endpoint moved. The caller falls back.
    return [];
  }

  const out: SymbolResult[] = [];
  const seen = new Set<string>();

  for (const hit of hits.slice(0, limit)) {
    const id = hit._id ?? hit.id;
    if (id == null) continue;
    const imageUrl = IMAGE(id);

    const names = (hit.keywords ?? [])
      .map((k) => (k.keyword ?? '').trim())
      .filter(Boolean);
    if (names.length === 0) names.push(query);

    for (const name of names) {
      const key = `${id}:${name.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);

      out.push({
        id,
        name,
        locale,
        repoKey: 'arasaac',
        license: 'CC BY-NC-SA',
        author: 'ARASAAC / Gobierno de Aragon',
        imageUrl,
        detailsUrl: `https://arasaac.org/pictograms/${id}`,
        sourceUrl: imageUrl,
        searchString: query,
        unsafeResult: false,
        // A schematic pictogram is the plainer drawing, which reads better at
        // small sizes and for a visual impairment.
        hc: Boolean(hit.schematic),
        extension: 'png',
        source: 'arasaac',
        tier: 1,
        confidence: 0.8,
      });
    }
  }

  return out;
}

export { IMAGE as arasaacImageUrl };
