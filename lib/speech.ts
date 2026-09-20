'use client';

/**
 * Speaking, from the browser's side.
 *
 * Three things this has to get right, all of them iPad problems:
 *
 * 1. iOS only allows audio that a real user gesture started. Worse, a NEW Audio
 *    element created after an await no longer counts as gesture-initiated. So one
 *    audio element is created and unlocked on the very first touch, then reused
 *    for everything afterwards. Without this, the first press on an iPad is
 *    silent.
 *
 * 2. The browser's own speechSynthesis voice is unreliable on iOS. It is kept
 *    only as a fallback for when the server cannot produce audio, so a missing
 *    key or a dropped connection still speaks something rather than nothing.
 *
 * 3. Repeated presses must feel instant. Audio already fetched is held in memory,
 *    so pressing the same button twice never waits on the network. The server
 *    cache stops repeats costing credits; this stops them costing time.
 */

let audioEl: HTMLAudioElement | null = null;
let audioCtx: AudioContext | null = null;
let gainNode: GainNode | null = null;
let unlocked = false;

/** Caregiver-set loudness, 0–100. Default is full. */
let volumePercent = 100;

/**
 * Gain at 100% volume.
 *
 * Stays at 1. The server levels every clip to a fixed loudness with headroom, so
 * the bytes already arrive as loud as they can be without distorting. Raising
 * this would only clip them — the old multiplier existed to rescue quiet Aura
 * clips, and that is now handled before the audio is sent.
 */
const GAIN_AT_FULL = 1;

/** 30ms of silence, used to unlock audio playback on the first touch. */
const SILENCE =
  'data:audio/mpeg;base64,SUQzBAAAAAABEVRYWFgAAAAtAAADY29tbWVudABCaWdTb3VuZEJhbmsuY29tAFRYWFgAAAASAAADc2VtaXRvbmUAMAAA//uQZAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAACcQCA';

function element(): HTMLAudioElement {
  if (!audioEl) {
    audioEl = new Audio();
    audioEl.preload = 'auto';
    audioEl.volume = 1;
    audioEl.setAttribute('playsinline', '');
  }
  return audioEl;
}

function applyGain(): void {
  if (!gainNode) return;
  const pct = Math.max(0, Math.min(100, volumePercent)) / 100;
  gainNode.gain.value = pct * GAIN_AT_FULL;
}

/**
 * Tell iOS this page plays media, not sound effects.
 *
 * WebKit picks an audio session category from what a page plays, and the
 * default one is silenced by the Ring/Silent switch and follows the ringer
 * volume rather than the media volume. For a board whose entire purpose is to
 * speak, that default is wrong: an iPad on silent would simply not talk.
 *
 * Safari 16.4 and later let a page say so outright. Older iPads have no such
 * API, which is why the element is also kept OFF the Web Audio graph below
 * unless something actually needs it.
 */
function claimPlaybackSession(): void {
  if (typeof navigator === 'undefined') return;
  const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
  if (!session) return;
  try {
    session.type = 'playback';
  } catch {
    /* Not settable on this browser. */
  }
}

/**
 * Build the Web Audio graph. Only called when the volume is actually turned
 * down — see the note on setSpeechVolume.
 */
function ensureGain(): void {
  if (gainNode || typeof window === 'undefined') return;
  try {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    audioCtx = new AC();
    const source = audioCtx.createMediaElementSource(element());
    gainNode = audioCtx.createGain();
    applyGain();
    source.connect(gainNode);
    gainNode.connect(audioCtx.destination);
  } catch {
    /* Web Audio unavailable — stay at element volume 1. */
  }
}

async function resumeAudioCtx(): Promise<void> {
  if (audioCtx && audioCtx.state === 'suspended') {
    try {
      await audioCtx.resume();
    } catch {
      /* ignore */
    }
  }
}

/**
 * Update playback loudness (0-100). Safe to call before audio is unlocked.
 *
 * THIS is the only thing that needs Web Audio, and it is why the graph is built
 * here rather than on the first touch.
 *
 * iOS ignores HTMLMediaElement.volume outright — it is read-only there, because
 * loudness belongs to the hardware buttons — so a caregiver volume slider can
 * only be honoured by passing the audio through a GainNode. But the moment
 * createMediaElementSource is called, playback leaves the media channel and
 * becomes Web Audio output, which on iOS is silenced by the Ring/Silent switch
 * and follows the ringer volume instead of the media volume. An iPad on silent
 * then says nothing at all.
 *
 * So the trade is made only when it buys something. At full volume the gain
 * node would multiply by exactly 1 and change nothing audible, so the element
 * is left alone and plays on the media channel like any other audio on the
 * device. Turn the volume down and the graph appears, which is the one case
 * where it is worth having.
 */
