import { NextResponse } from 'next/server';
import { isSttConfigured, transcribe, MAX_AUDIO_BYTES } from '@/lib/stt';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Turns a short recording into text.
 *
 * The body is raw audio bytes, with the recorder's own mime type in
 * Content-Type. The API key stays on this side; the browser only ever sends
 * audio and receives a string.
 */
export async function POST(request: Request) {
  if (!isSttConfigured()) {
    return NextResponse.json(
      { error: 'DEEPGRAM_API_KEY is not set.', fallback: 'type' },
      { status: 503 },
    );
  }

  const mime = request.headers.get('content-type') || 'audio/webm';

  let audio: Buffer;
  try {
    audio = Buffer.from(await request.arrayBuffer());
  } catch {
    return NextResponse.json({ error: 'Could not read the recording.' }, { status: 400 });
  }

  if (audio.length === 0) {
    return NextResponse.json({ error: 'Nothing was recorded.' }, { status: 400 });
  }
  if (audio.length > MAX_AUDIO_BYTES) {
    return NextResponse.json({ error: 'That recording is too long.' }, { status: 413 });
  }

  try {
    const { transcript, confidence } = await transcribe(audio, mime);
    return NextResponse.json({ transcript, confidence });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Transcription failed.';
    return NextResponse.json({ error: message, fallback: 'type' }, { status: 502 });
  }
}
