import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { timeOfDay } from '@/lib/core-words';
import type { AnalyticsEventInput } from '@/lib/analytics-types';

export type { AnalyticsEventInput, AnalyticsEventType, DashboardRange } from '@/lib/analytics-types';
export { EVENT_TYPES, isAnalyticsEventType } from '@/lib/analytics-types';

/**
 * Writes board events. Swallowing a failure here is deliberate: counting a
 * press must never delay speaking it.
 */
export function recordEvents(events: AnalyticsEventInput[]): number {
  if (events.length === 0) return 0;

  const profile = db
    .select({ buttonScalePct: schema.profile.buttonScalePct })
    .from(schema.profile)
    .where(eq(schema.profile.id, 1))
    .get();

  const bucket = timeOfDay();
  const rows = events.map((event) => ({
    type: event.type,
    term: clip(event.term),
    label: clip(event.label),
    folderId: clip(event.folderId, 80),
    pageId: clip(event.pageId, 80),
    cellIndex: typeof event.cellIndex === 'number' && event.cellIndex >= 0 ? Math.round(event.cellIndex) : null,
    location: clip(event.location, 60),
    timeBucket: clip(event.timeBucket, 20) ?? bucket,
    weather: clip(event.weather, 20),
    situation: clip(event.situation, 120),
    buttonScalePct: profile?.buttonScalePct ?? null,
    sessionId: clip(event.sessionId, 80),
    source: clip(event.source, 40) ?? 'board',
    payload: event.payload ? JSON.stringify(event.payload).slice(0, 2000) : null,
  }));

  db.insert(schema.analyticsEvents).values(rows).run();
  return rows.length;
}

function clip(value: string | null | undefined, max = 80): string | null {
  const text = String(value ?? '').trim();
  if (!text) return null;
  return text.slice(0, max);
}
