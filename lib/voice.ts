/**
 * Voice resolution for Deepgram Aura.
 *
 * The board speaks English. The country question exists for one reason: to pick
 * the ACCENT of that English voice, so the person sounds like the people around
 * them. It is not a language switch - Aura's non-English models are trained on
 * their own language, and feeding English board words to a Dutch model would
 * mangle them.
 *
 * Deepgram ships five English accents. There is no point mapping 206 countries
 * one by one onto five buckets, so countries are grouped: the ones that clearly
 * belong to an accent are listed, and everything else falls to British, which is
 * the English taught across most of Europe, Africa, South Asia and the Middle
 * East. The fallback is stated to the caregiver rather than hidden.
 *
 * Two model families on purpose:
 *   - Aura-2 for American, British, Australian and Filipino. Newer, more voices.
 *   - Aura 1 for Irish. aura-angus-en is the only Irish voice Deepgram ships;
 *     Aura-2 has no en-ie at all. Dropping Aura 1 would lose it.
 *
 * @see https://developers.deepgram.com/docs/tts-models
 */

export type Accent = 'en-us' | 'en-gb' | 'en-ie' | 'en-au' | 'en-ph';

export interface VoiceProfileInput {
  age?: number | null;
  gender?: string | null;
  nationality?: string | null;
  /** Set from Settings when the caregiver picks an accent by hand. */
  accentOverride?: Accent | null;
}

export interface ResolvedVoice {
  /** Deepgram Aura model, e.g. aura-angus-en. */
  voiceId: string;
  label: string;
  /** Shown to the caregiver on the confirm step. */
  rationale: string;
  accent: Accent;
  /** True when the country was not in a group and British stood in. */
  isFallback: boolean;
}

type AgeBand = 'child' | 'teen' | 'adult';

export const ACCENT_LABEL: Record<Accent, string> = {
  'en-us': 'American',
  'en-gb': 'British',
  'en-ie': 'Irish',
  'en-au': 'Australian',
  'en-ph': 'Filipino',
};

/** Every accent Deepgram offers, for the Settings picker. */
export const ACCENTS: Accent[] = ['en-gb', 'en-us', 'en-ie', 'en-au', 'en-ph'];

/**
 * Voices per accent. `child` is a lighter voice used only when no gender was
 * given - the child voices are not published per gender, and guessing wrong
 * about someone's own speaking voice is worse than sounding a little older.
 *
 * en-ie has exactly one voice and it is male. A girl or woman set to Irish gets
 * the British female instead, and is told why, rather than being handed a voice
 * that is not hers.
 */
const VOICES: Record<Accent, { female: string | null; male: string; child?: string }> = {
  'en-us': { female: 'aura-2-asteria-en',  male: 'aura-2-zeus-en',      child: 'aura-2-luna-en' },
  'en-gb': { female: 'aura-2-pandora-en',  male: 'aura-2-draco-en' },
  'en-ie': { female: null,                 male: 'aura-angus-en' },     // Aura 1, the only Irish voice
  'en-au': { female: 'aura-2-theia-en',    male: 'aura-2-hyperion-en' },
  'en-ph': { female: 'aura-2-amalthea-en', male: 'aura-2-amalthea-en' },
};

/**
 * Countries grouped by accent. Only the non-default groups are listed - the rest
 * of the world falls to British, which is the English most of it is taught.
 */
