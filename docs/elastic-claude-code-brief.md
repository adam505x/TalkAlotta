# Claude Code brief: Elasticsearch symbol search for TalkAlotta

You are implementing Elasticsearch for **TalkAlotta**, an AAC (augmentative & alternative communication) app. This brief is the full context from prior planning. Follow it; do not redesign the product around Elastic.

**Branch:** `feat/elasticsearch-symbol-search`  
**Sponsor challenge:** Elastic “Find the Signal” — turn messy data into insights/answers/actions.  
**Effort target:** medium. Surgical ranking-layer swap, not a rewrite.

---

## 1. What TalkAlotta is

Picture-symbol communication board for people who speak with pictograms. Caregivers set up a profile; the board shows:

- A **fixed core strip** (yes/no/want/more/etc.)
- **Four folders** (people / doing / things / describing) whose *contents* change by context

Pictures come from open symbol libraries. Speech is TTS. Ranking/personalization is ordinary code, not more LLM calls.

---

## 2. Current architecture (as of this branch)

### Live word → picture path (PRIMARY)

```
MomentContext (time, place, weather, optional situation string)
  → generateFolders (lib/generate-folders.ts) — Anthropic fills 4 folder word lists
  → resolveWord (lib/board.ts) per term
       → symbol_overrides (SQLite) always wins
       → word_symbols cache (SQLite) if present
       → else matchConcept (lib/symbol-search.ts)
            → overrideFor / ALIASES / learnedBoosts
            → searchOnce  ← THIS IS THE SWAP TARGET
                 1. searchArasaac (lib/arasaac.ts) — PRIMARY library
                 2. if best score < 0.55 → OpenSymbols rescue
                    (favor mulberry/tawasol + general searchSymbolTerm)
                 3. scoreCandidate + SOURCE_TRUST
            → needsReview if score < CONFIDENCE_THRESHOLD (0.55)
  → assembleMainBoard → GET /api/boards
```

### Also calls `matchConcept`

- `GET /api/symbols` — caregiver replace-picture UI (`PictureSheet`)
- Fixed board terms via `resolveWord` when not cached

### Deleted / not the hot path anymore

- `lib/interpret.ts` and `app/api/scenario/route.ts` are **gone**
- Situation UX (`ScenarioSheet`) only sets a `situation` query param and refills folders via `generateFolders` — it does **not** call a scenario→concepts→review API

### Libraries

| Role | Library | How |
|------|---------|-----|
| **Primary** | ARASAAC | `lib/arasaac.ts` → `api.arasaac.org` search; images on `static.arasaac.org/..._300.png` |
| **Fallback** | OpenSymbols → Mulberry / Tawasol / general | `lib/opensymbols.js` `searchSymbolTerm` when ARASAAC confidence &lt; 0.55 |

**Do not download/host the PNG library.** Keep CDN image URLs. Index **metadata** (and optionally embeddings later).

### Local learning (keep in SQLite)

- `symbol_overrides` — caregiver pinned picture; always wins
- `symbol_feedback` — accepted / rejected / replaced; boosts in `learnedBoosts`
- `word_symbols` — resolved cache (Elastic only runs on cache miss)

### Env today (`.env.example`)

`ANTHROPIC_*`, `OPENSYMBOLS_*`, `ELEVENLABS_*`, `DATABASE_FILE`  
No Elastic vars yet.

### Deps

No `@elastic/elasticsearch` yet. Next.js app, better-sqlite3, Drizzle.

---

## 3. Why Elastic (pitch + product)

**Messy data:** multi-library labels, aliases, tags, caregiver accept/reject history, schematic pictograms.  
**Signal:** the right pictogram for a concrete AAC concept.  
**Action:** tile on board → TTS utterance.

Sponsor-facing story is ranking quality + adaptive signals — not “we stored PNGs in Elastic.”

---

## 4. Agreed implementation plan

### Principles

