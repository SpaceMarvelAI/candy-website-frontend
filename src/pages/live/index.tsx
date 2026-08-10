/**
 * LiveCallsPage — recordings + agent overview, wired to the real backend.
 *
 *   Tabs:
 *     • Demo recordings — captured from the in-app Test panel via
 *       Start Test / Stop Test. Persisted as `demo_session` rows.
 *     • Live call recordings — telephony-side captures (placeholder
 *       until the Twilio bridge writes `live_call` rows).
 *     • Agents — quick overview of every agent on the company.
 */
import { useEffect, useRef, useState } from 'react';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { createPortal } from 'react-dom';
import { useNavigate, useParams } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import LiveStats from './LiveStats';
import Icon from '../../assets/icons';
import { SkeletonTable } from '../../components/Skeleton';
import { listAgents, type Agent } from '../../api/agents';
import { listAllRecordings, deleteRecording, downloadRecordingBlob, type RecordingRow } from '../../api/recordings';
import { listChatSessions, getChatSession, type ChatSessionRow, type ChatSessionDetail } from '../../api/chat-sessions';
import { ApiError, getToken } from '../../api/client';

type Tab = 'demo' | 'live' | 'chat' | 'agents';

const SLUG_LABEL: Record<string, string> = {
  ecom: 'E-commerce', fin: 'Financial', log: 'Logistics',
  health: 'Healthcare', hr: 'HR & Hiring', mkt: 'Marketing',
};

