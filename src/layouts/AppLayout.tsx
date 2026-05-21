import { useLocation } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import Topbar from '../components/Topbar';

// Pages that need the full viewport — no padding, no maxWidth constraint.
const FULL_BLEED = ['/flows', '/analytics'];

export default function AppLayout({ children }) {
  const { pathname } = useLocation();
  const fullBleed = FULL_BLEED.some(p => pathname === p || pathname.startsWith(p + '/'));

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '56px 1fr',
        minHeight: '100vh',
      }}
    >
      <Sidebar />
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
        <Topbar />
        {fullBleed ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {children}
          </div>
        ) : (
          <main
            style={{
              padding: '32px 40px 60px',
              maxWidth: 1440,
              margin: '0 auto',
              width: '100%',
            }}
          >
            {children}
          </main>
        )}
      </div>
    </div>
  );
}
