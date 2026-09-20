import { eq } from 'drizzle-orm';
import { db, schema } from './db';
import {
  BUTTON_SCALE_DEFAULT,
  clampButtonScale,
  presetAt,
  type GridPreset,
  type VisionCategory,
} from './sizing';
import { resolveVoice } from './voice';

/** One communicator, one profile. The row is always id = 1. */
export const PROFILE_ID = 1;

export interface Profile {
  /** The communicator's name, as the caregiver typed it. */
  name: string | null;
  age: number | null;
  gender: string | null;
  nationality: string | null;
  caregiverRelationship: string | null;
  vision: VisionCategory;
  tapErrorPx: number | null;
  gridIndex: number;
  /** Fraction of its cell each button fills. The grid itself never changes. */
  buttonScale: number;
  gapPx: number;
  iconScale: number;
  routine: string;
  voiceId: string | null;
  voiceLabel: string | null;
  onboarded: boolean;
}

export interface LayoutSettings {
  grid: GridPreset;
  gridIndex: number;
  buttonScale: number;
  gapPx: number;
  iconScale: number;
  vision: VisionCategory;
}

export function getProfile(): Profile {
  const row = db.select().from(schema.profile).where(eq(schema.profile.id, PROFILE_ID)).get();

  if (!row) {
    return {
      name: null,
      age: null,
      gender: null,
      nationality: null,
      caregiverRelationship: null,
      vision: 'unknown',
      tapErrorPx: null,
      gridIndex: 2,
      buttonScale: BUTTON_SCALE_DEFAULT,
      gapPx: 12,
      iconScale: 1,
      routine: 'varies',
      voiceId: null,
      voiceLabel: null,
      onboarded: false,
    };
  }

  return {
    name: row.name,
    age: row.age,
    gender: row.gender,
    nationality: row.nationality,
    caregiverRelationship: row.caregiverRelationship,
    vision: (row.vision as VisionCategory) ?? 'unknown',
    tapErrorPx: row.tapErrorPx,
    gridIndex: row.gridIndex,
    buttonScale:
      row.buttonScalePct == null
        ? BUTTON_SCALE_DEFAULT
        : clampButtonScale(row.buttonScalePct / 100),
    gapPx: row.gapPx,
    iconScale: (row.iconScale ?? 100) / 100,
    routine: row.routine,
    voiceId: row.voiceId,
    voiceLabel: row.voiceLabel,
    onboarded: Boolean(row.onboardedAt),
  };
}

export interface ProfileUpdate {
  name?: string | null;
  age?: number | null;
  gender?: string | null;
  nationality?: string | null;
  caregiverRelationship?: string | null;
  vision?: VisionCategory;
  tapErrorPx?: number | null;
  gridIndex?: number;
  buttonScale?: number;
  gapPx?: number;
  iconScale?: number;
  routine?: string;
  voiceId?: string | null;
  voiceLabel?: string | null;
  markOnboarded?: boolean;
}

export function saveProfile(update: ProfileUpdate): Profile {
  const values: Record<string, unknown> = { updatedAt: new Date().toISOString() };

  if ('name' in update) values.name = update.name ?? null;
  if ('age' in update) values.age = update.age ?? null;
  if ('gender' in update) values.gender = update.gender ?? null;
  if ('nationality' in update) values.nationality = update.nationality ?? null;
  if ('caregiverRelationship' in update)
    values.caregiverRelationship = update.caregiverRelationship ?? null;
  if (update.vision) values.vision = update.vision;
  if ('tapErrorPx' in update) values.tapErrorPx = update.tapErrorPx ?? null;
  if (typeof update.gridIndex === 'number') values.gridIndex = update.gridIndex;
  if (typeof update.buttonScale === 'number')
    values.buttonScalePct = Math.round(clampButtonScale(update.buttonScale) * 100);
  if (typeof update.gapPx === 'number') values.gapPx = update.gapPx;
  if (typeof update.iconScale === 'number') values.iconScale = Math.round(update.iconScale * 100);
  if (update.routine) values.routine = update.routine;
  if ('voiceId' in update) values.voiceId = update.voiceId ?? null;
  if ('voiceLabel' in update) values.voiceLabel = update.voiceLabel ?? null;
  if (update.markOnboarded) values.onboardedAt = new Date().toISOString();

  db.update(schema.profile).set(values).where(eq(schema.profile.id, PROFILE_ID)).run();
  return getProfile();
}

export function getLayout(profile: Profile = getProfile()): LayoutSettings {
  return {
    grid: presetAt(profile.gridIndex),
    gridIndex: profile.gridIndex,
    buttonScale: profile.buttonScale,
    gapPx: profile.gapPx,
    iconScale: profile.iconScale,
    vision: profile.vision,
  };
}

/** The voice this profile speaks with, falling back to the resolved default. */
export function getVoice(profile: Profile = getProfile()): { voiceId: string; label: string } {
  if (profile.voiceId) {
    return { voiceId: profile.voiceId, label: profile.voiceLabel ?? 'Chosen voice' };
  }
  const resolved = resolveVoice(profile);
  return { voiceId: resolved.voiceId, label: resolved.label };
}
