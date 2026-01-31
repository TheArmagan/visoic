// ============================================
// Visoic Node System - Type Definitions
// ============================================

import type { Node, Edge, Connection } from '@xyflow/svelte';

// ============================================
// Data Types for Node Connections
// ============================================

export type DataType =
  | 'number'
  | 'boolean'
  | 'string'
  | 'vec2'
  | 'vec3'
  | 'vec4'
  | 'color'
  | 'image'
  | 'audio'
  | 'fft'
  | 'array'
  | 'renderContext'
  | 'any';

export interface DataTypeInfo {
  type: DataType;
  color: string;
  label: string;
  compatibleWith: DataType[];
}

export const DATA_TYPE_INFO: Record<DataType, DataTypeInfo> = {
  number: {
    type: 'number',
    color: '#22c55e',
    label: 'Number',
    compatibleWith: ['number', 'any'],
  },
  boolean: {
    type: 'boolean',
    color: '#ef4444',
    label: 'Boolean',
    compatibleWith: ['boolean', 'any'],
  },
  string: {
    type: 'string',
    color: '#f59e0b',
    label: 'String',
    compatibleWith: ['string', 'any'],
  },
  vec2: {
    type: 'vec2',
    color: '#8b5cf6',
    label: 'Vector 2D',
    compatibleWith: ['vec2', 'array', 'any'],
  },
  vec3: {
    type: 'vec3',
    color: '#6366f1',
    label: 'Vector 3D',
    compatibleWith: ['vec3', 'array', 'any'],
  },
  vec4: {
    type: 'vec4',
    color: '#3b82f6',
    label: 'Vector 4D',
    compatibleWith: ['vec4', 'color', 'array', 'any'],
  },
  color: {
    type: 'color',
    color: '#ec4899',
    label: 'Color',
    compatibleWith: ['color', 'vec4', 'any'],
  },
  image: {
    type: 'image',
    color: '#14b8a6',
    label: 'Image',
    compatibleWith: ['image', 'any'],
  },
  audio: {
    type: 'audio',
    color: '#f97316',
    label: 'Audio',
    compatibleWith: ['audio', 'any'],
  },
  fft: {
    type: 'fft',
    color: '#06b6d4',
    label: 'FFT Data',
    compatibleWith: ['fft', 'array', 'any'],
  },
  array: {
    type: 'array',
    color: '#84cc16',
    label: 'Array',
    compatibleWith: ['array', 'any'],
  },
  renderContext: {
    type: 'renderContext',
    color: '#e879f9',
    label: 'Render Context',
    compatibleWith: ['renderContext', 'any'],
  },
  any: {
    type: 'any',
    color: '#a3a3a3',
    label: 'Any',
    compatibleWith: [
      'number',
      'boolean',
      'string',
      'vec2',
      'vec3',
      'vec4',
      'color',
      'image',
      'audio',
      'fft',
      'array',
      'renderContext',
      'any',
    ],
  },
};

// ============================================
// Handle Definitions
// ============================================

export interface HandleDefinition {
  id: string;
  label: string;
  dataType: DataType;
  /** Tags for additional connection filtering */
  tags?: string[];
  /** Whether this handle is required */
  required?: boolean;
  /** Default value when not connected */
  defaultValue?: unknown;
  /** Minimum value for number inputs */
  min?: number;
  /** Maximum value for number inputs */
  max?: number;
  /** Step value for number inputs */
  step?: number;
}

export interface InputHandle extends HandleDefinition {
  type: 'input';
}

export interface OutputHandle extends HandleDefinition {
  type: 'output';
}

// ============================================
// Node Category Definitions
// ============================================

export type NodeCategory =
  | 'shader'
  | 'math'
  | 'value'
  | 'audio'
  | 'logic'
  | 'utility'
  | 'output';

export interface NodeCategoryInfo {
  id: NodeCategory;
  label: string;
  color: string;
  icon: string;
}

export const NODE_CATEGORIES: Record<NodeCategory, NodeCategoryInfo> = {
  shader: {
    id: 'shader',
    label: 'Shaders',
    color: '#8b5cf6',
    icon: '🎨',
  },
  math: {
    id: 'math',
    label: 'Math',
    color: '#22c55e',
    icon: '🔢',
  },
  value: {
    id: 'value',
    label: 'Values',
    color: '#3b82f6',
    icon: '📊',
  },
  audio: {
    id: 'audio',
    label: 'Audio',
    color: '#f97316',
    icon: '🎵',
  },
  logic: {
    id: 'logic',
    label: 'Logic',
    color: '#ef4444',
    icon: '⚡',
  },
  utility: {
    id: 'utility',
    label: 'Utility',
    color: '#a3a3a3',
    icon: '🔧',
  },
  output: {
    id: 'output',
    label: 'Output',
    color: '#14b8a6',
    icon: '📺',
  },
};

