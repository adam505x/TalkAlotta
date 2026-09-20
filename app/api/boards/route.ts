import { NextResponse } from 'next/server';
import { desc, eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { assembleMainBoard, touchBoard } from '@/lib/board';
import { recommendedScenarios } from '@/lib/core-words';
import { readContext } from '@/lib/context';
import { getLayout, getProfile, getVoice } from '@/lib/profile';
import { recordFeedback } from '@/lib/symbol-search';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The assembled main board: the fixed core block and the four dynamic folders.
 *
 * The moment is passed in the query string. In real use the time comes from the
 * clock, the location and weather from the device; the demo control forces all
 * three so the adaptation can be shown rather than waited for.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const context = readContext(url.searchParams);
  const profile = getProfile();

  try {
    const board = await assembleMainBoard(context, url.searchParams.get('folder'));
    return NextResponse.json({
      ...board,
      recommended: recommendedScenarios(board.context.timeBucket, board.context.location),
      layout: getLayout(profile),
      voice: getVoice(profile),
      speechVolume: profile.speechVolume,
      onboarded: profile.onboarded,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not build the board.';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

interface SaveBody {
  name?: unknown;
  scenario?: unknown;
  intent?: unknown;
  tiles?: {
    term: string;
    label: string;
    role: string;
    imageUrl: string;
    symbolId?: string | null;
    source?: string | null;
    license?: string | null;
    author?: string | null;
    confidence?: number | null;
  }[];
}

/** Saves a reviewed situation board. It becomes a folder on the main board. */
export async function POST(request: Request) {
  let body: SaveBody;
  try {
    body = (await request.json()) as SaveBody;
  } catch {
    return NextResponse.json({ error: 'Expected JSON.' }, { status: 400 });
  }

  const name = String(body.name ?? '').trim();
  const scenario = String(body.scenario ?? '').trim();
  const tiles = Array.isArray(body.tiles) ? body.tiles : [];

  if (!name) return NextResponse.json({ error: 'The board needs a name.' }, { status: 400 });
  if (tiles.length === 0)
    return NextResponse.json({ error: 'Keep at least one picture.' }, { status: 400 });

  const inserted = db
    .insert(schema.boards)
    .values({ name, scenario, intent: body.intent ? String(body.intent) : null })
    .returning({ id: schema.boards.id })
    .get();

  tiles.forEach((tile, index) => {
    db.insert(schema.boardItems)
      .values({
        boardId: inserted.id,
        position: index,
        term: tile.term,
        label: tile.label || tile.term,
        role: tile.role || 'object',
        imageUrl: tile.imageUrl,
        symbolId: tile.symbolId ?? null,
        source: tile.source ?? null,
        license: tile.license ?? null,
        author: tile.author ?? null,
        confidence: tile.confidence ?? null,
      })
      .run();

    // The learning layer, writing: keeping a picture is an accepted choice.
    recordFeedback(tile.term, 'accepted', { id: tile.symbolId, imageUrl: tile.imageUrl });
  });

  return NextResponse.json({ id: inserted.id, name });
}

/** Marks a saved board as opened, for the learning data. */
export async function PATCH(request: Request) {
  const body = (await request.json()) as { boardId?: unknown };
  const boardId = Number(body.boardId);
  if (!Number.isFinite(boardId)) {
    return NextResponse.json({ error: 'boardId required.' }, { status: 400 });
  }
  touchBoard(boardId);
  return NextResponse.json({ ok: true });
}

/** Deletes a saved board. */
export async function DELETE(request: Request) {
  const url = new URL(request.url);
  const boardId = Number(url.searchParams.get('id'));
  if (!Number.isFinite(boardId)) {
    return NextResponse.json({ error: 'id required.' }, { status: 400 });
  }
  db.delete(schema.boardItems).where(eq(schema.boardItems.boardId, boardId)).run();
  db.delete(schema.boards).where(eq(schema.boards.id, boardId)).run();
  return NextResponse.json({ ok: true });
}

export { desc };
