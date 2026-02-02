// ============================================
// Visoic Node System - Svelte Hooks
// ============================================

import { getContext, setContext, onDestroy } from 'svelte';
import { nodeGraph, type GraphState } from './graph';
import { nodeRegistry } from './registry';
import type {
  VisoicNode,
  VisoicEdge,
  AnyNodeData,
  NodeDefinition,
  NodeCategory,
  EvaluationContext,
} from './types';

const NODE_GRAPH_CONTEXT = Symbol('node-graph');

// ============================================
// Context Providers
// ============================================

export function setNodeGraphContext(): void {
  setContext(NODE_GRAPH_CONTEXT, nodeGraph);
}

export function getNodeGraphContext() {
  return getContext(NODE_GRAPH_CONTEXT) ?? nodeGraph;
}

// ============================================
// Reactive State Hooks
// ============================================

export function useNodes(): { nodes: VisoicNode[] } {
  let nodes = $state<VisoicNode[]>(nodeGraph.getNodes());

  const unsubscribe = nodeGraph.subscribe(() => {
    nodes = nodeGraph.getNodes();
  });

  onDestroy(unsubscribe);

  return {
    get nodes() {
      return nodes;
    },
  };
}

export function useEdges(): { edges: VisoicEdge[] } {
  let edges = $state<VisoicEdge[]>(nodeGraph.getEdges());

  const unsubscribe = nodeGraph.subscribe(() => {
    edges = nodeGraph.getEdges();
  });

  onDestroy(unsubscribe);

  return {
    get edges() {
      return edges;
    },
  };
}

export function useGraphState(): {
  nodes: VisoicNode[];
  edges: VisoicEdge[];
} {
  let state = $state<GraphState>(nodeGraph.getState());

  const unsubscribe = nodeGraph.subscribe(() => {
    state = nodeGraph.getState();
  });

  onDestroy(unsubscribe);

  return {
    get nodes() {
      return state.nodes;
    },
    get edges() {
      return state.edges;
    },
  };
}

// ============================================
// Per-Node Data Hook
// ============================================

/**
 * Subscribe to data changes for a specific node.
 * This is more efficient than useNodes() because it only triggers
 * when the specific node's data changes, not when any node changes.
 * 
 * @param nodeId - The ID of the node to watch
 * @returns Reactive node data that updates when the node changes
 */
export function useNodeData<T extends AnyNodeData>(nodeId: string): {
  data: T | null;
  update: (updates: Partial<T>) => void;
  updateSilent: (updates: Partial<T>) => void;
} {
  const initialNode = nodeGraph.getNode(nodeId);
  let data = $state<T | null>(initialNode?.data as T | null);

  // Subscribe to this specific node's changes
  const unsubscribe = nodeGraph.subscribeToNode(nodeId, (newData) => {
    data = newData as T;
  });

  onDestroy(unsubscribe);

  return {
    get data() {
      return data;
    },
    update: (updates: Partial<T>) => {
      nodeGraph.updateNodeData(nodeId, updates as Partial<AnyNodeData>);
    },
    updateSilent: (updates: Partial<T>) => {
      nodeGraph.updateNodeDataSilent(nodeId, updates as Partial<AnyNodeData>);
    },
  };
}

/**
 * Watch a specific property of a node's data.
 * Even more granular than useNodeData - only updates when that specific property changes.
 * 
 * @param nodeId - The ID of the node to watch
 * @param property - The property key to watch
 * @returns The current value of the property
 */
export function useNodeProperty<T extends AnyNodeData, K extends keyof T>(
  nodeId: string,
  property: K
): { value: T[K] | undefined } {
  const initialNode = nodeGraph.getNode(nodeId);
  let value = $state<T[K] | undefined>(
    initialNode?.data ? (initialNode.data as T)[property] : undefined
  );

  const unsubscribe = nodeGraph.subscribeToNode(nodeId, (newData) => {
    const newValue = (newData as T)[property];
    // Always update - let Svelte handle the reactivity
    value = newValue;
  });

  onDestroy(unsubscribe);

  return {
    get value() {
      return value;
    },
  };
}

// ============================================
// Node Registry Hooks
// ============================================

export function useNodeRegistry(): {
  getAll: () => NodeDefinition[];
  getByCategory: (category: NodeCategory) => NodeDefinition[];
  search: (query: string) => NodeDefinition[];
  get: (type: string) => NodeDefinition | undefined;
} {
  return {
    getAll: () => nodeRegistry.getAll(),
    getByCategory: (category: NodeCategory) => nodeRegistry.getByCategory(category),
    search: (query: string) => nodeRegistry.search(query),
    get: (type: string) => nodeRegistry.get(type),
  };
}

// ============================================
// Node Operations Hooks
// ============================================

export function useNodeOperations() {
  return {
    addNode: (type: string, position: { x: number; y: number }) => {
      return nodeGraph.addNode(type, position);
    },

    removeNode: (nodeId: string) => {
      nodeGraph.removeNode(nodeId);
    },

    updateNode: (nodeId: string, updates: Partial<VisoicNode>) => {
      nodeGraph.updateNode(nodeId, updates);
    },

    updateNodeData: (nodeId: string, dataUpdates: Partial<AnyNodeData>) => {
      nodeGraph.updateNodeData(nodeId, dataUpdates);
    },

    getNode: (nodeId: string) => {
      return nodeGraph.getNode(nodeId);
    },

    duplicateNode: (nodeId: string) => {
      const node = nodeGraph.getNode(nodeId);
      if (!node) return null;

      return nodeGraph.addNode(node.type!, {
        x: node.position.x + 50,
        y: node.position.y + 50,
      });
    },
  };
}

