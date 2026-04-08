import { Handle, Position, NodeProps } from "reactflow";
import { FlowNodeData, NODE_LABELS } from "./types";

const KIND_COLORS: Record<string, string> = {
  prompt: "#1A1A1A",
  skill: "#2563EB",
  subagent: "#D97706",
  assessment: "#16A34A",
};

export function FlowNode({ data, selected }: NodeProps<FlowNodeData>) {
  const accent = KIND_COLORS[data.kind];

  return (
    <div className={`flow-node ${selected ? "flow-node-selected" : ""}`}>
      <Handle id="t-top" type="target" position={Position.Top} className="flow-handle" />
      <Handle id="t-left" type="target" position={Position.Left} className="flow-handle" />
      <Handle id="s-right" type="source" position={Position.Right} className="flow-handle" />
      <Handle id="s-bottom" type="source" position={Position.Bottom} className="flow-handle" />
      <div className="flow-node-head">
        <span className="flow-node-kind" style={{ color: accent }}>
          {NODE_LABELS[data.kind]}
        </span>
      </div>
      <div className="flow-node-title">{data.title || "Untitled"}</div>
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
  return "";
}

export const nodeTypes = {
  prompt: FlowNode,
  skill: FlowNode,
  subagent: FlowNode,
  assessment: FlowNode,
};
