// Flowbench shared types

export type NodeKind = "prompt" | "skill" | "subagent" | "assessment";

export type NodeStatus = "idle" | "running" | "success" | "failed";

export interface FlowNodeData {
  kind: NodeKind;
  title: string;
  status?: NodeStatus;
  // Prompt
  prompt?: string;
  // Skill
  skill?: string;
  // Sub-agent
  subagentType?: string;
  subagentPrompt?: string;
  // Assessment
  question?: string;
  branches?: string[];
}

export const NODE_LABELS: Record<NodeKind, string> = {
  prompt: "Prompt",
  skill: "Skill",
  subagent: "Sub-agent",
  assessment: "Assessment",
};

export const NODE_HINTS: Record<NodeKind, string> = {
  prompt: "Free-form instruction",
  skill: "Run a saved skill",
  subagent: "Isolated task",
  assessment: "Branch on a check",
};

export function defaultDataFor(kind: NodeKind): FlowNodeData {
  const base: FlowNodeData = { kind, title: NODE_LABELS[kind] };
  if (kind === "prompt") base.prompt = "";
  if (kind === "skill") base.skill = "";
  if (kind === "subagent") {
    base.subagentType = "general-purpose";
    base.subagentPrompt = "";
  }
  if (kind === "assessment") {
    base.question = "";
    base.branches = ["yes", "no"];
  }
  return base;
}
