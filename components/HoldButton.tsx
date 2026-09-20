'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';

/**
 * Press and hold to confirm.
 *
 * Used to gate edit mode. The caregiver menu opens freely, because browsing it is
 * harmless, but turning editing ON takes a deliberate action so a communicator
 * tapping around the screen cannot end up in a state where their presses change
 * the board instead of speaking.
 *
 * The fill sweeping across the button is the progress indicator: let go early and
 * it resets, so a half-press is never ambiguous.
 */
export function HoldButton({
  ms = 600,
  onComplete,
  className,
  children,
}: {
  ms?: number;
  onComplete: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [holding, setHolding] = useState(false);

  const cancel = useCallback(() => {
    setHolding(false);
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  // A hold in progress must not fire after this button has gone away.
  useEffect(() => cancel, [cancel]);

  const start = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      setHolding(true);
      timer.current = setTimeout(() => {
        timer.current = null;
        setHolding(false);
        onComplete();
      }, ms);
    },
    [ms, onComplete],
  );

  return (
    <button
      type="button"
      className={cn('hold', holding && 'is-holding', className)}
      style={{ ['--hold-ms' as string]: `${ms}ms` }}
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
    >
      <span aria-hidden="true" className="hold__fill" />
      <span className="hold__label">{children}</span>
    </button>
  );
}
