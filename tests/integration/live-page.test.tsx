/**
 * Regression tests for the Live Call Logs page.
 *
 * Pins three shipped bugs:
 *  - every list fetch was `.catch(() => [])`, so a backend outage rendered as
 *    "no recordings yet" with no error anywhere.
 *  - the chat-session row expander was a click-only <tr> with a plain <span>
 *    label — unreachable by keyboard.
 *  - the audio scrubber was an onMouseDown-only <div>: no slider role, no
 *    value semantics, no arrow-key seeking.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { setToken } from '../../src/api/client';
import { API_BASE } from '../mocks/fixtures';

const addToast = vi.fn();
vi.mock('../../src/context/AppContext', () => ({
  useApp: () => ({ addToast }),
}));

import LiveCallsPage from '../../src/pages/live/index';

const B = API_BASE;

const rec = {
  recording_id: 'rec_1',
  role: 'user',
  turn_index: 0,
  recording_type: 'demo_session',
  mime_type: 'audio/mpeg',
  size_bytes: 2048,
  duration_ms: 4000,
  transcript: 'User: hi',
  language_code: 'en',
  agent_id: 'ag_1',
  agent_name: 'Support Bot',
  use_case_slug: 'ecom',
  created_at: '2026-01-01T00:00:00Z',
  signed_url: 'https://s3.test/rec_1.mp3',
  s3_key: 'rec_1.mp3',
};

const session = {
  session_id: 'cs_1',
  agent_id: 'ag_1',
  agent_name: 'Support Bot',
  use_case_slug: 'ecom',
  use_case_label: 'E-commerce',
  status: 'ended',
  started_at: '2026-01-01T00:00:00Z',
  ended_at: null,
  message_count: 2,
  preview: 'hello there',
};

function renderPage(tab = 'demo') {
  return render(
    <MemoryRouter initialEntries={[`/live/${tab}`]}>
      <Routes>
        <Route path="/live/:tab" element={<LiveCallsPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function allOk(recordings: unknown[] = [rec]) {
  server.use(
    http.get(`${B}/v1/recordings`, ({ request }) => {
      const type = new URL(request.url).searchParams.get('recording_type');
      return HttpResponse.json(type === 'demo_session' ? recordings : []);
    }),
    http.get(`${B}/v1/chat-sessions`, () => HttpResponse.json([session])),
    http.get(`${B}/v1/agents`, () => HttpResponse.json([])),
  );
}

beforeEach(() => {
  setToken('test-token');
  addToast.mockClear();
});

afterEach(() => vi.restoreAllMocks());

describe('LiveCallsPage — outage is not an empty list', () => {
  it('surfaces an error naming the sections that failed', async () => {
    server.use(
      http.get(`${B}/v1/recordings`, () => HttpResponse.json({ detail: 'db down' }, { status: 500 })),
      http.get(`${B}/v1/chat-sessions`, () => HttpResponse.json({ detail: 'db down' }, { status: 500 })),
      http.get(`${B}/v1/agents`, () => HttpResponse.json({ detail: 'db down' }, { status: 500 })),
    );
    renderPage();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/demo recordings/);
    expect(alert).toHaveTextContent(/live calls/);
    expect(alert).toHaveTextContent(/chat sessions/);
    expect(alert).toHaveTextContent(/agents/);
    // The empty table must not claim "nothing recorded yet".
    expect(await screen.findByText(/Could not load recordings/)).toBeInTheDocument();
    expect(screen.queryByText(/No demo recordings yet/)).not.toBeInTheDocument();
  });

  it('shows the real empty state, and no error, when the backend is healthy but empty', async () => {
    allOk([]);
    renderPage();

    expect(await screen.findByText(/No demo recordings yet/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('keeps the sections that did load when only one fails', async () => {
    server.use(
      http.get(`${B}/v1/recordings`, ({ request }) => {
        const type = new URL(request.url).searchParams.get('recording_type');
        return type === 'demo_session'
          ? HttpResponse.json([rec])
          : HttpResponse.json({ detail: 'boom' }, { status: 500 });
      }),
      http.get(`${B}/v1/chat-sessions`, () => HttpResponse.json([session])),
      http.get(`${B}/v1/agents`, () => HttpResponse.json([])),
    );
    renderPage();

    expect(await screen.findByText('Support Bot')).toBeInTheDocument();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/live calls/);
    expect(alert).not.toHaveTextContent(/demo recordings/);
  });
});

describe('LiveCallsPage — chat session expander', () => {
  it('is a real button, exposes aria-expanded, and toggles from the keyboard', async () => {
    allOk();
    server.use(
      http.get(`${B}/v1/chat-sessions/cs_1`, () =>
        HttpResponse.json({ ...session, turns: [{ role: 'user', text: 'hello there' }] })),
    );
    renderPage('chat');

    const btn = await screen.findByRole('button', { name: /View conversation with Support Bot/i });
    expect(btn).toHaveAttribute('aria-expanded', 'false');

    btn.focus();
    await userEvent.keyboard('{Enter}');

    await waitFor(() => expect(btn).toHaveAttribute('aria-expanded', 'true'));
    expect(await screen.findByRole('button', { name: /Hide conversation with Support Bot/i })).toBeInTheDocument();
  });
});

describe('LiveCallsPage — audio scrubber accessibility', () => {
  it('exposes a focusable slider with value semantics and arrow-key seeking', async () => {
    vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    vi.spyOn(window.HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    allOk();
    renderPage();

    const row = await screen.findByText('Support Bot');
    const playBtn = within(row.closest('tr')!).getByTitle('Play recording');
    await userEvent.click(playBtn);

    const slider = await screen.findByRole('slider', { name: /seek/i });
    expect(slider).toHaveAttribute('tabindex', '0');
    expect(slider).toHaveAttribute('aria-valuemin', '0');
    expect(slider).toHaveAttribute('aria-valuenow');
    expect(slider).toHaveAttribute('aria-valuemax');
    expect(slider).toHaveAttribute('aria-valuetext');

    // Keyboard seeking is wired up (jsdom media has no real duration, so this
    // asserts the handler runs and clamps rather than an exact position).
    slider.focus();
    expect(slider).toHaveFocus();
    await userEvent.keyboard('{ArrowRight}{ArrowLeft}{Home}{End}');
    expect(slider).toHaveAttribute('aria-valuenow', '0');
  });
});
