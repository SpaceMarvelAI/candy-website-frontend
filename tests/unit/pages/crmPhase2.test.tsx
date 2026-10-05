import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/server';
import { API_BASE } from '../../mocks/fixtures';
import PatientDetailPage from '../../../src/pages/crm/PatientDetailPage';
import { NotesCard } from '../../../src/pages/crm/NotesCard';
import { CaseDetailPage, CasesPage, TaskDetailPage, TasksPage } from '../../../src/pages/crm/WorkPages';

// A mutable signed-in user, so each test can be a viewer or a working role.
const auth = vi.hoisted(() => ({ role: 'builder' as string | null, userId: 'user-me-1' }));
vi.mock('../../../src/context/AppContext', () => ({
  useApp: () => ({
    addToast: vi.fn(),
    user: auth.role ? { user_id: auth.userId, role: auth.role, email: 'x@test', company_id: 'c', company_name: 'Co' } : null,
  }),
}));

// Synthetic data only.
const PID = '11111111-1111-4111-8111-111111111111';
const STAMP = '2026-01-05T10:30:00Z';
const SECRET_NOTE = 'SENTINEL-NOTE-hba1c-is-high';
const SECRET_ERR = 'SENTINEL-ERR-zyxwvu.qpatient@example.test';

const page = (items: unknown[], over: Record<string, unknown> = {}) => ({ items, limit: 25, offset: 0, has_more: false, ...over });
const json = (body: unknown, status = 200) => HttpResponse.json(body as object, { status });
const note = (over: Record<string, unknown> = {}) => ({
  id: 'n1', patient_id: PID, case_id: null, task_id: null, interaction_id: null, note_type: 'staff', body: SECRET_NOTE,
  author_type: 'staff', author_user_id: 'u1', source: 'crm_api', created_at: STAMP, ...over,
});
const caseRow = (over: Record<string, unknown> = {}) => ({
  id: 'c1', patient_id: PID, reference: 'CASE-0001', case_type: 'complaint', category: null, priority: 'P2', status: 'open',
  subject: 'Synthetic subject', assigned_to_user_id: null, interaction_id: null, source: 'crm_api', resolved_at: null,
  closed_at: null, created_at: STAMP, updated_at: STAMP, description: 'Synthetic description', resolution_note: null, ...over,
});
const taskRow = (over: Record<string, unknown> = {}) => ({
  id: 't1', patient_id: PID, case_id: 'c1', task_type: 'callback', priority: 'P1', status: 'open', title: 'Synthetic task',
  due_at: null, assigned_to_user_id: null, interaction_id: null, source: 'crm_api', closed_at: null, created_at: STAMP,
  updated_at: STAMP, details: 'Synthetic details', outcome: null, contact_phone: '+910000000001', ...over,
});

function Where() { return <div data-testid="where">{useLocation().pathname}</div>; }
function renderAt(path: string, route: string, element: React.ReactElement) {
  return render(<MemoryRouter initialEntries={[path]}><Routes><Route path={route} element={element} /></Routes><Where /></MemoryRouter>);
}
const get = (path: string, body: unknown, status = 200) => server.use(http.get(`${API_BASE}${path}`, () => json(body, status)));

const CONSOLE_METHODS = ['log', 'info', 'debug', 'warn', 'error', 'group', 'groupCollapsed'] as const;
function captureConsole() {
  const lines: string[] = [];
  const spies = CONSOLE_METHODS.map((m) => vi.spyOn(console, m).mockImplementation((...a: unknown[]) => {
    for (const x of a) { try { lines.push(typeof x === 'string' ? x : JSON.stringify(x)); } catch { lines.push(String(x)); } }
  }));
  return { text: () => lines.join('\n'), restore: () => spies.forEach((s) => s.mockRestore()) };
}

beforeEach(() => { auth.role = 'builder'; });
afterEach(() => vi.restoreAllMocks());

