'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { describePreset, GRID_PRESETS, suggestLayout, type VisionCategory } from '@/lib/sizing';
import { speak, unlockAudio } from '@/lib/speech';

/**
 * Setup, run once by the caregiver. Everything here stays changeable afterwards
 * from Settings.
 *
 * Deliberately not called a quiz or a test in anything the caregiver reads.
 *
 * There is exactly ONE physical calibration, the tap targets. Vision is a plain
 * question, because it is the caregiver answering on the communicator's behalf
 * and a shrinking-symbol exercise would be measuring the wrong person.
 */

type Step = 'intro' | 'profile' | 'vision' | 'tap' | 'routine' | 'size' | 'voice' | 'done';

const STEP_ORDER: Step[] = ['intro', 'profile', 'vision', 'tap', 'routine', 'size', 'voice', 'done'];

/** Five targets: each corner and the centre. */
const TAP_TARGETS = [
  { x: 0.12, y: 0.18 },
  { x: 0.88, y: 0.18 },
  { x: 0.5, y: 0.5 },
  { x: 0.12, y: 0.82 },
  { x: 0.88, y: 0.82 },
];

const VISION_OPTIONS: { value: VisionCategory; label: string; hint: string }[] = [
  { value: 'none', label: 'No known difficulty', hint: 'Sees the screen comfortably' },
  { value: 'glasses', label: 'Wears glasses', hint: 'Corrected vision' },
  { value: 'low_vision', label: 'Low vision', hint: 'Needs larger, plainer pictures' },
  {
    value: 'cvi',
    label: 'Cortical visual impairment',
    hint: 'Fewer buttons, plain background, high contrast',
  },
  { value: 'unknown', label: 'Not sure', hint: 'We will use standard sizes' },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('intro');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Profile
  const [age, setAge] = useState('');
  const [gender, setGender] = useState('');
  const [nationality, setNationality] = useState('');
  const [relationship, setRelationship] = useState('');

  // Vision and routine
  const [vision, setVision] = useState<VisionCategory>('none');
  const [routine, setRoutine] = useState('varies');

  // Tap calibration
  const [tapIndex, setTapIndex] = useState(0);
  const [errors, setErrors] = useState<number[]>([]);
  const surfaceRef = useRef<HTMLDivElement | null>(null);

  // Layout, suggested then editable
  const [gridIndex, setGridIndex] = useState(2);
  const [gapPx, setGapPx] = useState(12);
  const [iconScale, setIconScale] = useState(1);

  // Voice
  const [voice, setVoice] = useState<{ voiceId: string; label: string; rationale: string } | null>(
    null,
  );
  const [voiceTried, setVoiceTried] = useState(false);

  useEffect(() => {
    const handler = () => unlockAudio();
    window.addEventListener('pointerdown', handler, { once: true });
    return () => window.removeEventListener('pointerdown', handler);
  }, []);

  const averageError = useMemo(
    () => (errors.length ? errors.reduce((a, b) => a + b, 0) / errors.length : 0),
    [errors],
  );

  const suggestion = useMemo(() => suggestLayout(averageError, vision), [averageError, vision]);

  const goto = (next: Step) => {
    setError(null);
    setStep(next);
  };

  const recordTap = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const surface = surfaceRef.current;
      if (!surface) return;
      const rect = surface.getBoundingClientRect();
      const target = TAP_TARGETS[tapIndex];
      const targetX = rect.left + rect.width * target.x;
      const targetY = rect.top + rect.height * target.y;
      const dx = event.clientX - targetX;
      const dy = event.clientY - targetY;
      const distance = Math.sqrt(dx * dx + dy * dy);

      const nextErrors = [...errors, distance];
      setErrors(nextErrors);

      if (tapIndex + 1 >= TAP_TARGETS.length) {
        const avg = nextErrors.reduce((a, b) => a + b, 0) / nextErrors.length;
        const suggested = suggestLayout(avg, vision);
        setGridIndex(suggested.gridIndex);
        setGapPx(suggested.gapPx);
        setIconScale(suggested.iconScale);
        goto('routine');
      } else {
        setTapIndex(tapIndex + 1);
      }
    },
    [errors, tapIndex, vision],
  );

  const saveAndContinue = useCallback(
    async (payload: Record<string, unknown>, next: Step) => {
      setSaving(true);
      setError(null);
      try {
        const res = await fetch('/api/profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? 'Could not save that.');
        }
        const body = (await res.json()) as {
          suggestedVoice?: { voiceId: string; label: string; rationale: string };
        };
        if (body.suggestedVoice) setVoice(body.suggestedVoice);
        goto(next);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not save that.');
      } finally {
        setSaving(false);
      }
    },
    [],
  );

  const stepNumber = STEP_ORDER.indexOf(step);

  return (
    <main className="safe-top safe-bottom mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-6 p-5">
      <header className="shrink-0">
        <p className="text-sm font-semibold" style={{ color: 'var(--ink-soft)' }}>
          Setting up — step {Math.max(1, stepNumber)} of {STEP_ORDER.length - 2}
        </p>
        <h1 className="text-2xl font-bold">TalkAlotta</h1>
      </header>

      {error ? (
        <p
          className="rounded-xl border-2 p-3 text-base font-semibold"
          style={{ borderColor: 'var(--role-feeling-line)', background: 'var(--role-feeling-bg)' }}
        >
          {error}
        </p>
      ) : null}

      {step === 'intro' ? (
        <section className="flex flex-1 flex-col justify-center gap-5">
          <h2 className="text-3xl font-bold">Let us set the board up together</h2>
          <p className="text-lg" style={{ color: 'var(--ink-soft)' }}>
            A few short questions and one quick tapping exercise. It takes about two minutes, and
            everything can be changed afterwards.
          </p>
          <div>
            <Button size="xl" onClick={() => goto('profile')}>
              Start
            </Button>
          </div>
        </section>
      ) : null}

      {step === 'profile' ? (
        <section className="flex flex-1 flex-col gap-5">
          <h2 className="text-2xl font-bold">About the communicator</h2>
          <p style={{ color: 'var(--ink-soft)' }}>
            All optional. These answers are what will choose an accent-matched voice.
          </p>

          <label className="flex flex-col gap-2">
            <span className="font-semibold">Age</span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={120}
              value={age}
              onChange={(e) => setAge(e.target.value)}
              className="min-h-[56px] rounded-xl border-2 px-4 text-lg"
              style={{ borderColor: 'var(--line)', background: 'var(--card)' }}
            />
          </label>

          <fieldset className="flex flex-col gap-2">
            <legend className="font-semibold">Gender</legend>
            <div className="flex flex-wrap gap-2">
              {['female', 'male', 'other', 'prefer not to say'].map((option) => (
                <Button
                  key={option}
                  size="lg"
                  variant={gender === option ? 'primary' : 'secondary'}
                  onClick={() => setGender(option)}
                >
                  {option}
                </Button>
              ))}
            </div>
          </fieldset>

          <label className="flex flex-col gap-2">
            <span className="font-semibold">Country or region</span>
            <input
              type="text"
              value={nationality}
              placeholder="Ireland"
              onChange={(e) => setNationality(e.target.value)}
              className="min-h-[56px] rounded-xl border-2 px-4 text-lg"
              style={{ borderColor: 'var(--line)', background: 'var(--card)' }}
            />
          </label>

          <fieldset className="flex flex-col gap-2">
            <legend className="font-semibold">You are their</legend>
            <div className="flex flex-wrap gap-2">
              {['parent', 'teacher', 'therapist', 'other'].map((option) => (
                <Button
                  key={option}
                  size="lg"
                  variant={relationship === option ? 'primary' : 'secondary'}
                  onClick={() => setRelationship(option)}
                >
                  {option}
                </Button>
              ))}
            </div>
          </fieldset>

          <div className="mt-auto flex gap-3">
            <Button
              size="xl"
              disabled={saving}
              onClick={() =>
                void saveAndContinue(
                  {
                    age: age ? Number(age) : null,
                    gender: gender || null,
                    nationality: nationality || null,
                    caregiverRelationship: relationship || null,
                  },
                  'vision',
                )
              }
            >
              Continue
            </Button>
          </div>
        </section>
      ) : null}

      {step === 'vision' ? (
        <section className="flex flex-1 flex-col gap-5">
          <h2 className="text-2xl font-bold">How is their eyesight?</h2>
          <p style={{ color: 'var(--ink-soft)' }}>
            This changes how big the pictures are, and for low vision or CVI it also means fewer
            buttons on a plain, high-contrast background.
          </p>
          <div className="flex flex-col gap-3">
            {VISION_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setVision(option.value)}
                className="flex min-h-[64px] flex-col items-start justify-center rounded-xl border-4 px-4 py-2 text-left"
                style={{
                  borderColor: vision === option.value ? 'var(--focus)' : 'var(--line)',
                  background: 'var(--card)',
                }}
              >
                <span className="text-lg font-bold">{option.label}</span>
                <span className="text-sm" style={{ color: 'var(--ink-soft)' }}>
                  {option.hint}
                </span>
              </button>
            ))}
          </div>
          <div className="mt-auto">
            <Button size="xl" disabled={saving} onClick={() => void saveAndContinue({ vision }, 'tap')}>
              Continue
            </Button>
          </div>
        </section>
      ) : null}

      {step === 'tap' ? (
        <section className="flex flex-1 flex-col gap-4">
          <h2 className="text-2xl font-bold">Tap the circle</h2>
          <p style={{ color: 'var(--ink-soft)' }}>
            Five circles, one after another. Let them tap naturally. How close the taps land sets the
            button size and the spacing between buttons.
          </p>
          <div
            ref={surfaceRef}
            onPointerDown={recordTap}
            className="relative flex-1 rounded-2xl border-4"
            style={{ borderColor: 'var(--line)', background: 'var(--card)', touchAction: 'none' }}
            role="button"
            tabIndex={0}
            aria-label={`Tap target ${tapIndex + 1} of ${TAP_TARGETS.length}`}
          >
            <span
              aria-hidden="true"
              className="absolute rounded-full"
              style={{
                left: `${TAP_TARGETS[tapIndex].x * 100}%`,
                top: `${TAP_TARGETS[tapIndex].y * 100}%`,
                transform: 'translate(-50%, -50%)',
                width: 72,
                height: 72,
                background: 'var(--role-modifier-bg)',
                border: '6px solid var(--role-modifier-line)',
              }}
            />
            <span className="absolute bottom-3 left-1/2 -translate-x-1/2 text-sm font-semibold">
              {tapIndex + 1} of {TAP_TARGETS.length}
            </span>
          </div>
          <button
            type="button"
            className="self-start text-sm font-semibold underline"
            onClick={() => {
              setErrors([]);
              setTapIndex(0);
              goto('routine');
            }}
          >
            Skip this for now
          </button>
        </section>
      ) : null}

      {step === 'routine' ? (
        <section className="flex flex-1 flex-col gap-5">
          <h2 className="text-2xl font-bold">How structured is their day?</h2>
          <p style={{ color: 'var(--ink-soft)' }}>
            This is what lets the board put the right words up at the right time of day.
          </p>
          <div className="flex flex-col gap-3">
            {[
              { value: 'rigid', label: 'Much the same every day' },
              { value: 'loose', label: 'A rough pattern' },
              { value: 'varies', label: 'Different every day' },
            ].map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setRoutine(option.value)}
                className="min-h-[64px] rounded-xl border-4 px-4 text-left text-lg font-bold"
                style={{
                  borderColor: routine === option.value ? 'var(--focus)' : 'var(--line)',
                  background: 'var(--card)',
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="mt-auto">
            <Button
              size="xl"
              disabled={saving}
              onClick={() =>
                void saveAndContinue(
                  {
                    routine,
                    tapErrorPx: errors.length ? Math.round(averageError) : null,
                    gridIndex: suggestion.gridIndex,
                    gapPx: suggestion.gapPx,
                    iconScale: suggestion.iconScale,
                  },
                  'size',
                )
              }
            >
              Continue
            </Button>
          </div>
        </section>
      ) : null}

      {step === 'size' ? (
        <section className="flex flex-1 flex-col gap-5">
          <h2 className="text-2xl font-bold">Button size</h2>
          <p style={{ color: 'var(--ink-soft)' }}>
            {errors.length
              ? `Suggested from the tapping: ${describePreset(gridIndex)}.`
              : 'No tapping measured, so this is the standard size.'}
            {suggestion.visionOverrodeTap
              ? ' Made larger because of the eyesight answer.'
              : ''}
          </p>

          <label className="flex flex-col gap-2">
            <span className="font-semibold">
              Fewer, bigger buttons &nbsp;&harr;&nbsp; more, smaller buttons
            </span>
            <input
              type="range"
              min={0}
              max={GRID_PRESETS.length - 1}
              step={1}
              value={gridIndex}
              onChange={(e) => setGridIndex(Number(e.target.value))}
              className="min-h-[44px]"
            />
            <span className="text-lg font-bold">{describePreset(gridIndex)}</span>
          </label>

          <label className="flex flex-col gap-2">
            <span className="font-semibold">Space between buttons</span>
            <input
              type="range"
              min={8}
              max={28}
              step={1}
              value={gapPx}
              onChange={(e) => setGapPx(Number(e.target.value))}
              className="min-h-[44px]"
            />
            <span className="text-sm" style={{ color: 'var(--ink-soft)' }}>
              {gapPx} pixels. More space means fewer accidental presses.
            </span>
          </label>

          {/* A live preview at the chosen size, so the choice is visible not described. */}
          <div
            className="grid rounded-xl border-2 p-2"
            style={{
              borderColor: 'var(--line)',
              gridTemplateColumns: `repeat(${GRID_PRESETS[gridIndex].cols}, minmax(0, 1fr))`,
              gap: `${gapPx}px`,
              height: 200,
            }}
          >
            {Array.from({ length: GRID_PRESETS[gridIndex].cols * GRID_PRESETS[gridIndex].rows }).map(
              (_, i) => (
                <span
                  key={i}
                  className="rounded-lg border-2"
                  style={{ background: 'var(--role-object-bg)', borderColor: 'var(--role-object-line)' }}
                />
              ),
            )}
          </div>

          <div className="mt-auto">
            <Button
              size="xl"
              disabled={saving}
              onClick={() => void saveAndContinue({ gridIndex, gapPx, iconScale }, 'voice')}
            >
              Continue
            </Button>
          </div>
        </section>
      ) : null}

      {step === 'voice' ? (
        <section className="flex flex-1 flex-col gap-5">
          <h2 className="text-2xl font-bold">How should the voice sound?</h2>
          <p style={{ color: 'var(--ink-soft)' }}>
            Worked out from the answers you gave. Have a listen and confirm.
          </p>

          <div
            className="rounded-xl border-4 p-4"
            style={{ borderColor: 'var(--line)', background: 'var(--card)' }}
          >
            <p className="text-xl font-bold">{voice?.label ?? 'Standard voice'}</p>
            <p className="mt-1 text-sm" style={{ color: 'var(--ink-soft)' }}>
              {voice?.rationale ?? 'One standard voice is available at the moment.'}
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Button
                size="lg"
                variant="secondary"
                onClick={async () => {
                  setVoiceTried(true);
                  await speak('Hello, my name is TalkAlotta.', { kind: 'sentence' });
                }}
              >
                Hear the voice
              </Button>
              {voiceTried ? (
                <span className="self-center text-sm" style={{ color: 'var(--ink-soft)' }}>
                  If nothing played, the browser voice will be used instead.
                </span>
              ) : null}
            </div>
          </div>

          <div className="mt-auto">
            <Button
              size="xl"
              disabled={saving}
              onClick={() =>
                void saveAndContinue(
                  {
                    voiceId: voice?.voiceId ?? null,
                    voiceLabel: voice?.label ?? null,
                    markOnboarded: true,
                  },
                  'done',
                )
              }
            >
              Use this voice
            </Button>
          </div>
        </section>
      ) : null}

      {step === 'done' ? (
        <section className="flex flex-1 flex-col justify-center gap-5">
          <h2 className="text-3xl font-bold">Ready</h2>
          <p className="text-lg" style={{ color: 'var(--ink-soft)' }}>
            The board is set to {describePreset(gridIndex)}. Every answer can be changed from
            Settings at any time.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button size="xl" onClick={() => router.push('/board')}>
              Open the board
            </Button>
            <Button size="xl" variant="secondary" onClick={() => router.push('/describe')}>
              Describe a situation first
            </Button>
          </div>
        </section>
      ) : null}
    </main>
  );
}
