import { Handle, Position, NodeProps } from "reactflow";
import { FlowNodeData, NodeKind } from "./types";
import { useNodeActions } from "./nodeActions";

const KIND_COLORS: Record<string, string> = {
  prompt: "#1A1A1A",
  skill: "#2563EB",
  subagent: "#D97706",
  assessment: "#16A34A",
  output: "#9333EA",
};

export function NodeKindIcon({ kind }: { kind: NodeKind }) {
  if (kind === "prompt") {
    return (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <path
          d="M2 3.5C2 2.95 2.45 2.5 3 2.5H11C11.55 2.5 12 2.95 12 3.5V8.5C12 9.05 11.55 9.5 11 9.5H6L4 11.5V9.5H3C2.45 9.5 2 9.05 2 8.5V3.5Z"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
        <line x1="4.5" y1="5.5" x2="9.5" y2="5.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
        <line x1="4.5" y1="7" x2="8" y2="7" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === "skill") {
    return (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <path
          d="M8 1.5L3 8H6.5L5.5 12.5L10.5 6H7L8 1.5Z"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinejoin="round"
          fill="currentColor"
          fillOpacity="0.1"
        />
      </svg>
    );
  }
  if (kind === "subagent") {
    return (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <circle cx="7" cy="5" r="2.2" stroke="currentColor" strokeWidth="1.2" />
        <path
          d="M2.5 12C2.5 9.7 4.5 8 7 8C9.5 8 11.5 9.7 11.5 12"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  if (kind === "assessment") {
    return (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <path
          d="M7 1.5L12.5 7L7 12.5L1.5 7L7 1.5Z"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinejoin="round"
          fill="currentColor"
          fillOpacity="0.08"
        />
      </svg>
    );
  }
  // output — document with a small fold corner
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path
        d="M3 1.5H8.5L11.5 4.5V12C11.5 12.28 11.28 12.5 11 12.5H3C2.72 12.5 2.5 12.28 2.5 12V2C2.5 1.72 2.72 1.5 3 1.5Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path d="M8.5 1.5V4.5H11.5" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      <line x1="4.5" y1="6.5" x2="9.5" y2="6.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
      <line x1="4.5" y1="8" x2="9.5" y2="8" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
      <line x1="4.5" y1="9.5" x2="7.5" y2="9.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
    </svg>
  );
}

export function FlowNode({ id, data, selected }: NodeProps<FlowNodeData>) {
  const accent = KIND_COLORS[data.kind];
  const actions = useNodeActions();

  return (
    <div
      className={`flow-node ${selected ? "flow-node-selected" : ""} ${
        data.status ? `flow-node-${data.status}` : ""
      }`}
      onDoubleClick={(e) => {
        e.stopPropagation();
        actions.openEditor(id);
      }}
    >
      <Handle id="t-top" type="target" position={Position.Top} className="flow-handle" />
      <Handle id="t-left" type="target" position={Position.Left} className="flow-handle" />
      <Handle id="s-right" type="source" position={Position.Right} className="flow-handle" />
      <Handle id="s-bottom" type="source" position={Position.Bottom} className="flow-handle" />
      <div className="flow-node-head">
        <span className="flow-node-icon" style={{ color: accent }}>
          <NodeKindIcon kind={data.kind} />
        </span>
        <div className="flow-node-title">{data.title || "Untitled"}</div>
        <button
          className="flow-node-menu"
          onClick={(e) => {
            e.stopPropagation();
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            actions.openMenu(id, rect.right, rect.bottom);
          }}
          title="Node options"
        >
          ⋯
        </button>
      </div>
      <div className="flow-node-body">{summarize(data)}</div>
    </div>
  );
}

function summarize(d: FlowNodeData): string {
  if (d.kind === "prompt") return d.prompt?.slice(0, 60) || "No prompt";
  if (d.kind === "skill") return d.skill || "No skill selected";
  if (d.kind === "subagent")
    return d.subagentPrompt?.slice(0, 60) || "No instructions";
  if (d.kind === "assessment") return d.question?.slice(0, 60) || "No question";
  if (d.kind === "output") {
    const fmt = d.outputFormat || "markdown";
    return d.outputPath || `Save as ${fmt}`;
  }
  return "";
}

export const nodeTypes = {
  prompt: FlowNode,
  skill: FlowNode,
  subagent: FlowNode,
  assessment: FlowNode,
  output: FlowNode,
};
