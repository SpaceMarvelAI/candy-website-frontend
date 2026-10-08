import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/server';
import { API_BASE } from '../../mocks/fixtures';
import { selectValue } from '../../mocks/dropdown';
import Sidebar from '../../../src/components/Sidebar';
import CrmHomePage from '../../../src/pages/crm';
import PatientsPage from '../../../src/pages/crm/PatientsPage';
import PatientDetailPage from '../../../src/pages/crm/PatientDetailPage';
import { CaseDetailPage, CasesPage, TaskDetailPage, TasksPage } from '../../../src/pages/crm/WorkPages';
import {
  AppointmentDetailPage, AppointmentsPage, ProviderDetailPage, ProvidersPage,
} from '../../../src/pages/crm/SchedulingPages';
import { canWriteCrm } from '../../../src/utils/crmAccess';

vi.mock('../../../src/context/AppContext', () => ({ useApp: () => ({ addToast: vi.fn() }) }));

// Synthetic data only.
const PID = '11111111-1111-4111-8111-111111111111';
const STAMP = '2026-01-05T10:30:00Z';

const listItem = (over: Record<string, unknown> = {}) => ({
  id: PID, full_name: 'Synthetic Patient', phone_masked: '+91••••••0001', lifecycle_stage: 'patient',
  status: 'active', preferred_provider: null, preferred_language_id: null, created_at: STAMP, updated_at: STAMP, ...over,
});
const page = (items: unknown[], over: Record<string, unknown> = {}) => ({ items, limit: 25, offset: 0, has_more: false, ...over });

const workingPatient = {
  id: PID, full_name: 'Synthetic Patient', phone: '+910000000001', email: 'synthetic@example.test',
  date_of_birth: '1990-01-01', preferred_language_id: null, preferred_provider: null, external_ref: null,
  lifecycle_stage: 'patient', status: 'active', merged_into: null, created_at: STAMP, updated_at: STAMP,
};
// A viewer response: no phone / email / date_of_birth keys at all; masked twins instead.
const viewerPatient = {
  id: PID, full_name: 'Synthetic Patient', phone_masked: '+91••••••0001', email_masked: 's•••@example.test',
  preferred_language_id: null, preferred_provider: null, external_ref: null,
  lifecycle_stage: 'patient', status: 'active', merged_into: null, created_at: STAMP, updated_at: STAMP,
};

function Where() { return <div data-testid="where">{useLocation().pathname}</div>; }

function renderAt(path: string, route: string, element: React.ReactElement) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes><Route path={route} element={element} /></Routes>
      <Where />
    </MemoryRouter>,
  );
}

const get = (path: string, body: unknown, status = 200) =>
  server.use(http.get(`${API_BASE}${path}`, () => HttpResponse.json(body as object, { status })));

