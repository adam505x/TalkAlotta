import { NextResponse } from 'next/server';
import { db, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { recordFeedback } from '@/lib/symbol-search';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml']);

/**
 * A caregiver's own photo for a word, for when the library has nothing suitable.
 *
 * Stored as bytes in the database rather than on disk, so there is no filesystem
 * dependency and the upload survives a restart. The upload is pinned to the word
 * straight away, which means it outranks every library result from then on.
 */
export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Expected a file upload.' }, { status: 400 });
  }

  const file = form.get('file');
  const term = String(form.get('term') ?? '')
    .trim()
    .toLowerCase();

  if (!term) return NextResponse.json({ error: 'Which word is this picture for?' }, { status: 400 });
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No picture was attached.' }, { status: 400 });
  }
  if (!ALLOWED.has(file.type)) {
    return NextResponse.json(
      { error: 'Use a PNG, JPEG, WebP, GIF or SVG picture.' },
      { status: 415 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'Keep the picture under 5 MB.' }, { status: 413 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.length === 0) {
    return NextResponse.json({ error: 'That file was empty.' }, { status: 400 });
  }

  const row = db
    .insert(schema.uploads)
    .values({ mime: file.type, bytes, label: term })
    .returning({ id: schema.uploads.id })
    .get();

  const imageUrl = `/api/image/${row.id}`;

  db.insert(schema.symbolOverrides)
    .values({ term, imageUrl, source: 'upload', license: 'Caregiver upload', isUpload: 1 })
    .onConflictDoUpdate({
      target: schema.symbolOverrides.term,
      set: { imageUrl, source: 'upload', license: 'Caregiver upload', isUpload: 1 },
    })
    .run();

  db.delete(schema.wordSymbols).where(eq(schema.wordSymbols.term, term)).run();
  recordFeedback(term, 'replaced', { imageUrl });

  return NextResponse.json({ ok: true, term, imageUrl });
}
