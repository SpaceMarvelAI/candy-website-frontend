import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import posthog from 'posthog-js';
import { seedChatMessages } from '../utils/mockData';
import { loadStoredUser, logout as apiLogout, fullLogout, ssoCallback, type AuthUser } from '../api/auth';
import { themeStore } from '../hooks/useTheme';
import { logger } from '../utils/logger';
import { PENDING_PROMPT_TICKET_KEY } from '../utils/sso';
import { claimPromptTicket, type ClaimedPrompt } from '../api/prompts';

// Bidirectional mapping between legacy view names and URL paths.
// All existing showView('dashboard') calls keep working unchanged.
const VIEW_TO_PATH: Record<string, string> = {
  auth:           '/auth',
  dashboard:      '/dashboard',
  chatbots:       '/chatbots',
  live:           '/live',
  hrchat:         '/hrchat',
  ecommerce:      '/agents/ecommerce',
  financial:      '/agents/financial',
  logistics:      '/agents/logistics',
  healthcare:     '/agents/healthcare',
  marketing:      '/agents/marketing',
  hr:             '/agents/hr',
  chatbot_cs:     '/chatbots/cs',
  chatbot_tech:   '/chatbots/tech',
  chatbot_health: '/chatbots/health',
  chatbot_bank:   '/chatbots/bank',
  chatbot_appt:   '/chatbots/appt',
  chatbot_hr:     '/chatbots/hr',
  connects:       '/connects',
};

