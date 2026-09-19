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

/**
 * Word roles drive the Fitzgerald-style colour coding.
 *
 * `affirm` and `negate` exist only for yes and no. They are never produced by the
 * concept extraction; they are hardcoded, because yes and no need a fixed colour
 * and a fixed position more than any other pair on the board.
 */
export type WordRole =
  | 'core'
  | 'action'
  | 'object'
  | 'place'
  | 'feeling'
  | 'modifier'
  | 'affirm'
  | 'negate';

/** Visual treatment, separate from the word's role. */
export type TileVariant = 'word' | 'folder' | 'nav' | 'scenario' | 'caregiver';

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

// A thick tick on green. Hardcoded for the same reason as the rest: yes must
// never be a picture that could be mistaken for anything else.
const YES = svg(
  [
    '<rect x="8" y="8" width="84" height="84" rx="16" fill="#E8FAE9" stroke="#2C8A38" stroke-width="6"/>',
    '<path d="M26 52l18 18 32-38" fill="none" stroke="#2C8A38" stroke-width="15"/>',
  ].join(''),
);

// A thick cross on red.
const NO = svg(
  [
    '<rect x="8" y="8" width="84" height="84" rx="16" fill="#FDEAE7" stroke="#B5342A" stroke-width="6"/>',
    '<path d="M30 30l40 40M70 30L30 70" stroke="#B5342A" stroke-width="15"/>',
  ].join(''),
);

/**
 * The fixed top row, always present, always in this order, never searched.
 *
 * yes sits one in from the left and no sits one in from the right, with four
 * buttons between them. Putting the two opposites at opposite ends makes hitting
 * the wrong one much harder than if they were neighbours, which matters because
 * yes and no are the two answers a communicator cannot afford to get wrong.
 *
 * Colours follow the convention in the reference project: affirm is green,
 * negate is red.
 */
export const CORE_WORDS: CoreWord[] = [
  { term: 'help', label: 'help', role: 'core', imageUrl: HELP },
  { term: 'yes', label: 'yes', role: 'affirm', imageUrl: YES },
  { term: 'more', label: 'more', role: 'core', imageUrl: MORE },
  { term: 'want', label: 'want', role: 'core', imageUrl: WANT },
  { term: 'stop', label: 'stop', role: 'core', imageUrl: STOP },
  { term: 'no', label: 'no', role: 'negate', imageUrl: NO },
  { term: 'finished', label: 'finished', role: 'core', imageUrl: FINISHED },
];

/**
 * Navigation icons, also hardcoded.
 *
 * These must never come from a picture search. A search for "back" returns a
 * picture of a person's back, which is exactly the wrong image for a button that
 * means "return to the previous screen".
 */
export const NAV_ICONS = {
  back: svg(
    [
      '<circle cx="50" cy="50" r="42" fill="#EFEFE8" stroke="#55606D" stroke-width="6"/>',
      '<path d="M58 30L36 50l22 20" fill="none" stroke="#55606D" stroke-width="12"/>',
    ].join(''),
  ),
  next: svg(
    [
      '<circle cx="50" cy="50" r="42" fill="#EFEFE8" stroke="#55606D" stroke-width="6"/>',
      '<path d="M42 30l22 20-22 20" fill="none" stroke="#55606D" stroke-width="12"/>',
    ].join(''),
  ),
  /** A speech bubble with a plus: describe a new situation. */
  scenario: svg(
    [
      '<path d="M14 24a10 10 0 0 1 10-10h52a10 10 0 0 1 10 10v34a10 10 0 0 1-10 10H46L26 86V68h-2a10 10 0 0 1-10-10z" fill="#0E767C" stroke="#EAFBFB" stroke-width="5"/>',
      '<path d="M50 28v26M37 41h26" stroke="#EAFBFB" stroke-width="10"/>',
    ].join(''),
  ),
  /** A folder, used as the badge that marks a folder tile. */
  folder: svg(
    [
      '<path d="M10 28a6 6 0 0 1 6-6h22l8 10h28a6 6 0 0 1 6 6v40a6 6 0 0 1-6 6H16a6 6 0 0 1-6-6z" fill="#D9D6C6" stroke="#6B6650" stroke-width="6"/>',
      '<path d="M10 46h80" stroke="#6B6650" stroke-width="5"/>',
    ].join(''),
  ),
  /** Three bars: the menu that opens caregiver mode. */
  menu: svg(
    [
      '<rect x="10" y="22" width="80" height="12" rx="6" fill="#55606D"/>',
      '<rect x="10" y="44" width="80" height="12" rx="6" fill="#55606D"/>',
      '<rect x="10" y="66" width="80" height="12" rx="6" fill="#55606D"/>',
    ].join(''),
  ),
  /** A person, for caregiver mode. */
  caregiver: svg(
    [
      '<circle cx="50" cy="34" r="16" fill="#EFEFE8" stroke="#55606D" stroke-width="6"/>',
      '<path d="M20 88c0-17 13-28 30-28s30 11 30 28" fill="#EFEFE8" stroke="#55606D" stroke-width="6"/>',
    ].join(''),
  ),
} as const;

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

export const TIME_BUCKETS: TimeBucket[] = ['morning', 'afternoon', 'evening', 'night'];

/**
 * Where the communicator is. Location is the other half of "dynamic to the
 * situation": the same board should offer different words in a shop and at home.
 */
export type LocationBucket = 'home' | 'school' | 'park' | 'shop' | 'restaurant';

export const LOCATION_BUCKETS: LocationBucket[] = ['home', 'school', 'park', 'shop', 'restaurant'];

export const LOCATION_WORDS: Record<LocationBucket, string[]> = {
  home: ['sofa', 'kitchen', 'bedroom', 'garden'],
  school: ['classroom', 'desk', 'playground', 'reading'],
  park: ['swing', 'slide', 'ball', 'grass'],
  shop: ['trolley', 'money', 'basket', 'queue'],
  restaurant: ['menu', 'table', 'waiter', 'chips'],
};

/**
 * Four suggested situations, offered on the describe sheet so a caregiver can
 * start with one tap instead of typing. They change with the time of day, and
 * with the location when one is set, which is the adaptation made visible.
 */
const TIME_SCENARIOS: Record<TimeBucket, string[]> = {
  morning: [
    'getting ready for school',
    'breakfast at the table',
    'brushing teeth',
    'putting on my coat',
  ],
  afternoon: [
    'lunch in the school canteen',
    'playing outside at break',
    'art class choosing colours',
    'walking home',
  ],
  evening: ['dinner at the table', 'watching television', 'bath time', 'bedtime story'],
  night: ['getting into bed', 'cannot sleep', 'needing the toilet', 'wanting a cuddle'],
};

const LOCATION_SCENARIOS: Record<LocationBucket, string[]> = {
  home: ['playing in my room', 'helping in the kitchen'],
  school: ['circle time in class', 'asking the teacher for help'],
  park: ['on the swings with my friend', 'feeding the ducks'],
  shop: ['choosing sweets at the shop', 'waiting in the queue'],
  restaurant: ['choosing from the menu', 'waiting for my food'],
};

export function recommendedScenarios(
  bucket: TimeBucket,
  location?: LocationBucket | null,
): string[] {
  const byTime = TIME_SCENARIOS[bucket] ?? TIME_SCENARIOS.afternoon;
  if (!location) return byTime.slice(0, 4);
  const byPlace = LOCATION_SCENARIOS[location] ?? [];
  return [...byPlace.slice(0, 2), ...byTime.slice(0, 2)].slice(0, 4);
}

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
