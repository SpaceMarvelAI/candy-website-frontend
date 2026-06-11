/**
 * SkillsPicker — attach / detach Candy platform skills to an agent.
 *
 * Rendered inside the "Skills" accordion item in AgentWorkspace.
 * Fetches available skills from /v1/skills and current attachments from
 * /v1/agents/{id}/skills. Attach/detach are instant (optimistic UI).
 */
import { useState, useEffect, useCallback } from 'react';
import { useApp } from '../../context/AppContext';
import Icon from '../../assets/icons';
import {
  listSkills, getAgentSkills, attachSkill, detachSkill,
  type Skill, type SkillCategory,
} from '../../api/skills';

// ── Category metadata (visual) ────────────────────────────────────────────────

const CATEGORY_META: Record<SkillCategory, { icon: string; color: string; label: string }> = {
  verification:  { icon: 'lock',     color: 'var(--purple-hi)', label: 'Verification'  },
  payment:       { icon: 'card',     color: 'var(--blue)',      label: 'Payment'       },
  scheduling:    { icon: 'calendar', color: 'var(--teal)',      label: 'Scheduling'    },
  communication: { icon: 'mail',     color: 'var(--green)',     label: 'Communication' },
  analytics:     { icon: 'chart',    color: 'var(--amber)',     label: 'Analytics'     },
  escalation:    { icon: 'alert',    color: 'var(--pink)',      label: 'Escalation'    },
  general:       { icon: 'settings', color: 'var(--text-3)',    label: 'General'       },
};

// ── Fallback list shown while API loads (or if backend isn't wired yet) ────────
// Mirrors skills_registry.py exactly so the UI always has something to show.

const FALLBACK_SKILLS: Skill[] = [
  {
    slug: 'otp_verification',
    title: 'OTP Verification',
    description: 'Send a one-time PIN via SMS and verify it mid-conversation before proceeding with account actions.',
    category: 'verification',
    channel: 'both',
    compatible_use_cases: ['*'],
    is_premium: false,
    is_active: true,
    version: 1,
  },
  {
    slug: 'csat_survey',
    title: 'CSAT Survey',
    description: 'Collect a 1–5 satisfaction rating at the end of every conversation. Results feed your analytics dashboard.',
    category: 'analytics',
    channel: 'both',
    compatible_use_cases: ['*'],
    is_premium: false,
    is_active: true,
    version: 1,
  },
  {
    slug: 'smart_escalation',
    title: 'Smart Escalation',
    description: 'Escalate to a human with a structured context brief — issue, sentiment, and resolution summary — so callers never repeat themselves.',
    category: 'escalation',
    channel: 'both',
    compatible_use_cases: ['*'],
    is_premium: false,
    is_active: true,
    version: 1,
  },
];

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  agentId:      string | null;
  useCaseSlug?: string;
  tint?:        string;
  onCountChange?: (count: number) => void;
}

