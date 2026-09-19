'use client';

import { useState } from 'react';
import {
  LOCATION_BUCKETS,
  TIME_BUCKETS,
  type LocationBucket,
  type TimeBucket,
} from '@/lib/core-words';

/**
 * Demo controls, bottom right.
 *
 * FOR DEMONSTRATION ONLY. In real use the time comes from the clock and the
 * location would come from the device. Nobody waits until bedtime to see that the
 * board changes at bedtime, so this forces the context on demand.
 *
 * Changing either one reassembles the board, so the bottom folders and the
 * suggested situations both move.
 */

const TIME_LABELS: Record<TimeBucket, string> = {
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
  night: 'Night',
};

const PLACE_LABELS: Record<LocationBucket, string> = {
  home: 'Home',
  school: 'School',
  park: 'Park',
  shop: 'Shop',
  restaurant: 'Restaurant',
};

export function DemoControls({
  timeBucket,
  location,
  actualBucket,
  onChange,
}: {
  timeBucket: TimeBucket | null;
  location: LocationBucket | null;
  actualBucket: TimeBucket;
  onChange: (next: { timeBucket: TimeBucket | null; location: LocationBucket | null }) => void;
}) {
  const [open, setOpen] = useState(false);
  const effective = timeBucket ?? actualBucket;
  const timeIndex = TIME_BUCKETS.indexOf(effective);

  return (
    <>
      <button
        type="button"
        className="demo-fab"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Demo controls for time of day and location"
      >
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          <circle
            cx="12"
            cy="12"
            r="9"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          />
          <path
            d="M12 7v5l3.5 2"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
        {TIME_LABELS[effective]}
        {location ? ` · ${PLACE_LABELS[location]}` : ''}
      </button>

      {open ? (
        <div className="demo-panel" role="dialog" aria-label="Demo controls">
          <div className="flex items-center justify-between gap-3">
            <p className="sheet__label">Demo controls</p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close demo controls"
              className="min-h-[44px] px-2 text-lg font-bold"
              style={{ color: '#6c727b' }}
            >
              &#10005;
            </button>
          </div>

          <p className="text-xs font-semibold" style={{ color: '#6c727b' }}>
            For showing the board adapting. Normally the clock and the device decide
            these.
          </p>

          <label className="flex flex-col gap-1.5">
            <span className="sheet__label">Time of day</span>
            <input
              type="range"
              min={0}
              max={TIME_BUCKETS.length - 1}
              step={1}
              value={timeIndex < 0 ? 0 : timeIndex}
              onChange={(event) =>
                onChange({ timeBucket: TIME_BUCKETS[Number(event.target.value)], location })
              }
              className="min-h-[44px]"
              aria-label="Time of day"
            />
            <span className="text-sm font-bold">{TIME_LABELS[effective]}</span>
          </label>

          <div className="flex flex-col gap-1.5">
            <span className="sheet__label">Where they are</span>
            <div className="sheet__chips">
              {LOCATION_BUCKETS.map((place) => (
                <button
                  key={place}
                  type="button"
                  className={`chip${location === place ? ' chip--on' : ''}`}
                  onClick={() =>
                    onChange({ timeBucket, location: location === place ? null : place })
                  }
                >
                  {PLACE_LABELS[place]}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            className="sheet__cancel"
            onClick={() => onChange({ timeBucket: null, location: null })}
          >
            Back to the real time, no location
          </button>
        </div>
      ) : null}
    </>
  );
}
