/**
 * FlowsPage — visual no-code workflow builder.
 *
 * Left panel tabs: Agents | Apps | Webhooks
 * Canvas: drag-drop nodes, draw edges, click to edit
 * Right drawer: NodeEditDrawer — type-aware editor for any node
 */
import { useState, useRef, useEffect, useCallback, useId } from 'react';
import posthog from 'posthog-js';
import { useApp } from '../../context/AppContext';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import Icon from '../../assets/icons';
import { listAgents, type Agent } from '../../api/agents';
import { listConnections, type AppConnection } from '../../api/connections';
import {
  getComposioApps, getComposioConnections,
  getAppAuthInfo, connectComposioApp, connectComposioAppWithCredentials,
  appId as composioAppId, appLogo, connectedAppId, redirectUrl, isActiveConnection,
  type ComposioApp, type AuthInfoField,
} from '../../api/composio';
import {
  listWorkflows, createWorkflow, updateWorkflow, deleteWorkflow,
  withWebhookIdentity, isExecutableApp, isExecutableTrigger,
  type FlowNode, type FlowEdge, type WorkflowGraph, type Workflow,
} from '../../api/workflows';
import logger from '../../utils/logger';
import { useVoiceTarget } from '../../voice/registry/store';
import {
  FLOWS_NAME, FLOWS_NEW_WORKFLOW, FLOWS_SAVE, FLOWS_WORKFLOW_PICKER,
} from '../../voice/registry/flowsTargets';
import NodeEditDrawer, { LoadError, useDialogA11y } from './NodeEditDrawer';

// ── Constants ─────────────────────────────────────────────────────────────────
const TINT: Record<string, string> = {
  chat:             'var(--purple-hi)',
  voice:            'var(--blue)',
  escalation:       '#ff8194',
  demo_booking:     '#4ade80',
  both:             '#ffb547',
  webhook_to_agent: 'var(--teal)',
};

const NODE_W  = 192;
const NODE_H  = 68;
const HANDLE_R = 6;

function uid() { return Math.random().toString(36).slice(2, 9); }

/** Data the page fetches on mount. Each is loaded and retried independently so
 *  one failure can't hide the others, and so "failed" stays distinguishable
 *  from "empty" at each surface. */
type LoadKey = 'agents' | 'connections' | 'apps' | 'workflows';

/** Enter/Space handler for a div that acts as a button. */
function onActivate(fn: () => void) {
  return (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); }
  };
}

/** A fresh identity for a new inbound-webhook node. Stored inside actionConfig —
 *  the only node field the backend persists that accepts arbitrary keys. */
function newWebhookData(data: FlowNode['data']) {
  return withWebhookIdentity(data, uid(), `whsec_${uid()}${uid()}`);
}