// ============================================
// Edge Operations Hooks
// ============================================

export function useEdgeOperations() {
  return {
    addEdge: (connection: {
      source: string;
      target: string;
      sourceHandle?: string | null;
      targetHandle?: string | null;
    }) => {
      return nodeGraph.addEdge({
        source: connection.source,
        target: connection.target,
        sourceHandle: connection.sourceHandle ?? null,
        targetHandle: connection.targetHandle ?? null,
      });
    },

    removeEdge: (edgeId: string) => {
      nodeGraph.removeEdge(edgeId);
    },

    isValidConnection: (connection: {
      source: string;
      target: string;
      sourceHandle: string | null;
      targetHandle: string | null;
    }) => {
      return nodeGraph.isValidConnection(connection);
    },

    getInputEdges: (nodeId: string) => {
      return nodeGraph.getInputEdges(nodeId);
    },

    getOutputEdges: (nodeId: string) => {
      return nodeGraph.getOutputEdges(nodeId);
    },
  };
}

// ============================================
// Graph Evaluation Hook
// ============================================

export function useGraphEvaluation() {
  let isRunning = $state(false);
  let frameCount = $state(0);
  let animationFrameId: number | null = null;
  let lastTime = 0;
  let startTime = 0;

  function start() {
    if (isRunning) return;
    isRunning = true;
    startTime = performance.now() / 1000;
    lastTime = startTime;
    frameCount = 0;
    tick();
  }

  function stop() {
    isRunning = false;
    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
  }

  function tick() {
    if (!isRunning) return;

    const currentTime = performance.now() / 1000;
    const deltaTime = currentTime - lastTime;
    lastTime = currentTime;

    const context: EvaluationContext = {
      time: currentTime - startTime,
      deltaTime,
      frame: frameCount,
      resolution: [1920, 1080], // TODO: Get from canvas
    };

    nodeGraph.evaluate(context);
    frameCount++;

    animationFrameId = requestAnimationFrame(tick);
  }

  onDestroy(stop);

  return {
    get isRunning() {
      return isRunning;
    },
    get frameCount() {
      return frameCount;
    },
    start,
    stop,
    toggle: () => (isRunning ? stop() : start()),
  };
}

// ============================================
// Serialization Hooks
// ============================================

// Track the last saved file path for autosave
let lastSavedFilePath: string | null = null;

// Get the native API (Electron)
function getNativeAPI() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as any).VISOICNative?.graph;
}

export function useGraphSerialization() {
  return {
    serialize: () => nodeGraph.serialize(),
    deserialize: (json: string) => nodeGraph.deserialize(json),
    clear: () => {
      nodeGraph.clear();
      // Reset last saved path when clearing
      lastSavedFilePath = null;
    },

    // Get current file path (for UI display)
    get currentFilePath() {
      return lastSavedFilePath;
    },

    exportToFile: async (forceNewPath = false) => {
      const json = nodeGraph.serialize();
      const nativeAPI = getNativeAPI();

      // If we have native API (Electron), use it for proper file saving
      if (nativeAPI) {
        let filePath = lastSavedFilePath;

        // If no saved path or forced new path, show save dialog
        if (!filePath || forceNewPath) {
          filePath = await nativeAPI.showSaveDialog();
          if (!filePath) {
            return; // User cancelled
          }
        }

        // Save to the file
        const result = await nativeAPI.saveToFile(filePath, json);
        if (result.success) {
          lastSavedFilePath = filePath;
          console.log('[Graph] Saved to:', filePath);
        } else {
          console.error('[Graph] Failed to save:', result.error);
          // Fallback to browser download on error
          fallbackDownload(json);
        }
      } else {
        // Fallback for browser environment
        fallbackDownload(json);
      }
    },

    // Save As - always shows dialog
    exportToFileAs: async () => {
      const json = nodeGraph.serialize();
      const nativeAPI = getNativeAPI();

      if (nativeAPI) {
        const filePath = await nativeAPI.showSaveDialog();
        if (!filePath) {
          return; // User cancelled
        }

        const result = await nativeAPI.saveToFile(filePath, json);
        if (result.success) {
          lastSavedFilePath = filePath;
          console.log('[Graph] Saved to:', filePath);
        } else {
          console.error('[Graph] Failed to save:', result.error);
          fallbackDownload(json);
        }
      } else {
        fallbackDownload(json);
      }
    },

    importFromFile: async () => {
      const nativeAPI = getNativeAPI();

      if (nativeAPI) {
        // Use native file dialog
        const filePath = await nativeAPI.showOpenDialog();
        if (!filePath) {
          return; // User cancelled
        }

        const result = await nativeAPI.loadFromFile(filePath);
        if (result.success && result.content) {
          nodeGraph.deserialize(result.content);
          lastSavedFilePath = filePath; // Remember the path for autosave
          console.log('[Graph] Loaded from:', filePath);
        } else {
          console.error('[Graph] Failed to load:', result.error);
          throw new Error(result.error || 'Failed to load file');
        }
      } else {
        // Fallback for browser environment
        return new Promise<void>((resolve, reject) => {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = '.json';
          input.onchange = async (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (!file) {
              reject(new Error('No file selected'));
              return;
            }

            try {
              const text = await file.text();
              nodeGraph.deserialize(text);
              // Can't get real path in browser, but store the name
              lastSavedFilePath = null;
              resolve();
            } catch (error) {
              reject(error);
            }
          };
          input.click();
        });
      }
    },
  };
}

// Fallback download for browser environment
function fallbackDownload(json: string) {
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `visoic-graph-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
