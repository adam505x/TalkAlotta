'use client';

import { useState } from 'react';
import { MicButton } from './MicButton';

/**
 * Describe what is happening.
 *
 * Knowing someone is at school does not tell you they are in an art class, so
 * this is the gap the sensed context cannot fill. Typing it refills the same four
 * folders with words for that activity; it does not add a folder or rearrange
 * anything, because the board's shape is the thing worth protecting.
 *
 * The four suggestions are picked for the current time of day and place, so the
 * common cases take one tap instead of typing.
 *
 * Speaking it is the point, though. The caregiver doing this has a child in one
 * hand - typing a sentence is the one thing they cannot do at that moment. The
 * microphone puts the transcript in the box rather than submitting it, so a
 * misheard word is corrected before the board changes.
 */
export function ScenarioSheet({
  recommended,
  current,
  busy,
  error,
  onPick,
  onClear,
  onClose,
}: {
  recommended: string[];
  /** The activity currently in force, if any. */
  current: string | null;
  busy?: boolean;
  error?: string | null;
  onPick: (situation: string) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const [text, setText] = useState('');

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        className="sheet-card"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="What are you doing?"
      >
        <h2 className="sheet__title">What are you doing?</h2>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (text.trim()) onPick(text.trim());
          }}
        >
          <div style={{ position: 'relative' }}>
            <input
              className="sheet__field"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="art class, choosing between paint and pencils"
              maxLength={200}
              autoFocus
              aria-label="Describe what is happening"
              style={{ paddingRight: 56 }}
            />
            <MicButton
              disabled={busy}
              onTranscript={(heard) => setText(heard)}
            />
          </div>
        </form>

        <p className="sheet__label">Suggested now</p>
        <div className="sheet__chips">
          {recommended.map((option) => (
            <button key={option} type="button" className="chip" onClick={() => onPick(option)}>
              {option}
            </button>
          ))}
        </div>

        {busy ? (
          <p className="text-sm font-semibold" style={{ color: '#6c727b' }}>
            Filling the folders for that...
          </p>
        ) : null}

        {error ? (
          <p
            className="rounded-[10px] p-3 text-sm font-bold"
            style={{ background: '#fdeae7', color: '#a62f1e' }}
          >
            {error}
          </p>
        ) : null}

        {current ? (
          <div
            className="flex flex-wrap items-center gap-3 rounded-[10px] border-2 p-3"
            style={{ borderColor: '#cfcfc4', background: '#fff' }}
          >
            <span className="flex-1 text-sm font-bold">Right now: {current}</span>
            <button type="button" className="chip" onClick={onClear}>
              Back to the normal board
            </button>
          </div>
        ) : null}

        <button type="button" className="sheet__cancel" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}
