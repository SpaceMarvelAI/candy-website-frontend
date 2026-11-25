/**
 * Analytics Phase 2 — the Period and Traffic filters.
 *
 *   1. Both filters are sent to every tab that supports them (summary, sessions, latency,
 *      knowledge gaps, languages, agents); Events has no traffic marker, so it gets only `days`.
 *   2. Changing a filter re-fetches every tab, and the displayed data follows the new filter.
 *   3. A slow response for an OLD filter must not overwrite the data of the filter now selected.
 *   4. The summary says what it shows and what the filter left out; it shows a completion rate
 *      (and no success rate — nothing records whether a goal was met).
 *   5. The sessions table shows the real traffic class, not the misleading `text_demo` type.
 *
 * Synthetic data only.
 */
import { StrictMode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { delay, http, HttpResponse } from 'msw';
import { server } from '../../mocks/server';
import { API_BASE } from '../../mocks/fixtures';
import AnalyticsPage from '../../../src/pages/analytics';

vi.mock('../../../src/context/AppContext', () => ({
  useApp: () => ({ addToast: vi.fn(), user: { user_id: 'u1', role: 'owner', company_id: 'c', company_name: 'Co' } }),
}));

type Seen = { path: string; params: URLSearchParams };
let seen: Seen[] = [];

const PATHS = ['summary', 'sessions', 'latency', 'knowledge-gaps', 'languages', 'agents', 'events'] as const;
const withTraffic = ['summary', 'sessions', 'latency', 'knowledge-gaps', 'languages', 'agents'];

function summary(over: Record<string, unknown> = {}) {
  return {
    window_days: 7, traffic: 'production', total_sessions: 4, completed: 3, abandoned: 1,
    ended_sessions: 4, completion_rate: 0.75, success_rate: null,
    traffic_breakdown: { production: 4, demo: 2, unclassified: 5 },
    populations: { sessions: 'sessions population', calls: 'calls population' },
    definitions: { completion_rate: 'completed / (completed + abandoned)' },
    sessions_by_day: [], top_failing_agents: [], ...over,
  };
}

/** Records every analytics request; `bodies` overrides the response of a path. */
function install(bodies: Partial<Record<(typeof PATHS)[number], (p: URLSearchParams) => unknown | Promise<unknown>>> = {}) {
  seen = [];
  server.use(...PATHS.map(path =>
    http.get(`${API_BASE}/v1/analytics/${path}`, async ({ request }) => {
      const params = new URL(request.url).searchParams;
      seen.push({ path, params });
      const make = bodies[path];
      const body = make ? await make(params) : (path === 'summary' ? summary() : path === 'latency' ? { note: 'no calls' } : []);
      return HttpResponse.json(body as object);
    })));
}

function renderPage(tab = 'summary') {
  return render(
    <MemoryRouter initialEntries={[`/analytics/${tab}`]}>
      <Routes><Route path="/analytics/:tab" element={<AnalyticsPage />} /></Routes>
    </MemoryRouter>,
  );
}
const requestsFor = (path: string) => seen.filter(s => s.path === path);
const lastFor = (path: string) => requestsFor(path).at(-1)!.params;

beforeEach(() => {
  // jsdom has no matchMedia; the page uses it for responsive layout.
  window.matchMedia = window.matchMedia || ((q: string) => ({
    matches: false, media: q, onchange: null, addListener: vi.fn(), removeListener: vi.fn(),
    addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
});

describe('Analytics filters', () => {
  it('sends the default period and traffic to every supporting tab, and only the period to Events', async () => {
    install();
    renderPage();
    await waitFor(() => expect(seen.length).toBeGreaterThanOrEqual(PATHS.length));
    for (const p of withTraffic) {
      expect(lastFor(p).get('days'), p).toBe('7');
      expect(lastFor(p).get('traffic'), p).toBe('production');
    }
    expect(lastFor('events').get('days')).toBe('7');
    expect(lastFor('events').has('traffic')).toBe(false);
  });

  it('fetches each tab once on mount, even under React StrictMode (which runs the effect twice in dev)', async () => {
    install();
    render(
      <StrictMode>
        <MemoryRouter initialEntries={['/analytics/summary']}>
          <Routes><Route path="/analytics/:tab" element={<AnalyticsPage />} /></Routes>
        </MemoryRouter>
      </StrictMode>,
    );
    await waitFor(() => expect(seen.length).toBeGreaterThanOrEqual(PATHS.length));
    await delay(150);                                                        // let any duplicate arrive
    for (const p of PATHS) expect(requestsFor(p).length, p).toBe(1);
  });

  it('re-fetches every tab with the new traffic and period when a filter changes', async () => {
    install();
    renderPage();
    await waitFor(() => expect(seen.length).toBeGreaterThanOrEqual(PATHS.length));
    seen = [];

    fireEvent.change(screen.getByRole('combobox', { name: 'Traffic' }), { target: { value: 'demo' } });
    await waitFor(() => expect(requestsFor('summary').length).toBe(1));
    for (const p of withTraffic) expect(lastFor(p).get('traffic'), p).toBe('demo');
    expect(lastFor('events').has('traffic')).toBe(false);

    fireEvent.change(screen.getByRole('combobox', { name: 'Period' }), { target: { value: '30' } });
    await waitFor(() => expect(requestsFor('summary').length).toBe(2));
    for (const p of withTraffic) {
      expect(lastFor(p).get('days'), p).toBe('30');
      expect(lastFor(p).get('traffic'), p).toBe('demo');          // the other filter is kept
    }
    expect(lastFor('events').get('days')).toBe('30');
  });

  it('shows data for the CURRENT filter even if an older request finishes last', async () => {
    install({
      summary: async p => {
        if (p.get('traffic') === 'production') { await delay(250); return summary({ total_sessions: 111 }); }
        return summary({ total_sessions: 222, traffic: 'demo' });
      },
    });
    renderPage();
    await waitFor(() => expect(requestsFor('summary').length).toBe(1));                  // slow production request in flight
    fireEvent.change(screen.getByRole('combobox', { name: 'Traffic' }), { target: { value: 'demo' } });
    await screen.findByText('222');
    await delay(400);                                                                    // let the stale response arrive
    expect(screen.queryByText('111')).toBeNull();
    expect(screen.getByText('222')).toBeTruthy();
  });

  it('states what is shown and what the filter left out, with a completion rate and no success rate', async () => {
    install();
    renderPage();
    await screen.findByText('Completion Rate');
    expect(screen.getByText('75.0%')).toBeTruthy();
    expect(screen.queryByText('Success Rate')).toBeNull();
    const note = await screen.findByText(/Not included:/);
    expect(note.textContent).toContain('2 demo');
    expect(note.textContent).toContain('5 unclassified');
    expect(note.textContent).toMatch(/cannot be reliably told apart/);
  });

  it('shows the real traffic class on the sessions tab, not the text_demo type', async () => {
    install({
      sessions: () => [{
        id: 's1', status: 'completed', session_type: 'text_demo', traffic: 'production',
        feedback_rating: null, feedback_notes: null, turn_count: 2,
        started_at: '2026-01-05T10:00:00Z', ended_at: null, agent_name: 'Agent One', use_case_id: null,
      }],
    });
    renderPage('sessions');
    await screen.findByText('Agent One');
    expect(screen.getByText('production')).toBeTruthy();
    expect(screen.queryByText('text_demo')).toBeNull();
    expect(screen.getByRole('columnheader', { name: 'Traffic' })).toBeTruthy();
  });

  it('tells the user which tabs do not follow the Traffic filter', async () => {
    install();
    renderPage('events');
    expect(await screen.findByText(/only the period applies/)).toBeTruthy();
  });
});
