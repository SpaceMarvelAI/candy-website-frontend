import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/server';
import { API_BASE } from '../../mocks/fixtures';
import PatientDetailPage from '../../../src/pages/crm/PatientDetailPage';
import { ConsentCard, stateOf } from '../../../src/pages/crm/ConsentCard';
import { PatientEditCard } from '../../../src/pages/crm/PatientEditCard';
import { canRecordConsent } from '../../../src/utils/crmAccess';
import type { PatientDetail } from '../../../src/api/crmTypes';

const auth = vi.hoisted(() => ({ role: 'owner' as string | null }));
vi.mock('../../../src/context/AppContext', () => ({
  useApp: () => ({
    addToast: vi.fn(),
    user: auth.role ? { user_id: 'user-me-1', role: auth.role, email: 'x@test', company_id: 'c', company_name: 'Co' } : null,
  }),
}));

// Synthetic data only.
const PID = '11111111-1111-4111-8111-111111111111';
const STAMP = '2026-01-05T10:30:00Z';
const SECRET_ERR = 'SENTINEL-ERR-zyxwvu.qpatient@example.test';
const SECRET_NAME = 'Sentinel Qpatient';
const FUTURE = '2099-01-06T10:30';

const page = (items: unknown[], over: Record<string, unknown> = {}) => ({ items, limit: 25, offset: 0, has_more: false, ...over });
const json = (body: unknown, status = 200) => HttpResponse.json(body as object, { status });
const event = (over: Record<string, unknown> = {}) => ({
  id: 'e1', patient_id: PID, consent_type: 'call_consent', action: 'granted', granted: true, channel: 'staff', source: 'crm_api',
  language: null, captured_at: STAMP, expires_at: null, expired: false, ...over,
});
const state = (over: Record<string, unknown> = {}) => ({
  consent_type: 'call_consent', action: 'granted', granted: true, expired: false, channel: 'staff', captured_at: STAMP, expires_at: null, ...over,
});
const patient = (over: Record<string, unknown> = {}): PatientDetail => ({
  id: PID, full_name: 'Synthetic Patient', phone: '+910000000001', email: 'synthetic@example.test', date_of_birth: '1990-01-01',
  preferred_language_id: null, preferred_provider: 'Dr Synthetic', external_ref: null, lifecycle_stage: 'patient', status: 'active',
  merged_into: null, created_at: STAMP, updated_at: STAMP, ...over,
}) as PatientDetail;

function Where() { return <div data-testid="where">{useLocation().pathname}</div>; }
function renderAt(path: string, route: string, element: React.ReactElement) {
  return render(<MemoryRouter initialEntries={[path]}><Routes><Route path={route} element={element} /></Routes><Where /></MemoryRouter>);
}
const get = (path: string, body: unknown, status = 200) => server.use(http.get(`${API_BASE}${path}`, () => json(body, status)));
const LANGS = [{ id: 1, code: 'en-US', name: 'English', stt_provider: 'x', tts_provider: 'y' }, { id: 2, code: 'hi-IN', name: 'Hindi', stt_provider: 'x', tts_provider: 'y' }];

const CONSOLE_METHODS = ['log', 'info', 'debug', 'warn', 'error', 'group', 'groupCollapsed'] as const;
function captureConsole() {
  const lines: string[] = [];
  const spies = CONSOLE_METHODS.map((m) => vi.spyOn(console, m).mockImplementation((...a: unknown[]) => {
    for (const x of a) { try { lines.push(typeof x === 'string' ? x : JSON.stringify(x)); } catch { lines.push(String(x)); } }
  }));
  return { text: () => lines.join('\n'), restore: () => spies.forEach((s) => s.mockRestore()) };
}

beforeEach(() => {
  auth.role = 'owner';
  server.use(http.get(`${API_BASE}/v1/languages`, () => json(LANGS)));
});
afterEach(() => vi.restoreAllMocks());

