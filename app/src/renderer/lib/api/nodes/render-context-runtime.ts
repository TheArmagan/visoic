// ============================================
// Visoic Node System - Render Context Runtime
// ============================================
// Manages WebGPU render contexts and shader compositing for the node graph

import { nodeGraph } from './graph';
import { shaderManager, type RenderContext, type ShaderLayer, type BlendMode } from '../shader';
import type { RenderContextNodeData, ShaderNodeData, VisoicNode } from './types';

// ============================================
// Types
// ============================================

interface ManagedRenderContext {
  nodeId: string;
  context: RenderContext;
  canvas: HTMLCanvasElement;
  layers: Map<string, ShaderLayer>; // layerNodeId -> ShaderLayer
  isRunning: boolean;
}

interface ShaderLayerInfo {
  nodeId: string;
  contextNodeId: string;
  layer: ShaderLayer | null;
  order: number;
}

// ============================================
// Render Context Runtime Manager
// ============================================

class RenderContextRuntime {
  private contexts: Map<string, ManagedRenderContext> = new Map();
  private shaderLayers: Map<string, ShaderLayerInfo> = new Map();
  private isInitialized = false;
  private statsUpdateInterval: ReturnType<typeof setInterval> | null = null;
  private syncPending = false;
  private syncDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  // ============================================
  // Lifecycle
  // ============================================

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    // Initialize shader manager
    await shaderManager.initialize();

    // Subscribe to graph changes - debounced
    nodeGraph.subscribe(() => {
      this.scheduleSyncWithGraph();
    });

    // Initial sync
    this.syncWithGraph();

    // Start stats update interval - much slower rate (500ms instead of 100ms)
    this.statsUpdateInterval = setInterval(() => {
      this.updateContextStats();
    }, 500);

