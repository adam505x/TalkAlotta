'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Tile } from '@/components/Tile';
import { SentenceBar, type SentenceWord } from '@/components/SentenceBar';
import { Sheet } from '@/components/Sheet';
import { ScenarioSheet } from '@/components/ScenarioSheet';
import { PictureSheet, type Candidate } from '@/components/PictureSheet';
import { CaregiverDrawer, type CaregiverAction } from '@/components/CaregiverDrawer';
import { DemoControls } from '@/components/DemoControls';
import { speak, stopSpeaking, unlockAudio } from '@/lib/speech';
import {
  NAV_ICONS,
  timeOfDay,
  type LocationBucket,
  type TimeBucket,
  type WordRole,
} from '@/lib/core-words';

interface ApiTile {
  term: string;
  label: string;
  role: WordRole;
  imageUrl: string;
  kind: 'word' | 'folder';
}

interface ApiPage {
  id: string;
  title: string;
  tiles: ApiTile[];
}

interface BoardPayload {
  core: ApiTile[];
  pages: ApiPage[];
  timeBucket: TimeBucket;
  location: LocationBucket | null;
  recommended: string[];
  layout: {
    grid: { cols: number; rows: number };
    gapPx: number;
    iconScale: number;
    vision: string;
  };
  voice: { voiceId: string; label: string };
  onboarded: boolean;
}

interface FolderEntry {
  id: string;
  title: string;
  cover: string;
  boardId?: number;
}

interface Stats {
  totalUtterances: number;
  topSentences: { text: string; times: number }[];
  topWords: { text: string; times: number }[];
  credits: { characters: number; clips: number; cacheHits: number };
}

type Overlay =
  | { kind: 'none' }
  | { kind: 'scenario' }
  | { kind: 'dashboard' }
  | { kind: 'saved' }
  | { kind: 'picture'; term: string; role: WordRole; onPicked?: (c: Candidate) => void };

