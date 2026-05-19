import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import AmbientBg   from './components/AmbientBg';
import ToastHost   from './components/Toast';
import AppLayout   from './layouts/AppLayout';


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
          {/* App views — rendered inside AppLayout (sidebar + topbar) */}
          <Route path="/dashboard"      element={<WithLayout><DashboardPage /></WithLayout>} />
          <Route path="/live"           element={<Navigate to="/live/demo" replace />} />
          <Route path="/live/:tab"      element={<WithLayout><LiveCallsPage /></WithLayout>} />
          <Route path="/hrchat"         element={<WithLayout><HRFlowPage /></WithLayout>} />
          <Route path="/analytics"      element={<Navigate to="/analytics/summary" replace />} />
          <Route path="/analytics/:tab" element={<WithLayout><AnalyticsPage /></WithLayout>} />
          <Route path="/webhooks"       element={<WithLayout><WebhooksPage /></WithLayout>} />
          <Route path="/flows"          element={<WithLayout><FlowsPage /></WithLayout>} />

          {/* Chatbots landing — must be listed before /chatbots/* sub-routes */}
          <Route path="/chatbots"        element={<WithLayout><ChatbotsPage /></WithLayout>} />

          {/* Chatbot workspaces — full-screen, no sidebar */}
          <Route path="/chatbots/cs"     element={<ChatbotCS />} />
          <Route path="/chatbots/tech"   element={<ChatbotTech />} />
          <Route path="/chatbots/health" element={<ChatbotHealth />} />
          <Route path="/chatbots/bank"   element={<ChatbotBank />} />
          <Route path="/chatbots/appt"   element={<ChatbotAppt />} />
          <Route path="/chatbots/hr"     element={<ChatbotHR />} />

          {/* Voice agent workspaces — full-screen, no sidebar */}
          <Route path="/agents/ecommerce"  element={<EcommerceAgent />} />
          <Route path="/agents/financial"  element={<FinancialAgent />} />
          <Route path="/agents/logistics"  element={<LogisticsAgent />} />
          <Route path="/agents/healthcare" element={<HealthcareAgent />} />
          <Route path="/agents/marketing"  element={<MarketingAgent />} />
          <Route path="/agents/hr"         element={<HRAgent />} />

          {/* Fallback */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Suspense>
      <ToastHost />
    </>
  );
}
