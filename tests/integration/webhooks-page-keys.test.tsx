/**
 * Both `.map()` bodies on the Webhooks page returned a keyless `<>` fragment
 * with the `key` on the inner `<tr>`, so React reconciled the row /
 * expanded-panel pairs BY POSITION — deleting or re-sorting while a row was
 * expanded showed the wrong row's content.
 *
 * React emits its "unique key" warning only ONCE per owner component per
 * module registry, so this assertion lives in its own file: it must be the
 * first render of WebhooksPage in the file, or the warning is already spent.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { setToken } from '../../src/api/client';
import { API_BASE } from '../mocks/fixtures';

vi.mock('../../src/context/AppContext', () => ({ useApp: () => ({ addToast: vi.fn() }) }));

import WebhooksPage from '../../src/pages/webhooks/index';

const B = API_BASE;

beforeEach(() => {
  setToken('test-token');
  server.use(
    http.get(`${B}/v1/webhooks`, () => HttpResponse.json([
      { id: 'wh_a', url: 'https://a.example/hook', event_types: '["session.started"]', is_active: true, created_at: '2026-01-01T00:00:00Z' },
      { id: 'wh_b', url: 'https://b.example/hook', event_types: '["session.ended"]', is_active: true, created_at: '2026-01-02T00:00:00Z' },
    ])),
    http.get(`${B}/v1/webhooks/:id/deliveries`, () => HttpResponse.json([
      { id: 'd1', event_type: 'session.started', status: 'success', http_status: 200, created_at: '2026-01-03T00:00:00Z', response_body: '{"ok":1}' },
      { id: 'd2', event_type: 'session.ended', status: 'failed', http_status: 500, created_at: '2026-01-03T01:00:00Z', response_body: null },
    ])),
  );
});

describe('WebhooksPage — list reconciliation keys', () => {
  it('renders webhook rows and delivery rows without React key warnings', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<WebhooksPage />);

    await screen.findByText('https://a.example/hook');
    // Expand a row so the second keyless map (deliveries) also renders.
    await userEvent.click(screen.getAllByTitle('View deliveries')[1]);
    await screen.findByText('Deliveries (2)');
    await userEvent.click(screen.getAllByText('▼ Detail')[0]);
    await screen.findByText(/"ok"/);

    const keyWarnings = errSpy.mock.calls
      .map(c => String(c[0]))
      .filter(m => m.includes('unique "key"'));
    expect(keyWarnings).toEqual([]);
    errSpy.mockRestore();
  });
});
