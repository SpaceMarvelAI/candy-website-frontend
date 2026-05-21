import React from 'react';

export function SkeletonBox({
  width = '100%', height = 16, radius = 8, style = {},
}: {
  width?: string | number; height?: number; radius?: number; style?: React.CSSProperties;
}) {
  return <div className="skeleton" style={{ width, height, borderRadius: radius, ...style }} />;
}

export function SkeletonCard({ style = {} }: { style?: React.CSSProperties }) {
  return (
    <div style={{
      padding: '18px 20px', border: '1px solid var(--border)',
      borderRadius: 'var(--radius)', background: 'var(--surface)',
      display: 'flex', flexDirection: 'column', gap: 10, ...style,
    }}>
      <SkeletonBox width="55%" height={12} />
      <SkeletonBox width="40%" height={28} radius={6} />
      <SkeletonBox width="30%" height={11} />
    </div>
  );
}

export function SkeletonTable({
  rows = 6, cols, rowHeight = 46, padding = '0 22px',
}: {
  rows?: number; cols: (string | number)[]; rowHeight?: number; padding?: string;
}) {
  return (
    <div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{
          display: 'flex', alignItems: 'center', gap: 16,
          padding, height: rowHeight,
          borderBottom: '1px solid var(--border)',
          opacity: Math.max(0.25, 1 - i * 0.13),
        }}>
          {cols.map((w, j) => <SkeletonBox key={j} width={w} height={13} />)}
        </div>
      ))}
    </div>
  );
}
