import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import Topbar from '../components/Topbar';

// Pages that need the full viewport — no padding, no maxWidth constraint.
const FULL_BLEED = ['/flows', '/analytics'];

export default function AppLayout({ children }) {
  const { pathname } = useLocation();
  const fullBleed = FULL_BLEED.some(p => pathname === p || pathname.startsWith(p + '/'));

  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Close mobile drawer whenever the route changes
  useEffect(() => { setSidebarOpen(false); }, [pathname]);

  return (
    <div className="app-layout">
      <Sidebar mobileOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
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
    </div>
  );
}
