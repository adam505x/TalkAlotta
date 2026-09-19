'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { WordRole } from '@/lib/core-words';

/**
 * Pick a different picture for a word.
 *
 * Opens on other options for the SAME word, so nothing has to be retyped. A new
 * search is there for when the right picture is a different word entirely, and
 * uploading a photo covers the case the library will never have: this particular
 * child's particular cup.
 *
 * A choice is pinned to the word everywhere, not just on the board it was made
 * from, and is recorded for the learning layer.
 */

export interface Candidate {
  imageUrl: string;
  name: string;
  score: number;
  source: string;
  license: string | null;
  author: string | null;
  symbolId: string;
}

export function PictureSheet({
  term,
  role = 'object',
  onClose,
  onPicked,
}: {
  term: string;
  role?: WordRole;
  onClose: () => void;
  onPicked: (candidate: Candidate) => void;
}) {
  const [query, setQuery] = useState(term);
  const [options, setOptions] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);

  const search = useCallback(
    async (word: string, asTerm: boolean) => {
      const clean = word.trim();
      if (!clean) return;
      setLoading(true);
      setError(null);
      try {
        const param = asTerm
          ? `term=${encodeURIComponent(clean)}&role=${role}`
          : `q=${encodeURIComponent(clean)}`;
        const res = await fetch(`/api/symbols?${param}`);
        const body = (await res.json()) as { results?: Candidate[]; error?: string };
        if (!res.ok) throw new Error(body.error ?? 'Could not search for pictures.');
        setOptions(body.results ?? []);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not search for pictures.');
      } finally {
        setLoading(false);
      }
    },
    [role],
  );

  useEffect(() => {
    void search(term, true);
  }, [search, term]);

  const pin = useCallback(
    async (candidate: Candidate) => {
      await fetch('/api/override', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          term,
          imageUrl: candidate.imageUrl,
          source: candidate.source,
          license: candidate.license,
          author: candidate.author,
          symbolId: candidate.symbolId,
        }),
      });
      onPicked(candidate);
      onClose();
    },
    [onClose, onPicked, term],
  );

  const upload = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) return;
      const form = new FormData();
      form.append('file', file);
      form.append('term', term);
      try {
        const res = await fetch('/api/upload', { method: 'POST', body: form });
        const body = (await res.json()) as { imageUrl?: string; error?: string };
        if (!res.ok || !body.imageUrl) throw new Error(body.error ?? 'Upload failed.');
        onPicked({
          imageUrl: body.imageUrl,
          name: term,
          score: 100,
          source: 'upload',
          license: 'Caregiver upload',
          author: null,
          symbolId: 'upload',
        });
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Upload failed.');
      }
    },
    [onClose, onPicked, term],
  );

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        className="sheet-card sheet-card--wide"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Pictures for ${term}`}
      >
        <h2 className="sheet__title">Pictures for &ldquo;{term}&rdquo;</h2>

        <form
          className="flex flex-wrap gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void search(query, false);
          }}
        >
          <input
            className="sheet__field flex-1"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Search for a different word"
          />
          <button
            type="submit"
            className="min-h-[52px] rounded-[10px] px-5 font-bold"
            style={{ background: 'var(--teal)', color: 'var(--teal-ink)' }}
          >
            Search
          </button>
          <button
            type="button"
            className="chip"
            onClick={() => fileInput.current?.click()}
          >
            Use my own photo
          </button>
        </form>

        {error ? (
          <p
            className="rounded-[10px] p-3 text-sm font-bold"
            style={{ background: '#fdeae7', color: '#a62f1e' }}
          >
            {error}
          </p>
        ) : null}

        {loading ? (
          <p className="text-sm font-semibold" style={{ color: '#6c727b' }}>
            Looking...
          </p>
        ) : (
          <ul className="grid grid-cols-3 gap-3 sm:grid-cols-5">
            {options.map((candidate) => (
              <li key={`${candidate.symbolId}-${candidate.imageUrl}`}>
                <button
                  type="button"
                  onClick={() => void pin(candidate)}
                  className="flex w-full flex-col items-center gap-1 rounded-[10px] border-2 p-2"
                  style={{ borderColor: '#cfcfc4', background: '#fff' }}
                >
                  <img
                    src={candidate.imageUrl}
                    alt={candidate.name}
                    className="aspect-square w-full object-contain"
                  />
                  <span className="w-full truncate text-xs font-bold">{candidate.name}</span>
                  <span className="text-[10px] font-semibold" style={{ color: '#6c727b' }}>
                    {candidate.score}% · {candidate.source}
                  </span>
                </button>
              </li>
            ))}
            {options.length === 0 ? (
              <li className="col-span-full text-sm font-semibold" style={{ color: '#6c727b' }}>
                Nothing found. Try a different word, or use your own photo.
              </li>
            ) : null}
          </ul>
        )}

        <button type="button" className="sheet__cancel" onClick={onClose}>
          Cancel
        </button>

        <input
          ref={fileInput}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
          className="hidden"
          onChange={(event) => void upload(event)}
        />
      </div>
    </div>
  );
}
