/**
 * ChatPanel — wired to the real /v1/agents/{hr_agent_id}/demo flow.
 * On mount we ensure an HR agent exists, then open a demo session lazily on
 * the first user turn. The Atlas seed messages stay (they're cosmetic).
 */
import { useRef, useEffect, useState } from 'react';
import { useApp } from '../../context/AppContext';
import Icon from '../../assets/icons';
import { findAgentForSlug, createAgent, type Agent } from '../../api/agents';
import { startDemo, sendDemoTurn } from '../../api/demo';
import { ApiError, getToken } from '../../api/client';

export default function ChatPanel() {
  const { chatMessages, setChatMessages, addToast } = useApp();
  const [input, setInput] = useState('');
  const [agent, setAgent] = useState<Agent | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const initRef = useRef(false);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [chatMessages]);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    if (!getToken()) return;
    (async () => {
      try {
        const a = await findAgentForSlug('hr');
        if (a) setAgent(a);
        // If none exists, leave agent=null. The composer is disabled below
        // and the header shows "No HR agent — create one" until the user
        // clicks the create button.
      } catch (e) {
        const msg = e instanceof ApiError ? e.message : (e as Error).message;
        addToast(`Couldn't load HR agent: ${msg}`, 'error');
      }
    })();
  }, [addToast]);

  async function createHrAgent() {
    try {
      const a = await createAgent({ use_case_slug: 'hr', name: 'HR Recruiting Agent' });
      setAgent(a);
      addToast('Created HR agent', 'success');
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : (e as Error).message;
      addToast(`Couldn't create HR agent: ${msg}`, 'error');
    }
  }

  async function ensureSession(): Promise<string | null> {
    if (sessionId) return sessionId;
    if (!agent) return null;
    try {
      const s = await startDemo(agent.id);
      setSessionId(s.demo_session_id);
      return s.demo_session_id;
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : (e as Error).message;
      addToast(`Couldn't start session: ${msg}`, 'error');
      return null;
    }
  }

  async function sendChat() {
    const text = input.trim();
    if (!text || busy) return;
    if (!agent) {
      addToast('HR agent isn\'t ready yet — try again in a moment.', 'info');
      return;
    }
    const now  = new Date();
    const time = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    setInput('');
    setBusy(true);

    setChatMessages(prev => [
      ...prev,
      { role: 'user', text, time },
      { role: 'typing' },
    ]);

    try {
      const sid = await ensureSession();
      if (!sid) throw new Error('No session');
      const res = await sendDemoTurn(agent.id, sid, text);
      const replyTime = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      setChatMessages(prev => [
        ...prev.filter(m => m.role !== 'typing'),
        { role: 'ai', text: res.agent_response || '(empty response)', time: replyTime },
      ]);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : (e as Error).message;
      setChatMessages(prev => [
        ...prev.filter(m => m.role !== 'typing'),
        { role: 'ai', text: `Error: ${msg}`, time },
      ]);
    } finally {
      setBusy(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendChat();
    }
  }

  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
        backdropFilter: 'blur(20px)',
      }}
    >
      <div
        style={{
          padding: '18px 22px',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: 12,
          background: 'linear-gradient(180deg, rgba(117,91,227,0.08), transparent)',
        }}
      >
        <div
          style={{
            width: 40, height: 40, borderRadius: 12,
            background: 'var(--grad-brand)',
            display: 'grid', placeItems: 'center',
            boxShadow: 'var(--shadow-glow-purple)',
            position: 'relative',
            flexShrink: 0,
          }}
        >
          <Icon name="brain" size={18} style={{ color: 'white' }} />
          <span
            style={{
              position: 'absolute', bottom: -2, right: -2,
              width: 12, height: 12, borderRadius: '50%',
              background: agent ? 'var(--green)' : 'var(--amber)',
              border: '2px solid var(--bg-1)',
              boxShadow: `0 0 8px ${agent ? 'var(--green)' : 'var(--amber)'}`,
            }}
          />
        </div>
        <div style={{ flex: 1 }}>
          <h4 style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--text-1)' }}>Atlas · HR Assistant</h4>
          <p style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>
            {agent ? `Live · agent ${agent.id.slice(0, 8)}` : 'No HR agent yet — create one to start chatting'}
          </p>
        </div>
        {!agent && (
          <button
            onClick={createHrAgent}
            style={{
              padding: '7px 12px', borderRadius: 8,
              background: 'var(--grad-brand)', color: '#fff',
              border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: 600,
              display: 'inline-flex', alignItems: 'center', gap: 5,
              boxShadow: '0 4px 10px -3px rgba(117,91,227,0.5)',
            }}
          >
            <Icon name="plus" size={11} /> Create HR agent
          </button>
        )}
        <div style={{ display: 'flex', gap: 6 }}>
          {[
            { icon: 'settings', tip: 'Settings' },
            { icon: 'expand',   tip: 'Expand' },
          ].map(({ icon, tip }) => (
            <button
              key={icon}
              className="tooltip-wrap"
              data-tip={tip}
              style={{
                width: 30, height: 30, borderRadius: 8,
                background: 'transparent',
                border: '1px solid var(--border)',
                color: 'var(--text-2)',
                display: 'grid', placeItems: 'center',
                cursor: 'pointer', transition: 'all 0.15s',
              }}
            >
              <Icon name={icon} size={14} />
            </button>
          ))}
        </div>
      </div>

      <div
        ref={bodyRef}
        style={{
          flex: 1, overflowY: 'auto',
          padding: 22,
          display: 'flex', flexDirection: 'column', gap: 20,
          scrollBehavior: 'smooth',
          minHeight: 0,
        }}
      >
        {chatMessages.map((m, i) => <Message key={i} msg={m} />)}
      </div>

      <div
        style={{
          padding: '16px 20px 20px',
          borderTop: '1px solid var(--border)',
          background: 'var(--surface-soft)',
        }}
      >
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          {[
            { icon: 'paperclip', label: 'Attach' },
            { icon: 'brain',     label: 'Templates' },
            { icon: 'zap',       label: 'Slash commands' },
          ].map(({ icon, label }) => (
            <button
              key={label}
              style={{
                padding: '6px 10px', borderRadius: 7,
                background: 'var(--tint-2)',
                border: '1px solid var(--border)',
                color: 'var(--text-2)', cursor: 'pointer',
                fontSize: 11.5, display: 'inline-flex', alignItems: 'center', gap: 5,
                transition: 'all 0.15s',
              }}
            >
              <Icon name={icon} size={12} /> {label}
            </button>
          ))}
        </div>

        <div
          style={{
            display: 'flex', alignItems: 'flex-end', gap: 10,
            background: 'var(--input-bg-strong)',
            border: '1px solid var(--border-strong)',
            borderRadius: 14,
            padding: '12px 14px',
            transition: 'border-color 0.15s',
          }}
        >
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={agent ? 'Ask or assign a task…' : 'Connecting to HR agent…'}
            disabled={!agent || busy}
            rows={1}
            style={{
              flex: 1, background: 'transparent', border: 'none', outline: 'none',
              color: 'var(--text-1)', fontSize: 14, fontFamily: 'inherit',
              resize: 'none', maxHeight: 120, minHeight: 22, lineHeight: 1.4,
            }}
          />
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button
              className="tooltip-wrap" data-tip="Voice"
              style={{
                width: 32, height: 32, borderRadius: 8,
                background: 'transparent', border: 'none',
                color: 'var(--text-3)', cursor: 'pointer',
                display: 'grid', placeItems: 'center',
                transition: 'color 0.15s',
              }}
            >
              <Icon name="mic" size={16} />
            </button>
            <button
              onClick={sendChat}
              disabled={!agent || busy || !input.trim()}
              style={{
                width: 36, height: 36, borderRadius: 10,
                background: 'var(--grad-brand)', color: '#fff',
                border: 'none',
                cursor: (!agent || busy || !input.trim()) ? 'not-allowed' : 'pointer',
                opacity: (!agent || busy || !input.trim()) ? 0.5 : 1,
                display: 'grid', placeItems: 'center',
                boxShadow: '0 6px 16px -4px rgba(117,91,227,0.5)',
                transition: 'transform 0.15s',
              }}
            >
              <Icon name="send" size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Message({ msg }) {
  if (msg.role === 'typing') {
    return (
      <div style={{ display: 'flex', gap: 12, maxWidth: '88%' }}>
        <div
          style={{
            width: 28, height: 28, borderRadius: 8, flexShrink: 0,
            display: 'grid', placeItems: 'center',
            fontSize: 11, fontWeight: 700,
            background: 'var(--grad-brand)', color: '#fff',
          }}
        >
          AI
        </div>
        <div>
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '14px 16px', background: 'var(--tint-1)',
              border: '1px solid var(--border)', borderRadius: '14px 14px 14px 4px',
              width: 'fit-content',
            }}
          >
            {[0, 1, 2].map(i => (
              <span
                key={i}
                className="typing-dot"
                style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: 'var(--text-3)', display: 'block',
                  animationDelay: `${i * 0.2}s`,
                }}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const isUser = msg.role === 'user';
  return (
    <div
      style={{
        display: 'flex', gap: 12, maxWidth: '88%',
        marginLeft: isUser ? 'auto' : 0,
        flexDirection: isUser ? 'row-reverse' : 'row',
      }}
    >
      <div
        style={{
          width: 28, height: 28, borderRadius: 8, flexShrink: 0,
          display: 'grid', placeItems: 'center',
          fontSize: 11, fontWeight: 700,
          background: isUser ? 'var(--grad-pink)' : 'var(--grad-brand)',
          color: '#fff',
        }}
      >
        {isUser ? 'HS' : 'AI'}
      </div>
      <div>
        <div
          className="ph-mask"
          style={{
            padding: '12px 16px',
            borderRadius: isUser ? '14px 4px 14px 14px' : '4px 14px 14px 14px',
            fontSize: 14, lineHeight: 1.5,
            border: '1px solid var(--border)',
            background: isUser
              ? 'linear-gradient(135deg, rgba(117,91,227,0.2), rgba(24,218,252,0.15))'
              : 'var(--tint-1)',
            borderColor: isUser ? 'var(--border-accent)' : 'var(--border)',
            color: 'var(--text-1)',
            whiteSpace: 'pre-wrap',
          }}
        >
          {msg.text}
          {msg.file && (
            <div
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 14px', borderRadius: 10,
                background: 'var(--input-bg)',
                border: '1px solid var(--border-strong)',
                marginTop: 10,
              }}
            >
              <div
                style={{
                  width: 36, height: 36, borderRadius: 8,
                  background: 'rgba(76,175,80,0.15)', color: 'var(--green)',
                  display: 'grid', placeItems: 'center',
                }}
              >
                <Icon name="file" size={16} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-1)' }}>{msg.file.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{msg.file.size}</div>
              </div>
              <button
                style={{
                  width: 30, height: 30, borderRadius: 8,
                  background: 'transparent', border: '1px solid var(--border)',
                  color: 'var(--text-2)', cursor: 'pointer',
                  display: 'grid', placeItems: 'center',
                }}
              >
                <Icon name="more" size={12} />
              </button>
            </div>
          )}
        </div>
        <div
          style={{
            fontSize: 10.5, color: 'var(--text-4)', marginTop: 6,
            textAlign: isUser ? 'right' : 'left',
          }}
        >
          {msg.time}
        </div>
      </div>
    </div>
  );
}
