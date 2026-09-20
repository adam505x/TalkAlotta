import { NextResponse } from 'next/server';
import { isTtsConfigured, synthesize, synthesizeSentence } from '@/lib/tts';
import { getVoice } from '@/lib/profile';
import { db, schema } from '@/lib/db';
import { timeOfDay } from '@/lib/core-words';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Speaks text and returns the audio bytes.
 *
 * The API key stays here. The browser receives audio, never a key. The response
 * carries x-tts-cached so the client can show whether a press cost anything.
 *
 * A sentence arrives as `words` rather than one string, because the break between
 * words is inserted between clips. Splitting server-side would not do: a board
 * button can be a phrase, and "wash hands" has to stay one clip.
 */
export async function POST(request: Request) {
  let body: { text?: unknown; kind?: unknown; words?: unknown; boardId?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Expected JSON.' }, { status: 400 });
  }

  const words = Array.isArray(body.words)
    ? body.words.map((w) => String(w).trim()).filter(Boolean)
    : null;

  const text = String(body.text ?? '').trim() || (words ? words.join(' ') : '');
  if (!text) {
    return NextResponse.json({ error: 'Nothing to speak.' }, { status: 400 });
  }

  if (!isTtsConfigured()) {
    // The client falls back to the browser voice when this happens.
    return NextResponse.json(
      { error: 'DEEPGRAM_API_KEY is not set.', fallback: 'browser' },
      { status: 503 },
    );
  }

  const { voiceId } = getVoice();
  const kind = body.kind === 'sentence' ? 'sentence' : 'word';

  try {
    const result =
      kind === 'sentence' && words && words.length > 1
        ? await synthesizeSentence(words, voiceId)
        : await synthesize(text, voiceId);

    // Record what was actually said. The dashboard of most-said sentences is
    // deliberately later, but its data starts accumulating from the first press.
    db.insert(schema.utterances)
      .values({
        text,
        kind,
        wordCount: words ? words.length : text.split(/\s+/).filter(Boolean).length,
        boardId: typeof body.boardId === 'number' ? body.boardId : null,
        timeBucket: timeOfDay(),
      })
      .run();

    const bytes = new Uint8Array(result.bytes);
    return new Response(bytes, {
      status: 200,
      headers: {
        'Content-Type': result.mime,
        'Content-Length': String(bytes.byteLength),
        'Cache-Control': 'no-store',
        'x-tts-cached': result.cached ? '1' : '0',
        'x-tts-chars': String(result.charCount),
        'x-tts-model': result.modelId,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Speech failed.';
    return NextResponse.json({ error: message, fallback: 'browser' }, { status: 502 });
  }
}
