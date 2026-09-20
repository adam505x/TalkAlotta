/**
 * Builds the Elasticsearch pictogram index.
 *
 * Two passes, on purpose, because they have wildly different costs:
 *
 *   metadata  one HTTP request to ARASAAC, ~14k documents, under a minute.
 *             This is all Phase A needs and all a working board needs.
 *   images    downloads every pictogram PNG, base64s it and lets Elastic embed
 *             it through the Jina multimodal inference endpoint. Hours, not
 *             minutes, and it is resumable precisely because of that.
 *
 * Metadata only, which is what a board needs:
 *   npm run symbols:index
 *
 * Then, for the multimodal half, resumable and safe to stop with ctrl-c:
 *   npm run symbols:images
 *
 * Useful flags:
 *   --recreate       delete and rebuild the index from scratch
 *   --limit N        stop after N documents (a quick smoke test)
 *   --batch N        documents per bulk request
 *   --concurrency N  parallel image batches
 *
 * No PNG is ever written to disk. Images are fetched, encoded, sent to Elastic
 * and dropped; what the index stores is an embedding, and what the board renders
 * is still the ARASAAC CDN URL.
 */

import 'dotenv/config';
import { Client } from '@elastic/elasticsearch';
import { synonymLines } from '../lib/aliases.mjs';
import { compactTerm } from '../lib/symbol-query.mjs';

const NODE = process.env.ELASTIC_NODE;
const API_KEY = process.env.ELASTIC_API_KEY;
const INDEX = process.env.ELASTIC_SYMBOL_INDEX || 'talkalotta-symbols';
const INFERENCE_ID = process.env.ELASTIC_INFERENCE_ID || '.jina-embeddings-v5-omni-small';
const LOCALE = (process.env.OPENSYMBOLS_LOCALE || 'en').slice(0, 2);

/**
 * Mirrors SOURCE_TRUST.arasaac in lib/symbol-search.ts. Written onto every
 * document so the function_score in lib/elastic-symbols.ts can apply the same
 * preference at retrieval time. One number because v1 indexes one library; a
 * second library means reading the real table from shared code.
 */
const SOURCE_TRUST_ARASAAC = 1.0;

const ARASAAC_ALL = (locale) => `https://api.arasaac.org/api/pictograms/all/${locale}`;
const ARASAAC_IMAGE = (id) => `https://static.arasaac.org/pictograms/${id}/${id}_300.png`;

const argv = process.argv.slice(2);
const has = (flag) => argv.includes(flag);
const value = (flag, fallback) => {
  const i = argv.indexOf(flag);
  if (i === -1 || i === argv.length - 1) return fallback;
  const n = Number(argv[i + 1]);
  return Number.isFinite(n) ? n : fallback;
};

const doImages = has('--images');
const recreate = has('--recreate');
const limit = value('--limit', Infinity);
const batchSize = value('--batch', doImages ? 8 : 500);
const concurrency = value('--concurrency', 3);

if (!NODE || !API_KEY) {
  console.error('ELASTIC_NODE and ELASTIC_API_KEY must be set in .env');
  console.error('Copy them from your Elastic Cloud deployment. See .env.example.');
  process.exit(1);
}

const client = new Client({
  node: NODE,
  auth: { apiKey: API_KEY },
  serverMode: (process.env.ELASTIC_SERVER_MODE || 'serverless') === 'stack' ? 'stack' : 'serverless',
  // Inference on a batch of images is slow by nature. This is an offline script,
  // so it can afford to wait where the app cannot.
  requestTimeout: doImages ? 300000 : 60000,
  maxRetries: 0,
});

/**
 * The analysis chain, and the two decisions inside it that matter.
 *
 * Synonyms at SEARCH time only. Multi-word entries like "all done" need a graph
 * filter, which cannot run at index time, and search-time application means
 * editing lib/aliases.mjs takes effect on restart instead of costing a reindex
 * of 14k documents.
 *
 * minimal_english rather than the usual english stemmer. The full stemmer folds
 * far too hard for a picture library: it would collapse distinct concepts onto
 * each other, and it mangles the British spellings lib/generate-folders.ts asks
 * for. minimal_english does plural folding and stops, which is exactly what the
 * hand-written stem() in lib/symbol-search.ts already does. Dialect pairs that
 * no stemmer could connect - colour/color, pyjamas/pajamas - are carried by the
 * synonym list instead.
 */
