import type { WordRole } from './core-words';

/**
 * The fixed core board: four pages of seventeen words, inside a seven by three
 * grid with four slots reserved on every page.
 *
 * The word set comes from the reference project, which did the research; the
 * colours and the hand-drawn pictures are ours. Fifteen of page one's words are
 * the Universal Core 36 (UNC Chapel Hill / Project Core, CC BY 4.0); yes and no
 * are deliberate additions.
 *
 * Three rules decide where the words sit, and they are worth preserving if this
 * is ever edited:
 *
 *  1. COLOUR BLOCKS ARE CONTIGUOUS. Like-coloured buttons grouped together are
 *     found measurably faster than the same buttons scattered, and colour encodes
 *     part of speech, so each part of speech occupies a contiguous region.
 *
 *  2. SENTENCE ORDER RUNS LEFT TO RIGHT. Subjects left, verbs centre, modifiers
 *     right, so building "I want more" traces one short path instead of jumping
 *     across the board.
 *
 *  3. FOLDERS SIT BESIDE THE WORDS THEY EXTEND. People follows the pronouns,
 *     Actions the verbs, Questions the question words. A folder is discovered
 *     from a word already known rather than hunted for in an index.
 *
 * The four reserved slots never move, on any page or inside any folder, so they
 * can be found by feel without looking.
 */

export const CORE_COLUMNS = 7;
export const CORE_ROW_COUNT = 3;
export const CORE_CELLS = CORE_COLUMNS * CORE_ROW_COUNT;

/** yes one in from the left, no one in from the right, on the top row. */
export const YES_SLOT = 1;
export const NO_SLOT = 5;
/** Paging, at the two bottom corners. */
export const BACK_SLOT = 14;
export const NEXT_SLOT = 20;

const RESERVED = new Set([YES_SLOT, NO_SLOT, BACK_SLOT, NEXT_SLOT]);

/** The seventeen free slots, in reading order. */
export const FREE_SLOTS = Array.from({ length: CORE_CELLS }, (_, i) => i).filter(
  (i) => !RESERVED.has(i),
);

export type CoreAction = 'back' | 'next';

export interface CoreCell {
  label: string;
  role: WordRole;
  kind: 'word' | 'folder' | 'action';
  folderId?: string;
  action?: CoreAction;
}

const w = (label: string, role: WordRole): CoreCell => ({ label, role, kind: 'word' });
const folder = (label: string, folderId: string, role: WordRole): CoreCell => ({
  label,
  role,
  kind: 'folder',
  folderId,
});

/** The four cells that hold their place on every page. */
export const YES_CELL = w('yes', 'affirm');
export const NO_CELL = w('no', 'urgent');
export const BACK_CELL: CoreCell = {
  label: 'back',
  role: 'determiner',
  kind: 'action',
  action: 'back',
};
export const NEXT_CELL: CoreCell = {
  label: 'next',
  role: 'determiner',
  kind: 'action',
  action: 'next',
};

/**
 * Seventeen cells per page, in reading order across the free slots.
 * Paging stops at the ends rather than wrapping.
 */
