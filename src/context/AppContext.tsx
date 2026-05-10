import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { seedChatMessages } from '../utils/mockData';
import { loadStoredUser, logout as apiLogout, type AuthUser } from '../api/auth';
import { getToken } from '../api/client';

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
};

const PATH_TO_VIEW: Record<string, string> = Object.fromEntries(
  Object.entries(VIEW_TO_PATH).map(([k, v]) => [v, k])
);

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const navigate = useNavigate();
  const location = useLocation();

  const initialUser = (typeof window !== 'undefined') ? loadStoredUser() : null;

  const [user, setUser]                = useState<AuthUser | null>(initialUser);
  const [activeNav,   setActiveNav]    = useState('dashboard');
  const [chatMessages,setChatMessages] = useState(seedChatMessages);
  const [calls,       setCalls]        = useState([]);
  const [toasts,      setToasts]       = useState([]);

  // currentView is now derived from the URL — no separate state needed.
  const currentView = PATH_TO_VIEW[location.pathname] ?? 'dashboard';

  const showView = useCallback((name: string) => {
    const path = VIEW_TO_PATH[name] ?? '/dashboard';
    navigate(path);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [navigate]);

  const addToast = useCallback((msg: string, kind = 'success') => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, msg, kind }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3100);
  }, []);

  const signedIn = useCallback((u: AuthUser) => {
    setUser(u);
    navigate('/dashboard');
  }, [navigate]);

  const signOut = useCallback(() => {
    apiLogout();
    setUser(null);
    navigate('/auth');
  }, [navigate]);

  // Redirect to login when there's no authenticated user.
  useEffect(() => {
    if (!user && location.pathname !== '/auth') {
      navigate('/auth', { replace: true });
    }
  }, [user, location.pathname, navigate]);

  // The API client fires this event on any 401 response.
  useEffect(() => {
    function onAuthExpired() {
      setUser(null);
      addToast('Your session expired — please sign in again.', 'error');
      navigate('/auth', { replace: true });
    }
    window.addEventListener('candy:auth-expired', onAuthExpired);
    return () => window.removeEventListener('candy:auth-expired', onAuthExpired);
  }, [addToast, navigate]);

  return (
    <AppContext.Provider value={{
      user, signedIn, signOut,
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
