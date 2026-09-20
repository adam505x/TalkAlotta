/**
 * Voice resolution for Deepgram Aura.
 *
 * Accent and gender are properties of a voice model, not call parameters: a
 * model is chosen by name. So the onboarding answers do not get passed to the
 * speech call. They resolve to a Deepgram Aura model here, and that model is
 * what the speak request receives.
 *
 * Nationality is stored as a country name (e.g. "Ireland"). It is mapped to an
 * accent region first, then matched against the table below.
 */

export interface VoiceProfileInput {
  age?: number | null;
  gender?: string | null;
  nationality?: string | null;
}

export interface ResolvedVoice {
  /** Deepgram Aura model, e.g. aura-angus-en. */
  voiceId: string;
  label: string;
  /** Shown to the caregiver on the confirm step. */
  rationale: string;
}

type Accent =
  | 'american'
  | 'british'
  | 'irish'
  | 'australian'
  | 'indian'
  | 'south_african'
  | 'canadian';

type AgeBand = 'child' | 'teen' | 'adult';

/** Fallback when nothing in the table matches. */
const STOCK_VOICE_ID = process.env.DEEPGRAM_VOICE || 'aura-helios-en';
const STOCK_VOICE_LABEL = 'British, man';

/**
 * Country name (lowercased) → accent. Aliases from lib/countries are included
 * so free-typed answers still land somewhere sensible.
 */
const NATIONALITY_TO_ACCENT: Record<string, Accent> = {
  'united states': 'american',
  usa: 'american',
  us: 'american',
  america: 'american',
  'united states of america': 'american',
  canada: 'canadian',
  england: 'british',
  english: 'british',
  'united kingdom': 'british',
  uk: 'british',
  britain: 'british',
  'great britain': 'british',
  gb: 'british',
  wales: 'british',
  welsh: 'british',
  cymru: 'british',
  scotland: 'british',
  scottish: 'british',
  scots: 'british',
  ireland: 'irish',
  eire: 'irish',
  'republic of ireland': 'irish',
  'northern ireland': 'irish',
  ulster: 'irish',
  australia: 'australian',
  aussie: 'australian',
  oz: 'australian',
  'new zealand': 'australian',
  kiwi: 'australian',
  aotearoa: 'australian',
  india: 'indian',
  'south africa': 'south_african',
};

/**
 * Deepgram Aura English models.
 * @see https://developers.deepgram.com/docs/tts-models
 */
const VOICES = {
  // American female
  asteria: 'aura-asteria-en',
  luna: 'aura-luna-en',
  stella: 'aura-stella-en',
  hera: 'aura-hera-en',
  // American male
  orion: 'aura-orion-en',
  arcas: 'aura-arcas-en',
  perseus: 'aura-perseus-en',
  orpheus: 'aura-orpheus-en',
  zeus: 'aura-zeus-en',
  // British
  athena: 'aura-athena-en', // female
  helios: 'aura-helios-en', // male
  // Irish
  angus: 'aura-angus-en', // male
} as const;

export function isDeepgramVoiceId(voiceId: string | null | undefined): boolean {
  return Boolean(voiceId && voiceId.startsWith('aura-'));
}

