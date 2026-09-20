/**
 * Elastic against the live ARASAAC API, same words, same scorer, side by side.
 *
 * This is the before-and-after. It answers the only question that matters about
 * the swap - did the pictures get better or just different - and it is the thing
 * to run in front of a judge, because it shows the ranking change on real AAC
 * vocabulary rather than asserting it.
 *
 * Usage:
 *   npm run symbols:check
 *   node scripts/check-symbols.mjs "paint brush" "fizzy drink"
 *
 * WHAT THE LEFT COLUMN IS: the live ARASAAC search API alone, not the whole
 * legacy path. The app also rescues a weak ARASAAC result through OpenSymbols,
 * so a word scoring badly here is not necessarily broken on the board today -
 * it is a word the board currently answers with a Mulberry or noun-project
 * drawing sitting among ARASAAC pictograms. Retrieval over the same ARASAAC
 * corpus is the like-for-like comparison, and closing that gap is what buys back
 * the visual consistency lib/arasaac.ts exists to protect.
 *
 * Scoring is a copy of scoreCandidate from lib/symbol-search.ts, the same way
 * scripts/probe-arasaac.mjs carries one, so the script stays a plain node file
 * with no TypeScript build step. Both paths are scored identically, so even if
 * the copy drifts the comparison stays fair.
 */

import 'dotenv/config';
import { Client } from '@elastic/elasticsearch';
import { searchBody, compactTerm } from '../lib/symbol-query.mjs';
import { phrasingsFor } from '../lib/aliases.mjs';

const NODE = process.env.ELASTIC_NODE;
const API_KEY = process.env.ELASTIC_API_KEY;
const INDEX = process.env.ELASTIC_SYMBOL_INDEX || 'talkalotta-symbols';
const LOCALE = (process.env.OPENSYMBOLS_LOCALE || 'en').slice(0, 2);
const THRESHOLD = 0.55;

/**
 * Words chosen to expose the failure modes, not to flatter the index:
 * compound nouns the legacy path splits, concepts whose ARASAAC label is a
 * different word entirely, and British terms generate-folders actually emits.
 */
const DEFAULT_WORDS = [
  'paint brush', 'teddy bear', 'fizzy drink', 'wheelchair', 'seat belt',
  'toilet', 'finished', 'sore', 'thirsty', 'hungry',
  'mum', 'dad', 'teacher', 'friend',
  'swings', 'pencils', 'sandwich', 'television', 'coat', 'story',
  'pyjamas', 'colour', 'nappy', 'lorry', 'plaster',
  'help', 'more', 'want', 'stop', 'happy', 'sad', 'tired',
];

const args = process.argv.slice(2);

/**
 * --multimodal replaces the Elastic column with the hybrid RRF query, so the
 * question "does the picture half actually help?" gets an answer rather than an
 * opinion. Needs the image pass to have run.
 */
const multimodal = args.includes('--multimodal');
const words = args.filter((a) => !a.startsWith('--')).length
  ? args.filter((a) => !a.startsWith('--'))
  : DEFAULT_WORDS;

const norm = (s) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

function stem(token) {
  if (token.length > 4 && token.endsWith('ies')) return `${token.slice(0, -3)}y`;
  if (token.length > 4 && (token.endsWith('ches') || token.endsWith('shes') || token.endsWith('sses')))
    return token.slice(0, -2);
  if (token.length > 3 && token.endsWith('s') && !token.endsWith('ss')) return token.slice(0, -1);
  return token;
}

const tokenize = (v) => norm(v).split(' ').filter(Boolean).map(stem);

function scoreCandidate(term, name, trust = 1.0) {
  const wanted = tokenize(term);
  const got = tokenize(name);
  if (!wanted.length || !got.length) return 0;

  // Spacing is not a difference in meaning. Mirrors lib/symbol-search.ts.
  if (compactTerm(term) === compactTerm(name)) {
    return Math.max(0, Math.min(1, 0.8 + 0.2 * trust));
  }

  const wantedSet = new Set(wanted);
  const gotSet = new Set(got);
  const hits = wanted.filter((t) => gotSet.has(t)).length;

  let score = hits / wanted.length;
  if (got.join(' ') === wanted.join(' ')) score = 1;
  else if (score === 1 && got.length > wanted.length)
    score -= Math.min(0.25, 0.08 * (got.length - wanted.length));

  if (hits < wanted.length) score -= 0.2 * (wanted.length - hits);

  const noise = got.filter((t) => !wantedSet.has(t)).length;
  score -= Math.min(0.15, 0.04 * noise);
  score = score * (0.8 + 0.2 * trust);

  return Math.max(0, Math.min(1, score));
}

