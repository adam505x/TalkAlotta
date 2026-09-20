/**
 * Empties the resolved-picture cache so the next board open actually searches.
 *
 * Why this has to exist: lib/board.ts resolveWord checks word_symbols before it
 * calls matchConcept, and that cache has no idea which search backend filled it.
 * Flip SYMBOL_SEARCH to elastic without clearing it and every fixed word keeps
 * the picture the old ARASAAC path picked, forever. The demo would show a board
 * that never once touched Elasticsearch.
 *
 * Caregiver overrides and feedback are NOT touched. Those are the learning layer
 * and a pinned picture must survive a backend change, which is the whole promise
 * of pinning it.
 *
 * Usage:
 *   node scripts/clear-word-cache.mjs
 *   node scripts/clear-word-cache.mjs --dry-run
 */

import path from 'node:path';
import fs from 'node:fs';
import Database from 'better-sqlite3';

const file = (process.env.DATABASE_FILE || 'aac.db').replace(/[^A-Za-z0-9._-]/g, '');
const dbPath = path.join(process.cwd(), 'data', file);

if (!fs.existsSync(dbPath)) {
  console.log(`No database at ${dbPath}. Nothing to clear.`);
  process.exit(0);
}

const dryRun = process.argv.includes('--dry-run');
const db = new Database(dbPath);

const cached = db.prepare('SELECT count(*) n FROM word_symbols').get().n;
const overrides = db.prepare('SELECT count(*) n FROM symbol_overrides').get().n;

if (dryRun) {
  console.log(`Would clear ${cached} cached pictures.`);
} else {
  db.exec('DELETE FROM word_symbols;');
  console.log(`Cleared ${cached} cached pictures.`);
}

console.log(`Kept ${overrides} pinned pictures and all feedback.`);
console.log('Next board open will re-search every word. Run npm run warm to do it up front.');

db.close();
