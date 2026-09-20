/**
 * Speech to text via Deepgram, server side only.
 *
 * The caregiver holds a child in one hand and an iPad in the other. Typing what
 * is happening is the one thing they cannot do in that moment, which is exactly
 * when the board most needs to know. So the situation box takes speech.
 *
 * The API key never reaches the browser, same as lib/tts.ts: the page posts
 * audio bytes here and gets a string back.
 *
 * Prerecorded rather than streaming on purpose. A situation is one short phrase,
 * not a conversation - "we're at the park", "getting ready for swimming". A
 * single request is simpler, cheaper, and has no socket to drop mid-sentence.
 *
 * @see https://developers.deepgram.com/docs/pre-recorded-audio
 */

const ENDPOINT = 'https://api.deepgram.com/v1/listen';

/** Nova-3 is Deepgram's current general model. */
const MODEL = 'nova-3';

/** A situation is a phrase. Anything longer is a misfire, not a description. */
export const MAX_AUDIO_BYTES = 5 * 1024 * 1024;

export function isSttConfigured(): boolean {
  return Boolean(process.env.DEEPGRAM_API_KEY);
}

export interface Transcription {
  transcript: string;
  confidence: number;
}

/**
 * Transcribes one short clip.
 *
 * `mime` is whatever MediaRecorder produced - audio/webm in Chrome, audio/mp4
 * in Safari. Deepgram sniffs the container, so it is passed straight through
 * rather than being converted here.
 */
export async function transcribe(audio: Buffer, mime: string): Promise<Transcription> {
  const key = process.env.DEEPGRAM_API_KEY;
  if (!key) throw new Error('DEEPGRAM_API_KEY is not set.');
  if (audio.length === 0) throw new Error('No audio was recorded.');
  if (audio.length > MAX_AUDIO_BYTES) throw new Error('That recording is too long.');

  const url = new URL(ENDPOINT);
  url.searchParams.set('model', MODEL);
  url.searchParams.set('language', 'en');
  url.searchParams.set('punctuate', 'true');
  // smart_format is left off deliberately. It rewrites numbers and addresses
  // into display form, which helps a transcript and hurts us: the string goes
  // to keyword extraction, not to a reader.
  url.searchParams.set('smart_format', 'false');

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Token ${key}`,
      'Content-Type': mime || 'audio/webm',
    },
    body: new Uint8Array(audio),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(
      `Deepgram transcription failed (${response.status})${detail ? `: ${detail.slice(0, 200)}` : '.'}`,
    );
  }

  const body = (await response.json()) as {
    results?: {
      channels?: { alternatives?: { transcript?: string; confidence?: number }[] }[];
    };
  };

  const best = body.results?.channels?.[0]?.alternatives?.[0];
  const transcript = (best?.transcript ?? '').trim();

  if (!transcript) throw new Error('Nothing was heard. Try again, or type it.');

  return { transcript, confidence: best?.confidence ?? 0 };
}
