import { NextResponse } from 'next/server';
import { readContext } from '@/lib/context';
import { generateReplies } from '@/lib/replies';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Turns what was just said to the communicator into replies they can press.
 *
 * POST rather than GET because the heard sentence is the input and it does not
 * belong in a URL or a server log. The moment context rides along as query
 * params so the same readContext() the board uses can parse it.
 */
export async function POST(request: Request) {
  let body: { heard?: string };
  try {
    body = (await request.json()) as { heard?: string };
  } catch {
    return NextResponse.json({ error: 'Could not read the request.' }, { status: 400 });
  }

  const heard = (body.heard ?? '').trim();
  if (!heard) {
    return NextResponse.json({ error: 'Nothing was heard.' }, { status: 400 });
  }

  const context = readContext(new URL(request.url).searchParams);

  try {
    const { replies, cached, generated } = await generateReplies(heard, context);
    return NextResponse.json({ heard, replies, cached, generated });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not work out replies.';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