function settings() {
  return {
    analysis: {
      filter: {
        aac_synonyms: { type: 'synonym_graph', synonyms: synonymLines() },
        aac_stemmer: { type: 'stemmer', language: 'minimal_english' },
      },
      analyzer: {
        aac_index: { type: 'custom', tokenizer: 'standard', filter: ['lowercase', 'aac_stemmer'] },
        aac_search: {
          type: 'custom',
          tokenizer: 'standard',
          filter: ['lowercase', 'aac_synonyms', 'aac_stemmer'],
        },
      },
    },
  };
}

const textField = () => ({
  type: 'text',
  analyzer: 'aac_index',
  search_analyzer: 'aac_search',
});

function mappings(semanticType) {
  return {
    properties: {
      symbol_id: { type: 'keyword' },
      source: { type: 'keyword' },
      locale: { type: 'keyword' },

      // exact subfield: an unanalysed copy, so a future exact-label lookup does
      // not have to fight the analyzer.
      name: { ...textField(), fields: { exact: { type: 'keyword', normalizer: 'lowercase' } } },
      keywords: textField(),
      search_text: textField(),
      tags: textField(),
      categories: textField(),

      // Every keyword with spaces and punctuation stripped out. This is what
      // connects the board asking for "paint brush" to ARASAAC keywording it
      // "paintbrush" as one token - no analyzer chain bridges two tokens to one,
      // and a keyword field of stripped forms does it exactly and cheaply.
      compact: { type: 'keyword', normalizer: 'lowercase' },

      // Never queried, only returned. index:false keeps them out of the
      // inverted index so a URL fragment cannot accidentally match a word.
      image_url: { type: 'keyword', index: false },
      details_url: { type: 'keyword', index: false },
      license: { type: 'keyword', index: false },
      author: { type: 'keyword', index: false },

      schematic: { type: 'boolean' },
      unsafe: { type: 'boolean' },
      source_trust: { type: 'float' },

      // Drives the resumable image pass. A plain boolean rather than a progress
      // file, so stopping the script and starting it on another machine picks up
      // exactly where it left off.
      visual_indexed: { type: 'boolean' },

      ...(semanticType
        ? { visual: { type: semanticType, inference_id: INFERENCE_ID } }
        : {}),
    },
  };
}

/**
 * Creates the index, working out what the semantic field type is called here.
 *
 * Elastic renamed semantic_text to semantic, and which one a given deployment
 * accepts depends on its version. Rather than pin a guess, try the newer name,
 * fall back to the older one, and fall back again to a plain lexical index so
 * that a deployment with no inference available still gets a working Phase A.
 */
async function ensureIndex() {
  const exists = await client.indices.exists({ index: INDEX });

  if (exists && recreate) {
    console.log(`Deleting existing index ${INDEX} ...`);
    await client.indices.delete({ index: INDEX });
  } else if (exists) {
    console.log(`Index ${INDEX} already exists. Use --recreate to rebuild it.`);
    return;
  }

  const candidates = [
    process.env.ELASTIC_SEMANTIC_TYPE,
    'semantic',
    'semantic_text',
    null,
  ].filter((t, i, a) => t !== undefined && a.indexOf(t) === i);

  for (const semanticType of candidates) {
    try {
      await client.indices.create({
        index: INDEX,
        settings: settings(),
        mappings: mappings(semanticType),
      });
      if (semanticType) {
        console.log(`Created ${INDEX} with a "${semanticType}" field on ${INFERENCE_ID}.`);
      } else {
        console.log(`Created ${INDEX} WITHOUT a semantic field.`);
        console.log('  Lexical search will work. Multimodal will not. Check ELASTIC_INFERENCE_ID.');
      }
      return;
    } catch (error) {
      const message = error?.message || String(error);
      const lastAttempt = semanticType === candidates[candidates.length - 1];
      if (lastAttempt) throw error;
      console.log(`  "${semanticType}" field type rejected (${message.slice(0, 120)}), trying next`);
    }
  }
}

