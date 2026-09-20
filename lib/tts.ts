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
 * again. Audio is cached by text + voice model.
 *
 * THE GOTCHA: the speak endpoint returns a stream/body. It is fully buffered
 * into bytes before it is stored, and bytes are what the cache hands back.
 */

/** Cache namespace so a provider swap does not serve the wrong clips. */
const PROVIDER = 'deepgram';
const MIME = 'audio/mpeg';

export function isTtsConfigured(): boolean {
  return Boolean(process.env.DEEPGRAM_API_KEY);
}

/**
 * Aura returns near-silence for a few isolated words (notably "it"). Map those
 * to a close audible spelling for single-word taps. Full sentences are left
 * alone — "it" is fine inside a phrase.
 */
const PRONUNCIATION: Record<string, string> = {
  it: 'itt',
};

/**
 * Text sent to Deepgram for a single clip. Sentences (multiple words) pass
 * through unchanged so speech stays natural.
 */
export function speakableText(text: string): string {
  const t = text.trim();
  if (!t) return t;
  const words = t.split(/\s+/);
  if (words.length === 1) {
    const key = words[0].toLowerCase();
    return PRONUNCIATION[key] ?? words[0];
  }
  return t;
}

function cacheKeyFor(text: string, voiceId: string): string {
  return crypto.createHash('sha256').update(`${PROVIDER}|${voiceId}|${text}`).digest('hex');
}

export interface SpeechResult {
  bytes: Buffer;
  mime: string;
  cached: boolean;
  charCount: number;
  modelId: string;
  voiceId: string;
}

function readCache(cacheKey: string) {
  return db.select().from(schema.audioCache).where(eq(schema.audioCache.cacheKey, cacheKey)).get();
}

async function fetchDeepgramAudio(text: string, voiceModel: string): Promise<Buffer> {
  const key = process.env.DEEPGRAM_API_KEY;
  if (!key) throw new Error('DEEPGRAM_API_KEY is not set.');

  const url = new URL('https://api.deepgram.com/v1/speak');
  url.searchParams.set('model', voiceModel);
  url.searchParams.set('encoding', 'mp3');

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

/**
 * Returns spoken audio for this text, from cache when possible.
 * A cache hit costs nothing and spends no characters.
 *
 * `voiceId` is a Deepgram Aura model name, e.g. aura-angus-en.
 */
export async function synthesize(rawText: string, voiceId: string): Promise<SpeechResult> {
  const text = rawText.trim();
  if (!text) throw new Error('Nothing to speak.');
  if (!isTtsConfigured()) throw new Error('DEEPGRAM_API_KEY is not set.');

  const speakAs = speakableText(text);
  // Include speakAs so padded short words do not reuse the old tiny clips.
  const cacheKey = cacheKeyFor(speakAs, voiceId);

  const hit = readCache(cacheKey);
  if (hit) {
    db.update(schema.audioCache)
      .set({ hits: sql`${schema.audioCache.hits} + 1` })
      .where(eq(schema.audioCache.cacheKey, cacheKey))
      .run();
    return {
      bytes: Buffer.from(hit.bytes as Buffer),
      mime: hit.mime,
      cached: true,
      charCount: hit.charCount,
      modelId: hit.modelId,
      voiceId: hit.voiceId,
    };
  }

  const bytes = await fetchDeepgramAudio(speakAs, voiceId);
  if (bytes.length === 0) throw new Error('Deepgram returned empty audio.');

  db.insert(schema.audioCache)
    .values({
      cacheKey,
      text: speakAs,
      voiceId,
      modelId: voiceId,
      mime: MIME,
      bytes,
      charCount: text.length,
      hits: 0,
    })
    .onConflictDoNothing()
    .run();

  return {
    bytes,
    mime: MIME,
    cached: false,
    charCount: text.length,
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
