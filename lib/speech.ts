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
let unlocked = false;

/** 30ms of silence, used to unlock audio playback on the first touch. */
const SILENCE =
  'data:audio/mpeg;base64,SUQzBAAAAAABEVRYWFgAAAAtAAADY29tbWVudABCaWdTb3VuZEJhbmsuY29tAFRYWFgAAAASAAADc2VtaXRvbmUAMAAA//uQZAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAACcQCA';

function element(): HTMLAudioElement {
  if (!audioEl) {
    audioEl = new Audio();
    audioEl.preload = 'auto';
    // Keep playback inline on iOS rather than opening a fullscreen player.
    audioEl.setAttribute('playsinline', '');
  }
  return audioEl;
}

/**
 * Call this from the first real user gesture. Safe to call repeatedly.
 */
export function unlockAudio(): void {
  if (unlocked) return;
  unlocked = true;
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

function remember(text: string, url: string) {
  if (memory.size >= MEMORY_LIMIT) {
    const oldest = memory.keys().next().value;
    if (oldest) {
      const stale = memory.get(oldest);
      if (stale) URL.revokeObjectURL(stale);
      memory.delete(oldest);
    }
  }
  memory.set(text, url);
}

function browserVoice(text: string): boolean {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return false;
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95;
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

export interface SpeakResult {
  spoken: boolean;
  via: 'elevenlabs' | 'browser' | 'none';
  cached?: boolean;
}

export async function speak(
  text: string,
  options: { kind?: 'word' | 'sentence'; boardId?: number } = {},
): Promise<SpeakResult> {
  const clean = text.trim();
  if (!clean) return { spoken: false, via: 'none' };

  const kind = options.kind ?? 'word';
  const el = element();

  // Already fetched this exact text: play it straight away.
  const held = memory.get(clean);
  if (held) {
    try {
      el.pause();
      el.src = held;
      el.currentTime = 0;
      await el.play();
      void logUtterance(clean, kind, options.boardId);
      return { spoken: true, via: 'elevenlabs', cached: true };
    } catch {
      /* fall through to a fresh fetch */
    }
  }

  try {
    const response = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: clean, kind, boardId: options.boardId }),
    });

    if (!response.ok) {
      // Server could not speak: use the browser voice so something is said.
      const ok = browserVoice(clean);
      void logUtterance(clean, kind, options.boardId);
      return { spoken: ok, via: ok ? 'browser' : 'none' };
    }

    const cached = response.headers.get('x-tts-cached') === '1';
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    remember(clean, url);

    el.pause();
    el.src = url;
    el.currentTime = 0;
    await el.play();
    return { spoken: true, via: 'elevenlabs', cached };
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
