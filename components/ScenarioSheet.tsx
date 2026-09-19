'use client';

import { useCallback, useRef, useState } from 'react';
import type { WordRole } from '@/lib/core-words';

/**
 * Describe a situation, check what came back, save it as a folder.
 *
 * A popup over the board rather than a separate screen, so the caregiver can see
 * the board they are adding to. Four suggested situations sit under the box,
 * chosen for the current time of day and location, so the common cases take one
 * tap instead of typing.
 *
 * The review step is not optional politeness. Library coverage is strong but
 * visual appropriateness is not, so anything below the confidence threshold is
 * marked before a child ever sees it.
 */

interface Candidate {
  imageUrl: string;
  name: string;
  score: number;
  source: string;
  license: string | null;
  author: string | null;
  symbolId: string;
}

interface ProposedTile {
  term: string;
  label: string;
  role: WordRole;
  needsReview: boolean;
  best: Candidate | null;
  alternatives: Candidate[];
}

interface ScenarioResponse {
  scenario: string;
  boardName: string;
  intent: string;
  threshold: number;
  tiles: ProposedTile[];
}

export function ScenarioSheet({
  recommended,
  onClose,
  onSaved,
  onEditPicture,
}: {
  recommended: string[];
  onClose: () => void;
  onSaved: () => void;
  onEditPicture: (term: string, role: WordRole, onPicked: (c: Candidate) => void) => void;
}) {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScenarioResponse | null>(null);
  const [boardName, setBoardName] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  const build = useCallback(async (scenario: string) => {
    const clean = scenario.trim();
    if (!clean) return;
    setText(clean);
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/scenario', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario: clean }),
      });
      const body = (await res.json()) as ScenarioResponse & { error?: string };
      if (!res.ok) throw new Error(body.error ?? 'Could not build a board from that.');
      setResult(body);
      setBoardName(body.boardName);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not build a board from that.');
    } finally {
      setLoading(false);
    }
  }, []);

  const save = useCallback(async () => {
    if (!result) return;
    const keep = result.tiles.filter((t) => t.best);
    if (keep.length === 0) {
      setError('Keep at least one picture.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/boards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: boardName.trim() || result.boardName,
          scenario: result.scenario,
          intent: result.intent,
          tiles: keep.map((t) => ({
            term: t.term,
            label: t.label,
            role: t.role,
            imageUrl: t.best!.imageUrl,
            symbolId: t.best!.symbolId,
            source: t.best!.source,
            license: t.best!.license,
            author: t.best!.author,
            confidence: t.best!.score,
          })),
        }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? 'Could not save the board.');
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the board.');
    } finally {
      setSaving(false);
    }
  }, [boardName, onSaved, result]);

  const replace = useCallback(
    (tile: ProposedTile) => {
      onEditPicture(tile.term, tile.role, (candidate) => {
        setResult((prev) =>
          prev
            ? {
                ...prev,
                tiles: prev.tiles.map((t) =>
                  t.term === tile.term ? { ...t, best: candidate, needsReview: false } : t,
                ),
              }
            : prev,
        );
      });
    },
    [onEditPicture],
  );

  const lowConfidence = result?.tiles.filter((t) => t.needsReview).length ?? 0;

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        className={`sheet-card${result ? ' sheet-card--wide' : ''}`}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Describe a situation"
      >
        <h2 className="sheet__title">What are you doing?</h2>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            void build(text);
          }}
        >
          <input
            ref={inputRef}
            className="sheet__field"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="getting ready for swimming..."
            maxLength={400}
            autoFocus
          />
        </form>

        {!result ? (
          <>
            <p className="sheet__label">Suggested now</p>
            <div className="sheet__chips">
              {recommended.map((option) => (
                <button
                  key={option}
                  type="button"
                  className="chip"
                  onClick={() => void build(option)}
                >
                  {option}
                </button>
              ))}
            </div>
          </>
        ) : null}

        {/* TODO(voice-input): hold-to-talk goes here. Deepgram prerecorded
            endpoint, no streaming needed, falling back to this box. */}

        {error ? (
          <p
            className="rounded-[10px] p-3 text-sm font-bold"
            style={{ background: '#fdeae7', color: '#a62f1e' }}
          >
            {error}{' '}
            <button type="button" className="underline" onClick={() => void build(text)}>
              Try again
            </button>
          </p>
        ) : null}

        {loading ? (
          <p className="text-sm font-semibold" style={{ color: '#6c727b' }}>
            Reading the description and finding pictures...
          </p>
        ) : null}

        {result ? (
          <>
            <div className="flex flex-wrap items-end gap-4">
              <label className="flex flex-1 flex-col gap-1.5">
                <span className="sheet__label">Folder name</span>
                <input
                  className="sheet__field"
                  value={boardName}
                  onChange={(event) => setBoardName(event.target.value)}
                />
              </label>
              <p className="text-xs font-semibold" style={{ color: '#6c727b' }}>
                {result.tiles.length} pictures
                {lowConfidence > 0 ? `, ${lowConfidence} worth a look` : ', all confident'}
              </p>
            </div>

            {lowConfidence > 0 ? (
              <p
                className="rounded-[10px] p-3 text-sm font-semibold"
                style={{ background: '#fff8e1', color: '#6b5300' }}
              >
                Marked pictures scored below the confidence threshold. Check them before saving.
              </p>
            ) : null}

            <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4">
              {result.tiles.map((tile) => (
                <li
                  key={tile.term}
                  className="flex flex-col gap-2 rounded-[10px] border-2 p-2"
                  style={{
                    borderColor: tile.needsReview ? '#e0b400' : '#cfcfc4',
                    background: '#fff',
                  }}
                >
                  <div
                    className="flex aspect-square items-center justify-center rounded-lg"
                    style={{ background: 'var(--paper)' }}
                  >
                    {tile.best ? (
                      <img
                        src={tile.best.imageUrl}
                        alt={tile.label}
                        className="max-h-full max-w-full object-contain"
                      />
                    ) : (
                      <span className="text-xs" style={{ color: '#6c727b' }}>
                        nothing found
                      </span>
                    )}
                  </div>
                  <p className="truncate text-sm font-bold">{tile.label}</p>
                  <p className="text-[10px] font-semibold" style={{ color: '#6c727b' }}>
                    {tile.best ? `${tile.best.score}% · ${tile.best.source}` : 'no picture'}
                    {tile.needsReview ? ' · check' : ''}
                  </p>
                  <div className="mt-auto flex gap-1.5">
                    <button
                      type="button"
                      className="chip flex-1 justify-center px-2 text-xs"
                      onClick={() => replace(tile)}
                    >
                      Change
                    </button>
                    <button
                      type="button"
                      className="min-h-[44px] rounded-full border px-2.5 text-xs font-bold"
                      style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}
                      aria-label={`Remove ${tile.label}`}
                      onClick={() =>
                        setResult((prev) =>
                          prev
                            ? { ...prev, tiles: prev.tiles.filter((t) => t.term !== tile.term) }
                            : prev,
                        )
                      }
                    >
                      &#10005;
                    </button>
                  </div>
                </li>
              ))}
            </ul>

            <button
              type="button"
              className="min-h-[56px] rounded-[10px] text-lg font-bold"
              style={{ background: 'var(--teal)', color: 'var(--teal-ink)' }}
              disabled={saving}
              onClick={() => void save()}
            >
              {saving ? 'Saving...' : 'Add this folder to the board'}
            </button>
          </>
        ) : null}

        <button type="button" className="sheet__cancel" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}
