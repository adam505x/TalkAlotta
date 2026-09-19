'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Tile } from '@/components/Tile';
import { SentenceBar, type SentenceWord } from '@/components/SentenceBar';
import { speak, stopSpeaking, unlockAudio } from '@/lib/speech';
import type { WordRole } from '@/lib/core-words';

interface ApiTile {
  term: string;
  label: string;
  role: WordRole;
  imageUrl: string;
  kind: 'word' | 'folder';
  folderId?: string;
  boardId?: number;
  license?: string | null;
  author?: string | null;
  source?: string | null;
}

interface ApiPage {
  id: string;
  title: string;
  tiles: ApiTile[];
}

interface BoardPayload {
  core: ApiTile[];
  pages: ApiPage[];
  timeBucket: string;
  layout: {
    grid: { cols: number; rows: number };
    gapPx: number;
    iconScale: number;
    vision: string;
  };
  voice: { voiceId: string; label: string };
  onboarded: boolean;
}

export default function BoardPage() {
  const [data, setData] = useState<BoardPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openFolder, setOpenFolder] = useState<string | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [sentence, setSentence] = useState<SentenceWord[]>([]);
  const [speaking, setSpeaking] = useState(false);
  const [voiceNote, setVoiceNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/boards');
      if (!res.ok) throw new Error('Could not load the board.');
      const payload = (await res.json()) as BoardPayload;
      setData(payload);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the board.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // The vision answer drives a plain, high-contrast palette rather than only
  // bigger text, so it has to reach the document root.
  useEffect(() => {
    if (!data) return;
    document.documentElement.dataset.vision = data.layout.vision;
    return () => {
      delete document.documentElement.dataset.vision;
    };
  }, [data]);

  // iOS will not play audio that a user gesture did not start, and an element
  // created after an await no longer counts. Unlock on the first touch.
  useEffect(() => {
    const handler = () => unlockAudio();
    window.addEventListener('pointerdown', handler, { once: true });
    return () => window.removeEventListener('pointerdown', handler);
  }, []);

  const layout = data?.layout;
  const capacity = layout ? layout.grid.cols * layout.grid.rows : 12;

  const currentPage = useMemo(() => {
    if (!data) return null;
    if (!openFolder) return null;
    return data.pages.find((p) => p.id === openFolder) ?? null;
  }, [data, openFolder]);

  /** Tiles for the home view: one folder per group and per saved situation. */
  const homeTiles = useMemo<ApiTile[]>(() => {
    if (!data) return [];
    return data.pages.map((page) => {
      const cover = page.tiles[0];
      const existing = page.id.startsWith('board:');
      return {
        term: page.title,
        label: page.title,
        role: existing ? 'place' : 'object',
        imageUrl: cover?.imageUrl ?? '',
        kind: 'folder',
        folderId: page.id,
        boardId: existing ? Number(page.id.split(':')[1]) : undefined,
      };
    });
  }, [data]);

  const activeTiles = currentPage ? currentPage.tiles : homeTiles;

  // Leave room for the navigation tiles that have to fit in the same grid.
  const reserved = (currentPage ? 1 : 0) + (activeTiles.length > capacity ? 1 : 0);
  const perPage = Math.max(1, capacity - reserved);
  const totalPages = Math.max(1, Math.ceil(activeTiles.length / perPage));
  const safePage = Math.min(pageIndex, totalPages - 1);
  const visible = activeTiles.slice(safePage * perPage, safePage * perPage + perPage);

  const say = useCallback(
    async (tile: { term: string; label: string; imageUrl: string }) => {
      setSpeaking(true);
      const result = await speak(tile.label, { kind: 'word' });
      setSpeaking(false);
      if (result.via === 'browser') {
        setVoiceNote('Using the built-in browser voice for now.');
      } else if (result.via === 'none') {
        setVoiceNote('Could not speak that.');
      } else {
        setVoiceNote(null);
      }
      // Every press speaks the word AND adds it to the sentence bar.
      setSentence((prev) => [...prev, { term: tile.term, label: tile.label, imageUrl: tile.imageUrl }]);
    },
    [],
  );

  const onTile = useCallback(
    (tile: ApiTile) => {
      if (tile.kind === 'folder' && tile.folderId) {
        setOpenFolder(tile.folderId);
        setPageIndex(0);
        if (tile.boardId != null) {
          void fetch('/api/boards', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ boardId: tile.boardId }),
          });
        }
        return;
      }
      void say(tile);
    },
    [say],
  );

  const speakAll = useCallback(async () => {
    if (sentence.length === 0) return;
    const text = sentence.map((w) => w.label).join(' ');
    stopSpeaking();
    setSpeaking(true);
    // One call for the whole sentence: it sounds far better than stitching
    // single words together, and the cache means a repeated sentence is free.
    const result = await speak(text, { kind: 'sentence' });
    setSpeaking(false);
    if (result.via === 'browser') setVoiceNote('Using the built-in browser voice for now.');
  }, [sentence]);

  if (error) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-lg font-semibold">{error}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="min-h-[56px] rounded-xl border-4 px-6 text-lg font-bold"
          style={{ borderColor: 'var(--line)', background: 'var(--card)' }}
        >
          Try again
        </button>
      </main>
    );
  }

  if (!data || !layout) {
    return (
      <main className="flex min-h-dvh items-center justify-center p-6">
        <p className="text-lg" style={{ color: 'var(--ink-soft)' }}>
          Loading the board...
        </p>
      </main>
    );
  }

  return (
    <main className="safe-top safe-bottom flex h-dvh flex-col gap-2 p-2">
      <SentenceBar
        words={sentence}
        speaking={speaking}
        iconScale={layout.iconScale}
        onSpeakAll={() => void speakAll()}
        onDeleteLast={() => setSentence((prev) => prev.slice(0, -1))}
        onClear={() => setSentence([])}
      />

      {/*
        The five core words live in their own strip, outside the adjustable grid.
        At the largest button size the grid holds twelve buttons, so putting the
        core words inside it would leave almost no room for the situation words.
        Keeping them out also means they never move when the grid size changes,
        which is the entire point of a fixed position.
      */}
      <div
        className="grid shrink-0"
        style={{
          gridTemplateColumns: `repeat(${data.core.length}, minmax(0, 1fr))`,
          gap: `${layout.gapPx}px`,
          height: '18vh',
          minHeight: '92px',
        }}
      >
        {data.core.map((tile) => (
          <Tile
            key={tile.term}
            label={tile.label}
            imageUrl={tile.imageUrl}
            role={tile.role}
            iconScale={layout.iconScale}
            onActivate={() => onTile(tile)}
          />
        ))}
      </div>

      {/* The adjustable grid: folders of fixed vocabulary and saved situations. */}
      <div
        className="grid min-h-0 flex-1"
        style={{
          gridTemplateColumns: `repeat(${layout.grid.cols}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${layout.grid.rows}, minmax(0, 1fr))`,
          gap: `${layout.gapPx}px`,
        }}
      >
        {currentPage ? (
          <Tile
            label="back"
            imageUrl=""
            role="modifier"
            onActivate={() => {
              setOpenFolder(null);
              setPageIndex(0);
            }}
            iconScale={layout.iconScale}
          />
        ) : null}

        {visible.map((tile, index) => (
          <Tile
            key={`${tile.folderId ?? tile.term}-${index}`}
            label={tile.label}
            imageUrl={tile.imageUrl}
            role={tile.role}
            kind={tile.kind}
            iconScale={layout.iconScale}
            onActivate={() => onTile(tile)}
          />
        ))}

        {totalPages > 1 ? (
          <Tile
            label={`more (${safePage + 1}/${totalPages})`}
            imageUrl=""
            role="modifier"
            onActivate={() => setPageIndex((p) => (p + 1) % totalPages)}
            iconScale={layout.iconScale}
          />
        ) : null}
      </div>

      <footer className="flex shrink-0 items-center justify-between gap-3 px-1 text-xs">
        <span style={{ color: 'var(--ink-soft)' }}>
          {currentPage ? currentPage.title : `${data.timeBucket} board`}
          {voiceNote ? ` — ${voiceNote}` : ''}
        </span>
        <span className="flex items-center gap-3">
          <Link href="/describe" className="font-semibold underline">
            Describe a situation
          </Link>
          <Link href="/settings" className="font-semibold underline">
            Settings
          </Link>
        </span>
      </footer>
    </main>
  );
}
