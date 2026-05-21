/**
 * FlowsPage — visual no-code workflow builder.
 *
 * Left panel tabs: Agents | Apps | Webhooks
 * Canvas: drag-drop nodes, draw edges, click to edit
 * Right drawer: NodeEditDrawer — type-aware editor for any node
 */
import { useState, useRef, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { listAgents, type Agent } from '../../api/agents';
import { listConnections, APP_CATALOGUE, type AppConnection } from '../../api/connections';
import {
  listWorkflows, createWorkflow, updateWorkflow, deleteWorkflow,
  type FlowNode, type FlowEdge, type WorkflowGraph, type Workflow,
} from '../../api/workflows';
import NodeEditDrawer from './NodeEditDrawer';
import Icon from '../../assets/icons';

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
    <div style={{ position:'absolute', left:x-90, top:y-80, background:'var(--surface)',
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
        }}>
          {t==='escalation' ? '⚡ Escalation' : t==='demo_booking' ? '📅 Demo booked' : '🔀 Both'}
        </button>
      ))}
      <hr style={{ border:'none', borderTop:'1px solid var(--border)', margin:'4px 0' }}/>
      <button onClick={onDelete} style={{ padding:'5px 10px', borderRadius:6, border:'none',
        cursor:'pointer', background:'transparent', color:'#ff8194', fontSize:12, fontWeight:600, textAlign:'left' }}>
        🗑 Delete edge
      </button>
    </div>
  );
}

// ── Webhook node type definition (static) ─────────────────────────────────────
const WEBHOOK_TEMPLATE = {
  type: 'webhook' as const,
  data: { appType: 'inbound_webhook', appLabel: 'Inbound Webhook', appIcon: '🪝' },
};

