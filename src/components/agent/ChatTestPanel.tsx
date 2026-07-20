/**
 * ChatTestPanel — text-based chat test panel for chatbot agents.
 *
 * Uses the authenticated demo endpoints (POST /v1/agents/{id}/demo +
 * POST /v1/agents/{id}/demo/{sid}/turn) so it works even before the agent
 * is published. Same fast_answer_with_rag path as the public widget.
 *
 * Features:
 *  - Typewriter animation: AI replies reveal character-by-character
 *  - Message slide-in animation
 *  - Auto-focus input after each response
 *  - Blinking cursor on streaming messages
 */
import { useEffect, useRef, useState } from 'react';
import posthog from 'posthog-js';
import { api } from '../../api/client';
import { logger } from '../../utils/logger';
import Icon from '../../assets/icons';

const tintColor: Record<string, string> = {
  purple: 'var(--purple-hi)',
  blue:   'var(--blue)',
  teal:   'var(--teal)',
  green:  'var(--green)',
  amber:  'var(--amber)',
  pink:   'var(--pink)',
};
const tintAlpha: Record<string, string> = {
  purple: 'rgba(117,91,227,0.18)',
  blue:   'rgba(24,218,252,0.14)',
  teal:   'rgba(79,209,197,0.14)',
  green:  'rgba(76,175,80,0.14)',
  amber:  'rgba(255,181,71,0.14)',
  pink:   'rgba(230,90,255,0.14)',
};
const tintBorder: Record<string, string> = {
  purple: 'rgba(117,91,227,0.35)',
  blue:   'rgba(24,218,252,0.30)',
  teal:   'rgba(79,209,197,0.30)',
  green:  'rgba(76,175,80,0.30)',
  amber:  'rgba(255,181,71,0.30)',
  pink:   'rgba(230,90,255,0.30)',
};

interface Message {
  id: number;
  role: 'user' | 'agent';
  text: string;
  streaming?: boolean;
}

interface Props {
  tint?: string;
  agentId: string | null;
  disabled?: boolean;
  disabledHint?: string;
}

let msgIdCounter = 0;
function nextId() { return ++msgIdCounter; }

// Reveals fullText into the last streaming message, character by character.
function animateMessage(
  fullText: string,
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>,
  onDone: () => void,
) {
  let idx = 0;
  const CHUNK = 3;
  const DELAY = 16;

  const tick = () => {
    idx = Math.min(idx + CHUNK, fullText.length);
    const done = idx >= fullText.length;
    setMessages(prev => {
      const updated = [...prev];
      const last = updated[updated.length - 1];
      if (last?.streaming) {
        updated[updated.length - 1] = { ...last, text: fullText.slice(0, idx), streaming: !done };
      }
      return updated;
    });
    if (!done) setTimeout(tick, DELAY);
    else onDone();
  };
  setTimeout(tick, DELAY);
}

