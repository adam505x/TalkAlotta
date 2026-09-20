import { NextResponse } from 'next/server';
import { getLayout, getProfile, getVoice, saveProfile, type ProfileUpdate } from '@/lib/profile';
import { resolveVoice } from '@/lib/voice';
import { describePreset, suggestLayout, type VisionCategory } from '@/lib/sizing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const profile = getProfile();
  return NextResponse.json({
    profile,
    layout: getLayout(profile),
    voice: getVoice(profile),
    suggestedVoice: resolveVoice(profile),
    gridDescription: describePreset(profile.gridIndex),
  });
}

export async function POST(request: Request) {
  const body = (await request.json()) as Record<string, unknown>;

  const update: ProfileUpdate = {};

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
  if ('gapPx' in body) update.gapPx = Number(body.gapPx);
  if ('iconScale' in body) update.iconScale = Number(body.iconScale);
  if ('voiceId' in body) update.voiceId = body.voiceId ? String(body.voiceId) : null;
  if ('voiceLabel' in body) update.voiceLabel = body.voiceLabel ? String(body.voiceLabel) : null;
  if ('speechVolume' in body) update.speechVolume = Number(body.speechVolume);
  if (body.markOnboarded) update.markOnboarded = true;

  // The tap test arrives as an average miss distance. It sets the button size and
  // the gap between buttons; the vision answer can only push the buttons bigger.
  if ('tapErrorPx' in body) {
    const error = Number(body.tapErrorPx);
    update.tapErrorPx = Number.isFinite(error) ? Math.round(error) : null;
    if (Number.isFinite(error)) {
      const vision = (update.vision ?? getProfile().vision) as VisionCategory;
      const suggested = suggestLayout(error, vision);
      if (!('gridIndex' in body)) update.gridIndex = suggested.gridIndex;
      if (!('gapPx' in body)) update.gapPx = suggested.gapPx;
      if (!('iconScale' in body)) update.iconScale = suggested.iconScale;
    }
  }

  // When age, gender or nationality change and the caller did not pick a voice
  // explicitly, re-resolve so the board speaks with the matching accent.
  const demographicsChanged =
    'age' in update || 'gender' in update || 'nationality' in update;
  if (demographicsChanged && !('voiceId' in update)) {
    const current = getProfile();
    const suggested = resolveVoice({
      age: 'age' in update ? update.age : current.age,
      gender: 'gender' in update ? update.gender : current.gender,
      nationality: 'nationality' in update ? update.nationality : current.nationality,
    });
    update.voiceId = suggested.voiceId;
    update.voiceLabel = suggested.label;
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
