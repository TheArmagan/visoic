import { getContext, setContext } from "svelte";
import type { HandleDefinition } from "$lib/api/nodes/types";

const NODE_EDITOR_CONTEXT_KEY = "node-editor-context";

export interface NodeEditorContext {
  onOutputHandleDoubleClick?: (nodeId: string, handle: HandleDefinition, event: MouseEvent) => void;
}

export function setNodeEditorContext(context: NodeEditorContext) {
  setContext(NODE_EDITOR_CONTEXT_KEY, context);
}

export function getNodeEditorContext(): NodeEditorContext | undefined {
  return getContext<NodeEditorContext>(NODE_EDITOR_CONTEXT_KEY);
}
