'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Tile } from '@/components/Tile';
import { SentenceBar, type SentenceWord } from '@/components/SentenceBar';
import { Sheet } from '@/components/Sheet';
import { ScenarioSheet } from '@/components/ScenarioSheet';
import { PictureSheet, type Candidate } from '@/components/PictureSheet';
import { CaregiverDrawer, type CaregiverAction } from '@/components/CaregiverDrawer';
import { AddThingSheet, type AddFolderChoice, type AddRequest } from '@/components/AddThingSheet';
import { DashboardSheet } from '@/components/DashboardSheet';
import { setSpeechVolume, speak, stopSpeaking, unlockAudio } from '@/lib/speech';
import { analyticsSessionId, track } from '@/lib/track';
import type { DashboardRange, DashboardStats } from '@/lib/analytics-types';
import { NAV_ICONS, timeOfDay, type TimeBucket, type WordRole } from '@/lib/core-words';
import {
  CORE_COLUMNS,
  CORE_FOLDERS,
  CORE_PAGES,
  folderPageCount,
  layOutFolder,
  layOutPage,
  type CoreCell,
} from '@/lib/core-board';
import type { Weather } from '@/lib/context';
import { DemoControls, type DemoState } from '@/components/DemoControls';

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
  /** Names the folder. Fixed, so refilling its words never repaints the button. */
  icon: string;
}

interface BoardPayload {
  pictures: Record<string, string>;
  pages: ApiPage[];
  context: {
    timeBucket: TimeBucket;
    location: string | null;
    weather: Weather | null;
    situation: string | null;
  };
  contextLabel: string;
  generated: boolean;
  coreAdded?: Record<string, ApiTile[]>;
  recommended: string[];
  layout: {
    grid: { cols: number; rows: number };
    /** Fraction of its column each button fills. Set by the tap test in setup. */
    buttonScale: number;
    gapPx: number;
    iconScale: number;
    vision: string;
  };
  voice: { voiceId: string; label: string };
  speechVolume?: number;
  onboarded: boolean;
}

/**
 * Records words taken back out of the sentence bar.
 *
 * Deleting is how a communicator corrects a mistake, so it must never wait on a
 * network call: this is sent and forgotten, and a failure is swallowed.
 */
async function logDeletions(
  words: SentenceWord[],
  kind: 'last' | 'clear',
  moment: {
    location?: string | null;
    timeBucket?: string | null;
    weather?: string | null;
    situation?: string | null;
    folderId?: string | null;
    pageId?: string | null;
  },
) {
  if (words.length === 0) return;
  const now = Date.now();
  try {
    await fetch('/api/deletion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind,
        sessionId: analyticsSessionId(),
        ...moment,
        words: words.map((word) => ({
          term: word.term,
          label: word.label,
          msSinceAdded: word.addedAt ? now - word.addedAt : null,
        })),
      }),
      keepalive: true,
    });
  } catch {
    /* Counting a mistake must never get in the way of fixing one. */
  }
}

type Overlay =
  | { kind: 'none' }
  | { kind: 'scenario' }
  | { kind: 'dashboard' }
  | { kind: 'saved' }
  | { kind: 'add' }
  | { kind: 'folderEdit'; folderId: string; folderTitle: string }
  | { kind: 'picture'; term: string; role: WordRole; onPicked?: (c: Candidate) => void };

/**
 * The gap that makes every button fill `scale` of its column.
 *
 * Seven columns share six gaps, so for a track to come out at `scale` of the
 * column pitch the gap has to be (1 - scale) / 6 of the board's width. Size and
 * spacing are one number on a fixed grid: whatever the button does not fill is
 * the gap, which is exactly what the caregiver was setting in the setup preview.
 *
 * The width is measured rather than assumed. The stored gap was worked out
 * against a nominal column width during setup, so on any other screen it drifts
 * from the size that was actually chosen; measuring is what makes the board
 * match the preview on the iPad it ends up on.
 *
 * Returns null until the first measurement, so the caller can fall back.
 */
function useButtonGap(scale: number) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [gap, setGap] = useState<number | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // The grid is full-width and the gap does not change that, so measuring the
    // element the gap is applied to cannot feed back into its own width.
    const measure = () => setGap((el.clientWidth * (1 - scale)) / (CORE_COLUMNS - 1));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [scale]);

  return { ref, gap };
}