// ── Main page ─────────────────────────────────────────────────────────────────
export default function FlowsPage() {
  const { addToast } = useApp();

  const [agents,      setAgents]      = useState<Agent[]>([]);
  const [connections, setConnections] = useState<AppConnection[]>([]);
  const [workflows,   setWorkflows]   = useState<Workflow[]>([]);
  const [savedFlow,   setSavedFlow]   = useState<Workflow | null>(null);
  const [showWfPicker, setShowWfPicker] = useState(false);

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

  // ── Load ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    listAgents().then(setAgents).catch(console.warn);
    listConnections().then(setConnections).catch(console.warn);
    listWorkflows().then(ws => {
      setWorkflows(ws);
      if (ws.length > 0) {
        const w = ws[0];
        setSavedFlow(w); setFlowName(w.name);
        setNodes(w.graph.nodes); setEdges(w.graph.edges);
      }
    }).catch(console.warn);
  }, []);

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
    // For webhook nodes, assign a stable ID & secret placeholder
    const extra = payload.type === 'webhook'
      ? { data: { ...payload.data, webhookId: uid(), webhookSecret: `whsec_${uid()}${uid()}` } }
      : {};
    const newNode: FlowNode = { ...payload, ...extra, id: uid(), x, y };
    setNodes(prev => [...prev, newNode]);
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

  // ── Edge drawing ─────────────────────────────────────────────────────────────
  function startDrawEdge(e: React.MouseEvent, sourceId: string) {
    e.stopPropagation();
    drawEdge.current = { sourceId };
  }

  function finishDrawEdge(e: React.MouseEvent, targetId: string) {
    e.stopPropagation();
    if (!drawEdge.current || drawEdge.current.sourceId === targetId) return;

    const srcId = drawEdge.current.sourceId;
    const src   = nodes.find(n => n.id === srcId);
    const tgt   = nodes.find(n => n.id === targetId);
    if (!src || !tgt) return;

    // ── Connection rules ──────────────────────────────────────────────────────
    // app nodes can never be a source
    if (src.type === 'app') return;
    // agent → agent: not allowed
    if (src.type === 'agent' && tgt.type === 'agent') return;
    // webhook → webhook: not allowed
    if (src.type === 'webhook' && tgt.type === 'webhook') return;
    // duplicate edge: not allowed
    if (edges.find(ed => ed.source === srcId && ed.target === targetId)) return;

    // Determine trigger type:
    //   webhook → agent  : 'webhook_to_agent' (passes payload to agent)
    //   anything → app   : 'escalation' as default (user can change via click)
    const triggerType: FlowEdge['triggerType'] =
      (src.type === 'webhook' && tgt.type === 'agent') ? 'webhook_to_agent' : 'escalation';

    setEdges(prev => [...prev, { id: uid(), source: srcId, target: targetId, triggerType }]);
    drawEdge.current = null;
    setPreviewLine(null);
  }

  // ── Node click → edit drawer ─────────────────────────────────────────────────
  function onNodeClick(e: React.MouseEvent, node: FlowNode) {
    e.stopPropagation();
    // Don't open drawer while mid-drag
    if (dragNode.current) return;
    setSelectedEdge(null);
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
    setSaving(true);
    const graph: WorkflowGraph = { nodes, edges };
    try {
      let w: Workflow;
      if (savedFlow) {
        w = await updateWorkflow(savedFlow.id, { name: flowName, graph });
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

  // ── Node appearance ──────────────────────────────────────────────────────────
  function nodeColor(node: FlowNode) {
    if (node.type === 'agent')   return node.data.agentType === 'chat' ? 'var(--purple-hi)' : 'var(--blue)';
    if (node.type === 'webhook') return 'var(--teal)';
    return '#7b5be3';
  }

  function nodeIcon(node: FlowNode) {
    if (node.type === 'agent')   return node.data.agentType === 'chat' ? '🤖' : '📞';
    if (node.type === 'webhook') return '🪝';
    return node.data.appIcon ?? '🔗';
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
    <div style={{ display:'flex', height:'calc(100vh - 48px)',
      background:'var(--bg-0)', position:'relative', overflow:'hidden' }}>

      {/* ── Left panel ─────────────────────────────────────────────────────── */}
      <div style={leftPanel}>
        {/* Tabs */}
        <div style={{ display:'flex', borderBottom:'1px solid var(--border)', padding:'0 6px', flexShrink:0 }}>
          {(['agents','apps','webhooks'] as const).map(tab => (
            <button key={tab} onClick={() => setLeftTab(tab)} style={leftTabBtn(leftTab===tab)}>
              {tab==='agents' ? '🤖' : tab==='apps' ? '🔌' : '🪝'} {tab.charAt(0).toUpperCase()+tab.slice(1)}
            </button>
          ))}
        </div>

        <div style={{ padding:'8px 6px', overflowY:'auto', flex:1 }}>
          {/* ── Agents tab ── */}
          {leftTab === 'agents' && (
            agents.length === 0
              ? <p style={{ fontSize:12, color:'var(--text-4)', padding:'10px 6px' }}>
                  No agents — create one in Chatbots or Voice Bots.
                </p>
              : agents.map(agent => {
                // Treat as chat if call_direction is 'chat' OR use_case_slug is a known chatbot slug
                const CHAT_SLUGS = ['cs','tech','health','bank','appt','hr','chatbot','chat'];
                const isChat = agent.call_direction === 'chat'
                  || CHAT_SLUGS.some(s => agent.use_case_slug?.includes(s));
                const color  = isChat ? 'var(--purple-hi)' : 'var(--blue)';
                return (
                  <div key={agent.id} draggable
                    onDragStart={e => onPanelDragStart(e, {
                      type: 'agent',
                      data: { agentId: agent.id, agentName: agent.name, agentType: isChat ? 'chat' : 'voice' },
                    })}
                    style={panelCard(color)}
                  >
                    <span style={{ fontSize:16 }}>{isChat ? '🤖' : '📞'}</span>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:12, fontWeight:600, color:'var(--text-1)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {agent.name}
                      </div>
                      <span style={tagChip(color)}>{isChat ? 'chatbot' : 'voice'}</span>
                    </div>
                    <span style={{ fontSize:10, color:'var(--text-4)' }}>⠿</span>
                  </div>
                );
              })
          )}

          {/* ── Apps tab ── */}
          {leftTab === 'apps' && APP_CATALOGUE.map(app => {
            const conn = connections.find(c => c.app_type === app.type);
            return (
              <div key={app.type} draggable
                onDragStart={e => onPanelDragStart(e, {
                  type: 'app',
                  data: { appType: app.type, appLabel: app.label, appIcon: app.icon, connectionId: conn?.id },
                })}
                style={panelCard('var(--border)')}
              >
                <span style={{ fontSize:16 }}>{app.icon}</span>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:12, fontWeight:600, color:'var(--text-1)' }}>{app.label}</div>
                  <div style={{ fontSize:10.5, color:'var(--text-4)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {app.description}
                  </div>
                </div>
                <span style={{ fontSize:9, fontWeight:700, flexShrink:0,
                  color: conn?.is_connected ? 'var(--green)' : 'var(--text-4)',
                  background: conn?.is_connected ? 'rgba(76,175,80,0.14)' : 'var(--tint-2)',
                  borderRadius:4, padding:'2px 5px',
                }}>
                  {conn?.is_connected ? '●' : '+'}
                </span>
              </div>
            );
          })}

          {/* ── Webhooks tab ── */}
          {leftTab === 'webhooks' && (
            <>
              <p style={{ fontSize:11.5, color:'var(--text-4)', padding:'4px 6px 10px', lineHeight:1.6 }}>
                Drag an <strong style={{ color:'var(--teal)' }}>Inbound Webhook</strong> node onto the canvas.
                Each drag creates a <strong style={{ color:'var(--text-2)' }}>new unique URL</strong> with its own secret — you can have as many webhook nodes as you need, one per external source.
              </p>
              <div draggable
                onDragStart={e => onPanelDragStart(e, WEBHOOK_TEMPLATE)}
                style={panelCard('var(--teal)')}
              >
                <span style={{ fontSize:16 }}>🪝</span>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:12, fontWeight:600, color:'var(--text-1)' }}>Inbound Webhook</div>
                  <div style={{ fontSize:10.5, color:'var(--text-4)' }}>External POST → trigger flow</div>
                </div>
                <span style={{ fontSize:10, color:'var(--text-4)' }}>⠿</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Canvas area ────────────────────────────────────────────────────── */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden',
        marginRight: editNode ? 340 : 0, transition:'margin-right 0.22s ease' }}>

        {/* Toolbar */}
        <div style={toolbar}>
          {/* Workflow switcher */}
          <div style={{ position:'relative', flexShrink:0 }}>
            <button onClick={() => setShowWfPicker(p => !p)} style={{
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
                background:'var(--surface)', border:'1px solid var(--border)',
                borderRadius:10, padding:6, minWidth:220,
                boxShadow:'0 8px 32px rgba(0,0,0,0.45)',
              }} onClick={e => e.stopPropagation()}>
                <div style={{ fontSize:10, fontWeight:700, color:'var(--text-4)',
                  letterSpacing:'0.08em', padding:'4px 8px 6px' }}>
                  SAVED WORKFLOWS ({workflows.length})
                </div>
                {workflows.length === 0 && (
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
                    <span style={{ fontSize:13 }}>⬡</span>
                    <div style={{ flex:1, minWidth:0 }} onClick={() => loadWorkflow(w)}>
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
                      title="Delete">×</button>
                  </div>
                ))}
                <div style={{ borderTop:'1px solid var(--border)', marginTop:4, paddingTop:4 }}>
                  <button onClick={newWorkflow} style={{
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

          <input value={flowName} onChange={e => setFlowName(e.target.value)}
            style={{ fontSize:14, fontWeight:600, color:'var(--text-1)', background:'transparent',
              border:'none', outline:'none', padding:'4px 0', minWidth:0, flex:1 }}
            placeholder="Workflow name…"
          />
          <span style={{ fontSize:11.5, color:'var(--text-4)', flexShrink:0 }}>
            {nodes.length} nodes · {edges.length} edges
          </span>
          <button onClick={() => { setNodes([]); setEdges([]); setEditNode(null); }}
            style={ghostBtn}>Clear</button>
          <button onClick={saveWorkflow} disabled={saving} style={saveBtn}>
            {saving ? 'Saving…' : '💾 Save'}
          </button>
        </div>

        {/* Empty state */}
        {nodes.length === 0 && (
          <div style={{ position:'absolute', inset:'56px 0 28px', display:'flex', flexDirection:'column',
            alignItems:'center', justifyContent:'center', pointerEvents:'none', zIndex:0 }}>
            <div style={{ fontSize:30, marginBottom:8, opacity:0.4 }}>⬡</div>
            <div style={{ fontSize:14, fontWeight:600, color:'var(--text-3)', marginBottom:4 }}>
              Drag agents, apps or webhooks onto the canvas
            </div>
            <div style={{ fontSize:12, color:'var(--text-4)' }}>
              Then drag the → handle on a source node to connect it to an action node
            </div>
          </div>
        )}

        {/* Drop zone + nodes + SVG edges */}
        <div ref={canvasRef} style={canvas}
          onDrop={onCanvasDrop} onDragOver={e => e.preventDefault()}
          onMouseMove={onCanvasMouseMove} onMouseUp={onCanvasMouseUp}
          onClick={() => { setSelectedEdge(null); setEditNode(null); setShowWfPicker(false); }}
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
              // label text — for webhook→agent show agent id, else show trigger type
              const labelText = isW2A
                ? `→ ${tgt.data.agentName ?? 'agent'}`
                : edge.triggerType === 'escalation' ? '⚡ escalation'
                : edge.triggerType === 'demo_booking' ? '📅 demo booked'
                : '🔀 both';
              const labelW = isW2A ? Math.min(120, (tgt.data.agentName?.length ?? 5) * 7 + 18) : 76;

              return (
                <g key={edge.id} style={{ pointerEvents:'all', cursor: isW2A ? 'default' : 'pointer' }}
                   onClick={e => {
                     if (isW2A) return; // webhook→agent edges aren't clickable for trigger type
                     e.stopPropagation();
                     const rect = canvasRef.current!.getBoundingClientRect();
                     setEditNode(null);
                     setSelectedEdge({ edge, x: e.clientX-rect.left, y: e.clientY-rect.top });
                   }}>
                  <path d={bezier(rh.x,rh.y,lh.x,lh.y)} fill="none" stroke="transparent" strokeWidth={12}/>
                  <path d={bezier(rh.x,rh.y,lh.x,lh.y)} fill="none"
                    stroke={color} strokeWidth={isW2A ? 2 : 1.8}
                    strokeOpacity={0.85}
                    strokeDasharray={isW2A ? 'none' : 'none'}
                    markerEnd={`url(#arr-${edge.triggerType})`}/>
                  {/* Badge */}
                  <rect x={mx - labelW/2} y={my-9} width={labelW} height={18} rx={5}
                    fill="var(--surface)" stroke={color} strokeWidth={0.8} strokeOpacity={0.6}/>
                  <text x={mx} y={my+4} textAnchor="middle" fontSize={9} fontWeight={600} fill={color}>
                    {labelText}
                  </text>
                  {/* Agent ID sub-label for webhook→agent */}
                  {isW2A && tgt.data.agentId && (
                    <text x={mx} y={my+16} textAnchor="middle" fontSize={7.5}
                      fill={color} opacity={0.6}>
                      id: {tgt.data.agentId.slice(0,8)}…
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
            const color    = nodeColor(node);
            const icon     = nodeIcon(node);
            const label    = nodeLabel(node);
            const isActive = editNode?.id === node.id;
            const conn     = connections.find(c => c.app_type === node.data.appType);

            return (
              <div key={node.id} style={{ position:'absolute', left:node.x, top:node.y,
                width:NODE_W, height:NODE_H, zIndex:2 }}
                onMouseDown={e => { e.button === 0 && startNodeDrag(e, node.id); }}
                onClick={e => onNodeClick(e, node)}
              >
                {/* Card */}
                <div style={{
                  display:'flex', alignItems:'center', gap:8,
                  padding:'0 10px', height:NODE_H, borderRadius:11,
                  border: `1.5px solid ${isActive ? color : `${color}44`}`,
                  background: isActive ? `${color}18` : `${color}0c`,
                  cursor:'pointer', userSelect:'none',
                  boxShadow: isActive ? `0 0 0 3px ${color}30, 0 4px 20px rgba(0,0,0,0.35)` : '0 3px 14px rgba(0,0,0,0.28)',
                  transition:'all 0.15s',
                }}>
                  <span style={{ fontSize:20 }}>{icon}</span>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:12, fontWeight:700, color:'var(--text-1)',
                      overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {label}
                    </div>
                    {node.type==='agent' && (
                      <span style={tagChip(color)}>{node.data.agentType}</span>
                    )}
                    {node.type==='app' && (
                      <span style={{ fontSize:9.5, color: conn?.is_connected ? 'var(--green)' : 'var(--text-4)' }}>
                        {conn?.is_connected ? '● connected' : '○ click to connect'}
                      </span>
                    )}
                    {node.type==='webhook' && (
                      <span style={{ fontSize:9.5, color:'var(--teal)' }}>inbound trigger</span>
                    )}
                  </div>
                  {/* Delete button */}
                  <button onClick={e => { e.stopPropagation(); deleteNode(node.id); }}
                    style={{ background:'none', border:'none', color:'var(--text-4)',
                      cursor:'pointer', padding:'2px 4px', fontSize:13, flexShrink:0,
                      lineHeight:1, borderRadius:4 }}>×</button>
                </div>

                {/* Right handle (source) */}
                {isSource(node) && (
                  <div style={handle('right', color)}
                    onMouseDown={e => startDrawEdge(e, node.id)}
                    title="Drag to connect to an action"/>
                )}

                {/* Left handle (target) */}
                {isTarget(node) && (
                  <div style={handle('left', color)}
                    onMouseUp={e => finishDrawEdge(e, node.id)}
                    title="Drop connection here"/>
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
                setSelectedEdge(null); }}
              onClose={() => setSelectedEdge(null)}
            />
          )}
        </div>

        {/* Legend */}
        <div style={legend}>
          <span style={{ fontSize:11, color:'var(--text-4)', marginRight:8 }}>Trigger type:</span>
          {(['escalation','demo_booking','both','webhook_to_agent'] as const).map(t => (
            <span key={t} style={{ fontSize:11, color:TINT[t], marginRight:10 }}>
              ● {t.replace(/_/g,' ')}
            </span>
          ))}
          <span style={{ fontSize:11, color:'var(--text-4)', marginLeft:'auto' }}>
            Click any node to edit · → handle to connect
          </span>
        </div>
      </div>

      {/* ── Edit drawer ─────────────────────────────────────────────────────── */}
      {editNode && (
        <NodeEditDrawer
          node={editNode}
          connection={connections.find(c => c.app_type === editNode.data.appType)}
          onClose={() => setEditNode(null)}
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
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const leftPanel: React.CSSProperties = {
  width: 220, flexShrink: 0,
  background: 'var(--surface)', borderRight: '1px solid var(--border)',
  display: 'flex', flexDirection: 'column', overflow: 'hidden',
};

const toolbar: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10,
  padding: '10px 14px', background: 'var(--surface)',
  borderBottom: '1px solid var(--border)', flexShrink: 0,
};

const canvas: React.CSSProperties = {
  flex: 1, position: 'relative',
  background: `radial-gradient(circle, rgba(117,91,227,0.05) 1px, transparent 1px) 0 0 / 28px 28px`,
  overflow: 'hidden',
};

const legend: React.CSSProperties = {
  display: 'flex', alignItems: 'center', padding: '6px 14px',
  background: 'var(--surface)', borderTop: '1px solid var(--border)', flexShrink: 0,
};

function leftTabBtn(active: boolean): React.CSSProperties {
  return {
    padding: '9px 10px', border: 'none', background: 'transparent', cursor: 'pointer',
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

function handle(side: 'left'|'right', color: string): React.CSSProperties {
  return {
    position: 'absolute', top: NODE_H/2 - HANDLE_R,
    [side]: -HANDLE_R - 1,
    width: HANDLE_R*2, height: HANDLE_R*2, borderRadius: '50%',
    background: color, border: '2px solid var(--bg-0)',
    cursor: side==='right' ? 'crosshair' : 'cell', zIndex: 3,
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