describe('CRM navigation', () => {
  const sidebarAt = (path: string) => render(<MemoryRouter initialEntries={[path]}><Sidebar /><Where /></MemoryRouter>);

  it('shows the CRM group with its sections', async () => {
    sidebarAt('/healthcare');
    // CRM defaults collapsed on a non-CRM route — open it the way a user would.
    await userEvent.click(screen.getByRole('button', { name: 'CRM' }));
    for (const name of ['Overview', 'Patients', 'Cases', 'Tasks', 'Appointments', 'Providers']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
  });

  it('marks the matching section active, including on detail routes', () => {
    sidebarAt(`/crm/patients/${PID}`);
    expect(screen.getByRole('button', { name: 'Patients' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Cases' })).not.toHaveAttribute('aria-current');
  });

  it('marks Overview active on /crm and navigates when a section is clicked', async () => {
    sidebarAt('/crm');
    expect(screen.getByRole('button', { name: 'Overview' })).toHaveAttribute('aria-current', 'page');
    await userEvent.click(screen.getByRole('button', { name: 'Tasks' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/crm/tasks');
  });

  it('the landing page links to every section and shows no metrics', () => {
    render(<MemoryRouter><CrmHomePage /></MemoryRouter>);
    for (const path of ['/crm/patients', '/crm/cases', '/crm/tasks', '/crm/appointments', '/crm/providers']) {
      expect(document.querySelector(`a[href="${path}"]`)).not.toBeNull();
    }
    expect(screen.getByTestId('crm-page').textContent).not.toMatch(/\d{2,}/);
  });
});

describe('Patients list', () => {
  it('shows a loading state, then rows with only returned fields', async () => {
    get('/v1/crm/patients', page([listItem()]));
    renderAt('/crm/patients', '/crm/patients', <PatientsPage />);
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
    const link = await screen.findByRole('link', { name: 'Synthetic Patient' });
    expect(link).toHaveAttribute('href', `/crm/patients/${PID}`);
    expect(screen.getByText('+91••••••0001')).toBeInTheDocument();
  });

  it('masks patient text for session replay and excludes the page from autocapture', async () => {
    get('/v1/crm/patients', page([listItem()]));
    renderAt('/crm/patients', '/crm/patients', <PatientsPage />);
    const name = await screen.findByText('Synthetic Patient');
    expect(name.closest('.ph-mask')).not.toBeNull();
    expect(screen.getByTestId('crm-page')).toHaveClass('ph-no-capture');
  });

  it('shows an empty state', async () => {
    get('/v1/crm/patients', page([]));
    renderAt('/crm/patients', '/crm/patients', <PatientsPage />);
    expect(await screen.findByText('No patients yet')).toBeInTheDocument();
  });

  it('shows fixed error copy and never the backend message', async () => {
    get('/v1/crm/patients', { detail: 'asyncpg.exceptions.RawInternalError: secret detail' }, 500);
    renderAt('/crm/patients', '/crm/patients', <PatientsPage />);
    expect(await screen.findByText('Something went wrong')).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('asyncpg');
    expect(document.body.textContent).not.toContain('secret detail');
  });

  it('shows a clean forbidden state without a retry button', async () => {
    get('/v1/crm/patients', { detail: "Role 'viewer' cannot perform this action" }, 403);
    renderAt('/crm/patients', '/crm/patients', <PatientsPage />);
    expect(await screen.findByText('Access restricted')).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("Role 'viewer'");
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  it('pages forward using the next offset', async () => {
    const offsets: string[] = [];
    server.use(http.get(`${API_BASE}/v1/crm/patients`, ({ request }) => {
      const o = new URL(request.url).searchParams.get('offset') ?? '0';
      offsets.push(o);
      return HttpResponse.json(page([listItem({ full_name: `Page offset ${o}` })], { offset: Number(o), has_more: o === '0' }));
    }));
    renderAt('/crm/patients', '/crm/patients', <PatientsPage />);
    await screen.findByText('Page offset 0');
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByText('Page offset 25');
    expect(offsets).toEqual(['0', '25']);
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });

  it('disables Next at the backend offset cap and explains why', async () => {
    get('/v1/crm/patients', page([listItem()], { offset: 9990, has_more: true }));
    renderAt('/crm/patients', '/crm/patients', <PatientsPage />);
    await screen.findByText('Synthetic Patient');
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    expect(screen.getByText(/not browsable/)).toBeInTheDocument();
  });

  it('searches via the POST body, with no search value in any URL', async () => {
    let url = '';
    let body: unknown;
    get('/v1/crm/patients', page([]));
    server.use(http.post(`${API_BASE}/v1/crm/patients/search`, async ({ request }) => {
      url = request.url;
      body = await request.json();
      return HttpResponse.json([listItem({ full_name: 'Found Patient' })]);
    }));
    renderAt('/crm/patients', '/crm/patients', <PatientsPage />);
    await screen.findByText('No patients yet');
    await selectValue(screen.getByLabelText('Search by'), 'phone');
    await userEvent.type(screen.getByLabelText('Search value'), '+910000000001');
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));
    await screen.findByText('Found Patient');
    expect(body).toEqual({ kind: 'phone', value: '+910000000001' });
    expect(url).not.toContain('910000000001');
    expect(screen.getByTestId('where')).toHaveTextContent(/^\/crm\/patients$/);
  });

  it('does not allow a name search under 2 characters', async () => {
    get('/v1/crm/patients', page([]));
    renderAt('/crm/patients', '/crm/patients', <PatientsPage />);
    await screen.findByText('No patients yet');
    await userEvent.type(screen.getByLabelText('Search value'), 'a');
    expect(screen.getByRole('button', { name: 'Search' })).toBeDisabled();
  });
});

describe('Patient detail', () => {
  const verification = (latest: string | null, episodes: unknown[] = []) =>
    ({ patient_id: PID, latest_status: latest, episodes });
  const episode = (over: Record<string, unknown> = {}) => ({
    id: 'e1', session_kind: 'otp', status: 'verified', attempts: 1,
    verified_at: STAMP, failed_at: null, revoked_at: null, created_at: STAMP, ...over,
  });
  const setup = (patient: unknown, v = verification(null)) => {
    get(`/v1/crm/patients/${PID}`, patient);
    get(`/v1/crm/patients/${PID}/verification`, v);
    get(`/v1/crm/patients/${PID}/interactions`, page([{
      id: 'i1', patient_id: PID, channel: 'whatsapp', origin: 'chat', direction: null,
      started_at: STAMP, source_kind: 'chat_session', source_id: 's1',
    }]));
    renderAt(`/crm/patients/${PID}`, '/crm/patients/:id', <PatientDetailPage />);
  };

  it('shows full contact details for a working role', async () => {
    setup(workingPatient);
    expect(await screen.findByText('+910000000001')).toBeInTheDocument();
    expect(screen.getByText('synthetic@example.test')).toBeInTheDocument();
    expect(screen.getByText('Date of birth')).toBeInTheDocument();
    expect(screen.queryByText(/masked for your role/)).toBeNull();
  });

  it('shows only masked values for a viewer and never reconstructs the originals', async () => {
    setup(viewerPatient);
    expect(await screen.findByText('+91••••••0001')).toBeInTheDocument();
    expect(screen.getByText('s•••@example.test')).toBeInTheDocument();
    expect(screen.getByText(/masked for your role/)).toBeInTheDocument();
    expect(screen.queryByText('Date of birth')).toBeNull();
    expect(document.body.textContent).not.toContain('0000000001');
    expect(document.body.textContent).not.toContain('synthetic@');
  });

  it('shows interactions with channel and timestamp', async () => {
    setup(workingPatient);
    const list = await screen.findByText('Whatsapp');
    expect(list).toBeInTheDocument();
    expect(screen.getByText('Chat session')).toBeInTheDocument();
  });

  it('words a recorded verification neutrally and never as proof of identity', async () => {
    setup(workingPatient, verification('verified', [episode()]));
    expect((await screen.findAllByText('Verification recorded')).length).toBeGreaterThan(0);
    expect(screen.getByText(/not proof of the patient/)).toBeInTheDocument();
    const text = document.body.textContent ?? '';
    for (const banned of [/identity verified/i, /identity confirmed/i, /patient authenticated/i, /patient verified/i, /verified/i]) {
      expect(text).not.toMatch(banned);
    }
  });

  it.each([
    ['pending', 'Verification pending'],
    ['failed', 'Verification attempt failed'],
    ['revoked', 'Verification revoked'],
  ])('words a %s status as "%s"', async (status, text) => {
    setup(workingPatient, verification(status, [episode({ status, verified_at: null })]));
    expect((await screen.findAllByText(text)).length).toBeGreaterThan(0);
  });

  it('says so when no verification has been recorded', async () => {
    setup(workingPatient, verification(null));
    expect(await screen.findByText(/No verification has been recorded/)).toBeInTheDocument();
  });

  it('shows only a neutral line for notes, with NO notes request, when the role has no notes access', async () => {
    let notesRequested = false;
    server.use(http.get(`${API_BASE}/v1/crm/patients/${PID}/notes`, () => { notesRequested = true; return HttpResponse.json(page([])); }));
    setup(workingPatient);   // no signed-in user in this suite's AppContext mock => not a working role
    await screen.findByText('+910000000001');
    expect(screen.getByText('Notes are not available for your role.')).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'Add a note' })).toBeNull();
    expect(notesRequested).toBe(false);
    expect(document.querySelector(`a[href="/crm/cases?patient_id=${PID}"]`)).not.toBeNull();
  });

  it('shows a not-found state for a missing patient', async () => {
    get(`/v1/crm/patients/${PID}`, { detail: 'Patient not found' }, 404);
    get(`/v1/crm/patients/${PID}/verification`, { detail: 'Patient not found' }, 404);
    get(`/v1/crm/patients/${PID}/interactions`, { detail: 'Patient not found' }, 404);
    renderAt(`/crm/patients/${PID}`, '/crm/patients/:id', <PatientDetailPage />);
    expect((await screen.findAllByText('Not found')).length).toBeGreaterThan(0);
  });
});

describe('Cases and Tasks', () => {
  const caseItem = {
    id: 'c1', patient_id: PID, reference: 'CASE-0001', case_type: 'complaint', category: null, priority: 'P2',
    status: 'open', subject: 'Synthetic subject', assigned_to_user_id: null, interaction_id: null, source: 'agent',
    resolved_at: null, closed_at: null, created_at: STAMP, updated_at: STAMP,
  };
  const taskItem = {
    id: 't1', patient_id: PID, case_id: 'c1', task_type: 'callback', priority: 'P1', status: 'open',
    title: 'Synthetic task', due_at: STAMP, assigned_to_user_id: 'u1', interaction_id: null, source: 'agent',
    closed_at: null, created_at: STAMP, updated_at: STAMP,
  };

  it('lists cases with status, priority, subject and assignee state', async () => {
    get('/v1/crm/cases', page([caseItem]));
    renderAt('/crm/cases', '/crm/cases', <CasesPage />);
    expect(await screen.findByRole('link', { name: 'CASE-0001' })).toHaveAttribute('href', '/crm/cases/c1');
    const row = screen.getByRole('link', { name: 'CASE-0001' }).closest('tr') as HTMLElement;
    expect(within(row).getByText('Synthetic subject')).toBeInTheDocument();
    expect(within(row).getByText('P2')).toBeInTheDocument();
    expect(within(row).getByText('Open')).toBeInTheDocument();
    expect(within(row).getByText('Unassigned')).toBeInTheDocument();
  });

  it('passes a patient_id filter from the URL to the API', async () => {
    let seen: string | null = null;
    server.use(http.get(`${API_BASE}/v1/crm/cases`, ({ request }) => {
      seen = new URL(request.url).searchParams.get('patient_id');
      return HttpResponse.json(page([]));
    }));
    renderAt(`/crm/cases?patient_id=${PID}`, '/crm/cases', <CasesPage />);
    await screen.findByText('No cases found');
    expect(seen).toBe(PID);
  });

  it('renders no description / resolution note for a viewer and no placeholder for them', async () => {
    get('/v1/crm/cases/c1', caseItem); // viewer shape: list shape, keys absent
    renderAt('/crm/cases/c1', '/crm/cases/:id', <CaseDetailPage />);
    expect(await screen.findByText('Synthetic subject')).toBeInTheDocument();
    expect(screen.queryByText('Description')).toBeNull();
    expect(screen.queryByText('Resolution note')).toBeNull();
    expect(screen.getByText(/not available for your role/)).toBeInTheDocument();
  });

  it('renders the free-text fields for a working role', async () => {
    get('/v1/crm/cases/c1', { ...caseItem, description: 'Synthetic description', resolution_note: null });
    renderAt('/crm/cases/c1', '/crm/cases/:id', <CaseDetailPage />);
    expect(await screen.findByText('Synthetic description')).toBeInTheDocument();
    expect(screen.getByText('Resolution note')).toBeInTheDocument();
    expect(screen.queryByText(/not available for your role/)).toBeNull();
  });

  it('exposes no write controls (read-only phase)', async () => {
    get('/v1/crm/cases', page([caseItem]));
    renderAt('/crm/cases', '/crm/cases', <CasesPage />);
    await screen.findByText('CASE-0001');
    for (const name of [/create/i, /new case/i, /edit/i, /delete/i, /resolve/i]) {
      expect(screen.queryByRole('button', { name })).toBeNull();
    }
  });

  it('lists tasks with type, status, title, due date and assignee state', async () => {
    get('/v1/crm/tasks', page([taskItem]));
    renderAt('/crm/tasks', '/crm/tasks', <TasksPage />);
    expect(await screen.findByRole('link', { name: 'Synthetic task' })).toHaveAttribute('href', '/crm/tasks/t1');
    expect(screen.getByText('Callback')).toBeInTheDocument();
    expect(screen.getByText('Assigned')).toBeInTheDocument();
  });

  it('shows a masked contact and no details / outcome for a viewer', async () => {
    get('/v1/crm/tasks/t1', { ...taskItem, contact_phone_masked: '+91••••••0001' });
    renderAt('/crm/tasks/t1', '/crm/tasks/:id', <TaskDetailPage />);
    expect(await screen.findByText('+91••••••0001')).toBeInTheDocument();
    expect(screen.queryByText('Details')).toBeNull();
    expect(screen.queryByText('Outcome')).toBeNull();
    expect(screen.getByText(/not available for your role/)).toBeInTheDocument();
  });

  it('shows contact, details and outcome for a working role', async () => {
    get('/v1/crm/tasks/t1', { ...taskItem, contact_phone: '+910000000001', details: 'Synthetic details', outcome: null });
    renderAt('/crm/tasks/t1', '/crm/tasks/:id', <TaskDetailPage />);
    expect(await screen.findByText('+910000000001')).toBeInTheDocument();
    expect(screen.getByText('Synthetic details')).toBeInTheDocument();
    expect(screen.getByText('Outcome')).toBeInTheDocument();
  });

  it('shows a forbidden state for tasks', async () => {
    get('/v1/crm/tasks', { detail: 'nope' }, 403);
    renderAt('/crm/tasks', '/crm/tasks', <TasksPage />);
    expect(await screen.findByText('Access restricted')).toBeInTheDocument();
  });
});

describe('Appointments and Providers', () => {
  const appt = {
    id: 'a1', patient_id: PID, provider_id: 'p1', provider_name: 'Dr Synthetic', department: 'cardiology',
    starts_at: STAMP, ends_at: '2026-01-05T11:00:00Z', status: 'booked', external_source: 'cal_com',
    created_at: STAMP, updated_at: STAMP,
  };
  const provider = {
    id: 'p1', name: 'Dr Synthetic', department: 'cardiology', slot_minutes: 20, is_active: true,
    created_at: STAMP, updated_at: STAMP,
  };

  it('lists appointments', async () => {
    get('/v1/crm/appointments', page([appt]));
    renderAt('/crm/appointments', '/crm/appointments', <AppointmentsPage />);
    const row = (await screen.findByText('Dr Synthetic')).closest('tr') as HTMLElement;
    expect(within(row).getByText('Booked')).toBeInTheDocument();
    expect(within(row).getByText('Cardiology')).toBeInTheDocument();
  });

  it('shows appointment detail with links to the patient and provider', async () => {
    get('/v1/crm/appointments/a1', appt);
    renderAt('/crm/appointments/a1', '/crm/appointments/:id', <AppointmentDetailPage />);
    expect(await screen.findByText('Dr Synthetic')).toBeInTheDocument();
    expect(document.querySelector(`a[href="/crm/patients/${PID}"]`)).not.toBeNull();
    expect(document.querySelector('a[href="/crm/providers/p1"]')).not.toBeNull();
  });

  it('shows an empty appointments state', async () => {
    get('/v1/crm/appointments', page([]));
    renderAt('/crm/appointments', '/crm/appointments', <AppointmentsPage />);
    expect(await screen.findByText('No appointments found')).toBeInTheDocument();
  });

  it('lists providers and shows detail', async () => {
    get('/v1/crm/providers', page([provider]));
    renderAt('/crm/providers', '/crm/providers', <ProvidersPage />);
    const row = (await screen.findByRole('link', { name: 'Dr Synthetic' })).closest('tr') as HTMLElement;
    expect(within(row).getByText('20 min')).toBeInTheDocument();
    expect(within(row).getByText('Active')).toBeInTheDocument();
  });

  it('filters appointments by provider_id from the URL and says so', async () => {
    let seen: string | null = null;
    server.use(http.get(`${API_BASE}/v1/crm/appointments`, ({ request }) => {
      seen = new URL(request.url).searchParams.get('provider_id');
      return HttpResponse.json(page([appt]));
    }));
    renderAt('/crm/appointments?provider_id=p1', '/crm/appointments', <AppointmentsPage />);
    await screen.findByText('Dr Synthetic');
    expect(seen).toBe('p1');
    expect(screen.getByText(/appointments for one provider/)).toBeInTheDocument();
  });

  it('links a provider to that provider\'s appointments, not the unfiltered list', async () => {
    get('/v1/crm/providers/p1', provider);
    renderAt('/crm/providers/p1', '/crm/providers/:id', <ProviderDetailPage />);
    const link = await screen.findByRole('link', { name: 'View appointments' });
    expect(link).toHaveAttribute('href', '/crm/appointments?provider_id=p1');
  });

  it('shows provider detail', async () => {
    get('/v1/crm/providers/p1', provider);
    renderAt('/crm/providers/p1', '/crm/providers/:id', <ProviderDetailPage />);
    await waitFor(() => expect(screen.getByText('Dr Synthetic')).toBeInTheDocument());
    expect(screen.getByText('20 min')).toBeInTheDocument();
  });
});

describe('CrmPage responsive padding', () => {
  const withMatches = (match: (q: string) => boolean) => {
    const orig = window.matchMedia;
    window.matchMedia = ((q: string) => ({
      matches: match(q), media: q, onchange: null, addEventListener: () => {}, removeEventListener: () => {},
      addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
    return () => { window.matchMedia = orig; };
  };

  it('uses the Analytics-page padding steps for mobile, tablet and desktop', () => {
    const cases: [(q: string) => boolean, string][] = [
      [() => true, '20px 16px 48px'],                                  // mobile (and tablet) match
      [(q) => q.includes('1024'), '24px 24px 52px'],                   // tablet only
      [() => false, '28px 32px'],                                      // desktop
    ];
    for (const [match, expected] of cases) {
      const restore = withMatches(match);
      const { unmount } = render(<MemoryRouter><CrmHomePage /></MemoryRouter>);
      expect(screen.getByTestId('crm-page')).toHaveStyle({ padding: expected });
      unmount();
      restore();
    }
  });
});

describe('crmAccess', () => {
  it('treats owner/admin/member/builder as working roles and viewer as restricted', () => {
    for (const r of ['owner', 'admin', 'member', 'builder', 'Admin']) expect(canWriteCrm(r)).toBe(true);
    for (const r of ['viewer', '', null, undefined, 'unknown']) expect(canWriteCrm(r)).toBe(false);
  });
});
