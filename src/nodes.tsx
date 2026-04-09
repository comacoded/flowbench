import { Handle, Position, NodeProps } from "reactflow";
import { FlowNodeData, NodeKind } from "./types";
import { useNodeActions } from "./nodeActions";
import { OutputFormatIcon } from "./formatIcons";

const KIND_COLORS: Record<string, string> = {
  prompt: "#1A1A1A",
  skill: "#2563EB",
  subagent: "#D97706",
  assessment: "#16A34A",
  output: "#9333EA",
  repository: "#0891B2",
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
  if (kind === "output") {
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
  // repository — folder with a small file glyph
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path
        d="M1.5 4C1.5 3.45 1.95 3 2.5 3H5.5L7 4.5H11.5C12.05 4.5 12.5 4.95 12.5 5.5V11C12.5 11.55 12.05 12 11.5 12H2.5C1.95 12 1.5 11.55 1.5 11V4Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <line x1="5" y1="7.5" x2="9" y2="7.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
      <line x1="5" y1="9" x2="8" y2="9" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
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
          {data.kind === "output" && data.outputFormat ? (
            <OutputFormatIcon format={data.outputFormat} />
          ) : (
            <NodeKindIcon kind={data.kind} />
          )}
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
  if (d.kind === "prompt") {
    const a = (d.attachments || []).length;
    const base = d.prompt?.slice(0, 60) || "No prompt";
    return a > 0 ? `${base}  ·  ${a} file${a > 1 ? "s" : ""}` : base;
  }
  if (d.kind === "skill") {
    const a = (d.attachments || []).length;
    const base = d.skill || "No skill selected";
    return a > 0 ? `${base}  ·  ${a} file${a > 1 ? "s" : ""}` : base;
  }
  if (d.kind === "subagent")
    return d.subagentPrompt?.slice(0, 60) || "No instructions";
  if (d.kind === "assessment") return d.question?.slice(0, 60) || "No question";
  if (d.kind === "output") {
    const fmt = d.outputFormat || "markdown";
    return d.outputPath || `Save as ${fmt}`;
  }
  if (d.kind === "repository") {
    return d.repoPath || "No path set";
  }
  return "";
}

export const nodeTypes = {
  prompt: FlowNode,
  skill: FlowNode,
  subagent: FlowNode,
  assessment: FlowNode,
  // NOTE: react-flow has a built-in "output" node type that wraps custom
  // components in its own container — using a different key to avoid the collision.
  outputnode: FlowNode,
  repository: FlowNode,
};