// ═════════════════════════════════════════════════════════════════════════════
describe('Notes', () => {
  const renderNotes = () => renderAt(`/crm/patients/${PID}`, '/crm/patients/:id', <NotesCard patientId={PID} />);

  it('an authorized role reads notes, newest first, with the text masked for session replay', async () => {
    get(`/v1/crm/patients/${PID}/notes`, page([note()]));
    renderNotes();
    const text = await screen.findByText(SECRET_NOTE);
    expect(text.closest('.ph-mask')).not.toBeNull();
    expect(text.closest('.ph-no-capture')).not.toBeNull();
    expect(screen.getAllByText('Staff', { selector: 'span' })).toHaveLength(2);   // note type + author
  });

  it('shows an empty state', async () => {
    get(`/v1/crm/patients/${PID}/notes`, page([]));
    renderNotes();
    expect(await screen.findByText('No notes yet')).toBeInTheDocument();
  });

  it('creates a note with only the backend fields, clears the draft, and shows success', async () => {
    const posts: { url: string; body: unknown }[] = [];
    let stored: unknown[] = [];
    server.use(
      http.get(`${API_BASE}/v1/crm/patients/${PID}/notes`, () => json(page(stored))),
      http.post(`${API_BASE}/v1/crm/patients/${PID}/notes`, async ({ request }) => {
        const body = await request.json();
        posts.push({ url: request.url, body });
        stored = [note({ id: 'n2', note_type: 'follow_up' })];
        return json(note({ id: 'n2', note_type: 'follow_up' }), 201);
      }),
    );
    renderNotes();
    await screen.findByText('No notes yet');
    await userEvent.type(screen.getByLabelText('New note'), '  Synthetic note text  ');
    await userEvent.selectOptions(screen.getByLabelText('Note type'), 'follow_up');
    await userEvent.click(screen.getByRole('button', { name: 'Add note' }));
    expect(await screen.findByText('Note added.')).toBeInTheDocument();
    expect(posts).toHaveLength(1);
    expect(posts[0].body).toEqual({ body: 'Synthetic note text', note_type: 'follow_up' });   // trimmed; no extra fields
    expect(posts[0].url).not.toContain('Synthetic');                                        // text is never in the URL
    expect((screen.getByLabelText('New note') as HTMLTextAreaElement).value).toBe('');
    expect(await screen.findByText(SECRET_NOTE)).toBeInTheDocument();                       // list reloaded
  });

  it('disables submit while saving and never double-submits', async () => {
    let posts = 0;
    server.use(
      http.get(`${API_BASE}/v1/crm/patients/${PID}/notes`, () => json(page([]))),
      http.post(`${API_BASE}/v1/crm/patients/${PID}/notes`, async () => { posts += 1; await new Promise((r) => setTimeout(r, 150)); return json(note(), 201); }),
    );
    renderNotes();
    await screen.findByText('No notes yet');
    await userEvent.type(screen.getByLabelText('New note'), 'text');
    const btn = screen.getByRole('button', { name: 'Add note' });
    fireEvent.click(btn); fireEvent.click(btn);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled());
    await screen.findByText('Note added.');
    expect(posts).toBe(1);
  });

  it('validates: an empty or whitespace-only note is not sent', async () => {
    let posts = 0;
    server.use(
      http.get(`${API_BASE}/v1/crm/patients/${PID}/notes`, () => json(page([]))),
      http.post(`${API_BASE}/v1/crm/patients/${PID}/notes`, () => { posts += 1; return json(note(), 201); }),
    );
    renderNotes();
    await screen.findByText('No notes yet');
    await userEvent.type(screen.getByLabelText('New note'), '   ');
    await userEvent.click(screen.getByRole('button', { name: 'Add note' }));
    expect(await screen.findByText('Write a note before saving.')).toBeInTheDocument();
    expect(posts).toBe(0);
  });

  it('a viewer sees only a neutral line and no request is made', async () => {
    auth.role = 'viewer';
    let requested = false;
    server.use(http.get(`${API_BASE}/v1/crm/patients/${PID}/notes`, () => { requested = true; return json(page([note()])); }));
    renderNotes();
    expect(screen.getByText('Notes are not available for your role.')).toBeInTheDocument();
    expect(screen.queryByLabelText('New note')).toBeNull();
    expect(screen.queryByText(SECRET_NOTE)).toBeNull();
    await new Promise((r) => setTimeout(r, 50));
    expect(requested).toBe(false);
  });

  it('renders a backend 403 safely (stale role claim) with fixed copy and no form', async () => {
    get(`/v1/crm/patients/${PID}/notes`, { detail: `Role 'viewer' cannot perform this action ${SECRET_ERR}` }, 403);
    renderNotes();
    expect(await screen.findByText('Access restricted')).toBeInTheDocument();
    expect(document.body.textContent).not.toContain(SECRET_ERR);
    expect(document.body.textContent).not.toContain("Role 'viewer'");
    expect(screen.queryByLabelText('New note')).toBeNull();
  });

  it('a failed save shows fixed copy, keeps the draft, and leaks nothing to the DOM, URL or console', async () => {
    let url = '';
    server.use(
      http.get(`${API_BASE}/v1/crm/patients/${PID}/notes`, () => json(page([]))),
      http.post(`${API_BASE}/v1/crm/patients/${PID}/notes`, ({ request }) => { url = request.url; return json({ detail: `asyncpg failure ${SECRET_ERR}` }, 500); }),
    );
    renderNotes();
    await screen.findByText('No notes yet');
    const cap = captureConsole();
    await userEvent.type(screen.getByLabelText('New note'), SECRET_NOTE);
    await userEvent.click(screen.getByRole('button', { name: 'Add note' }));
    expect(await screen.findByText('Something went wrong.')).toBeInTheDocument();
    const out = cap.text();
    cap.restore();
    expect(document.body.textContent).not.toContain(SECRET_ERR);
    expect(document.body.textContent).not.toContain('asyncpg');
    expect((screen.getByLabelText('New note') as HTMLTextAreaElement).value).toBe(SECRET_NOTE);   // draft preserved for retry
    expect(out).not.toContain(SECRET_NOTE);
    expect(out).not.toContain(SECRET_ERR);
    expect(url).not.toContain(SECRET_NOTE);
    expect(localStorage.length + sessionStorage.length).toBe(0);                                  // nothing persisted
  });

  it('the input and the whole page are protected from session recording and autocapture', async () => {
    get(`/v1/crm/patients/${PID}/notes`, page([]));
    renderNotes();
    const ta = await screen.findByLabelText('New note');
    expect(ta).toHaveClass('ph-mask');
    expect(ta).toHaveClass('ph-no-capture');
  });

  it('is append-only: no edit or delete control exists', async () => {
    get(`/v1/crm/patients/${PID}/notes`, page([note()]));
    renderNotes();
    await screen.findByText(SECRET_NOTE);
    for (const name of [/edit/i, /delete/i, /remove/i]) expect(screen.queryByRole('button', { name })).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('Case creation', () => {
  it('creates a case with only the backend fields and opens it by id', async () => {
    let body: unknown;
    server.use(
      http.get(`${API_BASE}/v1/crm/cases`, () => json(page([]))),
      http.post(`${API_BASE}/v1/crm/cases`, async ({ request }) => { body = await request.json(); return json(caseRow({ id: 'new-case-id' }), 201); }),
    );
    renderAt('/crm/cases', '/crm/cases', <CasesPage />);
    await screen.findByText('No cases found');
    await userEvent.click(screen.getByRole('button', { name: 'New case' }));
    await userEvent.type(screen.getByLabelText('Subject'), '  Synthetic subject  ');
    await userEvent.click(screen.getByRole('button', { name: 'Create case' }));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/crm/cases'));
    expect(body).toEqual({ subject: 'Synthetic subject', case_type: 'service_request', priority: 'P3' });
  });

  it('sends the optional fields, the patient from the URL, and "assign to me" as the signed-in user id', async () => {
    let body: unknown;
    server.use(
      http.get(`${API_BASE}/v1/crm/cases`, () => json(page([]))),
      http.post(`${API_BASE}/v1/crm/cases`, async ({ request }) => { body = await request.json(); return json(caseRow(), 201); }),
    );
    renderAt(`/crm/cases?patient_id=${PID}`, '/crm/cases', <CasesPage />);
    await screen.findByText('No cases found');
    await userEvent.click(screen.getByRole('button', { name: 'New case' }));
    await userEvent.type(screen.getByLabelText('Subject'), 'Refill');
    await userEvent.selectOptions(screen.getByLabelText('Type'), 'medication_refill');
    await userEvent.selectOptions(screen.getByLabelText('Priority'), 'P1');
    await userEvent.type(screen.getByLabelText('Category (optional)'), 'pharmacy');
    await userEvent.type(screen.getByLabelText('Description (optional)'), 'Synthetic description');
    await userEvent.selectOptions(screen.getByLabelText('Assignee'), 'me');
    await userEvent.click(screen.getByRole('button', { name: 'Create case' }));
    await waitFor(() => expect(body).toBeDefined());
    expect(body).toEqual({
      subject: 'Refill', case_type: 'medication_refill', priority: 'P1', category: 'pharmacy',
      description: 'Synthetic description', patient_id: PID, assigned_to_user_id: 'user-me-1',
    });
  });

  it('never sends fields the backend does not accept (source, reference, interaction, company)', async () => {
    let body: Record<string, unknown> = {};
    server.use(
      http.get(`${API_BASE}/v1/crm/cases`, () => json(page([]))),
      http.post(`${API_BASE}/v1/crm/cases`, async ({ request }) => { body = (await request.json()) as Record<string, unknown>; return json(caseRow(), 201); }),
    );
    renderAt('/crm/cases', '/crm/cases', <CasesPage />);
    await screen.findByText('No cases found');
    await userEvent.click(screen.getByRole('button', { name: 'New case' }));
    await userEvent.type(screen.getByLabelText('Subject'), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Create case' }));
    await waitFor(() => expect(Object.keys(body).length).toBeGreaterThan(0));
    for (const k of ['source', 'reference', 'interaction_id', 'company_id', 'status', 'resolution_note']) expect(body).not.toHaveProperty(k);
  });

  it('validates: a blank subject is not sent', async () => {
    let posts = 0;
    server.use(
      http.get(`${API_BASE}/v1/crm/cases`, () => json(page([]))),
      http.post(`${API_BASE}/v1/crm/cases`, () => { posts += 1; return json(caseRow(), 201); }),
    );
    renderAt('/crm/cases', '/crm/cases', <CasesPage />);
    await screen.findByText('No cases found');
    await userEvent.click(screen.getByRole('button', { name: 'New case' }));
    await userEvent.type(screen.getByLabelText('Subject'), '   ');
    await userEvent.click(screen.getByRole('button', { name: 'Create case' }));
    expect(await screen.findByText('Enter a subject.')).toBeInTheDocument();
    expect(posts).toBe(0);
  });

  it('disables submit while saving', async () => {
    let posts = 0;
    server.use(
      http.get(`${API_BASE}/v1/crm/cases`, () => json(page([]))),
      http.post(`${API_BASE}/v1/crm/cases`, async () => { posts += 1; await new Promise((r) => setTimeout(r, 150)); return json(caseRow(), 201); }),
    );
    renderAt('/crm/cases', '/crm/cases', <CasesPage />);
    await screen.findByText('No cases found');
    await userEvent.click(screen.getByRole('button', { name: 'New case' }));
    await userEvent.type(screen.getByLabelText('Subject'), 'x');
    const btn = screen.getByRole('button', { name: 'Create case' });
    fireEvent.click(btn); fireEvent.click(btn);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Creating…' })).toBeDisabled());
    await waitFor(() => expect(posts).toBe(1));
  });

  it.each([
    [403, 'Access restricted'],
    [409, 'Change not allowed'],
    [422, 'Request not accepted'],
    [500, 'Something went wrong'],
  ])('a %i on create shows fixed copy "%s" and never the backend text', async (status, title) => {
    server.use(
      http.get(`${API_BASE}/v1/crm/cases`, () => json(page([]))),
      http.post(`${API_BASE}/v1/crm/cases`, () => json({ detail: `raw backend text ${SECRET_ERR}` }, status)),
    );
    renderAt('/crm/cases', '/crm/cases', <CasesPage />);
    await screen.findByText('No cases found');
    await userEvent.click(screen.getByRole('button', { name: 'New case' }));
    await userEvent.type(screen.getByLabelText('Subject'), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Create case' }));
    expect(await screen.findByText(new RegExp(title))).toBeInTheDocument();
    expect(document.body.textContent).not.toContain(SECRET_ERR);
    expect(document.body.textContent).not.toContain('raw backend text');
    expect((screen.getByLabelText('Subject') as HTMLInputElement).value).toBe('x');   // input preserved
  });

  it('a viewer gets no create control', async () => {
    auth.role = 'viewer';
    get('/v1/crm/cases', page([]));
    renderAt('/crm/cases', '/crm/cases', <CasesPage />);
    await screen.findByText('No cases found');
    expect(screen.queryByRole('button', { name: 'New case' })).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('Case update', () => {
  const renderCase = (row = caseRow()) => {
    let current = row;
    const patches: unknown[] = [];
    server.use(
      http.get(`${API_BASE}/v1/crm/cases/c1`, () => json(current)),
      http.patch(`${API_BASE}/v1/crm/cases/c1`, async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        patches.push(body);
        current = { ...current, ...body, updated_at: '2026-01-06T00:00:00Z' } as typeof row;
        return json(current);
      }),
      http.get(`${API_BASE}/v1/crm/tasks`, () => json(page([]))),
    );
    renderAt('/crm/cases/c1', '/crm/cases/:id', <CaseDetailPage />);
    return patches;
  };

  it('PATCHes only the changed fields and confirms success', async () => {
    const patches = renderCase();
    await screen.findByRole('form', { name: 'Update case' });
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'resolved');
    await userEvent.selectOptions(screen.getByLabelText('Priority'), 'P1');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Case updated.')).toBeInTheDocument();
    expect(patches).toEqual([{ status: 'resolved', priority: 'P1' }]);
  });

  it('offers only legal status moves (no jump to an illegal state, no unknown values)', async () => {
    renderCase(caseRow({ status: 'resolved' }));
    const select = (await screen.findByLabelText('Status')) as HTMLSelectElement;
    expect([...select.options].map((o) => o.value).sort()).toEqual(['closed', 'in_progress', 'open', 'resolved']);
  });

  it('assigns to me, then unassigns with an explicit null', async () => {
    const patches = renderCase();
    await screen.findByRole('form', { name: 'Update case' });
    await userEvent.selectOptions(screen.getByLabelText('Assignee'), 'me');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await screen.findByText('Case updated.');
    await waitFor(() => expect((screen.getByLabelText('Assignee') as HTMLSelectElement).value).toBe('keep'));
    await userEvent.selectOptions(screen.getByLabelText('Assignee'), 'none');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(patches).toHaveLength(2));
    expect(patches[0]).toEqual({ assigned_to_user_id: 'user-me-1' });
    expect(patches[1]).toEqual({ assigned_to_user_id: null });
  });

  it('clearing a free-text field sends null; the description is prefilled from the detail response', async () => {
    const patches = renderCase();
    const desc = (await screen.findByLabelText('Description')) as HTMLTextAreaElement;
    expect(desc.value).toBe('Synthetic description');
    await userEvent.clear(desc);
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0]).toEqual({ description: null });
  });

  it('with no changes it says so and sends nothing', async () => {
    const patches = renderCase();
    await screen.findByRole('form', { name: 'Update case' });
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('No changes to save.')).toBeInTheDocument();
    expect(patches).toHaveLength(0);
  });

  it('validates: a blank subject is not sent', async () => {
    const patches = renderCase();
    const subject = await screen.findByLabelText('Subject');
    await userEvent.clear(subject);
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Enter a subject.')).toBeInTheDocument();
    expect(patches).toHaveLength(0);
  });

  it('closing a case still confirms success even though the case becomes read-only', async () => {
    const patches = renderCase();
    await screen.findByRole('form', { name: 'Update case' });
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'closed');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Case updated.')).toBeInTheDocument();
    expect(await screen.findByText('A closed case cannot be changed.')).toBeInTheDocument();
    expect(screen.getByText('Case updated.')).toBeInTheDocument();     // still visible after the swap
    expect(patches).toEqual([{ status: 'closed' }]);
  });

  it('a closed case is read-only', async () => {
    renderCase(caseRow({ status: 'closed', closed_at: STAMP }));
    expect(await screen.findByText('A closed case cannot be changed.')).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'Update case' })).toBeNull();
  });

  it.each([[403, 'Access restricted'], [409, 'Change not allowed'], [422, 'Request not accepted']])(
    'a %i on update shows fixed copy "%s" and never the backend text', async (status, title) => {
      server.use(
        http.get(`${API_BASE}/v1/crm/cases/c1`, () => json(caseRow())),
        http.patch(`${API_BASE}/v1/crm/cases/c1`, () => json({ detail: `cannot move a case from open ${SECRET_ERR}` }, status)),
      );
      renderAt('/crm/cases/c1', '/crm/cases/:id', <CaseDetailPage />);
      await screen.findByRole('form', { name: 'Update case' });
      await userEvent.selectOptions(screen.getByLabelText('Priority'), 'P4');
      await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
      expect(await screen.findByText(new RegExp(title))).toBeInTheDocument();
      expect(document.body.textContent).not.toContain(SECRET_ERR);
      expect(document.body.textContent).not.toContain('cannot move a case');
    });

  it('a viewer sees no update form, no add-task control, and the redacted fields stay redacted', async () => {
    auth.role = 'viewer';
    const { description: _d, resolution_note: _r, ...viewerShape } = caseRow();
    get('/v1/crm/cases/c1', viewerShape);
    renderAt('/crm/cases/c1', '/crm/cases/:id', <CaseDetailPage />);
    await screen.findByText('Synthetic subject');
    expect(screen.queryByRole('form', { name: 'Update case' })).toBeNull();
    expect(screen.queryByRole('button', { name: /add a task/i })).toBeNull();
    expect(screen.queryByText('Description')).toBeNull();
    expect(screen.getByText(/not available for your role/)).toBeInTheDocument();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('Task creation', () => {
  it('creates a task with only the backend fields and an ISO due date', async () => {
    let body: unknown;
    server.use(
      http.get(`${API_BASE}/v1/crm/tasks`, () => json(page([]))),
      http.post(`${API_BASE}/v1/crm/tasks`, async ({ request }) => { body = await request.json(); return json(taskRow({ id: 'new-task-id' }), 201); }),
    );
    renderAt('/crm/tasks', '/crm/tasks', <TasksPage />);
    await screen.findByText('No tasks found');
    await userEvent.click(screen.getByRole('button', { name: 'New task' }));
    await userEvent.type(screen.getByLabelText('Title'), '  Call back  ');
    await userEvent.selectOptions(screen.getByLabelText('Type'), 'callback');
    await userEvent.selectOptions(screen.getByLabelText('Priority'), 'P2');
    fireEvent.change(screen.getByLabelText('Due (optional)'), { target: { value: '2026-01-06T10:30' } });
    await userEvent.type(screen.getByLabelText('Details (optional)'), 'Synthetic details');
    await userEvent.selectOptions(screen.getByLabelText('Assignee'), 'me');
    await userEvent.click(screen.getByRole('button', { name: 'Create task' }));
    await waitFor(() => expect(body).toBeDefined());
    expect(body).toEqual({
      title: 'Call back', task_type: 'callback', priority: 'P2', details: 'Synthetic details',
      due_at: new Date('2026-01-06T10:30').toISOString(), assigned_to_user_id: 'user-me-1',
    });
    for (const k of ['source', 'contact_phone', 'interaction_id', 'company_id', 'status']) expect(body).not.toHaveProperty(k);
  });

  it('preserves the patient relationship when created for a patient', async () => {
    let body: unknown;
    server.use(
      http.get(`${API_BASE}/v1/crm/tasks`, () => json(page([]))),
      http.post(`${API_BASE}/v1/crm/tasks`, async ({ request }) => { body = await request.json(); return json(taskRow(), 201); }),
    );
    renderAt(`/crm/tasks?patient_id=${PID}`, '/crm/tasks', <TasksPage />);
    await screen.findByText('No tasks found');
    await userEvent.click(screen.getByRole('button', { name: 'New task' }));
    await userEvent.type(screen.getByLabelText('Title'), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Create task' }));
    await waitFor(() => expect(body).toBeDefined());
    expect(body).toMatchObject({ patient_id: PID });
  });

  it('preserves the case (and its patient) when created from a case', async () => {
    let body: unknown;
    server.use(
      http.get(`${API_BASE}/v1/crm/cases/c1`, () => json(caseRow())),
      http.post(`${API_BASE}/v1/crm/tasks`, async ({ request }) => { body = await request.json(); return json(taskRow(), 201); }),
    );
    renderAt('/crm/cases/c1', '/crm/cases/:id', <CaseDetailPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Add a task for this case' }));
    await userEvent.type(screen.getByLabelText('Title'), 'Follow up');
    await userEvent.click(screen.getByRole('button', { name: 'Create task' }));
    await waitFor(() => expect(body).toBeDefined());
    expect(body).toMatchObject({ title: 'Follow up', case_id: 'c1', patient_id: PID });
  });

  it('validates: a blank title is not sent', async () => {
    let posts = 0;
    server.use(
      http.get(`${API_BASE}/v1/crm/tasks`, () => json(page([]))),
      http.post(`${API_BASE}/v1/crm/tasks`, () => { posts += 1; return json(taskRow(), 201); }),
    );
    renderAt('/crm/tasks', '/crm/tasks', <TasksPage />);
    await screen.findByText('No tasks found');
    await userEvent.click(screen.getByRole('button', { name: 'New task' }));
    await userEvent.click(screen.getByRole('button', { name: 'Create task' }));
    expect(await screen.findByText('Enter a title.')).toBeInTheDocument();
    expect(posts).toBe(0);
  });

  it.each([[403, 'Access restricted'], [409, 'Change not allowed'], [422, 'Request not accepted'], [500, 'Something went wrong']])(
    'a %i on create shows fixed copy "%s" and never the backend text', async (status, title) => {
      server.use(
        http.get(`${API_BASE}/v1/crm/tasks`, () => json(page([]))),
        http.post(`${API_BASE}/v1/crm/tasks`, () => json({ detail: `raw ${SECRET_ERR}` }, status)),
      );
      renderAt('/crm/tasks', '/crm/tasks', <TasksPage />);
      await screen.findByText('No tasks found');
      await userEvent.click(screen.getByRole('button', { name: 'New task' }));
      await userEvent.type(screen.getByLabelText('Title'), 'x');
      await userEvent.click(screen.getByRole('button', { name: 'Create task' }));
      expect(await screen.findByText(new RegExp(title))).toBeInTheDocument();
      expect(document.body.textContent).not.toContain(SECRET_ERR);
    });

  it('a viewer gets no create control', async () => {
    auth.role = 'viewer';
    get('/v1/crm/tasks', page([]));
    renderAt('/crm/tasks', '/crm/tasks', <TasksPage />);
    await screen.findByText('No tasks found');
    expect(screen.queryByRole('button', { name: 'New task' })).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('Task update', () => {
  const renderTask = (row = taskRow()) => {
    let current = row;
    const patches: unknown[] = [];
    server.use(
      http.get(`${API_BASE}/v1/crm/tasks/t1`, () => json(current)),
      http.patch(`${API_BASE}/v1/crm/tasks/t1`, async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        patches.push(body);
        current = { ...current, ...body, updated_at: '2026-01-06T00:00:00Z' } as typeof row;
        return json(current);
      }),
    );
    renderAt('/crm/tasks/t1', '/crm/tasks/:id', <TaskDetailPage />);
    return patches;
  };

  it('completes a task with an outcome — only the changed fields are sent', async () => {
    const patches = renderTask();
    await screen.findByRole('form', { name: 'Update task' });
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'done');
    await userEvent.type(screen.getByLabelText('Outcome'), 'Reached the patient');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Task updated.')).toBeInTheDocument();
    expect(patches).toEqual([{ status: 'done', outcome: 'Reached the patient' }]);
  });

  it('never offers the system-only "expired" status, and offers only legal moves', async () => {
    renderTask();
    const select = (await screen.findByLabelText('Status')) as HTMLSelectElement;
    expect([...select.options].map((o) => o.value).sort()).toEqual(['cancelled', 'done', 'in_progress', 'open']);
  });

  it('sets, then clears the due date (explicit null)', async () => {
    const patches = renderTask();
    await screen.findByRole('form', { name: 'Update task' });
    fireEvent.change(screen.getByLabelText('Due'), { target: { value: '2026-01-06T10:30' } });
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await screen.findByText('Task updated.');
    await waitFor(() => expect((screen.getByLabelText('Due') as HTMLInputElement).value).toBe('2026-01-06T10:30'));
    fireEvent.change(screen.getByLabelText('Due'), { target: { value: '' } });
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(patches).toHaveLength(2));
    expect(patches[0]).toEqual({ due_at: new Date('2026-01-06T10:30').toISOString() });
    expect(patches[1]).toEqual({ due_at: null });
  });

  it('assigns to me', async () => {
    const patches = renderTask();
    await screen.findByRole('form', { name: 'Update task' });
    await userEvent.selectOptions(screen.getByLabelText('Assignee'), 'me');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0]).toEqual({ assigned_to_user_id: 'user-me-1' });
  });

  it('validates: a blank title is not sent; no changes sends nothing', async () => {
    const patches = renderTask();
    await screen.findByRole('form', { name: 'Update task' });
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('No changes to save.')).toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText('Title'));
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Enter a title.')).toBeInTheDocument();
    expect(patches).toHaveLength(0);
  });

  it.each(['done', 'cancelled', 'expired'] as const)('a %s task is read-only', async (status) => {
    renderTask(taskRow({ status, closed_at: STAMP }));
    expect(await screen.findByText(`A ${status} task cannot be changed.`)).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'Update task' })).toBeNull();
  });

  it.each([[403, 'Access restricted'], [409, 'Change not allowed'], [422, 'Request not accepted']])(
    'a %i on update shows fixed copy "%s" and never the backend text', async (status, title) => {
      server.use(
        http.get(`${API_BASE}/v1/crm/tasks/t1`, () => json(taskRow())),
        http.patch(`${API_BASE}/v1/crm/tasks/t1`, () => json({ detail: `a done task cannot be changed ${SECRET_ERR}` }, status)),
      );
      renderAt('/crm/tasks/t1', '/crm/tasks/:id', <TaskDetailPage />);
      await screen.findByRole('form', { name: 'Update task' });
      await userEvent.selectOptions(screen.getByLabelText('Priority'), 'P4');
      await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
      expect(await screen.findByText(new RegExp(title))).toBeInTheDocument();
      expect(document.body.textContent).not.toContain(SECRET_ERR);
    });

  it('a viewer sees no update form and the redacted fields stay redacted', async () => {
    auth.role = 'viewer';
    const { details: _d, outcome: _o, contact_phone: _c, ...rest } = taskRow();
    get('/v1/crm/tasks/t1', { ...rest, contact_phone_masked: '+91••••••0001' });
    renderAt('/crm/tasks/t1', '/crm/tasks/:id', <TaskDetailPage />);
    await screen.findByText('Synthetic task');
    expect(screen.queryByRole('form', { name: 'Update task' })).toBeNull();
    expect(screen.queryByText('Details')).toBeNull();
    expect(screen.getByText('+91••••••0001')).toBeInTheDocument();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('Patient workspace', () => {
  const patient = {
    id: PID, full_name: 'Synthetic Patient', phone: '+910000000001', email: null, date_of_birth: null, preferred_language_id: null,
    preferred_provider: null, external_ref: null, lifecycle_stage: 'patient', status: 'active', merged_into: null, created_at: STAMP, updated_at: STAMP,
  };
  const seen: Record<string, string | null> = {};
  const setup = () => {
    server.use(
      http.get(`${API_BASE}/v1/crm/patients/${PID}`, () => json(patient)),
      http.get(`${API_BASE}/v1/crm/patients/${PID}/verification`, () => json({ patient_id: PID, latest_status: null, episodes: [] })),
      http.get(`${API_BASE}/v1/crm/patients/${PID}/interactions`, () => json(page([]))),
      http.get(`${API_BASE}/v1/crm/patients/${PID}/notes`, () => json(page([note()]))),
      http.get(`${API_BASE}/v1/crm/cases`, ({ request }) => { seen.cases = new URL(request.url).searchParams.get('patient_id'); return json(page([caseRow()])); }),
      http.get(`${API_BASE}/v1/crm/tasks`, ({ request }) => { seen.tasks = new URL(request.url).searchParams.get('patient_id'); return json(page([taskRow()])); }),
      http.get(`${API_BASE}/v1/crm/appointments`, ({ request }) => {
        seen.appts = new URL(request.url).searchParams.get('patient_id');
        return json(page([{ id: 'a1', patient_id: PID, provider_id: null, provider_name: 'Dr Synthetic', department: null, starts_at: STAMP, ends_at: null, status: 'booked', external_source: null, created_at: STAMP, updated_at: STAMP }]));
      }),
    );
    renderAt(`/crm/patients/${PID}`, '/crm/patients/:id', <PatientDetailPage />);
  };

  it('is the workspace: information, verification, interactions, notes, cases, tasks and appointments, all scoped to the patient', async () => {
    setup();
    await screen.findByText('Patient information');
    for (const title of ['Verification', 'Interactions', 'Notes', 'Cases', 'Tasks', 'Appointments']) {
      expect(screen.getByRole('heading', { name: title })).toBeInTheDocument();
    }
    expect(await screen.findByText(SECRET_NOTE)).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'CASE-0001' })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Synthetic task' })).toBeInTheDocument();
    expect(await screen.findByText('Dr Synthetic')).toBeInTheDocument();
    expect(seen).toMatchObject({ cases: PID, tasks: PID, appts: PID });
  });

  it('has a section navigator whose buttons never change the route', async () => {
    setup();
    await screen.findByText('Patient information');
    const nav = screen.getByRole('navigation', { name: 'Patient sections' });
    const before = screen.getByTestId('where').textContent;
    for (const name of ['Information', 'Verification', 'Interactions', 'Notes', 'Cases', 'Tasks', 'Appointments']) {
      await userEvent.click(within(nav).getByRole('button', { name }));
    }
    expect(screen.getByTestId('where').textContent).toBe(before);
  });

  it('a working role can start a case for this patient from the workspace', async () => {
    let body: unknown;
    setup();
    server.use(http.post(`${API_BASE}/v1/crm/cases`, async ({ request }) => { body = await request.json(); return json(caseRow(), 201); }));
    await screen.findByRole('link', { name: 'CASE-0001' });
    await userEvent.click(screen.getByRole('button', { name: 'New case' }));
    await userEvent.type(screen.getByLabelText('Subject'), 'From workspace');
    await userEvent.click(screen.getByRole('button', { name: 'Create case' }));
    expect(await screen.findByText('Case created.')).toBeInTheDocument();
    expect(body).toMatchObject({ subject: 'From workspace', patient_id: PID });
  });

  it('a working role can start a task for this patient from the workspace', async () => {
    let body: unknown;
    setup();
    server.use(http.post(`${API_BASE}/v1/crm/tasks`, async ({ request }) => { body = await request.json(); return json(taskRow(), 201); }));
    await screen.findByRole('link', { name: 'Synthetic task' });
    await userEvent.click(screen.getByRole('button', { name: 'New task' }));
    await userEvent.type(screen.getByLabelText('Title'), 'From workspace');
    await userEvent.click(screen.getByRole('button', { name: 'Create task' }));
    expect(await screen.findByText('Task created.')).toBeInTheDocument();
    expect(body).toMatchObject({ title: 'From workspace', patient_id: PID });
  });

  it('a viewer gets no write controls and no notes anywhere in the workspace', async () => {
    auth.role = 'viewer';
    setup();
    await screen.findByRole('link', { name: 'CASE-0001' });
    expect(screen.queryByRole('button', { name: 'New case' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'New task' })).toBeNull();
    expect(screen.queryByLabelText('New note')).toBeNull();
    expect(screen.queryByText(SECRET_NOTE)).toBeNull();
    expect(screen.getByText('Notes are not available for your role.')).toBeInTheDocument();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('Privacy across Phase 2 writes', () => {
  it('a note, a case and a task created with sentinel text leak nothing to the console, and no request URL carries it', async () => {
    const urls: string[] = [];
    server.events.on('request:start', ({ request }) => { urls.push(request.url); });
    server.use(
      http.get(`${API_BASE}/v1/crm/patients/${PID}/notes`, () => json(page([]))),
      http.post(`${API_BASE}/v1/crm/patients/${PID}/notes`, () => json(note(), 201)),
      http.get(`${API_BASE}/v1/crm/cases`, () => json(page([]))),
      http.post(`${API_BASE}/v1/crm/cases`, () => json(caseRow(), 201)),
      http.get(`${API_BASE}/v1/crm/tasks`, () => json(page([]))),
      http.post(`${API_BASE}/v1/crm/tasks`, () => json(taskRow(), 201)),
    );
    const cap = captureConsole();

    const n = renderAt(`/crm/patients/${PID}`, '/crm/patients/:id', <NotesCard patientId={PID} />);
    await screen.findByText('No notes yet');
    await userEvent.type(screen.getByLabelText('New note'), SECRET_NOTE);
    await userEvent.click(screen.getByRole('button', { name: 'Add note' }));
    await screen.findByText('Note added.');
    n.unmount();

    const c = renderAt('/crm/cases', '/crm/cases', <CasesPage />);
    await screen.findByText('No cases found');
    await userEvent.click(screen.getByRole('button', { name: 'New case' }));
    await userEvent.type(screen.getByLabelText('Subject'), SECRET_NOTE);
    await userEvent.click(screen.getByRole('button', { name: 'Create case' }));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/crm/cases'));
    c.unmount();

    renderAt('/crm/tasks', '/crm/tasks', <TasksPage />);
    await screen.findByText('No tasks found');
    await userEvent.click(screen.getByRole('button', { name: 'New task' }));
    await userEvent.type(screen.getByLabelText('Title'), SECRET_NOTE);
    await userEvent.click(screen.getByRole('button', { name: 'Create task' }));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/crm/tasks'));

    const out = cap.text();
    cap.restore();
    server.events.removeAllListeners();
    expect(out).not.toContain(SECRET_NOTE);
    expect(urls.filter((u) => u.includes('SENTINEL'))).toEqual([]);
  });
});
