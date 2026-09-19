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
 * ONE QUESTION PER PAGE. A caregiver who is not especially technical should never
 * have to work out which of four fields on a screen still needs an answer.
 *
 * Deliberately not called a quiz or a test in anything the caregiver reads.
 *
 * There is exactly ONE physical calibration, the tap targets. Eyesight is a plain
 * question, because it is the caregiver answering on the communicator's behalf and
 * a shrinking-symbol exercise would be measuring the wrong person.
 */

type Step =
  | 'intro'
  | 'age'
  | 'gender'
  | 'nationality'
  | 'relationship'
  | 'vision'
  | 'tap'
  | 'routine'
  | 'size'
  | 'voice'
  | 'done';

const STEPS: Step[] = [
  'intro',
  'age',
  'gender',
  'nationality',
  'relationship',
  'vision',
  'tap',
  'routine',
  'size',
  'voice',
  'done',
];

/** Steps that count towards the progress the caregiver sees. */
const QUESTION_STEPS: Step[] = STEPS.filter((s) => s !== 'intro' && s !== 'done');

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
  { value: 'unknown', label: 'Not sure', hint: 'Standard sizes will be used' },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('intro');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [age, setAge] = useState('');
  const [gender, setGender] = useState('');
  const [nationality, setNationality] = useState('');
  const [relationship, setRelationship] = useState('');
  const [vision, setVision] = useState<VisionCategory>('none');
  const [routine, setRoutine] = useState('varies');

  const [tapIndex, setTapIndex] = useState(0);
  const [errors, setErrors] = useState<number[]>([]);
  const surfaceRef = useRef<HTMLDivElement | null>(null);

  const [gridIndex, setGridIndex] = useState(2);
  const [gapPx, setGapPx] = useState(12);
  const [iconScale, setIconScale] = useState(1);

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

  const stepBack = useCallback(() => {
    const i = STEPS.indexOf(step);
    if (i > 0) goto(STEPS[i - 1]);
  }, [step]);

  const save = useCallback(
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

  const recordTap = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const surface = surfaceRef.current;
      if (!surface) return;
      const rect = surface.getBoundingClientRect();
      const target = TAP_TARGETS[tapIndex];
      const dx = event.clientX - (rect.left + rect.width * target.x);
      const dy = event.clientY - (rect.top + rect.height * target.y);
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

  const questionNumber = QUESTION_STEPS.indexOf(step) + 1;

  /** Shared frame so every question looks the same. */
  const Frame = ({
    title,
    hint,
    children,
    footer,
  }: {
    title: string;
    hint?: string;
    children?: React.ReactNode;
    footer: React.ReactNode;
  }) => (
    <section className="sheet flex flex-1 flex-col gap-5 p-6">
      <div>
        <h2 className="text-2xl font-bold">{title}</h2>
        {hint ? (
          <p className="mt-2 text-base" style={{ color: 'var(--ink-soft)' }}>
            {hint}
          </p>
        ) : null}
      </div>
      {children}
      <div className="mt-auto flex flex-wrap items-center gap-3">{footer}</div>
    </section>
  );

  const backButton =
    step !== 'intro' && step !== 'done' ? (
      <button
        type="button"
        onClick={stepBack}
        className="text-sm font-bold underline"
        style={{ color: 'var(--ink-soft)' }}
      >
        Back
      </button>
    ) : null;

  return (
    <main className="safe-top safe-bottom mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-4 p-4">
      <header className="shrink-0">
        <p
          className="text-[11px] font-bold uppercase tracking-[0.08em]"
          style={{ color: 'var(--on-chrome-soft)' }}
        >
          TalkAlotta · setting up
        </p>
        {questionNumber > 0 ? (
          <div className="mt-2 flex items-center gap-2">
            {QUESTION_STEPS.map((s, i) => (
              <span
                key={s}
                aria-hidden="true"
                className="h-1.5 flex-1 rounded-full"
                style={{
                  background: i < questionNumber ? 'var(--teal)' : 'rgba(255,255,255,.2)',
                }}
              />
            ))}
            <span className="ml-1 text-xs" style={{ color: 'var(--on-chrome-soft)' }}>
              {questionNumber} of {QUESTION_STEPS.length}
            </span>
          </div>
        ) : null}
      </header>

      {error ? (
        <p
          className="rounded-xl p-3 font-bold"
          style={{ background: '#fdeae7', color: '#a62f1e' }}
        >
          {error}
        </p>
      ) : null}

      {step === 'intro' ? (
        <Frame
          title="Let us set the board up together"
          hint="A few short questions, one at a time, and one quick tapping exercise. About two minutes. Everything can be changed later."
          footer={
            <Button size="xl" onClick={() => goto('age')}>
              Start
            </Button>
          }
        />
      ) : null}

      {step === 'age' ? (
        <Frame
          title="How old is the communicator?"
          hint="Optional. This helps choose a voice that suits them."
          footer={
            <>
              <Button size="xl" disabled={saving} onClick={() => void save({ age: age ? Number(age) : null }, 'gender')}>
                Continue
              </Button>
              {backButton}
              <button
                type="button"
                className="text-sm font-bold underline"
                style={{ color: 'var(--ink-soft)' }}
                onClick={() => void save({ age: null }, 'gender')}
              >
                Skip
              </button>
            </>
          }
        >
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={120}
            autoFocus
            value={age}
            onChange={(e) => setAge(e.target.value)}
            placeholder="8"
            className="min-h-[64px] w-full rounded-xl border-2 px-4 text-2xl font-bold"
            style={{ borderColor: '#cfcfc4', background: '#fff', color: 'var(--ink)' }}
          />
        </Frame>
      ) : null}

      {step === 'gender' ? (
        <Frame
          title="Are they a boy or a girl?"
          hint="Optional. Used to pick a matching voice later."
          footer={
            <>
              <Button size="xl" disabled={saving} onClick={() => void save({ gender: gender || null }, 'nationality')}>
                Continue
              </Button>
              {backButton}
            </>
          }
        >
          <div className="flex flex-col gap-3">
            {['girl', 'boy', 'other', 'prefer not to say'].map((option) => (
              <Button
                key={option}
                size="xl"
                variant={gender === option ? 'selected' : 'secondary'}
                onClick={() => setGender(option)}
              >
                {option}
              </Button>
            ))}
          </div>
        </Frame>
      ) : null}

      {step === 'nationality' ? (
        <Frame
          title="Where do they live?"
          hint="Optional. This is what will choose an accent when more voices are added."
          footer={
            <>
              <Button
                size="xl"
                disabled={saving}
                onClick={() => void save({ nationality: nationality || null }, 'relationship')}
              >
                Continue
              </Button>
              {backButton}
            </>
          }
        >
          <input
            type="text"
            autoFocus
            value={nationality}
            placeholder="Ireland"
            onChange={(e) => setNationality(e.target.value)}
            className="min-h-[64px] w-full rounded-xl border-2 px-4 text-xl font-bold"
            style={{ borderColor: '#cfcfc4', background: '#fff', color: 'var(--ink)' }}
          />
        </Frame>
      ) : null}

      {step === 'relationship' ? (
        <Frame
          title="Who are you to them?"
          footer={
            <>
              <Button
                size="xl"
                disabled={saving}
                onClick={() => void save({ caregiverRelationship: relationship || null }, 'vision')}
              >
                Continue
              </Button>
              {backButton}
            </>
          }
        >
          <div className="flex flex-col gap-3">
            {['parent', 'teacher', 'therapist', 'other'].map((option) => (
              <Button
                key={option}
                size="xl"
                variant={relationship === option ? 'selected' : 'secondary'}
                onClick={() => setRelationship(option)}
              >
                {option}
              </Button>
            ))}
          </div>
        </Frame>
      ) : null}

      {step === 'vision' ? (
        <Frame
          title="How is their eyesight?"
          hint="This sets how big the pictures are. Low vision and CVI also get fewer buttons on a plain, high-contrast background."
          footer={
            <>
              <Button size="xl" disabled={saving} onClick={() => void save({ vision }, 'tap')}>
                Continue
              </Button>
              {backButton}
            </>
          }
        >
          <div className="flex flex-col gap-2.5">
            {VISION_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setVision(option.value)}
                className="flex min-h-[64px] flex-col items-start justify-center rounded-xl border-2 px-4 py-2 text-left"
                style={{
                  borderColor: vision === option.value ? 'var(--teal)' : '#cfcfc4',
                  background: vision === option.value ? '#eaf3f3' : '#fff',
                  color: 'var(--ink)',
                }}
              >
                <span className="text-lg font-bold">{option.label}</span>
                <span className="text-sm" style={{ color: 'var(--ink-soft)' }}>
                  {option.hint}
                </span>
              </button>
            ))}
          </div>
        </Frame>
      ) : null}

      {step === 'tap' ? (
        <section className="sheet flex flex-1 flex-col gap-4 p-6">
          <div>
            <h2 className="text-2xl font-bold">Tap the circle</h2>
            <p className="mt-2 text-base" style={{ color: 'var(--ink-soft)' }}>
              Five circles, one after another. Let them tap naturally. How close the taps land sets
              both the button size and the space between buttons.
            </p>
          </div>
          <div
            ref={surfaceRef}
            onPointerDown={recordTap}
            className="relative min-h-[240px] flex-1 rounded-2xl border-2"
            style={{ borderColor: '#cfcfc4', background: '#fff', touchAction: 'none' }}
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
                background: '#eaf3f3',
                border: '6px solid var(--teal)',
              }}
            />
            <span
              className="absolute bottom-3 left-1/2 -translate-x-1/2 text-sm font-bold"
              style={{ color: 'var(--ink-soft)' }}
            >
              {tapIndex + 1} of {TAP_TARGETS.length}
            </span>
          </div>
          <div className="flex items-center gap-4">
            {backButton}
            <button
              type="button"
              className="text-sm font-bold underline"
              style={{ color: 'var(--ink-soft)' }}
              onClick={() => {
                setErrors([]);
                setTapIndex(0);
                goto('routine');
              }}
            >
              Skip the tapping
            </button>
          </div>
        </section>
      ) : null}

      {step === 'routine' ? (
        <Frame
          title="How structured is their day?"
          hint="This lets the board put the right words up at the right time of day."
          footer={
            <>
              <Button
                size="xl"
                disabled={saving}
                onClick={() =>
                  void save(
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
              {backButton}
            </>
          }
        >
          <div className="flex flex-col gap-3">
            {[
              { value: 'rigid', label: 'Much the same every day' },
              { value: 'loose', label: 'A rough pattern' },
              { value: 'varies', label: 'Different every day' },
            ].map((option) => (
              <Button
                key={option.value}
                size="xl"
                variant={routine === option.value ? 'selected' : 'secondary'}
                onClick={() => setRoutine(option.value)}
              >
                {option.label}
              </Button>
            ))}
          </div>
        </Frame>
      ) : null}

      {step === 'size' ? (
        <Frame
          title="Does this button size look right?"
          hint={
            (errors.length
              ? `Suggested from the tapping: ${describePreset(gridIndex)}.`
              : 'No tapping measured, so this is the standard size.') +
            (suggestion.visionOverrodeTap ? ' Made larger because of the eyesight answer.' : '')
          }
          footer={
            <>
              <Button
                size="xl"
                disabled={saving}
                onClick={() => void save({ gridIndex, gapPx, iconScale }, 'voice')}
              >
                Continue
              </Button>
              {backButton}
            </>
          }
        >
          <label className="flex flex-col gap-2">
            <span className="font-bold">Fewer, bigger buttons or more, smaller buttons</span>
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
            <span className="font-bold">Space between buttons</span>
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

          {/* A live preview at the chosen size, so the choice is visible not
              described. Same aspect ratio as a real tile, so what is shown here is
              the shape that ends up on the board. */}
          <div
            className="tile-grid overflow-y-auto rounded-xl p-2"
            style={{
              background: 'var(--board-bg)',
              gridTemplateColumns: `repeat(${GRID_PRESETS[gridIndex].cols}, minmax(0, 1fr))`,
              gap: `${gapPx}px`,
              maxHeight: 220,
            }}
          >
            {Array.from({
              length: GRID_PRESETS[gridIndex].cols * GRID_PRESETS[gridIndex].rows,
            }).map((_, i) => (
              <span
                key={i}
                className="rounded-lg border-2"
                style={{
                  aspectRatio: '1 / 0.92',
                  background: 'var(--role-object-bg)',
                  borderColor: 'var(--role-object-line)',
                }}
              />
            ))}
          </div>
        </Frame>
      ) : null}

      {step === 'voice' ? (
        <Frame
          title="How should the voice sound?"
          hint="Worked out from the answers you gave. Have a listen, then confirm."
          footer={
            <>
              <Button
                size="xl"
                disabled={saving}
                onClick={() =>
                  void save(
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
              {backButton}
            </>
          }
        >
          <div className="rounded-xl border-2 p-4" style={{ borderColor: '#cfcfc4', background: '#fff' }}>
            <p className="text-xl font-bold">{voice?.label ?? 'Standard voice'}</p>
            <p className="mt-1 text-sm" style={{ color: 'var(--ink-soft)' }}>
              {voice?.rationale ?? 'One standard voice is available at the moment.'}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
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
                <span className="text-sm" style={{ color: 'var(--ink-soft)' }}>
                  If nothing played, the built-in browser voice will be used instead.
                </span>
              ) : null}
            </div>
          </div>
        </Frame>
      ) : null}

      {step === 'done' ? (
        <Frame
          title="Ready"
          hint={`The board is set to ${describePreset(gridIndex)}. Every answer can be changed from Caregiver mode at any time.`}
          footer={
            <>
              <Button size="xl" onClick={() => router.push('/board')}>
                Open the board
              </Button>
              <Button size="xl" variant="secondary" onClick={() => router.push('/board?situation=1')}>
                Describe a situation first
              </Button>
            </>
          }
        />
      ) : null}
    </main>
  );
}
