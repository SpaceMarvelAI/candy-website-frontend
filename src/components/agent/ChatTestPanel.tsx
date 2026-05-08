/**
 * ChatTestPanel — text-based chat test panel for chatbot agents.
 *
 * Uses the authenticated demo endpoints (POST /v1/agents/{id}/demo +
 * POST /v1/agents/{id}/demo/{sid}/turn) so it works even before the agent
 * is published. Same fast_answer_with_rag path as the public widget.
 */
import { useEffect, useRef, useState } from 'react';
import { api } from '../../api/client';

const tintColor: Record<string, string> = {
  purple: 'var(--purple-hi)',
  blue:   'var(--blue)',
  teal:   'var(--teal)',
  green:  'var(--green)',
  amber:  'var(--amber)',
  pink:   'var(--pink)',
};
const tintAlpha: Record<string, string> = {
  purple: 'rgba(117,91,227,0.14)',
  blue:   'rgba(24,218,252,0.12)',
  teal:   'rgba(79,209,197,0.12)',
  green:  'rgba(76,175,80,0.12)',
  amber:  'rgba(255,181,71,0.12)',
  pink:   'rgba(230,90,255,0.12)',
};

interface Message {
  role: 'user' | 'agent';
  text: string;
}

interface Props {
  tint?: string;
  agentId: string | null;
  disabled?: boolean;
  disabledHint?: string;
}

