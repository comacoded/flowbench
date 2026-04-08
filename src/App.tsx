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
import { invoke } from "@tauri-apps/api/core";
import { LiveTerminal } from "./Terminal";
import { NodeActionsContext } from "./nodeActions";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";

interface SkillEntry {
  kind: "skill" | "command";
  name: string;
  description: string;
  path: string;
}

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
  const [tab, setTab] = useState<"live" | "free" | "logs">("live");
  const [flowName, setFlowName] = useState("untitled");
  const [skills, setSkills] = useState<SkillEntry[]>([]);
  const [menu, setMenu] = useState<{ nodeId: string; x: number; y: number } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const idRef = useRef(0);

  const editingNode = editingId ? nodes.find((n) => n.id === editingId) || null : null;

  useEffect(() => {
    invoke<SkillEntry[]>("list_skills")
      .then(setSkills)
      .catch((err) => console.error("list_skills failed", err));
  }, []);

  const nextId = useCallback(() => `n${++idRef.current}`, []);

  const onConnect = useCallback(
    (c: Connection) => setEdges((eds) => addEdge(c, eds)),
    [setEdges],
  );

  const updateNodeData = useCallback(
    (nodeId: string, patch: Partial<FlowNodeData>) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === nodeId ? { ...n, data: { ...n.data, ...patch } } : n,
        ),
      );
    },
    [setNodes],
  );

  const deleteNode = useCallback(
    (nodeId: string) => {
      setNodes((nds) => nds.filter((n) => n.id !== nodeId));
      setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
      setMenu(null);
      if (editingId === nodeId) setEditingId(null);
    },
    [editingId, setNodes, setEdges],
  );

  const runNode = useCallback(
    async (nodeId: string) => {
      const node = nodes.find((n) => n.id === nodeId);
      if (!node) return;
      const prompt = buildPromptForNode(node.data);
      if (!prompt) return;
      try {
        await invoke("run_node", { nodeId: node.id, prompt });
      } catch (err) {
        console.error("run_node failed", err);
      }
    },
    [nodes],
  );

  const nodeActions = {
    openMenu: (nodeId: string, x: number, y: number) => setMenu({ nodeId, x, y }),
  };

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
   <NodeActionsContext.Provider value={nodeActions}>
    <div className="app app-no-inspector">
      <TopBar
        flowName={flowName}
        onSave={handleSave}
        onOpen={handleOpen}
      />
      <PanelGroup direction="horizontal" className="main">
        <Panel
          defaultSize={18}
          minSize={12}
          maxSize={35}
          className="panel-wrap"
        >
        <Library
          skills={skills}
          onAdd={(kind) => {
            const id = nextId();
            const offset = nodes.length * 24;
            const newNode: Node<FlowNodeData> = {
              id,
              type: kind,
              position: { x: 100 + offset, y: 100 + offset },
              data: defaultDataFor(kind),
            };
            setNodes((nds) => [...nds, newNode]);
          }}
          onAddSkill={(skillName) => {
            const id = nextId();
            const offset = nodes.length * 24;
            const data = defaultDataFor("skill");
            data.skill = skillName;
            data.title = skillName;
            const newNode: Node<FlowNodeData> = {
              id,
              type: "skill",
              position: { x: 100 + offset, y: 100 + offset },
              data,
            };
            setNodes((nds) => [...nds, newNode]);
          }}
        />
        </Panel>
        <PanelResizeHandle className="resize-handle" />
        <Panel minSize={30} className="panel-wrap">
        <Canvas
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onSelect={() => {}}
          onDrop={(kind, position, skill) => {
            const id = nextId();
            const data = defaultDataFor(kind);
            if (kind === "skill" && skill) data.skill = skill;
            const newNode: Node<FlowNodeData> = {
              id,
              type: kind,
              position,
              data,
            };
            setNodes((nds) => [...nds, newNode]);
          }}
        />
        </Panel>
        <PanelResizeHandle className="resize-handle" />
        <Panel
          defaultSize={28}
          minSize={15}
          maxSize={50}
          className="panel-wrap"
        >
          <TerminalPanel tab={tab} setTab={setTab} />
        </Panel>
      </PanelGroup>
      {menu && (
        <NodeMenu
          x={menu.x}
          y={menu.y}
          onRun={() => {
            runNode(menu.nodeId);
            setMenu(null);
          }}
          onEdit={() => {
            setEditingId(menu.nodeId);
            setMenu(null);
          }}
          onDelete={() => deleteNode(menu.nodeId)}
          onClose={() => setMenu(null)}
        />
      )}

      {editingNode && (
        <EditModal
          node={editingNode}
          skills={skills}
          onChange={(patch) => updateNodeData(editingNode.id, patch)}
          onRun={() => runNode(editingNode.id)}
          onClose={() => setEditingId(null)}
        />
      )}
    </div>
   </NodeActionsContext.Provider>
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
        <button className="btn btn-icon" onClick={onOpen} title="Open flow">
          <IconFolder />
        </button>
        <button className="btn btn-icon" onClick={onSave} title="Save flow">
          <IconSave />
        </button>
      </div>
      <div className="topbar-center">
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

