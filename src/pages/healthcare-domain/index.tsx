import { useEffect, useMemo, useRef, useState } from 'react';

/**
 * First unused name in the `base`, `base 2`, `base 3`… series.
 *
 * The create dialog used to pre-fill the same default every time, so repeatedly
 * clicking "Create & customise" produced a stack of agents with identical names
 * that no picker could tell apart. Suggesting the next free name makes the
 * duplicate obvious before it is created, without blocking anyone who genuinely
 * wants two agents for one use case.
 */
export function nextAvailableName(base: string, taken: { name: string }[]): string {
  const names = new Set(taken.map(a => a.name.trim().toLowerCase()));
  if (!names.has(base.trim().toLowerCase())) return base;
  for (let n = 2; n < 100; n++) {
    const candidate = `${base} ${n}`;
    if (!names.has(candidate.toLowerCase())) return candidate;
  }
  return base;
}
import Icon from '../../assets/icons';
import { useApp } from '../../context/AppContext';
import {
  HEALTHCARE_USE_CASES,
  skillLabel,
  type Direction,
  type HealthcareUseCase,
} from '../../data/healthcareUseCases';
import { createHealthcareAgent, listUseCaseAgents } from '../../api/healthcare';
import type { Agent } from '../../api/agents';

// Mockup-matched accent palette (local to the healthcare surface so we don't
// disturb other pages' tokens).
const ACCENT = '#755BE3';
const ACCENT_HI = '#6448D6';
const ACCENT_SOFT = 'rgba(117,91,227,0.08)';
const ACCENT_BORDER = 'rgba(117,91,227,0.22)';

function DirBadge({ direction }: { direction: Direction }) {
  const map: Record<Direction, { label: string; color: string; bg: string }> = {
    inbound:  { label: 'Inbound',  color: '#1e40af', bg: '#dbeafe' },
    outbound: { label: 'Outbound', color: '#166534', bg: '#dcfce7' },
    both:     { label: 'Inbound + Outbound', color: '#5b21b6', bg: '#ede9fe' },
  };
  const m = map[direction];
  return (
    <span style={{
      fontSize: 10.5, fontWeight: 600, padding: '2px 8px', borderRadius: 99,
      color: m.color, background: m.bg, letterSpacing: '0.01em',
    }}>{m.label}</span>
  );
}

function UseCaseCard({ uc, onCreate }: { uc: HealthcareUseCase; onCreate: () => void }) {
  return (
    <div
      onClick={onCreate}
      style={{
        position: 'relative', background: 'var(--card-bg)',
        border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)',
        padding: 20, cursor: 'pointer', display: 'flex', flexDirection: 'column',
        transition: 'transform .18s ease, border-color .15s, box-shadow .18s',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = 'translateY(-3px)';
        e.currentTarget.style.borderColor = ACCENT_BORDER;
        e.currentTarget.style.boxShadow = '0 8px 28px rgba(117,91,227,0.12)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.borderColor = 'var(--border)';
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <div style={{
          width: 44, height: 44, borderRadius: 12, display: 'grid', placeItems: 'center',
          background: ACCENT_SOFT, border: `1px solid ${ACCENT_BORDER}`, color: ACCENT, flexShrink: 0,
        }}>
          <Icon name={uc.icon} size={20} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 15.5, fontWeight: 650, color: 'var(--text-1)', letterSpacing: '-0.01em' }}>
            {uc.title}
          </div>
          <div style={{ marginTop: 3 }}><DirBadge direction={uc.direction} /></div>
        </div>
      </div>

      <div style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.5, marginBottom: 14, flex: 1 }}>
        {uc.purpose}
      </div>

      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.06em',
          color: 'var(--text-4)', marginBottom: 6 }}>Collects</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
          {uc.fields.map(f => (
            <span key={f.name} style={{
              fontSize: 11, padding: '2px 7px', borderRadius: 6,
              background: 'var(--bg-3)', color: 'var(--text-2)',
              border: '1px solid var(--border)',
            }}>{f.ask}{f.required ? '' : ' ·'}</span>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderTop: '1px solid var(--border)', paddingTop: 12 }}>
        <div style={{ fontSize: 11, color: 'var(--text-4)' }}>
          {uc.skills.length} skill{uc.skills.length > 1 ? 's' : ''} attached
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, color: ACCENT, display: 'flex', alignItems: 'center', gap: 5 }}>
          Create agent <span aria-hidden>→</span>
        </div>
      </div>
    </div>
  );
}