export default function ChatTestPanel({ tint = 'purple', agentId, disabled, disabledHint }: Props) {
  const [messages, setMessages]     = useState<Message[]>([]);
  const [input, setInput]           = useState('');
  const [sessionId, setSessionId]   = useState<string | null>(null);
  const [busy, setBusy]             = useState(false);
  const [starting, setStarting]     = useState(false);
  const [active, setActive]         = useState(false);
  const [error, setError]           = useState<string | null>(null);

  const msgEndRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);

  const color = tintColor[tint] ?? tintColor.purple;
  const alpha = tintAlpha[tint] ?? tintAlpha.purple;

  useEffect(() => {
    msgEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, busy]);

  async function startSession() {
    if (!agentId || starting) return;
    setStarting(true);
    setError(null);
    try {
      const res = await api<{ demo_session_id: string; session_id?: string }>(`/v1/agents/${agentId}/demo`, { method: 'POST' });
      setSessionId(res.demo_session_id ?? res.session_id ?? null);
      setMessages([{ role: 'agent', text: 'Hi! I\'m ready. Send me a message to start the conversation.' }]);
      setActive(true);
    } catch (e: any) {
      setError(e?.message || 'Failed to start session');
    } finally {
      setStarting(false);
    }
  }

  async function sendMessage() {
    const text = input.trim();
    if (!text || busy || !sessionId || !agentId) return;

    setMessages(m => [...m, { role: 'user', text }]);
    setInput('');
    setBusy(true);

    try {
      const res = await api<{ agent_response?: string; final_answer?: string }>(`/v1/agents/${agentId}/demo/${sessionId}/turn`, {
        method: 'POST',
        body: { utterance: text },
      });
      const reply = res.agent_response || res.final_answer || '(no response)';
      setMessages(m => [...m, { role: 'agent', text: reply }]);
    } catch (e: any) {
      setMessages(m => [...m, { role: 'agent', text: `Error: ${e?.message || 'Something went wrong'}` }]);
    } finally {
      setBusy(false);
      setTimeout(() => inputRef.current?.focus(), 50);
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

  const panelStyle: React.CSSProperties = {
    background: 'var(--card-bg)',
    border: '1px solid var(--border)',
    borderRadius: 14,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    height: 520,
  };

  return (
    <div style={panelStyle}>
      {/* Header */}
      <div style={{
        padding: '14px 18px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        flexShrink: 0,
      }}>
        <div style={{
          width: 32, height: 32,
          borderRadius: 8,
          background: alpha,
          border: `1px solid ${color}44`,
          display: 'grid', placeItems: 'center',
          fontSize: 15,
        }}>💬</div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>Chat Test</div>
          <div style={{ fontSize: 11, color: 'var(--text-2)' }}>
            {active ? 'Session active' : 'Start a conversation'}
          </div>
        </div>
        {active && (
          <button
            onClick={resetSession}
            style={{
              marginLeft: 'auto',
              background: 'transparent',
              border: '1px solid var(--border)',
              borderRadius: 7,
              color: 'var(--text-2)',
              fontSize: 11,
              padding: '4px 10px',
              cursor: 'pointer',
            }}
          >
            Reset
          </button>
        )}
      </div>

      {/* Disabled state */}
      {disabled && (
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 24, textAlign: 'center',
          color: 'var(--text-3)', fontSize: 13, lineHeight: 1.5,
        }}>
          {disabledHint || 'Select an agent to test'}
        </div>
      )}

      {/* Not started */}
      {!disabled && !active && (
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          gap: 16, padding: 24,
        }}>
          {error && (
            <div style={{
              background: 'rgba(255,90,120,0.1)', border: '1px solid rgba(255,90,120,0.4)',
              color: '#ff8194', borderRadius: 8, padding: '10px 14px',
              fontSize: 12, width: '100%', textAlign: 'center',
            }}>{error}</div>
          )}
          <div style={{ fontSize: 13, color: 'var(--text-2)', textAlign: 'center' }}>
            Start a session to test your chatbot agent in text mode.
          </div>
          <button
            onClick={startSession}
            disabled={starting}
            style={{
              background: color,
              border: 'none',
              borderRadius: 9,
              color: '#fff',
              fontSize: 13,
              fontWeight: 600,
              padding: '10px 24px',
              cursor: starting ? 'not-allowed' : 'pointer',
              opacity: starting ? 0.6 : 1,
            }}
          >
            {starting ? 'Starting…' : 'Start chat session'}
          </button>
        </div>
      )}

      {/* Active chat */}
      {!disabled && active && (
        <>
          {/* Messages */}
          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px 18px',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}>
            {messages.map((msg, i) => (
              <div key={i} style={{
                display: 'flex',
                justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
              }}>
                <div style={{
                  maxWidth: '80%',
                  padding: '10px 14px',
                  borderRadius: msg.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                  background: msg.role === 'user' ? alpha : 'var(--surface-2, rgba(255,255,255,0.05))',
                  border: `1px solid ${msg.role === 'user' ? `${color}33` : 'var(--border)'}`,
                  fontSize: 13,
                  lineHeight: 1.55,
                  color: 'var(--text-1)',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}>
                  {msg.text}
                </div>
              </div>
            ))}

            {/* Typing indicator */}
            {busy && (
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div style={{
                  padding: '10px 16px',
                  borderRadius: '14px 14px 14px 4px',
                  background: 'var(--surface-2, rgba(255,255,255,0.05))',
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
            <div ref={msgEndRef} />
          </div>

          {/* Input */}
          <div style={{
            padding: '12px 14px',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            gap: 8,
            alignItems: 'flex-end',
            flexShrink: 0,
          }}>
            <div style={{
              flex: 1,
              background: 'var(--input-bg, rgba(255,255,255,0.05))',
              border: '1px solid var(--border)',
              borderRadius: 10,
              padding: '8px 12px',
            }}>
              <textarea
                ref={inputRef}
                rows={1}
                value={input}
                onChange={e => {
                  setInput(e.target.value);
                  e.target.style.height = 'auto';
                  e.target.style.height = Math.min(e.target.scrollHeight, 100) + 'px';
                }}
                onKeyDown={handleKeyDown}
                disabled={busy}
                placeholder="Type a message… (Enter to send)"
                style={{
                  width: '100%',
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: 'var(--text-1)',
                  fontSize: 13,
                  resize: 'none',
                  lineHeight: 1.5,
                  maxHeight: 100,
                  overflow: 'auto',
                  fontFamily: 'inherit',
                }}
              />
            </div>
            <button
              onClick={sendMessage}
              disabled={busy || !input.trim()}
              style={{
                width: 38, height: 38,
                flexShrink: 0,
                borderRadius: 10,
                background: color,
                border: 'none',
                color: '#fff',
                cursor: busy || !input.trim() ? 'not-allowed' : 'pointer',
                opacity: busy || !input.trim() ? 0.4 : 1,
                display: 'grid', placeItems: 'center',
                transition: 'opacity 0.15s',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
        </>
      )}

      <style>{`
        @keyframes chatBounce {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-5px); }
        }
      `}</style>
    </div>
  );
}
