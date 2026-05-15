/**
 * AvatarPanel — Simli photoreal talking-head avatar for the HR-Hiring
 * voice agent.
 *
 * Mounts alongside the existing TestPanel (not replacing it) so the
 * existing LLM / STT / TTS flow keeps working. We tap TestPanel's TTS
 * MediaStream (via the exported ensureTtsAudioGraph helper) and feed it
 * to Simli, which renders a WebRTC video stream of the avatar speaking
 * the same audio AND echoes the audio back via WebRTC.
 *
 * Audio routing while this component is mounted:
 *   TTS <audio> ──► Web Audio source ──► MediaStreamDestination ──► Simli
 *                                                                    │
 *                            ┌── audio (lipsynced echo) ─────────────┤
 *                            │                                       │
 *                            ▼                                       │
 *               <audio ref={audioRef}>  ←── speakers                  │
 *                                                                    │
 *                            video                                   │
 *                            ◄───────────────────────────────────────┘
 *                            ▼
 *               <video ref={videoRef}>
 *
 * Crucially, TestPanel's local speaker output is SILENCED while the
 * avatar is mounted (via setLocalTtsOutput(false)). Otherwise the user
 * would hear the TTS twice — once locally (instant) and once from
 * Simli's WebRTC echo (lagged by ~hundreds of ms). The graph still
 * captures the TTS for Simli; only the speaker connection is severed.
 *
 * Failure modes (all degrade to "no avatar visible, TestPanel speakers
 * stay/return to working"):
 *   - SIMLI_API_KEY unset on backend → /avatar-session returns 503 → null
 *   - Simli /compose/token errors → backend returns 502 → caught
 *   - WebRTC start() fails (browser denies / network blocked) → caught
 *   - SimliClient emits 'failed' or 'disconnected' → status updates
 *   - simli-client package not installed → caught at import time
 */
import { useEffect, useRef, useState } from 'react';
import { getTtsAvatarStream, setLocalTtsOutput } from './TestPanel';
import { createAvatarSession, type AvatarSession } from '../../api/avatar';

interface Props {
  agentId: string | null;
  /** Optional face override. Falls back to backend's SIMLI_DEFAULT_FACE_ID. */
  faceId?: string;
}

type Status =
  | 'idle'         // not yet mounted / no agent selected
  | 'connecting'   // fetching session token + opening WebRTC
  | 'connected'    // ready, video streaming
  | 'unavailable'  // backend returned 503 — no SIMLI_API_KEY set
  | 'error';       // anything else broke

