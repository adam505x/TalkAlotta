/**
 * Glyph: the character.
 *
 * Taken from the "Glyph, final" reference. The body, tail and orange card never
 * change. Only the eyes do, and they stay in the reference's own vocabulary:
 * white, fully rounded, roughly the weight of the original capsule. There is no
 * mouth to work with, so an expression is whatever the eyes can carry alone.
 *
 * Restraint is the point. Most of the flow is `open`; the other three are for
 * moments that earn them, so the change reads as the character reacting rather
 * than as something fidgeting next to the question.
 *
 * Draw order matters: the tail goes down first so the head overlaps it.
 */

export type GlyphExpression = 'open' | 'happy' | 'wink' | 'curious';

/** Matches the visual weight of the reference's 14-wide capsule. */
const STROKE = 11;

function Eyes({ expression, cut }: { expression: GlyphExpression; cut: string }) {
  const arc = {
    fill: 'none',
    stroke: cut,
    strokeWidth: STROKE,
    strokeLinecap: 'round' as const,
  };

  switch (expression) {
    // Both eyes arched up. Reads as a smile even with no mouth to smile with.
    case 'happy':
      return (
        <>
          <path d="M42 66 Q49 51 56 66" {...arc} />
          <path d="M74 66 Q81 51 88 66" {...arc} />
        </>
      );

    // One eye open, one closed. The only asymmetric face, so it stays for the
    // one moment that is a game rather than a question.
    case 'wink':
      return (
        <>
          <rect x="42" y="49" width="14" height="24" rx="7" fill={cut} />
          <path d="M74 62 Q81 55 88 62" {...arc} />
        </>
      );

    // Shorter and raised: looking up and thinking it over.
    case 'curious':
      return (
        <>
          <rect x="42" y="45" width="14" height="16" rx="7" fill={cut} />
          <rect x="74" y="45" width="14" height="16" rx="7" fill={cut} />
        </>
      );

    case 'open':
    default:
      return (
        <>
          <rect x="42" y="49" width="14" height="24" rx="7" fill={cut} />
          <rect x="74" y="49" width="14" height="24" rx="7" fill={cut} />
        </>
      );
  }
}

export function Glyph({
  size = 124,
  expression = 'open',
  tone = 'brand',
  bob = true,
  blink = true,
  className,
}: {
  size?: number;
  expression?: GlyphExpression;
  /** Idle blink. On by default; the one thing that makes him look alive. */
  blink?: boolean;
  /** 'brand' is green on the page, 'knockout' is white on a green ground. */
  tone?: 'brand' | 'knockout';
  bob?: boolean;
  className?: string;
}) {
  const green = 'var(--brand-green, #169B62)';
  const body = tone === 'knockout' ? '#FFFFFF' : green;
  const cut = tone === 'knockout' ? green : '#FFFFFF';

  return (
    <span
      className={[bob ? 'bubble-bob' : '', 'inline-block', className ?? ''].join(' ').trim()}
      style={{ lineHeight: 0 }}
    >
      <svg viewBox="0 0 140 140" width={size} height={size} role="img" aria-label="Talk A Lotta">
        <path d="M34 100 L14 130 L56 110 Z" fill={body} />
        <circle cx="64" cy="60" r="52" fill={body} />
        {/* Two groups on purpose: the blink owns the outer one, the swap fade
            the inner one, so the two animations never fight over `animation`. */}
        <g className={blink ? 'glyph-eyes' : undefined}>
          <g key={expression} className="face-swap">
            <Eyes expression={expression} cut={cut} />
          </g>
        </g>
        <rect
          x="88"
          y="14"
          width="28"
          height="28"
          rx="9"
          fill="var(--brand-orange, #FF883E)"
          stroke={cut}
          strokeWidth="5"
        />
      </svg>
    </span>
  );
}
