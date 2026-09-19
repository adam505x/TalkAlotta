'use client';

import { useCallback, useRef } from 'react';
import { cn } from '@/lib/cn';
import type { TileVariant, WordRole } from '@/lib/core-words';

/**
 * One board button.
 *
 * EVERY tile is the same box and the same size. Same border, same padding, same
 * picture area, same label, same colours.
 *
 * A folder is not a different-looking object. It takes its colour from what is
 * inside it, exactly like a word, and the ONLY thing marking it as a folder is a
 * small tab on its top edge. Nothing about a folder changes its size.
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
  core: { bg: 'var(--role-core-bg)', fg: 'var(--role-core-fg)' },
  action: { bg: 'var(--role-action-bg)', fg: 'var(--role-action-fg)' },
  object: { bg: 'var(--role-object-bg)', fg: 'var(--role-object-fg)' },
  place: { bg: 'var(--role-place-bg)', fg: 'var(--role-place-fg)' },
  feeling: { bg: 'var(--role-feeling-bg)', fg: 'var(--role-feeling-fg)' },
  modifier: { bg: 'var(--role-modifier-bg)', fg: 'var(--role-modifier-fg)' },
  affirm: { bg: 'var(--role-affirm-bg)', fg: 'var(--role-affirm-fg)' },
  negate: { bg: 'var(--role-negate-bg)', fg: 'var(--role-negate-fg)' },
};

/**
 * Only navigation and the new-situation button get a face of their own. A folder
 * is deliberately absent here so it falls through to its role colour.
 */
const VARIANT_FACES: Partial<Record<TileVariant, Face>> = {
  nav: { bg: 'var(--role-nav-bg)', fg: 'var(--role-nav-fg)' },
  scenario: { bg: 'var(--role-scenario-bg)', fg: 'var(--role-scenario-fg)' },
  caregiver: { bg: 'var(--role-nav-bg)', fg: 'var(--role-nav-fg)' },
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
  role = 'object',
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

  const face = VARIANT_FACES[variant] ?? ROLE_FACES[role] ?? ROLE_FACES.object;
  const isFolder = variant === 'folder';

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
      className={cn('cell', className)}
      style={{ background: face.bg, color: face.fg }}
    >
      {isFolder ? <span aria-hidden="true" className="cell__tab" /> : null}

      {imageUrl ? (
        <img src={imageUrl} alt="" draggable={false} className="cell__img" />
      ) : (
        <span aria-hidden="true" className="cell__placeholder" />
      )}

      <span
        className="cell__label"
        style={{ fontSize: `clamp(11px, ${1.35 * iconScale}vw, ${Math.round(17 * iconScale)}px)` }}
      >
        {label}
      </span>

      {editable ? (
        <span aria-hidden="true" className="cell__edit-mark">
          &#9998;
        </span>
      ) : null}
    </button>
  );
}
