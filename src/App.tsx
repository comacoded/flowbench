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
import { edgeTypes } from "./edges";
import { EdgeKind, FlowEdgeData } from "./types";
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
import { topoSort, waitForResume } from "./runLoop";
import {
  NodeStatus,
  ModelChoice,
  MODEL_LABELS,
  OutputFormat,
  OUTPUT_FORMAT_LABELS,
} from "./types";

interface SkillEntry {
  kind: "skill" | "command";
  name: string;
  description: string;
  path: string;
}

interface PlanEntry {
  from: string;
  to: string;
  instruction: string;
}

interface ContextPlan {
  edges: PlanEntry[];
  raw: string;
}

interface ClaudeStatus {
  kind: "connected" | "not_installed" | "not_signed_in" | "unknown";
  message: string;
}

interface NodeRunResult {
  nodeId: string;
  title: string;
  kind: NodeKind;
  status: "running" | "success" | "failed";
  model: ModelChoice;
  startedAt: number;
  endedAt?: number;
  output?: string;
  error?: string;
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
  const [tab, setTab] = useState<"results" | "live" | "plan" | "free">("results");
  const [contextPlan, setContextPlan] = useState<ContextPlan | null>(null);
  const [nodeResults, setNodeResults] = useState<Record<string, NodeRunResult>>({});
  const [flowName, setFlowName] = useState("untitled");
  const [skills, setSkills] = useState<SkillEntry[]>([]);
  const [claudeStatus, setClaudeStatus] = useState<ClaudeStatus | null>(null);
  const [statusOpen, setStatusOpen] = useState(false);

  const refreshClaudeStatus = useCallback(async () => {
    setClaudeStatus({ kind: "unknown", message: "Checking…" });
    try {
      const s = await invoke<ClaudeStatus>("claude_status");
      setClaudeStatus(s);
    } catch (err) {
      setClaudeStatus({ kind: "unknown", message: String(err) });
    }
  }, []);

