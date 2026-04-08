import "./charcoal.css";
import "reactflow/dist/style.css";
import {
  ReactFlow,
  Background,
  Controls,
  BackgroundVariant,
  ReactFlowProvider,
  Node,
  Edge,
  addEdge,
  Connection,
  useNodesState,
  useEdgesState,
  useReactFlow,
} from "reactflow";
import { useCallback, useEffect, useRef, useState } from "react";
import { nodeTypes } from "./nodes";
import {
  FlowNodeData,
  NodeKind,
  NODE_LABELS,
  NODE_HINTS,
  defaultDataFor,
} from "./types";
import { saveFlow, openFlow } from "./storage";

function App() {
  return (
    <ReactFlowProvider>
      <FlowbenchApp />
    </ReactFlowProvider>
  );
}

function FlowbenchApp() {
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNodeData>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selected, setSelected] = useState<Node<FlowNodeData> | null>(null);
  const [tab, setTab] = useState<"live" | "free" | "logs">("live");
  const [flowName, setFlowName] = useState("untitled");
  const idRef = useRef(0);

  const nextId = useCallback(() => `n${++idRef.current}`, []);

  const onConnect = useCallback(
    (c: Connection) => setEdges((eds) => addEdge(c, eds)),
    [setEdges],
  );

  const updateSelected = useCallback(
    (patch: Partial<FlowNodeData>) => {
      if (!selected) return;
      setNodes((nds) =>
        nds.map((n) =>
          n.id === selected.id ? { ...n, data: { ...n.data, ...patch } } : n,
        ),
      );
      setSelected((s) => (s ? { ...s, data: { ...s.data, ...patch } } : s));
    },
    [selected, setNodes],
  );

  const handleSave = async () => {
    const path = await saveFlow(flowName, nodes, edges);
    if (path) {
      const base = path.split("/").pop() || "untitled.flow.json";
      setFlowName(base.replace(/\.flow\.json$/, ""));
    }
  };

  // Copy/paste for multi-selected nodes
  const clipboardRef = useRef<{ nodes: Node<FlowNodeData>[]; edges: Edge[] }>({
    nodes: [],
    edges: [],
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;

      if (e.key === "c") {
        const selectedNodes = nodes.filter((n) => n.selected);
        if (!selectedNodes.length) return;
        const ids = new Set(selectedNodes.map((n) => n.id));
        const selectedEdges = edges.filter(
          (ed) => ids.has(ed.source) && ids.has(ed.target),
        );
        clipboardRef.current = { nodes: selectedNodes, edges: selectedEdges };
      }

      if (e.key === "v") {
        const { nodes: cn, edges: ce } = clipboardRef.current;
        if (!cn.length) return;
        const idMap = new Map<string, string>();
        const newNodes = cn.map((n) => {
          const newId = nextId();
          idMap.set(n.id, newId);
          return {
            ...n,
            id: newId,
            position: { x: n.position.x + 32, y: n.position.y + 32 },
            selected: true,
          };
        });
        const newEdges = ce.map((ed) => ({
          ...ed,
          id: `e-${idMap.get(ed.source)}-${idMap.get(ed.target)}-${Math.random().toString(36).slice(2, 7)}`,
          source: idMap.get(ed.source)!,
          target: idMap.get(ed.target)!,
        }));
        setNodes((nds) =>
          nds.map((n) => ({ ...n, selected: false })).concat(newNodes),
        );
        setEdges((eds) => eds.concat(newEdges));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [nodes, edges, nextId, setNodes, setEdges]);

  const handleOpen = async () => {
    const result = await openFlow();
    if (!result) return;
    setNodes(result.file.nodes || []);
    setEdges(result.file.edges || []);
    setFlowName(result.file.name || "untitled");
    // bump idRef so new nodes don't collide
    const maxId = (result.file.nodes || []).reduce((max, n) => {
      const m = n.id.match(/^n(\d+)$/);
      return m ? Math.max(max, parseInt(m[1], 10)) : max;
    }, 0);
    idRef.current = maxId;
  };

  return (
    <div className="app">
      <TopBar
        flowName={flowName}
        onSave={handleSave}
        onOpen={handleOpen}
      />
      <div className="main">
        <Library />
        <Canvas
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onSelect={setSelected}
          onDrop={(kind, position) => {
            const id = nextId();
            const newNode: Node<FlowNodeData> = {
              id,
              type: kind,
              position,
              data: defaultDataFor(kind),
            };
            setNodes((nds) => [...nds, newNode]);
          }}
        />
        <TerminalPanel tab={tab} setTab={setTab} />
      </div>
      <Inspector selected={selected} onChange={updateSelected} />
    </div>
  );
}

/* ─────────────── Top bar ─────────────── */
function TopBar({
  flowName,
  onSave,
  onOpen,
}: {
  flowName: string;
  onSave: () => void;
  onOpen: () => void;
}) {
  return (
    <header className="topbar">
      <div className="topbar-left">
        <div className="logo">Flowbench</div>
        <div className="divider" />
        <button className="btn" onClick={onOpen}>Open</button>
        <button className="btn" onClick={onSave}>Save</button>
        <span className="flow-name">{flowName}.flow.json</span>
      </div>
      <div className="topbar-right">
        <button className="btn btn-primary" title="Run">▶ Run</button>
        <button className="btn btn-icon" title="Step">▶|</button>
        <button className="btn btn-icon" title="Pause">⏸</button>
      </div>
    </header>
  );
}

/* ─────────────── Library ─────────────── */
function Library() {
  const onDragStart = (e: React.DragEvent, kind: NodeKind) => {
    e.dataTransfer.setData("application/flowbench-node", kind);
    e.dataTransfer.effectAllowed = "move";
  };

  const kinds: NodeKind[] = ["prompt", "skill", "subagent", "assessment"];

  return (
    <aside className="panel library">
      <div className="section-label">Node types</div>
      {kinds.map((k) => (
        <div
          key={k}
          className="lib-item"
          draggable
          onDragStart={(e) => onDragStart(e, k)}
        >
          <div className="lib-item-name">{NODE_LABELS[k]}</div>
          <div className="lib-item-hint">{NODE_HINTS[k]}</div>
        </div>
      ))}

      <div className="section-label">Skills</div>
      <div className="empty">Auto-discovered in Phase 3</div>

      <div className="section-label">Super-nodes</div>
      <div className="empty">Coming in v2</div>
    </aside>
  );
}

/* ─────────────── Canvas ─────────────── */
function Canvas({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onSelect,
  onDrop,
}: {
  nodes: Node<FlowNodeData>[];
  edges: Edge[];
  onNodesChange: any;
  onEdgesChange: any;
  onConnect: (c: Connection) => void;
  onSelect: (n: Node<FlowNodeData> | null) => void;
  onDrop: (kind: NodeKind, position: { x: number; y: number }) => void;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition } = useReactFlow();

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const kind = e.dataTransfer.getData("application/flowbench-node") as NodeKind;
    if (!kind) return;
    const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    onDrop(kind, position);
  };

  return (
    <main
      className="panel canvas"
      ref={wrapperRef}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
      }}
      onDrop={handleDrop}
    >
      <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={(_, node) => onSelect(node)}
          onPaneClick={() => onSelect(null)}
          nodeTypes={nodeTypes}
          fitView
          proOptions={{ hideAttribution: true }}
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={20}
            size={1}
            color="#E5E5E7"
          />
          <Controls
            showInteractive={false}
            style={{
              background: "var(--ch-bg)",
              border: "1px solid var(--ch-border)",
              borderRadius: "var(--ch-radius-md)",
              boxShadow: "var(--ch-shadow)",
            }}
          />
        </ReactFlow>
      </div>
    </main>
  );
}