export default function BoardPage() {
  const router = useRouter();

  const [data, setData] = useState<BoardPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openFolder, setOpenFolder] = useState<string | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [sentence, setSentence] = useState<SentenceWord[]>([]);
  const [speaking, setSpeaking] = useState(false);
  const [voiceNote, setVoiceNote] = useState<string | null>(null);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [overlay, setOverlay] = useState<Overlay>({ kind: 'none' });
  const [stats, setStats] = useState<Stats | null>(null);

  // Demo overrides. null means "use the real clock, no location".
  const [timeOverride, setTimeOverride] = useState<TimeBucket | null>(null);
  const [locationOverride, setLocationOverride] = useState<LocationBucket | null>(null);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (timeOverride) params.set('timeBucket', timeOverride);
      if (locationOverride) params.set('location', locationOverride);
      const res = await fetch(`/api/boards?${params.toString()}`);
      if (!res.ok) throw new Error('Could not load the board.');
      setData((await res.json()) as BoardPayload);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the board.');
    }
  }, [locationOverride, timeOverride]);

  useEffect(() => {
    void load();
  }, [load]);

  // Opened from the end of setup with the describe box already up. Read from
  // the URL directly rather than with useSearchParams, which would force this
  // page behind a Suspense boundary for no benefit.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has('situation')) {
      setOverlay({ kind: 'scenario' });
    }
  }, []);

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

  const currentPage = useMemo(
    () => (data && openFolder ? (data.pages.find((p) => p.id === openFolder) ?? null) : null),
    [data, openFolder],
  );

  const folders = useMemo<FolderEntry[]>(() => {
    if (!data) return [];
    return data.pages.map((page) => ({
      id: page.id,
      title: page.title,
      cover: page.tiles[0]?.imageUrl ?? '',
      boardId: page.id.startsWith('board:') ? Number(page.id.split(':')[1]) : undefined,
    }));
  }, [data]);

  const say = useCallback(async (tile: { term: string; label: string; imageUrl: string }) => {
    setSpeaking(true);
    const result = await speak(tile.label, { kind: 'word' });
    setSpeaking(false);
    if (result.via === 'browser') setVoiceNote('built-in browser voice');
    else if (result.via === 'none') setVoiceNote('could not speak that');
    else setVoiceNote(null);
    // Every press speaks the word AND adds it to the sentence bar.
    setSentence((prev) => [
      ...prev,
      { term: tile.term, label: tile.label, imageUrl: tile.imageUrl },
    ]);
  }, []);

  const speakAll = useCallback(async () => {
    if (sentence.length === 0) return;
    const text = sentence.map((w) => w.label).join(' ');
    stopSpeaking();
    setSpeaking(true);
    // One call for the whole sentence: it sounds far better than stitching
    // single words together, and the cache means a repeated sentence is free.
    const result = await speak(text, { kind: 'sentence' });
    setSpeaking(false);
    if (result.via === 'browser') setVoiceNote('built-in browser voice');
  }, [sentence]);

  /** In edit mode a tap changes the picture instead of speaking. */
  const onWordTile = useCallback(
    (tile: ApiTile) => {
      if (editMode) {
        setOverlay({ kind: 'picture', term: tile.term, role: tile.role });
        return;
      }
      void say(tile);
    },
    [editMode, say],
  );

  const caregiverAction = useCallback(
    async (action: CaregiverAction) => {
      switch (action) {
        case 'edit-boards':
          setEditMode((v) => !v);
          setDrawerOpen(false);
          break;
        case 'edit-icons':
          setEditMode(true);
          setDrawerOpen(false);
          break;
        case 'add-image':
          setEditMode(true);
          setDrawerOpen(false);
          break;
        case 'saved-boards':
          setDrawerOpen(false);
          setOverlay({ kind: 'saved' });
          break;
        case 'dashboard': {
          setDrawerOpen(false);
          setOverlay({ kind: 'dashboard' });
          try {
            const res = await fetch('/api/utterance');
            if (res.ok) setStats((await res.json()) as Stats);
          } catch {
            /* the sheet copes with no stats */
          }
          break;
        }
        default:
          break;
      }
    },
    [],
  );

  const deleteBoard = useCallback(
    async (boardId: number) => {
      await fetch(`/api/boards?id=${boardId}`, { method: 'DELETE' });
      setOpenFolder(null);
      void load();
    },
    [load],
  );

  if (error) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-lg font-semibold">{error}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="min-h-[56px] rounded-xl px-6 text-lg font-bold"
          style={{ background: 'var(--teal)', color: 'var(--teal-ink)' }}
        >
          Try again
        </button>
      </main>
    );
  }

  if (!data || !layout) {
    return (
      <main className="flex min-h-dvh items-center justify-center p-6">
        <p className="text-lg" style={{ color: 'var(--on-chrome-soft)' }}>
          Loading the board...
        </p>
      </main>
    );
  }

  // Two pinned tiles at most: go back inside a folder, new situation on the home
  // board, plus a next-page tile when the content overflows.
  const pinned = 1;
  const content: (ApiTile | FolderEntry)[] = currentPage ? currentPage.tiles : folders;
  const withoutNext = Math.max(1, capacity - pinned);
  const needsNext = content.length > withoutNext;
  const perPage = needsNext ? Math.max(1, withoutNext - 1) : withoutNext;
  const totalPages = Math.max(1, Math.ceil(content.length / perPage));
  const safePage = Math.min(pageIndex, totalPages - 1);
  const slice = content.slice(safePage * perPage, safePage * perPage + perPage);

  const savedBoards = folders.filter((f) => f.boardId != null);

  return (
    <main className="safe-top safe-bottom flex h-dvh flex-col gap-2 p-2">
      <SentenceBar
        words={sentence}
        speaking={speaking}
        iconScale={layout.iconScale}
        onOpenMenu={() => setDrawerOpen(true)}
        onSpeakAll={() => void speakAll()}
        onDeleteLast={() => setSentence((prev) => prev.slice(0, -1))}
        onClear={() => setSentence([])}
      />

      {editMode ? (
        <div
          className="flex shrink-0 items-center gap-3 rounded-[8px] px-3 py-2 text-xs font-bold"
          style={{ background: 'var(--teal)', color: 'var(--teal-ink)' }}
        >
          <span className="uppercase tracking-[0.06em]">Edit mode</span>
          <span className="font-semibold opacity-90">
            Tap any button to change its picture or upload a photo.
          </span>
          <button
            type="button"
            onClick={() => setEditMode(false)}
            className="ml-auto min-h-[32px] rounded-full border px-3"
            style={{ borderColor: 'rgba(255,255,255,.55)' }}
          >
            Done
          </button>
        </div>
      ) : null}

      {/*
        The fixed top row. Outside the adjustable grid, so it never moves when the
        grid size changes. yes sits one in from the left, no one in from the right,
        with four buttons between them, so the two opposites are hard to confuse.
      */}
      <div
        className="grid shrink-0"
        style={{
          gridTemplateColumns: `repeat(${data.core.length}, minmax(0, 1fr))`,
          gap: `${layout.gapPx}px`,
          height: '17vh',
          minHeight: '84px',
        }}
      >
        {data.core.map((tile) => (
          <Tile
            key={tile.term}
            label={tile.label}
            imageUrl={tile.imageUrl}
            role={tile.role}
            iconScale={layout.iconScale}
            editable={editMode}
            onActivate={() => onWordTile(tile)}
          />
        ))}
      </div>

      {/* The adjustable grid, on its own panel. */}
      <div className="board-panel min-h-0 flex-1 p-2">
        <div
          className="grid h-full"
          style={{
            gridTemplateColumns: `repeat(${layout.grid.cols}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${layout.grid.rows}, minmax(0, 1fr))`,
            gap: `${layout.gapPx}px`,
          }}
        >
          {currentPage ? (
            <Tile
              label="go back"
              imageUrl={NAV_ICONS.back}
              variant="nav"
              iconScale={layout.iconScale}
              onActivate={() => {
                setOpenFolder(null);
                setPageIndex(0);
              }}
            />
          ) : (
            <Tile
              label="new situation"
              imageUrl={NAV_ICONS.scenario}
              variant="scenario"
              iconScale={layout.iconScale}
              onActivate={() => setOverlay({ kind: 'scenario' })}
            />
          )}

          {currentPage
            ? (slice as ApiTile[]).map((tile, index) => (
                <Tile
                  key={`${tile.term}-${index}`}
                  label={tile.label}
                  imageUrl={tile.imageUrl}
                  role={tile.role}
                  iconScale={layout.iconScale}
                  editable={editMode}
                  onActivate={() => onWordTile(tile)}
                />
              ))
            : (slice as FolderEntry[]).map((folder, index) => (
                <Tile
                  key={`${folder.id}-${index}`}
                  label={folder.title}
                  imageUrl={folder.cover}
                  variant="folder"
                  iconScale={layout.iconScale}
                  onActivate={() => {
                    setOpenFolder(folder.id);
                    setPageIndex(0);
                    if (folder.boardId != null) {
                      void fetch('/api/boards', {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ boardId: folder.boardId }),
                      });
                    }
                  }}
                />
              ))}

          {needsNext ? (
            <Tile
              label={`more ${safePage + 1}/${totalPages}`}
              imageUrl={NAV_ICONS.next}
              variant="nav"
              iconScale={layout.iconScale}
              onActivate={() => setPageIndex((p) => (p + 1) % totalPages)}
            />
          ) : null}
        </div>
      </div>

      <p className="shrink-0 px-1 text-[11px]" style={{ color: 'var(--on-chrome-soft)' }}>
        {currentPage ? currentPage.title : `${data.timeBucket} board`}
        {data.location ? ` · ${data.location}` : ''}
        {voiceNote ? ` · ${voiceNote}` : ''}
      </p>

      {drawerOpen ? (
        <CaregiverDrawer
          editMode={editMode}
          onClose={() => setDrawerOpen(false)}
          onAction={(action) => void caregiverAction(action)}
        />
      ) : null}

      <DemoControls
        timeBucket={timeOverride}
        location={locationOverride}
        actualBucket={timeOfDay()}
        onChange={({ timeBucket, location }) => {
          setTimeOverride(timeBucket);
          setLocationOverride(location);
          setOpenFolder(null);
          setPageIndex(0);
        }}
      />

      {overlay.kind === 'scenario' ? (
        <ScenarioSheet
          recommended={data.recommended}
          onClose={() => setOverlay({ kind: 'none' })}
          onSaved={() => {
            setOverlay({ kind: 'none' });
            void load();
          }}
          onEditPicture={(term, role, onPicked) =>
            setOverlay({ kind: 'picture', term, role, onPicked })
          }
        />
      ) : null}

      {overlay.kind === 'picture' ? (
        <PictureSheet
          term={overlay.term}
          role={overlay.role}
          onClose={() =>
            // Coming back from the review step, return to the describe sheet.
            setOverlay(overlay.onPicked ? { kind: 'scenario' } : { kind: 'none' })
          }
          onPicked={(candidate) => {
            overlay.onPicked?.(candidate);
            if (!overlay.onPicked) void load();
          }}
        />
      ) : null}

      {overlay.kind === 'saved' ? (
        <Sheet title="Saved boards" onClose={() => setOverlay({ kind: 'none' })}>
          {savedBoards.length === 0 ? (
            <p className="text-sm font-semibold" style={{ color: '#6c727b' }}>
              No situations saved yet. Use the teal new situation button on the board.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {savedBoards.map((board) => (
                <li
                  key={board.id}
                  className="flex items-center gap-3 rounded-[10px] border-2 p-2"
                  style={{ borderColor: '#cfcfc4', background: '#fff' }}
                >
                  {board.cover ? (
                    <img src={board.cover} alt="" className="h-10 w-10 object-contain" />
                  ) : null}
                  <span className="flex-1 truncate font-bold">{board.title}</span>
                  <button
                    type="button"
                    className="chip"
                    onClick={() => {
                      setOpenFolder(board.id);
                      setPageIndex(0);
                      setOverlay({ kind: 'none' });
                    }}
                  >
                    Open
                  </button>
                  <button
                    type="button"
                    className="min-h-[44px] rounded-full border px-3 text-sm font-bold"
                    style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}
                    onClick={() => void deleteBoard(board.boardId!)}
                  >
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Sheet>
      ) : null}

      {overlay.kind === 'dashboard' ? (
        <Sheet title="Dashboard" onClose={() => setOverlay({ kind: 'none' })}>
          {!stats || stats.totalUtterances === 0 ? (
            <p className="text-sm font-semibold" style={{ color: '#6c727b' }}>
              Nothing spoken yet. Press some buttons and this fills up.
            </p>
          ) : (
            <>
              <p className="sheet__label">Most said sentences</p>
              {stats.topSentences.length === 0 ? (
                <p className="text-sm" style={{ color: '#6c727b' }}>
                  No full sentences yet. Build one and press say it.
                </p>
              ) : (
                <ol className="flex flex-col gap-1 text-sm font-semibold">
                  {stats.topSentences.map((row) => (
                    <li key={row.text} className="flex justify-between gap-3">
                      <span className="truncate">{row.text}</span>
                      <span style={{ color: '#6c727b' }}>{row.times}</span>
                    </li>
                  ))}
                </ol>
              )}

              <p className="sheet__label">Most pressed words</p>
              <ol className="flex flex-col gap-1 text-sm font-semibold">
                {stats.topWords.map((row) => (
                  <li key={row.text} className="flex justify-between gap-3">
                    <span className="truncate">{row.text}</span>
                    <span style={{ color: '#6c727b' }}>{row.times}</span>
                  </li>
                ))}
              </ol>

              <p className="sheet__label">Speech credits</p>
              <ul className="text-sm font-semibold">
                <li>Characters sent: {stats.credits.characters}</li>
                <li>Clips generated: {stats.credits.clips}</li>
                <li>Presses served free from the cache: {stats.credits.cacheHits}</li>
              </ul>
            </>
          )}
          <button
            type="button"
            className="chip self-start"
            onClick={() => router.push('/settings')}
          >
            Open settings
          </button>
        </Sheet>
      ) : null}
    </main>
  );
}
