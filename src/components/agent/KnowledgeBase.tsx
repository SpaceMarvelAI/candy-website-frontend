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
import { uploadKnowledgeFile, deleteKnowledge, crawlWebsite, getKnowledgeDoc, type KnowledgeDoc } from '../../api/knowledge';
import { ApiError } from '../../api/client';
import { useApp } from '../../context/AppContext';
import { logger } from '../../utils/logger';

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
  const [viewingDoc, setViewingDoc] = useState<(KnowledgeDoc & { content_text?: string }) | null>(null);
  const [loadingDoc, setLoadingDoc] = useState(false);

  async function openDoc(d: KnowledgeDoc, ev: React.MouseEvent) {
    ev.stopPropagation();
    if (loadingDoc) return;
    setViewingDoc(d as any);
    setLoadingDoc(true);
    logger.debug('[KnowledgeBase] openDoc', { agentId, docId: d.id, filename: d.filename });
    try {
      const full = await getKnowledgeDoc(agentId!, d.id);
      setViewingDoc(full);
    } catch (e) {
      logger.warn('[KnowledgeBase] openDoc failed — showing partial info', { docId: d.id, error: e });
    } finally {
      setLoadingDoc(false);
    }
  }

  async function addFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    if (!agentId) {
      addToast('Agent not ready yet — try again in a moment.', 'info');
      return;
    }

    const files = Array.from(list);
    logger.info('[KnowledgeBase] addFiles start', { agentId, count: files.length, names: files.map(f => f.name) });
    setUploading(prev => [...prev, ...files.map(f => f.name)]);

    for (const f of files) {
      const t0 = performance.now();
      try {
        await uploadKnowledgeFile(agentId, f);
        logger.info('[KnowledgeBase] upload OK', { agentId, filename: f.name, size: f.size, elapsed: `${(performance.now() - t0).toFixed(1)} ms` });
        addToast(`Uploaded ${f.name}`, 'success');
      } catch (e) {
        const msg = e instanceof ApiError ? e.message : (e as Error).message;
        logger.error('[KnowledgeBase] upload failed', { agentId, filename: f.name, error: e, message: msg });
        addToast(`Failed to upload ${f.name}: ${msg}`, 'error');
      } finally {
        setUploading(prev => prev.filter(n => n !== f.name));
      }
    }

    await refreshDocs();
  }

  async function handleDelete(d: KnowledgeDoc, ev?: React.MouseEvent) {
    logger.info('[KnowledgeBase] handleDelete', { agentId, docId: d.id, filename: d.filename });
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
      await deleteKnowledge(agentId, d.id);
      logger.info('[KnowledgeBase] delete OK', { agentId, docId: d.id, filename: d.filename });
      addToast(`Removed ${d.filename}`, 'success');
      await refreshDocs();
    } catch (e) {
      const msg = e instanceof ApiError ? `${e.status}: ${e.message}` : (e as Error).message;
      logger.error('[KnowledgeBase] delete failed', { agentId, docId: d.id, error: e, message: msg });
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
    const depth = crawlEntireSite ? 3 : 1;
    logger.info('[KnowledgeBase] handleCrawl start', { agentId, url, depth, crawlEntireSite });
    setCrawling(true);
    const t0 = performance.now();
    try {
      const res = await crawlWebsite(agentId, url, depth);
      logger.info('[KnowledgeBase] crawl OK', { agentId, url, pages: res.pages_scraped, chars: res.char_count, elapsed: `${(performance.now() - t0).toFixed(1)} ms` });
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
      logger.error('[KnowledgeBase] crawl failed', { agentId, url, error: e, message: msg });
      addToast(`Crawl failed: ${msg}`, 'error');
    } finally {
      setCrawling(false);
    }
  }

  async function deleteAll() {
    if (!agentId || bulkDeleting) return;
    if (docs.length === 0) return;
    if (!window.confirm(`Delete all ${docs.length} files from this agent's knowledge base?`)) return;
    logger.info('[KnowledgeBase] deleteAll start', { agentId, count: docs.length });
    setBulkDeleting(true);
    let ok = 0, fail = 0;
    for (const d of docs) {
      try {
        await deleteKnowledge(agentId, d.id);
        ok++;
      } catch (e) {
        logger.error('[KnowledgeBase] bulk delete failed for doc', { agentId, docId: d.id, error: e });
        fail++;
      }
    }
    logger.info('[KnowledgeBase] deleteAll complete', { agentId, ok, fail });
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
            background: 'var(--card-bg)',
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
          background: dragOver ? 'var(--tint-2)' : 'var(--card-bg)',
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
                  background: 'var(--tint-1)',
                  display: 'grid', placeItems: 'center',
                  color: tintColor[tint], flexShrink: 0,
                }}
              >
                <Icon name="upload" size={14} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="ph-mask" style={{ fontSize: 13, color: 'var(--text-1)', fontWeight: 500 }}>{name}</div>
                <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>Uploading…</div>
              </div>
            </li>
          ))}

          {docs.map(d => {
            const deleting = deletingIds.has(d.id);
            return (
              <li
                key={d.id}
                style={{ ...fileRow, cursor: 'pointer' }}
                onClick={agentId ? (ev) => openDoc(d, ev) : undefined}
              >
                <div
                  style={{
                    width: 30, height: 30, borderRadius: 7,
                    background: 'var(--tint-1)',
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
                  <div className="ph-mask" style={{ fontSize: 13, color: 'var(--text-1)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {d.filename}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>
                    {formatSize(d.size_bytes)} · {statusLabel(d)}
                    {d.purpose_category ? <span className="ph-mask"> · {d.purpose_category}</span> : ''}
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
      {viewingDoc && (
        <DocViewerModal
          doc={viewingDoc}
          loading={loadingDoc}
          tint={tintColor[tint]}
          onClose={() => setViewingDoc(null)}
        />
      )}
    </section>
  );
}

// ── Doc viewer modal ──────────────────────────────────────────────────────────
function DocViewerModal({
  doc, loading, tint, onClose,
}: {
  doc: KnowledgeDoc & { content_text?: string };
  loading: boolean;
  tint: string;
  onClose: () => void;
}) {
  const ext = doc.filename.split('.').pop()?.toLowerCase() ?? '';
  const isPDF    = ext === 'pdf';
  const isImage  = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext);
    const signedUrl = doc.signed_url;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'var(--surface-soft)',
        backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: isPDF ? 900 : 680,
          maxHeight: '90vh',
          background: 'var(--bg-1)',
          border: '1px solid var(--border-strong)',
          borderRadius: 14,
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '16px 20px',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}>
          <div style={{
            width: 34, height: 34, borderRadius: 8,
            background: `${tint}18`,
            display: 'grid', placeItems: 'center',
            flexShrink: 0,
          }}>
            <Icon name="file" size={16} style={{ color: tint }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="ph-mask" style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {doc.filename}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>
              {formatSize(doc.size_bytes)}
              {doc.purpose_category ? <span className="ph-mask"> · {doc.purpose_category}</span> : ''}
              {doc.audience ? <span className="ph-mask"> · {doc.audience}</span> : ''}
            </div>
          </div>
          {/* Download button — only shown when signed URL is available */}
          {signedUrl && (
            <a
              href={signedUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '5px 11px', borderRadius: 7, textDecoration: 'none',
                background: `${tint}18`, border: `1px solid ${tint}44`,
                color: tint, fontSize: 11.5, fontWeight: 600,
                flexShrink: 0, whiteSpace: 'nowrap',
              }}
            >
              ↓ Download
            </a>
          )}
          <button
            onClick={onClose}
            style={{
              width: 30, height: 30, borderRadius: 8,
              background: 'transparent', border: '1px solid var(--border)',
              color: 'var(--text-2)', display: 'grid', placeItems: 'center',
              cursor: 'pointer', flexShrink: 0,
            }}
          >
            <Icon name="x" size={13} />
          </button>
        </div>

        {/* Metadata pills */}
        {(doc.document_tags?.length > 0 || doc.version_label || doc.effective_date) && (
          <div style={{
            display: 'flex', flexWrap: 'wrap', gap: 6,
            padding: '10px 20px',
            borderBottom: '1px solid var(--border)',
            flexShrink: 0,
          }}>
            {doc.version_label && (
              <span className="ph-mask" style={metaPill}>v{doc.version_label}</span>
            )}
            {doc.effective_date && (
              <span className="ph-mask" style={metaPill}>Effective: {doc.effective_date}</span>
            )}
            {doc.document_tags?.map(tag => (
              <span key={tag} className="ph-mask" style={{ ...metaPill, background: `${tint}14`, borderColor: `${tint}30`, color: tint }}>
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Body */}
        <div style={{ flex: 1, overflow: isPDF && signedUrl ? 'hidden' : 'auto', padding: isPDF && signedUrl ? 0 : '18px 20px' }}>
          {loading ? (
            <div style={{ color: 'var(--text-3)', fontSize: 13, textAlign: 'center', padding: '40px 0' }}>
              Loading preview…
            </div>
          ) : isPDF && signedUrl ? (
            /* PDF inline embed via signed URL */
            <iframe
              src={signedUrl}
              title={doc.filename}
              style={{ width: '100%', height: '100%', minHeight: 520, border: 'none', display: 'block' }}
            />
          ) : isImage && signedUrl ? (
            /* Image preview */
            <div style={{ display: 'flex', justifyContent: 'center', padding: '18px 20px' }}>
              <img
                src={signedUrl}
                alt={doc.filename}
                style={{ maxWidth: '100%', height: 'auto', borderRadius: 8 }}
              />
            </div>
          ) : doc.content_text ? (
            /* Extracted text fallback */
            <pre className="ph-mask" style={{
              margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              fontSize: 12.5, lineHeight: 1.7, color: 'var(--text-1)',
              fontFamily: 'inherit',
            }}>
              {doc.content_text}
            </pre>
          ) : signedUrl ? (
            /* Non-previewable file type — show download CTA */
            <div style={{ textAlign: 'center', padding: '48px 24px' }}>
              <div style={{ marginBottom: 12, color: 'var(--text-3)' }}><Icon name="file" size={32} /></div>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-1)', marginBottom: 6 }}>
                Preview not available for .{ext} files
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 20 }}>
                Download the file to view it in your local application.
              </div>
              <a
                href={signedUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '9px 18px', borderRadius: 9,
                  background: `${tint}22`, border: `1px solid ${tint}55`,
                  color: tint, fontSize: 13, fontWeight: 600, textDecoration: 'none',
                }}
              >
                ↓ Download <span className="ph-mask">{doc.filename}</span>
              </a>
            </div>
          ) : doc.summary ? (
            <>
              <p style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-4)', margin: '0 0 10px' }}>
                Summary
              </p>
              <p className="ph-mask" style={{ fontSize: 13.5, lineHeight: 1.75, color: 'var(--text-1)', margin: 0, whiteSpace: 'pre-wrap' }}>
                {doc.summary}
              </p>
            </>
          ) : (
            <div style={{ color: 'var(--text-3)', fontSize: 13, textAlign: 'center', padding: '40px 0' }}>
              No preview available for this file type.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const metaPill: React.CSSProperties = {
  fontSize: 11, padding: '3px 8px', borderRadius: 99,
  background: 'var(--card-bg)', border: '1px solid var(--border)',
  color: 'var(--text-3)',
};

const section = {
  background: 'var(--card-bg)',
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
  background: 'var(--card-bg)', border: '1px solid var(--border)',
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
  background: 'var(--card-bg)',
  border: '1px solid var(--border)',
  borderRadius: 9,
};
