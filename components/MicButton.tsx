'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Wraps a text field so it can be spoken into instead of typed.
 *
 * Tap to start, tap to stop, rather than press-and-hold. A caregiver doing this
 * has a child in the other hand; a finger slipping mid-sentence and silently
 * losing the recording is worse than needing a second tap. It also stops on its
 * own after MAX_SECONDS so a forgotten recording cannot run.
 *
 * The field is passed in as a child so the box the microphone is positioned
 * against holds the field and nothing else. Keep the status lines outside that
 * box: the button is centred on the box's height, so anything that grows inside
 * it drags the button down off the field.
 *
 * Recording needs a secure context - https or localhost. On a laptop running
 * `npm run dev` that is fine; opening the dev server from a phone over the LAN
 * is not, and the button says so rather than failing silently.
 */

const MAX_SECONDS = 15;

type State = 'idle' | 'recording' | 'thinking' | 'error';

export function MicButton({
  onTranscript,
  disabled,
  children,
}: {
  onTranscript: (text: string) => void;
  disabled?: boolean;
  /** The field the microphone sits inside. */
  children: ReactNode;
}) {
  const [state, setState] = useState<State>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const stopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimers = () => {
    if (stopTimer.current) { clearTimeout(stopTimer.current); stopTimer.current = null; }
    if (tickTimer.current) { clearInterval(tickTimer.current); tickTimer.current = null; }
  };

  useEffect(() => () => {
    clearTimers();
    recorderRef.current?.stream.getTracks().forEach((t) => t.stop());
  }, []);

  const send = useCallback(
    async (blob: Blob) => {
      setState('thinking');
      try {
        const response = await fetch('/api/stt', {
          method: 'POST',
          headers: { 'Content-Type': blob.type || 'audio/webm' },
          body: blob,
        });
        const body = (await response.json()) as { transcript?: string; error?: string };
        if (!response.ok || !body.transcript) {
          throw new Error(body.error || 'Nothing was heard.');
        }
        onTranscript(body.transcript);
        setState('idle');
        setMessage(null);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'That did not work. Type it instead.');
        setState('error');
      }
    },
    [onTranscript],
  );

  const stop = useCallback(() => {
    clearTimers();
    setSeconds(0);
    const recorder = recorderRef.current;
    if (recorder && recorder.state === 'recording') recorder.stop();
  }, []);

  const start = useCallback(async () => {
    setMessage(null);

    if (typeof window !== 'undefined' && window.isSecureContext === false) {
      setMessage('Speaking needs a secure page (https). Type it instead.');
      setState('error');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setMessage('This browser cannot record. Type it instead.');
      setState('error');
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setMessage('Microphone access was blocked. Type it instead.');
      setState('error');
      return;
    }

    const recorder = new MediaRecorder(stream);
    recorderRef.current = recorder;
    chunksRef.current = [];

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
      chunksRef.current = [];
      if (blob.size === 0) {
        setMessage('Nothing was recorded. Try again.');
        setState('error');
        return;
      }
      void send(blob);
    };

    recorder.start();
    setState('recording');
    setSeconds(0);
    tickTimer.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    stopTimer.current = setTimeout(stop, MAX_SECONDS * 1000);
  }, [send, stop]);

  const recording = state === 'recording';
  const busy = state === 'thinking';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ position: 'relative' }}>
        {children}
        <button
          type="button"
          onClick={recording ? stop : start}
          disabled={disabled || busy}
          aria-label={recording ? 'Stop recording' : 'Say what is happening'}
          aria-pressed={recording}
          title={recording ? 'Tap to stop' : 'Tap and say what is happening'}
          style={{
            position: 'absolute',
            right: 8,
            top: '50%',
            transform: 'translateY(-50%)',
            width: 40,
            height: 40,
            borderRadius: 10,
            border: 'none',
            display: 'grid',
            placeItems: 'center',
            cursor: disabled || busy ? 'default' : 'pointer',
            background: recording ? '#c4402f' : busy ? '#e7e7df' : '#eaf3f3',
            color: recording ? '#fff' : '#0e767c',
            opacity: disabled ? 0.5 : 1,
          }}
        >
          {busy ? (
            <span style={{ fontSize: 11, fontWeight: 700 }}>...</span>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
              <rect x="9" y="2.5" width="6" height="11" rx="3" />
              <path d="M5.5 11a6.5 6.5 0 0 0 13 0" />
              <path d="M12 17.5V21" />
            </svg>
          )}
        </button>
      </div>

      {recording ? (
        <p className="text-sm font-semibold" style={{ color: '#c4402f' }} role="status">
          Listening… {MAX_SECONDS - seconds}s — tap the microphone to stop
        </p>
      ) : null}

      {busy ? (
        <p className="text-sm font-semibold" style={{ color: '#6c727b' }} role="status">
          Writing that down…
        </p>
      ) : null}

      {state === 'error' && message ? (
        <p
          className="rounded-[10px] p-3 text-sm font-bold"
          style={{ background: '#fdeae7', color: '#a62f1e' }}
          role="status"
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
