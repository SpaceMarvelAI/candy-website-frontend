import {
  createContext, useContext, useState, useCallback, useEffect, useMemo, useRef,
  type Dispatch, type ReactNode, type SetStateAction,
} from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import posthog from 'posthog-js';
import { loadStoredUser, logout as apiLogout, fullLogout, ssoCallback, type AuthUser } from '../api/auth';
import { themeStore } from '../hooks/useTheme';
import { addToast, type AddToast } from '../hooks/useToast';
import { logger } from '../utils/logger';
import { errorMessage } from '../utils/apiError';
import { PENDING_PROMPT_TICKET_KEY } from '../utils/sso';
import { claimPromptTicket, type ClaimedPrompt } from '../api/prompts';

// Bidirectional mapping between legacy view names and URL paths.
// All existing showView('dashboard') calls keep working unchanged.
const VIEW_TO_PATH: Record<string, string> = {
  auth:           '/auth',
  healthcare_domain: '/healthcare',
  dashboard:      '/healthcare',   // legacy alias → healthcare domain
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

/** One turn in the HR demo chat (src/pages/hrflow/ChatPanel.tsx). `role: 'typing'`
 *  is a placeholder bubble with no text, hence the optional fields. */
export interface ChatMessage {
  role:  'ai' | 'user' | 'typing';
  text?: string;
  time?: string;
  file?: { name: string; size: string };
}

export interface AppContextValue {
  user:             AuthUser | null;
  signedIn:         (u: AuthUser) => void;
  signOut:          () => Promise<void>;
  /** Sign-out is in flight. Consumers use this to disable the control and to
   *  suppress any auth redirect that would otherwise re-trigger SSO login. */
  signingOut:       boolean;
  ssoLoading:       boolean;
  currentView:      string;
  showView:         (name: string) => void;
  activeNav:        string;
  setActiveNav:     Dispatch<SetStateAction<string>>;
  chatMessages:     ChatMessage[];
  setChatMessages:  Dispatch<SetStateAction<ChatMessage[]>>;
  /** Stable module-level function — see src/hooks/useToast.ts. The toast queue
   *  itself is deliberately NOT on this context; read it with useToasts(). */
  addToast:         AddToast;
  claimedPrompt:    ClaimedPrompt | null;
  setClaimedPrompt: Dispatch<SetStateAction<ClaimedPrompt | null>>;
  claimingPrompt:   boolean;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
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
  // True from the moment Sign out is clicked until the tab navigates away.
  // ProtectedRoute reads this to suppress the OIDC redirect during sign-out —
  // without it, dropping `user` bounces the browser to the IDP, which still has
  // a live cookie and silently signs the user back in.
  const [signingOut, setSigningOut]    = useState(false);
  // Ref mirror so a second click is rejected synchronously, before React has
  // re-rendered with the new state.
  const signingOutRef                  = useRef(false);
  const [activeNav,   setActiveNav]    = useState('dashboard');
  // Starts empty. This used to be seeded with a fabricated HR conversation from
  // utils/mockData.ts, which every real user saw on their first visit to /hrchat.
  const [chatMessages,setChatMessages] = useState<ChatMessage[]>([]);
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

  const signedIn = useCallback((u: AuthUser) => {
    logger.info('[AppContext] signedIn', { userId: u.user_id, email: u.email, role: u.role, company: u.company_name });
    themeStore.set('light');
    setUser(u);
    // If there's a pending prompt ticket, don't navigate — let PromptTicketHandler handle it
    const pendingTicket = sessionStorage.getItem(PENDING_PROMPT_TICKET_KEY);
    if (!pendingTicket) {
      navigate('/healthcare');
    }
  }, [navigate]);

  /**
   * Sign out in ONE click.
   *
   * The old version called `setUser(null)` first. That re-rendered
   * ProtectedRoute, which saw "no user" and fired `redirectToOIDC()` — sending
   * the browser to the IDP *while* `fullLogout()` was still awaiting the backend
   * call that clears the httpOnly SSO cookie. The IDP therefore still had a live
   * session, auto-reauthenticated, and bounced the user straight back in. That
   * is the "must click sign out twice" bug.
   *
   * The ordering below is load-bearing:
   *   1. latch `signingOut` — ProtectedRoute stops redirecting to the IDP
   *   2. await fullLogout() — backend revoke + full storage wipe FIRST
   *   3. drop the user      — safe now; nothing can auto-reauth
   *   4. exactly ONE navigation, and only if fullLogout() didn't already do it
   */
  const signOut = useCallback(async () => {
    if (signingOutRef.current) {
      logger.info('[AppContext] signOut ignored — already in progress');
      return;
    }
    signingOutRef.current = true;
    setSigningOut(true);
    logger.info('[AppContext] signOut — full single-logout');

    // Clears PostHog's distinct_id + group state — otherwise the next person to
    // use this browser/device gets misattributed to the previous user/company.
    posthog.reset();

    let navigated = false;
    try {
      ({ navigated } = await fullLogout());
    } catch (err) {
      logger.warn('[AppContext] fullLogout failed — clearing local state anyway', { error: err });
      try { localStorage.clear(); } catch {}
      try { sessionStorage.clear(); } catch {}
    }

    setUser(null);

    if (navigated) return;  // fullLogout() is already navigating — don't race it.

    // No end_session_url (backend unreachable, or no SSO session to end). Hard
    // replace rather than an SPA navigate: it drops all in-memory state and boots
    // the app fresh on the signed-out path, so nothing stale can revive the
    // session. `replace` keeps the signed-in page out of history.
    if (typeof window !== 'undefined') {
      window.location.replace(`${window.location.origin}${window.location.pathname}`);
    } else {
      navigate('/', { replace: true });
    }
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
    // Strip all auth params from URL immediately so they can't be replayed. Also reset
    // pathname to '/' — the backend's redirect lands on a real path like /sso/oidc/callback
    // (no "#"), and since this is a HashRouter app that path is never part of routing, just
    // dead weight stuck in the address bar forever (e.g. "/sso/oidc/callback#/healthcare").
    // Keep window.location.hash — that's where the current route (e.g. "#/dashboard")
    // actually lives; dropping it would revert the visible URL to the bare origin even
    // though the app is still on that page.
    window.history.replaceState({}, '', '/' + window.location.hash);

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
    if (ticketFromUrl) {
      setClaimingPrompt(true);
      // This effect owns this ticket now. redirectToOIDC() stashed the SAME single-use
      // ticket in sessionStorage as a cookie-failure fallback, and nothing ever removed
      // it — so on the happy path PromptTicketHandler found it once `user` turned truthy
      // and claimed it a second time, the backend rejected it as already used, and the
      // user got "That prompt link is invalid or has expired." alongside the picker that
      // had just opened correctly (plus an error_toast_shown capture on every success).
      try { sessionStorage.removeItem(PENDING_PROMPT_TICKET_KEY); } catch {}
    }

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
              navigate('/healthcare', { replace: true });
            })
            .finally(() => setClaimingPrompt(false));
        } else {
          navigate('/healthcare', { replace: true });
        }
      })
      .catch((err: unknown) => {
        const msg = errorMessage(err, 'invalid or expired token');
        logger.error('[AppContext] SSO exchange failed', { err, message: msg });
        addToast('SSO sign-in failed: ' + msg, 'error');
      })
      .finally(() => {
        setSsoLoading(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Memoized so a re-render of AppProvider (or, previously, every single toast)
  // doesn't hand ~30 consumers a brand-new object and re-render all of them.
  const value = useMemo<AppContextValue>(() => ({
    user, signedIn, signOut, signingOut,
    ssoLoading,
    currentView, showView,
    activeNav, setActiveNav,
    chatMessages, setChatMessages,
    addToast,
    claimedPrompt, setClaimedPrompt,
    claimingPrompt,
  }), [
    user, signedIn, signOut, signingOut, ssoLoading, currentView, showView,
    activeNav, chatMessages, claimedPrompt, claimingPrompt,
  ]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
