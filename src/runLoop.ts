import { Node, Edge } from "reactflow";
import { FlowNodeData } from "./types";

/** Kahn's algorithm — returns null if a cycle is detected. */
export function topoSort(
  nodes: Node<FlowNodeData>[],
  edges: Edge[],
): Node<FlowNodeData>[] | null {
  const indegree = new Map<string, number>();
  const adj = new Map<string, string[]>();
  for (const n of nodes) {
    indegree.set(n.id, 0);
    adj.set(n.id, []);
  }
  for (const e of edges) {
    if (!indegree.has(e.source) || !indegree.has(e.target)) continue;
    indegree.set(e.target, (indegree.get(e.target) || 0) + 1);
    adj.get(e.source)!.push(e.target);
  }

  const queue: string[] = [];
  for (const [id, d] of indegree) if (d === 0) queue.push(id);

  const order: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const next of adj.get(id) || []) {
      const d = (indegree.get(next) || 0) - 1;
      indegree.set(next, d);
      if (d === 0) queue.push(next);
    }
  }

  if (order.length !== nodes.length) return null; // cycle
  const byId = new Map(nodes.map((n) => [n.id, n]));
  return order.map((id) => byId.get(id)!);
}

/** A pausable wait — resolves when paused() returns false. */
export function waitForResume(
  isPaused: () => boolean,
  isCancelled: () => boolean,
  pollMs = 100,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (isCancelled()) return reject(new Error("cancelled"));
      if (!isPaused()) return resolve();
      setTimeout(tick, pollMs);
    };
    tick();
  });
}