export default function SkillsPicker({ agentId, useCaseSlug, tint = 'purple', onCountChange }: Props) {
  const { addToast } = useApp();

  const [skills,       setSkills]       = useState<Skill[]>(FALLBACK_SKILLS);
  const [attachedSlugs, setAttachedSlugs] = useState<Set<string>>(new Set());
  const [loading,      setLoading]      = useState(false);
  const [toggling,     setToggling]     = useState<Set<string>>(new Set());
  const [filter,       setFilter]       = useState<SkillCategory | 'all'>('all');

  // Report count up to the accordion header for the badge
  useEffect(() => {
    onCountChange?.(attachedSlugs.size);
  }, [attachedSlugs.size, onCountChange]);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch platform skills list — fall back to hardcoded if backend not ready
      const [available, attached] = await Promise.allSettled([
        listSkills(),
        agentId ? getAgentSkills(agentId) : Promise.resolve([]),
      ]);
      if (available.status === 'fulfilled' && available.value.length > 0) {
        setSkills(available.value);
      }
      if (attached.status === 'fulfilled') {
        setAttachedSlugs(new Set(
          attached.value.filter(a => a.is_active).map(a => a.skill_slug)
        ));
      }
    } catch {
      // silent — fallbacks are already set
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => { reload(); }, [reload]);

  async function toggle(skill: Skill) {
    if (!agentId) { addToast('Pick an agent first', 'error'); return; }
    const isAttached = attachedSlugs.has(skill.slug);

    // Optimistic
    setToggling(s => new Set(s).add(skill.slug));
    setAttachedSlugs(prev => {
      const next = new Set(prev);
      isAttached ? next.delete(skill.slug) : next.add(skill.slug);
      return next;
    });

    try {
      if (isAttached) {
        await detachSkill(agentId, skill.slug);
        addToast(`${skill.title} detached`, 'success');
      } else {
        await attachSkill(agentId, skill.slug);
        addToast(`${skill.title} attached`, 'success');
      }
    } catch (e: any) {
      // Rollback
      setAttachedSlugs(prev => {
        const next = new Set(prev);
        isAttached ? next.add(skill.slug) : next.delete(skill.slug);
        return next;
      });
      addToast(`Failed: ${e?.message ?? e}`, 'error');
    } finally {
      setToggling(s => { const n = new Set(s); n.delete(skill.slug); return n; });
    }
  }

  // Filter skills compatible with the current use case
  const visibleSkills = skills.filter(s => {
    const compatible = s.compatible_use_cases.includes('*') ||
      !useCaseSlug ||
      s.compatible_use_cases.includes(useCaseSlug);
    const matchesFilter = filter === 'all' || s.category === filter;
    return compatible && matchesFilter && s.is_active;
  });

  // Derive unique categories for the filter tabs
  const categories = Array.from(new Set(skills.map(s => s.category)));

  return (
    <div style={{ padding: 0 }}>

      {/* ── Category filter tabs ─────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '12px 14px 10px',
        borderBottom: '1px solid var(--border)',
        overflowX: 'auto',
      }}>
        <FilterTab
          active={filter === 'all'}
          label="All"
          icon="spark"
          color="var(--text-2)"
          onClick={() => setFilter('all')}
        />
        {categories.map(cat => {
          const meta = CATEGORY_META[cat] ?? CATEGORY_META.general;
          return (
            <FilterTab
              key={cat}
              active={filter === cat}
              label={meta.label}
              icon={meta.icon}
              color={meta.color}
              onClick={() => setFilter(cat)}
            />
          );
        })}
      </div>

      {/* ── Skill grid ───────────────────────────────────────────────────────── */}
      {!agentId ? (
        <EmptyState icon="layers" message="Pick an agent above to manage its skills." />
      ) : loading ? (
        <EmptyState icon="refresh" message="Loading skills…" />
      ) : visibleSkills.length === 0 ? (
        <EmptyState icon="layers" message="No skills match this filter." />
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 10,
          padding: 14,
        }}>
          {visibleSkills.map(skill => {
            const attached = attachedSlugs.has(skill.slug);
            const busy     = toggling.has(skill.slug);
            const meta     = CATEGORY_META[skill.category] ?? CATEGORY_META.general;

            return (
              <SkillCard
                key={skill.slug}
                skill={skill}
                meta={meta}
                attached={attached}
                busy={busy}
                onToggle={() => toggle(skill)}
              />
            );
          })}
        </div>
      )}

      {/* ── Attached count footer ────────────────────────────────────────────── */}
      {agentId && attachedSlugs.size > 0 && (
        <div style={{
          padding: '10px 14px',
          borderTop: '1px solid var(--border)',
          fontSize: 11.5,
          color: 'var(--text-3)',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}>
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 18, height: 18,
            borderRadius: '50%',
            background: 'rgba(117,91,227,0.25)',
            border: '1px solid rgba(117,91,227,0.4)',
            color: 'var(--purple-hi)',
            fontSize: 10,
            fontWeight: 700,
          }}>
            {attachedSlugs.size}
          </span>
          skill{attachedSlugs.size !== 1 ? 's' : ''} active on this agent
        </div>
      )}
    </div>
  );
}

// ── SkillCard ─────────────────────────────────────────────────────────────────

