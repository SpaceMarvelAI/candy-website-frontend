import Sidebar from '../components/Sidebar';
import Topbar from '../components/Topbar';

export default function AppLayout({ children }) {
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
    </div>
  );
}