export default function AvatarPanel({ agentId, faceId }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const clientRef = useRef<any>(null);

  const [status, setStatus]    = useState<Status>('idle');
  const [errorMsg, setErrMsg]  = useState<string | null>(null);

  useEffect(() => {
    if (!agentId) {
      setStatus('idle');
      return;
    }
    let cancelled = false;

    (async () => {
      setStatus('connecting');
      setErrMsg(null);

      // 1. Get a session token from candy-backend (which calls Simli).
      let session: AvatarSession | null;
      try {
        session = await createAvatarSession(agentId, faceId ? { face_id: faceId } : {});
      } catch (e: any) {
        if (cancelled) return;
        setErrMsg(e?.message ?? 'failed to create session');
        setStatus('error');
        return;
      }
      if (cancelled) return;
      if (!session) {
        // 503 — SIMLI_API_KEY not set on backend. Silent fallback.
        setStatus('unavailable');
        return;
      }

      // 2. Dynamic-import simli-client so a missing dep doesn't break
      //    the whole page — and so non-HR voice pages don't pay the
      //    bundle cost. Throws if package not installed.
      let SimliClient: any;
      let LogLevel: any;
      try {
        const mod = await import('simli-client');
        SimliClient = mod.SimliClient ?? (mod as any).default;
        LogLevel    = mod.LogLevel;
      } catch (e: any) {
        if (cancelled) return;
        setErrMsg('simli-client not installed — run `npm install simli-client`');
        setStatus('error');
        return;
      }

      // 3. Construct + start the WebRTC stream.
      //    Transport mode "livekit" is Simli's recommended default — it
      //    handles signaling + ICE through their managed infrastructure,
      //    so we pass null for iceServers. (P2P mode would require
      //    fetching ICE servers via Simli's API, which needs the API
      //    key on the browser — defeating our server-side key pattern.)
      try {
        const client = new SimliClient(
          session.session_token,
          videoRef.current,
          audioRef.current,
          null,                 // iceServers — null is correct for livekit
          LogLevel?.INFO ?? 1,  // numeric enum: DEBUG=0, INFO=1, ERROR=2, CRITICAL=3
          'livekit',            // transport mode — Simli-recommended
        );
        clientRef.current = client;

        // Surface lifecycle events so we can show "Reconnecting…" instead
        // of pretending everything's fine when Simli has dropped.
        try {
          client.on?.('disconnected', () => {
            if (!cancelled) setStatus('error');
            if (!cancelled) setErrMsg('avatar disconnected');
          });
          client.on?.('failed', () => {
            if (!cancelled) setStatus('error');
            if (!cancelled) setErrMsg('avatar session failed');
          });
        } catch {}

        await client.start();
        if (cancelled) { client.stop?.(); return; }
        setStatus('connected');
      } catch (e: any) {
        if (cancelled) return;
        setErrMsg(e?.message ?? 'failed to start WebRTC');
        setStatus('error');
        return;
      }

      // 4. Silence TestPanel's local TTS speakers. Simli will echo the
      //    same audio back via its <audio> element in sync with the
      //    lipsync video — playing both at once gives the user a 20s
      //    overlap (local instant vs WebRTC-buffered).
      setLocalTtsOutput(false);

      // 5. Pipe TestPanel's TTS-only MediaStream into Simli for lipsync.
      //    NOTE: getTtsAvatarStream() returns a dedicated stream that
      //    captures ONLY the TTS audio element — never the mic. Don't
      //    swap this for recordingDest: that stream has the mic mixed
      //    in for session recording, and Simli would echo the user's
      //    own voice back through the avatar.
      try {
        const ttsStream = getTtsAvatarStream();
        const track = ttsStream?.getAudioTracks()?.[0];
        if (track) {
          clientRef.current?.listenToMediastreamTrack?.(track);
        }
      } catch (e: any) {
        console.warn('AvatarPanel: could not bind TTS audio track', e);
      }
    })();

    return () => {
      cancelled = true;
      // Restore TestPanel's local speakers so other voice pages
      // (or future remounts) behave normally.
      setLocalTtsOutput(true);
      try {
        clientRef.current?.stop?.();
      } catch {}
      clientRef.current = null;
    };
  }, [agentId, faceId]);

  // Render only the video when connected. Otherwise show a status
  // overlay; AgentWorkspace can still render the TestPanel underneath.
  return (
    <div style={frame}>
      <div style={shell}>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={false}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            objectPosition: 'center',
            background: 'var(--bg-1)',
            borderRadius: 'inherit',
          }}
        />
        <audio ref={audioRef} autoPlay playsInline />

        {status !== 'connected' && (
          <div style={overlay}>
            {status === 'idle' && (
              <span style={{ color: 'var(--text-3)', fontSize: 12 }}>
                Pick an agent to start the interview
              </span>
            )}
            {status === 'connecting' && (
              <span style={{ color: 'var(--text-2)', fontSize: 12 }}>
                Connecting to avatar…
              </span>
            )}
            {status === 'unavailable' && (
              <span style={{ color: 'var(--text-3)', fontSize: 12 }}>
                Avatar not configured (SIMLI_API_KEY)
              </span>
            )}
            {status === 'error' && (
              <span style={{ color: 'var(--red)', fontSize: 12 }}>
                Avatar failed: {errorMsg}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Centering wrapper — keeps the avatar at a sensible "video-call tile"
// size instead of stretching it the full width of the test column.
const frame: React.CSSProperties = {
  width: '100%',
  height: '100%',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'flex-start',
};

// Square portrait shell. Simli's stock avatars are landscape with a
// person on the left and an empty wall — cropping to a 1:1 square
// centered on the face gives a Zoom-tile look without the dead space.
const shell: React.CSSProperties = {
  position: 'relative',
  width: '100%',
  maxWidth: 360,
  aspectRatio: '1 / 1',
  background: 'var(--bg-1)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  overflow: 'hidden',
};

const overlay: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'grid',
  placeItems: 'center',
  background: 'rgba(10,10,12,0.55)',
  backdropFilter: 'blur(4px)',
  textAlign: 'center',
  padding: 16,
};
