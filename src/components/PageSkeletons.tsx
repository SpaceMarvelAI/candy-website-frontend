import React from 'react';
import { SkeletonBox, SkeletonCard, SkeletonTable } from './Skeleton';

const PAGE_PAD: React.CSSProperties = { padding: '32px 40px 60px' };

// ── Dashboard ────────────────────────────────────────────────────────────────
export function DashboardSkeleton() {
  return (
    <div style={PAGE_PAD}>
      {/* Eyebrow + h1 + subtitle */}
      <div style={{ marginBottom: 28 }}>
        <SkeletonBox width={120} height={10} style={{ marginBottom: 12 }} />
        <SkeletonBox width={260} height={32} radius={6} style={{ marginBottom: 10 }} />
        <SkeletonBox width={340} height={14} />
      </div>

      {/* HeroPrompt card */}
      <div style={{
        border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)',
        background: 'var(--surface)', padding: '20px 24px', marginBottom: 36,
        display: 'flex', flexDirection: 'column', gap: 14,
      }}>
        <SkeletonBox width="70%" height={14} />
        <SkeletonBox width="100%" height={44} radius={10} />
        <div style={{ display: 'flex', gap: 8 }}>
          <SkeletonBox width={90} height={34} radius={8} />
          <SkeletonBox width={90} height={34} radius={8} />
          <SkeletonBox width={90} height={34} radius={8} />
        </div>
      </div>

      {/* StatsStrip — 4 cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 36 }}>
        {[0, 1, 2, 3].map(i => <SkeletonCard key={i} />)}
      </div>

      {/* Industry workspaces section header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <SkeletonBox width={180} height={16} />
        <SkeletonBox width={80} height={28} radius={8} />
      </div>

      {/* CategoryGrid — 3-col, 3 cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginBottom: 36 }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)',
            background: 'var(--surface)', padding: '22px 20px',
            display: 'flex', flexDirection: 'column', gap: 12,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <SkeletonBox width={44} height={44} radius={12} />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <SkeletonBox width="60%" height={14} />
                <SkeletonBox width="40%" height={11} />
              </div>
            </div>
            <SkeletonBox width="80%" height={11} />
            <SkeletonBox width="55%" height={11} />
          </div>
        ))}
      </div>

      {/* Bottom row: 1.6fr / 1fr */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 16 }}>
        <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', background: 'var(--surface)', padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <SkeletonBox width="40%" height={14} />
          {[0, 1, 2, 3, 4].map(i => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, opacity: Math.max(0.25, 1 - i * 0.15) }}>
              <SkeletonBox width={32} height={32} radius={8} />
              <SkeletonBox width="60%" height={12} />
              <SkeletonBox width="20%" height={12} />
            </div>
          ))}
        </div>
        <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', background: 'var(--surface)', padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <SkeletonBox width="50%" height={14} />
          {[0, 1, 2, 3].map(i => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, opacity: Math.max(0.25, 1 - i * 0.18) }}>
              <SkeletonBox width="65%" height={12} />
              <SkeletonBox width="25%" height={22} radius={99} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Analytics ────────────────────────────────────────────────────────────────
export function AnalyticsSkeleton() {
  return (
    <div style={{ padding: 0 }}>
      <div style={PAGE_PAD}>
        {/* Page header */}
        <div style={{ marginBottom: 20 }}>
          <SkeletonBox width={140} height={10} style={{ marginBottom: 12 }} />
          <SkeletonBox width={200} height={28} radius={6} style={{ marginBottom: 10 }} />
          <SkeletonBox width={280} height={14} />
        </div>

        {/* Tab strip — 7 tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
          {[80, 72, 68, 110, 80, 64, 60].map((w, i) => (
            <SkeletonBox key={i} width={w} height={32} radius={99} />
          ))}
        </div>

        {/* Stat cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 14, marginBottom: 20 }}>
          {[0, 1, 2, 3, 4].map(i => <SkeletonCard key={i} />)}
        </div>

        {/* Table */}
        <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', background: 'var(--surface)' }}>
          <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)' }}>
            <SkeletonBox width={120} height={14} />
          </div>
          <SkeletonTable rows={7} cols={['18%', '10%', '8%', '10%', '10%', '12%', '12%']} />
        </div>
      </div>
    </div>
  );
}

// ── Live Calls ───────────────────────────────────────────────────────────────
export function LiveCallsSkeleton() {
  return (
    <div style={PAGE_PAD}>
      {/* Page header */}
      <div style={{ marginBottom: 20 }}>
        <SkeletonBox width={160} height={10} style={{ marginBottom: 12 }} />
        <SkeletonBox width={220} height={28} radius={6} style={{ marginBottom: 10 }} />
        <SkeletonBox width={260} height={14} />
      </div>

      {/* 4 tab buttons */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
        {[120, 90, 110, 70].map((w, i) => (
          <SkeletonBox key={i} width={w} height={34} radius={99} />
        ))}
      </div>

      {/* Stats strip — 3 cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginBottom: 24 }}>
        {[0, 1, 2].map(i => <SkeletonCard key={i} />)}
      </div>

      {/* Table */}
      <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', background: 'var(--surface)' }}>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)' }}>
          <SkeletonBox width={110} height={14} />
        </div>
        <SkeletonTable rows={8} cols={['20%', '12%', '10%', '8%', '10%', '12%', '12%']} />
      </div>
    </div>
  );
}