function IconFolder() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path
        d="M1.5 3.5C1.5 2.95 1.95 2.5 2.5 2.5H5.5L7 4H11.5C12.05 4 12.5 4.45 12.5 5V10.5C12.5 11.05 12.05 11.5 11.5 11.5H2.5C1.95 11.5 1.5 11.05 1.5 10.5V3.5Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconSave() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path
        d="M2.5 2C2.5 1.72 2.72 1.5 3 1.5H9.5L12 4V11C12 11.55 11.55 12 11 12H3C2.45 12 2 11.55 2 11V2.5Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path
        d="M4.5 1.5V4.5H8.5V1.5"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <rect
        x="4.5"
        y="7"
        width="5"
        height="4.5"
        stroke="currentColor"
        strokeWidth="1.2"
      />
    </svg>
  );
}

/* ─────────────── Library ─────────────── */
function prettifySkillName(raw: string): string {
  return raw
    .replace(/_SKILL$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function Library({
  skills,
  onAdd,
  onAddSkill,
}: {
  skills: SkillEntry[];
  onAdd: (kind: NodeKind) => void;
  onAddSkill: (skillName: string) => void;
}) {
  const [skillsOpen, setSkillsOpen] = useState(false);

  const onDragStart = (e: React.DragEvent, kind: NodeKind, skill?: string) => {
    e.dataTransfer.setData("application/flowbench-node", kind);
    if (skill) e.dataTransfer.setData("application/flowbench-skill", skill);
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
          <span className="lib-grip" title="Drag to canvas">⋮⋮</span>
          <div className="lib-item-body">
            <div className="lib-item-name">{NODE_LABELS[k]}</div>
            <div className="lib-item-hint">{NODE_HINTS[k]}</div>
          </div>
          <button
            className="lib-add"
            onClick={(e) => {
              e.stopPropagation();
              onAdd(k);
            }}
            title={`Add ${NODE_LABELS[k]} node`}
          >
            +
          </button>
        </div>
      ))}

      <button
        className="accordion-header"
        onClick={() => setSkillsOpen((v) => !v)}
      >
        <span className="accordion-chevron">{skillsOpen ? "▾" : "▸"}</span>
        <span>Skills</span>
        <span className="count">{skills.length}</span>
      </button>

      {skillsOpen && (
        <div className="accordion-body">
          {skills.length === 0 && (
            <div className="empty">No skills found in ~/.claude/</div>
          )}
          {skills.map((s) => (
            <div
              key={`${s.kind}-${s.name}`}
              className="lib-item lib-item-compact"
              draggable
              onDragStart={(e) => onDragStart(e, "skill", s.name)}
              title={s.description}
            >
              <span className="lib-grip" title="Drag to canvas">⋮⋮</span>
              <div className="lib-item-body">
                <div className="lib-item-name">{prettifySkillName(s.name)}</div>
                <div className="lib-item-hint">{s.kind}</div>
              </div>
              <button
                className="lib-add"
                onClick={(e) => {
                  e.stopPropagation();
                  onAddSkill(s.name);
                }}
                title={`Add ${s.name}`}
              >
                +
              </button>
            </div>
          ))}
        </div>
      )}

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
  onDrop: (
    kind: NodeKind,
    position: { x: number; y: number },
    skill?: string,
  ) => void;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition } = useReactFlow();

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const kind = e.dataTransfer.getData("application/flowbench-node") as NodeKind;
    if (!kind) return;
    const skill = e.dataTransfer.getData("application/flowbench-skill") || undefined;
    const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    onDrop(kind, position, skill);
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
          defaultViewport={{ x: 0, y: 0, zoom: 1 }}
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
      <div className="terminal-body" style={{ padding: 0 }}>
        <div style={{ display: tab === "live" ? "flex" : "none", flex: 1, minHeight: 0 }}>
          <LiveTerminal />
        </div>
        {tab === "free" && <div className="empty">Free CC session — v2</div>}
        {tab === "logs" && <div className="empty">Pipeline logs — v2</div>}
      </div>
    </aside>
  );
}

