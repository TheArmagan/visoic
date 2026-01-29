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
  AccumulatorValueSource,
  AccumulatorWrapMode,
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
// Additional utility functions
parser.functions.mix = (a: number, b: number, t: number) => a * (1 - t) + b * t;
parser.functions.saturate = (x: number) => Math.min(Math.max(x, 0), 1);
parser.functions.remap = (v: number, inMin: number, inMax: number, outMin: number, outMax: number) =>
  outMin + ((v - inMin) / (inMax - inMin)) * (outMax - outMin);
parser.functions.pingpong = (t: number, len: number) => len - Math.abs((t % (2 * len)) - len);
parser.functions.repeat = (t: number, len: number) => t - Math.floor(t / len) * len;
parser.functions.noise = (x: number) => {
  // Simple deterministic noise function
  const n = Math.sin(x * 12.9898 + x * 78.233) * 43758.5453;
  return n - Math.floor(n);
};
parser.functions.pulse = (x: number, width: number) => x % 1 < width ? 1 : 0;
parser.functions.triangle = (x: number) => Math.abs((x % 1) * 2 - 1);
parser.functions.sawtooth = (x: number) => x % 1;
parser.functions.square = (x: number) => x % 1 < 0.5 ? 1 : 0;
parser.functions.quantize = (x: number, steps: number) => Math.floor(x * steps) / steps;
parser.functions.deadzone = (x: number, zone: number) => Math.abs(x) < zone ? 0 : x;
parser.functions.easeIn = (t: number) => t * t;
parser.functions.easeOut = (t: number) => 1 - (1 - t) * (1 - t);
parser.functions.easeInOut = (t: number) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

// System time tracking
let systemStartTime = Date.now();
let lastFrameTime = Date.now();
let frameCount = 0;
let deltaTime = 0;

/**
 * Get system variables for expressions
 */
function getSystemVariables(): Record<string, number> {
  const now = Date.now();
  const date = new Date(now);

  return {
    // Time
    time: (now - systemStartTime) / 1000,           // Seconds since start
    now: now,                                        // Unix timestamp in ms
    delta: deltaTime / 1000,                         // Delta time in seconds
    deltaMs: deltaTime,                              // Delta time in ms
    frame: frameCount,                               // Frame counter

    // Date components
    year: date.getFullYear(),
    month: date.getMonth() + 1,                      // 1-12
    day: date.getDate(),                             // 1-31
    hour: date.getHours(),                           // 0-23
    minute: date.getMinutes(),                       // 0-59
    second: date.getSeconds(),                       // 0-59
    millisecond: date.getMilliseconds(),             // 0-999
    dayOfWeek: date.getDay(),                        // 0-6 (Sunday = 0)
    dayOfYear: Math.floor((now - new Date(date.getFullYear(), 0, 0).getTime()) / 86400000),

    // Time fractions (useful for cyclic animations)
    hourFrac: (date.getHours() + date.getMinutes() / 60) / 24,        // 0-1 over day
    minuteFrac: (date.getMinutes() + date.getSeconds() / 60) / 60,    // 0-1 over hour
    secondFrac: (date.getSeconds() + date.getMilliseconds() / 1000) / 60, // 0-1 over minute

    // Math constants
    PI: Math.PI,
    TAU: Math.PI * 2,
    E: Math.E,
    PHI: (1 + Math.sqrt(5)) / 2,                    // Golden ratio

    // Random (changes each frame)
    random: Math.random(),
  };
}

/**
 * Update frame timing (should be called each frame)
 */
export function updateFrameTiming(): void {
  const now = Date.now();
  deltaTime = now - lastFrameTime;
  lastFrameTime = now;
  frameCount++;
}

// System variable names (to exclude from dependency extraction)
const SYSTEM_VARIABLES = new Set([
  'time', 'now', 'delta', 'deltaMs', 'frame',
  'year', 'month', 'day', 'hour', 'minute', 'second', 'millisecond', 'dayOfWeek', 'dayOfYear',
  'hourFrac', 'minuteFrac', 'secondFrac',
  'PI', 'TAU', 'E', 'PHI', 'random',
  // Math functions and constants from expr-eval
  'abs', 'acos', 'acosh', 'asin', 'asinh', 'atan', 'atan2', 'atanh', 'cbrt', 'ceil',
  'clamp', 'cos', 'cosh', 'degrees', 'exp', 'floor', 'fract', 'hypot', 'length', 'lerp',
  'ln', 'log', 'log10', 'log2', 'map', 'max', 'min', 'mod', 'noise', 'pow', 'radians',
  'random', 'remap', 'round', 'saturate', 'sign', 'sin', 'sinh', 'smoothstep', 'sqrt',
  'step', 'tan', 'tanh', 'trunc', 'mix', 'pingpong', 'repeat', 'pulse', 'triangle',
  'sawtooth', 'square', 'quantize', 'deadzone', 'easeIn', 'easeOut', 'easeInOut',
  // Boolean/conditional
  'true', 'false', 'if',
]);

