import { useApp } from '../../context/AppContext';
import Icon from '../../assets/icons';

const USE_CASES = [
  {
    id: 'cs',
    view: 'chatbot_cs',
    title: 'Customer Support',
    desc: 'Handle tickets, returns, billing issues, and order tracking with proactive troubleshooting.',
    icon: 'chat',
    flows: 8, agents: 3,
    featured: true,
  },
  {
    id: 'tech',
    view: 'chatbot_tech',
    title: 'Technical Support',
    desc: 'IT helpdesk — password resets, VPN config, hardware/software triage, access requests.',
    icon: 'flow',
    flows: 6, agents: 2,
    featured: false,
  },
  {
    id: 'health',
    view: 'chatbot_health',
    title: 'Healthcare Coaching',
    desc: 'Symptom triage, CBT techniques, mental health support, and medication reminders.',
    icon: 'health',
    flows: 9, agents: 4,
    featured: false,
  },
  {
    id: 'bank',
    view: 'chatbot_bank',
    title: 'Banking Support',
    desc: 'Account queries, dispute resolution, loan information, and fraud alert escalation.',
    icon: 'money',
    flows: 7, agents: 3,
    featured: false,
  },
  {
    id: 'appt',
    view: 'chatbot_appt',
    title: 'Appointment Booking',
    desc: 'Book, reschedule, or cancel appointments for clinics, salons, and service centres.',
    icon: 'broadcast',
    flows: 5, agents: 2,
    featured: false,
  },
  {
    id: 'hr',
    view: 'chatbot_hr',
    title: 'HR Operations',
    desc: 'Employee onboarding, recruitment screening, leave/payroll queries, policy FAQs.',
    icon: 'hr',
    flows: 6, agents: 2,
    featured: false,
  },
];

type UseCase = (typeof USE_CASES)[number];

function UseCaseCard({ uc, onClick }: { uc: UseCase; onClick: () => void }) {
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
        transition: 'transform 0.2s ease, border-color 0.15s',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = 'translateY(-2px)';
        e.currentTarget.style.borderColor = 'var(--border-strong)';
        const cta = e.currentTarget.querySelector('.cat-cta') as HTMLElement | null;
        if (cta) cta.style.color = 'var(--purple-hi)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.borderColor = 'var(--border)';
        const cta = e.currentTarget.querySelector('.cat-cta') as HTMLElement | null;
        if (cta) cta.style.color = 'var(--text-1)';
      }}
    >
      {/* Icon */}
      <div style={{
        width: 48, height: 48, borderRadius: 12,
        display: 'grid', placeItems: 'center',
        background: 'var(--card-bg)',
        border: '1px solid var(--border)',
        marginBottom: 16,
        color: 'var(--text-2)',
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
            background: 'rgba(0, 113, 227, 0.15)',
            border: '1px solid rgba(0, 113, 227, 0.30)',
            color: 'var(--purple-hi)',
            borderRadius: 99, marginLeft: 6, verticalAlign: 'middle',
            display: 'inline-flex', alignItems: 'center', gap: 4,
          }}>
            <Icon name="zap" size={11} /> Featured
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
        paddingTop: 14, borderTop: '1px solid var(--border)',
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
            transition: 'color 0.15s',
          }}
        >
          Open workspace <Icon name="arrowRight" size={14} />
        </div>
      </div>
    </div>
  );
}

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
        <h1 className="page-title">
          Choose a chatbot use case
        </h1>
        <p style={{ color: 'var(--text-3)', fontSize: 15, maxWidth: 560 }}>
          Each workspace runs the full LangGraph 9-node pipeline. Upload your knowledge base,
          configure the prompt, test it live — then publish and get a hosted URL.
        </p>
      </div>

      {/* Section header */}
      <div style={{ margin: '8px 0 18px' }}>
        <h2 style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--text-1)' }}>
          Chatbot workspaces
        </h2>
        <p style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 2 }}>
          Pick a use case to launch the full workspace — knowledge base, prompt, test &amp; publish.
        </p>
      </div>

      {/* Cards grid */}
      <div className="grid-categories">
        {USE_CASES.map(uc => (
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
