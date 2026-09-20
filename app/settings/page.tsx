'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { CountrySelect } from '@/components/ui/country-select';
import { clearSpeechMemory, speak, unlockAudio, setSpeechVolume } from '@/lib/speech';
import { describePreset, GRID_PRESETS, type VisionCategory } from '@/lib/sizing';

/**
 * Everything set during setup stays changeable here.
 *
 * Also shows what has been spent with Deepgram and how often the cache saved a
 * call, because on a small credit budget that is the number worth watching.
 */

interface ProfilePayload {
  profile: {
    age: number | null;
    gender: string | null;
    nationality: string | null;
    vision: VisionCategory;
    gridIndex: number;
    gapPx: number;
    iconScale: number;
    routine: string;
    tapErrorPx: number | null;
    voiceLabel: string | null;
    speechVolume: number;
  };
  voice: { voiceId: string; label: string };
  suggestedVoice?: { voiceId: string; label: string; rationale: string };
  gridDescription: string;
}

interface StatsPayload {
  totalUtterances: number;
  topSentences: { text: string; times: number }[];
  topWords: { text: string; times: number }[];
  credits: { characters: number; clips: number; cacheHits: number };
}

const VISION_LABELS: Record<string, string> = {
  none: 'No known difficulty',
  glasses: 'Wears glasses',
  low_vision: 'Low vision',
  cvi: 'Cortical visual impairment',
  unknown: 'Not sure',
};

const GENDER_OPTIONS = [
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
  { value: 'other', label: 'Other' },
  { value: 'prefer not to say', label: 'Prefer not to say' },
];

const AGE_OPTIONS: { value: number; label: string }[] = [
  { value: 3, label: 'Under 5' },
  { value: 6, label: '5 to 8' },
  { value: 10, label: '9 to 12' },
  { value: 16, label: '13 to 19' },
  { value: 30, label: '20 to 39' },
  { value: 50, label: '40 or older' },
];

