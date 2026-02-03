// ============================================
// Visoic Node System - Graph Manager
// ============================================

import type {
  VisoicNode,
  VisoicEdge,
  AnyNodeData,
  EvaluationContext,
  NodeEvaluationResult,
  DataType,
  InputHandle,
  OutputHandle,
} from './types';
import { isConnectionValid, DATA_TYPE_INFO } from './types';
import { nodeRegistry } from './registry';
import type { Connection, Edge } from '@xyflow/svelte';

// ============================================
// Graph State
// ============================================

export interface GraphState {
  nodes: VisoicNode[];
  edges: VisoicEdge[];
}

class NodeGraphManager {
  private nodes: Map<string, VisoicNode> = new Map();
  private edges: Map<string, VisoicEdge> = new Map();
  private nodeOutputCache: Map<string, Record<string, unknown>> = new Map();
  private evaluationOrder: string[] = [];
  private isDirty = true;
  private listeners: Set<() => void> = new Set();
  private nodeListeners: Map<string, Set<(data: AnyNodeData) => void>> = new Map();

  // Edge index for fast lookup: targetNodeId -> targetHandle -> edge
  private edgeIndex: Map<string, Map<string, VisoicEdge>> = new Map();

  // Cached arrays to avoid per-frame allocations
  private cachedNodesArray: VisoicNode[] = [];
  private cachedEdgesArray: VisoicEdge[] = [];
  private nodesCacheValid = false;
  private edgesCacheValid = false;

  // Track dirty nodes for runtime optimization
  private runtimeDirtyNodes: Set<string> = new Set();

  // ============================================
  // State Management
  // ============================================

  getState(): GraphState {
    return {
      nodes: Array.from(this.nodes.values()),
      edges: Array.from(this.edges.values()),
    };
  }

