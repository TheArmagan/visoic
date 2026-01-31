// ============================================
// Visoic Node System - Render Context Runtime
// ============================================
// Manages WebGPU render contexts and shader compositing for the node graph
// Uses dependency graph (edges) to determine shader execution order
// Supports shader output reuse - one shader's output can feed multiple shaders

import { nodeGraph } from './graph';
import { shaderManager, type RenderContext, type ShaderLayer, type BlendMode } from '../shader';
import type { RenderContextNodeData, ShaderNodeData } from './types';

// ============================================
// Types
// ============================================

interface ManagedRenderContext {
  nodeId: string;
  context: RenderContext;
  canvas: HTMLCanvasElement;
  layers: Map<string, ShaderLayer>;
  isRunning: boolean;
}

interface ShaderNodeRuntime {
  nodeId: string;
  contextNodeId: string;
  layer: ShaderLayer | null;
}

interface ShaderDependency {
  sourceNodeId: string;  // The shader that produces the output
  targetNodeId: string;  // The shader that consumes the output
  inputName: string;     // The input handle name (e.g., 'inputImage')
}

// ============================================
// Render Context Runtime Manager
// ============================================

class RenderContextRuntime {
  private contexts: Map<string, ManagedRenderContext> = new Map();
  private shaderNodes: Map<string, ShaderNodeRuntime> = new Map();
  private isInitialized = false;
  private statsUpdateInterval: ReturnType<typeof setInterval> | null = null;
  private syncPending = false;
  private syncDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  // Cached execution order (topologically sorted by dependencies)
  private executionOrder: Map<string, string[]> = new Map(); // contextId -> [shaderNodeId, ...]
  private shaderDependencies: Map<string, ShaderDependency[]> = new Map(); // shaderNodeId -> dependencies

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
    console.log('[RenderContextRuntime] Initialized with dependency-based execution');
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
    this.shaderNodes.clear();
    this.executionOrder.clear();
    this.shaderDependencies.clear();
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

    // Remove all shader nodes associated with this context
    for (const [shaderNodeId, runtime] of this.shaderNodes) {
      if (runtime.contextNodeId === nodeId) {
        this.removeShaderFromContext(shaderNodeId, nodeId);
      }
    }

    // Stop and destroy context
    managed.context.stop();
    shaderManager.destroyContext(`node:${nodeId}`);

    this.contexts.delete(nodeId);
    this.executionOrder.delete(nodeId);
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
  // Shader Management (Dependency-Based)
  // ============================================

