import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import AmbientBg   from './components/AmbientBg';
import ToastHost   from './components/Toast';
import AppLayout   from './layouts/AppLayout';
import { redirectToSSO } from './utils/sso';
import { useApp } from './context/AppContext';


const LandingPage     = lazy(() => import('./pages/landing'));
const SSOCallbackPage = lazy(() => import('./pages/sso'));

// App-layout pages
const DashboardPage  = lazy(() => import('./pages/dashboard'));
const LiveCallsPage  = lazy(() => import('./pages/live'));
const HRFlowPage     = lazy(() => import('./pages/hrflow'));
const AnalyticsPage  = lazy(() => import('./pages/analytics'));
const WebhooksPage   = lazy(() => import('./pages/webhooks'));
const FlowsPage      = lazy(() => import('./pages/flows'));
const ChatbotsPage   = lazy(() => import('./pages/chatbots'));

// Chatbot workspaces
const ChatbotCS      = lazy(() => import('./pages/chatbot-cs'));
const ChatbotTech    = lazy(() => import('./pages/chatbot-tech'));
const ChatbotHealth  = lazy(() => import('./pages/chatbot-health'));
const ChatbotBank    = lazy(() => import('./pages/chatbot-bank'));
const ChatbotAppt    = lazy(() => import('./pages/chatbot-appt'));
const ChatbotHR      = lazy(() => import('./pages/chatbot-hr'));

// Voice agent workspaces
const EcommerceAgent  = lazy(() => import('./pages/ecommerce'));
const FinancialAgent  = lazy(() => import('./pages/financial'));
const LogisticsAgent  = lazy(() => import('./pages/logistics'));
const HealthcareAgent = lazy(() => import('./pages/healthcare'));
const MarketingAgent  = lazy(() => import('./pages/marketing'));
const HRAgent         = lazy(() => import('./pages/hr'));

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

function RootRedirect() {
  const { user } = useApp();
  if (user) return <Navigate to="/dashboard" replace />;
  return (
    <div style={{ position: 'relative', zIndex: 1, minHeight: '100vh' }}>
      <LandingPage />
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user } = useApp();
  if (!user) {
    redirectToSSO();
    return null;
  }
  return <>{children}</>;
}

function WithLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ position: 'relative', zIndex: 1 }}>
      <AppLayout>{children}</AppLayout>
    </div>
  );
}

export default function App() {
  return (
    <>
      <AmbientBg />
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

          {/* App views — rendered inside AppLayout (sidebar + topbar) */}
          <Route path="/dashboard"      element={<ProtectedRoute><WithLayout><DashboardPage /></WithLayout></ProtectedRoute>} />
          <Route path="/live"           element={<Navigate to="/live/demo" replace />} />
          <Route path="/live/:tab"      element={<ProtectedRoute><WithLayout><LiveCallsPage /></WithLayout></ProtectedRoute>} />
          <Route path="/hrchat"         element={<ProtectedRoute><WithLayout><HRFlowPage /></WithLayout></ProtectedRoute>} />
          <Route path="/analytics"      element={<Navigate to="/analytics/summary" replace />} />
          <Route path="/analytics/:tab" element={<ProtectedRoute><WithLayout><AnalyticsPage /></WithLayout></ProtectedRoute>} />
          <Route path="/webhooks"       element={<ProtectedRoute><WithLayout><WebhooksPage /></WithLayout></ProtectedRoute>} />
          <Route path="/flows"          element={<ProtectedRoute><WithLayout><FlowsPage /></WithLayout></ProtectedRoute>} />

          {/* Chatbots landing — must be listed before /chatbots/* sub-routes */}
          <Route path="/chatbots"        element={<ProtectedRoute><WithLayout><ChatbotsPage /></WithLayout></ProtectedRoute>} />

          {/* Chatbot workspaces — full-screen, no sidebar */}
          <Route path="/chatbots/cs"     element={<ProtectedRoute><ChatbotCS /></ProtectedRoute>} />
          <Route path="/chatbots/tech"   element={<ProtectedRoute><ChatbotTech /></ProtectedRoute>} />
          <Route path="/chatbots/health" element={<ProtectedRoute><ChatbotHealth /></ProtectedRoute>} />
          <Route path="/chatbots/bank"   element={<ProtectedRoute><ChatbotBank /></ProtectedRoute>} />
          <Route path="/chatbots/appt"   element={<ProtectedRoute><ChatbotAppt /></ProtectedRoute>} />
          <Route path="/chatbots/hr"     element={<ProtectedRoute><ChatbotHR /></ProtectedRoute>} />

          {/* Voice agent workspaces — full-screen, no sidebar */}
          <Route path="/agents/ecommerce"  element={<ProtectedRoute><EcommerceAgent /></ProtectedRoute>} />
          <Route path="/agents/financial"  element={<ProtectedRoute><FinancialAgent /></ProtectedRoute>} />
          <Route path="/agents/logistics"  element={<ProtectedRoute><LogisticsAgent /></ProtectedRoute>} />
          <Route path="/agents/healthcare" element={<ProtectedRoute><HealthcareAgent /></ProtectedRoute>} />
          <Route path="/agents/marketing"  element={<ProtectedRoute><MarketingAgent /></ProtectedRoute>} />
          <Route path="/agents/hr"         element={<ProtectedRoute><HRAgent /></ProtectedRoute>} />

          {/* Fallback — unknown paths go back to landing */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      <ToastHost />
    </>
  );
}
