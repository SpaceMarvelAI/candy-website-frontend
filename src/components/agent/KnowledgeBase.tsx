/**
 * KnowledgeBase — drag-and-drop / click-to-upload widget wired to the real
 * Candy-Agents backend. On drop:
 *   1. POST /v1/agents/{agent_id}/knowledge/uploads (multipart)
 *   2. Re-fetch the document list to show its current status (parsing /
 *      classified / embedded / failed).
 *
 * Each row has an X to delete the doc via DELETE /v1/agents/{id}/knowledge/{kb_id}.
 * The button shows a busy state and surfaces any backend error in a toast.
 */
import { useState, useRef } from 'react';
import Icon from '../../assets/icons';
import { uploadKnowledgeFile, deleteKnowledge, crawlWebsite, type KnowledgeDoc } from '../../api/knowledge';
import { ApiError } from '../../api/client';
import { useApp } from '../../context/AppContext';

const tintColor = {
  purple: 'var(--purple-hi)', blue: 'var(--blue)', teal: 'var(--teal)',
  green: 'var(--green)', amber: 'var(--amber)', pink: 'var(--pink)',
};

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function statusLabel(d: KnowledgeDoc): string {
  if (d.status === 'embedded' || d.status === 'completed') return 'Indexed';
  if (d.status === 'failed') return 'Failed';
  if (d.status === 'parsing' || d.status === 'queued' || d.status === 'classifying' || d.status === 'embedding')
    return d.status.charAt(0).toUpperCase() + d.status.slice(1) + '…';
  return d.status;
}

interface Props {
  tint?: keyof typeof tintColor;
  agentId: string | null;
  docs: KnowledgeDoc[];
  refreshDocs: () => Promise<void>;
}

