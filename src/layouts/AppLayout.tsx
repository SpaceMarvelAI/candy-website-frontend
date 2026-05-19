import { useState } from 'react';
import Sidebar from '../components/Sidebar';
import Topbar from '../components/Topbar';
import SignupPopup from '../components/SignupPopup';
import { useApp } from '../context/AppContext';

export default function AppLayout({ children }) {
  const { user } = useApp();
  const [dismissed, setDismissed] = useState(false);

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '76px 1fr',
        minHeight: '100vh',
      }}
    >
      <Sidebar />
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <Topbar />
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
      </div>

      {!user && !dismissed && (
        <SignupPopup onClose={() => setDismissed(true)} />
      )}
    </div>
  );
}
