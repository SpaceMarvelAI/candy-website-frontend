/**
 * VoiceIndicator — the always-visible mic state, and the only pointer affordance
 * for voice.
 *
 * Everything voice can do is reachable by keyboard and mouse already; this adds
 * a way in, never the only way. The control is a real <button>, so it is in the
 * tab order and works on Enter/Space, and Alt+Space (owned by the hook) is the
 * hold-to-talk equivalent.
 *
 * The user always sees three things: whether the mic is live, what was heard,
 * and what happened next. The transcript and outcome are also announced through
 * a polite live region, because a voice user is the most likely person to be
 * looking somewhere other than this corner of the screen.
 */
import { useVoiceCommand } from '../../hooks/useVoiceCommand';

const DOT: Record<string, string> = {
  unsupported: 'var(--text-4)',
  idle:        'var(--text-3)',
  arming:      '#f59e0b',
  listening:   '#ef4444',
  thinking:    '#0071e3',
  error:       '#f87171',
};

const HINT: Record<string, string> = {
  unsupported: 'Voice control needs a browser with audio recording',
  idle:        'Hold to speak, or hold Alt+Space',
  arming:      'Starting the microphone…',
  listening:   'Listening — let go when you are done',
  thinking:    'Working out what you meant…',
  error:       'Something went wrong — try again',
};

export default function VoiceIndicator() {
  const { state, supported, heard, outcome, press, release } = useVoiceCommand();
  const live = state === 'listening' || state === 'arming';

  return (
    <div
      style={{
        position: 'fixed', right: 20, bottom: 20, zIndex: 40,
        display: 'flex', alignItems: 'center', gap: 10,
        maxWidth: 'min(380px, calc(100vw - 40px))',
      }}
    >
      {(heard || outcome) && (
        <div
          style={{
            padding: '8px 12px', borderRadius: 10,
            background: 'var(--card-bg)', border: '1px solid var(--border)',
            boxShadow: '0 4px 14px rgba(0,0,0,0.10)',
            fontSize: 12.5, lineHeight: 1.45, color: 'var(--text-2)',
            minWidth: 0, overflowWrap: 'anywhere',
          }}
        >
          {heard && (
            <div style={{ color: 'var(--text-1)', fontWeight: 600 }}>
              &ldquo;{heard}&rdquo;
            </div>
          )}
          {outcome && <div style={{ color: 'var(--text-3)' }}>{outcome}</div>}
        </div>
      )}

      <button
        type="button"
        disabled={!supported}
        aria-label={supported ? 'Hold to speak a command' : HINT.unsupported}
        aria-pressed={live}
        title={HINT[state] ?? HINT.idle}
        onPointerDown={press}
        onPointerUp={release}
        onPointerLeave={release}
        onPointerCancel={release}
        // Keyboard parity for anyone who reaches the button by tabbing rather
        // than pointing. Alt+Space does the same thing from anywhere.
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); press(); } }}
        onKeyUp={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); release(); } }}
        style={{
          width: 44, height: 44, flexShrink: 0,
          display: 'grid', placeItems: 'center',
          borderRadius: '50%',
          border: `1px solid ${live ? DOT.listening : 'var(--border)'}`,
          background: 'var(--card-bg)',
          color: DOT[state] ?? DOT.idle,
          cursor: supported ? 'pointer' : 'not-allowed',
          opacity: supported ? 1 : 0.5,
          boxShadow: '0 4px 14px rgba(0,0,0,0.12)',
          transition: 'border-color 0.15s, color 0.15s',
        }}
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          <line x1="12" y1="19" x2="12" y2="23" />
        </svg>
      </button>

      <p
        aria-live="polite"
        style={{
          position: 'absolute', width: 1, height: 1, margin: -1, padding: 0,
          overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0,
        }}
      >
        {heard ? `Heard: ${heard}. ` : ''}{outcome ?? ''}
      </p>
    </div>
  );
}