export default function BoardPage() {
  const [data, setData] = useState<BoardPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Two independent folders, not one. A core folder lives in the three rows and
  // a dynamic folder lives in the strip underneath, and they are different
  // things that happen to share names: the core "doing" folder is a fixed
  // vocabulary, the dynamic one is whatever this moment calls for. Holding both
  // in a single variable meant opening either closed the other, so the two
  // halves of the board could never be used together.
  const [openCore, setOpenCore] = useState<string | null>(null);
  const [openDynamic, setOpenDynamic] = useState<string | null>(null);
  /** Which of the three fixed pages is showing, when no folder is open. */
  const [corePage, setCorePage] = useState(0);
  /** Which page of an open folder is showing, when it has overflowed. */
  const [folderPage, setFolderPage] = useState(0);
  const [sentence, setSentence] = useState<SentenceWord[]>([]);
  const [speaking, setSpeaking] = useState(false);
  const [voiceNote, setVoiceNote] = useState<string | null>(null);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [overlay, setOverlay] = useState<Overlay>({ kind: 'none' });
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [statsRange, setStatsRange] = useState<DashboardRange>('7d');
  const [pinningPhrase, setPinningPhrase] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // The moment the board is reading. Nulls mean "use the real clock, and nothing
  // known about the place or the weather".
  const [demo, setDemo] = useState<DemoState>({
    timeBucket: null,
    location: null,
    weather: null,
  });
  const [situation, setSituation] = useState<string | null>(null);

  // The moment the board is reading, as query params. Built once here so the
  // board load and the reply generator cannot drift apart about where we are.
  const contextQuery = useMemo(() => {
    const params = new URLSearchParams();
    if (demo.timeBucket) params.set('timeBucket', demo.timeBucket);
    if (demo.location) params.set('location', demo.location);
    if (demo.weather) params.set('weather', demo.weather);
    if (situation) params.set('situation', situation);
    return params.toString();
  }, [demo, situation]);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (demo.timeBucket) params.set('timeBucket', demo.timeBucket);
      if (demo.location) params.set('location', demo.location);
      if (demo.weather) params.set('weather', demo.weather);
      if (situation) params.set('situation', situation);
      if (openCore) params.set('folder', openCore.slice(5));

      const res = await fetch(`/api/boards?${params.toString()}`);
      const payload = (await res.json()) as BoardPayload & { error?: string };
      if (!res.ok) throw new Error(payload.error ?? 'Could not load the board.');
      setData(payload);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the board.');
    }
  }, [demo, openCore, situation]);

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

  // Loudness is a caregiver setting, so the board has to apply it on load.
  useEffect(() => {
    if (typeof data?.speechVolume === 'number') setSpeechVolume(data.speechVolume);
  }, [data?.speechVolume]);

  const layout = data?.layout;

  // Called before the loading return, so the hook order never changes. The
  // fallback only stands in for the frame before the board's own data lands.
  const { ref: gridRef, gap: measuredGap } = useButtonGap(layout?.buttonScale ?? 0.9);

  const currentPage = useMemo(
    () => (data && openDynamic ? (data.pages.find((p) => p.id === openDynamic) ?? null) : null),
    [data, openDynamic],
  );

  const addFolders = useMemo<AddFolderChoice[]>(() => {
    const always: AddFolderChoice[] = Object.entries(CORE_FOLDERS).map(([id, folder]) => ({
      id: `core:${id}`,
      title: folder.name,
      role: folder.role,
      group: 'always',
    }));
    const moment: AddFolderChoice[] = (data?.pages ?? []).map((page) => ({
      id: page.id,
      title: page.title,
      role: page.role,
      group: 'moment',
    }));
    return [...always, ...moment];
  }, [data]);

  /**
   * The moment a press happened, for the event log.
   *
   * Read through a ref so a delayed delete still records the time of day and
   * situation that were true when the tap started, not whatever the demo
   * control was turned to 350ms later.
   */
  const momentRef = useRef({
    timeBucket: 'morning' as TimeBucket,
    location: null as string | null,
    weather: null as string | null,
    situation: null as string | null,
    folderId: null as string | null,
    pageId: 'page:0',
  });
  momentRef.current = {
    timeBucket: demo.timeBucket ?? data?.context.timeBucket ?? timeOfDay(),
    location: demo.location ?? data?.context.location ?? null,
    weather: demo.weather ?? data?.context.weather ?? null,
    situation,
    // The dynamic folder is the more specific of the two, so it is what names
    // the moment when both happen to be open.
    folderId: openDynamic ?? openCore,
    pageId: openDynamic ?? openCore ?? `page:${corePage}`,
  };

  const loadStats = useCallback(async (nextRange: DashboardRange) => {
    try {
      const res = await fetch(`/api/dashboard?range=${nextRange}`);
      if (res.ok) setStats((await res.json()) as DashboardStats);
    } catch {
      /* the sheet copes with no stats */
    }
  }, []);

  useEffect(() => {
    if (overlay.kind !== 'dashboard') return;
    void loadStats(statsRange);
  }, [overlay.kind, statsRange, loadStats]);

  // Opens and closes are tracked per half of the board rather than for "the"
  // folder, because there can now be two open at once and closing one must not
  // be recorded as closing both.
  const prevCore = useRef<string | null>(null);
  const prevDynamic = useRef<string | null>(null);
  useEffect(() => {
    const ctx = momentRef.current;
    for (const [seen, current] of [
      [prevCore, openCore],
      [prevDynamic, openDynamic],
    ] as const) {
      const prev = seen.current;
      if (prev === current) continue;
      if (prev) track({ type: 'folder_close', source: 'board', ...ctx, folderId: prev });
      if (current) {
        track({
          type: 'folder_open',
          label: current,
          source: 'board',
          ...ctx,
          folderId: current,
          pageId: current,
        });
      }
      seen.current = current;
    }
  }, [openCore, openDynamic]);

  // Paging belongs to the core folders alone. A dynamic folder holds five words
  // and never turns a page.
  useEffect(() => {
    setFolderPage(0);
  }, [openCore]);

  const say = useCallback(
    async (
      tile: { term: string; label: string; imageUrl: string },
      extra?: { cellIndex?: number },
    ) => {
      const ctx = momentRef.current;
      track({
        type: 'press',
        term: tile.term,
        label: tile.label,
        source: 'board',
        cellIndex: extra?.cellIndex ?? null,
        ...ctx,
      });
      const pieces = tile.label.trim().split(/\s+/).filter(Boolean);
      setSpeaking(true);
      const result = await speak(tile.label, {
        kind: pieces.length > 1 ? 'sentence' : 'word',
        words: pieces.length > 1 ? pieces : undefined,
      });
      setSpeaking(false);
      if (result.via === 'browser') setVoiceNote('built-in browser voice');
      else if (result.via === 'none') setVoiceNote('could not speak that');
      else setVoiceNote(null);
      // Every press speaks the word AND adds it to the sentence bar. The stamp is
      // what lets a delete be timed later.
      setSentence((prev) => [
        ...prev,
        { term: tile.term, label: tile.label, imageUrl: tile.imageUrl, addedAt: Date.now() },
      ]);
    },
    [],
  );

  const speakAll = useCallback(async () => {
    if (sentence.length === 0) return;
    const words = sentence.map((w) => w.label);
    const ctx = momentRef.current;
    track({
      type: 'speak_sentence',
      label: words.join(' '),
      source: 'sentence_bar',
      payload: { words: sentence.map((w) => w.term) },
      ...ctx,
    });
    stopSpeaking();
    setSpeaking(true);
    // The buttons go over as a list, not a joined string, so the server can leave
    // a short break between them. It still comes back as one clip.
    const result = await speak(words.join(' '), { kind: 'sentence', words });
    setSpeaking(false);
    if (result.via === 'browser') setVoiceNote('built-in browser voice');
  }, [sentence]);

  /**
   * The sentence as it is right now, for the delete handlers.
   *
   * A single tap on the delete key fires 350ms later, after the bar has waited to
   * see whether a second tap is coming. Reading the sentence from a closure would
   * mean recording whatever was there when the tap started, so a word pressed
   * during that window would be logged as the one taken back.
   */
  const sentenceRef = useRef<SentenceWord[]>([]);
  useEffect(() => {
    sentenceRef.current = sentence;
  }, [sentence]);

  const deleteLast = useCallback(() => {
    const removed = sentenceRef.current[sentenceRef.current.length - 1];
    if (!removed) return;
    void logDeletions([removed], 'last', momentRef.current);
    setSentence((prev) => prev.slice(0, -1));
  }, []);

  const clearSentence = useCallback(() => {
    const removed = sentenceRef.current;
    if (removed.length === 0) return;
    void logDeletions(removed, 'clear', momentRef.current);
    setSentence([]);
  }, []);

  /** In edit mode a tap changes the picture instead of speaking. */
  const onWordTile = useCallback(
    (tile: ApiTile, extra?: { cellIndex?: number }) => {
      if (editMode) {
        setOverlay({ kind: 'picture', term: tile.term, role: tile.role });
        return;
      }
      void say(tile, extra);
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
        case 'dashboard':
          setDrawerOpen(false);
          setActionError(null);
          setOverlay({ kind: 'dashboard' });
          break;
        default:
          break;
      }
    },
    [],
  );

  const pinPhrase = useCallback(
    async (phrase: string) => {
      setPinningPhrase(phrase);
      setActionError(null);
      try {
        const res = await fetch('/api/phrases', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phrase }),
        });
        const payload = (await res.json()) as { error?: string };
        if (!res.ok) throw new Error(payload.error ?? 'Could not add that phrase.');
        await load();
        await loadStats(statsRange);
      } catch (e) {
        setActionError(e instanceof Error ? e.message : 'Could not add that phrase.');
      } finally {
        setPinningPhrase(null);
      }
    },
    [load, loadStats, statsRange],
  );

  /**
   * Opens a folder in whichever half of the board it belongs to, leaving the
   * other half exactly as it was. Passing null closes both, which is what the
   * callers that reset the whole board after a change are asking for.
   */
  const goToFolder = useCallback((id: string | null) => {
    if (id === null) {
      setOpenCore(null);
      setOpenDynamic(null);
      setFolderPage(0);
      return;
    }
    if (id.startsWith('core:')) {
      setOpenCore(id);
      setFolderPage(0);
      return;
    }
    setOpenDynamic(id);
  }, []);

  /**
   * Add a button to the open folder, or create a new folder on the board.
   * A word with no usable picture is refused rather than added blank.
   */
  const addThing = useCallback(
    async (request: AddRequest) => {
      setBusy(true);
      setActionError(null);
      try {
        const body =
          request.kind === 'folder'
            ? { create: 'folder', name: request.label }
            : {
                folderId: request.folderId ?? openDynamic ?? openCore,
                term: request.label,
                role: request.role,
                imageUrl: request.imageUrl,
                // Added while somewhere, so it belongs to that place. Add "Liam"
                // at school and he comes back on the next visit to school.
                location: demo.location,
              };

        const res = await fetch('/api/folders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const payload = (await res.json()) as { error?: string; folderId?: string };
        if (!res.ok) throw new Error(payload.error ?? 'Could not add that.');

        setOverlay({ kind: 'none' });
        await load();
        // Drop straight into the folder it went into, so it is obvious where it
        // landed rather than vanishing into a closed page.
        if (request.kind === 'folder' && payload.folderId) {
          goToFolder(payload.folderId);
          setCorePage(0);
        } else if (request.kind === 'button' && request.folderId) {
          goToFolder(request.folderId);
          setCorePage(0);
        }
      } catch (e) {
        setActionError(e instanceof Error ? e.message : 'Could not add that.');
      } finally {
        setBusy(false);
      }
    },
    [demo.location, goToFolder, load, openCore, openDynamic],
  );

  /**
   * Set or clear the typed activity. It refills the same four folders; it does
   * not add one, so the board keeps its shape.
   */
  const applySituation = useCallback(
    async (next: string | null) => {
      setBusy(true);
      setActionError(null);
      setSituation(next);
      if (next) {
        track({
          type: 'situation_set',
          label: next,
          source: 'board',
          ...momentRef.current,
          situation: next,
        });
      }
      goToFolder(null);
      setCorePage(0);
      setOverlay({ kind: 'none' });
      setBusy(false);
    },
    [],
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
        goToFolder(null);
      setCorePage(0);
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
      goToFolder(null);
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

  const pictures = data.pictures ?? {};
  const pictureFor = (cell: CoreCell): string => {
    if (cell.kind === 'action') {
      return cell.action === 'back' ? NAV_ICONS.back : NAV_ICONS.next;
    }
    if (cell.kind === 'folder') {
      // Every core folder names itself (lib/core-board.ts). NAV_ICONS.folder is
      // only reachable if a cell points at a folder id that no longer exists.
      return CORE_FOLDERS[cell.folderId ?? '']?.icon ?? NAV_ICONS.folder;
    }
    return pictures[cell.label.toLowerCase()] ?? '';
  };

  /**
   * What fills the three rows: a fixed page normally, or the pinned core row
   * plus that folder's words when a core folder is open. A dynamic folder never
   * touches these rows; it only swaps the strip underneath.
   */
  const coreFolderId = openCore ? openCore.slice(5) : null;
  const coreFolder = coreFolderId ? CORE_FOLDERS[coreFolderId] : undefined;
  const dynamicFolder = openDynamic ? data.pages.find((p) => p.id === openDynamic) : undefined;

  const addedCoreWords = coreFolderId
    ? (data.coreAdded?.[coreFolderId] ?? []).map(
        (tile): CoreCell => ({
          label: tile.label,
          role: tile.role,
          kind: 'word',
        }),
      )
    : [];
  const coreFolderWords = coreFolder ? [...addedCoreWords, ...coreFolder.words] : [];
  const coreFolderPages = folderPageCount(coreFolderWords.length);
  const fixedCells = coreFolder
    ? layOutFolder(coreFolderWords, folderPage)
    : layOutPage(corePage);

  // A dynamic folder's words arrive with their pictures already attached.
  if (dynamicFolder) {
    for (const tile of dynamicFolder.tiles) pictures[tile.label.toLowerCase()] = tile.imageUrl;
  }

  /**
   * A dynamic folder holds five words and no more, so it never pages.
   *
   * Five is what fits beside back in one strip, and a folder whose whole
   * contents are visible at once is the only kind worth refilling: if a word
   * could be hiding on a second page of a folder that rewrites itself, nobody
   * can rely on having seen it, and the entire point of these four is that a
   * glance tells you what this moment offers. The server caps them at five too;
   * this is the floor under that.
   */
  const DYNAMIC_MAX = CORE_COLUMNS - 2;
  const stripTiles = (dynamicFolder?.tiles ?? []).slice(0, DYNAMIC_MAX);

  // One grid, seven wide, filling the screen. The core rows and the strip
  // underneath share the same columns so their buttons line up exactly.
  const gridColumns = `repeat(${CORE_COLUMNS}, minmax(0, 1fr))`;

  // Both grids take the same gap, so a button in the strip is the same size as
  // one in the rows above. The stored gap stands in only until the first
  // measurement lands.
  const tileGap = measuredGap ?? layout.gapPx;

  /** Everything a press on the fixed board can mean. */
  const onFixedCell = (cell: CoreCell, index: number) => {
    if (cell.kind === 'folder') {
      if (editMode) {
        setOverlay({
          kind: 'folderEdit',
          folderId: `core:${cell.folderId}`,
          folderTitle: cell.label,
        });
        return;
      }
      goToFolder(`core:${cell.folderId}`);
      return;
    }

    if (cell.kind === 'action') {
      // Inside a folder, back leaves on page one and turns back a page after that.
      // On the main board it turns back one page, and paging stops at the ends
      // rather than wrapping.
      if (cell.action === 'back') {
        if (coreFolder) {
          if (folderPage > 0) setFolderPage((p) => p - 1);
          // Closes the core folder only. A dynamic folder open in the strip
          // underneath is left exactly where it was.
          else setOpenCore(null);
        } else setCorePage((p) => Math.max(0, p - 1));
      } else if (cell.action === 'next') {
        if (coreFolder) setFolderPage((p) => Math.min(coreFolderPages - 1, p + 1));
        else setCorePage((p) => Math.min(CORE_PAGES.length - 1, p + 1));
      }
      return;
    }

    void onWordTile(
      {
        term: cell.label,
        label: cell.label,
        role: cell.role,
        imageUrl: pictureFor(cell),
        kind: 'word',
      },
      { cellIndex: index },
    );
  };

  /** Back is dead on page one of the main board, next on the last page. */
  const disabledAction = (cell: CoreCell): boolean => {
    if (cell.kind !== 'action') return false;
    if (cell.action === 'back') return !coreFolder && corePage === 0;
    if (cell.action === 'next') {
      if (coreFolder) return folderPage >= coreFolderPages - 1;
      return corePage === CORE_PAGES.length - 1;
    }
    return false;
  };

  return (
    <main
      className={`safe-top safe-bottom flex h-dvh flex-col gap-2 p-2${editMode ? ' is-editing' : ''}`}
    >
      <SentenceBar
        words={sentence}
        speaking={speaking}
        iconScale={layout.iconScale}
        onOpenMenu={() => setDrawerOpen(true)}
        onSpeakAll={() => void speakAll()}
        onDeleteLast={deleteLast}
        onClear={clearSentence}
      />

      {editMode ? (
        <div className="editbanner">
          <span className="flex-1">
            Editing{currentPage ? ` — ${currentPage.title}` : ''} — tap any button to change it
          </span>
          <button
            type="button"
            onClick={() => setOverlay({ kind: 'add' })}
            className="min-h-[36px] rounded-full border px-3 text-xs font-bold"
            style={{ borderColor: 'rgba(255,255,255,.55)' }}
          >
            + Add
          </button>
          <button
            type="button"
            onClick={() => setEditMode(false)}
            className="min-h-[36px] rounded-full border px-3 text-xs font-bold"
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
        {/*
          The fixed board. Seven columns wide whatever the grid below is set to,
          and centred, so its buttons come out exactly the same size as the ones
          underneath rather than stretching to fill a wider row.
        */}
        <div
          className="tile-grid w-full shrink-0"
          style={{ gridTemplateColumns: gridColumns, gap: `${layout.gapPx}px` }}
        >
          {fixedCells.map((cell, index) =>
            cell ? (
              <Tile
                key={`${cell.label}-${index}`}
                label={cell.label}
                imageUrl={pictureFor(cell)}
                role={cell.role}
                variant={cell.kind === 'folder' ? 'folder' : 'word'}
                iconScale={layout.iconScale}
                editable={editMode && cell.kind === 'word'}
                disabled={disabledAction(cell)}
                onActivate={() => onFixedCell(cell, index)}
              />
            ) : (
              <span key={`gap-${index}`} aria-hidden="true" />
            ),
          )}
        </div>

        <span aria-hidden="true" className="board-rule shrink-0" />

        {/*
          The strip underneath. Normally the situation button, the four
          dynamic folders, and my phrases; opening one of those swaps this strip
          for its words and leaves the three rows above completely alone.
        */}
        <div
          className="tile-grid w-full shrink-0"
          style={{ gridTemplateColumns: gridColumns, gap: `${layout.gapPx}px` }}
        >
          {dynamicFolder ? (
            <>
              <Tile
                label="back"
                imageUrl={NAV_ICONS.back}
                role="determiner"
                iconScale={layout.iconScale}
                // Closes the strip only. A core folder open in the rows above
                // stays open, because the two are separate places.
                onActivate={() => setOpenDynamic(null)}
              />
              {stripTiles.map((tile, index) => (
                <Tile
                  key={`${tile.term}-${index}`}
                  label={tile.label}
                  imageUrl={tile.imageUrl}
                  role={tile.role}
                  iconScale={layout.iconScale}
                  editable={editMode}
                  onActivate={() => void onWordTile(tile, { cellIndex: index + 1 })}
                />
              ))}
              {Array.from({
                length: Math.max(0, DYNAMIC_MAX - stripTiles.length),
              }).map((_, i) => (
                <span key={`strip-gap-${i}`} aria-hidden="true" />
              ))}
              {/* No next button, ever. The cell is left empty so the strip keeps
                  the same seven columns as the rows above it and nothing shifts
                  sideways when a folder opens. */}
              <span aria-hidden="true" />
            </>
          ) : (
            <>
              <Tile
                label="situation"
                imageUrl={NAV_ICONS.scenario}
                variant="scenario"
                iconScale={layout.iconScale}
                onActivate={() => setOverlay({ kind: 'scenario' })}
              />
              {data.pages.map((page) => (
                <Tile
                  key={page.id}
                  label={page.title}
                  imageUrl={page.icon}
                  variant="folder"
                  role={page.role}
                  iconScale={layout.iconScale}
                  editable={editMode && page.id !== 'folder:phrases'}
                  onActivate={() => {
                    if (editMode && page.id !== 'folder:phrases') {
                      setOverlay({
                        kind: 'folderEdit',
                        folderId: page.id,
                        folderTitle: page.title,
                      });
                      return;
                    }
                    goToFolder(page.id);
                  }}
                />
              ))}
            </>
          )}
        </div>
      </div>

      <p className="shrink-0 px-1 text-[11px]" style={{ color: 'var(--on-chrome-soft)' }}>
        {currentPage ? `${currentPage.title} · ` : ''}
        {data.contextLabel}
        {data.generated ? '' : ' · generic words, no API key'}
        {voiceNote ? ` · ${voiceNote}` : ''}
      </p>

      <DemoControls
        state={demo}
        actualBucket={timeOfDay()}
        busy={busy}
        onChange={(next) => {
          setDemo(next);
          goToFolder(null);
          setCorePage(0);
        }}
      />

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
          current={situation}
          contextQuery={contextQuery}
          busy={busy}
          error={actionError}
          onPick={(next) => void applySituation(next)}
          onClear={() => void applySituation(null)}
          onClose={() => {
            setActionError(null);
            setOverlay({ kind: 'none' });
          }}
        />
      ) : null}

      {overlay.kind === 'picture' ? (
        <PictureSheet
          term={overlay.term}
          role={overlay.role}
          onClose={() => setOverlay({ kind: 'none' })}
          onPicked={(candidate) => {
            overlay.onPicked?.(candidate);
            if (!overlay.onPicked) void load();
          }}
        />
      ) : null}

      {overlay.kind === 'add' ? (
        <AddThingSheet
          folderTitle={currentPage?.title ?? (coreFolder ? coreFolder.name : null)}
          folders={addFolders}
          currentFolderId={openDynamic ?? openCore}
          canAddButton={addFolders.length > 0}
          busy={busy}
          error={actionError}
          onAdd={(request) => void addThing(request)}
          onClose={() => {
            setActionError(null);
            setOverlay({ kind: 'none' });
          }}
        />
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
                goToFolder(overlay.folderId);
      setCorePage(0);
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
        <Sheet title="All folders" onClose={() => setOverlay({ kind: 'none' })}>
          <p className="text-sm font-semibold" style={{ color: '#6c727b' }}>
            Every folder on the board, by name. On the board itself each one sits
            beside the words it extends, so it is found from a word already known
            rather than hunted for in a list.
          </p>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {Object.entries(CORE_FOLDERS).map(([id, folder]) => (
              <li key={id}>
                <button
                  type="button"
                  className="w-full rounded-[10px] border-2 p-3 text-left font-bold"
                  style={{ borderColor: '#cfcfc4', background: '#fff' }}
                  onClick={() => {
                    goToFolder(`core:${id}`);
                    setOverlay({ kind: 'none' });
                  }}
                >
                  {folder.name}
                  <span
                    className="block text-xs font-semibold"
                    style={{ color: '#6c727b' }}
                  >
                    {folder.words.length} words
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Sheet>
      ) : null}

      {overlay.kind === 'dashboard' ? (
        <Sheet title="How the board is used" wide onClose={() => setOverlay({ kind: 'none' })}>
          <DashboardSheet
            stats={stats}
            range={statsRange}
            onRange={setStatsRange}
            onPinPhrase={(phrase) => void pinPhrase(phrase)}
            pinning={pinningPhrase}
          />
          {actionError && overlay.kind === 'dashboard' ? (
            <p
              className="rounded-[10px] p-3 text-sm font-bold"
              style={{ background: '#fdeae7', color: '#a62f1e' }}
            >
              {actionError}
            </p>
          ) : null}
        </Sheet>
      ) : null}
    </main>
  );
}
