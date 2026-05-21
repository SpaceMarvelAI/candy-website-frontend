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
import Icon from '../../assets/icons';
import { startDemo, streamDemoTurn, prefetchDemoRag } from '../../api/demo';
import { synthesize } from '../../api/tts';
import { transcribe, streamUrl as sttStreamUrl } from '../../api/stt';
import { uploadRecording } from '../../api/recordings';
import { ApiError } from '../../api/client';
import { useApp } from '../../context/AppContext';

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
      _ttsAudio.src = '';
    }
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
  /** Notifier so the UI can pause speech recognition while audio plays. */
  onActiveChange?: (active: boolean) => void;

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
    this.cancelled = true;
    this.slots.forEach(p => p.then(u => u && URL.revokeObjectURL(u)).catch(() => {}));
    this.slots = [];
    stopTts();
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
          resolve();
        };
        audio.onended = done;
        audio.onerror = done;
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
 * Detect the script of a reply by counting characters in known Unicode
 * blocks. We do this client-side because the backend's fast-path API
 * always reports `language: "en"` even when the reply is in another
 * language, so we can't rely on that field for picking a TTS voice.
 */
function detectLang(text: string): string {
  // Order matters: pick the script with the most chars in the response.
  const buckets: Array<[RegExp, string]> = [
    [/[஀-௿]/g, 'ta-IN'],   // Tamil
    [/[ऀ-ॿ]/g, 'hi-IN'],   // Devanagari (Hindi)
    [/[ఀ-౿]/g, 'te-IN'],   // Telugu
    [/[ಀ-೿]/g, 'kn-IN'],   // Kannada
    [/[ഀ-ൿ]/g, 'ml-IN'],   // Malayalam
    [/[ঀ-৿]/g, 'bn-IN'],   // Bengali
    [/[਀-੿]/g, 'pa-IN'],   // Gurmukhi (Punjabi)
    [/[઀-૿]/g, 'gu-IN'],   // Gujarati
  ];
  let best: { lang: string; count: number } = { lang: 'en-US', count: 0 };
  for (const [re, lang] of buckets) {
    const m = text.match(re);
    if (m && m.length > best.count) best = { lang, count: m.length };
  }
  return best.lang;
}

async function speakReply(text: string, hintedLang: string = 'en-US', notify?: (msg: string) => void) {
  if (!text) return;
  try {
    // Detect the actual script — backend's fast-path always reports 'en'
    // even when the reply is in another language, so we re-detect.
    const detected = detectLang(text);
    const langTag  = detected !== 'en-US' ? detected : hintedLang;
    const primary  = langTag.split('-')[0];

    const t0 = performance.now();
    const blob = await synthesize({ text, language_code: primary });
    const url  = URL.createObjectURL(blob);
    const audio = getTtsAudio();

    // Cancel any in-progress playback before swapping the source.
    stopTts();

    audio.src = url;
    audio.onended = () => { URL.revokeObjectURL(url); };
    audio.onerror = (ev) => {
      console.warn('[TestPanel] TTS playback error', ev);
      URL.revokeObjectURL(url);
    };

    await audio.play();
    console.log('[TestPanel] TTS played', { lang: primary, fetch_ms: Math.round(performance.now() - t0) });
  } catch (e) {
    const status = (e as any)?.status;
    if (status === 503) {
      notify?.('Server TTS isn\'t configured — set ELEVENLABS_API_KEY in the backend .env and restart.');
    } else {
      console.warn('[TestPanel] TTS failed', e);
      notify?.(`Couldn't play voice: ${(e as Error).message || 'unknown error'}`);
    }
  }
}

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

