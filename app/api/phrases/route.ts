import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { recordEvents } from '@/lib/analytics';
import { iconForPhrase } from '@/lib/replies';
import {
  listedPhrases,
  PHRASE_MAX_CHARS,
  PHRASES_CAP,
  PHRASES_FOLDER_ID,
  PHRASES_PAGE_ID,
} from '@/lib/phrases';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Pins a spoken phrase as a one-tap button in My phrases.
 *
 * The caregiver sees common phrases on the dashboard and chooses which ones
 * belong on the board. Location is left empty so a favourite sentence is there
 * at home and at school.
 */
export async function POST(request: Request) {
  let body: { phrase?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Expected JSON.' }, { status: 400 });
  }

  const text = String(body.phrase ?? '')
    .trim()
    .replace(/\s+/g, ' ');
  if (!text) {
    return NextResponse.json({ error: 'Nothing to pin.' }, { status: 400 });
  }
  if (text.length > PHRASE_MAX_CHARS) {
    return NextResponse.json({ error: 'That phrase is too long to make a button.' }, { status: 400 });
  }

  const existing = listedPhrases();
  if (existing.some((row) => row.toLowerCase() === text.toLowerCase())) {
    return NextResponse.json({ error: 'That phrase is already a button.' }, { status: 409 });
  }
  if (existing.length >= PHRASES_CAP) {
    return NextResponse.json(
      { error: `My phrases is full (${PHRASES_CAP}). Remove one first.` },
      { status: 409 },
    );
  }

  const imageUrl = (await iconForPhrase(text)) ?? '';
  if (imageUrl) {
    const key = text.toLowerCase();
    db.insert(schema.symbolOverrides)
      .values({ term: key, imageUrl, source: 'phrase' })
      .onConflictDoUpdate({
        target: schema.symbolOverrides.term,
        set: { imageUrl, source: 'phrase' },
      })
      .run();
    db.delete(schema.wordSymbols).where(eq(schema.wordSymbols.term, key)).run();
  }

  db.insert(schema.folderWords)
    .values({ folderId: PHRASES_FOLDER_ID, term: text, role: 'noun', location: null })
    .run();

  recordEvents([
    {
      type: 'word_added',
      term: text,
      label: text,
      folderId: PHRASES_PAGE_ID,
      source: 'caregiver',
    },
  ]);

  return NextResponse.json({ ok: true, term: text, imageUrl });
}
