import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';

export const runtime = 'nodejs';

/** Serves an uploaded picture back out of the database. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const numeric = Number(id);
  if (!Number.isFinite(numeric)) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  const row = db.select().from(schema.uploads).where(eq(schema.uploads.id, numeric)).get();
  if (!row) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  const bytes = new Uint8Array(row.bytes as Buffer);
  return new Response(bytes, {
    status: 200,
    headers: {
      'Content-Type': row.mime,
      'Content-Length': String(bytes.byteLength),
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
