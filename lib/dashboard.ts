import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { CORE_FOLDERS } from '@/lib/core-board';
import { TIME_BUCKETS } from '@/lib/core-words';
import { listedPhrases, PHRASES_FOLDER_ID, PHRASES_TITLE } from '@/lib/phrases';
import type { DashboardCount, DashboardRange, DashboardStats } from '@/lib/analytics-types';

export type { DashboardRange, DashboardStats, DashboardCount } from '@/lib/analytics-types';

/** Taken back this fast, a word was a misfire rather than a change of mind. */
const QUICK_DELETE_MS = 2000;
const MIN_PRESSES_FOR_ADVICE = 20;
const HIGH_DELETE_RATE_PCT = 20;
const LIST_LIMIT = 10;

/** Voice tests and holding phrases must not look like the communicator talking. */
const IGNORE_SENTENCES = [
  'one moment please',
  'hello, my name is talkalotta.',
  'hello my name is talkalotta.',
];

export function dashboardStats(range: DashboardRange): DashboardStats {
  const eventSince = sinceClause(range, schema.analyticsEvents.createdAt);
  const utteranceSince = sinceClause(range, schema.utterances.spokenAt);
  const deletionSince = sinceClause(range, schema.deletions.createdAt);

  const pressCount =
    db
      .select({ n: sql<number>`count(*)` })
      .from(schema.analyticsEvents)
      .where(and(eq(schema.analyticsEvents.type, 'press'), eventSince))
      .get()?.n ?? 0;

  const utteredWords =
    db
      .select({ n: sql<number>`count(*)` })
      .from(schema.utterances)
      .where(and(sql`${schema.utterances.kind} = 'word'`, utteranceSince))
      .get()?.n ?? 0;

  // Live events win inside a short window. All-time still reads the older speech
  // log until enough presses have been tracked the new way, otherwise three new
  // taps would hide hundreds of earlier ones.
  const fromEvents = pressCount > 0 && (range !== 'all' || pressCount >= Math.max(20, utteredWords / 2));
  const pinnedPhrases = new Set(listedPhrases().map((phrase) => phrase.toLowerCase()));

  const topWords = fromEvents
    ? rankedEvents('press', eventSince)
    : rankedUtterances('word', utteranceSince);

  const topSentences = (fromEvents
    ? rankedEvents('speak_sentence', eventSince)
    : rankedUtterances('sentence', utteranceSince)
  ).map((row) => ({
    ...row,
    pinned: pinnedPhrases.has(row.text.toLowerCase()),
  }));

  const presses = fromEvents ? pressCount : utteredWords;

  const sentencesSpoken =
    db
      .select({ n: sql<number>`count(*)` })
      .from(schema.analyticsEvents)
      .where(and(eq(schema.analyticsEvents.type, 'speak_sentence'), eventSince, notIgnored()))
      .get()?.n ?? 0;

  const utteredSentences =
    db
      .select({ n: sql<number>`count(*)` })
      .from(schema.utterances)
      .where(and(sql`${schema.utterances.kind} = 'sentence'`, utteranceSince, notIgnoredUtterance()))
      .get()?.n ?? 0;

  const sentenceCount = fromEvents ? sentencesSpoken : utteredSentences;

  const sessions =
    db
      .select({ n: sql<number>`count(distinct ${schema.analyticsEvents.sessionId})` })
      .from(schema.analyticsEvents)
      .where(eventSince)
      .get()?.n ?? 0;

  const timeRows = db
    .select({
      bucket: schema.analyticsEvents.timeBucket,
      times: sql<number>`count(*)`,
    })
    .from(schema.analyticsEvents)
    .where(and(eq(schema.analyticsEvents.type, 'press'), eventSince))
    .groupBy(schema.analyticsEvents.timeBucket)
    .all();

  const timeMap = new Map(timeRows.map((row) => [row.bucket, row.times]));
  const byTime = TIME_BUCKETS.map((bucket) => ({ bucket, times: timeMap.get(bucket) ?? 0 }));

  // Older speech rows still carry a time of day even when press events do not.
  if (!fromEvents) {
    const uttered = db
      .select({
        bucket: schema.utterances.timeBucket,
        times: sql<number>`count(*)`,
      })
      .from(schema.utterances)
      .where(and(sql`${schema.utterances.kind} = 'word'`, utteranceSince))
      .groupBy(schema.utterances.timeBucket)
      .all();
    const utteredMap = new Map(uttered.map((row) => [row.bucket, row.times]));
    for (const row of byTime) row.times = utteredMap.get(row.bucket) ?? 0;
  }

  const bySituation = groupedField(schema.analyticsEvents.situation, eventSince);
  const byLocation = groupedField(schema.analyticsEvents.location, eventSince);

  const usedTerms = new Set(topWords.map((row) => row.text.toLowerCase()));
  const added = addedButtons(usedTerms);

  // Once live events exist, deletes come from the same log as presses so a
  // handful of new taps cannot be divided into last week's undo history.
  const eventDeletes = db
    .select({
      total: sql<number>`count(*)`,
      clears: sql<number>`sum(case when ${schema.analyticsEvents.type} = 'clear' then 1 else 0 end)`,
      quick: sql<number>`sum(case when json_extract(${schema.analyticsEvents.payload}, '$.msSinceAdded') is not null and json_extract(${schema.analyticsEvents.payload}, '$.msSinceAdded') <= ${QUICK_DELETE_MS} then 1 else 0 end)`,
    })
    .from(schema.analyticsEvents)
    .where(
      and(
        sql`${schema.analyticsEvents.type} in ('delete_last', 'clear')`,
        eventSince,
      ),
    )
    .get();

  const tableDeletes = db
    .select({
      total: sql<number>`count(*)`,
      clears: sql<number>`sum(case when ${schema.deletions.kind} = 'clear' then 1 else 0 end)`,
      quick: sql<number>`sum(case when ${schema.deletions.msSinceAdded} is not null and ${schema.deletions.msSinceAdded} <= ${QUICK_DELETE_MS} then 1 else 0 end)`,
    })
    .from(schema.deletions)
    .where(deletionSince)
    .get();

  const deleteTotals = fromEvents ? eventDeletes : tableDeletes;

  const topDeleted = fromEvents
    ? db
        .select({
          text: sql<string>`coalesce(${schema.analyticsEvents.label}, ${schema.analyticsEvents.term})`,
          times: sql<number>`count(*)`,
        })
        .from(schema.analyticsEvents)
        .where(
          and(
            sql`${schema.analyticsEvents.type} in ('delete_last', 'clear')`,
            eventSince,
          ),
        )
        .groupBy(sql`coalesce(${schema.analyticsEvents.label}, ${schema.analyticsEvents.term})`)
        .orderBy(desc(sql`count(*)`))
        .limit(LIST_LIMIT)
        .all()
        .filter((row) => row.text)
    : db
        .select({ text: schema.deletions.label, times: sql<number>`count(*)` })
        .from(schema.deletions)
        .where(deletionSince)
        .groupBy(schema.deletions.label)
        .orderBy(desc(sql`count(*)`))
        .limit(LIST_LIMIT)
        .all();

  const totalDeletions = deleteTotals?.total ?? 0;
  const quickDeletions = deleteTotals?.quick ?? 0;
  const ratePct = presses > 0 ? Math.round((totalDeletions / presses) * 100) : 0;
  const quickRatePct =
    totalDeletions > 0 ? Math.round((quickDeletions / totalDeletions) * 100) : 0;

  const buttonScalePct =
    db
      .select({ pct: schema.profile.buttonScalePct })
      .from(schema.profile)
      .where(eq(schema.profile.id, 1))
      .get()?.pct ?? null;

  const pictures = pictureMap([
    ...topWords.map((row) => row.text),
    ...topDeleted.map((row) => row.text),
    ...added.recent.map((row) => row.term),
  ]);

  const withPictures = (rows: DashboardCount[]): DashboardCount[] =>
    rows.map((row) => ({ ...row, imageUrl: pictures[row.text.toLowerCase()] }));

  const topWord = withPictures(topWords)[0] ?? null;

  return {
    range,
    fromEvents,
    summary: {
      presses,
      sentences: sentenceCount,
      sessions,
      topWord,
    },
    topWords: withPictures(topWords),
    topSentences: topSentences,
    byTime,
    bySituation,
    byLocation,
    added: {
      total: added.total,
      recent: added.recent.map((row) => ({
        ...row,
        imageUrl: pictures[row.term.toLowerCase()],
      })),
    },
    deletions: {
      total: totalDeletions,
      clears: deleteTotals?.clears ?? 0,
      quick: quickDeletions,
      topDeleted: withPictures(topDeleted),
      wordsAdded: presses,
      ratePct,
      quickRatePct,
      buttonScalePct,
      suggestBigger:
        presses >= MIN_PRESSES_FOR_ADVICE && ratePct >= HIGH_DELETE_RATE_PCT && quickRatePct >= 50,
      quickDeleteMs: QUICK_DELETE_MS,
    },
  };
}

