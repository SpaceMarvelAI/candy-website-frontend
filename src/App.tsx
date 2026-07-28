import { lazy, Suspense, useEffect, useRef } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import AmbientBg   from './components/AmbientBg';
import ToastHost   from './components/Toast';
import PromptTicketHandler from './components/PromptTicketHandler';
import PromptAgentPickerModal from './components/agent/PromptAgentPickerModal';
import AppLayout   from './layouts/AppLayout';
import { redirectToOIDC, PENDING_PROMPT_TICKET_KEY } from './utils/sso';
import { useApp } from './context/AppContext';
import { RouteErrorBoundary } from './components/ErrorBoundary';
import { logger } from './utils/logger';
import {
  DashboardSkeleton,
  LiveCallsSkeleton,
  AnalyticsSkeleton,
  WebhooksSkeleton,
  FlowsSkeleton,
  ChatbotsSkeleton,
} from './components/PageSkeletons';


const LandingPage      = lazy(() => import('./pages/landing'));
const SSOCallbackPage  = lazy(() => import('./pages/sso'));
const OIDCCallbackPage = lazy(() => import('./pages/sso/oidc-callback'));

// App-layout pages
const DashboardPage  = lazy(() => import('./pages/dashboard'));
const LiveCallsPage  = lazy(() => import('./pages/live'));
const HRFlowPage     = lazy(() => import('./pages/hrflow'));
const AnalyticsPage  = lazy(() => import('./pages/analytics'));
const WebhooksPage   = lazy(() => import('./pages/webhooks'));
const FlowsPage      = lazy(() => import('./pages/flows'));
const ChatbotsPage   = lazy(() => import('./pages/chatbots'));
const HealthcareDomainPage = lazy(() => import('./pages/healthcare-domain'));

// Chatbot workspaces
const ChatbotCS      = lazy(() => import('./pages/chatbot-cs'));
const ChatbotTech    = lazy(() => import('./pages/chatbot-tech'));
const ChatbotHealth  = lazy(() => import('./pages/chatbot-health'));
const ChatbotBank    = lazy(() => import('./pages/chatbot-bank'));
const ChatbotAppt    = lazy(() => import('./pages/chatbot-appt'));
const ChatbotHR      = lazy(() => import('./pages/chatbot-hr'));

const ConnectsPage     = lazy(() => import('./pages/connects'));
const ComposioCallback = lazy(() => import('./pages/composio-callback'));

// Voice agent workspaces
const EcommerceAgent  = lazy(() => import('./pages/ecommerce'));
const FinancialAgent  = lazy(() => import('./pages/financial'));
const LogisticsAgent  = lazy(() => import('./pages/logistics'));
const HealthcareAgent = lazy(() => import('./pages/healthcare'));
const MarketingAgent  = lazy(() => import('./pages/marketing'));
const HRAgent         = lazy(() => import('./pages/hr'));

// Logs every route change so navigation failures are traceable from the console.
// Tracks the previous route + wall-clock time spent on it, in addition to the
// existing pathname/search/hash/state fields (unchanged from before).
function RouteLogger() {
  const location = useLocation();
  const prevRef = useRef<{ pathname: string; enteredAt: number } | null>(null);

  useEffect(() => {
    const now = performance.now();
    const prev = prevRef.current;
    logger.info('[Router] Navigation', {
      from:     prev?.pathname ?? null,
      to:       location.pathname,
      pathname: location.pathname,
      search:   location.search,
      hash:     location.hash,
      state:    location.state,
    });
    if (prev) {
      logger.perf(`[Router] time on ${prev.pathname}`, now - prev.enteredAt);
    }
    prevRef.current = { pathname: location.pathname, enteredAt: now };
  }, [location]);
  return null;
}

function PageLoader() {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        minHeight: '100vh', color: 'var(--text-4)', fontSize: 13,
      }}
    >
      Loading…
    </div>
  );
}

function DefaultContentSkeleton() {
  return (
    <div style={{ padding: '32px 40px 60px' }}>
      <div className="skeleton" style={{ width: '100%', height: 400, borderRadius: 'var(--radius-lg)' }} />
    </div>
  );
}

function RootRedirect() {
  const { user, claimingPrompt } = useApp();
  if (user) {
    // Don't redirect away while a prompt-ticket claim is in flight (AppContext's SSO
    // interceptor is mid-claim) — otherwise this fires the instant `user` becomes truthy,
    // unmounting everything before the claim resolves and the picker modal can render.
    // Also still checked via sessionStorage for the legacy /sso/callback + PromptTicketHandler path.
    const pendingTicket = typeof window !== 'undefined' ? sessionStorage.getItem(PENDING_PROMPT_TICKET_KEY) : null;
    if (!pendingTicket && !claimingPrompt) {
      return <Navigate to="/healthcare" replace />;
    }
  }
  return (
    <div style={{ position: 'relative', zIndex: 1, minHeight: '100vh' }}>
      <LandingPage />
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user } = useApp();
  if (!user) {
    redirectToOIDC();
    return null;
  }
  return <>{children}</>;
}

function WithLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ position: 'relative', zIndex: 1, width: '100%' }}>
      <AppLayout>{children}</AppLayout>
    </div>
  );
}

function AppRoute({
  children, skeleton,
}: {
  children: React.ReactNode;
  skeleton?: React.ReactNode;
}) {
  return (
    <ProtectedRoute>
      <WithLayout>
        <RouteErrorBoundary>
          <Suspense fallback={skeleton ?? <DefaultContentSkeleton />}>
            {children}
          </Suspense>
        </RouteErrorBoundary>
      </WithLayout>
    </ProtectedRoute>
  );
}

