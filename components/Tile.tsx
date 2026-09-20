'use client';

import { useCallback, useRef, type CSSProperties } from 'react';
import { cn } from '@/lib/cn';
import type { TileVariant, WordRole } from '@/lib/core-words';

/**
 * One board button.
 *
 * EVERY tile is the same box and the same size. Same border, same padding, same
 * picture area, same label, same colours.
 *
 * A folder takes its colour from what is inside it, exactly like a word, and is
 * drawn as a folder: a lip on the top left with the body hanging under it.
 *
 * That shape is drawn INSIDE the same box. A folder occupies exactly one grid
 * cell of exactly the same size as every word tile, so nothing a folder does can
 * move a word. The body is shorter than a word tile because the lip takes its
 * height off the top, which is what makes a folder read as a folder, and is why
 * its picture is inset a little.
 *
 * Accessibility decisions baked in here:
 *
 *  - The word is ALWAYS shown under the picture. Picture-only is harder for an
 *    emerging reader, and the caregiver needs to know what a button will say.
 *
 *  - Face colour follows the Fitzgerald key, the established AAC convention for
 *    word types, over one shared subtle border. Colour is never the only signal:
 *    the label carries the meaning on its own, so a colour-blind user loses
 *    nothing.
 *
 *  - Every press is debounced. One intended tap that registers twice would say
 *    the word twice and add it to the sentence twice, which is a very visible
 *    failure for someone with a tremor or limited motor control.
 *
 *  - Real <button> elements with real labels, so the caregiver can drive the whole
 *    thing with a keyboard or VoiceOver.
 */

interface Face {
  bg: string;
  fg: string;
}

const ROLE_FACES: Record<WordRole, Face> = {
  pronoun: { bg: 'var(--role-pronoun-bg)', fg: 'var(--role-pronoun-fg)' },
  verb: { bg: 'var(--role-verb-bg)', fg: 'var(--role-verb-fg)' },
  noun: { bg: 'var(--role-noun-bg)', fg: 'var(--role-noun-fg)' },
  adjective: { bg: 'var(--role-adjective-bg)', fg: 'var(--role-adjective-fg)' },
  preposition: { bg: 'var(--role-preposition-bg)', fg: 'var(--role-preposition-fg)' },
  question: { bg: 'var(--role-question-bg)', fg: 'var(--role-question-fg)' },
  urgent: { bg: 'var(--role-urgent-bg)', fg: 'var(--role-urgent-fg)' },
  adverb: { bg: 'var(--role-adverb-bg)', fg: 'var(--role-adverb-fg)' },
  conjunction: { bg: 'var(--role-conjunction-bg)', fg: 'var(--role-conjunction-fg)' },
  determiner: { bg: 'var(--role-determiner-bg)', fg: 'var(--role-determiner-fg)' },
  affirm: { bg: 'var(--role-affirm-bg)', fg: 'var(--role-affirm-fg)' },
};

/**
 * A folder is deliberately absent here: it takes the colour of the words inside
 * it, so it sits in the same colour block as the words it extends, and is marked
 * as a folder by its shape alone.
 */
const VARIANT_FACES: Partial<Record<TileVariant, Face>> = {
  scenario: { bg: 'var(--teal)', fg: 'var(--teal-ink)' },
};

export const DEBOUNCE_MS = 350;

export interface TileProps {
  label: string;
  imageUrl: string;
  role?: WordRole;
  variant?: TileVariant;
  iconScale?: number;
  onActivate: () => void;
  /** Shows a pencil mark, for when the board is in edit mode. */
  editable?: boolean;
  disabled?: boolean;
  className?: string;
}

export function Tile({
  label,
  imageUrl,
  role = 'noun',
  variant = 'word',
  iconScale = 1,
  onActivate,
  editable,
  disabled,
  className,
}: TileProps) {
  const lastFired = useRef(0);

  const handle = useCallback(() => {
    const now = Date.now();
    if (now - lastFired.current < DEBOUNCE_MS) return;
    lastFired.current = now;
    onActivate();
  }, [onActivate]);

  const face = VARIANT_FACES[variant] ?? ROLE_FACES[role] ?? ROLE_FACES.noun;
  const isFolder = variant === 'folder';

  // A caregiver's own photo is framed differently from a library pictogram, and
  // the URL is what separates them: uploads are the ones served from /api/image.
  const isPhoto = imageUrl.startsWith('/api/image/');

  const picture = imageUrl ? (
    <img
      src={imageUrl}
      alt=""
      draggable={false}
      className={cn('cell__img', isPhoto && 'cell__img--photo')}
    />
  ) : (
    <span aria-hidden="true" className="cell__placeholder" />
  );

  const text = (
    <span
      className={cn('cell__label', label.trim().includes(' ') && 'cell__label--wrap')}
      style={{ fontSize: `clamp(11px, ${1.35 * iconScale}vw, ${Math.round(17 * iconScale)}px)` }}
    >
      {label}
    </span>
  );

  const describedAs =
    variant === 'folder'
      ? `${label}, folder`
      : variant === 'scenario'
        ? `${label}, opens the describe a situation box`
        : label;

  return (
    <button
      type="button"
      onClick={handle}
      disabled={disabled}
      aria-label={editable ? `${describedAs}, change the picture` : describedAs}
      className={cn('cell', isFolder && 'cell--folder', className)}
      style={{ '--face': face.bg, color: face.fg } as CSSProperties}
    >
      {isFolder ? (
        <>
          <span aria-hidden="true" className="cell__lip" />
          <span className="cell__body">
            {picture}
            {text}
          </span>
        </>
      ) : (
        <>
          {picture}
          {text}
        </>
      )}

      {editable ? (
        <span aria-hidden="true" className="cell__edit-mark">
          &#9998;
        </span>
      ) : null}
    </button>
  );
}