function sinceClause(range: DashboardRange, column: unknown) {
  if (range === '7d') return sql`datetime(${column}) >= datetime('now', '-7 days')`;
  if (range === '30d') return sql`datetime(${column}) >= datetime('now', '-30 days')`;
  return sql`1 = 1`;
}

function notIgnored() {
  return sql`lower(coalesce(${schema.analyticsEvents.label}, '')) not in (${sql.join(
    IGNORE_SENTENCES.map((s) => sql`${s}`),
    sql`, `,
  )})`;
}

function notIgnoredUtterance() {
  return sql`lower(${schema.utterances.text}) not in (${sql.join(
    IGNORE_SENTENCES.map((s) => sql`${s}`),
    sql`, `,
  )})`;
}

function rankedEvents(
  type: 'press' | 'speak_sentence',
  since: ReturnType<typeof sinceClause>,
): DashboardCount[] {
  const textCol = type === 'press' ? schema.analyticsEvents.term : schema.analyticsEvents.label;
  return db
    .select({
      text: sql<string>`coalesce(${textCol}, ${schema.analyticsEvents.label})`,
      times: sql<number>`count(*)`,
    })
    .from(schema.analyticsEvents)
    .where(and(eq(schema.analyticsEvents.type, type), since, notIgnored()))
    .groupBy(sql`coalesce(${textCol}, ${schema.analyticsEvents.label})`)
    .orderBy(desc(sql`count(*)`))
    .limit(LIST_LIMIT)
    .all()
    .filter((row) => row.text);
}

