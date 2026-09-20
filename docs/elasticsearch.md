# Elasticsearch symbol search

Implements `docs/elastic-claude-code-brief.md`. Phase A is built; the multimodal
half is built but needs the image pass run before it can be switched on.

## Setup

1. Put your Elastic Cloud values in `.env` (never committed):

   ```
   ELASTIC_NODE=https://<your-deployment>...
   ELASTIC_API_KEY=<key>
   ELASTIC_SERVER_MODE=stack        # serverless only on Elastic Cloud Serverless
   ```

2. Build the index. One request to ARASAAC, ~14k documents, under a minute:

   ```
   npm run symbols:index
   ```

3. Check it actually beats the live API before trusting it:

   ```
   npm run symbols:check
   ```

4. Turn it on, and clear the cache so the board really uses it:

   ```
   SYMBOL_SEARCH=elastic     # in .env
   npm run symbols:clear-cache
   npm run dev
   ```

`npm run symbols:clear-cache` matters more than it looks. `resolveWord` in
`lib/board.ts` reads `word_symbols` before it searches anything, and that cache
does not record which backend filled it. Skip this step and every fixed word
keeps the picture the old path chose, so the demo never touches Elasticsearch.
Pinned pictures and feedback are not cleared.

### Multimodal (Phase B)

```
npm run symbols:images        # ~50 min; resumable, ctrl-c safe
ELASTIC_MULTIMODAL=true       # in .env, only once the above finishes
```

All 13,827 pictograms are embedded. The pass ran at ~1,790/min with
`--batch 10 --concurrency 4`, about 8 minutes end to end.

**`ELASTIC_MULTIMODAL` is deliberately left `false`.** The embeddings exist and
the flag flips instantly, but it should stay off for the board — see the verdict
below.

No PNG is written to disk at any point. Images are fetched from the CDN, encoded,
sent to Elastic for embedding and dropped. Tiles still render the CDN URL.

## Decisions (open questions from §6 of the brief)

| # | Question | Decision |
|---|----------|----------|
| 1 | Corpus scope | ARASAAC English only. One library is what keeps the board looking like one set, which is the rule `lib/arasaac.ts` already exists to protect. |
| 2 | Bulk ingest source | `GET api.arasaac.org/api/pictograms/all/en` — verified: 200, 7.6 MB, 13,827 pictograms with keywords, plurals, tags, categories, schematic and content flags. One unauthenticated request, no paging, no scraping. |
| 3 | What Elastic replaces | Elastic first; legacy runs on any error, on an empty result, or when the flag is `legacy`. **Plus** the existing widen-when-weak rule: if the best Elastic candidate scores below `CONFIDENCE_THRESHOLD`, the OpenSymbols rescue still fires, exactly as on the legacy path (§4 of the brief). Without this the index always has *something* to say, so the rescue could never fire again and uncommon words would silently get worse. |
| 4 | Score mapping | `score/(score+k)`, `k=14`, into `SymbolResult.confidence`. **It does not set `needsReview`** — see below. |
| 5 | Synonyms | Existing `ALIASES`, plus a hand-checked British/Irish set. 46 groups. |
| 6 | Feedback | Query-time SQLite boosts only. `learnedBoosts` is untouched; nothing is written back to Elastic. |
| 7 | `word_symbols` cache | `npm run symbols:clear-cache`. Not automatic — clearing a caregiver's resolved board should be a decision, not a side effect of an env var. |
| 8 | Jina multimodal | Built, all 13,827 images embedded, and **left off**. Measured: it does not help the board. See below. |
| 9 | Credentials | Team-supplied, `.env` only. Deployment is **classic hosted stack 9.5.4**, not serverless, so `ELASTIC_SERVER_MODE=stack`. |
| 10 | Locale | `en`, from `OPENSYMBOLS_LOCALE`. |
| 11 | Licensing | `license` and `author` on every document; ARASAAC CC BY-NC-SA travels with the picture. |
| 12 | British spelling | `minimal_english` stemmer (plural folding only, matching the hand-written `stem()`), never the full `english` stemmer, which mangles `colour`. Dialect pairs no stemmer could connect are carried by synonyms. |

### Why Elastic's score does not decide `needsReview`

`matchConcept` re-scores every candidate with `scoreCandidate` and sorts by it.
`Array.prototype.sort` is stable, so candidates tying on `scoreCandidate` stay in
the order Elastic returned them. Elastic therefore decides **which** pictograms
reach the pool and breaks ties inside it, while `scoreCandidate` stays in charge
of the confidence a caregiver is shown.

The alternative — letting a raw `_score` drive `needsReview` — would have meant
retuning `CONFIDENCE_THRESHOLD` against a number with no fixed meaning, and every
board in the app depends on that threshold. This keeps the swap surgical.

The cost: a pictogram that is visually right but labelled with an unrelated word
still scores near zero and gets buried, so Phase B's multimodal ranking is partly
flattened by the lexical scorer. Letting retrieval score through is a deliberate
follow-up behind its own flag, not something to change quietly.

## Changes to shared scoring

The swap is not purely additive. Three changes were needed in
`lib/symbol-search.ts`, because retrieval improvements were being thrown away
downstream. They improve the legacy path too.

