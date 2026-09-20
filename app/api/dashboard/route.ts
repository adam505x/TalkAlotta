import { NextResponse } from 'next/server';
import { dashboardStats, type DashboardRange } from '@/lib/dashboard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Caregiver-facing numbers, built from the event log.
 *
 * Raw events stay in analytics_events. This route only returns the counts a
 * parent or SLP can act on: what is used, when, in which situation, and whether
 * deletes look like miss-taps.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const raw = url.searchParams.get('range');
  const range: DashboardRange = raw === '30d' || raw === 'all' ? raw : '7d';
  return NextResponse.json(dashboardStats(range), {
    headers: { 'Cache-Control': 'no-store' },
  });
}