const VOICE_TABLE: {
  accent?: Accent;
  gender?: string;
  ageBand?: AgeBand;
  voiceId: string;
  label: string;
}[] = [
  // Irish — Angus is the dedicated Irish male; Athena (British) is the closest female.
  { accent: 'irish', gender: 'female', ageBand: 'child', voiceId: VOICES.athena, label: 'Irish-leaning, girl' },
  { accent: 'irish', gender: 'female', ageBand: 'teen', voiceId: VOICES.athena, label: 'Irish-leaning, young woman' },
  { accent: 'irish', gender: 'female', voiceId: VOICES.athena, label: 'Irish-leaning, woman' },
  { accent: 'irish', gender: 'male', ageBand: 'child', voiceId: VOICES.angus, label: 'Irish, boy' },
  { accent: 'irish', gender: 'male', ageBand: 'teen', voiceId: VOICES.angus, label: 'Irish, young man' },
  { accent: 'irish', gender: 'male', voiceId: VOICES.angus, label: 'Irish, man' },
  { accent: 'irish', voiceId: VOICES.angus, label: 'Irish' },

  // British
  { accent: 'british', gender: 'female', ageBand: 'child', voiceId: VOICES.athena, label: 'British, girl' },
  { accent: 'british', gender: 'female', ageBand: 'teen', voiceId: VOICES.athena, label: 'British, young woman' },
  { accent: 'british', gender: 'female', voiceId: VOICES.athena, label: 'British, woman' },
  { accent: 'british', gender: 'male', ageBand: 'child', voiceId: VOICES.helios, label: 'British, boy' },
  { accent: 'british', gender: 'male', ageBand: 'teen', voiceId: VOICES.helios, label: 'British, young man' },
  { accent: 'british', gender: 'male', voiceId: VOICES.helios, label: 'British, man' },
  { accent: 'british', voiceId: VOICES.helios, label: 'British' },

  // American
  { accent: 'american', gender: 'female', ageBand: 'child', voiceId: VOICES.luna, label: 'American, girl' },
  { accent: 'american', gender: 'female', ageBand: 'teen', voiceId: VOICES.stella, label: 'American, young woman' },
  { accent: 'american', gender: 'female', voiceId: VOICES.asteria, label: 'American, woman' },
  { accent: 'american', gender: 'male', ageBand: 'child', voiceId: VOICES.orpheus, label: 'American, boy' },
  { accent: 'american', gender: 'male', ageBand: 'teen', voiceId: VOICES.orion, label: 'American, young man' },
  { accent: 'american', gender: 'male', voiceId: VOICES.zeus, label: 'American, man' },
  { accent: 'american', voiceId: VOICES.asteria, label: 'American' },

  // Canadian → American models
  { accent: 'canadian', gender: 'female', ageBand: 'child', voiceId: VOICES.luna, label: 'Canadian, girl' },
  { accent: 'canadian', gender: 'female', voiceId: VOICES.asteria, label: 'Canadian, woman' },
  { accent: 'canadian', gender: 'male', ageBand: 'child', voiceId: VOICES.orpheus, label: 'Canadian, boy' },
  { accent: 'canadian', gender: 'male', voiceId: VOICES.arcas, label: 'Canadian, man' },
  { accent: 'canadian', voiceId: VOICES.arcas, label: 'Canadian' },

  // Australian / NZ — no dedicated Aura accent; American as closest clear English
  { accent: 'australian', gender: 'female', ageBand: 'child', voiceId: VOICES.luna, label: 'Australian-leaning, girl' },
  { accent: 'australian', gender: 'female', voiceId: VOICES.stella, label: 'Australian-leaning, woman' },
  { accent: 'australian', gender: 'male', ageBand: 'child', voiceId: VOICES.orion, label: 'Australian-leaning, boy' },
  { accent: 'australian', gender: 'male', voiceId: VOICES.perseus, label: 'Australian-leaning, man' },
  { accent: 'australian', voiceId: VOICES.orion, label: 'Australian-leaning' },

  // Indian English — closest available
  { accent: 'indian', gender: 'female', voiceId: VOICES.hera, label: 'Indian English-leaning, woman' },
  { accent: 'indian', gender: 'male', voiceId: VOICES.zeus, label: 'Indian English-leaning, man' },
  { accent: 'indian', voiceId: VOICES.hera, label: 'Indian English-leaning' },

  // South African — British models
  { accent: 'south_african', gender: 'female', voiceId: VOICES.athena, label: 'South African-leaning, woman' },
  { accent: 'south_african', gender: 'male', voiceId: VOICES.helios, label: 'South African-leaning, man' },
  { accent: 'south_african', voiceId: VOICES.helios, label: 'South African-leaning' },
];

function ageBand(age?: number | null): AgeBand {
  if (age == null) return 'child';
  if (age < 13) return 'child';
  if (age < 20) return 'teen';
  return 'adult';
}

function accentFor(nationality?: string | null): Accent | null {
  if (!nationality) return null;
  const key = nationality.toLowerCase().trim();
  if (NATIONALITY_TO_ACCENT[key]) return NATIONALITY_TO_ACCENT[key];

  for (const [name, accent] of Object.entries(NATIONALITY_TO_ACCENT)) {
    if (name.length >= 4 && key.includes(name)) return accent;
  }
  return null;
}

function matchScore(
  row: (typeof VOICE_TABLE)[number],
  accent: Accent | null,
  gender: string | null,
  band: AgeBand,
): number {
  let score = 0;

  if (row.accent) {
    if (!accent || row.accent !== accent) return -1;
    score += 4;
  }
  if (row.gender) {
    if (!gender || row.gender !== gender) return -1;
    score += 2;
  }
  if (row.ageBand) {
    if (row.ageBand !== band) return -1;
    score += 1;
  }

  return score;
}

export function resolveVoice(input: VoiceProfileInput): ResolvedVoice {
  const band = ageBand(input.age);
  const gender = input.gender?.toLowerCase() || null;
  const usableGender = gender === 'female' || gender === 'male' ? gender : null;
  const accent = accentFor(input.nationality);
  const nationality = input.nationality?.trim() || null;

  let best: (typeof VOICE_TABLE)[number] | null = null;
  let bestScore = -1;

  for (const row of VOICE_TABLE) {
    const score = matchScore(row, accent, usableGender, band);
    if (score > bestScore) {
      bestScore = score;
      best = row;
    }
  }

  if (best && bestScore > 0) {
    const parts = [nationality, usableGender, band].filter(Boolean).join(', ');
    return {
      voiceId: best.voiceId,
      label: best.label,
      rationale: parts
        ? `Matched to ${parts}.`
        : 'Matched to the answers you gave.',
    };
  }

  const described = [nationality, usableGender, band].filter(Boolean).join(', ');
  return {
    voiceId: STOCK_VOICE_ID,
    label: STOCK_VOICE_LABEL,
    rationale: described
      ? `No exact accent match for ${described}, so a standard British voice is used.`
      : 'One standard voice is available at the moment.',
  };
}

export { STOCK_VOICE_ID };
