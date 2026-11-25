/**
 * #/team — standalone mode only (no Dashboard). The install's one workspace: who is in it, which
 * companies each person may use, invitations, and email-domain auto-join. Same rules as the
 * Dashboard's team screens (the backend enforces them — Candy-Agents api/v1/team.py):
 *   * "All companies" includes companies created later; the Owner always has all.
 *   * Owner/Admin manage people below their own role; an Admin limited to some companies can only
 *     give those.
 */
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { useConfirm } from '../../components/ConfirmDialog';
import {
  isStandaloneMode, teamApi,
  type DomainJoinSettings, type InviteResult, type TeamDomain, type TeamInvitation, type TeamMember,
} from '../../api/standalone';
import { Button, Card, CompanyChoice, ErrorText, Field, inputStyle } from './ui';

const RANK: Record<string, number> = { owner: 3, admin: 2, builder: 1, member: 1, viewer: 0 };
const INVITE_ROLES = [
  { value: 'viewer', label: 'Viewer' },
  { value: 'builder', label: 'Builder' },
  { value: 'admin', label: 'Admin' },
];
type Company = { id: string; name: string };

function message(e: unknown, fallback: string): string {
  return (e as { message?: string })?.message || fallback;
}

function accessLabel(m: { company_access: string; company_ids: string[] }, names: Map<string, string>) {
  if (m.company_access === 'all') return 'All companies';
  if (!m.company_ids.length) return 'No companies';
  return m.company_ids.map(id => names.get(id) ?? 'Removed company').join(', ');
}

const cell = { padding: '10px 8px', borderTop: '1px solid var(--border)', fontSize: 13, color: 'var(--text-1)', verticalAlign: 'top' as const };

export default function TeamPage() {
  const { user, addToast } = useApp();
  const confirm = useConfirm();
  const myRank = RANK[(user?.role ?? '').toLowerCase()] ?? 0;
  const manager = myRank >= 2;

  const [members, setMembers] = useState<TeamMember[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [invitations, setInvitations] = useState<TeamInvitation[]>([]);
  const [domains, setDomains] = useState<TeamDomain[]>([]);
  const [joinSettings, setJoinSettings] = useState<DomainJoinSettings | null>(null);
  const [loadError, setLoadError] = useState('');

  const reload = useCallback(async () => {
    try {
      const [m, c] = await Promise.all([teamApi.members(), teamApi.companies()]);
      setMembers(m); setCompanies(c);
      if (manager) {
        const [i, d, s] = await Promise.all([teamApi.invitations(), teamApi.domains(), teamApi.domainSettings()]);
        setInvitations(i); setDomains(d); setJoinSettings(s);
      }
      setLoadError('');
    } catch (e) {
      setLoadError(message(e, 'Could not load the team.'));
    }
  }, [manager]);

  useEffect(() => { if (isStandaloneMode()) void reload(); }, [reload]);

  const names = useMemo(() => new Map(companies.map(c => [c.id, c.name])), [companies]);

  if (!isStandaloneMode()) return <Navigate to="/healthcare" replace />;

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '24px 16px', display: 'grid', gap: 18 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 24, color: 'var(--text-1)' }}>Team</h1>
        <p style={{ margin: '6px 0 0', fontSize: 14, color: 'var(--text-2)' }}>
          People in this workspace and the companies each of them can use.
        </p>
      </div>
      <ErrorText>{loadError}</ErrorText>

      <MembersCard
        members={members} companies={companies} names={names} myRank={myRank} myId={user?.user_id ?? ''}
        manager={manager} onChanged={reload} addToast={addToast} confirm={confirm}
      />
      {manager && (
        <>
          <InviteCard companies={companies} myRank={myRank} onInvited={reload} />
          <InvitationsCard invitations={invitations} names={names} onChanged={reload} addToast={addToast} confirm={confirm} />
          <DomainsCard
            domains={domains} settings={joinSettings} companies={companies}
            onChanged={reload} addToast={addToast} confirm={confirm}
          />
        </>
      )}
    </div>
  );
}

