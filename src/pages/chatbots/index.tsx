/**
 * ChatbotsPage — landing page showing the 6 LangGraph chatbot use cases.
 *
 * Same card design as the voice-agent CategoryGrid on the dashboard.
 * Clicking a card navigates to the full-screen chatbot workspace
 * (chatbot_cs / chatbot_tech / chatbot_health / chatbot_bank /
 *  chatbot_appt / chatbot_hr) registered in App.tsx's AGENT_VIEWS.
 */
import { useApp } from '../../context/AppContext';
import Icon from '../../assets/icons';

// ── Use-case definitions ──────────────────────────────────────────────────────

const USE_CASES = [
  {
    id: 'cs',
    view: 'chatbot_cs',
    title: 'Customer Support',
    desc: 'Handle tickets, returns, billing issues, and order tracking with proactive troubleshooting.',
    icon: 'chat',
    tint: 'purple' as const,
    flows: 8, agents: 3,
    featured: true,
  },
  {
    id: 'tech',
    view: 'chatbot_tech',
    title: 'Technical Support',
    desc: 'IT helpdesk — password resets, VPN config, hardware/software triage, access requests.',
    icon: 'flow',
    tint: 'blue' as const,
    flows: 6, agents: 2,
    featured: false,
  },
  {
    id: 'health',
    view: 'chatbot_health',
    title: 'Healthcare Coaching',
    desc: 'Symptom triage, CBT techniques, mental health support, and medication reminders.',
    icon: 'health',
    tint: 'teal' as const,
    flows: 9, agents: 4,
    featured: false,
  },
  {
    id: 'bank',
    view: 'chatbot_bank',
    title: 'Banking Support',
    desc: 'Account queries, dispute resolution, loan information, and fraud alert escalation.',
    icon: 'money',
    tint: 'green' as const,
    flows: 7, agents: 3,
    featured: false,
  },
  {
    id: 'appt',
    view: 'chatbot_appt',
    title: 'Appointment Booking',
    desc: 'Book, reschedule, or cancel appointments for clinics, salons, and service centres.',
    icon: 'broadcast',
    tint: 'amber' as const,
    flows: 5, agents: 2,
    featured: false,
  },
  {
    id: 'hr',
    view: 'chatbot_hr',
    title: 'HR Operations',
    desc: 'Employee onboarding, recruitment screening, leave/payroll queries, policy FAQs.',
    icon: 'hr',
    tint: 'pink' as const,
    flows: 6, agents: 2,
    featured: false,
  },
];

// ── Tint palette (matches CategoryGrid) ──────────────────────────────────────

const tintColors = {
  purple: 'rgba(117,91,227,0.55)',
  blue:   'rgba(24,218,252,0.5)',
  teal:   'rgba(79,209,197,0.5)',
  green:  'rgba(76,175,80,0.5)',
  amber:  'rgba(255,181,71,0.5)',
  pink:   'rgba(230,90,255,0.5)',
};

const tintIconColors = {
  purple: 'var(--purple-hi)',
  blue:   'var(--blue)',
  teal:   'var(--teal)',
  green:  'var(--green)',
  amber:  'var(--amber)',
  pink:   'var(--pink)',
};

// ── Card ─────────────────────────────────────────────────────────────────────