export default function App() {
  const { claimedPrompt, setClaimedPrompt } = useApp();
  return (
    <>
      <AmbientBg />
      <RouteLogger />
      <Suspense fallback={<PageLoader />}>
        <Routes>
          {/* Landing — redirects to /dashboard if already signed in */}
          <Route path="/" element={<RootRedirect />} />

          {/* /auth — SSO entry point from SpaceMarvel (?sso_token=…)
              AppContext intercepts the token on any page, so this just
              shows the SSO processing screen while the redirect happens. */}
          <Route path="/auth" element={
            <div style={{ position: 'relative', zIndex: 1, minHeight: '100vh' }}>
              <SSOCallbackPage />
            </div>
          } />

          <Route path="/sso/callback" element={<SSOCallbackPage />} />

          {/* OIDC callback — backend redirects here with the minted Candy token */}
          <Route path="/sso/oidc/callback" element={<OIDCCallbackPage />} />

          {/* Healthcare domain — the primary landing (15 use cases) */}
          <Route path="/healthcare"     element={<AppRoute skeleton={<DashboardSkeleton />}><HealthcareDomainPage /></AppRoute>} />

          {/* App views — rendered inside AppLayout (sidebar + topbar) */}
          {/* Legacy Voice-Bots dashboard now redirects into the healthcare domain */}
          <Route path="/dashboard"      element={<Navigate to="/healthcare" replace />} />
          <Route path="/live"           element={<Navigate to="/live/demo" replace />} />
          <Route path="/live/:tab"      element={<AppRoute skeleton={<LiveCallsSkeleton />}><LiveCallsPage /></AppRoute>} />
          <Route path="/hrchat"         element={<AppRoute><HRFlowPage /></AppRoute>} />
          <Route path="/analytics"      element={<Navigate to="/analytics/summary" replace />} />
          <Route path="/analytics/:tab" element={<AppRoute skeleton={<AnalyticsSkeleton />}><AnalyticsPage /></AppRoute>} />
          <Route path="/webhooks"       element={<AppRoute skeleton={<WebhooksSkeleton />}><WebhooksPage /></AppRoute>} />
          <Route path="/flows"          element={<AppRoute skeleton={<FlowsSkeleton />}><FlowsPage /></AppRoute>} />

          {/* Chatbots landing — must be listed before /chatbots/* sub-routes */}
          <Route path="/chatbots"        element={<AppRoute skeleton={<ChatbotsSkeleton />}><ChatbotsPage /></AppRoute>} />

          {/* Chatbot workspaces — full-screen, no sidebar */}
          <Route path="/chatbots/cs"     element={<ProtectedRoute><RouteErrorBoundary><ChatbotCS /></RouteErrorBoundary></ProtectedRoute>} />
          <Route path="/chatbots/tech"   element={<ProtectedRoute><RouteErrorBoundary><ChatbotTech /></RouteErrorBoundary></ProtectedRoute>} />
          <Route path="/chatbots/health" element={<ProtectedRoute><RouteErrorBoundary><ChatbotHealth /></RouteErrorBoundary></ProtectedRoute>} />
          <Route path="/chatbots/bank"   element={<ProtectedRoute><RouteErrorBoundary><ChatbotBank /></RouteErrorBoundary></ProtectedRoute>} />
          <Route path="/chatbots/appt"   element={<ProtectedRoute><RouteErrorBoundary><ChatbotAppt /></RouteErrorBoundary></ProtectedRoute>} />
          <Route path="/chatbots/hr"     element={<ProtectedRoute><RouteErrorBoundary><ChatbotHR /></RouteErrorBoundary></ProtectedRoute>} />

          {/* Voice agent workspaces — full-screen, no sidebar */}
          <Route path="/agents/ecommerce"  element={<ProtectedRoute><RouteErrorBoundary><EcommerceAgent /></RouteErrorBoundary></ProtectedRoute>} />
          <Route path="/agents/financial"  element={<ProtectedRoute><RouteErrorBoundary><FinancialAgent /></RouteErrorBoundary></ProtectedRoute>} />
          <Route path="/agents/logistics"  element={<ProtectedRoute><RouteErrorBoundary><LogisticsAgent /></RouteErrorBoundary></ProtectedRoute>} />
          <Route path="/agents/healthcare" element={<ProtectedRoute><RouteErrorBoundary><HealthcareAgent /></RouteErrorBoundary></ProtectedRoute>} />
          <Route path="/agents/marketing"  element={<ProtectedRoute><RouteErrorBoundary><MarketingAgent /></RouteErrorBoundary></ProtectedRoute>} />
          <Route path="/agents/hr"         element={<ProtectedRoute><RouteErrorBoundary><HRAgent /></RouteErrorBoundary></ProtectedRoute>} />

          <Route path="/connects"          element={<AppRoute><ConnectsPage /></AppRoute>} />
          <Route path="/composio/callback" element={<Suspense fallback={null}><ComposioCallback /></Suspense>} />

          {/* Fallback — unknown paths go back to landing */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      <PromptTicketHandler />
      {claimedPrompt && (
        <PromptAgentPickerModal
          promptTitle={claimedPrompt.title}
          promptContent={claimedPrompt.content}
          matchingAgents={claimedPrompt.matching_agents}
          onClose={() => setClaimedPrompt(null)}
        />
      )}
      <ToastHost />
    </>
  );
}
