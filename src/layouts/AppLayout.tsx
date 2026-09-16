import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import Topbar from '../components/Topbar';
import VoiceIndicator from '../components/voice/VoiceIndicator';

// Pages that need the full viewport — no padding, no maxWidth constraint.
const FULL_BLEED = ['/flows', '/analytics'];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const fullBleed = FULL_BLEED.some(p => pathname === p || pathname.startsWith(p + '/'));

  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Close mobile drawer whenever the route changes
  useEffect(() => { setSidebarOpen(false); }, [pathname]);

  return (
    <div className="app-layout">
      <Sidebar mobileOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, overflow: 'hidden' }}>
        <Topbar onMenuOpen={() => setSidebarOpen(true)} />
        {fullBleed ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {children}
          </div>
        ) : (
          <main className="main-content-pad">
            {children}
          </main>
        )}
      </div>
      {/* Fixed-position, so it sits outside the scrolling column and stays put
          across route changes.

          Only routes that use AppLayout get voice, and leaving /agents/* out is
          a deliberate constraint, not an oversight. Those pages render
          AgentWorkspace, which mounts TestPanel (AgentWorkspace.tsx:296) — the
          only other getUserMedia consumer in this codebase. Mounting the
          indicator there would put two MediaRecorder consumers on one page, and
          Alt+Space would open a second capture in the middle of a live test
          call. If voice is ever wanted on those pages it needs a shared mic
          arbiter, not a second recorder. */}
      <VoiceIndicator />
    </div>
  );
}
