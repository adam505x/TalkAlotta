import crypto from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { db, schema } from './db';

/**
 * Text to speech via Deepgram Aura, server side only.
 *
 * The API key never reaches the browser. The page asks this server for audio and
 * plays the bytes it gets back.
 *
 * Caching is the whole reason this is careful. An AAC communicator presses
 * "more" dozens of times a day, and every press would otherwise be billed
 * again.
 *
 * WHY RAW PCM RATHER THAN MP3: Aura leaves almost no silence after the last
 * sound — "wash" ends 18ms after the final "sh". An MP3 frame is over 50ms, so a
 * browser decoder drops the tail and the word comes out as "wa". Asking for
 * linear16 and assembling the container here means the bytes are exact and a pad
 * can be appended, which is the actual fix rather than a workaround.
 *
 * WHAT IS CACHED: the per-word PCM, not the finished clip. Words are what repeat,
 * both across presses and between sentences, so "I want more" and "I want help"
 * share everything but the last word. Wrapping PCM into a WAV is a buffer copy,
 * so the finished clip is rebuilt each time rather than stored twice.
 */

const PROVIDER = 'deepgram';
const MIME = 'audio/wav';

/** Aura's linear16 output. 24kHz mono is one of the rates it accepts. */
const SAMPLE_RATE = 24000;
const CHANNELS = 1;
const BYTES_PER_SAMPLE = 2;

/**
 * Appended to every clip so the final consonant is never cut off, and so a press
 * does not run straight into whatever plays next.
 */
const TAIL_PAD_MS = 140;

/** Break between words when a whole sentence is spoken. */
const WORD_GAP_MS = 180;

/**
 * Anything under this counts as silence when trimming. 300/32768 is about -40dB,
 * below the noise floor of Aura's output but well under a quiet consonant.
 */
const SILENCE_FLOOR = 300;

/** Silence left on each side when trimming, so a soft onset is never clipped. */
const TRIM_GUARD_MS = 15;

export function isTtsConfigured(): boolean {
  return Boolean(process.env.DEEPGRAM_API_KEY);
}

/**
 * Aura returns near-silence for a few isolated words: "it" comes back at a peak
 * amplitude of 0.001, which is inaudible. Spelling it for the model is the only
 * lever available, since there is no pronunciation API. Only single words are
 * remapped; inside a sentence the surrounding words carry it fine.
 */
const PRONUNCIATION: Record<string, string> = {
  it: 'itt',
};

/** What actually gets sent to Deepgram for one word or phrase. */
export function speakableText(text: string): string {
  const t = text.trim();
  if (!t) return t;
  if (t.split(/\s+/).length === 1) {
    return PRONUNCIATION[t.toLowerCase()] ?? t;
  }
  return t;
}

function cacheKeyFor(text: string, voiceId: string): string {
  // The namespace covers the audio format as well as the provider, so clips made
  // before the move to PCM are never served back.
  return crypto
    .createHash('sha256')
    .update(`${PROVIDER}|pcm${SAMPLE_RATE}|${voiceId}|${text}`)
    .digest('hex');
}

export interface SpeechResult {
  bytes: Buffer;
  mime: string;
  /** True only when nothing had to be generated. */
  cached: boolean;
  /** Characters actually sent to Deepgram, so a cache hit reads as zero. */
  charCount: number;
  modelId: string;
  voiceId: string;
}

function silence(ms: number): Buffer {
  const samples = Math.round((SAMPLE_RATE * ms) / 1000);
  return Buffer.alloc(samples * CHANNELS * BYTES_PER_SAMPLE);
}

/**
 * Cuts the silence off both ends of a clip.
 *
 * Aura pads each clip by a different amount, so joining clips as they arrive gave
 * breaks between 200ms and 320ms — audibly uneven. Trimming first means the gap
 * between two words is exactly the gap that was asked for.
 */
function trimSilence(pcm: Buffer): Buffer {
  const samples = Math.floor(pcm.length / BYTES_PER_SAMPLE);
  let first = 0;
  while (first < samples && Math.abs(pcm.readInt16LE(first * BYTES_PER_SAMPLE)) <= SILENCE_FLOOR) {
    first++;
  }
  if (first === samples) return Buffer.alloc(0); // nothing audible at all

  let last = samples - 1;
  while (last > first && Math.abs(pcm.readInt16LE(last * BYTES_PER_SAMPLE)) <= SILENCE_FLOOR) {
    last--;
  }

  const guard = Math.round((SAMPLE_RATE * TRIM_GUARD_MS) / 1000);
  const start = Math.max(0, first - guard);
  const end = Math.min(samples, last + 1 + guard);
  return pcm.subarray(start * BYTES_PER_SAMPLE, end * BYTES_PER_SAMPLE);
}