// Volatile system variables that change every frame
const VOLATILE_SYSTEM_VARIABLES = new Set([
  'time', 'now', 'delta', 'deltaMs', 'frame',
  'year', 'month', 'day', 'hour', 'minute', 'second', 'millisecond', 'dayOfWeek', 'dayOfYear',
  'hourFrac', 'minuteFrac', 'secondFrac',
  'random'
]);

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
  private accumulatorStates: Map<string, { value: number; direction: number }> = new Map(); // For pingpong mode
  private timeDependents: Set<string> = new Set(); // Values depending on volatile system vars

  // ==========================================
  // Dependency Extraction
  // ==========================================

  /**
   * Extract dependencies from an expression by analyzing variable references
   * Returns array of value IDs that the expression depends on
   */
  extractDependencies(expression: string): string[] {
    if (!expression || !expression.trim()) return [];

    try {
      // Parse the expression and get variable names
      const parsed = parser.parse(expression);
      const variables = parsed.variables({ withMembers: true });

      // Get all registered value IDs
      const registeredIds = new Set(this.values.keys());

      // Also create underscore versions for matching
      const idToUnderscore = new Map<string, string>();
      for (const id of registeredIds) {
        idToUnderscore.set(id.replace(/\./g, '_'), id);
      }

      const dependencies: Set<string> = new Set();

      for (const varName of variables) {
        // Skip system variables and functions
        if (SYSTEM_VARIABLES.has(varName)) continue;

        // Check if it's a direct match (underscore notation like audio_bass)
        if (idToUnderscore.has(varName)) {
          dependencies.add(idToUnderscore.get(varName)!);
          continue;
        }

        // Check if it's a registered value ID directly
        if (registeredIds.has(varName)) {
          dependencies.add(varName);
          continue;
        }

        // For nested member access like "audio.bass", the parser might return "audio"
        // We need to find any registered ID that starts with this prefix
        let found = false;
        for (const id of registeredIds) {
          const underscoreId = id.replace(/\./g, '_');
          if (underscoreId === varName || id === varName) {
            dependencies.add(id);
            found = true;
          }
        }

        // If not found in registered IDs, assume it's a dependency anyway (forward reference)
        // This handles cases where dependencies are created after the computed value,
        // or temporarily deleted and recreated.
        if (!found) {
          // Add as-is
          dependencies.add(varName);

          // Also try to guess dot notation from underscore (audio_bass -> audio.bass)
          if (varName.includes('_')) {
            dependencies.add(varName.replace(/_/g, '.'));
          }

          // And try to guess underscore from dot (audio.bass -> audio_bass)
          // (though parser usually gives us the dot version if withMembers is true)
          if (varName.includes('.')) {
            // If we got 'audio.bass', we added it above.
            // We could also add 'audio_bass' but that's not a value ID usually.
          }
        }
      }

      return Array.from(dependencies);
    } catch (error) {
      console.warn(`Failed to extract dependencies from expression: ${expression}`, error);
      return [];
    }
  }

  /**
   * Check if expression uses volatile system variables
   */
  isVolatileExpression(expression: string): boolean {
    if (!expression || !expression.trim()) return false;
    try {
      const parsed = parser.parse(expression);
      const variables = parsed.variables();
      for (const v of variables) {
        if (VOLATILE_SYSTEM_VARIABLES.has(v)) return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Get all registered value IDs (useful for UI autocompletion)
   */
  getRegisteredIds(): string[] {
    return Array.from(this.values.keys());
  }

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

    this.setupTracking(valueDef);

    this.emit('add', {
      type: 'add',
      valueId: definition.id,
      timestamp: Date.now(),
      data: valueDef,
    });

    // Notify dependents that this value is available/changed
    this.updateDependents(definition.id);
  }

  /**
   * Update an existing value definition
   */
  update(definition: Partial<AnyValueDefinition> & { id: string }): boolean {
    const existing = this.values.get(definition.id);
    if (!existing) {
      console.warn(`Value '${definition.id}' does not exist. Use register() to create.`);
      return false;
    }

    // Clean up old tracking
    this.cleanupTracking(existing);

    // Merge definition
    const newDef: AnyValueDefinition = {
      ...existing,
      ...definition,
      lastUpdated: Date.now(),
    };

    this.values.set(definition.id, newDef);

    // Setup new tracking
    this.setupTracking(newDef);

    // Recompute if computed
    if (newDef.source.type === 'computed') {
      this.recomputeValue(newDef.id);
    }

    this.emit('change', {
      type: 'change',
      valueId: definition.id,
      timestamp: Date.now(),
      data: { oldValue: existing.value, newValue: newDef.value },
    });

    // Notify dependents that this value is available/changed
    this.updateDependents(definition.id);

    return true;
  }

  private setupTracking(definition: AnyValueDefinition): void {
    // Track computed dependencies
    if (definition.source.type === 'computed') {
      const source = definition.source as ComputedValueSource;

      // Check for time dependencies
      if (this.isVolatileExpression(source.expression)) {
        this.timeDependents.add(definition.id);
      }

      for (const depId of source.dependencies) {
        if (!this.computedDependencies.has(depId)) {
          this.computedDependencies.set(depId, new Set());
        }
        this.computedDependencies.get(depId)!.add(definition.id);
      }
    }

    // Track accumulator dependencies
    if (definition.source.type === 'accumulator') {
      const source = definition.source as AccumulatorValueSource;
      const allDeps = [
        ...source.rateDependencies,
        ...(source.limitDependencies ?? []),
        ...(source.minDependencies ?? []),
      ];

      for (const depId of allDeps) {
        if (!this.computedDependencies.has(depId)) {
          this.computedDependencies.set(depId, new Set());
        }
        this.computedDependencies.get(depId)!.add(definition.id);
      }
    }
  }

  private cleanupTracking(definition: AnyValueDefinition): void {
    const id = definition.id;

    // Remove from computed dependencies
    if (definition.source.type === 'computed') {
      const source = definition.source as ComputedValueSource;
      for (const depId of source.dependencies) {
        this.computedDependencies.get(depId)?.delete(id);
      }
      this.timeDependents.delete(id);
    }

    // Remove from accumulator dependencies
    if (definition.source.type === 'accumulator') {
      const source = definition.source as AccumulatorValueSource;
      const allDeps = [
        ...source.rateDependencies,
        ...(source.limitDependencies ?? []),
        ...(source.minDependencies ?? []),
      ];
      for (const depId of allDeps) {
        this.computedDependencies.get(depId)?.delete(id);
      }
    }
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

    this.cleanupTracking(value);

    // Remove from config (specific handling)
    if (value.source.type === 'computed') {
      configManager.removeComputedValue(id);
    }
    if (value.source.type === 'accumulator') {
      this.accumulatorStates.delete(id);
      configManager.removeAccumulatorValue(id);
    }

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
    const context: Record<string, unknown> = {};

    // Add system variables first
    const sysVars = getSystemVariables();
    Object.assign(context, sysVars);

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
   * Dependencies are automatically extracted from the expression
   * @param skipSave - If true, skip saving to config (used during restoration)
   */
  createComputed(
    id: string,
    name: string,
    expression: string,
    options: Partial<NumberValueDefinition> = {},
    skipSave: boolean = false
  ): void {
    // Auto-extract dependencies from expression
    const dependencies = this.extractDependencies(expression);

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
      });
    }
  }

  // ==========================================
  // Accumulator Values
  // ==========================================

  /**
   * Create an accumulator value that changes over time
   * Dependencies are automatically extracted from expressions
   * @param id - Unique identifier
   * @param name - Display name
   * @param rateExpression - Rate of change expression (can use other values)
   * @param options - Additional options including limit, wrapMode, etc.
   * @param skipSave - If true, skip saving to config (used during restoration)
   */
  createAccumulator(
    id: string,
    name: string,
    rateExpression: string,
    options: {
      limitExpression?: string;
      minExpression?: string;
      wrapMode?: AccumulatorWrapMode;
      initialValue?: number;
      resetOnLimit?: boolean;
    } = {},
    skipSave: boolean = false
  ): void {
    const initialValue = options.initialValue ?? 0;
    const wrapMode = options.wrapMode ?? 'none';

    // Auto-extract dependencies from expressions
    const rateDependencies = this.extractDependencies(rateExpression);
    const limitDependencies = options.limitExpression ? this.extractDependencies(options.limitExpression) : [];
    const minDependencies = options.minExpression ? this.extractDependencies(options.minExpression) : [];

    // Collect all dependencies for tracking
    const allDependencies = [
      ...rateDependencies,
      ...limitDependencies,
      ...minDependencies,
    ];

    this.register({
      id,
      name,
      type: 'number',
      value: initialValue,
      defaultValue: initialValue,
      lastUpdated: Date.now(),
      source: {
        type: 'accumulator',
        rateExpression,
        rateDependencies,
        limitExpression: options.limitExpression,
        limitDependencies,
        minExpression: options.minExpression,
        minDependencies,
        wrapMode,
        initialValue,
        resetOnLimit: options.resetOnLimit,
      } as AccumulatorValueSource,
    } as NumberValueDefinition);

    // Initialize state for pingpong mode
    this.accumulatorStates.set(id, { value: initialValue, direction: 1 });

    // Save to config for persistence (skip during restoration)
    if (!skipSave) {
      configManager.addAccumulatorValue({
        id,
        name,
        rateExpression,
        limitExpression: options.limitExpression,
        minExpression: options.minExpression,
        wrapMode,
        initialValue,
        resetOnLimit: options.resetOnLimit,
      });
    }
  }

  /**
   * Update all accumulator values (call this each frame)
   */
  updateAccumulators(): void {
    updateFrameTiming();

    for (const [id, def] of this.values) {
      if (def.source.type !== 'accumulator') continue;

      const source = def.source as AccumulatorValueSource;
      const state = this.accumulatorStates.get(id);
      if (!state) continue;

      try {
        // Evaluate rate
        const rate = this.evaluateExpression(source.rateExpression, source.rateDependencies) as number;

        // Evaluate min/max limits
        let minVal = 0;
        let maxVal: number | undefined;

        if (source.minExpression) {
          minVal = this.evaluateExpression(source.minExpression, source.minDependencies ?? []) as number;
        }

        if (source.limitExpression) {
          maxVal = this.evaluateExpression(source.limitExpression, source.limitDependencies ?? []) as number;
        }

        // Calculate new value based on wrap mode
        const delta = deltaTime / 1000; // Convert to seconds
        let newValue = state.value + (rate * delta * state.direction);

        switch (source.wrapMode) {
          case 'wrap':
            if (maxVal !== undefined) {
              // Modulo wrap: value % limit
              newValue = minVal + parser.functions.mod(newValue - minVal, maxVal - minVal);
            }
            break;

          case 'clamp':
            if (maxVal !== undefined) {
              newValue = Math.max(minVal, Math.min(maxVal, newValue));
            } else {
              newValue = Math.max(minVal, newValue);
            }
            break;

          case 'pingpong':
            if (maxVal !== undefined) {
              if (newValue >= maxVal) {
                state.direction = -1;
                newValue = maxVal - (newValue - maxVal);
              } else if (newValue <= minVal) {
                state.direction = 1;
                newValue = minVal + (minVal - newValue);
              }
            }
            break;

          case 'none':
          default:
            // No limiting, just accumulate
            if (source.resetOnLimit && maxVal !== undefined && newValue >= maxVal) {
              newValue = source.initialValue;
            }
            break;
        }

        state.value = newValue;
        this.set(id, newValue);
      } catch (error) {
        this.emit('error', {
          type: 'error',
          valueId: id,
          timestamp: Date.now(),
          data: {
            code: 'ACCUMULATOR_ERROR',
            message: `Failed to update accumulator '${id}': ${error}`,
          },
        });
      }
    }
  }

  /**
   * Reset an accumulator to its initial value
   */
  resetAccumulator(id: string): boolean {
    const def = this.values.get(id);
    if (!def || def.source.type !== 'accumulator') return false;

    const source = def.source as AccumulatorValueSource;
    const state = this.accumulatorStates.get(id);
    if (state) {
      state.value = source.initialValue;
      state.direction = 1;
    }
    return this.set(id, source.initialValue);
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

  // ==========================================
  // Loop Management
  // ==========================================

  private isRunning: boolean = false;
  private animationFrameId: number | null = null;

  /**
   * Start the value update loop
   */
  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    lastFrameTime = Date.now(); // Reset time to avoid huge delta
    this.loop();
  }

  /**
   * Stop the value update loop
   */
  stop(): void {
    this.isRunning = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  private loop = (): void => {
    if (!this.isRunning) return;

    // Update accumulators (also updates frame timing)
    this.updateAccumulators();

    // Update time-dependent computed values
    for (const id of this.timeDependents) {
      this.recomputeValue(id);
    }

    this.animationFrameId = requestAnimationFrame(this.loop);
  };

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
