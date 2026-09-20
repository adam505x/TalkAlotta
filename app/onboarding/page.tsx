'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { CountrySelect } from '@/components/ui/country-select';
import { ProgressBar } from '@/components/ui/progress-bar';
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
 *
 * One question per screen, nothing pre-selected on a question that has a real
 * answer to get right, and the button-size step is a pop-up confirmation right
 * after the tap test rather than a separate page later on.
 *
 * The caregiver is a parent, a teacher or a therapist, and may be meeting AAC
 * for the first time today, so every question says plainly what it changes and
 * why it is being asked.
 */

type Step =
  | 'intro'
  | 'profile_age'
  | 'profile_gender'
  | 'profile_nationality'
  | 'profile_relationship'
  | 'vision'
  | 'tap'
  | 'routine'
  | 'voice'
  | 'done';

/** Steps that count toward the progress bar. Intro and done are bookends. */
const STEP_ORDER: Step[] = [
  'profile_age',
  'profile_gender',
  'profile_nationality',
  'profile_relationship',
  'vision',
  'tap',
  'routine',
  'voice',
];

/** Five targets: each corner and the centre. */
const TAP_TARGETS = [
  { x: 0.12, y: 0.18 },
  { x: 0.88, y: 0.18 },
  { x: 0.5, y: 0.5 },
  { x: 0.12, y: 0.82 },
  { x: 0.88, y: 0.82 },
];

/** Radius of the actual target, in CSS pixels. Inside this counts as a clean hit. */
const TAP_CORE_RADIUS = 40;
/** Radius of the visualised falloff ring around the target. */
const TAP_DEAD_ZONE_RADIUS = 100;
/** How long the tap feedback holds on screen before the next target appears. */
const TAP_SETTLE_MS = 420;

const VISION_OPTIONS: { value: VisionCategory; label: string; hint: string }[] = [
  { value: 'none', label: 'No known difficulty', hint: 'Sees the screen comfortably' },
  { value: 'glasses', label: 'Wears glasses', hint: 'Corrected vision, glasses worn for screens' },
  {
    value: 'low_vision',
    label: 'Low vision',
    hint: 'Sees better when pictures are larger and plainer',
  },
  {
    value: 'cvi',
    label: 'Cortical visual impairment',
    hint: 'Fewer buttons, plain background, high contrast',
  },
  { value: 'unknown', label: 'Not sure', hint: 'Standard sizes are used until you know more' },
];

const GENDER_OPTIONS = [
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
  { value: 'other', label: 'Other' },
  { value: 'prefer not to say', label: 'Prefer not to say' },
];

const RELATIONSHIP_OPTIONS = [
  { value: 'parent', label: 'Parent or family member' },
  { value: 'teacher', label: 'Teacher or classroom staff' },
  { value: 'therapist', label: 'Speech and language therapist' },
  { value: 'other', label: 'Someone else' },
];

const ROUTINE_OPTIONS = [
  {
    value: 'fixed',
    label: 'The same order every day',
    hint: 'A set sequence. Changing it without warning is genuinely distressing.',
  },
  {
    value: 'rigid',
    label: 'Mostly fixed, small changes are handled',
    hint: 'Predictable days. A swap here or there is fine once they know about it.',
  },
  {
    value: 'split',
    label: 'Structured in one place, relaxed in another',
    hint: 'School or therapy runs to a timetable, home does not, or the other way round.',
  },
  {
    value: 'loose',
    label: 'A rough pattern, times move around',
    hint: 'The same sort of day, but nothing happens at a fixed hour.',
  },
  {
    value: 'varies',
    label: 'Different every day',
    hint: 'No two days look alike, so there is no order to rely on.',
  },
];

/**
 * Age bands, not an exact number. The only thing that reads age is the voice
 * lookup in lib/voice.ts, which buckets it into child, teen or adult, so the
 * band is the real unit and asking for a precise number would be friction for
 * detail nothing uses. Each band sits wholly inside one of those buckets, and
 * the stored value is a representative age from inside the band.
 */
const AGE_OPTIONS: { value: number; label: string }[] = [
  { value: 3, label: 'Under 5' },
  { value: 6, label: '5 to 8' },
  { value: 10, label: '9 to 12' },
  { value: 16, label: '13 to 19' },
  { value: 30, label: '20 to 39' },
  { value: 50, label: '40 or older' },
];

