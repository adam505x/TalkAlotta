'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { describePreset, GRID_PRESETS, type VisionCategory } from '@/lib/sizing';

/**
 * Everything set during setup stays changeable here.
 *
 * Also shows what has been spent with ElevenLabs and how often the cache saved a
 * call, because on a small credit budget that is the number worth watching.
 */

interface ProfilePayload {
  profile: {
    vision: VisionCategory;
    gridIndex: number;
    gapPx: number;
    iconScale: number;
    routine: string;
    tapErrorPx: number | null;
    voiceLabel: string | null;
  };
  voice: { voiceId: string; label: string };
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

export default function SettingsPage() {
  const [data, setData] = useState<ProfilePayload | null>(null);
  const [stats, setStats] = useState<StatsPayload | null>(null);
  const [gridIndex, setGridIndex] = useState(2);
  const [gapPx, setGapPx] = useState(12);
  const [vision, setVision] = useState<VisionCategory>('none');
  const [saved, setSaved] = useState(false);

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
    if (statsRes.ok) setStats((await statsRes.json()) as StatsPayload);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(async () => {
    await fetch('/api/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gridIndex, gapPx, vision }),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    void load();
  }, [gapPx, gridIndex, load, vision]);

  return (
    <main className="safe-top safe-bottom mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-6 p-5">
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

      <div className="flex items-center gap-4">
        <Button size="xl" onClick={() => void save()}>
          Save changes
        </Button>
        {saved ? <span className="font-semibold">Saved</span> : null}
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-bold">Voice</h2>
        <p>{data?.voice.label ?? 'Standard voice'}</p>
        <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
          Accent and gender matching is not wired up yet. The answers from setup are stored, so
          adding real voices is a change to the voice lookup alone.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-bold">Speech credits</h2>
        {stats ? (
          <ul className="text-sm">
            <li>Characters sent to ElevenLabs: {stats.credits.characters}</li>
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
            The dashboard proper comes later. This is the data it will be built on.
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