// ============================================
// Base Node Data
// ============================================

export interface BaseNodeData {
  /** Index signature for SvelteFlow compatibility */
  [key: string]: unknown;
  /** Display label for the node */
  label: string;
  /** Node category */
  category: NodeCategory;
  /** Input handle definitions */
  inputs: InputHandle[];
  /** Output handle definitions */
  outputs: OutputHandle[];
  /** Current input values (from connections or defaults) */
  inputValues: Record<string, unknown>;
  /** Current output values (computed) */
  outputValues: Record<string, unknown>;
  /** Whether the node has errors */
  hasError?: boolean;
  /** Error message if any */
  errorMessage?: string;
  /** Whether the node is bypassed */
  bypassed?: boolean;
}

// ============================================
// Specific Node Data Types
// ============================================

export interface RenderContextNodeData extends BaseNodeData {
  category: 'shader';
  /** Node subtype */
  shaderType: 'render:context';
  /** Canvas width */
  width: number;
  /** Canvas height */
  height: number;
  /** Target FPS */
  fpsLimit: number;
  /** Whether context is running */
  isRunning?: boolean;
  /** Current FPS (updated by runtime) */
  currentFps?: number;
  /** Background color (RGBA) */
  backgroundColor?: [number, number, number, number];
}

export interface ShaderNodeData extends BaseNodeData {
  category: 'shader';
  /** Shader type identifier */
  shaderType: string;
  /** Shader source code */
  fragmentSource?: string;
  vertexSource?: string;
  /** ISF metadata */
  metadata?: {
    description?: string;
    credit?: string;
    categories?: string[];
    isfId?: string;
  };
  /** Layer order (lower = rendered first, behind others) */
  layerOrder?: number;
  /** Blend mode for compositing */
  blendMode?: 'normal' | 'add' | 'multiply' | 'screen' | 'overlay' | 'difference';
  /** Opacity (0-1) */
  opacity?: number;
  /** Whether this shader layer is enabled */
  enabled?: boolean;
}

export interface MathNodeData extends BaseNodeData {
  category: 'math';
  /** Math operation type */
  operation:
  | 'add'
  | 'subtract'
  | 'multiply'
  | 'divide'
  | 'power'
  | 'sqrt'
  | 'abs'
  | 'sin'
  | 'cos'
  | 'tan'
  | 'min'
  | 'max'
  | 'clamp'
  | 'lerp'
  | 'map';
}

export interface ValueNodeData extends BaseNodeData {
  category: 'value';
  /** Value type */
  valueType: 'number' | 'boolean' | 'string' | 'vec2' | 'vec3' | 'vec4' | 'color';
  /** The actual value */
  value: unknown;
  /** Min/max for number types */
  min?: number;
  max?: number;
  step?: number;
}

export interface AudioNodeData extends BaseNodeData {
  category: 'audio';
  /** Audio node subtype */
  audioType: 'device' | 'analyzer' | 'normalizer' | 'fft' | 'band' | 'frequency-range' | 'amplitude' | 'rms' | 'peak' | 'bpm' | 'beat';
  /** Device ID if applicable */
  deviceId?: string;
  /** Frequency band preset */
  frequencyBand?: 'subBass' | 'bass' | 'lowMid' | 'mid' | 'upperMid' | 'presence' | 'brilliance';
  /** Calculation mode */
  calculationMode?: 'average' | 'peak' | 'rms' | 'sum' | 'weighted';
  /** Smoothing factor (0-1) */
  smoothing?: number;
  /** Analyzer config */
  analyzerConfig?: {
    fftSize: number;
    smoothing: number;
    minDecibels: number;
    maxDecibels: number;
    gain?: number;
  };
  /** Normalizer config */
  normalizerConfig?: {
    targetLevel: number;
    attackTime: number;
    releaseTime: number;
    maxGain: number;
    minGain: number;
    useCompressor?: boolean;
    compressorThreshold?: number;
    compressorRatio?: number;
  };
}

export interface LogicNodeData extends BaseNodeData {
  category: 'logic';
  /** Logic operation type */
  logicType:
  | 'condition'
  | 'switch'
  | 'gate'
  | 'compare'
  | 'and'
  | 'or'
  | 'not'
  | 'select';
  /** Comparison operator for compare nodes */
  compareOp?: '==' | '!=' | '<' | '>' | '<=' | '>=';
  /** Current output data type (for dynamic output nodes) */
  outputDataType?: DataType;
}

