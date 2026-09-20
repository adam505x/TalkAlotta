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
 * Gain at 100% volume. Above 1 because HTMLAudioElement.volume cannot go past 1,
 * and Aura clips (especially short words) run quiet.
 */
const GAIN_AT_FULL = 3.2;

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

/** Update playback loudness (0–100). Safe to call before audio is unlocked. */
export function setSpeechVolume(percent: number): void {
  volumePercent = Math.max(0, Math.min(100, Math.round(percent)));
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
  const el = element();
  ensureGain();
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
  ensureGain();
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
  options: { kind?: 'word' | 'sentence'; boardId?: number } = {},
): Promise<SpeakResult> {
  const clean = text.trim();
  if (!clean) return { spoken: false, via: 'none' };

  const kind = options.kind ?? 'word';
  // v3: pronunciation fixes for silent Aura words (e.g. it → itt).
  const memoryKey = `v3:${kind}:${clean}`;
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
      body: JSON.stringify({ text: clean, kind, boardId: options.boardId }),
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
