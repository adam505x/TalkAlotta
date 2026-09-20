'use client';

/**
 * The grouped list of choices used for every "pick one" question a caregiver
 * answers, in setup and in Settings alike.
 *
 * It lives here rather than inside the setup flow because Settings is the same
 * questions asked a second time. Two copies would drift, and a caregiver who
 * answered a question during setup should meet it looking identical when they
 * come back to change it.
 */

export function CheckMark() {
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
export function OptionGroup({ children }: { children: React.ReactNode }) {
  return <div className="option-group">{children}</div>;
}

/**
 * A row in that card. Selection reads as a checkmark and a weight change, not
 * a heavy outline, so it still carries under the CVI theme where the tint
 * washes out to nothing.
 *
 * `detail` is for the second line Settings adds: in setup the explanation sits
 * above the whole group, but a caregiver returning to change one answer is
 * comparing options against each other and wants the difference on the row.
 *
 * `accessory` is for an answer whose words cannot carry it on their own — the
 * colour-vision palettes, where the row has to show the thing it is offering.
 * It sits before the checkmark, whose space is reserved on every row so that
 * picking one never nudges the rest of the row sideways.
 */
export function OptionRow({
  label,
  detail,
  accessory,
  selected,
  onClick,
}: {
  label: string;
  detail?: React.ReactNode;
  accessory?: React.ReactNode;
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
        {detail ? (
          <span className="mt-1 block text-[13px] leading-snug" style={{ color: 'var(--ink-soft)' }}>
            {detail}
          </span>
        ) : null}
      </span>
      {accessory ? <span className="shrink-0">{accessory}</span> : null}
      <span className="flex w-[22px] shrink-0 items-center justify-center">
        {selected ? <CheckMark /> : null}
      </span>
    </button>
  );
}

/**
 * iOS sliders fill the track up to the handle. Painted as a gradient sized to
 * the 4px track so the fill sits on the track, not behind the whole control.
 */
export function sliderFill(value: number, min: number, max: number): React.CSSProperties {
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;
  return {
    backgroundImage: `linear-gradient(to right, var(--focus) 0 ${pct}%, var(--line) ${pct}% 100%)`,
    backgroundSize: '100% 4px',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
  };
}
