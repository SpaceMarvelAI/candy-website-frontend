import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { seedChatMessages } from '../utils/mockData';
import { loadStoredUser, logout as apiLogout, fullLogout, ssoCallback, type AuthUser } from '../api/auth';
import { themeStore } from '../hooks/useTheme';
import { logger } from '../utils/logger';

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
  const ssoHandled = useRef(false);

  // currentView is now derived from the URL — no separate state needed.
  const currentView = PATH_TO_VIEW[location.pathname] ?? 'dashboard';

  const showView = useCallback((name: string) => {
    const path = VIEW_TO_PATH[name] ?? '/dashboard';
    logger.info('[AppContext] showView', { name, resolvedPath: path });
    navigate(path);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [navigate]);

  const addToast = useCallback((msg: string, kind = 'success') => {
    const id = Date.now() + Math.random();
    logger.debug('[AppContext] addToast', { msg, kind });
    setToasts(prev => [...prev, { id, msg, kind }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3100);
  }, []);

  const signedIn = useCallback((u: AuthUser) => {
    logger.info('[AppContext] signedIn', { userId: u.user_id, email: u.email, role: u.role, company: u.company_name });
    themeStore.set('light');
    setUser(u);
    navigate('/healthcare');
  }, [navigate]);

  const signOut = useCallback(async () => {
    logger.info('[AppContext] signOut — full single-logout');
    // Clear UI state immediately so the app looks logged out right away.
    setUser(null);
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

  // Intercept ?sso_token= / ?access_token= on ANY page (SpaceMarvel may redirect to /dashboard)
  useEffect(() => {
    if (ssoHandled.current) return;
    const params      = new URLSearchParams(window.location.search);
    const token       = params.get('token') ?? params.get('sso_token') ?? params.get('access_token') ?? null;
    const accessToken = params.get('access_token');

    if (!token && !accessToken) return;

    ssoHandled.current = true;
    logger.info('[AppContext] SSO token detected — beginning exchange', {
      hasToken: !!token,
      hasAccessToken: !!accessToken,
    });
    // Strip all auth params from URL immediately so they can't be replayed
    window.history.replaceState({}, '', window.location.pathname);

    // Wipe previous session before writing new credentials
    apiLogout();
    localStorage.removeItem('dashboard_token');

    // Always persist the SpaceMarvel bearer — needed for Composio / cross-app SSO generate calls
    if (accessToken) localStorage.setItem('dashboard_token', accessToken);

    // No exchange token — redirect only carried a fresh dashboard_token for an already-signed-in user.
    if (!token) { setSsoLoading(false); return; }

    ssoCallback(token)
      .then(({ user: u }) => {
        logger.info('[AppContext] SSO exchange succeeded', { userId: u.user_id, email: u.email });
        themeStore.set('light');
        setUser(u);
        navigate('/healthcare', { replace: true });
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