function CreateModal({
  uc, onClose,
}: { uc: HealthcareUseCase; onClose: () => void }) {
  const { showView, addToast } = useApp();
  const [name, setName] = useState(`${uc.title} Agent`);
  const [busy, setBusy] = useState(false);
  const creatingRef = useRef(false);
  const [existing, setExisting] = useState<Agent[] | null>(null); // null = loading

  // Look for agents this company already has for this use case.
  useEffect(() => {
    let cancelled = false;
    listUseCaseAgents(uc)
      .then(list => {
        if (cancelled) return;
        setExisting(list);
        // Suggest a distinct name when this use case already has agents. The
        // field used to pre-fill the same default every time, so clicking
        // "Create & customise" repeatedly produced several agents with identical
        // names that were impossible to tell apart in any picker.
        setName(nextAvailableName(`${uc.title} Agent`, list));
      })
      .catch(() => { if (!cancelled) setExisting([]); });
    return () => { cancelled = true; };
  }, [uc]);

  function openAgent(agentId: string) {
    // Tell the builder which agent to select, then navigate to it.
    sessionStorage.setItem('candy.select_agent', agentId);
    showView('healthcare');
  }

  async function handleCreate() {
    // Ref, not state: `setBusy(true)` does not apply until the next render, so a
    // fast double-click slipped past `if (busy)` and created a second identical
    // agent. Creating one is 4 sequential round trips (create + 3 attachSkill),
    // which feels unresponsive — exactly when people click again.
    if (creatingRef.current || busy) return;
    creatingRef.current = true;
    setBusy(true);
    try {
      const { agent, failed } = await createHealthcareAgent(uc, name);
      if (failed.length) {
        addToast(`Agent created; ${failed.length} skill(s) need attention in the builder`, 'info');
      } else {
        addToast(`"${agent.name}" created with ${uc.skills.length} skills`, 'success');
      }
      // Open the just-created agent in the builder.
      openAgent(agent.id);
    } catch (e) {
      addToast(`Could not create agent: ${(e as Error).message}`, 'error');
      creatingRef.current = false;   // allow a retry after a genuine failure
      setBusy(false);
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000, display: 'grid', placeItems: 'center',
        background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(3px)', padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(520px, 100%)', background: 'var(--card-bg)',
          border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)',
          padding: 26, boxShadow: '0 20px 60px rgba(0,0,0,0.35)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, display: 'grid', placeItems: 'center',
            background: ACCENT_SOFT, border: `1px solid ${ACCENT_BORDER}`, color: ACCENT }}>
            <Icon name={uc.icon} size={19} />
          </div>
          <div>
            <div style={{ fontSize: 17, fontWeight: 650, color: 'var(--text-1)' }}>{uc.title}</div>
            <DirBadge direction={uc.direction} />
          </div>
        </div>

        <p style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.55, margin: '10px 0 18px' }}>
          {uc.purpose}
        </p>

        {/* Existing agents for this use case — select instead of re-creating. */}
        {existing && existing.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.06em',
              color: 'var(--text-4)', marginBottom: 8 }}>
              You already have {existing.length} agent{existing.length > 1 ? 's' : ''} for this use case
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {existing.map(a => (
                <button
                  key={a.id}
                  onClick={() => openAgent(a.id)}
                  disabled={busy}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 12px', borderRadius: 'var(--radius)',
                    border: `1px solid ${ACCENT_BORDER}`, background: ACCENT_SOFT,
                    cursor: busy ? 'default' : 'pointer', textAlign: 'left', width: '100%',
                  }}
                >
                  <span style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-1)' }}>{a.name}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-4)' }}>
                      {a.agent_flow_status === 'published' ? 'Live' : 'Draft'} · {a.call_direction}
                      {/* Short id so same-named agents are actually distinguishable —
                          matches how AgentPicker labels them. */}
                      {' · '}<span style={{ fontFamily: 'ui-monospace, monospace' }}>{a.id.slice(0, 8)}</span>
                    </span>
                  </span>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: ACCENT }}>Open →</span>
                </button>
              ))}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--text-4)', margin: '12px 0 0' }}>
              — or create another below —
            </div>
          </div>
        )}

        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}>
          {existing && existing.length > 0 ? 'New agent name' : 'Agent name'}
        </label>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          autoFocus
          style={{
            width: '100%', marginTop: 6, marginBottom: 18, padding: '10px 12px',
            borderRadius: 'var(--radius)', border: '1px solid var(--border-strong)',
            background: 'var(--bg-3)', color: 'var(--text-1)', fontSize: 14, outline: 'none',
          }}
        />

        <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.06em',
          color: 'var(--text-4)', marginBottom: 8 }}>Skills attached automatically</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          {uc.skills.map(s => (
            <span key={s} style={{
              fontSize: 11.5, padding: '3px 9px', borderRadius: 7,
              background: ACCENT_SOFT, color: ACCENT, border: `1px solid ${ACCENT_BORDER}`, fontWeight: 500,
            }}>{skillLabel(s)}</span>
          ))}
        </div>
        <p style={{ fontSize: 11.5, color: 'var(--text-4)', margin: '0 0 22px' }}>
          Healthcare guardrails, emergency escalation and medical speech recognition are
          built into every healthcare agent. You can customise skills, prompt and the phone
          number in the next step.
        </p>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            disabled={busy}
            style={{
              padding: '9px 16px', borderRadius: 'var(--radius)', fontSize: 13.5, fontWeight: 600,
              background: 'transparent', color: 'var(--text-2)', border: '1px solid var(--border-strong)',
              cursor: busy ? 'default' : 'pointer',
            }}
          >Cancel</button>
          <button
            onClick={handleCreate}
            disabled={busy}
            style={{
              padding: '9px 18px', borderRadius: 'var(--radius)', fontSize: 13.5, fontWeight: 650,
              background: ACCENT, color: '#fff', border: 'none', cursor: busy ? 'default' : 'pointer',
              opacity: busy ? 0.7 : 1,
            }}
          >{busy ? 'Creating…' : 'Create & customise'}</button>
        </div>
      </div>
    </div>
  );
}

