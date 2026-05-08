import { useApp } from './context/AppContext';
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

// Chatbot use-case workspaces — full-screen (same pattern as voice agents)
import ChatbotCS     from './pages/chatbot-cs';
import ChatbotTech   from './pages/chatbot-tech';
import ChatbotHealth from './pages/chatbot-health';
import ChatbotBank   from './pages/chatbot-bank';
import ChatbotAppt   from './pages/chatbot-appt';
import ChatbotHR     from './pages/chatbot-hr';

// Voice-agent pages render full-screen with their own AgentShell — they
// supply their own header/back-button instead of the AppLayout chrome.
// Chatbot workspace pages follow the same pattern.
const AGENT_VIEWS = {
  // ── Voice agents ──────────────────────────────────────────────────────────
  ecommerce:  <EcommerceAgent />,
  financial:  <FinancialAgent />,
  logistics:  <LogisticsAgent />,
  healthcare: <HealthcareAgent />,
  marketing:  <MarketingAgent />,
  hr:         <HRAgent />,

  // ── Chatbot workspaces ────────────────────────────────────────────────────
  chatbot_cs:     <ChatbotCS />,
  chatbot_tech:   <ChatbotTech />,
  chatbot_health: <ChatbotHealth />,
  chatbot_bank:   <ChatbotBank />,
  chatbot_appt:   <ChatbotAppt />,
  chatbot_hr:     <ChatbotHR />,
};

const APP_VIEWS = {
  dashboard:  <DashboardPage />,
  chatbots:   <ChatbotsPage />,
  // 'hrchat' kept around for the old chat-style HR screen if someone
  // links into it directly; the dashboard tile now opens the standard
  // AgentWorkspace via AGENT_VIEWS.hr above.
  hrchat:     <HRFlowPage />,
  live:       <LiveCallsPage />,
};

export default function App() {
  const { currentView } = useApp();

  let body;
  if (currentView === 'auth') {
    body = (
      <div style={{ position: 'relative', zIndex: 1, minHeight: '100vh' }}>
        <AuthPage />
      </div>
    );
  } else if (AGENT_VIEWS[currentView]) {
    // Agent screens take over the full viewport — no sidebar, no topbar.
    body = AGENT_VIEWS[currentView];
  } else {
    body = (
      <div style={{ position: 'relative', zIndex: 1 }}>
        <AppLayout>
          {APP_VIEWS[currentView] ?? <DashboardPage />}
        </AppLayout>
      </div>
    );
  }

  return (
    <>
      <AmbientBg />
      {body}
      <ToastHost />
    </>
  );
}
