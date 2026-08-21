/**
 * TestPanel — chat with the live agent via the demo API.
 *
 * On first user turn (or first mount, lazily) we POST /v1/agents/{id}/demo to
 * open a session, then for each message POST /demo/{session_id}/turn.
 *
 * The mic button is still UI-only (no STT pipeline wired yet) — it just toggles
 * a visual "listening" state.
 */
import { useState, useEffect, useRef } from 'react';
import posthog from 'posthog-js';
import Icon from '../../assets/icons';
import { startDemo, streamDemoTurn, prefetchDemoRag } from '../../api/demo';
import { synthesize } from '../../api/tts';
import { streamUrl as sttStreamUrl } from '../../api/stt';
import { uploadRecording } from '../../api/recordings';
import { ApiError } from '../../api/client';
import { useApp } from '../../context/AppContext';
import { logger } from '../../utils/logger';
import { useDebugLifecycle } from '../../utils/useDebugLifecycle';

// MediaRecorder is what we now use to capture mic audio. We send the
// recorded blob to /v1/stt/transcribe (Deepgram with detect_language=true)
// instead of relying on the browser's single-language webkitSpeechRecognition.
const HAS_MEDIA_RECORDER =
  typeof window !== 'undefined' && typeof (window as any).MediaRecorder !== 'undefined';

// Single shared <audio> element for server-rendered TTS playback. We keep
// it module-level so we can connect it to a Web Audio graph once and have
// every TTS playback (across multiple test sessions) routed through the
// same node — that's how the session recorder captures agent audio.
let _ttsAudio: HTMLAudioElement | null = null;
let _ttsAudioCtx: AudioContext | null = null;
let _ttsAudioSrc: MediaElementAudioSourceNode | null = null;
let _ttsRecordingDest: MediaStreamAudioDestinationNode | null = null;

function getTtsAudio(): HTMLAudioElement {
  if (!_ttsAudio) {
    _ttsAudio = new Audio();
    _ttsAudio.preload = 'auto';
    _ttsAudio.crossOrigin = 'anonymous';
  }
  return _ttsAudio;
}

/**
 * Lazily create the Web Audio graph that lets us tap the TTS audio
 * stream. Once `createMediaElementSource` is called on the element,
 * the element's output ONLY flows through Web Audio — so we have to
 * route it back to ctx.destination to keep speakers working, and also
 * to the recording destination so MediaRecorder can capture it.
 *
 * Idempotent — safe to call on every test start.
 */
function ensureTtsAudioGraph(): {
  ctx: AudioContext;
  recordingDest: MediaStreamAudioDestinationNode;
} {
  const audio = getTtsAudio();
  if (!_ttsAudioCtx) {
    _ttsAudioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    _ttsAudioSrc = _ttsAudioCtx.createMediaElementSource(audio);
    _ttsRecordingDest = _ttsAudioCtx.createMediaStreamDestination();
    _ttsAudioSrc.connect(_ttsAudioCtx.destination);   // speakers
    _ttsAudioSrc.connect(_ttsRecordingDest);          // capture
  }
  return { ctx: _ttsAudioCtx, recordingDest: _ttsRecordingDest! };
}

function stopTts() {
  try {
    if (_ttsAudio) {
      _ttsAudio.pause();
      _ttsAudio.currentTime = 0;
      // `src = ''` resolves against the document URL, so the browser issues a
      // real GET for the page HTML and then fires a media `error` event.
      // removeAttribute + load() detaches the source without any request.
      _ttsAudio.removeAttribute('src');
      _ttsAudio.load();
    }
  } catch {}
}

/**
 * Unlock the shared <audio> element inside a user gesture.
 *
 * `_ttsAudio` is a detached element that only ever gets played from inside
 * the TtsQueue — two awaits deep, so Safari/iOS no longer considers the play()
 * call user-initiated and rejects it with NotAllowedError. Playing a silent
 * clip synchronously from the Start-test click marks the element as
 * user-activated for the rest of the page's life.
 */
const SILENT_WAV =
  'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAgD4AAAB9AAACABAAZGF0YQAAAAA=';
function unlockTtsAudio() {
  try {
    // Already playing? Then the element is already unlocked, and clobbering its
    // source would cut off whatever the agent is saying right now.
    if (_ttsAudio && !_ttsAudio.paused) return;
    const audio = getTtsAudio();
    audio.muted = true;
    audio.src = SILENT_WAV;
    const p = audio.play();
    const done = () => { audio.muted = false; stopTts(); };
    if (p && typeof p.then === 'function') p.then(done, done);
    else done();
  } catch {}
}

/**
 * Ordered TTS playback queue. Each `enqueue(promise)` reserves a slot in
 * order; the queue awaits slot N before slot N+1, so sentences always
 * play in the order they were enqueued — even if their TTS network calls
 * complete out of order (which they routinely do, since shorter
 * sentences synthesize faster).
 */
class TtsQueue {
  private slots: Array<Promise<string | null>> = [];
  private nextSlot = 0;
  private cancelled = false;
  private active = false;
  /** Resolver of the in-flight `ended` promise, so cancel() can unblock tick(). */
  private endedResolve: (() => void) | null = null;
  /** Aborts every in-flight synthesize() for this queue when it is cancelled. */
  private abort = new AbortController();
  /** Notifier so the UI can pause speech recognition while audio plays. */
  onActiveChange?: (active: boolean) => void;
  /** Notifier for a playback failure the user needs to know about. */
  onPlaybackError?: (err: unknown) => void;

  /** Signal to hand to synthesize() so cancel() also stops paying for audio. */
  get signal(): AbortSignal { return this.abort.signal; }

  /** Reserve a slot for the upcoming TTS Blob. */
  enqueue(blobPromise: Promise<Blob>) {
    if (this.cancelled) return;
    const slot = blobPromise
      .then(blob => URL.createObjectURL(blob))
      .catch(err => {
        console.warn('[TtsQueue] synth failed', err);
        return null;
      });
    this.slots.push(slot);
    if (!this.active) {
      this.active = true;
      try { this.onActiveChange?.(true); } catch {}
    }
    this.tick();
  }

  cancel() {
    if (this.cancelled) return;
    this.cancelled = true;
    // Abort any synthesis we're still paying for.
    try { this.abort.abort(); } catch {}
    // Revoke every URL we own. `slots` still holds the slot tick() is playing
    // (nextSlot is only an index), and slots that resolve after this point get
    // revoked by the same .then — so nothing leaks.
    this.slots.forEach(p => p.then(u => u && URL.revokeObjectURL(u)).catch(() => {}));
    this.slots = [];
    stopTts();
    // stopTts() detaches the source without firing `ended`/`error`, so resolve
    // the in-flight ended promise by hand or tick() would await it forever.
    const resolve = this.endedResolve;
    this.endedResolve = null;
    resolve?.();
    if (this.active) {
      this.active = false;
      try { this.onActiveChange?.(false); } catch {}
    }
  }

