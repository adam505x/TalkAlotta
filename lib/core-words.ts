/**
 * The core block, the navigation icons, and the starter vocabulary.
 *
 * The buttons that matter most ship as hand-drawn inline SVG rather than coming
 * from the symbol library: a search for "finished" returns a finish line, and a
 * search for "help" returns whatever ranks first that day. Being built in also
 * means the safety-critical ones can never resolve to a low-confidence match.
 * They render with no network and never change under us.
 *
 * A caregiver can still replace any of them from edit mode; the override is
 * stored in symbol_overrides and wins over the built-in.
 */

/**
 * Word roles drive the Fitzgerald-style colour coding.
 *
 * `urgent` covers negation and emergency, the red block. `affirm` exists only for
 * yes: it needs to be unmistakably not-a-verb despite also being green, because a
 * slip between yes and no is the one misclick here with real consequences.
 */
export type WordRole =
  | 'pronoun'
  | 'verb'
  | 'noun'
  | 'adjective'
  | 'preposition'
  | 'question'
  | 'urgent'
  | 'adverb'
  | 'conjunction'
  | 'determiner'
  | 'affirm';

/** Visual treatment, separate from the word's role. */
export type TileVariant = 'word' | 'folder' | 'nav' | 'scenario' | 'caregiver';

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
 * Words that ship with a hand-drawn picture instead of a library one.
 *
 * These are the buttons that matter most, and the ones where a wrong picture does
 * real harm. A library search for "finished" returns a finish line, and a search
 * for "help" returns whatever ranks first that day. Being built in also means the
 * safety-critical ones can never resolve to a low-confidence match, and they
 * render with no network.
 *
 * A caregiver can still replace any of them from edit mode; the override is
 * stored in symbol_overrides and wins over the built-in.
 */
export const BUILT_IN_PICTURES: Record<string, string> = {
  help: HELP,
  more: MORE,
  want: WANT,
  stop: STOP,
  finished: FINISHED,
  yes: YES,
  no: NO,
};

export function builtInPicture(term: string): string | null {
  return BUILT_IN_PICTURES[term.trim().toLowerCase()] ?? null;
}

/**
 * Navigation and action icons, also hardcoded.
 *
 * These must never come from a picture search. A search for "back" returns a
 * picture of a person's back, which is the wrong image for a button meaning
 * "return to the previous screen".
 */
export const NAV_ICONS = {
  back: svg([
    '<circle cx="50" cy="50" r="42" fill="#EFEFE8" stroke="#55606D" stroke-width="6"/>',
    '<path d="M58 30L36 50l22 20" fill="none" stroke="#55606D" stroke-width="12"/>',
  ].join('')),
  next: svg([
    '<circle cx="50" cy="50" r="42" fill="#EFEFE8" stroke="#55606D" stroke-width="6"/>',
    '<path d="M42 30l22 20-22 20" fill="none" stroke="#55606D" stroke-width="12"/>',
  ].join('')),
  home: svg([
    '<path d="M50 12L12 46h10v38h20V62h16v22h20V46h10z" fill="#EFEFE8" stroke="#55606D" stroke-width="6" stroke-linejoin="round"/>',
  ].join('')),
  /** A speech bubble with a plus: describe a new situation. */
  scenario: svg([
    '<path d="M14 24a10 10 0 0 1 10-10h52a10 10 0 0 1 10 10v34a10 10 0 0 1-10 10H46L26 86V68h-2a10 10 0 0 1-10-10z" fill="#0E767C" stroke="#EAFBFB" stroke-width="5"/>',
    '<path d="M50 28v26M37 41h26" stroke="#EAFBFB" stroke-width="10"/>',
  ].join('')),
  /** A clock: what is happening right now, from the sensed context. */
  rightNow: svg([
    '<circle cx="50" cy="50" r="40" fill="#EFEFE8" stroke="#55606D" stroke-width="6"/>',
    '<path d="M50 26v26l18 10" fill="none" stroke="#55606D" stroke-width="8" stroke-linecap="round"/>',
  ].join('')),
  /** A plus in a dashed square: add another picture to this folder. */
  add: svg([
    '<rect x="10" y="10" width="80" height="80" rx="12" fill="#EFEFE8" stroke="#55606D" stroke-width="6" stroke-dasharray="14 10"/>',
    '<path d="M50 28v44M28 50h44" stroke="#55606D" stroke-width="12"/>',
  ].join('')),
  folder: svg([
    '<path d="M10 28a6 6 0 0 1 6-6h22l8 10h28a6 6 0 0 1 6 6v40a6 6 0 0 1-6 6H16a6 6 0 0 1-6-6z" fill="#D9D6C6" stroke="#6B6650" stroke-width="6"/>',
    '<path d="M10 46h80" stroke="#6B6650" stroke-width="5"/>',
  ].join('')),
  menu: svg([
    '<rect x="10" y="22" width="80" height="12" rx="6" fill="#55606D"/>',
    '<rect x="10" y="44" width="80" height="12" rx="6" fill="#55606D"/>',
    '<rect x="10" y="66" width="80" height="12" rx="6" fill="#55606D"/>',
  ].join('')),
  caregiver: svg([
    '<circle cx="50" cy="34" r="16" fill="#EFEFE8" stroke="#55606D" stroke-width="6"/>',
    '<path d="M20 88c0-17 13-28 30-28s30 11 30 28" fill="#EFEFE8" stroke="#55606D" stroke-width="6"/>',
  ].join('')),
} as const;

export const CORE_TERMS = new Set(Object.keys(BUILT_IN_PICTURES));

export type TimeBucket = 'morning' | 'afternoon' | 'evening' | 'night';

export const TIME_BUCKETS: TimeBucket[] = ['morning', 'afternoon', 'evening', 'night'];

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

/** Places with suggestions of their own. Anywhere else falls back to the time. */
type LocationBucket = 'home' | 'school' | 'park' | 'shop' | 'restaurant';

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

/**
 * Location is free text, so it may be "school" or "Chick-fil-A". A known place
 * contributes its own suggestions; anything else just falls back to the time of
 * day, since a suggestion nobody can act on is worse than a generic one.
 */
export function recommendedScenarios(bucket: TimeBucket, location?: string | null): string[] {
  const byTime = TIME_SCENARIOS[bucket] ?? TIME_SCENARIOS.afternoon;
  const key = (location ?? '').trim().toLowerCase() as LocationBucket;
  const byPlace = LOCATION_SCENARIOS[key] ?? [];
  if (byPlace.length === 0) return byTime.slice(0, 4);
  return [...byPlace.slice(0, 2), ...byTime.slice(0, 2)].slice(0, 4);
}