function formatDuration(ms: number | null | undefined): string {
  if (!ms || ms < 0) return '—';
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}m ${String(sec).padStart(2, '0')}s`;
}

function formatSize(bytes: number | null | undefined): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

const VALID_TABS: Tab[] = ['demo', 'live', 'chat', 'agents'];

export default function LiveCallsPage() {
  const { addToast } = useApp();
  const { tab: rawTab } = useParams<{ tab: string }>();
  const navigate = useNavigate();
  const tab: Tab = (VALID_TABS.includes(rawTab as Tab) ? rawTab : 'demo') as Tab;
  function setTab(t: Tab) { navigate(`/live/${t}`, { replace: true }); }
  const [demoRecs,  setDemoRecs]     = useState<RecordingRow[]>([]);
  const [liveRecs,  setLiveRecs]     = useState<RecordingRow[]>([]);
  const [chatSess,  setChatSess]     = useState<ChatSessionRow[]>([]);
  const [agents,    setAgents]       = useState<Agent[]>([]);
  const [loading,   setLoading]      = useState(true);
  const [error,     setError]        = useState<string | null>(null);
  const [playerRec,     setPlayerRec]     = useState<RecordingRow | null>(null);
  const [playerPlaying, setPlayerPlaying] = useState(false);
  const [playerTime,    setPlayerTime]    = useState(0);
  const [playerDur,     setPlayerDur]     = useState(0);
  const [deletingId,    setDeletingId]    = useState<string | null>(null);
  const [selectedRec,   setSelectedRec]   = useState<RecordingRow | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  async function downloadRec(rec: RecordingRow) {
    if (!rec.signed_url) {
      addToast('No download URL — recording stored locally on backend.', 'info');
      return;
    }
    if (downloadingId === rec.recording_id) return;
    setDownloadingId(rec.recording_id);
    const ext = rec.s3_key.match(/\.([a-zA-Z0-9]+)$/)?.[1] || rec.mime_type?.split('/')[1]?.split(';')[0] || 'bin';
    const filename = `${(rec.agent_name || 'recording').replace(/\s+/g, '_')}_${rec.created_at.slice(0, 19).replace(/[:/\s]/g, '-')}.${ext}`;

    function triggerBlobDownload(blob: Blob) {
      const url = URL.createObjectURL(blob);
      const a   = document.createElement('a');
      a.href     = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }

    try {
      // Strategy 1: fetch directly from S3 as a blob.
      // This works when the S3 bucket has CORS configured for this origin.
      const res = await fetch(rec.signed_url);
      if (!res.ok) throw new Error(`S3 fetch failed: ${res.status}`);
      triggerBlobDownload(await res.blob());
      addToast(`Downloading ${filename}`, 'success');
    } catch {
      // Strategy 2: route through the backend proxy which fetches S3
      // server-side and returns the file with Content-Disposition: attachment,
      // bypassing any S3 CORS restrictions entirely.
      try {
        const blob = await downloadRecordingBlob(rec.recording_id);
        triggerBlobDownload(blob);
        addToast(`Downloading ${filename}`, 'success');
      } catch {
        // Strategy 3: last resort — open the signed URL in a new tab.
        // The user will need to right-click → Save As to save the file.
        window.open(rec.signed_url, '_blank');
        addToast('Opening in new tab — right-click the audio and choose "Save As" to download.', 'info');
      }
    } finally {
      setDownloadingId(null);
    }
  }
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const initRef  = useRef(false);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const [demo, live, chat, ags] = await Promise.all([
        listAllRecordings({ recording_type: 'demo_session', limit: 200 }).catch(() => []),
        listAllRecordings({ recording_type: 'live_call',    limit: 200 }).catch(() => []),
        listChatSessions({ limit: 200 }).catch(() => []),
        listAgents().catch(() => []),
      ]);
      setDemoRecs(demo);
      setLiveRecs(live);
      setChatSess(chat);
      setAgents(ags);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : (e as Error).message;
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    if (!getToken()) {
      setError('Not signed in');
      setLoading(false);
      return;
    }
    refresh();
    return () => { try { audioRef.current?.pause(); } catch {} };
  }, []);

  function openPlayer(rec: RecordingRow) {
    if (!rec.signed_url) {
      addToast('No playback URL — recording stored locally on the backend.', 'info');
      return;
    }
    if (!audioRef.current) audioRef.current = new Audio();
    const audio = audioRef.current;

    // Same recording — toggle play/pause
    if (playerRec?.recording_id === rec.recording_id) {
      if (playerPlaying) { audio.pause(); setPlayerPlaying(false); }
      else { audio.play().then(() => setPlayerPlaying(true)).catch(() => addToast('Playback failed.', 'error')); }
      return;
    }

    audio.pause();
    audio.src = rec.signed_url;
    setPlayerRec(rec);
    setPlayerTime(0);
    setPlayerDur(0);
    setPlayerPlaying(false);

    audio.onloadedmetadata = () => setPlayerDur(audio.duration || 0);
    audio.ontimeupdate     = () => setPlayerTime(audio.currentTime);
    audio.onended          = () => setPlayerPlaying(false);

    audio.play()
      .then(() => setPlayerPlaying(true))
      .catch(err => { console.warn('[live] play failed', err); addToast('Could not play this recording.', 'error'); });
  }

  function closePlayer() {
    try { audioRef.current?.pause(); audioRef.current && (audioRef.current.src = ''); } catch {}
    setPlayerRec(null);
    setPlayerPlaying(false);
    setPlayerTime(0);
    setPlayerDur(0);
  }

  function playerToggle() {
    if (!audioRef.current || !playerRec) return;
    if (playerPlaying) { audioRef.current.pause(); setPlayerPlaying(false); }
    else { audioRef.current.play().then(() => setPlayerPlaying(true)).catch(() => addToast('Playback failed.', 'error')); }
  }

  function playerSeek(time: number) {
    if (!audioRef.current) return;
    const audio = audioRef.current;
    const t = Math.max(0, Math.min(time, audio.duration || 0));
    const wasPlaying = !audio.paused;
    audio.currentTime = t;
    setPlayerTime(t);
    // Resume playback after seek — some browsers pause to re-buffer on currentTime change
    if (wasPlaying) audio.play().catch(() => {});
  }

  function playerSkip(delta: number) {
    if (!audioRef.current) return;
    playerSeek(audioRef.current.currentTime + delta);
  }

  async function remove(rec: RecordingRow) {
    if (deletingId) return;
    if (!window.confirm(
      `Delete this recording permanently?\n\nAgent: ${rec.agent_name || '—'}\nCaptured: ${rec.created_at}\nDuration: ${formatDuration(rec.duration_ms)}`,
    )) return;
    setDeletingId(rec.recording_id);
    if (playerRec?.recording_id === rec.recording_id) closePlayer();
    try {
      await deleteRecording(rec.recording_id);
      // Optimistically remove from whichever bucket the row lives in.
      setDemoRecs(prev => prev.filter(r => r.recording_id !== rec.recording_id));
      setLiveRecs(prev => prev.filter(r => r.recording_id !== rec.recording_id));
      addToast('Recording deleted', 'success');
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : (e as Error).message;
      addToast(`Could not delete recording: ${msg}`, 'error');
    } finally {
      setDeletingId(null);
    }
  }

  const list = tab === 'demo' ? demoRecs : tab === 'live' ? liveRecs : [];
  const counts = {
    demo:   demoRecs.length,
    live:   liveRecs.length,
    chat:   chatSess.length,
    agents: agents.length,
  };
  const totalDuration = list.reduce((acc, r) => acc + (r.duration_ms || 0), 0);

  return (
    <div className="fade-up">
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.2em', color: 'var(--blue)', marginBottom: 10 }}>
          Voice Bots · Recordings
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.025em', color: 'var(--text-1)' }}>
          Live Call Logs
        </h1>
        <p style={{ color: 'var(--text-3)', fontSize: 15, marginTop: 8 }}>
          {loading
            ? 'Loading…'
            : `${counts.demo} demo · ${counts.live} live · ${counts.agents} agents`}
        </p>
      </div>

      {error && (
        <div
          role="alert"
          style={{
            background: 'rgba(255,90,120,0.1)',
            border: '1px solid rgba(255,90,120,0.4)',
            color: '#ff8194',
            padding: '12px 14px', borderRadius: 10,
            fontSize: 13, marginBottom: 16,
          }}
        >
          {error}
        </div>
      )}

      {/* Tab strip */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 24, flexWrap: 'wrap' }}>
        {[
          { key: 'demo',   label: 'Demo recordings',  cnt: counts.demo,   hint: 'Voice test sessions' },
          { key: 'live',   label: 'Live calls',       cnt: counts.live,   hint: 'From real telephony' },
          { key: 'chat',   label: 'Chat sessions',    cnt: counts.chat,   hint: 'Chatbot test conversations' },
          { key: 'agents', label: 'Agents',           cnt: counts.agents, hint: 'All agents on this account' },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key as Tab)}
            title={t.hint}
            style={{
              padding: '7px 14px', borderRadius: 99,
              background: 'var(--card-bg)',
              border: tab === t.key ? '1px solid var(--border-strong)' : '1px solid var(--border)',
              color: tab === t.key ? 'var(--text-1)' : 'var(--text-2)',
              cursor: 'pointer', fontSize: 12.5,
              display: 'inline-flex', alignItems: 'center', gap: 7,
              transition: 'all 0.15s',
            }}
          >
            {t.label}
            <span
              style={{
                fontSize: 10.5, padding: '1px 7px', borderRadius: 99,
                background: tab === t.key ? 'var(--purple)' : 'var(--tint-1)',
                color: tab === t.key ? '#fff' : 'var(--text-3)',
              }}
            >
              {t.cnt}
            </span>
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button
          onClick={() => { refresh().then(() => addToast('Refreshed', 'success')); }}
          style={{
            padding: '7px 12px', borderRadius: 99,
            background: 'var(--card-bg)',
            border: '1px solid var(--border)',
            color: 'var(--text-2)', cursor: 'pointer', fontSize: 12.5,
            display: 'inline-flex', alignItems: 'center', gap: 6,
            transition: 'all 0.15s',
          }}
        >
          <Icon name="refresh" size={12} /> Refresh
        </button>
      </div>

      <LiveStats counts={{
        total:      list.length,
        completed:  list.filter(r => (r.duration_ms || 0) > 0).length,
        inprogress: 0,
        declined:   0,
        pending:    list.filter(r => !r.signed_url).length,
      }} />

      {tab === 'chat' ? (
        <ChatSessionsTable sessions={chatSess} loading={loading} />
      ) : tab !== 'agents' ? (
        <RecordingsTable
          rows={list}
          loading={loading}
          emptyHint={
            tab === 'demo'
              ? 'No demo recordings yet — open any agent and click Start test, talk for a bit, then Stop test.'
              : 'No live call recordings yet — these appear once the telephony bridge starts writing live_call rows.'
          }
          playingId={playerRec?.recording_id ?? null}
          deletingId={deletingId}
          onPlay={openPlayer}
          onDelete={remove}
          onView={setSelectedRec}
          onDownload={downloadRec}
          downloadingId={downloadingId}
        />
      ) : (
        <AgentsTable agents={agents} loading={loading} />
      )}

      {selectedRec && createPortal(
        <RecordingDetailModal rec={selectedRec} onClose={() => setSelectedRec(null)} onDownload={downloadRec} />,
        document.body,
      )}

      {playerRec && createPortal(
        <AudioPlayerPopup
          rec={playerRec}
          playing={playerPlaying}
          currentTime={playerTime}
          duration={playerDur}
          onPlayPause={playerToggle}
          onSeek={playerSeek}
          onSkip={playerSkip}
          onClose={closePlayer}
        />,
        document.body,
      )}
    </div>
  );
}

// ── Recordings table ──────────────────────────────────────────────────────────
const PAGE_SIZE = 20;

function RecordingsTable({
  rows, loading, emptyHint, playingId, deletingId, downloadingId,
  onPlay, onDelete, onView, onDownload,
}: {
  rows: RecordingRow[];
  loading: boolean;
  emptyHint: string;
  playingId: string | null;
  deletingId: string | null;
  downloadingId: string | null;
  onPlay: (r: RecordingRow) => void;
  onDelete: (r: RecordingRow) => void;
  onView: (r: RecordingRow) => void;
  onDownload: (r: RecordingRow) => void;
}) {
  const [page, setPage] = useState(1);

  // Reset to page 1 whenever the list changes (tab switch / refresh)
  const prevLenRef = useRef(rows.length);
  if (prevLenRef.current !== rows.length) {
    prevLenRef.current = rows.length;
    if (page !== 1) setPage(1);
  }

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage   = Math.min(page, totalPages);
  const pageRows   = rows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const from       = rows.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const to         = Math.min(safePage * PAGE_SIZE, rows.length);

  const btnBase: React.CSSProperties = {
    minWidth: 32, height: 32, borderRadius: 8, padding: '0 10px',
    background: 'transparent', border: '1px solid var(--border)',
    color: 'var(--text-2)', cursor: 'pointer', fontSize: 12.5,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    transition: 'all 0.15s',
  };

  return (
    <div
      style={{
        background: 'var(--card-bg)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 22px', borderBottom: '1px solid var(--border)',
        }}
      >
        <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-1)', margin: 0 }}>
          {rows.length} recording{rows.length === 1 ? '' : 's'}
        </h3>
        {rows.length > PAGE_SIZE && (
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
            {from}–{to} of {rows.length}
          </span>
        )}
      </div>

      {loading && rows.length === 0 ? (
        <SkeletonTable rows={8} cols={['20%', '12%', '10%', '8%', '10%', '12%', '12%']} />
      ) : rows.length === 0 ? (
        <div style={{ padding: 24, color: 'var(--text-3)', fontSize: 13 }}>{emptyHint}</div>
      ) : (
        <>
          <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' as any }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 640 }}>
            <thead>
              <tr>
                {['Agent', 'Captured', 'Duration', 'Size', 'Language', 'Transcript', ''].map((h, i) => (
                  <th
                    key={h || `c${i}`}
                    style={{
                      textAlign: i === 6 ? 'right' : 'left',
                      padding: '12px 22px',
                      color: 'var(--text-3)',
                      fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.12em',
                      fontWeight: 500,
                      background: 'var(--surface-soft)',
                      borderBottom: '1px solid var(--border)',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageRows.map(r => {
                const isPlaying = playingId === r.recording_id;
                return (
                  <tr key={r.recording_id} data-recording-id={r.recording_id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '14px 22px' }}>
                      <div style={{ fontWeight: 500, color: 'var(--text-1)' }}>{r.agent_name || '—'}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
                        {(r.use_case_slug && SLUG_LABEL[r.use_case_slug]) || r.use_case_slug || ''}
                      </div>
                    </td>
                    <td style={{ padding: '14px 22px', color: 'var(--text-2)', fontSize: 12.5 }}>
                      {formatTime(r.created_at)}
                    </td>
                    <td style={{ padding: '14px 22px', color: 'var(--text-2)', fontFamily: "'Zalando Sans'", fontSize: 12.5 }}>
                      {formatDuration(r.duration_ms)}
                    </td>
                    <td style={{ padding: '14px 22px', color: 'var(--text-2)', fontFamily: "'Zalando Sans'", fontSize: 12.5 }}>
                      {formatSize(r.size_bytes)}
                    </td>
                    <td style={{ padding: '14px 22px' }}>
                      <span
                        style={{
                          fontSize: 10.5, padding: '2px 8px', borderRadius: 99,
                          background: 'var(--tint-2)', color: 'var(--text-2)',
                          fontFamily: "'Zalando Sans'", fontWeight: 600,
                        }}
                      >
                        {(r.language_code || 'en').toUpperCase()}
                      </span>
                    </td>
                    <td
                      className="ph-mask"
                      onClick={() => onView(r)}
                      style={{
                        padding: '14px 22px', color: 'var(--text-3)',
                        fontSize: 12, maxWidth: 320,
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        cursor: 'pointer',
                      }}
                      title="Click to view full transcript"
                      onMouseEnter={e => { e.currentTarget.style.color = 'var(--purple-hi)'; e.currentTarget.style.textDecoration = 'underline'; }}
                      onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-3)'; e.currentTarget.style.textDecoration = 'none'; }}
                    >
                      {r.transcript || <em style={{ color: 'var(--text-4)' }}>(no transcript)</em>}
                    </td>
                    <td style={{ padding: '14px 22px', textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: 6 }}>
                        <button
                          onClick={() => onPlay(r)}
                          disabled={!r.signed_url}
                          title={r.signed_url ? (isPlaying ? 'Pause' : 'Play recording') : 'Stored locally on backend (no signed URL)'}
                          style={{
                            width: 30, height: 30, borderRadius: 8,
                            background: isPlaying ? 'rgba(76,175,80,0.18)' : 'transparent',
                            border: `1px solid ${isPlaying ? 'var(--green)' : 'var(--border)'}`,
                            color: isPlaying ? 'var(--green)' : 'var(--text-2)',
                            cursor: r.signed_url ? 'pointer' : 'not-allowed',
                            opacity: r.signed_url ? 1 : 0.4,
                            display: 'inline-grid', placeItems: 'center',
                          }}
                        >
                          <Icon name={isPlaying ? 'pause' : 'play'} size={12} />
                        </button>
                        <button
                          onClick={() => onDownload(r)}
                          disabled={!r.signed_url || downloadingId === r.recording_id}
                          title={r.signed_url ? 'Download recording' : 'No download URL available'}
                          style={{
                            width: 30, height: 30, borderRadius: 8,
                            background: downloadingId === r.recording_id ? 'rgba(24,218,252,0.12)' : 'transparent',
                            border: `1px solid ${downloadingId === r.recording_id ? 'var(--blue)' : 'var(--border)'}`,
                            color: downloadingId === r.recording_id ? 'var(--blue)' : 'var(--text-2)',
                            cursor: r.signed_url ? 'pointer' : 'not-allowed',
                            opacity: r.signed_url ? 1 : 0.4,
                            display: 'inline-grid', placeItems: 'center',
                            transition: 'all 0.15s',
                          }}
                          onMouseEnter={e => { if (r.signed_url && downloadingId !== r.recording_id) { e.currentTarget.style.background = 'rgba(24,218,252,0.1)'; e.currentTarget.style.borderColor = 'var(--blue)'; e.currentTarget.style.color = 'var(--blue)'; } }}
                          onMouseLeave={e => { if (downloadingId !== r.recording_id) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-2)'; } }}
                        >
                          <Icon name={downloadingId === r.recording_id ? 'refresh' : 'export'} size={12} />
                        </button>
                        <button
                          onClick={() => onDelete(r)}
                          disabled={deletingId === r.recording_id}
                          title="Delete recording"
                          aria-label="Delete recording"
                          style={{
                            width: 30, height: 30, borderRadius: 8,
                            background: deletingId === r.recording_id ? 'rgba(255,90,120,0.15)' : 'transparent',
                            border: '1px solid var(--border)',
                            color: deletingId === r.recording_id ? 'var(--red)' : 'var(--text-2)',
                            cursor: deletingId === r.recording_id ? 'wait' : 'pointer',
                            display: 'inline-grid', placeItems: 'center',
                            transition: 'all 0.15s',
                          }}
                          onMouseEnter={e => {
                            if (deletingId !== r.recording_id) {
                              e.currentTarget.style.background = 'rgba(255,90,120,0.1)';
                              e.currentTarget.style.borderColor = 'rgba(255,90,120,0.4)';
                              e.currentTarget.style.color = 'var(--red)';
                            }
                          }}
                          onMouseLeave={e => {
                            if (deletingId !== r.recording_id) {
                              e.currentTarget.style.background = 'transparent';
                              e.currentTarget.style.borderColor = 'var(--border)';
                              e.currentTarget.style.color = 'var(--text-2)';
                            }
                          }}
                        >
                          <Icon name={deletingId === r.recording_id ? 'refresh' : 'x'} size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>

          {/* Pagination bar */}
          {totalPages > 1 && (
            <div
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                flexWrap: 'wrap', gap: 8,
                padding: '14px 22px', borderTop: '1px solid var(--border)',
              }}
            >
              <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
                Showing {from}–{to} of {rows.length}
              </span>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <button
                  onClick={() => setPage(1)}
                  disabled={safePage === 1}
                  style={{ ...btnBase, opacity: safePage === 1 ? 0.3 : 1, cursor: safePage === 1 ? 'default' : 'pointer' }}
                >
                  «
                </button>
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={safePage === 1}
                  style={{ ...btnBase, opacity: safePage === 1 ? 0.3 : 1, cursor: safePage === 1 ? 'default' : 'pointer' }}
                >
                  ‹ Prev
                </button>

                {/* Page number pills */}
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(p => p === 1 || p === totalPages || Math.abs(p - safePage) <= 1)
                  .reduce<(number | '…')[]>((acc, p, i, arr) => {
                    if (i > 0 && (p as number) - (arr[i - 1] as number) > 1) acc.push('…');
                    acc.push(p);
                    return acc;
                  }, [])
                  .map((p, i) =>
                    p === '…' ? (
                      <span key={`ellipsis-${i}`} style={{ fontSize: 12, color: 'var(--text-4)', padding: '0 4px' }}>…</span>
                    ) : (
                      <button
                        key={p}
                        onClick={() => setPage(p as number)}
                        style={{
                          ...btnBase,
                          background: safePage === p ? 'var(--tint-4)' : 'transparent',
                          border: safePage === p ? '1px solid var(--border-strong)' : '1px solid var(--border)',
                          color: safePage === p ? 'var(--text-1)' : 'var(--text-2)',
                          fontWeight: safePage === p ? 600 : 400,
                        }}
                      >
                        {p}
                      </button>
                    )
                  )}

                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={safePage === totalPages}
                  style={{ ...btnBase, opacity: safePage === totalPages ? 0.3 : 1, cursor: safePage === totalPages ? 'default' : 'pointer' }}
                >
                  Next ›
                </button>
                <button
                  onClick={() => setPage(totalPages)}
                  disabled={safePage === totalPages}
                  style={{ ...btnBase, opacity: safePage === totalPages ? 0.3 : 1, cursor: safePage === totalPages ? 'default' : 'pointer' }}
                >
                  »
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Recording detail modal ────────────────────────────────────────────────────
function parseTranscript(raw: string): { role: 'user' | 'agent'; text: string }[] {
  const turns: { role: 'user' | 'agent'; text: string }[] = [];
  const parts = raw.split(/(?=(?:User|Agent):\s)/i);
  for (const part of parts) {
    const m = part.match(/^(User|Agent):\s*([\s\S]*)/i);
    if (!m) continue;
    const role = m[1].toLowerCase() === 'user' ? 'user' : 'agent';
    const text = m[2].trim();
    if (text) turns.push({ role, text });
  }
  return turns.length ? turns : [{ role: 'agent', text: raw }];
}

function RecordingDetailModal({ rec, onClose, onDownload }: { rec: RecordingRow; onClose: () => void; onDownload: (r: RecordingRow) => void }) {
  const isMobile = useMediaQuery('(max-width: 640px)');
  const isTablet = useMediaQuery('(max-width: 1024px)');
  const turns = rec.transcript ? parseTranscript(rec.transcript) : [];

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
    };
  }, []);

  const panelStyle: React.CSSProperties = isMobile ? {
    position: 'fixed',
    left: 0, right: 0, bottom: 0,
    height: '88vh',
    width: '100%',
    borderRadius: '20px 20px 0 0',
    animation: 'sheetSlideUp 0.5s cubic-bezier(0.22, 1, 0.36, 1) both',
  } : isTablet ? {
    position: 'fixed',
    bottom: 20,
    left: '5vw', right: '5vw',
    height: 'min(640px, calc(100vh - 88px))',
    width: '90vw',
    borderRadius: 18,
    animation: 'transcriptPopIn 0.5s cubic-bezier(0.22, 1, 0.36, 1) both',
  } : {
    position: 'fixed',
    bottom: 20,
    right: 20,
    height: 'min(640px, calc(100vh - 88px))',
    width: 'min(calc(70vw - 60px), calc(100vw - 40px))',
    borderRadius: 18,
    animation: 'transcriptPopIn 0.5s cubic-bezier(0.22, 1, 0.36, 1) both',
  };

  return (
    <>
      <style>{`
        @keyframes transcriptPopIn {
          from { opacity: 0; transform: translateY(16px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0)    scale(1); }
        }
        @keyframes sheetSlideUp {
          from { opacity: 0; transform: translateY(40px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes bubbleDrop {
          from { opacity: 0; transform: translateY(-8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: isMobile ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.28)',
          backdropFilter: 'blur(3px)',
        }}
      />

      {/* Panel */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          ...panelStyle,
          zIndex: 1001,
          background: 'var(--card-bg)',
          border: '1px solid var(--border-strong)',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 20px 56px rgba(0,0,0,0.22), 0 4px 16px rgba(0,0,0,0.10)',
        }}
      >
        {/* Drag handle — mobile only */}
        {isMobile && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px', flexShrink: 0 }}>
            <div style={{ width: 36, height: 4, borderRadius: 99, background: 'var(--border-strong)' }} />
          </div>
        )}

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: isMobile ? '8px 14px 12px' : '13px 14px',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
          background: 'var(--card-bg)',
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: 9,
            background: 'rgba(117,91,227,0.15)',
            display: 'grid', placeItems: 'center', flexShrink: 0,
          }}>
            <Icon name="mic" size={14} style={{ color: 'var(--purple-hi)' }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {rec.agent_name || 'Recording'}
            </div>
            <div style={{ fontSize: 10.5, color: 'var(--text-3)', marginTop: 1 }}>
              {formatTime(rec.created_at)}
              {rec.duration_ms ? ` · ${formatDuration(rec.duration_ms)}` : ''}
              {rec.language_code ? ` · ${rec.language_code.toUpperCase()}` : ''}
              {rec.size_bytes ? ` · ${formatSize(rec.size_bytes)}` : ''}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
            {rec.signed_url && (
              <button
                onClick={() => onDownload(rec)}
                title="Download recording"
                style={{
                  width: 28, height: 28, borderRadius: 7,
                  background: 'transparent', border: '1px solid var(--border)',
                  color: 'var(--text-2)', display: 'grid', placeItems: 'center',
                  cursor: 'pointer', transition: 'all 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(24,218,252,0.1)'; e.currentTarget.style.borderColor = 'var(--blue)'; e.currentTarget.style.color = 'var(--blue)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-2)'; }}
              >
                <Icon name="export" size={12} />
              </button>
            )}
            <button
              onClick={onClose}
              style={{
                width: 28, height: 28, borderRadius: 7,
                background: 'transparent', border: '1px solid var(--border)',
                color: 'var(--text-2)', display: 'grid', placeItems: 'center',
                cursor: 'pointer',
              }}
            >
              <Icon name="x" size={12} />
            </button>
          </div>
        </div>

        {/* Audio player */}
        {rec.signed_url ? (
          <div style={{
            padding: '10px 14px',
            borderBottom: '1px solid var(--border)',
            flexShrink: 0,
            background: 'rgba(117,91,227,0.05)',
          }}>
            <div style={{ fontSize: 9.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-4)', marginBottom: 5 }}>
              Recording
            </div>
            <audio
              controls
              src={rec.signed_url}
              style={{ width: '100%', height: 32, accentColor: 'var(--purple-hi)' }}
            />
          </div>
        ) : (
          <div style={{
            padding: '8px 14px', borderBottom: '1px solid var(--border)',
            flexShrink: 0, background: 'var(--card-bg)',
          }}>
            <span style={{ fontSize: 11.5, color: 'var(--text-4)' }}>No playback URL — audio stored locally.</span>
          </div>
        )}

        {/* Transcript label */}
        <div style={{
          padding: '8px 14px 6px',
          flexShrink: 0,
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <span style={{ fontSize: 9.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-4)' }}>
            Transcript
          </span>
          {turns.length > 0 && (
            <span style={{
              fontSize: 9.5, padding: '1px 6px', borderRadius: 99,
              background: 'var(--tint-3)', color: 'var(--text-3)', fontWeight: 600,
            }}>
              {turns.length} turns
            </span>
          )}
        </div>

        {/* Chat bubbles */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {turns.length === 0 ? (
            <div style={{ color: 'var(--text-3)', fontSize: 13, textAlign: 'center', padding: '40px 0' }}>
              No transcript available.
            </div>
          ) : (
            turns.map((turn, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  justifyContent: turn.role === 'user' ? 'flex-end' : 'flex-start',
                  animation: 'bubbleDrop 0.5s cubic-bezier(0.22, 1, 0.36, 1) both',
                  animationDelay: `${Math.min(i * 0.08, 0.8)}s`,
                }}
              >
                <div
                  className="ph-mask"
                  style={{
                  maxWidth: '80%',
                  padding: '9px 12px',
                  borderRadius: turn.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                  background: turn.role === 'user' ? 'rgba(117,91,227,0.14)' : 'var(--card-bg-strong)',
                  border: `1px solid ${turn.role === 'user' ? 'rgba(117,91,227,0.28)' : 'var(--border)'}`,
                  fontSize: 13, lineHeight: 1.55, color: 'var(--text-1)',
                }}>
                  <div style={{
                    fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase',
                    letterSpacing: '0.1em', marginBottom: 4,
                    color: turn.role === 'user' ? 'var(--purple-hi)' : 'var(--text-4)',
                  }}>
                    {turn.role === 'user' ? 'User' : (rec.agent_name || 'Agent')}
                  </div>
                  {turn.text}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}

// ── Chat sessions table ───────────────────────────────────────────────────────
function ChatSessionsTable({ sessions, loading }: { sessions: ChatSessionRow[]; loading: boolean }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail]         = useState<ChatSessionDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [page, setPage] = useState(1);

  const prevLenRef = useRef(sessions.length);
  if (prevLenRef.current !== sessions.length) {
    prevLenRef.current = sessions.length;
    if (page !== 1) setPage(1);
  }

  const totalPages = Math.max(1, Math.ceil(sessions.length / PAGE_SIZE));
  const safePage   = Math.min(page, totalPages);
  const pageSess   = sessions.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const from       = sessions.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const to         = Math.min(safePage * PAGE_SIZE, sessions.length);

  const btnBase: React.CSSProperties = {
    minWidth: 32, height: 32, borderRadius: 8, padding: '0 10px',
    background: 'transparent', border: '1px solid var(--border)',
    color: 'var(--text-2)', cursor: 'pointer', fontSize: 12.5,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    transition: 'all 0.15s',
  };

  async function toggle(s: ChatSessionRow) {
    if (expandedId === s.session_id) { setExpandedId(null); setDetail(null); return; }
    setExpandedId(s.session_id);
    setDetail(null);
    setLoadingDetail(true);
    try {
      const d = await getChatSession(s.session_id);
      setDetail(d);
    } catch { /* show preview only */ }
    finally { setLoadingDetail(false); }
  }

  if (loading && sessions.length === 0)
    return <SkeletonTable rows={8} cols={['20%', '12%', '10%', '8%', '10%', '12%', '12%']} />;
  if (sessions.length === 0)
    return <div style={{ padding: 24, color: 'var(--text-3)', fontSize: 13 }}>No chat sessions yet — open a chatbot workspace, select an agent, and click "Start chat session".</div>;

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px', borderBottom: '1px solid var(--border)' }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-1)', margin: 0 }}>
          {sessions.length} chat session{sessions.length === 1 ? '' : 's'}
        </h3>
        {sessions.length > PAGE_SIZE && (
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
            {from}–{to} of {sessions.length}
          </span>
        )}
      </div>
      <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' as any }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 560 }}>
        <thead>
          <tr>
            {['Agent', 'Use case', 'Started', 'Messages', 'First message', ''].map((h, i) => (
              <th key={h || i} style={{
                textAlign: 'left', padding: '12px 22px',
                color: 'var(--text-3)', fontSize: 11, textTransform: 'uppercase',
                letterSpacing: '0.12em', fontWeight: 500,
                background: 'var(--surface-soft)', borderBottom: '1px solid var(--border)',
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {pageSess.map(s => {
            const isOpen = expandedId === s.session_id;
            return (
              <>
                <tr key={s.session_id} style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                    onClick={() => toggle(s)}>
                  <td style={{ padding: '14px 22px' }}>
                    <div style={{ fontWeight: 500, color: 'var(--text-1)' }}>{s.agent_name}</div>
                  </td>
                  <td style={{ padding: '14px 22px' }}>
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: 'rgba(117,91,227,0.12)', color: 'var(--purple-hi)', fontWeight: 600 }}>
                      {s.use_case_label || s.use_case_slug || '—'}
                    </span>
                  </td>
                  <td style={{ padding: '14px 22px', color: 'var(--text-2)', fontSize: 12.5 }}>
                    {formatTime(s.started_at)}
                  </td>
                  <td style={{ padding: '14px 22px', color: 'var(--text-2)', fontFamily: "'Zalando Sans'" }}>
                    {s.message_count}
                  </td>
                  <td className="ph-mask" style={{ padding: '14px 22px', color: 'var(--text-3)', fontSize: 12, maxWidth: 300, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {s.preview || <em>—</em>}
                  </td>
                  <td style={{ padding: '14px 22px', textAlign: 'right' }}>
                    <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{isOpen ? '▲ Hide' : '▼ View'}</span>
                  </td>
                </tr>
                {isOpen && (
                  <tr key={`${s.session_id}-detail`} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td colSpan={6} style={{ padding: '0 22px 20px' }}>
                      {loadingDetail ? (
                        <div style={{ padding: '16px 0', color: 'var(--text-3)', fontSize: 13 }}>Loading conversation…</div>
                      ) : detail ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16, maxHeight: 400, overflowY: 'auto' }}>
                          {detail.turns.map((t, i) => (
                            <div key={i} style={{ display: 'flex', justifyContent: t.role === 'user' ? 'flex-end' : 'flex-start' }}>
                              <div className="ph-mask" style={{
                                maxWidth: '70%', padding: '9px 14px', fontSize: 13, lineHeight: 1.55,
                                borderRadius: t.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                                background: t.role === 'user' ? 'rgba(117,91,227,0.12)' : 'var(--surface-soft)',
                                border: `1px solid ${t.role === 'user' ? 'rgba(117,91,227,0.25)' : 'var(--border)'}`,
                                color: 'var(--text-1)',
                              }}>
                                <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                                  {t.role === 'user' ? 'User' : detail.agent_name}
                                </div>
                                {t.text}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div style={{ padding: '12px 0', color: 'var(--text-3)', fontSize: 13 }}>Could not load conversation.</div>
                      )}
                    </td>
                  </tr>
                )}
              </>
            );
          })}
        </tbody>
      </table>
      </div>

      {/* Pagination bar */}
      {totalPages > 1 && (
        <div
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            flexWrap: 'wrap', gap: 8,
            padding: '14px 22px', borderTop: '1px solid var(--border)',
          }}
        >
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
            Showing {from}–{to} of {sessions.length}
          </span>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button
              onClick={() => setPage(1)}
              disabled={safePage === 1}
              style={{ ...btnBase, opacity: safePage === 1 ? 0.3 : 1, cursor: safePage === 1 ? 'default' : 'pointer' }}
            >«</button>
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={safePage === 1}
              style={{ ...btnBase, opacity: safePage === 1 ? 0.3 : 1, cursor: safePage === 1 ? 'default' : 'pointer' }}
            >‹ Prev</button>

            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter(p => p === 1 || p === totalPages || Math.abs(p - safePage) <= 1)
              .reduce<(number | '…')[]>((acc, p, i, arr) => {
                if (i > 0 && (p as number) - (arr[i - 1] as number) > 1) acc.push('…');
                acc.push(p);
                return acc;
              }, [])
              .map((p, i) =>
                p === '…' ? (
                  <span key={`ellipsis-${i}`} style={{ fontSize: 12, color: 'var(--text-4)', padding: '0 4px' }}>…</span>
                ) : (
                  <button
                    key={p}
                    onClick={() => setPage(p as number)}
                    style={{
                      ...btnBase,
                      background: safePage === p ? 'var(--tint-4)' : 'transparent',
                      border: safePage === p ? '1px solid var(--border-strong)' : '1px solid var(--border)',
                      color: safePage === p ? 'var(--text-1)' : 'var(--text-2)',
                      fontWeight: safePage === p ? 600 : 400,
                    }}
                  >{p}</button>
                )
              )}

            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={safePage === totalPages}
              style={{ ...btnBase, opacity: safePage === totalPages ? 0.3 : 1, cursor: safePage === totalPages ? 'default' : 'pointer' }}
            >Next ›</button>
            <button
              onClick={() => setPage(totalPages)}
              disabled={safePage === totalPages}
              style={{ ...btnBase, opacity: safePage === totalPages ? 0.3 : 1, cursor: safePage === totalPages ? 'default' : 'pointer' }}
            >»</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Agents overview ───────────────────────────────────────────────────────────
const AGENTS_PAGE_SIZE = 10;

function AgentsTable({ agents, loading }: { agents: Agent[]; loading: boolean }) {
  const [page, setPage] = useState(1);

  const prevLenRef = useRef(agents.length);
  if (prevLenRef.current !== agents.length) {
    prevLenRef.current = agents.length;
    if (page !== 1) setPage(1);
  }

  const totalPages = Math.max(1, Math.ceil(agents.length / AGENTS_PAGE_SIZE));
  const safePage   = Math.min(page, totalPages);
  const pageAgents = agents.slice((safePage - 1) * AGENTS_PAGE_SIZE, safePage * AGENTS_PAGE_SIZE);
  const from       = agents.length === 0 ? 0 : (safePage - 1) * AGENTS_PAGE_SIZE + 1;
  const to         = Math.min(safePage * AGENTS_PAGE_SIZE, agents.length);

  const btnBase: React.CSSProperties = {
    minWidth: 32, height: 32, borderRadius: 8, padding: '0 10px',
    background: 'transparent', border: '1px solid var(--border)',
    color: 'var(--text-2)', cursor: 'pointer', fontSize: 12.5,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    transition: 'all 0.15s',
  };

  if (loading && agents.length === 0) {
    return <SkeletonTable rows={8} cols={['20%', '12%', '10%', '8%', '10%', '12%', '12%']} />;
  }
  if (agents.length === 0) {
    return <div style={{ padding: 24, color: 'var(--text-3)', fontSize: 13 }}>No agents on this account yet.</div>;
  }

  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px', borderBottom: '1px solid var(--border)' }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-1)', margin: 0 }}>
          {agents.length} agent{agents.length === 1 ? '' : 's'}
        </h3>
        {agents.length > AGENTS_PAGE_SIZE && (
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{from}–{to} of {agents.length}</span>
        )}
      </div>

      <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' as any }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 480 }}>
        <thead>
          <tr>
            {['Name', 'Use case', 'Status', 'Direction', 'Created'].map(h => (
              <th
                key={h}
                style={{
                  textAlign: 'left',
                  padding: '12px 22px',
                  color: 'var(--text-3)',
                  fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.12em',
                  fontWeight: 500,
                  background: 'var(--surface-soft)',
                  borderBottom: '1px solid var(--border)',
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {pageAgents.map(a => (
            <tr key={a.id} style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '14px 22px', fontWeight: 500, color: 'var(--text-1)' }}>{a.name}</td>
              <td style={{ padding: '14px 22px', color: 'var(--text-2)' }}>
                {SLUG_LABEL[a.use_case_slug] || a.use_case_slug}
              </td>
              <td style={{ padding: '14px 22px' }}>
                <span
                  style={{
                    fontSize: 10.5, padding: '2px 8px', borderRadius: 99,
                    background: 'var(--tint-2)', color: 'var(--text-2)',
                    fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em',
                  }}
                >
                  {a.agent_flow_status.replace(/_/g, ' ')}
                </span>
              </td>
              <td style={{ padding: '14px 22px', color: 'var(--text-2)' }}>{a.call_direction}</td>
              <td style={{ padding: '14px 22px', color: 'var(--text-3)' }}>
                {a.created_at ? new Date(a.created_at).toLocaleDateString() : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>

      {/* Pagination bar */}
      {totalPages > 1 && (
        <div
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            flexWrap: 'wrap', gap: 8,
            padding: '14px 22px', borderTop: '1px solid var(--border)',
          }}
        >
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
            Showing {from}–{to} of {agents.length}
          </span>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button onClick={() => setPage(1)} disabled={safePage === 1}
              style={{ ...btnBase, opacity: safePage === 1 ? 0.3 : 1, cursor: safePage === 1 ? 'default' : 'pointer' }}>«</button>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={safePage === 1}
              style={{ ...btnBase, opacity: safePage === 1 ? 0.3 : 1, cursor: safePage === 1 ? 'default' : 'pointer' }}>‹ Prev</button>

            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter(p => p === 1 || p === totalPages || Math.abs(p - safePage) <= 1)
              .reduce<(number | '…')[]>((acc, p, i, arr) => {
                if (i > 0 && (p as number) - (arr[i - 1] as number) > 1) acc.push('…');
                acc.push(p);
                return acc;
              }, [])
              .map((p, i) =>
                p === '…' ? (
                  <span key={`ellipsis-${i}`} style={{ fontSize: 12, color: 'var(--text-4)', padding: '0 4px' }}>…</span>
                ) : (
                  <button key={p} onClick={() => setPage(p as number)}
                    style={{
                      ...btnBase,
                      background: safePage === p ? 'var(--tint-4)' : 'transparent',
                      border: safePage === p ? '1px solid var(--border-strong)' : '1px solid var(--border)',
                      color: safePage === p ? 'var(--text-1)' : 'var(--text-2)',
                      fontWeight: safePage === p ? 600 : 400,
                    }}
                  >{p}</button>
                )
              )}

            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={safePage === totalPages}
              style={{ ...btnBase, opacity: safePage === totalPages ? 0.3 : 1, cursor: safePage === totalPages ? 'default' : 'pointer' }}>Next ›</button>
            <button onClick={() => setPage(totalPages)} disabled={safePage === totalPages}
              style={{ ...btnBase, opacity: safePage === totalPages ? 0.3 : 1, cursor: safePage === totalPages ? 'default' : 'pointer' }}>»</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Audio Player Popup ────────────────────────────────────────────────────────
const WAVE_BARS = [
  { dur: 0.60, del: 0.00 }, { dur: 0.45, del: 0.07 }, { dur: 0.80, del: 0.14 }, { dur: 0.52, del: 0.21 }, { dur: 0.70, del: 0.03 },
  { dur: 0.90, del: 0.10 }, { dur: 0.55, del: 0.18 }, { dur: 0.65, del: 0.25 }, { dur: 0.48, del: 0.05 }, { dur: 0.75, del: 0.12 },
  { dur: 0.58, del: 0.20 }, { dur: 0.85, del: 0.28 }, { dur: 0.50, del: 0.08 }, { dur: 0.72, del: 0.16 }, { dur: 0.42, del: 0.23 },
  { dur: 0.68, del: 0.02 }, { dur: 0.88, del: 0.09 }, { dur: 0.53, del: 0.17 }, { dur: 0.78, del: 0.24 }, { dur: 0.46, del: 0.06 },
  { dur: 0.63, del: 0.13 }, { dur: 0.82, del: 0.22 }, { dur: 0.57, del: 0.29 }, { dur: 0.44, del: 0.04 }, { dur: 0.74, del: 0.11 },
  { dur: 0.92, del: 0.19 }, { dur: 0.49, del: 0.26 }, { dur: 0.67, del: 0.01 }, { dur: 0.56, del: 0.15 }, { dur: 0.83, del: 0.08 },
  { dur: 0.61, del: 0.27 }, { dur: 0.47, del: 0.13 }, { dur: 0.77, del: 0.20 }, { dur: 0.54, del: 0.06 }, { dur: 0.86, del: 0.23 },
  { dur: 0.43, del: 0.10 }, { dur: 0.71, del: 0.17 }, { dur: 0.59, del: 0.30 }, { dur: 0.89, del: 0.04 }, { dur: 0.64, del: 0.18 },
  { dur: 0.51, del: 0.25 }, { dur: 0.76, del: 0.09 }, { dur: 0.66, del: 0.16 }, { dur: 0.84, del: 0.02 }, { dur: 0.41, del: 0.22 },
  { dur: 0.73, del: 0.12 }, { dur: 0.62, del: 0.28 }, { dur: 0.87, del: 0.07 }, { dur: 0.48, del: 0.19 }, { dur: 0.69, del: 0.14 },
];

function fmtSecs(s: number) {
  if (!isFinite(s) || s < 0) return '0:00';
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

const playerCtrlBtn: React.CSSProperties = {
  width: 38, height: 38, borderRadius: 10,
  background: 'var(--tint-3)', border: '1px solid var(--border)',
  color: 'var(--text-1)', cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  gap: 3, fontSize: 11, fontWeight: 600, flexShrink: 0,
};

function AudioPlayerPopup({
  rec, playing, currentTime, duration,
  onPlayPause, onSeek, onSkip, onClose,
}: {
  rec: RecordingRow;
  playing: boolean;
  currentTime: number;
  duration: number;
  onPlayPause: () => void;
  onSeek: (t: number) => void;
  onSkip: (delta: number) => void;
  onClose: () => void;
}) {
  const pct        = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;
  const trackRef   = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  // Always-fresh refs so the global listeners never go stale across re-renders
  const durationRef = useRef(duration);
  const onSeekRef   = useRef(onSeek);
  durationRef.current = duration;
  onSeekRef.current   = onSeek;

  function seekAt(clientX: number) {
    if (!trackRef.current || durationRef.current <= 0) return;
    const rect  = trackRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    onSeekRef.current(ratio * durationRef.current);
  }

  // Attach once on mount — uses refs internally so always sees fresh values
  useEffect(() => {
    function onMove(e: MouseEvent) { if (isDragging.current) seekAt(e.clientX); }
    function onUp()  {
      if (!isDragging.current) return;
      isDragging.current = false;
      document.body.style.cursor     = '';
      document.body.style.userSelect = '';
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup',   onUp);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    isDragging.current = true;
    document.body.style.cursor     = 'grabbing';
    document.body.style.userSelect = 'none';
    seekAt(e.clientX);
  }

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 20,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9999,
        width: 'min(380px, 92vw)',
        background: 'var(--surface-elev)',
        border: '1px solid var(--border-strong)',
        borderRadius: 'var(--radius-xl)',
        boxShadow: '0 12px 48px rgba(0,0,0,0.4), 0 0 0 1px var(--border)',
        backdropFilter: 'blur(28px)',
        padding: '16px 18px 18px',
        display: 'flex', flexDirection: 'column', gap: 14,
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {rec.agent_name || 'Recording'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
            {(rec.use_case_slug && SLUG_LABEL[rec.use_case_slug]) || rec.use_case_slug || ''}
            {rec.created_at ? ` · ${formatTime(rec.created_at)}` : ''}
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            width: 26, height: 26, borderRadius: 7, flexShrink: 0,
            background: 'var(--tint-2)', border: '1px solid var(--border)',
            color: 'var(--text-3)', cursor: 'pointer',
            display: 'grid', placeItems: 'center',
          }}
        >
          <Icon name="x" size={11} />
        </button>
      </div>

      {/* Waveform */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 1.5, height: 36, width: '100%' }}>
        {WAVE_BARS.map((w, i) => (
          <div
            key={i}
            style={{
              flex: 1, minWidth: 0,
              height: '100%',
              borderRadius: 2,
              background: playing ? 'var(--blue)' : 'var(--tint-4)',
              transformOrigin: 'bottom center',
              transform: playing ? undefined : 'scaleY(0.12)',
              animation: playing
                ? `waveBar ${w.dur}s ${w.del}s ease-in-out infinite alternate`
                : 'none',
              transition: 'background 0.25s ease',
            }}
          />
        ))}
      </div>

      {/* Progress bar */}
      <div>
        <div
          ref={trackRef}
          onMouseDown={onMouseDown}
          style={{
            height: 6, borderRadius: 99, background: 'var(--tint-3)',
            cursor: duration > 0 ? 'pointer' : 'default', position: 'relative',
            userSelect: 'none',
          }}
        >
          <div style={{
            height: '100%', borderRadius: 99, background: 'var(--blue)',
            width: `${pct}%`, pointerEvents: 'none',
          }} />
          <div style={{
            position: 'absolute', top: '50%', left: `${pct}%`,
            transform: 'translate(-50%, -50%)', pointerEvents: 'none',
            width: 14, height: 14, borderRadius: '50%',
            background: 'var(--blue)', boxShadow: '0 0 0 4px rgba(24,218,252,0.25)',
            cursor: 'grab',
          }} />
        </div>
        <div style={{
          display: 'flex', justifyContent: 'space-between', marginTop: 5,
          fontSize: 11, color: 'var(--text-3)',
        }}>
          <span>{fmtSecs(currentTime)}</span>
          <span>{fmtSecs(duration)}</span>
        </div>
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
        <button onClick={() => onSkip(-10)} title="Back 10 seconds" style={playerCtrlBtn}>
          ‹‹ 10s
        </button>
        <button
          onClick={onPlayPause}
          title={playing ? 'Pause' : 'Play'}
          style={{
            width: 48, height: 48, borderRadius: '50%',
            background: 'var(--blue)', border: 'none',
            color: '#000', cursor: 'pointer',
            display: 'inline-grid', placeItems: 'center',
            boxShadow: playing ? '0 0 16px rgba(24,218,252,0.4)' : 'none',
            transition: 'box-shadow 0.2s ease',
          }}
        >
          <Icon name={playing ? 'pause' : 'play'} size={18} />
        </button>
        <button onClick={() => onSkip(10)} title="Forward 10 seconds" style={playerCtrlBtn}>
          10s ››
        </button>
      </div>
    </div>
  );
}