function SkillCard({
  skill, meta, attached, busy, onToggle,
}: {
  skill:    Skill;
  meta:     { icon: string; color: string; label: string };
  attached: boolean;
  busy:     boolean;
  onToggle: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'relative',
        borderRadius: 12,
        border: `1px solid ${attached
          ? `${meta.color}55`
          : hovered ? 'var(--border-strong)' : 'var(--border)'
        }`,
        background: attached
          ? `color-mix(in srgb, ${meta.color} 8%, var(--surface))`
          : hovered ? 'var(--surface-elev)' : 'var(--surface)',
        padding: '13px 13px 11px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        transition: 'all 0.15s ease',
        cursor: 'default',
      }}
    >
      {/* Premium badge */}
      {skill.is_premium && (
        <div style={{
          position: 'absolute', top: 10, right: 10,
          fontSize: 9, fontWeight: 700, letterSpacing: '0.06em',
          textTransform: 'uppercase', color: 'var(--amber)',
          background: 'rgba(255,181,71,0.12)',
          border: '1px solid rgba(255,181,71,0.3)',
          padding: '2px 6px', borderRadius: 4,
        }}>PRO</div>
      )}

      {/* Icon + category */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10, flexShrink: 0,
          background: `color-mix(in srgb, ${meta.color} 15%, transparent)`,
          border: `1px solid color-mix(in srgb, ${meta.color} 35%, transparent)`,
          display: 'grid', placeItems: 'center',
          fontSize: 18, color: meta.color,
        }}>
          <Icon name={meta.icon} size={18} />
        </div>
        <div style={{
          display: 'inline-flex', alignItems: 'center',
          fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: meta.color,
          background: `color-mix(in srgb, ${meta.color} 12%, transparent)`,
          border: `1px solid color-mix(in srgb, ${meta.color} 30%, transparent)`,
          padding: '2px 7px', borderRadius: 5,
        }}>
          {meta.label}
        </div>
      </div>

      {/* Title */}
      <div style={{
        fontSize: 13,
        fontWeight: 700,
        color: attached ? 'var(--text-1)' : 'var(--text-1)',
        lineHeight: 1.3,
      }}>
        {skill.title}
      </div>

      {/* Description */}
      <div style={{
        fontSize: 11.5,
        color: 'var(--text-3)',
        lineHeight: 1.55,
        flex: 1,
      }}>
        {skill.description}
      </div>

      {/* Channel badge */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{
          fontSize: 10, color: 'var(--text-4)',
          display: 'flex', alignItems: 'center', gap: 4,
        }}>
          <Icon name={skill.channel === 'chat' ? 'chat' : 'mic'} size={11} />
          <span style={{ textTransform: 'capitalize' }}>{skill.channel}</span>
        </div>

        {/* Toggle button */}
        <button
          onClick={onToggle}
          disabled={busy}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '5px 10px', borderRadius: 7,
            fontSize: 11.5, fontWeight: 600,
            cursor: busy ? 'wait' : 'pointer',
            transition: 'all 0.15s ease',
            opacity: busy ? 0.6 : 1,
            background: attached
              ? `color-mix(in srgb, ${meta.color} 20%, transparent)`
              : 'var(--tint-3)',
            color: attached ? meta.color : 'var(--text-3)',
            border: attached
              ? `1px solid color-mix(in srgb, ${meta.color} 40%, transparent)`
              : '1px solid var(--border)',
          }}
        >
          {busy ? (
            <>
              <SpinnerIcon />
              <span>{attached ? 'Removing…' : 'Adding…'}</span>
            </>
          ) : attached ? (
            <>
              <CheckIcon color={meta.color} />
              <span>Attached</span>
            </>
          ) : (
            <>
              <PlusIcon />
              <span>Attach</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}

// ── FilterTab ─────────────────────────────────────────────────────────────────

function FilterTab({
  active, label, icon, color, onClick,
}: {
  active: boolean;
  label:  string;
  icon:   string;
  color:  string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '4px 10px', borderRadius: 20, border: 'none',
        fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
        whiteSpace: 'nowrap', flexShrink: 0,
        transition: 'all 0.12s',
        background: active ? `color-mix(in srgb, ${color} 18%, transparent)` : 'var(--tint-2)',
        color:      active ? color : 'var(--text-3)',
        outline:    active ? `1px solid color-mix(in srgb, ${color} 35%, transparent)` : 'none',
      }}
    >
      <Icon name={icon} size={13} />
      <span>{label}</span>
    </button>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ icon, message }: { icon: string; message: string }) {
  return (
    <div style={{
      minHeight: 180,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 10, padding: 24,
    }}>
      <div style={{ color: 'var(--text-3)' }}><Icon name={icon} size={32} /></div>
      <div style={{ fontSize: 13, color: 'var(--text-3)', textAlign: 'center', lineHeight: 1.5 }}>
        {message}
      </div>
    </div>
  );
}

// ── Tiny icons ────────────────────────────────────────────────────────────────

function CheckIcon({ color }: { color: string }) {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="2 6 5 9 10 3" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <line x1="6" y1="2" x2="6" y2="10" />
      <line x1="2" y1="6" x2="10" y2="6" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg
      width="11" height="11" viewBox="0 0 12 12" fill="none"
      stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"
      style={{ animation: 'spin 0.8s linear infinite' }}
    >
      <path d="M6 2a4 4 0 0 1 0 8" />
    </svg>
  );
}
