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
 *
 * THERE IS NO VOLUME CONTROL HERE, AND THERE MUST NOT BE ONE.
 *
 * iOS makes HTMLMediaElement.volume read-only, because loudness belongs to the
 * hardware buttons. The only way to honour an in-app volume slider is to pass
 * the audio through a Web Audio GainNode — and calling createMediaElementSource
 * moves playback off the media channel, which ignores the Ring/Silent switch,
 * onto Web Audio output, which does not. An iPad on silent then says nothing at
 * all, and an iPad whose stored volume was anything under full went quiet a
 * moment into the first clip as the graph was built around it.
 *
 * That is a bad trade for any app and an indefensible one for a board whose
 * entire job is to speak. The element is left alone, and the volume buttons on
 * the side of the iPad do the job they already do well.
 */

let audioEl: HTMLAudioElement | null = null;
let unlocked = false;

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

/**
 * Tell iOS this page plays media, not sound effects.
 *
 * WebKit picks an audio session category from what a page plays, and the
 * default one is silenced by the Ring/Silent switch and follows the ringer
 * volume rather than the media volume. For a board whose entire purpose is to
 * speak, that default is wrong: an iPad on silent would simply not talk.
 *
 * Safari 16.4 and later let a page say so outright. Older iPads have no such
 * API and rely on the plain media element alone, which is the other half of why
 * nothing here ever routes it through Web Audio.
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
 * Call this from the first real user gesture. Safe to call repeatedly.
 */
export function unlockAudio(): void {
  if (unlocked) return;
  unlocked = true;
  claimPlaybackSession();
  const el = element();
  try {
    el.src = SILENCE;
    const played = el.play();
    if (played && typeof played.catch === 'function') {
      played.catch(() => {
        /* A blocked unlock is not fatal; the fallback voice still works. */
      });
    }
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
    utterance.volume = 1;
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
  el.pause();
  el.src = url;
  el.playbackRate = 1;
  el.volume = 1;
  el.currentTime = 0;
  await el.play();
}

/**
 * The line the voice reads when a caregiver taps "Hear the voice".
 *
 * It speaks as the communicator, because that is whose voice is being chosen.
 * Hearing "my name is Josie" in the voice Josie will actually use is the whole
 * point of the preview; hearing the app introduce itself tells the caregiver
 * nothing about whether it suits her.
 *
 * Falls back to the app's own name only when there is no name yet, which in
 * setup means someone went back and cleared it, and in Settings means a profile
 * that never ran setup.
 */
export function voicePreviewLine(name: string | null | undefined): string {
  const who = (name ?? '').trim();
  return `Hello, my name is ${who || 'TalkAlotta'}.`;
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