export default function SettingsPage() {
  const [data, setData] = useState<ProfilePayload | null>(null);
  const [stats, setStats] = useState<StatsPayload | null>(null);
  const [gridIndex, setGridIndex] = useState(2);
  const [gapPx, setGapPx] = useState(12);
  const [vision, setVision] = useState<VisionCategory>('none');
  const [age, setAge] = useState<number | null>(null);
  const [gender, setGender] = useState('');
  const [nationality, setNationality] = useState('');
  const [voiceLabel, setVoiceLabel] = useState('Standard voice');
  const [voiceRationale, setVoiceRationale] = useState('');
  const [speechVolume, setSpeechVolumeState] = useState(100);
  const [saved, setSaved] = useState(false);
  const [voiceTried, setVoiceTried] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [profileRes, statsRes] = await Promise.all([
      fetch('/api/profile'),
      fetch('/api/utterance'),
    ]);
    const profile = (await profileRes.json()) as ProfilePayload;
    setData(profile);
    setGridIndex(profile.profile.gridIndex);
    setGapPx(profile.profile.gapPx);
    setVision(profile.profile.vision);
    setAge(profile.profile.age);
    setGender(profile.profile.gender ?? '');
    setNationality(profile.profile.nationality ?? '');
    setVoiceLabel(profile.voice.label ?? profile.profile.voiceLabel ?? 'Standard voice');
    setVoiceRationale(profile.suggestedVoice?.rationale ?? '');
    const vol = profile.profile.speechVolume ?? 100;
    setSpeechVolumeState(vol);
    setSpeechVolume(vol);
    if (statsRes.ok) setStats((await statsRes.json()) as StatsPayload);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gridIndex,
          gapPx,
          vision,
          age,
          gender: gender || null,
          nationality: nationality.trim() || null,
          speechVolume,
        }),
      });
      const body = (await res.json()) as ProfilePayload;
      clearSpeechMemory();
      setSpeechVolume(body.profile.speechVolume ?? speechVolume);
      setVoiceLabel(body.voice.label ?? 'Standard voice');
      setVoiceRationale(body.suggestedVoice?.rationale ?? '');
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      void load();
    } finally {
      setSaving(false);
    }
  }, [age, gapPx, gender, gridIndex, load, nationality, speechVolume, vision]);

  return (
    <main className="page-light safe-top safe-bottom mx-auto flex w-full max-w-3xl flex-col gap-6 p-5">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Settings</h1>
        <Link href="/board" className="text-sm font-semibold underline">
          Back to the board
        </Link>
      </header>

      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-bold">Button size and spacing</h2>
        <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
          {data?.profile.tapErrorPx != null
            ? `The tapping exercise measured about ${data.profile.tapErrorPx} pixels off target.`
            : 'No tapping exercise recorded yet.'}
        </p>

        <label className="flex flex-col gap-2">
          <span className="font-semibold">Fewer, bigger buttons &harr; more, smaller buttons</span>
          <input
            type="range"
            min={0}
            max={GRID_PRESETS.length - 1}
            value={gridIndex}
            onChange={(e) => setGridIndex(Number(e.target.value))}
            className="min-h-[44px]"
          />
          <span className="font-bold">{describePreset(gridIndex)}</span>
        </label>

        <label className="flex flex-col gap-2">
          <span className="font-semibold">Space between buttons</span>
          <input
            type="range"
            min={8}
            max={28}
            value={gapPx}
            onChange={(e) => setGapPx(Number(e.target.value))}
            className="min-h-[44px]"
          />
          <span className="text-sm" style={{ color: 'var(--ink-soft)' }}>
            {gapPx} pixels
          </span>
        </label>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-bold">Eyesight</h2>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(VISION_LABELS) as VisionCategory[]).map((value) => (
            <Button
              key={value}
              size="lg"
              variant={vision === value ? 'primary' : 'secondary'}
              onClick={() => setVision(value)}
            >
              {VISION_LABELS[value]}
            </Button>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-bold">Voice</h2>
        <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
          Age, gender and nationality pick the accent the board speaks with. Volume applies right
          away; Save stores it.
        </p>

        <label className="flex flex-col gap-2">
          <span className="font-semibold">Speaking volume</span>
          <input
            type="range"
            min={20}
            max={100}
            step={5}
            value={speechVolume}
            onChange={(e) => {
              const next = Number(e.target.value);
              setSpeechVolumeState(next);
              setSpeechVolume(next);
            }}
            className="min-h-[44px]"
          />
          <span className="text-sm" style={{ color: 'var(--ink-soft)' }}>
            {speechVolume}%
          </span>
        </label>

        <div className="flex flex-col gap-2">
          <span className="font-semibold">Age</span>
          <div className="flex flex-wrap gap-2">
            {AGE_OPTIONS.map((option) => (
              <Button
                key={option.value}
                size="lg"
                variant={age === option.value ? 'primary' : 'secondary'}
                onClick={() => setAge(option.value)}
              >
                {option.label}
              </Button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <span className="font-semibold">Gender</span>
          <div className="flex flex-wrap gap-2">
            {GENDER_OPTIONS.map((option) => (
              <Button
                key={option.value}
                size="lg"
                variant={gender === option.value ? 'primary' : 'secondary'}
                onClick={() => setGender(option.value)}
              >
                {option.label}
              </Button>
            ))}
          </div>
        </div>

        <label className="flex flex-col gap-2">
          <span className="font-semibold">Nationality</span>
          <CountrySelect
            value={nationality}
            onChange={setNationality}
            placeholder="Ireland"
          />
          <span className="text-sm" style={{ color: 'var(--ink-soft)' }}>
            Used for the speaking accent. Ireland, England, United States, Australia and similar
            have dedicated matches.
          </span>
        </label>

        <div
          className="flex flex-col gap-3 rounded-[14px] px-5 py-4"
          style={{ border: '1px solid var(--line)', background: 'var(--card)' }}
        >
          <div>
            <p className="font-semibold">{voiceLabel}</p>
            {voiceRationale ? (
              <p className="mt-1 text-sm" style={{ color: 'var(--ink-soft)' }}>
                {voiceRationale}
              </p>
            ) : null}
          </div>
          <Button
            size="lg"
            variant="secondary"
            onClick={async () => {
              unlockAudio();
              setVoiceTried(true);
              await speak('Hello, my name is TalkAlotta.', { kind: 'sentence' });
            }}
          >
            Hear the voice
          </Button>
          {voiceTried ? (
            <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
              If nothing played, check that DEEPGRAM_API_KEY is set, or the browser voice will be
              used instead.
            </p>
          ) : null}
        </div>
      </section>

      <div className="flex items-center gap-4">
        <Button size="xl" disabled={saving} onClick={() => void save()}>
          Save changes
        </Button>
        {saved ? <span className="font-semibold">Saved</span> : null}
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-bold">Speech credits</h2>
        {stats ? (
          <ul className="text-sm">
            <li>Characters sent to Deepgram: {stats.credits.characters}</li>
            <li>Clips generated: {stats.credits.clips}</li>
            <li>Presses served from the cache, costing nothing: {stats.credits.cacheHits}</li>
            <li>Words and sentences spoken in total: {stats.totalUtterances}</li>
          </ul>
        ) : (
          <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
            Nothing spoken yet.
          </p>
        )}
      </section>

      {stats && stats.topSentences.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-xl font-bold">Most said sentences</h2>
          <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
            The caregiver dashboard, from the board menu, is the place for how
            the board is being used. This is only what speech has cost.
          </p>
          <ol className="text-sm">
            {stats.topSentences.map((row) => (
              <li key={row.text}>
                {row.text} — {row.times} times
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-bold">Setup</h2>
        <Link href="/onboarding" className="font-semibold underline">
          Run setup again
        </Link>
      </section>

      {/*
        Picture credits. Several of the symbol libraries ask to be named, and some
        restrict commercial use, so this line belongs on anything published.
      */}
      <footer className="mt-auto border-t pt-4 text-xs" style={{ borderColor: 'var(--line)', color: 'var(--ink-soft)' }}>
        Pictures come from the OpenSymbols libraries, including Mulberry Symbols and Tawasol, from
        ARASAAC, and from Twemoji. Each picture keeps its own licence and author, recorded with the
        board. Check each library&rsquo;s terms before any commercial use.
      </footer>
    </main>
  );
}
