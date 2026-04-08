import { createContext, useContext } from "react";

export interface NodeActions {
  openMenu: (nodeId: string, x: number, y: number) => void;
}

export const NodeActionsContext = createContext<NodeActions>({
  openMenu: () => {},
});

export function useNodeActions(): NodeActions {
  return useContext(NodeActionsContext);
}