// ═════════════════════════════════════════════════════════════════════════════
describe('Consent — reading', () => {
  const renderConsent = (status: 'active' | 'inactive' | 'merged' = 'active') =>
    renderAt(`/crm/patients/${PID}`, '/crm/patients/:id', <ConsentCard patientId={PID} patientStatus={status} />);

  it('shows the current state and the history, with neutral "recorded as" wording and a no-enforcement disclaimer', async () => {
    get(`/v1/crm/patients/${PID}/consents/current`, [state(), state({ consent_type: 'recording', action: 'denied', granted: false })]);
    get(`/v1/crm/patients/${PID}/consents`, page([event(), event({ id: 'e2', consent_type: 'recording', action: 'denied', granted: false })]));
    renderConsent();
    expect(await screen.findByText('Recorded as granted')).toBeInTheDocument();
    expect(screen.getByText('Recorded as denied')).toBeInTheDocument();
    expect(screen.getByText(/does not enforce or confirm consent/)).toBeInTheDocument();
    expect(screen.getAllByText('Call consent').length).toBeGreaterThan(0);          // type shown as a label, current + history
    const text = document.body.textContent ?? '';
    for (const banned of [/has consented/i, /consent confirmed/i, /patient consented/i, /authori[sz]ed/i, /verified/i]) expect(text).not.toMatch(banned);
  });

  it('maps every ledger state to a precise label', () => {
    expect(stateOf({ action: 'granted', granted: true, expired: false }).text).toBe('Recorded as granted');
    expect(stateOf({ action: 'granted', granted: false, expired: true }).text).toBe('Grant expired');
    expect(stateOf({ action: 'denied', granted: false, expired: false }).text).toBe('Recorded as denied');
    expect(stateOf({ action: 'withdrawn', granted: false, expired: false }).text).toBe('Recorded as withdrawn');
  });

  it('shows empty states', async () => {
    get(`/v1/crm/patients/${PID}/consents/current`, []);
    get(`/v1/crm/patients/${PID}/consents`, page([]));
    renderConsent();
    expect(await screen.findByText('No consent recorded')).toBeInTheDocument();
    expect(await screen.findByText('No history yet')).toBeInTheDocument();
  });

  it('masks consent text for session replay', async () => {
    get(`/v1/crm/patients/${PID}/consents/current`, [state()]);
    get(`/v1/crm/patients/${PID}/consents`, page([event()]));
    renderConsent();
    const cells = await screen.findAllByText('Call consent');
    for (const c of cells) { expect(c.closest('.ph-mask')).not.toBeNull(); expect(c.closest('.ph-no-capture')).not.toBeNull(); }
  });

  it('pages through history', async () => {
    const offsets: string[] = [];
    get(`/v1/crm/patients/${PID}/consents/current`, [state()]);
    server.use(http.get(`${API_BASE}/v1/crm/patients/${PID}/consents`, ({ request }) => {
      const o = new URL(request.url).searchParams.get('offset') ?? '0';
      offsets.push(o);
      return json(page([event({ id: `e${o}`, consent_type: `type_${o}` })], { offset: Number(o), has_more: o === '0' }));
    }));
    renderConsent();
    await screen.findByText('Type 0');
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByText('Type 25');
    expect(offsets).toEqual(['0', '25']);
  });

  it('a backend failure renders fixed copy and never the backend text', async () => {
    get(`/v1/crm/patients/${PID}/consents/current`, { detail: `boom ${SECRET_ERR}` }, 500);
    get(`/v1/crm/patients/${PID}/consents`, { detail: `boom ${SECRET_ERR}` }, 500);
    renderConsent();
    expect((await screen.findAllByText('Something went wrong')).length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toContain(SECRET_ERR);
  });

  it.each(['viewer', 'builder', 'member'])('a %s can read the ledger but is not offered the record form', async (role) => {
    auth.role = role;
    get(`/v1/crm/patients/${PID}/consents/current`, [state()]);
    get(`/v1/crm/patients/${PID}/consents`, page([event()]));
    renderConsent();
    expect(await screen.findByText('Recorded as granted')).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'Record consent' })).toBeNull();
    expect(screen.getByText('Only owners and admins can record consent.')).toBeInTheDocument();
  });

  it('a merged patient takes no new entries, even for an owner', async () => {
    get(`/v1/crm/patients/${PID}/consents/current`, [state()]);
    get(`/v1/crm/patients/${PID}/consents`, page([event()]));
    renderConsent('merged');
    expect(await screen.findByText('A merged patient cannot receive new consent entries.')).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'Record consent' })).toBeNull();
  });

  it('is append-only: no edit, delete or remove control exists', async () => {
    get(`/v1/crm/patients/${PID}/consents/current`, [state()]);
    get(`/v1/crm/patients/${PID}/consents`, page([event()]));
    renderConsent();
    await screen.findByText('Recorded as granted');
    for (const name of [/edit/i, /delete/i, /remove/i]) expect(screen.queryByRole('button', { name })).toBeNull();
    expect(screen.getByText(/cannot be edited or removed/)).toBeInTheDocument();
  });

  it('canRecordConsent is owner/admin only', () => {
    for (const r of ['owner', 'admin', 'Admin']) expect(canRecordConsent(r)).toBe(true);
    for (const r of ['member', 'builder', 'viewer', '', null, undefined]) expect(canRecordConsent(r)).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('Consent — recording', () => {
  const posts: { url: string; body: Record<string, unknown> }[] = [];
  let status = 201;
  let delay = 0;
  let responder: ((n: number) => { status: number; body: unknown }) | null = null;
  const setup = () => {
    posts.length = 0; status = 201; delay = 0; responder = null;
    let stateRows: unknown[] = [];
    let events: unknown[] = [];
    server.use(
      http.get(`${API_BASE}/v1/crm/patients/${PID}/consents/current`, () => json(stateRows)),
      http.get(`${API_BASE}/v1/crm/patients/${PID}/consents`, () => json(page(events))),
      http.post(`${API_BASE}/v1/crm/patients/${PID}/consents`, async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        posts.push({ url: request.url, body });
        if (delay) await new Promise((r) => setTimeout(r, delay));
        const r = responder ? responder(posts.length) : { status, body: event({ id: 'new', consent_type: body.consent_type, action: body.action }) };
        if (r.status < 300) { stateRows = [state({ consent_type: body.consent_type, action: body.action, granted: body.action === 'granted' })]; events = [r.body]; }
        return json(r.body, r.status);
      }),
    );
    renderAt(`/crm/patients/${PID}`, '/crm/patients/:id', <ConsentCard patientId={PID} patientStatus="active" />);
  };
  const fill = async (type = 'call_consent') => {
    await screen.findByRole('form', { name: 'Record consent' });
    await userEvent.type(screen.getByLabelText('Consent type'), type);
  };
  const review = () => userEvent.click(screen.getByRole('button', { name: 'Review entry' }));
  const confirmBtn = () => screen.findByRole('button', { name: 'Confirm and record' });

  it.each(['owner', 'admin'])('a %s records a consent with exactly the backend fields, after an explicit confirm', async (role) => {
    auth.role = role;
    setup();
    await fill();
    await userEvent.selectOptions(screen.getByLabelText('Entry'), 'granted');
    await userEvent.selectOptions(screen.getByLabelText('Channel'), 'phone');
    await userEvent.type(screen.getByLabelText('Language (optional)'), 'en-IN');
    fireEvent.change(screen.getByLabelText('Expires (optional)'), { target: { value: FUTURE } });
    await review();
    expect(posts).toHaveLength(0);                                                       // nothing sent before confirming
    const group = screen.getByRole('group', { name: 'Confirm consent entry' });
    expect(within(group).getByText(/cannot be edited or removed\./)).toBeInTheDocument();
    await userEvent.click(await confirmBtn());
    expect(await screen.findByText('Consent entry recorded.')).toBeInTheDocument();
    expect(posts).toHaveLength(1);
    expect(posts[0].body).toEqual({
      consent_type: 'call_consent', action: 'granted', channel: 'phone', language: 'en-IN',
      expires_at: new Date(FUTURE).toISOString(), idempotency_key: expect.any(String),
    });
    for (const k of ['source', 'patient_id', 'captured_at', 'granted', 'recorded_by_user_id', 'metadata']) expect(posts[0].body).not.toHaveProperty(k);
    expect(posts[0].url).not.toContain('call_consent');
    await screen.findByText('Recorded as granted');                                      // lists reloaded
    expect((screen.getByLabelText('Consent type') as HTMLInputElement).value).toBe('');  // form reset
  });

  it('records a denial and a withdrawal as new entries', async () => {
    setup();
    await fill('recording');
    await userEvent.selectOptions(screen.getByLabelText('Entry'), 'withdrawn');
    await review();
    await userEvent.click(await confirmBtn());
    await screen.findByText('Consent entry recorded.');
    expect(posts[0].body).toMatchObject({ consent_type: 'recording', action: 'withdrawn', channel: 'staff' });
  });

  it('"Back" leaves the confirm step without sending anything', async () => {
    setup();
    await fill();
    await review();
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.queryByRole('button', { name: 'Confirm and record' })).toBeNull();
    expect(posts).toHaveLength(0);
  });

  it('editing the form after reviewing starts the confirm step over', async () => {
    setup();
    await fill();
    await review();
    await confirmBtn();
    await userEvent.type(screen.getByLabelText('Consent type'), '_x');
    expect(screen.queryByRole('button', { name: 'Confirm and record' })).toBeNull();
  });

  it.each([
    ['Call_Consent', 'uppercase'], ['a', 'too short'], ['1abc', 'starts with a digit'], ['has space', 'space'], ['bad-dash', 'dash'],
  ])('validates the consent type: %s (%s) is not sent', async (value) => {
    setup();
    await fill(value);
    await review();
    expect(await screen.findByText(/Use 2–64 lowercase letters/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirm and record' })).toBeNull();
    expect(posts).toHaveLength(0);
  });

  it('validates language length and a past expiry', async () => {
    setup();
    await fill();
    await userEvent.type(screen.getByLabelText('Language (optional)'), 'x');
    fireEvent.change(screen.getByLabelText('Expires (optional)'), { target: { value: '2001-01-01T00:00' } });
    await review();
    expect(await screen.findByText('Language must be 2–16 characters.')).toBeInTheDocument();
    expect(screen.getByText('Expiry must be in the future.')).toBeInTheDocument();
    expect(posts).toHaveLength(0);
  });

  it('disables the confirm button while saving and never double-submits', async () => {
    setup(); delay = 150;
    await fill();
    await review();
    const btn = await confirmBtn();
    fireEvent.click(btn); fireEvent.click(btn);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Recording…' })).toBeDisabled());
    await screen.findByText('Consent entry recorded.');
    expect(posts).toHaveLength(1);
  });

  it('a retry of an UNCHANGED entry reuses the idempotency key; a changed entry gets a new one', async () => {
    setup();
    responder = (n) => (n === 1 ? { status: 500, body: { detail: 'x' } } : { status: 201, body: event({ id: 'ok' }) });
    await fill();
    await review();
    await userEvent.click(await confirmBtn());
    await screen.findByText('Something went wrong.');
    await review();
    await userEvent.click(await confirmBtn());
    await screen.findByText('Consent entry recorded.');
    expect(posts).toHaveLength(2);
    expect(posts[1].body.idempotency_key).toBe(posts[0].body.idempotency_key);

    // now a different entry: a fresh key
    await userEvent.type(screen.getByLabelText('Consent type'), 'other_type');
    await review();
    await userEvent.click(await confirmBtn());
    await waitFor(() => expect(posts).toHaveLength(3));
    expect(posts[2].body.idempotency_key).not.toBe(posts[1].body.idempotency_key);
  });

  it('after a failed attempt, changing the entry issues a NEW key (so it can never collide with the old one)', async () => {
    setup();
    responder = (n) => (n === 1 ? { status: 500, body: { detail: 'x' } } : { status: 201, body: event({ id: 'ok' }) });
    await fill();
    await review();
    await userEvent.click(await confirmBtn());
    await screen.findByText('Something went wrong.');
    await userEvent.selectOptions(screen.getByLabelText('Entry'), 'denied');
    await review();
    await userEvent.click(await confirmBtn());
    await waitFor(() => expect(posts).toHaveLength(2));
    expect(posts[1].body.idempotency_key).not.toBe(posts[0].body.idempotency_key);
  });

  it.each([[403, 'Access restricted'], [409, 'Change not allowed'], [422, 'Request not accepted'], [500, 'Something went wrong']])(
    'a %i shows fixed copy "%s" and never the backend text; the input is kept', async (code, title) => {
      setup();
      responder = () => ({ status: code, body: { detail: `idempotency_key was already used ${SECRET_ERR}` } });
      await fill();
      await review();
      await userEvent.click(await confirmBtn());
      expect(await screen.findByText(new RegExp(title))).toBeInTheDocument();
      expect(document.body.textContent).not.toContain(SECRET_ERR);
      expect(document.body.textContent).not.toContain('idempotency_key');
      expect((screen.getByLabelText('Consent type') as HTMLInputElement).value).toBe('call_consent');
    });

  it('leaks nothing to the console or the URL, and persists nothing', async () => {
    setup();
    responder = () => ({ status: 500, body: { detail: SECRET_ERR } });
    await fill('sentinel_consent_probe');
    const cap = captureConsole();
    await review();
    await userEvent.click(await confirmBtn());
    await screen.findByText('Something went wrong.');
    const out = cap.text();
    cap.restore();
    expect(out).not.toContain('sentinel_consent_probe');
    expect(out).not.toContain(SECRET_ERR);
    expect(posts[0].url).not.toContain('sentinel');
    expect(localStorage.length + sessionStorage.length).toBe(0);
  });

  it('the consent inputs carry the session-recording protection classes', async () => {
    setup();
    await screen.findByRole('form', { name: 'Record consent' });
    for (const label of ['Consent type', 'Language (optional)', 'Expires (optional)']) {
      const el = screen.getByLabelText(label);
      expect(el).toHaveClass('ph-mask'); expect(el).toHaveClass('ph-no-capture');
    }
  });

  it('suggests only the consent types that already exist for this patient', async () => {
    setup();
    await screen.findByRole('form', { name: 'Record consent' });
    expect(document.querySelectorAll('datalist#crm-consent-types option')).toHaveLength(0);   // nothing invented
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('Patient editing', () => {
  const renderEdit = (data = patient(), onSaved = vi.fn()) => {
    const patches: Record<string, unknown>[] = [];
    server.use(http.patch(`${API_BASE}/v1/crm/patients/${data.id}`, async ({ request }) => {
      patches.push((await request.json()) as Record<string, unknown>);
      return json({ ...data, ...patches[patches.length - 1], updated_at: '2026-01-06T00:00:00Z' });
    }));
    renderAt(`/crm/patients/${PID}`, '/crm/patients/:id', <PatientEditCard data={data} onSaved={onSaved} />);
    return { patches, onSaved };
  };
  const open = async () => { await userEvent.click(screen.getByRole('button', { name: 'Edit details' })); await screen.findByRole('form', { name: 'Edit patient' }); };

  it('an authorized user updates only the changed fields and gets success feedback', async () => {
    const { patches, onSaved } = renderEdit();
    await open();
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Synthetic Patient');   // prefilled
    await userEvent.clear(screen.getByLabelText('Name'));
    await userEvent.type(screen.getByLabelText('Name'), '  Renamed Patient  ');
    await userEvent.selectOptions(screen.getByLabelText('Lifecycle stage'), 'enquiry');
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'inactive');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Patient updated.')).toBeInTheDocument();
    expect(patches).toEqual([{ full_name: 'Renamed Patient', lifecycle_stage: 'enquiry', status: 'inactive' }]);
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it('offers only the five backend-writable fields — never phone, email, date of birth or external reference', async () => {
    renderEdit();
    await open();
    const form = screen.getByRole('form', { name: 'Edit patient' });
    expect(within(form).getAllByRole('textbox')).toHaveLength(2);                                          // name + provider
    for (const label of [/phone/i, /email/i, /date of birth/i, /external/i, /^merged/i]) expect(within(form).queryByLabelText(label)).toBeNull();
    const status = screen.getByLabelText('Status') as HTMLSelectElement;
    expect([...status.options].map((o) => o.value)).toEqual(['active', 'inactive']);                      // "merged" cannot be set
  });

  it('sets the preferred language from the public catalog, by id; clearing sends an explicit null', async () => {
    const { patches } = renderEdit(patient({ preferred_language_id: 1 }));
    await open();
    const lang = (await screen.findByLabelText('Preferred language')) as HTMLSelectElement;
    await waitFor(() => expect([...lang.options].map((o) => o.textContent)).toEqual(['Not set', 'English', 'Hindi']));
    expect(lang.value).toBe('1');
    await userEvent.selectOptions(lang, '2');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await screen.findByText('Patient updated.');
    await open();
    await userEvent.selectOptions(await screen.findByLabelText('Preferred language'), '');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(patches).toHaveLength(2));
    expect(patches[0]).toEqual({ preferred_language_id: 2 });
    expect(patches[1]).toEqual({ preferred_language_id: null });
  });

  it('clearing the preferred provider sends an explicit null', async () => {
    const { patches } = renderEdit();
    await open();
    await userEvent.clear(screen.getByLabelText('Preferred provider'));
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0]).toEqual({ preferred_provider: null });
  });

  it('with no changes it says so and sends nothing', async () => {
    const { patches } = renderEdit();
    await open();
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('No changes to save.')).toBeInTheDocument();
    expect(patches).toHaveLength(0);
  });

  it('validates: a blank name is not sent', async () => {
    const { patches } = renderEdit();
    await open();
    await userEvent.clear(screen.getByLabelText('Name'));
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Enter a name.')).toBeInTheDocument();
    expect(patches).toHaveLength(0);
  });

  it('cancel discards edits without a request', async () => {
    const { patches } = renderEdit();
    await open();
    await userEvent.type(screen.getByLabelText('Name'), ' changed');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('form', { name: 'Edit patient' })).toBeNull();
    expect(patches).toHaveLength(0);
  });

  it('disables submit while saving and never double-submits', async () => {
    let patches = 0;
    server.use(http.patch(`${API_BASE}/v1/crm/patients/${PID}`, async () => { patches += 1; await new Promise((r) => setTimeout(r, 150)); return json(patient()); }));
    renderAt(`/crm/patients/${PID}`, '/crm/patients/:id', <PatientEditCard data={patient()} onSaved={() => {}} />);
    await open();
    await userEvent.type(screen.getByLabelText('Name'), ' x');
    const btn = screen.getByRole('button', { name: 'Save changes' });
    fireEvent.click(btn); fireEvent.click(btn);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled());
    await screen.findByText('Patient updated.');
    expect(patches).toBe(1);
  });

  it.each([[403, 'Access restricted'], [409, 'Change not allowed'], [422, 'Request not accepted'], [500, 'Something went wrong']])(
    'a %i shows fixed copy "%s", never the backend text, and keeps the edits', async (code, title) => {
      server.use(http.patch(`${API_BASE}/v1/crm/patients/${PID}`, () => json({ detail: `a merged patient cannot be edited ${SECRET_ERR}` }, code)));
      renderAt(`/crm/patients/${PID}`, '/crm/patients/:id', <PatientEditCard data={patient()} onSaved={() => {}} />);
      await open();
      await userEvent.type(screen.getByLabelText('Name'), ' x');
      await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
      expect(await screen.findByText(new RegExp(title))).toBeInTheDocument();
      expect(document.body.textContent).not.toContain(SECRET_ERR);
      expect(document.body.textContent).not.toContain('merged patient cannot');
      expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Synthetic Patient x');
    });

  it('a merged patient is read-only: no edit control at all', () => {
    renderEdit(patient({ status: 'merged', merged_into: 'other-id' }));
    expect(screen.getByText('A merged patient cannot be edited.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit details' })).toBeNull();
  });

  it('leaks nothing to the console or URL, and persists nothing', async () => {
    let url = '';
    server.use(http.patch(`${API_BASE}/v1/crm/patients/${PID}`, ({ request }) => { url = request.url; return json({ detail: SECRET_ERR }, 500); }));
    renderAt(`/crm/patients/${PID}`, '/crm/patients/:id', <PatientEditCard data={patient()} onSaved={() => {}} />);
    await open();
    const cap = captureConsole();
    await userEvent.clear(screen.getByLabelText('Name'));
    await userEvent.type(screen.getByLabelText('Name'), SECRET_NAME);
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await screen.findByText('Something went wrong.');
    const out = cap.text();
    cap.restore();
    expect(out).not.toContain(SECRET_NAME);
    expect(out).not.toContain(SECRET_ERR);
    expect(url).not.toContain('Sentinel');
    expect(localStorage.length + sessionStorage.length).toBe(0);
  });

  it('the name and provider inputs carry the session-recording protection classes', async () => {
    renderEdit();
    await open();
    for (const label of ['Name', 'Preferred provider']) {
      const el = screen.getByLabelText(label);
      expect(el).toHaveClass('ph-mask'); expect(el).toHaveClass('ph-no-capture');
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('Patient detail with consent and editing', () => {
  let patientNow: PatientDetail;
  let getCount = 0;
  const setup = (p = patient()) => {
    patientNow = p; getCount = 0;
    server.use(
      http.get(`${API_BASE}/v1/crm/patients/${PID}`, () => { getCount += 1; return json(patientNow); }),
      http.patch(`${API_BASE}/v1/crm/patients/${PID}`, async ({ request }) => {
        patientNow = { ...patientNow, ...((await request.json()) as object), updated_at: '2026-01-06T00:00:00Z' } as PatientDetail;
        return json(patientNow);
      }),
      http.get(`${API_BASE}/v1/crm/patients/${PID}/verification`, () => json({ patient_id: PID, latest_status: null, episodes: [] })),
      http.get(`${API_BASE}/v1/crm/patients/${PID}/consents/current`, () => json([state()])),
      http.get(`${API_BASE}/v1/crm/patients/${PID}/consents`, () => json(page([event()]))),
      http.get(`${API_BASE}/v1/crm/patients/${PID}/interactions`, () => json(page([]))),
      http.get(`${API_BASE}/v1/crm/patients/${PID}/notes`, () => json(page([]))),
      http.get(`${API_BASE}/v1/crm/cases`, () => json(page([]))),
      http.get(`${API_BASE}/v1/crm/tasks`, () => json(page([]))),
      http.get(`${API_BASE}/v1/crm/appointments`, () => json(page([]))),
    );
    renderAt(`/crm/patients/${PID}`, '/crm/patients/:id', <PatientDetailPage />);
  };

  it('shows Consent and an edit control in the workspace, and Consent in the section navigator', async () => {
    setup();
    await screen.findByText('Patient information');
    expect(await screen.findByText('Recorded as granted')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit details' })).toBeInTheDocument();
    expect(within(screen.getByRole('navigation', { name: 'Patient sections' })).getByRole('button', { name: 'Consent' })).toBeInTheDocument();
  });

  it('after a save the page refreshes the patient and the confirmation stays visible', async () => {
    setup();
    await screen.findByText('Patient information');
    await userEvent.click(screen.getByRole('button', { name: 'Edit details' }));
    await userEvent.clear(screen.getByLabelText('Name'));
    await userEvent.type(screen.getByLabelText('Name'), 'Renamed Patient');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Patient updated.')).toBeInTheDocument();
    await waitFor(() => expect(getCount).toBeGreaterThanOrEqual(2));
    expect((await screen.findAllByText('Renamed Patient')).length).toBeGreaterThan(0);     // the info card shows the new name
    expect(screen.getByText('Patient updated.')).toBeInTheDocument();                        // and nothing was unmounted
  });

  it('a viewer sees no edit control and no consent form', async () => {
    auth.role = 'viewer';
    setup();
    await screen.findByText('Recorded as granted');
    expect(screen.queryByRole('button', { name: 'Edit details' })).toBeNull();
    expect(screen.queryByRole('form', { name: 'Record consent' })).toBeNull();
    expect(screen.queryByRole('form', { name: 'Edit patient' })).toBeNull();
  });

  it('a builder can edit but cannot record consent', async () => {
    auth.role = 'builder';
    setup();
    await screen.findByText('Recorded as granted');
    expect(screen.getByRole('button', { name: 'Edit details' })).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'Record consent' })).toBeNull();
  });

  it('a merged patient: no edit, no consent form, and the merge pointer still works', async () => {
    setup(patient({ status: 'merged', merged_into: '22222222-2222-4222-8222-222222222222' }));
    await screen.findByText('A merged patient cannot be edited.');
    expect(await screen.findByText('A merged patient cannot receive new consent entries.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit details' })).toBeNull();
    expect(screen.getByRole('link', { name: 'View the surviving record' })).toHaveAttribute('href', '/crm/patients/22222222-2222-4222-8222-222222222222');
  });
});
