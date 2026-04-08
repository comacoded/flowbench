import { createContext, useContext } from "react";

export interface NodeActions {
  openMenu: (nodeId: string, x: number, y: number) => void;
  openEditor: (nodeId: string) => void;
}

export const NodeActionsContext = createContext<NodeActions>({
  openMenu: () => {},
  openEditor: () => {},
});

export function useNodeActions(): NodeActions {
  return useContext(NodeActionsContext);
}