  private playing = false;
  private async tick() {
    if (this.playing) return;
    if (this.nextSlot >= this.slots.length) {
      // No queued slots left — drain.
      if (this.active) {
        this.active = false;
        try { this.onActiveChange?.(false); } catch {}
      }
      return;
    }
    this.playing = true;
    // Wait for THIS slot's blob — even if later slots already resolved,
    // they wait their turn.
    const url = await this.slots[this.nextSlot];
    this.nextSlot++;
    if (this.cancelled || !url) {
      this.playing = false;
      this.tick();
      return;
    }
    const audio = getTtsAudio();
    try {
      // Reset any previous handlers so a stale onended from the
      // previous slot can't fire on this one.
      audio.onended = null;
      audio.onerror = null;

      // Attach handlers BEFORE setting src + before play(). canplaythrough
      // / loadedmetadata / ended events for short MP3s can otherwise fire
      // synchronously during decode and we'd miss them.
      const ended = new Promise<void>((resolve) => {
        const done = () => {
          try { URL.revokeObjectURL(url); } catch {}
          audio.onended = null;
          audio.onerror = null;
          this.endedResolve = null;
          resolve();
        };
        audio.onended = done;
        audio.onerror = done;
        // cancel() resolves this by hand — stopTts() fires neither event.
        this.endedResolve = done;
      });

      // canplaythrough = enough data buffered that playback won't have
      // to pause to re-buffer. canplay alone fires too early for streamed
      // MP3s and the first ~150ms of attack gets clipped.
      const ready = new Promise<void>((resolve) => {
        const onReady = () => {
          audio.removeEventListener('canplaythrough', onReady);
          audio.removeEventListener('canplay', onReady);
          audio.removeEventListener('error', onError);
          resolve();
        };
        // If the audio element fires an error before canplaythrough (e.g. the
        // ElevenLabs blob is malformed), the ready promise would hang forever
        // unless we also resolve on error. The actual playback error is already
        // handled by the audio.onerror = done handler above.
        const onError = () => {
          audio.removeEventListener('canplaythrough', onReady);
          audio.removeEventListener('canplay', onReady);
          resolve();   // unblock tick() so the queue drains
        };
        audio.addEventListener('canplaythrough', onReady);
        // Fallback to canplay after a short timeout in case the MP3 is
        // tiny enough that canplaythrough never fires distinctly from
        // canplay (rare, but happens on sub-1s clips).
        audio.addEventListener('canplay', onReady, { once: true });
        audio.addEventListener('error', onError, { once: true });
      });

      // Set src + force a fresh load so the audio element doesn't keep
      // any half-decoded state from the previous slot.
      audio.src = url;
      try { audio.load(); } catch {}

      // If the audio is already past canplaythrough by the time we get
      // here (cached blob URL, very small file), short-circuit.
      if (audio.readyState >= 4) {
        // already buffered enough — proceed
      } else {
        await ready;
      }

      // Make sure we're at the very start. Some browsers leave
      // currentTime non-zero between src changes.
      try { audio.currentTime = 0; } catch {}

      // Ensure the Web Audio graph is running before calling play().
      // Chrome suspends AudioContexts by default after creation; if the user
      // typed a message before clicking Start Test (so the AC was created
      // lazily), the context may still be suspended and audio.play() will
      // produce complete silence even though the element reports playing=true.
      if (_ttsAudioCtx?.state === 'suspended') {
        try { await _ttsAudioCtx.resume(); } catch {}
      }
      await audio.play();
      await ended;
    } catch (e) {
      console.warn('[TtsQueue] playback failed', e);
      try { URL.revokeObjectURL(url); } catch {}
      // A cancel() pauses the element mid-play(), which rejects with
      // AbortError — that's us, not a failure the user needs to hear about.
      const name = (e as any)?.name;
      if (!this.cancelled && name !== 'AbortError') {
        try { this.onPlaybackError?.(e); } catch {}
      }
    } finally {
      this.playing = false;
      if (!this.cancelled) this.tick();
    }
  }
}

function SpeakerIcon({ on }: { on: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 5 6 9H2v6h4l5 4z" />
      {on ? (
        <>
          <path d="M15.5 8.5a5 5 0 0 1 0 7" />
          <path d="M19 5a9 9 0 0 1 0 14" />
        </>
      ) : (
        <>
          <line x1="22" y1="9" x2="16" y2="15" />
          <line x1="16" y1="9" x2="22" y2="15" />
        </>
      )}
    </svg>
  );
}

/**
 * Word-overlap between what the mic heard and what the agent just said.
 *
 * Used to tell an echo of the agent's own TTS (which the mic picks up whenever
 * echo cancellation isn't enough — external speakers, for instance) apart from
 * a real interruption. Returns the fraction of heard words that also appear in
 * the agent's speech, so 1.0 means "every word came from the agent".
 *
 * ponytail: bag-of-words heuristic. A backend echo/VAD signal (or a
 * double-talk detector) would be exact; this is the best a client can do.
 */
function agentEchoRatio(heard: string, agentSpoke: string): number {
  const words = (s: string) =>
    s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
  const h = words(heard);
  if (h.length === 0) return 0;
  const spoken = new Set(words(agentSpoke));
  if (spoken.size === 0) return 0;
  return h.filter(w => spoken.has(w)).length / h.length;
}

/** At or above this fraction of shared words we treat a transcript as echo. */
const ECHO_RATIO = 0.6;

const tintColor = {
  purple: 'var(--purple-hi)', blue: 'var(--blue)', teal: 'var(--teal)',
  green: 'var(--green)', amber: 'var(--amber)', pink: 'var(--pink)',
};
const tintHi = {
  purple: 'rgba(117,91,227,0.55)',
  blue:   'rgba(24,218,252,0.55)',
  teal:   'rgba(79,209,197,0.55)',
  green:  'rgba(76,175,80,0.55)',
  amber:  'rgba(255,181,71,0.55)',
  pink:   'rgba(230,90,255,0.55)',
};

interface Msg {
  role: 'agent' | 'user' | 'typing' | 'user_partial' | 'lang_switch';
  text: string;
  latencyMs?: number;
  /** ISO 2-letter code for lang_switch messages */
  lang?: string;
}

interface Props {
  category?: string;
  tint?: keyof typeof tintColor;
  agentId: string | null;
  /** When true the Test panel will refuse to send turns (e.g. requirements not saved). */
  disabled?: boolean;
  disabledHint?: string;
  /** Primary language code from the agent (e.g. 'en', 'hi', 'ta'). Used as
   *  the initial STT/TTS language. */
  primaryLang?: string;
  /** All language codes the user has marked as supported. Drives the
   *  in-panel language selector so the user can switch STT before they
   *  speak (Hindi, Tamil, etc.). */
  supportedLangs?: string[];
}

// BCP-47 mapping. Backend stores 2-letter codes; SpeechRecognition needs
// region tags (en-US, hi-IN, etc.).
const BCP47: Record<string, string> = {
  en: 'en-US', hi: 'hi-IN', ta: 'ta-IN', te: 'te-IN', kn: 'kn-IN', ml: 'ml-IN',
  bn: 'bn-IN', pa: 'pa-IN', gu: 'gu-IN', mr: 'mr-IN', es: 'es-ES', fr: 'fr-FR',
  as: 'as-IN', or: 'or-IN', ur: 'ur-IN', mai: 'mai-IN', sa: 'sa-IN',
};
const LANG_LABEL: Record<string, string> = {
  en: 'English', hi: 'हिन्दी', ta: 'தமிழ்', te: 'తెలుగు', kn: 'ಕನ್ನಡ',
  ml: 'മലയാളം', bn: 'বাংলা', pa: 'ਪੰਜਾਬੀ', gu: 'ગુજรાતી', mr: 'मराठी',
  es: 'Español', fr: 'Français',
  as: 'অসমীয়া', or: 'ଓଡ଼ିଆ', ur: 'اردو', mai: 'मैथिली', sa: 'संस्कृत',
};

// Short, natural fillers — kept brief (~1s spoken) so they bridge ~500ms
// of LLM latency without sounding like a separate sentence. Multiple per
// language so we can rotate without repeating. Each line should feel
// like something a real human casually says when stalling for thought.
const FILLERS: Record<string, string[]> = {
  en: [
    'Hmm, one sec.',
    'Mhm, let me check.',
    'Right, just a moment.',
    'Okay, looking that up.',
    'Sure, give me a second.',
    'Got it, hold on.',
    'Yeah, one moment.',
  ],
  hi: [
    'Haan ji.',
    'Ek minute.',
    'Theek hai, dekh leti hoon.',
    'Zara ruke.',
    'Achha, abhi batati hoon.',
    'Haan, ek pal.',
  ],
  ta: [
    'Sari.',
    'Oru nimisham.',
    'Aamaam, paarkkiren.',
    'Konjam irungal.',
    'Sari, kavaniyungal.',
  ],
  te: [
    'Sare.',
    'Oka kshanam.',
    'Avunu, chustanu.',
    'Konchem agandi.',
  ],
  kn: [
    'Sari.',
    'Ondu kshana.',
    'Howdu, nodtene.',
    'Swalpa irini.',
  ],
  ml: [
    'Sari.',
    'Oru nimisham.',
    'Athe, nokkatte.',
  ],
  bn: [
    'Haan.',
    'Ek muhurto.',
    'Dekhchhi.',
    'Ektu wait korun.',
  ],
  es: [
    'Mhm, un momento.',
    'Sí, un segundo.',
    'Claro, déjeme ver.',
  ],
};

