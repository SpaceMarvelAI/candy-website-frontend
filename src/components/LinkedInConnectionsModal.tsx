/**
 * LinkedInConnectionsModal — the caller's own LinkedIn connections, parsed from whatever data-
 * export ZIP they last uploaded via ProfileModal's "Upload LinkedIn ZIP" (src/api/profile.ts's
 * uploadLinkedInZip). Read-only: nothing is editable or deletable here, this is just a viewer.
 * Modal shell copied from ProfileModal.tsx's own (createPortal + fixed-inset overlay).
 */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from '../assets/icons';
import { listLinkedInConnections, type LinkedInConnection } from '../api/profile';
import { errorMessage } from '../utils/apiError';
import { Pagination } from '../pages/crm/ui';

interface Props {
  onClose: () => void;
}

const PAGE_SIZE = 25;

export default function LinkedInConnectionsModal({ onClose }: Props) {
  const [items, setItems] = useState<LinkedInConnection[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    listLinkedInConnections({ limit: PAGE_SIZE, offset })
      .then((page) => {
        if (cancelled) return;
        setItems(page.items);
        setHasMore(page.has_more);
      })
      .catch((err) => { if (!cancelled) setError(errorMessage(err)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [offset]);

  return createPortal(
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)',
        zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
    >
      <div
        style={{
          width: '100%', maxWidth: 560, maxHeight: '85vh',
          display: 'flex', flexDirection: 'column',
          background: 'var(--bg-1)', border: '1px solid var(--border)', borderRadius: 16,
          boxShadow: '0 24px 80px -8px rgba(0,0,0,0.7)', overflow: 'hidden',
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 22px', borderBottom: '1px solid var(--border)', background: 'var(--surface)', flexShrink: 0,
        }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)' }}>LinkedIn Connections</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4 }}>
            <Icon name="x" size={18} />
          </button>
        </div>

        <div style={{ overflowY: 'auto', padding: '8px 22px', flex: 1 }}>
          {loading && items.length === 0 && (
            <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>Loading…</div>
          )}
          {error && (
            <div style={{ padding: '16px 0', color: 'var(--text-1)', fontSize: 13 }}>{error}</div>
          )}
          {!loading && !error && items.length === 0 && (
            <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
              No connections yet — upload your LinkedIn data-export ZIP from your Profile to import them.
            </div>
          )}
          {items.map((c) => (
            <div key={c.id} style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
              <a href={c.profile_url} target="_blank" rel="noreferrer" style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-1)', textDecoration: 'none' }}>
                {c.name || c.profile_url}
              </a>
              {(c.headline || c.organization) && (
                <div style={{ fontSize: 12.5, color: 'var(--text-3)' }}>
                  {[c.headline, c.organization].filter(Boolean).join(' · ')}
                </div>
              )}
              {c.connected_on && (
                <div style={{ fontSize: 11.5, color: 'var(--text-4)' }}>Connected {c.connected_on}</div>
              )}
            </div>
          ))}
        </div>

        <div style={{ borderTop: '1px solid var(--border)', padding: '0 22px', flexShrink: 0 }}>
          <Pagination offset={offset} limit={PAGE_SIZE} count={items.length} hasMore={hasMore} onChange={setOffset} />
        </div>
      </div>
    </div>,
    document.body,
  );
}
