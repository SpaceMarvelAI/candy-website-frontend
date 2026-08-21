import { useToasts, type ToastKind } from '../hooks/useToast';
import Icon from '../assets/icons';

const KIND_STYLE: Record<ToastKind, { bg: string; fg: string; iconBg: string; iconFg: string; icon: string }> = {
  success: {
    bg:     'rgba(22,22,32,0.96)',
    fg:     '#ffffff',
    iconBg: 'rgba(76,175,80,0.18)',
    iconFg: '#7ad57f',
    icon:   'check',
  },
  error: {
    bg:     'rgba(40,18,24,0.96)',
    fg:     '#fff0f0',
    iconBg: 'rgba(255,90,120,0.18)',
    iconFg: '#ff6b80',
    icon:   'x',
  },
  info: {
    bg:     'rgba(18,28,40,0.96)',
    fg:     '#f0f6ff',
    iconBg: 'rgba(24,218,252,0.18)',
    iconFg: '#5fdcff',
    icon:   'zap',
  },
};

export default function ToastHost() {
  const toasts = useToasts();

  return (
    <div
      style={{
        position: 'fixed', bottom: 24, right: 24, zIndex: 1000,
        display: 'flex', flexDirection: 'column', gap: 10,
        pointerEvents: 'none',
      }}
    >
      {toasts.map(t => {
        const k = t.kind;
        const style = KIND_STYLE[k];
        return (
          <div
            key={t.id}
            className="toast-in"
            role={k === 'error' ? 'alert' : 'status'}
            style={{
              background: style.bg,
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 'var(--radius)',
              padding: '12px 16px',
              display: 'flex', alignItems: 'center', gap: 10,
              fontSize: 13,
              lineHeight: 1.4,
              backdropFilter: 'blur(20px)',
              boxShadow: '0 18px 40px -16px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.04)',
              minWidth: 280,
              maxWidth: 420,
              color: style.fg,
              pointerEvents: 'auto',
            }}
          >
            <div
              style={{
                width: 22, height: 22, borderRadius: '50%',
                display: 'grid', placeItems: 'center',
                background: style.iconBg, color: style.iconFg,
                flexShrink: 0,
              }}
            >
              <Icon name={style.icon} size={12} />
            </div>
            <span className="ph-mask" style={{ color: style.fg }}>{t.msg}</span>
          </div>
        );
      })}
    </div>
  );
}