export default function KnowledgeBase({ tint = 'purple', agentId, docs, refreshDocs }: Props) {
  const { addToast } = useApp();
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState<string[]>([]);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [crawlUrl, setCrawlUrl] = useState('');
  const [crawling, setCrawling] = useState(false);
  const [crawlEntireSite, setCrawlEntireSite] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function addFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    if (!agentId) {
      addToast('Agent not ready yet — try again in a moment.', 'info');
      return;
    }

    const files = Array.from(list);
    setUploading(prev => [...prev, ...files.map(f => f.name)]);

    for (const f of files) {
      try {
        await uploadKnowledgeFile(agentId, f);
        addToast(`Uploaded ${f.name}`, 'success');
      } catch (e) {
        const msg = e instanceof ApiError ? e.message : (e as Error).message;
        console.error('[KB] upload failed', e);
        addToast(`Failed to upload ${f.name}: ${msg}`, 'error');
      } finally {
        setUploading(prev => prev.filter(n => n !== f.name));
      }
    }

    await refreshDocs();
  }

  async function handleDelete(d: KnowledgeDoc, ev?: React.MouseEvent) {
    // Always log so we can confirm the click is reaching React.
    console.log('[KB] delete clicked', { agentId, docId: d.id, filename: d.filename });
    if (ev) {
      ev.preventDefault();
      ev.stopPropagation();
    }
    if (!agentId) {
      addToast('No agent selected — pick one above before deleting.', 'info');
      return;
    }
    if (deletingIds.has(d.id)) return;
    setDeletingIds(prev => new Set(prev).add(d.id));
    try {
      console.log('[KB] sending DELETE', `/v1/agents/${agentId}/knowledge/${d.id}`);
      await deleteKnowledge(agentId, d.id);
      addToast(`Removed ${d.filename}`, 'success');
      await refreshDocs();
    } catch (e) {
      const msg = e instanceof ApiError ? `${e.status}: ${e.message}` : (e as Error).message;
      console.error('[KB] delete failed', e);
      addToast(`Could not remove ${d.filename}: ${msg}`, 'error');
    } finally {
      setDeletingIds(prev => {
        const n = new Set(prev);
        n.delete(d.id);
        return n;
      });
    }
  }

  async function handleCrawl() {
    if (!agentId) {
      addToast('Pick or create an agent first.', 'info');
      return;
    }
    let url = crawlUrl.trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    if (crawling) return;
    // depth=1 → single page; depth=3 → up to ~50 pages (Firecrawl limit: depth*10 internally)
    const depth = crawlEntireSite ? 3 : 1;
    setCrawling(true);
    try {
      const res = await crawlWebsite(agentId, url, depth);
      addToast(
        res.pages_scraped > 1
          ? `Crawled ${res.pages_scraped} pages from ${url} — indexing now`
          : `Scraped ${url} — ${Math.round(res.char_count / 100) / 10}k chars, indexing now`,
        'success',
      );
      setCrawlUrl('');
      await refreshDocs();
    } catch (e) {
      const msg = e instanceof ApiError ? `${e.status}: ${e.message}` : (e as Error).message;
      console.error('[KB] crawl failed', e);
      addToast(`Crawl failed: ${msg}`, 'error');
    } finally {
      setCrawling(false);
    }
  }

  async function deleteAll() {
    if (!agentId || bulkDeleting) return;
    if (docs.length === 0) return;
    if (!window.confirm(`Delete all ${docs.length} files from this agent's knowledge base?`)) return;
    setBulkDeleting(true);
    let ok = 0, fail = 0;
    for (const d of docs) {
      try {
        await deleteKnowledge(agentId, d.id);
        ok++;
      } catch (e) {
        console.error('[KB] bulk delete failed for', d.id, e);
        fail++;
      }
    }
    await refreshDocs();
    setBulkDeleting(false);
    addToast(fail === 0 ? `Removed all ${ok} files` : `Removed ${ok}, failed ${fail}`, fail === 0 ? 'success' : 'error');
  }

  return (
    <section style={section}>
      <header style={sectionHeader}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Icon name="layers" size={16} style={{ color: tintColor[tint] }} />
          <h3 style={sectionTitle}>Knowledge base</h3>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={pill}>{docs.length} {docs.length === 1 ? 'file' : 'files'}</span>
          {docs.length > 0 && (
            <button
              onClick={deleteAll}
              disabled={bulkDeleting}
              style={{
                fontSize: 11, padding: '4px 9px', borderRadius: 7,
                background: 'rgba(255,90,120,0.1)',
                border: '1px solid rgba(255,90,120,0.4)',
                color: 'var(--red)',
                cursor: bulkDeleting ? 'wait' : 'pointer',
                opacity: bulkDeleting ? 0.6 : 1,
              }}
            >
              {bulkDeleting ? 'Deleting…' : 'Delete all'}
            </button>
          )}
        </div>
      </header>

      {/* Website crawl — Firecrawl scrapes a public URL and indexes the
          content the same way as an uploaded doc. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
        {/* URL row */}
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 12px',
            background: 'var(--tint-1)',
            border: '1px solid var(--border)',
            borderRadius: 10,
          }}
        >
          <Icon name="layers" size={14} style={{ color: tintColor[tint], flexShrink: 0 }} />
          <input
            value={crawlUrl}
            onChange={e => setCrawlUrl(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleCrawl(); } }}
            placeholder="Paste a website URL (https://yourcompany.com)"
            disabled={!agentId || crawling}
            style={{
              flex: 1, background: 'transparent', border: 'none',
              outline: 'none', color: 'var(--text-1)', fontSize: 13,
            }}
          />
          <button
            type="button"
            onClick={handleCrawl}
            disabled={!agentId || crawling || !crawlUrl.trim()}
            style={{
              padding: '6px 11px', borderRadius: 7,
              background: crawling ? 'var(--tint-2)' : tintColor[tint] + '22',
              border: `1px solid ${crawling ? 'var(--border)' : tintColor[tint]}`,
              color: crawling ? 'var(--text-3)' : 'var(--text-1)',
              fontSize: 11.5, fontWeight: 600,
              cursor: (!agentId || !crawlUrl.trim() || crawling) ? 'not-allowed' : 'pointer',
              opacity: (!agentId || !crawlUrl.trim()) ? 0.5 : 1,
              transition: 'all 0.15s', whiteSpace: 'nowrap',
            }}
          >
            {crawling ? 'Crawling…' : 'Add website'}
          </button>
        </div>

        {/* Crawl scope toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingLeft: 4 }}>
          <button
            type="button"
            onClick={() => setCrawlEntireSite(false)}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
              fontSize: 11.5, fontWeight: 500,
              background: !crawlEntireSite ? tintColor[tint] + '18' : 'transparent',
              border: `1px solid ${!crawlEntireSite ? tintColor[tint] : 'var(--border)'}`,
              color: !crawlEntireSite ? 'var(--text-1)' : 'var(--text-3)',
              transition: 'all 0.15s',
            }}
          >
            This page only
          </button>
          <button
            type="button"
            onClick={() => setCrawlEntireSite(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
              fontSize: 11.5, fontWeight: 500,
              background: crawlEntireSite ? tintColor[tint] + '18' : 'transparent',
              border: `1px solid ${crawlEntireSite ? tintColor[tint] : 'var(--border)'}`,
              color: crawlEntireSite ? 'var(--text-1)' : 'var(--text-3)',
              transition: 'all 0.15s',
            }}
          >
            Entire website
          </button>
          <span style={{ fontSize: 11, color: 'var(--text-4)' }}>
            {crawlEntireSite ? '— crawls all pages (up to ~50), takes 30–120s' : '— scrapes just this URL, fast'}
          </span>
        </div>
      </div>

      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => {
          e.preventDefault();
          setDragOver(false);
          addFiles(e.dataTransfer.files);
        }}
        style={{
          ...dropZone,
          borderColor: dragOver ? tintColor[tint] : 'var(--border-strong)',
          background: dragOver ? 'var(--tint-2)' : 'var(--tint-1)',
          opacity: agentId ? 1 : 0.6,
          cursor: agentId ? 'pointer' : 'wait',
        }}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,.csv,.xlsx,.docx,.txt,.md"
          style={{ display: 'none' }}
          onChange={e => {
            addFiles(e.target.files);
            e.target.value = '';
          }}
        />
        <Icon name="upload" size={22} style={{ color: tintColor[tint] }} />
        <div style={{ marginTop: 10, fontSize: 13.5, fontWeight: 500, color: 'var(--text-1)' }}>
          {agentId ? 'Drop files or click to upload' : 'Pick or create an agent above to enable uploads'}
        </div>
        <div style={{ marginTop: 4, fontSize: 12, color: 'var(--text-3)' }}>
          PDF · CSV · XLSX · DOCX · TXT — up to 50 MB each
        </div>
      </div>

      {(uploading.length > 0 || docs.length > 0) && (
        <ul style={fileList}>
          {uploading.map(name => (
            <li key={`up-${name}`} style={fileRow}>
              <div
                style={{
                  width: 30, height: 30, borderRadius: 7,
                  background: 'var(--tint-2)',
                  display: 'grid', placeItems: 'center',
                  color: tintColor[tint], flexShrink: 0,
                }}
              >
                <Icon name="upload" size={14} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: 'var(--text-1)', fontWeight: 500 }}>{name}</div>
                <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>Uploading…</div>
              </div>
            </li>
          ))}

          {docs.map(d => {
            const deleting = deletingIds.has(d.id);
            return (
              <li key={d.id} style={fileRow}>
                <div
                  style={{
                    width: 30, height: 30, borderRadius: 7,
                    background: 'var(--tint-2)',
                    display: 'grid', placeItems: 'center',
                    color: d.status === 'embedded' ? 'var(--green)'
                         : d.status === 'failed'   ? 'var(--red)'
                         : tintColor[tint],
                    flexShrink: 0,
                  }}
                >
                  <Icon name="file" size={14} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: 'var(--text-1)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {d.filename}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>
                    {formatSize(d.size_bytes)} · {statusLabel(d)}
                    {d.purpose_category ? ` · ${d.purpose_category}` : ''}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={(ev) => handleDelete(d, ev)}
                  disabled={deleting}
                  aria-label={`Remove ${d.filename}`}
                  title={`Remove ${d.filename}`}
                  style={{
                    width: 28, height: 28, borderRadius: 7,
                    background: deleting ? 'rgba(255,90,120,0.15)' : 'transparent',
                    border: '1px solid var(--border)',
                    color: deleting ? 'var(--red)' : 'var(--text-2)',
                    display: 'grid', placeItems: 'center',
                    cursor: deleting ? 'wait' : 'pointer',
                    flexShrink: 0,
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => {
                    if (!deleting) {
                      e.currentTarget.style.background = 'rgba(255,90,120,0.1)';
                      e.currentTarget.style.borderColor = 'rgba(255,90,120,0.4)';
                      e.currentTarget.style.color = 'var(--red)';
                    }
                  }}
                  onMouseLeave={e => {
                    if (!deleting) {
                      e.currentTarget.style.background = 'transparent';
                      e.currentTarget.style.borderColor = 'var(--border)';
                      e.currentTarget.style.color = 'var(--text-2)';
                    }
                  }}
                >
                  <Icon name={deleting ? 'refresh' : 'x'} size={12} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

const section = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  padding: 22,
};
const sectionHeader = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  marginBottom: 16,
};
const sectionTitle = { fontSize: 14, fontWeight: 600, color: 'var(--text-1)', margin: 0 };
const pill = {
  fontSize: 11, fontWeight: 500, color: 'var(--text-3)',
  padding: '3px 8px', borderRadius: 99,
  background: 'var(--tint-1)', border: '1px solid var(--border)',
};
const dropZone = {
  cursor: 'pointer',
  borderRadius: 12,
  border: '1.5px dashed var(--border-strong)',
  padding: '32px 24px',
  display: 'flex', flexDirection: 'column' as const, alignItems: 'center',
  textAlign: 'center' as const,
  transition: 'all 0.15s ease',
};
const fileList = {
  listStyle: 'none', padding: 0, margin: '14px 0 0',
  display: 'flex', flexDirection: 'column' as const, gap: 8,
};
const fileRow = {
  display: 'flex', alignItems: 'center', gap: 12,
  padding: '10px 12px',
  background: 'var(--tint-1)',
  border: '1px solid var(--border)',
  borderRadius: 9,
};
