/**
 * useVoiceCommand — push-to-talk voice control for the dashboard.
 *
 * Hold the mic button, or hold Alt+Space, and speak. There is no always-on
 * microphone and no idle socket: one utterance, one POST to /v1/stt/transcribe.
 * A `wake` flag is carried for a later wake-word mode over the streaming STT
 * socket, and is reported but not yet acted on.
 *
 * Capture follows src/components/agent/TestPanel.tsx, which already solved this
 * against real browsers: the same constraints, the same mime-type negotiation,
 * and the same rule that mic tracks are stopped on every exit path — recorder
 * stop, error, and unmount — or the tab keeps its recording indicator and the
 * OS never releases the device.
 *
 * CONSTRAINT: this hook must not be mounted on /agents/*. TestPanel is the only
 * other getUserMedia consumer in the codebase, and those routes render it (via
 * AgentWorkspace.tsx:296). Two MediaRecorder consumers on one page means
 * Alt+Space opens a second capture in the middle of a live test call. Voice on
 * those pages needs a shared mic arbiter, not a second recorder. AppLayout is
 * the only mount point, and /agents/* deliberately does not use it.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { transcribe, type TranscribeOut } from '../api/stt';
import { parseCommand } from '../api/voiceCommand';
import { addToast } from './useToast';
import { logger } from '../utils/logger';
import { errorMessage } from '../utils/apiError';
import { buildSnapshot, elementFor, findScroller } from '../voice/registry/store';
import { parseLocal } from '../voice/parseLocal';
import { spokenName } from '../voice/resolve';
import { validateAction } from '../voice/validate';
import { executeAction } from '../voice/execute';
import type { RejectReason, ScreenSnapshot, VoiceAction } from '../voice/types';

export type MicState = 'unsupported' | 'idle' | 'arming' | 'listening' | 'thinking' | 'error';

const HAS_MEDIA_RECORDER =
  typeof window !== 'undefined'
  && typeof (window as unknown as { MediaRecorder?: unknown }).MediaRecorder !== 'undefined';

/**
 * Below this we ask instead of acting.
 *
 * The scale is not linear in quality. The backend returns
 * min(exp(avg_logprob), 1 - no_speech_prob), and exp() of a mean log
 * probability is the geometric-mean per-token probability — clean speech sits
 * near 0.90 (avg_logprob about -0.1) and poor speech near 0.37 (about -1.0).
 * 0.55 corresponds to avg_logprob about -0.6, which is where Whisper output
 * stops being reliably worth acting on. Deliberately not 0.6: on this curve
 * that would start rejecting ordinary speech.
 */
const MIN_CONFIDENCE = 0.55;

/** Same order TestPanel negotiates, for the same browser-support reasons. */
const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];

function pickMime(): string {
  const supported = (MediaRecorder as unknown as { isTypeSupported?: (t: string) => boolean }).isTypeSupported;
  for (const candidate of MIME_CANDIDATES) {
    if (supported?.(candidate)) return candidate;
  }
  return '';
}

/**
 * "Do you mean Agents in Analytics, or Agents in Live Calls?"
 *
 * The label is repeated in full in every branch on purpose. This is heard, not
 * read — there is no column of options to scan back over, so each branch has to
 * stand on its own as a spoken phrase.
 */
function askWhich(names: readonly string[]): string {
  if (names.length === 0) return 'I am not sure which one you meant.';
  if (names.length === 1) return `Do you mean ${names[0]}?`;
  const head = names.slice(0, -1).join(', ');
  return `Do you mean ${head}, or ${names[names.length - 1]}?`;
}

/**
 * How to say each refusal the server can send back.
 *
 * validateAction() writes its own messages because it has the target in hand
 * and can name it. A server reject arrives with only a reason code — by design,
 * since the wording a user hears is a client decision and should not be
 * something an LLM gets to phrase. These are the fallbacks for that case, and
 * they are written to be heard rather than read.
 *
 * `unsupported` is the one that actually shows up today: it is what the
 * endpoint returns for click / type / select / search / scroll, which the model
 * may legitimately emit but voice/execute.ts cannot carry out until slices 4-6.
 * Its wording matches execute.ts's own default branch on purpose, so the same
 * situation sounds the same whichever layer noticed it.
 */
const REJECT_MESSAGES: Record<RejectReason, string> = {
  unknown_target: 'I could not find that on this screen.',
  not_visible:    'That is not on screen right now.',
  wrong_kind:     'I cannot do that with that one.',
  unavailable:    'That is not available yet.',
  invalid_value:  'I did not catch what to use for that.',
  not_executable: 'That was a question, not an action.',
  unsupported:    'I cannot do that yet.',
  unsafe:         'I am not going to do that.',
};