// Languages routed to IndicWhisper (offline, no API key needed).
// Deepgram nova-3 multi fails on all of these — transcribes as garbage.
const INDIC_STT_LANGS = new Set([
  'ta', 'te', 'kn', 'ml', 'bn', 'gu', 'mr', 'pa',
  'as', 'or', 'ur', 'mai', 'sa', 'ne', 'si',
]);

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

  async warm(langCode: string, synthFn: (text: string, lang: string) => Promise<Blob>): Promise<void> {
    if (this.blobs.has(langCode) || this.inflight.has(langCode)) return;
    const text = this.pickPhrase(langCode);
    const p = synthFn(text, langCode).then(b => { this.blobs.set(langCode, { text, blob: b }); return b; })
      .catch(err => { console.warn('[FillerCache] warm failed', langCode, err); return null; })
      .finally(() => { this.inflight.delete(langCode); });
    this.inflight.set(langCode, p);
    await p;
  }

  async take(langCode: string, synthFn: (text: string, lang: string) => Promise<Blob>): Promise<Blob | null> {
    const cached = this.blobs.get(langCode);
    if (cached) {
      this.blobs.delete(langCode);
      this.warm(langCode, synthFn);   // background re-warm
      return cached.blob;
    }
    try {
      const text = this.pickPhrase(langCode);
      return await synthFn(text, langCode);
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
  // Continuous-conversation mode: once the user clicks the mic, we keep
  // re-arming speech recognition between turns until they click Stop.
  // Recognition is paused while TTS is playing so the agent's voice
  // doesn't bleed into the mic.
  const [continuous, setContinuous]   = useState(false);
  const [ttsPlaying, setTtsPlaying]   = useState(false);
  // Active conversation language (BCP-47 like 'en-US' / 'ta-IN'). Drives
  // both the STT recognition language and the TTS voice. Initialized
  // from the agent's primary language so a Hindi-first agent transcribes
  // Hindi from turn one. Auto-switches when the agent replies in a
  // different script.
  const [convLang, setConvLang] = useState(() => BCP47[primaryLang] || 'en-US');
  const scrollRef = useRef<HTMLDivElement>(null);
  const continuousRef = useRef(false);
  const ttsPlayingRef = useRef(false);
  const convLangRef = useRef('en-US');
  useEffect(() => { continuousRef.current = continuous; }, [continuous]);
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
        console.log('[TestPanel] eagerly starting demo session for', agentId);
        const t0 = performance.now();
        const s = await startDemo(agentId);
        const dt = Math.round(performance.now() - t0);
        if (cancelled) return;
        setSessionId(s.demo_session_id);
        console.log('[TestPanel] eager session ready in', dt, 'ms', s);
      } catch (e) {
        if (cancelled) return;
        console.warn('[TestPanel] eager startDemo failed; will retry on first turn', e);
      }
    })();
    return () => { cancelled = true; };
  }, [agentId, disabled]);

  // Cleanup any active recording / speech when the component unmounts.
  useEffect(() => {
    return () => {
      // Kill all flags before stopping anything — prevents onstop / onclose
      // callbacks from trying to re-arm after the component is gone.
      continuousRef.current = false;
      testActiveRef.current = false;
      ttsQueueRef.current?.cancel();
      ttsQueueRef.current = null;
      // Per-utterance mic (manual mode).
      try { mediaRecorderRef.current?.stop(); } catch {}
      try { mediaStreamRef.current?.getTracks().forEach(t => t.stop()); } catch {}
      teardownSilenceDetector();
      // Session-level persistent STT pipeline.
      try { testSttRecRef.current?.stop(); } catch {}
      try { testSttWsRef.current?.close(); } catch {}
      testSttRecRef.current   = null;
      testSttWsRef.current    = null;
      bhashiniChunksRef.current = [];
      stopTts();
      if (prefetchTimerRef.current) {
        clearTimeout(prefetchTimerRef.current);
        prefetchTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  // Stop in-flight speech if the user switches agents.
  useEffect(() => {
    stopTts();
  }, [agentId]);

  // Persist the voice-out preference.
  useEffect(() => {
    try { localStorage.setItem('candy.tts', voiceOut ? 'on' : 'off'); } catch {}
    if (!voiceOut) {
      stopTts();
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

  async function send(text: string) {
    console.log('[TestPanel] send clicked', { agentId, disabled, sessionId, text });
    const t = text.trim();
    if (!t || busy) return;
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
    setBusy(true);

    // Per-turn TTS queue + sentence pre-fetch (we kick the synthesize call
    // before the previous sentence even finishes playing). The queue
    // notifies us while audio is active so we can pause speech
    // recognition (otherwise the mic picks up Priya's own voice).
    const ttsQueue = new TtsQueue();
    ttsQueueRef.current = ttsQueue;

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
    const turnNumber     = (turnIndexRef.current ?? 0); // already incremented above
    const shortUtterance = t.split(/\s+/).filter(Boolean).length < 4;
    const skipFiller     = !voiceOut || turnNumber <= 1 || shortUtterance;
    // Dedup: show at most one TTS error toast per turn so we don't spam.
    let _ttsToastShown = false;

    if (!skipFiller) {
      const fillerLang = (convLangRef.current.split('-')[0] || 'en');
      const fillerPromise = _fillerCache.take(
        fillerLang,
        (text, lang) => synthesize({ text, language_code: lang }),
      ).then(blob => {
        if (!blob) throw new Error('no filler');
        return blob;
      });
      ttsQueue.enqueue(fillerPromise);
    }
    ttsQueue.onActiveChange = (active) => {
      setTtsPlaying(active);
      if (testActiveRef.current) {
        // In test mode the session STT WS stays open the whole time.
        // ttsPlayingRef already gates speech_final in setupTestSttWs so
        // we don't need to stop/start the mic around TTS playback.
        return;
      }
      if (active) {
        // Pause the mic mid-capture while the agent is speaking so the
        // TTS audio doesn't bleed into the next user utterance.
        stopListening();
      } else if (continuousRef.current) {
        // Audio finished and we're in continuous mode — re-arm the mic
        // automatically so the user can just keep talking.
        startListening();
      }
    };
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
      const turnIndex = turnIndexRef.current;

      // Per-turn audio uploads are gone — we now capture the whole
      // conversation via the session recorder (Start Test / Stop Test).
      // Just accumulate the user transcript for the session metadata.
      sessionTranscriptRef.current +=
        (sessionTranscriptRef.current ? '\n' : '') + `User: ${t}`;
      userChunksRef.current = [];

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
            // Language for TTS comes from the backend (active_language in onDone
            // updates convLangRef). Client-side script detection is removed —
            // the backend is the single source of truth for language switches.
            const primary  = convLangRef.current.split('-')[0] || 'en';
            const promise  = synthesize({ text: sentence, language_code: primary })
              .catch(err => {
                if (!_ttsToastShown) {
                  _ttsToastShown = true;
                  const _s = (err as any)?.status;
                  if (_s === 429) {
                    addToast('TTS quota exceeded — top up ElevenLabs or set DEEPGRAM_API_KEY as fallback.', 'error');
                  } else if (_s === 503 || !_s) {
                    addToast('Agent voice isn\'t available — set ELEVENLABS_API_KEY in the backend .env.', 'info');
                  } else {
                    addToast(`Voice synthesis failed (HTTP ${_s}) — check backend logs.`, 'error');
                  }
                }
                console.warn('[TestPanel] sentence TTS failed', err);
                throw err;
              });
            ttsQueue.enqueue(promise);
          }
        },
        onDone: ({ full_text, latency_ms, active_language, language_switched, switch_ack }) => {
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
      }, undefined, currentLangCode);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : (e as Error).message;
      setTranscript(prev => [
        ...prev.filter(m => m.role !== 'typing'),
        { role: 'agent', text: `⚠️  ${msg}` },
      ]);
    } finally {
      setBusy(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  }

  // -- Mic capture state ------------------------------------------------------
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef   = useRef<MediaStream    | null>(null);
  const silenceTimerRef  = useRef<number          | null>(null);
  const audioCtxRef      = useRef<AudioContext   | null>(null);
  const sttSocketRef     = useRef<WebSocket     | null>(null);
  const sttFinalRef      = useRef<string>('');
  const sttDetectedRef   = useRef<string | null>(null);
  // If the STT WS keeps failing within milliseconds of opening, fall
  // back to the REST /transcribe endpoint instead of looping forever.
  const sttFailRef       = useRef<{ count: number; lastAt: number }>({ count: 0, lastAt: 0 });
  const useRestSttRef    = useRef<boolean>(false);
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
  // Session-level persistent STT WebSocket + recorder. Opened ONCE in
  // startTest() and closed in stopTest(). This eliminates the per-utterance
  // WS open/close cycling that caused Deepgram to reconnect on every turn
  // (and on every endpointing event while the user was silent between turns).
  const testSttWsRef   = useRef<WebSocket          | null>(null);
  const testSttRecRef  = useRef<MediaRecorder      | null>(null);
  /** ScriptProcessorNode that streams raw int16 PCM to the STT WebSocket. */
  const sttPcmNodeRef  = useRef<ScriptProcessorNode | null>(null);
  const sttPcmSrcRef   = useRef<MediaStreamAudioSourceNode | null>(null);
  /** Stable ref to reopenTestSttWs so setupTestSttWs (defined before the
   *  function) can trigger a WS reconnect without a forward-reference error. */
  const reopenTestSttWsRef = useRef<((lang: string) => void) | null>(null);
  /** Bhashini audio buffer — raw mic Blobs since the last speech_final.
   *  On speech_final, if convLang is a Bhashini language, we POST this
   *  buffer to /v1/stt/transcribe?provider=bhashini instead of using the
   *  Deepgram transcript (which fails on Dravidian / Indian regional langs). */
  const bhashiniChunksRef = useRef<Blob[]>([]);
  const bhashiniMimeRef   = useRef<string>('audio/webm');
  const sessionRecorderRef     = useRef<MediaRecorder | null>(null);
  const sessionChunksRef       = useRef<Blob[]>([]);
  const sessionMimeRef         = useRef<string>('audio/webm');
  const sessionMicStreamRef    = useRef<MediaStream    | null>(null);
  const sessionStartAtRef      = useRef<number>(0);
  const sessionTranscriptRef   = useRef<string>('');
  /** True when we've already auto-sent this turn (e.g. on speech_final) so
   *  the recorder.onstop callback doesn't fire a duplicate. */
  const sttSentRef       = useRef<boolean>(false);
  /** Mic audio buffer for the current utterance. After the turn fires we
   *  POST this whole blob to /recording with role=user. */
  const userChunksRef    = useRef<Blob[]>([]);
  const userMimeRef      = useRef<string>('audio/webm');
  /** Monotonic per-session turn counter so user/agent rows pair up. */
  const turnIndexRef     = useRef<number>(0);
  /** The session ID we last uploaded recordings against — used so we
   *  don't try to upload before a session exists. */
  const uploadSessionRef = useRef<string | null>(null);

  /**
   * Post buffered audio chunks to /v1/stt/transcribe (IndicWhisper, offline).
   * Returns the transcript string, or null if the call fails.
   * Clears the chunk buffer after consumption.
   */
  async function transcribeWithIndicWhisper(lang: string): Promise<string | null> {
    const chunks = bhashiniChunksRef.current.splice(0);
    if (chunks.length === 0) return null;
    const mime = bhashiniMimeRef.current || 'audio/webm';
    const blob = new Blob(chunks, { type: mime });
    const form = new FormData();
    form.append('audio', blob, 'audio.webm');
    form.append('language_code', lang);
    form.append('provider', 'indic_whisper');
    try {
      const res = await fetch('/v1/stt/transcribe', { method: 'POST', body: form });
      if (!res.ok) {
        console.warn('[TestPanel] IndicWhisper STT HTTP', res.status);
        return null;
      }
      const data = await res.json();
      return (data.transcript || '').trim() || null;
    } catch (e) {
      console.warn('[TestPanel] IndicWhisper STT fetch failed', e);
      return null;
    }
  }

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
            if (agentId && sessionId && runningText.length >= 12 && runningText !== prefetchLastRef.current) {
              if (prefetchTimerRef.current) clearTimeout(prefetchTimerRef.current);
              const snapshot = runningText;
              prefetchTimerRef.current = window.setTimeout(() => {
                prefetchLastRef.current = snapshot;
                prefetchDemoRag(agentId, sessionId, snapshot);
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
        // the user to speak. No restart, no cycling.
        if (dgText.length === 0 && bhashiniChunksRef.current.length === 0) return;

        // Gate on TTS: if the agent is speaking, don't send a turn. Echo
        // cancellation removes most TTS bleed-through from the mic signal,
        // but this gate is the safety net for anything that slips through.
        if (ttsPlayingRef.current) {
          console.log('[TestPanel] speech_final during TTS playback — ignoring (barge-in not supported yet)');
          bhashiniChunksRef.current = [];  // discard buffered audio
          return;
        }

        // faster-whisper via WebSocket handles ALL 99 languages including all
        // Indic languages natively. No separate IndicWhisper REST call needed.
        bhashiniChunksRef.current = [];
        if (dgText.length === 0) return;
        send(dgText);
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
   * Reads the mic stream from sessionMicStreamRef and the AudioContext from
   * the shared TTS graph. Extracted so reopenTestSttWs can restart it after
   * a language-switch reconnection without duplicating the setup code.
   */
  function startPcmStreamerForTest(ws: WebSocket) {
    const micStream = sessionMicStreamRef.current;
    if (!micStream) return;
    try {
      const { ctx: audioCtx } = ensureTtsAudioGraph();
      const nativeSR  = audioCtx.sampleRate;   // e.g. 44100 or 48000
      const targetSR  = 16000;
      const frameSize = 4096;
      const ratio     = nativeSR / targetSR;
      const outLen    = Math.floor(frameSize / ratio);

      const micSrc  = audioCtx.createMediaStreamSource(micStream);
      const pcmNode = audioCtx.createScriptProcessor(frameSize, 1, 1);
      pcmNode.onaudioprocess = (e) => {
        if (ws.readyState !== WebSocket.OPEN) return;
        const float32 = e.inputBuffer.getChannelData(0);
        const int16   = new Int16Array(outLen);
        for (let i = 0; i < outLen; i++) {
          const s = float32[Math.round(i * ratio)];
          int16[i] = Math.max(-32768, Math.min(32767, Math.round(s * 32767)));
        }
        ws.send(int16.buffer);
      };
      micSrc.connect(pcmNode);
      pcmNode.connect(audioCtx.destination);   // must be connected to fire onaudioprocess
      sttPcmNodeRef.current = pcmNode;
      sttPcmSrcRef.current  = micSrc;
      console.log('[TestPanel] STT PCM streamer started (nativeSR=%d → 16kHz)', nativeSR);
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

  async function startListening() {
    if (!HAS_MEDIA_RECORDER) {
      addToast('Your browser doesn\'t support audio recording.', 'info');
      return;
    }
    if (disabled) {
      addToast(disabledHint || 'Save the requirements first', 'info');
      return;
    }
    if (listening) return;
    // Defensive: if a previous recorder/socket is still around (e.g.
    // React fast-refresh re-ran the effect mid-test), tear it down
    // before starting a new one. Otherwise we'd open a duplicate WS.
    if (mediaRecorderRef.current) {
      try { mediaRecorderRef.current.stop(); } catch {}
      mediaRecorderRef.current = null;
    }
    if (mediaStreamRef.current) {
      try { mediaStreamRef.current.getTracks().forEach(t => t.stop()); } catch {}
      mediaStreamRef.current = null;
    }
    if (sttSocketRef.current) {
      // Detach our handlers BEFORE close so the closure-side onclose
      // doesn't tally this as a "fast fail" — that was forcing the
      // session into REST fallback after just two startListening calls.
      const old = sttSocketRef.current;
      old.onmessage = null;
      old.onerror   = null;
      old.onclose   = null;
      try { old.close(); } catch {}
      sttSocketRef.current = null;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (e: any) {
      console.error('[TestPanel] getUserMedia failed', e);
      addToast(
        e?.name === 'NotAllowedError'
          ? 'Microphone permission denied — allow it in the address-bar lock icon.'
          : 'Could not access the microphone.',
        'error',
      );
      return;
    }

    mediaStreamRef.current = stream;

    // Pick a recording mime type the browser actually supports.
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

    let rec: MediaRecorder;
    try {
      rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    } catch (e) {
      console.error('[TestPanel] MediaRecorder init failed', e);
      stream.getTracks().forEach(t => t.stop());
      addToast('Could not start the recorder.', 'error');
      return;
    }

    sttFinalRef.current    = '';
    sttDetectedRef.current = null;
    sttSentRef.current     = false;

    // If a previous attempt at the streaming STT collapsed twice in a
    // row (e.g. nova-3 not enabled, account quota hit, weird audio
    // codec) we silently switch to the REST /transcribe path for the
    // remainder of this session. That keeps the conversation working
    // at the cost of a slightly longer post-pause delay.
    if (useRestSttRef.current) {
      console.log('[TestPanel] using REST transcribe fallback for this turn');
      startRecorderRestMode(stream, mime);
      return;
    }

    let ws: WebSocket;
    try {
      // Always use multi-language detection so Deepgram picks up Hindi,
      // Tamil, English, etc. automatically. The backend owns language state;
      // detected language propagates back via evt.language in onmessage.
      ws = new WebSocket(sttStreamUrl('multi'));
      ws.binaryType = 'arraybuffer';
    } catch (e) {
      console.error('[TestPanel] STT WS init failed', e);
      stream.getTracks().forEach(t => t.stop());
      addToast('Could not open the streaming transcriber.', 'error');
      return;
    }
    sttSocketRef.current = ws;
    const wsOpenedAt = performance.now();
    let gotAnyTranscript = false;
    let sentAnyAudio     = false;

    ws.onmessage = (ev) => {
      let evt: any;
      try { evt = JSON.parse(ev.data); } catch { return; }
      if (evt.type === 'partial' || evt.type === 'final') {
        if (evt.transcript) {
          gotAnyTranscript = true;
          if (evt.type === 'final') {
            sttFinalRef.current = (sttFinalRef.current + ' ' + evt.transcript).trim();
            setInput(sttFinalRef.current);
          } else {
            setInput((sttFinalRef.current + ' ' + evt.transcript).trim());
          }
          // Mirror the running transcript into the chat so the user
          // sees their own words appear in real time.
          const runningText = (sttFinalRef.current + ' ' + (evt.type === 'partial' ? evt.transcript : '')).trim();
          if (runningText) {
            setTranscript(prev => {
              const copy = [...prev];
              const last = copy[copy.length - 1];
              if (last && last.role === 'user_partial') {
                copy[copy.length - 1] = { role: 'user_partial', text: runningText };
              } else {
                copy.push({ role: 'user_partial', text: runningText });
              }
              return copy;
            });

            // Speculative RAG prefetch — debounced. Once the partial
            // grows past a meaningful threshold AND has changed since
            // the last fire, schedule a background retrieve so the
            // chunks are already cached when the user finishes.
            if (
              agentId &&
              sessionId &&
              runningText.length >= 12 &&
              runningText !== prefetchLastRef.current
            ) {
              if (prefetchTimerRef.current) {
                clearTimeout(prefetchTimerRef.current);
              }
              const snapshot = runningText;
              prefetchTimerRef.current = window.setTimeout(() => {
                prefetchLastRef.current = snapshot;
                prefetchDemoRag(agentId, sessionId, snapshot);
              }, 250) as unknown as number;
            }
          }
        }
        if (evt.language && !sttDetectedRef.current) {
          sttDetectedRef.current = evt.language;
        }
      } else if (evt.type === 'speech_final') {
        // Deepgram fires speech_final after endpointing=300ms of silence in
        // the audio stream — including when the mic is open but the user
        // isn't speaking yet. Only finalize when there's actual transcript
        // text; otherwise we'd loop: silent audio → speech_final → no text
        // → startListening() → new silent audio → speech_final → ...
        if (sttFinalRef.current.trim().length > 0) {
          finalizeSttAndSend();
        }
      } else if (evt.type === 'error') {
        console.warn('[TestPanel] STT WS error', evt.message);
        addToast(`Transcription service error: ${evt.message}`, 'error');
      }
    };
    ws.onerror = (e) => {
      console.warn('[TestPanel] STT WS error event', e);
    };
    ws.onclose = () => {
      sttSocketRef.current = null;
      const dt = performance.now() - wsOpenedAt;
      // Only count this as a "fast fail" if we actually sent audio AND
      // got nothing back AND it died fast. That excludes the case where
      // we opened a WS, never started recording (e.g. user cancelled
      // mid-handshake), and closed it cleanly.
      if (!gotAnyTranscript && sentAnyAudio && dt < 2000) {
        const now = performance.now();
        const f = sttFailRef.current;
        if (now - f.lastAt < 5000) f.count += 1;
        else f.count = 1;
        f.lastAt = now;
        if (f.count >= 3 && !useRestSttRef.current) {
          useRestSttRef.current = true;
          console.warn('[TestPanel] streaming STT failing — switching to REST fallback');
          addToast(
            'Live transcription is having issues — switching to the slower fallback for this session.',
            'info',
          );
        }
      } else if (gotAnyTranscript) {
        sttFailRef.current = { count: 0, lastAt: 0 };
      }
    };

    // Reset per-utterance buffers.
    userChunksRef.current = [];
    userMimeRef.current   = rec.mimeType || mime || 'audio/webm';

    rec.ondataavailable = (ev) => {
      if (!ev.data || ev.data.size === 0) return;
      // Keep a local copy so we can upload the whole utterance to S3
      // after the turn fires (separate from the streaming-to-DG path).
      userChunksRef.current.push(ev.data);
      // Stream every chunk straight to the backend — Deepgram receives
      // audio while the user is still speaking, so the final transcript
      // arrives ~150ms after they stop instead of (silence + upload +
      // process) ≈ 800–1200ms with the REST endpoint.
      if (ws.readyState === WebSocket.OPEN) {
        ev.data.arrayBuffer().then(buf => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(buf);
            sentAnyAudio = true;
          }
        }).catch(() => {});
      }
    };

    rec.onstart = () => {
      console.log('[TestPanel] mic started (streaming)', mime || 'default');
      setListening(true);
      armSilenceDetector(stream);
    };

    rec.onerror = (ev: any) => {
      console.error('[TestPanel] recorder error', ev);
      addToast('Voice input error.', 'error');
    };

    rec.onstop = () => {
      teardownSilenceDetector();
      stream.getTracks().forEach(t => t.stop());
      mediaRecorderRef.current = null;
      mediaStreamRef.current   = null;
      setListening(false);
      // Tell the backend we're done — it'll close the DG socket and
      // flush any remaining transcript event.
      try {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'close' }));
        }
      } catch {}
      // If Deepgram's `speech_final` already fired we already sent — but
      // give it a brief grace period in case the close → final race
      // wasn't decided yet.
      setTimeout(finalizeSttAndSend, 250);
    };

    // Kick the WS open, then start recording.
    const startRec = () => {
      try {
        rec.start(150);                 // smaller chunks = lower stream lag
        mediaRecorderRef.current = rec;
      } catch (e) {
        console.error('[TestPanel] recorder start failed', e);
        stream.getTracks().forEach(t => t.stop());
        addToast('Could not start the recorder.', 'error');
        setListening(false);
      }
    };
    if (ws.readyState === WebSocket.OPEN) startRec();
    else ws.addEventListener('open', startRec, { once: true });
  }

  /** Promote the latest final/interim transcript into a turn, exactly once. */
  function finalizeSttAndSend() {
    if (sttSentRef.current) return;
    if (prefetchTimerRef.current) {
      clearTimeout(prefetchTimerRef.current);
      prefetchTimerRef.current = null;
    }
    const text = sttFinalRef.current.trim();
    if (sttDetectedRef.current) {
      const tag = BCP47[sttDetectedRef.current] || `${sttDetectedRef.current}-IN`;
      if (tag !== convLangRef.current) {
        console.log('[TestPanel] STT detected language change:', convLangRef.current, '→', tag);
        convLangRef.current = tag;
        setConvLang(tag);
      }
    }
    if (text.length > 0) {
      sttSentRef.current = true;
      // Close the WS now — we don't need any more transcripts for this turn.
      try { sttSocketRef.current?.close(); } catch {}
      stopListening();
      setInput('');
      send(text);
    } else if (continuousRef.current && !ttsPlayingRef.current && testActiveRef.current) {
      // Only re-arm if the recorder is truly stopped. When speech_final fires
      // with no transcript (Deepgram endpointing on silent audio) the recorder
      // is still running — we must NOT open a second WS on top of it, which
      // is what was causing the cycling loop. If the recorder is already gone
      // (e.g. onstop fired first) this is a legitimate dead-mic restart.
      if (!mediaRecorderRef.current) {
        setTimeout(() => {
          if (
            continuousRef.current &&
            !ttsPlayingRef.current &&
            testActiveRef.current &&
            !mediaRecorderRef.current
          ) startListening();
        }, 200);
      }
    }
  }

  function stopListening() {
    try { mediaRecorderRef.current?.stop(); } catch {}
  }

  /**
   * Fallback recording path used when the streaming WS is failing.
   * Buffers the whole utterance into a Blob and POSTs it to the REST
   * /v1/stt/transcribe endpoint. Slower, but reliable.
   */
  function startRecorderRestMode(stream: MediaStream, mime: string) {
    let rec: MediaRecorder;
    try {
      rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    } catch (e) {
      console.error('[TestPanel] REST recorder init failed', e);
      stream.getTracks().forEach(t => t.stop());
      addToast('Could not start the recorder.', 'error');
      return;
    }
    const chunks: Blob[] = [];
    userChunksRef.current = [];
    userMimeRef.current   = rec.mimeType || mime || 'audio/webm';

    rec.ondataavailable = (ev) => {
      if (!ev.data || ev.data.size === 0) return;
      chunks.push(ev.data);
      userChunksRef.current.push(ev.data);
    };
    rec.onstart = () => {
      console.log('[TestPanel] mic started (REST fallback)', rec.mimeType);
      setListening(true);
      armSilenceDetector(stream);
    };
    rec.onerror = (ev: any) => {
      console.error('[TestPanel] REST recorder error', ev);
      addToast('Voice input error.', 'error');
    };
    rec.onstop = async () => {
      teardownSilenceDetector();
      stream.getTracks().forEach(t => t.stop());
      mediaRecorderRef.current = null;
      mediaStreamRef.current   = null;
      setListening(false);

      const audioBlob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
      if (audioBlob.size < 800) {
        if (continuousRef.current && !ttsPlayingRef.current) {
          setTimeout(() => {
            if (continuousRef.current && !ttsPlayingRef.current) startListening();
          }, 200);
        }
        return;
      }

      try {
        const t0 = performance.now();
        const result = await transcribe(audioBlob, 'multi');
        console.log('[TestPanel] REST transcribed', { dt_ms: Math.round(performance.now() - t0), detected: result.detected_language });
        const txt = (result.transcript || '').trim();
        if (result.detected_language) {
          const tag = BCP47[result.detected_language] || `${result.detected_language}-IN`;
          if (tag !== convLangRef.current) {
            convLangRef.current = tag;
            setConvLang(tag);
          }
        }
        if (txt.length > 0) {
          setInput('');
          send(txt);
        } else if (continuousRef.current && !ttsPlayingRef.current) {
          setTimeout(() => {
            if (continuousRef.current && !ttsPlayingRef.current) startListening();
          }, 200);
        }
      } catch (e: any) {
        console.error('[TestPanel] REST transcribe failed', e);
        addToast(`Transcription failed: ${e?.message || 'unknown error'}`, 'error');
      }
    };

    try {
      rec.start(250);
      mediaRecorderRef.current = rec;
    } catch (e) {
      console.error('[TestPanel] REST recorder start failed', e);
      stream.getTracks().forEach(t => t.stop());
      addToast('Could not start the recorder.', 'error');
      setListening(false);
    }
  }

  // ── Session-level recording (full conversation) ─────────────────────────────
  async function startTest() {
    if (testActive) return;
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
      addToast(
        e?.name === 'NotAllowedError'
          ? 'Microphone permission denied — allow it in the address-bar lock icon.'
          : 'Could not access the microphone.',
        'error',
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
        addToast('Recording saved · view it in Voice Bots → Live Call Logs', 'success');
      } catch (err) {
        console.warn('[TestPanel] session upload failed', err);
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

      // STT MediaRecorder — streams the raw mic (echo-cancelled) directly
      // to Deepgram. Separate from the session recorder which uses the
      // mixed mic+TTS stream for the conversation audio file.
      let sttRec: MediaRecorder;
      try {
        sttRec = new MediaRecorder(micStream, mime ? { mimeType: mime } : undefined);
      } catch {
        sttRec = new MediaRecorder(micStream);
      }
      testSttRecRef.current = sttRec;

      bhashiniMimeRef.current = mime || 'audio/webm';
      sttRec.ondataavailable = (ev) => {
        // Buffer WebM blobs for batch transcription only (POST /v1/stt/transcribe).
        // Do NOT send to the STT WebSocket — it expects raw int16 PCM, not WebM.
        if (!ev.data || ev.data.size === 0) return;
        bhashiniChunksRef.current.push(ev.data);
      };

      // Raw PCM streamer: ScriptProcessorNode → downsample to 16 kHz → Int16 → WS.
      // Delegates to startPcmStreamerForTest() so reopenTestSttWs() can restart
      // it with a new socket after a language-switch reconnection.
      const startPcmStreamer = () => {
        startPcmStreamerForTest(sttWs);
        sttRec.start(300);    // keep MediaRecorder running for batch-transcribe buffer
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

  function stopTest() {
    if (!testActive) return;
    // Set flags FIRST — prevents any in-flight callbacks (ttsQueue
    // onActiveChange, setupTestSttWs speech_final) from triggering new turns.
    testActiveRef.current  = false;
    setContinuous(false);
    continuousRef.current  = false;

    // Cancel TTS first so onActiveChange(false) doesn't fire startListening().
    ttsQueueRef.current?.cancel();
    ttsQueueRef.current = null;
    stopTts();

    // Tear down the session-level STT pipeline cleanly.
    setListening(false);
    bhashiniChunksRef.current = [];  // discard any pending audio

    // Disconnect the raw PCM ScriptProcessor streamer.
    try {
      sttPcmNodeRef.current?.disconnect();
      sttPcmSrcRef.current?.disconnect();
    } catch {}
    sttPcmNodeRef.current = null;
    sttPcmSrcRef.current  = null;

    const sttRec = testSttRecRef.current;
    testSttRecRef.current = null;
    try { sttRec?.stop(); } catch {}

    const sttWs = testSttWsRef.current;
    testSttWsRef.current = null;
    try {
      if (sttWs?.readyState === WebSocket.OPEN) {
        sttWs.send(JSON.stringify({ type: 'close' }));
      }
      sttWs?.close();
    } catch {}

    // Stop the session audio recorder (onstop handles the S3 upload).
    try { sessionRecorderRef.current?.stop(); } catch {}
  }

  // Auto-stop the recorder after ~1.2s of silence so we don't capture
  // forever. Uses a Web Audio AnalyserNode to read RMS volume; below the
  // threshold for the sustained period → fire stop().
  function armSilenceDetector(stream: MediaStream) {
    teardownSilenceDetector();
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioCtxRef.current = ctx;
      const src = ctx.createMediaStreamSource(stream);
      const an  = ctx.createAnalyser();
      an.fftSize = 1024;
      src.connect(an);
      const data = new Uint8Array(an.frequencyBinCount);

      const SILENCE_RMS    = 0.018;   // below this = quiet
      // SPEECH_RMS is intentionally higher than SILENCE_RMS. Using the same
      // value meant that a brief mic-initialization noise burst (common on
      // macOS/Chrome) would set speechSeenAt, and 500ms later the silence
      // detector would stop the recorder before the user even spoke — causing
      // the WebSocket to cycle endlessly without sending real audio.
      const SPEECH_RMS     = 0.040;   // above this = actual human speech
      const SILENCE_MS     = 600;     // need this long of quiet to stop
      const MAX_TURN_MS    = 15000;   // cap a single utterance at 15s
      const MIN_SPEECH_MS  = 400;     // require at least this much speech before
                                      // we'll honor a silent stretch — avoids
                                      // cutting on pre-utterance pause
      let silentSince: number | null = null;
      let speechSeenAt: number | null = null;
      const t0 = performance.now();

      const tick = () => {
        if (!mediaRecorderRef.current) return;
        an.getByteTimeDomainData(data);
        let sumSq = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sumSq += v * v;
        }
        const rms = Math.sqrt(sumSq / data.length);
        const now = performance.now();

        // Use the higher SPEECH_RMS to mark that real speech has started.
        // Silence is still detected at the lower SILENCE_RMS.
        if (rms >= SPEECH_RMS) {
          if (speechSeenAt === null) speechSeenAt = now;
          silentSince = null;
        } else {
          if (silentSince === null) silentSince = now;
          // Only stop if we've heard at least some speech for MIN_SPEECH_MS.
          const enoughSpeech = speechSeenAt !== null && (now - speechSeenAt) >= MIN_SPEECH_MS;
          if (enoughSpeech && now - silentSince > SILENCE_MS) {
            stopListening();
            return;
          }
        }
        if (now - t0 > MAX_TURN_MS) {
          stopListening();
          return;
        }
        silenceTimerRef.current = window.setTimeout(tick, 60) as unknown as number;
      };
      silenceTimerRef.current = window.setTimeout(tick, 120) as unknown as number;
    } catch (e) {
      console.warn('[TestPanel] silence detector unavailable', e);
    }
  }

  function teardownSilenceDetector() {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (audioCtxRef.current) {
      try { audioCtxRef.current.close(); } catch {}
      audioCtxRef.current = null;
    }
  }

  function toggleMic() {
    // First click → enter continuous mode and start.
    // Subsequent click → exit continuous mode AND stop any in-flight
    // recognition / TTS so the conversation halts cleanly.
    if (continuous || listening) {
      setContinuous(false);
      continuousRef.current = false;
      stopListening();
    } else {
      setContinuous(true);
      continuousRef.current = true;
      startListening();
    }
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
            const flag: Record<string, string> = {
              hi: '🇮🇳', ta: '🇮🇳', te: '🇮🇳', kn: '🇮🇳', ml: '🇮🇳', bn: '🇮🇳',
              es: '🇪🇸', fr: '🇫🇷', de: '🇩🇪', ja: '🇯🇵', ko: '🇰🇷', en: '🇬🇧',
            };
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
                  {flag[m.lang ?? ''] ?? '🌐'} Switched to {label}
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
          disabled={disabled}
          style={{
            padding: '12px 22px', borderRadius: 999,
            background: testActive ? 'var(--red)' : 'var(--grad-brand)',
            border: 'none', color: '#fff',
            fontSize: 13.5, fontWeight: 600,
            cursor: disabled ? 'not-allowed' : 'pointer',
            opacity: disabled ? 0.5 : 1,
            display: 'inline-flex', alignItems: 'center', gap: 8,
            boxShadow: testActive
              ? '0 0 0 6px rgba(255,90,120,0.18), 0 0 24px rgba(255,90,120,0.5)'
              : '0 8px 22px -8px rgba(117,91,227,0.7)',
            transition: 'all 0.15s',
          }}
        >
          <Icon name={testActive ? 'pause' : 'mic'} size={14} />
          {testActive ? 'Stop test & save recording' : 'Start test'}
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
              : listening
                ? 'Listening — speak now'
                : ttsPlaying
                  ? 'Agent is speaking — mic paused'
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
  background: 'var(--surface)',
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
  background: 'var(--tint-1)',
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