**1. `dedupe` was collapsing keywords — a pre-existing bug.** It keyed on
`imageUrl`, but `lib/arasaac.ts` and the Elastic adapter both emit one result per
keyword of a pictogram, and every keyword shares one image. So a pictogram was
reduced to whichever keyword came first: searching `granny` kept only the
candidate named `grandmother`, scored it 0, and discarded the `granny` keyword
sitting on the same pictogram. `dedupe` now keys on image **and** name; duplicate
pictures are collapsed later by `collapseByImage`, after scoring, keeping the
best keyword. This alone took the board's below-threshold words from 21 to 7.

**2. `scoreCandidate` now treats spacing as meaningless.** If the term and the
symbol name are equal once non-alphanumerics are stripped, it is an exact match.
`paint brush` vs `paintbrush` scored 0 before, because token overlap is empty.

**3. Scoring runs against every equivalent phrasing** (`scoreConcept`). Retrieval
knew `fizzy drink` means `soft drink` because the synonym set told it; the scorer
did not, and sent the correct pictogram to review anyway. Finding the right
picture and then refusing to trust it is worse than not finding it.

## What this actually buys

Measured, not asserted. `npm run symbols:check`, 32 words: **4 better, 28
unchanged, 0 worse.**

| word | ARASAAC live API | Elastic |
|------|------------------|---------|
| `paint brush` | `paint` (0.30) — below threshold | `paintbrush` (1.00) |
| `fizzy drink` | nothing | `soft drink` (1.00) |
| `finished` | `I have finished!` (0.76) | `complete` (1.00) |
| `sore` | `sore throat` (0.88) | `hurt` (1.00) |

On the assembled board, 189 resolved words:

- **185 of 189 tiles now come from ARASAAC** (plus 2 Mulberry, 1 Tawasol, 1
  OpenSymbols). `paint brush` in particular used to be answered by a
  noun-project SVG sitting among pictograms.
- Words below `CONFIDENCE_THRESHOLD` went **21 → 6**, and five of the six
  remaining are conversational phrases (`what is up`, `how about you`,
  `that is funny`) where no single pictogram is the right answer and caregiver
  review is the correct outcome.

The headline is not "more words resolve" — most single words already scored 1.00
on the live API. It is that compound nouns and British-English words stop falling
out of ARASAAC into a visually mismatched library, which is the one thing the
picture-source design exists to prevent.

### Phase B verdict: measured, and left off

`npm run symbols:check --multimodal` runs the real hybrid RRF body against the
same 32 words:

| ranking | better | unchanged | worse |
|---------|--------|-----------|-------|
| lexical (shipping) | **4** | 28 | 0 |
| hybrid RRF | 3 | 29 | 0 |

Hybrid is worse. `sore` falls from `hurt` (1.00) back to `sore throat` (0.88):
RRF gives the vector half equal weight, and that dilutes a strong keyword match.

On descriptive queries it is genuinely better, which is exactly the split the
brief predicted:

| query | lexical | hybrid |
|-------|---------|--------|
| `a place to sit down` | sit, place, place | **be seated, sit down on bench** |
| `something to drink out of` | drink, drink, drink | soft drink, drink |
| `a person who is upset` | who, who, who | cheeky person, who |

But it does **not** rescue the board's actual failures. On the remaining weak
phrases it adds noise rather than sense — `why not` returns `dislike`,
`not much` returns `T`, `what is up` returns `up button`.

So: the board only ever searches named AAC vocabulary, which is where lexical
wins, and multimodal stays off. The embeddings are not wasted — they make a
strong live demo (`a place to sit down` is a compelling thing to type in front
of a judge), and `elasticSearchSymbols` takes a per-call `multimodal` override
so the caregiver's free-text picture search could opt in without touching the
board path. That routing is a deliberate follow-up, not something to switch on
globally: **the flag as it stands is all-or-nothing, and all is worse.**

### Verified failure behaviour

With a deliberately broken index name, the app logs
`elastic failed for "..." , using libraries` and serves OpenSymbols results at
96. The board stays populated. Tested, not assumed.

## Files

| Piece | Location |
|-------|----------|
| Client + search adapter | `lib/elastic-symbols.ts` |
| Query, shared by app and check script | `lib/symbol-query.mjs` (+ `.d.mts`) |
| Shared aliases and synonyms | `lib/aliases.mjs` (+ `.d.mts`) |
| Flag wiring | `searchOnce` in `lib/symbol-search.ts` |
| Ingest, both passes | `scripts/index-symbols.mjs` |
| Before/after comparison | `scripts/check-symbols.mjs` |
| Cache bust | `scripts/clear-word-cache.mjs` |

Untouched: `generateFolders`, board assembly, overrides, feedback, `PictureSheet`,
and every API route. `lib/symbol-search.ts` is modified — see **Changes to shared
scoring** above; those changes affect the legacy path as well, and improve it.

The query lives in `lib/symbol-query.mjs` rather than inside the adapter so
`check-symbols.mjs` runs the *real* query. A comparison script executing a
near-copy proves nothing about what ships, and the first version had already
drifted.