export interface UseVoiceCommandResult {
  state:     MicState;
  supported: boolean;
  /** Last transcript, so the user always sees what was heard. */
  heard:     string | null;
  /** What it resolved to, or why it did not. */
  outcome:   string | null;
  wake:      boolean;
  setWake:   (on: boolean) => void;
  press:     () => void;
  release:   () => void;
}

export function useVoiceCommand(): UseVoiceCommandResult {
  const navigate = useNavigate();
  const location = useLocation();

  const [state,   setState]   = useState<MicState>(HAS_MEDIA_RECORDER ? 'idle' : 'unsupported');
  const [heard,   setHeard]   = useState<string | null>(null);
  const [outcome, setOutcome] = useState<string | null>(null);
  const [wake,    setWake]    = useState(false);

  const streamRef   = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef   = useRef<Blob[]>([]);
  const mimeRef     = useRef('audio/webm');
  /** Set when release() lands during the getUserMedia await. */
  const abortRef    = useRef(false);
  /** One utterance at a time — a second press mid-transcription is ignored. */
  const busyRef     = useRef(false);
  const routeRef    = useRef(location.pathname);
  routeRef.current  = location.pathname;

  const releaseMic = useCallback(() => {
    try { streamRef.current?.getTracks().forEach(t => t.stop()); } catch { /* already gone */ }
    streamRef.current = null;
  }, []);

  const report = useCallback((message: string, ok: boolean) => {
    setOutcome(message);
    addToast(message, ok ? 'success' : 'info', { skipCapture: true });
  }, []);

  /** A snapshot of what is addressable right now, never cached between uses. */
  const snapshotNow = useCallback((): ScreenSnapshot => buildSnapshot(
    routeRef.current,
    typeof document !== 'undefined' ? document.title : '',
  ), []);

  /**
   * Check one action against the screen and carry it out.
   *
   * Shared by the local fast path and the server's answer so that both are held
   * to exactly the same checks. The server's own re-check of target ids does
   * not replace validateAction() and was never meant to: the server verifies
   * against the ids as they were SENT, which is what stops a fabricated id;
   * this verifies against what is on screen when the action is about to run,
   * which is what stops a real target that has since been hidden. A remote
   * answer that skipped this would be trusting a snapshot that is by then at
   * least a round trip old.
   */
  const runAction = useCallback((action: VoiceAction, snapshot: ScreenSnapshot) => {
    // Neither of these is a thing to do, so they are answered before
    // validateAction() — which would call both 'not_executable' and lose the
    // distinction between "which did you mean?" and "I cannot do that".
    if (action.kind === 'clarify') {
      report(askWhich(action.candidates), false);
      return;
    }
    if (action.kind === 'reject') {
      report(REJECT_MESSAGES[action.reason] ?? 'I cannot do that.', false);
      return;
    }

    const check = validateAction(action, snapshot);
    if (check.status === 'rejected') {
      report(check.message, false);
      return;
    }
    if (check.status === 'needs_confirmation') {
      report(check.prompt, false);
      return;
    }

    const result = executeAction(check.action, snapshot, {
      navigate:   (path) => navigate(path),
      goHistory:  (delta) => navigate(delta),
      getElement: elementFor,
      // Resolved per utterance, never cached: which element scrolls depends on
      // the route (full-bleed pages scroll an inner container, ordinary ones
      // scroll the document) and on where the caret is.
      getScroller: findScroller,
    });
    report(result.say, result.ok);
  }, [navigate, report]);

  const runTranscript = useCallback(async (out: TranscribeOut) => {
    const transcript = (out.transcript ?? '').trim();

    // Empty gets its own branch and never reaches the parser. _groq_transcribe
    // returns ("", "en") for a genuine silence, for an unsupported-language
    // drop AND for an HTTP failure, so an empty transcript is not a valid
    // utterance — handing it to the parser would parse the empty string.
    // drop_reason is what separates the three, so the message can be honest
    // about which happened instead of always blaming the speaker.
    if (!transcript) {
      setHeard(null);
      const failed = out.drop_reason != null && out.drop_reason !== 'empty';
      if (failed) {
        logger.warn('[voice] STT dropped the utterance', { drop_reason: out.drop_reason });
        report('Speech recognition is having trouble — try again in a moment.', false);
      } else {
        report('I did not catch that — hold the mic and try again.', false);
      }
      return;
    }

    setHeard(transcript);

    // Ask rather than act on a weak transcript. A null confidence means Groq
    // sent no segments to score, which is absence of evidence, not evidence of
    // a bad transcript — acting is right in that case.
    if (out.confidence != null && out.confidence < MIN_CONFIDENCE) {
      logger.debug('[voice] low confidence, asking instead', { transcript, confidence: out.confidence });
      report(`I heard "${transcript}" — say it again if that is right?`, false);
      return;
    }
    const route    = routeRef.current;
    const snapshot = snapshotNow();
    const parsed   = parseLocal(transcript, { route, targets: snapshot.targets });
    logger.debug('[voice] parsed', { transcript, route, kind: parsed.kind });

    if (parsed.kind === 'unavailable') {
      report(parsed.message, false);
      return;
    }

    // An ambiguity is never forwarded to the server. Two targets with the same
    // name are equally valid readings and no amount of language understanding
    // can pick between them — only the user can. See parseLocal's LocalParse.
    if (parsed.kind === 'ambiguous') {
      report(askWhich(parsed.candidates.map(spokenName)), false);
      return;
    }

    if (parsed.kind === 'miss') {
      // The local grammar could not answer, so ask the server. It gets the ids
      // that are on screen and may only choose from them.
      const remote = await parseCommand(transcript, snapshot);
      if (!remote) {
        // Null is "could not answer" — an unreachable model, a timeout, or a
        // response that was not an action. Distinct from a `reject`, which is
        // the server telling us successfully that this cannot be done.
        report('I did not understand that — try saying it a different way.', false);
        return;
      }
      logger.debug('[voice] server parsed', { kind: remote.kind });
      // Re-snapshot rather than reuse the one we sent. A round trip has passed:
      // the route may have changed and a target that was visible when we asked
      // may be behind a closed drawer by now. Visibility is never cached here,
      // and a network hop is the longest gap in the whole pipeline.
      runAction(remote, snapshotNow());
      return;
    }

    runAction(parsed.action, snapshot);
  }, [report, runAction, snapshotNow]);

  const handleBlob = useCallback(async (blob: Blob) => {
    if (blob.size === 0) {
      setState('idle');
      busyRef.current = false;
      report('I did not catch that — hold the mic and try again.', false);
      return;
    }
    setState('thinking');
    try {
      const out = await transcribe(blob);
      await runTranscript(out);
      setState('idle');
    } catch (err) {
      logger.error('[voice] transcribe failed', err);
      const message = errorMessage(err, 'Could not transcribe that.');
      setState('error');
      setOutcome(message);
      addToast(message, 'error');
    } finally {
      busyRef.current = false;
    }
  }, [report, runTranscript]);

  const press = useCallback(() => {
    if (!HAS_MEDIA_RECORDER || busyRef.current) return;
    if (recorderRef.current || streamRef.current) return;
    busyRef.current = true;
    abortRef.current = false;
    setState('arming');
    setOutcome(null);

    void (async () => {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
      } catch (err) {
        const name = (err as { name?: string })?.name;
        logger.error('[voice] getUserMedia failed', err);
        setState('error');
        busyRef.current = false;
        addToast(
          name === 'NotAllowedError'
            ? 'Microphone permission denied — allow it in the address-bar lock icon.'
            : 'Could not access the microphone.',
          'error',
        );
        return;
      }
      streamRef.current = stream;

      // The button may already have been let go while we were awaiting the
      // permission prompt, which can take seconds the first time.
      if (abortRef.current) {
        releaseMic();
        busyRef.current = false;
        setState('idle');
        return;
      }

      const mime = pickMime();
      mimeRef.current   = mime || 'audio/webm';
      chunksRef.current = [];

      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      } catch (err) {
        logger.error('[voice] MediaRecorder failed', err);
        releaseMic();
        busyRef.current = false;
        setState('error');
        addToast('Could not start recording.', 'error');
        return;
      }

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      recorder.onerror = (ev) => logger.warn('[voice] recorder error', ev);
      recorder.onstop  = () => {
        releaseMic();
        recorderRef.current = null;
        const blob = new Blob(chunksRef.current, { type: mimeRef.current });
        chunksRef.current = [];
        void handleBlob(blob);
      };

      recorderRef.current = recorder;
      recorder.start();
      setState('listening');

      // Released during recorder setup — stop now, so the utterance is still
      // processed rather than the mic being left open.
      if (abortRef.current) {
        try { recorder.stop(); } catch { /* already inactive */ }
      }
    })();
  }, [handleBlob, releaseMic]);

  const release = useCallback(() => {
    abortRef.current = true;
    const recorder = recorderRef.current;
    if (!recorder) return;
    try { recorder.stop(); } catch { /* already inactive */ }
  }, []);

  // Alt+Space, the keyboard equivalent of holding the button. Voice stays
  // additive — this never becomes the only way to reach anything.
  useEffect(() => {
    if (!HAS_MEDIA_RECORDER) return;
    const down = (e: KeyboardEvent) => {
      if (!e.altKey || e.code !== 'Space' || e.repeat) return;
      e.preventDefault();
      press();
    };
    const up = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      release();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [press, release]);

  // Unmount must release the device even mid-utterance.
  useEffect(() => () => {
    const recorder = recorderRef.current;
    recorderRef.current = null;
    if (recorder) {
      try { recorder.stop(); } catch { /* already inactive */ }
    }
    releaseMic();
  }, [releaseMic]);

  return { state, supported: HAS_MEDIA_RECORDER, heard, outcome, wake, setWake, press, release };
}
