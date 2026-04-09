// Flowbench shared types

export type NodeKind = "prompt" | "skill" | "subagent" | "assessment" | "output";

export type OutputFormat = "markdown" | "word" | "powerpoint" | "figma" | "json";

export const OUTPUT_FORMAT_LABELS: Record<OutputFormat, string> = {
  markdown: "Markdown (.md)",
  word: "Word document (.docx)",
  powerpoint: "PowerPoint (.pptx)",
  figma: "Figma file",
  json: "JSON (.json)",
};

export type NodeStatus = "idle" | "running" | "success" | "failed";

export type EdgeKind = "sequential" | "success" | "failure" | "conditional";

export interface FlowEdgeData {
  kind?: EdgeKind;
  branch?: string; // for conditional edges from an Assessment node
}

export type ModelChoice = "auto" | "opus" | "sonnet" | "haiku";

export const MODEL_LABELS: Record<ModelChoice, string> = {
  auto: "Auto (default)",
  opus: "Opus 4.6",
  sonnet: "Sonnet 4.6",
  haiku: "Haiku 4.5",
};

export const MODEL_CLI_FLAG: Record<ModelChoice, string | null> = {
  auto: null,
  opus: "claude-opus-4-6",
  sonnet: "claude-sonnet-4-6",
  haiku: "claude-haiku-4-5",
};

export interface FlowNodeData {
  kind: NodeKind;
  title: string;
  status?: NodeStatus;
  model?: ModelChoice;
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
  // Output
  outputFormat?: OutputFormat;
  outputPath?: string;
}

export const NODE_LABELS: Record<NodeKind, string> = {
  prompt: "Prompt",
  skill: "Skill",
  subagent: "Sub-agent",
  assessment: "Assessment",
  output: "Output",
};

export const NODE_HINTS: Record<NodeKind, string> = {
  prompt: "Free-form instruction",
  skill: "Run a saved skill",
  subagent: "Isolated task",
  assessment: "Branch on a check",
  output: "Save as a document",
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
  if (kind === "output") {
    base.outputFormat = "markdown";
    base.outputPath = "";
  }
  return base;
}
