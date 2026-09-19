import { NextResponse } from 'next/server';
import { matchConcept } from '@/lib/symbol-search';
import type { WordRole } from '@/lib/core-words';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Alternatives for a word, used by the replace-a-picture flow.
 *
 * Passing `term` re-searches the word already on the tile, so the caregiver does
 * not have to retype it: they tap Edit and immediately see other options for the
 * same word. Passing `q` searches something new, for when the right picture is a
 * different word entirely.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const term = (url.searchParams.get('term') || url.searchParams.get('q') || '').trim();
  const role = (url.searchParams.get('role') || 'object') as WordRole;

  if (!term) {
    return NextResponse.json({ error: 'Give a word to search for.' }, { status: 400 });
  }
  if (term.length > 60) {
    return NextResponse.json({ error: 'That search is too long.' }, { status: 400 });
  }

  try {
    const match = await matchConcept(term, role, { limit: 10 });
    const all = [match.best, ...match.alternatives].filter(
      (c): c is NonNullable<typeof match.best> => c !== null,
    );

    return NextResponse.json({
      term,
      results: all.slice(0, 8).map((c) => ({
        imageUrl: c.imageUrl,
        name: c.name,
        score: Math.round(c.score * 100),
        source: c.source,
        license: c.license,
        author: c.author,
        symbolId: String(c.id),
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Symbol search failed.';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
