// Standalone mode pages (no Dashboard): sign in, sign up / join, accept an invitation, team.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/server';

const app = vi.hoisted(() => ({ user: null as null | Record<string, unknown>, signedIn: vi.fn(), addToast: vi.fn() }));
vi.mock('../../../src/context/AppContext', () => ({ useApp: () => app }));
vi.mock('../../../src/components/ConfirmDialog', () => ({ useConfirm: () => async () => true }));

import { StandaloneLoginPage, StandaloneSignupPage, AcceptInvitationPage } from '../../../src/pages/standalone/StandaloneAuthPages';
import TeamPage from '../../../src/pages/standalone/TeamPage';
import { _resetAuthModeCache } from '../../../src/api/standalone';

const BASE = 'http://localhost:8002';
const TOKEN = {
  access_token: 'tok', refresh_token: 'ref', token_type: 'bearer', user_id: 'u-1',
  company_id: 'c-1', company_name: 'Acme', role: 'owner', email: 'ada@acmecorp.io',
};

function Where() {
  return <div data-testid="where">{useLocation().pathname}</div>;
}

function at(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/login" element={<StandaloneLoginPage />} />
        <Route path="/signup" element={<StandaloneSignupPage />} />
        <Route path="/invite/:token" element={<AcceptInvitationPage />} />
        <Route path="/team" element={<TeamPage />} />
        <Route path="*" element={null} />
      </Routes>
      <Where />
    </MemoryRouter>,
  );
}

function mode(body: object) {
  server.use(http.get(`${BASE}/v1/auth/mode`, () => HttpResponse.json(body)));
}

beforeEach(() => {
  _resetAuthModeCache();
  localStorage.setItem('candy.auth_mode', JSON.stringify({ mode: 'standalone' }));
  sessionStorage.clear();
  app.user = null;
  app.signedIn.mockReset();
  app.addToast.mockReset();
});
afterEach(() => _resetAuthModeCache());

describe('login', () => {
  it('signs in and goes where they were headed', async () => {
    mode({ mode: 'standalone', signup_open: false, workspace_name: 'Acme' });
    sessionStorage.setItem('candy.return_route', '/live/demo');
    server.use(http.post(`${BASE}/v1/auth/login`, () => HttpResponse.json(TOKEN)));
    at('/login');
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ada@acmecorp.io' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'Passw0rd!x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/live/demo'));
    expect(app.signedIn).toHaveBeenCalledWith(expect.objectContaining({ user_id: 'u-1', company_id: 'c-1' }));
    expect(sessionStorage.getItem('access_token')).toBe('tok');
  });

  it("shows the backend's reason when sign-in fails", async () => {
    mode({ mode: 'standalone', signup_open: false });
    server.use(http.post(`${BASE}/v1/auth/login`, () => HttpResponse.json({ detail: 'Invalid email or password' }, { status: 401 })));
    at('/login');
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ada@acmecorp.io' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'nope' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password');
    expect(app.signedIn).not.toHaveBeenCalled();
  });
});

