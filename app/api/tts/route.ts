import { NextResponse } from 'next/server';
import { isTtsConfigured, synthesize } from '@/lib/tts';
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
 */
export async function POST(request: Request) {
  let body: { text?: unknown; kind?: unknown; boardId?: unknown; record?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Expected JSON.' }, { status: 400 });
  }

  const text = String(body.text ?? '').trim();
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

  try {
    const result = await synthesize(text, voiceId);

    // "say it" plays words one-by-one and logs the full sentence itself, so those
    // per-word fetches pass record: false.
    const shouldRecord = body.record !== false;
    if (shouldRecord) {
      const kind = body.kind === 'sentence' ? 'sentence' : 'word';
      db.insert(schema.utterances)
        .values({
          text,
          kind,
          wordCount: text.split(/\s+/).filter(Boolean).length,
          boardId: typeof body.boardId === 'number' ? body.boardId : null,
          timeBucket: timeOfDay(),
        })
        .run();
    }

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
