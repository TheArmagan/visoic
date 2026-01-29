// ============================================
// Visoic Value Manager - Type Definitions
// ============================================

export type ValueType = 'number' | 'boolean' | 'string' | 'array' | 'object';

export interface ValueDefinition {
  /** Unique identifier for the value */
  id: string;

  /** Human-readable name */
  name: string;

  /** Description of what this value represents */
  description?: string;

  /** Type of the value */
  type: ValueType;

  /** Current value */
  value: unknown;

  /** Default value */
  defaultValue: unknown;

  /** Source of this value */
  source: ValueSource;

  /** Category for grouping in UI */
  category?: string;

  /** Tags for filtering */
  tags?: string[];

  /** Whether this value is read-only */
  readonly?: boolean;

  /** Timestamp of last update */
  lastUpdated: number;

  /** Update frequency (updates per second, 0 = manual) */
  updateFrequency?: number;
}

export interface NumberValueDefinition extends ValueDefinition {
  type: 'number';
  value: number;
  defaultValue: number;

  /** Minimum allowed value */
  min?: number;

  /** Maximum allowed value */
  max?: number;

  /** Step for UI controls */
  step?: number;

  /** Unit label (e.g., 'Hz', 'dB', '%') */
  unit?: string;

  /** Number of decimal places to display */
  precision?: number;
}

export interface BooleanValueDefinition extends ValueDefinition {
  type: 'boolean';
  value: boolean;
  defaultValue: boolean;
}

export interface StringValueDefinition extends ValueDefinition {
  type: 'string';
  value: string;
  defaultValue: string;

  /** Allowed values (for enum-like strings) */
  allowedValues?: string[];
}

export interface ArrayValueDefinition extends ValueDefinition {
  type: 'array';
  value: unknown[];
  defaultValue: unknown[];

  /** Type of items in the array */
  itemType?: ValueType;
}

export type AnyValueDefinition =
  | NumberValueDefinition
  | BooleanValueDefinition
  | StringValueDefinition
  | ArrayValueDefinition
  | ValueDefinition;

// ============================================
// Value Sources
// ============================================

export type ValueSourceType =
  | 'manual'      // User-set value
  | 'audio'       // From audio analyzer
  | 'computed'    // Calculated from other values
  | 'accumulator' // Accumulated value with rate/limit
  | 'system'      // System values (time, etc.)
  | 'external';   // External input

export interface ValueSource {
  type: ValueSourceType;

  /** Source identifier (e.g., analyzer ID) */
  sourceId?: string;

  /** Configuration for this source */
  config?: Record<string, unknown>;
}

export interface AudioValueSource extends ValueSource {
  type: 'audio';

  /** Analyzer ID */
  sourceId: string;

  /** What to extract from the analyzer */
  extraction: AudioExtraction;
}

export interface AudioExtraction {
  /** Type of extraction */
  type:
  | 'frequencyRange'
  | 'frequencyBand'
  | 'amplitude'
  | 'rms'
  | 'peak'
  | 'bpm'
  | 'beat'
  | 'custom';

  /** For frequencyRange: low frequency */
  lowFreq?: number;

  /** For frequencyRange: high frequency */
  highFreq?: number;

  /** For frequencyRange: calculation mode */
  mode?: 'average' | 'peak' | 'rms' | 'sum' | 'weighted';

  /** For frequencyBand: which band */
  band?: 'subBass' | 'bass' | 'lowMid' | 'mid' | 'upperMid' | 'presence' | 'brilliance';

  /** Output range mapping */
  outputRange?: {
    min: number;
    max: number;
  };

  /** Smoothing factor (0-1) */
  smoothing?: number;
}

export interface ComputedValueSource extends ValueSource {
  type: 'computed';

  /** Expression to evaluate */
  expression: string;

  /** Value IDs this depends on */
  dependencies: string[];
}

export type AccumulatorWrapMode = 'clamp' | 'wrap' | 'pingpong' | 'none';

export interface AccumulatorValueSource extends ValueSource {
  type: 'accumulator';

  /** Rate expression - can reference other values or be a constant */
  rateExpression: string;

  /** Rate dependencies - value IDs used in rateExpression */
  rateDependencies: string[];

  /** Limit expression - can reference other values or be a constant. Used for modulo when wrapMode is 'wrap' */
  limitExpression?: string;

  /** Limit dependencies - value IDs used in limitExpression */
  limitDependencies?: string[];

  /** What happens when reaching the limit */
  wrapMode: AccumulatorWrapMode;

  /** Minimum value (optional, used with clamp/pingpong) */
  minExpression?: string;

  /** Min dependencies */
  minDependencies?: string[];

  /** Initial value */
  initialValue: number;

  /** Whether to reset on limit hit (for non-wrap modes) */
  resetOnLimit?: boolean;
}

// ============================================
// Events
// ============================================

export type ValueEventType =
  | 'change'      // Value changed
  | 'add'         // Value added
  | 'remove'      // Value removed
  | 'error';      // Error occurred

export interface ValueEvent<T = unknown> {
  type: ValueEventType;
  valueId: string;
  timestamp: number;
  data: T;
}

export interface ValueChangeEvent extends ValueEvent<{ oldValue: unknown; newValue: unknown }> {
  type: 'change';
}

export interface ValueAddEvent extends ValueEvent<AnyValueDefinition> {
  type: 'add';
}

export interface ValueRemoveEvent extends ValueEvent<AnyValueDefinition> {
  type: 'remove';
}

export interface ValueErrorEvent extends ValueEvent<{ code: string; message: string }> {
  type: 'error';
}

export type ValueEventMap = {
  change: ValueChangeEvent;
  add: ValueAddEvent;
  remove: ValueRemoveEvent;
  error: ValueErrorEvent;
};

export type ValueEventListener<T extends ValueEventType> = (event: ValueEventMap[T]) => void;

// ============================================
// Presets
// ============================================

export interface ValuePreset {
  id: string;
  name: string;
  description?: string;
  values: Array<{
    id: string;
    config: Partial<AnyValueDefinition>;
  }>;
  createdAt: number;
  updatedAt: number;
}
