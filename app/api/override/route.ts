import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { recordFeedback } from '@/lib/symbol-search';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Pins a picture to a word.
 *
 * A swap applies to that word everywhere, not just on the board it was made from,
 * and it outranks anything the library returns. That is the single most useful
 * personalisation in real use: the library will never have a picture of this
 * particular child's cup.
 *
 * The swap is also written to the learning data as a replacement, so ranking can
 * prefer it and stop offering the rejected one.
 */
export async function POST(request: Request) {
  let body: {
    term?: unknown;
    imageUrl?: unknown;
    source?: unknown;
    license?: unknown;
    author?: unknown;
    symbolId?: unknown;
    replacedImageUrl?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Expected JSON.' }, { status: 400 });
  }

  const term = String(body.term ?? '')
    .trim()
    .toLowerCase();
  const imageUrl = String(body.imageUrl ?? '').trim();

  if (!term || !imageUrl) {
    return NextResponse.json({ error: 'A word and a picture are both needed.' }, { status: 400 });
  }

  db.insert(schema.symbolOverrides)
    .values({
      term,
      imageUrl,
      source: body.source ? String(body.source) : null,
      license: body.license ? String(body.license) : null,
      author: body.author ? String(body.author) : null,
    })
    .onConflictDoUpdate({
      target: schema.symbolOverrides.term,
      set: {
        imageUrl,
        source: body.source ? String(body.source) : null,
        license: body.license ? String(body.license) : null,
        author: body.author ? String(body.author) : null,
      },
    })
    .run();

  // The picture that was rejected, so it stops being offered first.
  if (body.replacedImageUrl) {
    recordFeedback(term, 'rejected', { imageUrl: String(body.replacedImageUrl) });
  }
  recordFeedback(term, 'replaced', {
    id: body.symbolId ? String(body.symbolId) : null,
    imageUrl,
  });

  // The fixed-vocabulary cache for this word is now stale.
  db.delete(schema.wordSymbols).where(eq(schema.wordSymbols.term, term)).run(); // term is already lowercased

  return NextResponse.json({ ok: true, term, imageUrl });
}

/** Removes a pinned picture so the word goes back to the library result. */
export async function DELETE(request: Request) {
  const url = new URL(request.url);
  const term = (url.searchParams.get('term') || '').trim().toLowerCase();
  if (!term) return NextResponse.json({ error: 'term required.' }, { status: 400 });

  db.delete(schema.symbolOverrides).where(eq(schema.symbolOverrides.term, term)).run();
  db.delete(schema.wordSymbols).where(eq(schema.wordSymbols.term, term)).run(); // term is already lowercased
  return NextResponse.json({ ok: true });
}
