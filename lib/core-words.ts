/**
 * The five AAC core words are NEVER searched against the symbol library.
 *
 * Reason: a library search for "finished" returns a finish-line symbol, and a
 * search for "help" returns whatever ranks first that day. These five are the
 * buttons a communicator needs most, and the ones where a wrong picture does
 * real harm, so they ship as hand-drawn inline SVG. They always render, they
 * never change under us, and they work with no network.
 *
 * The same reasoning covers the safety-critical vocabulary (help, stop): by
 * being hardcoded they can never resolve to a low-confidence match.
 *
 * A caregiver can still replace any of these from Edit board; the override is
 * stored in symbol_overrides and wins over the built-in.
 */

export type WordRole = 'core' | 'action' | 'object' | 'place' | 'feeling' | 'modifier';

export interface CoreWord {
  term: string;
  label: string;
  role: WordRole;
  imageUrl: string;
}

function svg(body: string): string {
  const doc =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none" ' +
    'stroke-linecap="round" stroke-linejoin="round">' +
    body +
    '</svg>';
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(doc);
}

// A raised open hand: the conventional "help" gesture.
const HELP = svg(
  [
    '<path d="M30 58V32a6 6 0 0 1 12 0v22" fill="#fff" stroke="#14161a" stroke-width="5"/>',
    '<path d="M42 54V26a6 6 0 0 1 12 0v28" fill="#fff" stroke="#14161a" stroke-width="5"/>',
    '<path d="M54 54V30a6 6 0 0 1 12 0v26" fill="#fff" stroke="#14161a" stroke-width="5"/>',
    '<path d="M66 56V38a6 6 0 0 1 12 0v26c0 15-11 25-25 25h-6c-14 0-24-10-24-24V52a6 6 0 0 1 12 0" fill="#fff" stroke="#14161a" stroke-width="5"/>',
  ].join(''),
);

// A bold plus: the standard symbol for "more".
const MORE = svg(
  [
    '<rect x="12" y="12" width="76" height="76" rx="14" fill="#e2f7e4" stroke="#2f9e44" stroke-width="5"/>',
    '<path d="M50 28v44M28 50h44" stroke="#2f9e44" stroke-width="12"/>',
  ].join(''),
);

// An open palm with an arrow drawn into it: "give me / I want".
const WANT = svg(
  [
    '<path d="M26 46V30a6 6 0 0 1 12 0v16" fill="#fff" stroke="#14161a" stroke-width="5"/>',
    '<path d="M38 46V26a6 6 0 0 1 12 0v20" fill="#fff" stroke="#14161a" stroke-width="5"/>',
    '<path d="M50 46V30a6 6 0 0 1 12 0v16" fill="#fff" stroke="#14161a" stroke-width="5"/>',
    '<path d="M62 48V36a6 6 0 0 1 12 0v26c0 14-10 24-24 24h-4c-13 0-22-9-22-22V44a6 6 0 0 1 12 0" fill="#fff" stroke="#14161a" stroke-width="5"/>',
    '<path d="M50 4v22" stroke="#1c7ed6" stroke-width="8"/>',
    '<path d="M40 18l10 12 10-12" fill="none" stroke="#1c7ed6" stroke-width="8"/>',
  ].join(''),
);

// A red octagon with a white bar: understood almost everywhere.
const STOP = svg(
  [
    '<path d="M33 8h34l25 25v34L67 92H33L8 67V33z" fill="#d62828" stroke="#8b1616" stroke-width="5"/>',
    '<path d="M28 50h44" stroke="#fff" stroke-width="12"/>',
  ].join(''),
);

// A green tick in a box: "all done".
const FINISHED = svg(
  [
    '<rect x="10" y="10" width="80" height="80" rx="14" fill="#e2f7e4" stroke="#2f9e44" stroke-width="5"/>',
    '<path d="M28 52l16 16 30-34" stroke="#2f9e44" stroke-width="12"/>',
  ].join(''),
);

/** Always present, always in this order, never searched. */
export const CORE_WORDS: CoreWord[] = [
  { term: 'help', label: 'help', role: 'core', imageUrl: HELP },
  { term: 'more', label: 'more', role: 'core', imageUrl: MORE },
  { term: 'want', label: 'want', role: 'core', imageUrl: WANT },
  { term: 'stop', label: 'stop', role: 'core', imageUrl: STOP },
  { term: 'finished', label: 'finished', role: 'core', imageUrl: FINISHED },
];

