/**
 * Voice resolution.
 *
 * Accent and gender are properties of a voice, not call parameters: a voice is
 * chosen by ID. So the onboarding answers do not get passed to the speech call.
 * They resolve to a voice ID here, and that ID is what the call receives.
 *
 * Right now this returns the same stock voice for every profile. That is
 * deliberate. The onboarding flow still asks, still stores the answers, and
 * still asks the caregiver to confirm the choice, so adding real accents and
 * genders later is a change to the table below and nothing else. No change to
 * onboarding, no change to the speech route, no change to the cache.
 */

export interface VoiceProfileInput {
  age?: number | null;
  gender?: string | null;
  nationality?: string | null;
}

export interface ResolvedVoice {
  voiceId: string;
  label: string;
  /** Shown to the caregiver on the confirm step. */
  rationale: string;
}

/** The single stock voice used for everything at this stage. */
const STOCK_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'JBFqnCBsd6RMkjVDRZzb';
const STOCK_VOICE_LABEL = 'Standard voice';

/**
 * TODO(voices): the real voice options go here.
 *
 * Shape this as a lookup keyed on the onboarding answers, for example:
 *
 *   const VOICE_TABLE = [
 *     { nationality: 'ie', gender: 'female', ageBand: 'child', voiceId: '...', label: 'Irish, girl' },
 *     { nationality: 'ie', gender: 'male',   ageBand: 'child', voiceId: '...', label: 'Irish, boy'  },
 *     { nationality: 'gb', gender: 'female', ageBand: 'adult', voiceId: '...', label: 'British, woman' },
 *   ];
 *
 * then match most-specific-first and fall back to STOCK_VOICE_ID. Populate it by
 * browsing the shared voice library for accent-matched voices; nothing else in
 * the app needs to change. Note that a demo set to one nationality speaking in
 * another accent undercuts the personalisation claim, so match the demo profile
 * first.
 */
const VOICE_TABLE: {
  nationality?: string;
  gender?: string;
  ageBand?: 'child' | 'teen' | 'adult';
  voiceId: string;
  label: string;
}[] = [];

function ageBand(age?: number | null): 'child' | 'teen' | 'adult' {
  if (age == null) return 'child';
  if (age < 13) return 'child';
  if (age < 20) return 'teen';
  return 'adult';
}

export function resolveVoice(input: VoiceProfileInput): ResolvedVoice {
  const band = ageBand(input.age);
  const gender = input.gender?.toLowerCase() || null;
  const nationality = input.nationality?.toLowerCase() || null;

  for (const row of VOICE_TABLE) {
    const nationalityOk = !row.nationality || row.nationality === nationality;
    const genderOk = !row.gender || row.gender === gender;
    const ageOk = !row.ageBand || row.ageBand === band;
    if (nationalityOk && genderOk && ageOk) {
      return {
        voiceId: row.voiceId,
        label: row.label,
        rationale: 'Matched to the answers you gave.',
      };
    }
  }

  const described = [nationality, gender, band].filter(Boolean).join(', ');
  return {
    voiceId: STOCK_VOICE_ID,
    label: STOCK_VOICE_LABEL,
    rationale: described
      ? `One standard voice is available at the moment, so this is used for ${described} too. Accent and gender matching is next.`
      : 'One standard voice is available at the moment.',
  };
}

export { STOCK_VOICE_ID };
