import { sql } from 'drizzle-orm';
import { blob, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

/**
 * One communicator, one profile, no logins. The row is always id = 1.
 */
export const profile = sqliteTable('profile', {
  id: integer('id').primaryKey(),

  // Profile questions. All optional. Age, gender and nationality are what the
  // voice lookup will eventually use to pick an accent-matched voice.
  age: integer('age'),
  gender: text('gender'),
  nationality: text('nationality'),
  caregiverRelationship: text('caregiver_relationship'),

  // Vision is a plain question, not a calibration test.
  vision: text('vision').notNull().default('unknown'),

  // Dexterity: the tap test is the only physical calibration.
  tapErrorPx: integer('tap_error_px'),
  gridIndex: integer('grid_index').notNull().default(2),
  gapPx: integer('gap_px').notNull().default(12),
  iconScale: integer('icon_scale_pct').notNull().default(100),

  // Routine feeds time-of-day adaptation.
  routine: text('routine').notNull().default('varies'),

  // Voice preference, confirmed by the caregiver during onboarding.
  voiceId: text('voice_id'),
  voiceLabel: text('voice_label'),

  onboardedAt: text('onboarded_at'),
  updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

/**
 * A saved situation board. Each described scenario becomes one of these and
 * shows up as a folder on the main board.
 */
export const boards = sqliteTable('boards', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  scenario: text('scenario').notNull(),
  intent: text('intent'),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  lastOpenedAt: text('last_opened_at'),
  openCount: integer('open_count').notNull().default(0),
});

export const boardItems = sqliteTable('board_items', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  boardId: integer('board_id')
    .notNull()
    .references(() => boards.id, { onDelete: 'cascade' }),
  position: integer('position').notNull(),
  term: text('term').notNull(),
  label: text('label').notNull(),
  role: text('role').notNull().default('object'),
  imageUrl: text('image_url').notNull(),
  symbolId: text('symbol_id'),
  source: text('source'),
  license: text('license'),
  author: text('author'),
  confidence: integer('confidence_pct'),
});

/**
 * A caregiver's chosen picture for a word. Applies everywhere that word appears,
 * and outranks anything the library returns. This is also where an uploaded
 * photo lands, so a specific child's specific cup wins over a generic icon.
 */
export const symbolOverrides = sqliteTable(
  'symbol_overrides',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    term: text('term').notNull(),
    imageUrl: text('image_url').notNull(),
    source: text('source'),
    license: text('license'),
    author: text('author'),
    isUpload: integer('is_upload').notNull().default(0),
    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => ({ termIdx: uniqueIndex('symbol_overrides_term_idx').on(t.term) }),
);

/**
 * Resolved library pictures for the fixed vocabulary.
 *
 * The fixed part of the board is looked up once and then cached here, so the
 * board is stable from then on and does not re-search on every page load. A
 * caregiver override still wins over anything in this table.
 */
export const wordSymbols = sqliteTable(
  'word_symbols',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    term: text('term').notNull(),
    role: text('role').notNull().default('object'),
    imageUrl: text('image_url').notNull(),
    symbolId: text('symbol_id'),
    source: text('source'),
    license: text('license'),
    author: text('author'),
    score: integer('score_pct').notNull().default(0),
    resolvedAt: text('resolved_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => ({ termIdx: uniqueIndex('word_symbols_term_idx').on(t.term) }),
);

/**
 * Folders the caregiver has taken off the board. Built-in folders are not
 * deleted, only hidden, so turning one back on is possible later.
 */
export const hiddenFolders = sqliteTable(
  'hidden_folders',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    folderId: text('folder_id').notNull(),
    hiddenAt: text('hidden_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => ({ folderIdx: uniqueIndex('hidden_folders_idx').on(t.folderId) }),
);

/**
 * Words the caregiver has added to a folder themselves.
 *
 * `location` is what makes this the learning half: add "Liam" while at school and
 * it is pinned to school, so he comes back on the next visit and does not clutter
 * the board at home. A null location means the word belongs everywhere.
 */
export const folderWords = sqliteTable('folder_words', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  folderId: text('folder_id').notNull(),
  term: text('term').notNull(),
  role: text('role').notNull().default('object'),
  location: text('location'),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

/**
 * Generated folder contents, cached per moment.
 *
 * Returning to the same place at the same time of day in the same weather shows
 * the same words and costs nothing. A board that shuffles itself between visits
 * would undo the muscle memory the fixed layout is there to build.
 */
export const contextFolders = sqliteTable(
  'context_folders',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    cacheKey: text('cache_key').notNull(),
    context: text('context').notNull(),
    payload: text('payload').notNull(),
    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => ({ keyIdx: uniqueIndex('context_folders_key_idx').on(t.cacheKey) }),
);

/** Uploaded pictures, stored as bytes so there is no filesystem dependency. */
export const uploads = sqliteTable('uploads', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  mime: text('mime').notNull(),
  bytes: blob('bytes', { mode: 'buffer' }).notNull(),
  label: text('label'),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

/**
 * Generated speech, keyed by text + voice + model, stored as bytes.
 *
 * This is what stops repeated presses of the same button spending credits. The
 * audio stream from ElevenLabs is fully buffered before it lands here, so a
 * second hit never gets an already-consumed stream.
 */
export const audioCache = sqliteTable(
  'audio_cache',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    cacheKey: text('cache_key').notNull(),
    text: text('text').notNull(),
    voiceId: text('voice_id').notNull(),
    modelId: text('model_id').notNull(),
    mime: text('mime').notNull(),
    bytes: blob('bytes', { mode: 'buffer' }).notNull(),
    charCount: integer('char_count').notNull(),
    hits: integer('hits').notNull().default(0),
    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => ({ keyIdx: uniqueIndex('audio_cache_key_idx').on(t.cacheKey) }),
);

/**
 * Every word and sentence actually spoken. Not surfaced yet: the dashboard of
 * most-said sentences is deliberately later, but the data it needs is recorded
 * from the first press so the dashboard has history to show when it arrives.
 */
export const utterances = sqliteTable('utterances', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  text: text('text').notNull(),
  kind: text('kind').notNull(), // 'word' | 'sentence'
  wordCount: integer('word_count').notNull().default(1),
  boardId: integer('board_id'),
  timeBucket: text('time_bucket'),
  spokenAt: text('spoken_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

/**
 * The learning layer's raw record: which symbols were accepted, rejected or
 * replaced for a given word. Ranking reads this to prefer past choices.
 */
export const symbolFeedback = sqliteTable('symbol_feedback', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  term: text('term').notNull(),
  symbolId: text('symbol_id'),
  imageUrl: text('image_url'),
  action: text('action').notNull(), // 'accepted' | 'rejected' | 'replaced'
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});