  setState(state: GraphState): void {
    this.nodes.clear();
    this.edges.clear();

    for (const node of state.nodes) {
      this.nodes.set(node.id, node);
    }

    for (const edge of state.edges) {
      this.edges.set(edge.id, edge);
    }

    // Rebuild edge index after bulk load
    this.rebuildEdgeIndex();

    this.isDirty = true;
    this.notifyListeners();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Subscribe to updates for a specific node.
   * The callback receives the updated node data whenever that node changes.
   */
  subscribeToNode(nodeId: string, listener: (data: AnyNodeData) => void): () => void {
    if (!this.nodeListeners.has(nodeId)) {
      this.nodeListeners.set(nodeId, new Set());
    }
    this.nodeListeners.get(nodeId)!.add(listener);

    // Return unsubscribe function
    return () => {
      const listeners = this.nodeListeners.get(nodeId);
      if (listeners) {
        listeners.delete(listener);
        if (listeners.size === 0) {
          this.nodeListeners.delete(nodeId);
        }
      }
    };
  }

  private notifyNodeListeners(nodeId: string, data: AnyNodeData): void {
    const listeners = this.nodeListeners.get(nodeId);
    if (listeners) {
      for (const listener of listeners) {
        listener(data);
      }
    }
  }

  forceUpdate(): void {
    this.notifyListeners();
  }

  /**
   * Force update for a specific node only
   */
  forceNodeUpdate(nodeId: string): void {
    const node = this.nodes.get(nodeId);
    if (node) {
      this.notifyNodeListeners(nodeId, node.data);
    }
  }

  private notifyListeners(): void {
    // Invalidate caches when graph changes
    this.invalidateCaches();

    for (const listener of this.listeners) {
      listener();
    }
  }

  // ============================================
  // Node Operations
  // ============================================

  addNode(type: string, position: { x: number; y: number }): VisoicNode | null {
    const definition = nodeRegistry.get(type);
    if (!definition) {
      console.error(`Unknown node type: ${type}`);
      return null;
    }

    const id = `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const data = definition.createDefaultData();

    const node: VisoicNode = {
      id,
      type,
      position,
      data,
    };

    this.nodes.set(id, node);
    this.isDirty = true;
    this.notifyListeners();

    return node;
  }

  /**
   * Add a node with a pre-defined id/data/position.
   * Useful for import/paste/duplicate flows.
   */
  addNodeInstance(node: VisoicNode): void {
    this.nodes.set(node.id, node);
    this.isDirty = true;
    this.notifyListeners();
  }

  /**
   * Add multiple nodes in a single notification batch.
   */
  addNodeInstances(nodes: VisoicNode[]): void {
    for (const node of nodes) {
      this.nodes.set(node.id, node);
    }
    this.isDirty = true;
    this.notifyListeners();
  }

  removeNode(nodeId: string): void {
    this.nodes.delete(nodeId);

    // Remove connected edges
    for (const [edgeId, edge] of this.edges) {
      if (edge.source === nodeId || edge.target === nodeId) {
        this.edges.delete(edgeId);
      }
    }

    this.isDirty = true;
    this.notifyListeners();
  }

  updateNode(nodeId: string, updates: Partial<VisoicNode>): void {
    const node = this.nodes.get(nodeId);
    if (!node) return;

    const updatedNode = { ...node, ...updates };
    this.nodes.set(nodeId, updatedNode);
    this.isDirty = true;

    // Only notify listeners for structural changes, not position-only updates
    const isPositionOnlyUpdate = Object.keys(updates).every(
      key => key === 'position' || key === 'measured'
    );

    if (!isPositionOnlyUpdate) {
      this.notifyListeners();
    }
  }

  updateNodeData(nodeId: string, dataUpdates: Partial<AnyNodeData>): void {
    const node = this.nodes.get(nodeId);
    if (!node) return;

    const updatedNode = {
      ...node,
      data: { ...node.data, ...dataUpdates } as AnyNodeData,
    };
    this.nodes.set(nodeId, updatedNode);
    this.isDirty = true;

    // Notify node-specific listeners (for local UI updates)
    this.notifyNodeListeners(nodeId, updatedNode.data);

    // Notify global listeners (for graph structure changes)
    this.notifyListeners();
  }

  /**
   * Update node data without triggering global listeners.
   * Use this for high-frequency updates like audio values that shouldn't cause re-renders.
   * Still notifies node-specific listeners for local UI updates.
   */
  updateNodeDataSilent(nodeId: string, dataUpdates: Partial<AnyNodeData>): void {
    const node = this.nodes.get(nodeId);
    if (!node) return;

    // Deep merge for nested objects like inputValues, outputValues, etc.
    for (const [key, value] of Object.entries(dataUpdates)) {
      // Check if it's a DOM element or special object that shouldn't be spread
      const isSpecialObject = value instanceof HTMLElement ||
        value instanceof HTMLImageElement ||
        value instanceof HTMLVideoElement ||
        value instanceof HTMLCanvasElement ||
        value instanceof OffscreenCanvas ||
        value instanceof ImageBitmap ||
        value instanceof ArrayBuffer ||
        value instanceof Blob;

      if (value !== null && typeof value === 'object' && !Array.isArray(value) && !isSpecialObject) {
        // Merge nested objects
        (node.data as Record<string, unknown>)[key] = {
          ...((node.data as Record<string, unknown>)[key] as Record<string, unknown> ?? {}),
          ...value,
        };
      } else {
        // Direct assignment for primitives, arrays, and special objects (DOM elements, etc.)
        (node.data as Record<string, unknown>)[key] = value;
      }
    }

    // Mark as dirty for runtime sync
    this.runtimeDirtyNodes.add(nodeId);

    // Notify node-specific listeners (for local UI updates) - doesn't trigger global re-render
    this.notifyNodeListeners(nodeId, node.data);
  }

  /**
   * Get IDs of nodes that have changed via silent updates since last check
   */
  getAndClearRuntimeDirtyNodes(): Set<string> {
    const dirty = new Set(this.runtimeDirtyNodes);
    this.runtimeDirtyNodes.clear();
    return dirty;
  }

  getNode(nodeId: string): VisoicNode | undefined {
    return this.nodes.get(nodeId);
  }

  getNodes(): VisoicNode[] {
    if (!this.nodesCacheValid) {
      this.cachedNodesArray = Array.from(this.nodes.values());
      this.nodesCacheValid = true;
    }
    return this.cachedNodesArray;
  }

  getEdges(): VisoicEdge[] {
    if (!this.edgesCacheValid) {
      this.cachedEdgesArray = Array.from(this.edges.values());
      this.edgesCacheValid = true;
    }
    return this.cachedEdgesArray;
  }

  // Invalidate caches when graph changes
  private invalidateCaches(): void {
    this.nodesCacheValid = false;
    this.edgesCacheValid = false;
  }

  // ============================================
  // Edge Operations
  // ============================================

  private addToEdgeIndex(edge: VisoicEdge): void {
    if (!edge.targetHandle) return;
    let targetMap = this.edgeIndex.get(edge.target);
    if (!targetMap) {
      targetMap = new Map();
      this.edgeIndex.set(edge.target, targetMap);
    }
    targetMap.set(edge.targetHandle, edge);
  }

  private removeFromEdgeIndex(edge: VisoicEdge): void {
    if (!edge.targetHandle) return;
    const targetMap = this.edgeIndex.get(edge.target);
    if (targetMap) {
      targetMap.delete(edge.targetHandle);
      if (targetMap.size === 0) {
        this.edgeIndex.delete(edge.target);
      }
    }
  }

  private rebuildEdgeIndex(): void {
    this.edgeIndex.clear();
    for (const edge of this.edges.values()) {
      this.addToEdgeIndex(edge);
    }
  }

  // Fast O(1) edge lookup by target node and handle
  getEdgeToInput(targetNodeId: string, targetHandle: string): VisoicEdge | undefined {
    return this.edgeIndex.get(targetNodeId)?.get(targetHandle);
  }

  // Get all edges targeting a specific node - O(inputs) instead of O(all edges)
  getEdgesToNode(targetNodeId: string): VisoicEdge[] {
    const nodeEdges = this.edgeIndex.get(targetNodeId);
    if (!nodeEdges) return [];
    return Array.from(nodeEdges.values());
  }

  addEdge(connection: Connection): VisoicEdge | null {
    if (!connection.source || !connection.target) return null;

    const sourceNode = this.nodes.get(connection.source);
    const targetNode = this.nodes.get(connection.target);

    if (!sourceNode || !targetNode) return null;

    // Find handles
    const sourceHandle = sourceNode.data.outputs.find(
      (h) => h.id === connection.sourceHandle
    );
    const targetHandle = targetNode.data.inputs.find(
      (h) => h.id === connection.targetHandle
    );

    if (!sourceHandle || !targetHandle) return null;

    // Validate connection
    const validation = isConnectionValid(sourceHandle, targetHandle);
    if (!validation.isValid) {
      console.warn('Invalid connection:', validation.reason);
      return null;
    }

    // Remove existing edge to this target handle (single connection per input)
    for (const [edgeId, existingEdge] of this.edges) {
      if (existingEdge.target === connection.target && existingEdge.targetHandle === connection.targetHandle) {
        this.removeFromEdgeIndex(existingEdge);
        this.edges.delete(edgeId);
      }
    }

    const edgeId = `e-${connection.source}-${connection.sourceHandle}-${connection.target}-${connection.targetHandle}`;

    const edge: VisoicEdge = {
      id: edgeId,
      source: connection.source,
      target: connection.target,
      sourceHandle: connection.sourceHandle ?? undefined,
      targetHandle: connection.targetHandle ?? undefined,
      data: {
        dataType: sourceHandle.dataType,
      },
    };

    this.edges.set(edgeId, edge);
    this.addToEdgeIndex(edge);
    this.isDirty = true;
    this.notifyListeners();

    return edge;
  }

  removeEdge(edgeId: string): void {
    const edge = this.edges.get(edgeId);
    if (edge) {
      this.removeFromEdgeIndex(edge);
    }
    this.edges.delete(edgeId);
    this.isDirty = true;
    this.notifyListeners();
  }

  getInputEdges(nodeId: string): VisoicEdge[] {
    // Use edge index for fast lookup
    return this.getEdgesToNode(nodeId);
  }

  getOutputEdges(nodeId: string): VisoicEdge[] {
    // This is less optimized but getOutputEdges is rarely called in hot paths
    return this.getEdges().filter((e) => e.source === nodeId);
  }

  // ============================================
  // Connection Validation
  // ============================================

  isValidConnection(connection: Connection | Edge): boolean {
    if (!connection.source || !connection.target) return false;
    if (connection.source === connection.target) return false;

    const sourceNode = this.nodes.get(connection.source);
    const targetNode = this.nodes.get(connection.target);

    if (!sourceNode || !targetNode) return false;

    const sourceHandle = sourceNode.data.outputs.find(
      (h) => h.id === connection.sourceHandle
    );
    const targetHandle = targetNode.data.inputs.find(
      (h) => h.id === connection.targetHandle
    );

    if (!sourceHandle || !targetHandle) return false;

    const validation = isConnectionValid(sourceHandle, targetHandle);
    return validation.isValid;
  }

  // ============================================
  // Topological Sort for Evaluation Order
  // ============================================

  private computeEvaluationOrder(): string[] {
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const order: string[] = [];

    const visit = (nodeId: string): boolean => {
      if (visited.has(nodeId)) return true;
      if (visiting.has(nodeId)) {
        console.warn('Cycle detected in graph');
        return false;
      }

      visiting.add(nodeId);

      // Visit all nodes that this node depends on (input edges)
      const inputEdges = this.getInputEdges(nodeId);
      for (const edge of inputEdges) {
        if (!visit(edge.source)) return false;
      }

      visiting.delete(nodeId);
      visited.add(nodeId);
      order.push(nodeId);
      return true;
    };

    for (const nodeId of this.nodes.keys()) {
      if (!visit(nodeId)) break;
    }

    return order;
  }

  // ============================================
  // Graph Evaluation
  // ============================================

  evaluate(context: EvaluationContext): void {
    if (this.isDirty) {
      this.evaluationOrder = this.computeEvaluationOrder();
      this.isDirty = false;
    }

    // Clear cache
    this.nodeOutputCache.clear();

    // Evaluate nodes in topological order
    for (const nodeId of this.evaluationOrder) {
      const node = this.nodes.get(nodeId);
      if (!node || node.data.bypassed) continue;

      try {
        const result = this.evaluateNode(node, context);
        this.nodeOutputCache.set(nodeId, result.outputs);

        // Update node's output values in place (no UI notification during hot loop)
        // UI components use subscribeToNode for their own updates
        node.data.outputValues = result.outputs;
        node.data.hasError = false;
        node.data.errorMessage = undefined;
      } catch (error) {
        console.error(`Error evaluating node ${nodeId}:`, error);
        node.data.hasError = true;
        node.data.errorMessage = error instanceof Error ? error.message : String(error);
      }
    }
  }

  private evaluateNode(
    node: VisoicNode,
    context: EvaluationContext
  ): NodeEvaluationResult {
    // Gather input values from connections or defaults
    const inputValues: Record<string, unknown> = {};

    for (const input of node.data.inputs) {
      // Fast O(1) edge lookup using index
      const edge = this.getEdgeToInput(node.id, input.id);

      if (edge) {
        // Get value from connected node's output
        const sourceOutputs = this.nodeOutputCache.get(edge.source);
        if (sourceOutputs && edge.sourceHandle) {
          inputValues[input.id] = sourceOutputs[edge.sourceHandle];
        } else {
          inputValues[input.id] = input.defaultValue;
        }
      } else {
        // Use node's current input value or default
        inputValues[input.id] = node.data.inputValues[input.id] ?? input.defaultValue;
      }
    }

    // Update node's input values
    node.data.inputValues = inputValues;

    // Evaluate based on node type
    return this.computeNodeOutputs(node, inputValues, context);
  }

  private computeNodeOutputs(
    node: VisoicNode,
    inputs: Record<string, unknown>,
    context: EvaluationContext
  ): NodeEvaluationResult {
    const outputs: Record<string, unknown> = {};

    switch (node.data.category) {
      case 'math':
        return this.evaluateMathNode(node, inputs);
      case 'value':
        return this.evaluateValueNode(node, inputs);
      case 'logic':
        return this.evaluateLogicNode(node, inputs);
      case 'utility':
        return this.evaluateUtilityNode(node, inputs, context);
      case 'audio':
        return this.evaluateAudioNode(node, inputs);
      default:
        return { outputs };
    }
  }

  private evaluateMathNode(
    node: VisoicNode,
    inputs: Record<string, unknown>
  ): NodeEvaluationResult {
    const data = node.data as { operation: string };
    const a = Number(inputs.a ?? 0);
    const b = Number(inputs.b ?? 0);
    let result = 0;

    switch (data.operation) {
      case 'add':
        result = a + b;
        break;
      case 'subtract':
        result = a - b;
        break;
      case 'multiply':
        result = a * b;
        break;
      case 'divide':
        result = b !== 0 ? a / b : 0;
        break;
      case 'power':
        result = Math.pow(a, b);
        break;
      case 'sqrt':
        result = Math.sqrt(Number(inputs.value ?? inputs.a ?? 0));
        break;
      case 'abs':
        result = Math.abs(Number(inputs.value ?? inputs.a ?? 0));
        break;
      case 'sin':
        result = Math.sin(Number(inputs.angle ?? 0));
        break;
      case 'cos':
        result = Math.cos(Number(inputs.angle ?? 0));
        break;
      case 'tan':
        result = Math.tan(Number(inputs.angle ?? 0));
        break;
      case 'min':
        result = Math.min(a, b);
        break;
      case 'max':
        result = Math.max(a, b);
        break;
      case 'clamp':
        const value = Number(inputs.value ?? 0);
        const min = Number(inputs.min ?? 0);
        const max = Number(inputs.max ?? 1);
        result = Math.max(min, Math.min(max, value));
        break;
      case 'lerp':
        const la = Number(inputs.a ?? 0);
        const lb = Number(inputs.b ?? 1);
        const t = Number(inputs.t ?? 0.5);
        result = la + (lb - la) * t;
        break;
      case 'map':
        const mapValue = Number(inputs.value ?? 0);
        const inMin = Number(inputs.inMin ?? 0);
        const inMax = Number(inputs.inMax ?? 1);
        const outMin = Number(inputs.outMin ?? 0);
        const outMax = Number(inputs.outMax ?? 1);
        result = outMin + ((mapValue - inMin) / (inMax - inMin)) * (outMax - outMin);
        break;
    }

    return { outputs: { result } };
  }

  private evaluateValueNode(
    node: VisoicNode,
    inputs: Record<string, unknown>
  ): NodeEvaluationResult {
    const data = node.data as { valueType: string; value: unknown };
    const outputs: Record<string, unknown> = {};

    switch (data.valueType) {
      case 'number':
        outputs.value = data.value;
        break;
      case 'boolean':
        outputs.value = data.value;
        break;
      case 'color':
        const color = data.value as number[];
        outputs.color = color;
        outputs.r = color[0] ?? 1;
        outputs.g = color[1] ?? 1;
        outputs.b = color[2] ?? 1;
        outputs.a = color[3] ?? 1;
        break;
      case 'vec2':
        const vec2 = data.value as number[];
        outputs.vec = vec2;
        outputs.x = vec2[0] ?? 0;
        outputs.y = vec2[1] ?? 0;
        break;
      case 'vec3':
        const vec3 = data.value as number[];
        outputs.vec = vec3;
        outputs.x = vec3[0] ?? 0;
        outputs.y = vec3[1] ?? 0;
        outputs.z = vec3[2] ?? 0;
        break;
      case 'vec4':
        const vec4 = data.value as number[];
        outputs.vec = vec4;
        outputs.x = vec4[0] ?? 0;
        outputs.y = vec4[1] ?? 0;
        outputs.z = vec4[2] ?? 0;
        outputs.w = vec4[3] ?? 0;
        break;
    }

    return { outputs };
  }

  private evaluateLogicNode(
    node: VisoicNode,
    inputs: Record<string, unknown>
  ): NodeEvaluationResult {
    const data = node.data as { logicType: string; compareOp?: string };
    let result: unknown = false;

    switch (data.logicType) {
      case 'compare':
        const a = Number(inputs.a ?? 0);
        const b = Number(inputs.b ?? 0);
        switch (data.compareOp) {
          case '==':
            result = a === b;
            break;
          case '!=':
            result = a !== b;
            break;
          case '<':
            result = a < b;
            break;
          case '>':
            result = a > b;
            break;
          case '<=':
            result = a <= b;
            break;
          case '>=':
            result = a >= b;
            break;
        }
        break;
      case 'select':
        const condition = Boolean(inputs.condition);
        result = condition ? inputs.true : inputs.false;
        break;
      case 'and':
        result = Boolean(inputs.a) && Boolean(inputs.b);
        break;
      case 'or':
        result = Boolean(inputs.a) || Boolean(inputs.b);
        break;
      case 'not':
        result = !Boolean(inputs.value);
        break;
    }

    return { outputs: { result } };
  }

  private evaluateUtilityNode(
    node: VisoicNode,
    inputs: Record<string, unknown>,
    context: EvaluationContext
  ): NodeEvaluationResult {
    const data = node.data as {
      utilityType: string;
      expression?: string;
      accumulatorConfig?: {
        wrapMode: 'none' | 'wrap' | 'clamp' | 'pingpong';
        min?: number;
        max?: number;
        rate?: number;
      };
      oscillatorConfig?: {
        waveform: 'sine' | 'square' | 'sawtooth' | 'triangle' | 'pulse';
        pulseWidth?: number;
      };
      _state?: Record<string, unknown>;
    };
    const outputs: Record<string, unknown> = {};

    // Initialize state if needed
    if (!data._state) {
      data._state = {};
    }

    switch (data.utilityType) {
      case 'time':
        outputs.time = context.time;
        outputs.delta = context.deltaTime;
        outputs.frame = context.frame;
        break;

      case 'random':
        const min = Number(inputs.min ?? 0);
        const max = Number(inputs.max ?? 1);
        outputs.value = min + Math.random() * (max - min);
        break;

      case 'smooth': {
        const target = Number(inputs.value ?? 0);
        const speed = Number(inputs.speed ?? 0.1);
        const lastValue = Number(data._state.lastValue ?? target);
        const smoothed = lastValue + (target - lastValue) * Math.min(speed, 1);
        data._state.lastValue = smoothed;
        outputs.smoothed = smoothed;
        break;
      }

      case 'accumulator': {
        const rate = Number(inputs.rate ?? 1) * context.deltaTime;
        const reset = Boolean(inputs.reset);
        // Read min/max from inputs first (connections), fallback to accumulatorConfig (UI), then defaults
        const minVal = Number(inputs.min ?? data.accumulatorConfig?.min ?? 0);
        const maxVal = Number(inputs.max ?? data.accumulatorConfig?.max ?? 1);
        const wrapMode = data.accumulatorConfig?.wrapMode ?? 'wrap';

        let currentValue = Number(data._state.currentValue ?? 0);
        let direction = Number(data._state.direction ?? 1);

        if (reset) {
          currentValue = minVal;
          direction = 1;
        } else {
          currentValue += rate * direction;

          switch (wrapMode) {
            case 'wrap':
              if (currentValue > maxVal) {
                currentValue = minVal + (currentValue - maxVal);
              } else if (currentValue < minVal) {
                currentValue = maxVal - (minVal - currentValue);
              }
              break;
            case 'clamp':
              currentValue = Math.max(minVal, Math.min(maxVal, currentValue));
              break;
            case 'pingpong':
              if (currentValue >= maxVal) {
                currentValue = maxVal;
                direction = -1;
              } else if (currentValue <= minVal) {
                currentValue = minVal;
                direction = 1;
              }
              break;
          }
        }

        data._state.currentValue = currentValue;
        data._state.direction = direction;
        outputs.value = currentValue;
        outputs.normalized = (currentValue - minVal) / (maxVal - minVal || 1);
        break;
      }

      case 'oscillator': {
        const frequency = Number(inputs.frequency ?? 1);
        const amplitude = Number(inputs.amplitude ?? 1);
        const offset = Number(inputs.offset ?? 0);
        const phase = Number(inputs.phase ?? 0);
        const waveform = data.oscillatorConfig?.waveform ?? 'sine';

        const t = (context.time * frequency + phase) % 1;
        let value = 0;

        switch (waveform) {
          case 'sine':
            value = Math.sin(t * Math.PI * 2);
            break;
          case 'square':
            value = t < 0.5 ? 1 : -1;
            break;
          case 'sawtooth':
            value = t * 2 - 1;
            break;
          case 'triangle':
            value = Math.abs(t * 4 - 2) - 1;
            break;
          case 'pulse':
            const pulseWidth = data.oscillatorConfig?.pulseWidth ?? 0.5;
            value = t < pulseWidth ? 1 : -1;
            break;
        }

        outputs.value = value * amplitude + offset;
        outputs.positive = (value + 1) * 0.5 * amplitude + offset;
        break;
      }

      case 'expression': {
        const expr = data.expression ?? 'a + b';
        const a = Number(inputs.a ?? 0);
        const b = Number(inputs.b ?? 0);
        const c = Number(inputs.c ?? 0);
        const d = Number(inputs.d ?? 0);

        try {
          // Simple expression evaluation with basic support
          const variables: Record<string, number> = {
            a, b, c, d,
            time: context.time,
            delta: context.deltaTime,
            frame: context.frame,
            PI: Math.PI,
            TAU: Math.PI * 2,
            E: Math.E,
          };

          // Basic expression parser (supports simple math)
          let result = this.evaluateExpression(expr, variables);
          outputs.result = result;
        } catch (e) {
          outputs.result = 0;
        }
        break;
      }

      case 'trigger': {
        const value = Number(inputs.value ?? 0);
        const threshold = Number(inputs.threshold ?? 0.5);
        const lastValue = Number(data._state.lastValue ?? 0);
        const wasAbove = Boolean(data._state.wasAbove);

        const isAbove = value >= threshold;
        const rising = isAbove && !wasAbove;
        const falling = !isAbove && wasAbove;

        data._state.lastValue = value;
        data._state.wasAbove = isAbove;

        outputs.triggered = rising || falling;
        outputs.rising = rising;
        outputs.falling = falling;
        break;
      }

      case 'noise': {
        const x = Number(inputs.x ?? 0);
        const y = Number(inputs.y ?? 0);
        const scale = Number(inputs.scale ?? 1);
        const octaves = Math.max(1, Math.floor(Number(inputs.octaves ?? 1)));

        // Simple noise using sine-based pseudo-random
        let noiseValue = 0;
        let amplitude = 1;
        let freq = scale;
        let maxVal = 0;

        for (let i = 0; i < octaves; i++) {
          const nx = x * freq;
          const ny = y * freq;
          noiseValue += (Math.sin(nx * 12.9898 + ny * 78.233) * 43758.5453 % 1) * amplitude;
          maxVal += amplitude;
          amplitude *= 0.5;
          freq *= 2;
        }

        outputs.value = noiseValue / maxVal;
        break;
      }

      case 'delay': {
        const value = Number(inputs.value ?? 0);
        const delayTime = Number(inputs.time ?? 0.1);
        const buffer = (data._state.buffer ?? []) as Array<{ time: number; value: number }>;

        // Add current value to buffer
        buffer.push({ time: context.time, value });

        // Find value at delay time
        const targetTime = context.time - delayTime;
        let delayedValue = value;

        while (buffer.length > 1 && buffer[0].time < targetTime) {
          buffer.shift();
        }

        if (buffer.length > 0 && buffer[0].time <= targetTime) {
          delayedValue = buffer[0].value;
        }

        // Keep buffer from growing too large
        while (buffer.length > 1000) {
          buffer.shift();
        }

        data._state.buffer = buffer;
        outputs.delayed = delayedValue;
        break;
      }

      case 'hold': {
        const trigger = Boolean(inputs.trigger);
        const inputValue = Number(inputs.value ?? 1);
        const holdTimeMs = Number(inputs.holdTime ?? 100);
        const now = performance.now();

        let holdUntil = Number(data._state.holdUntil ?? 0);
        let heldValue = Number(data._state.heldValue ?? 0);

        // Check if trigger is active (new trigger)
        if (trigger) {
          holdUntil = now + holdTimeMs;
          heldValue = inputValue;
        }

        // Check if still in hold period
        const isActive = now < holdUntil;

        data._state.holdUntil = holdUntil;
        data._state.heldValue = heldValue;

        outputs.active = isActive;
        outputs.value = isActive ? heldValue : 0;
        break;
      }
    }

    return { outputs };
  }

  // Simple expression evaluator
  private evaluateExpression(expr: string, vars: Record<string, number>): number {
    // Replace variable names with values
    let processed = expr;
    for (const [name, value] of Object.entries(vars)) {
      processed = processed.replace(new RegExp(`\\b${name}\\b`, 'g'), String(value));
    }

    // Add math functions
    const mathFuncs = ['sin', 'cos', 'tan', 'abs', 'floor', 'ceil', 'round', 'sqrt', 'log', 'exp', 'min', 'max', 'pow'];
    for (const fn of mathFuncs) {
      processed = processed.replace(new RegExp(`\\b${fn}\\(`, 'g'), `Math.${fn}(`);
    }

    // Evaluate (simple and safe for math expressions)
    try {
      // Basic validation - only allow safe characters
      if (!/^[0-9+\-*/().,%\s<>=!&|?:Math.a-z]+$/i.test(processed)) {
        return 0;
      }
      return new Function(`return ${processed}`)();
    } catch {
      return 0;
    }
  }

  private evaluateAudioNode(
    node: VisoicNode,
    inputs: Record<string, unknown>
  ): NodeEvaluationResult {
    // Audio node evaluation is handled by the audio system
    // This is a placeholder that returns cached values
    return { outputs: node.data.outputValues };
  }

  // ============================================
  // Serialization
  // ============================================

  serialize(): string {
    return JSON.stringify({
      nodes: Array.from(this.nodes.values()).map((node) => ({
        id: node.id,
        type: node.type,
        position: node.position,
        data: node.data,
      })),
      edges: Array.from(this.edges.values()),
    });
  }

  deserialize(json: string): void {
    try {
      const data = JSON.parse(json);
      this.setState({
        nodes: data.nodes,
        edges: data.edges,
      });
    } catch (error) {
      console.error('Failed to deserialize graph:', error);
    }
  }

  // ============================================
  // Clear
  // ============================================

  clear(): void {
    this.nodes.clear();
    this.edges.clear();
    this.nodeOutputCache.clear();
    this.evaluationOrder = [];
    this.isDirty = true;
    this.notifyListeners();
  }
}

export const nodeGraph = new NodeGraphManager();
export { NodeGraphManager };
