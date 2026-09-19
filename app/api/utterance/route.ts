import { NextResponse } from 'next/server';
import { desc, sql } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { timeOfDay } from '@/lib/core-words';
import { creditsSpent } from '@/lib/tts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Records something that was spoken.
 *
 * The speech route already logs what it speaks, so this exists for the browser
 * voice path, which never touches the server otherwise. Either way the data lands
 * in one place.
 *
 * The dashboard of most-said sentences is deliberately later, but the history it
 * will need is being collected from the first press.
 */
export async function POST(request: Request) {
  let body: { text?: unknown; kind?: unknown; boardId?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Expected JSON.' }, { status: 400 });
  }

  const text = String(body.text ?? '').trim();
  if (!text) return NextResponse.json({ error: 'Nothing to record.' }, { status: 400 });

  db.insert(schema.utterances)
    .values({
      text,
      kind: body.kind === 'sentence' ? 'sentence' : 'word',
      wordCount: text.split(/\s+/).filter(Boolean).length,
      boardId: typeof body.boardId === 'number' ? body.boardId : null,
      timeBucket: timeOfDay(),
    })
    .run();

  return NextResponse.json({ ok: true });
}

/**
 * A read of what has been collected. Not a dashboard, just the numbers behind
 * one, so the data can be checked as it accumulates.
 */
export async function GET() {
  const topSentences = db
    .select({
      text: schema.utterances.text,
      times: sql<number>`count(*)`,
    })
    .from(schema.utterances)
    .where(sql`${schema.utterances.kind} = 'sentence'`)
    .groupBy(schema.utterances.text)
    .orderBy(desc(sql`count(*)`))
    .limit(10)
    .all();

  const topWords = db
    .select({
      text: schema.utterances.text,
      times: sql<number>`count(*)`,
    })
    .from(schema.utterances)
    .where(sql`${schema.utterances.kind} = 'word'`)
    .groupBy(schema.utterances.text)
    .orderBy(desc(sql`count(*)`))
    .limit(10)
    .all();

  const total = db
    .select({ n: sql<number>`count(*)` })
    .from(schema.utterances)
    .get();

  return NextResponse.json({
    totalUtterances: total?.n ?? 0,
    topSentences,
    topWords,
    credits: creditsSpent(),
  });
}
