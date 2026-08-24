/**
 * Regression tests for the Webhooks page.
 *
 * Pins four previously-shipped bugs:
 *  - jsonb `event_types` arriving as a raw JSON string used to white-screen the
 *    table (`.slice(0,3).map()` on a string) and the delete confirm (`.join()`).
 *  - the row/deliveries pair was emitted as a keyless `<>` fragment, so React
 *    reconciled expand/collapse rows by position.
 *  - PATCH returns a partial webhook; substituting it wholesale wiped the
 *    Created / delivery columns until a reload.
 *  - the event-type selector was a <label> wrapping click-only <div>/<span>,
 *    so keyboard users could not select events at all.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { ConfirmProvider } from '../../src/components/ConfirmDialog';
import { setToken } from '../../src/api/client';
import { API_BASE } from '../mocks/fixtures';

const addToast = vi.fn();
vi.mock('../../src/context/AppContext', () => ({
  useApp: () => ({ addToast }),
}));

import WebhooksPage from '../../src/pages/webhooks/index';

const B = API_BASE;

// The backend returns event_types as a raw jsonb string (no asyncpg codec).
const rawWebhook = {
  id: 'wh_00000001',
  url: 'https://example.com/hook',
  event_types: '["session.started","session.ended","turn.completed","agent.published"]',
  description: 'primary',
  is_active: true,
  total_delivered: 42,
  last_success_at: '2026-01-02T03:04:05Z',
  last_failure_at: null,
  created_at: '2026-01-01T00:00:00Z',
};

beforeEach(() => {
  setToken('test-token');
  addToast.mockClear();
  server.use(
    http.get(`${B}/v1/webhooks`, () => HttpResponse.json([rawWebhook])),
    http.get(`${B}/v1/webhooks/:id/deliveries`, () => HttpResponse.json([])),
  );
});

afterEach(() => vi.restoreAllMocks());

describe('WebhooksPage — jsonb event_types', () => {
  it('renders the event pills without crashing when event_types is a JSON string', async () => {
    render(<ConfirmProvider><WebhooksPage /></ConfirmProvider>);
    expect(await screen.findByText('session.started')).toBeInTheDocument();
    expect(screen.getByText('session.ended')).toBeInTheDocument();
    expect(screen.getByText('turn.completed')).toBeInTheDocument();
    // only the first three pills render; the rest collapse into "+N more"
    expect(screen.getByText('+1 more')).toBeInTheDocument();
  });

  it('lists the event types in the delete confirmation instead of throwing', async () => {
    // Was a window.confirm() spy. Deletes now use the in-app ConfirmDialog, so
    // this asserts the rendered dialog — which still proves .join() on the jsonb
    // string no longer throws.
    render(<ConfirmProvider><WebhooksPage /></ConfirmProvider>);
    await screen.findByText('session.started');
    await userEvent.click(screen.getByTitle('Delete webhook'));

    const dialog = await screen.findByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.textContent).toContain(
      'session.started, session.ended, turn.completed, agent.published',
    );
    // Cancel exists as the safe default, so Return cannot delete.
    expect(within(dialog).getByRole('button', { name: /cancel/i })).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: /delete webhook/i })).toBeTruthy();
  });
});

describe('WebhooksPage — event selector accessibility', () => {
  it('exposes each event as a keyboard-operable checkbox', async () => {
    render(<ConfirmProvider><WebhooksPage /></ConfirmProvider>);
    await screen.findByText('session.started');
    await userEvent.click(screen.getByTitle('Edit webhook'));

    const boxes = await screen.findAllByRole('checkbox');
    expect(boxes).toHaveLength(7);
    // Seeded from the (normalised) existing subscription.
    expect(boxes[0]).toHaveAttribute('aria-checked', 'true');
    expect(boxes[4]).toHaveAttribute('aria-checked', 'true'); // agent.published
    expect(boxes[5]).toHaveAttribute('aria-checked', 'false');

    boxes[5].focus();
    expect(boxes[5]).toHaveFocus();
    await userEvent.keyboard(' ');
    expect(boxes[5]).toHaveAttribute('aria-checked', 'true');
    await userEvent.keyboard('{Enter}');
    expect(boxes[5]).toHaveAttribute('aria-checked', 'false');
  });
});

describe('WebhooksPage — saving a partial PATCH response', () => {
  it('keeps columns the PATCH response omits (created_at)', async () => {
    // PATCH echoes back only id/url/event_types/is_active/description.
    server.use(http.patch(`${B}/v1/webhooks/wh_00000001`, () => HttpResponse.json({
      id: 'wh_00000001',
      url: 'https://example.com/hook2',
      event_types: '["session.started"]',
      is_active: true,
      description: 'primary',
    })));

    render(<ConfirmProvider><WebhooksPage /></ConfirmProvider>);
    await screen.findByText('session.started');

    const createdBefore = screen.getByRole('row', { name: /example\.com\/hook/ });
    const createdCell = within(createdBefore).getByText(new Date(rawWebhook.created_at).toLocaleString());
    expect(createdCell).toBeInTheDocument();

    await userEvent.click(screen.getByTitle('Edit webhook'));
    await userEvent.click(screen.getByRole('button', { name: /Update Webhook/ }));

    await waitFor(() => expect(screen.getByText('https://example.com/hook2')).toBeInTheDocument());
    // created_at is absent from the PATCH payload — it must survive the merge.
    expect(screen.getByText(new Date(rawWebhook.created_at).toLocaleString())).toBeInTheDocument();
  });
});

describe('WebhooksPage — ping honesty', () => {
  it('reports the ping as queued, not delivered', async () => {
    server.use(http.post(`${B}/v1/webhooks/wh_00000001/ping`, () =>
      HttpResponse.json({ queued: true, event_type: 'ping' })));

    render(<ConfirmProvider><WebhooksPage /></ConfirmProvider>);
    await screen.findByText('session.started');
    await userEvent.click(screen.getByTitle('Ping webhook'));

    await waitFor(() => expect(addToast).toHaveBeenCalled());
    const [msg, kind] = addToast.mock.calls[0];
    expect(msg).toMatch(/queued/i);
    expect(msg).not.toMatch(/sent|delivered/i);
    expect(kind).not.toBe('success');
  });
});
