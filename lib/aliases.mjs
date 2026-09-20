/**
 * Alternate phrasings for a concept, and the one place they are defined.
 *
 * Two consumers, which is why this is its own module rather than a const inside
 * lib/symbol-search.ts:
 *
 *   1. matchConcept retries a concept with these phrasings when the first search
 *      scores badly. That is the original use.
 *   2. scripts/index-symbols.mjs turns them into the Elasticsearch synonym set,
 *      so "all done" finds the "finished" pictogram inside a single query
 *      instead of costing a second round trip.
 *
 * Plain JS with a .d.ts beside it, matching lib/opensymbols.js, so the ingest
 * script can import it without a TypeScript build step.
 */

/**
 * Seed of the canonical concept dictionary: alternate phrasings to retry when a
 * concept scores badly. Deterministic, so it is cacheable rather than guessed at
 * each time.
 * TODO(aliases): grow this as real scenarios expose more failures.
 */
export const ALIASES = {
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

/**
 * British and Irish spellings and words, paired with the American ones ARASAAC
 * mostly labels its pictograms with.
 *
 * lib/generate-folders.ts asks the model for British English, so without these
 * the board asks for "pyjamas" and the index only knows "pajamas". The index
 * analyzer does light plural folding only, not full stemming, so these pairs
 * have to be spelled out rather than stemmed together.
 *
 * Deliberately excluded because the two senses collide badly enough to put the
 * wrong picture on a button:
 *   lift/elevator    - "lift" is also "pick me up"
 *   trousers/pants   - "pants" is underwear in one dialect and trousers in the other
 *   autumn/fall      - "fall" is also falling over, which a child may need to report
 *   queue/line       - "line" carries too many unrelated senses
 *   crisps/chips     - "chips" is the hot-chip sense in British English
 * A caregiver override is the right tool for those, not a synonym.
 */
export const DIALECT_SYNONYMS = [
  ['colour', 'color'],
  ['grey', 'gray'],
  ['pyjamas', 'pajamas'],
  ['nappy', 'diaper'],
  ['lorry', 'truck'],
  ['jumper', 'sweater'],
  ['biscuit', 'cookie'],
  ['sweets', 'candy'],
  ['rubbish', 'trash', 'garbage'],
  ['bin', 'rubbish bin', 'trash can'],
  ['trainers', 'sneakers'],
  ['torch', 'flashlight'],
  ['pram', 'pushchair', 'stroller'],
  ['cot', 'crib'],
  ['holiday', 'vacation'],
  ['tap', 'faucet'],
  ['maths', 'math'],
  ['pavement', 'sidewalk'],
  ['telly', 'television', 'tv'],
  ['loo', 'toilet'],
  ['plaster', 'band aid', 'bandage'],
  ['garden', 'yard'],
  ['crisps', 'potato chips'],
  ['chemist', 'pharmacy'],
  ['post box', 'mailbox', 'postbox'],
  ['football', 'soccer'],
  ['mum', 'mom', 'mummy', 'mommy'],
  ['jug', 'pitcher'],
  ['cooker', 'stove'],
  ['nursery', 'preschool'],

  // Verified gaps: ARASAAC holds the pictogram under the American label and the
  // live search API returns nothing at all for the British phrasing that
  // generate-folders emits. Checked against the catalogue, not guessed.
  //   fizzy drink -> id 4732 "soft drink | soda"
  //   seat belt   -> id 5962 "safety belt | seat belt"
  ['fizzy drink', 'soft drink', 'soda', 'fizzy pop'],
  ['seat belt', 'safety belt', 'seatbelt'],
  ['cuddly toy', 'teddy', 'teddy bear', 'soft toy'],
  //   bedtime -> id 4553 "put to bed | go to bed | go to sleep"
  ['bedtime', 'go to bed', 'time for bed', 'put to bed'],
];

/**
 * Every phrasing equivalent to this term, the term itself first.
 *
 * Looks through both lists and in both directions, so "fizzy drink" finds
 * "soft drink" and "soft drink" finds "fizzy drink". ALIASES is written as
 * canonical-plus-alternates but the relationship is symmetric in practice: a
 * caregiver typing either side means the same picture.
 *
 * Two callers, and the second is the one that matters. matchConcept uses it for
 * retry phrasings, as before. It also uses it when SCORING, because
 * scoreCandidate compares surface strings: without this, retrieval can find the
 * right pictogram under its American or canonical label and the scorer still
 * marks it unreviewable, because "fizzy drink" shares only one token with
 * "soft drink". Finding the right picture and then refusing to trust it is
 * worse than not finding it.
 */
export function phrasingsFor(term) {
  const key = String(term ?? '').toLowerCase().trim();
  if (!key) return [];

  const groups = [
    ...Object.entries(ALIASES).map(([canonical, rest]) => [canonical, ...rest]),
    ...DIALECT_SYNONYMS,
  ];

  const out = [key];
  for (const group of groups) {
    const lower = group.map((t) => String(t).toLowerCase().trim());
    if (!lower.includes(key)) continue;
    for (const phrasing of lower) {
      if (phrasing && !out.includes(phrasing)) out.push(phrasing);
    }
  }
  return out;
}

/**
 * Both sources above, flattened into Solr synonym lines for an Elasticsearch
 * `synonym_graph` filter: one comma-separated equivalence group per line.
 *
 * Equivalence groups rather than explicit mappings, because the relationship
 * runs both ways: a board asking for "all done" wants the "finished" pictogram,
 * and a caregiver typing "finished" into the replace-picture search should still
 * find a pictogram labelled "done".
 */
export function synonymLines() {
  const groups = [
    ...Object.entries(ALIASES).map(([canonical, rest]) => [canonical, ...rest]),
    ...DIALECT_SYNONYMS,
  ];

  const seen = new Set();
  const lines = [];
  for (const group of groups) {
    const terms = [...new Set(group.map((t) => String(t).toLowerCase().trim()).filter(Boolean))];
    if (terms.length < 2) continue;
    const key = [...terms].sort().join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    lines.push(terms.join(', '));
  }
  return lines;
}
