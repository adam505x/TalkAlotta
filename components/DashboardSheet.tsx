'use client';

import type { DashboardRange, DashboardStats } from '@/lib/analytics-types';

const RANGES: { id: DashboardRange; label: string }[] = [
  { id: '7d', label: 'This week' },
  { id: '30d', label: 'This month' },
  { id: 'all', label: 'All time' },
];

const TIME_LABEL: Record<string, string> = {
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
  night: 'Night',
};

export function DashboardSheet({
  stats,
  range,
  onRange,
  onPinPhrase,
  pinning,
}: {
  stats: DashboardStats | null;
  range: DashboardRange;
  onRange: (next: DashboardRange) => void;
  onPinPhrase: (phrase: string) => void;
  pinning: string | null;
}) {
  const empty =
    stats &&
    stats.summary.presses === 0 &&
    stats.summary.sentences === 0 &&
    stats.added.total === 0 &&
    stats.deletions.total === 0;

  return (
    <div className="dash">
      <div className="dash-range" role="tablist" aria-label="Time range">
        {RANGES.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={range === item.id}
            className={range === item.id ? 'dash-range__btn is-on' : 'dash-range__btn'}
            onClick={() => onRange(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {!stats ? (
        <p className="dash-empty">Reading how the board is being used…</p>
      ) : empty ? (
        <p className="dash-empty">
          Nothing here yet. After some buttons are pressed, this page will show
          what is used most, when, and whether anything looks hard to hit.
        </p>
      ) : (
        <>
          {stats.deletions.suggestBigger ? (
            <div className="dash-advice">
              <p>
                Words are being taken back right after they are pressed, which
                usually means the wrong button is being hit. Try making the
                buttons bigger
                {stats.deletions.buttonScalePct
                  ? ` than the current ${stats.deletions.buttonScalePct}%`
                  : ''}
                .
              </p>
            </div>
          ) : null}

          <div className="dash-cards">
            <SummaryCard
              kicker="Most used"
              value={stats.summary.topWord?.text ?? '—'}
              detail={
                stats.summary.topWord
                  ? `${stats.summary.topWord.times} times`
                  : 'No presses yet'
              }
              imageUrl={stats.summary.topWord?.imageUrl}
            />
            <SummaryCard
              kicker="Sentences said"
              value={String(stats.summary.sentences)}
              detail={stats.fromEvents ? 'From the sentence bar' : 'From speech so far'}
            />
            <SummaryCard
              kicker="Button presses"
              value={String(stats.summary.presses)}
              detail={
                stats.deletions.total > 0
                  ? `${stats.deletions.ratePct}% taken back`
                  : 'None taken back'
              }
            />
          </div>

          <section className="dash-section">
            <h3 className="sheet__label">Most used buttons</h3>
            {stats.topWords.length === 0 ? (
              <p className="dash-empty">No button presses in this period.</p>
            ) : (
              <RankedList rows={stats.topWords} />
            )}
          </section>

          <section className="dash-section">
            <h3 className="sheet__label">Common phrases</h3>
            {stats.topSentences.length === 0 ? (
              <p className="dash-empty">
                No phrases yet. Build one and tap the sentence bar to say it.
              </p>
            ) : (
              <ol className="dash-sentences">
                {stats.topSentences.map((row) => (
                  <li key={row.text}>
                    <span>{row.text}</span>
                    <span className="dash-phrase-actions">
                      <strong>{row.times}</strong>
                      {row.pinned ? (
                        <span className="dash-pinned">On the board</span>
                      ) : (
                        <button
                          type="button"
                          className="dash-pin"
                          disabled={pinning !== null}
                          onClick={() => onPinPhrase(row.text)}
                        >
                          {pinning === row.text ? 'Adding…' : 'Make a button'}
                        </button>
                      )}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className="dash-section">
            <h3 className="sheet__label">When they talk</h3>
            {stats.byTime.every((row) => row.times === 0) ? (
              <p className="dash-empty">Not enough use yet to see a pattern by time of day.</p>
            ) : (
              <RankedList
                rows={stats.byTime
                  .filter((row) => row.times > 0)
                  .map((row) => ({
                    text: TIME_LABEL[row.bucket] ?? row.bucket,
                    times: row.times,
                  }))}
              />
            )}
          </section>

          {stats.bySituation.length > 0 || stats.byLocation.length > 0 ? (
            <section className="dash-section">
              <h3 className="sheet__label">Where and what</h3>
              {stats.bySituation.length > 0 ? (
                <>
                  <p className="dash-caption">By situation</p>
                  <RankedList rows={stats.bySituation} />
                </>
              ) : null}
              {stats.byLocation.length > 0 ? (
                <>
                  <p className="dash-caption">By place</p>
                  <RankedList rows={stats.byLocation} />
                </>
              ) : null}
            </section>
          ) : null}

          <section className="dash-section">
            <h3 className="sheet__label">Buttons you added ({stats.added.total})</h3>
            {stats.added.recent.length === 0 ? (
              <p className="dash-empty">
                None yet. Turn on editing and use + Add to put a word on a folder.
              </p>
            ) : (
              <ul className="dash-added">
                {stats.added.recent.map((row) => (
                  <li key={`${row.where}-${row.term}-${row.addedAt}`}>
                    {row.imageUrl ? (
                      <img src={row.imageUrl} alt="" className="dash-pic" />
                    ) : (
                      <span className="dash-pic dash-pic--empty" />
                    )}
                    <span className="dash-added__text">
                      <strong>{row.term}</strong>
                      <span>
                        {row.where}
                        {row.location ? ` · at ${row.location}` : ''}
                        {row.used ? '' : ' · not used yet'}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="dash-section">
            <h3 className="sheet__label">Words taken back</h3>
            {stats.deletions.total === 0 ? (
              <p className="dash-empty">Nothing deleted in this period.</p>
            ) : (
              <>
                <p className="dash-caption">
                  {stats.deletions.total} of {stats.deletions.wordsAdded} presses
                  {stats.deletions.wordsAdded > 0 ? ` · ${stats.deletions.ratePct}%` : ''}.{' '}
                  {stats.deletions.quick} taken back within{' '}
                  {Math.round(stats.deletions.quickDeleteMs / 1000)} seconds.
                </p>
                {stats.deletions.topDeleted.length > 0 ? (
                  <RankedList rows={stats.deletions.topDeleted} />
                ) : null}
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function SummaryCard({
  kicker,
  value,
  detail,
  imageUrl,
}: {
  kicker: string;
  value: string;
  detail: string;
  imageUrl?: string;
}) {
  return (
    <div className="dash-card">
      <p className="dash-card__kicker">{kicker}</p>
      <p className="dash-card__value">
        {imageUrl ? <img src={imageUrl} alt="" className="dash-pic" /> : null}
        <span className="truncate">{value}</span>
      </p>
      <p className="dash-card__detail">{detail}</p>
    </div>
  );
}

function RankedList({
  rows,
}: {
  rows: { text: string; times: number; imageUrl?: string }[];
}) {
  const max = Math.max(1, ...rows.map((row) => row.times));
  return (
    <ol className="dash-rank">
      {rows.map((row) => (
        <li key={row.text}>
          {row.imageUrl ? (
            <img src={row.imageUrl} alt="" className="dash-pic" />
          ) : (
            <span className="dash-pic dash-pic--empty" aria-hidden="true" />
          )}
          <div className="dash-rank__main">
            <div className="dash-rank__label">
              <span>{row.text}</span>
              <strong>{row.times}</strong>
            </div>
            <div className="dash-bar" aria-hidden="true">
              <span style={{ width: `${Math.round((row.times / max) * 100)}%` }} />
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
