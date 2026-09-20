import { NextResponse } from 'next/server';
import { isAnalyticsEventType, type AnalyticsEventInput } from '@/lib/analytics-types';
import { recordEvents } from '@/lib/analytics';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_EVENTS = 64;

/**
 * Receives board events from the client.
 *
 * The dashboard never reads this endpoint. It exists so a press, a folder open,
 * or a spoken sentence can be stored with the moment it happened, without the
 * board waiting for a response.
 */
export async function POST(request: Request) {
  let body: { events?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Expected JSON.' }, { status: 400 });
  }

  const raw = Array.isArray(body.events) ? body.events.slice(0, MAX_EVENTS) : [];
  const events: AnalyticsEventInput[] = [];

  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const type = String(row.type ?? '');
    if (!isAnalyticsEventType(type)) continue;
    events.push({
      type,
      term: str(row.term),
      label: str(row.label),
      folderId: str(row.folderId),
      pageId: str(row.pageId),
      cellIndex: typeof row.cellIndex === 'number' ? row.cellIndex : null,
      location: str(row.location),
      timeBucket: str(row.timeBucket),
      weather: str(row.weather),
      situation: str(row.situation),
      sessionId: str(row.sessionId),
      source: str(row.source),
      payload:
        row.payload && typeof row.payload === 'object' && !Array.isArray(row.payload)
          ? (row.payload as Record<string, unknown>)
          : null,
    });
  }

  if (events.length === 0) {
    return NextResponse.json({ error: 'Nothing to record.' }, { status: 400 });
  }

  const recorded = recordEvents(events);
  return NextResponse.json({ ok: true, recorded });
}

function str(value: unknown): string | null {
  const text = String(value ?? '').trim();
  return text || null;
}
