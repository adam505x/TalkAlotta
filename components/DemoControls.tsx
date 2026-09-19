'use client';

import {
  LOCATION_BUCKETS,
  TIME_BUCKETS,
  type LocationBucket,
  type TimeBucket,
} from '@/lib/core-words';

/**
 * Demo controls, shown inside the situation popup.
 *
 * FOR DEMONSTRATION ONLY. In real use the time comes from the clock and the
 * location would come from the device.
 *
 * It sits here, next to the suggestions, because that is the whole point of it:
 * moving the time or the place changes the four suggested situations in front of
 * you. It is not on the board, because a communicator has no reason to pretend it
 * is a different time of day.
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
  const effective = timeBucket ?? actualBucket;
  const timeIndex = Math.max(0, TIME_BUCKETS.indexOf(effective));
  const overridden = timeBucket !== null || location !== null;

  return (
    <div className="demo-inline">
      <p className="sheet__label">
        Demo only — pretend it is a different time or place
      </p>

      <label className="flex flex-col gap-1">
        <input
          type="range"
          min={0}
          max={TIME_BUCKETS.length - 1}
          step={1}
          value={timeIndex}
          onChange={(event) =>
            onChange({ timeBucket: TIME_BUCKETS[Number(event.target.value)], location })
          }
          className="min-h-[44px]"
          aria-label="Time of day"
        />
        <span className="text-sm font-bold">
          {TIME_LABELS[effective]}
          {timeBucket === null ? ' (the real time)' : ''}
        </span>
      </label>

      <div className="sheet__chips">
        {LOCATION_BUCKETS.map((place) => (
          <button
            key={place}
            type="button"
            className={`chip${location === place ? ' chip--on' : ''}`}
            onClick={() => onChange({ timeBucket, location: location === place ? null : place })}
          >
            {PLACE_LABELS[place]}
          </button>
        ))}
      </div>

      {overridden ? (
        <button
          type="button"
          className="sheet__cancel"
          onClick={() => onChange({ timeBucket: null, location: null })}
        >
          Back to the real time, no place
        </button>
      ) : null}
    </div>
  );
}
