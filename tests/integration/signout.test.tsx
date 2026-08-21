/**
 * Regression tests for the "I have to click Sign out twice" bug.
 *
 * The failure was a race, not a missing wipe:
 *   signOut() set user=null FIRST → ProtectedRoute re-rendered, saw no user, and
 *   called redirectToOIDC() *during render* → the browser left for the IDP while
 *   fullLogout() was still awaiting the backend call that clears the httpOnly SSO
 *   cookie → the IDP still had a live session, auto-reauthenticated, and bounced
 *   the user straight back in.
 *
 * What must hold now:
 *   1. one click issues exactly one logout-everywhere call
 *   2. the backend call completes BEFORE the user is dropped
 *   3. a second click while one is in flight is a no-op
 *   4. every storage key is gone afterwards
 *   5. nothing redirects to the IDP while signing out
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { http, HttpResponse, delay } from 'msw';
import { render, screen, act, waitFor } from '@testing-library/react';
import { HashRouter } from 'react-router-dom';
import { server } from '../mocks/server';
import { API_BASE } from '../mocks/fixtures';
import { AppProvider, useApp } from '../../src/context/AppContext';
import { setToken } from '../../src/api/client';

const originalLocation = window.location;

function stubLocation() {
  const loc = {
    ...originalLocation,
    origin: 'http://localhost:3000',
    pathname: '/',
    href: '',
    replace: vi.fn((url: string) => { loc.href = url; }),
    assign: vi.fn(),
  };
  Object.defineProperty(window, 'location', { value: loc, writable: true, configurable: true });
  return loc;
}

/** Minimal harness: shows whether a user is present and exposes signOut. */
function Harness() {
  const { user, signOut, signingOut } = useApp();
  return (
    <div>
      <span data-testid="user">{user ? user.email : 'none'}</span>
      <span data-testid="signing-out">{String(signingOut)}</span>
      <button onClick={() => { void signOut(); }}>Sign out</button>
    </div>
  );
}

function renderApp() {
  return render(
    <HashRouter>
      <AppProvider><Harness /></AppProvider>
    </HashRouter>,
  );
}

beforeEach(() => {
  setToken('live-token');
  sessionStorage.setItem('candy.user', JSON.stringify({
    user_id: 'u1', email: 'a@b.com', role: 'admin',
    company_id: 'c1', company_name: 'Acme', full_name: null,
  }));
});

afterEach(() => {
  Object.defineProperty(window, 'location', { value: originalLocation, writable: true, configurable: true });
});

describe('signOut — one click', () => {
  it('calls logout-everywhere exactly once and wipes all storage', async () => {
    const calls = vi.fn();
    server.use(
      http.post(`${API_BASE}/v1/auth/sso/oidc/logout-everywhere`, () => {
        calls();
        return HttpResponse.json({ end_session_url: 'https://idp.example/logout' });
      }),
    );
    const loc = stubLocation();
    renderApp();

    expect(screen.getByTestId('user').textContent).toBe('a@b.com');

    await act(async () => { screen.getByText('Sign out').click(); });

    await waitFor(() => expect(calls).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByTestId('user').textContent).toBe('none'));
    expect(sessionStorage.getItem('access_token')).toBeNull();
    expect(sessionStorage.getItem('candy.user')).toBeNull();
    // Navigated via replace(), so the signed-in page leaves no history entry.
    expect(loc.replace).toHaveBeenCalledWith('https://idp.example/logout');
  });

  it('ignores extra clicks while sign-out is still in flight', async () => {
    const calls = vi.fn();
    server.use(
      http.post(`${API_BASE}/v1/auth/sso/oidc/logout-everywhere`, async () => {
        calls();
        await delay(40);
        return HttpResponse.json({ end_session_url: 'https://idp.example/logout' });
      }),
    );
    stubLocation();
    renderApp();

    // Three rapid clicks — the impatient-user case that produced this bug report.
    await act(async () => {
      const btn = screen.getByText('Sign out');
      btn.click(); btn.click(); btn.click();
    });

    await waitFor(() => expect(screen.getByTestId('user').textContent).toBe('none'));
    expect(calls).toHaveBeenCalledTimes(1);
  });

  it('latches signingOut for the whole in-flight window', async () => {
    // Hang logout-everywhere so sign-out genuinely cannot complete. Without this
    // the whole flow finishes inside act() and the assertion races it.
    server.use(
      http.post(`${API_BASE}/v1/auth/sso/oidc/logout-everywhere`, async () => {
        await delay('infinite');
        return HttpResponse.json({});
      }),
    );
    stubLocation();
    renderApp();

    expect(screen.getByTestId('signing-out').textContent).toBe('false');

    await act(async () => { screen.getByText('Sign out').click(); });

    // Latched, and stays latched while the backend call is outstanding. This is
    // what stops ProtectedRoute from bouncing to the IDP mid-sign-out, which
    // would silently re-authenticate the user we just logged out.
    expect(screen.getByTestId('signing-out').textContent).toBe('true');
    // The user is still present: we deliberately do NOT drop them before the
    // backend confirms, because dropping them is what triggered the redirect.
    expect(screen.getByTestId('user').textContent).toBe('a@b.com');
  });

  it('still clears local state when logout-everywhere fails', async () => {
    server.use(
      http.post(`${API_BASE}/v1/auth/sso/oidc/logout-everywhere`, () =>
        HttpResponse.json({ detail: 'boom' }, { status: 500 })),
    );
    const loc = stubLocation();
    renderApp();

    await act(async () => { screen.getByText('Sign out').click(); });

    await waitFor(() => expect(screen.getByTestId('user').textContent).toBe('none'));
    expect(sessionStorage.getItem('access_token')).toBeNull();
    // No end_session_url to trust, so we must still leave the signed-in page
    // ourselves rather than stranding the user on it.
    expect(loc.replace).toHaveBeenCalled();
  });
});