/**
 * The explanation under each question. Plain prose, no card and no bubble: it
 * is set at a readable measure and a size that holds its own next to the
 * heading, rather than being boxed off as an aside.
 */
function Guide({
  children,
  center = false,
  wide = false,
}: {
  children: React.ReactNode;
  center?: boolean;
  /** Wider measure for full-width steps (e.g. tap). Left edge stays put. */
  wide?: boolean;
}) {
  return (
    <div
      className={`type-body flex flex-col gap-3 ${
        wide ? 'max-w-none' : 'max-w-[62ch]'
      } ${center ? 'mx-auto text-center' : ''}`}
      style={{ color: 'var(--ink-soft)' }}
    >
      {children}
    </div>
  );
}

/**
 * One question per screen, sized to sit inside an iPad viewport without the
 * page ever scrolling.
 *
 * In landscape the explanation and the answer sit side by side, which is what
 * makes room for explanations this long on an 820px-tall screen. In portrait
 * they stack, with the answer taking the remaining height. The action stays
 * pinned outside the answer area so it can never be pushed out of reach.
 */
function StepLayout({
  title,
  guide,
  children,
  action,
  wide = false,
  center = false,
  scrollAnswer = true,
}: {
  title: string;
  guide: React.ReactNode;
  children?: React.ReactNode;
  action: React.ReactNode;
  wide?: boolean;
  /** Title, guide and answer stacked and centred (confirmation steps). */
  center?: boolean;
  scrollAnswer?: boolean;
}) {
  // The action sits below both columns rather than inside one of them, so it
  // lands in the middle of the screen in landscape instead of off under the
  // answers. Width is capped so it stays a button rather than a banner.
  const footer = (
    <div className="flex shrink-0 justify-center">
      <div className="w-full max-w-md">{action}</div>
    </div>
  );

  if (wide) {
    return (
      <section className="flex min-h-0 flex-1 flex-col gap-3">
        <h2 className="type-title shrink-0">{title}</h2>
        <div className="shrink-0">{guide}</div>
        <div className="min-h-0 flex-1">{children}</div>
        {footer}
      </section>
    );
  }

  if (center) {
    return (
      <section className="flex min-h-0 flex-1 flex-col gap-5">
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4">
          <h2 className="type-title shrink-0 text-center">{title}</h2>
          <div className="w-full max-w-lg shrink-0">{guide}</div>
          <div className="w-full max-w-lg shrink-0">{children}</div>
        </div>
        {footer}
      </section>
    );
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,auto)_minmax(0,1fr)] gap-5 lg:grid-cols-2 lg:grid-rows-1 lg:gap-10">
        {/* Both columns get a safety valve. Nothing here should ever need it at
            iPad size, but clipped-and-unreachable is strictly worse than a short
            scroll inside one column, and the page itself still cannot move. */}
        <div className="flex min-h-0 flex-col gap-3 overflow-y-auto">
          <h2 className="type-title shrink-0">{title}</h2>
          {guide}
        </div>
        <div className={`min-h-0 ${scrollAnswer ? 'overflow-y-auto' : ''}`}>{children}</div>
      </div>
      {footer}
    </section>
  );
}

function ChevronLeft() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="26"
      height="26"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M15 5 8 12l7 7" />
    </svg>
  );
}

/** iOS sliders fill the track up to the handle. Painted as a gradient sized to
 * the 4px track so the fill sits on the track, not behind the whole control. */
function sliderFill(value: number, min: number, max: number): React.CSSProperties {
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;
  return {
    backgroundImage: `linear-gradient(to right, var(--focus) 0 ${pct}%, var(--line) ${pct}% 100%)`,
    backgroundSize: '100% 4px',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
  };
}

function CheckMark() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
      style={{ color: 'var(--focus)' }}
    >
      <path d="m5 13 4.5 4.5L19 7" />
    </svg>
  );
}

/** One rounded card holding the whole set of choices, hairline-separated. */
function OptionGroup({ children }: { children: React.ReactNode }) {
  return <div className="option-group">{children}</div>;
}

/**
 * A row in that card. Selection reads as a checkmark and a weight change, not
 * a heavy outline, so it still carries under the CVI theme where the tint
 * washes out to nothing.
 */