function bezier(x1: number, y1: number, x2: number, y2: number) {
  const cx = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}`;
}

function rightHandle(n: FlowNode) { return { x: n.x + NODE_W, y: n.y + NODE_H / 2 }; }
function leftHandle(n: FlowNode)  { return { x: n.x,          y: n.y + NODE_H / 2 }; }

// ── Trigger picker (popover on edge click) ────────────────────────────────────
function TriggerPicker({ edge, x, y, onSelect, onDelete, onClose }: {
  edge: FlowEdge; x: number; y: number;
  onSelect: (t: FlowEdge['triggerType']) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  return (
    <div style={{ position:'absolute', left:x-90, top:y-80, background:'var(--card-bg)',
      border:'1px solid var(--border)', borderRadius:10, padding:'10px 12px', zIndex:60,
      boxShadow:'0 8px 32px rgba(0,0,0,0.55)', display:'flex', flexDirection:'column', gap:5,
    }} onClick={e => e.stopPropagation()}>
      <div style={{ fontSize:10, fontWeight:700, color:'var(--text-4)', letterSpacing:'0.1em', marginBottom:2 }}>
        TRIGGER WHEN
      </div>
      {(['escalation','demo_booking','both'] as const).map(t => (
        <button key={t} onClick={() => { onSelect(t); onClose(); }} style={{
          padding:'5px 10px', borderRadius:6, border:'none', cursor:'pointer',
          background: edge.triggerType===t ? `${TINT[t]}22` : 'transparent',
          color: edge.triggerType===t ? TINT[t] : 'var(--text-2)',
          fontSize:12, fontWeight:600, textAlign:'left',
          display:'flex', alignItems:'center', gap:6,
        }}>
          <Icon name={t==='escalation' ? 'zap' : t==='demo_booking' ? 'calendar' : 'shuffle'} size={13} />
          {t==='escalation' ? 'Escalation' : t==='demo_booking' ? 'Demo booked' : 'Both'}
        </button>
      ))}
      <hr style={{ border:'none', borderTop:'1px solid var(--border)', margin:'4px 0' }}/>
      <button onClick={onDelete} style={{ padding:'5px 10px', borderRadius:6, border:'none',
        cursor:'pointer', background:'transparent', color:'#ff8194', fontSize:12, fontWeight:600, textAlign:'left',
        display:'flex', alignItems:'center', gap:6 }}>
        <Icon name="trash" size={13} /> Delete edge
      </button>
    </div>
  );
}

// ── Webhook node type definition (static) ─────────────────────────────────────
const WEBHOOK_TEMPLATE = {
  type: 'webhook' as const,
  data: { appType: 'inbound_webhook', appLabel: 'Inbound Webhook', appIcon: 'webhook' },
};

// ── Main page ─────────────────────────────────────────────────────────────────
export default function FlowsPage() {
  const { addToast } = useApp();
  const isMobile = useMediaQuery('(max-width: 640px)');
  const isTablet = useMediaQuery('(max-width: 1024px)');

  // ── Voice targets ───────────────────────────────────────────────────────────
  // Voice is additive: these are ref callbacks, so each button keeps its own
  // onClick and the executor drives it through a real DOM click. Nothing about
  // the mouse or keyboard path changes.
  //
  // Only the safe controls are here. Delete and Clear are recognised by voice
  // too, but as `unavailable` entries in flowsTargets.ts with no element behind
  // them — voice names the limit instead of destroying anything. See that file.
  //
  // Called unconditionally at the top of the component, as hooks must be; the
  // refs below are attached to conditionally rendered JSX, which is fine —
  // registration follows the element, not the hook call.
  const saveRef       = useVoiceTarget<HTMLButtonElement>(FLOWS_SAVE);
  const pickerRef     = useVoiceTarget<HTMLButtonElement>(FLOWS_WORKFLOW_PICKER);
  const newWorkflowRef = useVoiceTarget<HTMLButtonElement>(FLOWS_NEW_WORKFLOW);
  // Slice 5's one real `type` target: a controlled input whose value IS the
  // workflow name, so dictating into it renames the workflow for real and Save
  // persists it. Unlike the topbar search box, something reads this.
  const nameRef       = useVoiceTarget<HTMLInputElement>(FLOWS_NAME);
  // Panel closed by default on mobile; open on tablet+desktop
  const [panelOpen, setPanelOpen] = useState(() =>
    typeof window !== 'undefined' ? !window.matchMedia('(max-width: 640px)').matches : true
  );

  const [agents,        setAgents]        = useState<Agent[]>([]);
  const [connections,   setConnections]   = useState<AppConnection[]>([]);
  const [composioApps,  setComposioApps]  = useState<ComposioApp[]>([]);
  const [composioConns, setComposioConns] = useState<Set<string>>(new Set());
  const [appsLoading,    setAppsLoading]    = useState(false);
  const [appSearch,      setAppSearch]      = useState('');
  const [connectingAppId, setConnectingAppId] = useState<string | null>(null);
  const appPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [hoveredAppId, setHoveredAppId] = useState<string | null>(null);
  const [credModal, setCredModal] = useState<{
    app: ComposioApp; fields: AuthInfoField[];
  } | null>(null);
  const [credValues, setCredValues] = useState<Record<string, string>>({});
  const [workflows,     setWorkflows]     = useState<Workflow[]>([]);
  const [savedFlow,   setSavedFlow]   = useState<Workflow | null>(null);
  const [showWfPicker, setShowWfPicker] = useState(false);

  const [loadFailed, setLoadFailed] = useState<Partial<Record<LoadKey, true>>>({});

  const [nodes, setNodes] = useState<FlowNode[]>([]);
  const [edges, setEdges] = useState<FlowEdge[]>([]);

  // Node being dragged on canvas
  const dragNode = useRef<{ id: string; ox: number; oy: number } | null>(null);
  // Edge being drawn
  const drawEdge = useRef<{ sourceId: string } | null>(null);
  const [previewLine, setPreviewLine] = useState<{ x1:number;y1:number;x2:number;y2:number }|null>(null);

  // Selected edge → trigger picker
  const [selectedEdge, setSelectedEdge] = useState<{ edge:FlowEdge; x:number; y:number }|null>(null);

  // Selected node → edit drawer
  const [editNode, setEditNode] = useState<FlowNode | null>(null);

  const [leftTab, setLeftTab] = useState<'agents'|'apps'|'webhooks'>('agents');
  const [flowName, setFlowName] = useState('My workflow');
  const [saving,   setSaving]   = useState(false);

  const canvasRef = useRef<HTMLDivElement>(null);
  const scrollWrapperRef = useRef<HTMLDivElement>(null);
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null);

  // ── Resizable left panel (desktop) ──────────────────────────────────────────
  const containerRef = useRef<HTMLDivElement>(null);
  const [panelWidth, setPanelWidth] = useState(220);
  const panelResizing = useRef(false);
  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!panelResizing.current || !containerRef.current) return;
      const left = containerRef.current.getBoundingClientRect().left;
      setPanelWidth(Math.min(460, Math.max(180, e.clientX - left)));
    }
    function onUp() {
      if (!panelResizing.current) return;
      panelResizing.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  // ── Load ────────────────────────────────────────────────────────────────────
  // These used to end in `.catch(console.warn)`, so a failed fetch left the UI
  // claiming there were simply no agents / no apps / no workflows. Each loader
  // now records its own failure (rendered as a retryable notice on the surface
  // that shows the data) and logs through the gated logger.
  const runLoad = useCallback((key: LoadKey) => {
    setLoadFailed(prev => { const next = { ...prev }; delete next[key]; return next; });
    const fail = (err: unknown) => {
      logger.warn(`[FlowsPage] failed to load ${key}`, err);
      setLoadFailed(prev => ({ ...prev, [key]: true }));
    };

    switch (key) {
      case 'agents':
        listAgents().then(setAgents).catch(fail);
        break;
      case 'connections':
        listConnections().then(setConnections).catch(fail);
        break;
      case 'apps':
        setAppsLoading(true);
        Promise.all([getComposioApps(), getComposioConnections()])
          .then(([apps, conns]) => {
            setComposioApps(apps);
            setComposioConns(new Set(conns.filter(isActiveConnection).map(connectedAppId)));
          })
          .catch(fail)
          .finally(() => setAppsLoading(false));
        break;
      case 'workflows':
        listWorkflows().then(ws => {
          setWorkflows(ws);
          if (ws.length > 0) {
            const w = ws[0];
            setSavedFlow(w); setFlowName(w.name);
            setNodes(w.graph.nodes); setEdges(w.graph.edges);
          }
        }).catch(fail);
        break;
    }
  }, []);

  useEffect(() => {
    (['agents', 'connections', 'apps', 'workflows'] as const).forEach(runLoad);
    return () => { if (appPollRef.current) clearInterval(appPollRef.current); };
  }, [runLoad]);

  // Prevent canvas-pan scroll while dragging a node — needs non-passive listener
  useEffect(() => {
    if (!isMobile) return;
    const el = scrollWrapperRef.current;
    if (!el) return;
    const block = (e: TouchEvent) => { if (dragNode.current) e.preventDefault(); };
    el.addEventListener('touchmove', block, { passive: false });
    return () => el.removeEventListener('touchmove', block);
  }, [isMobile]);

  // ── Drag from panel ─────────────────────────────────────────────────────────
  function onPanelDragStart(e: React.DragEvent, payload: Omit<FlowNode,'id'|'x'|'y'>) {
    e.dataTransfer.setData('candy/node', JSON.stringify(payload));
  }

  function onCanvasDrop(e: React.DragEvent) {
    e.preventDefault();
    const raw = e.dataTransfer.getData('candy/node');
    if (!raw) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = Math.max(0, e.clientX - rect.left - NODE_W/2);
    const y = Math.max(0, e.clientY - rect.top  - NODE_H/2);
    const payload = JSON.parse(raw) as Omit<FlowNode,'id'|'x'|'y'>;
    // For webhook nodes, assign a stable ID & signing secret
    const extra = payload.type === 'webhook' ? { data: newWebhookData(payload.data) } : {};
    const newNode: FlowNode = { ...payload, ...extra, id: uid(), x, y };
    setNodes(prev => [...prev, newNode]);
    posthog.capture('workflow_canvas_node_added', { node_type: payload.type });
    // Auto-open edit drawer for new nodes
    setEditNode(newNode);
  }

  // ── Node drag on canvas ─────────────────────────────────────────────────────
  function startNodeDrag(e: React.MouseEvent, nodeId: string) {
    e.stopPropagation();
    const node = nodes.find(n => n.id === nodeId)!;
    dragNode.current = { id: nodeId, ox: e.clientX - node.x, oy: e.clientY - node.y };
  }

  function onCanvasMouseMove(e: React.MouseEvent) {
    const rect = canvasRef.current!.getBoundingClientRect();
    if (dragNode.current) {
      const { id, ox, oy } = dragNode.current;
      setNodes(prev => prev.map(n =>
        n.id === id ? { ...n, x: Math.max(0, e.clientX-ox), y: Math.max(0, e.clientY-oy) } : n
      ));
    }
    if (drawEdge.current) {
      const src = nodes.find(n => n.id === drawEdge.current!.sourceId);
      if (src) {
        const rh = rightHandle(src);
        setPreviewLine({ x1:rh.x, y1:rh.y, x2:e.clientX-rect.left, y2:e.clientY-rect.top });
      }
    }
  }

  function onCanvasMouseUp() {
    dragNode.current = null;
    drawEdge.current = null;
    setPreviewLine(null);
  }

  // ── Canvas touch handlers (mobile node drag) ─────────────────────────────────
  function onCanvasTouchStart(e: React.TouchEvent) {
    if (!isMobile || e.touches.length !== 1) return;
    if ((e.target as HTMLElement).closest('[data-handle]')) return;
    if (connectingFrom) return;
    const touch = e.touches[0];
    const rect  = canvasRef.current!.getBoundingClientRect();
    const cx = touch.clientX - rect.left;
    const cy = touch.clientY - rect.top;
    const hit = nodes.find(n =>
      cx >= n.x && cx <= n.x + NODE_W && cy >= n.y && cy <= n.y + NODE_H
    );
    if (hit) dragNode.current = { id: hit.id, ox: cx - hit.x, oy: cy - hit.y };
  }

  function onCanvasTouchMove(e: React.TouchEvent) {
    if (!dragNode.current || e.touches.length !== 1) return;
    const touch = e.touches[0];
    const rect  = canvasRef.current!.getBoundingClientRect();
    const cx = touch.clientX - rect.left;
    const cy = touch.clientY - rect.top;
    const { id, ox, oy } = dragNode.current;
    setNodes(prev => prev.map(n =>
      n.id === id ? { ...n, x: Math.max(0, cx - ox), y: Math.max(0, cy - oy) } : n
    ));
  }

  function onCanvasTouchEnd() { dragNode.current = null; }

  // ── Edge drawing ─────────────────────────────────────────────────────────────
  function startDrawEdge(e: React.MouseEvent, sourceId: string) {
    e.stopPropagation();
    drawEdge.current = { sourceId };
  }

  function tryConnect(srcId: string, targetId: string) {
    if (srcId === targetId) return;
    const src = nodes.find(n => n.id === srcId);
    const tgt = nodes.find(n => n.id === targetId);
    if (!src || !tgt) return;
    if (src.type === 'app') return; // apps can never be a source
    if (src.type === 'webhook' && tgt.type === 'webhook') return;
    if (edges.find(ed => ed.source === srcId && ed.target === targetId)) return;
    const triggerType: FlowEdge['triggerType'] =
      (src.type === 'webhook' && tgt.type === 'agent') ? 'webhook_to_agent' : 'escalation';
    setEdges(prev => [...prev, { id: uid(), source: srcId, target: targetId, triggerType }]);
    posthog.capture('workflow_canvas_edge_connected', { trigger_type: triggerType });
  }

  function finishDrawEdge(e: React.MouseEvent, targetId: string) {
    e.stopPropagation();
    if (!drawEdge.current) return;
    tryConnect(drawEdge.current.sourceId, targetId);
    drawEdge.current = null;
    setPreviewLine(null);
  }

  // ── Node click → edit drawer ─────────────────────────────────────────────────
  function onNodeClick(e: React.MouseEvent, node: FlowNode) {
    e.stopPropagation();
    if (dragNode.current) return;
    // In connecting mode: tap any node body (not the source) to complete the connection
    if (connectingFrom && connectingFrom !== node.id) {
      tryConnect(connectingFrom, node.id);
      setConnectingFrom(null);
      return;
    }
    setSelectedEdge(null);
    setConnectingFrom(null);
    setEditNode(prev => prev?.id === node.id ? null : node);
  }

  // ── Update node data from drawer ─────────────────────────────────────────────
  function updateNodeData(nodeId: string, data: Partial<FlowNode['data']>) {
    setNodes(prev => prev.map(n =>
      n.id === nodeId ? { ...n, data: { ...n.data, ...data } } : n
    ));
    // Keep editNode in sync
    setEditNode(prev => prev?.id === nodeId ? { ...prev, data: { ...prev.data, ...data } } : prev);
  }

  // ── Delete ───────────────────────────────────────────────────────────────────
  function deleteNode(id: string) {
    setNodes(prev => prev.filter(n => n.id !== id));
    setEdges(prev => prev.filter(e => e.source !== id && e.target !== id));
    if (editNode?.id === id) setEditNode(null);
    posthog.capture('workflow_canvas_node_deleted', {});
  }

  // ── Tap-to-add (mobile) — places node at next auto-position ─────────────────
  function addNodeFromPanel(payload: Omit<FlowNode,'id'|'x'|'y'>) {
    const x = 30;
    const y = 30 + nodes.length * (NODE_H + 22);
    const extra = payload.type === 'webhook' ? { data: newWebhookData(payload.data) } : {};
    const newNode: FlowNode = { ...payload, ...extra, id: uid(), x, y };
    setNodes(prev => [...prev, newNode]);
    setEditNode(newNode);
    setPanelOpen(false);
  }

  // ── Load a workflow into the canvas ──────────────────────────────────────────
  function loadWorkflow(w: Workflow) {
    setSavedFlow(w); setFlowName(w.name);
    setNodes(w.graph.nodes); setEdges(w.graph.edges);
    setEditNode(null); setSelectedEdge(null); setShowWfPicker(false);
  }

  // ── New blank workflow ────────────────────────────────────────────────────────
  function newWorkflow() {
    setSavedFlow(null); setFlowName('New workflow');
    setNodes([]); setEdges([]);
    setEditNode(null); setSelectedEdge(null); setShowWfPicker(false);
  }

  // ── Delete workflow ───────────────────────────────────────────────────────────
  async function removeWorkflow(w: Workflow) {
    try {
      await deleteWorkflow(w.id);
      const updated = workflows.filter(x => x.id !== w.id);
      setWorkflows(updated);
      if (savedFlow?.id === w.id) {
        if (updated.length > 0) loadWorkflow(updated[0]);
        else newWorkflow();
      }
      addToast('Workflow deleted', 'success');
    } catch { addToast('Delete failed', 'error'); }
  }

  // ── Save ─────────────────────────────────────────────────────────────────────
  async function saveWorkflow() {
    posthog.capture('workflow_canvas_save_clicked', { node_count: nodes.length });
    setSaving(true);
    const graph: WorkflowGraph = { nodes, edges };
    try {
      let w: Workflow;
      if (savedFlow) {
        // PUT is a full-model replace, not a patch — anything omitted is reset
        // to the backend's Pydantic default (description → null, is_active →
        // true). Carry the saved workflow's current values through explicitly.
        w = await updateWorkflow(savedFlow.id, {
          name:        flowName,
          graph,
          description: savedFlow.description ?? null,
          is_active:   savedFlow.is_active,
        });
        setWorkflows(prev => prev.map(x => x.id === w.id ? w : x));
      } else {
        w = await createWorkflow({ name: flowName, graph, is_active: true });
        setWorkflows(prev => [...prev, w]);
      }
      setSavedFlow(w);
      addToast('Workflow saved', 'success');
    } catch { addToast('Save failed', 'error'); }
    finally { setSaving(false); }
  }

  // ── Connect a Composio app from within the panel ────────────────────────────
  async function handleConnectApp(app: ComposioApp) {
    const id = composioAppId(app);
    if (connectingAppId === id) return;
    posthog.capture('connector_connect_clicked', { provider: id });
    setConnectingAppId(id);
    try {
      // Step 1: find out what auth flow this app needs
      const info = await getAppAuthInfo(id);

      // Step 2a: no credentials needed — connect instantly
      if (info.auth_type === 'no_auth') {
        await connectComposioApp(id);
        setComposioConns(prev => new Set([...prev, id]));
        addToast(`${app.name} connected`, 'success');
        setConnectingAppId(null);
        return;
      }

      // Step 2b: API key — show credentials form
      if (info.auth_type === 'api_key') {
        const fields = info.required_fields ?? [{ name: 'api_key', label: 'API Key', type: 'password' }];
        setCredValues(Object.fromEntries(fields.map(f => [f.name, ''])));
        setCredModal({ app, fields });
        setConnectingAppId(null);
        return;
      }

      // Step 2c: OAuth — open popup and poll
      const res = await connectComposioApp(id);
      const url = redirectUrl(res);
      if (!url) throw new Error('No redirect URL');
      const popup = window.open(url, '_blank', 'width=640,height=720,noopener');
      // Track when popup first closed so we give the backend a grace period
      // to finish processing the OAuth callback before we give up.
      let popupClosedAt: number | null = null;
      const GRACE_MS = 10_000; // keep polling 10s after popup closes

      appPollRef.current = setInterval(async () => {
        const closed = !popup || popup.closed;
        if (closed && popupClosedAt === null) popupClosedAt = Date.now();

        try {
          const conns = await getComposioConnections();
          const ids   = new Set(conns.filter(isActiveConnection).map(connectedAppId));
          if (ids.has(id)) {
            setComposioConns(ids);
            clearInterval(appPollRef.current!);
            appPollRef.current = null;
            setConnectingAppId(null);
            addToast(`${app.name} connected`, 'success');
          } else if (closed && popupClosedAt !== null && Date.now() - popupClosedAt > GRACE_MS) {
            // Grace period expired with no confirmed connection — user likely cancelled
            posthog.capture('connector_oauth_abandoned', { provider: id });
            clearInterval(appPollRef.current!);
            appPollRef.current = null;
            setConnectingAppId(null);
          }
        } catch {
          if (closed && popupClosedAt !== null && Date.now() - popupClosedAt > GRACE_MS) {
            posthog.capture('connector_oauth_abandoned', { provider: id });
            clearInterval(appPollRef.current!);
            appPollRef.current = null;
            setConnectingAppId(null);
          }
        }
      }, 1500); // poll every 1.5s for faster feedback
    } catch {
      addToast(`Could not connect ${app.name}`, 'error');
      setConnectingAppId(null);
    }
  }

  // ── Submit API-key credentials from the modal ────────────────────────────────
  async function handleCredSubmit() {
    if (!credModal) return;
    const id = composioAppId(credModal.app);
    setConnectingAppId(id);
    try {
      await connectComposioAppWithCredentials(id, credValues);
      setComposioConns(prev => new Set([...prev, id]));
      addToast(`${credModal.app.name} connected`, 'success');
      setCredModal(null);
      setCredValues({});
    } catch {
      addToast(`Could not connect ${credModal.app.name}`, 'error');
    } finally {
      setConnectingAppId(null);
    }
  }

  // Stable identities — useDialogA11y keys its focus/Escape effect off these.
  const closeDrawer    = useCallback(() => setEditNode(null), []);
  const closeCredModal = useCallback(() => { setCredModal(null); setConnectingAppId(null); }, []);

  // ── Node appearance ──────────────────────────────────────────────────────────
  function nodeColor(node: FlowNode) {
    if (node.type === 'agent')   return node.data.agentType === 'chat' ? 'var(--purple-hi)' : 'var(--blue)';
    if (node.type === 'webhook') return 'var(--teal)';
    return '#7b5be3';
  }

  function nodeIcon(node: FlowNode) {
    if (node.type === 'agent')   return node.data.agentType === 'chat' ? 'bot' : 'phone';
    if (node.type === 'webhook') return 'webhook';
    return node.data.appIcon ?? 'plug';
  }

  function nodeLabel(node: FlowNode) {
    if (node.type === 'agent') return node.data.agentName ?? 'Agent';
    return node.data.appLabel ?? node.data.appType ?? 'Node';
  }

  // Is this node a source — has a right handle to drag from?
  const isSource = (n: FlowNode) => n.type === 'agent' || n.type === 'webhook';
  // Is this node a target — has a left handle to drop onto?
  // Agents can receive from webhooks; apps can receive from agents or webhooks.
  const isTarget = (n: FlowNode) => n.type === 'app' || n.type === 'webhook' || n.type === 'agent';

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div ref={containerRef} style={{ display:'flex', height:'calc(100vh - 48px)',
      background:'var(--bg-0)', position:'relative', overflow:'hidden' }}>

      {/* ── Mobile backdrop — closes panel on tap outside ── */}
      {isMobile && panelOpen && (
        <div
          aria-hidden="true"
          onClick={() => setPanelOpen(false)}
          style={{
            position: 'absolute', inset: 0,
            background: 'rgba(0,0,0,0.5)', zIndex: 40,
          }}
        />
      )}

      {/* ── Left panel ─────────────────────────────────────────────────────── */}
      <div style={{
        ...leftPanel,
        // Desktop: width is user-resizable via the drag handle on the right edge
        ...(!isMobile && !isTablet ? { width: panelWidth } : {}),
        // Tablet: narrower in-flow panel; hide when closed
        ...(isTablet && !isMobile ? {
          width: 190,
          display: panelOpen ? 'flex' : 'none',
        } : {}),
        // Mobile: absolute overlay, slide-in via transform
        ...(isMobile ? {
          position: 'absolute',
          top: 0, left: 0, bottom: 0,
          width: 'min(280px, 85vw)' as any,
          zIndex: 50,
          transform: panelOpen ? 'translateX(0)' : 'translateX(-105%)',
          transition: 'transform 0.25s cubic-bezier(0.4,0,0.2,1)',
          boxShadow: panelOpen ? '4px 0 24px rgba(0,0,0,0.5)' : 'none',
        } : {}),
      }}>
        {/* Mobile panel header with close button */}
        {isMobile && (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
            padding:'10px 10px 0', flexShrink:0 }}>
            <span style={{ fontSize:11, fontWeight:700, color:'var(--text-4)', letterSpacing:'0.08em' }}>
              ADD TO CANVAS
            </span>
            <button onClick={() => setPanelOpen(false)} aria-label="Close panel"
              style={{ background:'none', border:'none', color:'var(--text-3)',
                cursor:'pointer', fontSize:18, lineHeight:1, padding:'2px 6px' }}>
              ×
            </button>
          </div>
        )}
        {/* Tabs */}
        <div role="tablist" aria-label="Canvas building blocks"
          style={{ display:'flex', borderBottom:'1px solid var(--border)', padding:'0 6px', flexShrink:0, height:44, alignItems:'stretch' }}>
          {(['agents','apps','webhooks'] as const).map(tab => (
            <button key={tab} role="tab" aria-selected={leftTab===tab}
              onClick={() => setLeftTab(tab)} style={leftTabBtn(leftTab===tab)}>
              {tab.charAt(0).toUpperCase()+tab.slice(1)}
            </button>
          ))}
        </div>

        <div style={{ padding:'8px 6px', overflowY:'auto', flex:1 }}>
          {/* ── Agents tab ── */}
          {leftTab === 'agents' && (
            loadFailed.agents
              ? <LoadError what="your agents" onRetry={() => runLoad('agents')} />
              : agents.length === 0
              ? <p style={{ fontSize:12, color:'var(--text-4)', padding:'10px 6px' }}>
                  No agents — create one in Chatbots or Voice Bots.
                </p>
              : agents.map(agent => {
                // Treat as chat if call_direction is 'chat' OR use_case_slug is a known chatbot slug
                const CHAT_SLUGS = ['cs','tech','health','bank','appt','hr','chatbot','chat'];
                const isChat = agent.call_direction === 'chat'
                  || CHAT_SLUGS.some(s => agent.use_case_slug?.includes(s));
                const color  = isChat ? 'var(--purple-hi)' : 'var(--blue)';
                const agentPayload = { type: 'agent' as const, data: { agentId: agent.id, agentName: agent.name, agentType: isChat ? 'chat' as const : 'voice' as const } };
                return (
                  <div key={agent.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`Add ${agent.name} (${isChat ? 'chatbot' : 'voice'}) to the canvas`}
                    draggable={!isMobile}
                    onDragStart={!isMobile ? (e => onPanelDragStart(e, agentPayload)) : undefined}
                    onClick={isMobile ? () => addNodeFromPanel(agentPayload) : undefined}
                    // Drag-and-drop is pointer-only, so the keyboard path adds the
                    // node directly — same as the mobile tap.
                    onKeyDown={onActivate(() => addNodeFromPanel(agentPayload))}
                    style={panelCard(color)}
                  >
                    <span style={{ display:'inline-flex', color, flexShrink:0 }}><Icon name={isChat ? 'bot' : 'phone'} size={16} /></span>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:12, fontWeight:600, color:'var(--text-1)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {agent.name}
                      </div>
                      <span style={tagChip(color)}>{isChat ? 'chatbot' : 'voice'}</span>
                    </div>
                    <span style={{ fontSize:10, color:'var(--text-4)' }}>{isMobile ? '＋' : '⠿'}</span>
                  </div>
                );
              })
          )}

          {/* ── Apps tab ── */}
          {leftTab === 'apps' && (
            <>
              {/* Search */}
              <input
                aria-label="Search apps"
                value={appSearch}
                onChange={e => setAppSearch(e.target.value)}
                placeholder="Search apps…"
                style={{
                  width: '100%', boxSizing: 'border-box',
                  padding: '6px 10px', marginBottom: 8, borderRadius: 8,
                  fontSize: 12, background: 'var(--tint-2)',
                  border: '1px solid var(--border)', color: 'var(--text-1)', outline: 'none',
                }}
              />

              {loadFailed.apps ? (
                <LoadError what="the app catalogue" onRetry={() => runLoad('apps')} />
              ) : appsLoading ? (
                <p style={{ fontSize:12, color:'var(--text-4)', padding:'10px 6px' }}>Loading apps…</p>
              ) : composioApps.length === 0 ? (
                <p style={{ fontSize:12, color:'var(--text-4)', padding:'10px 6px' }}>
                  No apps available — connect via the Connects page first.
                </p>
              ) : (
                composioApps
                  .filter(app => !appSearch || app.name.toLowerCase().includes(appSearch.toLowerCase()))
                  .map((app: ComposioApp) => {
                    const id           = composioAppId(app);
                    const isConnected  = composioConns.has(id);
                    const isConnecting = connectingAppId === id;
                    const logo         = appLogo(app);
                    const appPayload   = {
                      type: 'app' as const,
                      data: { appType: id, appLabel: app.name, appIcon: logo ?? 'plug' },
                    };
                    const isHovered = hoveredAppId === id;
                    // Bug 4: the flow engine only knows how to act on a handful of
                    // apps — anything else saves fine but is skipped at run time.
                    const runnable = isExecutableApp(id);
                    return (
                      <div key={id}
                        role={isConnected ? 'button' : undefined}
                        tabIndex={isConnected ? 0 : undefined}
                        aria-label={isConnected
                          ? `Add ${app.name} to the canvas${runnable ? '' : ' — no flow action yet, this step will be skipped'}`
                          : undefined}
                        draggable={!isMobile && isConnected}
                        onDragStart={(!isMobile && isConnected) ? (e => onPanelDragStart(e, appPayload)) : undefined}
                        onClick={isMobile && isConnected ? () => addNodeFromPanel(appPayload) : undefined}
                        onKeyDown={isConnected ? onActivate(() => addNodeFromPanel(appPayload)) : undefined}
                        onMouseEnter={() => setHoveredAppId(id)}
                        onMouseLeave={() => setHoveredAppId(null)}
                        style={{
                          ...panelCard(isConnected ? 'var(--green)' : 'var(--border)'),
                          cursor: isConnected ? (isMobile ? 'pointer' : 'grab') : 'default',
                          opacity: isConnecting ? 0.7 : 1,
                          alignItems: 'flex-start',
                          flexWrap: 'wrap',
                        }}
                      >
                        {/* Top row: logo + name + status */}
                        <div style={{ display:'flex', alignItems:'center', gap:8, width:'100%' }}>
                          {logo ? (
                            <img src={logo} alt={app.name}
                              style={{ width:20, height:20, objectFit:'contain', borderRadius:4, flexShrink:0 }} />
                          ) : (
                            <span style={{ display:'inline-flex', color:'var(--text-3)', flexShrink:0 }}><Icon name="plug" size={16} /></span>
                          )}
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ fontSize:12, fontWeight:600, color:'var(--text-1)', wordBreak:'break-word', lineHeight:1.3 }}>
                              {app.name}
                            </div>
                            {!runnable && (
                              <span
                                title="Candy's flow engine has no action for this app yet — a flow step using it is skipped at run time"
                                style={{ fontSize:9, fontWeight:700, color:'var(--amber)',
                                  background:'rgba(255,181,71,0.14)', borderRadius:4, padding:'1px 5px' }}
                              >
                                no flow action yet
                              </span>
                            )}
                          </div>
                          {isConnected ? (
                            <span style={{ fontSize:9, fontWeight:700, flexShrink:0,
                              color:'var(--green)', background:'rgba(76,175,80,0.14)',
                              borderRadius:4, padding:'2px 5px',
                            }}>●</span>
                          ) : (
                            <button
                              onClick={e => { e.stopPropagation(); handleConnectApp(app); }}
                              disabled={isConnecting}
                              style={{
                                flexShrink:0, padding:'3px 8px', borderRadius:5,
                                fontSize:9.5, fontWeight:600, cursor: isConnecting ? 'wait' : 'pointer',
                                background: isConnecting ? 'var(--tint-2)' : 'rgba(0,113,227,0.12)',
                                border: `1px solid ${isConnecting ? 'var(--border)' : 'rgba(0,113,227,0.3)'}`,
                                color: isConnecting ? 'var(--text-4)' : 'var(--blue)',
                                transition:'all 0.15s',
                              }}
                            >
                              {isConnecting ? '…' : 'Connect'}
                            </button>
                          )}
                        </div>

                        {/* Description — animates in/out on hover */}
                        {app.description && (
                          <div style={{
                            width: '100%',
                            overflow: 'hidden',
                            maxHeight: isHovered ? '120px' : '0px',
                            opacity: isHovered ? 1 : 0,
                            marginTop: isHovered ? 6 : 0,
                            paddingTop: isHovered ? 6 : 0,
                            borderTop: isHovered ? '1px solid var(--border)' : '1px solid transparent',
                            fontSize: 11,
                            color: 'var(--text-3)',
                            lineHeight: 1.5,
                            userSelect: 'none',
                            pointerEvents: 'none',
                            transition: 'max-height 0.28s cubic-bezier(0.4,0,0.2,1), opacity 0.22s ease, margin-top 0.28s ease, padding-top 0.28s ease',
                          }}>
                            {app.description}
                          </div>
                        )}
                      </div>
                    );
                  })
              )}
            </>
          )}

          {/* ── Webhooks tab ── */}
          {leftTab === 'webhooks' && (
            <>
              <p style={{ fontSize:11.5, color:'var(--text-4)', padding:'4px 6px 10px', lineHeight:1.6 }}>
                {isMobile
                  ? <>Tap to add an <strong style={{ color:'var(--teal)' }}>Inbound Webhook</strong> node. Each tap creates a new unique URL with its own secret.</>
                  : <>Drag an <strong style={{ color:'var(--teal)' }}>Inbound Webhook</strong> node onto the canvas. Each drag creates a <strong style={{ color:'var(--text-2)' }}>new unique URL</strong> with its own secret.</>
                }
              </p>
              <div
                role="button"
                tabIndex={0}
                aria-label="Add an Inbound Webhook node to the canvas"
                draggable={!isMobile}
                onDragStart={!isMobile ? (e => onPanelDragStart(e, WEBHOOK_TEMPLATE)) : undefined}
                onClick={isMobile ? () => addNodeFromPanel(WEBHOOK_TEMPLATE) : undefined}
                onKeyDown={onActivate(() => addNodeFromPanel(WEBHOOK_TEMPLATE))}
                style={panelCard('var(--teal)')}
              >
                <span style={{ display:'inline-flex', color:'var(--teal)', flexShrink:0 }}><Icon name="webhook" size={16} /></span>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:12, fontWeight:600, color:'var(--text-1)' }}>Inbound Webhook</div>
                  <div style={{ fontSize:10.5, color:'var(--text-4)' }}>External POST → trigger flow</div>
                </div>
                <span style={{ fontSize:10, color:'var(--text-4)' }}>{isMobile ? '＋' : '⠿'}</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Resize handle — drag to set panel width (desktop only) ──────────── */}
      {!isMobile && !isTablet && (
        <div
          onMouseDown={() => {
            panelResizing.current = true;
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
          }}
          title="Drag to resize panel"
          style={{
            width: 6, flexShrink: 0, cursor: 'col-resize',
            marginLeft: -3, zIndex: 6,
            background: 'transparent', transition: 'background 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--border-strong)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        />
      )}

      {/* ── Canvas area ────────────────────────────────────────────────────── */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', position:'relative',
        marginRight: (editNode && !isMobile) ? (isTablet ? 300 : 340) : 0,
        transition:'margin-right 0.22s ease' }}>

        {/* Toolbar */}
        <div style={{ ...toolbar, gap: isMobile ? 6 : 10, padding: isMobile ? '0 10px' : '0 14px' }}>
          {/* Panel toggle button — mobile + tablet */}
          {(isMobile || isTablet) && (
            <button
              onClick={() => setPanelOpen(p => !p)}
              title="Toggle panel"
              style={{ ...ghostBtn, padding:'6px 9px', flexShrink:0, fontSize:16, display:'inline-flex', alignItems:'center' }}
            >
              <Icon name="menu" size={16} />
            </button>
          )}
          {/* Workflow switcher */}
          <div style={{ position:'relative', flexShrink:0 }}>
            <button ref={pickerRef} onClick={() => setShowWfPicker(p => !p)}
              aria-haspopup="true" aria-expanded={showWfPicker}
              aria-label={`Switch workflow — currently ${savedFlow ? savedFlow.name : 'New workflow'}`}
              style={{
              display:'flex', alignItems:'center', gap:6,
              padding:'6px 10px', borderRadius:8, border:'1px solid var(--border)',
              background:'var(--bg-0)', color:'var(--text-2)', fontSize:12,
              cursor:'pointer', maxWidth:160, overflow:'hidden',
            }}>
              <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                {savedFlow ? savedFlow.name : 'New workflow'}
              </span>
              <span style={{ flexShrink:0, opacity:0.5 }}>▾</span>
            </button>

            {showWfPicker && (
              <div style={{
                position:'absolute', top:'calc(100% + 6px)', left:0, zIndex:100,
                background:'var(--card-bg)', border:'1px solid var(--border)',
                borderRadius:10, padding:6, minWidth:220,
                boxShadow:'0 8px 32px rgba(0,0,0,0.45)',
              }} onClick={e => e.stopPropagation()}>
                <div style={{ fontSize:10, fontWeight:700, color:'var(--text-4)',
                  letterSpacing:'0.08em', padding:'4px 8px 6px' }}>
                  SAVED WORKFLOWS ({workflows.length})
                </div>
                {loadFailed.workflows ? (
                  <LoadError what="your saved workflows" onRetry={() => runLoad('workflows')} />
                ) : workflows.length === 0 && (
                  <div style={{ fontSize:12, color:'var(--text-4)', padding:'6px 8px' }}>
                    No saved workflows yet
                  </div>
                )}
                {workflows.map(w => (
                  <div key={w.id} style={{
                    display:'flex', alignItems:'center', gap:6,
                    padding:'7px 8px', borderRadius:7, cursor:'pointer',
                    background: savedFlow?.id === w.id ? 'var(--tint-2)' : 'transparent',
                    transition:'background 0.1s',
                  }}
                    onMouseEnter={e => (e.currentTarget.style.background='var(--tint-2)')}
                    onMouseLeave={e => (e.currentTarget.style.background = savedFlow?.id===w.id ? 'var(--tint-2)' : 'transparent')}
                  >
                    <span aria-hidden="true" style={{ display:'inline-flex', color:'var(--text-3)' }}><Icon name="hexagon" size={13} /></span>
                    <div
                      role="button"
                      tabIndex={0}
                      aria-label={`Open workflow ${w.name}`}
                      onClick={() => loadWorkflow(w)}
                      onKeyDown={onActivate(() => loadWorkflow(w))}
                      style={{ flex:1, minWidth:0 }}
                    >
                      <div style={{ fontSize:12, fontWeight:600, color:'var(--text-1)',
                        overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {w.name}
                      </div>
                      <div style={{ fontSize:10, color:'var(--text-4)' }}>
                        {w.graph.nodes.length} nodes · {new Date(w.updated_at).toLocaleDateString()}
                      </div>
                    </div>
                    <button onClick={e => { e.stopPropagation(); removeWorkflow(w); }}
                      style={{ background:'none', border:'none', color:'var(--text-4)',
                        cursor:'pointer', fontSize:14, padding:'2px 4px', borderRadius:4,
                        flexShrink:0 }}
                      aria-label={`Delete workflow ${w.name}`}
                      title="Delete">×</button>
                  </div>
                ))}
                <div style={{ borderTop:'1px solid var(--border)', marginTop:4, paddingTop:4 }}>
                  <button ref={newWorkflowRef} onClick={newWorkflow} style={{
                    width:'100%', padding:'7px 8px', borderRadius:7, border:'none',
                    background:'transparent', color:'var(--purple-hi)',
                    fontSize:12, fontWeight:600, cursor:'pointer', textAlign:'left',
                    display:'flex', alignItems:'center', gap:6,
                  }}>
                    <span>＋</span> New workflow
                  </button>
                </div>
              </div>
            )}
          </div>

          <input ref={nameRef} value={flowName} onChange={e => setFlowName(e.target.value)}
            aria-label="Workflow name"
            style={{ fontSize: isMobile ? 13 : 14, fontWeight:600, color:'var(--text-1)', background:'transparent',
              border:'none', outline:'none', padding:'4px 0', minWidth:0, flex:1 }}
            placeholder="Workflow name…"
          />
          {!isMobile && (
            <span style={{ fontSize:11.5, color:'var(--text-4)', flexShrink:0 }}>
              {nodes.length} nodes · {edges.length} edges
            </span>
          )}
          {!isMobile && (
            <button onClick={() => { setNodes([]); setEdges([]); setEditNode(null); posthog.capture('workflow_canvas_cleared', {}); }}
              style={ghostBtn}>Clear</button>
          )}
          <button ref={saveRef} onClick={saveWorkflow} disabled={saving} style={{
            ...saveBtn,
            padding: isMobile ? '6px 12px' : '7px 14px',
            fontSize: isMobile ? 12 : 13,
            display:'inline-flex', alignItems:'center', gap:6,
          }}>
            {saving ? 'Saving…' : <><Icon name="save" size={14} /> Save</>}
          </button>
        </div>

        {/* Connecting mode banner — shown for touch and keyboard connect flows */}
        {connectingFrom && (
          <div style={{
            position: 'absolute', top: 48, left: 0, right: 0, zIndex: 30,
            background: 'rgba(117,91,227,0.18)', borderBottom: '1px solid rgba(117,91,227,0.35)',
            padding: '7px 12px', fontSize: 12, color: 'var(--purple-hi)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span role="status">Tap or focus the ◉ left handle of a target node to connect</span>
            <button onClick={() => setConnectingFrom(null)} aria-label="Cancel connecting"
              style={{ background:'none', border:'none', color:'var(--purple-hi)',
                cursor:'pointer', fontSize:16, padding:'0 4px', opacity:0.7 }}>×</button>
          </div>
        )}

        {/* Empty state */}
        {nodes.length === 0 && (
          <div style={{ position:'absolute', inset:'56px 0 28px', display:'flex', flexDirection:'column',
            alignItems:'center', justifyContent:'center', pointerEvents:'none', zIndex:0 }}>
            <div style={{ marginBottom:8, opacity:0.4, color:'var(--text-3)' }}><Icon name="hexagon" size={30} /></div>
            <div style={{ fontSize:14, fontWeight:600, color:'var(--text-3)', marginBottom:4 }}>
              {isMobile ? 'Tap items in the panel to add them' : 'Drag agents, apps or webhooks onto the canvas'}
            </div>
            <div style={{ fontSize:12, color:'var(--text-4)' }}>
              {isMobile ? 'Press the menu button to open the panel' : 'Then drag the right-side handle on a source node to connect it to an action node'}
            </div>
          </div>
        )}

        {/* Drop zone + nodes + SVG edges */}
        {/* Scroll wrapper — allows panning on mobile */}
        <div ref={scrollWrapperRef} style={{
          flex: 1,
          display: 'flex',
          overflow: isMobile ? 'auto' : 'hidden',
          WebkitOverflowScrolling: isMobile ? 'touch' as any : undefined,
          position: 'relative',
        }}>
        <div ref={canvasRef} style={{
            ...canvas,
            ...(isMobile ? {
              flex: 'none',
              width: '100%',
              height: '100%',
              minWidth: 1000,
              minHeight: 650,
            } : {}),
          }}
          onDrop={onCanvasDrop} onDragOver={e => e.preventDefault()}
          onMouseMove={onCanvasMouseMove} onMouseUp={onCanvasMouseUp}
          onTouchStart={onCanvasTouchStart}
          onTouchMove={onCanvasTouchMove}
          onTouchEnd={onCanvasTouchEnd}
          onTouchCancel={onCanvasTouchEnd}
          onClick={() => { setSelectedEdge(null); setEditNode(null); setShowWfPicker(false); setConnectingFrom(null); }}
        >
          {/* SVG edge layer */}
          <svg style={{ position:'absolute', inset:0, width:'100%', height:'100%',
            pointerEvents:'none', zIndex:1 }}>
            <defs>
              {(['escalation','demo_booking','both','webhook_to_agent'] as const).map(t => (
                <marker key={t} id={`arr-${t}`} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                  <polygon points="0 0,8 4,0 8" fill={TINT[t]} opacity="0.85"/>
                </marker>
              ))}
            </defs>
            {edges.map(edge => {
              const src = nodes.find(n => n.id === edge.source);
              const tgt = nodes.find(n => n.id === edge.target);
              if (!src || !tgt) return null;
              const rh = rightHandle(src), lh = leftHandle(tgt);
              const mx = (rh.x + lh.x)/2, my = (rh.y + lh.y)/2;
              const color  = TINT[edge.triggerType] ?? '#888';
              const isW2A  = edge.triggerType === 'webhook_to_agent';
              // Bug 4: 'webhook_to_agent' is storable but the engine never matches
              // it, so the edge is inert. Say so instead of dressing it up with an
              // agent id, and keep it selectable so it can be retyped or deleted.
              const inert = !isExecutableTrigger(edge.triggerType);
              // label text — for webhook→agent show agent id, else show trigger type
              const labelText = isW2A
                ? `${tgt.data.agentName ?? 'agent'}`
                : edge.triggerType === 'escalation' ? 'escalation'
                : edge.triggerType === 'demo_booking' ? 'demo booked'
                : 'both';
              const labelW = isW2A ? Math.min(120, (tgt.data.agentName?.length ?? 5) * 7 + 18) : 76;
              const edgeLabel =
                `${labelText} connection${inert ? ' — never fires yet' : ''}. `
                + 'Enter to change its trigger, Delete to remove it.';
              const openPicker = (x: number, y: number) => {
                setEditNode(null);
                setSelectedEdge({ edge, x, y });
              };

              return (
                <g key={edge.id}
                   role="button"
                   tabIndex={0}
                   aria-label={edgeLabel}
                   style={{ pointerEvents:'all', cursor:'pointer' }}
                   onClick={e => {
                     e.stopPropagation();
                     const rect = canvasRef.current!.getBoundingClientRect();
                     openPicker(e.clientX-rect.left, e.clientY-rect.top);
                   }}
                   onKeyDown={e => {
                     if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPicker(mx, my); }
                     else if (e.key === 'Delete' || e.key === 'Backspace') {
                       e.preventDefault();
                       setEdges(prev => prev.filter(x => x.id !== edge.id));
                       posthog.capture('workflow_canvas_edge_deleted', {});
                     }
                   }}>
                  <title>{edgeLabel}</title>
                  <path d={bezier(rh.x,rh.y,lh.x,lh.y)} fill="none" stroke="transparent" strokeWidth={12}/>
                  <path d={bezier(rh.x,rh.y,lh.x,lh.y)} fill="none"
                    stroke={color} strokeWidth={isW2A ? 2 : 1.8}
                    strokeOpacity={0.85}
                    strokeDasharray={isW2A ? 'none' : 'none'}
                    markerEnd={`url(#arr-${edge.triggerType})`}/>
                  {/* Badge */}
                  <rect x={mx - labelW/2} y={my-9} width={labelW} height={18} rx={5}
                    fill="var(--card-bg)" stroke={color} strokeWidth={0.8} strokeOpacity={0.6}/>
                  <text x={mx} y={my+4} textAnchor="middle" fontSize={9} fontWeight={600} fill={color}>
                    {labelText}
                  </text>
                  {/* Inert edges (webhook→agent) — the engine can never match them */}
                  {inert && (
                    <text x={mx} y={my+16} textAnchor="middle" fontSize={7.5}
                      fill="#ffb547" opacity={0.95}>
                      never fires yet
                    </text>
                  )}
                </g>
              );
            })}
            {previewLine && (
              <path d={bezier(previewLine.x1,previewLine.y1,previewLine.x2,previewLine.y2)}
                fill="none" stroke="rgba(117,91,227,0.45)" strokeWidth={1.5} strokeDasharray="6,4"/>
            )}
          </svg>

          {/* Node cards */}
          {nodes.map(node => {
            const color      = nodeColor(node);
            const icon       = nodeIcon(node);
            const label      = nodeLabel(node);
            const isActive   = editNode?.id === node.id;
            const conn       = connections.find(c => c.app_type === node.data.appType);
            const isConnected = conn?.is_connected || composioConns.has(node.data.appType ?? '');
            const iconIsUrl  = typeof icon === 'string' && icon.startsWith('http');
            const runnable   = node.type !== 'app' || isExecutableApp(node.data.appType);

            return (
              <div key={node.id}
                role="button"
                tabIndex={0}
                aria-label={`${label} — ${node.type} node${runnable ? '' : ', no flow action yet'}. `
                  + 'Enter to edit, Delete to remove.'}
                aria-pressed={isActive}
                style={{ position:'absolute', left:node.x, top:node.y,
                  width:NODE_W, height:NODE_H, zIndex:2 }}
                onMouseDown={e => { e.button === 0 && startNodeDrag(e, node.id); }}
                onClick={e => onNodeClick(e, node)}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setSelectedEdge(null); setConnectingFrom(null);
                    setEditNode(prev => prev?.id === node.id ? null : node);
                  } else if (e.key === 'Delete' || e.key === 'Backspace') {
                    e.preventDefault();
                    deleteNode(node.id);
                  }
                }}
              >
                {/* Card */}
                <div style={{
                  display:'flex', alignItems:'center', gap:8,
                  padding:'0 10px', height:NODE_H, borderRadius:11,
                  border: `1.5px solid ${isActive ? color : `${color}44`}`,
                  background: isActive ? `${color}10` : `${color}08`,
                  cursor:'pointer', userSelect:'none',
                  boxShadow: isActive ? `0 0 0 3px ${color}30, 0 4px 20px rgba(0,0,0,0.35)` : '0 3px 14px rgba(0,0,0,0.28)',
                  transition:'all 0.15s',
                }}>
                  {iconIsUrl ? (
                    <img src={icon} alt={label}
                      style={{ width:22, height:22, objectFit:'contain', borderRadius:5, flexShrink:0 }} />
                  ) : (
                    <span style={{ display:'inline-flex', color, flexShrink:0 }}><Icon name={icon} size={20} /></span>
                  )}
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:12, fontWeight:700, color:'var(--text-1)',
                      overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {label}
                    </div>
                    {node.type==='agent' && (
                      <span style={tagChip(color)}>{node.data.agentType}</span>
                    )}
                    {node.type==='app' && (
                      <span style={{ fontSize:9.5,
                        color: !runnable ? 'var(--amber)'
                             : loadFailed.connections ? '#ff8194'
                             : isConnected ? 'var(--green)' : 'var(--text-4)' }}>
                        {!runnable ? '⚠ no flow action yet'
                          : loadFailed.connections ? '⚠ connection status unavailable'
                          : isConnected ? '● connected' : '○ click to connect'}
                      </span>
                    )}
                    {node.type==='webhook' && (
                      <span style={{ fontSize:9.5, color:'var(--teal)' }}>inbound trigger</span>
                    )}
                  </div>
                  {/* Delete button */}
                  <button onClick={e => { e.stopPropagation(); deleteNode(node.id); }}
                    aria-label={`Delete ${label} node`}
                    style={{ background:'none', border:'none', color:'var(--text-4)',
                      cursor:'pointer', padding:'2px 4px', fontSize:13, flexShrink:0,
                      lineHeight:1, borderRadius:4 }}>×</button>
                </div>

                {/* Right handle (source) */}
                {isSource(node) && (
                  <div
                    data-handle="right"
                    data-nodeid={node.id}
                    role="button"
                    tabIndex={0}
                    aria-label={connectingFrom === node.id
                      ? `Cancel connecting from ${label}`
                      : `Start a connection from ${label}`}
                    // Keyboard-only activation: a desktop click here would race the
                    // mousedown-to-drag path and leave the canvas stuck in connect mode.
                    onKeyDown={onActivate(() => {
                      setConnectingFrom(prev => prev === node.id ? null : node.id);
                      setEditNode(null);
                    })}
                    style={handle('right', color, isMobile, connectingFrom === node.id)}
                    onMouseDown={!isMobile ? (e => startDrawEdge(e, node.id)) : undefined}
                    onClick={isMobile ? (e => {
                      e.stopPropagation();
                      setConnectingFrom(prev => prev === node.id ? null : node.id);
                      setEditNode(null);
                    }) : undefined}
                    title={isMobile
                      ? (connectingFrom === node.id ? 'Tap to cancel' : 'Tap to start connecting')
                      : 'Drag to connect to an action'}
                  />
                )}

                {/* Left handle (target) */}
                {isTarget(node) && (
                  <div
                    data-handle="left"
                    data-nodeid={node.id}
                    role="button"
                    tabIndex={0}
                    aria-label={connectingFrom && connectingFrom !== node.id
                      ? `Finish the connection at ${label}`
                      : `Connection target for ${label}`}
                    onKeyDown={onActivate(() => {
                      if (connectingFrom && connectingFrom !== node.id) {
                        tryConnect(connectingFrom, node.id);
                        setConnectingFrom(null);
                      }
                    })}
                    style={handle('left', color, isMobile, connectingFrom !== null && connectingFrom !== node.id)}
                    onMouseUp={!isMobile ? (e => finishDrawEdge(e, node.id)) : undefined}
                    onClick={isMobile ? (e => {
                      e.stopPropagation();
                      if (connectingFrom && connectingFrom !== node.id) {
                        tryConnect(connectingFrom, node.id);
                        setConnectingFrom(null);
                      }
                    }) : undefined}
                    title={isMobile ? 'Tap to receive connection' : 'Drop connection here'}
                  />
                )}
              </div>
            );
          })}

          {/* Edge trigger picker */}
          {selectedEdge && (
            <TriggerPicker
              edge={selectedEdge.edge} x={selectedEdge.x} y={selectedEdge.y}
              onSelect={t => setEdges(prev => prev.map(e =>
                e.id===selectedEdge.edge.id ? {...e, triggerType:t} : e))}
              onDelete={() => { setEdges(prev => prev.filter(e => e.id!==selectedEdge.edge.id));
                posthog.capture('workflow_canvas_edge_deleted', {});
                setSelectedEdge(null); }}
              onClose={() => setSelectedEdge(null)}
            />
          )}
        </div>
        </div>{/* scroll wrapper */}

        {/* Legend — hidden on mobile */}
        {!isMobile && (
          <div style={legend}>
            <span style={{ fontSize:11, color:'var(--text-4)', marginRight:8 }}>Trigger type:</span>
            {(['escalation','demo_booking','both','webhook_to_agent'] as const).map(t => (
              <span key={t} style={{ fontSize:11, color:TINT[t], marginRight:10 }}>
                ● {t.replace(/_/g,' ')}
                {!isExecutableTrigger(t) && (
                  <em
                    title="The flow engine only matches escalation, demo_booking and both — this edge type is stored but never fires"
                    style={{ color:'var(--amber)', fontStyle:'normal', marginLeft:3 }}
                  > (never fires yet)</em>
                )}
              </span>
            ))}
            {!isTablet && (
              <span style={{ fontSize:11, color:'var(--text-4)', marginLeft:'auto' }}>
                Click any node to edit · → handle to connect
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── Edit drawer ─────────────────────────────────────────────────────── */}
      {editNode && (
        <NodeEditDrawer
          node={editNode}
          connection={connections.find(c => c.app_type === editNode.data.appType)}
          onClose={closeDrawer}
          onUpdate={updateNodeData}
          onConnectionSaved={conn => {
            setConnections(prev => {
              const idx = prev.findIndex(c => c.id === conn.id);
              if (idx >= 0) { const next=[...prev]; next[idx]=conn; return next; }
              return [...prev, conn];
            });
          }}
        />
      )}

      {/* ── API-key credentials modal ────────────────────────────────────────── */}
      {credModal && (
        <div role="presentation" style={{
          position: 'fixed', inset: 0, zIndex: 300,
          background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={closeCredModal}>
          <CredModalCard
            app={credModal.app}
            fields={credModal.fields}
            values={credValues}
            onChange={(name, value) => setCredValues(prev => ({ ...prev, [name]: value }))}
            onCancel={closeCredModal}
            onSubmit={handleCredSubmit}
            submitting={connectingAppId === composioAppId(credModal.app)}
          />
        </div>
      )}
    </div>
  );
}

// ── API-key credentials dialog ────────────────────────────────────────────────
// Split out purely so useDialogA11y (a hook) can run only while it is mounted.
function CredModalCard({
  app, fields, values, onChange, onCancel, onSubmit, submitting,
}: {
  app: ComposioApp;
  fields: AuthInfoField[];
  values: Record<string, string>;
  onChange: (name: string, value: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
  submitting: boolean;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId  = useId();
  // A true modal: it covers the page and nothing behind it should be reachable,
  // so focus is trapped here until Escape / Cancel / Connect.
  useDialogA11y(cardRef, onCancel, true);

  return (
    <div
      ref={cardRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descId}
      tabIndex={-1}
      onClick={e => e.stopPropagation()}
      style={{
        background: 'var(--card-bg)', border: '1px solid var(--border)',
        borderRadius: 14, padding: '24px 28px', width: 'min(380px, 90vw)',
        boxShadow: '0 16px 48px rgba(0,0,0,0.6)',
      }}
    >
      <div id={titleId} style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', marginBottom: 4 }}>
        Connect {app.name}
      </div>
      <div id={descId} style={{ fontSize: 12, color: 'var(--text-4)', marginBottom: 18 }}>
        Enter your credentials to connect this app.
      </div>
      {fields.map(field => (
        <div key={field.name} style={{ marginBottom: 14 }}>
          <label htmlFor={`cred-${field.name}`}
            style={{ display: 'block', fontSize: 11.5, fontWeight: 600,
            color: 'var(--text-3)', marginBottom: 5 }}>
            {field.label}
          </label>
          <input
            id={`cred-${field.name}`}
            type={field.type === 'password' ? 'password' : 'text'}
            value={values[field.name] ?? ''}
            onChange={e => onChange(field.name, e.target.value)}
            placeholder={field.label}
            style={{
              width: '100%', boxSizing: 'border-box',
              padding: '8px 12px', borderRadius: 8,
              background: 'var(--tint-2)', border: '1px solid var(--border)',
              color: 'var(--text-1)', fontSize: 13, outline: 'none',
            }}
          />
        </div>
      ))}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 6 }}>
        <button onClick={onCancel}
          style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)',
            background: 'transparent', color: 'var(--text-3)', fontSize: 13, cursor: 'pointer' }}>
          Cancel
        </button>
        <button
          onClick={onSubmit}
          disabled={submitting}
          style={{ padding: '8px 18px', borderRadius: 8, border: 'none',
            background: 'var(--grad-brand)', color: '#fff', fontSize: 13,
            fontWeight: 600, cursor: 'pointer', opacity: submitting ? 0.7 : 1 }}>
          {submitting ? 'Connecting…' : 'Connect'}
        </button>
      </div>
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const leftPanel: React.CSSProperties = {
  width: 220, flexShrink: 0,
  background: 'var(--card-bg)', borderRight: '1px solid var(--border)',
  display: 'flex', flexDirection: 'column', overflow: 'hidden',
};

const toolbar: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10,
  height: 44, padding: '0 14px', background: 'var(--card-bg)',
  borderBottom: '1px solid var(--border)', flexShrink: 0,
};

const canvas: React.CSSProperties = {
  flex: 1, position: 'relative',
  background: `radial-gradient(circle, rgba(117,91,227,0.05) 1px, transparent 1px) 0 0 / 28px 28px`,
  overflow: 'hidden',
};

const legend: React.CSSProperties = {
  display: 'flex', alignItems: 'center', padding: '6px 14px',
  background: 'var(--card-bg)', borderTop: '1px solid var(--border)', flexShrink: 0,
};

function leftTabBtn(active: boolean): React.CSSProperties {
  return {
    flex: 1, textAlign: 'center',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '0 4px', border: 'none', background: 'transparent', cursor: 'pointer',
    fontSize: 11.5, fontWeight: active ? 700 : 500,
    color: active ? 'var(--purple-hi)' : 'var(--text-3)',
    borderBottom: active ? '2px solid var(--purple-hi)' : '2px solid transparent',
    transition: 'all 0.12s', marginBottom: -1,
  };
}

function panelCard(color: string): React.CSSProperties {
  return {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '8px 8px', borderRadius: 8, marginBottom: 4,
    border: `1px solid ${color}22`, background: `${color}09`,
    cursor: 'grab', userSelect: 'none', transition: 'all 0.1s',
  };
}

function tagChip(color: string): React.CSSProperties {
  return {
    fontSize: 9, fontWeight: 700, color,
    background: `${color}18`, borderRadius: 4, padding: '1px 5px',
  };
}

function handle(side: 'left'|'right', color: string, mobile = false, active = false): React.CSSProperties {
  const r = mobile ? 10 : HANDLE_R;
  return {
    position: 'absolute', top: NODE_H/2 - r,
    [side]: -r - 1,
    width: r*2, height: r*2, borderRadius: '50%',
    background: active ? '#fff' : color,
    border: `${mobile ? 3 : 2}px solid ${active ? color : 'var(--bg-0)'}`,
    cursor: side==='right' ? 'crosshair' : 'cell', zIndex: 3,
    boxShadow: active ? `0 0 0 5px ${color}44` : 'none',
    transition: 'background 0.15s, box-shadow 0.15s',
  };
}

const ghostBtn: React.CSSProperties = {
  padding: '6px 11px', borderRadius: 7,
  border: '1px solid var(--border)', background: 'transparent',
  color: 'var(--text-3)', fontSize: 12, cursor: 'pointer', flexShrink: 0,
};

const saveBtn: React.CSSProperties = {
  padding: '7px 14px', borderRadius: 8, border: 'none', flexShrink: 0,
  background: 'var(--grad-brand)', color: '#fff',
  fontSize: 13, fontWeight: 600, cursor: 'pointer',
  boxShadow: '0 4px 14px -4px rgba(117,91,227,0.5)',
};