/**
 * Per-language filler cache. Pre-fetches one MP3 per language so we can
 * play one with zero extra round-trip when the user finishes speaking.
 *
 * Tracks the last phrase used per language so consecutive turns rotate
 * through the available fillers instead of looping the same one.
 */
class FillerCache {
  private blobs: Map<string, { text: string; blob: Blob }> = new Map();
  private inflight: Map<string, Promise<Blob | null>> = new Map();
  private lastTextByLang: Map<string, string> = new Map();

  private pickPhrase(langCode: string): string {
    const phrases = FILLERS[langCode] || FILLERS.en;
    const last = this.lastTextByLang.get(langCode);
    const candidates = phrases.length > 1 ? phrases.filter(p => p !== last) : phrases;
    const text = candidates[Math.floor(Math.random() * candidates.length)];
    this.lastTextByLang.set(langCode, text);
    return text;
  }

  async warm(
    langCode: string,
    synthFn: (text: string, lang: string, signal?: AbortSignal) => Promise<Blob>,
  ): Promise<void> {
    if (this.blobs.has(langCode) || this.inflight.has(langCode)) return;
    const text = this.pickPhrase(langCode);
    const p = synthFn(text, langCode).then(b => { this.blobs.set(langCode, { text, blob: b }); return b; })
      .catch(err => { console.warn('[FillerCache] warm failed', langCode, err); return null; })
      .finally(() => { this.inflight.delete(langCode); });
    this.inflight.set(langCode, p);
    await p;
  }

  async take(
    langCode: string,
    synthFn: (text: string, lang: string, signal?: AbortSignal) => Promise<Blob>,
    signal?: AbortSignal,
  ): Promise<Blob | null> {
    const cached = this.blobs.get(langCode);
    if (cached) {
      this.blobs.delete(langCode);
      this.warm(langCode, synthFn);   // background re-warm — deliberately NOT
      return cached.blob;             // given `signal`: it's for the NEXT turn.
    }
    try {
      const text = this.pickPhrase(langCode);
      return await synthFn(text, langCode, signal);
    } catch (e) {
      console.warn('[FillerCache] live fallback failed', e);
      return null;
    }
  }
}

const _fillerCache = new FillerCache();