export const CORE_TERMS = new Set(CORE_WORDS.map((w) => w.term));

/**
 * Starter vocabulary for the fixed part of the board.
 *
 * These ARE resolved from the symbol library, once, and then cached in the
 * database so the board is stable from then on. The caregiver edits any that
 * come back wrong, and can add or remove words (their dog, their cup) from
 * Edit board. That is the "boards learn with them" path for fixed vocabulary.
 *
 * TODO(vocabulary): this list is a first draft written to get a usable board up.
 * A speech and language therapist should review it before real-world use.
 */
export interface StarterWord {
  term: string;
  role: WordRole;
  folder: string;
}

export const STARTER_VOCABULARY: StarterWord[] = [
  // People
  { term: 'mum', role: 'object', folder: 'people' },
  { term: 'dad', role: 'object', folder: 'people' },
  { term: 'teacher', role: 'object', folder: 'people' },
  { term: 'friend', role: 'object', folder: 'people' },
  // Actions
  { term: 'go', role: 'action', folder: 'actions' },
  { term: 'eat', role: 'action', folder: 'actions' },
  { term: 'drink', role: 'action', folder: 'actions' },
  { term: 'play', role: 'action', folder: 'actions' },
  { term: 'look', role: 'action', folder: 'actions' },
  { term: 'open', role: 'action', folder: 'actions' },
  { term: 'wash', role: 'action', folder: 'actions' },
  { term: 'sleep', role: 'action', folder: 'actions' },
  // Feelings and body
  { term: 'happy', role: 'feeling', folder: 'feelings' },
  { term: 'sad', role: 'feeling', folder: 'feelings' },
  { term: 'angry', role: 'feeling', folder: 'feelings' },
  { term: 'tired', role: 'feeling', folder: 'feelings' },
  { term: 'sore', role: 'feeling', folder: 'feelings' },
  { term: 'toilet', role: 'feeling', folder: 'feelings' },
  { term: 'hungry', role: 'feeling', folder: 'feelings' },
  { term: 'thirsty', role: 'feeling', folder: 'feelings' },
  // Places
  { term: 'home', role: 'place', folder: 'places' },
  { term: 'school', role: 'place', folder: 'places' },
  { term: 'outside', role: 'place', folder: 'places' },
  { term: 'shop', role: 'place', folder: 'places' },
  // Describing words
  { term: 'yes', role: 'modifier', folder: 'describe' },
  { term: 'no', role: 'modifier', folder: 'describe' },
  { term: 'big', role: 'modifier', folder: 'describe' },
  { term: 'small', role: 'modifier', folder: 'describe' },
  { term: 'hot', role: 'modifier', folder: 'describe' },
  { term: 'cold', role: 'modifier', folder: 'describe' },
  { term: 'please', role: 'core', folder: 'describe' },
];

export const FOLDER_ORDER = ['people', 'actions', 'feelings', 'places', 'describe'];

export const FOLDER_LABELS: Record<string, string> = {
  people: 'people',
  actions: 'doing',
  feelings: 'feelings',
  places: 'places',
  describe: 'describing',
};

/**
 * Vocabulary that shifts with time of day. The fixed rows never move; only this
 * slice changes, so muscle memory is preserved.
 * TODO(location): the same mechanism takes a location bucket once location
 * context lands (P2).
 */
export const TIME_OF_DAY_WORDS: Record<string, string[]> = {
  morning: ['breakfast', 'wash', 'school', 'coat'],
  afternoon: ['lunch', 'play', 'outside', 'friend'],
  evening: ['dinner', 'television', 'bath', 'story'],
  night: ['bed', 'sleep', 'dark', 'teddy'],
};

export type TimeBucket = 'morning' | 'afternoon' | 'evening' | 'night';

/**
 * TODO(time-buckets): cutoffs picked as sensible defaults. Adjust if the
 * caregiver's routine answer should shift them.
 */
export function timeOfDay(now: Date = new Date()): TimeBucket {
  const h = now.getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  if (h < 20) return 'evening';
  return 'night';
}
