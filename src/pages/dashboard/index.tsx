import HeroPrompt    from './HeroPrompt';
import StatsStrip    from './StatsStrip';
import CategoryGrid  from './CategoryGrid';
import ActivityPanel from './ActivityPanel';
import QuickActions  from './QuickActions';

export default function DashboardPage() {
  return (
    <div className="fade-up">
      {/* Page header */}
      <div style={{ marginBottom: 32 }}>
        <div
          style={{
            fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.2em',
            color: 'var(--text-3)', marginBottom: 10,
          }}
        >
          Good morning, Hello
        </div>
        <h1 className="page-title">
          Your meta workspace is ready.
        </h1>
        <p style={{ color: 'var(--text-3)', fontSize: 15, maxWidth: 560 }}>
          Chat with AI, build automations, and deploy voice agents across industries — from a single command center.
        </p>
      </div>

      <HeroPrompt />
      <StatsStrip />
      <CategoryGrid />

      {/* Bottom row: Activity + Quick Actions — stacks on tablet/mobile */}
      <div className="grid-bottom-row">
        <ActivityPanel />
        <QuickActions />
      </div>
    </div>
  );
}
