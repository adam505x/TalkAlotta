import { NextResponse } from 'next/server';
import { getLayout, getProfile, getVoice, saveProfile, type ProfileUpdate } from '@/lib/profile';
import { resolveVoice } from '@/lib/voice';
import {
  clampButtonScale,
  describePreset,
  gapFromButtonScale,
  suggestLayout,
  type VisionCategory,
} from '@/lib/sizing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const profile = getProfile();
  return NextResponse.json({
    profile,
    layout: getLayout(profile),
    voice: getVoice(profile),
    gridDescription: describePreset(profile.gridIndex),
  });
}

export async function POST(request: Request) {
  const body = (await request.json()) as Record<string, unknown>;

  const update: ProfileUpdate = {};

  if ('name' in body) {
    const name = body.name ? String(body.name).trim() : '';
    update.name = name || null;
  }
  if ('age' in body) {
    const n = Number(body.age);
    update.age = Number.isFinite(n) && n > 0 ? Math.round(n) : null;
  }
  if ('gender' in body) update.gender = body.gender ? String(body.gender) : null;
  if ('nationality' in body) update.nationality = body.nationality ? String(body.nationality) : null;
  if ('caregiverRelationship' in body)
    update.caregiverRelationship = body.caregiverRelationship
      ? String(body.caregiverRelationship)
      : null;
  if ('vision' in body) update.vision = String(body.vision) as VisionCategory;
  if ('routine' in body) update.routine = String(body.routine);
  if ('gridIndex' in body) update.gridIndex = Number(body.gridIndex);
  if ('iconScale' in body) update.iconScale = Number(body.iconScale);

  // Button size and the gap between buttons are one number seen two ways: the
  // cells are fixed, so whatever the button does not fill is the gap. Storing a
  // gap that disagreed with the size would leave the board unable to draw both.
  if ('buttonScale' in body) {
    const scale = clampButtonScale(Number(body.buttonScale));
    update.buttonScale = scale;
    update.gapPx = gapFromButtonScale(scale);
  } else if ('gapPx' in body) {
    update.gapPx = Number(body.gapPx);
  }
  if ('voiceId' in body) update.voiceId = body.voiceId ? String(body.voiceId) : null;
  if ('voiceLabel' in body) update.voiceLabel = body.voiceLabel ? String(body.voiceLabel) : null;
  if (body.markOnboarded) update.markOnboarded = true;

  // The tap test arrives as an average miss distance. It sets the BUTTON SIZE and
  // nothing else: the grid stays seven across and four down whatever it reports.
  // The vision answer can only push the buttons bigger.
  if ('tapErrorPx' in body) {
    const error = Number(body.tapErrorPx);
    update.tapErrorPx = Number.isFinite(error) ? Math.round(error) : null;
    if (Number.isFinite(error)) {
      const vision = (update.vision ?? getProfile().vision) as VisionCategory;
      const suggested = suggestLayout(error, vision);
      // Always the locked preset, so an older stored index cannot reshape the board.
      update.gridIndex = suggested.gridIndex;
      if (!('buttonScale' in body)) {
        update.buttonScale = suggested.buttonScale;
        if (!('gapPx' in body)) update.gapPx = suggested.gapPx;
      }
      if (!('iconScale' in body)) update.iconScale = suggested.iconScale;
    }
  }

  const profile = saveProfile(update);

  return NextResponse.json({
    profile,
    layout: getLayout(profile),
    voice: getVoice(profile),
    suggestedVoice: resolveVoice(profile),
    gridDescription: describePreset(profile.gridIndex),
  });
}
