import { Routes, Route, Navigate } from 'react-router-dom';
import AmbientBg from './components/AmbientBg';
import ToastHost from './components/Toast';
import AppLayout from './layouts/AppLayout';

import AuthPage      from './pages/auth/AuthPage';
import DashboardPage from './pages/dashboard';
import HRFlowPage    from './pages/hrflow';
import LiveCallsPage from './pages/live';
import ChatbotsPage  from './pages/chatbots';

import EcommerceAgent  from './pages/ecommerce';
import FinancialAgent  from './pages/financial';
import LogisticsAgent  from './pages/logistics';
import HealthcareAgent from './pages/healthcare';
import MarketingAgent  from './pages/marketing';
import HRAgent         from './pages/hr';

import ChatbotCS     from './pages/chatbot-cs';
import ChatbotTech   from './pages/chatbot-tech';
import ChatbotHealth from './pages/chatbot-health';
import ChatbotBank   from './pages/chatbot-bank';
import ChatbotAppt   from './pages/chatbot-appt';
import ChatbotHR     from './pages/chatbot-hr';

import AnalyticsPage from './pages/analytics';
import WebhooksPage  from './pages/webhooks';

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
      <Routes>
        <Route path="/auth" element={
          <div style={{ position: 'relative', zIndex: 1, minHeight: '100vh' }}>
            <AuthPage />
          </div>
        } />

        {/* App views — rendered inside AppLayout (sidebar + topbar) */}
        <Route path="/dashboard" element={<WithLayout><DashboardPage /></WithLayout>} />
        <Route path="/live"      element={<WithLayout><LiveCallsPage /></WithLayout>} />
        <Route path="/hrchat"    element={<WithLayout><HRFlowPage /></WithLayout>} />
        <Route path="/analytics" element={<WithLayout><AnalyticsPage /></WithLayout>} />
        <Route path="/webhooks"  element={<WithLayout><WebhooksPage /></WithLayout>} />

        {/* Chatbots landing page — must be listed before /chatbots/* sub-routes */}
        <Route path="/chatbots" element={<WithLayout><ChatbotsPage /></WithLayout>} />

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
      <ToastHost />
    </>
  );
}