/** ARASAAC's whole English catalogue in one request. No scraping, no paging. */
async function fetchCatalogue() {
  const url = ARASAAC_ALL(LOCALE);
  process.stdout.write(`Fetching ${url} ... `);
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`ARASAAC returned ${res.status}`);
  const payload = await res.json();
  if (!Array.isArray(payload)) throw new Error('ARASAAC did not return an array');
  console.log(`${payload.length} pictograms`);
  return payload;
}

const clean = (v) => String(v ?? '').trim();

/**
 * One ARASAAC record into one document.
 *
 * keywords carries the singular forms only. Those become candidate names in
 * lib/elastic-symbols.ts, and a plural sitting beside its singular would just
 * put two near-identical candidates in front of the caregiver. Plurals still go
 * into search_text so "swings" matches, which is the only thing they are for.
 */
function toDocument(hit) {
  const id = hit._id ?? hit.id;
  if (id == null) return null;

  const entries = Array.isArray(hit.keywords) ? hit.keywords : [];
  const keywords = [...new Set(entries.map((k) => clean(k.keyword)).filter(Boolean))];
  if (keywords.length === 0) return null;

  const plurals = [...new Set(entries.map((k) => clean(k.plural)).filter(Boolean))];
  const tags = [...new Set((hit.tags ?? []).map(clean).filter(Boolean))];
  const categories = [...new Set((hit.categories ?? []).map(clean).filter(Boolean))];

  const searchText = [...new Set([...keywords, ...plurals, ...tags, ...categories])]
    .join(' ')
    .toLowerCase();

  // Plurals included, so "paint brushes" reaches "paintbrushes" too.
  const compact = [
    ...new Set([...keywords, ...plurals].map(compactTerm).filter((c) => c.length > 2)),
  ];

  return {
    symbol_id: String(id),
    source: 'arasaac',
    locale: LOCALE,
    name: keywords[0],
    keywords,
    tags,
    categories,
    search_text: searchText,
    compact,
    image_url: ARASAAC_IMAGE(id),
    details_url: `https://arasaac.org/pictograms/${id}`,
    // Attribution travels with the document so a tile can always credit the
    // source. ARASAAC pictograms are CC BY-NC-SA and the licence has to be
    // displayable wherever the picture ends up.
    license: 'CC BY-NC-SA',
    author: 'ARASAAC / Gobierno de Aragon',
    schematic: Boolean(hit.schematic),
    // ARASAAC's own content flags. Indexed and surfaced rather than filtered
    // out: a pictogram tagged violence covers things like "hit", which a child
    // may genuinely need to say. scoreCandidate already penalises these hard,
    // so flagging beats deleting.
    unsafe: Boolean(hit.sex) || Boolean(hit.violence),
    source_trust: SOURCE_TRUST_ARASAAC,
    visual_indexed: false,
  };
}

async function bulkOrThrow(operations, refresh = false) {
  const res = await client.bulk({ operations, refresh });
  if (!res.errors) return;
  const failed = res.items.filter((i) => (i.index ?? i.update)?.error);
  const first = (failed[0]?.index ?? failed[0]?.update)?.error;
  throw new Error(`${failed.length} of ${res.items.length} failed. First: ${JSON.stringify(first)}`);
}

async function indexMetadata() {
  const catalogue = await fetchCatalogue();
  const docs = catalogue.map(toDocument).filter(Boolean).slice(0, limit);

  console.log(`Indexing ${docs.length} documents into ${INDEX} ...`);
  let done = 0;

  for (let i = 0; i < docs.length; i += batchSize) {
    const slice = docs.slice(i, i + batchSize);
    const operations = slice.flatMap((doc) => [
      { index: { _index: INDEX, _id: doc.symbol_id } },
      doc,
    ]);
    await bulkOrThrow(operations);
    done += slice.length;
    process.stdout.write(`\r  ${done}/${docs.length}`);
  }

  await client.indices.refresh({ index: INDEX });
  const count = await client.count({ index: INDEX });
  console.log(`\nDone. ${count.count} documents in ${INDEX}.`);
  console.log('\nNext:');
  console.log('  npm run symbols:check    compare Elastic against the live ARASAAC path');
  console.log('  npm run symbols:images   add multimodal embeddings (long, resumable)');
}

