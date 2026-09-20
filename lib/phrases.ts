import { asc, inArray } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { folderIdAliases } from './folder-id';

/**
 * Phrases the caregiver pinned from the dashboard.
 *
 * Common spoken sentences become one-tap buttons, and they live in their own
 * folder on the bottom row rather than mixing with the four situation folders.
 * Those four still change with the moment; this one is this child's sentences.
 */

export const PHRASES_FOLDER_ID = 'phrases';
export const PHRASES_PAGE_ID = `folder:${PHRASES_FOLDER_ID}`;
export const PHRASES_TITLE = 'my phrases';

/** A few pages on the strip; past that it is a catalogue. */
export const PHRASES_CAP = 24;
export const PHRASE_MAX_CHARS = 80;

export function listedPhrases(): string[] {
  return db
    .select({ term: schema.folderWords.term })
    .from(schema.folderWords)
    .where(inArray(schema.folderWords.folderId, folderIdAliases(PHRASES_FOLDER_ID)))
    .orderBy(asc(schema.folderWords.createdAt), asc(schema.folderWords.id))
    .all()
    .map((row) => row.term);
}

export function isPhrasesFolder(folderId: string): boolean {
  return folderId === PHRASES_FOLDER_ID || folderId === PHRASES_PAGE_ID;
}
