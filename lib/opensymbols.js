import 'dotenv/config';

const STOP_WORDS = new Set([
  'a','an','and','are','as','at','be','by','for','from','get','give','go','help','how',
  'i','in','into','is','it','its','image','images','label','like','look','make','of','on',
  'or','please','show','search','symbol','symbols','the','this','to','with','you','your'
]);

const TWEMOJI_MAP = new Map([
  ['popcorn', '1f37f'],
  ['soda', '1f964'],
  ['drink', '1f964'],
  ['water', '1f4a7'],
  ['juice', '1f96b'],
  ['toilet', '1f6bd'],
  ['bathroom', '1f6bd'],
  ['stop', '1f6ab'],
  ['wait', '23f0'],
  ['time', '23f0'],
  ['break', '1f4a4'],
  ['rest', '1f4a4'],
  ['quiet', '1f50a'],
  ['play', '1f3ae'],
  ['outside', '1f3dd'],
  ['happy', '1f600'],
  ['smile', '1f600'],
  ['angry', '1f620'],
  ['frustrated', '1f624'],
  ['art', '1f3a8'],
  ['paint', '1f58c'],
  ['brush', '1f58c'],
  ['red', '1f534'],
  ['blue', '1f535'],
  ['yellow', '1f7e1'],
  ['green', '1f7e2'],
  ['school', '1f3eb'],
  ['class', '1f4da'],
  ['snack', '1f35f'],
  ['food', '1f35d'],
  ['lunch', '1f35d'],
  ['finished', '2705'],
  ['done', '2705'],
  ['more', '2795'],
  ['help', '2753'],
  ['need', '2753'],
]);

export function extractKeywords(input) {
  if (!input || !input.trim()) {
    return [];
  }

  const normalized = input
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) {
    return [];
  }

  const terms = normalized
    .split(/\s+/)
    .map((term) => term.trim())
    .filter((term) => term.length > 1 && !STOP_WORDS.has(term))
    .map((term) => term.replace(/^-+|-+$/g, ''));

  return [...new Set(terms)];
}