    this.isInitialized = true;
    console.log('[RenderContextRuntime] Initialized');
  }

  /**
   * Schedule a debounced sync with the graph
   */
  private scheduleSyncWithGraph(): void {
    if (this.syncPending) return;

    if (this.syncDebounceTimer) {
      clearTimeout(this.syncDebounceTimer);
    }

    this.syncDebounceTimer = setTimeout(() => {
      this.syncDebounceTimer = null;
      this.syncWithGraph();
    }, 100); // 100ms debounce
  }

  destroy(): void {
    if (this.statsUpdateInterval) {
      clearInterval(this.statsUpdateInterval);
      this.statsUpdateInterval = null;
    }

    if (this.syncDebounceTimer) {
      clearTimeout(this.syncDebounceTimer);
      this.syncDebounceTimer = null;
    }

    // Destroy all contexts
    for (const [nodeId] of this.contexts) {
      this.destroyContext(nodeId);
    }

    this.contexts.clear();
    this.shaderLayers.clear();
    this.isInitialized = false;
  }

  // ============================================
  // Context Management
  // ============================================

  /**
   * Create a render context for a node
   */
  async createContext(nodeId: string): Promise<ManagedRenderContext | null> {
    const node = nodeGraph.getNode(nodeId);
    if (!node) return null;

    const data = node.data as RenderContextNodeData;
    if (data.shaderType !== 'render:context') return null;

    // Check if context already exists
    if (this.contexts.has(nodeId)) {
      return this.contexts.get(nodeId)!;
    }

    // Create canvas
    const canvas = document.createElement('canvas');
    canvas.width = data.width || 1920;
    canvas.height = data.height || 1080;

    try {
      // Create WebGPU context
      const context = await shaderManager.createContext({
        id: `node:${nodeId}`,
        canvas,
        width: data.width || 1920,
        height: data.height || 1080,
        fpsLimit: data.fpsLimit || 60,
      });

      const managed: ManagedRenderContext = {
        nodeId,
        context,
        canvas,
        layers: new Map(),
        isRunning: false,
      };

      this.contexts.set(nodeId, managed);

      // Start context
      context.start();
      managed.isRunning = true;

      // Update node output
      nodeGraph.updateNodeDataSilent(nodeId, {
        outputValues: { context: nodeId },
        isRunning: true,
      });

      console.log(`[RenderContextRuntime] Created context for node ${nodeId}`);
      return managed;
    } catch (error) {
      console.error(`[RenderContextRuntime] Failed to create context for node ${nodeId}:`, error);
      return null;
    }
  }

  /**
   * Destroy a render context
   */
  destroyContext(nodeId: string): void {
    const managed = this.contexts.get(nodeId);
    if (!managed) return;

    // Remove all layers first
    for (const [layerNodeId] of managed.layers) {
      this.removeLayerFromContext(layerNodeId, nodeId);
    }

    // Stop and destroy context
    managed.context.stop();
    shaderManager.destroyContext(`node:${nodeId}`);

    this.contexts.delete(nodeId);
    console.log(`[RenderContextRuntime] Destroyed context for node ${nodeId}`);
  }

  /**
   * Get canvas for a render context node
   */
  getCanvas(nodeId: string): HTMLCanvasElement | null {
    return this.contexts.get(nodeId)?.canvas ?? null;
  }

  /**
   * Get the managed context
   */
  getContext(nodeId: string): ManagedRenderContext | null {
    return this.contexts.get(nodeId) ?? null;
  }

  // ============================================
  // Layer Management
  // ============================================

  /**
   * Add a shader layer to a context
   */
  async addLayerToContext(
    shaderNodeId: string,
    contextNodeId: string,
    fragmentSource: string,
    vertexSource?: string
  ): Promise<ShaderLayer | null> {
    const managed = this.contexts.get(contextNodeId);
    if (!managed) {
      console.warn(`[RenderContextRuntime] Context ${contextNodeId} not found`);
      return null;
    }

    // Check if layer already exists
    if (managed.layers.has(shaderNodeId)) {
      return managed.layers.get(shaderNodeId)!;
    }

    // Get shader node data for layer settings
    const shaderNode = nodeGraph.getNode(shaderNodeId);
    if (!shaderNode) return null;

    const shaderData = shaderNode.data as ShaderNodeData;

    try {
      // Add layer to context
      const layer = managed.context.addLayer({
        id: shaderNodeId,
        source: { fragment: fragmentSource, vertex: vertexSource },
        enabled: shaderData.enabled !== false,
        opacity: shaderData.opacity ?? 1,
        blendMode: (shaderData.blendMode as BlendMode) ?? 'normal',
      });

      managed.layers.set(shaderNodeId, layer);

      // Track layer info
      this.shaderLayers.set(shaderNodeId, {
        nodeId: shaderNodeId,
        contextNodeId,
        layer,
        order: shaderData.layerOrder ?? 0,
      });

      // Apply initial uniform values
      const inputValues = shaderData.inputValues || {};
      for (const [key, value] of Object.entries(inputValues)) {
        if (value !== null && value !== undefined && key !== 'renderContext') {
          try {
            layer.setUniform(key, value as number | boolean | number[]);
          } catch (e) {
            // Uniform might not exist - that's ok
          }
        }
      }

      console.log(`[RenderContextRuntime] Added layer ${shaderNodeId} to context ${contextNodeId}`);
      return layer;
    } catch (error) {
      console.error(`[RenderContextRuntime] Failed to add layer ${shaderNodeId}:`, error);
      return null;
    }
  }

  /**
   * Remove a shader layer from a context
   */
  removeLayerFromContext(shaderNodeId: string, contextNodeId: string): void {
    const managed = this.contexts.get(contextNodeId);
    if (!managed) return;

    if (managed.layers.has(shaderNodeId)) {
      managed.context.removeLayer(shaderNodeId);
      managed.layers.delete(shaderNodeId);
      this.shaderLayers.delete(shaderNodeId);
      console.log(`[RenderContextRuntime] Removed layer ${shaderNodeId} from context ${contextNodeId}`);
    }
  }

  /**
   * Update a shader layer's uniforms
   */
  updateLayerUniforms(shaderNodeId: string, uniforms: Record<string, unknown>): void {
    const layerInfo = this.shaderLayers.get(shaderNodeId);
    if (!layerInfo?.layer) return;

    for (const [key, value] of Object.entries(uniforms)) {
      if (value !== null && value !== undefined && key !== 'renderContext') {
        try {
          layerInfo.layer.setUniform(key, value as number | boolean | number[]);
        } catch (e) {
          // Uniform might not exist
        }
      }
    }
  }

  /**
   * Update a shader layer's settings (opacity, blend mode, etc)
   */
  updateLayerSettings(
    shaderNodeId: string,
    settings: { enabled?: boolean; opacity?: number; blendMode?: string }
  ): void {
    const layerInfo = this.shaderLayers.get(shaderNodeId);
    if (!layerInfo?.layer) return;

    if (settings.enabled !== undefined) {
      layerInfo.layer.enabled = settings.enabled;
    }
    if (settings.opacity !== undefined) {
      layerInfo.layer.opacity = settings.opacity;
    }
    if (settings.blendMode !== undefined) {
      layerInfo.layer.blendMode = settings.blendMode as BlendMode;
    }
  }

  // ============================================
  // Graph Sync
  // ============================================

  /**
   * Sync runtime state with the node graph
   */
  private async syncWithGraph(): Promise<void> {
    // Prevent re-entrant sync
    if (this.syncPending) return;
    this.syncPending = true;

    try {
      const nodes = nodeGraph.getNodes();

      // Find all render context nodes
      const contextNodes = nodes.filter(
        (n) => (n.data as RenderContextNodeData).shaderType === 'render:context'
      );

      // Find all shader nodes
      const shaderNodes = nodes.filter(
        (n) =>
          n.data.category === 'shader' &&
          (n.data as ShaderNodeData).shaderType !== 'render:context' &&
          (n.data as ShaderNodeData).fragmentSource
      );

      const contextNodeIds = new Set(contextNodes.map((n) => n.id));
      const shaderNodeIds = new Set(shaderNodes.map((n) => n.id));

      // Collect async operations to run in parallel
      const createContextPromises: Promise<unknown>[] = [];
      const addLayerPromises: Promise<unknown>[] = [];

      // Create missing contexts
      for (const contextNode of contextNodes) {
        if (!this.contexts.has(contextNode.id)) {
          createContextPromises.push(this.createContext(contextNode.id));
        }
      }

      // Wait for all contexts to be created first
      if (createContextPromises.length > 0) {
        await Promise.all(createContextPromises);
      }

      // Remove contexts for deleted nodes
      for (const [nodeId] of this.contexts) {
        if (!contextNodeIds.has(nodeId)) {
          this.destroyContext(nodeId);
        }
      }

      // Process shader nodes - add/remove layers based on connections
      const edges = nodeGraph.getEdges();

      for (const shaderNode of shaderNodes) {
        const shaderData = shaderNode.data as ShaderNodeData;

        // Find which context this shader is connected to
        const contextEdge = edges.find(
          (e) =>
            e.target === shaderNode.id &&
            e.targetHandle === 'renderContext' &&
            contextNodeIds.has(e.source)
        );

        const currentLayerInfo = this.shaderLayers.get(shaderNode.id);

        if (contextEdge) {
          const contextNodeId = contextEdge.source;

          // Check if layer needs to be moved to a different context
          if (currentLayerInfo && currentLayerInfo.contextNodeId !== contextNodeId) {
            this.removeLayerFromContext(shaderNode.id, currentLayerInfo.contextNodeId);
          }

          // Add layer to context if not already there
          if (!this.shaderLayers.has(shaderNode.id) || currentLayerInfo?.contextNodeId !== contextNodeId) {
            if (shaderData.fragmentSource) {
              addLayerPromises.push(
                this.addLayerToContext(
                  shaderNode.id,
                  contextNodeId,
                  shaderData.fragmentSource,
                  shaderData.vertexSource
                )
              );
            }
          }
        } else {
          // Not connected to any context - remove layer if exists
          if (currentLayerInfo) {
            this.removeLayerFromContext(shaderNode.id, currentLayerInfo.contextNodeId);
          }
        }
      }

      // Wait for all layers to be added in parallel
      if (addLayerPromises.length > 0) {
        await Promise.all(addLayerPromises);
      }

      // Clean up layers for deleted shader nodes
      for (const [nodeId, layerInfo] of this.shaderLayers) {
        if (!shaderNodeIds.has(nodeId)) {
          this.removeLayerFromContext(nodeId, layerInfo.contextNodeId);
        }
      }
    } finally {
      this.syncPending = false;
    }
  }

  /**
   * Update context stats (FPS, etc) - only updates if values changed
   */
  private updateContextStats(): void {
    for (const [nodeId, managed] of this.contexts) {
      const stats = managed.context.getStats();
      const isRunning = managed.context.isRunning();

      // Get current node data to check if update is needed
      const node = nodeGraph.getNode(nodeId);
      if (!node) continue;

      const currentData = node.data as RenderContextNodeData;
      const newFps = Math.round(stats.fps);

      // Only update if values actually changed
      if (currentData.currentFps !== newFps || currentData.isRunning !== isRunning) {
        nodeGraph.updateNodeDataSilent(nodeId, {
          currentFps: newFps,
          isRunning,
        });
      }
    }
  }

  // ============================================
  // Runtime Loop Integration
  // ============================================

  // Cache for tracking which uniforms have been set
  private uniformCache: Map<string, Map<string, unknown>> = new Map();

  /**
   * Called each frame by the main runtime
   */
  tick(time: number, deltaTime: number): void {
    // Update shader layer uniforms from node input values
    for (const [shaderNodeId, layerInfo] of this.shaderLayers) {
      if (!layerInfo.layer) continue;

      const node = nodeGraph.getNode(shaderNodeId);
      if (!node) continue;

      const shaderData = node.data as ShaderNodeData;
      const inputValues = shaderData.inputValues || {};

      // Get or create cache for this shader
      let cache = this.uniformCache.get(shaderNodeId);
      if (!cache) {
        cache = new Map();
        this.uniformCache.set(shaderNodeId, cache);
      }

      // Update all uniforms that have changed
      for (const [key, value] of Object.entries(inputValues)) {
        if (key === 'renderContext') continue;
        if (value === null || value === undefined) continue;

        const cachedValue = cache.get(key);
        // Always update if value changed (comparing by value, not reference)
        const valueChanged = !this.valuesEqual(cachedValue, value);
        if (valueChanged) {
          try {
            layerInfo.layer.setUniform(key, value as number | boolean | number[]);
            cache.set(key, value);
          } catch (e) {
            // Uniform might not exist
          }
        }
      }

      // Update layer settings only if changed
      const layer = layerInfo.layer;
      if (shaderData.enabled !== undefined && layer.enabled !== (shaderData.enabled !== false)) {
        layer.enabled = shaderData.enabled !== false;
      }
      if (shaderData.opacity !== undefined && layer.opacity !== shaderData.opacity) {
        layer.opacity = shaderData.opacity;
      }
      if (shaderData.blendMode !== undefined && layer.blendMode !== shaderData.blendMode) {
        layer.blendMode = shaderData.blendMode as BlendMode;
      }
    }
  }

  /**
   * Helper to compare values including arrays
   */
  private valuesEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false;
      for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return false;
      }
      return true;
    }
    return false;
  }
}

// Singleton instance
export const renderContextRuntime = new RenderContextRuntime();
