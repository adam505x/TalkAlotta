/**
 * Shared shapes for the board event log.
 *
 * Kept free of Node imports so the board can send events and the server can
 * store them from one list of types. The caregiver dashboard never reads these
 * rows raw; it reads counts built from them. A later model would.
 */

export const EVENT_TYPES = [
  'press',
  'speak_sentence',
  'delete_last',
  'clear',
  'folder_open',
  'folder_close',
  'situation_set',
  'reply_spoken',
  'word_added',
] as const;

export type AnalyticsEventType = (typeof EVENT_TYPES)[number];

export function isAnalyticsEventType(value: string): value is AnalyticsEventType {
  return (EVENT_TYPES as readonly string[]).includes(value);
}

/** Where the event came from, so voice tests do not look like real use. */
export type AnalyticsSource = 'board' | 'sentence_bar' | 'conversation' | 'caregiver' | 'settings';

export interface AnalyticsEventInput {
  type: AnalyticsEventType;
  term?: string | null;
  label?: string | null;
  folderId?: string | null;
  pageId?: string | null;
  cellIndex?: number | null;
  location?: string | null;
  timeBucket?: string | null;
  weather?: string | null;
  situation?: string | null;
  sessionId?: string | null;
  source?: AnalyticsSource | string | null;
  payload?: Record<string, unknown> | null;
}

export type DashboardRange = '7d' | '30d' | 'all';

export interface DashboardCount {
  text: string;
  times: number;
  imageUrl?: string;
}

export interface DashboardStats {
  range: DashboardRange;
  fromEvents: boolean;
  summary: {
    presses: number;
    sentences: number;
    sessions: number;
    topWord: DashboardCount | null;
  };
  topWords: DashboardCount[];
  topSentences: (DashboardCount & { pinned?: boolean })[];
  byTime: { bucket: string; times: number }[];
  bySituation: DashboardCount[];
  byLocation: DashboardCount[];
  added: {
    total: number;
    recent: {
      term: string;
      where: string;
      location: string | null;
      addedAt: string;
      used: boolean;
      imageUrl?: string;
    }[];
  };
  deletions: {
    total: number;
    clears: number;
    quick: number;
    topDeleted: DashboardCount[];
    wordsAdded: number;
    ratePct: number;
    quickRatePct: number;
    buttonScalePct: number | null;
    suggestBigger: boolean;
    quickDeleteMs: number;
  };
}
