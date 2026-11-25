/**
 * Analytics Phase 5 — the reporting sections on the Analytics page.
 *
 *   1. Shared filters reach every applicable report; unsupported filters are never sent.
 *   2. Comparison renders absolute and percentage change, and says "unavailable" — never zero — when it is.
 *   3. Loading, error (with retry, without blanking the other sections), empty and partial-data states.
 *   4. A slow response for an old filter cannot overwrite the newer selection.
 *   5. Events copy states the real contract and its coverage limits.
 *
 * Synthetic data only.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { delay, http, HttpResponse } from 'msw';
import { server } from '../../mocks/server';
import { API_BASE } from '../../mocks/fixtures';
import AnalyticsPage from '../../../src/pages/analytics';

vi.mock('../../../src/context/AppContext', () => ({
  useApp: () => ({ addToast: vi.fn(), user: { user_id: 'u1', role: 'owner', company_id: 'c', company_name: 'Co' } }),
}));

const REPORTS = ['volume', 'outcomes', 'agent-performance', 'tools', 'escalations', 'calls', 'knowledge-effectiveness'] as const;
const LEGACY = ['summary', 'sessions', 'latency', 'knowledge-gaps', 'languages', 'agents', 'events'] as const;
type Path = (typeof REPORTS)[number] | (typeof LEGACY)[number];
type Body = unknown | Response | ((p: URLSearchParams) => unknown | Response | Promise<unknown | Response>);

let seen: { path: string; params: URLSearchParams }[] = [];
const requestsFor = (path: string) => seen.filter(s => s.path === path);
const lastFor = (path: string) => requestsFor(path).at(-1)!.params;

const win = { days: 7, start: '2026-01-01T00:00:00+00:00', end: '2026-01-08T00:00:00+00:00', timezone: 'UTC', interval: '[start, end)' };
const env = (metrics: unknown, extra: Record<string, unknown> = {}) => ({
  window: win, traffic: 'production', definitions: {}, metrics, previous: null, comparison: null, ...extra,
});

const volumeBody = (over: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) => env(
  { sessions: 41, new_conversations: 33, continuation_sessions: 8, distinct_conversations: 35, continuation_share: 0.195, ...over },
  {
    bucket: 'day', by_channel: [{ channel: 'widget', sessions: 41 }],
    traffic_breakdown: { production: 41, demo: 5, unclassified: 9 },
    series: [{ date: '2026-01-05', sessions: 41, new_conversations: 33, continuation_sessions: 8 }], ...extra,
  });

const outcomesBody = (over: Record<string, unknown> = {}) => env({
  sessions: 20, active_sessions: 2, terminal_sessions: 18, completed: 9, abandoned: 4, timed_out: 3, disconnected: 2,
  completion_rate: 0.5, abandonment_rate: 0.222, timed_out_rate: 0.167, disconnect_rate: 0.111,
  avg_duration_seconds: 125, median_duration_seconds: 90, completed_avg_duration_seconds: 80, duration_sample_size: 17, ...over,
});

const DEFAULTS: Record<Path, Body> = {
  summary: { window_days: 7, traffic: 'production', total_sessions: 4, completed: 3, abandoned: 1, completion_rate: 0.75, success_rate: null, sessions_by_day: [], top_failing_agents: [] },
  sessions: [], latency: { note: 'no calls' }, 'knowledge-gaps': [], languages: [], agents: [
    { agent_id: 'agent-1', name: 'Agent One', use_case: null, call_direction: null, status: null, sessions: 1, completed: 1, abandoned: 0, avg_rating: null, avg_turns: 1 },
  ],
  events: [],
  volume: () => volumeBody(),
  outcomes: () => outcomesBody(),
  'agent-performance': () => env({ agents: 1, sessions: 6, terminal_sessions: 5, completion_rate: 0.6 }, {
    agents: [{
      agent_id: 'agent-1', name: 'Agent One', sessions: 6, completed: 3, abandoned: 2, timed_out: 0, disconnected: 0,
      terminal_sessions: 5, completion_rate: 0.6, escalated_sessions: 1, escalation_rate: 0.167, chat_turns: 12, voice_turns: null,
      turns_failed: null, turn_failure_rate: null, response_time_avg_ms: null, response_time_median_ms: null,
      response_time_sample_size: 0, tool_invocations: null, tool_success_rate: null,
    }],
  }),
  tools: () => env(
    { invocations: 8, succeeded: 6, failed: 2, success_rate: 0.75, latency_avg_ms: 210, latency_p50_ms: 180, latency_p95_ms: 400, latency_sample_size: 7 },
    {
      by_tool: [{ tool: 'lookup_ticket', invocations: 8, succeeded: 6, failed: 2, success_rate: 0.75, latency_avg_ms: 210, latency_sample_size: 7 }],
      by_agent: [{ agent_id: 'agent-1', agent_name: 'Agent One', invocations: 8, succeeded: 6, failed: 2, success_rate: 0.75 }],
      failure_categories: [{ category: 'timeout', failed: 2 }],
    }),
  escalations: () => env({ triggered: 5, delivered: 3, failed: 1, delivery_success_rate: 0.75 }, {
    bucket: 'day', by_reason: [{ reason: 'user_requested', triggered: 5 }],
    series: [{ date: '2026-01-05', triggered: 5, delivered: 3, failed: 1 }],
  }),
  calls: () => env(
    { initiated: 10, completed: 5, disconnected: 2, failed: 1, no_answer: 1, open: 1, terminal: 9, completion_rate: 0.556, avg_duration_ms: 61000, median_duration_ms: 58000, duration_sample_size: 5 },
    {
      by_channel: [{ channel: 'phone', initiated: 10, completed: 5, disconnected: 2, failed: 1, no_answer: 1, completion_rate: 0.556, avg_duration_ms: 61000 }],
      latency: {
        llm: { sample_size: 12, avg_ms: 500, p50_ms: 480, p95_ms: 900 },
        stt: { sample_size: 0, avg_ms: null, p50_ms: null },
        tts: { sample_size: 0, avg_ms: null, p50_ms: null },
      },
      events: { counts: { 'call.started': 10, 'call.completed': 5 }, coverage: 'Phase 3 call events only.', failure_categories: [{ category: 'provider_error', failed: 1 }] },
      unsupported: ['Vobiz calls: STT/TTS latency and provider per turn are not persisted (only llm_latency_ms).'],
    }),
  'knowledge-effectiveness': () => env(
    { answered_questions: 30, known_retrieval: 20, unknown_retrieval: 10, knowledge_gaps: 5, covered: 15, knowledge_gap_rate: 0.25, retrieval_coverage: 0.75 },
    {
      bucket: 'day',
      by_agent: [{ agent_id: 'agent-1', agent_name: 'Agent One', answered_questions: 30, known_retrieval: 20, knowledge_gaps: 5, knowledge_gap_rate: 0.25 }],
      by_channel: [{ channel: 'chat', answered_questions: 30, known_retrieval: 20, knowledge_gaps: 5, knowledge_gap_rate: 0.25 }],
      series: [{ date: '2026-01-05', answered_questions: 30, known_retrieval: 20, knowledge_gaps: 5, knowledge_gap_rate: 0.25 }],
    }),
};

function install(over: Partial<Record<Path, Body>> = {}) {
  seen = [];
  const bodies = { ...DEFAULTS, ...over };
  server.use(...[...LEGACY, ...REPORTS].map(path =>
    http.get(`${API_BASE}/v1/analytics/${path}`, async ({ request }) => {
      const params = new URL(request.url).searchParams;
      seen.push({ path, params });
      const b = bodies[path];
      const out = typeof b === 'function' ? await (b as (p: URLSearchParams) => unknown)(params) : b;
      return out instanceof Response ? out : HttpResponse.json(out as object);
    })));
}

function renderPage(tab = 'summary') {
  return render(
    <MemoryRouter initialEntries={[`/analytics/${tab}`]}>
      <Routes><Route path="/analytics/:tab" element={<AnalyticsPage />} /></Routes>
    </MemoryRouter>,
  );
}
const section = (id: string) => within(document.getElementById(id)!);

beforeEach(() => {
  window.matchMedia = window.matchMedia || ((q: string) => ({
    matches: false, media: q, onchange: null, addListener: vi.fn(), removeListener: vi.fn(),
    addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
});

describe('Reports: sections and shared filters', () => {
  it('shows volume and outcomes on Summary with the shared period and traffic, and only the supported extras', async () => {
    install();
    renderPage();
    await screen.findByText('Conversation volume');
    await waitFor(() => expect(section('report-volume').getAllByText('41').length).toBeGreaterThan(0));
    expect(section('report-volume').getByText('33')).toBeTruthy();          // new conversations
    expect(section('report-outcomes').getByText('50.0%')).toBeTruthy();     // completion rate
    for (const p of ['volume', 'outcomes']) {
      expect(lastFor(p).get('days'), p).toBe('7');
      expect(lastFor(p).get('traffic'), p).toBe('production');
      expect(lastFor(p).has('agent_id'), p).toBe(false);
      expect(lastFor(p).has('compare'), p).toBe(false);
    }
    expect(lastFor('volume').get('bucket')).toBe('day');                    // volume has a series
    expect(lastFor('outcomes').has('bucket')).toBe(false);                  // outcomes does not
  });

  it('re-requests the reports with the new traffic, period, agent, compare and trend — and never sends unsupported filters', async () => {
    install();
    renderPage();
    await section('report-volume').findAllByText('41');
    await waitFor(() => expect(requestsFor('agents').length).toBe(1));      // agent list is loaded

    fireEvent.change(screen.getByRole('combobox', { name: 'Traffic' }), { target: { value: 'all' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Period' }), { target: { value: '30' } });
    await waitFor(() => expect(lastFor('volume').get('days')).toBe('30'));
    expect(lastFor('volume').get('traffic')).toBe('all');

    fireEvent.change(screen.getByRole('combobox', { name: 'Agent' }), { target: { value: 'agent-1' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Compare with previous period' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Trend granularity' }), { target: { value: 'week' } });
    await waitFor(() => expect(lastFor('volume').get('bucket')).toBe('week'));
    for (const p of ['volume', 'outcomes']) {
      expect(lastFor(p).get('agent_id'), p).toBe('agent-1');
      expect(lastFor(p).get('compare'), p).toBe('true');
    }
    // Legacy endpoints that accept agent_id get it; the ones that do not never do, and no legacy endpoint
    // ever receives the report-only compare / bucket filters.
    expect(lastFor('summary').get('agent_id')).toBe('agent-1');
    for (const p of ['knowledge-gaps', 'languages', 'agents']) expect(lastFor(p).has('agent_id'), p).toBe(false);
    for (const p of LEGACY) {
      expect(lastFor(p).has('compare'), p).toBe(false);
      expect(lastFor(p).has('bucket'), p).toBe(false);
    }
  });

  it('renders every report on its tab: agents, tools & escalations, latency & calls, knowledge gaps', async () => {
    install();
    const a = renderPage('agents');
    await section('report-agent-performance').findByText('Completion rate');
    const row = section('report-agent-performance').getByRole('row', { name: /Agent One/ });
    expect(within(row).getAllByText('—').length).toBeGreaterThan(3);          // not measured ≠ 0
    a.unmount();

    const t = renderPage('tools');
    await section('report-tools').findAllByText('Invocations');
    expect(section('report-tools').getByText('lookup_ticket')).toBeTruthy();
    expect(section('report-tools').getAllByText('75.0%').length).toBeGreaterThan(0);
    await section('report-escalations').findByText('Delivery success rate');
    expect(section('report-escalations').getByText('User requested')).toBeTruthy();
    t.unmount();

    const c = renderPage('latency');
    await section('report-calls').findByText('Calls initiated');
    expect(section('report-calls').getAllByText('Not measured').length).toBe(6);     // STT + TTS: 3 cells each
    expect(section('report-calls').getAllByText('Disconnected').length).toBeGreaterThan(0);
    expect(section('report-calls').getByText(/Vobiz calls: STT\/TTS latency/)).toBeTruthy();
    c.unmount();

    renderPage('knowledge-gaps');
    await section('report-knowledge').findAllByText('Gap rate');
    expect(section('report-knowledge').getAllByText('25.0%').length).toBeGreaterThan(0);
    expect(section('report-knowledge').getByText(/not recorded, left out of rates/)).toBeTruthy();
  });

  it('keeps the new/continuation split when empty days have a null split (the API leaves it null for them)', async () => {
    install({
      volume: () => volumeBody({}, { series: [
        { date: '2026-01-04', sessions: 0, new_conversations: null, continuation_sessions: null },
        { date: '2026-01-05', sessions: 41, new_conversations: 33, continuation_sessions: 8 },
      ] }),
    });
    renderPage();
    await section('report-volume').findAllByText('41');
    expect(section('report-volume').getByText('Continuations')).toBeTruthy();                // legend is shown
    expect(section('report-volume').getByRole('listitem', { name: '2026-01-04: 0' })).toBeTruthy();
  });

  it('shows calls as production-only (not zero) when the traffic filter excludes them', async () => {
    install({ calls: () => ({ ...env({}), traffic: 'demo', note: 'Calls are production traffic; none for traffic=demo.' }) });
    renderPage('latency');
    expect(await section('report-calls').findByText(/Calls are production traffic/)).toBeTruthy();
    expect(section('report-calls').queryByText('Calls initiated')).toBeNull();
  });

  it('draws the outcome bar with an accessible text summary, not colour alone', async () => {
    install();
    renderPage();
    await section('report-outcomes').findByText('Completion rate');
    const bar = section('report-outcomes').getByRole('img', { name: /Ended sessions by outcome/ });
    expect(bar.getAttribute('aria-label')).toMatch(/Completed 9 \(50\.0%\)/);
    expect(section('report-outcomes').getByText('Disconnected:')).toBeTruthy();   // legend states every segment
  });
});

describe('Reports: request fan-out', () => {
  it('loads only the active tab\'s reports, and Compare / Trend re-request those alone — never the legacy endpoints', async () => {
    install();
    renderPage();
    await section('report-volume').findAllByText('41');
    await waitFor(() => expect(requestsFor('agents').length).toBe(1));
    const before = Object.fromEntries([...LEGACY, ...REPORTS].map(p => [p, requestsFor(p).length]));
    // only Summary's two reports exist on this tab; the other five are not requested at all
    for (const p of ['agent-performance', 'tools', 'escalations', 'calls', 'knowledge-effectiveness']) expect(before[p], p).toBe(0);
    expect(before.volume).toBe(1);
    expect(before.outcomes).toBe(1);

    fireEvent.click(screen.getByRole('checkbox', { name: 'Compare with previous period' }));
    await waitFor(() => expect(requestsFor('volume').length).toBe(2));
    fireEvent.change(screen.getByRole('combobox', { name: 'Trend granularity' }), { target: { value: 'week' } });
    await waitFor(() => expect(requestsFor('volume').length).toBe(3));
    expect(requestsFor('outcomes').length).toBe(2);                           // Compare re-requests it; Trend does not (no bucket)
    for (const p of LEGACY) expect(requestsFor(p).length, p).toBe(before[p]); // the legacy endpoints never reload for them
  });

  it('does not reload the legacy endpoints when moving between tabs', async () => {
    install();
    const view = renderPage('summary');
    await section('report-volume').findAllByText('41');
    await waitFor(() => expect(requestsFor('events').length).toBe(1));
    const legacyBefore = LEGACY.map(p => requestsFor(p).length);
    fireEvent.click(screen.getByRole('button', { name: /Tools & Escalations/ }));
    await section('report-tools').findAllByText('Invocations');
    expect(LEGACY.map(p => requestsFor(p).length)).toEqual(legacyBefore);
    view.unmount();
  });
});

describe('Reports: comparison', () => {
  const cmpVolume = (p: URLSearchParams) => p.get('compare') === 'true'
    ? volumeBody({}, {
      previous: { sessions: 20, new_conversations: 0, continuation_sessions: null, distinct_conversations: 30, continuation_share: 0.1 },
      comparison: {
        sessions: { current: 41, previous: 20, change: 21, change_pct: 105 },
        new_conversations: { current: 33, previous: 0, change: 33, change_pct: null },          // previous 0: % undefined
        continuation_sessions: { current: 8, previous: null, change: null, change_pct: null },  // missing in previous
        distinct_conversations: { current: 35, previous: 40, change: -5, change_pct: -12.5 },
        continuation_share: { current: 0.195, previous: 0.1, change: 0.095, change_pct: 95 },
      },
    })
    : volumeBody();

  it('shows absolute and percentage change, and states why a percentage or a comparison is unavailable', async () => {
    install({ volume: cmpVolume });
    renderPage();
    await section('report-volume').findAllByText('41');
    expect(section('report-volume').queryAllByTestId('delta').length).toBe(0);        // off by default
    fireEvent.click(screen.getByRole('checkbox', { name: 'Compare with previous period' }));
    await section('report-volume').findByText('▲ +21 (+105.0%) vs previous period (20)');
    expect(section('report-volume').getByText('▲ +33 (% change n/a: previous period was 0) vs previous period (0)')).toBeTruthy();
    expect(section('report-volume').getByText('▼ −5 (−12.5%) vs previous period (40)')).toBeTruthy();
    expect(section('report-volume').getByText('▲ +9.5 pp (+95.0%) vs previous period (10.0%)')).toBeTruthy();   // rates change in points
    expect(section('report-volume').getByText(/Comparison unavailable/)).toBeTruthy();                             // missing side
    expect(section('report-volume').queryByText(/Infinity|NaN/)).toBeNull();
  });

  it('marks a metric the API did not compare as unavailable when comparison is on, never as 0', async () => {
    install({ outcomes: p => p.get('compare') === 'true' ? { ...outcomesBody(), previous: null, comparison: {} } : outcomesBody() });
    renderPage();
    await section('report-outcomes').findByText('Completion rate');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Compare with previous period' }));
    await waitFor(() => expect(section('report-outcomes').getAllByText(/Comparison unavailable/).length).toBeGreaterThan(5));
    expect(section('report-outcomes').queryByText(/No change/)).toBeNull();
  });

  it('says "No change" only for a real zero change', async () => {
    install({
      outcomes: p => p.get('compare') === 'true'
        ? { ...outcomesBody(), comparison: { completion_rate: { current: 0.5, previous: 0.5, change: 0, change_pct: 0 } } }
        : outcomesBody(),
    });
    renderPage();
    await section('report-outcomes').findByText('Completion rate');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Compare with previous period' }));
    expect(await section('report-outcomes').findByText('■ No change vs previous period (50.0%)')).toBeTruthy();
  });
});

describe('Reports: states', () => {
  it('shows a loading state, then the data', async () => {
    install({ volume: async () => { await delay(150); return volumeBody(); } });
    renderPage();
    const loading = await screen.findByRole('status', { name: 'Loading Conversation volume' });
    expect(loading).toBeTruthy();
    expect(document.getElementById('report-volume')!.getAttribute('aria-busy')).toBe('true');
    await section('report-volume').findAllByText('41');
    expect(screen.queryByRole('status', { name: 'Loading Conversation volume' })).toBeNull();
  });

  it('shows an error with a working Retry for one section while the others keep their data (partial data)', async () => {
    let calls = 0;
    install({ volume: () => (++calls === 1 ? HttpResponse.json({ detail: 'boom' }, { status: 500 }) : volumeBody()) });
    renderPage();
    const alert = await section('report-volume').findByRole('alert');
    expect(alert.textContent).toMatch(/Could not load conversation volume/);
    expect(await section('report-outcomes').findByText('50.0%')).toBeTruthy();         // unaffected
    fireEvent.click(within(alert).getByRole('button', { name: 'Retry' }));
    expect(await section('report-volume').findAllByText('41')).toBeTruthy();
    expect(requestsFor('volume').length).toBe(2);
  });

  it('shows empty states that say what is missing, and "—" for undefined rates', async () => {
    install({
      volume: () => volumeBody({ sessions: 0, new_conversations: 0, continuation_sessions: 0, distinct_conversations: 0, continuation_share: null }, { by_channel: [], series: [] }),
      outcomes: () => outcomesBody({ sessions: 0, active_sessions: 0, terminal_sessions: 0, completed: 0, abandoned: 0, timed_out: 0, disconnected: 0,
        completion_rate: null, abandonment_rate: null, timed_out_rate: null, disconnect_rate: null,
        avg_duration_seconds: null, median_duration_seconds: null, completed_avg_duration_seconds: null, duration_sample_size: 0 }),
    });
    renderPage();
    expect(await section('report-volume').findByText(/No sessions in this period for the selected traffic/)).toBeTruthy();
    expect(await section('report-outcomes').findByText(/No session has ended in this period/)).toBeTruthy();
    expect(section('report-outcomes').getAllByText('—').length).toBeGreaterThanOrEqual(6);
    expect(section('report-outcomes').queryByText('0.0%')).toBeNull();
  });

  it('explains empty event-based reports by their coverage, and an unavailable report by its reason', async () => {
    install({
      tools: () => env({ invocations: 0, succeeded: 0, failed: 0, success_rate: null, latency_avg_ms: null, latency_p50_ms: null, latency_p95_ms: null, latency_sample_size: 0 },
        { by_tool: [], by_agent: [], failure_categories: [] }),
      escalations: () => ({ available: false, reason: 'analytics_events lacks session_id/event_key (migration 089 not applied)', window: win, traffic: 'production', metrics: null }),
    });
    renderPage('tools');
    expect(await section('report-tools').findByText(/No tool invocations recorded in this period/)).toBeTruthy();
    expect(section('report-tools').getByText(/only from that release onward/)).toBeTruthy();
    expect(await section('report-escalations').findByText(/not available yet: analytics_events lacks session_id/)).toBeTruthy();
  });

  it('does not let a slow response for an old filter overwrite the newer selection', async () => {
    install({
      volume: async p => {
        if (p.get('traffic') === 'production') { await delay(250); return volumeBody({ sessions: 111, new_conversations: 110 }); }
        return volumeBody({ sessions: 222, new_conversations: 221 }, { traffic: 'demo' });
      },
    });
    renderPage();
    await waitFor(() => expect(requestsFor('volume').length).toBe(1));                 // slow production request in flight
    fireEvent.change(screen.getByRole('combobox', { name: 'Traffic' }), { target: { value: 'demo' } });
    await section('report-volume').findAllByText('222');
    await delay(400);                                                                   // let the stale response arrive
    expect(section('report-volume').queryByText('111')).toBeNull();
    expect(section('report-volume').getAllByText('222').length).toBeGreaterThan(0);
  });

  it('clears the previous numbers while new filters load, instead of showing them under the new filter', async () => {
    install({
      volume: async p => {
        if (p.get('days') === '30') { await delay(200); return volumeBody({ sessions: 303 }); }
        return volumeBody({ sessions: 77 });
      },
    });
    renderPage();
    await section('report-volume').findAllByText('77');
    fireEvent.change(screen.getByRole('combobox', { name: 'Period' }), { target: { value: '30' } });
    await screen.findByRole('status', { name: 'Loading Conversation volume' });
    expect(section('report-volume').queryByText('77')).toBeNull();
    await section('report-volume').findAllByText('303');
  });
});

describe('Events tab copy', () => {
  it('describes the real contract and its coverage, and sends the category (not traffic)', async () => {
    install();
    renderPage('events');
    expect(await screen.findByText(/lifecycle events/)).toBeTruthy();
    expect(screen.getAllByText(/only from the Phase 3 release onward/).length).toBeGreaterThan(0);
    expect(screen.getByText(/never message text/)).toBeTruthy();
    expect(screen.queryByText(/Healthcare domain events\./)).toBeNull();                // the old, now-wrong description
    expect(await screen.findByText(/No events in this period\. Lifecycle events exist only from the Phase 3 release onward/)).toBeTruthy();

    fireEvent.change(screen.getByRole('combobox', { name: 'Event category' }), { target: { value: 'tool' } });
    await waitFor(() => expect(lastFor('events').get('category')).toBe('tool'));
    expect(lastFor('events').has('traffic')).toBe(false);
    expect(lastFor('events').get('days')).toBe('7');
  });

  it('lists events from the stream without claiming they cover the past', async () => {
    install({ events: () => [{ id: '1', event_type: 'tool.completed', agent_id: 'agent-1-aaaa', payload: { tool_name: 'lookup', duration_ms: 12 }, occurred_at: '2026-01-05T10:00:00Z' }] });
    renderPage('events');
    expect(await screen.findByText('tool.completed')).toBeTruthy();
    expect(screen.queryByText(/No events in this period/)).toBeNull();
    // the payload column leads with what distinguishes the event, not the contract boilerplate
    expect(screen.getByText('tool_name=lookup duration_ms=12')).toBeTruthy();
  });

  it('summarises a lifecycle payload without its boilerplate keys', async () => {
    install({ events: () => [{ id: '2', event_type: 'turn.agent_failed', agent_id: null, occurred_at: '2026-01-05T10:00:00Z',
      payload: { schema: 1, category: 'turn', source: 'agent', channel: 'widget', turn_number: 3, failure_category: 'timeout' } }] });
    renderPage('events');
    expect(await screen.findByText('channel=widget turn_number=3 failure_category=timeout')).toBeTruthy();
    expect(screen.queryByText(/schema/)).toBeNull();
  });
});
