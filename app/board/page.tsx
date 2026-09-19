'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Tile } from '@/components/Tile';
import { SentenceBar, type SentenceWord } from '@/components/SentenceBar';
import { Sheet } from '@/components/Sheet';
import { ScenarioSheet } from '@/components/ScenarioSheet';
import { PictureSheet, type Candidate } from '@/components/PictureSheet';
import { CaregiverDrawer, type CaregiverAction } from '@/components/CaregiverDrawer';
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
  role: WordRole;
}

interface BoardPayload {
  coreRows: ApiTile[][];
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
  role: WordRole;
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
  | { kind: 'addWord'; folderId: string; folderTitle: string }
  | { kind: 'folderEdit'; folderId: string; folderTitle: string }
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
  const [newWord, setNewWord] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

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
      role: page.role ?? 'object',
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

  const addWord = useCallback(
    async (folderId: string, term: string) => {
      const clean = term.trim();
      if (!clean) return;
      setBusy(true);
      setActionError(null);
      try {
        const res = await fetch('/api/folders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ folderId, term: clean }),
        });
        const body = (await res.json()) as { error?: string };
        if (!res.ok) throw new Error(body.error ?? 'Could not add that word.');
        setNewWord('');
        setOverlay({ kind: 'none' });
        await load();
      } catch (e) {
        setActionError(e instanceof Error ? e.message : 'Could not add that word.');
      } finally {
        setBusy(false);
      }
    },
    [load],
  );

  const removeFolder = useCallback(
    async (folderId: string) => {
      setBusy(true);
      setActionError(null);
      try {
        const res = await fetch(`/api/folders?folderId=${encodeURIComponent(folderId)}`, {
          method: 'DELETE',
        });
        const body = (await res.json()) as { error?: string };
        if (!res.ok) throw new Error(body.error ?? 'Could not remove that folder.');
        setOpenFolder(null);
        setPageIndex(0);
        setOverlay({ kind: 'none' });
        await load();
      } catch (e) {
        setActionError(e instanceof Error ? e.message : 'Could not remove that folder.');
      } finally {
        setBusy(false);
      }
    },
    [load],
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
  // Pinned tiles in the grid: go back or new situation, plus the add button that
  // every open folder carries.
  const pinned = currentPage ? 2 : 1;
  const content: (ApiTile | FolderEntry)[] = currentPage ? currentPage.tiles : folders;
  const withoutNext = Math.max(1, capacity - pinned);
  const needsNext = content.length > withoutNext;
  const perPage = needsNext ? Math.max(1, withoutNext - 1) : withoutNext;
  const totalPages = Math.max(1, Math.ceil(content.length / perPage));
  const safePage = Math.min(pageIndex, totalPages - 1);
  const slice = content.slice(safePage * perPage, safePage * perPage + perPage);

  const savedBoards = folders.filter((f) => f.boardId != null);

  /**
   * The core block is always exactly seven columns, whatever the grid below is
   * set to. Its tiles are kept the same size as the grid's by giving the block
   * the width of seven of the grid's tracks and centring it, rather than
   * stretching seven words across more columns and leaving holes in the middle.
   */
  const CORE_COLS = 7;
  const coreWidth =
    layout.grid.cols === CORE_COLS
      ? '100%'
      : `calc((100% - ${(layout.grid.cols - 1) * layout.gapPx}px) * ${CORE_COLS} / ${layout.grid.cols} + ${(CORE_COLS - 1) * layout.gapPx}px)`;

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
        The fixed top row. It uses the SAME column count as the grid below, so a
        core tile and a grid tile are exactly the same size; a tile's height comes
        from its aspect ratio, not from the space it is given.

        When the grid is wider than seven columns the spare tracks are left empty
        in the MIDDLE, so help stays first, finished stays last, and yes and no
        stay one in from each edge whatever the button size.
      */}
      <div className="board-panel flex min-h-0 flex-1 flex-col gap-2 p-2">
        <div
          className="tile-grid mx-auto w-full shrink-0"
          style={{
            gridTemplateColumns: `repeat(${CORE_COLS}, minmax(0, 1fr))`,
            gap: `${layout.gapPx}px`,
            width: coreWidth,
          }}
        >
          {data.coreRows.flatMap((row, rowIndex) =>
            row.map((tile) => (
              <Tile
                key={`${rowIndex}-${tile.term}`}
                label={tile.label}
                imageUrl={tile.imageUrl}
                role={tile.role}
                iconScale={layout.iconScale}
                editable={editMode}
                onActivate={() => onWordTile(tile)}
              />
            )),
          )}
        </div>

        <span aria-hidden="true" className="board-rule shrink-0" />

        {/* The adjustable grid. Rows are not forced to a height: every tile keeps
            its aspect ratio and the rows follow from that. */}
        <div
          className="tile-grid"
          style={{
            gridTemplateColumns: `repeat(${layout.grid.cols}, minmax(0, 1fr))`,
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
                  role={folder.role}
                  iconScale={layout.iconScale}
                  editable={editMode}
                  onActivate={() => {
                    // In edit mode a folder offers to be removed rather than opened.
                    if (editMode) {
                      setOverlay({
                        kind: 'folderEdit',
                        folderId: folder.id,
                        folderTitle: folder.title,
                      });
                      return;
                    }
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

          {/* Every folder carries a way to add another picture to it. */}
          {currentPage ? (
            <Tile
              label="add icon"
              imageUrl={NAV_ICONS.add}
              variant="nav"
              iconScale={layout.iconScale}
              onActivate={() =>
                setOverlay({
                  kind: 'addWord',
                  folderId: currentPage.id,
                  folderTitle: currentPage.title,
                })
              }
            />
          ) : null}

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
          demo={{
            timeBucket: timeOverride,
            location: locationOverride,
            actualBucket: timeOfDay(),
            onChange: ({ timeBucket, location }) => {
              setTimeOverride(timeBucket);
              setLocationOverride(location);
              setOpenFolder(null);
              setPageIndex(0);
            },
          }}
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

      {overlay.kind === 'addWord' ? (
        <Sheet
          title={`Add a picture to ${overlay.folderTitle}`}
          onClose={() => setOverlay({ kind: 'none' })}
        >
          <p className="text-sm font-semibold" style={{ color: '#6c727b' }}>
            Type the word. A picture is found for it and added to this folder.
          </p>
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void addWord(overlay.folderId, newWord);
            }}
          >
            <input
              className="sheet__field flex-1"
              value={newWord}
              onChange={(event) => setNewWord(event.target.value)}
              placeholder="dog"
              maxLength={40}
              autoFocus
              aria-label="Word to add"
            />
            <button
              type="submit"
              className="min-h-[52px] rounded-[10px] px-5 font-bold disabled:opacity-50"
              style={{ background: 'var(--teal)', color: 'var(--teal-ink)' }}
              disabled={busy || !newWord.trim()}
            >
              {busy ? 'Adding...' : 'Add'}
            </button>
          </form>
          {actionError ? (
            <p
              className="rounded-[10px] p-3 text-sm font-bold"
              style={{ background: '#fdeae7', color: '#a62f1e' }}
            >
              {actionError}
            </p>
          ) : null}
        </Sheet>
      ) : null}

      {overlay.kind === 'folderEdit' ? (
        <Sheet title={overlay.folderTitle} onClose={() => setOverlay({ kind: 'none' })}>
          <p className="text-sm font-semibold" style={{ color: '#6c727b' }}>
            {overlay.folderId.startsWith('board:')
              ? 'This folder came from a situation you described. Removing it deletes it.'
              : 'This is a built-in folder. Removing it takes it off the board; it is not deleted.'}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="chip"
              onClick={() => {
                setOpenFolder(overlay.folderId);
                setPageIndex(0);
                setOverlay({ kind: 'none' });
              }}
            >
              Open it instead
            </button>
            <button
              type="button"
              className="min-h-[44px] rounded-full border px-4 font-bold disabled:opacity-50"
              style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}
              disabled={busy}
              onClick={() => void removeFolder(overlay.folderId)}
            >
              {busy ? 'Removing...' : 'Remove from the board'}
            </button>
          </div>
          {actionError ? (
            <p
              className="rounded-[10px] p-3 text-sm font-bold"
              style={{ background: '#fdeae7', color: '#a62f1e' }}
            >
              {actionError}
            </p>
          ) : null}
        </Sheet>
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