/** Pictogram PNG straight into the base64 data URL the inference endpoint wants. */
async function imagePayload(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`image ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  return {
    type: 'image',
    format: 'base64',
    value: `data:image/png;base64,${buffer.toString('base64')}`,
  };
}

async function embedBatch(docs) {
  const operations = [];

  const payloads = await Promise.all(
    docs.map(async (doc) => {
      try {
        return { doc, visual: await imagePayload(doc.image_url) };
      } catch {
        // A pictogram whose PNG has gone missing should not stall the run.
        // Mark it done so the loop moves past it; it keeps its lexical entry.
        return { doc, visual: null };
      }
    }),
  );

  for (const { doc, visual } of payloads) {
    operations.push({ update: { _index: INDEX, _id: doc.symbol_id } });
    operations.push({
      doc: visual ? { visual, visual_indexed: true } : { visual_indexed: true },
    });
  }

  await bulkOrThrow(operations, true);
  return payloads.filter((p) => p.visual).length;
}

/**
 * The image pass.
 *
 * Driven off visual_indexed rather than a cursor, so it is genuinely resumable:
 * every batch that lands flips its own documents, and the next query simply asks
 * for whatever is still false. Ctrl-c costs at most one batch.
 */
async function indexImages() {
  const total = await client.count({
    index: INDEX,
    query: { term: { visual_indexed: false } },
  });

  if (total.count === 0) {
    console.log('Every document already has an embedding. Nothing to do.');
    return;
  }

  console.log(`${total.count} pictograms still need an embedding.`);
  console.log(`Batches of ${batchSize}, ${concurrency} in parallel. Safe to stop with ctrl-c.\n`);

  const started = Date.now();
  let embedded = 0;
  let processed = 0;
  const cap = Math.min(total.count, limit);

  while (processed < cap) {
    const res = await client.search({
      index: INDEX,
      query: { term: { visual_indexed: false } },
      _source: ['symbol_id', 'image_url'],
      size: Math.min(batchSize * concurrency, cap - processed),
    });

    const docs = res.hits.hits.map((h) => h._source).filter((d) => d?.image_url);
    if (docs.length === 0) break;

    const batches = [];
    for (let i = 0; i < docs.length; i += batchSize) {
      batches.push(docs.slice(i, i + batchSize));
    }

    try {
      const counts = await Promise.all(batches.map(embedBatch));
      embedded += counts.reduce((a, b) => a + b, 0);
    } catch (error) {
      const message = error?.message || String(error);
      // 429 and inference timeouts are expected on a trial. Back off rather
      // than abandon hours of completed work.
      console.log(`\n  batch failed (${message.slice(0, 140)})`);
      console.log('  backing off 30s ...');
      await new Promise((r) => setTimeout(r, 30000));
      continue;
    }

    processed += docs.length;
    const mins = (Date.now() - started) / 60000;
    const rate = processed / Math.max(mins, 0.01);
    const left = Math.max(0, cap - processed);
    process.stdout.write(
      `\r  ${processed}/${cap} embedded (${rate.toFixed(0)}/min, ~${(left / Math.max(rate, 1)).toFixed(0)} min left)   `,
    );
  }

  console.log(`\nDone. ${embedded} embeddings written.`);
  console.log('Turn it on with ELASTIC_MULTIMODAL=true in .env, then restart the server.');
}

try {
  await ensureIndex();
  if (doImages) {
    await indexImages();
  } else {
    await indexMetadata();
  }
} catch (error) {
  console.error('\nFailed:', error?.message || error);
  if (error?.meta?.body) console.error(JSON.stringify(error.meta.body).slice(0, 600));
  process.exit(1);
}
