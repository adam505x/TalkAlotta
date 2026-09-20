'use client';

import type { AnalyticsEventInput } from '@/lib/analytics-types';

/**
 * Fire-and-forget logging from the board.
 *
 * The dashboard and any later model both read the same rows. This must never
 * await in a press handler: a missed event is better than a delayed word.
 */

const SESSION_KEY = 'talkalotta-session';

export function analyticsSessionId(): string {
  if (typeof window === 'undefined') return 'server';
  try {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return 'anon';
  }
}

export function track(event: AnalyticsEventInput | AnalyticsEventInput[]): void {
  const events = Array.isArray(event) ? event : [event];
  if (events.length === 0) return;
  const sessionId = analyticsSessionId();
  try {
    void fetch('/api/analytics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        events: events.map((item) => ({ ...item, sessionId: item.sessionId ?? sessionId })),
      }),
      keepalive: true,
    });
  } catch {
    /* Counting must never get in the way of talking. */
  }
}
