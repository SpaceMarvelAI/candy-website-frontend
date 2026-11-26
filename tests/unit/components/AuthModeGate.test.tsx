// AuthModeGate: with nothing stored and the mode check slow/failed, the app is held on
// "Checking sign-in… / Retry" instead of guessing the Dashboard login (fix spec 2026-11-26).
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/server';
import { AuthModeGate } from '../../../src/components/AuthModeGate';
import { _resetAuthModeCache } from '../../../src/api/standalone';

const BASE = 'http://localhost:8002';

beforeEach(() => _resetAuthModeCache());
afterEach(() => _resetAuthModeCache());

describe('AuthModeGate', () => {
  it('renders the app at once when the mode is already stored', () => {
    localStorage.setItem('candy.auth_mode', JSON.stringify({ mode: 'standalone' }));
    render(<AuthModeGate><div>app</div></AuthModeGate>);
    expect(screen.getByText('app')).toBeInTheDocument();
  });

  it('shows Checking sign-in…, then Retry on failure, then the app once the backend answers', async () => {
    let ok = false;
    server.use(http.get(`${BASE}/v1/auth/mode`, () =>
      ok ? HttpResponse.json({ mode: 'standalone', signup_open: false }) : HttpResponse.json({}, { status: 503 })));
    render(<AuthModeGate><div>app</div></AuthModeGate>);
    expect(screen.getByText('Checking sign-in…')).toBeInTheDocument();
    const retry = await screen.findByRole('button', { name: 'Retry' });
    expect(screen.queryByText('app')).toBeNull();
    ok = true;
    fireEvent.click(retry);
    expect(await screen.findByText('app')).toBeInTheDocument();
  });
});
