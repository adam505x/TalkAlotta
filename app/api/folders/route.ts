import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { resolveWord } from '@/lib/board';
import { recordFeedback } from '@/lib/symbol-search';
import type { WordRole } from '@/lib/core-words';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Editing the shape of the board itself: adding a word to a folder, taking a
 * word out again, and removing a folder.
 *
 * A built-in folder is hidden rather than deleted, so it can come back. A saved
 * situation folder is deleted outright, because it was created by the caregiver
 * in the first place.
 */

/** Add a word to a folder. */
export async function POST(request: Request) {
  let body: { folderId?: unknown; term?: unknown; role?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Expected JSON.' }, { status: 400 });
  }

  const folderId = String(body.folderId ?? '').trim();
  const term = String(body.term ?? '')
    .trim()
    .toLowerCase();
  const role = (String(body.role ?? 'object') || 'object') as WordRole;

  if (!folderId || !term) {
    return NextResponse.json({ error: 'A folder and a word are both needed.' }, { status: 400 });
  }
  if (term.length > 40) {
    return NextResponse.json({ error: 'That word is too long.' }, { status: 400 });
  }

  // Find a picture first: a word with no picture is not worth putting on a board.
  const tile = await resolveWord(term, role);
  if (!tile) {
    return NextResponse.json(
      { error: `No picture found for "${term}". Try another word.` },
      { status: 404 },
    );
  }

  if (folderId.startsWith('board:')) {
    // A saved situation folder keeps its words in board_items.
    const boardId = Number(folderId.split(':')[1]);
    if (!Number.isFinite(boardId)) {
      return NextResponse.json({ error: 'Unknown folder.' }, { status: 400 });
    }
    const existing = db
      .select()
      .from(schema.boardItems)
      .where(eq(schema.boardItems.boardId, boardId))
      .all();
    if (existing.some((i) => i.term === term)) {
      return NextResponse.json({ error: `"${term}" is already in this folder.` }, { status: 409 });
    }
    db.insert(schema.boardItems)
      .values({
        boardId,
        position: existing.length,
        term,
        label: term,
        role,
        imageUrl: tile.imageUrl,
        symbolId: tile.symbolId ?? null,
        source: tile.source ?? null,
        license: tile.license ?? null,
        author: tile.author ?? null,
        confidence: tile.confidence ?? null,
      })
      .run();
  } else {
    const already = db
      .select()
      .from(schema.folderWords)
      .where(and(eq(schema.folderWords.folderId, folderId), eq(schema.folderWords.term, term)))
      .get();
    if (already) {
      return NextResponse.json({ error: `"${term}" is already in this folder.` }, { status: 409 });
    }
    db.insert(schema.folderWords).values({ folderId, term, role }).run();
  }

  recordFeedback(term, 'accepted', { id: tile.symbolId, imageUrl: tile.imageUrl });

  return NextResponse.json({ ok: true, term, imageUrl: tile.imageUrl });
}

/**
 * Remove a folder, or one word from a folder.
 *   ?folderId=X          removes the folder
 *   ?folderId=X&term=Y   removes that word from it
 */
export async function DELETE(request: Request) {
  const url = new URL(request.url);
  const folderId = (url.searchParams.get('folderId') ?? '').trim();
  const term = (url.searchParams.get('term') ?? '').trim().toLowerCase();

  if (!folderId) {
    return NextResponse.json({ error: 'folderId required.' }, { status: 400 });
  }

  if (term) {
    if (folderId.startsWith('board:')) {
      const boardId = Number(folderId.split(':')[1]);
      db.delete(schema.boardItems)
        .where(and(eq(schema.boardItems.boardId, boardId), eq(schema.boardItems.term, term)))
        .run();
    } else {
      db.delete(schema.folderWords)
        .where(and(eq(schema.folderWords.folderId, folderId), eq(schema.folderWords.term, term)))
        .run();
    }
    return NextResponse.json({ ok: true, removed: term });
  }

  if (folderId.startsWith('board:')) {
    // Created by the caregiver, so removing it really does delete it.
    const boardId = Number(folderId.split(':')[1]);
    if (Number.isFinite(boardId)) {
      db.delete(schema.boardItems).where(eq(schema.boardItems.boardId, boardId)).run();
      db.delete(schema.boards).where(eq(schema.boards.id, boardId)).run();
    }
  } else {
    // Built in, so only hidden. It can be brought back.
    db.insert(schema.hiddenFolders).values({ folderId }).onConflictDoNothing().run();
  }

  return NextResponse.json({ ok: true, removed: folderId });
}

/** Bring a hidden folder back, and list what is currently hidden. */
export async function PATCH(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { folderId?: unknown };
  const folderId = String(body.folderId ?? '').trim();
  if (!folderId) return NextResponse.json({ error: 'folderId required.' }, { status: 400 });
  db.delete(schema.hiddenFolders).where(eq(schema.hiddenFolders.folderId, folderId)).run();
  return NextResponse.json({ ok: true, restored: folderId });
}

export async function GET() {
  const hidden = db.select().from(schema.hiddenFolders).all();
  return NextResponse.json({ hidden: hidden.map((h) => h.folderId) });
}
