// ============================================
// Visoic Value Manager - Core Manager
// ============================================

import { Parser } from 'expr-eval';
import type {
  AnyValueDefinition,
  NumberValueDefinition,
  ValueEventType,
  ValueEventMap,
  ValueEventListener,
  ValueSource,
  AudioValueSource,
  ComputedValueSource,
  AudioExtraction,
  ValueChangeEvent,
  ValueAddEvent,
  ValueRemoveEvent,
  ValueErrorEvent,
} from './types';
import { configManager } from './config-manager';

// Create parser with custom functions
const parser = new Parser();

// Add custom utility functions
parser.functions.clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);
parser.functions.lerp = (a: number, b: number, t: number) => a + (b - a) * t;
parser.functions.map = (v: number, inMin: number, inMax: number, outMin: number, outMax: number) =>
  outMin + ((v - inMin) / (inMax - inMin)) * (outMax - outMin);
parser.functions.smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
};
parser.functions.step = (edge: number, x: number) => x < edge ? 0 : 1;
parser.functions.fract = (x: number) => x - Math.floor(x);
parser.functions.mod = (x: number, y: number) => x - y * Math.floor(x / y);
parser.functions.sign = Math.sign;
parser.functions.degrees = (rad: number) => rad * (180 / Math.PI);
parser.functions.radians = (deg: number) => deg * (Math.PI / 180);

type ListenerEntry<T extends ValueEventType> = {
  listener: ValueEventListener<T>;
  valueId?: string; // If set, only listen to this value
  once: boolean;
};

/**
 * Value Manager - Central hub for all reactive values in Visoic
 *
 * Manages values from various sources (audio, computed, manual, etc.)
 * and provides a unified interface for reading and subscribing to changes.
 */
export class ValueManager {
  private values: Map<string, AnyValueDefinition> = new Map();
  private listeners: Map<ValueEventType, Set<ListenerEntry<ValueEventType>>> = new Map();
  private computedDependencies: Map<string, Set<string>> = new Map(); // valueId -> dependents
  private updateLock: Set<string> = new Set(); // Prevent recursion
  private smoothedValues: Map<string, number> = new Map(); // For smoothing

  // ==========================================
  // Value CRUD
  // ==========================================

  /**
   * Register a new value
   */
  register(definition: AnyValueDefinition): void {
    if (this.values.has(definition.id)) {
      console.warn(`Value '${definition.id}' already exists. Use update() to modify.`);
      return;
    }

    const valueDef: AnyValueDefinition = {
      ...definition,
      lastUpdated: Date.now(),
    };

    this.values.set(definition.id, valueDef);

    // Track computed dependencies
    if (definition.source.type === 'computed') {
      const source = definition.source as ComputedValueSource;
      for (const depId of source.dependencies) {
        if (!this.computedDependencies.has(depId)) {
          this.computedDependencies.set(depId, new Set());
        }
        this.computedDependencies.get(depId)!.add(definition.id);
      }
    }

    this.emit('add', {
      type: 'add',
      valueId: definition.id,
      timestamp: Date.now(),
      data: valueDef,
    });
  }

  /**
   * Register multiple values at once
   */
  registerMany(definitions: AnyValueDefinition[]): void {
    for (const def of definitions) {
      this.register(def);
    }
  }

  /**
   * Remove a value
   */
  unregister(id: string): boolean {
    const value = this.values.get(id);
    if (!value) return false;

    // Remove from computed dependencies
    if (value.source.type === 'computed') {
      const source = value.source as ComputedValueSource;
      for (const depId of source.dependencies) {
        this.computedDependencies.get(depId)?.delete(id);
      }
      // Remove from config
      configManager.removeComputedValue(id);
    }

    // Remove dependents tracking
    this.computedDependencies.delete(id);

    this.values.delete(id);
    this.smoothedValues.delete(id);

    this.emit('remove', {
      type: 'remove',
      valueId: id,
      timestamp: Date.now(),
      data: value,
    });

    return true;
  }

  /**
   * Check if a value exists
   */
  has(id: string): boolean {
    return this.values.has(id);
  }