const ACCENT_GROUPS: { accent: Accent; countries: string[] }[] = [
  {
    accent: 'en-ie',
    countries: ['ireland', 'eire', 'republic of ireland', 'northern ireland', 'ulster'],
  },
  {
    accent: 'en-au',
    countries: [
      'australia', 'aussie', 'oz', 'new zealand', 'kiwi', 'aotearoa',
      'fiji', 'papua new guinea', 'samoa', 'tonga', 'vanuatu', 'solomon islands',
    ],
  },
  {
    accent: 'en-ph',
    countries: ['philippines', 'the philippines', 'pilipinas'],
  },
  {
    accent: 'en-us',
    countries: [
      // the Americas
      'united states', 'united states of america', 'usa', 'us', 'america',
      'canada', 'mexico', 'brazil', 'argentina', 'chile', 'colombia', 'peru',
      'venezuela', 'ecuador', 'bolivia', 'paraguay', 'uruguay', 'guatemala',
      'cuba', 'haiti', 'honduras', 'nicaragua', 'costa rica', 'panama',
      'el salvador', 'dominican republic', 'puerto rico', 'belize', 'guyana',
      'suriname', 'jamaica', 'bahamas', 'barbados', 'trinidad and tobago',
      // places where American English is the taught standard
      'japan', 'south korea', 'korea', 'north korea', 'taiwan', 'china',
      'liberia', 'israel', 'saudi arabia',
    ],
  },
];

/** British is the default: most of Europe, Africa, South Asia and the Middle East. */
const DEFAULT_ACCENT: Accent = 'en-gb';

export function isDeepgramVoiceId(voiceId: string | null | undefined): boolean {
  return Boolean(voiceId && voiceId.startsWith('aura'));
}

function ageBand(age?: number | null): AgeBand {
  if (age == null) return 'child';
  if (age < 13) return 'child';
  if (age < 20) return 'teen';
  return 'adult';
}

function accentFor(nationality?: string | null): { accent: Accent; matched: boolean } {
  if (!nationality) return { accent: DEFAULT_ACCENT, matched: false };
  const key = nationality.toLowerCase().trim();

  for (const group of ACCENT_GROUPS) {
    if (group.countries.includes(key)) return { accent: group.accent, matched: true };
  }
  // A looser pass so free-typed answers ("the united states") still land.
  for (const group of ACCENT_GROUPS) {
    for (const name of group.countries) {
      if (name.length >= 5 && key.includes(name)) return { accent: group.accent, matched: true };
    }
  }
  return { accent: DEFAULT_ACCENT, matched: false };
}

export function resolveVoice(input: VoiceProfileInput): ResolvedVoice {
  const band = ageBand(input.age);
  const raw = input.gender?.toLowerCase() ?? null;
  const gender = raw === 'female' || raw === 'male' ? raw : null;
  const nationality = input.nationality?.trim() || null;

  const detected = accentFor(nationality);
  const accent = input.accentOverride ?? detected.accent;
  const set = VOICES[accent];

  // Irish has no female voice. Fall to British female and say so.
  let usedAccent = accent;
  let voiceId: string;
  let borrowedFemale = false;

  if (gender === 'male') {
    voiceId = set.male;
  } else if (gender === 'female') {
    if (set.female) {
      voiceId = set.female;
    } else {
      voiceId = VOICES['en-gb'].female as string;
      usedAccent = 'en-gb';
      borrowedFemale = true;
    }
  } else if (band === 'child' && set.child) {
    voiceId = set.child;
  } else {
    voiceId = set.female ?? set.male;
  }

  const who = [gender, band === 'adult' ? null : band].filter(Boolean).join(', ');
  const label = who ? `${ACCENT_LABEL[usedAccent]}, ${who}` : ACCENT_LABEL[usedAccent];

  let rationale: string;
  if (borrowedFemale) {
    rationale =
      `Deepgram's only Irish voice is a man's, so a British woman's voice is used ` +
      `instead. Any accent can be picked in Settings.`;
  } else if (input.accentOverride) {
    rationale = `${ACCENT_LABEL[accent]}, chosen in Settings.`;
  } else if (!detected.matched && nationality) {
    rationale =
      `Deepgram has no ${nationality} accent, so British is used - it is the ` +
      `English most widely taught. Any accent can be picked in Settings.`;
  } else if (nationality) {
    rationale = `${ACCENT_LABEL[accent]}, matched to ${nationality}.`;
  } else {
    rationale = `${ACCENT_LABEL[accent]} is the standard voice.`;
  }

  return { voiceId, label, rationale, accent: usedAccent, isFallback: !detected.matched };
}

export const STOCK_VOICE_ID = process.env.DEEPGRAM_VOICE || 'aura-2-draco-en';
