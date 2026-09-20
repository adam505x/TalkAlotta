import crypto from 'node:crypto';
import { timeOfDay, type TimeBucket } from './core-words';

/**
 * What the board knows about the moment it is being used in.
 *
 * Three of these are sensed in real use and forced by the demo control: the time
 * of day, where the person is, and the weather. The fourth is typed, because
 * knowing someone is at school does not tell you they are in an art class.
 */

export type Weather = 'sunny' | 'raining' | 'cold' | 'hot' | 'snowy';

export const WEATHERS: Weather[] = ['sunny', 'raining', 'cold', 'hot', 'snowy'];

export const WEATHER_LABELS: Record<Weather, string> = {
  sunny: 'Sunny',
  raining: 'Raining',
  cold: 'Cold',
  hot: 'Hot',
  snowy: 'Snowy',
};

/** Quick presets for the demo control. Any other place can be typed instead. */
export const LOCATION_PRESETS = ['home', 'school', 'park', 'shop', 'restaurant'];

export interface MomentContext {
  timeBucket: TimeBucket;
  /** Free text: "school", or "Chick-fil-A". Null means unknown. */
  location: string | null;
  weather: Weather | null;
  /** A typed activity, such as "art class". Null means none. */
  situation: string | null;
}

export function readContext(params: URLSearchParams): MomentContext {
  const bucket = params.get('timeBucket');
  const weather = params.get('weather');
  const location = (params.get('location') ?? '').trim();
  const situation = (params.get('situation') ?? '').trim();

  return {
    timeBucket: (['morning', 'afternoon', 'evening', 'night'] as TimeBucket[]).includes(
      bucket as TimeBucket,
    )
      ? (bucket as TimeBucket)
      : timeOfDay(),
    location: location ? location.slice(0, 60) : null,
    weather: WEATHERS.includes(weather as Weather) ? (weather as Weather) : null,
    situation: situation ? situation.slice(0, 200) : null,
  };
}

/**
 * One key per distinct moment. The same place at the same time of day in the same
 * weather reuses the words that were generated the first time, so the board is
 * stable on a return visit and costs nothing to show again.
 */
export function contextKey(context: MomentContext): string {
  const parts = [
    context.timeBucket,
    (context.location ?? '').toLowerCase(),
    context.weather ?? '',
    (context.situation ?? '').toLowerCase(),
  ].join('|');
  return crypto.createHash('sha256').update(parts).digest('hex').slice(0, 32);
}

/** A short line for the caregiver, saying what the board is currently reading. */
export function describeContext(context: MomentContext): string {
  const bits: string[] = [context.timeBucket];
  if (context.location) bits.push(context.location);
  if (context.weather) bits.push(context.weather);
  if (context.situation) bits.push(context.situation);
  return bits.join(' · ');
}
