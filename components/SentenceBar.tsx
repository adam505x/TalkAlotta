'use client';

import { useCallback, useEffect, useRef } from 'react';

/**
 * The sentence builder across the top of the board.
 *
 * Pressing a board button speaks that word straight away AND adds it here.
 *
 * TAP THE BAR ITSELF TO SPEAK THE WHOLE SENTENCE. There is no separate say
 * button: the sentence is the thing you want said, so it is the thing you press.
 * One less button on screen, and one less thing to aim at.
 *
 * THE DELETE KEY IS ONE TAP BACK, TWO TAPS CLEAR. Taken from the reference
 * project, where it came from watching a communicator use their real device: they
 * would build up a long sentence, hit something by accident, and double tap the
 * backspace to stop it. Matching an interaction someone already has motor memory
 * for beats inventing a better one.
 *
 * The cost of that is deliberate: a single tap waits 350ms before deleting, to
 * see whether a second tap is coming. Backspace feels a touch slower so that
 * clear-everything is reachable without a long press.
 */

/** A second tap inside this window means "clear", not "delete another". */
const DOUBLE_TAP_MS = 350;

export interface SentenceWord {
  term: string;
  label: string;
  imageUrl: string;
  /**
   * When this word was pressed. Carried so a delete can be timed: taken back at
   * once is a misfire, taken back later is an edit, and the dashboard only counts
   * the first kind towards suggesting bigger buttons.
   */
  addedAt?: number;
}

export interface SentenceBarProps {
  words: SentenceWord[];
  onSpeakAll: () => void;
  onDeleteLast: () => void;
  onClear: () => void;
  onOpenMenu: () => void;
  speaking?: boolean;
  iconScale?: number;
}

export function SentenceBar({
  words,
  onSpeakAll,
  onDeleteLast,
  onClear,
  onOpenMenu,
  iconScale = 1,
}: SentenceBarProps) {
  const sentence = words.map((w) => w.label).join(' ');
  const empty = words.length === 0;

  const lastTap = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A pending single tap must not fire after this bar has gone away.
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const handleDelete = useCallback(() => {
    const now = Date.now();

    if (now - lastTap.current < DOUBLE_TAP_MS) {
      // Second tap: cancel the pending single-word delete and clear the lot.
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
      lastTap.current = 0;
      onClear();
      return;
    }

    lastTap.current = now;
    timer.current = setTimeout(() => {
      timer.current = null;
      onDeleteLast();
    }, DOUBLE_TAP_MS);
  }, [onClear, onDeleteLast]);

  return (
    <div
      className="flex shrink-0 items-stretch gap-2 rounded-[10px] p-1.5"
      style={{ background: 'var(--paper)' }}
    >
      {/* Caregiver mode lives behind the hamburger, off to the side where a
          communicator is unlikely to hit it by accident. */}
      <button
        type="button"
        onClick={onOpenMenu}
        aria-label="Open caregiver mode"
        className="flex min-h-[60px] w-[52px] shrink-0 items-center justify-center rounded-lg"
        style={{ background: 'var(--paper-dim)', color: '#55606d' }}
      >
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <path
            d="M3 6h18M3 12h18M3 18h18"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
        </svg>
      </button>

      {/* The sentence IS the speak button. Pictures plus words, so it reads
          either way, and tapping anywhere on it says the whole thing. */}
      <button
        type="button"
        onClick={onSpeakAll}
        disabled={empty}
        aria-label={empty ? 'Nothing to say yet' : `Say the whole sentence: ${sentence}`}
        className="flex min-h-[60px] flex-1 items-center gap-2 overflow-x-auto rounded-lg px-2 text-left disabled:cursor-default"
        style={{ background: '#ffffff' }}
      >
        {empty ? (
          <span className="px-2 font-bold" style={{ color: '#9ca1a9' }}>
            Press pictures to build a sentence
          </span>
        ) : (
          words.map((word, index) => (
            <span
              key={`${word.term}-${index}`}
              className="flex shrink-0 flex-col items-center gap-0.5 rounded-lg border-2 px-2 py-1"
              style={{ background: 'var(--paper)', borderColor: '#cfcfc4', color: 'var(--ink)' }}
            >
              {word.imageUrl ? (
                <img
                  src={word.imageUrl}
                  alt=""
                  draggable={false}
                  className="object-contain"
                  style={{ height: `${Math.round(30 * iconScale)}px` }}
                />
              ) : null}
              <span
                className="font-bold leading-none"
                style={{ fontSize: `${Math.round(88 * iconScale)}%` }}
              >
                {word.label}
              </span>
            </span>
          ))
        )}
      </button>

      {/* One tap takes the last word back; two taps clear the whole sentence. */}
      <button
        type="button"
        onClick={handleDelete}
        disabled={empty}
        aria-label="Delete the last word. Tap twice to clear the whole sentence."
        title="Tap to delete the last word · tap twice to clear"
        className="flex min-h-[60px] min-w-[68px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg border-2 px-3 font-bold disabled:opacity-40"
        style={{ background: '#ffffff', borderColor: 'var(--danger)', color: 'var(--danger)' }}
      >
        <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
          <path
            d="M20 6H9L3 12l6 6h11a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1z"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path d="M12 10l5 4M17 10l-5 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <span className="text-xs">delete</span>
      </button>
    </div>
  );
}