  /**
   * Get a value definition
   */
  getDefinition(id: string): AnyValueDefinition | undefined {
    return this.values.get(id);
  }

  /**
   * Get all value definitions
   */
  getAllDefinitions(): AnyValueDefinition[] {
    return Array.from(this.values.values());
  }

  /**
   * Get values by category
   */
  getByCategory(category: string): AnyValueDefinition[] {
    return this.getAllDefinitions().filter((v) => v.category === category);
  }

  /**
   * Get values by source type
   */
  getBySourceType(sourceType: ValueSource['type']): AnyValueDefinition[] {
    return this.getAllDefinitions().filter((v) => v.source.type === sourceType);
  }

  /**
   * Get values by tag
   */
  getByTag(tag: string): AnyValueDefinition[] {
    return this.getAllDefinitions().filter((v) => v.tags?.includes(tag));
  }

  // ==========================================
  // Value Access
  // ==========================================

  /**
   * Get the current value
   */
  get<T = unknown>(id: string): T | undefined {
    return this.values.get(id)?.value as T | undefined;
  }

  /**
   * Get value with default fallback
   */
  getOr<T>(id: string, defaultValue: T): T {
    const value = this.values.get(id);
    return value !== undefined ? (value.value as T) : defaultValue;
  }

  /**
   * Get multiple values as an object
   */
  getMany<T extends Record<string, unknown>>(ids: string[]): Partial<T> {
    const result: Record<string, unknown> = {};
    for (const id of ids) {
      const value = this.get(id);
      if (value !== undefined) {
        result[id] = value;
      }
    }
    return result as Partial<T>;
  }