function UseCaseCard({ uc, onClick }) {
  return (
    <div
      className="cat-card-anim"
      onClick={onClick}
      style={{
        position: 'relative',
        background: 'var(--card-bg)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        padding: 24,
        cursor: 'pointer',
        overflow: 'hidden',
        backdropFilter: 'blur(20px)',
        transition: 'transform 0.3s cubic-bezier(0.2,0.7,0.3,1), border-color 0.2s',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = 'translateY(-4px)';
        e.currentTarget.style.borderColor = 'var(--border-accent)';
        const glow = e.currentTarget.querySelector('.cat-glow') as HTMLElement | null;
        if (glow) { glow.style.opacity = '0.8'; glow.style.transform = 'scale(1.2)'; }
        const cta = e.currentTarget.querySelector('.cat-cta') as HTMLElement | null;
        if (cta) cta.style.gap = '10px';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.borderColor = 'var(--border)';
        const glow = e.currentTarget.querySelector('.cat-glow') as HTMLElement | null;
        if (glow) { glow.style.opacity = '0.5'; glow.style.transform = 'scale(1)'; }
        const cta = e.currentTarget.querySelector('.cat-cta') as HTMLElement | null;
        if (cta) cta.style.gap = '5px';
      }}
    >
      {/* Corner glow */}
      <div
        className="cat-glow"
        style={{
          position: 'absolute',
          width: 180, height: 180, borderRadius: '50%',
          background: `radial-gradient(circle, ${tintColors[uc.tint]}, transparent 70%)`,
          filter: 'blur(40px)', opacity: 0.5,
          top: -60, right: -60,
          transition: 'opacity 0.3s, transform 0.5s',
          pointerEvents: 'none',
        }}
      />

      {/* Icon */}
      <div style={{
        width: 48, height: 48, borderRadius: 12,
        display: 'grid', placeItems: 'center',
        background: 'var(--tint-2)',
        border: '1px solid var(--border-strong)',
        marginBottom: 16, position: 'relative',
        color: tintIconColors[uc.tint],
      }}>
        <Icon name={uc.icon} size={22} />
      </div>

      {/* Title */}
      <div style={{
        fontSize: 18, fontWeight: 600, marginBottom: 6,
        letterSpacing: '-0.01em', color: 'var(--text-1)',
      }}>
        {uc.title}
        {uc.featured && (
          <span style={{
            fontSize: 10, padding: '2px 8px',
            background: 'rgba(117,91,227,0.2)',
            border: '1px solid var(--border-accent)',
            color: 'var(--purple-hi)',
            borderRadius: 99, marginLeft: 6, verticalAlign: 'middle',
          }}>
            ⚡ Featured
          </span>
        )}
      </div>

      {/* Description */}
      <div style={{
        fontSize: 13.5, color: 'var(--text-3)', lineHeight: 1.5,
        marginBottom: 18, minHeight: 42,
      }}>
        {uc.desc}
      </div>

      {/* Footer */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        paddingTop: 14, borderTop: '1px solid var(--border)', position: 'relative',
      }}>
        <div style={{ fontSize: 11.5, color: 'var(--text-3)', display: 'flex', gap: 12 }}>
          <span><strong style={{ color: 'var(--text-1)', fontWeight: 600 }}>{uc.flows}</strong> flows</span>
          <span><strong style={{ color: 'var(--text-1)', fontWeight: 600 }}>{uc.agents}</strong> agents</span>
        </div>
        <div
          className="cat-cta"
          style={{
            fontSize: 12.5, fontWeight: 600, color: 'var(--text-1)',
            display: 'inline-flex', alignItems: 'center', gap: 5,
            transition: 'gap 0.2s',
          }}
        >
          Open workspace <Icon name="arrowRight" size={14} />
        </div>
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ChatbotsPage() {
  const { showView, setActiveNav } = useApp();

  function openUseCase(view: string) {
    setActiveNav('chatbots');
    showView(view);
  }

  return (
    <div className="fade-up">
      {/* Page header */}
      <div style={{ marginBottom: 32 }}>
        <div style={{
          fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.2em',
          color: 'var(--text-3)', marginBottom: 10,
        }}>
          AI Platform · Chatbot Workspaces
        </div>
        <h1 style={{
          fontSize: 36, fontWeight: 700, letterSpacing: '-0.025em',
          lineHeight: 1.1, marginBottom: 12, color: 'var(--text-1)',
        }}>
          Choose a <span className="grad-text">chatbot use case</span>
        </h1>
        <p style={{ color: 'var(--text-3)', fontSize: 15, maxWidth: 560 }}>
          Each workspace runs the full LangGraph 9-node pipeline. Upload your knowledge base,
          configure the prompt, test it live — then publish and get a hosted URL.
        </p>
      </div>

      {/* Section header */}
      <div style={{
        display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
        margin: '8px 0 18px',
      }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--text-1)' }}>
            Chatbot workspaces
          </h2>
          <p style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 2 }}>
            Pick a use case to launch the full workspace — knowledge base, prompt, test &amp; publish.
          </p>
        </div>
      </div>

      {/* Cards grid — 3 columns, same as voice agents */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 18,
        marginBottom: 40,
      }}>
        {USE_CASES.map((uc, idx) => (
          <UseCaseCard
            key={uc.id}
            uc={uc}
            onClick={() => openUseCase(uc.view)}
          />
        ))}
      </div>

    </div>
  );
}