export const CORE_PAGES: CoreCell[][] = [
  // PAGE 1 - the sentence engine. Pronouns left, core verbs centre, quantity right.
  [
    w('I', 'pronoun'),
    w('you', 'pronoun'),
    w('it', 'pronoun'),
    w('that', 'pronoun'),
    w('not', 'urgent'),

    folder('People', 'people', 'pronoun'),
    w('want', 'verb'),
    w('go', 'verb'),
    w('like', 'verb'),
    w('do', 'verb'),
    w('help', 'verb'),
    w('stop', 'verb'),

    folder('Actions', 'actions', 'verb'),
    w('more', 'adjective'),
    w('finished', 'adjective'),
    w('good', 'adjective'),
    w('again', 'adjective'),
  ],

  // PAGE 2 - grammar and the world. Places beside the locative prepositions,
  // Things beside the object verbs, Numbers beside the quantifiers.
  [
    w('he', 'pronoun'),
    w('she', 'pronoun'),
    w('here', 'preposition'),
    w('in', 'preposition'),
    w('on', 'preposition'),

    w('up', 'preposition'),
    w('get', 'verb'),
    w('make', 'verb'),
    w('put', 'verb'),
    w('open', 'verb'),
    w('turn', 'verb'),
    w('look', 'verb'),

    folder('Places', 'places', 'noun'),
    folder('Things', 'things', 'noun'),
    folder('Numbers', 'numbers', 'noun'),
    w('some', 'adjective'),
    w('all', 'adjective'),
  ],

  // PAGE 3 - asking and doing. Questions beside the question words, Describe
  // beside the comparatives.
  [
    w('what', 'question'),
    w('where', 'question'),
    w('who', 'question'),
    w('why', 'question'),
    w('when', 'question'),

    folder('Questions', 'questions', 'question'),
    folder('Describe', 'describe', 'adjective'),
    w('same', 'adjective'),
    w('different', 'adjective'),
    folder('Little words', 'little', 'preposition'),
    w('wait', 'verb'),
    w('can', 'verb'),

    w('eat', 'verb'),
    w('drink', 'verb'),
    w('play', 'verb'),
    w('sleep', 'verb'),
    w('wash', 'verb'),
  ],

  // PAGE 4 - social language. Nine slots left free to grow into.
  [
    w('please', 'preposition'),
    w('thank you', 'preposition'),
    w('sorry', 'preposition'),
    w('my turn', 'preposition'),
    folder('Chat', 'chat', 'preposition'),

    folder('Food', 'food', 'noun'),
    folder('Emotions', 'emotions', 'adjective'),
    folder('Time', 'time', 'adjective'),
  ],
];

/**
 * Row one of every folder: the same seven core words in the same places, with
 * yes and no where they always are.
 *
 * This is here so a communicator never has to navigate out of a folder
 * mid-conversation to say yes.
 */
export const PINNED_CORE_ROW: CoreCell[] = [
  w('I', 'pronoun'),
  YES_CELL,
  w('want', 'verb'),
  w('like', 'verb'),
  w('more', 'adjective'),
  NO_CELL,
  w('stop', 'verb'),
];

export interface CoreFolder {
  name: string;
  role: WordRole;
  words: CoreCell[];
  /**
   * The picture on the folder button. Without one the folder borrows its first
   * word's picture, which is fine for People or Food but misleading for the
   * abstract folders: Places would show a house, and a house is one place.
   */
  icon?: string;
}

/** A pictogram by id, from the same library as everything else. */
const picture = (id: number) => `https://static.arasaac.org/pictograms/${id}/${id}_300.png`;

const words = (role: WordRole, ...labels: string[]): CoreCell[] =>
  labels.map((label) => w(label, role));

/**
 * Thirteen words each: one pinned row, then seven, then six beside the back
 * button. A folder is never more than one screen, so there is nothing to page
 * through and no next button inside one.
 */