/* ─────────────── Terminal ─────────────── */
function TerminalPanel({
  tab,
  setTab,
}: {
  tab: "live" | "free" | "logs";
  setTab: (t: "live" | "free" | "logs") => void;
}) {
  return (
    <aside className="panel terminal">
      <div className="tabs">
        {(["live", "free", "logs"] as const).map((t) => (
          <button
            key={t}
            className={`tab ${tab === t ? "tab-active" : ""}`}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="terminal-body">
        {tab === "live" && (
          <div className="empty">No node running. Click Run to start.</div>
        )}
        {tab === "free" && <div className="empty">Free CC session — v2</div>}
        {tab === "logs" && <div className="empty">Pipeline logs — v2</div>}
      </div>
    </aside>
  );
}

/* ─────────────── Inspector ─────────────── */
function Inspector({
  selected,
  onChange,
}: {
  selected: Node<FlowNodeData> | null;
  onChange: (patch: Partial<FlowNodeData>) => void;
}) {
  if (!selected) {
    return (
      <footer className="panel inspector">
        <div className="section-label">Inspector</div>
        <div className="empty">Select a node to inspect its properties.</div>
      </footer>
    );
  }

  const d = selected.data;
  return (
    <footer className="panel inspector">
      <div className="inspector-grid">
        <div>
          <div className="section-label">{NODE_LABELS[d.kind]}</div>
          <Field label="Title">
            <input
              className="input"
              value={d.title}
              onChange={(e) => onChange({ title: e.target.value })}
            />
          </Field>
        </div>

        <div className="inspector-main">
          {d.kind === "prompt" && (
            <Field label="Prompt">
              <textarea
                className="input"
                rows={4}
                value={d.prompt || ""}
                onChange={(e) => onChange({ prompt: e.target.value })}
                placeholder="What should Claude do?"
              />
            </Field>
          )}
          {d.kind === "skill" && (
            <Field label="Skill name">
              <input
                className="input"
                value={d.skill || ""}
                onChange={(e) => onChange({ skill: e.target.value })}
                placeholder="e.g. mcc-ix-mapping"
              />
            </Field>
          )}
          {d.kind === "subagent" && (
            <>
              <Field label="Subagent type">
                <input
                  className="input"
                  value={d.subagentType || ""}
                  onChange={(e) => onChange({ subagentType: e.target.value })}
                />
              </Field>
              <Field label="Instructions">
                <textarea
                  className="input"
                  rows={3}
                  value={d.subagentPrompt || ""}
                  onChange={(e) =>
                    onChange({ subagentPrompt: e.target.value })
                  }
                />
              </Field>
            </>
          )}
          {d.kind === "assessment" && (
            <>
              <Field label="Question">
                <input
                  className="input"
                  value={d.question || ""}
                  onChange={(e) => onChange({ question: e.target.value })}
                  placeholder="What should the LLM judge?"
                />
              </Field>
              <Field label="Branches (comma-separated)">
                <input
                  className="input"
                  value={(d.branches || []).join(", ")}
                  onChange={(e) =>
                    onChange({
                      branches: e.target.value
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean),
                    })
                  }
                />
              </Field>
            </>
          )}
        </div>
      </div>
    </footer>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="field">
      <label className="field-label">{label}</label>
      {children}
    </div>
  );
}

export default App;