  useEffect(() => {
    refreshClaudeStatus();
  }, [refreshClaudeStatus]);
  const [menu, setMenu] = useState<{ nodeId: string; x: number; y: number } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [preflightOpen, setPreflightOpen] = useState<"run" | "step" | null>(null);
  const [orchestratorModel, setOrchestratorModel] = useState<ModelChoice>("auto");
  const [runOverrides, setRunOverrides] = useState<Record<string, ModelChoice>>({});
  const idRef = useRef(0);
  const pausedRef = useRef(false);
  const cancelledRef = useRef(false);
  const [toast, setToast] = useState<{ kind: "success" | "error" | "info"; text: string } | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const showToast = useCallback(
    (kind: "success" | "error" | "info", text: string) => {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
      setToast({ kind, text });
      toastTimerRef.current = window.setTimeout(() => setToast(null), 3500);
    },
    [],
  );

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
        await invoke("run_node", {
          nodeId: node.id,
          prompt,
          model: resolveModel(node.data.model),
        });
      } catch (err) {
        console.error("run_node failed", err);
      }
    },
    [nodes],
  );

  const nodeActions = {
    openMenu: (nodeId: string, x: number, y: number) => setMenu({ nodeId, x, y }),
    openEditor: (nodeId: string) => setEditingId(nodeId),
  };

  // ─── Run loop ────────────────────────────────────────────────────

  const setNodeStatus = useCallback(
    (nodeId: string, status: NodeStatus) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === nodeId ? { ...n, data: { ...n.data, status } } : n,
        ),
      );
    },
    [setNodes],
  );

  const clearAllStatuses = useCallback(() => {
    setNodes((nds) =>
      nds.map((n) => ({ ...n, data: { ...n.data, status: "idle" as NodeStatus } })),
    );
  }, [setNodes]);

  const runGraph = useCallback(
    async (mode: "run" | "step", overrides: Record<string, ModelChoice> = {}) => {
      if (running) return;
      const order = topoSort(nodes, edges);
      if (!order) {
        console.error("graph has a cycle");
        return;
      }
      // "Runnable" includes assessment nodes — they have a question prompt.
      const runnable = order.filter((n) => buildPromptForNode(n.data).length > 0);
      if (runnable.length === 0) return;

      // Build adjacency: nodeId -> list of (edge, targetNode)
      const outgoing = new Map<string, Edge[]>();
      for (const n of nodes) outgoing.set(n.id, []);
      for (const e of edges) {
        if (outgoing.has(e.source)) outgoing.get(e.source)!.push(e);
      }

      // Roots: nodes with no incoming edges (within runnable)
      const incomingCount = new Map<string, number>();
      for (const n of runnable) incomingCount.set(n.id, 0);
      for (const e of edges) {
        if (incomingCount.has(e.target) && runnable.some((n) => n.id === e.source)) {
          incomingCount.set(e.target, (incomingCount.get(e.target) || 0) + 1);
        }
      }
      const roots = runnable.filter((n) => incomingCount.get(n.id) === 0);
      if (roots.length === 0) {
        console.error("no root nodes (cycle or isolated)");
        return;
      }

      setRunning(true);
      setPaused(false);
      pausedRef.current = false;
      cancelledRef.current = false;
      clearAllStatuses();

      // Plan-pass: ask the orchestrator how context should flow.
      let plan: ContextPlan | null = null;
      try {
        const summaryNodes = runnable.map((n) => ({
          id: n.id,
          kind: n.data.kind,
          title: n.data.title || "",
          intent: buildPromptForNode(n.data),
        }));
        const summaryEdges = edges
          .filter(
            (e) =>
              runnable.some((n) => n.id === e.source) &&
              runnable.some((n) => n.id === e.target),
          )
          .map((e) => ({ from: e.source, to: e.target }));
        if (summaryEdges.length > 0) {
          plan = await invoke<ContextPlan>("plan_graph", {
            nodes: summaryNodes,
            edges: summaryEdges,
            model: resolveModel(orchestratorModel),
          });
          setContextPlan(plan);
        } else {
          setContextPlan({ edges: [], raw: "(graph has no edges)" });
        }
      } catch (err) {
        console.error("plan_graph failed", err);
        setContextPlan({
          edges: [],
          raw: `Plan-pass failed:\n${String(err)}\n\nFalling back to no context routing.`,
        });
      }

      const outputs: Record<string, string> = {};
      const branchTaken: Record<string, string> = {}; // assessment node → chosen branch
      let succeeded = 0;
      let failed = 0;
      let executedCount = 0;
      const SOFT_CAP = 30;
      setNodeResults({});

      // Parallel batched walker honoring edge kinds.
      // Each node tracks how many of its incoming edges are still pending settlement.
      // A node becomes ready when all incoming edges have been settled and at least
      // one of them fired (or it's a root).
      const remainingDeps = new Map<string, number>();
      for (const n of runnable) {
        const incomingEdges = edges.filter(
          (e) =>
            e.target === n.id && runnable.some((rn) => rn.id === e.source),
        );
        remainingDeps.set(n.id, incomingEdges.length);
      }
      const scheduled = new Set<string>(roots.map((r) => r.id));
      const completed = new Set<string>();
      const nodeOutcome: Record<string, "success" | "failed"> = {};

      const settleEdgesFrom = (sourceId: string) => {
        const status = nodeOutcome[sourceId];
        if (!status) return;
        const out = outgoing.get(sourceId) || [];
        for (const e of out) {
          const ed = (e.data as FlowEdgeData) || {};
          const kind = ed.kind || "sequential";
          let fires = false;
          if (kind === "sequential" || kind === "success") fires = status === "success";
          else if (kind === "failure") fires = status === "failed";
          else if (kind === "conditional") {
            const chosen = branchTaken[sourceId];
            fires = !!chosen && (ed.branch || "").trim() === chosen.trim();
          }
          const target = runnable.find((rn) => rn.id === e.target);
          if (!target) continue;
          remainingDeps.set(target.id, (remainingDeps.get(target.id) || 0) - 1);
          if (fires) scheduled.add(target.id);
        }
      };

      const runOneNode = async (node: Node<FlowNodeData>) => {
        setNodeStatus(node.id, "running");
        const effectiveModel: ModelChoice =
          overrides[node.id] || node.data.model || "auto";
        setNodeResults((prev) => ({
          ...prev,
          [node.id]: {
            nodeId: node.id,
            title: node.data.title || "Untitled",
            kind: node.data.kind,
            status: "running",
            model: effectiveModel,
            startedAt: Date.now(),
          },
        }));
        try {
          // Build context from upstream outputs per the orchestrator plan.
          const incoming = (plan?.edges || []).filter(
            (pe) => pe.to === node.id && pe.instruction.toLowerCase() !== "none",
          );
          let contextPrefix = "";
          for (const pe of incoming) {
            const upstreamOut = outputs[pe.from];
            if (!upstreamOut) continue;
            const upstreamTitle =
              runnable.find((n) => n.id === pe.from)?.data.title || pe.from;
            contextPrefix += `\n\n--- context from "${upstreamTitle}" (${pe.instruction}) ---\n${upstreamOut.trim()}\n--- end context ---`;
          }
          const finalPrompt = contextPrefix
            ? `${contextPrefix}\n\n${buildPromptForNode(node.data)}`
            : buildPromptForNode(node.data);

          const result = await invoke<{ output: string }>("run_node", {
            nodeId: node.id,
            prompt: finalPrompt,
            model: resolveModel(effectiveModel),
          });
          outputs[node.id] = result.output || "";
          setNodeStatus(node.id, "success");
          setNodeResults((prev) => ({
            ...prev,
            [node.id]: {
              ...prev[node.id],
              status: "success",
              endedAt: Date.now(),
              output: result.output || "",
            },
          }));
          nodeOutcome[node.id] = "success";
          succeeded++;

          if (node.data.kind === "assessment") {
            const branches = node.data.branches || [];
            const lower = (result.output || "").toLowerCase();
            const found = branches.find((b) => lower.includes(b.toLowerCase()));
            if (found) branchTaken[node.id] = found;
          }
        } catch (err) {
          console.error(`node ${node.id} failed`, err);
          setNodeStatus(node.id, "failed");
          setNodeResults((prev) => ({
            ...prev,
            [node.id]: {
              ...prev[node.id],
              status: "failed",
              endedAt: Date.now(),
              error: String(err),
            },
          }));
          nodeOutcome[node.id] = "failed";
          failed++;
        }
      };

      try {
        while (true) {
          await waitForResume(
            () => pausedRef.current,
            () => cancelledRef.current,
          );
          if (cancelledRef.current) break;

          // Find all currently-ready nodes: scheduled, not completed, all deps settled.
          const ready = runnable.filter(
            (n) =>
              scheduled.has(n.id) &&
              !completed.has(n.id) &&
              (remainingDeps.get(n.id) || 0) === 0,
          );
          if (ready.length === 0) break;

          // Step mode: only one at a time.
          const batch = mode === "step" ? ready.slice(0, 1) : ready;
          for (const n of batch) completed.add(n.id);

          // Run the batch concurrently.
          await Promise.all(batch.map(runOneNode));
          executedCount += batch.length;

          // After the batch, settle outgoing edges from each completed node.
          for (const n of batch) {
            settleEdgesFrom(n.id);
          }

          // If anything in the batch failed, pause for human intervention.
          const anyFailed = batch.some((n) => nodeOutcome[n.id] === "failed");
          if (anyFailed) {
            pausedRef.current = true;
            setPaused(true);
            await waitForResume(
              () => pausedRef.current,
              () => cancelledRef.current,
            );
            if (cancelledRef.current) break;
          }

          // Soft cap.
          if (executedCount >= SOFT_CAP) {
            showToast("info", `Soft cap of ${SOFT_CAP} nodes reached. Pausing.`);
            pausedRef.current = true;
            setPaused(true);
            await waitForResume(
              () => pausedRef.current,
              () => cancelledRef.current,
            );
            if (cancelledRef.current) break;
            executedCount = 0;
          }

          // Step mode pauses after each batch (which is one node).
          if (mode === "step") {
            pausedRef.current = true;
            setPaused(true);
          }
        }
      } finally {
        setRunning(false);
        setPaused(false);
        pausedRef.current = false;
        cancelledRef.current = false;
        if (failed > 0) {
          showToast("error", `Run finished with ${failed} failed node${failed > 1 ? "s" : ""}`);
        } else if (succeeded > 0) {
          showToast("success", `Run complete · ${succeeded} node${succeeded > 1 ? "s" : ""}`);
        }
      }
    },
    [running, nodes, edges, clearAllStatuses, setNodeStatus, showToast, orchestratorModel],
  );

  const handleRun = () => {
    setRunOverrides({});
    setPreflightOpen("run");
  };
  const handleStep = () => {
    if (running && paused) {
      pausedRef.current = false;
      setPaused(false);
    } else {
      setRunOverrides({});
      setPreflightOpen("step");
    }
  };
  const confirmPreflight = () => {
    const mode = preflightOpen!;
    setPreflightOpen(null);
    runGraph(mode, runOverrides);
  };
  const handlePause = () => {
    if (!running) return;
    if (paused) {
      pausedRef.current = false;
      setPaused(false);
    } else {
      pausedRef.current = true;
      setPaused(true);
    }
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
        onRun={handleRun}
        onStep={handleStep}
        onPause={handlePause}
        running={running}
        paused={paused}
        claudeStatus={claudeStatus}
        onOpenStatus={() => setStatusOpen(true)}
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
          onAddOutput={(format) => {
            const id = nextId();
            const offset = nodes.length * 24;
            const data = defaultDataFor("output");
            data.outputFormat = format;
            data.title = OUTPUT_FORMAT_LABELS[format];
            const newNode: Node<FlowNodeData> = {
              id,
              type: "output",
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
          onNodeDoubleClick={(n) => setEditingId(n.id)}
          onEdgeClick={(edge) => {
            const cycle: EdgeKind[] = ["sequential", "success", "failure", "conditional"];
            const current = (edge.data as FlowEdgeData)?.kind || "sequential";
            const next = cycle[(cycle.indexOf(current) + 1) % cycle.length];
            setEdges((eds) =>
              eds.map((e) =>
                e.id === edge.id ? { ...e, data: { ...(e.data || {}), kind: next } } : e,
              ),
            );
          }}
          onDrop={(kind, position, skill, outputFormat) => {
            const id = nextId();
            const data = defaultDataFor(kind);
            if (kind === "skill" && skill) data.skill = skill;
            if (kind === "output" && outputFormat) {
              data.outputFormat = outputFormat as OutputFormat;
              data.title = OUTPUT_FORMAT_LABELS[outputFormat as OutputFormat];
            }
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
          <TerminalPanel
            tab={tab}
            setTab={setTab}
            contextPlan={contextPlan}
            nodeResults={nodeResults}
          />
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

      {preflightOpen && (
        <PreflightModal
          mode={preflightOpen}
          nodes={nodes}
          edges={edges}
          orchestratorModel={orchestratorModel}
          setOrchestratorModel={setOrchestratorModel}
          overrides={runOverrides}
          setOverrides={setRunOverrides}
          onConfirm={confirmPreflight}
          onClose={() => setPreflightOpen(null)}
        />
      )}

      {statusOpen && (
        <ClaudeStatusModal
          status={claudeStatus}
          onRefresh={refreshClaudeStatus}
          onClose={() => setStatusOpen(false)}
        />
      )}

      {toast && (
        <div className={`toast toast-${toast.kind}`}>
          {toast.kind === "success" && <span className="toast-icon">✓</span>}
          {toast.kind === "error" && <span className="toast-icon">✕</span>}
          <span>{toast.text}</span>
        </div>
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
  onRun,
  onStep,
  onPause,
  running,
  paused,
  claudeStatus,
  onOpenStatus,
}: {
  flowName: string;
  onSave: () => void;
  onOpen: () => void;
  onRun: () => void;
  onStep: () => void;
  onPause: () => void;
  running: boolean;
  paused: boolean;
  claudeStatus: ClaudeStatus | null;
  onOpenStatus: () => void;
}) {
  const runLabel = running ? (paused ? "Paused" : "Running") : "Run";
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
        <button
          className={`status-pill status-${claudeStatus?.kind || "unknown"}`}
          onClick={onOpenStatus}
          title={claudeStatus?.message || "Checking…"}
        >
          <span className="status-dot" />
          <span>
            {claudeStatus?.kind === "connected"
              ? "Connected"
              : claudeStatus?.kind === "not_signed_in"
                ? "Not signed in"
                : claudeStatus?.kind === "not_installed"
                  ? "Not installed"
                  : "Checking…"}
          </span>
        </button>
        <button
          className="btn btn-primary"
          onClick={onRun}
          disabled={running && !paused}
          title="Run the whole graph"
        >
          <IconPlay /> {runLabel}
        </button>
        <button
          className="btn btn-icon"
          onClick={onStep}
          title="Step one node"
        >
          <IconStep />
        </button>
        <button
          className="btn btn-icon"
          onClick={onPause}
          title={paused ? "Resume" : "Pause"}
          disabled={!running}
        >
          {paused ? <IconPlay /> : <IconPause />}
        </button>
      </div>
    </header>
  );
}

function IconStep() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M3 3L8 7L3 11V3Z" fill="currentColor" />
      <line x1="10" y1="3" x2="10" y2="11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function IconPause() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <rect x="3.5" y="3" width="2.5" height="8" rx="0.5" fill="currentColor" />
      <rect x="8" y="3" width="2.5" height="8" rx="0.5" fill="currentColor" />
    </svg>
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
  onAddOutput,
}: {
  skills: SkillEntry[];
  onAdd: (kind: NodeKind) => void;
  onAddSkill: (skillName: string) => void;
  onAddOutput: (format: OutputFormat) => void;
}) {
  const [nodeTypesOpen, setNodeTypesOpen] = useState(true);
  const [outputsOpen, setOutputsOpen] = useState(false);
  const [skillsOpen, setSkillsOpen] = useState(false);

  const onDragStart = (
    e: React.DragEvent,
    kind: NodeKind,
    extras?: { skill?: string; outputFormat?: OutputFormat },
  ) => {
    e.dataTransfer.setData("application/flowbench-node", kind);
    if (extras?.skill) e.dataTransfer.setData("application/flowbench-skill", extras.skill);
    if (extras?.outputFormat)
      e.dataTransfer.setData("application/flowbench-output", extras.outputFormat);
    e.dataTransfer.effectAllowed = "move";
  };

  const kinds: NodeKind[] = ["prompt", "skill", "subagent", "assessment"];
  const outputFormats: OutputFormat[] = [
    "markdown",
    "word",
    "powerpoint",
    "figma",
    "json",
  ];

  return (
    <aside className="panel library">
      <button
        className="accordion-header"
        onClick={() => setNodeTypesOpen((v) => !v)}
      >
        <span className="accordion-chevron">{nodeTypesOpen ? "▾" : "▸"}</span>
        <span>Node types</span>
        <span className="count">{kinds.length}</span>
      </button>
      {nodeTypesOpen && (
        <div className="accordion-body">
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
        </div>
      )}

      <button
        className="accordion-header"
        onClick={() => setOutputsOpen((v) => !v)}
      >
        <span className="accordion-chevron">{outputsOpen ? "▾" : "▸"}</span>
        <span>Outputs</span>
        <span className="count">{outputFormats.length}</span>
      </button>
      {outputsOpen && (
        <div className="accordion-body">
          {outputFormats.map((f) => (
            <div
              key={f}
              className="lib-item"
              draggable
              onDragStart={(e) => onDragStart(e, "output", { outputFormat: f })}
              title={`Save as ${OUTPUT_FORMAT_LABELS[f]}`}
            >
              <span className="lib-grip" title="Drag to canvas">⋮⋮</span>
              <span className="lib-item-format-icon">
                <OutputFormatIcon format={f} />
              </span>
              <div className="lib-item-body">
                <div className="lib-item-name">{OUTPUT_FORMAT_LABELS[f]}</div>
              </div>
              <button
                className="lib-add"
                onClick={(e) => {
                  e.stopPropagation();
                  onAddOutput(f);
                }}
                title={`Add ${OUTPUT_FORMAT_LABELS[f]} output`}
              >
                +
              </button>
            </div>
          ))}
        </div>
      )}

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
              onDragStart={(e) => onDragStart(e, "skill", { skill: s.name })}
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

function OutputFormatIcon({ format }: { format: OutputFormat }) {
  if (format === "word") {
    return (
      <svg width="18" height="18" viewBox="0 0 18 18">
        <rect x="1" y="1" width="16" height="16" rx="3" fill="#2B579A" />
        <text x="9" y="13" fontSize="10" fontFamily="Inter, sans-serif" fontWeight="700" fill="#FFF" textAnchor="middle">W</text>
      </svg>
    );
  }
  if (format === "powerpoint") {
    return (
      <svg width="18" height="18" viewBox="0 0 18 18">
        <rect x="1" y="1" width="16" height="16" rx="3" fill="#D24726" />
        <text x="9" y="13" fontSize="10" fontFamily="Inter, sans-serif" fontWeight="700" fill="#FFF" textAnchor="middle">P</text>
      </svg>
    );
  }
  if (format === "figma") {
    return (
      <svg width="18" height="18" viewBox="0 0 18 18">
        <rect x="3" y="1" width="5" height="5" rx="2.5" fill="#F24E1E" />
        <rect x="3" y="6" width="5" height="5" fill="#A259FF" />
        <rect x="3" y="11" width="5" height="5" rx="2.5" fill="#0ACF83" />
        <rect x="8" y="6" width="5" height="5" rx="2.5" fill="#FF7262" />
        <rect x="8" y="1" width="5" height="5" rx="2.5" fill="#1ABCFE" />
      </svg>
    );
  }
  if (format === "json") {
    return (
      <svg width="18" height="18" viewBox="0 0 18 18">
        <rect x="1" y="1" width="16" height="16" rx="3" fill="#1A1A1A" />
        <text x="9" y="13" fontSize="9" fontFamily="JetBrains Mono, monospace" fontWeight="600" fill="#FFF" textAnchor="middle">{"{ }"}</text>
      </svg>
    );
  }
  // markdown
  return (
    <svg width="18" height="18" viewBox="0 0 18 18">
      <rect x="1" y="1" width="16" height="16" rx="3" fill="#FFF" stroke="#1A1A1A" strokeWidth="1.2" />
      <text x="9" y="13" fontSize="9" fontFamily="JetBrains Mono, monospace" fontWeight="700" fill="#1A1A1A" textAnchor="middle">M↓</text>
    </svg>
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
  onNodeDoubleClick,
  onEdgeClick,
  onDrop,
}: {
  nodes: Node<FlowNodeData>[];
  edges: Edge[];
  onNodesChange: any;
  onEdgesChange: any;
  onConnect: (c: Connection) => void;
  onSelect: (n: Node<FlowNodeData> | null) => void;
  onNodeDoubleClick: (n: Node<FlowNodeData>) => void;
  onEdgeClick: (e: Edge) => void;
  onDrop: (
    kind: NodeKind,
    position: { x: number; y: number },
    skill?: string,
    outputFormat?: string,
  ) => void;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition } = useReactFlow();

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const kind = e.dataTransfer.getData("application/flowbench-node") as NodeKind;
    if (!kind) return;
    const skill = e.dataTransfer.getData("application/flowbench-skill") || undefined;
    const outputFormat = e.dataTransfer.getData("application/flowbench-output") || undefined;
    const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    onDrop(kind, position, skill, outputFormat);
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
          onNodeDoubleClick={(_, node) => onNodeDoubleClick(node)}
          onEdgeClick={(_, edge) => onEdgeClick(edge)}
          onPaneClick={() => onSelect(null)}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          defaultEdgeOptions={{ data: { kind: "sequential" } }}
          defaultViewport={{ x: 0, y: 0, zoom: 1 }}
          zoomOnDoubleClick={false}
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
  contextPlan,
  nodeResults,
}: {
  tab: "results" | "live" | "plan" | "free";
  setTab: (t: "results" | "live" | "plan" | "free") => void;
  contextPlan: ContextPlan | null;
  nodeResults: Record<string, NodeRunResult>;
}) {
  return (
    <aside className="panel terminal">
      <div className="tabs">
        {(["results", "live", "plan", "free"] as const).map((t) => (
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
        {tab === "results" && <ResultsView results={nodeResults} />}
        <div style={{ display: tab === "live" ? "flex" : "none", flex: 1, minHeight: 0 }}>
          <LiveTerminal />
        </div>
        {tab === "plan" && <PlanView plan={contextPlan} />}
        {tab === "free" && <div className="empty">Free CC session — v2</div>}
      </div>
    </aside>
  );
}

function ResultsView({ results }: { results: Record<string, NodeRunResult> }) {
  const list = Object.values(results).sort((a, b) => a.startedAt - b.startedAt);

  if (list.length === 0) {
    return (
      <div className="results-view">
        <div className="empty">
          No results yet. Click ▶ Run to execute the graph.
        </div>
      </div>
    );
  }

  return (
    <div className="results-view">
      {list.map((r, i) => (
        <ResultCard key={r.nodeId} result={r} index={i + 1} />
      ))}
    </div>
  );
}

function ResultCard({ result, index }: { result: NodeRunResult; index: number }) {
  const [expanded, setExpanded] = useState(true);
  const duration =
    result.endedAt && result.startedAt
      ? `${((result.endedAt - result.startedAt) / 1000).toFixed(1)}s`
      : "…";

  return (
    <div className={`result-card result-${result.status}`}>
      <button
        className="result-head"
        onClick={() => setExpanded((v) => !v)}
      >
        <span className="result-num">{index}</span>
        <span className="result-status-dot" />
        <span className="result-title">{result.title}</span>
        <span className="result-meta">
          {MODEL_LABELS[result.model]} · {duration}
        </span>
        <span className="result-chevron">{expanded ? "▾" : "▸"}</span>
      </button>
      {expanded && (
        <div className="result-body">
          {result.status === "running" && (
            <div className="empty">Running…</div>
          )}
          {result.status === "success" && (
            <pre className="result-output">{result.output || "(no output)"}</pre>
          )}
          {result.status === "failed" && (
            <pre className="result-output result-error">{result.error}</pre>
          )}
        </div>
      )}
    </div>
  );
}

function PlanView({ plan }: { plan: ContextPlan | null }) {
  if (!plan) {
    return (
      <div className="plan-view">
        <div className="empty">
          No context plan yet. The orchestrator runs at the start of every Run.
        </div>
      </div>
    );
  }
  if (plan.edges.length === 0) {
    return (
      <div className="plan-view">
        <div className="section-label" style={{ padding: "0 0 8px" }}>Context plan</div>
        <div className="empty">{plan.raw}</div>
      </div>
    );
  }
  return (
    <div className="plan-view">
      <div className="section-label" style={{ padding: "0 0 8px" }}>
        Context plan · {plan.edges.length} edge{plan.edges.length !== 1 ? "s" : ""}
      </div>
      {plan.edges.map((e, i) => (
        <div key={i} className="plan-edge">
          <div className="plan-edge-route">
            <code>{e.from}</code> <span className="plan-edge-arrow">→</span>{" "}
            <code>{e.to}</code>
          </div>
          <div
            className={`plan-edge-instruction ${
              e.instruction.toLowerCase() === "none" ? "plan-none" : ""
            }`}
          >
            {e.instruction}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─────────────── Inspector ─────────────── */
function resolveModel(choice: ModelChoice | undefined): string {
  if (!choice || choice === "auto") return "auto";
  if (choice === "opus") return "claude-opus-4-6";
  if (choice === "sonnet") return "claude-sonnet-4-6";
  if (choice === "haiku") return "claude-haiku-4-5";
  return "auto";
}

function buildPromptForNode(d: FlowNodeData): string {
  if (d.kind === "prompt") return d.prompt || "";
  if (d.kind === "skill") return d.skill ? `/${d.skill}` : "";
  if (d.kind === "subagent") return d.subagentPrompt || "";
  if (d.kind === "assessment") return d.question || "";
  if (d.kind === "output") {
    const fmt = d.outputFormat || "markdown";
    const path = d.outputPath || `~/Desktop/flowbench-output.${defaultExtFor(fmt)}`;
    return outputInstructionFor(fmt, path);
  }
  return "";
}

function defaultExtFor(fmt: OutputFormat): string {
  if (fmt === "word") return "docx";
  if (fmt === "powerpoint") return "pptx";
  if (fmt === "figma") return "fig";
  if (fmt === "json") return "json";
  return "md";
}

function outputInstructionFor(fmt: OutputFormat, path: string): string {
  const common = `Take the upstream context provided above and create a real ${OUTPUT_FORMAT_LABELS[fmt]} file at: ${path}`;
  if (fmt === "markdown") {
    return `${common}\n\nWrite the content as well-formatted Markdown with headings, lists, and any tables that fit the data. Use the Write tool. Do not summarize — preserve full content.`;
  }
  if (fmt === "word") {
    return `${common}\n\nUse python-docx (Python) to generate a real .docx. Run a python script via the Bash tool that imports docx, builds the document with headings/paragraphs/tables matching the structure of the upstream content, and saves it to the path. If python-docx isn't installed, install it with pip first.`;
  }
  if (fmt === "powerpoint") {
    return `${common}\n\nUse python-pptx (Python) to generate a real .pptx. Run a python script via the Bash tool that imports pptx, builds slides with title/content layouts based on the upstream structure, and saves it to the path. If python-pptx isn't installed, install it with pip first.`;
  }
  if (fmt === "figma") {
    return `${common}\n\nIf the user has a figma-cli skill or Figma plugin installed, use it. Otherwise, generate a Figma-import-friendly JSON describing the design and save it to the path with a .json extension. The user can then import it manually.`;
  }
  // json
  return `${common}\n\nWrite the content as a single well-formed JSON document. Use the Write tool.`;
}

function ClaudeStatusModal({
  status,
  onRefresh,
  onClose,
}: {
  status: ClaudeStatus | null;
  onRefresh: () => void;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState<"login" | "logout" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async () => {
    setBusy("login");
    setError(null);
    try {
      await invoke("claude_login");
      await onRefresh();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(null);
    }
  };

  const handleLogout = async () => {
    setBusy("logout");
    setError(null);
    try {
      await invoke("claude_logout");
      await onRefresh();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(null);
    }
  };

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
              Claude connection
            </div>
            <div className="modal-title">
              {status?.kind === "connected"
                ? "Connected"
                : status?.kind === "not_signed_in"
                  ? "Not signed in"
                  : status?.kind === "not_installed"
                    ? "Claude not installed"
                    : "Status unknown"}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-sm" onClick={onRefresh}>
              Refresh
            </button>
            <button className="btn btn-icon" onClick={onClose} title="Close">
              <IconX />
            </button>
          </div>
        </div>
        <div className="modal-body">
          <p style={{ margin: "0 0 16px", fontSize: 13, color: "var(--ch-text-secondary)" }}>
            {status?.message || "Checking the system claude install…"}
          </p>

          {error && (
            <div
              style={{
                padding: 12,
                background: "#FEF2F2",
                border: "1px solid #FECACA",
                borderRadius: 8,
                color: "var(--ch-error)",
                fontSize: 12,
                marginBottom: 16,
                fontFamily: "var(--ch-font-mono)",
                whiteSpace: "pre-wrap",
              }}
            >
              {error}
            </div>
          )}

          {(status?.kind === "not_signed_in" || status?.kind === "unknown") && (
            <>
              <button
                className="btn btn-primary"
                style={{ width: "100%", padding: "10px 16px", fontSize: 13 }}
                onClick={handleLogin}
                disabled={busy !== null}
              >
                {busy === "login"
                  ? "Waiting for browser sign-in…"
                  : "Sign in with Claude"}
              </button>
              <p style={{ margin: "12px 0 0", fontSize: 12, color: "var(--ch-text-tertiary)", lineHeight: 1.5 }}>
                A browser window will open to sign you in to your Claude account. Flowbench uses your existing Claude Max subscription — no separate billing.
              </p>
            </>
          )}

          {status?.kind === "not_installed" && (
            <>
              <div className="section-label" style={{ padding: "0 0 8px" }}>Install Claude Code</div>
              <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--ch-text)" }}>
                Flowbench needs the Claude Code CLI installed on your machine. It's a free download from Anthropic.
              </p>
              <a
                href="https://claude.com/download"
                target="_blank"
                rel="noreferrer"
                className="btn btn-primary"
                style={{
                  display: "inline-block",
                  padding: "8px 14px",
                  textDecoration: "none",
                  fontSize: 12,
                }}
              >
                Download Claude Code
              </a>
            </>
          )}

          {status?.kind === "connected" && (
            <button
              className="btn"
              style={{
                width: "100%",
                padding: "10px 16px",
                fontSize: 13,
                border: "1px solid var(--ch-border)",
                borderRadius: 8,
                color: "var(--ch-error)",
              }}
              onClick={handleLogout}
              disabled={busy !== null}
            >
              {busy === "logout" ? "Signing out…" : "Sign out"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function PreflightModal({
  mode,
  nodes,
  edges,
  orchestratorModel,
  setOrchestratorModel,
  overrides,
  setOverrides,
  onConfirm,
  onClose,
}: {
  mode: "run" | "step";
  nodes: Node<FlowNodeData>[];
  edges: Edge[];
  orchestratorModel: ModelChoice;
  setOrchestratorModel: (m: ModelChoice) => void;
  overrides: Record<string, ModelChoice>;
  setOverrides: (o: Record<string, ModelChoice>) => void;
  onConfirm: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onConfirm();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onConfirm]);

  const order = topoSort(nodes, edges);
  const runnable = (order || []).filter(
    (n) => buildPromptForNode(n.data).length > 0,
  );

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
              Run preflight
            </div>
            <div className="modal-title">
              {mode === "run" ? "Run the whole graph" : "Step through nodes"}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-primary btn-sm" onClick={onConfirm}>
              <IconPlay /> Confirm
            </button>
            <button className="btn btn-icon" onClick={onClose} title="Close">
              <IconX />
            </button>
          </div>
        </div>

        <div className="modal-body">
          <Field label="Orchestrator model">
            <select
              className="input"
              value={orchestratorModel}
              onChange={(e) => setOrchestratorModel(e.target.value as ModelChoice)}
            >
              {(Object.keys(MODEL_LABELS) as ModelChoice[]).map((m) => (
                <option key={m} value={m}>
                  {MODEL_LABELS[m]}
                  {m === "opus" ? " — Recommended" : ""}
                </option>
              ))}
            </select>
          </Field>

          <div className="section-label" style={{ padding: "16px 0 8px" }}>
            Nodes to run · {runnable.length}
          </div>

          {runnable.length === 0 && (
            <div className="empty">
              No runnable nodes found. Add a Prompt or Skill node and try again.
            </div>
          )}

          <div className="preflight-list">
            {runnable.map((n, i) => {
              const effective = overrides[n.id] || n.data.model || "auto";
              return (
                <div className="preflight-row" key={n.id}>
                  <div className="preflight-row-num">{i + 1}</div>
                  <div className="preflight-row-name">
                    {n.data.title || "Untitled"}
                  </div>
                  <select
                    className="input preflight-row-model"
                    value={effective}
                    onChange={(e) =>
                      setOverrides({
                        ...overrides,
                        [n.id]: e.target.value as ModelChoice,
                      })
                    }
                  >
                    {(Object.keys(MODEL_LABELS) as ModelChoice[]).map((m) => (
                      <option key={m} value={m}>
                        {MODEL_LABELS[m]}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
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
  const [draft, setDraft] = useState<FlowNodeData>(node.data);
  const d = draft;
  const dirty = JSON.stringify(draft) !== JSON.stringify(node.data);

  const patch = (p: Partial<FlowNodeData>) => setDraft((prev) => ({ ...prev, ...p }));

  const handleSave = () => {
    onChange(draft);
  };

  const handleClose = () => {
    if (dirty && !confirm("Discard unsaved changes?")) return;
    onClose();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && dirty) handleSave();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dirty]);

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
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
            {dirty && (
              <button className="btn btn-primary btn-sm" onClick={handleSave}>
                Save
              </button>
            )}
            <button className="btn btn-sm" onClick={onRun} disabled={dirty}>
              <IconPlay /> Run
            </button>
            <button className="btn btn-icon" onClick={handleClose} title="Close">
              <IconX />
            </button>
          </div>
        </div>

        <div className="modal-body">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 200px", gap: 12 }}>
            <Field label="Title">
              <input
                className="input"
                value={d.title}
                onChange={(e) => patch({ title: e.target.value })}
              />
            </Field>
            <Field label="Model">
              <select
                className="input"
                value={d.model || "auto"}
                onChange={(e) =>
                  patch({ model: e.target.value as ModelChoice })
                }
              >
                {(Object.keys(MODEL_LABELS) as ModelChoice[]).map((m) => (
                  <option key={m} value={m}>
                    {MODEL_LABELS[m]}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          {d.kind === "prompt" && (
            <Field label="Prompt">
              <textarea
                className="input"
                rows={6}
                value={d.prompt || ""}
                onChange={(e) => patch({ prompt: e.target.value })}
                placeholder="What should Claude do?"
              />
            </Field>
          )}
          {d.kind === "skill" && (
            <Field label="Skill">
              <select
                className="input"
                value={d.skill || ""}
                onChange={(e) => patch({ skill: e.target.value })}
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
                  onChange={(e) => patch({ subagentType: e.target.value })}
                />
              </Field>
              <Field label="Instructions">
                <textarea
                  className="input"
                  rows={5}
                  value={d.subagentPrompt || ""}
                  onChange={(e) => patch({ subagentPrompt: e.target.value })}
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
                  onChange={(e) => patch({ question: e.target.value })}
                  placeholder="What should the LLM judge?"
                />
              </Field>
              <Field label="Branches (comma-separated)">
                <input
                  className="input"
                  value={(d.branches || []).join(", ")}
                  onChange={(e) =>
                    patch({
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
          {d.kind === "output" && (
            <>
              <Field label="Format">
                <select
                  className="input"
                  value={d.outputFormat || "markdown"}
                  onChange={(e) =>
                    patch({ outputFormat: e.target.value as OutputFormat })
                  }
                >
                  {(Object.keys(OUTPUT_FORMAT_LABELS) as OutputFormat[]).map((f) => (
                    <option key={f} value={f}>
                      {OUTPUT_FORMAT_LABELS[f]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Save path">
                <input
                  className="input"
                  value={d.outputPath || ""}
                  onChange={(e) => patch({ outputPath: e.target.value })}
                  placeholder="~/Desktop/my-output.md"
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
