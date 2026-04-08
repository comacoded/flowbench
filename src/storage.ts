import { save, open } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { Node, Edge } from "reactflow";
import { FlowNodeData } from "./types";

export interface FlowFile {
  version: 1;
  name: string;
  nodes: Node<FlowNodeData>[];
  edges: Edge[];
}

export async function saveFlow(
  name: string,
  nodes: Node<FlowNodeData>[],
  edges: Edge[],
): Promise<string | null> {
  const path = await save({
    title: "Save flow",
    defaultPath: `${name || "untitled"}.flow.json`,
    filters: [{ name: "Flowbench flow", extensions: ["json"] }],
  });
  if (!path) return null;

  const file: FlowFile = { version: 1, name, nodes, edges };
  await writeTextFile(path, JSON.stringify(file, null, 2));
  return path;
}

export async function openFlow(): Promise<{ path: string; file: FlowFile } | null> {
  const selected = await open({
    title: "Open flow",
    multiple: false,
    filters: [{ name: "Flowbench flow", extensions: ["json"] }],
  });
  if (!selected || typeof selected !== "string") return null;

  const text = await readTextFile(selected);
  const file = JSON.parse(text) as FlowFile;
  return { path: selected, file };
}
