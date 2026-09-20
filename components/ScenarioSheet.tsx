'use client';

import { useState } from 'react';
import { ConversationMode } from './ConversationMode';
import { MicButton } from './MicButton';
import { Button } from './ui/button';

/**
 * The situation sheet, which does two different jobs.
 *
 * DESCRIBE is the original one: knowing someone is at school does not tell you
 * they are in an art class, so this is the gap the sensed context cannot fill.
 * Typing it refills the same four folders with words for that activity; it does
 * not add a folder or rearrange anything, because the board's shape is the thing
 * worth protecting. Speaking it is the point - the caregiver doing this has a
 * child in one hand, and typing a sentence is the one thing they cannot do at
 * that moment. The microphone puts the transcript in the box rather than
 * submitting it, so a misheard word is corrected before the board changes.
 *
 * REPLY listens to the other person instead. Describe changes what there is to
 * talk ABOUT; reply answers what was just SAID. They are two halves of the same
 * idea and they belong behind the same button, but they are separate modes
 * rather than one screen, because a board that is listening has to look
 * unmistakably different from one that is not.
 */
export function ScenarioSheet({
  recommended,
  current,
  contextQuery,
  busy,
  error,
  onPick,
  onClear,
  onClose,
}: {
  recommended: string[];
  /** The activity currently in force, if any. */
  current: string | null;
  /** The moment the board is reading, as query params, for reply generation. */
  contextQuery: string;
  busy?: boolean;
  error?: string | null;
  onPick: (situation: string) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const [text, setText] = useState('');
  const [mode, setMode] = useState<'describe' | 'reply'>('describe');

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        className="sheet-card"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={mode === 'describe' ? 'What are you doing?' : 'Reply to someone'}
      >
        <h2 className="sheet__title">
          {mode === 'describe' ? 'What are you doing?' : 'Reply to someone'}
        </h2>

        {/* Two modes, always both visible, so the one that is not running is a
            single tap away rather than hidden behind the sheet being closed. */}
        <div
          role="tablist"
          aria-label="Situation or reply"
          style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}
        >
          {(
            [
              ['describe', 'Describe the situation'],
              ['reply', 'Listen and reply'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={mode === value}
              onClick={() => setMode(value)}
              style={{
                minHeight: 46,
                borderRadius: 10,
                border: `2px solid ${mode === value ? '#0e767c' : '#cfcfc4'}`,
                background: mode === value ? '#eaf3f3' : '#fff',
                color: mode === value ? '#0e767c' : '#6c727b',
                fontWeight: 800,
                fontSize: 14,
                cursor: 'pointer',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {mode === 'reply' ? (
          <ConversationMode contextQuery={contextQuery} onClose={onClose} />
        ) : (
          <>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (text.trim()) onPick(text.trim());
              }}
              style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
            >
              <MicButton disabled={busy} onTranscript={(heard) => setText(heard)}>
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
              </MicButton>

              {/* Spoken input has no Enter key to press, so the commit has to be a
                  button. Always shown, disabled while empty, so it does not appear
                  under the finger only once there is text. */}
              <Button
                type="submit"
                variant="primary"
                size="lg"
                className="w-full"
                disabled={busy || !text.trim()}
              >
                Accept
              </Button>
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
          </>
        )}

        {/* Only for describing. Listen-and-reply has its own way back, and a
            second dismiss under the replies was one more thing to read past. */}
        {mode === 'describe' ? (
          <button type="button" className="sheet__cancel" onClick={onClose}>
            Cancel
          </button>
        ) : null}
      </div>
    </div>
  );
}
