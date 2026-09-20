'use client';

import { useState } from 'react';
import { TIME_BUCKETS, type TimeBucket } from '@/lib/core-words';
import { LOCATION_PRESETS, WEATHERS, WEATHER_LABELS, type Weather } from '@/lib/context';

/**
 * The demo control: a small gear in the bottom right.
 *
 * FOR DEMONSTRATION ONLY. In real use the time comes from the clock and the
 * location and weather from the device. Nobody waits for rain to show that the
 * board offers an umbrella when it rains, so this forces all three on demand.
 *
 * It is a plain gear rather than the app's own mark, because it is the one
 * control on screen that belongs to whoever is demonstrating rather than to the
 * communicator, and it should not look like part of the product.
 */

const TIME_LABELS: Record<TimeBucket, string> = {
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
  night: 'Night',
};

/** A small mark per step, so the slider reads as a day passing. */
function TimeMark({ bucket, on }: { bucket: TimeBucket; on: boolean }) {
  const stroke = on ? 'var(--teal)' : '#b6bac0';
  const common = { fill: 'none', stroke, strokeWidth: 1.8, strokeLinecap: 'round' as const };

  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      {bucket === 'morning' ? (
        // Sunrise: sun over a horizon.
        <>
          <circle cx="12" cy="13" r="4" {...common} />
          <path d="M12 5v2M5 13H3M21 13h-2M6.5 7.5l1.4 1.4M17.5 7.5l-1.4 1.4" {...common} />
          <path d="M3 19h18" {...common} strokeWidth={2.2} />
        </>
      ) : null}
      {bucket === 'afternoon' ? (
        // Full sun, high.
        <>
          <circle cx="12" cy="12" r="4.4" {...common} />
          <path
            d="M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M18.4 5.6l-1.6 1.6M7.2 16.8l-1.6 1.6"
            {...common}
          />
        </>
      ) : null}
      {bucket === 'evening' ? (
        // Sunset: sun dipping below the horizon.
        <>
          <path d="M8 14a4 4 0 0 1 8 0" {...common} />
          <path d="M12 4v2M4 14H2M22 14h-2M6.5 8.5l1.4 1.4M17.5 8.5l-1.4 1.4" {...common} />
          <path d="M3 19h18" {...common} strokeWidth={2.2} />
          <path d="M9 22h2M13 22h2" {...common} />
        </>
      ) : null}
      {bucket === 'night' ? (
        // Crescent moon and a star.
        <>
          <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" {...common} />
          <path d="M17 4.5l.7 1.6 1.6.7-1.6.7-.7 1.6-.7-1.6-1.6-.7 1.6-.7z" {...common} />
        </>
      ) : null}
    </svg>
  );
}

export interface DemoState {
  timeBucket: TimeBucket | null;
  location: string | null;
  weather: Weather | null;
}

export function DemoControls({
  state,
  actualBucket,
  busy,
  onChange,
}: {
  state: DemoState;
  actualBucket: TimeBucket;
  busy?: boolean;
  onChange: (next: DemoState) => void;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');

  const effectiveTime = state.timeBucket ?? actualBucket;
  const timeIndex = Math.max(0, TIME_BUCKETS.indexOf(effectiveTime));
  const set = (patch: Partial<DemoState>) => onChange({ ...state, ...patch });

  return (
    <>
      <button
        type="button"
        className="demo-fab"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Demo controls: time of day, place and weather"
        title="Demo controls"
      >
        <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
          <circle
            cx="12"
            cy="12"
            r="3.2"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          />
          <path
            d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 9 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
        </svg>
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

          <p className="text-xs" style={{ color: '#6c727b' }}>
            Pretend it is a different moment. The four folders refill to match.
            {busy ? ' Working...' : ''}
          </p>

          {/* Time of day. The label sits above the slider, and the marks below it
              read left to right as a day passing. */}
          <div className="flex flex-col gap-1">
            <span className="sheet__label">Time of day</span>
            <span className="text-sm" style={{ color: 'var(--ink)' }}>
              {TIME_LABELS[effectiveTime]}
              {state.timeBucket === null ? ' (the real time)' : ''}
            </span>
            <input
              type="range"
              min={0}
              max={TIME_BUCKETS.length - 1}
              step={1}
              value={timeIndex}
              onChange={(event) => set({ timeBucket: TIME_BUCKETS[Number(event.target.value)] })}
              className="min-h-[36px]"
              aria-label="Time of day"
            />
            <div className="flex items-center justify-between px-0.5">
              {TIME_BUCKETS.map((bucket) => (
                <button
                  key={bucket}
                  type="button"
                  onClick={() => set({ timeBucket: bucket })}
                  aria-label={TIME_LABELS[bucket]}
                  title={TIME_LABELS[bucket]}
                  className="grid h-8 w-8 place-items-center rounded-lg"
                  style={{ background: effectiveTime === bucket ? '#eaf3f3' : 'transparent' }}
                >
                  <TimeMark bucket={bucket} on={effectiveTime === bucket} />
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="sheet__label">Where they are</span>
            <div className="sheet__chips">
              {LOCATION_PRESETS.map((place) => (
                <button
                  key={place}
                  type="button"
                  className={`chip${state.location === place ? ' chip--on' : ''}`}
                  onClick={() => set({ location: state.location === place ? null : place })}
                >
                  {place}
                </button>
              ))}
            </div>
            {/* Anywhere specific can be typed: the folders fill from the actual
                place, so "Chick-fil-A" gets a server and a burger. */}
            <form
              className="flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (typed.trim()) set({ location: typed.trim() });
              }}
            >
              <input
                className="chip flex-1"
                style={{ background: '#fff', textAlign: 'left' }}
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
                placeholder="or type a place"
                maxLength={60}
                aria-label="Type a place"
              />
              <button type="submit" className="chip chip--on">
                Set
              </button>
            </form>
            {state.location && !LOCATION_PRESETS.includes(state.location) ? (
              <span className="text-xs font-bold">At: {state.location}</span>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="sheet__label">Weather</span>
            <div className="sheet__chips">
              {WEATHERS.map((w) => (
                <button
                  key={w}
                  type="button"
                  className={`chip${state.weather === w ? ' chip--on' : ''}`}
                  onClick={() => set({ weather: state.weather === w ? null : w })}
                >
                  {WEATHER_LABELS[w]}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            className="sheet__cancel"
            onClick={() => {
              setTyped('');
              onChange({ timeBucket: null, location: null, weather: null });
            }}
          >
            Back to the real time, no place or weather
          </button>
        </div>
      ) : null}
    </>
  );
}
