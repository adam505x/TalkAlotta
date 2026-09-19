'use client';

import { useCallback, useRef } from 'react';
import { cn } from '@/lib/cn';

/**
 * The sentence builder across the top of the board.
 *
 * How it behaves, from the spec: pressing a button speaks that word straight away
 * AND adds it to this bar. The button on the LEFT of the bar speaks the whole
 * sentence together when the communicator is ready.
 *
 * Delete removes the last word. Holding it clears the whole sentence, so a long
 * sentence does not need fifteen taps to undo.
 */

export interface SentenceWord {
  term: string;
  label: string;
  imageUrl: string;
}

export interface SentenceBarProps {
  words: SentenceWord[];
  onSpeakAll: () => void;
  onDeleteLast: () => void;
  onClear: () => void;
  speaking?: boolean;
  iconScale?: number;
}

export function SentenceBar({
  words,
  onSpeakAll,
  onDeleteLast,
  onClear,
  speaking,
  iconScale = 1,
}: SentenceBarProps) {
  const sentence = words.map((w) => w.label).join(' ');
  const empty = words.length === 0;

  // Held in a ref, not a local: a re-render between pointer down and pointer up
  // would otherwise lose the timer and delete would silently stop working.
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cleared = useRef(false);

  const startHold = useCallback(() => {
    cleared.current = false;
    holdTimer.current = setTimeout(() => {
      cleared.current = true;
      holdTimer.current = null;
      onClear();
    }, 600);
  }, [onClear]);

  const endHold = useCallback(() => {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
    // A completed hold already cleared everything; don't also delete a word.
    if (!cleared.current) onDeleteLast();
    cleared.current = false;
  }, [onDeleteLast]);

  const cancelHold = useCallback(() => {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
    cleared.current = false;
  }, []);

  return (
    <div
      className="flex shrink-0 items-stretch gap-2 rounded-2xl border-4 p-2"
      style={{ background: 'var(--card)', borderColor: 'var(--line)' }}
    >
      {/* Speak-the-whole-sentence button, on the left as specified. */}
      <button
        type="button"
        onClick={onSpeakAll}
        disabled={empty || speaking}
        aria-label={empty ? 'Nothing to say yet' : `Say the whole sentence: ${sentence}`}
        className={cn(
          'flex min-h-[64px] min-w-[84px] shrink-0 flex-col items-center justify-center rounded-xl border-4 px-3 font-bold',
          'disabled:opacity-40',
        )}
        style={{
          background: 'var(--role-action-bg)',
          borderColor: 'var(--role-action-line)',
          color: 'var(--ink)',
        }}
      >
        <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
          <path
            d="M4 9v6h3l5 4V5L7 9H4z"
            fill="currentColor"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path
            d="M16 8.5a5 5 0 0 1 0 7"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
        <span className="text-sm">say it</span>
      </button>

      {/* The sentence itself: pictures plus words, so it is readable either way. */}
      <div
        className="flex min-h-[64px] flex-1 items-center gap-2 overflow-x-auto rounded-xl px-2"
        style={{ background: 'var(--paper)' }}
        aria-live="polite"
        aria-label="Sentence so far"
      >
        {empty ? (
          <span className="px-2 text-base" style={{ color: 'var(--ink-soft)' }}>
            Press pictures to build a sentence
          </span>
        ) : (
          words.map((word, index) => (
            <span
              key={`${word.term}-${index}`}
              className="flex shrink-0 flex-col items-center gap-0.5 rounded-lg border-2 px-2 py-1"
              style={{ background: 'var(--card)', borderColor: 'var(--line)' }}
            >
              {word.imageUrl ? (
                <img
                  src={word.imageUrl}
                  alt=""
                  draggable={false}
                  className="object-contain"
                  style={{ height: `${Math.round(32 * iconScale)}px` }}
                />
              ) : null}
              <span
                className="font-semibold leading-none"
                style={{ fontSize: `${Math.round(90 * iconScale)}%` }}
              >
                {word.label}
              </span>
            </span>
          ))
        )}
      </div>

      {/* Delete last word; hold to clear everything. */}
      <button
        type="button"
        onPointerDown={startHold}
        onPointerUp={endHold}
        onPointerLeave={cancelHold}
        onPointerCancel={cancelHold}
        disabled={empty}
        aria-label="Delete the last word. Hold to clear the whole sentence."
        className="flex min-h-[64px] min-w-[72px] shrink-0 flex-col items-center justify-center rounded-xl border-4 px-3 font-bold disabled:opacity-40"
        style={{
          background: 'var(--role-feeling-bg)',
          borderColor: 'var(--role-feeling-line)',
          color: 'var(--ink)',
        }}
      >
        <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
          <path
            d="M20 6H9L3 12l6 6h11a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1z"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path d="M12 10l5 4M17 10l-5 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <span className="text-sm">delete</span>
      </button>
    </div>
  );
}
