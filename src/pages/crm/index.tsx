/**
 * CRM landing. Navigation only: the list endpoints return pages, not totals, so showing counts would
 * need extra requests or invented numbers. Neither is done.
 */
import { Link } from 'react-router-dom';
import { Icon } from '../../assets/icons';
import { CrmPage, PageHeader } from './ui';

export const CRM_SECTIONS = [
  { to: '/crm/patients', icon: 'user', title: 'Patients', desc: 'Search patient records, see verification history and recent interactions.' },
  { to: '/crm/cases', icon: 'list', title: 'Cases', desc: 'Follow-ups raised from patient interactions, by status and priority.' },
  { to: '/crm/tasks', icon: 'check', title: 'Tasks', desc: 'Work items for your team, with due dates and status.' },
  { to: '/crm/appointments', icon: 'calendar', title: 'Appointments', desc: 'Appointments recorded for your patients.' },
  { to: '/crm/providers', icon: 'team', title: 'Providers', desc: 'Clinicians and services patients can be booked with.' },
] as const;

export default function CrmHomePage() {
  return (
    <CrmPage>
      <PageHeader
        eyebrow="Healthcare · CRM"
        title="CRM"
        subtitle="Patient records, follow-ups and appointments captured by your agents."
      />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
        {CRM_SECTIONS.map((s) => (
          <Link
            key={s.to} to={s.to}
            style={{ display: 'block', padding: '18px 20px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', textDecoration: 'none', color: 'var(--text-1)' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 700, fontSize: 15 }}>
              <Icon name={s.icon} size={18} style={{ color: 'var(--blue)' }} />
              {s.title}
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-3)', margin: '8px 0 0' }}>{s.desc}</p>
          </Link>
        ))}
      </div>
    </CrmPage>
  );
}
