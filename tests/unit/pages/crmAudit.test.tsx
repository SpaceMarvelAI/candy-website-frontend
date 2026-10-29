/**
 * Regression tests for the issues found in the final feat/crm audit:
 *   1. CRM record ids must not reach analytics (URLs in PostHog events).
 *   2. Patient-linked free text (case category, appointment department) must be masked for session replay.
 *   3. A merged patient must not be offered note / case / task creation (the backend answers 409).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/server';
import { API_BASE } from '../../mocks/fixtures';
import { redactCrmIdentifiers, scrubAnalyticsEvent } from '../../../src/utils/analyticsScrub';
import PatientDetailPage from '../../../src/pages/crm/PatientDetailPage';
import { CaseDetailPage } from '../../../src/pages/crm/WorkPages';
import { AppointmentDetailPage, AppointmentsPage } from '../../../src/pages/crm/SchedulingPages';

const auth = vi.hoisted(() => ({ role: 'owner' as string | null }));
vi.mock('../../../src/context/AppContext', () => ({
  useApp: () => ({
    addToast: vi.fn(),
    user: auth.role ? { user_id: 'user-me-1', role: auth.role, email: 'x@test', company_id: 'c', company_name: 'Co' } : null,
  }),
}));

// Synthetic data only.
const PID = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const STAMP = '2026-01-05T10:30:00Z';
const json = (body: unknown, status = 200) => HttpResponse.json(body as object, { status });
const page = (items: unknown[]) => ({ items, limit: 25, offset: 0, has_more: false });
const get = (path: string, body: unknown, status = 200) => server.use(http.get(`${API_BASE}${path}`, () => json(body, status)));
function renderAt(path: string, route: string, element: React.ReactElement) {
  return render(<MemoryRouter initialEntries={[path]}><Routes><Route path={route} element={element} /></Routes></MemoryRouter>);
}

beforeEach(() => { auth.role = 'owner'; });

// ═════════════════════════════════════════════════════════════════════════════
describe('analytics scrub — CRM record ids never reach PostHog', () => {
  it.each([
    ['patients', `http://localhost:3000/#/crm/patients/${PID}`, 'http://localhost:3000/#/crm/patients/:id'],
    ['cases', `https://dev.candy.cx/#/crm/cases/${PID}`, 'https://dev.candy.cx/#/crm/cases/:id'],
    ['tasks', `/crm/tasks/${PID}`, '/crm/tasks/:id'],
    ['appointments', `/crm/appointments/${PID}`, '/crm/appointments/:id'],
    ['providers', `/crm/providers/${PID}`, '/crm/providers/:id'],
    ['patient_id filter', `#/crm/cases?patient_id=${PID}`, '#/crm/cases?patient_id=:id'],
    ['provider_id filter', `#/crm/appointments?provider_id=${PID}&x=1`, '#/crm/appointments?provider_id=:id&x=1'],
    ['uppercase uuid', `/crm/patients/${PID.toUpperCase()}`, '/crm/patients/:id'],
  ])('redacts %s', (_label, input, expected) => {
    expect(redactCrmIdentifiers(input)).toBe(expected);
  });

  it('leaves everything else alone, including uuids outside the CRM', () => {
    for (const s of ['http://localhost:3000/#/crm', '#/crm/patients', '#/healthcare', `#/agents/${PID}/edit`, `?agent_id=${PID}`, 'plain text', '']) {
      expect(redactCrmIdentifiers(s)).toBe(s);
    }
  });

  it('scrubs every URL-bearing property of an event, including person properties and heatmap URL keys', () => {
    const url = `http://localhost:3000/#/crm/patients/${PID}`;
    const input = {
      event: '$pageview',
      properties: {
        $current_url: url, $pathname: `/crm/patients/${PID}`, $referrer: `http://x/#/crm/cases?patient_id=${PID}`,
        $heatmap_data: { [url]: [{ x: 1, y: 2 }] }, nested: { deep: [`/crm/tasks/${PID}`] }, unrelated: 'hello', n: 3,
      },
      $set_once: { $initial_current_url: url },
    };
    const out = scrubAnalyticsEvent(input);
    expect(JSON.stringify(out)).not.toContain(PID);
    expect(out.properties?.$current_url).toBe('http://localhost:3000/#/crm/patients/:id');
    expect(Object.keys(out.properties?.$heatmap_data as object)).toEqual(['http://localhost:3000/#/crm/patients/:id']);
    expect(out.properties?.unrelated).toBe('hello');
    expect(out.properties?.n).toBe(3);
    expect(out.$set_once?.$initial_current_url).toBe('http://localhost:3000/#/crm/patients/:id');
    expect(JSON.stringify(input)).toContain(PID);                                   // the original object is not mutated
  });

  it('skips session-replay snapshots entirely (they are masked, not scrubbed)', () => {
    const snap = { event: '$snapshot', properties: { $snapshot_data: [{ href: `#/crm/patients/${PID}` }] } };
    expect(scrubAnalyticsEvent(snap)).toBe(snap);
  });

  it('tolerates events with no properties', () => {
    expect(scrubAnalyticsEvent({ event: 'x' })).toEqual({ event: 'x' });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('patient-linked free text is masked for session replay', () => {
  const caseRow = {
    id: 'c1', patient_id: PID, reference: 'CASE-1', case_type: 'complaint', category: 'diabetes_follow_up', priority: 'P2', status: 'open',
    subject: 'Synthetic subject', assigned_to_user_id: null, interaction_id: null, source: 'crm_api', resolved_at: null, closed_at: null,
    created_at: STAMP, updated_at: STAMP, description: 'd', resolution_note: null,
  };
  const appt = {
    id: 'a1', patient_id: PID, provider_id: 'p1', provider_name: 'Dr Synthetic', department: 'oncology', starts_at: STAMP, ends_at: null,
    status: 'booked', external_source: 'internal', created_at: STAMP, updated_at: STAMP,
  };

  it('case category (user-entered free text) is inside .ph-mask', async () => {
    get('/v1/crm/cases/c1', caseRow);
    renderAt('/crm/cases/c1', '/crm/cases/:id', <CaseDetailPage />);
    const el = await screen.findByText('Diabetes follow up');
    expect(el.closest('.ph-mask')).not.toBeNull();
    expect(el.closest('.ph-no-capture')).not.toBeNull();
  });

  it('a case with no category shows a dash, not an empty masked node', async () => {
    get('/v1/crm/cases/c1', { ...caseRow, category: null });
    renderAt('/crm/cases/c1', '/crm/cases/:id', <CaseDetailPage />);
    await screen.findByText('Synthetic subject');
    expect(screen.queryByText('Diabetes follow up')).toBeNull();
  });

  it('appointment department is inside .ph-mask in the list and in the detail', async () => {
    get('/v1/crm/appointments', page([appt]));
    const list = renderAt('/crm/appointments', '/crm/appointments', <AppointmentsPage />);
    expect((await screen.findByText('Oncology')).closest('.ph-mask')).not.toBeNull();
    list.unmount();
    get('/v1/crm/appointments/a1', appt);
    renderAt('/crm/appointments/a1', '/crm/appointments/:id', <AppointmentDetailPage />);
    expect((await screen.findByText('Oncology')).closest('.ph-mask')).not.toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('a merged patient is not offered note / case / task creation', () => {
  const setup = (status: 'active' | 'merged') => {
    server.use(
      http.get(`${API_BASE}/v1/crm/patients/${PID}`, () => json({
        id: PID, full_name: 'Synthetic Patient', phone: '+910000000001', email: null, date_of_birth: null, preferred_language_id: null,
        preferred_provider: null, external_ref: null, lifecycle_stage: 'patient', status, merged_into: status === 'merged' ? OTHER : null,
        created_at: STAMP, updated_at: STAMP,
      })),
      http.get(`${API_BASE}/v1/crm/patients/${PID}/verification`, () => json({ patient_id: PID, latest_status: null, episodes: [] })),
      http.get(`${API_BASE}/v1/crm/patients/${PID}/consents/current`, () => json([])),
      http.get(`${API_BASE}/v1/crm/patients/${PID}/consents`, () => json(page([]))),
      http.get(`${API_BASE}/v1/crm/patients/${PID}/interactions`, () => json(page([]))),
      http.get(`${API_BASE}/v1/crm/patients/${PID}/notes`, () => json(page([{
        id: 'n1', patient_id: PID, case_id: null, task_id: null, interaction_id: null, note_type: 'staff', body: 'Synthetic historic note',
        author_type: 'staff', author_user_id: 'u1', source: 'crm_api', created_at: STAMP,
      }]))),
      http.get(`${API_BASE}/v1/crm/cases`, () => json(page([{
        id: 'c1', patient_id: PID, reference: 'CASE-9', case_type: 'other', category: null, priority: 'P3', status: 'open', subject: 'Synthetic case',
        assigned_to_user_id: null, interaction_id: null, source: 'crm_api', resolved_at: null, closed_at: null, created_at: STAMP, updated_at: STAMP,
      }]))),
      http.get(`${API_BASE}/v1/crm/tasks`, () => json(page([]))),
      http.get(`${API_BASE}/v1/crm/appointments`, () => json(page([]))),
      http.get(`${API_BASE}/v1/languages`, () => json([])),
    );
    renderAt(`/crm/patients/${PID}`, '/crm/patients/:id', <PatientDetailPage />);
  };

  it.each(['owner', 'builder'])('for a %s: history stays readable, but no creation controls are offered', async (role) => {
    auth.role = role;
    setup('merged');
    expect(await screen.findByText('Synthetic historic note')).toBeInTheDocument();           // notes still readable
    expect(await screen.findByRole('link', { name: 'CASE-9' })).toBeInTheDocument();           // cases still readable
    expect(screen.getByText('A merged patient cannot receive new notes.')).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'Add a note' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'New case' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'New task' })).toBeNull();
  });

  it('an active patient still gets all three', async () => {
    setup('active');
    await screen.findByRole('link', { name: 'CASE-9' });
    expect(screen.getByRole('form', { name: 'Add a note' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New case' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New task' })).toBeInTheDocument();
    expect(screen.queryByText('A merged patient cannot receive new notes.')).toBeNull();
  });
});
