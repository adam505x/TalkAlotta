/**
 * Puts the app back to a first-run state so the setup flow can be run again.
 *
 * Keeps the resolved picture cache (word_symbols) on purpose: that cache is what
 * makes the board open instantly instead of re-searching every fixed word, and
 * none of it is personal to a run-through.
 *
 * Usage:
 *   node scripts/reset-demo.mjs            clears profile, boards, history
 *   node scripts/reset-demo.mjs --pictures also clears the picture cache
 *   node scripts/reset-demo.mjs --audio    also clears cached speech
 */

import path from 'node:path';
import fs from 'node:fs';
import Database from 'better-sqlite3';

const file = (process.env.DATABASE_FILE || 'aac.db').replace(/[^A-Za-z0-9._-]/g, '');
const dbPath = path.join(process.cwd(), 'data', file);

if (!fs.existsSync(dbPath)) {
  console.log(`No database at ${dbPath}. Nothing to reset.`);
  process.exit(0);
}

const db = new Database(dbPath);
const alsoPictures = process.argv.includes('--pictures');
const alsoAudio = process.argv.includes('--audio');

const before = {
  boards: db.prepare('SELECT count(*) n FROM boards').get().n,
  utterances: db.prepare('SELECT count(*) n FROM utterances').get().n,
  overrides: db.prepare('SELECT count(*) n FROM symbol_overrides').get().n,
  pictures: db.prepare('SELECT count(*) n FROM word_symbols').get().n,
  audio: db.prepare('SELECT count(*) n FROM audio_cache').get().n,
};

db.exec(`
  DELETE FROM board_items;
  DELETE FROM boards;
  DELETE FROM utterances;
  DELETE FROM symbol_feedback;
  DELETE FROM symbol_overrides;
  DELETE FROM uploads;
  DELETE FROM profile;
  INSERT OR IGNORE INTO profile (id) VALUES (1);
`);

if (alsoPictures) db.exec('DELETE FROM word_symbols;');
if (alsoAudio) db.exec('DELETE FROM audio_cache;');

const after = {
  pictures: db.prepare('SELECT count(*) n FROM word_symbols').get().n,
  audio: db.prepare('SELECT count(*) n FROM audio_cache').get().n,
};

console.log('Reset done.');
console.log(`  cleared: ${before.boards} boards, ${before.utterances} spoken items, ${before.overrides} pinned pictures`);
console.log(`  profile: back to first run, setup will show again`);
console.log(`  picture cache kept: ${after.pictures} words${alsoPictures ? ' (cleared)' : ''}`);
console.log(`  speech cache kept: ${after.audio} clips${alsoAudio ? ' (cleared)' : ''}`);

db.close();