1. **Surgical swap:** replace body of `searchOnce` (or an adapter it calls). Do **not** rewrite `generateFolders`, board assembly, overrides, or APIs.
2. **Metadata-first index.** ARASAAC (+ optional Mulberry) docs with `image_url` pointing at CDN.
3. **Feature flag:** e.g. `SYMBOL_SEARCH=elastic|legacy` (default `legacy` until index is ready).
4. **Fallback:** if Elastic is misconfigured/down, fall back to current ARASAAC/OpenSymbols path so demos don’t die.
5. **Keep product rules:** ARASAAC preferred for visual consistency; overrides always win; `CONFIDENCE_THRESHOLD` / `needsReview` still work (normalize Elastic `_score` → ~0–1).

### Document shape (suggested)

```json
{
  "symbol_id": "1234",
  "source": "arasaac",
  "locale": "en",
  "name": "paint brush",
  "keywords": ["paint brush", "brush", "paintbrush"],
  "tags": ["art", "school"],
  "search_text": "paint brush brush paintbrush art school",
  "image_url": "https://static.arasaac.org/pictograms/1234/1234_300.png",
  "license": "CC BY-NC-SA",
  "schematic": true,
  "source_trust": 1.0,
  "accepted_count": 0,
  "rejected_count": 0
}
```

Mirror `searchArasaac` behavior: one pictogram can contribute multiple keyword-oriented searchable fields (don’t collapse to a single weak name).

### Query stack (phased)

**Phase A (ship this — medium effort)**

- BM25 `multi_match` on `name^4`, `keywords^3`, `search_text^2`, `tags`
- Synonym filter from existing `ALIASES` in `lib/symbol-search.ts`
- `function_score` for `source_trust` (+ optional schematic boost)
- Optional: fold `accepted_count` / `rejected_count` from feedback
- Prefer ARASAAC via boost/filter; widen sources if top score weak (same policy as today)

**Phase B (stretch — Elastic person suggested this)**

- They said “Gina/genome”; they meant **Jina** multimodal embeddings (`jina-embeddings-v5-omni-*` via Elastic Inference / `semantic` field)
- Embed pictogram images at ingest; text query (“happy”) → cosine/knn similar icons
- Combine with lexical via hybrid/RRF — do **not** replace keyword search with vectors only
- AAC caveat: schematic line art + strong ARASAAC keywords often beat pure visual similarity for named concepts; multimodal helps fuzzy/visual cases and the sponsor demo

**Phase C (polish)**

- `msearch` for parallel folder terms on board load
- Sync feedback counts into Elastic on accept/reject
- Script to clear/warm `word_symbols` when flipping the flag so demos actually hit Elastic

### Suggested file layout

| Piece | Location |
|-------|----------|
| Client + search adapter | `lib/elastic-symbols.ts` (or similar) |
| Ingest script | `scripts/index-symbols.mjs` (or `.ts`) |
| Flag wiring | `searchOnce` in `lib/symbol-search.ts` |
| Env | `.env.example`: `ELASTIC_NODE` / `ELASTIC_API_KEY` / `SYMBOL_SEARCH` / index name |
| Dep | `@elastic/elasticsearch` — use `serverMode: 'serverless'` if on Elastic Cloud Serverless |

### What NOT to do

- Do not bulk-download tens of thousands of PNGs into the repo
- Do not put Elastic behind `generateFolders` or replace Claude
- Do not remove OpenSymbols client until Elastic path is proven (keep as legacy fallback)
- Do not break override / feedback / PictureSheet flows
- Do not commit secrets (`.env`)

### Infra note

Elastic Cloud **Serverless** 14-day trial is the intended hackathon path. Local Docker Elastic is fine for offline work.

---

## 5. Key code references

- `lib/symbol-search.ts` — `searchOnce`, `matchConcept`, `scoreCandidate`, `ALIASES`, `SOURCE_TRUST`, `CONFIDENCE_THRESHOLD`, `learnedBoosts`, `recordFeedback`
- `lib/arasaac.ts` — `searchArasaac`, CDN URL helper
- `lib/opensymbols.js` — `searchSymbolTerm`
- `lib/board.ts` — `resolveWord`, `assembleMainBoard`
- `lib/generate-folders.ts` — AI folder words (upstream of search)
- `lib/db/schema.ts` — `symbolOverrides`, `symbolFeedback`, `wordSymbols`
- `app/api/symbols/route.ts`, `override`, `upload`, `boards`, `folders`
- Types: `lib/opensymbols.d.ts` → `SymbolResult` (adapter must return this shape)

