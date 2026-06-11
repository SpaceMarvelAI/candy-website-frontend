import { useApp } from '../../context/AppContext';
import Icon from '../../assets/icons';
import { categories } from '../../utils/mockData';

export default function CategoryGrid() {
  const { showView, setActiveNav, addToast } = useApp();

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
    setActiveNav('voice');
    showView(view);
  }

  return (
    <>
      {/* Section head */}
      <div
        style={{
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          flexWrap: 'wrap', gap: 12,
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
                background: i === 0 ? 'var(--purple)' : 'var(--card-bg)',
                border: i === 0 ? '1px solid var(--purple)' : '1px solid var(--border)',
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
              background: 'var(--card-bg)',
              border: '1px solid var(--border)',
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
      <div className="grid-categories">
        {categories.map((cat, idx) => (
          <CatCard
            key={cat.id}
            cat={cat}
            idx={idx}
            onClick={() => handleCardClick(cat)}
          />
        ))}
      </div>
    </>
  );
}

function CatCard({ cat, idx, onClick }) {
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
        transition: 'transform 0.2s ease, border-color 0.15s',
        animationDelay: `${(idx + 1) * 0.05}s`,
      }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = 'translateY(-2px)';
        e.currentTarget.style.borderColor = 'var(--border-strong)';
        const cta = e.currentTarget.querySelector('.cat-cta');
        if (cta) (cta as HTMLElement).style.color = 'var(--purple-hi)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.borderColor = 'var(--border)';
        const cta = e.currentTarget.querySelector('.cat-cta');
        if (cta) (cta as HTMLElement).style.color = 'var(--text-1)';
      }}
    >
      {/* Icon */}
      <div
        style={{
          width: 48, height: 48, borderRadius: 12,
          display: 'grid', placeItems: 'center',
          background: 'var(--card-bg)',
          border: '1px solid var(--border)',
          marginBottom: 16,
          color: 'var(--text-2)',
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
              background: 'rgba(0, 113, 227, 0.15)',
              border: '1px solid rgba(0, 113, 227, 0.30)',
              color: 'var(--purple-hi)',
              borderRadius: 99, marginLeft: 6, verticalAlign: 'middle',
              display: 'inline-flex', alignItems: 'center', gap: 4,
            }}
          >
            <Icon name="zap" size={11} /> Featured
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
        }}
      >
        <div style={{ fontSize: 12, color: 'var(--text-3)', display: 'flex', gap: 12 }}>
          <span><strong style={{ color: 'var(--text-1)', fontWeight: 600 }}>{cat.flows}</strong> flows</span>
          <span><strong style={{ color: 'var(--text-1)', fontWeight: 600 }}>{cat.agents}</strong> agents</span>
        </div>
        <div
          className="cat-cta"
          style={{
            fontSize: 12.5, fontWeight: 600, color: 'var(--text-1)',
            display: 'inline-flex', alignItems: 'center', gap: 5,
            transition: 'color 0.15s',
          }}
        >
          Explore <Icon name="arrowRight" size={14} />
        </div>
      </div>
    </div>
  );
}
