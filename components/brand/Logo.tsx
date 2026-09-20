/**
 * The Talk A Lotta lockup, drawn from the brand sheet.
 *
 * Rules carried over from that sheet:
 *  - Stacked is primary; horizontal is for where vertical space is tight.
 *  - Mark only, never the wordmark, in any container under 120px.
 *  - Clear space equals the width of one card in the mark, on all four sides.
 *    The card is 26 of the mark's 140 units, so that is baked in as padding
 *    rather than left to each caller to remember.
 *  - The wordmark is never respaced: the tracking belongs to the lockup.
 */

const CLEAR_SPACE_RATIO = 26 / 140;

/** The mark: speech bubble, two cards, and the accent card. */
export function BrandMark({ size = 40 }: { size?: number }) {
  return (
    <svg viewBox="0 0 140 140" width={size} height={size} aria-hidden="true" style={{ display: 'block' }}>
      <circle cx="62" cy="58" r="54" fill="var(--brand-green, #169B62)" />
      <path d="M26 96 L14 126 L50 110 Z" fill="var(--brand-green, #169B62)" />
      <rect x="28" y="45" width="26" height="26" rx="8" fill="#FFFFFF" />
      <rect x="60" y="45" width="26" height="26" rx="8" fill="#FFFFFF" />
      <rect
        x="92"
        y="43"
        width="30"
        height="30"
        rx="9"
        fill="var(--brand-orange, #FF883E)"
        stroke="#FFFFFF"
        strokeWidth="5"
      />
    </svg>
  );
}

function Wordmark({ fontSize }: { fontSize: number }) {
  return (
    <span className="brand-wordmark" style={{ fontSize }}>
      Talk<span style={{ color: 'var(--brand-orange, #FF883E)' }}>A</span>Lotta
    </span>
  );
}

export function Logo({
  variant = 'horizontal',
  size = 40,
  className,
}: {
  variant?: 'horizontal' | 'stacked' | 'mark';
  size?: number;
  className?: string;
}) {
  const clear = Math.round(size * CLEAR_SPACE_RATIO);

  if (variant === 'mark') {
    return (
      <span className={className} style={{ display: 'inline-block', padding: clear }}>
        <BrandMark size={size} />
        <span className="sr-only">Talk A Lotta</span>
      </span>
    );
  }

  if (variant === 'stacked') {
    return (
      <span
        className={className}
        style={{
          display: 'inline-flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: Math.round(size * 0.16),
          padding: clear,
        }}
      >
        <BrandMark size={size} />
        <Wordmark fontSize={Math.round(size * 0.42)} />
      </span>
    );
  }

  return (
    <span
      className={className}
      style={{ display: 'inline-flex', alignItems: 'center', gap: clear, padding: clear }}
    >
      <BrandMark size={size} />
      <Wordmark fontSize={Math.round(size * 0.52)} />
    </span>
  );
}