describe('sign up', () => {
  it('the first person creates the workspace (company name asked)', async () => {
    mode({ mode: 'standalone', signup_open: true, workspace_name: null });
    at('/signup');
    expect(await screen.findByText('Create your workspace')).toBeInTheDocument();
    expect(screen.getByLabelText('Company name')).toBeInTheDocument();
  });

  it('after that it is the join-with-work-email form (no company name)', async () => {
    mode({ mode: 'standalone', signup_open: false, workspace_name: 'Acme' });
    let sent: any = null;
    server.use(http.post(`${BASE}/v1/auth/signup`, async ({ request }) => {
      sent = await request.json();
      return HttpResponse.json({ detail: { error: 'registration_closed', message: 'This workspace is invite-only.' } }, { status: 403 });
    }));
    at('/signup');
    expect(await screen.findByText('Join Acme')).toBeInTheDocument();
    expect(screen.queryByLabelText('Company name')).toBeNull();
    fireEvent.change(screen.getByLabelText('Work email'), { target: { value: 'x@elsewhere.io' } });
    fireEvent.change(screen.getByLabelText(/Password/), { target: { value: 'Passw0rd!x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Join' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('This workspace is invite-only.');
    expect(sent.company_name).toBe('Acme');
  });
});

describe('sign up with a verified-domain email: the emailed code', () => {
  function joinForm() {
    fireEvent.change(screen.getByLabelText('Work email'), { target: { value: 'Bo@Joiners.io' } });
    fireEvent.change(screen.getByLabelText(/Password/), { target: { value: 'Passw0rd!x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Join' }));
  }
  const pending = { status: 'verification_required', email: 'bo@joiners.io',
                    message: 'We sent a 6-digit code to bo@joiners.io. Enter it to finish joining.' };

  it('asks for the code, then signs them in like a normal sign-up', async () => {
    mode({ mode: 'standalone', signup_open: false, workspace_name: 'Acme' });
    let verified: any = null;
    server.use(
      http.post(`${BASE}/v1/auth/signup`, () => HttpResponse.json(pending, { status: 202 })),
      http.post(`${BASE}/v1/auth/signup/verify`, async ({ request }) => {
        verified = await request.json();
        return HttpResponse.json({ ...TOKEN, role: 'builder' }, { status: 201 });
      }),
    );
    at('/signup');
    await screen.findByText('Join Acme');
    joinForm();
    expect(await screen.findByText('Enter the 6-digit code we sent to bo@joiners.io')).toBeInTheDocument();
    const input = screen.getByLabelText('Code');
    expect(input).toHaveAttribute('inputmode', 'numeric');
    fireEvent.change(input, { target: { value: '12a34567' } });
    expect(input).toHaveValue('123456');                                   // digits only, six of them
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }));
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/healthcare'));
    expect(verified).toEqual({ email: 'bo@joiners.io', code: '123456', password: 'Passw0rd!x' });   // the password typed at sign-up
    expect(app.signedIn).toHaveBeenCalledWith(expect.objectContaining({ role: 'builder' }));
    expect(sessionStorage.getItem('access_token')).toBe('tok');
  });

  it("shows the backend's message for a wrong code, and 'Send a new code' signs up again", async () => {
    mode({ mode: 'standalone', signup_open: false, workspace_name: 'Acme' });
    let signups = 0;
    server.use(
      http.post(`${BASE}/v1/auth/signup`, () => { signups += 1; return HttpResponse.json(pending, { status: 202 }); }),
      http.post(`${BASE}/v1/auth/signup/verify`, () => HttpResponse.json(
        { detail: { error: 'invalid_code', message: "That code or password isn't right." } }, { status: 400 })),
    );
    at('/signup');
    await screen.findByText('Join Acme');
    joinForm();
    fireEvent.change(await screen.findByLabelText('Code'), { target: { value: '000000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("That code or password isn't right.");
    expect(app.signedIn).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Send a new code' }));
    expect(await screen.findByText('We sent a new code.')).toBeInTheDocument();
    expect(signups).toBe(2);
  });
  it("'Use a different email' goes back to the form with what was typed", async () => {
    mode({ mode: 'standalone', signup_open: false, workspace_name: 'Acme' });
    server.use(http.post(`${BASE}/v1/auth/signup`, () => HttpResponse.json(pending, { status: 202 })));
    at('/signup');
    await screen.findByText('Join Acme');
    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Bo' } });
    joinForm();
    fireEvent.click(await screen.findByRole('button', { name: 'Use a different email' }));
    expect(await screen.findByText('Join Acme')).toBeInTheDocument();
    expect(screen.getByLabelText('Work email')).toHaveValue('Bo@Joiners.io');
    expect(screen.getByLabelText('Your name')).toHaveValue('Bo');
    expect(screen.getByLabelText(/Password/)).toHaveValue('Passw0rd!x');
    expect(screen.queryByLabelText('Code')).toBeNull();
  });

  it("a code email that couldn't be sent (503) shows the server's message", async () => {
    mode({ mode: 'standalone', signup_open: false, workspace_name: 'Acme' });
    server.use(http.post(`${BASE}/v1/auth/signup`, () => HttpResponse.json(
      { detail: { error: 'email_not_sent', message: "We couldn't send the code right now. Try again in a few minutes." } },
      { status: 503 })));
    at('/signup');
    await screen.findByText('Join Acme');
    joinForm();
    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't send the code right now. Try again in a few minutes.");
  });
});

describe('accept an invitation', () => {
  it('shows who invited them as what, then signs them in', async () => {
    server.use(
      http.get(`${BASE}/v1/team/invitations/validate/tok-1`, () =>
        HttpResponse.json({ status: 'success', email: 'new@acmecorp.io', role: 'viewer', workspace_name: 'Acme', expires_at: 'x' })),
      http.post(`${BASE}/v1/team/invitations/accept/tok-1`, () => HttpResponse.json({ ...TOKEN, role: 'viewer' })),
    );
    at('/invite/tok-1');
    expect(await screen.findByText('Join Acme')).toBeInTheDocument();
    expect(screen.getByDisplayValue('new@acmecorp.io')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'New' } });
    fireEvent.change(screen.getByLabelText(/Choose a password/), { target: { value: 'Passw0rd!x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Accept invitation' }));
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/healthcare'));
    expect(app.signedIn).toHaveBeenCalledWith(expect.objectContaining({ role: 'viewer' }));
  });

  it('an expired or used invitation says so', async () => {
    server.use(http.get(`${BASE}/v1/team/invitations/validate/old`, () =>
      HttpResponse.json({ detail: { error: 'invitation_expired', message: 'This invitation has expired. Ask for a new one.' } }, { status: 410 })));
    at('/invite/old');
    expect(await screen.findByText('This invitation has expired. Ask for a new one.')).toBeInTheDocument();
  });
});

describe('team', () => {
  const members = [
    { user_id: 'u-1', email: 'ada@acmecorp.io', full_name: 'Ada', role: 'owner', company_access: 'all', company_ids: [] },
    { user_id: 'u-2', email: 'bo@acmecorp.io', full_name: 'Bo', role: 'viewer', company_access: 'selected', company_ids: ['c-2'] },
  ];
  function teamServer() {
    server.use(
      http.get(`${BASE}/v1/team/members`, () => HttpResponse.json({ status: 'success', data: members })),
      http.get(`${BASE}/v1/team/companies`, () => HttpResponse.json({ status: 'success', data: [{ id: 'c-1', name: 'HQ' }, { id: 'c-2', name: 'Branch' }] })),
      http.get(`${BASE}/v1/team/invitations`, () => HttpResponse.json({ status: 'success', data: [] })),
      http.get(`${BASE}/v1/team/domains`, () => HttpResponse.json({ status: 'success', data: [] })),
      http.get(`${BASE}/v1/team/domains/settings`, () => HttpResponse.json({ status: 'success', data: { domain_join_access: 'all', company_ids: [] } })),
    );
  }

  it('the Owner sees each member’s companies and can manage those below them', async () => {
    app.user = { user_id: 'u-1', role: 'owner' };
    teamServer();
    at('/team');
    expect(await screen.findByText('Branch')).toBeInTheDocument();       // Bo: selected → Branch
    expect(screen.getByText('All companies')).toBeInTheDocument();       // Ada: all
    expect(screen.getAllByRole('button', { name: 'Edit companies' })).toHaveLength(1);   // not themselves
    expect(screen.getByText('Invite someone')).toBeInTheDocument();
    expect(screen.getByText('Email domains')).toBeInTheDocument();
  });

  it('a viewer only sees the member list', async () => {
    app.user = { user_id: 'u-2', role: 'viewer' };
    teamServer();
    at('/team');
    expect(await screen.findByText('Members (2)')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit companies' })).toBeNull();
    expect(screen.queryByText('Invite someone')).toBeNull();
  });

  it('only the Owner/Admin get a role picker (for people below them); everyone else just sees roles', async () => {
    app.user = { user_id: 'u-1', role: 'owner' };
    teamServer();
    let body: any = null;
    server.use(http.put(`${BASE}/v1/team/members/u-2/role`, async ({ request }) => {
      body = await request.json();
      return HttpResponse.json({ status: 'success', role: 'builder' });
    }));
    const { unmount } = at('/team');
    const picker = await screen.findByLabelText('Role of Bo');
    expect(screen.queryByLabelText('Role of Ada')).toBeNull();                   // not themselves / the Owner
    expect([...picker.querySelectorAll('option')].map(o => o.value)).toEqual(['viewer', 'builder', 'admin']);
    fireEvent.change(picker, { target: { value: 'builder' } });
    await waitFor(() => expect(body).toEqual({ role: 'builder' }));
    unmount();

    app.user = { user_id: 'u-2', role: 'viewer' };
    at('/team');
    expect(await screen.findByText('Members (2)')).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Role of/)).toBeNull();
  });

  it('a Dashboard "Member" shows as Builder in the role picker', async () => {
    app.user = { user_id: 'u-1', role: 'owner' };
    teamServer();
    server.use(http.get(`${BASE}/v1/team/members`, () => HttpResponse.json({ status: 'success', data: [
      members[0], { ...members[1], role: 'member' }] })));
    at('/team');
    expect(await screen.findByLabelText('Role of Bo')).toHaveValue('builder');
  });

  it('says auto-join needs an email server when none is set up (the Owner can still save)', async () => {
    app.user = { user_id: 'u-1', role: 'owner' };
    teamServer();
    server.use(http.get(`${BASE}/v1/team/domains/settings`, () => HttpResponse.json({ status: 'success',
      data: { domain_join_access: 'all', company_ids: [], email_configured: false } })));
    at('/team');
    expect(await screen.findByText(/Auto-join needs an email server \(SMTP\) to send sign-in codes/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  it('shows member company names sent with the member, even ones the viewer cannot use', async () => {
    app.user = { user_id: 'u-2', role: 'viewer' };
    server.use(
      http.get(`${BASE}/v1/team/members`, () => HttpResponse.json({ status: 'success', data: [
        ...members, { user_id: 'u-3', email: 'cy@acmecorp.io', full_name: 'Cy', role: 'viewer', company_access: 'selected',
                      company_ids: ['c-9'], companies: [{ id: 'c-9', name: 'Secret Co' }] }] })),
      http.get(`${BASE}/v1/team/companies`, () => HttpResponse.json({ status: 'success', data: [{ id: 'c-2', name: 'Branch' }] })),
    );
    at('/team');
    expect(await screen.findByText('Secret Co')).toBeInTheDocument();
  });

  it('sends the chosen companies when changing a member', async () => {
    app.user = { user_id: 'u-1', role: 'owner' };
    teamServer();
    let body: any = null;
    server.use(http.put(`${BASE}/v1/team/members/u-2/companies`, async ({ request }) => {
      body = await request.json();
      return HttpResponse.json({ status: 'success' });
    }));
    at('/team');
    fireEvent.click(await screen.findByRole('button', { name: 'Edit companies' }));
    fireEvent.click(screen.getByLabelText('HQ'));
    fireEvent.click(screen.getAllByRole('button', { name: 'Save' })[0]);   // the member row (the domains card has one too)
    await waitFor(() => expect(body).toEqual({ company_ids: ['c-2', 'c-1'] }));
  });
});