type Toast = ReturnType<typeof useApp>['addToast'];
type Confirm = ReturnType<typeof useConfirm>;

// ── Members ───────────────────────────────────────────────────────────────────────────────────

function MembersCard({
  members, companies, names, myRank, myId, manager, onChanged, addToast, confirm,
}: {
  members: TeamMember[]; companies: Company[]; names: Map<string, string>; myRank: number; myId: string;
  manager: boolean; onChanged: () => void; addToast: Toast; confirm: Confirm;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [choice, setChoice] = useState<string[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const canManage = (m: TeamMember) => manager && m.user_id !== myId && (RANK[m.role.toLowerCase()] ?? 0) < myRank;

  const startEdit = (m: TeamMember) => {
    setEditing(m.user_id); setError('');
    setChoice(m.company_access === 'all' ? null : m.company_ids);
  };

  const save = async (m: TeamMember) => {
    if (choice !== null && choice.length === 0) { setError('Pick at least one company, or choose all companies.'); return; }
    setBusy(true); setError('');
    try {
      await teamApi.setMemberCompanies(m.user_id, choice);
      addToast(`Updated ${m.full_name || m.email}'s companies`, 'success');
      setEditing(null); onChanged();
    } catch (e) {
      setError(message(e, 'Could not save.'));
    } finally { setBusy(false); }
  };

  const remove = async (m: TeamMember) => {
    const ok = await confirm({
      title: `Remove ${m.full_name || m.email}?`,
      body: 'They will no longer be able to sign in to this workspace.',
      confirmLabel: 'Remove member',
    });
    if (!ok) return;
    try {
      await teamApi.removeMember(m.user_id);
      addToast('Member removed', 'success'); onChanged();
    } catch (e) {
      addToast(message(e, 'Could not remove the member.'), 'error');
    }
  };

  return (
    <Card title={`Members (${members.length})`}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', fontSize: 12, color: 'var(--text-3)' }}>
              <th style={{ padding: '0 8px 8px' }}>Name</th>
              <th style={{ padding: '0 8px 8px' }}>Role</th>
              <th style={{ padding: '0 8px 8px' }}>Companies</th>
              {manager && <th style={{ padding: '0 8px 8px' }} />}
            </tr>
          </thead>
          <tbody>
            {members.map(m => (
              <tr key={m.user_id}>
                <td style={cell}>
                  <div style={{ fontWeight: 600 }}>{m.full_name || m.email}</div>
                  <div style={{ color: 'var(--text-3)', fontSize: 12 }}>{m.email}</div>
                </td>
                <td style={{ ...cell, textTransform: 'capitalize' }}>{m.role}</td>
                <td style={cell}>
                  {editing === m.user_id ? (
                    <div style={{ display: 'grid', gap: 10 }}>
                      <CompanyChoice companies={companies} selected={choice} onChange={setChoice} />
                      <ErrorText>{error}</ErrorText>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <Button small onClick={() => save(m)} disabled={busy}>Save</Button>
                        <Button small variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                      </div>
                    </div>
                  ) : accessLabel(m, names)}
                </td>
                {manager && (
                  <td style={{ ...cell, textAlign: 'right' }}>
                    {canManage(m) && editing !== m.user_id && (
                      <div style={{ display: 'inline-flex', gap: 8 }}>
                        <Button small variant="ghost" onClick={() => startEdit(m)}>Edit companies</Button>
                        <Button small variant="danger" onClick={() => remove(m)}>Remove</Button>
                      </div>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ── Invite ────────────────────────────────────────────────────────────────────────────────────

function InviteCard({ companies, myRank, onInvited }: { companies: Company[]; myRank: number; onInvited: () => void }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('viewer');
  const [choice, setChoice] = useState<string[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<InviteResult | null>(null);

  const roles = INVITE_ROLES.filter(r => RANK[r.value] < myRank);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (choice !== null && choice.length === 0) { setError('Pick at least one company, or choose all companies.'); return; }
    setBusy(true); setError(''); setResult(null);
    try {
      const r = await teamApi.invite(email.trim(), role, choice);
      setResult(r); setEmail(''); setChoice(null); onInvited();
    } catch (err) {
      setError(message(err, 'Could not send the invitation.'));
    } finally { setBusy(false); }
  };

  // Without an email server (or FRONTEND_URL) the invite isn't mailed: show the link to share.
  const shareLink = result && !result.emailed
    ? (result.accept_url ?? `${window.location.origin}${window.location.pathname}#/invite/${result.token}`)
    : null;

  return (
    <Card title="Invite someone">
      <form onSubmit={submit} style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          <Field label="Email">
            <input style={inputStyle} type="email" required value={email} onChange={e => setEmail(e.target.value)} />
          </Field>
          <Field label="Role">
            <select style={inputStyle} value={role} onChange={e => setRole(e.target.value)}>
              {roles.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Companies">
          <CompanyChoice companies={companies} selected={choice} onChange={setChoice} />
        </Field>
        <ErrorText>{error}</ErrorText>
        <div><Button type="submit" disabled={busy}>{busy ? 'Inviting…' : 'Send invitation'}</Button></div>
      </form>
      {result?.emailed && <p style={{ margin: 0, fontSize: 13, color: 'var(--green)' }}>Invitation emailed to {result.email}.</p>}
      {shareLink && (
        <div style={{ display: 'grid', gap: 6, fontSize: 13, color: 'var(--text-2)' }}>
          <span>No email was sent. Share this link with {result!.email} (valid for 7 days):</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <input style={{ ...inputStyle, fontSize: 12 }} readOnly value={shareLink} onFocus={e => e.target.select()} />
            <Button small variant="ghost" onClick={() => navigator.clipboard?.writeText(shareLink)}>Copy</Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function InvitationsCard({
  invitations, names, onChanged, addToast, confirm,
}: { invitations: TeamInvitation[]; names: Map<string, string>; onChanged: () => void; addToast: Toast; confirm: Confirm }) {
  if (!invitations.length) return null;
  const cancel = async (i: TeamInvitation) => {
    if (!await confirm({ title: `Cancel the invitation to ${i.email}?`, confirmLabel: 'Cancel invitation' })) return;
    try {
      await teamApi.cancelInvitation(i.id);
      addToast('Invitation cancelled', 'success'); onChanged();
    } catch (e) {
      addToast(message(e, 'Could not cancel the invitation.'), 'error');
    }
  };
  return (
    <Card title={`Pending invitations (${invitations.length})`}>
      {invitations.map(i => (
        <div key={i.id} style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', fontSize: 13 }}>
          <div>
            <div style={{ fontWeight: 600, color: 'var(--text-1)' }}>{i.email}</div>
            <div style={{ color: 'var(--text-3)', fontSize: 12, textTransform: 'capitalize' }}>
              {i.role} · {accessLabel(i, names)} · expires {new Date(i.expires_at).toLocaleDateString()}
            </div>
          </div>
          <Button small variant="danger" onClick={() => cancel(i)}>Cancel</Button>
        </div>
      ))}
    </Card>
  );
}

// ── Email domains ─────────────────────────────────────────────────────────────────────────────

function DomainsCard({
  domains, settings, companies, onChanged, addToast, confirm,
}: {
  domains: TeamDomain[]; settings: DomainJoinSettings | null; companies: Company[];
  onChanged: () => void; addToast: Toast; confirm: Confirm;
}) {
  const [domain, setDomain] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [access, setAccess] = useState<DomainJoinSettings['domain_join_access']>('all');
  const [choice, setChoice] = useState<string[]>([]);

  useEffect(() => {
    if (!settings) return;
    setAccess(settings.domain_join_access);
    setChoice(settings.company_ids);
  }, [settings]);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      await teamApi.addDomain(domain.trim());
      setDomain(''); onChanged();
    } catch (err) {
      setError(message(err, 'Could not add the domain.'));
    } finally { setBusy(false); }
  };

  const verify = async (d: TeamDomain) => {
    try {
      const r = await teamApi.verifyDomain(d.id);
      addToast(r.state === 'verified' ? `${d.domain} is verified` : `TXT record for ${d.domain} not found yet — DNS can take a while`,
        r.state === 'verified' ? 'success' : 'info');
      onChanged();
    } catch (e) {
      addToast(message(e, 'Could not check the domain.'), 'error');
    }
  };

  const remove = async (d: TeamDomain) => {
    if (!await confirm({ title: `Remove ${d.domain}?`, body: 'People with this email domain will need an invitation to join.', confirmLabel: 'Remove domain' })) return;
    try {
      await teamApi.removeDomain(d.id); onChanged();
    } catch (e) {
      addToast(message(e, 'Could not remove the domain.'), 'error');
    }
  };

  const saveSettings = async () => {
    if (access === 'selected' && !choice.length) { addToast('Pick at least one company, or choose all companies.', 'error'); return; }
    try {
      await teamApi.saveDomainSettings(access, choice);
      addToast('Auto-join setting saved', 'success'); onChanged();
    } catch (e) {
      addToast(message(e, 'Could not save the setting.'), 'error');
    }
  };

  return (
    <Card title="Email domains">
      <p style={{ margin: 0, fontSize: 13, color: 'var(--text-2)' }}>
        People who sign up with an email on a verified domain join this workspace automatically.
        Prove you own a domain by adding the TXT record shown to its DNS, then press “Check now”.
      </p>
      <form onSubmit={add} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input style={{ ...inputStyle, flex: '1 1 220px', width: 'auto' }} placeholder="acme.com" required
               value={domain} onChange={e => setDomain(e.target.value)} />
        <Button type="submit" disabled={busy}>Add domain</Button>
      </form>
      <ErrorText>{error}</ErrorText>
      {domains.map(d => (
        <div key={d.id} style={{ display: 'grid', gap: 6, fontSize: 13, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 600, color: 'var(--text-1)' }}>
              {d.domain}{' '}
              <span style={{ fontWeight: 500, color: d.state === 'verified' ? 'var(--green)' : 'var(--amber)' }}>
                {d.state === 'verified' ? 'Verified' : 'Pending'}
              </span>
            </span>
            <span style={{ display: 'inline-flex', gap: 8 }}>
              {d.state !== 'verified' && <Button small variant="ghost" onClick={() => verify(d)}>Check now</Button>}
              <Button small variant="danger" onClick={() => remove(d)}>Remove</Button>
            </span>
          </div>
          {d.txt_record && (
            <code style={{ fontSize: 12, color: 'var(--text-2)', wordBreak: 'break-all' }}>
              TXT @ {d.txt_record.value}
            </code>
          )}
        </div>
      ))}
      {settings && (
        <div style={{ display: 'grid', gap: 10, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>What people who auto-join get</span>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: 'var(--text-1)' }}>
            <input type="radio" checked={access === 'off'} onChange={() => setAccess('off')} />
            Off (invitation only)
          </label>
          {access !== 'off' ? (
            <CompanyChoice
              companies={companies}
              selected={access === 'all' ? null : choice}
              onChange={next => { if (next === null) setAccess('all'); else { setAccess('selected'); setChoice(next); } }}
            />
          ) : (
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: 'var(--text-1)' }}>
              <input type="radio" checked={false} onChange={() => setAccess('all')} />
              Turn auto-join on
            </label>
          )}
          <div><Button small onClick={saveSettings}>Save</Button></div>
        </div>
      )}
    </Card>
  );
}