export interface UtilityNodeData extends BaseNodeData {
  category: 'utility';
  /** Utility type */
  utilityType: 'time' | 'random' | 'noise' | 'smooth' | 'delay' | 'split' | 'combine' | 'accumulator' | 'oscillator' | 'expression' | 'trigger';
  /** Expression for computed/expression nodes */
  expression?: string;
  /** Accumulator settings */
  accumulatorConfig?: {
    rate?: number;
    rateExpression?: string;
    limitExpression?: string;
    min?: number;
    max?: number;
    minExpression?: string;
    wrapMode?: 'none' | 'wrap' | 'clamp' | 'pingpong';
    mode?: 'clamp' | 'wrap' | 'pingpong';
    initialValue?: number;
    resetOnLimit?: boolean;
  };
  /** Oscillator settings */
  oscillatorConfig?: {
    waveform?: 'sine' | 'square' | 'sawtooth' | 'triangle' | 'pulse';
    frequency?: number;
    amplitude?: number;
    offset?: number;
    phase?: number;
    pulseWidth?: number;
  };
  /** Trigger settings */
  triggerConfig?: {
    mode?: 'rising' | 'falling' | 'both';
    threshold?: number;
  };
  /** Noise settings */
  noiseConfig?: {
    octaves?: number;
    persistence?: number;
    scale?: number;
  };
  /** Delay settings */
  delayConfig?: {
    time?: number;
    bufferSize?: number;
  };
  /** Internal state for stateful nodes */
  _state?: Record<string, unknown>;
}

export interface OutputNodeData extends BaseNodeData {
  category: 'output';
  /** Output type */
  outputType: 'canvas' | 'window' | 'preview' | 'export' | 'ndi' | 'spout';
  /** Canvas reference */
  canvasId?: string;
  /** Window configuration */
  windowConfig?: {
    title?: string;
    width?: number;
    height?: number;
    fullscreen?: boolean;
    monitor?: number;
  };
  /** Render configuration */
  renderConfig?: {
    scale?: number;
    antialiasing?: boolean;
    fps?: number;
    showFps?: boolean;
  };
}

export type AnyNodeData =
  | RenderContextNodeData
  | ShaderNodeData
  | MathNodeData
  | ValueNodeData
  | AudioNodeData
  | LogicNodeData
  | UtilityNodeData
  | OutputNodeData;

// ============================================
// Visoic Node Types
// ============================================

export type VisoicNode = Node<AnyNodeData>;
export type VisoicEdge = Edge<{ dataType: DataType }>;

// ============================================
// Node Registry
// ============================================

export interface NodeDefinition {
  /** Unique node type ID (e.g., 'math:multiply', 'shader:blur') */
  type: string;
  /** Display label */
  label: string;
  /** Description */
  description: string;
  /** Category */
  category: NodeCategory;
  /** Icon (emoji or component) */
  icon: string;
  /** Tags for searching */
  tags: string[];
  /** Default data factory */
  createDefaultData: () => AnyNodeData;
  /** Input definitions */
  inputs: InputHandle[];
  /** Output definitions */
  outputs: OutputHandle[];
}

// ============================================
// Connection Validation
// ============================================

export interface ConnectionValidation {
  isValid: boolean;
  reason?: string;
}

export function isConnectionValid(
  sourceHandle: OutputHandle,
  targetHandle: InputHandle
): ConnectionValidation {
  // Check data type compatibility
  const sourceType = sourceHandle.dataType;
  const targetType = targetHandle.dataType;

  const sourceInfo = DATA_TYPE_INFO[sourceType];
  const targetInfo = DATA_TYPE_INFO[targetType];

  // Check if types are compatible
  if (
    !sourceInfo.compatibleWith.includes(targetType) &&
    !targetInfo.compatibleWith.includes(sourceType)
  ) {
    return {
      isValid: false,
      reason: `Cannot connect ${sourceInfo.label} to ${targetInfo.label}`,
    };
  }

  // Check tag compatibility if tags exist
  if (sourceHandle.tags && targetHandle.tags) {
    const hasCommonTag = sourceHandle.tags.some((tag) =>
      targetHandle.tags?.includes(tag)
    );
    if (!hasCommonTag) {
      return {
        isValid: false,
        reason: 'Incompatible connection tags',
      };
    }
  }

  return { isValid: true };
}

// ============================================
// Graph Evaluation Types
// ============================================

export interface EvaluationContext {
  /** Current time in seconds */
  time: number;
  /** Delta time since last frame */
  deltaTime: number;
  /** Frame count */
  frame: number;
  /** Canvas dimensions */
  resolution: [number, number];
  /** Audio data if available */
  audioData?: {
    fft: Float32Array;
    waveform: Float32Array;
    volume: number;
  };
}

export interface NodeEvaluationResult {
  outputs: Record<string, unknown>;
  error?: string;
}
