import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';

/**
 * A single local SQLite file. Deliberately simple: one communicator, one
 * profile, no logins.
 *
 * NOTE ON DEPLOYMENT: because this writes to a file, it needs a real
 * filesystem. It works locally and on any always-on host, but a serverless
 * deploy (Vercel) cannot persist it, so a hosted copy starts empty each cold
 * start. Everything in the app goes through this module, so swapping in a
 * networked SQLite such as Turso later is a change to this file alone.
 *
 * Tables are created on first use, so there is no migration step to run.
 */

/**
 * The file always lives in ./data. Only the filename is configurable, which
 * keeps the path statically scoped to one folder; a fully dynamic path makes the
 * bundler trace the entire project into the server output.
 */
const DB_FILE = (process.env.DATABASE_FILE || 'aac.db').replace(/[^A-Za-z0-9._-]/g, '');

/** Adds a column to an existing table, if it is not there already. */
function addColumn(sqlite: Database.Database, table: string, column: string, ddl: string) {
  const columns = sqlite.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (columns.some((c) => c.name === column)) return;
  sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
}

function createTables(sqlite: Database.Database) {
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS profile (
      id INTEGER PRIMARY KEY,
      name TEXT,
      age INTEGER,
      gender TEXT,
      nationality TEXT,
      caregiver_relationship TEXT,
      vision TEXT NOT NULL DEFAULT 'unknown',
      tap_error_px INTEGER,
      grid_index INTEGER NOT NULL DEFAULT 2,
      button_scale_pct INTEGER,
      gap_px INTEGER NOT NULL DEFAULT 12,
      icon_scale_pct INTEGER NOT NULL DEFAULT 100,
      routine TEXT NOT NULL DEFAULT 'varies',
      voice_id TEXT,
      voice_label TEXT,
      onboarded_at TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS boards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      scenario TEXT NOT NULL,
      intent TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_opened_at TEXT,
      open_count INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS board_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      term TEXT NOT NULL,
      label TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'object',
      image_url TEXT NOT NULL,
      symbol_id TEXT,
      source TEXT,
      license TEXT,
      author TEXT,
      confidence_pct INTEGER
    );

    CREATE TABLE IF NOT EXISTS symbol_overrides (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      term TEXT NOT NULL,
      image_url TEXT NOT NULL,
      source TEXT,
      license TEXT,
      author TEXT,
      is_upload INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX IF NOT EXISTS symbol_overrides_term_idx ON symbol_overrides(term);

    CREATE TABLE IF NOT EXISTS word_symbols (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      term TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'object',
      image_url TEXT NOT NULL,
      symbol_id TEXT,
      source TEXT,
      license TEXT,
      author TEXT,
      score_pct INTEGER NOT NULL DEFAULT 0,
      resolved_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX IF NOT EXISTS word_symbols_term_idx ON word_symbols(term);

    CREATE TABLE IF NOT EXISTS hidden_folders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      folder_id TEXT NOT NULL,
      hidden_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX IF NOT EXISTS hidden_folders_idx ON hidden_folders(folder_id);

    CREATE TABLE IF NOT EXISTS folder_words (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      folder_id TEXT NOT NULL,
      term TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'object',
      location TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS context_folders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cache_key TEXT NOT NULL,
      context TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX IF NOT EXISTS context_folders_key_idx ON context_folders(cache_key);

    CREATE TABLE IF NOT EXISTS uploads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mime TEXT NOT NULL,
      bytes BLOB NOT NULL,
      label TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS audio_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cache_key TEXT NOT NULL,
      text TEXT NOT NULL,
      voice_id TEXT NOT NULL,
      model_id TEXT NOT NULL,
      mime TEXT NOT NULL,
      bytes BLOB NOT NULL,
      char_count INTEGER NOT NULL,
      hits INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX IF NOT EXISTS audio_cache_key_idx ON audio_cache(cache_key);

    CREATE TABLE IF NOT EXISTS utterances (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      text TEXT NOT NULL,
      kind TEXT NOT NULL,
      word_count INTEGER NOT NULL DEFAULT 1,
      board_id INTEGER,
      time_bucket TEXT,
      spoken_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS symbol_feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      term TEXT NOT NULL,
      symbol_id TEXT,
      image_url TEXT,
      action TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Columns added after a database was first created. CREATE TABLE IF NOT EXISTS
  // will not add them to an existing file, so they are applied separately.
  // Nullable additions only: anything needing a backfill or a rewrite is a real
  // migration and does not belong in a startup path.
  addColumn(sqlite, 'profile', 'name', 'TEXT');
  addColumn(sqlite, 'profile', 'button_scale_pct', 'INTEGER');
  addColumn(sqlite, 'folder_words', 'location', 'TEXT');

  // The profile row always exists so reads never have to special-case null.
  sqlite.exec('INSERT OR IGNORE INTO profile (id) VALUES (1)');
}

declare global {
  // Reused across hot reloads in dev so we don't reopen the file each time.
  // eslint-disable-next-line no-var
  var __talkalottaDb: ReturnType<typeof build> | undefined;
}

function build() {
  const dir = path.join(process.cwd(), 'data');
  fs.mkdirSync(dir, { recursive: true });
  const sqlite = new Database(path.join(dir, DB_FILE || 'aac.db'));
  createTables(sqlite);
  return { sqlite, db: drizzle(sqlite, { schema }) };
}

const instance = globalThis.__talkalottaDb ?? build();
// Always re-run CREATE TABLE IF NOT EXISTS so a long-lived hot-reload
// singleton still picks up tables added after the process first started.
createTables(instance.sqlite);
if (process.env.NODE_ENV !== 'production') {
  globalThis.__talkalottaDb = instance;
}

export const sqlite = instance.sqlite;
export const db = instance.db;
export { schema };