function rankedUtterances(
  kind: 'word' | 'sentence',
  since: ReturnType<typeof sinceClause>,
): DashboardCount[] {
  return db
    .select({ text: schema.utterances.text, times: sql<number>`count(*)` })
    .from(schema.utterances)
    .where(and(sql`${schema.utterances.kind} = ${kind}`, since, notIgnoredUtterance()))
    .groupBy(schema.utterances.text)
    .orderBy(desc(sql`count(*)`))
    .limit(LIST_LIMIT)
    .all();
}

function groupedField(
  column: typeof schema.analyticsEvents.situation | typeof schema.analyticsEvents.location,
  since: ReturnType<typeof sinceClause>,
): DashboardCount[] {
  return db
    .select({ text: column, times: sql<number>`count(*)` })
    .from(schema.analyticsEvents)
    .where(and(eq(schema.analyticsEvents.type, 'press'), since, sql`${column} is not null`))
    .groupBy(column)
    .orderBy(desc(sql`count(*)`))
    .limit(LIST_LIMIT)
    .all()
    .filter((row): row is DashboardCount => Boolean(row.text))
    .map((row) => ({ text: String(row.text), times: row.times }));
}

function folderLabel(folderId: string): string {
  const bare = folderId.replace(/^(core|folder):/, '');
  if (bare === PHRASES_FOLDER_ID) return PHRASES_TITLE;
  return CORE_FOLDERS[bare]?.name ?? (bare.replace(/[-_]/g, ' ') || folderId);
}

function addedButtons(usedTerms: Set<string>) {
  const learned = db
    .select({
      term: schema.folderWords.term,
      folderId: schema.folderWords.folderId,
      location: schema.folderWords.location,
      createdAt: schema.folderWords.createdAt,
    })
    .from(schema.folderWords)
    .all();

  const onBoards = db
    .select({
      term: schema.boardItems.label,
      boardName: schema.boards.name,
      createdAt: schema.boards.createdAt,
    })
    .from(schema.boardItems)
    .leftJoin(schema.boards, eq(schema.boardItems.boardId, schema.boards.id))
    .all();

  const recent = [
    ...learned.map((row) => ({
      term: row.term,
      where: folderLabel(row.folderId),
      location: row.location,
      addedAt: row.createdAt ?? '',
      used: usedTerms.has(row.term.toLowerCase()),
    })),
    ...onBoards.map((row) => ({
      term: row.term,
      where: row.boardName ?? 'a situation',
      location: null as string | null,
      addedAt: row.createdAt ?? '',
      used: usedTerms.has(row.term.toLowerCase()),
    })),
  ].sort((a, b) => String(b.addedAt).localeCompare(String(a.addedAt)));

  return { total: recent.length, recent: recent.slice(0, LIST_LIMIT) };
}

function pictureMap(terms: string[]): Record<string, string> {
  const unique = [...new Set(terms.map((term) => term.trim().toLowerCase()).filter(Boolean))];
  if (unique.length === 0) return {};

  const out: Record<string, string> = {};
  const library = db
    .select({ term: schema.wordSymbols.term, imageUrl: schema.wordSymbols.imageUrl })
    .from(schema.wordSymbols)
    .where(inArray(schema.wordSymbols.term, unique))
    .all();
  for (const row of library) out[row.term.toLowerCase()] = row.imageUrl;

  const overrides = db
    .select({ term: schema.symbolOverrides.term, imageUrl: schema.symbolOverrides.imageUrl })
    .from(schema.symbolOverrides)
    .where(inArray(schema.symbolOverrides.term, unique))
    .all();
  for (const row of overrides) out[row.term.toLowerCase()] = row.imageUrl;

  return out;
}