  /**
   * Add a shader to a context
   */
  async addShaderToContext(
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

    // Check if already exists
    if (managed.layers.has(shaderNodeId)) {
      return managed.layers.get(shaderNodeId)!;
    }

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

      // Track shader runtime
      this.shaderNodes.set(shaderNodeId, {
        nodeId: shaderNodeId,
        contextNodeId,
        layer,
      });

      // Apply initial uniform values
      const inputValues = shaderData.inputValues || {};
      for (const [key, value] of Object.entries(inputValues)) {
        if (value !== null && value !== undefined && key !== 'renderContext' && key !== 'inputImage') {
          try {
            layer.setUniform(key, value as number | boolean | number[]);
          } catch (e) {
            // Uniform might not exist - that's ok
          }
        }
      }

      console.log(`[RenderContextRuntime] Added shader ${shaderNodeId} to context ${contextNodeId}`);

      // Rebuild execution order based on dependencies
      this.rebuildExecutionOrder(contextNodeId);

      return layer;
    } catch (error) {
      console.error(`[RenderContextRuntime] Failed to add shader ${shaderNodeId}:`, error);
      return null;
    }
  }

  /**
   * Remove a shader from a context
   */
  removeShaderFromContext(shaderNodeId: string, contextNodeId: string): void {
    const managed = this.contexts.get(contextNodeId);
    if (!managed) return;

    if (managed.layers.has(shaderNodeId)) {
      managed.context.removeLayer(shaderNodeId);
      managed.layers.delete(shaderNodeId);
      this.shaderNodes.delete(shaderNodeId);
      this.shaderDependencies.delete(shaderNodeId);

      // Rebuild execution order
      this.rebuildExecutionOrder(contextNodeId);

      console.log(`[RenderContextRuntime] Removed shader ${shaderNodeId} from context ${contextNodeId}`);
    }
  }

  // ============================================
  // Dependency Graph & Execution Order
  // ============================================

  /**
   * Rebuild the execution order for a context based on edge connections
   * Uses topological sort to ensure dependencies are processed first
   * 
   * Key insight: Shader A's output -> Shader B's inputImage means B depends on A
   * So A must be rendered before B
   */
  private rebuildExecutionOrder(contextNodeId: string): void {
    const edges = nodeGraph.getEdges();
    const contextShaders: string[] = [];

    // Find all shader nodes connected to this context
    for (const [nodeId, runtime] of this.shaderNodes) {
      if (runtime.contextNodeId === contextNodeId) {
        contextShaders.push(nodeId);
      }
    }

    if (contextShaders.length === 0) {
      this.executionOrder.set(contextNodeId, []);
      return;
    }

    // Build dependency map from edges
    // An edge from shader A's "output" to shader B's "inputImage" means B depends on A
    const dependencies = new Map<string, Set<string>>(); // nodeId -> Set of nodes it depends on
    const dependents = new Map<string, Set<string>>(); // nodeId -> Set of nodes that depend on it

    for (const nodeId of contextShaders) {
      dependencies.set(nodeId, new Set());
      dependents.set(nodeId, new Set());
      this.shaderDependencies.set(nodeId, []);
    }

    // Analyze edges for shader-to-shader connections
    for (const edge of edges) {
      const sourceRuntime = this.shaderNodes.get(edge.source);
      const targetRuntime = this.shaderNodes.get(edge.target);

      // Check if this is a shader-to-shader connection (output -> image input)
      if (sourceRuntime && targetRuntime &&
        sourceRuntime.contextNodeId === contextNodeId &&
        targetRuntime.contextNodeId === contextNodeId) {

        // Source handle should be 'output' (shader output)
        if (edge.sourceHandle === 'output') {
          // This means target shader depends on source shader
          dependencies.get(edge.target)?.add(edge.source);
          dependents.get(edge.source)?.add(edge.target);

          // Store dependency info for runtime texture binding
          const deps = this.shaderDependencies.get(edge.target) || [];
          deps.push({
            sourceNodeId: edge.source,
            targetNodeId: edge.target,
            inputName: edge.targetHandle || 'inputImage',
          });
          this.shaderDependencies.set(edge.target, deps);
        }
      }
    }

    // Topological sort using Kahn's algorithm
    const inDegree = new Map<string, number>();
    for (const nodeId of contextShaders) {
      inDegree.set(nodeId, dependencies.get(nodeId)?.size || 0);
    }

    const queue: string[] = [];
    for (const [nodeId, degree] of inDegree) {
      if (degree === 0) {
        queue.push(nodeId);
      }
    }

    const sortedOrder: string[] = [];
    while (queue.length > 0) {
      const current = queue.shift()!;
      sortedOrder.push(current);

      for (const dependent of dependents.get(current) || []) {
        const newDegree = (inDegree.get(dependent) || 0) - 1;
        inDegree.set(dependent, newDegree);
        if (newDegree === 0) {
          queue.push(dependent);
        }
      }
    }

    // Check for cycles
    if (sortedOrder.length !== contextShaders.length) {
      console.warn('[RenderContextRuntime] Cycle detected in shader graph, using fallback order');
      // Use whatever we could sort, then add remaining
      for (const nodeId of contextShaders) {
        if (!sortedOrder.includes(nodeId)) {
          sortedOrder.push(nodeId);
        }
      }
    }

    this.executionOrder.set(contextNodeId, sortedOrder);

    // Update the layer order in the context
    const managed = this.contexts.get(contextNodeId);
    if (managed) {
      managed.context.setLayerOrder(sortedOrder);

      // Set up input source mappings based on dependencies
      // This allows one shader's output to be used as another shader's input
      for (const shaderNodeId of sortedOrder) {
        const deps = this.shaderDependencies.get(shaderNodeId) || [];
        for (const dep of deps) {
          // Tell the render context that this shader's input should come from another shader's output
          managed.context.setLayerInputSource(dep.targetNodeId, dep.inputName, dep.sourceNodeId);
        }
      }
    }

    console.log(`[RenderContextRuntime] Execution order for context ${contextNodeId}:`, sortedOrder);
  }

  // ============================================
  // Uniform & Settings Updates
  // ============================================

  /**
   * Update a shader's uniforms
   */
  updateShaderUniforms(shaderNodeId: string, uniforms: Record<string, unknown>): void {
    const runtime = this.shaderNodes.get(shaderNodeId);
    if (!runtime?.layer) return;

    for (const [key, value] of Object.entries(uniforms)) {
      if (value !== null && value !== undefined && key !== 'renderContext' && key !== 'inputImage') {
        try {
          runtime.layer.setUniform(key, value as number | boolean | number[]);
        } catch (e) {
          // Uniform might not exist
        }
      }
    }
  }

  /**
   * Update a shader's settings (opacity, blend mode, etc)
   */
  updateShaderSettings(
    shaderNodeId: string,
    settings: { enabled?: boolean; opacity?: number; blendMode?: string }
  ): void {
    const runtime = this.shaderNodes.get(shaderNodeId);
    if (!runtime?.layer) return;

    if (settings.enabled !== undefined) {
      runtime.layer.enabled = settings.enabled;
    }
    if (settings.opacity !== undefined) {
      runtime.layer.opacity = settings.opacity;
    }
    if (settings.blendMode !== undefined) {
      runtime.layer.blendMode = settings.blendMode as BlendMode;
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

        // Find which context this shader is connected to via renderContext input
        const contextEdge = edges.find(
          (e) =>
            e.target === shaderNode.id &&
            e.targetHandle === 'renderContext' &&
            contextNodeIds.has(e.source)
        );

        const currentRuntime = this.shaderNodes.get(shaderNode.id);

        if (contextEdge) {
          const contextNodeId = contextEdge.source;

          // Check if shader needs to be moved to a different context
          if (currentRuntime && currentRuntime.contextNodeId !== contextNodeId) {
            this.removeShaderFromContext(shaderNode.id, currentRuntime.contextNodeId);
          }

          // Add shader to context if not already there
          if (!this.shaderNodes.has(shaderNode.id) || currentRuntime?.contextNodeId !== contextNodeId) {
            if (shaderData.fragmentSource) {
              addLayerPromises.push(
                this.addShaderToContext(
                  shaderNode.id,
                  contextNodeId,
                  shaderData.fragmentSource,
                  shaderData.vertexSource
                )
              );
            }
          }
        } else {
          // Not connected to any context - remove shader if exists
          if (currentRuntime) {
            this.removeShaderFromContext(shaderNode.id, currentRuntime.contextNodeId);
          }
        }
      }

      // Wait for all layers to be added in parallel
      if (addLayerPromises.length > 0) {
        await Promise.all(addLayerPromises);
      }

      // Clean up shaders for deleted shader nodes
      for (const [nodeId, runtime] of this.shaderNodes) {
        if (!shaderNodeIds.has(nodeId)) {
          this.removeShaderFromContext(nodeId, runtime.contextNodeId);
        }
      }

      // Rebuild execution orders for all contexts (handles new edges)
      for (const [contextId] of this.contexts) {
        this.rebuildExecutionOrder(contextId);
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
   * Updates shader uniforms based on dependencies
   */
  tick(time: number, deltaTime: number): void {
    // Process each context
    for (const [contextId, managed] of this.contexts) {
      const executionOrder = this.executionOrder.get(contextId) || [];

      // Update uniforms for each shader in execution order
      for (const shaderNodeId of executionOrder) {
        const runtime = this.shaderNodes.get(shaderNodeId);
        if (!runtime?.layer) continue;

        const node = nodeGraph.getNode(shaderNodeId);
        if (!node) continue;

        const shaderData = node.data as ShaderNodeData;
        const inputValues = shaderData.inputValues || {};

        // Get or create uniform cache
        let cache = this.uniformCache.get(shaderNodeId);
        if (!cache) {
          cache = new Map();
          this.uniformCache.set(shaderNodeId, cache);
        }

        // Update uniforms (skip image inputs, they're handled by render-context)
        for (const [key, value] of Object.entries(inputValues)) {
          if (key === 'renderContext' || key === 'inputImage') continue;
          if (value === null || value === undefined) continue;

          const cachedValue = cache.get(key);
          const valueChanged = !this.valuesEqual(cachedValue, value);
          if (valueChanged) {
            try {
              runtime.layer.setUniform(key, value as number | boolean | number[]);
              cache.set(key, value);
            } catch (e) {
              // Uniform might not exist
            }
          }
        }

        // Update layer settings only if changed
        const layer = runtime.layer;
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

  // ============================================
  // Debug Helpers
  // ============================================

  /**
   * Get execution order for a context (for debugging)
   */
  getExecutionOrder(contextId: string): string[] {
    return this.executionOrder.get(contextId) || [];
  }

  /**
   * Get dependencies for a shader node (for debugging)
   */
  getDependencies(shaderNodeId: string): ShaderDependency[] {
    return this.shaderDependencies.get(shaderNodeId) || [];
  }

  /**
   * Get the output canvas for a specific shader node
   * This canvas shows only that shader's output, not the entire context composite
   */
  getShaderOutputCanvas(shaderNodeId: string): HTMLCanvasElement | null {
    const runtime = this.shaderNodes.get(shaderNodeId);
    if (!runtime) {
      console.warn(`[RenderContextRuntime] Shader ${shaderNodeId} not found`);
      return null;
    }

    const managed = this.contexts.get(runtime.contextNodeId);
    if (!managed) {
      console.warn(`[RenderContextRuntime] Context for shader ${shaderNodeId} not found`);
      return null;
    }

    // Get or create the layer's output canvas
    const canvas = managed.context.getLayerOutputCanvas(shaderNodeId);

    // Blit the current frame to the canvas
    if (canvas) {
      managed.context.blitLayerOutputToCanvas(shaderNodeId);
    }

    return canvas;
  }

  /**
   * Get the shader's layer ID from its node ID
   */
  getShaderLayerId(shaderNodeId: string): string | null {
    const runtime = this.shaderNodes.get(shaderNodeId);
    return runtime ? shaderNodeId : null;
  }

  /**
   * Check if a node is a shader node (not a render context)
   */
  isShaderNode(nodeId: string): boolean {
    return this.shaderNodes.has(nodeId);
  }
}

// Singleton instance
export const renderContextRuntime = new RenderContextRuntime();
