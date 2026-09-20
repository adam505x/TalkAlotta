'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { CountrySelect } from '@/components/ui/country-select';
import { ProgressBar } from '@/components/ui/progress-bar';
import { Logo } from '@/components/brand/Logo';
import { Glyph, type GlyphExpression } from '@/components/brand/Glyph';
import {
  BOARD_COLS,
  BOARD_ROWS,
  BUTTON_SCALE_DEFAULT,
  BUTTON_SCALE_MAX,
  BUTTON_SCALE_MIN,
  BUTTON_SCALE_STEP,
  describeButtonSize,
  suggestLayout,
  type VisionCategory,
} from '@/lib/sizing';
import { speak, unlockAudio } from '@/lib/speech';
import { COLOR_VISION_OPTIONS, type ColorVisionCategory } from '@/lib/color-vision';
import { OptionGroup, OptionRow, sliderFill } from '@/components/ui/option-list';
import { PaletteDots } from '@/components/ui/palette-dots';

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
  | 'profile_name'
  | 'profile_age'
  | 'profile_gender'
  | 'profile_nationality'
  | 'profile_relationship'
  | 'vision'
  | 'color_vision'
  | 'tap'
  | 'routine'
  | 'voice'
  | 'done';

/** Steps that count toward the progress bar. Intro and done are bookends. */
const STEP_ORDER: Step[] = [
  'profile_name',
  'profile_age',
  'profile_gender',
  'profile_nationality',
  'profile_relationship',
  'vision',
  'color_vision',
  'routine',
  'tap',
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

const VISION_OPTIONS: { value: VisionCategory; label: string }[] = [
  { value: 'none', label: 'No known difficulty' },
  { value: 'glasses', label: 'Wears glasses' },
  { value: 'low_vision', label: 'Low vision' },
  { value: 'cvi', label: 'Cortical visual impairment' },
  { value: 'unknown', label: 'Not sure' },
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
  { value: 'fixed', label: 'The same order every day' },
  { value: 'rigid', label: 'Mostly fixed, small changes are handled' },
  { value: 'split', label: 'Structured in one place, relaxed in another' },
  { value: 'loose', label: 'A rough pattern, times move around' },
  { value: 'varies', label: 'Different every day' },
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
 * Which eyes the glyph wears on each step.
 *
 * Mostly `open` on purpose. The character reacting at four points across the
 * flow reads as attention; a different face on every screen would read as
 * fidgeting next to a question someone is trying to answer.
 */
const STEP_EXPRESSION: Record<Step, GlyphExpression> = {
  intro: 'happy',
  // Meeting someone: interested, then settling into plain attention.
  profile_name: 'curious',
  profile_age: 'open',
  profile_gender: 'open',
  profile_nationality: 'curious',
  profile_relationship: 'open',
  // The questions that ask for a judgement rather than a fact.
  vision: 'curious',
  // Plain attention: three curious faces in a row would read as fidgeting.
  color_vision: 'open',
  routine: 'curious',
  // The step that is a game.
  tap: 'wink',
  // Hearing the voice for the first time, and finishing.
  voice: 'happy',
  done: 'happy',
};

/** How long a wink lasts before the face settles. A beat, not a pose. */
const WINK_MS = 1200;

/**
 * A wink is a gesture, not a state.
 *
 * STEP_EXPRESSION names the expression a step opens on, which is right for the
 * symmetrical faces: they are moods, and a mood can hold for as long as the
 * question does. The wink cannot. Holding it leaves the character with one eye
 * shut for the whole of the tap step, which is five taps long and reads as a
 * rendering fault rather than as a joke, and the idle blink squashing a face
 * that is already half closed only makes it look more broken.
 *
 * So the wink plays once on arrival and then settles to plain attention. Going
 * back to the step winks again, because it is the arrival that is being marked.
 */
function useSettlingExpression(target: GlyphExpression): GlyphExpression {
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    setSettled(false);
    if (target !== 'wink') return;
    const timer = window.setTimeout(() => setSettled(true), WINK_MS);
    return () => window.clearTimeout(timer);
  }, [target]);

  return target === 'wink' && settled ? 'open' : target;
}

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
      className={`type-body-lg flex flex-col gap-3 ${
        wide ? 'max-w-none' : 'max-w-[54ch]'
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
  /** Omitted on steps the question already explains on its own. */
  guide?: React.ReactNode;
  children?: React.ReactNode;
  action: React.ReactNode;
  wide?: boolean;
  /** Title, guide and answer stacked and centred (confirmation steps). */
  center?: boolean;
  scrollAnswer?: boolean;
}) {
  // The action sits below both columns rather than inside one of them, so it
  // lands in the middle of the screen in landscape instead of off under the
  // answers. Width is capped so it stays a button rather than a banner, and the
  // same bottom inset is used on every step so it never appears to move between
  // questions.
  const footer = (
    <div className="flex shrink-0 justify-center pb-2 lg:pb-5">
      <div className="w-full max-w-md">{action}</div>
    </div>
  );

  if (wide) {
    return (
      <section className="flex min-h-0 flex-1 flex-col gap-4">
        <h2 className="type-question shrink-0">{title}</h2>
        {guide ? <div className="shrink-0">{guide}</div> : null}
        <div className="min-h-0 flex-1">{children}</div>
        {footer}
      </section>
    );
  }

  if (center) {
    return (
      <section className="flex min-h-0 flex-1 flex-col gap-5">
        {/* Sat a little above the true centre: optically centred rather than
            measured centre, and it leaves the room a dropped-open list needs. */}
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5 pb-6 lg:pb-10">
          <h2 className="type-question shrink-0 text-center">{title}</h2>
          {guide ? <div className="w-full max-w-xl shrink-0">{guide}</div> : null}
          <div className="w-full max-w-xl shrink-0">{children}</div>
        </div>
        {footer}
      </section>
    );
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,auto)_minmax(0,1fr)] gap-5 lg:grid-cols-2 lg:grid-rows-1 lg:gap-12">
        {/* Both columns get a safety valve. Nothing here should ever need it at
            iPad size, but clipped-and-unreachable is strictly worse than a short
            scroll inside one column, and the page itself still cannot move.
            min-h-full on the inner block is what centres short content against
            the answers without breaking that scroll when content is tall. */}
        <div className="flex min-h-0 flex-col overflow-y-auto">
          <div className="flex min-h-full flex-col gap-4 lg:justify-center">
            <h2 className="type-question">{title}</h2>
            {guide ?? null}
          </div>
        </div>
        <div className={`min-h-0 ${scrollAnswer ? 'overflow-y-auto' : ''}`}>
          {/* Centred against the question beside it in landscape. Stacked in
              portrait the question is above, so the answers stay up against it
              rather than drifting into the middle of what is left. */}
          <div className="flex min-h-full flex-col lg:justify-center">{children}</div>
        </div>
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

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('intro');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Profile, one field per screen. No pre-selection; Continue stays disabled until a pick.
  const [name, setName] = useState('');
  const [age, setAge] = useState<number | null>(null);
  const [gender, setGender] = useState('');
  const [nationality, setNationality] = useState('');
  const [relationship, setRelationship] = useState('');

  // Vision: no pre-selection. Continue stays disabled until the caregiver picks one.
  const [vision, setVision] = useState<VisionCategory | null>(null);
  // Colour vision is its own answer. It picks the palette and nothing else, so
  // it is deliberately not folded into the eyesight question above it.
  const [colorVision, setColorVision] = useState<ColorVisionCategory | null>(null);
  const [routine, setRoutine] = useState<string | null>(null);

  // Tap calibration
  const [tapIndex, setTapIndex] = useState(0);
  const [errors, setErrors] = useState<number[]>([]);
  const [tapFeedback, setTapFeedback] = useState<{ x: number; y: number; hit: boolean } | null>(
    null,
  );
  const [tapSettling, setTapSettling] = useState(false);
  const surfaceRef = useRef<HTMLDivElement | null>(null);

  // Button size, suggested then editable in the pop-up confirmation. The grid
  // is not here because there is nothing to hold: it is always seven by four.
  const [buttonScale, setButtonScale] = useState(BUTTON_SCALE_DEFAULT);
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

  const glyphExpression = useSettlingExpression(STEP_EXPRESSION[step]);

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
          setButtonScale(suggested.buttonScale);
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
    setButtonScale(fallback.buttonScale);
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

  // Questions after the first one ask about the communicator by name. Blank only
  // if someone goes back and clears it, and those questions fall back to "they".
  const askedName = name.trim();
  /**
   * "Liam's" once a name is given, "their" before that. Both drop into the same
   * sentence, so every question reads properly either way. Singular possessive
   * always takes 's, including names already ending in s (Chicago/Oxford), so
   * there is no special case to get wrong.
   */
  const askedPossessive = askedName ? `${askedName}'s` : 'their';

  return (
    /* The device safe-area insets sit on the wrapper, not on main. As plain
       unlayered rules they beat any padding utility on the same element, so on
       main they cancelled its page padding outright and pinned the header and
       the button to the screen edges. Here they add to it instead. */
    <div className="brand-surface page-light safe-top safe-bottom h-dvh overflow-hidden">
    <main className="mx-auto flex h-full w-full max-w-6xl flex-col gap-4 overflow-hidden p-5 lg:gap-5 lg:p-6">
      <header className="flex shrink-0 flex-col gap-3">
        <div className="flex items-center justify-between gap-4">
          <Logo variant="horizontal" size={30} />
          {/* Sits in the chrome rather than in the step, so it is always there
              without taking height from a layout that cannot scroll. */}
          {stepIndex >= 0 ? (
            <Glyph size={64} expression={glyphExpression} />
          ) : null}
        </div>
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
          style={{
            borderColor: 'var(--danger)',
            background: 'color-mix(in srgb, var(--danger) 12%, #ffffff)',
            color: 'var(--danger)',
          }}
        >
          {error}
        </p>
      ) : null}

      {/* Keyed on the step so each question cross-fades and rises in. Enter and
          exit share the one path, and reduced motion drops the travel. */}
      <div key={step} className="step-enter flex min-h-0 flex-1 flex-col">
      {/* One column on the centre line, held above the true middle so the title,
          the explanation and the button read as one block rather than three
          things spread down the screen. */}
      {step === 'intro' ? (
        <section className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 pb-10 lg:pb-16">
          <Glyph size={112} expression="happy" />
          <h2 className="type-display max-w-[26ch] text-center">
            Let's set the board up together!
          </h2>
          <Guide center>
            <p>
              A few short questions, then one quick tapping exercise. It takes about
              two minutes.
            </p>
            <p>
              You are answering with, or on behalf of, the boards user.
              Every answer can be changed later in Settings.
            </p>
          </Guide>
          <Button size="xl" className="w-full max-w-md" onClick={() => goto('profile_name')}>
            Start
          </Button>
        </section>
      ) : null}

      {step === 'profile_name' ? (
        <StepLayout
          center
          title="Who is the board for?"
          guide={
            <Guide center>
              <p>
                The name of the person who will use the board. Whatever they are actually called day
                to day is the right answer, whether that is a full name or a nickname.
              </p>
            </Guide>
          }
          action={
            <Button
              size="xl"
              className="w-full"
              disabled={!name.trim()}
              onClick={() => {
                if (!name.trim()) return;
                goto('profile_age');
              }}
            >
              Continue
            </Button>
          }
        >
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && name.trim()) goto('profile_age');
            }}
            placeholder="Josie"
            aria-label="Their name"
            autoComplete="off"
            className="field-text w-full"
          />
        </StepLayout>
      ) : null}

      {/* No explanation on this one: the question says everything it needs to,
          so the band list sits on the centre line under it rather than beside a
          column of text written to fill the space. */}
      {step === 'profile_age' ? (
        <StepLayout
          center
          title={askedName ? `How old is ${askedName}?` : 'How old are they?'}
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
          center
          title={`What is ${askedPossessive} gender?`}
          guide={
            <Guide center>
              <p>Used only to pick a speaking voice they are happy to be heard with.</p>
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
          // A single field, not a list of choices. Two columns would leave one of
          // them nearly empty, so this one stacks on the centre line: question,
          // explanation, field, all on the same axis.
          center
          guide={
            <Guide center>
              <p>
                This sets the accent of the speaking voice. Start typing to narrow the list, or open
                it and scroll.
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
                    name: name.trim() || null,
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
          title={`How is ${askedPossessive} eyesight?`}
          guide={
            <Guide>
              <p>This sets how large the pictures and words inside each button are.</p>
              <p>
                For low vision, bigger helps. For CVI, a plainer screen helps more than a bigger
                one.
              </p>
              <p>Not sure is fine. Standard sizes are used and Settings can change it later.</p>
            </Guide>
          }
          action={
            <Button
              size="xl"
              className="w-full"
              disabled={saving || !vision}
              onClick={() => {
                if (!vision) return;
                void saveAndContinue({ vision }, 'color_vision');
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
                selected={vision === option.value}
                onClick={() => setVision(option.value)}
              />
            ))}
          </OptionGroup>
        </StepLayout>
      ) : null}

      {/* Asked separately from eyesight, because the two answers change
          different things. Eyesight changes SIZE; this changes only which
          colours the buttons are drawn in. Someone who confuses red and green
          usually has ordinary acuity and does not want bigger buttons. */}
      {step === 'color_vision' ? (
        <StepLayout
          title={`How does ${askedPossessive} colour vision work?`}
          guide={
            <Guide>
              <p>
                Buttons are coloured by word type, the standard AAC colour key: people are yellow,
                actions are green, things are orange, and so on.
              </p>
              <p>
                If some of those colours are hard to tell apart, a different set is used that
                keeps them separate. The dots beside each answer show the set it would use.
              </p>
              <p>
                Nothing is lost either way. Every button always carries its word, and the
                same-coloured buttons always sit together.
              </p>
            </Guide>
          }
          action={
            <Button
              size="xl"
              className="w-full"
              disabled={saving || !colorVision}
              onClick={() => {
                if (!colorVision) return;
                void saveAndContinue({ colorVision }, 'routine');
              }}
            >
              Continue
            </Button>
          }
        >
          <OptionGroup>
            {COLOR_VISION_OPTIONS.map((option) => (
              <OptionRow
                key={option.value}
                label={option.label}
                accessory={<PaletteDots value={option.value} />}
                selected={colorVision === option.value}
                onClick={() => setColorVision(option.value)}
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
                Five circles, one after another. Hand the iPad over and let them tap as they
                normally would, without guiding their hand. This sets how big the buttons are.
              </p>
            </Guide>
          }
          action={
            <Button variant="ghost" size="lg" className="w-full" onClick={skipTap}>
              Skip this for now
            </Button>
          }
        >
          <div
            ref={surfaceRef}
            onPointerDown={recordTap}
            className="tap-surface relative h-full w-full overflow-hidden"
            style={{ touchAction: 'none' }}
            role="button"
            tabIndex={0}
            aria-label={`Tap target ${tapIndex + 1} of ${TAP_TARGETS.length}`}
          >
            {/* One wrapper on the measured point. The falloff, the tolerance
                edge and the core all stack on its single grid cell, so they
                cannot drift apart from each other or from the point a tap is
                actually measured against. */}
            <span
              key={`${tapIndex}-target`}
              aria-hidden="true"
              className="tap-target"
              style={
                {
                  left: `${TAP_TARGETS[tapIndex].x * 100}%`,
                  top: `${TAP_TARGETS[tapIndex].y * 100}%`,
                  '--tap-core': `${TAP_CORE_RADIUS * 2}px`,
                  '--tap-zone': `${TAP_DEAD_ZONE_RADIUS * 2}px`,
                } as React.CSSProperties
              }
            >
              <span className="tap-target__falloff" />
              <span className="tap-target__tolerance" />
              {/* Core, crosshair and centre dot pop together, as one mark. */}
              <span
                className="tap-target__mark"
                style={{ animation: tapFeedback ? 'tap-core-pop 260ms ease-out' : undefined }}
              >
                <span className="tap-target__core" />
                <span className="tap-target__crosshair" />
                <span className="tap-target__dot" />
              </span>
            </span>
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
                  border: `4px solid ${tapFeedback.hit ? 'var(--tap-hit)' : 'var(--tap-miss)'}`,
                  background: tapFeedback.hit ? 'var(--tap-hit-wash)' : 'var(--tap-miss-wash)',
                  animation: 'tap-ripple 420ms ease-out forwards',
                }}
              />
            ) : null}
            {/* Position tells the caregiver how far through they are without
                putting a second thing to read next to the target. Ignores
                pointers so a tap here still counts as a tap on the surface. */}
            <div className="pointer-events-none absolute inset-x-0 bottom-4 flex flex-col items-center gap-2">
              <div className="flex gap-2">
                {TAP_TARGETS.map((_, i) => (
                  <span
                    key={i}
                    className={`tap-pip ${
                      i < tapIndex ? 'tap-pip--done' : i === tapIndex ? 'tap-pip--current' : ''
                    }`}
                  />
                ))}
              </div>
              <span
                className="type-footnote font-semibold tabular-nums"
                style={{ color: 'var(--ink-soft)' }}
              >
                {tapIndex + 1} of {TAP_TARGETS.length}
              </span>
            </div>
          </div>
        </StepLayout>
      ) : null}

      {step === 'routine' ? (
        <StepLayout
          title={`How structured is ${askedPossessive} day?`}
          guide={
            <Guide>
              <p>This sets how much the board leans on the time of day.</p>
              <p>
                The more fixed the day, the more the board stays put rather than rearranging
                itself.
              </p>
              <p>Pick the closest one. Settings can change it later.</p>
            </Guide>
          }
          action={
            <Button
              size="xl"
              className="w-full"
              disabled={saving || !routine}
              onClick={() => {
                if (!routine) return;
                void saveAndContinue({ routine }, 'tap');
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
          title={`How should ${askedPossessive} voice sound?`}
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
        <section className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 pb-10 lg:pb-16">
          <Glyph size={112} expression="happy" />
          <h2 className="type-display text-center">Ready</h2>
          <Guide center>
            <p>
              The board is {BOARD_COLS} across and {BOARD_ROWS} down.{' '}
              {describeButtonSize(buttonScale).toLowerCase()}.
            </p>
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
                  ? `Suggested from the tapping: ${describeButtonSize(buttonScale).toLowerCase()}.`
                  : 'No tapping measured, so this is the standard size.'}
                {suggestion.visionOverrodeTap ? ' Made larger because of the eyesight answer.' : ''}
              </p>
            </div>

            {/* One slider, because on a fixed grid there is only one thing to
                set. The buttons stay where they are and change size; the space
                between them is whatever is left over. */}
            <label className="flex flex-col gap-2">
              <span className="text-[15px] font-semibold">
                Smaller buttons &nbsp;&harr;&nbsp; bigger buttons
              </span>
              <input
                type="range"
                min={BUTTON_SCALE_MIN}
                max={BUTTON_SCALE_MAX}
                step={BUTTON_SCALE_STEP}
                value={buttonScale}
                onChange={(e) => setButtonScale(Number(e.target.value))}
                style={sliderFill(buttonScale, BUTTON_SCALE_MIN, BUTTON_SCALE_MAX)}
              />
              <span className="type-footnote" style={{ color: 'var(--ink-soft)' }}>
                {describeButtonSize(buttonScale)}. Bigger buttons are easier to hit; smaller ones
                leave more space between them.
              </span>
            </label>

            {/* A live miniature of the real board, so the choice is seen rather
                than described. The grid is always seven across and four down and
                the cells never move: only the buttons inside them grow and
                shrink, which is exactly what the slider does to the real board.
                Held square so a button is never drawn as a rectangle the board
                would not draw, and the frame holds its height at every size so
                the sheet does not jump while the slider is dragged. */}
            <div className="rounded-xl p-3" style={{ border: '1px solid var(--line)' }}>
              <div
                className="board-preview"
                role="img"
                aria-label={`The board: ${BOARD_COLS} buttons across and ${BOARD_ROWS} down. ${describeButtonSize(buttonScale)}.`}
                style={{ '--button-scale': buttonScale } as React.CSSProperties}
              >
                {Array.from({ length: BOARD_COLS * BOARD_ROWS }).map((_, i) => (
                  <span key={i} className="board-preview__cell" aria-hidden="true">
                    <span className="board-preview__button" />
                  </span>
                ))}
              </div>
            </div>

            <Button
              size="xl"
              disabled={saving}
              onClick={() =>
                void saveAndContinue(
                  {
                    buttonScale,
                    iconScale,
                    tapErrorPx: errors.length ? Math.round(averageError) : null,
                  },
                  'voice',
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
