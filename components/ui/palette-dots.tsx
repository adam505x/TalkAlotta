'use client';

import type { ColorVisionCategory } from '@/lib/color-vision';

/**
 * A row of dots showing what one colour-vision answer actually looks like.
 *
 * The colour-vision question is the only one in setup whose answer cannot be
 * judged from its words. "Red and green look alike" says what the caregiver is
 * reporting, not what the board will do about it, and a caregiver meeting AAC
 * for the first time has no way to picture the difference. The dots make the
 * four answers comparable at a glance, before one of them is committed to.
 *
 * `data-palette` re-declares the role colours for this element's subtree (see
 * the faces section of globals.css), so every dot is painted from the SAME
 * definition the board paints from. There is no second copy of the values here
 * to fall out of step with the real thing, and each row shows its own palette
 * whatever palette the page is currently in.
 */

/**
 * Six of the eleven faces: the four biggest colour blocks on the board, then
 * yes and no. The pair is always included because it is the one place where
 * telling two faces apart changes what gets said.
 */
const PREVIEW_ROLES = ['pronoun', 'verb', 'noun', 'adjective', 'affirm', 'urgent'] as const;

export function PaletteDots({ value }: { value: ColorVisionCategory }) {
  return (
    // Decorative on purpose: six unnamed colours tell a screen reader nothing
    // the option's own label does not already say properly.
    <span className="palette-dots" data-palette={value} aria-hidden="true">
      {PREVIEW_ROLES.map((role) => (
        <span
          key={role}
          className="palette-dot"
          style={{ background: `var(--role-${role}-bg)` }}
        />
      ))}
    </span>
  );
}