export const CORE_FOLDERS: Record<string, CoreFolder> = {
  people: {
    name: 'People',
    role: 'pronoun',
    words: words(
      'pronoun',
      'mum',
      'dad',
      'me',
      'brother',
      'sister',
      'granny',
      'grandad',
      'teacher',
      'friend',
      'helper',
      'doctor',
      'everyone',
      'nobody',
    ),
  },
  actions: {
    name: 'Actions',
    role: 'verb',
    words: words(
      'verb',
      'eat',
      'drink',
      'play',
      'sleep',
      'wash',
      'read',
      'write',
      'draw',
      'walk',
      'run',
      'sing',
      'dance',
      'swim',
    ),
  },
  questions: {
    name: 'Questions',
    role: 'question',
    words: words(
      'question',
      'what',
      'where',
      'who',
      'why',
      'when',
      'how',
      'which',
      'how many',
      'how much',
      'what is that',
      'where is',
      'who is',
      'why not',
    ),
  },
  describe: {
    name: 'Describe',
    role: 'adjective',
    words: words(
      'adjective',
      'big',
      'small',
      'hot',
      'cold',
      'fast',
      'slow',
      'loud',
      'quiet',
      'new',
      'old',
      'dirty',
      'clean',
      'funny',
    ),
  },
  places: {
    name: 'Places',
    role: 'noun',
    // A house, a hospital and a playground together, rather than one building.
    icon: picture(32598),
    words: words(
      'noun',
      'home',
      'school',
      'shop',
      'park',
      'cafe',
      'hospital',
      'library',
      'pool',
      'beach',
      'garden',
      'bedroom',
      'kitchen',
      'bathroom',
    ),
  },
  things: {
    name: 'Things',
    role: 'noun',
    // A chair, a ball and a bottle: several objects, not one of them.
    icon: picture(11318),
    words: words(
      'noun',
      'ball',
      'book',
      'toy',
      'phone',
      'tablet',
      'car',
      'bag',
      'chair',
      'table',
      'bed',
      'door',
      'window',
      'television',
    ),
  },
  numbers: {
    name: 'Numbers',
    role: 'noun',
    icon: picture(2879),
    words: words(
      'noun',
      'one',
      'two',
      'three',
      'four',
      'five',
      'six',
      'seven',
      'eight',
      'nine',
      'ten',
      'zero',
      'how many',
      'a lot',
    ),
  },
  little: {
    name: 'Little words',
    role: 'preposition',
    words: words(
      'preposition',
      'a',
      'the',
      'and',
      'but',
      'or',
      'to',
      'for',
      'with',
      'of',
      'in',
      'on',
      'at',
      'my',
    ),
  },
  chat: {
    name: 'Chat',
    role: 'preposition',
    words: words(
      'preposition',
      'hi',
      'bye',
      'thank you',
      'please',
      'sorry',
      'excuse me',
      'what is up',
      'how about you',
      'me too',
      'hang out',
      'want to',
      'not much',
      'that is funny',
    ),
  },
  food: {
    name: 'Food',
    role: 'noun',
    words: words(
      'noun',
      'water',
      'milk',
      'juice',
      'bread',
      'toast',
      'cereal',
      'egg',
      'pasta',
      'chicken',
      'apple',
      'banana',
      'crisps',
      'cake',
    ),
  },
  emotions: {
    name: 'Emotions',
    role: 'adjective',
    words: words(
      'adjective',
      'happy',
      'sad',
      'angry',
      'scared',
      'tired',
      'excited',
      'bored',
      'sick',
      'hurt',
      'worried',
      'silly',
      'proud',
      'okay',
    ),
  },
  time: {
    name: 'Time',
    role: 'adjective',
    words: words(
      'adjective',
      'now',
      'later',
      'soon',
      'today',
      'tomorrow',
      'morning',
      'night',
      'bedtime',
      'wait',
      'minute',
      'hour',
      'day',
      'birthday',
    ),
  },
};

/**
 * Lays a page out into the twenty-one cells, putting yes, no, back and next in
 * the four slots they always occupy.
 */
export function layOutPage(pageIndex: number): (CoreCell | null)[] {
  const cells: (CoreCell | null)[] = new Array(CORE_CELLS).fill(null);
  cells[YES_SLOT] = YES_CELL;
  cells[NO_SLOT] = NO_CELL;
  cells[BACK_SLOT] = BACK_CELL;
  cells[NEXT_SLOT] = NEXT_CELL;

  const content = CORE_PAGES[pageIndex] ?? [];
  FREE_SLOTS.forEach((slot, i) => {
    cells[slot] = content[i] ?? null;
  });
  return cells;
}

/** Row two, then the six cells beside back on row three. Thirteen in all. */
const FOLDER_SLOTS = [7, 8, 9, 10, 11, 12, 13, 15, 16, 17, 18, 19, 20];

/**
 * A folder laid into the same twenty-one cells: the pinned core row, then the
 * folder's words, with back in its usual corner and no next button, because a
 * folder is never more than one screen.
 */
export function layOutFolder(folderWords: CoreCell[]): (CoreCell | null)[] {
  const cells: (CoreCell | null)[] = new Array(CORE_CELLS).fill(null);
  PINNED_CORE_ROW.forEach((cell, i) => {
    cells[i] = cell;
  });
  cells[BACK_SLOT] = BACK_CELL;

  FOLDER_SLOTS.forEach((slot, i) => {
    cells[slot] = folderWords[i] ?? null;
  });
  return cells;
}

/** Every word on the fixed board, for resolving pictures. */
export function fixedBoardTerms(openFolderId?: string | null): { term: string; role: WordRole }[] {
  const cells: CoreCell[] = [
    ...CORE_PAGES.flat(),
    ...PINNED_CORE_ROW,
    YES_CELL,
    NO_CELL,
    ...(openFolderId && CORE_FOLDERS[openFolderId] ? CORE_FOLDERS[openFolderId].words : []),
  ];
  return cells.filter((c) => c.kind === 'word').map((c) => ({ term: c.label, role: c.role }));
}