/* ─────────────── Inspector ─────────────── */
function buildPromptForNode(d: FlowNodeData): string {
  if (d.kind === "prompt") return d.prompt || "";
  if (d.kind === "skill") return d.skill ? `/${d.skill}` : "";
  if (d.kind === "subagent") return d.subagentPrompt || "";
  if (d.kind === "assessment") return d.question || "";
  return "";
}

function NodeMenu({
  x,
  y,
  onRun,
  onEdit,
  onDelete,
  onClose,
}: {
  x: number;
  y: number;
  onRun: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const onClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest(".node-menu")) onClose();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClick);
    };
  }, [onClose]);

  return (
    <div className="node-menu" style={{ left: x, top: y }}>
      <button className="node-menu-item" onClick={onRun}>
        <span className="node-menu-icon"><IconPlay /></span> Run
      </button>
      <button className="node-menu-item" onClick={onEdit}>
        <span className="node-menu-icon"><IconPencil /></span> Edit
      </button>
      <div className="node-menu-divider" />
      <button className="node-menu-item node-menu-danger" onClick={onDelete}>
        <span className="node-menu-icon"><IconX /></span> Delete
      </button>
    </div>
  );
}

function IconPlay() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M3 2L10 6L3 10V2Z" fill="currentColor" />
    </svg>
  );
}

function IconPencil() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path
        d="M8.5 1.5L10.5 3.5L4 10H2V8L8.5 1.5Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconX() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path
        d="M3 3L9 9M9 3L3 9"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function EditModal({
  node,
  skills,
  onChange,
  onRun,
  onClose,
}: {
  node: Node<FlowNodeData>;
  skills: SkillEntry[];
  onChange: (patch: Partial<FlowNodeData>) => void;
  onRun: () => void;
  onClose: () => void;
}) {
  const d = node.data;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div className="section-label" style={{ padding: 0, marginBottom: 4 }}>
              {NODE_LABELS[d.kind]}
            </div>
            <div className="modal-title">{d.title || "Untitled"}</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-primary btn-sm" onClick={onRun}>
              ▶ Run
            </button>
            <button className="btn btn-icon" onClick={onClose} title="Close">
              ✕
            </button>
          </div>
        </div>

        <div className="modal-body">
          <Field label="Title">
            <input
              className="input"
              value={d.title}
              onChange={(e) => onChange({ title: e.target.value })}
            />
          </Field>

          {d.kind === "prompt" && (
            <Field label="Prompt">
              <textarea
                className="input"
                rows={6}
                value={d.prompt || ""}
                onChange={(e) => onChange({ prompt: e.target.value })}
                placeholder="What should Claude do?"
              />
            </Field>
          )}
          {d.kind === "skill" && (
            <Field label="Skill">
              <select
                className="input"
                value={d.skill || ""}
                onChange={(e) => onChange({ skill: e.target.value })}
              >
                <option value="">— Select a skill —</option>
                {skills.map((s) => (
                  <option key={`${s.kind}-${s.name}`} value={s.name}>
                    {s.name} ({s.kind})
                  </option>
                ))}
              </select>
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
                  rows={5}
                  value={d.subagentPrompt || ""}
                  onChange={(e) => onChange({ subagentPrompt: e.target.value })}
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
    </div>
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
