import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { recordEvents } from '@/lib/analytics';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** A clear can only take back what the sentence bar holds, so this is generous. */
const MAX_WORDS = 64;

/**
 * Records words taken back out of the sentence bar.
 *
 * Deleting is the only correction a communicator has, so it is also the only
 * signal that something is being pressed by mistake. Nothing here may slow the
 * delete down: the client fires this off and does not wait for it.
 *
 * A clear arrives as one request holding every word it removed, rather than one
 * request per word, so a double tap cannot look like a burst of separate mistakes.
 */
export async function POST(request: Request) {
  let body: {
    kind?: unknown;
    words?: unknown;
    location?: unknown;
    timeBucket?: unknown;
    weather?: unknown;
    situation?: unknown;
    folderId?: unknown;
    pageId?: unknown;
    sessionId?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Expected JSON.' }, { status: 400 });
  }

  const kind = body.kind === 'clear' ? 'clear' : 'last';
  const words = Array.isArray(body.words) ? body.words.slice(0, MAX_WORDS) : [];
  if (words.length === 0) {
    return NextResponse.json({ error: 'Nothing to record.' }, { status: 400 });
  }

  // Read the button size here rather than trusting the client with it, so the
  // number stored alongside a deletion is definitely the one in the profile.
  const profile = db
    .select({ buttonScalePct: schema.profile.buttonScalePct })
    .from(schema.profile)
    .where(eq(schema.profile.id, 1))
    .get();

  const rows = words
    .map((word) => {
      const w = word as { term?: unknown; label?: unknown; msSinceAdded?: unknown };
      const label = String(w.label ?? w.term ?? '').trim();
      if (!label) return null;
      const ms = typeof w.msSinceAdded === 'number' && w.msSinceAdded >= 0 ? w.msSinceAdded : null;
      return {
        term: String(w.term ?? label).trim(),
        label,
        kind,
        msSinceAdded: ms === null ? null : Math.round(ms),
        buttonScalePct: profile?.buttonScalePct ?? null,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  if (rows.length === 0) {
    return NextResponse.json({ error: 'Nothing to record.' }, { status: 400 });
  }

  db.insert(schema.deletions).values(rows).run();

  recordEvents(
    rows.map((row) => ({
      type: kind === 'clear' ? 'clear' : 'delete_last',
      term: row.term,
      label: row.label,
      location: str(body.location),
      timeBucket: str(body.timeBucket),
      weather: str(body.weather),
      situation: str(body.situation),
      folderId: str(body.folderId),
      pageId: str(body.pageId),
      sessionId: str(body.sessionId),
      source: 'sentence_bar',
      payload: { msSinceAdded: row.msSinceAdded },
    })),
  );

  return NextResponse.json({ ok: true, recorded: rows.length });
}

function str(value: unknown): string | null {
  const text = String(value ?? '').trim();
  return text || null;
}