Adapter contract: return `SymbolResult[]` so `matchConcept` stays unchanged.

---

## 6. Open questions (resolve before or during implementation)

Answer these explicitly in code comments / PR notes when you choose:

1. **Corpus v1 scope:** ARASAAC English only, or ARASAAC + Mulberry from day one?
2. **Bulk ingest source:** Which ARASAAC API/export path for “all pictograms + keywords”? (Live search API alone is not enough for a full index.) Confirm a reliable bulk metadata fetch; do not scrape HTML.
3. **Elastic replaces what?**  
   - (A) Replace ARASAAC+OpenSymbols entirely inside `searchOnce`, or  
   - (B) Replace only ARASAAC retrieval and keep OpenSymbols as secondary rescue, or  
   - (C) Elastic first, legacy APIs only if Elastic errors?
4. **Score mapping:** How to map unbounded BM25 `_score` into 0–1 for `CONFIDENCE_THRESHOLD` / `needsReview`? (sigmoid, max-normalization within hit set, scripted score, etc.)
5. **Synonyms:** Port only existing `ALIASES`, or expand with a larger AAC synonym list?
6. **Feedback in Elastic:** Query-time boost from SQLite only (simpler), or update doc `accepted_count`/`rejected_count` in Elastic on each feedback write?
7. **`word_symbols` cache:** On enabling Elastic, clear all? clear nothing? provide `npm run` script? Demo risk if cache serves old ARASAAC picks forever.
8. **Jina multimodal in v1?** Phase A only for the hack, or invest early for the sponsor demo? If early: index full ARASAAC images or a **subset** (starter vocab + demo scenarios)?
9. **Credentials:** Does the team already have Elastic Cloud endpoint + API key? Who owns trial expiry vs demo day?
10. **Locale:** Index `en` only for the hack (`OPENSYMBOLS_LOCALE`), or multi-locale?
11. **Licensing display:** Keep returning `license` / `author` on tiles (ARASAAC CC BY-NC-SA) — confirm ingest preserves attribution fields.
12. **British/Irish spelling:** `generate-folders` asks for colour/chips/etc. Ensure analyzer/synonyms don’t break those terms.

---

## 7. Suggested implementation order

1. Add Elastic client + env vars + `SYMBOL_SEARCH` flag  
2. Ingest script: build ARASAAC metadata index; verify in Kibana/Dev Tools with queries like `paint brush`, `toilet`, `finished`  
3. Implement `elasticSearchSymbols(term, { locale, limit })` → `SymbolResult[]`  
4. Wire into `searchOnce` behind the flag; legacy path untouched  
5. Port `ALIASES` → synonym set; port `SOURCE_TRUST` → `function_score`  
6. Normalize scores; confirm `needsReview` still fires on weak matches  
7. Add cache-bust/warm script for demos  
8. (Stretch) Jina multimodal field + hybrid/RRF on a subset  
9. (Stretch) Feedback count sync  

Ship Phase A working end-to-end before Phase B.

---

## 8. Success criteria

- With `SYMBOL_SEARCH=elastic`, board folders still resolve pictures; caregiver replace-picture still works  
- Known hard cases improve or at least match legacy (e.g. compound nouns like “paint brush”)  
- No image binaries in git  
- Legacy flag still works without Elastic  
- Clear before/after demo story for judges: messy labels + optional learning signals → right tile → speech  

---

## 9. First action for Claude Code

Inspect the files listed in §5 to confirm they match this brief, then propose a short concrete task list (files to add/change). **Ask the human to answer open questions §6.1–3 and §6.8–9 before writing ingest code**, unless they tell you to pick sensible defaults:

**Suggested defaults if human says “just pick”:**

1. ARASAAC `en` only for v1  
2. Elastic replaces both library calls inside `searchOnce`, with legacy full path on error/flag  
3. Phase A only first; Jina as optional follow-up behind a second flag  
4. Query-time SQLite feedback boosts only (no Elastic doc updates yet)  
5. Provide a script to clear `word_symbols` when switching to Elastic  

Then implement Phase A.