function StatChip({ value, label }: { value: string; label: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <span style={{ fontSize: 22, fontWeight: 700, color: '#fff', letterSpacing: '-0.02em' }}>{value}</span>
      <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)' }}>{label}</span>
    </div>
  );
}

export default function HealthcareDomain() {
  const [active, setActive] = useState<HealthcareUseCase | null>(null);
  const [dirFilter, setDirFilter] = useState<'all' | 'inbound' | 'outbound'>('all');
  const inbound  = useMemo(() => HEALTHCARE_USE_CASES.filter(u => u.direction !== 'outbound'), []);
  const outbound = useMemo(() => HEALTHCARE_USE_CASES.filter(u => u.direction === 'outbound'), []);

  const grid: React.CSSProperties = {
    display: 'grid', gap: 16,
    gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))',
  };

  return (
    <div style={{ padding: '28px 40px 72px', maxWidth: 1280, margin: '0 auto' }}>
      {/* Hero */}
      <div style={{
        position: 'relative', overflow: 'hidden', borderRadius: 'var(--radius-xl)',
        background: ACCENT,
        padding: '34px 36px', marginBottom: 30, color: '#fff',
        boxShadow: '0 12px 40px rgba(117,91,227,0.28)',
      }}>
        <div style={{ position: 'relative', zIndex: 1, maxWidth: 720 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '4px 12px',
            borderRadius: 99, background: 'rgba(255,255,255,0.16)', fontSize: 12, fontWeight: 600,
            marginBottom: 14 }}>
            <Icon name="bulb" size={13} /> Healthcare Domain
          </div>
          <h1 style={{ fontSize: 30, fontWeight: 720, letterSpacing: '-0.02em', margin: '0 0 10px' }}>
            AI voice agents for clinics &amp; hospitals
          </h1>
          <p style={{ fontSize: 15, lineHeight: 1.55, color: 'rgba(255,255,255,0.88)', margin: '0 0 22px' }}>
            Pick a use case below to spin up an agent — it comes pre-loaded with the right
            skills, healthcare guardrails, emergency escalation and medical speech recognition.
            Test it in the demo, assign a number, and go live.
          </p>
          <div style={{ display: 'flex', gap: 34 }}>
            <StatChip value="15" label="Use cases" />
            <StatChip value="10 / 5" label="Inbound / Outbound" />
            <StatChip value="108" label="Emergency-safe" />
          </div>
        </div>
      </div>

      {/* Inbound */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <SectionHeading icon="chat" title="Inbound & two-way use cases"
          sub="Patients call in — the agent handles the request and collects what the clinic needs." />
        <div style={{ display: 'flex', gap: 3, padding: 3, borderRadius: 8, background: 'var(--bg-3)' }}>
          {(['all', 'inbound', 'outbound'] as const).map(f => (
            <button
              key={f}
              onClick={() => setDirFilter(f)}
              style={{
                padding: '6px 13px', borderRadius: 6, fontSize: 12.5, fontWeight: 600,
                border: 'none', cursor: 'pointer',
                background: dirFilter === f ? 'var(--card-bg)' : 'transparent',
                color: dirFilter === f ? 'var(--text-1)' : 'var(--text-3)',
                boxShadow: dirFilter === f ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
              }}
            >{f === 'all' ? 'All' : f === 'inbound' ? 'Inbound' : 'Outbound'}</button>
          ))}
        </div>
      </div>
      {dirFilter !== 'outbound' && (
        <div style={grid}>
          {inbound.map(uc => <UseCaseCard key={uc.key} uc={uc} onCreate={() => setActive(uc)} />)}
        </div>
      )}

      {/* Outbound */}
      {dirFilter !== 'inbound' && (
        <div style={{ marginTop: 34 }}>
          <SectionHeading icon="broadcast" title="Outbound use cases"
            sub="The agent calls the patient — reminders, follow-ups and surveys." />
          <div style={grid}>
            {outbound.map(uc => <UseCaseCard key={uc.key} uc={uc} onCreate={() => setActive(uc)} />)}
          </div>
        </div>
      )}

      {active && <CreateModal uc={active} onClose={() => setActive(null)} />}
    </div>
  );
}

function SectionHeading({ icon, title, sub }: { icon: string; title: string; sub: string }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        <span style={{ color: ACCENT_HI, display: 'grid', placeItems: 'center' }}><Icon name={icon} size={17} /></span>
        <h2 style={{ fontSize: 18, fontWeight: 680, color: 'var(--text-1)', margin: 0, letterSpacing: '-0.01em' }}>{title}</h2>
      </div>
      <p style={{ fontSize: 13, color: 'var(--text-3)', margin: '4px 0 0 26px' }}>{sub}</p>
    </div>
  );
}
