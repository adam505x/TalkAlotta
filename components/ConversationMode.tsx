'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { speak } from '@/lib/speech';
import type { Replies, ReplyIcons } from '@/lib/replies';

/**
 * Listens to whoever is talking TO the communicator, and puts replies on screen.
 *
 * The thing that ends most conversations with an AAC user is not the board, it
 * is the wait. Someone asks a question, the answer is four folders deep, and by
 * the time it is built the asker has answered for them. This listens to the
 * question and puts six plausible answers under their hand while the other
 * person is still looking at them.
 *
 * SEGMENTS ARE NOT TURNS. This is the distinction the whole file turns on. A
 * pause is not the end of what someone is saying - "we could play ball, we could
 * play cards, [pause] or we could watch TV" is one offer with a breath in the
 * middle of it, and treating that breath as the end produced replies about
 * television and threw the ball and cards away. So there are two clocks. After
 * HANGOVER_MS of quiet a SEGMENT is closed and sent to be written down, because
 * waiting longer would mean no replies until the speaker has completely
 * finished. Only after TURN_END_MS does the TURN close. Everything transcribed
 * in between is joined, in order, and the replies are worked out from the whole
 * thing - so a long sentence makes the buttons improve as it goes rather than
 * replace themselves.
 *
 * THE NOISE FLOOR IS MEASURED, NOT ASSUMED. A hackathon hall, a classroom and a
 * kitchen are nothing alike, and a fixed threshold that works in one fires
 * constantly in another. The first CALIBRATE_MS of a session are taken as
 * ambient and the speech threshold is set above whatever is actually there.
 *
 * THE MICROPHONE IS ONLY OPEN WHILE THIS IS ON, and the page says so the whole
 * time it is. Audio leaves the device only in turn-sized pieces, only while
 * listening, and nothing is kept after the transcript comes back. A board that
 * listens to a disabled person's household has to be honest about when.
 */

/** How often the audio level is sampled. */
const FRAME_MS = 50;

/** Ambient measured at the start, before anything counts as speech. */
const CALIBRATE_MS = 700;

/** The threshold never drops below this, however quiet the room is. */
const FLOOR = 0.012;

/** Speech has to beat ambient by this much. */
const NOISE_MULTIPLE = 2.2;

/** Shorter than this is a cough, a door, or a chair. */
const MIN_SPEECH_MS = 300;

/**
 * Quiet that closes a SEGMENT and sends it to be written down.
 *
 * Short on purpose. Because segments accumulate rather than replace, cutting one
 * early costs nothing - it just means the first replies appear sooner, while the
 * speaker is still talking.
 */
const HANGOVER_MS = 900;

/**
 * Quiet that closes the TURN, after which the next thing said starts fresh.
 *
 * This is the number that decides whether a pause is a breath or a handover.
 * Long enough to sit through someone thinking mid-sentence; short enough that
 * the communicator is not still being listened over when it is their go.
 */
const TURN_END_MS = 2500;

/** Backstop for someone who does not pause at all. */
const MAX_SEGMENT_MS = 12000;

/** A segment with no speech in it is recycled rather than grown forever. */
const IDLE_RESTART_MS = 8000;

/** Below this there is no audio worth a request. */
const MIN_BLOB_BYTES = 2000;

/** A turn longer than this keeps only its most recent part. */
const MAX_TURN_CHARS = 600;

type Phase = 'off' | 'starting' | 'on' | 'error';