export function setSpeechVolume(percent: number): void {
  volumePercent = Math.max(0, Math.min(100, Math.round(percent)));
  if (volumePercent < 100) {
    ensureGain();
    // Dragging the slider is itself a user gesture, and a context created
    // outside one starts suspended. Resuming here means it is running before
    // the next press needs it, which is well after any gesture of its own.
    void resumeAudioCtx();
  }
  applyGain();
}

export function getSpeechVolume(): number {
  return volumePercent;
}

/**
 * Call this from the first real user gesture. Safe to call repeatedly.
 */
export function unlockAudio(): void {
  if (unlocked) return;
  unlocked = true;
  claimPlaybackSession();
  const el = element();
  // Deliberately NOT ensureGain(). See setSpeechVolume: routing the element
  // through Web Audio is what costs an iPad its sound, so it is not done until
  // there is a reason for it.
  if (volumePercent < 100) ensureGain();
  try {
    el.src = SILENCE;
    const played = el.play();
    if (played && typeof played.catch === 'function') {
      played.catch(() => {
        /* A blocked unlock is not fatal; the fallback voice still works. */
      });
    }
    void resumeAudioCtx();
  } catch {
    /* ignore */
  }
}

const memory = new Map<string, string>();
const MEMORY_LIMIT = 200;

function remember(key: string, url: string) {
  if (memory.size >= MEMORY_LIMIT) {
    const oldest = memory.keys().next().value;
    if (oldest) {
      const stale = memory.get(oldest);
      if (stale) URL.revokeObjectURL(stale);
      memory.delete(oldest);
    }
  }
  memory.set(key, url);
}

function browserVoice(text: string): boolean {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return false;
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95;
    utterance.volume = Math.max(0, Math.min(1, volumePercent / 100));
    window.speechSynthesis.speak(utterance);
    return true;
  } catch {
    return false;
  }
}

async function logUtterance(text: string, kind: 'word' | 'sentence', boardId?: number) {
  try {
    await fetch('/api/utterance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, kind, boardId }),
      keepalive: true,
    });
  } catch {
    /* Logging must never break speaking. */
  }
}

async function playClip(el: HTMLAudioElement, url: string): Promise<void> {
  if (volumePercent < 100) ensureGain();
  await resumeAudioCtx();
  el.pause();
  el.src = url;
  el.playbackRate = 1;
  el.volume = 1;
  el.currentTime = 0;
  await el.play();
}

export interface SpeakResult {
  spoken: boolean;
  via: 'deepgram' | 'browser' | 'none';
  cached?: boolean;
}

export async function speak(
  text: string,
  options: {
    kind?: 'word' | 'sentence';
    boardId?: number;
    /**
     * The sentence as separate buttons. The server puts a break between them, and
     * it cannot work that out from the joined string because a button can itself
     * be a phrase like "wash hands".
     */
    words?: string[];
  } = {},
): Promise<SpeakResult> {
  const clean = text.trim();
  if (!clean) return { spoken: false, via: 'none' };

  const kind = options.kind ?? 'word';
  // v5: clips levelled to a fixed loudness, padded both ends.
  const memoryKey = `v5:${kind}:${clean}`;
  const el = element();

  const held = memory.get(memoryKey);
  if (held) {
    try {
      await playClip(el, held);
      void logUtterance(clean, kind, options.boardId);
      return { spoken: true, via: 'deepgram', cached: true };
    } catch {
      /* fall through to a fresh fetch */
    }
  }

  try {
    const response = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: clean,
        kind,
        words: options.words,
        boardId: options.boardId,
      }),
    });

    if (!response.ok) {
      const ok = browserVoice(clean);
      void logUtterance(clean, kind, options.boardId);
      return { spoken: ok, via: ok ? 'browser' : 'none' };
    }

    const cached = response.headers.get('x-tts-cached') === '1';
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    remember(memoryKey, url);

    await playClip(el, url);
    return { spoken: true, via: 'deepgram', cached };
  } catch {
    const ok = browserVoice(clean);
    void logUtterance(clean, kind, options.boardId);
    return { spoken: ok, via: ok ? 'browser' : 'none' };
  }
}

export function stopSpeaking(): void {
  try {
    if (audioEl) audioEl.pause();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  } catch {
    /* ignore */
  }
}

/** Drop in-memory clips so a voice or pronunciation change is heard next press. */
export function clearSpeechMemory(): void {
  for (const url of memory.values()) {
    try {
      URL.revokeObjectURL(url);
    } catch {
      /* ignore */
    }
  }
  memory.clear();
}