export default function TestPanel({
  category = 'this',
  tint = 'purple',
  agentId,
  disabled = false,
  disabledHint,
  primaryLang = 'en',
  supportedLangs = [],
}: Props) {
  const { addToast } = useApp();
  // Flagged High in debug/AUDIT.md — agent-switch races (stale transcript,
  // duplicate session creation) and an unmount/MediaRecorder cleanup race.
  useDebugLifecycle('TestPanel', [agentId]);
  const [listening, setListening] = useState(false);
  const [input, setInput] = useState('');
  const [transcript, setTranscript] = useState<Msg[]>([
    { role: 'agent', text: `Hi — I'm your ${category} voice agent. Save the requirements above and we can start.` },
  ]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Reading replies aloud — persists across reloads via localStorage so the
  // user's preference sticks. Defaults to ON (it's a voice agent, after all).
  const [voiceOut, setVoiceOut] = useState(() => {
    try { return localStorage.getItem('candy.tts') !== 'off'; } catch { return true; }
  });
  const [ttsPlaying, setTtsPlaying]   = useState(false);
  // True between the Start-test click and the moment the session is actually
  // recording. getUserMedia can take a second and a half; without this the
  // button stays clickable and a second click builds a whole second pipeline.
  const [testStarting, setTestStarting] = useState(false);
  // Active conversation language (BCP-47 like 'en-US' / 'ta-IN'). Drives
  // both the STT recognition language and the TTS voice. Initialized
  // from the agent's primary language so a Hindi-first agent transcribes
  // Hindi from turn one. Auto-switches when the agent replies in a
  // different script.
  const [convLang, setConvLang] = useState(() => BCP47[primaryLang] || 'en-US');
  const scrollRef = useRef<HTMLDivElement>(null);
  const ttsPlayingRef = useRef(false);
  const convLangRef = useRef('en-US');
  /** Guards startTest against a double click during the getUserMedia await. */
  const startingTestRef = useRef(false);
  /** Everything the agent has said aloud this turn — the echo-gate corpus. */
  const agentSpeechRef = useRef('');
  useEffect(() => { ttsPlayingRef.current = ttsPlaying; }, [ttsPlaying]);
  useEffect(() => { convLangRef.current = convLang; }, [convLang]);

  // When the parent updates the agent's primary language, follow it (only if
  // the user hasn't already manually switched mid-call).
  useEffect(() => {
    const next = BCP47[primaryLang] || 'en-US';
    if (next !== convLangRef.current) {
      setConvLang(next);
      convLangRef.current = next;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [primaryLang]);

  // NOTE: The backend now uses _run_with_auto_detect() on every utterance —
  // it tries IndicConformer first, checks for Indian-script characters, and
  // falls back to Whisper-base.en if the output is Latin/empty.  This means
  // language switching is fully automatic and the STT WebSocket does NOT need
  // to be reopened when convLang changes.  We keep reopenTestSttWs available
  // as a manual escape-hatch but no longer call it on language change.

  // Pre-fetch a filler for the current conversation language so the very
  // first turn already has audio ready. Also warm fillers for any other
  // languages the agent supports so language switches stay snappy.
  useEffect(() => {
    if (!agentId || !voiceOut) return;
    const langs = new Set<string>([
      (convLang.split('-')[0] || 'en'),
      ...(supportedLangs || []),
    ]);
    for (const l of langs) {
      _fillerCache.warm(l, (text, lang) => synthesize({ text, language_code: lang }))
        .catch(() => {});   // non-fatal
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId, voiceOut, convLang, supportedLangs?.join(',')]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [transcript]);

  // Reset session when the agent we're talking to changes.
  // Eagerly open a fresh demo session as soon as we know the agent — this
  // amortizes the auto-prep latency of POST /demo (which can run doc
  // reclassification + prompt recompile) so the first user turn doesn't
  // pay that cost.
  useEffect(() => {
    setSessionId(null);
    if (!agentId || disabled) return;
    let cancelled = false;
    (async () => {
      try {
        logger.info('[TestPanel] eagerly starting demo session', { agentId });
        const t0 = performance.now();
        const s = await startDemo(agentId);
        const dt = Math.round(performance.now() - t0);
        if (cancelled) return;
        setSessionId(s.demo_session_id);
        logger.info('[TestPanel] eager session ready', { agentId, sessionId: s.demo_session_id, elapsed: `${dt} ms` });
      } catch (e) {
        if (cancelled) return;
        logger.warn('[TestPanel] eager startDemo failed — will retry on first turn', { agentId, error: e });
      }
    })();
    return () => { cancelled = true; };
  }, [agentId, disabled]);

  // Cleanup when the component unmounts, and when the tab goes away.
  //
  // Both routes go through stopTest(), which is the ONLY path that releases the
  // session mic tracks and flushes the conversation recording — those live in
  // sessionRecorder.onstop, so anything that skips stopTest() leaves the OS mic
  // hot (tab recording indicator on) and silently drops the recording.
  useEffect(() => {
    // pagehide is the reliable "page is going away" event (bfcache-safe, and it
    // fires on iOS where beforeunload does not).
    // ponytail: the upload is a normal fetch, so a tab close can still cut it
    // short — a keepalive/sendBeacon upload in api/recordings would fix that.
    const onPageHide = () => stopTest();
    window.addEventListener('pagehide', onPageHide);
    return () => {
      window.removeEventListener('pagehide', onPageHide);
      stopTest();
      if (prefetchTimerRef.current) {
        clearTimeout(prefetchTimerRef.current);
        prefetchTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  // Switching agents mid-conversation: stop the test (otherwise the recorder
  // keeps rolling and the STT socket keeps streaming into a session that
  // belongs to the agent we just left) and silence any queued speech.
  useEffect(() => {
    stopTest();
    ttsQueueRef.current?.cancel();
    ttsQueueRef.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId]);

  // Persist the voice-out preference.
  useEffect(() => {
    try { localStorage.setItem('candy.tts', voiceOut ? 'on' : 'off'); } catch {}
    if (!voiceOut) {
      // cancel(), not stopTts(): stopTts only detaches the current source, and
      // the queue would happily go on to play the next sentence.
      ttsQueueRef.current?.cancel();
      ttsQueueRef.current = null;
    }
  }, [voiceOut]);

  async function ensureSession(): Promise<string | null> {
    if (sessionId) return sessionId;
    if (!agentId) return null;
    try {
      console.log('[TestPanel] starting demo session for agent', agentId);
      const s = await startDemo(agentId);
      console.log('[TestPanel] demo session started', s.demo_session_id);
      setSessionId(s.demo_session_id);
      return s.demo_session_id;
    } catch (e) {
      console.error('[TestPanel] startDemo failed', e);
      const msg = e instanceof ApiError ? e.message : (e as Error).message;
      addToast(`Couldn't start session: ${msg}`, 'error');
      return null;
    }
  }

  /** Abandon the in-flight turn (SSE + busy lock) without touching the queue. */
  function cancelActiveTurn() {
    turnAbortRef.current?.abort();
    turnAbortRef.current = null;
    busyRef.current = false;
    setBusy(false);
  }

  async function send(text: string) {
    console.log('[TestPanel] send clicked', { agentId, disabled, sessionId, text });
    const t = text.trim();
    // busyRef, not the `busy` state: two speech_finals can land in the same
    // tick, before React has re-rendered with busy=true, and we'd run two
    // concurrent turns that both write into the same agent bubble.
    if (!t || busyRef.current) return;
    if (disabled) {
      addToast(disabledHint || 'Save the requirements first', 'info');
      return;
    }
    if (!agentId) {
      addToast('Agent not ready yet.', 'info');
      return;
    }

    // Promote any in-flight user_partial bubble to the final user bubble,
    // then push an empty agent bubble we'll grow as sentences stream in.
    const agentMsgIdx: { current: number } = { current: -1 };
    setTranscript(prev => {
      let next = [...prev];
      if (next.length > 0 && next[next.length - 1].role === 'user_partial') {
        next[next.length - 1] = { role: 'user', text: t };
      } else {
        next.push({ role: 'user', text: t });
      }
      next.push({ role: 'agent', text: '' });
      agentMsgIdx.current = next.length - 1;
      return next;
    });
    setInput('');
    busyRef.current = true;
    setBusy(true);

    // A new turn supersedes the previous one. Both queues drive the SAME
    // module-global <audio> element, so leaving the old one alive means queue B
    // clobbers the handlers queue A is awaiting: A's tick() then hangs forever,
    // its remaining slots never play and their object URLs never get revoked.
    ttsQueueRef.current?.cancel();
    // Same for the previous turn's SSE stream — abandon it rather than letting
    // it keep streaming sentences into a bubble that is no longer the last one.
    turnAbortRef.current?.abort();
    turnAbortRef.current = null;

    // Per-turn TTS queue + sentence pre-fetch (we kick the synthesize call
    // before the previous sentence even finishes playing). The queue
    // notifies us while audio is active so the UI can show that the agent
    // is speaking and the echo gate can arm.
    const ttsQueue = new TtsQueue();
    ttsQueueRef.current = ttsQueue;
    const turnAbort = new AbortController();
    turnAbortRef.current = turnAbort;
    agentSpeechRef.current = '';

    // Conversational filler — fired immediately for substantive turns
    // so the line never goes dead while the LLM is computing. The
    // real reply audio queues behind it in order, so the user hears:
    //
    //     [filler] → [agent sentence 1] → [agent sentence 2] → …
    //
    // Skipped for:
    //   • turn 1 — that's the user's greeting; the agent should
    //     introduce itself, not stall first.
    //   • short utterances (< 4 words) — quick acknowledgements come
    //     back in <300ms and don't need bridging.
    // turnIndexRef is incremented further down, once we have a session — so
    // the turn we are about to take is the current index plus one.
    const turnNumber     = (turnIndexRef.current ?? 0) + 1;
    const shortUtterance = t.split(/\s+/).filter(Boolean).length < 4;
    const skipFiller     = !voiceOut || turnNumber <= 1 || shortUtterance;
    // Dedup: show at most one TTS error toast per turn so we don't spam.
    let _ttsToastShown = false;

    // Assign the notifiers BEFORE the first enqueue — enqueue() fires
    // onActiveChange(true) synchronously, so a callback attached afterwards
    // never sees it and `ttsPlaying` (which gates the echo/barge-in path and
    // the "agent is speaking" hint) would stay false for the whole turn.
    ttsQueue.onActiveChange = (active) => {
      setTtsPlaying(active);
      ttsPlayingRef.current = active;
    };
    ttsQueue.onPlaybackError = () => {
      if (_ttsToastShown) return;
      _ttsToastShown = true;
      posthog.capture('test_call_tts_playback_failed');
      addToast(
        'Playback failed — allow audio for this site, then start the test again.',
        'error',
        { skipCapture: true },
      );
    };

    if (!skipFiller) {
      const fillerLang = (convLangRef.current.split('-')[0] || 'en');
      // The filler is spoken too, so its phrases belong in the echo corpus.
      agentSpeechRef.current = (FILLERS[fillerLang] || FILLERS.en).join(' ');
      const fillerPromise = _fillerCache.take(
        fillerLang,
        (text, lang, signal) => synthesize({ text, language_code: lang, signal }),
        ttsQueue.signal,
      ).then(blob => {
        if (!blob) throw new Error('no filler');
        return blob;
      });
      ttsQueue.enqueue(fillerPromise);
    }
    let firstSentenceMs: number | null = null;
    const sendStart = performance.now();

    try {
      const sid = await ensureSession();
      if (!sid) throw new Error('No session');

      // Bump the turn index. user + agent rows for this turn will share
      // the same number so they pair up in the recordings list.
      if (uploadSessionRef.current !== sid) {
        uploadSessionRef.current = sid;
        turnIndexRef.current = 0;
      }
      turnIndexRef.current += 1;

      // Per-turn audio uploads are gone — we now capture the whole
      // conversation via the session recorder (Start Test / Stop Test).
      // Just accumulate the user transcript for the session metadata.
      sessionTranscriptRef.current +=
        (sessionTranscriptRef.current ? '\n' : '') + `User: ${t}`;

      // Pass the current 2-letter language code so the backend resolver
      // knows what language the conversation is in before detecting a switch.
      const currentLangCode = convLangRef.current.split('-')[0] || 'en';
      await streamDemoTurn(agentId, sid, t, {
        onSentence: (sentence, fullSoFar) => {
          if (firstSentenceMs === null) {
            firstSentenceMs = Math.round(performance.now() - sendStart);
            console.log('[TestPanel] first sentence in', firstSentenceMs, 'ms');
          }
          // Update the agent bubble with the running text.
          setTranscript(prev => {
            const copy = [...prev];
            const idx = copy.length - 1;   // last message is the streaming agent bubble
            if (idx >= 0 && copy[idx].role === 'agent') {
              copy[idx] = { ...copy[idx], text: fullSoFar };
            }
            return copy;
          });

          if (voiceOut && sentence.trim().length > 0) {
            const primary  = convLangRef.current.split('-')[0] || 'en';
            // Everything we speak aloud can come back through the mic.
            agentSpeechRef.current += ' ' + sentence;
            const promise  = synthesize({ text: sentence, language_code: primary, signal: ttsQueue.signal })
              .catch(err => {
                const _s = (err as any)?.status;
                if (!_ttsToastShown) {
                  _ttsToastShown = true;
                  posthog.capture('test_call_tts_failed', { status: _s ?? null });
                  if (_s === 429) {
                    addToast('TTS quota exceeded — top up ElevenLabs or set DEEPGRAM_API_KEY as fallback.', 'error', { skipCapture: true });
                  } else if (_s === 503 || !_s) {
                    addToast('Agent voice isn\'t available — set ELEVENLABS_API_KEY in the backend .env.', 'info');
                  } else {
                    addToast(`Voice synthesis failed (HTTP ${_s}) — check backend logs.`, 'error', { skipCapture: true });
                  }
                }
                console.warn('[TestPanel] sentence TTS failed', err);
                throw err;
              });
            ttsQueue.enqueue(promise);
          }
        },
        onDone: ({ full_text, latency_ms, active_language, language_switched }) => {
          const wallMs = Math.round(performance.now() - sendStart);
          setTranscript(prev => {
            const copy = [...prev];
            const idx = copy.length - 1;
            if (idx >= 0 && copy[idx].role === 'agent') {
              copy[idx] = { ...copy[idx], text: full_text || copy[idx].text, latencyMs: latency_ms || wallMs };
            }
            // Inject a language-switch badge AFTER the agent bubble so the
            // user can see the conversation language changed.
            if (language_switched && active_language) {
              copy.push({ role: 'lang_switch', text: '', lang: active_language });
            }
            return copy;
          });

          // Backend is the authoritative source for language — update convLang
          // from it rather than purely relying on client-side script detection.
          if (active_language) {
            const tag = BCP47[active_language] || `${active_language}-IN`;
            if (tag !== convLangRef.current) {
              console.log('[TestPanel] backend confirmed language:', convLangRef.current, '→', tag);
              convLangRef.current = tag;
              setConvLang(tag);
            }
          }

          console.log('[TestPanel] turn finished', {
            backend_ms: latency_ms,
            wall_ms: wallMs,
            first_sentence_ms: firstSentenceMs,
            active_language,
            language_switched,
          });

          // Whole-conversation audio is captured by the session
          // recorder; here we just append the agent's reply to the
          // running transcript so the saved recording has searchable
          // text alongside the audio.
          if (full_text && full_text.trim().length > 0) {
            sessionTranscriptRef.current +=
              (sessionTranscriptRef.current ? '\n' : '') + `Agent: ${full_text}`;
          }
        },
        onError: (err) => {
          throw err;
        },
      }, turnAbort.signal, currentLangCode);
    } catch (e) {
      // Superseded by a newer turn (or torn down) — not an error to report.
      if (turnAbort.signal.aborted || (e as any)?.name === 'AbortError') return;
      const msg = e instanceof ApiError ? e.message : (e as Error).message;
      setTranscript(prev => [
        ...prev.filter(m => m.role !== 'typing'),
        { role: 'agent', text: `Error: ${msg}` },
      ]);
    } finally {
      // Only the newest turn owns `busy` — an older, superseded turn finishing
      // late must not unlock the composer while the new one is still running.
      // (A null ref means a teardown cleared it, so unlocking is still ours.)
      const superseded = turnAbortRef.current !== null && turnAbortRef.current !== turnAbort;
      if (!superseded) {
        turnAbortRef.current = null;
        busyRef.current = false;
        setBusy(false);
      }
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  }

  // -- Mic capture state ------------------------------------------------------
  // Speculative RAG prefetch — debounce + last-value dedupe so partials
  // don't spam the backend, but a meaningful change still warms the
  // chunks before the actual turn arrives.
  const prefetchTimerRef = useRef<number | null>(null);
  const prefetchLastRef  = useRef<string>('');
  // Session-level recording (whole conversation in one MP3). Started by
  // the user clicking Start Test; stopped by clicking Stop Test or by
  // navigating away. Mixes mic + agent TTS into one MediaStream.
  const [testActive, setTestActive] = useState(false);
  // Sync ref so non-React callbacks can read testActive without stale closure.
  const testActiveRef           = useRef(false);
  useEffect(() => { testActiveRef.current = testActive; }, [testActive]);
  // Ref to the current turn's TTS queue so stopTest() can cancel it immediately.
  const ttsQueueRef             = useRef<TtsQueue | null>(null);
  /** Aborts the current turn's SSE stream (barge-in, new turn, teardown). */
  const turnAbortRef            = useRef<AbortController | null>(null);
  /** Synchronous mirror of `busy` — see the guard at the top of send(). */
  const busyRef                 = useRef(false);
  // Session-level persistent STT WebSocket. Opened ONCE in startTest() and
  // closed in stopTest(). This eliminates the per-utterance WS open/close
  // cycling that caused Deepgram to reconnect on every turn (and on every
  // endpointing event while the user was silent between turns).
  const testSttWsRef   = useRef<WebSocket          | null>(null);
  /** ScriptProcessorNode that streams raw int16 PCM to the STT WebSocket. */
  const sttPcmNodeRef  = useRef<ScriptProcessorNode | null>(null);
  const sttPcmSrcRef   = useRef<MediaStreamAudioSourceNode | null>(null);
  /** 16 kHz capture context that feeds the PCM streamer — see
   *  startPcmStreamerForTest for why it isn't the shared TTS context. */
  const sttCtxRef      = useRef<AudioContext | null>(null);
  /** Stable ref to reopenTestSttWs so setupTestSttWs (defined before the
   *  function) can trigger a WS reconnect without a forward-reference error. */
  const reopenTestSttWsRef = useRef<((lang: string) => void) | null>(null);
  const sessionRecorderRef     = useRef<MediaRecorder | null>(null);
  const sessionChunksRef       = useRef<Blob[]>([]);
  const sessionMimeRef         = useRef<string>('audio/webm');
  const sessionMicStreamRef    = useRef<MediaStream    | null>(null);
  const sessionStartAtRef      = useRef<number>(0);
  const sessionTranscriptRef   = useRef<string>('');
  /** Monotonic per-session turn counter so user/agent rows pair up. */
  const turnIndexRef     = useRef<number>(0);
  /** The session ID we last uploaded recordings against — used so we
   *  don't try to upload before a session exists. */
  const uploadSessionRef = useRef<string | null>(null);
  /** The STT WebSocket handlers are attached imperatively, once, and never
   *  re-attached — so they must NOT read render-scoped values directly or
   *  they freeze at the startTest() render (a frozen `busy` ran concurrent
   *  turns; a frozen `sessionId` opened a new demo session, losing the
   *  agent's memory, on every spoken turn). Route through these instead. */
  const sendRef      = useRef(send);
  const agentIdRef   = useRef(agentId);
  const sessionIdRef = useRef<string | null>(sessionId);
  sendRef.current      = send;
  agentIdRef.current   = agentId;
  sessionIdRef.current = sessionId;

  /**
   * Wire up handlers for the session-level persistent STT WebSocket.
   * Called once from startTest(); the WS stays alive until stopTest().
   *
   * Accumulates `is_final` tokens into `currentFinal` then processes the
   * complete utterance on `speech_final` — same logic as the per-utterance
   * flow, but without any per-utterance connect/disconnect cycle.
   *
   * Key difference from old architecture: if Deepgram fires `speech_final`
   * with an empty transcript (endpointing on silence), we simply ignore it
   * instead of restarting a new recorder+WS pair.
   */
  function setupTestSttWs(ws: WebSocket) {
    let currentFinal = '';

    ws.onmessage = (ev) => {
      let evt: any;
      try { evt = JSON.parse(ev.data); } catch { return; }

      if (evt.type === 'partial' || evt.type === 'final') {
        if (evt.transcript) {
          if (evt.type === 'final') {
            currentFinal = (currentFinal + ' ' + evt.transcript).trim();
            setInput(currentFinal);
          } else {
            setInput((currentFinal + ' ' + evt.transcript).trim());
          }
          const runningText = (
            currentFinal + ' ' + (evt.type === 'partial' ? evt.transcript : '')
          ).trim();
          if (runningText) {
            setTranscript(prev => {
              const copy = [...prev];
              const last  = copy[copy.length - 1];
              if (last && last.role === 'user_partial') {
                copy[copy.length - 1] = { role: 'user_partial', text: runningText };
              } else {
                copy.push({ role: 'user_partial', text: runningText });
              }
              return copy;
            });
            // Speculative RAG prefetch — debounced, best-effort.
            const aid = agentIdRef.current;
            const sid = sessionIdRef.current;
            if (aid && sid && runningText.length >= 12 && runningText !== prefetchLastRef.current) {
              if (prefetchTimerRef.current) clearTimeout(prefetchTimerRef.current);
              const snapshot = runningText;
              prefetchTimerRef.current = window.setTimeout(() => {
                prefetchLastRef.current = snapshot;
                prefetchDemoRag(aid, sid, snapshot);
              }, 250) as unknown as number;
            }
          }
        }
        // Update conversation language from Deepgram's detected_language.
        if (evt.language) {
          const tag = BCP47[evt.language] || `${evt.language}-IN`;
          if (tag !== convLangRef.current) {
            console.log('[TestPanel] DG detected language change:', convLangRef.current, '→', tag);
            convLangRef.current = tag;
            setConvLang(tag);
          }
        }
      } else if (evt.type === 'speech_final') {
        const dgText = currentFinal.trim();
        currentFinal = '';
        setInput('');
        if (prefetchTimerRef.current) {
          clearTimeout(prefetchTimerRef.current);
          prefetchTimerRef.current = null;
        }
        // Deepgram fires speech_final on silence due to endpointing — ignore it.
        // With a persistent WS we just keep the connection open and wait for
        // the user to speak. No restart, no cycling. (This must stay ahead of
        // the barge-in branch below: an endpointing event is silence, and
        // silence must never cut off the agent mid-sentence.)
        if (dgText.length === 0) return;

        // The mic stays open while the agent speaks, so a transcript that
        // arrives during playback is either a real interruption or the agent's
        // own voice coming back through the mic. Echo repeats what we just
        // said, so compare the two: mostly-agent words are dropped, anything
        // else is treated as a genuine barge-in and cancels playback.
        if (ttsPlayingRef.current) {
          const ratio = agentEchoRatio(dgText, agentSpeechRef.current);
          if (ratio >= ECHO_RATIO) {
            console.log('[TestPanel] dropping echo of the agent\'s own speech', { dgText, ratio });
            // Drop the partial bubble the echo put in the transcript.
            setTranscript(prev => (
              prev.length && prev[prev.length - 1].role === 'user_partial'
                ? prev.slice(0, -1)
                : prev
            ));
            return;
          }
          console.log('[TestPanel] barge-in detected — stopping TTS', { ratio });
          ttsQueueRef.current?.cancel();
          ttsQueueRef.current = null;
          ttsPlayingRef.current = false;
          setTtsPlaying(false);
          // An interruption supersedes the turn being spoken, so release the
          // busy lock the barge-in turn would otherwise be blocked by.
          cancelActiveTurn();
        }

        sendRef.current(dgText);
      } else if (evt.type === 'error') {
        console.warn('[TestPanel] session STT WS error:', evt.message);
      }
    };

    ws.onerror = (e) => {
      console.warn('[TestPanel] session STT WS error event', e);
    };

    ws.onclose = () => {
      testSttWsRef.current = null;
      if (testActiveRef.current) {
        // Unexpected close while test is still running — auto-reconnect.
        console.warn('[TestPanel] session STT WS closed unexpectedly — reconnecting in 800ms...');
        setListening(false);
        setTimeout(() => {
          if (!testActiveRef.current) return;
          const lang = (convLangRef.current || 'en').split('-')[0];
          reopenTestSttWsRef.current?.(lang);
        }, 800);
      }
    };
  }

  /**
   * Start the raw PCM ScriptProcessor streamer for a given STT WebSocket.
   * Reads the mic stream from sessionMicStreamRef. Extracted so reopenTestSttWs
   * can restart it after a language-switch reconnection without duplicating the
   * setup code.
   *
   * The capture context is created at 16 kHz — the rate the STT backend wants —
   * so the browser resamples (with a proper anti-alias filter) instead of us
   * decimating by index, which folded everything above 8 kHz back into the
   * speech band and cost real transcription accuracy. It is deliberately NOT
   * the shared TTS graph context: that one also mixes the saved conversation
   * recording, which would then be captured at 16 kHz too.
   */
  function startPcmStreamerForTest(ws: WebSocket) {
    const micStream = sessionMicStreamRef.current;
    if (!micStream) return;
    try {
      if (!sttCtxRef.current) {
        const Ctor = (window.AudioContext || (window as any).webkitAudioContext);
        sttCtxRef.current = new Ctor({ sampleRate: 16000 });
      }
      const audioCtx = sttCtxRef.current;
      if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
      // 1024 frames @ 16 kHz = 64 ms per packet, about what the old
      // 4096 @ 48 kHz path sent, so streaming latency is unchanged.
      const micSrc  = audioCtx.createMediaStreamSource(micStream);
      const pcmNode = audioCtx.createScriptProcessor(1024, 1, 1);
      pcmNode.onaudioprocess = (e) => {
        if (ws.readyState !== WebSocket.OPEN) return;
        const float32 = e.inputBuffer.getChannelData(0);
        const int16   = new Int16Array(float32.length);
        for (let i = 0; i < float32.length; i++) {
          int16[i] = Math.max(-32768, Math.min(32767, Math.round(float32[i] * 32767)));
        }
        ws.send(int16.buffer);
      };
      micSrc.connect(pcmNode);
      pcmNode.connect(audioCtx.destination);   // must be connected to fire onaudioprocess
      sttPcmNodeRef.current = pcmNode;
      sttPcmSrcRef.current  = micSrc;
      console.log('[TestPanel] STT PCM streamer started (capture ctx @ %d Hz)', audioCtx.sampleRate);
    } catch (err) {
      console.error('[TestPanel] startPcmStreamerForTest failed', err);
    }
  }

  /**
   * Close the current session STT WebSocket and open a fresh one with a new
   * language code, then restart the PCM streamer on the new socket.
   * Called from the convLang useEffect whenever the active conversation
   * language changes mid-test (e.g. user switches from English to Hindi).
   * No-op if no test is currently active.
   */
  function reopenTestSttWs(newLang: string) {
    if (!testActiveRef.current) return;
    console.log('[TestPanel] reopening STT WS for language:', newLang);

    // Disconnect old PCM streamer first so onaudioprocess stops sending to
    // the old socket.
    try { sttPcmNodeRef.current?.disconnect(); } catch {}
    try { sttPcmSrcRef.current?.disconnect();  } catch {}
    sttPcmNodeRef.current = null;
    sttPcmSrcRef.current  = null;

    // Null out handlers BEFORE closing so onclose doesn't misfire as a test
    // failure and update the UI unnecessarily.
    const oldWs = testSttWsRef.current;
    if (oldWs) {
      oldWs.onmessage = null;
      oldWs.onerror   = null;
      oldWs.onclose   = null;
      try {
        if (oldWs.readyState === WebSocket.OPEN)
          oldWs.send(JSON.stringify({ type: 'close' }));
        oldWs.close();
      } catch {}
    }

    // Open the new socket with the updated language and wire it up.
    const newWs = new WebSocket(sttStreamUrl(newLang));
    newWs.binaryType = 'arraybuffer';
    testSttWsRef.current = newWs;
    setupTestSttWs(newWs);

    const startNew = () => startPcmStreamerForTest(newWs);
    if (newWs.readyState === WebSocket.OPEN) startNew();
    else newWs.addEventListener('open', startNew, { once: true });
  }
  // Keep the ref in sync so the convLang useEffect (and any other caller)
  // always invokes the latest closure without a forward-reference issue.
  reopenTestSttWsRef.current = reopenTestSttWs;

  // ── Session-level recording (full conversation) ─────────────────────────────
  /**
   * Click handler for Start test. Everything real happens in startTestSession();
   * this wrapper owns the re-entrancy guard, because startTestSession awaits
   * getUserMedia (up to a second or two, longer with a permission prompt) before
   * it sets testActive — and a second click inside that window used to build a
   * whole second pipeline, overwriting sessionRecorderRef / testSttWsRef so the
   * first recorder was never stopped (mic never released) and two sockets
   * streamed the same audio, duplicating every turn.
   */
  async function startTest() {
    if (testActiveRef.current || startingTestRef.current) return;
    startingTestRef.current = true;
    setTestStarting(true);
    // Must happen inside the click handler: this is the only user gesture the
    // shared <audio> element ever sees.
    unlockTtsAudio();
    try {
      await startTestSession();
    } finally {
      startingTestRef.current = false;
      setTestStarting(false);
    }
  }

  async function startTestSession() {
    if (!agentId) {
      addToast('Pick or create an agent above first.', 'info');
      return;
    }
    if (!HAS_MEDIA_RECORDER) {
      addToast('Your browser does not support audio recording.', 'error');
      return;
    }

    let micStream: MediaStream;
    try {
      micStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (e: any) {
      console.error('[TestPanel] session getUserMedia failed', e);
      posthog.capture(
        e?.name === 'NotAllowedError' ? 'test_call_mic_denied' : 'test_call_mic_error',
        { name: e?.name },
      );
      addToast(
        e?.name === 'NotAllowedError'
          ? 'Microphone permission denied — allow it in the address-bar lock icon.'
          : 'Could not access the microphone.',
        'error',
        { skipCapture: true },
      );
      return;
    }
    sessionMicStreamRef.current = micStream;

    // Build a Web Audio graph that mixes mic + the TTS output element.
    let mixedStream: MediaStream;
    try {
      const { ctx, recordingDest } = ensureTtsAudioGraph();
      // The recording destination already has TTS routed in; add the mic.
      const micSource = ctx.createMediaStreamSource(micStream);
      micSource.connect(recordingDest);
      mixedStream = recordingDest.stream;
      // Make sure the AC is running (browsers suspend it when there's no
      // user gesture; clicking Start Test counts).
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    } catch (e) {
      console.error('[TestPanel] failed to build audio graph', e);
      micStream.getTracks().forEach(t => t.stop());
      addToast('Could not start session recording.', 'error');
      return;
    }

    let mime = '';
    for (const candidate of [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/mp4',
    ]) {
      if ((MediaRecorder as any).isTypeSupported?.(candidate)) {
        mime = candidate;
        break;
      }
    }

    sessionChunksRef.current     = [];
    sessionTranscriptRef.current = '';
    sessionMimeRef.current       = mime || 'audio/webm';
    sessionStartAtRef.current    = performance.now();

    let rec: MediaRecorder;
    try {
      rec = new MediaRecorder(mixedStream, mime ? { mimeType: mime } : undefined);
    } catch (e) {
      console.error('[TestPanel] session MediaRecorder failed', e);
      micStream.getTracks().forEach(t => t.stop());
      addToast('Could not start session recording.', 'error');
      return;
    }

    rec.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) sessionChunksRef.current.push(ev.data);
    };
    rec.onerror = (ev: any) => console.warn('[TestPanel] session recorder error', ev);
    rec.onstop  = async () => {
      // Stop the mic tracks so the recording dot disappears in the
      // browser tab and the OS releases the device.
      try { sessionMicStreamRef.current?.getTracks().forEach(t => t.stop()); } catch {}
      sessionMicStreamRef.current = null;

      const blob = new Blob(sessionChunksRef.current, { type: sessionMimeRef.current });
      const durationMs = Math.round(performance.now() - sessionStartAtRef.current);
      sessionChunksRef.current = [];
      sessionRecorderRef.current = null;
      setTestActive(false);

      if (blob.size < 1024) {
        console.log('[TestPanel] session recording too short, skipping upload');
        return;
      }

      // Upload as a single demo_session row (turn_index = 0, role = mixed).
      try {
        const sid = await ensureSession();
        if (!sid) throw new Error('No session for upload');
        await uploadRecording({
          agentId,
          sessionId: sid,
          role: 'mixed',
          turnIndex: 0,
          audio: blob,
          transcript: sessionTranscriptRef.current.slice(0, 6000),
          languageCode: convLangRef.current.split('-')[0] || 'en',
          durationMs,
          recordingType: 'demo_session',
        });
        logger.info('[TestPanel] session recording uploaded', { agentId, sessionId: sid, durationMs, blobSize: blob.size });
        addToast('Recording saved · view it in Voice Bots → Live Call Logs', 'success');
      } catch (err) {
        logger.error('[TestPanel] session recording upload failed', { agentId, error: err });
        addToast('Recording was captured but upload failed — check the console.', 'error');
      }
    };

    try {
      rec.start(1000);                  // chunk every 1s for resilience
      sessionRecorderRef.current = rec;
      setTestActive(true);
      testActiveRef.current = true;
      addToast('Test started — talk to the agent. Stop when you are done.', 'success');

      // Open a single persistent STT WebSocket for the entire test session.
      // Use the agent's current primary language (convLangRef) so IndicConformer
      // transcribes in the right script from the very first utterance.
      // If the conversation language changes later (backend switches to Hindi
      // mid-session), the convLang useEffect will call reopenTestSttWs() to
      // reconnect with the new language — no manual WS cycling needed.
      const initSttLang = convLangRef.current.split('-')[0] || 'en';
      const sttWs = new WebSocket(sttStreamUrl(initSttLang));
      sttWs.binaryType = 'arraybuffer';
      testSttWsRef.current = sttWs;
      setupTestSttWs(sttWs);

      // Raw PCM streamer: mic → 16 kHz capture context → Int16 → WS.
      // Delegates to startPcmStreamerForTest() so reopenTestSttWs() can restart
      // it with a new socket after a language-switch reconnection.
      const startPcmStreamer = () => {
        startPcmStreamerForTest(sttWs);
        setListening(true);
      };

      if (sttWs.readyState === WebSocket.OPEN) startPcmStreamer();
      else sttWs.addEventListener('open', startPcmStreamer, { once: true });

    } catch (e) {
      console.error('[TestPanel] session start failed', e);
      micStream.getTracks().forEach(t => t.stop());
      addToast('Could not start session recording.', 'error');
    }
  }

  /**
   * Tear the whole test down: kill flags first, then TTS, STT and the recorder.
   *
   * This is the single teardown path — Stop test, agent switch, unmount and
   * pagehide all come through here, because it is the only thing that stops the
   * session mic tracks and flushes the conversation recording (both live in
   * sessionRecorder.onstop, which only runs if we call .stop()).
   */
  function stopTest() {
    if (!testActiveRef.current) return;
    // Set flags FIRST — prevents any in-flight callbacks (ttsQueue
    // onActiveChange, setupTestSttWs speech_final) from triggering new turns.
    testActiveRef.current  = false;

    // Cancel TTS + abandon the in-flight turn so we stop paying for synthesis
    // and SSE we will never use.
    ttsQueueRef.current?.cancel();
    ttsQueueRef.current = null;
    turnAbortRef.current?.abort();
    turnAbortRef.current = null;

    // Tear down the session-level STT pipeline cleanly.
    setListening(false);

    // Disconnect the raw PCM ScriptProcessor streamer and close its context —
    // otherwise onaudioprocess keeps firing every 64ms for the life of the tab.
    try {
      sttPcmNodeRef.current?.disconnect();
      sttPcmSrcRef.current?.disconnect();
    } catch {}
    sttPcmNodeRef.current = null;
    sttPcmSrcRef.current  = null;
    const sttCtx = sttCtxRef.current;
    sttCtxRef.current = null;
    try { sttCtx?.close(); } catch {}

    const sttWs = testSttWsRef.current;
    testSttWsRef.current = null;
    try {
      if (sttWs?.readyState === WebSocket.OPEN) {
        sttWs.send(JSON.stringify({ type: 'close' }));
      }
      sttWs?.close();
    } catch {}

    // Stop the session audio recorder (onstop stops the mic tracks and handles
    // the S3 upload). If it never started — or .stop() throws because it is
    // already inactive — release the mic here instead, or the tracks stay live.
    const rec = sessionRecorderRef.current;
    let stopped = false;
    if (rec) {
      try { rec.stop(); stopped = true; } catch {}
    }
    if (!stopped) {
      try { sessionMicStreamRef.current?.getTracks().forEach(t => t.stop()); } catch {}
      sessionMicStreamRef.current = null;
    }
    // Never leave the button reading "Stop test" once the flags say otherwise.
    setTestActive(false);
  }

  return (
    <aside style={panel}>
      <header style={panelHeader}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            style={{
              width: 8, height: 8, borderRadius: '50%',
              background: listening ? 'var(--red)' : 'var(--green)',
              boxShadow: `0 0 10px ${listening ? 'var(--red)' : 'var(--green)'}`,
            }}
          />
          <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)', margin: 0 }}>
            Test the agent
          </h3>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            type="button"
            onClick={() => setVoiceOut(v => !v)}
            title={voiceOut ? 'Mute agent voice' : 'Unmute agent voice'}
            aria-pressed={voiceOut}
            style={{
              fontSize: 11, fontWeight: 600,
              padding: '4px 9px', borderRadius: 7,
              background: voiceOut ? `${tintHi[tint]}33` : 'var(--tint-1)',
              border: `1px solid ${voiceOut ? tintHi[tint] : 'var(--border)'}`,
              color: voiceOut ? 'var(--text-1)' : 'var(--text-3)',
              cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 5,
              transition: 'all 0.15s',
            }}
          >
            <SpeakerIcon on={voiceOut} />
            {voiceOut ? 'Voice on' : 'Voice off'}
          </button>
          <span
            title={`Conversation language: ${convLang}`}
            style={{
              fontSize: 10.5, fontWeight: 600, color: 'var(--text-2)',
              padding: '2px 7px', borderRadius: 99,
              background: 'var(--tint-1)', border: '1px solid var(--border)',
              fontFamily: "'Zalando Sans'",
            }}
          >
            {convLang.split('-')[0].toUpperCase()}
          </span>
          <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
            {busy ? 'Thinking…' : listening ? 'Listening…' : sessionId ? 'Live' : 'Idle'}
          </span>
        </div>
      </header>

      <div ref={scrollRef} style={transcriptArea}>
        {transcript.map((m, i) => {
          if (m.role === 'typing') {
            return (
              <div key={i} style={{ display: 'flex', gap: 6, padding: '4px 0' }}>
                {[0,1,2].map(k => (
                  <span
                    key={k}
                    className="typing-dot"
                    style={{
                      width: 6, height: 6, borderRadius: '50%',
                      background: 'var(--text-3)', display: 'block',
                      animationDelay: `${k * 0.2}s`,
                    }}
                  />
                ))}
              </div>
            );
          }

          // Language-switch system badge — shown as a centered pill between messages.
          if (m.role === 'lang_switch') {
            const label = m.lang ? (LANG_LABEL[m.lang] || m.lang.toUpperCase()) : '?';
            return (
              <div
                key={i}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  gap: 6, padding: '4px 0', opacity: 0.72,
                }}
              >
                <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                <span
                  style={{
                    fontSize: 10.5, fontWeight: 600,
                    color: 'var(--text-3)',
                    padding: '2px 9px', borderRadius: 99,
                    background: 'var(--tint-1)',
                    border: '1px solid var(--border)',
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    whiteSpace: 'nowrap',
                  }}
                >
                  <Icon name="globe" size={11} /> Switched to {label}
                </span>
                <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
              </div>
            );
          }

          const isUserSide = m.role === 'user' || m.role === 'user_partial';
          const isPartial  = m.role === 'user_partial';
          return (
            <div
              key={i}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: isUserSide ? 'flex-end' : 'flex-start',
                gap: 3,
              }}
            >
              <div
                className="ph-mask"
                style={{
                  maxWidth: '85%',
                  padding: '10px 14px',
                  borderRadius: isUserSide ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                  background: isUserSide ? 'var(--tint-2)' : tintHi[tint] + '33',
                  border: `1px solid ${isUserSide ? 'var(--border)' : tintHi[tint]}`,
                  color: 'var(--text-1)',
                  fontSize: 13.5,
                  lineHeight: 1.5,
                  whiteSpace: 'pre-wrap',
                  fontStyle: isPartial ? 'italic' : 'normal',
                  opacity: isPartial ? 0.7 : 1,
                }}
              >
                {m.text}
                {isPartial && (
                  <span
                    style={{
                      fontSize: 10, marginLeft: 6, color: 'var(--text-3)',
                      fontFamily: "'Zalando Sans'",
                    }}
                  >
                    …
                  </span>
                )}
              </div>
              {m.role === 'agent' && m.latencyMs != null && (
                <span
                  style={{
                    fontSize: 10, color: 'var(--text-4)',
                    fontFamily: "'Zalando Sans'",
                    paddingLeft: 4,
                  }}
                >
                  {m.latencyMs}ms
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '14px 0 8px' }}>
        {/* Big Start Test / Stop Test button — drives the whole session
            recording. While the test is active the mic auto-arms between
            turns; when stopped, the conversation audio is uploaded as a
            single demo_session recording. */}
        <button
          type="button"
          onClick={testActive ? stopTest : startTest}
          disabled={disabled || testStarting}
          style={{
            padding: '12px 22px', borderRadius: 999,
            background: testActive ? 'var(--red)' : 'var(--grad-brand)',
            border: 'none', color: '#fff',
            fontSize: 13.5, fontWeight: 600,
            cursor: disabled || testStarting ? 'not-allowed' : 'pointer',
            opacity: disabled || testStarting ? 0.5 : 1,
            display: 'inline-flex', alignItems: 'center', gap: 8,
            boxShadow: testActive
              ? '0 0 0 6px rgba(255,90,120,0.18), 0 0 24px rgba(255,90,120,0.5)'
              : '0 8px 22px -8px rgba(117,91,227,0.7)',
            transition: 'all 0.15s',
          }}
        >
          <Icon name={testActive ? 'pause' : 'mic'} size={14} />
          {testActive ? 'Stop test & save recording' : testStarting ? 'Starting…' : 'Start test'}
        </button>

        {testActive && (
          <div
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              fontSize: 11, color: 'var(--text-3)',
              fontFamily: "'Zalando Sans'",
            }}
          >
            <span
              style={{
                width: 7, height: 7, borderRadius: '50%',
                background: 'var(--red)', boxShadow: '0 0 8px var(--red)',
                animation: 'mic-pulse 1.6s ease-in-out infinite',
              }}
            />
            REC · session being captured
          </div>
        )}
      </div>
      <div style={{ textAlign: 'center', fontSize: 11.5, color: 'var(--text-3)', marginBottom: 12 }}>
        {disabled
          ? (disabledHint || 'Save the requirements to enable testing')
          : !HAS_MEDIA_RECORDER
            ? 'Your browser does not support audio recording — type below'
            : !testActive
              ? 'Click Start test to record the full conversation'
              : ttsPlaying
                ? 'Agent is speaking — talk over it to interrupt'
                : listening
                  ? 'Listening — speak now'
                  : 'Mic re-arms in a moment — keep talking'}
      </div>

      <div style={composer}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={disabled ? 'Save the prompt first…' : 'Type a question…'}
          disabled={disabled}
          style={{
            flex: 1, background: 'transparent', border: 'none', outline: 'none',
            color: 'var(--text-1)', fontSize: 13.5,
          }}
        />
        <button
          type="button"
          onClick={(ev) => { ev.preventDefault(); ev.stopPropagation(); send(input); }}
          aria-label="Send"
          disabled={!input.trim() || busy || disabled}
          style={{
            width: 32, height: 32, borderRadius: 8,
            background: input.trim() && !busy && !disabled ? tintHi[tint] : 'transparent',
            color: input.trim() && !busy && !disabled ? '#fff' : 'var(--text-3)',
            border: 'none',
            cursor: input.trim() && !busy && !disabled ? 'pointer' : 'default',
            display: 'grid', placeItems: 'center',
            transition: 'all 0.15s',
          }}
        >
          <Icon name="send" size={14} />
        </button>
      </div>

      <style>{`
        @keyframes mic-pulse {
          0%, 100% { transform: scale(1); }
          50%      { transform: scale(1.06); }
        }
      `}</style>
    </aside>
  );
}

const panel = {
  background: 'var(--card-bg)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  padding: 22,
  display: 'flex', flexDirection: 'column' as const,
  height: '100%',
  boxSizing: 'border-box' as const,
};
const panelHeader = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  marginBottom: 14,
  flexShrink: 0,
};
const transcriptArea = {
  flex: 1,
  minHeight: 180,
  display: 'flex', flexDirection: 'column' as const, gap: 10,
  padding: 12,
  background: 'var(--card-bg)',
  border: '1px solid var(--border)',
  borderRadius: 10,
  overflowY: 'auto' as const,
};
const composer = {
  display: 'flex', alignItems: 'center', gap: 8,
  padding: '10px 12px',
  background: 'var(--input-bg-strong)',
  border: '1px solid var(--border-strong)',
  borderRadius: 10,
};
