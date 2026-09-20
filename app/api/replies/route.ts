import { NextResponse } from 'next/server';
import { readContext } from '@/lib/context';
import { generateReplies, resolveReplyIcons } from '@/lib/replies';

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
  let body: { heard?: string; avoid?: unknown };
  try {
    body = (await request.json()) as { heard?: string; avoid?: unknown };
  } catch {
    return NextResponse.json({ error: 'Could not read the request.' }, { status: 400 });
  }

  const heard = (body.heard ?? '').trim();
  if (!heard) {
    return NextResponse.json({ error: 'Nothing was heard.' }, { status: 400 });
  }

  // Replies already turned down for this turn, so a second ask gives new ones.
  const avoid = Array.isArray(body.avoid)
    ? body.avoid.map((a) => String(a).trim()).filter(Boolean).slice(0, 24)
    : [];

  const context = readContext(new URL(request.url).searchParams);

  try {
    const { replies, cached, generated } = await generateReplies(heard, context, avoid);
    // Pictures ride along in this response rather than being fetched per button:
    // six requests arriving one at a time would pop the buttons in front of
    // someone who is already reaching for them.
    const icons = await resolveReplyIcons(replies);
    return NextResponse.json({ heard, replies, icons, cached, generated });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not work out replies.';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