  /**
   * Get all values as a flat object
   */
  getAllValues(): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [id, def] of this.values) {
      result[id] = def.value;
    }
    return result;
  }

  // ==========================================
  // Value Setting
  // ==========================================

  /**
   * Set a value (with recursion protection)
   */
  set(id: string, value: unknown): boolean {
    // Recursion protection
    if (this.updateLock.has(id)) {
      console.warn(`Recursion detected for value '${id}'. Update skipped.`);
      return false;
    }

    const definition = this.values.get(id);
    if (!definition) {
      console.warn(`Value '${id}' not found.`);
      return false;
    }

    if (definition.readonly) {
      console.warn(`Value '${id}' is read-only.`);
      return false;
    }

    const oldValue = definition.value;
    if (oldValue === value) return false; // No change

    // Lock to prevent recursion
    this.updateLock.add(id);

    try {
      // Validate and transform value
      const newValue = this.validateValue(definition, value);
      definition.value = newValue;
      definition.lastUpdated = Date.now();

      // Emit change event
      this.emit('change', {
        type: 'change',
        valueId: id,
        timestamp: Date.now(),
        data: { oldValue, newValue },
      });

      // Update computed dependents
      this.updateDependents(id);

      return true;
    } finally {
      this.updateLock.delete(id);
    }
  }

  /**
   * Set value from audio analyzer with optional smoothing
   */
  setFromAudio(id: string, value: number, smoothing?: number): boolean {
    const definition = this.values.get(id);
    if (!definition || definition.type !== 'number') return false;

    let finalValue = value;

    // Apply smoothing if specified
    if (smoothing && smoothing > 0) {
      const prevSmoothed = this.smoothedValues.get(id) ?? value;
      finalValue = prevSmoothed + (value - prevSmoothed) * (1 - smoothing);
      this.smoothedValues.set(id, finalValue);
    }

    // Apply output range mapping
    const source = definition.source as AudioValueSource;
    if (source?.extraction?.outputRange) {
      const { min, max } = source.extraction.outputRange;
      finalValue = min + finalValue * (max - min);
    }

    return this.set(id, finalValue);
  }

  /**
   * Set multiple values at once
   */
  setMany(values: Record<string, unknown>): void {
    for (const [id, value] of Object.entries(values)) {
      this.set(id, value);
    }
  }

  /**
   * Reset a value to its default
   */
  reset(id: string): boolean {
    const definition = this.values.get(id);
    if (!definition) return false;
    return this.set(id, definition.defaultValue);
  }

  /**
   * Reset all values to defaults
   */
  resetAll(): void {
    for (const id of this.values.keys()) {
      this.reset(id);
    }
  }

  // ==========================================
  // Computed Values
  // ==========================================

  /**
   * Update all computed values that depend on the given value
   */
  private updateDependents(changedId: string): void {
    const dependents = this.computedDependencies.get(changedId);
    if (!dependents) return;

    for (const dependentId of dependents) {
      this.recomputeValue(dependentId);
    }
  }

  /**
   * Recompute a computed value
   */
  private recomputeValue(id: string): void {
    const definition = this.values.get(id);
    if (!definition || definition.source.type !== 'computed') return;

    const source = definition.source as ComputedValueSource;

    try {
      const result = this.evaluateExpression(source.expression, source.dependencies);
      this.set(id, result);
    } catch (error) {
      this.emit('error', {
        type: 'error',
        valueId: id,
        timestamp: Date.now(),
        data: {
          code: 'COMPUTE_ERROR',
          message: `Failed to compute '${id}': ${error}`,
        },
      });
    }
  }

  /**
   * Evaluate a simple expression with value references using expr-eval
   */
  private evaluateExpression(expression: string, dependencies: string[]): unknown {
    // Build context with dependency values - support both dot and underscore notation
    const context: Record<string, number> = {};

    for (const depId of dependencies) {
      const val = this.get(depId);
      const numVal = typeof val === 'number' ? val : 0;

      // Add with underscore notation (audio.bass -> audio_bass)
      const underscoreName = depId.replace(/\./g, '_');
      context[underscoreName] = numVal;

      // Also build nested object for dot notation (audio.bass -> context.audio.bass)
      const parts = depId.split('.');
      if (parts.length > 1) {
        let obj = context as Record<string, unknown>;
        for (let i = 0; i < parts.length - 1; i++) {
          if (typeof obj[parts[i]] !== 'object') {
            obj[parts[i]] = {};
          }
          obj = obj[parts[i]] as Record<string, unknown>;
        }
        obj[parts[parts.length - 1]] = numVal;
      } else {
        context[depId] = numVal;
      }
    }

    // Parse and evaluate using expr-eval
    const parsed = parser.parse(expression);
    return parsed.evaluate(context as Record<string, number>);
  }

  /**
   * Create a computed value
   * @param skipSave - If true, skip saving to config (used during restoration)
   */
  createComputed(
    id: string,
    name: string,
    expression: string,
    dependencies: string[],
    options: Partial<NumberValueDefinition> = {},
    skipSave: boolean = false
  ): void {
    this.register({
      id,
      name,
      type: 'number',
      value: 0,
      defaultValue: 0,
      source: {
        type: 'computed',
        expression,
        dependencies,
      } as ComputedValueSource,
      ...options,
    } as NumberValueDefinition);

    // Initial computation
    this.recomputeValue(id);

    // Save to config for persistence (skip during restoration)
    if (!skipSave) {
      configManager.addComputedValue({
        id,
        name,
        expression,
        dependencies,
      });
    }
  }

  // ==========================================
  // Validation
  // ==========================================

  private validateValue(definition: AnyValueDefinition, value: unknown): unknown {
    switch (definition.type) {
      case 'number': {
        const numDef = definition as NumberValueDefinition;
        let num = Number(value);
        if (isNaN(num)) num = numDef.defaultValue;
        if (numDef.min !== undefined) num = Math.max(numDef.min, num);
        if (numDef.max !== undefined) num = Math.min(numDef.max, num);
        return num;
      }
      case 'boolean':
        return Boolean(value);
      case 'string':
        return String(value);
      case 'array':
        return Array.isArray(value) ? value : [value];
      default:
        return value;
    }
  }

  // ==========================================
  // Events
  // ==========================================

  /**
   * Subscribe to value events
   */
  on<T extends ValueEventType>(
    event: T,
    listener: ValueEventListener<T>,
    valueId?: string
  ): () => void {
    let listeners = this.listeners.get(event);
    if (!listeners) {
      listeners = new Set();
      this.listeners.set(event, listeners);
    }

    const entry: ListenerEntry<T> = { listener, valueId, once: false };
    listeners.add(entry as ListenerEntry<ValueEventType>);

    // Return unsubscribe function
    return () => {
      listeners?.delete(entry as ListenerEntry<ValueEventType>);
    };
  }

  /**
   * Subscribe to a single event
   */
  once<T extends ValueEventType>(
    event: T,
    listener: ValueEventListener<T>,
    valueId?: string
  ): () => void {
    let listeners = this.listeners.get(event);
    if (!listeners) {
      listeners = new Set();
      this.listeners.set(event, listeners);
    }

    const entry: ListenerEntry<T> = { listener, valueId, once: true };
    listeners.add(entry as ListenerEntry<ValueEventType>);

    return () => {
      listeners?.delete(entry as ListenerEntry<ValueEventType>);
    };
  }

  /**
   * Unsubscribe from events
   */
  off<T extends ValueEventType>(event: T, listener: ValueEventListener<T>): void {
    const listeners = this.listeners.get(event);
    if (!listeners) return;

    for (const entry of listeners) {
      if (entry.listener === listener) {
        listeners.delete(entry);
        break;
      }
    }
  }

  /**
   * Subscribe to changes for a specific value
   */
  watch(id: string, callback: (newValue: unknown, oldValue: unknown) => void): () => void {
    return this.on(
      'change',
      (event) => {
        callback(event.data.newValue, event.data.oldValue);
      },
      id
    );
  }

  /**
   * Emit an event
   */
  private emit<T extends ValueEventType>(event: T, data: ValueEventMap[T]): void {
    const listeners = this.listeners.get(event);
    if (!listeners) return;

    const toRemove: ListenerEntry<ValueEventType>[] = [];

    for (const entry of listeners) {
      // Filter by valueId if specified
      if (entry.valueId && entry.valueId !== data.valueId) continue;

      try {
        (entry.listener as ValueEventListener<T>)(data);
        if (entry.once) {
          toRemove.push(entry);
        }
      } catch (error) {
        console.error(`Error in value event listener for '${event}':`, error);
      }
    }

    for (const entry of toRemove) {
      listeners.delete(entry);
    }
  }

  /**
   * Remove all listeners
   */
  removeAllListeners(event?: ValueEventType): void {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }

  // ==========================================
  // Utilities
  // ==========================================

  /**
   * Get statistics about registered values
   */
  getStats(): {
    total: number;
    byType: Record<string, number>;
    bySource: Record<string, number>;
    byCategory: Record<string, number>;
  } {
    const stats = {
      total: this.values.size,
      byType: {} as Record<string, number>,
      bySource: {} as Record<string, number>,
      byCategory: {} as Record<string, number>,
    };

    for (const def of this.values.values()) {
      stats.byType[def.type] = (stats.byType[def.type] || 0) + 1;
      stats.bySource[def.source.type] = (stats.bySource[def.source.type] || 0) + 1;
      if (def.category) {
        stats.byCategory[def.category] = (stats.byCategory[def.category] || 0) + 1;
      }
    }

    return stats;
  }

  /**
   * Export all value definitions (for saving)
   */
  export(): AnyValueDefinition[] {
    return this.getAllDefinitions();
  }

  /**
   * Import value definitions
   */
  import(definitions: AnyValueDefinition[], replace = false): void {
    if (replace) {
      this.values.clear();
      this.computedDependencies.clear();
      this.smoothedValues.clear();
    }

    for (const def of definitions) {
      this.register(def);
    }
  }

  /**
   * Clear all values
   */
  clear(): void {
    const ids = Array.from(this.values.keys());
    for (const id of ids) {
      this.unregister(id);
    }
  }

  /**
   * Destroy the manager
   */
  destroy(): void {
    this.clear();
    this.removeAllListeners();
    this.updateLock.clear();
  }
}

// Export singleton instance
export const valueManager = new ValueManager();