export function ConversationMode({
  contextQuery,
  onClose,
}: {
  /** The moment the board is reading, as query params. */
  contextQuery: string;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<Phase>('off');
  const [message, setMessage] = useState<string | null>(null);
  const [heard, setHeard] = useState<string | null>(null);
  const [replies, setReplies] = useState<Replies | null>(null);
  const [icons, setIcons] = useState<ReplyIcons>({});
  const [busy, setBusy] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [settled, setSettled] = useState(false);
  const [spoken, setSpoken] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const frameRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /** False the moment the user turns it off, so callbacks in flight stand down. */
  const runningRef = useRef(false);
  const sendOnStopRef = useRef(false);
  const sawSpeechRef = useRef(false);
  const speechMsRef = useRef(0);
  const silenceMsRef = useRef(0);
  const segmentMsRef = useRef(0);
  const elapsedRef = useRef(0);
  const noiseRef = useRef(0);
  const noiseFramesRef = useRef(0);
  const thresholdRef = useRef(FLOOR);

  /**
   * Quiet since ANYONE last spoke. Unlike silenceMsRef this survives a segment
   * being closed and a new one started, which is what lets a pause be measured
   * across the cut rather than reset by it.
   */
  const quietMsRef = useRef(0);

  /** The turn being assembled. Parts are keyed by order, not arrival. */
  const turnIdRef = useRef(0);
  const turnOpenRef = useRef(false);
  const partsRef = useRef(new Map<number, string>());
  const nextPartRef = useRef(0);

  /** Only the newest reply generation may set state. An older one is dropped. */
  const replySeqRef = useRef(0);

  /**
   * Every reply offered so far this turn. Accumulated rather than replaced, so
   * asking for new ones a second time does not bring the first set back.
   */
  const offeredRef = useRef<string[]>([]);

  /** Joins what has been heard this turn, in the order it was said. */
  const turnText = useCallback((): string => {
    const text = [...partsRef.current.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, part]) => part)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    return text.length > MAX_TURN_CHARS ? text.slice(-MAX_TURN_CHARS) : text;
  }, []);

  const startNewTurn = useCallback(() => {
    turnIdRef.current += 1;
    turnOpenRef.current = true;
    partsRef.current = new Map();
    nextPartRef.current = 0;
    replySeqRef.current += 1; // anything still in flight belongs to the old turn
    setHeard(null);
    // Replies to the previous question must not stay under the finger while a new
    // one is being asked. Pressing a stale one would answer the wrong question.
    setReplies(null);
    setIcons({});
    offeredRef.current = [];
    setSpoken(null);
    setSettled(false);
  }, []);

  const generate = useCallback(
    async (turnId: number, text: string, avoid: string[] = []) => {
      const id = ++replySeqRef.current;
      setBusy(true);
      try {
        const response = await fetch(`/api/replies?${contextQuery}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ heard: text, avoid }),
        });
        const body = (await response.json()) as {
          replies?: Replies;
          icons?: ReplyIcons;
          error?: string;
        };
        if (id !== replySeqRef.current || turnId !== turnIdRef.current || !runningRef.current) {
          return;
        }
        if (!response.ok || !body.replies) {
          throw new Error(body.error ?? 'Could not work out replies.');
        }
        setReplies(body.replies);
        setIcons(body.icons ?? {});
        offeredRef.current = [
          ...offeredRef.current,
          body.replies.accept,
          body.replies.ask,
          body.replies.refuse,
          ...body.replies.options,
        ];
        setSpoken(null);
        setMessage(null);
        setBusy(false);
      } catch (error) {
        if (id !== replySeqRef.current) return;
        setMessage(error instanceof Error ? error.message : 'That turn did not work.');
        setBusy(false);
      }
    },
    [contextQuery],
  );

  const handleSegment = useCallback(
    async (blob: Blob, turnId: number, partIndex: number) => {
      setBusy(true);
      try {
        const response = await fetch('/api/stt', {
          method: 'POST',
          headers: { 'Content-Type': blob.type || 'audio/webm' },
          body: blob,
        });
        const body = (await response.json()) as { transcript?: string; error?: string };
        if (turnId !== turnIdRef.current || !runningRef.current) return;
        if (!response.ok || !body.transcript) {
          // A segment that was not words is not an error worth showing. It
          // happens whenever a chair scrapes loudly enough to look like speech.
          setBusy(false);
          return;
        }

        // Added to the turn rather than replacing it, so the half of a sentence
        // that came before a pause survives the half that came after.
        partsRef.current.set(partIndex, body.transcript.trim());
        const text = turnText();
        setHeard(text);
        if (text) void generate(turnId, text);
      } catch {
        if (turnId === turnIdRef.current) setBusy(false);
      }
    },
    [generate, turnText],
  );

  /** Starts a fresh recording on the microphone that is already open. */
  const beginSegment = useCallback(() => {
    const stream = streamRef.current;
    if (!stream || !runningRef.current) return;

    const recorder = new MediaRecorder(stream);
    recorderRef.current = recorder;
    chunksRef.current = [];
    sawSpeechRef.current = false;
    sendOnStopRef.current = false;
    speechMsRef.current = 0;
    silenceMsRef.current = 0;
    segmentMsRef.current = 0;

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.onstop = () => {
      const send = sendOnStopRef.current;
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
      chunksRef.current = [];
      if (send && blob.size >= MIN_BLOB_BYTES) {
        // The slot in the turn is claimed HERE, at the cut, not when the
        // transcript comes back - otherwise two segments transcribing at
        // different speeds would be joined in the wrong order.
        void handleSegment(blob, turnIdRef.current, nextPartRef.current++);
      }
      // The microphone never closed, so the next segment can start recording at
      // once. Restarting here rather than in the frame loop means recording is
      // always already running when someone starts talking, so the first
      // syllable is never the one that is lost.
      if (runningRef.current) beginSegment();
    };

    recorder.start();
  }, [handleSegment]);

  const endSegment = useCallback((send: boolean) => {
    sendOnStopRef.current = send;
    const recorder = recorderRef.current;
    if (recorder && recorder.state === 'recording') recorder.stop();
  }, []);

  const stop = useCallback(() => {
    runningRef.current = false;
    turnOpenRef.current = false;
    replySeqRef.current += 1;
    if (frameRef.current) {
      clearInterval(frameRef.current);
      frameRef.current = null;
    }
    const recorder = recorderRef.current;
    if (recorder && recorder.state === 'recording') {
      sendOnStopRef.current = false;
      recorder.stop();
    }
    recorderRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    void audioRef.current?.close().catch(() => {});
    audioRef.current = null;
    analyserRef.current = null;
    setSpeaking(false);
    setBusy(false);
    setPhase('off');
  }, []);

  const start = useCallback(async () => {
    setMessage(null);
    setPhase('starting');

    if (typeof window !== 'undefined' && window.isSecureContext === false) {
      setMessage('Listening needs a secure page (https or localhost).');
      setPhase('error');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setMessage('This browser cannot listen. Use the microphone in the box instead.');
      setPhase('error');
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        // Echo cancellation matters more here than anywhere else in the app: the
        // board speaks out loud, and without this it hears its own voice and
        // generates replies to itself.
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch {
      setMessage('Microphone access was blocked.');
      setPhase('error');
      return;
    }

    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) {
      stream.getTracks().forEach((track) => track.stop());
      setMessage('This browser cannot measure audio. Use the microphone in the box instead.');
      setPhase('error');
      return;
    }

    const audio = new Ctor();
    const analyser = audio.createAnalyser();
    analyser.fftSize = 1024;
    audio.createMediaStreamSource(stream).connect(analyser);

    streamRef.current = stream;
    audioRef.current = audio;
    analyserRef.current = analyser;

    runningRef.current = true;
    turnOpenRef.current = false;
    partsRef.current = new Map();
    nextPartRef.current = 0;
    quietMsRef.current = 0;
    noiseRef.current = 0;
    noiseFramesRef.current = 0;
    thresholdRef.current = FLOOR;
    elapsedRef.current = 0;
    setHeard(null);
    setReplies(null);
    setIcons({});
    setSettled(false);
    setPhase('on');
    beginSegment();

    const buffer = new Float32Array(analyser.fftSize);
    frameRef.current = setInterval(() => {
      const node = analyserRef.current;
      if (!node || !runningRef.current) return;
      node.getFloatTimeDomainData(buffer);

      let sumSq = 0;
      for (let i = 0; i < buffer.length; i++) sumSq += buffer[i] * buffer[i];
      const level = Math.sqrt(sumSq / buffer.length);

      elapsedRef.current += FRAME_MS;
      segmentMsRef.current += FRAME_MS;

      // Take the room's own level first, then set the bar above it.
      if (elapsedRef.current <= CALIBRATE_MS) {
        noiseRef.current += level;
        noiseFramesRef.current += 1;
        thresholdRef.current = Math.max(
          FLOOR,
          (noiseRef.current / Math.max(1, noiseFramesRef.current)) * NOISE_MULTIPLE,
        );
        return;
      }

      const loud = level > thresholdRef.current;
      if (loud) {
        speechMsRef.current += FRAME_MS;
        silenceMsRef.current = 0;
        quietMsRef.current = 0;
        if (speechMsRef.current >= MIN_SPEECH_MS && !sawSpeechRef.current) {
          sawSpeechRef.current = true;
          setSpeaking(true);
          // Speaking again after the turn closed means a new question, not more
          // of the old one.
          if (!turnOpenRef.current) startNewTurn();
        }
      } else {
        quietMsRef.current += FRAME_MS;
        if (sawSpeechRef.current) silenceMsRef.current += FRAME_MS;
      }

      // Someone spoke and has now paused. Close the SEGMENT and send it, but
      // leave the turn open - this may well be a breath.
      if (sawSpeechRef.current && silenceMsRef.current >= HANGOVER_MS) {
        setSpeaking(false);
        endSegment(true);
        return;
      }
      // Someone who has not paused at all. Cut it and keep listening.
      if (sawSpeechRef.current && segmentMsRef.current >= MAX_SEGMENT_MS) {
        setSpeaking(false);
        endSegment(true);
        return;
      }
      // Long enough quiet that they really have handed over. The turn is done;
      // the next thing anyone says starts a new one.
      if (turnOpenRef.current && quietMsRef.current >= TURN_END_MS) {
        turnOpenRef.current = false;
        setSettled(true);
      }
      // Nothing but room noise for a long time. Recycle so the buffer stays small.
      if (!sawSpeechRef.current && segmentMsRef.current >= IDLE_RESTART_MS) {
        endSegment(false);
      }
    }, FRAME_MS);
  }, [beginSegment, endSegment, startNewTurn]);

  useEffect(() => () => stop(), [stop]);

  const say = useCallback(async (text: string) => {
    setSpoken(text);
    // Answering ends the turn: whatever is said next is a reply to this, not
    // more of the question. The buttons stay up in case there is a second thing
    // to say before the other person speaks again.
    turnOpenRef.current = false;
    setSettled(true);
    // Split so the server treats it as a sentence and gives it one intonation
    // contour. A one-word reply still goes down the single-word path.
    await speak(text, { kind: 'sentence', words: text.trim().split(/\s+/) });
  }, []);

  /**
   * None of these fit: say so out loud, and fetch a different set.
   *
   * The holding phrase is the point of the button as much as the new replies are.
   * A silent pause while six buttons are replaced is exactly when the other person
   * gives up and answers for them, so the board fills that pause itself.
   *
   * Spoken before the request goes out, not after it returns, so the listener is
   * asked to wait at the moment the waiting starts.
   */
  const newResponses = useCallback(async () => {
    const text = heard;
    if (!text) return;
    setBusy(true);
    void speak('One moment please', {
      kind: 'sentence',
      words: ['One', 'moment', 'please'],
    });
    await generate(turnIdRef.current, text, offeredRef.current);
  }, [generate, heard]);

  const on = phase === 'on' || phase === 'starting';

  const status = () => {
    if (phase === 'starting') return 'Turning the microphone on…';
    if (speaking) return 'Hearing them now…';
    if (busy) return 'Working out replies…';
    if (heard && !settled) return 'Still listening — they can keep going.';
    if (heard && settled) return 'They have finished. Your go.';
    return 'Listening. Let them speak, then pause.';
  };

  /**
   * All one background. The pictures carry their own colour, and tinting the
   * button behind them made them muddy. Slot identity is still there in the
   * border, and it was never mainly colour anyway: accept and refuse are told
   * apart by sitting at opposite ends.
   */
  const tile = (text: string, tone: 'accept' | 'refuse' | 'ask' | 'plain') => {
    const borders: Record<typeof tone, string> = {
      accept: '#8fbf9c',
      refuse: '#e0a094',
      ask: '#a3accd',
      plain: '#cfcfc4',
    };
    const c = { bg: '#fff', fg: '#25272b', border: borders[tone] };
    const isSpoken = spoken === text;
    const icon = icons[text];
    return (
      <button
        key={`${tone}:${text}`}
        type="button"
        onClick={() => void say(text)}
        style={{
          minHeight: 76,
          padding: '10px 8px',
          borderRadius: 12,
          border: `2px solid ${isSpoken ? '#0e767c' : c.border}`,
          background: c.bg,
          color: c.fg,
          fontWeight: 700,
          fontSize: 16,
          lineHeight: 1.2,
          cursor: 'pointer',
          boxShadow: isSpoken ? '0 0 0 3px rgba(14,118,124,0.25)' : 'none',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
        }}
      >
        {/* The words stay put whether or not a picture was found, so a button
            without one is not a different shape from the button beside it. */}
        <span
          aria-hidden="true"
          style={{
            height: 40,
            display: 'grid',
            placeItems: 'center',
            width: '100%',
          }}
        >
          {icon ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={icon}
              alt=""
              style={{ height: 40, width: 40, objectFit: 'contain' }}
              draggable={false}
            />
          ) : null}
        </span>
        <span>{text}</span>
      </button>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={on ? stop : () => void start()}
          style={{
            flex: '1 1 200px',
            minHeight: 52,
            borderRadius: 12,
            border: 'none',
            background: on ? '#c4402f' : '#0e767c',
            color: '#fff',
            fontWeight: 800,
            fontSize: 16,
            cursor: 'pointer',
          }}
          aria-pressed={on}
        >
          {on ? 'Stop listening' : 'Start listening'}
        </button>
        <button type="button" className="chip" onClick={onClose}>
          Back to the board
        </button>
      </div>

      {on ? (
        <p
          className="text-sm font-semibold"
          role="status"
          style={{ color: speaking ? '#c4402f' : settled ? '#1d5b2c' : '#0e767c' }}
        >
          <span aria-hidden="true">●</span> {status()}
        </p>
      ) : null}

      {heard ? (
        <div
          className="rounded-[10px] border-2 p-3"
          style={{ borderColor: settled ? '#cfcfc4' : '#0e767c', background: '#fff' }}
        >
          <p className="sheet__label" style={{ margin: 0 }}>
            They said
          </p>
          <p className="text-sm font-bold" style={{ margin: 0 }}>
            {heard}
            {/* An open turn is shown as unfinished, so a half-heard sentence
                never reads as the whole of what was said. */}
            {settled ? null : <span style={{ color: '#6c727b', fontWeight: 600 }}> …</span>}
          </p>
        </div>
      ) : null}

      {replies ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {/* Accept and refuse sit at opposite ends, with the question between
              them, so a mis-tap cannot turn a refusal into an agreement. These
              three positions never change, whatever the model returns. */}
          {tile(replies.accept, 'accept')}
          {tile(replies.ask, 'ask')}
          {tile(replies.refuse, 'refuse')}
          {replies.options.map((option) => tile(option, 'plain'))}
        </div>
      ) : null}

      {/* Deliberately unlike the replies above it: filled, full width, and out on
          its own. Pressing it is not saying something, and it must not be mistaken
          for a seventh thing to say. */}
      {replies ? (
        <button
          type="button"
          onClick={() => void newResponses()}
          disabled={busy || !heard}
          style={{
            minHeight: 52,
            borderRadius: 12,
            border: 'none',
            background: busy ? '#e7e7df' : '#3b3f46',
            color: busy ? '#6c727b' : '#fff',
            fontWeight: 800,
            fontSize: 16,
            cursor: busy || !heard ? 'default' : 'pointer',
          }}
        >
          {busy ? 'Finding other replies…' : 'New responses'}
        </button>
      ) : null}

      {message ? (
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
