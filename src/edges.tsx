import {
  BaseEdge,
  EdgeLabelRenderer,
  EdgeProps,
  getBezierPath,
  useReactFlow,
} from "reactflow";
import { FlowEdgeData, EdgeKind, FlowNodeData } from "./types";

const KIND_COLORS: Record<EdgeKind, string> = {
  sequential: "#9B9B9B",
  success: "#16A34A",
  failure: "#DC2626",
  conditional: "#2563EB",
};

const KIND_LABELS: Record<EdgeKind, string> = {
  sequential: "next",
  success: "on success",
  failure: "on failure",
  conditional: "if",
};

export function FlowEdge(props: EdgeProps<FlowEdgeData>) {
  const {
    id,
    source,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    markerEnd,
    data,
    selected,
  } = props;

  const rf = useReactFlow();
  const kind: EdgeKind = data?.kind || "sequential";
  const color = KIND_COLORS[kind];
  const isDashed = kind === "conditional";

  const sourceNode = rf.getNode(source) as
    | { data: FlowNodeData }
    | undefined;
  const sourceBranches =
    sourceNode?.data.kind === "assessment" ? sourceNode.data.branches || [] : [];
  const isAssessmentSource = sourceNode?.data.kind === "assessment";

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          stroke: color,
          strokeWidth: selected ? 2.5 : 1.6,
          strokeDasharray: isDashed ? "6 4" : undefined,
        }}
      />
      {kind !== "sequential" && (
        <EdgeLabelRenderer>
          <div
            className="edge-label"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              borderColor: color,
              color,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <span>{KIND_LABELS[kind]}</span>
            {kind === "conditional" && isAssessmentSource && (
              <select
                className="edge-branch-select"
                value={data?.branch || ""}
                onChange={(ev) => {
                  const newBranch = ev.target.value;
                  rf.setEdges((eds) =>
                    eds.map((edge) =>
                      edge.id === id
                        ? {
                            ...edge,
                            data: { ...(edge.data || {}), branch: newBranch },
                          }
                        : edge,
                    ),
                  );
                }}
                style={{ borderColor: color, color }}
              >
                <option value="">— branch —</option>
                {sourceBranches.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            )}
            {kind === "conditional" && !isAssessmentSource && (
              <span className="edge-branch-warn">needs assessment source</span>
            )}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export const edgeTypes = {
  default: FlowEdge,
};