// ── Chatbots ─────────────────────────────────────────────────────────────────
export function ChatbotsSkeleton() {
  return (
    <div style={PAGE_PAD}>
      {/* Page header */}
      <div style={{ marginBottom: 28 }}>
        <SkeletonBox width={130} height={10} style={{ marginBottom: 12 }} />
        <SkeletonBox width={200} height={28} radius={6} style={{ marginBottom: 10 }} />
        <SkeletonBox width={300} height={14} />
      </div>

      {/* Section header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <SkeletonBox width={160} height={14} />
      </div>

      {/* 3-col card grid, 6 cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16 }}>
        {[0, 1, 2, 3, 4, 5].map(i => (
          <div key={i} style={{
            border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)',
            background: 'var(--surface)', padding: '22px 20px',
            display: 'flex', flexDirection: 'column', gap: 12,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
              <SkeletonBox width={48} height={48} radius={12} />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <SkeletonBox width="65%" height={15} />
              </div>
            </div>
            <SkeletonBox width="90%" height={12} />
            <SkeletonBox width="70%" height={12} />
            {/* Footer chips */}
            <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
              <SkeletonBox width={60} height={22} radius={99} />
              <SkeletonBox width={50} height={22} radius={99} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Webhooks ─────────────────────────────────────────────────────────────────
export function WebhooksSkeleton() {
  return (
    <div style={PAGE_PAD}>
      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <SkeletonBox width={160} height={10} />
          <SkeletonBox width={180} height={28} radius={6} />
          <SkeletonBox width={240} height={14} />
        </div>
        <div style={{ display: 'flex', gap: 8, paddingTop: 4 }}>
          <SkeletonBox width={80} height={36} radius={9} />
          <SkeletonBox width={130} height={36} radius={9} />
        </div>
      </div>

      {/* Table */}
      <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', background: 'var(--surface)' }}>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)' }}>
          <SkeletonBox width={100} height={14} />
        </div>
        <SkeletonTable rows={8} cols={['35%', '20%', '10%', '12%', 'auto']} />
      </div>
    </div>
  );
}

// ── Flows ────────────────────────────────────────────────────────────────────
export function FlowsSkeleton() {
  return (
    <div style={{ display: 'flex', height: '100%', minHeight: '100vh', padding: 0 }}>
      {/* Left panel */}
      <div style={{
        width: 220, flexShrink: 0,
        borderRight: '1px solid var(--border)',
        background: 'var(--surface)',
        padding: '16px 12px',
        display: 'flex', flexDirection: 'column', gap: 8,
      }}>
        <SkeletonBox width="70%" height={12} style={{ marginBottom: 8 }} />
        {[0, 1, 2, 3, 4, 5, 6, 7].map(i => (
          <SkeletonBox key={i} width="100%" height={40} radius={8} style={{ opacity: Math.max(0.3, 1 - i * 0.09) }} />
        ))}
      </div>
      {/* Canvas area */}
      <div style={{ flex: 1, background: 'var(--bg-0)' }} className="skeleton" />
    </div>
  );
}

// ── AgentWorkspace ───────────────────────────────────────────────────────────
export function AgentWorkspaceSkeleton() {
  return (
    <div style={{ display: 'flex', height: '100vh', gap: 0, padding: 0 }}>
      {/* AgentPicker bar */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, borderBottom: '1px solid var(--border)', background: 'var(--surface)', padding: '12px 20px', display: 'flex', gap: 8 }}>
        {[110, 130, 95, 120, 115].map((w, i) => (
          <SkeletonBox key={i} width={w} height={34} radius={10} />
        ))}
      </div>

      {/* Two-column layout below the bar */}
      <div style={{ display: 'flex', width: '100%', paddingTop: 58, height: '100vh', overflow: 'hidden' }}>
        {/* Left: chat panel */}
        <div style={{ flex: 1, borderRight: '1px solid var(--border)', background: 'var(--bg-1)', padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {[0, 1, 2, 3, 4].map(i => (
            <div key={i} style={{ display: 'flex', justifyContent: i % 2 === 0 ? 'flex-start' : 'flex-end', opacity: Math.max(0.3, 1 - i * 0.12) }}>
              <SkeletonBox width={`${50 + (i * 7) % 25}%`} height={48} radius={12} />
            </div>
          ))}
        </div>
        {/* Right: 3 accordion items */}
        <div style={{ width: 340, flexShrink: 0, background: 'var(--surface)', padding: '16px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <SkeletonBox width="50%" height={13} />
                <SkeletonBox width={20} height={13} radius={4} />
              </div>
              {i === 0 && (
                <>
                  <SkeletonBox width="100%" height={80} radius={8} />
                  <SkeletonBox width="60%" height={11} />
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── ChatbotWorkspace ─────────────────────────────────────────────────────────
export function ChatbotWorkspaceSkeleton() {
  return <AgentWorkspaceSkeleton />;
}
