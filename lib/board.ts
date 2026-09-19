import { desc, eq } from 'drizzle-orm';
import { db, schema } from './db';
import {
  CORE_WORDS,
  FOLDER_LABELS,
  FOLDER_ORDER,
  LOCATION_WORDS,
  STARTER_VOCABULARY,
  TIME_OF_DAY_WORDS,
  timeOfDay,
  type LocationBucket,
  type TimeBucket,
  type WordRole,
} from './core-words';
import { matchConcept } from './symbol-search';

/**
 * Board assembly.
 *
 * Board shape, and why:
 *
 *  - The core words sit in their own fixed top row, OUTSIDE the adjustable grid.
 *    At the largest button size the grid holds twelve buttons, and the core words
 *    plus navigation would have eaten all of it, leaving no room for the words the
 *    situation is actually about. Keeping them out of the grid also means they
 *    never move when the grid size changes, which is the whole point of a fixed
 *    position: muscle memory. yes and no live at opposite ends of that row.
 *
 *  - The grid itself holds folders of fixed vocabulary, which never move either.
 *
 *  - A described situation becomes its own folder on the main board. So the board
 *    stays predictable, and the moment-specific words live one tap inside a
 *    folder named after that moment. Describing a new situation adds a folder, it
 *    does not rearrange the board.
 *
 *  - Only the time-of-day folder changes by itself.
 */

export interface Tile {
  term: string;
  label: string;
  role: WordRole;
  imageUrl: string;
  /** Folders open a page of more tiles instead of speaking. */
  kind: 'word' | 'folder';
  folderId?: string;
  boardId?: number;
  confidence?: number;
  license?: string | null;
  author?: string | null;
  source?: string | null;
  symbolId?: string | null;
}

export interface BoardPage {
  id: string;
  title: string;
  tiles: Tile[];
}

/**
 * Resolves one fixed-vocabulary word to a picture, caching the result so the
 * board is stable and we do not re-search on every load.
 */
export async function resolveWord(term: string, role: WordRole): Promise<Tile | null> {
  const override = db
    .select()
    .from(schema.symbolOverrides)
    .where(eq(schema.symbolOverrides.term, term))
    .get();
  if (override) {
    return {
      term,
      label: term,
      role,
      imageUrl: override.imageUrl,
      kind: 'word',
      confidence: 100,
      license: override.license,
      author: override.author,
      source: override.source,
    };
  }

  const cached = db.select().from(schema.wordSymbols).where(eq(schema.wordSymbols.term, term)).get();
  if (cached) {
    return {
      term,
      label: term,
      role: (cached.role as WordRole) ?? role,
      imageUrl: cached.imageUrl,
      kind: 'word',
      confidence: cached.score,
      license: cached.license,
      author: cached.author,
      source: cached.source,
      symbolId: cached.symbolId,
    };
  }

  const match = await matchConcept(term, role, { limit: 6 });
  if (!match.best) return null;

  db.insert(schema.wordSymbols)
    .values({
      term,
      role,
      imageUrl: match.best.imageUrl,
      symbolId: String(match.best.id),
      source: match.best.source,
      license: match.best.license,
      author: match.best.author,
      score: Math.round(match.best.score * 100),
    })
    .onConflictDoNothing()
    .run();

  return {
    term,
    label: term,
    role,
    imageUrl: match.best.imageUrl,
    kind: 'word',
    confidence: Math.round(match.best.score * 100),
    license: match.best.license,
    author: match.best.author,
    source: match.best.source,
    symbolId: String(match.best.id),
  };
}

async function resolveMany(words: { term: string; role: WordRole }[]): Promise<Tile[]> {
  const tiles = await Promise.all(words.map((w) => resolveWord(w.term, w.role)));
  return tiles.filter((t): t is Tile => t !== null);
}

export interface AssembledBoard {
  core: Tile[];
  pages: BoardPage[];
  timeBucket: TimeBucket;
  location: LocationBucket | null;
}

export interface BoardContext {
  /** Overrides the clock. Used by the demo controls to show time adaptation. */
  timeBucket?: TimeBucket | null;
  /** Where the communicator is. No override means no location folder. */
  location?: LocationBucket | null;
}

export async function assembleMainBoard(context: BoardContext = {}): Promise<AssembledBoard> {
  const bucket = context.timeBucket ?? timeOfDay();
  const location = context.location ?? null;

  // Fixed vocabulary folders.
  const byFolder = new Map<string, { term: string; role: WordRole }[]>();
  for (const word of STARTER_VOCABULARY) {
    const list = byFolder.get(word.folder) ?? [];
    list.push({ term: word.term, role: word.role });
    byFolder.set(word.folder, list);
  }

  const folderPages: BoardPage[] = [];

  for (const folderId of FOLDER_ORDER) {
    const words = byFolder.get(folderId);
    if (!words) continue;
    const tiles = await resolveMany(words);
    if (tiles.length === 0) continue;
    folderPages.push({
      id: `folder:${folderId}`,
      title: FOLDER_LABELS[folderId] ?? folderId,
      tiles,
    });
  }

  // The one part of the board that shifts on its own: time of day.
  const nowWords = (TIME_OF_DAY_WORDS[bucket] ?? []).map((term) => ({
    term,
    role: 'object' as WordRole,
  }));
  const nowTiles = await resolveMany(nowWords);
  if (nowTiles.length > 0) {
    folderPages.push({ id: 'folder:now', title: bucket, tiles: nowTiles });
  }

  // The other half of situational adaptation: where they are.
  if (location) {
    const placeWords = (LOCATION_WORDS[location] ?? []).map((term) => ({
      term,
      role: 'object' as WordRole,
    }));
    const placeTiles = await resolveMany(placeWords);
    if (placeTiles.length > 0) {
      folderPages.push({ id: 'folder:place', title: location, tiles: placeTiles });
    }
  }

  // Saved situation boards, newest first, each as its own folder.
  const saved = db.select().from(schema.boards).orderBy(desc(schema.boards.createdAt)).all();
  for (const board of saved) {
    const items = db
      .select()
      .from(schema.boardItems)
      .where(eq(schema.boardItems.boardId, board.id))
      .orderBy(schema.boardItems.position)
      .all();
    if (items.length === 0) continue;
    const tiles: Tile[] = items.map((i) => ({
      term: i.term,
      label: i.label,
      role: (i.role as WordRole) ?? 'object',
      imageUrl: i.imageUrl,
      kind: 'word',
      confidence: i.confidence ?? undefined,
      license: i.license,
      author: i.author,
      source: i.source,
      symbolId: i.symbolId,
    }));
    folderPages.push({ id: `board:${board.id}`, title: board.name, tiles });
  }

  const core: Tile[] = CORE_WORDS.map((w) => ({
    term: w.term,
    label: w.label,
    role: w.role,
    imageUrl: w.imageUrl,
    kind: 'word',
    confidence: 100,
  }));

  return { core, pages: folderPages, timeBucket: bucket, location };
}

export function touchBoard(boardId: number) {
  const board = db.select().from(schema.boards).where(eq(schema.boards.id, boardId)).get();
  if (!board) return;
  db.update(schema.boards)
    .set({ lastOpenedAt: new Date().toISOString(), openCount: board.openCount + 1 })
    .where(eq(schema.boards.id, boardId))
    .run();
}
