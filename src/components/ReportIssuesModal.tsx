/**
 * ReportIssuesModal — "Reported Issues" list + "Report an Issue" form.
 * Talks directly to S3 (src/api/reportIssues.ts) — no Candy backend involved.
 * Mirrors MetaSpace's existing UI: a list of every issue this user has ever filed
 * across ALL SpaceMarvel products, plus a form to file a new one from Candy.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type React from 'react';
import { createPortal } from 'react-dom';
import posthog from 'posthog-js';
import Icon from '../assets/icons';
import { useApp } from '../context/AppContext';
import { errorMessage } from '../utils/apiError';
import { useTheme } from '../hooks/useTheme';
import { listMyIssues, createIssue, loadAttachment, type ReportedIssue } from '../api/reportIssues';

interface Props {
  onClose: () => void;
}

const PLATFORM_LABEL: Record<string, string> = {
  candy: 'Candy',
  finixy: 'Finixy',
  metaspace: 'MetaSpace',
};

const MAX_ATTACHMENTS = 5;
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const ACCEPT = 'image/*,.pdf,.doc,.docx,.txt';

function StatusPill({ status }: { status: string }) {
  const resolved = status === 'resolved';
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '3px 9px', borderRadius: 999, fontSize: 11, fontWeight: 600,
        background: resolved ? 'rgba(76,175,80,0.15)' : 'rgba(59,130,246,0.15)',
        color: resolved ? '#4caf50' : 'var(--blue)',
      }}
    >
      {resolved && <Icon name="check" size={10} />}
      {resolved ? 'Resolved' : status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function IssueCard({ issue, onOpen }: { issue: ReportedIssue; onOpen: (issue: ReportedIssue) => void }) {
  return (
    <div
      onClick={() => onOpen(issue)}
      style={{
        padding: '14px 16px',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        cursor: 'pointer',
        transition: 'border-color 0.15s',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--purple)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-4)', fontFamily: 'monospace' }}>
          <Icon name="file" size={11} />#{issue.id}
        </span>
        <StatusPill status={issue.status} />
      </div>

      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', marginBottom: 4 }}>
        {issue.title}
      </div>
      <div
        style={{
          fontSize: 12.5, color: 'var(--text-3)', lineHeight: 1.5,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}
      >
        {issue.description}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
        <span
          style={{
            fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 999,
            background: 'rgba(139,92,246,0.12)', color: 'var(--purple)',
          }}
        >
          {PLATFORM_LABEL[issue.platform] || issue.platform}
        </span>
        {issue.attachmentKeys.length > 0 && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, color: 'var(--text-4)' }}>
            <Icon name="paperclip" size={11} />{issue.attachmentKeys.length}
          </span>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-4)' }}>
          {new Date(issue.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
        </span>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--text-4)', marginBottom: 8 }}>
      {children}
    </div>
  );
}

function ImageLightbox({ url, onClose }: { url: string; onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function onBackdropClick(e: React.MouseEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).id === 'image-lightbox-backdrop') onClose();
  }

  return createPortal(
    <div
      id="image-lightbox-backdrop"
      onClick={onBackdropClick}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.85)',
        zIndex: 1200,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
    >
      <button
        onClick={onClose}
        title="Close"
        style={{
          position: 'absolute', top: 20, right: 20, border: 'none',
          background: 'rgba(255,255,255,0.12)', color: '#fff', borderRadius: '50%',
          width: 36, height: 36, display: 'grid', placeItems: 'center', cursor: 'pointer',
        }}
      >
        <Icon name="x" size={18} />
      </button>
      <img
        src={url} alt=""
        style={{ width: '80vw', height: '80vh', objectFit: 'contain', borderRadius: 12 }}
      />
    </div>,
    document.body,
  );
}

function IssueDetailPanel({
  issue, onBack, onCloseAll, onImageClick,
}: {
  issue: ReportedIssue; onBack: () => void; onCloseAll: () => void; onImageClick: (url: string) => void;
}) {
  function onBackdropClick(e: React.MouseEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).id === 'issue-detail-backdrop') onBack();
  }

  return createPortal(
    <div
      id="issue-detail-backdrop"
      onClick={onBackdropClick}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(2px)',
        zIndex: 1100,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
    >
      <style>{`@keyframes issueDetailPop{from{opacity:0;transform:scale(0.97)}to{opacity:1;transform:scale(1)}}`}</style>
      <div
        style={{
          width: '100%', maxWidth: 640, maxHeight: '85vh',
          display: 'flex', flexDirection: 'column',
          background: 'var(--bg-1)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          boxShadow: '0 32px 100px -12px rgba(0,0,0,0.8)',
          overflow: 'hidden',
          animation: 'issueDetailPop 0.16s ease',
        }}
      >
        <div
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '18px 22px',
            borderBottom: '1px solid var(--border)',
            background: 'var(--surface)',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              onClick={onBack}
              title="Back"
              style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', padding: 4 }}
            >
              <Icon name="arrowRight" size={16} style={{ transform: 'rotate(180deg)' }} />
            </button>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)' }}>Issue Details</div>
          </div>
          <button
            onClick={onCloseAll}
            style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', padding: 4 }}
          >
            <Icon name="x" size={18} />
          </button>
        </div>
        <div style={{ padding: 22, overflowY: 'auto' }}>
          <IssueDetail issue={issue} onImageClick={onImageClick} />
        </div>
      </div>
    </div>,
    document.body,
  );
}

function IssueDetail({ issue, onImageClick }: { issue: ReportedIssue; onImageClick: (url: string) => void }) {
  const [attachmentUrls, setAttachmentUrls] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setAttachmentUrls(null);
    if (issue.attachmentKeys.length === 0) return;
    setLoading(true);
    Promise.all(issue.attachmentKeys.map(k => loadAttachment(issue.id, k)))
      .then(urls => { if (!cancelled) setAttachmentUrls(urls); })
      .catch(() => { /* best-effort — leave attachments unshown on failure */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [issue]);

  useEffect(() => () => { attachmentUrls?.forEach(u => URL.revokeObjectURL(u)); }, [attachmentUrls]);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-4)', fontFamily: 'monospace' }}>
          <Icon name="file" size={13} />#{issue.id}
        </span>
        <StatusPill status={issue.status} />
      </div>

      <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-1)', marginBottom: 10 }}>
        {issue.title}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <span
          style={{
            fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 999,
            background: 'rgba(139,92,246,0.12)', color: 'var(--purple)',
          }}
        >
          {PLATFORM_LABEL[issue.platform] || issue.platform}
        </span>
        <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>by {issue.email}</span>
        <span style={{ marginLeft: 'auto', fontSize: 12.5, color: 'var(--text-4)' }}>
          {new Date(issue.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
        </span>
      </div>

      <div style={{ borderTop: '1px solid var(--border)', margin: '16px 0' }} />

      <SectionLabel>Description</SectionLabel>
      <div style={{ fontSize: 14, color: 'var(--text-2)', lineHeight: 1.6, marginBottom: issue.attachmentKeys.length ? 20 : 0 }}>
        {issue.description}
      </div>

      {issue.attachmentKeys.length > 0 && (
        <>
          <SectionLabel>Attachments ({issue.attachmentKeys.length})</SectionLabel>
          {loading && <div style={{ fontSize: 12.5, color: 'var(--text-4)' }}>Loading attachments…</div>}
          {attachmentUrls && (
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {attachmentUrls.map((url, i) => (
                <button
                  key={i}
                  onClick={() => onImageClick(url)}
                  style={{ flex: '1 1 140px', maxWidth: 260, padding: 0, border: 'none', background: 'transparent', cursor: 'pointer' }}
                >
                  <img
                    src={url} alt=""
                    style={{
                      width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 10,
                      border: '1px solid var(--border)', background: 'var(--bg-0)', display: 'block',
                    }}
                  />
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function ReportIssuesModal({ onClose }: Props) {
  const { user, addToast } = useApp();
  const { theme } = useTheme();

  const [view, setView] = useState<'list' | 'new'>('list');
  const [issues, setIssues] = useState<ReportedIssue[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [selectedIssue, setSelectedIssue] = useState<ReportedIssue | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    refreshList();
    // Client-only intent signal — this modal never hits the Candy backend
    // (it talks straight to S3), so there's no server-side "issue reported"
    // event to precede.
    posthog.capture('report_issue_modal_opened');
  }, []);

  async function refreshList() {
    if (!user?.user_id) return;
    setLoadingList(true);
    try {
      setIssues(await listMyIssues(user.user_id));
    } catch (e) {
      addToast(errorMessage(e, 'Could not load reported issues.'), 'error');
    } finally {
      setLoadingList(false);
    }
  }

  const previews = useMemo(
    () => files.map(f => (f.type.startsWith('image/') ? URL.createObjectURL(f) : null)),
    [files],
  );
  useEffect(() => () => { previews.forEach(u => u && URL.revokeObjectURL(u)); }, [previews]);

  function addFiles(incoming: File[]) {
    if (!incoming.length) return;
    const room = MAX_ATTACHMENTS - files.length;
    if (room <= 0) {
      addToast(`Max ${MAX_ATTACHMENTS} attachments.`, 'info');
      return;
    }
    const accepted: File[] = [];
    for (const f of incoming) {
      if (accepted.length >= room) break;
      if (f.size > MAX_ATTACHMENT_BYTES) {
        addToast(`'${f.name}' exceeds the 10 MB attachment limit.`, 'error');
        continue;
      }
      accepted.push(f);
    }
    setFiles(prev => [...prev, ...accepted]);
  }

  function onPaste(e: React.ClipboardEvent) {
    const items = Array.from(e.clipboardData?.items || []);
    const pasted = items.filter(i => i.kind === 'file').map(i => i.getAsFile()).filter(Boolean) as File[];
    if (pasted.length) addFiles(pasted);
  }

  function removeFile(idx: number) {
    setFiles(prev => prev.filter((_, i) => i !== idx));
  }

  function resetForm() {
    setTitle('');
    setDescription('');
    setFiles([]);
  }

  async function submit() {
    if (!title.trim() || !description.trim()) {
      addToast('Title and description are required.', 'error');
      return;
    }
    // `user` can go null while this modal is open — the api client fires
    // candy:auth-expired on a 401 and AppContext clears it, which the
    // refreshList() call above can trigger. Without this guard the three
    // user.* reads below threw a TypeError that landed in the catch as the
    // misleading "Could not submit the report.", losing the typed-out report.
    if (!user) {
      addToast('Your session expired — sign in again to report an issue.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const created = await createIssue({
        title, description, files,
        userId: user.user_id,
        companyName: user.company_name ?? null,
        organizationId: null,
        email: user.email,
        pageUrl: window.location.href,
        viewport: `${window.innerWidth}x${window.innerHeight}`,
        theme,
      });
      setIssues(prev => [created, ...prev]);
      resetForm();
      setView('list');
      addToast('Issue reported — thanks!', 'success');
    } catch (e) {
      addToast(errorMessage(e, 'Could not submit the report.'), 'error');
    } finally {
      setSubmitting(false);
    }
  }

  function onBackdrop(e: React.MouseEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).id === 'report-issues-backdrop') onClose();
  }

  return (
    <>
      {createPortal(
        <div
          id="report-issues-backdrop"
          onClick={onBackdrop}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.65)',
            backdropFilter: 'blur(4px)',
            zIndex: 1000,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 20,
          }}
        >
      <div
        style={{
          width: '100%', maxWidth: view === 'list' ? 760 : 560,
          maxHeight: '85vh',
          display: 'flex', flexDirection: 'column',
          background: 'var(--bg-1)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          boxShadow: '0 24px 80px -8px rgba(0,0,0,0.7)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '18px 22px',
            borderBottom: '1px solid var(--border)',
            background: 'var(--surface)',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {view === 'new' && (
              <button
                onClick={() => setView('list')}
                title="Back"
                style={{
                  border: 'none', background: 'transparent', cursor: 'pointer',
                  color: 'var(--text-3)', display: 'flex', padding: 4,
                }}
              >
                <Icon name="arrowRight" size={16} style={{ transform: 'rotate(180deg)' }} />
              </button>
            )}
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)' }}>
              {view === 'list' ? 'Reported Issues' : 'Report an Issue'}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {view === 'list' && (
              <button
                onClick={() => setView('new')}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '7px 14px', borderRadius: 8, border: 'none',
                  background: 'var(--purple)', color: '#fff',
                  fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                }}
              >
                <Icon name="plus" size={13} />New Report
              </button>
            )}
            <button
              onClick={onClose}
              style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', padding: 4 }}
            >
              <Icon name="x" size={18} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: 22, overflowY: 'auto' }}>
          {view === 'list' ? (
            loadingList ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-4)', fontSize: 13 }}>
                Loading…
              </div>
            ) : issues.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-4)', fontSize: 13 }}>
                No issues reported yet.
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
                {issues.map(issue => (
                  <IssueCard key={issue.id} issue={issue} onOpen={setSelectedIssue} />
                ))}
              </div>
            )
          ) : (
            <div onPaste={onPaste}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-1)', marginBottom: 6 }}>
                Issue title <span style={{ color: '#f87171' }}>*</span>
              </label>
              <input
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Brief summary of the issue"
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: 9,
                  border: '1px solid var(--border)', background: 'var(--bg-0)',
                  color: 'var(--text-1)', fontSize: 13.5, marginBottom: 18,
                }}
              />

              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-1)', marginBottom: 6 }}>
                Describe the issue <span style={{ color: '#f87171' }}>*</span>
              </label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="What happened? Steps to reproduce, expected vs actual behaviour…"
                rows={5}
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: 9,
                  border: '1px solid var(--border)', background: 'var(--bg-0)',
                  color: 'var(--text-1)', fontSize: 13.5, resize: 'vertical', marginBottom: 18,
                  fontFamily: 'inherit',
                }}
              />

              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-1)', marginBottom: 8 }}>
                Attachments <span style={{ fontWeight: 400, color: 'var(--text-4)' }}>(optional · max {MAX_ATTACHMENTS} · paste or upload)</span>
              </label>

              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept={ACCEPT}
                onChange={e => { addFiles(Array.from(e.target.files || [])); e.target.value = ''; }}
                style={{ display: 'none' }}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={files.length >= MAX_ATTACHMENTS}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  padding: '9px 14px', borderRadius: 9,
                  border: '1px dashed var(--border)', background: 'transparent',
                  color: 'var(--text-3)', fontSize: 12.5, cursor: files.length >= MAX_ATTACHMENTS ? 'not-allowed' : 'pointer',
                  opacity: files.length >= MAX_ATTACHMENTS ? 0.5 : 1,
                }}
              >
                <Icon name="paperclip" size={14} />Upload file or paste screenshot
              </button>

              {files.length > 0 && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                  {files.map((_, i) => (
                    <div
                      key={i}
                      style={{
                        position: 'relative', width: 64, height: 64, borderRadius: 8,
                        border: '1px solid var(--border)', overflow: 'hidden',
                        background: 'var(--bg-0)', display: 'grid', placeItems: 'center',
                      }}
                    >
                      {previews[i] ? (
                        <img src={previews[i]!} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <Icon name="file" size={20} />
                      )}
                      <button
                        onClick={() => removeFile(i)}
                        title="Remove"
                        style={{
                          position: 'absolute', top: 2, right: 2, width: 18, height: 18,
                          borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,0.6)',
                          color: '#fff', cursor: 'pointer', display: 'grid', placeItems: 'center', padding: 0,
                        }}
                      >
                        <Icon name="x" size={10} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <button
                onClick={submit}
                disabled={submitting}
                style={{
                  width: '100%', marginTop: 24,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  padding: '12px 18px', borderRadius: 10, border: 'none',
                  background: 'var(--purple)', color: '#fff',
                  fontSize: 14, fontWeight: 600, cursor: submitting ? 'default' : 'pointer',
                  opacity: submitting ? 0.7 : 1,
                }}
              >
                <Icon name="send" size={14} />{submitting ? 'Submitting…' : 'Submit Report'}
              </button>
            </div>
          )}
        </div>
      </div>
        </div>,
        document.body,
      )}

      {selectedIssue && (
        <IssueDetailPanel
          issue={selectedIssue}
          onBack={() => setSelectedIssue(null)}
          onCloseAll={() => { setSelectedIssue(null); onClose(); }}
          onImageClick={setLightboxUrl}
        />
      )}

      {lightboxUrl && <ImageLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />}
    </>
  );
}