export default function ChatTestPanel({ tint = 'purple', agentId, disabled, disabledHint }: Props) {
  const [messages, setMessages]   = useState<Message[]>([]);
  const [input, setInput]         = useState('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [busy, setBusy]           = useState(false);
  const [starting, setStarting]   = useState(false);
  const [active, setActive]       = useState(false);
  const [error, setError]         = useState<string | null>(null);

  const bodyRef   = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);

  const color  = tintColor[tint]  ?? tintColor.purple;
  const alpha  = tintAlpha[tint]  ?? tintAlpha.purple;
  const border = tintBorder[tint] ?? tintBorder.purple;

  // Scroll only the messages container — never the outer page.
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages]);

  // Reset when agent changes
  useEffect(() => {
    setSessionId(null);
    setMessages([]);
    setActive(false);
    setError(null);
    setInput('');
  }, [agentId]);

  async function startSession() {
    if (!agentId || starting) return;
    logger.info('[ChatTestPanel] startSession', { agentId });
    setStarting(true);
    setError(null);
    const t0 = performance.now();
    try {
      const res = await api<{ demo_session_id: string; session_id?: string }>(
        `/v1/agents/${agentId}/demo`,
        { method: 'POST' },
      );
      const sid = res.demo_session_id ?? res.session_id ?? null;
      logger.info('[ChatTestPanel] session started', { agentId, sessionId: sid, elapsed: `${(performance.now() - t0).toFixed(1)} ms` });
      if (!sid) logger.warn('[ChatTestPanel] startSession: no session ID in response', { res });
      setSessionId(sid);
      setActive(true);

      const welcome = "Hi! I'm ready to help. What can I assist you with today?";
      const welcomeId = nextId();
      setMessages([{ id: welcomeId, role: 'agent', text: '', streaming: true }]);
      animateMessage(welcome, setMessages, () => {
        setTimeout(() => inputRef.current?.focus(), 50);
      });
    } catch (e: any) {
      logger.error('[ChatTestPanel] startSession failed', { agentId, error: e, message: e?.message, stack: e?.stack });
      posthog.capture('test_chat_failed', { stage: 'start_session', agent_id: agentId });
      setError(e?.message || 'Failed to start session');
    } finally {
      setStarting(false);
    }
  }

  async function sendMessage() {
    const text = input.trim();
    if (!text || !sessionId || !agentId) return;
    if (busy) return;

    logger.info('[ChatTestPanel] sendMessage', { agentId, sessionId, textLength: text.length });
    const userMsg: Message = { id: nextId(), role: 'user', text };
    setMessages(m => [...m, userMsg]);
    setInput('');
    setBusy(true);

    const agentMsgId = nextId();
    setMessages(m => [...m, { id: agentMsgId, role: 'agent', text: '', streaming: true }]);

    const t0 = performance.now();
    try {
      const res = await api<{ agent_response?: string; final_answer?: string }>(
        `/v1/agents/${agentId}/demo/${sessionId}/turn`,
        { method: 'POST', body: { utterance: text } },
      );
      const reply = res.agent_response || res.final_answer || '…';
      logger.info('[ChatTestPanel] turn OK', { agentId, sessionId, elapsed: `${(performance.now() - t0).toFixed(1)} ms`, replyLength: reply.length });
      setBusy(false);
      animateMessage(reply, setMessages, () => {
        setTimeout(() => inputRef.current?.focus(), 50);
      });
    } catch (e: any) {
      logger.error('[ChatTestPanel] sendMessage failed', { agentId, sessionId, error: e, message: e?.message, stack: e?.stack });
      posthog.capture('test_chat_failed', { stage: 'send_message', agent_id: agentId });
      setBusy(false);
      const errText = `Sorry, something went wrong: ${e?.message || 'Unknown error'}`;
      setMessages(m => {
        const updated = [...m];
        const last = updated[updated.length - 1];
        if (last?.streaming) {
          updated[updated.length - 1] = { ...last, text: errText, streaming: false };
        }
        return updated;
      });
    }
  }

  function resetSession() {
    setSessionId(null);
    setMessages([]);
    setActive(false);
    setError(null);
    setInput('');
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    // Auto-grow textarea
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
  }

  const isStreaming = messages.some(m => m.streaming);

  return (
    <div style={panelOuter}>
      {/* ── Header ── */}
      <div style={panelHeader}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ ...avatarDot, background: color, boxShadow: `0 0 10px ${color}55` }} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', lineHeight: 1 }}>Chat Test</div>
            <div style={{ fontSize: 11, color: active ? color : 'var(--text-3)', marginTop: 3, lineHeight: 1 }}>
              {active
                ? isStreaming ? 'Typing…' : 'Online'
                : 'Start a conversation'}
            </div>
          </div>
        </div>
        {active && (
          <button onClick={resetSession} style={resetBtn}>
            New chat
          </button>
        )}
      </div>

      {/* ── Body ── */}
      <div ref={bodyRef} style={panelBody}>

        {/* Disabled state */}
        {disabled && (
          <div style={centeredHint}>
            <div style={{ marginBottom: 12, opacity: 0.4, color: 'var(--text-3)' }}><Icon name="chat" size={36} /></div>
            <div style={{ fontSize: 13.5, color: 'var(--text-3)', lineHeight: 1.6, maxWidth: 260, textAlign: 'center' }}>
              {disabledHint || 'Pick or create an agent to start testing'}
            </div>
          </div>
        )}

        {/* Not started */}
        {!disabled && !active && (
          <div style={centeredHint}>
            <div style={{
              width: 64, height: 64, borderRadius: '50%',
              background: alpha,
              border: `1.5px solid ${border}`,
              display: 'grid', placeItems: 'center',
              fontSize: 28,
              marginBottom: 18,
              boxShadow: `0 0 30px ${color}22`,
              color,
            }}>
              <Icon name="chat" size={28} />
            </div>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-1)', marginBottom: 6 }}>
              Ready to chat
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-3)', textAlign: 'center', maxWidth: 240, lineHeight: 1.55, marginBottom: 20 }}>
              Start a session to test your chatbot in real-time
            </div>
            {error && (
              <div style={errorBanner}>{error}</div>
            )}
            <button
              onClick={startSession}
              disabled={starting}
              style={{ ...startBtn, background: color, opacity: starting ? 0.65 : 1 }}
            >
              {starting ? 'Connecting…' : 'Start conversation'}
            </button>
          </div>
        )}

        {/* Active chat messages */}
        {!disabled && active && (
          <div style={messageArea}>
            {messages.map((msg, i) => (
              <div
                key={msg.id}
                style={{
                  display: 'flex',
                  flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
                  alignItems: 'flex-end',
                  gap: 8,
                  animation: 'msgIn 0.22s ease-out both',
                  animationDelay: `${Math.min(i * 0.02, 0.1)}s`,
                }}
              >
                {/* AI avatar */}
                {msg.role === 'agent' && (
                  <div style={{
                    width: 26, height: 26, borderRadius: '50%',
                    background: alpha,
                    border: `1px solid ${border}`,
                    display: 'grid', placeItems: 'center',
                    flexShrink: 0,
                    fontSize: 12, color,
                  }}>
                    <Icon name="bot" size={14} />
                  </div>
                )}

                <div style={{
                  maxWidth: '75%',
                  padding: '10px 14px',
                  borderRadius: msg.role === 'user'
                    ? '16px 16px 4px 16px'
                    : '4px 16px 16px 16px',
                  background: msg.role === 'user'
                    ? alpha
                    : 'rgba(255,255,255,0.05)',
                  border: `1px solid ${msg.role === 'user' ? border : 'var(--border)'}`,
                  fontSize: 13.5,
                  lineHeight: 1.6,
                  color: 'var(--text-1)',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  position: 'relative',
                }}>
                  {msg.text}
                  {msg.streaming && (
                    <span style={{
                      display: 'inline-block',
                      width: 2,
                      height: '1em',
                      background: color,
                      marginLeft: 2,
                      verticalAlign: 'text-bottom',
                      animation: 'blink 0.9s step-start infinite',
                      borderRadius: 1,
                    }} />
                  )}
                </div>
              </div>
            ))}

            {/* Typing dots (while waiting for API response) */}
            {busy && !isStreaming && (
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
                <div style={{
                  width: 26, height: 26, borderRadius: '50%',
                  background: alpha, border: `1px solid ${border}`,
                  display: 'grid', placeItems: 'center', fontSize: 12, color,
                }}><Icon name="bot" size={14} /></div>
                <div style={{
                  padding: '12px 16px',
                  borderRadius: '4px 16px 16px 16px',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid var(--border)',
                  display: 'flex', gap: 5, alignItems: 'center',
                }}>
                  {[0, 1, 2].map(i => (
                    <div key={i} style={{
                      width: 7, height: 7, borderRadius: '50%',
                      background: 'var(--text-3)',
                      animation: `chatBounce 1.2s ${i * 0.2}s infinite`,
                    }} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Input ── */}
      {!disabled && active && (
        <div style={inputArea}>
          <div style={inputWrapper}>
            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Type a message… (Enter to send)"
              style={inputEl}
            />
          </div>
          <button
            onClick={sendMessage}
            disabled={!input.trim() || busy}
            aria-label="Send message"
            style={{
              ...sendBtn,
              background: !input.trim() || busy ? 'var(--border)' : color,
              cursor: !input.trim() || busy ? 'not-allowed' : 'pointer',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
      )}

      <style>{`
        @keyframes chatBounce {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.5; }
          30% { transform: translateY(-6px); opacity: 1; }
        }
        @keyframes msgIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────
const panelOuter: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 16,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  height: '100%',
};

const panelHeader: React.CSSProperties = {
  padding: '14px 18px',
  borderBottom: '1px solid var(--border)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  flexShrink: 0,
  background: 'rgba(255,255,255,0.02)',
};

const panelBody: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  position: 'relative',
  minHeight: 0,
};

const messageArea: React.CSSProperties = {
  padding: '20px 18px 8px',
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
  minHeight: '100%',
};

const centeredHint: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 28,
};

const inputArea: React.CSSProperties = {
  padding: '12px 14px',
  borderTop: '1px solid var(--border)',
  display: 'flex',
  gap: 8,
  alignItems: 'flex-end',
  flexShrink: 0,
  background: 'rgba(255,255,255,0.02)',
};

const inputWrapper: React.CSSProperties = {
  flex: 1,
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid var(--border-strong)',
  borderRadius: 12,
  padding: '9px 14px',
};

const inputEl: React.CSSProperties = {
  width: '100%',
  background: 'transparent',
  border: 'none',
  outline: 'none',
  color: 'var(--text-1)',
  fontSize: 14,
  resize: 'none',
  lineHeight: 1.5,
  maxHeight: 120,
  overflow: 'auto',
  fontFamily: 'inherit',
};

const sendBtn: React.CSSProperties = {
  width: 40,
  height: 40,
  flexShrink: 0,
  borderRadius: 12,
  border: 'none',
  color: '#fff',
  display: 'grid',
  placeItems: 'center',
  transition: 'background 0.15s, transform 0.1s',
};

const avatarDot: React.CSSProperties = {
  width: 10,
  height: 10,
  borderRadius: '50%',
  flexShrink: 0,
};

const resetBtn: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid var(--border)',
  borderRadius: 8,
  color: 'var(--text-3)',
  fontSize: 11.5,
  padding: '5px 12px',
  cursor: 'pointer',
  transition: 'all 0.15s',
};

const startBtn: React.CSSProperties = {
  border: 'none',
  borderRadius: 10,
  color: '#fff',
  fontSize: 14,
  fontWeight: 600,
  padding: '11px 28px',
  cursor: 'pointer',
  transition: 'opacity 0.15s, transform 0.1s',
  letterSpacing: '0.01em',
};

const errorBanner: React.CSSProperties = {
  background: 'rgba(255,90,120,0.1)',
  border: '1px solid rgba(255,90,120,0.4)',
  color: '#ff8194',
  borderRadius: 8,
  padding: '10px 14px',
  fontSize: 12,
  textAlign: 'center',
  marginBottom: 16,
  maxWidth: 300,
};