export function normalizeKeyword(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function makeTwemojiResult(term, codepoint, sourceLabel = 'twemoji') {
  const safeTerm = normalizeKeyword(term) || 'symbol';
  return {
    id: `twemoji-${codepoint}`,
    name: safeTerm,
    locale: 'en',
    repoKey: sourceLabel,
    license: 'Twemoji open source',
    author: 'Twitter / Twemoji',
    imageUrl: `https://cdn.jsdelivr.net/gh/jdecked/twemoji@latest/assets/svg/${codepoint}.svg`,
    detailsUrl: `https://github.com/jdecked/twemoji`,
    sourceUrl: `https://cdn.jsdelivr.net/gh/jdecked/twemoji@latest/assets/svg/${codepoint}.svg`,
    searchString: `${safeTerm} ${sourceLabel}`,
    unsafeResult: false,
    hc: false,
    extension: 'svg',
    source: 'twemoji',
    tier: 1,
    confidence: 0.94,
  };
}

export function getTwemojiMatch(term) {
  const normalized = normalizeKeyword(term);
  if (!normalized) {
    return null;
  }

  const exact = TWEMOJI_MAP.get(normalized);
  if (exact) {
    return makeTwemojiResult(normalized, exact, 'twemoji');
  }

  for (const [keyword, codepoint] of TWEMOJI_MAP.entries()) {
    if (normalized.includes(keyword) || keyword.includes(normalized)) {
      return makeTwemojiResult(keyword, codepoint, 'twemoji');
    }
  }

  return null;
}

export async function getAccessToken(secret) {
  const response = await fetch('https://www.opensymbols.org/api/v2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ secret }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenSymbols token request failed (${response.status}): ${text}`);
  }

  const data = await response.json();

  if (!data?.access_token) {
    throw new Error('OpenSymbols token response did not contain an access_token');
  }

  return data.access_token;
}

const TOKEN_TTL_MS = 5 * 60 * 1000;
let tokenCache = { promise: null, fetchedAt: 0 };

function getCachedToken() {
  const secret = process.env.OPENSYMBOLS_SECRET;
  if (!secret) {
    throw new Error('Missing OPENSYMBOLS_SECRET. Add it to your .env file or environment before calling the API.');
  }

  if (tokenCache.promise && Date.now() - tokenCache.fetchedAt < TOKEN_TTL_MS) {
    return tokenCache.promise;
  }

  const promise = getAccessToken(secret);
  tokenCache = { promise, fetchedAt: Date.now() };
  promise.catch(() => {
    tokenCache = { promise: null, fetchedAt: 0 };
  });
  return promise;
}

function normalizeOpenSymbolItem(item) {
  const repoKey = String(item.repo_key || item.repoKey || 'opensymbols').toLowerCase();
  let source = 'opensymbols';
  let tier = 3;
  if (repoKey.includes('mulberry')) {
    source = 'mulberry';
    tier = 2;
  } else if (repoKey.includes('tawasol')) {
    source = 'tawasol';
    tier = 2;
  } else if (repoKey.includes('arasaac')) {
    source = 'arasaac';
    tier = 4;
  }

  return {
    id: item.id,
    name: item.name,
    locale: item.locale,
    repoKey: item.repo_key ?? item.repoKey,
    license: item.license,
    author: item.author,
    imageUrl: item.image_url ?? item.imageUrl,
    detailsUrl: item.details_url ?? item.detailsUrl,
    sourceUrl: item.source_url ?? item.sourceUrl,
    searchString: item.search_string ?? item.searchString,
    unsafeResult: Boolean(item.unsafe_result ?? item.unsafeResult),
    hc: Boolean(item.hc),
    extension: item.extension,
    source,
    tier,
    confidence: tier === 2 ? 0.82 : 0.68,
  };
}

export async function searchSymbolTerm({ term, locale = 'en', limit = 12, preferredLibraries = [] }) {
  const q = String(term ?? '').trim();
  if (!q) {
    throw new Error('A search term is required');
  }

  const token = await getCachedToken();
  const url = new URL('https://www.opensymbols.org/api/v2/symbols');
  let qValue = q;
  if (preferredLibraries.length > 0) {
    qValue = `${q} ${preferredLibraries.map((library) => `favor:${library}`).join(' ')}`;
  }
  url.searchParams.set('q', qValue);
  url.searchParams.set('locale', locale || 'en');
  url.searchParams.set('safe', '1');
  url.searchParams.set('access_token', token);

  const response = await fetch(url.toString(), {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenSymbols search failed (${response.status}): ${text}`);
  }

  const results = await response.json();
  const matches = Array.isArray(results) ? results : [];
  const selected = matches.slice(0, Math.max(1, Number(limit) || 5)).map(normalizeOpenSymbolItem);

  return {
    q,
    locale: locale || 'en',
    totalResults: matches.length,
    results: selected,
  };
}

async function fetchArasaacFallback(query, locale = 'en', limit = 5) {
  const safeQuery = encodeURIComponent(normalizeKeyword(query) || query);
  const response = await fetch(`https://api.arasaac.org/v1/pictograms/${(locale || 'en').slice(0, 2)}/search/${safeQuery}`);

  if (!response.ok) {
    return [];
  }

  const payload = await response.json();
  const items = Array.isArray(payload) ? payload : [];

  return items.slice(0, limit).map((item) => {
    const pictogramId = item?._id ?? item?.id;
    const imageUrl = pictogramId
      ? `https://static.arasaac.org/pictograms/${pictogramId}/${pictogramId}_300.png`
      : null;

    return {
      id: pictogramId,
      name: item?.keyword || item?.tags?.[0] || 'ARASAAC fallback',
      locale: locale || 'en',
      repoKey: 'arasaac',
      license: 'ARASAAC',
      author: 'ARASAAC',
      imageUrl,
      detailsUrl: imageUrl ? `https://arasaac.org/pictogram/${pictogramId}` : null,
      sourceUrl: imageUrl,
      searchString: String(query),
      unsafeResult: false,
      hc: false,
      extension: 'png',
      source: 'arasaac',
      tier: 4,
      confidence: 0.55,
    };
  }).filter((item) => Boolean(item.imageUrl));
}

function dedupeResults(results) {
  const seen = new Set();
  return results.filter((item) => {
    const key = item.imageUrl || `${item.repoKey ?? 'source'}:${item.name ?? 'name'}`;
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export async function searchOpenSymbolsImages({ query, locale = 'en', limit = 5 }) {
  if (!query || !query.trim()) {
    throw new Error('A search query is required');
  }

  const keywords = extractKeywords(query);
  if (keywords.length === 0) {
    throw new Error('Could not extract useful search keywords from the request. Try a more descriptive phrase.');
  }

  const twemojiResults = keywords
    .map((keyword) => getTwemojiMatch(keyword))
    .filter(Boolean)
    .slice(0, Math.max(1, Number(limit) || 5));

  const professionalSearch = await searchSymbolTerm({
    term: keywords.join(' '),
    locale,
    limit: Math.max(8, Number(limit) || 5),
    preferredLibraries: ['tawasol', 'mulberry'],
  });

  const generalSearch = await searchSymbolTerm({
    term: keywords.join(' '),
    locale,
    limit: Math.max(8, Number(limit) || 5),
  });

  const arasaacFallback = await fetchArasaacFallback(keywords.join(' '), locale, Math.max(3, Number(limit) || 5));

  const merged = dedupeResults([
    ...twemojiResults,
    ...professionalSearch.results,
    ...generalSearch.results,
    ...arasaacFallback,
  ]);

  const finalResults = merged
    .sort((a, b) => {
      const rankA = (a.tier ?? 99) * 10 + (a.confidence ?? 0);
      const rankB = (b.tier ?? 99) * 10 + (b.confidence ?? 0);
      return rankA - rankB;
    })
    .slice(0, Math.max(1, Number(limit) || 5));

  return {
    q: query,
    locale,
    keywords,
    totalResults: finalResults.length,
    results: finalResults,
  };
}
