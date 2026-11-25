/**
 * Standalone mode (no Dashboard): Candy's own sign-in pages.
 *   #/login          email + password
 *   #/signup         the first person creates the install's workspace and becomes its Owner;
 *                    after that only people on a domain the Owner verified can join here
 *   #/invite/:token  accept an invitation (sets name + password)
 * In ecosystem mode these routes just go to the Dashboard login (redirectToOIDC).
 */
import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { fetchAuthMode, isStandaloneMode, standaloneAuth, storeStandaloneSession, type AuthMode } from '../../api/standalone';
import type { TokenResponse } from '../../api/auth';
import { redirectToOIDC, takeReturnRoute } from '../../utils/sso';
import { AuthShell, Button, ErrorText, Field, inputStyle } from './ui';

const HOME = '/healthcare';

function message(e: unknown, fallback: string): string {
  return (e as { message?: string })?.message || fallback;
}

/** Shared "signed in → go where they were headed" step. */
function useFinishSignIn() {
  const { signedIn } = useApp();
  const navigate = useNavigate();
  return (tok: TokenResponse) => {
    signedIn(storeStandaloneSession(tok));
    navigate(takeReturnRoute() ?? HOME, { replace: true });
  };
}

/** Ecosystem installs never show these pages. */
function EcosystemGuard() {
  useEffect(() => { redirectToOIDC(); }, []);
  return null;
}

function useAuthMode(): AuthMode | null {
  const [mode, setMode] = useState<AuthMode | null>(null);
  useEffect(() => { fetchAuthMode().then(setMode); }, []);
  return mode;
}

// ── Login ─────────────────────────────────────────────────────────────────────────────────────

export function StandaloneLoginPage() {
  const { user } = useApp();
  const mode = useAuthMode();
  const finish = useFinishSignIn();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (!isStandaloneMode()) return <EcosystemGuard />;
  if (user) return <Navigate to={HOME} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      finish(await standaloneAuth.login(email.trim(), password));
    } catch (err) {
      setError(message(err, 'Could not sign in. Please try again.'));
    } finally { setBusy(false); }
  };

  return (
    <AuthShell title="Sign in" subtitle={mode?.workspace_name ? `to ${mode.workspace_name}` : undefined}>
      <form onSubmit={submit} style={{ display: 'grid', gap: 14 }}>
        <Field label="Email">
          <input style={inputStyle} type="email" autoComplete="email" required value={email}
                 onChange={e => setEmail(e.target.value)} />
        </Field>
        <Field label="Password">
          <input style={inputStyle} type="password" autoComplete="current-password" required value={password}
                 onChange={e => setPassword(e.target.value)} />
        </Field>
        <ErrorText>{error}</ErrorText>
        <Button type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</Button>
      </form>
      <p style={{ margin: 0, fontSize: 13, color: 'var(--text-2)' }}>
        {mode?.signup_open
          ? <>New here? <Link to="/signup">Create the workspace</Link></>
          : <>No account? Ask your workspace Owner for an invitation, or <Link to="/signup">join with your work email</Link>.</>}
      </p>
    </AuthShell>
  );
}

// ── Sign up ───────────────────────────────────────────────────────────────────────────────────

export function StandaloneSignupPage() {
  const { user } = useApp();
  const mode = useAuthMode();
  const finish = useFinishSignIn();
  const [form, setForm] = useState({ company_name: '', full_name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (!isStandaloneMode()) return <EcosystemGuard />;
  if (user) return <Navigate to={HOME} replace />;
  if (!mode) return null;

  // First person: creates the workspace (company name = its first company). Afterwards: only an
  // email on a verified domain can join here (the backend decides); everyone else needs an invite.
  const first = mode.signup_open;
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      finish(await standaloneAuth.signup({
        company_name: first ? form.company_name.trim() : (mode.workspace_name || 'Workspace'),
        full_name: form.full_name.trim() || undefined,
        email: form.email.trim(),
        password: form.password,
      }));
    } catch (err) {
      setError(message(err, 'Could not create the account. Please try again.'));
    } finally { setBusy(false); }
  };

  return (
    <AuthShell
      title={first ? 'Create your workspace' : `Join ${mode.workspace_name || 'the workspace'}`}
      subtitle={first
        ? 'You are the first person here, so you become the workspace Owner.'
        : 'Use your work email. This works if your company’s email domain was verified by the Owner; otherwise ask them for an invitation.'}
    >
      <form onSubmit={submit} style={{ display: 'grid', gap: 14 }}>
        {first && (
          <Field label="Company name">
            <input style={inputStyle} required value={form.company_name} onChange={set('company_name')} />
          </Field>
        )}
        <Field label="Your name">
          <input style={inputStyle} autoComplete="name" value={form.full_name} onChange={set('full_name')} />
        </Field>
        <Field label="Work email">
          <input style={inputStyle} type="email" autoComplete="email" required value={form.email} onChange={set('email')} />
        </Field>
        <Field label="Password" hint="At least 8 characters.">
          <input style={inputStyle} type="password" autoComplete="new-password" required minLength={8}
                 value={form.password} onChange={set('password')} />
        </Field>
        <ErrorText>{error}</ErrorText>
        <Button type="submit" disabled={busy}>{busy ? 'Creating…' : first ? 'Create workspace' : 'Join'}</Button>
      </form>
      <p style={{ margin: 0, fontSize: 13, color: 'var(--text-2)' }}>
        Already have an account? <Link to="/login">Sign in</Link>
      </p>
    </AuthShell>
  );
}

// ── Accept an invitation ──────────────────────────────────────────────────────────────────────

export function AcceptInvitationPage() {
  const { token = '' } = useParams();
  const { user } = useApp();
  const finish = useFinishSignIn();
  const [invite, setInvite] = useState<{ email: string; role: string; workspace_name: string } | null>(null);
  const [loadError, setLoadError] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isStandaloneMode() || user) return;
    standaloneAuth.validateInvitation(token)
      .then(setInvite)
      .catch(err => setLoadError(message(err, 'This invitation is not valid any more.')));
  }, [token, user]);

  if (!isStandaloneMode()) return <EcosystemGuard />;
  if (user) return <Navigate to={HOME} replace />;

  if (loadError) {
    return (
      <AuthShell title="Invitation not available" subtitle={loadError}>
        <Link to="/login">Go to sign in</Link>
      </AuthShell>
    );
  }
  if (!invite) return null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      finish(await standaloneAuth.acceptInvitation(token, { full_name: fullName.trim(), password }));
    } catch (err) {
      setError(message(err, 'Could not accept the invitation. Please try again.'));
    } finally { setBusy(false); }
  };

  return (
    <AuthShell title={`Join ${invite.workspace_name}`} subtitle={<>You were invited as <b>{invite.role}</b>.</>}>
      <form onSubmit={submit} style={{ display: 'grid', gap: 14 }}>
        <Field label="Email">
          <input style={{ ...inputStyle, opacity: 0.7 }} value={invite.email} readOnly />
        </Field>
        <Field label="Your name">
          <input style={inputStyle} autoComplete="name" required value={fullName} onChange={e => setFullName(e.target.value)} />
        </Field>
        <Field label="Choose a password" hint="At least 8 characters.">
          <input style={inputStyle} type="password" autoComplete="new-password" required minLength={8}
                 value={password} onChange={e => setPassword(e.target.value)} />
        </Field>
        <ErrorText>{error}</ErrorText>
        <Button type="submit" disabled={busy}>{busy ? 'Joining…' : 'Accept invitation'}</Button>
      </form>
    </AuthShell>
  );
}