/** Wraps raw signed 16-bit little-endian PCM in a WAV header. */
function toWav(pcm: Buffer): Buffer {
  const byteRate = SAMPLE_RATE * CHANNELS * BYTES_PER_SAMPLE;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // PCM fmt chunk size
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(CHANNELS, 22);
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(CHANNELS * BYTES_PER_SAMPLE, 32);
  header.writeUInt16LE(8 * BYTES_PER_SAMPLE, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

async function fetchPcm(text: string, voiceModel: string): Promise<Buffer> {
  const key = process.env.DEEPGRAM_API_KEY;
  if (!key) throw new Error('DEEPGRAM_API_KEY is not set.');

  const url = new URL('https://api.deepgram.com/v1/speak');
  url.searchParams.set('model', voiceModel);
  url.searchParams.set('encoding', 'linear16');
  url.searchParams.set('sample_rate', String(SAMPLE_RATE));
  url.searchParams.set('container', 'none');

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Token ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(
      `Deepgram TTS failed (${response.status})${detail ? `: ${detail.slice(0, 200)}` : '.'}`,
    );
  }

  return Buffer.from(await response.arrayBuffer());
}

interface PcmPiece {
  pcm: Buffer;
  cached: boolean;
  charCount: number;
}

/** PCM for one word or phrase, from the cache when it is already there. */
async function pcmFor(rawText: string, voiceId: string): Promise<PcmPiece> {
  const speakAs = speakableText(rawText);
  const cacheKey = cacheKeyFor(speakAs, voiceId);

  const hit = db
    .select()
    .from(schema.audioCache)
    .where(eq(schema.audioCache.cacheKey, cacheKey))
    .get();

  if (hit) {
    db.update(schema.audioCache)
      .set({ hits: sql`${schema.audioCache.hits} + 1` })
      .where(eq(schema.audioCache.cacheKey, cacheKey))
      .run();
    return { pcm: Buffer.from(hit.bytes as Buffer), cached: true, charCount: 0 };
  }

  const pcm = await fetchPcm(speakAs, voiceId);
  if (pcm.length === 0) throw new Error('Deepgram returned empty audio.');

  db.insert(schema.audioCache)
    .values({
      cacheKey,
      text: speakAs,
      voiceId,
      modelId: voiceId,
      mime: 'audio/l16',
      bytes: pcm,
      charCount: speakAs.length,
      hits: 0,
    })
    .onConflictDoNothing()
    .run();

  return { pcm, cached: false, charCount: speakAs.length };
}

/**
 * Audio for a single press. `voiceId` is an Aura model, e.g. aura-angus-en.
 */
export async function synthesize(rawText: string, voiceId: string): Promise<SpeechResult> {
  const text = rawText.trim();
  if (!text) throw new Error('Nothing to speak.');
  if (!isTtsConfigured()) throw new Error('DEEPGRAM_API_KEY is not set.');

  const piece = await pcmFor(text, voiceId);
  // Trimming the front makes the press feel immediate; the pad protects the tail.
  // If a clip is silent throughout, keep it whole rather than emitting nothing.
  const trimmed = trimSilence(piece.pcm);
  const body = trimmed.length > 0 ? trimmed : piece.pcm;

  return {
    bytes: toWav(Buffer.concat([body, silence(TAIL_PAD_MS)])),
    mime: MIME,
    cached: piece.cached,
    charCount: piece.charCount,
    modelId: voiceId,
    voiceId,
  };
}

/**
 * How a built-up sentence is spoken.
 *
 *   'natural'  - the whole sentence goes to Deepgram as one punctuated string,
 *                so Aura gives it a single intonation contour, correct stress
 *                and real coarticulation. This is what makes it sound like a
 *                person rather than a list of words.
 *   'per-word' - each word synthesised separately and joined with silence.
 *                Every word then sounds exactly as it does when its own tile is
 *                pressed. More predictable, audibly robotic.
 *
 * Set TTS_SENTENCE_MODE=per-word to switch back.
 *
 * An earlier note in this file warned against Deepgram's "..." pause markers
 * between words - they make short words rush and put a hiss on "stop". That
 * finding still holds and this does not undo it: we are not inserting pause
 * markers between words, we are sending one ordinary punctuated sentence,
 * which is what Deepgram's own formatting guidance asks for.
 *
 * @see https://developers.deepgram.com/docs/improving-aura-2-formatting
 */
export type SentenceMode = 'natural' | 'per-word';

const SENTENCE_MODE: SentenceMode =
  process.env.TTS_SENTENCE_MODE === 'per-word' ? 'per-word' : 'natural';

/**
 * Wh-words. A board sentence opening with one of these is a question, and the
 * question mark is what makes Aura raise the pitch at the end.
 *
 * Kept to wh-words on purpose. "do", "can" and "is" also open questions in
 * English, but they are ordinary board verbs too - "I do", "can go" - and
 * turning those into questions would be worse than leaving them flat.
 */
const QUESTION_OPENERS = new Set([
  'what', 'where', 'who', 'why', 'when', 'how', 'which', 'whose',
]);

/**
 * Builds the string actually sent to Deepgram for a whole sentence.
 *
 * Punctuation is the prosody lever Aura exposes, and it is a real one: a
 * terminal full stop produces a falling contour, a question mark a rising one.
 * Without this every question a communicator asks comes out sounding like a
 * statement, which is a communication failure rather than a cosmetic one.
 */
export function sentenceText(words: string[]): string {
  const parts = words.map((w) => w.trim()).filter(Boolean);
  if (parts.length === 0) return '';

  let text = parts.join(' ').replace(/\s+/g, ' ').trim();
  text = text.charAt(0).toUpperCase() + text.slice(1);

  if (!/[.!?]$/.test(text)) {
    const opener = parts[0].toLowerCase().replace(/[^a-z]/g, '');
    text += QUESTION_OPENERS.has(opener) ? '?' : '.';
  }
  return text;
}

/**
 * Audio for a built-up sentence.
 *
 * One Deepgram call on the punctuated sentence, cached under that whole string.
 * Sentences repeat in AAC use - "I want more", "I need help" - so the cache
 * still earns its keep here, and a single press keeps using the per-word cache
 * exactly as before.
 */
export async function synthesizeSentence(
  words: string[],
  voiceId: string,
): Promise<SpeechResult> {
  const parts = words.map((w) => w.trim()).filter(Boolean);
  if (parts.length === 0) throw new Error('Nothing to speak.');
  if (!isTtsConfigured()) throw new Error('DEEPGRAM_API_KEY is not set.');
  // One word has to sound the same as it does when its own tile is pressed.
  if (parts.length === 1) return synthesize(parts[0], voiceId);

  if (SENTENCE_MODE === 'per-word') return synthesizeSentenceByWord(parts, voiceId);

  const piece = await pcmFor(sentenceText(parts), voiceId);
  const trimmed = trimSilence(piece.pcm);
  const body = trimmed.length > 0 ? trimmed : piece.pcm;

  return {
    bytes: toWav(Buffer.concat([body, silence(TAIL_PAD_MS)])),
    mime: MIME,
    cached: piece.cached,
    charCount: piece.charCount,
    modelId: voiceId,
    voiceId,
  };
}

/**
 * The original behaviour: every word its own clip, joined with a fixed break.
 * Kept whole so TTS_SENTENCE_MODE=per-word restores it exactly.
 */
async function synthesizeSentenceByWord(
  parts: string[],
  voiceId: string,
): Promise<SpeechResult> {
  const gap = silence(WORD_GAP_MS);
  const chunks: Buffer[] = [];
  let cached = true;
  let charCount = 0;

  for (let i = 0; i < parts.length; i++) {
    const piece = await pcmFor(parts[i], voiceId);
    if (!piece.cached) cached = false;
    charCount += piece.charCount;

    const body = trimSilence(piece.pcm);
    if (body.length === 0) continue; // a word Aura rendered as silence
    if (chunks.length > 0) chunks.push(gap);
    chunks.push(body);
  }

  if (chunks.length === 0) throw new Error('Deepgram returned empty audio.');
  chunks.push(silence(TAIL_PAD_MS));

  return {
    bytes: toWav(Buffer.concat(chunks)),
    mime: MIME,
    cached,
    charCount,
    modelId: voiceId,
    voiceId,
  };
}

/** Characters actually sent to Deepgram so far, for keeping an eye on usage. */
export function creditsSpent(): { characters: number; clips: number; cacheHits: number } {
  const row = db
    .select({
      characters: sql<number>`coalesce(sum(${schema.audioCache.charCount}), 0)`,
      clips: sql<number>`count(*)`,
      cacheHits: sql<number>`coalesce(sum(${schema.audioCache.hits}), 0)`,
    })
    .from(schema.audioCache)
    .get();
  return row ?? { characters: 0, clips: 0, cacheHits: 0 };
}

export { PROVIDER as TTS_PROVIDER };
