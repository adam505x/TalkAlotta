'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { CountrySelect } from '@/components/ui/country-select';
import { OptionGroup, OptionRow, sliderFill } from '@/components/ui/option-list';
import { PaletteDots } from '@/components/ui/palette-dots';
import { clearSpeechMemory, speak, unlockAudio, voicePreviewLine } from '@/lib/speech';
import {
  BOARD_COLS,
  BOARD_ROWS,
  BUTTON_SCALE_DEFAULT,
  BUTTON_SCALE_MAX,
  BUTTON_SCALE_MIN,
  BUTTON_SCALE_STEP,
  buttonScaleFloorFromVision,
  clampButtonScale,
  describeButtonSize,
  type VisionCategory,
} from '@/lib/sizing';
import {
  COLOR_VISION_OPTIONS,
  colorVisionEffect,
  parseColorVision,
  type ColorVisionCategory,
} from '@/lib/color-vision';

/**
 * Settings, over the board rather than instead of it.
 *
 * It used to be its own route, which meant changing the button size took the
 * caregiver away from the only thing that would show them whether the change
 * was right. Here the board stays on screen behind the panel, and the two
 * answers that repaint it — eyesight and colour vision — are applied to it the
 * moment they are picked, so the choice is seen being made. Closing without
 * saving puts the board back exactly as it was.
 *
 * Everything asked during setup is changeable here, grouped the way a caregiver
 * looks for it rather than in the order setup happened to ask it.
 */

type Tab = 'buttons' | 'sight' | 'voice' | 'about';

const TABS: { id: Tab; label: string; blurb: string; icon: React.ReactNode }[] = [
  {
    id: 'buttons',
    label: 'Buttons',
    blurb: 'Size and spacing',
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round">
        <rect x="3" y="3" width="8" height="8" rx="2" />
        <rect x="14" y="3" width="7" height="7" rx="2" />
        <rect x="3" y="14" width="7" height="7" rx="2" />
        <rect x="13" y="13" width="8" height="8" rx="2" />
      </svg>
    ),
  },
  {
    id: 'sight',
    label: 'Sight',
    blurb: 'Eyesight and colour',
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6Z" />
        <circle cx="12" cy="12" r="2.8" />
      </svg>
    ),
  },
  {
    id: 'voice',
    label: 'Voice',
    blurb: 'Sound and accent',
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        <path d="M11 5 6.5 9H3v6h3.5L11 19z" />
        <path d="M15.5 9.2a4 4 0 0 1 0 5.6M18.4 6.3a8 8 0 0 1 0 11.4" />
      </svg>
    ),
  },
  {
    id: 'about',
    label: 'About',
    blurb: 'Usage and credits',
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v5.5M12 7.6v.1" />
      </svg>
    ),
  },
];

const VISION_OPTIONS: { value: VisionCategory; label: string; detail: string }[] = [
  { value: 'none', label: 'No known difficulty', detail: 'Standard picture and label size.' },
  { value: 'glasses', label: 'Wears glasses', detail: 'Slightly larger pictures and labels.' },
  { value: 'low_vision', label: 'Low vision', detail: 'Much larger pictures, plain high-contrast board.' },
  { value: 'cvi', label: 'Cortical visual impairment', detail: 'Largest pictures, and all decoration stripped out.' },
  { value: 'unknown', label: 'Not sure', detail: 'Standard sizes are used.' },
];

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

/** Every role face, in the order they sit on the board, for the palette preview. */
const ROLE_SWATCHES: { role: string; label: string }[] = [
  { role: 'pronoun', label: 'People' },
  { role: 'verb', label: 'Actions' },
  { role: 'noun', label: 'Things' },
  { role: 'adjective', label: 'Describing' },
  { role: 'preposition', label: 'Social' },
  { role: 'question', label: 'Questions' },
  { role: 'adverb', label: 'How' },
  { role: 'determiner', label: 'Little words' },
  { role: 'affirm', label: 'yes' },
  { role: 'urgent', label: 'no' },
];