/** Best keyword of any returned pictogram, scored exactly as the app would. */
function best(term, candidates) {
  const phrasings = phrasingsFor(term);
  let top = { score: 0, name: null, id: null };
  for (const c of candidates) {
    for (const name of c.names) {
      // Max over equivalent phrasings, mirroring scoreConcept in the app.
      let score = 0;
      for (const phrasing of phrasings) {
        score = Math.max(score, scoreCandidate(phrasing, name));
        if (score >= 1) break;
      }
      if (score > top.score) top = { score, name, id: c.id };
    }
  }
  return top;
}

async function legacy(term) {
  const url = `https://api.arasaac.org/api/pictograms/${LOCALE}/search/${encodeURIComponent(term)}`;
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return [];
    const payload = await res.json();
    if (!Array.isArray(payload)) return [];
    return payload.slice(0, 12).map((hit) => ({
      id: hit._id ?? hit.id,
      names: (hit.keywords ?? []).map((k) => (k.keyword ?? '').trim()).filter(Boolean),
    }));
  } catch {
    return [];
  }
}

let client = null;
if (NODE && API_KEY) {
  client = new Client({
    node: NODE,
    auth: { apiKey: API_KEY },
    serverMode: (process.env.ELASTIC_SERVER_MODE || 'serverless') === 'stack' ? 'stack' : 'serverless',
    requestTimeout: 15000,
  });
}

async function elastic(term) {
  if (!client) return [];

  // The real query, imported, not a copy of it. A comparison run against a
  // near-copy would measure something the app never executes.
  const res = await client.search({
    index: INDEX,
    _source: ['symbol_id', 'name', 'keywords'],
    ...searchBody(term, { size: 12, multimodal }),
  });

  return res.hits.hits.map((h) => ({
    id: h._source.symbol_id,
    names: [h._source.name, ...(h._source.keywords ?? [])].filter(Boolean),
  }));
}

const pad = (s, n) => String(s ?? '').padEnd(n).slice(0, n);
const show = (r) => (r.name ? `${r.name} (${r.score.toFixed(2)})` : 'nothing');

/**
 * With no Elastic configured this is a baseline run, not a comparison. Printing
 * a verdict column against an index that does not exist would score every word
 * as a regression, which is noise dressed up as a result.
 */
if (!client) {
  console.log('No ELASTIC_NODE / ELASTIC_API_KEY in .env.');
  console.log('Running as a LEGACY BASELINE. Re-run once the index is built to compare.\n');
  console.log(`${pad('word', 16)}${pad("ARASAAC live API", 26)}needs review?`);
  console.log('-'.repeat(60));

  let weak = 0;
  for (const term of words) {
    const a = best(term, await legacy(term));
    const review = a.score < THRESHOLD;
    if (review) weak++;
    console.log(`${pad(term, 16)}${pad(show(a), 26)}${review ? 'yes' : ''}`);
  }

  console.log('-'.repeat(60));
  console.log(`${weak} of ${words.length} words fall below the ${THRESHOLD} threshold today.`);
  process.exit(0);
}

console.log(
  `${pad('word', 16)}${pad('ARASAAC live API', 26)}${pad(multimodal ? 'elastic hybrid' : 'elastic', 26)}  verdict`,
);
console.log('-'.repeat(84));

const tally = { better: 0, same: 0, worse: 0, reviewFixed: 0, reviewBroken: 0 };

for (const term of words) {
  const [legacyHits, elasticHits] = await Promise.all([legacy(term), elastic(term)]);
  const a = best(term, legacyHits);
  const b = best(term, elasticHits);

  const delta = b.score - a.score;
  let verdict = 'same';
  if (delta > 0.02) { verdict = 'better'; tally.better++; }
  else if (delta < -0.02) { verdict = 'worse'; tally.worse++; }
  else tally.same++;

  // The number that actually changes what a caregiver sees: whether the word
  // lands on the board or lands in the review queue.
  const wasReview = a.score < THRESHOLD;
  const isReview = b.score < THRESHOLD;
  if (wasReview && !isReview) { verdict += ' *accepted'; tally.reviewFixed++; }
  if (!wasReview && isReview) { verdict += ' !now review'; tally.reviewBroken++; }

  console.log(`${pad(term, 16)}${pad(show(a), 26)}${pad(show(b), 26)}  ${verdict}`);
}

console.log('-'.repeat(84));
console.log(
  `${tally.better} better, ${tally.same} unchanged, ${tally.worse} worse ` +
    `across ${words.length} words`,
);
console.log(
  `review queue: ${tally.reviewFixed} words no longer need a caregiver, ` +
    `${tally.reviewBroken} newly do`,
);