const PATH_TO_VIEW: Record<string, string> = Object.fromEntries(
  Object.entries(VIEW_TO_PATH).map(([k, v]) => [v, k])
);

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const navigate = useNavigate();
  const location = useLocation();

  const initialUser = (typeof window !== 'undefined') ? loadStoredUser() : null;
  logger.info('[AppContext] Initialising', { hasStoredUser: !!initialUser, pathname: typeof window !== 'undefined' ? window.location.pathname : '(ssr)' });

  // True while we are processing an incoming ?sso_token — suppresses the
  // signup popup so it doesn't flash before the SSO call resolves.
  const hasSsoToken = typeof window !== 'undefined' && (() => {
    const p = new URLSearchParams(window.location.search);
    return p.has('sso_token') || p.has('token') || p.has('access_token');
  })();

  const [user, setUser]                = useState<AuthUser | null>(initialUser);
  const [ssoLoading, setSsoLoading]    = useState(hasSsoToken);
  const [activeNav,   setActiveNav]    = useState('dashboard');
  const [chatMessages,setChatMessages] = useState(seedChatMessages);
  const [calls,       setCalls]        = useState([]);
  const [toasts,      setToasts]       = useState([]);
  const [claimedPrompt, setClaimedPrompt] = useState<ClaimedPrompt | null>(null);
  // True from the moment a ticket is detected in the OIDC redirect until the claim
  // resolves (success or failure). RootRedirect must not navigate to /dashboard while
  // this is true — otherwise it fires the instant `user` becomes truthy (before the
  // claim below even starts), unmounting everything before the picker can show.
  const [claimingPrompt, setClaimingPrompt] = useState(false);
  const ssoHandled = useRef(false);

  // currentView is now derived from the URL — no separate state needed.
  const currentView = PATH_TO_VIEW[location.pathname] ?? 'dashboard';

  const showView = useCallback((name: string) => {
    const path = VIEW_TO_PATH[name] ?? '/dashboard';
    logger.info('[AppContext] showView', { name, resolvedPath: path });
    navigate(path);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [navigate]);

  const addToast = useCallback((msg: string, kind = 'success', opts?: { skipCapture?: boolean }) => {
    const id = Date.now() + Math.random();
    logger.debug('[AppContext] addToast', { msg, kind });
    if (kind === 'error' && !opts?.skipCapture) {
      // Single, app-wide capture point for user-facing failures — covers every
      // component that calls addToast(msg, 'error') without needing its own
      // posthog.capture() call site. Callers that already fire a more specific,
      // richer event for the same failure (e.g. TestPanel's mic/TTS errors) pass
      // skipCapture to avoid double-counting the same failure under two names.
      posthog.capture('error_toast_shown', { message: msg });
    }
    setToasts(prev => [...prev, { id, msg, kind }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3100);
  }, []);

  const signedIn = useCallback((u: AuthUser) => {
    logger.info('[AppContext] signedIn', { userId: u.user_id, email: u.email, role: u.role, company: u.company_name });
    themeStore.set('light');
    setUser(u);
    // If there's a pending prompt ticket, don't navigate — let PromptTicketHandler handle it
    const pendingTicket = sessionStorage.getItem(PENDING_PROMPT_TICKET_KEY);
    if (!pendingTicket) {
      navigate('/dashboard');
    }
  }, [navigate]);

  const signOut = useCallback(async () => {
    logger.info('[AppContext] signOut — full single-logout');
    // Clear UI state immediately so the app looks logged out right away.
    setUser(null);
    // Clears PostHog's distinct_id + group state — otherwise the next person to use
    // this browser/device gets misattributed to the previous user/company.
    posthog.reset();
    // fullLogout() calls the backend logout-everywhere (blocklist + broadcast + token revoke),
    // wipes local tokens, and navigates the browser to end_session_url to clear the dashboard
    // cookie. It needs the token, so it captures it before wiping. Best-effort.
    try {
      await fullLogout();
      return; // fullLogout redirects the browser; nothing more to do
    } catch (err) {
      logger.warn('[AppContext] fullLogout failed — clearing local state and going home', { error: err });
    }
    // Fallback if fullLogout threw before redirecting: wipe + go home.
    try { sessionStorage.clear(); } catch {}
    try {
      localStorage.removeItem('candy.token');
      localStorage.removeItem('candy.user');
      localStorage.removeItem('dashboard_token');
    } catch {}
    navigate('/', { replace: true });
  }, [navigate]);

  // Clear user + redirect to SSO when the API client fires a 401
  useEffect(() => {
    function onAuthExpired() {
      logger.warn('[AppContext] candy:auth-expired event received — clearing user state');
      setUser(null);
    }
    window.addEventListener('candy:auth-expired', onAuthExpired);
    return () => window.removeEventListener('candy:auth-expired', onAuthExpired);
  }, []);

  // Intercept ?sso_token= / ?access_token= on ANY page (SpaceMarvel may redirect to /dashboard).
  // CONFIRMED (via live console trace) to be the ONLY code path that actually runs the OIDC
  // login exchange on a real page load — the backend redirects to a plain path
  // (https://app.candy.cx/sso/oidc/callback?...) with no "#", so HashRouter never resolves
  // to OIDCCallbackPage's route on that hard load; it resolves to "/" and this
  // app-root-level effect (which reads window.location.search directly, unrouted) is what
  // actually processes the token. OIDCCallbackPage is therefore dead code for this flow.
  useEffect(() => {
    if (ssoHandled.current) return;

    const params      = new URLSearchParams(window.location.search);
    const token       = params.get('token') ?? params.get('sso_token') ?? params.get('access_token') ?? null;
    const accessToken = params.get('access_token');
    // Capture the ticket BEFORE the URL gets stripped below — reading it afterward (as a
    // previous version of this code did, further down) always found nothing, since the
    // query string was already gone by then. This was the actual reason "Open in Candy"
    // silently failed: the ticket that arrived in this exact URL never reached the claim.
    const ticketFromUrl = params.get('ticket');

    if (!token && !accessToken) return;

    ssoHandled.current = true;
    logger.info('[AppContext] SSO token detected — beginning exchange', {
      hasToken: !!token,
      hasAccessToken: !!accessToken,
      hasTicket: !!ticketFromUrl,
    });
    // Strip all auth params from URL immediately so they can't be replayed. Keep
    // window.location.hash — this is a HashRouter app, so the current route (e.g.
    // "#/dashboard") lives there; dropping it would revert the visible URL to the
    // bare origin even though the app is still on that page.
    window.history.replaceState({}, '', window.location.pathname + window.location.hash);

    // Wipe previous session before writing new credentials
    apiLogout();
    localStorage.removeItem('dashboard_token');

    // Always persist the SpaceMarvel bearer — needed for Composio / cross-app SSO generate calls
    if (accessToken) localStorage.setItem('dashboard_token', accessToken);

    // No exchange token — redirect only carried a fresh dashboard_token for an already-signed-in user.
    if (!token) { setSsoLoading(false); return; }

    // Set BEFORE setUser() below — RootRedirect reads this on the very next render
    // (the same one where `user` first becomes truthy) and must see it already true,
    // or it navigates to /dashboard before the claim call even starts.
    if (ticketFromUrl) setClaimingPrompt(true);

    ssoCallback(token)
      .then(({ user: u }) => {
        logger.info('[AppContext] SSO exchange succeeded', { userId: u.user_id, email: u.email });
        themeStore.set('light');
        setUser(u);
        posthog.identify(u.user_id, { email: u.email, name: u.full_name });
        if (u.company_id) posthog.group('company', u.company_id, { name: u.company_name });

        // Claim the ticket directly, right here, right after login succeeds — this is the
        // exact instant auth is confirmed complete, so there's no separate component/effect
        // that needs to "notice" a state change later and risk racing a navigate() elsewhere.
        if (ticketFromUrl) {
          claimPromptTicket(ticketFromUrl)
            .then((data) => {
              logger.info('[AppContext] claimed prompt ticket', {
                promptId: data.prompt_id,
                matches: data.matching_agents.length,
              });
              setClaimedPrompt(data);
            })
            .catch((err) => {
              logger.warn('[AppContext] prompt ticket claim failed', { error: err });
              addToast('That prompt link is invalid or has expired.', 'error');
              navigate('/dashboard', { replace: true });
            })
            .finally(() => setClaimingPrompt(false));
        } else {
          navigate('/dashboard', { replace: true });
        }
      })
      .catch((err: any) => {
        const msg = err?.detail
          ? (typeof err.detail === 'string' ? err.detail : err.detail?.detail)
          : err?.message;
        logger.error('[AppContext] SSO exchange failed', { err, message: msg });
        addToast('SSO sign-in failed: ' + (msg || 'invalid or expired token'), 'error');
      })
      .finally(() => {
        setSsoLoading(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AppContext.Provider value={{
      user, signedIn, signOut,
      ssoLoading,
      currentView, showView,
      activeNav, setActiveNav,
      chatMessages, setChatMessages,
      calls, setCalls,
      toasts, addToast,
      claimedPrompt, setClaimedPrompt,
      claimingPrompt,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
