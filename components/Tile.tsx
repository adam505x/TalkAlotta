'use client';

import { useCallback, useRef } from 'react';
import { cn } from '@/lib/cn';
import type { WordRole } from '@/lib/core-words';

/**
 * One board button.
 *
 * Accessibility decisions baked in here:
 *
 *  - The word is ALWAYS shown under the picture. Picture-only is harder for an
 *    emerging reader, and the caregiver needs to know what a button will say.
 *
 *  - Colour follows the Fitzgerald key, the established AAC convention for word
 *    types. Colour is never the only signal: the label carries the meaning on its
 *    own, so this still works for a colour-blind user.
 *
 *  - Every press is debounced. One intended tap that registers twice would say
 *    the word twice and add it to the sentence twice, which is a very visible
 *    failure for someone with a tremor or limited motor control.
 *
 *  - Real <button> elements with real labels, so the caregiver can drive the whole
 *    thing with a keyboard or VoiceOver.
 */

const ROLE_STYLES: Record<WordRole, { bg: string; line: string }> = {
  core: { bg: 'var(--role-core-bg)', line: 'var(--role-core-line)' },
  action: { bg: 'var(--role-action-bg)', line: 'var(--role-action-line)' },
  object: { bg: 'var(--role-object-bg)', line: 'var(--role-object-line)' },
  place: { bg: 'var(--role-place-bg)', line: 'var(--role-place-line)' },
  feeling: { bg: 'var(--role-feeling-bg)', line: 'var(--role-feeling-line)' },
  modifier: { bg: 'var(--role-modifier-bg)', line: 'var(--role-modifier-line)' },
};

export const DEBOUNCE_MS = 350;

export interface TileProps {
  label: string;
  imageUrl: string;
  role: WordRole;
  kind?: 'word' | 'folder';
  iconScale?: number;
  onActivate: () => void;
  /** Shown as a small corner mark, for the caregiver's review step only. */
  badge?: string;
  disabled?: boolean;
  className?: string;
}

export function Tile({
  label,
  imageUrl,
  role,
  kind = 'word',
  iconScale = 1,
  onActivate,
  badge,
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

  const style = ROLE_STYLES[role] ?? ROLE_STYLES.object;

  return (
    <button
      type="button"
      onClick={handle}
      disabled={disabled}
      aria-label={kind === 'folder' ? `${label}, folder` : label}
      className={cn(
        'relative flex h-full w-full flex-col items-center justify-center gap-1 overflow-hidden rounded-[var(--tile-radius)] border-4 p-2 text-center',
        'active:translate-y-px disabled:opacity-40',
        className,
      )}
      style={{
        background: style.bg,
        borderColor: style.line,
        // A folder gets a heavier border so it reads as "opens something"
        // without relying on colour alone.
        borderStyle: kind === 'folder' ? 'double' : 'solid',
      }}
    >
      {imageUrl ? (
        <img
          src={imageUrl}
          alt=""
          draggable={false}
          className="pointer-events-none min-h-0 flex-1 object-contain"
          style={{ width: `${Math.round(72 * iconScale)}%` }}
        />
      ) : (
        <span className="flex-1" />
      )}
      <span
        className="w-full shrink-0 truncate font-semibold leading-tight"
        style={{ fontSize: `${Math.round(100 * iconScale)}%`, color: 'var(--ink)' }}
      >
        {label}
      </span>
      {badge ? (
        <span
          className="absolute right-1 top-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold"
          style={{ background: style.line, color: '#fff' }}
        >
          {badge}
        </span>
      ) : null}
    </button>
  );
}
