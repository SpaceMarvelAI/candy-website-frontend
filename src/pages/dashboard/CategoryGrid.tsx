import { useApp } from '../../context/AppContext';
import Icon from '../../assets/icons';
import { categories } from '../../utils/mockData';

const tintColors = {
  purple: 'rgba(117,91,227,0.55)',
  blue:   'rgba(24,218,252,0.5)',
  teal:   'rgba(79,209,197,0.5)',
  green:  'rgba(76,175,80,0.5)',
  amber:  'rgba(255,181,71,0.5)',
  pink:   'rgba(230,90,255,0.5)',
};

const tintIconColors = {
  purple: 'var(--purple-hi)',
  blue:   'var(--blue)',
  teal:   'var(--teal)',
  green:  'var(--green)',
  amber:  'var(--amber)',
  pink:   'var(--pink)',
};

export default function CategoryGrid() {
  const { showView, setActiveNav, addToast } = useApp();

  // Each industry card maps to the view name registered in App.tsx's appViews.
  // Update this map when adding a new agent folder under src/pages/.
  const VIEW_BY_CAT_ID = {
    ecom:   'ecommerce',
    fin:    'financial',
    log:    'logistics',
    health: 'healthcare',
    hr:     'hr',
    mkt:    'marketing',
  };

  function handleCardClick(cat) {
    const view = VIEW_BY_CAT_ID[cat.id];
    if (!view) {
      addToast(`${cat.title} workspace — opening soon`, 'info');
      return;
    }
    // Every industry tile now opens its full-screen AgentWorkspace —
    // including HR, which used to drop into a chat-style screen.
    setActiveNav('voice');
    showView(view);
  }

  return (
    <>
      {/* Section head */}
      <div
        style={{
          display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
          margin: '8px 0 18px',
        }}
      >
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--text-1)' }}>
            Industry workspaces
          </h2>
          <p style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 2 }}>
            Pick a vertical to launch a pre-built workflow.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {['All', 'Favorites'].map((label, i) => (
            <button
              key={label}
              style={{
                padding: '7px 12px', borderRadius: 8,
                background: i === 0 ? 'rgba(117,91,227,0.18)' : 'var(--tint-2)',
                border: i === 0 ? '1px solid var(--purple)' : '1px solid var(--border-strong)',
                color: i === 0 ? '#fff' : 'var(--text-2)',
                cursor: 'pointer', fontSize: 12.5, transition: 'all 0.15s',
              }}
            >
              {label}
            </button>
          ))}
          <button
            style={{
              padding: '7px 12px', borderRadius: 8,
              background: 'var(--tint-2)',
              border: '1px solid var(--border-strong)',
              color: 'var(--text-2)', cursor: 'pointer',
              fontSize: 12.5, transition: 'all 0.15s',
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}
          >
            <Icon name="plus" size={12} /> New workspace
          </button>
        </div>
      </div>

      {/* Grid */}
      <div
        style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18, marginBottom: 40 }}
      >
        {categories.map((cat, idx) => (
          <CatCard
            key={cat.id}
            cat={cat}
            idx={idx}
            tintColors={tintColors}
            tintIconColors={tintIconColors}
            onClick={() => handleCardClick(cat)}
          />
        ))}
      </div>
    </>
  );
}

function CatCard({ cat, idx, tintColors, tintIconColors, onClick }) {
  return (
    <div
      className="cat-card-anim"
      onClick={onClick}
      style={{
        position: 'relative',
        background: 'var(--card-bg)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        padding: 24,
        cursor: 'pointer',
        overflow: 'hidden',
        backdropFilter: 'blur(20px)',
        transition: 'transform 0.3s cubic-bezier(0.2, 0.7, 0.3, 1), border-color 0.2s',
        animationDelay: `${(idx + 1) * 0.05}s`,
      }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = 'translateY(-4px)';
        e.currentTarget.style.borderColor = 'var(--border-accent)';
        const glow = e.currentTarget.querySelector('.cat-glow');
        if (glow) { glow.style.opacity = '0.8'; glow.style.transform = 'scale(1.2)'; }
        const cta = e.currentTarget.querySelector('.cat-cta');
        if (cta) cta.style.gap = '10px';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.borderColor = 'var(--border)';
        const glow = e.currentTarget.querySelector('.cat-glow');
        if (glow) { glow.style.opacity = '0.5'; glow.style.transform = 'scale(1)'; }
        const cta = e.currentTarget.querySelector('.cat-cta');
        if (cta) cta.style.gap = '5px';
      }}
    >
      {/* Corner glow */}
      <div
        className="cat-glow"
        style={{
          position: 'absolute',
          width: 180, height: 180, borderRadius: '50%',
          background: `radial-gradient(circle, ${tintColors[cat.tint]}, transparent 70%)`,
          filter: 'blur(40px)', opacity: 0.5,
          top: -60, right: -60,
          transition: 'opacity 0.3s, transform 0.5s',
          pointerEvents: 'none',
        }}
      />

      <div
        style={{
          width: 48, height: 48, borderRadius: 12,
          display: 'grid', placeItems: 'center',
          background: 'var(--tint-2)',
          border: '1px solid var(--border-strong)',
          marginBottom: 16,
          position: 'relative',
          color: tintIconColors[cat.tint],
        }}
      >
        <Icon name={cat.icon} size={22} />
      </div>

      <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 6, letterSpacing: '-0.01em', color: 'var(--text-1)' }}>
        {cat.title}
        {cat.featured && (
          <span
            style={{
              fontSize: 10, padding: '2px 8px',
              background: 'rgba(117,91,227,0.2)',
              border: '1px solid var(--border-accent)',
              color: 'var(--purple-hi)',
              borderRadius: 99, marginLeft: 6, verticalAlign: 'middle',
            }}
          >
            ⚡ Featured
          </span>
        )}
      </div>

      <div style={{ fontSize: 13.5, color: 'var(--text-3)', lineHeight: 1.5, marginBottom: 18, minHeight: 42 }}>
        {cat.desc}
      </div>

      <div
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          paddingTop: 14, borderTop: '1px solid var(--border)',
          position: 'relative',
        }}
      >
        <div style={{ fontSize: 11.5, color: 'var(--text-3)', display: 'flex', gap: 12 }}>
          <span><strong style={{ color: 'var(--text-1)', fontWeight: 600 }}>{cat.flows}</strong> flows</span>
          <span><strong style={{ color: 'var(--text-1)', fontWeight: 600 }}>{cat.agents}</strong> agents</span>
        </div>
        <div
          className="cat-cta"
          style={{
            fontSize: 12.5, fontWeight: 600, color: 'var(--text-1)',
            display: 'inline-flex', alignItems: 'center', gap: 5,
            transition: 'gap 0.2s',
          }}
        >
          Explore <Icon name="arrowRight" size={14} />
        </div>
      </div>
    </div>
  );
}
