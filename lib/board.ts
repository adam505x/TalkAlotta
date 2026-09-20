import { desc, eq } from 'drizzle-orm';
import { db, schema } from './db';
import { builtInPicture, type WordRole } from './core-words';
import { fixedBoardTerms } from './core-board';
import { matchConcept } from './symbol-search';
import { describeContext, type MomentContext } from './context';
import {
  ALWAYS_PEOPLE,
  FOLDER_IDS,
  FOLDER_LABELS,
  generateFolders,
  type FolderId,
} from './generate-folders';

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
 *  - Below it sit exactly four folders: people, doing, things, describing. Every
 *    situation decomposes into those four, so the folders themselves never move
 *    or change in number. Only what is inside them changes.
 *
 *  - What goes inside comes from the moment: the time of day, where they are, the
 *    weather, and any activity that has been typed in. Somewhere specific gets
 *    specific words; a restaurant offers a server and a menu, a park does not.
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
  /**
   * The folder tile is coloured like any other word of this kind, so a folder is
   * not a different-looking object on the board. The only thing marking it as a
   * folder is a small tab on its top edge.
   */
  role: WordRole;
}

/**
 * Resolves one fixed-vocabulary word to a picture, caching the result so the
 * board is stable and we do not re-search on every load.
 */
/**
 * A caregiver's pinned picture for a word, if there is one.
 *
 * Keyed on the lowercased term. The override route lowercases before storing, so
 * a lookup that did not would silently miss for any capitalised word, and editing
 * "I" would appear to do nothing.
 */
export function overrideTileFor(term: string, role: WordRole, label = term): Tile | null {
  const override = db
    .select()
    .from(schema.symbolOverrides)
    .where(eq(schema.symbolOverrides.term, term.toLowerCase()))
    .get();
  if (!override) return null;
  return {
    term,
    label,
    role,
    imageUrl: override.imageUrl,
    kind: 'word',
    confidence: 100,
    license: override.license,
    author: override.author,
    source: override.source,
  };
}

export async function resolveWord(term: string, role: WordRole): Promise<Tile | null> {
  const key = term.toLowerCase();

  const override = overrideTileFor(term, role);
  if (override) return override;

  const cached = db.select().from(schema.wordSymbols).where(eq(schema.wordSymbols.term, key)).get();
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
      term: key,
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
  /** Lowercased word to picture, for every cell currently on screen. */
  pictures: Record<string, string>;
  /** Always these four, in this order. Only their contents change. */
  pages: BoardPage[];
  context: MomentContext;
  contextLabel: string;
  /** False when there is no API key and the words are a generic stand-in. */
  generated: boolean;
}

/** The most a folder ever shows at once. */
const FOLDER_CAP = 6;

/** The colour each folder's words take, following the Fitzgerald key. */
const FOLDER_ROLE: Record<FolderId, WordRole> = {
  people: 'pronoun',
  actions: 'verb',
  things: 'noun',
  describing: 'adjective',
};

/**
 * Words the caregiver added themselves, for this folder, that apply here.
 *
 * A word pinned to a location comes back every time they return to it and stays
 * out of the way everywhere else. That is the learning half: add "Liam" at
 * school and Liam is a school word from then on.
 */
function learnedWords(folderId: FolderId, location: string | null): { term: string; role: WordRole }[] {
  const rows = db
    .select()
    .from(schema.folderWords)
    .where(eq(schema.folderWords.folderId, folderId))
    .all();

  const here = (location ?? '').toLowerCase();
  return rows
    .filter((row) => !row.location || row.location.toLowerCase() === here)
    .map((row) => ({ term: row.term, role: (row.role as WordRole) ?? FOLDER_ROLE[folderId] }));
}

export async function assembleMainBoard(
  context: MomentContext,
  openFolder?: string | null,
): Promise<AssembledBoard> {
  const { words, generated } = await generateFolders(context);

  const hidden = new Set(
    db
      .select()
      .from(schema.hiddenFolders)
      .all()
      .map((row) => row.folderId),
  );

  const pages: BoardPage[] = [];

  for (const folderId of FOLDER_IDS) {
    if (hidden.has(`folder:${folderId}`)) continue;

    const role = FOLDER_ROLE[folderId];

    // A caregiver's own words come first: they were added deliberately, and they
    // are the ones that make the board this child's rather than anyone's.
    const chosen: { term: string; role: WordRole }[] = [...learnedWords(folderId, context.location)];

    if (folderId === 'people') {
      for (const term of ALWAYS_PEOPLE) {
        if (!chosen.some((c) => c.term === term)) chosen.push({ term, role });
      }
    }

    for (const term of words[folderId] ?? []) {
      if (chosen.some((c) => c.term === term)) continue;
      chosen.push({ term, role });
    }

    // About five, never more than six. Past that a folder stops being something
    // you can scan and becomes something you have to read.
    const tiles = await resolveMany(chosen.slice(0, FOLDER_CAP));
    pages.push({
      id: `folder:${folderId}`,
      title: FOLDER_LABELS[folderId],
      tiles,
      role,
    });
  }

  // The fixed board's LAYOUT is static data both sides share (lib/core-board.ts).
  // The server's job is only to say what picture each of its words gets, so the
  // page can draw the layout without every picture lookup going to the client.
  const pictures: Record<string, string> = {};
  const seen = new Set<string>();
  const unique = fixedBoardTerms(openFolder).filter((t) => {
    const key = t.term.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const resolved = await Promise.all(
    unique.map(async (entry) => {
      const pinned = overrideTileFor(entry.term, entry.role);
      if (pinned) return { term: entry.term, imageUrl: pinned.imageUrl };

      const builtIn = builtInPicture(entry.term);
      if (builtIn) return { term: entry.term, imageUrl: builtIn };

      const tile = await resolveWord(entry.term, entry.role);
      return { term: entry.term, imageUrl: tile?.imageUrl ?? '' };
    }),
  );
  for (const r of resolved) pictures[r.term.toLowerCase()] = r.imageUrl;

  return { pictures, pages, context, contextLabel: describeContext(context), generated };
}

export function touchBoard(boardId: number) {
  const board = db.select().from(schema.boards).where(eq(schema.boards.id, boardId)).get();
  if (!board) return;
  db.update(schema.boards)
    .set({ lastOpenedAt: new Date().toISOString(), openCount: board.openCount + 1 })
    .where(eq(schema.boards.id, boardId))
    .run();
}