interface ProfilePayload {
  profile: {
    name: string | null;
    age: number | null;
    gender: string | null;
    nationality: string | null;
    vision: VisionCategory;
    colorVision: ColorVisionCategory;
    buttonScale: number;
    iconScale: number;
    tapErrorPx: number | null;
    voiceLabel: string | null;
  };
  voice: { voiceId: string; label: string };
  suggestedVoice?: { voiceId: string; label: string; rationale: string };
}

interface StatsPayload {
  totalUtterances: number;
  topSentences: { text: string; times: number }[];
  topWords: { text: string; times: number }[];
  credits: { characters: number; clips: number; cacheHits: number };
}

function Section({
  title,
  blurb,
  children,
}: {
  title: string;
  blurb?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h3 className="text-[19px] font-bold leading-tight">{title}</h3>
        {blurb ? (
          <p className="mt-1 text-[14px] leading-snug" style={{ color: 'var(--ink-soft)' }}>
            {blurb}
          </p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export function SettingsSheet({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  /** Called after a successful save, so the board reloads with the new layout. */
  onSaved: () => void;
}) {
  const router = useRouter();

  const [tab, setTab] = useState<Tab>('buttons');
  const [loaded, setLoaded] = useState(false);
  const [stats, setStats] = useState<StatsPayload | null>(null);

  const [name, setName] = useState('');
  const [buttonScale, setButtonScale] = useState(BUTTON_SCALE_DEFAULT);
  const [tapErrorPx, setTapErrorPx] = useState<number | null>(null);
  const [vision, setVision] = useState<VisionCategory>('unknown');
  const [colorVision, setColorVision] = useState<ColorVisionCategory>('unknown');
  const [age, setAge] = useState<number | null>(null);
  const [gender, setGender] = useState('');
  const [nationality, setNationality] = useState('');
  const [voiceLabel, setVoiceLabel] = useState('Standard voice');
  const [voiceRationale, setVoiceRationale] = useState('');

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [voiceTried, setVoiceTried] = useState(false);

  /**
   * What the board looked like when the panel opened, and what it should look
   * like again if the caregiver closes without saving. Held in a ref rather
   * than state because it is only ever read on the way out.
   */
  const committed = useRef<{ vision: string; colorVision: string } | null>(null);

  const load = useCallback(async () => {
    const [profileRes, statsRes] = await Promise.all([
      fetch('/api/profile'),
      fetch('/api/utterance'),
    ]);
    const payload = (await profileRes.json()) as ProfilePayload;
    const p = payload.profile;
    setName(p.name ?? '');
    setButtonScale(p.buttonScale ?? BUTTON_SCALE_DEFAULT);
    setTapErrorPx(p.tapErrorPx);
    setVision(p.vision ?? 'unknown');
    setColorVision(parseColorVision(p.colorVision));
    setAge(p.age);
    setGender(p.gender ?? '');
    setNationality(p.nationality ?? '');
    setVoiceLabel(payload.voice?.label ?? p.voiceLabel ?? 'Standard voice');
    setVoiceRationale(payload.suggestedVoice?.rationale ?? '');
    committed.current = {
      vision: p.vision ?? 'unknown',
      colorVision: parseColorVision(p.colorVision),
    };
    if (statsRes.ok) setStats((await statsRes.json()) as StatsPayload);
    setLoaded(true);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Escape closes, like every other sheet on the board.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  /**
   * The board is right there behind the panel, so the two answers that repaint
   * it are applied to it while they are being chosen. Unmounting restores what
   * was last committed, which after a save is the new answer and after a
   * cancel is the old one.
   */
  useEffect(() => {
    if (!loaded) return;
    document.documentElement.dataset.vision = vision;
    document.documentElement.dataset.colorVision = colorVision;
  }, [loaded, vision, colorVision]);

  useEffect(
    () => () => {
      const back = committed.current;
      if (!back) return;
      document.documentElement.dataset.vision = back.vision;
      document.documentElement.dataset.colorVision = back.colorVision;
    },
    [],
  );

  const save = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim() || null,
          // Button size is the only layout control: the grid is locked at seven
          // by four, and the gap is whatever the button does not fill.
          buttonScale,
          vision,
          colorVision,
          age,
          gender: gender || null,
          nationality: nationality.trim() || null,
        }),
      });
      const body = (await res.json()) as ProfilePayload & { error?: string };
      if (!res.ok) throw new Error(body.error ?? 'Could not save that.');
      clearSpeechMemory();
      setVoiceLabel(body.voice?.label ?? 'Standard voice');
      setVoiceRationale(body.suggestedVoice?.rationale ?? '');
      committed.current = { vision, colorVision };
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2200);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save that.');
    } finally {
      setSaving(false);
    }
  }, [age, buttonScale, colorVision, gender, name, nationality, onSaved, vision]);

  /**
   * Low vision and CVI set a floor under the button size (lib/sizing.ts). The
   * slider is held above it rather than the server quietly raising it after
   * Save, so the miniature below always shows the board that is about to exist.
   */
  const sizeFloor = buttonScaleFloorFromVision(vision);

  /**
   * Low vision and CVI throw the colour key away in favour of a plain black
   * board, so the colour-vision answer stops being about the key and becomes
   * only about yes and no. Saying so beats leaving a control that looks inert.
   */
  const plainBoard = vision === 'cvi' || vision === 'low_vision';
  useEffect(() => {
    setButtonScale((current) => (current < sizeFloor ? sizeFloor : current));
  }, [sizeFloor]);

  const who = name.trim() || 'the board';

  return (
    <div
      className="sheet-scrim fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        className="settings-panel sheet-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        onClick={(event) => event.stopPropagation()}
      >
        <div aria-hidden="true" className="sheet-grabber mx-auto mt-3 shrink-0 sm:hidden" />

        <header className="settings-head">
          <div className="min-w-0">
            <h2 className="type-title truncate">Settings</h2>
            <p className="type-footnote mt-0.5 truncate" style={{ color: 'var(--ink-soft)' }}>
              {name.trim() ? `How ${name.trim()}'s board looks and sounds` : 'How the board looks and sounds'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="settings-close"
          >
            <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
              <path d="M6 6 18 18M18 6 6 18" />
            </svg>
          </button>
        </header>

        <div className="settings-body">
          {/* A rail on a tablet, a scrolling row of chips on a phone. Same list
              either way, so the labels never move between devices. */}
          <nav className="settings-rail" aria-label="Settings sections">
            {TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                aria-current={tab === item.id ? 'page' : undefined}
                className={`settings-tab${tab === item.id ? ' settings-tab--on' : ''}`}
              >
                <span className="settings-tab__icon">{item.icon}</span>
                <span className="min-w-0">
                  <span className="block text-[15px] font-semibold leading-tight">{item.label}</span>
                  <span className="settings-tab__blurb">{item.blurb}</span>
                </span>
              </button>
            ))}
          </nav>

          <div className="settings-pane">
            {!loaded ? (
              <p className="text-[15px]" style={{ color: 'var(--ink-soft)' }}>
                Loading&hellip;
              </p>
            ) : null}

            {loaded && tab === 'buttons' ? (
              <Section
                title="Button size"
                blurb={
                  tapErrorPx != null
                    ? `The tapping exercise measured about ${tapErrorPx} pixels off target. You can change the result here.`
                    : 'No tapping exercise recorded yet, so this is set by hand.'
                }
              >
                <label className="flex flex-col gap-2">
                  <span className="text-[15px] font-semibold">
                    Smaller buttons &nbsp;&harr;&nbsp; bigger buttons
                  </span>
                  <input
                    type="range"
                    min={sizeFloor}
                    max={BUTTON_SCALE_MAX}
                    step={BUTTON_SCALE_STEP}
                    value={buttonScale}
                    aria-label="Button size"
                    onChange={(e) =>
                      setButtonScale(clampButtonScale(Math.max(sizeFloor, Number(e.target.value))))
                    }
                    style={sliderFill(buttonScale, sizeFloor, BUTTON_SCALE_MAX)}
                  />
                  <span className="type-footnote" style={{ color: 'var(--ink-soft)' }}>
                    {describeButtonSize(buttonScale)}. The grid is always {BOARD_COLS} across and{' '}
                    {BOARD_ROWS} down, so size and spacing are one control: whatever a button does
                    not fill becomes the space around it.
                    {sizeFloor > BUTTON_SCALE_MIN
                      ? ' The eyesight answer sets the smallest size available here.'
                      : ''}
                  </span>
                </label>

                {/* The same live miniature as setup, so the two agree. */}
                <div className="settings-card">
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
              </Section>
            ) : null}

            {loaded && tab === 'sight' ? (
              <>
                <Section
                  title="Eyesight"
                  blurb="Sets how large the picture and word inside each button are, and how plain the board is drawn."
                >
                  <OptionGroup>
                    {VISION_OPTIONS.map((option) => (
                      <OptionRow
                        key={option.value}
                        label={option.label}
                        detail={option.detail}
                        selected={vision === option.value}
                        onClick={() => setVision(option.value)}
                      />
                    ))}
                  </OptionGroup>
                </Section>

                <Section
                  title="Colour vision"
                  blurb={
                    plainBoard ? (
                      <>
                        The eyesight answer above draws the board plain and black, so the colour key
                        itself is not used. This still sets <strong>yes</strong> and{' '}
                        <strong>no</strong>, which stay coloured even there.
                      </>
                    ) : (
                      'Buttons are coloured by word type. If some of those colours are hard to tell apart, a different set is used. The dots show each set.'
                    )
                  }
                >
                  <OptionGroup>
                    {COLOR_VISION_OPTIONS.map((option) => (
                      <OptionRow
                        key={option.value}
                        label={option.label}
                        detail={
                          option.value === colorVision ? colorVisionEffect(option.value) : undefined
                        }
                        accessory={<PaletteDots value={option.value} />}
                        selected={colorVision === option.value}
                        onClick={() => setColorVision(option.value)}
                      />
                    ))}
                  </OptionGroup>

                  {/* The palette itself, live. The board behind the panel has
                      already repainted, but most of it is covered, so the key
                      is shown here in full. */}
                  <div className="settings-card">
                    <p className="sheet__label mb-2">The colour key</p>
                    <ul className="palette-grid">
                      {ROLE_SWATCHES.map((swatch) => (
                        <li
                          key={swatch.role}
                          className="palette-chip"
                          style={{
                            background: `var(--role-${swatch.role}-bg)`,
                            color: `var(--role-${swatch.role}-fg)`,
                          }}
                        >
                          {swatch.label}
                        </li>
                      ))}
                    </ul>
                    <p className="type-footnote mt-3" style={{ color: 'var(--ink-soft)' }}>
                      Colour is never the only signal. Every button carries its word, buttons of one
                      colour always sit together, and yes and no stay at opposite ends of their row.
                    </p>
                  </div>
                </Section>
              </>
            ) : null}

            {loaded && tab === 'voice' ? (
              <>
                {/* Setup asks for this on its first screen, and until now there
                    was no way to correct it afterwards short of running setup
                    again. It is on this tab because it is the word the voice
                    actually says. */}
                <Section
                  title="Their name"
                  blurb="Spoken when you tap Hear the voice, and used wherever the board talks about them."
                >
                  <input
                    type="text"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Josie"
                    aria-label="The name of the person the board is for"
                    autoComplete="off"
                    className="field-text w-full"
                  />
                </Section>

                <Section
                  title="The voice"
                  blurb="Worked out from age, gender and country. Change any of those and the voice is re-picked when you save. Loudness is set with the volume buttons on the side of the iPad."
                >
                  <div className="settings-card flex flex-col gap-3">
                    <div>
                      <p className="text-[17px] font-semibold">{voiceLabel}</p>
                      {voiceRationale ? (
                        <p className="type-footnote mt-1" style={{ color: 'var(--ink-soft)' }}>
                          {voiceRationale}
                        </p>
                      ) : null}
                    </div>
                    <Button
                      size="lg"
                      variant="secondary"
                      className="self-start"
                      onClick={async () => {
                        unlockAudio();
                        setVoiceTried(true);
                        await speak(voicePreviewLine(name), { kind: 'sentence' });
                      }}
                    >
                      Hear the voice
                    </Button>
                    {voiceTried ? (
                      <p className="type-footnote" style={{ color: 'var(--ink-soft)' }}>
                        If nothing played, check that DEEPGRAM_API_KEY is set. Otherwise the
                        browser&rsquo;s own voice is used.
                      </p>
                    ) : null}
                  </div>
                </Section>

                <Section title="Age">
                  <OptionGroup>
                    {AGE_OPTIONS.map((option) => (
                      <OptionRow
                        key={option.value}
                        label={option.label}
                        selected={age === option.value}
                        onClick={() => setAge(option.value)}
                      />
                    ))}
                  </OptionGroup>
                </Section>

                <Section title="Gender">
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
                </Section>

                <Section
                  title="Country or region"
                  blurb="Sets the accent. Ireland, England, the United States, Australia and similar have dedicated matches."
                >
                  <CountrySelect
                    value={nationality}
                    onChange={setNationality}
                    placeholder="Ireland"
                  />
                </Section>
              </>
            ) : null}

            {loaded && tab === 'about' ? (
              <>
                <Section
                  title="Speech credits"
                  blurb="Spoken words are cached, so the same button pressed twice only ever costs once."
                >
                  {stats ? (
                    <dl className="settings-card stat-grid">
                      <div>
                        <dt>Characters sent</dt>
                        <dd>{stats.credits.characters.toLocaleString()}</dd>
                      </div>
                      <div>
                        <dt>Clips generated</dt>
                        <dd>{stats.credits.clips.toLocaleString()}</dd>
                      </div>
                      <div>
                        <dt>Served free from the cache</dt>
                        <dd>{stats.credits.cacheHits.toLocaleString()}</dd>
                      </div>
                      <div>
                        <dt>Spoken in total</dt>
                        <dd>{stats.totalUtterances.toLocaleString()}</dd>
                      </div>
                    </dl>
                  ) : (
                    <p className="text-[15px]" style={{ color: 'var(--ink-soft)' }}>
                      Nothing spoken yet.
                    </p>
                  )}
                </Section>

                {stats && stats.topSentences.length > 0 ? (
                  <Section title="Most said sentences">
                    <ol className="settings-card flex flex-col gap-1.5 text-[15px]">
                      {stats.topSentences.map((row) => (
                        <li key={row.text} className="flex justify-between gap-4">
                          <span className="truncate font-medium">{row.text}</span>
                          <span className="tabular-nums" style={{ color: 'var(--ink-soft)' }}>
                            {row.times}
                          </span>
                        </li>
                      ))}
                    </ol>
                  </Section>
                ) : null}

                <Section
                  title="Setup"
                  blurb={`Runs the whole set of questions again, including the tapping exercise. Nothing is lost: ${who} keeps every saved board.`}
                >
                  <Button
                    size="lg"
                    variant="secondary"
                    className="self-start"
                    onClick={() => router.push('/onboarding')}
                  >
                    Run setup again
                  </Button>
                </Section>

                {/*
                  Picture credits. Several of the symbol libraries ask to be
                  named, and some restrict commercial use, so this line belongs
                  on anything published.
                */}
                <Section title="Pictures">
                  <p className="type-footnote" style={{ color: 'var(--ink-soft)' }}>
                    Pictures come from the OpenSymbols libraries, including Mulberry Symbols and
                    Tawasol, from ARASAAC, and from Twemoji. Each picture keeps its own licence and
                    author, recorded with the board. Check each library&rsquo;s terms before any
                    commercial use.
                  </p>
                </Section>
              </>
            ) : null}
          </div>
        </div>

        {error ? (
          <p
            className="mx-4 rounded-xl border-2 p-3 text-[15px] font-semibold sm:mx-6"
            style={{
              borderColor: 'var(--danger)',
              background: 'color-mix(in srgb, var(--danger) 12%, #ffffff)',
              color: 'var(--danger)',
            }}
          >
            {error}
          </p>
        ) : null}

        {/* Pinned, so Save is never scrolled off under a long section. */}
        <footer className="settings-foot">
          <span className="type-footnote" style={{ color: 'var(--ink-soft)' }}>
            {saved ? 'Saved' : 'Changes apply to the board behind this panel.'}
          </span>
          <div className="flex shrink-0 gap-2">
            <Button size="lg" variant="ghost" onClick={onClose}>
              Close
            </Button>
            <Button size="lg" disabled={saving || !loaded} onClick={() => void save()}>
              {saving ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </footer>
      </div>
    </div>
  );
}
