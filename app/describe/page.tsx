'use client';

import { useCallback, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import type { WordRole } from '@/lib/core-words';

/**
 * The caregiver describes a moment, and gets a board back to check before it is
 * saved.
 *
 * The review step is not optional politeness. Library coverage is strong but
 * visual appropriateness is not: a search can return a plausible name with the
 * wrong picture. Anything below the confidence threshold is marked, and the
 * caregiver fixes it in a tap or two before a child ever sees it.
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
  queriedAs: string[];
  best: (Candidate & { origin?: string }) | null;
  alternatives: Candidate[];
}

interface ScenarioResponse {
  scenario: string;
  boardName: string;
  intent: string;
  via: string;
  model: string | null;
  threshold: number;
  tiles: ProposedTile[];
}

export default function DescribePage() {
  const router = useRouter();
  const [scenario, setScenario] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScenarioResponse | null>(null);
  const [boardName, setBoardName] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [options, setOptions] = useState<Candidate[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const uploadFor = useRef<string | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);

  const generate = useCallback(async () => {
    const text = scenario.trim();
    if (!text) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/scenario', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario: text }),
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
  }, [scenario]);

  const openEditor = useCallback(async (tile: ProposedTile) => {
    setEditing(tile.term);
    setSearchTerm(tile.term);
    // Start from other options for the SAME word, so there is nothing to retype.
    setOptions(tile.alternatives);
    setOptionsLoading(true);
    try {
      const res = await fetch(`/api/symbols?term=${encodeURIComponent(tile.term)}&role=${tile.role}`);
      const body = (await res.json()) as { results?: Candidate[] };
      if (body.results) setOptions(body.results);
    } catch {
      /* keep the alternatives already on screen */
    } finally {
      setOptionsLoading(false);
    }
  }, []);

  const searchOther = useCallback(async () => {
    const term = searchTerm.trim();
    if (!term) return;
    setOptionsLoading(true);
    try {
      const res = await fetch(`/api/symbols?q=${encodeURIComponent(term)}`);
      const body = (await res.json()) as { results?: Candidate[] };
      setOptions(body.results ?? []);
    } finally {
      setOptionsLoading(false);
    }
  }, [searchTerm]);

  const choose = useCallback(
    (term: string, candidate: Candidate) => {
      setResult((prev) =>
        prev
          ? {
              ...prev,
              tiles: prev.tiles.map((t) =>
                t.term === term
                  ? { ...t, best: candidate, needsReview: false }
                  : t,
              ),
            }
          : prev,
      );
      // Pin it for this word everywhere, and record the swap for the learning data.
      void fetch('/api/override', {
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
      setEditing(null);
    },
    [],
  );

  const removeTile = useCallback((term: string) => {
    setResult((prev) =>
      prev ? { ...prev, tiles: prev.tiles.filter((t) => t.term !== term) } : prev,
    );
  }, []);

  const onUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    const term = uploadFor.current;
    event.target.value = '';
    if (!file || !term) return;

    const form = new FormData();
    form.append('file', file);
    form.append('term', term);
    try {
      const res = await fetch('/api/upload', { method: 'POST', body: form });
      const body = (await res.json()) as { imageUrl?: string; error?: string };
      if (!res.ok || !body.imageUrl) throw new Error(body.error ?? 'Upload failed.');
      setResult((prev) =>
        prev
          ? {
              ...prev,
              tiles: prev.tiles.map((t) =>
                t.term === term
                  ? {
                      ...t,
                      needsReview: false,
                      best: {
                        imageUrl: body.imageUrl!,
                        name: term,
                        score: 100,
                        source: 'upload',
                        license: 'Caregiver upload',
                        author: null,
                        symbolId: 'upload',
                      },
                    }
                  : t,
              ),
            }
          : prev,
      );
      setEditing(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed.');
    }
  }, []);

  const save = useCallback(async () => {
    if (!result) return;
    const tiles = result.tiles.filter((t) => t.best);
    if (tiles.length === 0) {
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
          tiles: tiles.map((t) => ({
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
      router.push('/board');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the board.');
    } finally {
      setSaving(false);
    }
  }, [boardName, result, router]);

  const lowConfidence = result?.tiles.filter((t) => t.needsReview).length ?? 0;

  return (
    <main className="safe-top safe-bottom mx-auto flex min-h-dvh w-full max-w-5xl flex-col gap-5 p-5">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Describe a situation</h1>
        <Link href="/board" className="text-sm font-semibold underline">
          Back to the board
        </Link>
      </header>

      <section className="flex flex-col gap-3">
        <label className="flex flex-col gap-2">
          <span className="font-semibold">What is happening?</span>
          <textarea
            value={scenario}
            onChange={(e) => setScenario(e.target.value)}
            rows={3}
            maxLength={400}
            placeholder="Art class, choosing between paint and pencils"
            className="rounded-xl border-2 p-4 text-lg"
            style={{ borderColor: 'var(--line)', background: 'var(--card)' }}
          />
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <Button size="lg" onClick={() => void generate()} disabled={loading || !scenario.trim()}>
            {loading ? 'Building the board...' : 'Build the board'}
          </Button>
          {/* TODO(voice-input): hold-to-talk goes here. Deepgram prerecorded
              endpoint, no streaming needed, falling back to this text box. */}
          <span className="text-sm" style={{ color: 'var(--ink-soft)' }}>
            Typing for now. Speaking the situation aloud is next.
          </span>
        </div>
      </section>

      {error ? (
        <p
          className="rounded-xl border-2 p-3 font-semibold"
          style={{ borderColor: 'var(--role-feeling-line)', background: 'var(--role-feeling-bg)' }}
        >
          {error}{' '}
          <button type="button" className="underline" onClick={() => void generate()}>
            Try again
          </button>
        </p>
      ) : null}

      {loading ? (
        <p className="text-lg" style={{ color: 'var(--ink-soft)' }}>
          Reading the description and finding pictures...
        </p>
      ) : null}

      {result ? (
        <section className="flex flex-1 flex-col gap-4">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <label className="flex flex-col gap-2">
              <span className="font-semibold">Folder name</span>
              <input
                value={boardName}
                onChange={(e) => setBoardName(e.target.value)}
                className="min-h-[56px] rounded-xl border-2 px-4 text-lg"
                style={{ borderColor: 'var(--line)', background: 'var(--card)' }}
              />
            </label>
            <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
              {result.tiles.length} pictures
              {lowConfidence > 0 ? `, ${lowConfidence} worth a look` : ', all confident'}
            </p>
          </div>

          {lowConfidence > 0 ? (
            <p
              className="rounded-xl border-2 p-3"
              style={{
                borderColor: 'var(--role-core-line)',
                background: 'var(--role-core-bg)',
              }}
            >
              Marked pictures scored below the confidence threshold. Have a look before saving, they
              are the ones most likely to be wrong.
            </p>
          ) : null}

          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {result.tiles.map((tile) => (
              <li
                key={tile.term}
                className="flex flex-col gap-2 rounded-xl border-4 p-3"
                style={{
                  borderColor: tile.needsReview ? 'var(--role-core-line)' : 'var(--line)',
                  background: 'var(--card)',
                }}
              >
                <div className="flex aspect-square items-center justify-center rounded-lg" style={{ background: 'var(--paper)' }}>
                  {tile.best ? (
                    <img src={tile.best.imageUrl} alt={tile.label} className="max-h-full max-w-full object-contain" />
                  ) : (
                    <span className="text-sm" style={{ color: 'var(--ink-soft)' }}>
                      nothing found
                    </span>
                  )}
                </div>
                <p className="text-lg font-bold">{tile.label}</p>
                <p className="text-xs" style={{ color: 'var(--ink-soft)' }}>
                  {tile.best ? `${tile.best.score}% match, ${tile.best.source}` : 'no picture'}
                  {tile.needsReview ? ' — check this' : ''}
                </p>
                <div className="mt-auto flex gap-2">
                  <Button size="md" variant="secondary" onClick={() => void openEditor(tile)}>
                    Edit
                  </Button>
                  <Button size="md" variant="danger" onClick={() => removeTile(tile.term)}>
                    Remove
                  </Button>
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-2 flex flex-wrap gap-3">
            <Button size="xl" onClick={() => void save()} disabled={saving}>
              {saving ? 'Saving...' : 'Save as a folder on the board'}
            </Button>
          </div>
        </section>
      ) : null}

      {/* Replace-a-picture: other options for the same word first, a fresh search second. */}
      {editing ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-3 sm:items-center">
          <div
            className="flex max-h-[85dvh] w-full max-w-2xl flex-col gap-4 overflow-y-auto rounded-2xl border-4 p-4"
            style={{ borderColor: 'var(--line)', background: 'var(--card)' }}
            role="dialog"
            aria-label={`Pick a different picture for ${editing}`}
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-bold">Pictures for &ldquo;{editing}&rdquo;</h2>
              <Button size="md" variant="ghost" onClick={() => setEditing(null)}>
                Close
              </Button>
            </div>

            <div className="flex flex-wrap gap-2">
              <input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="min-h-[48px] flex-1 rounded-xl border-2 px-3"
                style={{ borderColor: 'var(--line)', background: 'var(--paper)' }}
                aria-label="Search for a different word"
              />
              <Button size="lg" variant="secondary" onClick={() => void searchOther()}>
                Search
              </Button>
              <Button
                size="lg"
                variant="secondary"
                onClick={() => {
                  uploadFor.current = editing;
                  fileInput.current?.click();
                }}
              >
                Use my own photo
              </Button>
            </div>

            {optionsLoading ? (
              <p style={{ color: 'var(--ink-soft)' }}>Looking...</p>
            ) : (
              <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                {options.map((candidate) => (
                  <li key={`${candidate.symbolId}-${candidate.imageUrl}`}>
                    <button
                      type="button"
                      onClick={() => choose(editing, candidate)}
                      className="flex w-full flex-col items-center gap-1 rounded-xl border-2 p-2"
                      style={{ borderColor: 'var(--line)', background: 'var(--paper)' }}
                    >
                      <img
                        src={candidate.imageUrl}
                        alt={candidate.name}
                        className="aspect-square w-full object-contain"
                      />
                      <span className="w-full truncate text-xs font-semibold">{candidate.name}</span>
                      <span className="text-[10px]" style={{ color: 'var(--ink-soft)' }}>
                        {candidate.score}% · {candidate.source}
                      </span>
                    </button>
                  </li>
                ))}
                {options.length === 0 ? (
                  <li className="col-span-full text-sm" style={{ color: 'var(--ink-soft)' }}>
                    Nothing found. Try a different word, or use your own photo.
                  </li>
                ) : null}
              </ul>
            )}
          </div>
        </div>
      ) : null}

      <input
        ref={fileInput}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
        className="hidden"
        onChange={(e) => void onUpload(e)}
      />
    </main>
  );
}
