import { NextResponse } from 'next/server';
import { interpretScenario, isInterpreterConfigured } from '@/lib/interpret';
import { matchConcepts, CONFIDENCE_THRESHOLD } from '@/lib/symbol-search';
import { CORE_TERMS } from '@/lib/core-words';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Describe a situation, get back a proposed set of tiles for the caregiver to
 * review before it becomes a board.
 *
 * Nothing is saved here. The review step exists because coverage is strong but
 * visual appropriateness is not: full automation cannot hit near-perfect picture
 * accuracy on arbitrary language, so anything below the confidence threshold is
 * flagged rather than silently accepted.
 */
export async function POST(request: Request) {
  let body: { scenario?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Expected JSON.' }, { status: 400 });
  }

  const scenario = String(body.scenario ?? '').trim();
  if (!scenario) {
    return NextResponse.json({ error: 'Describe the situation first.' }, { status: 400 });
  }
  if (scenario.length > 400) {
    return NextResponse.json({ error: 'Keep the description under 400 characters.' }, { status: 400 });
  }

  if (!isInterpreterConfigured()) {
    return NextResponse.json(
      {
        error:
          'ANTHROPIC_API_KEY is not set, so the scenario cannot be read properly. Add it and try again.',
      },
      { status: 503 },
    );
  }

  let interpretation;
  try {
    interpretation = await interpretScenario(scenario);
  } catch (error) {
    // Deliberately NOT falling back to the plain keyword filter here. That path
    // turns "I need my red paint brush" into a search for "need my red paint
    // brush" and can put a pancakes symbol on a child's board. A visible retry is
    // better than a quietly wrong board.
    const message = error instanceof Error ? error.message : 'Could not read that description.';
    return NextResponse.json({ error: message, retryable: true }, { status: 502 });
  }

  // Core words are already on the fixed strip, so don't duplicate them in the folder.
  const concepts = interpretation.concepts.filter((c) => !CORE_TERMS.has(c.term));

  const matches = await matchConcepts(concepts.map((c) => ({ term: c.term, role: c.role })));

  return NextResponse.json({
    scenario,
    boardName: interpretation.boardName,
    intent: interpretation.intent,
    via: interpretation.via,
    model: interpretation.model ?? null,
    threshold: CONFIDENCE_THRESHOLD,
    tiles: matches.map((m) => ({
      term: m.term,
      label: m.label,
      role: m.role,
      needsReview: m.needsReview,
      queriedAs: m.queriedAs,
      best: m.best
        ? {
            imageUrl: m.best.imageUrl,
            name: m.best.name,
            score: Math.round(m.best.score * 100),
            source: m.best.source,
            license: m.best.license,
            author: m.best.author,
            symbolId: String(m.best.id),
            origin: m.best.origin,
          }
        : null,
      alternatives: m.alternatives.map((a) => ({
        imageUrl: a.imageUrl,
        name: a.name,
        score: Math.round(a.score * 100),
        source: a.source,
        license: a.license,
        author: a.author,
        symbolId: String(a.id),
      })),
    })),
  });
}