function OptionRow({
  label,
  hint,
  selected,
  onClick,
}: {
  label: string;
  hint?: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className="option-row flex min-h-[58px] w-full items-center gap-3 px-4 py-2.5 text-left"
      style={{ background: selected ? 'var(--tint-soft)' : 'transparent' }}
    >
      <span className="min-w-0 flex-1">
        <span
          className="block text-[17px] leading-tight"
          style={{ fontWeight: selected ? 600 : 400 }}
        >
          {label}
        </span>
        {hint ? (
          <span className="type-footnote mt-1 block" style={{ color: 'var(--ink-soft)' }}>
            {hint}
          </span>
        ) : null}
      </span>
      {selected ? <CheckMark /> : null}
    </button>
  );
}

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('intro');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Profile, one field per screen. No pre-selection; Continue stays disabled until a pick.
  const [age, setAge] = useState<number | null>(null);
  const [gender, setGender] = useState('');
  const [nationality, setNationality] = useState('');
  const [relationship, setRelationship] = useState('');

  // Vision: no pre-selection. Continue stays disabled until the caregiver picks one.
  const [vision, setVision] = useState<VisionCategory | null>(null);
  const [routine, setRoutine] = useState<string | null>(null);

  // Tap calibration
  const [tapIndex, setTapIndex] = useState(0);
  const [errors, setErrors] = useState<number[]>([]);
  const [tapFeedback, setTapFeedback] = useState<{ x: number; y: number; hit: boolean } | null>(
    null,
  );
  const [tapSettling, setTapSettling] = useState(false);
  const surfaceRef = useRef<HTMLDivElement | null>(null);

  // Layout, suggested then editable in the pop-up confirmation.
  const [gridIndex, setGridIndex] = useState(2);
  const [gapPx, setGapPx] = useState(12);
  const [iconScale, setIconScale] = useState(1);
  const [showSizeSheet, setShowSizeSheet] = useState(false);

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

  const suggestion = useMemo(
    () => suggestLayout(averageError, vision ?? 'unknown'),
    [averageError, vision],
  );

  const goto = useCallback((next: Step) => {
    setError(null);
    setShowSizeSheet(false);
    setStep(next);
  }, []);

  const stepIndex = STEP_ORDER.indexOf(step);

  const goBack = useCallback(() => {
    if (stepIndex <= 0) {
      goto('intro');
      return;
    }
    goto(STEP_ORDER[stepIndex - 1]);
  }, [stepIndex, goto]);

  const recordTap = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (tapSettling) return;
      const surface = surfaceRef.current;
      if (!surface) return;
      const rect = surface.getBoundingClientRect();
      const target = TAP_TARGETS[tapIndex];
      const targetX = rect.left + rect.width * target.x;
      const targetY = rect.top + rect.height * target.y;
      const dx = event.clientX - targetX;
      const dy = event.clientY - targetY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const hit = distance <= TAP_CORE_RADIUS;

      setTapFeedback({ x: event.clientX - rect.left, y: event.clientY - rect.top, hit });
      setTapSettling(true);

      const nextErrors = [...errors, distance];
      setErrors(nextErrors);

      window.setTimeout(() => {
        setTapFeedback(null);
        setTapSettling(false);
        if (tapIndex + 1 >= TAP_TARGETS.length) {
          const avg = nextErrors.reduce((a, b) => a + b, 0) / nextErrors.length;
          const suggested = suggestLayout(avg, vision ?? 'unknown');
          setGridIndex(suggested.gridIndex);
          setGapPx(suggested.gapPx);
          setIconScale(suggested.iconScale);
          setShowSizeSheet(true);
        } else {
          setTapIndex(tapIndex + 1);
        }
      }, TAP_SETTLE_MS);
    },
    [errors, tapIndex, vision, tapSettling],
  );

  const skipTap = useCallback(() => {
    setErrors([]);
    setTapIndex(0);
    const fallback = suggestLayout(55, vision ?? 'unknown');
    setGridIndex(fallback.gridIndex);
    setGapPx(fallback.gapPx);
    setIconScale(fallback.iconScale);
    setShowSizeSheet(true);
  }, [vision]);

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
    [goto],
  );

  const stepNumber = stepIndex + 1;

  return (
    <div className="page-light h-dvh overflow-hidden">
    <main className="safe-top safe-bottom mx-auto flex h-full w-full max-w-6xl flex-col gap-4 overflow-hidden p-5 lg:gap-5 lg:p-6">
      <header className="flex shrink-0 flex-col gap-3">
        <p
          className="text-[13px] font-semibold uppercase"
          style={{ color: 'var(--ink-soft)', letterSpacing: '0.06em' }}
        >
          TalkAlotta
        </p>
        {stepIndex >= 0 ? (
          <div className="flex items-center gap-3">
            {/* A bare chevron in the tint colour, the way iOS draws Back. The
                tap area stays 44px even though the glyph is small. */}
            <button
              type="button"
              onClick={goBack}
              aria-label="Back to the previous question"
              className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-[background-color,transform] duration-100 active:scale-95"
              style={{ color: 'var(--focus)' }}
            >
              <ChevronLeft />
            </button>
            <div className="min-w-0 flex-1">
              <ProgressBar value={stepNumber} max={STEP_ORDER.length} />
            </div>
            <p
              className="type-footnote shrink-0 font-medium tabular-nums"
              style={{ color: 'var(--ink-soft)' }}
            >
              {stepNumber} of {STEP_ORDER.length}
            </p>
          </div>
        ) : null}
      </header>

      {error ? (
        <p
          className="shrink-0 rounded-xl border-2 p-3 text-base font-semibold"
          style={{ borderColor: 'var(--role-feeling-line)', background: 'var(--role-feeling-bg)' }}
        >
          {error}
        </p>
      ) : null}

      {/* Keyed on the step so each question cross-fades and rises in. Enter and
          exit share the one path, and reduced motion drops the travel. */}
      <div key={step} className="step-enter flex min-h-0 flex-1 flex-col">
      {step === 'intro' ? (
        <section className="flex min-h-0 flex-1 flex-col justify-center gap-5">
          <h2 className="type-display text-center">
            Let us set the board up together
          </h2>
          <Guide center>
            <p>
              A few short questions, one at a time, then one quick tapping exercise. It takes about
              two minutes.
            </p>
            <p>
              You are answering on behalf of the person who will use the board, so answer as you
              see them day to day. Nothing here is permanent. Every answer can be changed later in
              Settings, and none of it is sent anywhere outside this device.
            </p>
          </Guide>
          <div className="flex justify-center">
            <Button size="xl" className="w-full max-w-md" onClick={() => goto('profile_age')}>
              Start
            </Button>
          </div>
        </section>
      ) : null}

      {step === 'profile_age' ? (
        <StepLayout
          title="How old are they?"
          guide={
            <Guide>
              <p>
                Age does two jobs here. It guides which starter words go on the board, because the
                vocabulary a four year old reaches for is not the vocabulary a teenager needs.
              </p>
              <p>
                It also feeds the voice choice further on. A child speaking with an adult voice is
                one of the common reasons a device gets abandoned, so it is worth a moment now.
              </p>
              <p>A rough band is all that is needed.</p>
            </Guide>
          }
          action={
            <Button
              size="xl"
              className="w-full"
              disabled={age === null}
              onClick={() => {
                if (age === null) return;
                goto('profile_gender');
              }}
            >
              Continue
            </Button>
          }
        >
          <OptionGroup>
            {AGE_OPTIONS.map((option) => (
              <OptionRow
                key={option.label}
                label={option.label}
                selected={age === option.value}
                onClick={() => setAge(option.value)}
              />
            ))}
          </OptionGroup>
        </StepLayout>
      ) : null}

      {step === 'profile_gender' ? (
        <StepLayout
          title="What is their gender?"
          guide={
            <Guide>
              <p>
                This is used for one thing only: choosing a speaking voice that the person is happy
                to be heard with. The board speaks in their place, so the voice is treated as part
                of how they present themselves, not as a setting.
              </p>
              <p>It can be changed at any time in Settings.</p>
            </Guide>
          }
          action={
            <Button
              size="xl"
              className="w-full"
              disabled={!gender}
              onClick={() => {
                if (!gender) return;
                goto('profile_nationality');
              }}
            >
              Continue
            </Button>
          }
        >
          <OptionGroup>
            {GENDER_OPTIONS.map((option) => (
              <OptionRow
                key={option.value}
                label={option.label}
                selected={gender === option.value}
                onClick={() => setGender(option.value)}
              />
            ))}
          </OptionGroup>
        </StepLayout>
      ) : null}

      {step === 'profile_nationality' ? (
        <StepLayout
          title="Which country or region?"
          scrollAnswer={false}
          guide={
            <Guide>
              <p>
                This sets the accent of the speaking voice. An accent that matches the people
                around them is easier for family, classmates and staff to follow, and it keeps the
                board sounding like it belongs to them rather than to the software.
              </p>
              <p>
                Start typing to narrow the list, or open it and scroll. If the place you want is not
                listed, type it anyway and it is kept as you wrote it.
              </p>
            </Guide>
          }
          action={
            <Button
              size="xl"
              className="w-full"
              disabled={!nationality.trim()}
              onClick={() => {
                if (!nationality.trim()) return;
                goto('profile_relationship');
              }}
            >
              Continue
            </Button>
          }
        >
          <CountrySelect value={nationality} onChange={setNationality} placeholder="Ireland" />
        </StepLayout>
      ) : null}

      {step === 'profile_relationship' ? (
        <StepLayout
          title="Who is setting this up?"
          guide={
            <Guide>
              <p>
                A parent, a teacher and a therapist each see a different slice of the day, so this
                tells us whose view the rest of the answers are coming from.
              </p>
              <p>
                If you are new to AAC, that is expected and nothing here assumes otherwise. Every
                question explains what it changes before it asks.
              </p>
            </Guide>
          }
          action={
            <Button
              size="xl"
              className="w-full"
              disabled={saving || !relationship}
              onClick={() => {
                if (!relationship) return;
                void saveAndContinue(
                  {
                    age,
                    gender: gender || null,
                    nationality: nationality || null,
                    caregiverRelationship: relationship || null,
                  },
                  'vision',
                );
              }}
            >
              Continue
            </Button>
          }
        >
          <OptionGroup>
            {RELATIONSHIP_OPTIONS.map((option) => (
              <OptionRow
                key={option.value}
                label={option.label}
                selected={relationship === option.value}
                onClick={() => setRelationship(option.value)}
              />
            ))}
          </OptionGroup>
        </StepLayout>
      ) : null}

      {step === 'vision' ? (
        <StepLayout
          title="How is their eyesight?"
          guide={
            <Guide>
              <p>
                This one answer changes more of the board than anything else in setup. It sets how
                large the pictures are, how many buttons appear at once, and whether the background
                stays plain.
              </p>
              <p>
                For low vision, size is the thing that helps. For cortical visual impairment, size
                alone does not. CVI is a difference in how the brain interprets what the eyes send,
                so a crowded screen is harder to read than a small one. Those boards get fewer
                buttons, wider spacing and a plain high contrast background rather than just bigger
                text.
              </p>
              <p>
                If you do not know, choose Not sure. Standard sizes are used, and a therapist can
                refine it later from Settings.
              </p>
            </Guide>
          }
          action={
            <Button
              size="xl"
              className="w-full"
              disabled={saving || !vision}
              onClick={() => {
                if (!vision) return;
                void saveAndContinue({ vision }, 'tap');
              }}
            >
              Continue
            </Button>
          }
        >
          <OptionGroup>
            {VISION_OPTIONS.map((option) => (
              <OptionRow
                key={option.value}
                label={option.label}
                hint={option.hint}
                selected={vision === option.value}
                onClick={() => setVision(option.value)}
              />
            ))}
          </OptionGroup>
        </StepLayout>
      ) : null}

      {step === 'tap' ? (
        <StepLayout
          wide
          title="Tap the circle"
          guide={
            <Guide wide>
              <p>
                Five circles appear one after another. Hand the iPad over and let them tap the way
                they normally would, without guiding their hand. The middle is the real target, and
                the soft ring around it shows how much room there is either side. This measures how
                big the buttons need to be and how much space to leave between them, and the
                spacing matters as much as the size: for an unsteady reach or a tremor, a wider gap
                is what stops the neighbouring button being pressed by mistake.
              </p>
            </Guide>
          }
          action={
            <button
              type="button"
              className="w-full text-center text-sm font-semibold underline"
              onClick={skipTap}
            >
              Skip this for now
            </button>
          }
        >
          <div
            ref={surfaceRef}
            onPointerDown={recordTap}
            className="relative h-full w-full overflow-hidden rounded-2xl border-4"
            style={{ borderColor: 'var(--line)', background: 'var(--card)', touchAction: 'none' }}
            role="button"
            tabIndex={0}
            aria-label={`Tap target ${tapIndex + 1} of ${TAP_TARGETS.length}`}
          >
            {/* Dead-zone falloff: the centre is the real target, fading out to nothing. */}
            <span
              aria-hidden="true"
              className="absolute rounded-full"
              style={{
                left: `${TAP_TARGETS[tapIndex].x * 100}%`,
                top: `${TAP_TARGETS[tapIndex].y * 100}%`,
                transform: 'translate(-50%, -50%)',
                width: TAP_DEAD_ZONE_RADIUS * 2,
                height: TAP_DEAD_ZONE_RADIUS * 2,
                background:
                  'radial-gradient(circle, color-mix(in srgb, var(--role-modifier-line) 35%, transparent) 0%, color-mix(in srgb, var(--role-modifier-line) 12%, transparent) 55%, transparent 100%)',
              }}
            />
            {/* The actual target, with a visible outline. Pops on every tap. */}
            <span
              key={`${tapIndex}-outline`}
              aria-hidden="true"
              className="absolute rounded-full"
              style={{
                left: `${TAP_TARGETS[tapIndex].x * 100}%`,
                top: `${TAP_TARGETS[tapIndex].y * 100}%`,
                // Must match the falloff ring's centring. Without it the box is
                // hung from its top-left corner and sits a radius down and right
                // of the point taps are actually measured against.
                transform: 'translate(-50%, -50%)',
                width: TAP_CORE_RADIUS * 2,
                height: TAP_CORE_RADIUS * 2,
                background: 'var(--role-modifier-bg)',
                border: '6px solid var(--role-modifier-line)',
                animation: tapFeedback ? 'tap-target-pop 260ms ease-out' : undefined,
              }}
            />
            {/* Transient feedback at the actual tap point: green pop for a hit,
                red for a miss just outside the target. */}
            {tapFeedback ? (
              <span
                aria-hidden="true"
                className="absolute rounded-full"
                style={{
                  left: tapFeedback.x,
                  top: tapFeedback.y,
                  transform: 'translate(-50%, -50%)',
                  width: 56,
                  height: 56,
                  border: `4px solid ${tapFeedback.hit ? 'var(--role-action-line)' : 'var(--role-feeling-line)'}`,
                  background: tapFeedback.hit ? 'var(--role-action-bg)' : 'var(--role-feeling-bg)',
                  animation: 'tap-ripple 420ms ease-out forwards',
                }}
              />
            ) : null}
            <span className="absolute bottom-3 left-1/2 -translate-x-1/2 text-sm font-semibold">
              {tapIndex + 1} of {TAP_TARGETS.length}
            </span>
          </div>
        </StepLayout>
      ) : null}

      {step === 'routine' ? (
        <StepLayout
          title="How structured is their day?"
          guide={
            <Guide>
              <p>
                The board can offer different words at different times of day, putting breakfast
                words up at breakfast time. That prediction is only useful if the day is
                predictable, so this answer sets how much weight the time of day is given.
              </p>
              <p>
                It also tells us how carefully to tread. For someone who relies on a fixed order,
                an unannounced change to what is on screen is not a small thing, so the more fixed
                the day, the more the board stays put and waits for you to describe a new moment
                instead of rearranging itself.
              </p>
              <p>Pick the closest one. It can be changed in Settings as they change.</p>
            </Guide>
          }
          action={
            <Button
              size="xl"
              className="w-full"
              disabled={saving || !routine}
              onClick={() => {
                if (!routine) return;
                void saveAndContinue({ routine }, 'voice');
              }}
            >
              Continue
            </Button>
          }
        >
          <OptionGroup>
            {ROUTINE_OPTIONS.map((option) => (
              <OptionRow
                key={option.value}
                label={option.label}
                hint={option.hint}
                selected={routine === option.value}
                onClick={() => setRoutine(option.value)}
              />
            ))}
          </OptionGroup>
        </StepLayout>
      ) : null}

      {step === 'voice' ? (
        <StepLayout
          center
          title="How should the voice sound?"
          guide={
            <Guide center>
              <p>Worked out from the answers you gave. Have a listen and confirm.</p>
            </Guide>
          }
          action={
            <Button
              size="xl"
              className="w-full"
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
          }
        >
          <div
            className="flex flex-col items-center gap-4 rounded-[14px] px-6 py-5 text-center"
            style={{ border: '1px solid var(--line)', background: 'var(--card)' }}
          >
            <div>
              <p className="text-[17px] font-semibold">{voice?.label ?? 'Standard voice'}</p>
              <p className="type-footnote mt-1" style={{ color: 'var(--ink-soft)' }}>
                {voice?.rationale ?? 'One standard voice is available at the moment.'}
              </p>
            </div>
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
              <p className="type-footnote" style={{ color: 'var(--ink-soft)' }}>
                If nothing played, the browser voice will be used instead.
              </p>
            ) : null}
          </div>
        </StepLayout>
      ) : null}

      {step === 'done' ? (
        <section className="flex min-h-0 flex-1 flex-col justify-center gap-5">
          <h2 className="type-display text-center">Ready</h2>
          <Guide center>
            <p>The board is set to {describePreset(gridIndex)}.</p>
            <p>Every answer can be changed from Settings at any time.</p>
          </Guide>
          <div className="flex flex-wrap justify-center gap-3">
            <Button size="xl" onClick={() => router.push('/board')}>
              Open the board
            </Button>
            <Button size="xl" variant="secondary" onClick={() => router.push('/board?situation=1')}>
              Describe a situation first
            </Button>
          </div>
        </section>
      ) : null}
      </div>

      {showSizeSheet ? (
        <div
          className="sheet-scrim fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label="Button size"
        >
          <div
            className="sheet-panel flex max-h-[86vh] w-full max-w-xl flex-col gap-5 overflow-y-auto rounded-t-[22px] px-6 pb-6 pt-3 sm:rounded-[22px] sm:pt-5"
            style={{
              background: 'var(--card)',
              boxShadow: '0 -8px 40px rgb(0 0 0 / 0.18)',
            }}
          >
            <div aria-hidden="true" className="sheet-grabber mx-auto shrink-0 sm:hidden" />
            <div>
              <h2 className="type-title">Button size</h2>
              <p className="type-body mt-1" style={{ color: 'var(--ink-soft)' }}>
                {errors.length
                  ? `Suggested from the tapping: ${describePreset(gridIndex)}.`
                  : 'No tapping measured, so this is the standard size.'}
                {suggestion.visionOverrodeTap ? ' Made larger because of the eyesight answer.' : ''}
              </p>
            </div>

            <label className="flex flex-col gap-2">
              <span className="text-[15px] font-semibold">
                Fewer, bigger buttons &nbsp;&harr;&nbsp; more, smaller buttons
              </span>
              <input
                type="range"
                min={0}
                max={GRID_PRESETS.length - 1}
                step={1}
                value={gridIndex}
                onChange={(e) => setGridIndex(Number(e.target.value))}
                style={sliderFill(gridIndex, 0, GRID_PRESETS.length - 1)}
              />
              <span className="type-footnote" style={{ color: 'var(--ink-soft)' }}>
                {describePreset(gridIndex)}
              </span>
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-[15px] font-semibold">Space between buttons</span>
              <input
                type="range"
                min={8}
                max={28}
                step={1}
                value={gapPx}
                onChange={(e) => setGapPx(Number(e.target.value))}
                style={sliderFill(gapPx, 8, 28)}
              />
              <span className="type-footnote" style={{ color: 'var(--ink-soft)' }}>
                {gapPx} pixels. More space means fewer accidental presses.
              </span>
            </label>

            {/* A live preview at the chosen size, so the choice is visible not described. */}
            <div
              className="grid rounded-xl p-2"
              style={{
                border: '1px solid var(--line)',
                gridTemplateColumns: `repeat(${GRID_PRESETS[gridIndex].cols}, minmax(0, 1fr))`,
                gap: `${gapPx}px`,
                height: 180,
              }}
            >
              {Array.from({
                length: GRID_PRESETS[gridIndex].cols * GRID_PRESETS[gridIndex].rows,
              }).map((_, i) => (
                <span
                  key={i}
                  className="rounded-lg border-2"
                  style={{
                    background: 'var(--role-object-bg)',
                    borderColor: 'var(--role-object-line)',
                  }}
                />
              ))}
            </div>

            <Button
              size="xl"
              disabled={saving}
              onClick={() =>
                void saveAndContinue(
                  {
                    gridIndex,
                    gapPx,
                    iconScale,
                    tapErrorPx: errors.length ? Math.round(averageError) : null,
                  },
                  'routine',
                )
              }
            >
              Looks good
            </Button>
          </div>
        </div>
      ) : null}
    </main>
    </div>
  );
}
