// ============================================
// Visoic Node System - Node Registry
// ============================================

import type {
  NodeDefinition,
  NodeCategory,
  InputHandle,
  OutputHandle,
  AnyNodeData,
  MathNodeData,
  ValueNodeData,
  AudioNodeData,
  LogicNodeData,
  UtilityNodeData,
  OutputNodeData,
  ShaderNodeData,
} from './types';

class NodeRegistry {
  private nodes: Map<string, NodeDefinition> = new Map();
  private nodesByCategory: Map<NodeCategory, NodeDefinition[]> = new Map();

  register(definition: NodeDefinition): void {
    this.nodes.set(definition.type, definition);

    // Update category index
    const categoryNodes = this.nodesByCategory.get(definition.category) || [];
    categoryNodes.push(definition);
    this.nodesByCategory.set(definition.category, categoryNodes);
  }

  get(type: string): NodeDefinition | undefined {
    return this.nodes.get(type);
  }

  getByCategory(category: NodeCategory): NodeDefinition[] {
    return this.nodesByCategory.get(category) || [];
  }

  getAll(): NodeDefinition[] {
    return Array.from(this.nodes.values());
  }

  search(query: string): NodeDefinition[] {
    const lowerQuery = query.toLowerCase();
    return this.getAll().filter(
      (def) =>
        def.label.toLowerCase().includes(lowerQuery) ||
        def.type.toLowerCase().includes(lowerQuery) ||
        def.tags.some((tag) => tag.toLowerCase().includes(lowerQuery)) ||
        def.description.toLowerCase().includes(lowerQuery)
    );
  }
}

export const nodeRegistry = new NodeRegistry();

// ============================================
// Value Nodes
// ============================================

nodeRegistry.register({
  type: 'value:number',
  label: 'Number',
  description: 'A constant number value',
  category: 'value',
  icon: '🔢',
  tags: ['number', 'constant', 'value', 'float'],
  inputs: [],
  outputs: [
    { type: 'output', id: 'value', label: 'Value', dataType: 'number' },
  ],
  createDefaultData: (): ValueNodeData => ({
    label: 'Number',
    category: 'value',
    valueType: 'number',
    value: 0,
    min: -1000,
    max: 1000,
    step: 0.01,
    inputs: [],
    outputs: [{ type: 'output', id: 'value', label: 'Value', dataType: 'number' }],
    inputValues: {},
    outputValues: { value: 0 },
  }),
});

nodeRegistry.register({
  type: 'value:boolean',
  label: 'Boolean',
  description: 'A constant boolean value (true/false)',
  category: 'value',
  icon: '✓',
  tags: ['boolean', 'constant', 'value', 'toggle', 'switch'],
  inputs: [],
  outputs: [
    { type: 'output', id: 'value', label: 'Value', dataType: 'boolean' },
  ],
  createDefaultData: (): ValueNodeData => ({
    label: 'Boolean',
    category: 'value',
    valueType: 'boolean',
    value: false,
    inputs: [],
    outputs: [{ type: 'output', id: 'value', label: 'Value', dataType: 'boolean' }],
    inputValues: {},
    outputValues: { value: false },
  }),
});

nodeRegistry.register({
  type: 'value:color',
  label: 'Color',
  description: 'A color value (RGBA)',
  category: 'value',
  icon: '🎨',
  tags: ['color', 'constant', 'value', 'rgba'],
  inputs: [],
  outputs: [
    { type: 'output', id: 'color', label: 'Color', dataType: 'color' },
    { type: 'output', id: 'r', label: 'R', dataType: 'number' },
    { type: 'output', id: 'g', label: 'G', dataType: 'number' },
    { type: 'output', id: 'b', label: 'B', dataType: 'number' },
    { type: 'output', id: 'a', label: 'A', dataType: 'number' },
  ],
  createDefaultData: (): ValueNodeData => ({
    label: 'Color',
    category: 'value',
    valueType: 'color',
    value: [1, 1, 1, 1],
    inputs: [],
    outputs: [
      { type: 'output', id: 'color', label: 'Color', dataType: 'color' },
      { type: 'output', id: 'r', label: 'R', dataType: 'number' },
      { type: 'output', id: 'g', label: 'G', dataType: 'number' },
      { type: 'output', id: 'b', label: 'B', dataType: 'number' },
      { type: 'output', id: 'a', label: 'A', dataType: 'number' },
    ],
    inputValues: {},
    outputValues: { color: [1, 1, 1, 1], r: 1, g: 1, b: 1, a: 1 },
  }),
});

nodeRegistry.register({
  type: 'value:vec2',
  label: 'Vector 2D',
  description: 'A 2D vector value',
  category: 'value',
  icon: '↗️',
  tags: ['vector', 'vec2', 'constant', 'value', 'position'],
  inputs: [],
  outputs: [
    { type: 'output', id: 'vec', label: 'Vector', dataType: 'vec2' },
    { type: 'output', id: 'x', label: 'X', dataType: 'number' },
    { type: 'output', id: 'y', label: 'Y', dataType: 'number' },
  ],
  createDefaultData: (): ValueNodeData => ({
    label: 'Vector 2D',
    category: 'value',
    valueType: 'vec2',
    value: [0, 0],
    inputs: [],
    outputs: [
      { type: 'output', id: 'vec', label: 'Vector', dataType: 'vec2' },
      { type: 'output', id: 'x', label: 'X', dataType: 'number' },
      { type: 'output', id: 'y', label: 'Y', dataType: 'number' },
    ],
    inputValues: {},
    outputValues: { vec: [0, 0], x: 0, y: 0 },
  }),
});

nodeRegistry.register({
  type: 'value:vec3',
  label: 'Vector 3D',
  description: 'A 3D vector value',
  category: 'value',
  icon: '📐',
  tags: ['vector', 'vec3', 'constant', 'value', 'position'],
  inputs: [],
  outputs: [
    { type: 'output', id: 'vec', label: 'Vector', dataType: 'vec3' },
    { type: 'output', id: 'x', label: 'X', dataType: 'number' },
    { type: 'output', id: 'y', label: 'Y', dataType: 'number' },
    { type: 'output', id: 'z', label: 'Z', dataType: 'number' },
  ],
  createDefaultData: (): ValueNodeData => ({
    label: 'Vector 3D',
    category: 'value',
    valueType: 'vec3',
    value: [0, 0, 0],
    inputs: [],
    outputs: [
      { type: 'output', id: 'vec', label: 'Vector', dataType: 'vec3' },
      { type: 'output', id: 'x', label: 'X', dataType: 'number' },
      { type: 'output', id: 'y', label: 'Y', dataType: 'number' },
      { type: 'output', id: 'z', label: 'Z', dataType: 'number' },
    ],
    inputValues: {},
    outputValues: { vec: [0, 0, 0], x: 0, y: 0, z: 0 },
  }),
});

// ============================================
// Math Nodes
// ============================================

nodeRegistry.register({
  type: 'math:add',
  label: 'Add',
  description: 'Add two numbers together',
  category: 'math',
  icon: '➕',
  tags: ['add', 'plus', 'sum', 'math'],
  inputs: [
    { type: 'input', id: 'a', label: 'A', dataType: 'number', defaultValue: 0 },
    { type: 'input', id: 'b', label: 'B', dataType: 'number', defaultValue: 0 },
  ],
  outputs: [
    { type: 'output', id: 'result', label: 'Result', dataType: 'number' },
  ],
  createDefaultData: (): MathNodeData => ({
    label: 'Add',
    category: 'math',
    operation: 'add',
    inputs: [
      { type: 'input', id: 'a', label: 'A', dataType: 'number', defaultValue: 0 },
      { type: 'input', id: 'b', label: 'B', dataType: 'number', defaultValue: 0 },
    ],
    outputs: [{ type: 'output', id: 'result', label: 'Result', dataType: 'number' }],
    inputValues: { a: 0, b: 0 },
    outputValues: { result: 0 },
  }),
});

nodeRegistry.register({
  type: 'math:subtract',
  label: 'Subtract',
  description: 'Subtract B from A',
  category: 'math',
  icon: '➖',
  tags: ['subtract', 'minus', 'difference', 'math'],
  inputs: [
    { type: 'input', id: 'a', label: 'A', dataType: 'number', defaultValue: 0 },
    { type: 'input', id: 'b', label: 'B', dataType: 'number', defaultValue: 0 },
  ],
  outputs: [
    { type: 'output', id: 'result', label: 'Result', dataType: 'number' },
  ],
  createDefaultData: (): MathNodeData => ({
    label: 'Subtract',
    category: 'math',
    operation: 'subtract',
    inputs: [
      { type: 'input', id: 'a', label: 'A', dataType: 'number', defaultValue: 0 },
      { type: 'input', id: 'b', label: 'B', dataType: 'number', defaultValue: 0 },
    ],
    outputs: [{ type: 'output', id: 'result', label: 'Result', dataType: 'number' }],
    inputValues: { a: 0, b: 0 },
    outputValues: { result: 0 },
  }),
});

nodeRegistry.register({
  type: 'math:multiply',
  label: 'Multiply',
  description: 'Multiply two numbers',
  category: 'math',
  icon: '✖️',
  tags: ['multiply', 'times', 'product', 'math'],
  inputs: [
    { type: 'input', id: 'a', label: 'A', dataType: 'number', defaultValue: 1 },
    { type: 'input', id: 'b', label: 'B', dataType: 'number', defaultValue: 1 },
  ],
  outputs: [
    { type: 'output', id: 'result', label: 'Result', dataType: 'number' },
  ],
  createDefaultData: (): MathNodeData => ({
    label: 'Multiply',
    category: 'math',
    operation: 'multiply',
    inputs: [
      { type: 'input', id: 'a', label: 'A', dataType: 'number', defaultValue: 1 },
      { type: 'input', id: 'b', label: 'B', dataType: 'number', defaultValue: 1 },
    ],
    outputs: [{ type: 'output', id: 'result', label: 'Result', dataType: 'number' }],
    inputValues: { a: 1, b: 1 },
    outputValues: { result: 1 },
  }),
});

nodeRegistry.register({
  type: 'math:divide',
  label: 'Divide',
  description: 'Divide A by B',
  category: 'math',
  icon: '➗',
  tags: ['divide', 'division', 'quotient', 'math'],
  inputs: [
    { type: 'input', id: 'a', label: 'A', dataType: 'number', defaultValue: 1 },
    { type: 'input', id: 'b', label: 'B', dataType: 'number', defaultValue: 1 },
  ],
  outputs: [
    { type: 'output', id: 'result', label: 'Result', dataType: 'number' },
  ],
  createDefaultData: (): MathNodeData => ({
    label: 'Divide',
    category: 'math',
    operation: 'divide',
    inputs: [
      { type: 'input', id: 'a', label: 'A', dataType: 'number', defaultValue: 1 },
      { type: 'input', id: 'b', label: 'B', dataType: 'number', defaultValue: 1 },
    ],
    outputs: [{ type: 'output', id: 'result', label: 'Result', dataType: 'number' }],
    inputValues: { a: 1, b: 1 },
    outputValues: { result: 1 },
  }),
});

nodeRegistry.register({
  type: 'math:clamp',
  label: 'Clamp',
  description: 'Clamp a value between min and max',
  category: 'math',
  icon: '📏',
  tags: ['clamp', 'limit', 'range', 'math'],
  inputs: [
    { type: 'input', id: 'value', label: 'Value', dataType: 'number', defaultValue: 0 },
    { type: 'input', id: 'min', label: 'Min', dataType: 'number', defaultValue: 0 },
    { type: 'input', id: 'max', label: 'Max', dataType: 'number', defaultValue: 1 },
  ],
  outputs: [
    { type: 'output', id: 'result', label: 'Result', dataType: 'number' },
  ],
  createDefaultData: (): MathNodeData => ({
    label: 'Clamp',
    category: 'math',
    operation: 'clamp',
    inputs: [
      { type: 'input', id: 'value', label: 'Value', dataType: 'number', defaultValue: 0 },
      { type: 'input', id: 'min', label: 'Min', dataType: 'number', defaultValue: 0 },
      { type: 'input', id: 'max', label: 'Max', dataType: 'number', defaultValue: 1 },
    ],
    outputs: [{ type: 'output', id: 'result', label: 'Result', dataType: 'number' }],
    inputValues: { value: 0, min: 0, max: 1 },
    outputValues: { result: 0 },
  }),
});

nodeRegistry.register({
  type: 'math:lerp',
  label: 'Lerp',
  description: 'Linear interpolation between A and B',
  category: 'math',
  icon: '↔️',
  tags: ['lerp', 'interpolate', 'blend', 'mix', 'math'],
  inputs: [
    { type: 'input', id: 'a', label: 'A', dataType: 'number', defaultValue: 0 },
    { type: 'input', id: 'b', label: 'B', dataType: 'number', defaultValue: 1 },
    { type: 'input', id: 't', label: 'T', dataType: 'number', defaultValue: 0.5 },
  ],
  outputs: [
    { type: 'output', id: 'result', label: 'Result', dataType: 'number' },
  ],
  createDefaultData: (): MathNodeData => ({
    label: 'Lerp',
    category: 'math',
    operation: 'lerp',
    inputs: [
      { type: 'input', id: 'a', label: 'A', dataType: 'number', defaultValue: 0 },
      { type: 'input', id: 'b', label: 'B', dataType: 'number', defaultValue: 1 },
      { type: 'input', id: 't', label: 'T', dataType: 'number', defaultValue: 0.5 },
    ],
    outputs: [{ type: 'output', id: 'result', label: 'Result', dataType: 'number' }],
    inputValues: { a: 0, b: 1, t: 0.5 },
    outputValues: { result: 0.5 },
  }),
});

nodeRegistry.register({
  type: 'math:map',
  label: 'Map Range',
  description: 'Map a value from one range to another',
  category: 'math',
  icon: '🗺️',
  tags: ['map', 'range', 'scale', 'remap', 'math'],
  inputs: [
    { type: 'input', id: 'value', label: 'Value', dataType: 'number', defaultValue: 0.5 },
    { type: 'input', id: 'inMin', label: 'In Min', dataType: 'number', defaultValue: 0 },
    { type: 'input', id: 'inMax', label: 'In Max', dataType: 'number', defaultValue: 1 },
    { type: 'input', id: 'outMin', label: 'Out Min', dataType: 'number', defaultValue: 0 },
    { type: 'input', id: 'outMax', label: 'Out Max', dataType: 'number', defaultValue: 100 },
  ],
  outputs: [
    { type: 'output', id: 'result', label: 'Result', dataType: 'number' },
  ],
  createDefaultData: (): MathNodeData => ({
    label: 'Map Range',
    category: 'math',
    operation: 'map',
    inputs: [
      { type: 'input', id: 'value', label: 'Value', dataType: 'number', defaultValue: 0.5 },
      { type: 'input', id: 'inMin', label: 'In Min', dataType: 'number', defaultValue: 0 },
      { type: 'input', id: 'inMax', label: 'In Max', dataType: 'number', defaultValue: 1 },
      { type: 'input', id: 'outMin', label: 'Out Min', dataType: 'number', defaultValue: 0 },
      { type: 'input', id: 'outMax', label: 'Out Max', dataType: 'number', defaultValue: 100 },
    ],
    outputs: [{ type: 'output', id: 'result', label: 'Result', dataType: 'number' }],
    inputValues: { value: 0.5, inMin: 0, inMax: 1, outMin: 0, outMax: 100 },
    outputValues: { result: 50 },
  }),
});

nodeRegistry.register({
  type: 'math:sin',
  label: 'Sine',
  description: 'Calculate sine of an angle (radians)',
  category: 'math',
  icon: '〰️',
  tags: ['sin', 'sine', 'trig', 'wave', 'math'],
  inputs: [
    { type: 'input', id: 'angle', label: 'Angle', dataType: 'number', defaultValue: 0 },
  ],
  outputs: [
    { type: 'output', id: 'result', label: 'Result', dataType: 'number' },
  ],
  createDefaultData: (): MathNodeData => ({
    label: 'Sine',
    category: 'math',
    operation: 'sin',
    inputs: [
      { type: 'input', id: 'angle', label: 'Angle', dataType: 'number', defaultValue: 0 },
    ],
    outputs: [{ type: 'output', id: 'result', label: 'Result', dataType: 'number' }],
    inputValues: { angle: 0 },
    outputValues: { result: 0 },
  }),
});

nodeRegistry.register({
  type: 'math:cos',
  label: 'Cosine',
  description: 'Calculate cosine of an angle (radians)',
  category: 'math',
  icon: '〰️',
  tags: ['cos', 'cosine', 'trig', 'wave', 'math'],
  inputs: [
    { type: 'input', id: 'angle', label: 'Angle', dataType: 'number', defaultValue: 0 },
  ],
  outputs: [
    { type: 'output', id: 'result', label: 'Result', dataType: 'number' },
  ],
  createDefaultData: (): MathNodeData => ({
    label: 'Cosine',
    category: 'math',
    operation: 'cos',
    inputs: [
      { type: 'input', id: 'angle', label: 'Angle', dataType: 'number', defaultValue: 0 },
    ],
    outputs: [{ type: 'output', id: 'result', label: 'Result', dataType: 'number' }],
    inputValues: { angle: 0 },
    outputValues: { result: 1 },
  }),
});

// ============================================
// Audio Nodes
// ============================================

nodeRegistry.register({
  type: 'audio:device',
  label: 'Audio Device',
  description: 'Audio input device source',
  category: 'audio',
  icon: '🎤',
  tags: ['audio', 'input', 'device', 'microphone', 'source'],
  inputs: [],
  outputs: [
    { type: 'output', id: 'audio', label: 'Audio', dataType: 'audio' },
  ],
  createDefaultData: (): AudioNodeData => ({
    label: 'Audio Device',
    category: 'audio',
    audioType: 'device',
    deviceId: 'default',
    inputs: [],
    outputs: [{ type: 'output', id: 'audio', label: 'Audio', dataType: 'audio' }],
    inputValues: {},
    outputValues: { audio: null },
  }),
});

nodeRegistry.register({
  type: 'audio:analyzer',
  label: 'Audio Analyzer',
  description: 'Analyze audio signal',
  category: 'audio',
  icon: '📊',
  tags: ['audio', 'analyzer', 'fft', 'spectrum'],
  inputs: [
    { type: 'input', id: 'audio', label: 'Audio', dataType: 'audio', required: true },
  ],
  outputs: [
    { type: 'output', id: 'fft', label: 'FFT', dataType: 'fft' },
    { type: 'output', id: 'waveform', label: 'Waveform', dataType: 'array' },
    { type: 'output', id: 'volume', label: 'Volume', dataType: 'number' },
  ],
  createDefaultData: (): AudioNodeData => ({
    label: 'Audio Analyzer',
    category: 'audio',
    audioType: 'analyzer',
    analyzerConfig: {
      fftSize: 2048,
      smoothing: 0.8,
      minDecibels: -100,
      maxDecibels: -30,
    },
    inputs: [
      { type: 'input', id: 'audio', label: 'Audio', dataType: 'audio', required: true },
    ],
    outputs: [
      { type: 'output', id: 'fft', label: 'FFT', dataType: 'fft' },
      { type: 'output', id: 'waveform', label: 'Waveform', dataType: 'array' },
      { type: 'output', id: 'volume', label: 'Volume', dataType: 'number' },
    ],
    inputValues: { audio: null },
    outputValues: { fft: null, waveform: null, volume: 0 },
  }),
});

nodeRegistry.register({
  type: 'audio:normalizer',
  label: 'Audio Normalizer',
  description: 'Normalize audio levels',
  category: 'audio',
  icon: '📈',
  tags: ['audio', 'normalizer', 'gain', 'level'],
  inputs: [
    { type: 'input', id: 'audio', label: 'Audio', dataType: 'audio', required: true },
    { type: 'input', id: 'targetLevel', label: 'Target Level', dataType: 'number', defaultValue: 0.5 },
    { type: 'input', id: 'attackTime', label: 'Attack', dataType: 'number', defaultValue: 0.1 },
    { type: 'input', id: 'releaseTime', label: 'Release', dataType: 'number', defaultValue: 0.05 },
  ],
  outputs: [
    { type: 'output', id: 'audio', label: 'Audio', dataType: 'audio' },
    { type: 'output', id: 'gain', label: 'Gain', dataType: 'number' },
  ],
  createDefaultData: (): AudioNodeData => ({
    label: 'Audio Normalizer',
    category: 'audio',
    audioType: 'normalizer',
    normalizerConfig: {
      targetLevel: 0.5,
      attackTime: 0.1,
      releaseTime: 0.05,
      maxGain: 3.0,
      minGain: 0.1,
    },
    inputs: [
      { type: 'input', id: 'audio', label: 'Audio', dataType: 'audio', required: true },
      { type: 'input', id: 'targetLevel', label: 'Target Level', dataType: 'number', defaultValue: 0.5 },
      { type: 'input', id: 'attackTime', label: 'Attack', dataType: 'number', defaultValue: 0.1 },
      { type: 'input', id: 'releaseTime', label: 'Release', dataType: 'number', defaultValue: 0.05 },
    ],
    outputs: [
      { type: 'output', id: 'audio', label: 'Audio', dataType: 'audio' },
      { type: 'output', id: 'gain', label: 'Gain', dataType: 'number' },
    ],
    inputValues: { audio: null, targetLevel: 0.5, attackTime: 0.1, releaseTime: 0.05 },
    outputValues: { audio: null, gain: 1 },
  }),
});

nodeRegistry.register({
  type: 'audio:fft-band',
  label: 'FFT Band',
  description: 'Extract frequency band from FFT data',
  category: 'audio',
  icon: '🎚️',
  tags: ['audio', 'fft', 'band', 'frequency', 'bass', 'mid', 'treble'],
  inputs: [
    { type: 'input', id: 'fft', label: 'FFT', dataType: 'fft', required: true },
    { type: 'input', id: 'lowFreq', label: 'Low Freq', dataType: 'number', defaultValue: 20 },
    { type: 'input', id: 'highFreq', label: 'High Freq', dataType: 'number', defaultValue: 200 },
  ],
  outputs: [
    { type: 'output', id: 'value', label: 'Value', dataType: 'number' },
    { type: 'output', id: 'peak', label: 'Peak', dataType: 'number' },
  ],
  createDefaultData: (): AudioNodeData => ({
    label: 'FFT Band',
    category: 'audio',
    audioType: 'band',
    inputs: [
      { type: 'input', id: 'fft', label: 'FFT', dataType: 'fft', required: true },
      { type: 'input', id: 'lowFreq', label: 'Low Freq', dataType: 'number', defaultValue: 20 },
      { type: 'input', id: 'highFreq', label: 'High Freq', dataType: 'number', defaultValue: 200 },
    ],
    outputs: [
      { type: 'output', id: 'value', label: 'Value', dataType: 'number' },
      { type: 'output', id: 'peak', label: 'Peak', dataType: 'number' },
    ],
    inputValues: { fft: null, lowFreq: 20, highFreq: 200 },
    outputValues: { value: 0, peak: 0 },
  }),
});

nodeRegistry.register({
  type: 'audio:frequency-range',
  label: 'Frequency Range',
  description: 'Extract custom frequency range',
  category: 'audio',
  icon: '📊',
  tags: ['audio', 'frequency', 'range', 'custom', 'spectrum'],
  inputs: [
    { type: 'input', id: 'audio', label: 'Audio', dataType: 'audio', required: true },
    { type: 'input', id: 'lowFreq', label: 'Low Hz', dataType: 'number', defaultValue: 60 },
    { type: 'input', id: 'highFreq', label: 'High Hz', dataType: 'number', defaultValue: 250 },
    { type: 'input', id: 'smoothing', label: 'Smoothing', dataType: 'number', defaultValue: 0.5 },
  ],
  outputs: [
    { type: 'output', id: 'value', label: 'Value', dataType: 'number' },
    { type: 'output', id: 'peak', label: 'Peak', dataType: 'number' },
  ],
  createDefaultData: (): AudioNodeData => ({
    label: 'Frequency Range',
    category: 'audio',
    audioType: 'frequency-range',
    calculationMode: 'average',
    smoothing: 0.5,
    inputs: [
      { type: 'input', id: 'audio', label: 'Audio', dataType: 'audio', required: true },
      { type: 'input', id: 'lowFreq', label: 'Low Hz', dataType: 'number', defaultValue: 60 },
      { type: 'input', id: 'highFreq', label: 'High Hz', dataType: 'number', defaultValue: 250 },
      { type: 'input', id: 'smoothing', label: 'Smoothing', dataType: 'number', defaultValue: 0.5 },
    ],
    outputs: [
      { type: 'output', id: 'value', label: 'Value', dataType: 'number' },
      { type: 'output', id: 'peak', label: 'Peak', dataType: 'number' },
    ],
    inputValues: { audio: null, lowFreq: 60, highFreq: 250, smoothing: 0.5 },
    outputValues: { value: 0, peak: 0 },
  }),
});

nodeRegistry.register({
  type: 'audio:amplitude',
  label: 'Amplitude',
  description: 'Get overall amplitude/volume level',
  category: 'audio',
  icon: '📈',
  tags: ['audio', 'amplitude', 'volume', 'level'],
  inputs: [
    { type: 'input', id: 'audio', label: 'Audio', dataType: 'audio', required: true },
    { type: 'input', id: 'smoothing', label: 'Smoothing', dataType: 'number', defaultValue: 0.3 },
  ],
  outputs: [
    { type: 'output', id: 'value', label: 'Value', dataType: 'number' },
  ],
  createDefaultData: (): AudioNodeData => ({
    label: 'Amplitude',
    category: 'audio',
    audioType: 'amplitude',
    smoothing: 0.3,
    inputs: [
      { type: 'input', id: 'audio', label: 'Audio', dataType: 'audio', required: true },
      { type: 'input', id: 'smoothing', label: 'Smoothing', dataType: 'number', defaultValue: 0.3 },
    ],
    outputs: [
      { type: 'output', id: 'value', label: 'Value', dataType: 'number' },
    ],
    inputValues: { audio: null, smoothing: 0.3 },
    outputValues: { value: 0 },
  }),
});

nodeRegistry.register({
  type: 'audio:rms',
  label: 'RMS Level',
  description: 'Get RMS (Root Mean Square) level',
  category: 'audio',
  icon: '〰️',
  tags: ['audio', 'rms', 'level', 'loudness'],
  inputs: [
    { type: 'input', id: 'audio', label: 'Audio', dataType: 'audio', required: true },
    { type: 'input', id: 'smoothing', label: 'Smoothing', dataType: 'number', defaultValue: 0.3 },
  ],
  outputs: [
    { type: 'output', id: 'value', label: 'Value', dataType: 'number' },
  ],
  createDefaultData: (): AudioNodeData => ({
    label: 'RMS Level',
    category: 'audio',
    audioType: 'rms',
    smoothing: 0.3,
    inputs: [
      { type: 'input', id: 'audio', label: 'Audio', dataType: 'audio', required: true },
      { type: 'input', id: 'smoothing', label: 'Smoothing', dataType: 'number', defaultValue: 0.3 },
    ],
    outputs: [
      { type: 'output', id: 'value', label: 'Value', dataType: 'number' },
    ],
    inputValues: { audio: null, smoothing: 0.3 },
    outputValues: { value: 0 },
  }),
});

nodeRegistry.register({
  type: 'audio:peak',
  label: 'Peak',
  description: 'Get peak frequency value',
  category: 'audio',
  icon: '📍',
  tags: ['audio', 'peak', 'max', 'frequency'],
  inputs: [
    { type: 'input', id: 'audio', label: 'Audio', dataType: 'audio', required: true },
    { type: 'input', id: 'smoothing', label: 'Smoothing', dataType: 'number', defaultValue: 0.2 },
  ],
  outputs: [
    { type: 'output', id: 'value', label: 'Value', dataType: 'number' },
    { type: 'output', id: 'frequency', label: 'Freq Hz', dataType: 'number' },
  ],
  createDefaultData: (): AudioNodeData => ({
    label: 'Peak',
    category: 'audio',
    audioType: 'peak',
    smoothing: 0.2,
    inputs: [
      { type: 'input', id: 'audio', label: 'Audio', dataType: 'audio', required: true },
      { type: 'input', id: 'smoothing', label: 'Smoothing', dataType: 'number', defaultValue: 0.2 },
    ],
    outputs: [
      { type: 'output', id: 'value', label: 'Value', dataType: 'number' },
      { type: 'output', id: 'frequency', label: 'Freq Hz', dataType: 'number' },
    ],
    inputValues: { audio: null, smoothing: 0.2 },
    outputValues: { value: 0, frequency: 0 },
  }),
});

nodeRegistry.register({
  type: 'audio:bpm',
  label: 'BPM Detector',
  description: 'Detect beats per minute',
  category: 'audio',
  icon: '💓',
  tags: ['audio', 'bpm', 'tempo', 'beat', 'rhythm'],
  inputs: [
    { type: 'input', id: 'audio', label: 'Audio', dataType: 'audio', required: true },
  ],
  outputs: [
    { type: 'output', id: 'bpm', label: 'BPM', dataType: 'number' },
    { type: 'output', id: 'confidence', label: 'Confidence', dataType: 'number' },
  ],
  createDefaultData: (): AudioNodeData => ({
    label: 'BPM Detector',
    category: 'audio',
    audioType: 'bpm',
    inputs: [
      { type: 'input', id: 'audio', label: 'Audio', dataType: 'audio', required: true },
    ],
    outputs: [
      { type: 'output', id: 'bpm', label: 'BPM', dataType: 'number' },
      { type: 'output', id: 'confidence', label: 'Confidence', dataType: 'number' },
    ],
    inputValues: { audio: null },
    outputValues: { bpm: 0, confidence: 0 },
  }),
});

nodeRegistry.register({
  type: 'audio:beat',
  label: 'Beat Detector',
  description: 'Detect beats and transients',
  category: 'audio',
  icon: '🥁',
  tags: ['audio', 'beat', 'kick', 'transient', 'onset'],
  inputs: [
    { type: 'input', id: 'audio', label: 'Audio', dataType: 'audio', required: true },
    { type: 'input', id: 'threshold', label: 'Threshold', dataType: 'number', defaultValue: 0.5 },
  ],
  outputs: [
    { type: 'output', id: 'detected', label: 'Detected', dataType: 'boolean' },
    { type: 'output', id: 'intensity', label: 'Intensity', dataType: 'number' },
    { type: 'output', id: 'trigger', label: 'Trigger', dataType: 'number' },
  ],
  createDefaultData: (): AudioNodeData => ({
    label: 'Beat Detector',
    category: 'audio',
    audioType: 'beat',
    inputs: [
      { type: 'input', id: 'audio', label: 'Audio', dataType: 'audio', required: true },
      { type: 'input', id: 'threshold', label: 'Threshold', dataType: 'number', defaultValue: 0.5 },
    ],
    outputs: [
      { type: 'output', id: 'detected', label: 'Detected', dataType: 'boolean' },
      { type: 'output', id: 'intensity', label: 'Intensity', dataType: 'number' },
      { type: 'output', id: 'trigger', label: 'Trigger', dataType: 'number' },
    ],
    inputValues: { audio: null, threshold: 0.5 },
    outputValues: { detected: false, intensity: 0, trigger: 0 },
  }),
});

// ============================================
// Logic Nodes
// ============================================

nodeRegistry.register({
  type: 'logic:compare',
  label: 'Compare',
  description: 'Compare two values',
  category: 'logic',
  icon: '⚖️',
  tags: ['compare', 'condition', 'if', 'logic'],
  inputs: [
    { type: 'input', id: 'a', label: 'A', dataType: 'number', defaultValue: 0 },
    { type: 'input', id: 'b', label: 'B', dataType: 'number', defaultValue: 0 },
  ],
  outputs: [
    { type: 'output', id: 'result', label: 'Result', dataType: 'boolean' },
  ],
  createDefaultData: (): LogicNodeData => ({
    label: 'Compare',
    category: 'logic',
    logicType: 'compare',
    compareOp: '==',
    inputs: [
      { type: 'input', id: 'a', label: 'A', dataType: 'number', defaultValue: 0 },
      { type: 'input', id: 'b', label: 'B', dataType: 'number', defaultValue: 0 },
    ],
    outputs: [{ type: 'output', id: 'result', label: 'Result', dataType: 'boolean' }],
    inputValues: { a: 0, b: 0 },
    outputValues: { result: true },
  }),
});

nodeRegistry.register({
  type: 'logic:select',
  label: 'Select',
  description: 'Select between two values based on condition',
  category: 'logic',
  icon: '🔀',
  tags: ['select', 'switch', 'condition', 'ternary', 'logic'],
  inputs: [
    { type: 'input', id: 'condition', label: 'Condition', dataType: 'boolean', defaultValue: false },
    { type: 'input', id: 'true', label: 'If True', dataType: 'any', defaultValue: 1 },
    { type: 'input', id: 'false', label: 'If False', dataType: 'any', defaultValue: 0 },
  ],
  outputs: [
    { type: 'output', id: 'result', label: 'Result', dataType: 'any' },
  ],
  createDefaultData: (): LogicNodeData => ({
    label: 'Select',
    category: 'logic',
    logicType: 'select',
    outputDataType: 'number',
    inputs: [
      { type: 'input', id: 'condition', label: 'Condition', dataType: 'boolean', defaultValue: false },
      { type: 'input', id: 'true', label: 'If True', dataType: 'any', defaultValue: 1 },
      { type: 'input', id: 'false', label: 'If False', dataType: 'any', defaultValue: 0 },
    ],
    outputs: [{ type: 'output', id: 'result', label: 'Result', dataType: 'any' }],
    inputValues: { condition: false, true: 1, false: 0 },
    outputValues: { result: 0 },
  }),
});

nodeRegistry.register({
  type: 'logic:and',
  label: 'AND',
  description: 'Logical AND operation',
  category: 'logic',
  icon: '∧',
  tags: ['and', 'logic', 'gate'],
  inputs: [
    { type: 'input', id: 'a', label: 'A', dataType: 'boolean', defaultValue: false },
    { type: 'input', id: 'b', label: 'B', dataType: 'boolean', defaultValue: false },
  ],
  outputs: [
    { type: 'output', id: 'result', label: 'Result', dataType: 'boolean' },
  ],
  createDefaultData: (): LogicNodeData => ({
    label: 'AND',
    category: 'logic',
    logicType: 'and',
    inputs: [
      { type: 'input', id: 'a', label: 'A', dataType: 'boolean', defaultValue: false },
      { type: 'input', id: 'b', label: 'B', dataType: 'boolean', defaultValue: false },
    ],
    outputs: [{ type: 'output', id: 'result', label: 'Result', dataType: 'boolean' }],
    inputValues: { a: false, b: false },
    outputValues: { result: false },
  }),
});

nodeRegistry.register({
  type: 'logic:or',
  label: 'OR',
  description: 'Logical OR operation',
  category: 'logic',
  icon: '∨',
  tags: ['or', 'logic', 'gate'],
  inputs: [
    { type: 'input', id: 'a', label: 'A', dataType: 'boolean', defaultValue: false },
    { type: 'input', id: 'b', label: 'B', dataType: 'boolean', defaultValue: false },
  ],
  outputs: [
    { type: 'output', id: 'result', label: 'Result', dataType: 'boolean' },
  ],
  createDefaultData: (): LogicNodeData => ({
    label: 'OR',
    category: 'logic',
    logicType: 'or',
    inputs: [
      { type: 'input', id: 'a', label: 'A', dataType: 'boolean', defaultValue: false },
      { type: 'input', id: 'b', label: 'B', dataType: 'boolean', defaultValue: false },
    ],
    outputs: [{ type: 'output', id: 'result', label: 'Result', dataType: 'boolean' }],
    inputValues: { a: false, b: false },
    outputValues: { result: false },
  }),
});

nodeRegistry.register({
  type: 'logic:not',
  label: 'NOT',
  description: 'Logical NOT operation',
  category: 'logic',
  icon: '¬',
  tags: ['not', 'logic', 'gate', 'invert'],
  inputs: [
    { type: 'input', id: 'value', label: 'Value', dataType: 'boolean', defaultValue: false },
  ],
  outputs: [
    { type: 'output', id: 'result', label: 'Result', dataType: 'boolean' },
  ],
  createDefaultData: (): LogicNodeData => ({
    label: 'NOT',
    category: 'logic',
    logicType: 'not',
    inputs: [
      { type: 'input', id: 'value', label: 'Value', dataType: 'boolean', defaultValue: false },
    ],
    outputs: [{ type: 'output', id: 'result', label: 'Result', dataType: 'boolean' }],
    inputValues: { value: false },
    outputValues: { result: true },
  }),
});

// ============================================
// Utility Nodes
// ============================================

nodeRegistry.register({
  type: 'utility:time',
  label: 'Time',
  description: 'Current time values',
  category: 'utility',
  icon: '⏱️',
  tags: ['time', 'clock', 'utility'],
  inputs: [],
  outputs: [
    { type: 'output', id: 'time', label: 'Time', dataType: 'number' },
    { type: 'output', id: 'delta', label: 'Delta', dataType: 'number' },
    { type: 'output', id: 'frame', label: 'Frame', dataType: 'number' },
  ],
  createDefaultData: (): UtilityNodeData => ({
    label: 'Time',
    category: 'utility',
    utilityType: 'time',
    inputs: [],
    outputs: [
      { type: 'output', id: 'time', label: 'Time', dataType: 'number' },
      { type: 'output', id: 'delta', label: 'Delta', dataType: 'number' },
      { type: 'output', id: 'frame', label: 'Frame', dataType: 'number' },
    ],
    inputValues: {},
    outputValues: { time: 0, delta: 0, frame: 0 },
  }),
});

nodeRegistry.register({
  type: 'utility:random',
  label: 'Random',
  description: 'Generate random values',
  category: 'utility',
  icon: '🎲',
  tags: ['random', 'noise', 'utility'],
  inputs: [
    { type: 'input', id: 'min', label: 'Min', dataType: 'number', defaultValue: 0 },
    { type: 'input', id: 'max', label: 'Max', dataType: 'number', defaultValue: 1 },
    { type: 'input', id: 'seed', label: 'Seed', dataType: 'number', defaultValue: 0 },
  ],
  outputs: [
    { type: 'output', id: 'value', label: 'Value', dataType: 'number' },
  ],
  createDefaultData: (): UtilityNodeData => ({
    label: 'Random',
    category: 'utility',
    utilityType: 'random',
    inputs: [
      { type: 'input', id: 'min', label: 'Min', dataType: 'number', defaultValue: 0 },
      { type: 'input', id: 'max', label: 'Max', dataType: 'number', defaultValue: 1 },
      { type: 'input', id: 'seed', label: 'Seed', dataType: 'number', defaultValue: 0 },
    ],
    outputs: [{ type: 'output', id: 'value', label: 'Value', dataType: 'number' }],
    inputValues: { min: 0, max: 1, seed: 0 },
    outputValues: { value: 0 },
  }),
});

nodeRegistry.register({
  type: 'utility:smooth',
  label: 'Smooth',
  description: 'Smooth value changes over time',
  category: 'utility',
  icon: '📉',
  tags: ['smooth', 'lerp', 'easing', 'utility'],
  inputs: [
    { type: 'input', id: 'value', label: 'Value', dataType: 'number', defaultValue: 0 },
    { type: 'input', id: 'speed', label: 'Speed', dataType: 'number', defaultValue: 0.1 },
  ],
  outputs: [
    { type: 'output', id: 'smoothed', label: 'Smoothed', dataType: 'number' },
  ],
  createDefaultData: (): UtilityNodeData => ({
    label: 'Smooth',
    category: 'utility',
    utilityType: 'smooth',
    inputs: [
      { type: 'input', id: 'value', label: 'Value', dataType: 'number', defaultValue: 0 },
      { type: 'input', id: 'speed', label: 'Speed', dataType: 'number', defaultValue: 0.1 },
    ],
    outputs: [{ type: 'output', id: 'smoothed', label: 'Smoothed', dataType: 'number' }],
    inputValues: { value: 0, speed: 0.1 },
    outputValues: { smoothed: 0 },
    _state: { lastValue: 0 },
  }),
});

nodeRegistry.register({
  type: 'utility:accumulator',
  label: 'Accumulator',
  description: 'Accumulate values over time with wrap/clamp modes',
  category: 'utility',
  icon: '📊',
  tags: ['accumulator', 'counter', 'integrate', 'sum', 'utility'],
  inputs: [
    { type: 'input', id: 'rate', label: 'Rate', dataType: 'number', defaultValue: 1 },
    { type: 'input', id: 'reset', label: 'Reset', dataType: 'boolean', defaultValue: false },
    { type: 'input', id: 'min', label: 'Min', dataType: 'number', defaultValue: 0 },
    { type: 'input', id: 'max', label: 'Max', dataType: 'number', defaultValue: 1 },
  ],
  outputs: [
    { type: 'output', id: 'value', label: 'Value', dataType: 'number' },
    { type: 'output', id: 'normalized', label: 'Normalized', dataType: 'number' },
  ],
  createDefaultData: (): UtilityNodeData => ({
    label: 'Accumulator',
    category: 'utility',
    utilityType: 'accumulator',
    accumulatorConfig: {
      rateExpression: '1',
      wrapMode: 'wrap',
      initialValue: 0,
      resetOnLimit: false,
    },
    inputs: [
      { type: 'input', id: 'rate', label: 'Rate', dataType: 'number', defaultValue: 1 },
      { type: 'input', id: 'reset', label: 'Reset', dataType: 'boolean', defaultValue: false },
      { type: 'input', id: 'min', label: 'Min', dataType: 'number', defaultValue: 0 },
      { type: 'input', id: 'max', label: 'Max', dataType: 'number', defaultValue: 1 },
    ],
    outputs: [
      { type: 'output', id: 'value', label: 'Value', dataType: 'number' },
      { type: 'output', id: 'normalized', label: 'Normalized', dataType: 'number' },
    ],
    inputValues: { rate: 1, reset: false, min: 0, max: 1 },
    outputValues: { value: 0, normalized: 0 },
    _state: { currentValue: 0, direction: 1 },
  }),
});

nodeRegistry.register({
  type: 'utility:oscillator',
  label: 'Oscillator',
  description: 'Generate oscillating waveforms',
  category: 'utility',
  icon: '〰️',
  tags: ['oscillator', 'wave', 'sine', 'lfo', 'utility'],
  inputs: [
    { type: 'input', id: 'frequency', label: 'Frequency', dataType: 'number', defaultValue: 1 },
    { type: 'input', id: 'amplitude', label: 'Amplitude', dataType: 'number', defaultValue: 1 },
    { type: 'input', id: 'offset', label: 'Offset', dataType: 'number', defaultValue: 0 },
    { type: 'input', id: 'phase', label: 'Phase', dataType: 'number', defaultValue: 0 },
  ],
  outputs: [
    { type: 'output', id: 'value', label: 'Value', dataType: 'number' },
    { type: 'output', id: 'positive', label: 'Positive', dataType: 'number' },
  ],
  createDefaultData: (): UtilityNodeData => ({
    label: 'Oscillator',
    category: 'utility',
    utilityType: 'oscillator',
    oscillatorConfig: {
      waveform: 'sine',
      frequency: 1,
      amplitude: 1,
      offset: 0,
    },
    inputs: [
      { type: 'input', id: 'frequency', label: 'Frequency', dataType: 'number', defaultValue: 1 },
      { type: 'input', id: 'amplitude', label: 'Amplitude', dataType: 'number', defaultValue: 1 },
      { type: 'input', id: 'offset', label: 'Offset', dataType: 'number', defaultValue: 0 },
      { type: 'input', id: 'phase', label: 'Phase', dataType: 'number', defaultValue: 0 },
    ],
    outputs: [
      { type: 'output', id: 'value', label: 'Value', dataType: 'number' },
      { type: 'output', id: 'positive', label: 'Positive', dataType: 'number' },
    ],
    inputValues: { frequency: 1, amplitude: 1, offset: 0, phase: 0 },
    outputValues: { value: 0, positive: 0.5 },
  }),
});

nodeRegistry.register({
  type: 'utility:expression',
  label: 'Expression',
  description: 'Custom math expression evaluator',
  category: 'utility',
  icon: '🧮',
  tags: ['expression', 'math', 'formula', 'custom', 'code', 'utility'],
  inputs: [
    { type: 'input', id: 'a', label: 'A', dataType: 'number', defaultValue: 0 },
    { type: 'input', id: 'b', label: 'B', dataType: 'number', defaultValue: 0 },
    { type: 'input', id: 'c', label: 'C', dataType: 'number', defaultValue: 0 },
    { type: 'input', id: 'd', label: 'D', dataType: 'number', defaultValue: 0 },
  ],
  outputs: [
    { type: 'output', id: 'result', label: 'Result', dataType: 'number' },
  ],
  createDefaultData: (): UtilityNodeData => ({
    label: 'Expression',
    category: 'utility',
    utilityType: 'expression',
    expression: 'a + b',
    inputs: [
      { type: 'input', id: 'a', label: 'A', dataType: 'number', defaultValue: 0 },
      { type: 'input', id: 'b', label: 'B', dataType: 'number', defaultValue: 0 },
      { type: 'input', id: 'c', label: 'C', dataType: 'number', defaultValue: 0 },
      { type: 'input', id: 'd', label: 'D', dataType: 'number', defaultValue: 0 },
    ],
    outputs: [
      { type: 'output', id: 'result', label: 'Result', dataType: 'number' },
    ],
    inputValues: { a: 0, b: 0, c: 0, d: 0 },
    outputValues: { result: 0 },
  }),
});

nodeRegistry.register({
  type: 'utility:trigger',
  label: 'Trigger',
  description: 'Detect value changes and trigger events',
  category: 'utility',
  icon: '⚡',
  tags: ['trigger', 'event', 'change', 'pulse', 'utility'],
  inputs: [
    { type: 'input', id: 'value', label: 'Value', dataType: 'number', defaultValue: 0 },
    { type: 'input', id: 'threshold', label: 'Threshold', dataType: 'number', defaultValue: 0.5 },
    { type: 'input', id: 'mode', label: 'Mode', dataType: 'number', defaultValue: 0 },
  ],
  outputs: [
    { type: 'output', id: 'triggered', label: 'Triggered', dataType: 'boolean' },
    { type: 'output', id: 'rising', label: 'Rising', dataType: 'boolean' },
    { type: 'output', id: 'falling', label: 'Falling', dataType: 'boolean' },
  ],
  createDefaultData: (): UtilityNodeData => ({
    label: 'Trigger',
    category: 'utility',
    utilityType: 'trigger',
    inputs: [
      { type: 'input', id: 'value', label: 'Value', dataType: 'number', defaultValue: 0 },
      { type: 'input', id: 'threshold', label: 'Threshold', dataType: 'number', defaultValue: 0.5 },
      { type: 'input', id: 'mode', label: 'Mode', dataType: 'number', defaultValue: 0 },
    ],
    outputs: [
      { type: 'output', id: 'triggered', label: 'Triggered', dataType: 'boolean' },
      { type: 'output', id: 'rising', label: 'Rising', dataType: 'boolean' },
      { type: 'output', id: 'falling', label: 'Falling', dataType: 'boolean' },
    ],
    inputValues: { value: 0, threshold: 0.5, mode: 0 },
    outputValues: { triggered: false, rising: false, falling: false },
    _state: { lastValue: 0, wasAbove: false },
  }),
});

nodeRegistry.register({
  type: 'utility:noise',
  label: 'Noise',
  description: 'Generate noise patterns',
  category: 'utility',
  icon: '🌫️',
  tags: ['noise', 'perlin', 'simplex', 'random', 'utility'],
  inputs: [
    { type: 'input', id: 'x', label: 'X', dataType: 'number', defaultValue: 0 },
    { type: 'input', id: 'y', label: 'Y', dataType: 'number', defaultValue: 0 },
    { type: 'input', id: 'scale', label: 'Scale', dataType: 'number', defaultValue: 1 },
    { type: 'input', id: 'octaves', label: 'Octaves', dataType: 'number', defaultValue: 1 },
  ],
  outputs: [
    { type: 'output', id: 'value', label: 'Value', dataType: 'number' },
  ],
  createDefaultData: (): UtilityNodeData => ({
    label: 'Noise',
    category: 'utility',
    utilityType: 'noise',
    inputs: [
      { type: 'input', id: 'x', label: 'X', dataType: 'number', defaultValue: 0 },
      { type: 'input', id: 'y', label: 'Y', dataType: 'number', defaultValue: 0 },
      { type: 'input', id: 'scale', label: 'Scale', dataType: 'number', defaultValue: 1 },
      { type: 'input', id: 'octaves', label: 'Octaves', dataType: 'number', defaultValue: 1 },
    ],
    outputs: [
      { type: 'output', id: 'value', label: 'Value', dataType: 'number' },
    ],
    inputValues: { x: 0, y: 0, scale: 1, octaves: 1 },
    outputValues: { value: 0 },
  }),
});

nodeRegistry.register({
  type: 'utility:delay',
  label: 'Delay',
  description: 'Delay a value by specified time',
  category: 'utility',
  icon: '⏳',
  tags: ['delay', 'buffer', 'history', 'utility'],
  inputs: [
    { type: 'input', id: 'value', label: 'Value', dataType: 'number', defaultValue: 0 },
    { type: 'input', id: 'time', label: 'Time (s)', dataType: 'number', defaultValue: 0.1 },
  ],
  outputs: [
    { type: 'output', id: 'delayed', label: 'Delayed', dataType: 'number' },
  ],
  createDefaultData: (): UtilityNodeData => ({
    label: 'Delay',
    category: 'utility',
    utilityType: 'delay',
    inputs: [
      { type: 'input', id: 'value', label: 'Value', dataType: 'number', defaultValue: 0 },
      { type: 'input', id: 'time', label: 'Time (s)', dataType: 'number', defaultValue: 0.1 },
    ],
    outputs: [
      { type: 'output', id: 'delayed', label: 'Delayed', dataType: 'number' },
    ],
    inputValues: { value: 0, time: 0.1 },
    outputValues: { delayed: 0 },
    _state: { buffer: [], lastTime: 0 },
  }),
});

// ============================================
// Output Nodes
// ============================================

nodeRegistry.register({
  type: 'output:canvas',
  label: 'Canvas Output',
  description: 'Render to canvas element',
  category: 'output',
  icon: '📺',
  tags: ['output', 'canvas', 'render', 'display', 'preview'],
  inputs: [
    { type: 'input', id: 'image', label: 'Image', dataType: 'image', required: true },
    { type: 'input', id: 'scale', label: 'Scale', dataType: 'number', defaultValue: 1 },
  ],
  outputs: [
    { type: 'output', id: 'width', label: 'Width', dataType: 'number' },
    { type: 'output', id: 'height', label: 'Height', dataType: 'number' },
  ],
  createDefaultData: (): OutputNodeData => ({
    label: 'Canvas Output',
    category: 'output',
    outputType: 'canvas',
    canvasId: 'main',
    renderConfig: {
      scale: 1,
      antialiasing: true,
      fps: 60,
    },
    inputs: [
      { type: 'input', id: 'image', label: 'Image', dataType: 'image', required: true },
      { type: 'input', id: 'scale', label: 'Scale', dataType: 'number', defaultValue: 1 },
    ],
    outputs: [
      { type: 'output', id: 'width', label: 'Width', dataType: 'number' },
      { type: 'output', id: 'height', label: 'Height', dataType: 'number' },
    ],
    inputValues: { image: null, scale: 1 },
    outputValues: { width: 0, height: 0 },
  }),
});

nodeRegistry.register({
  type: 'output:window',
  label: 'Window Output',
  description: 'Render to a separate window',
  category: 'output',
  icon: '🖥️',
  tags: ['output', 'window', 'render', 'display', 'fullscreen', 'monitor'],
  inputs: [
    { type: 'input', id: 'image', label: 'Image', dataType: 'image', required: true },
    { type: 'input', id: 'scale', label: 'Render Scale', dataType: 'number', defaultValue: 1 },
  ],
  outputs: [
    { type: 'output', id: 'width', label: 'Width', dataType: 'number' },
    { type: 'output', id: 'height', label: 'Height', dataType: 'number' },
    { type: 'output', id: 'fps', label: 'FPS', dataType: 'number' },
  ],
  createDefaultData: (): OutputNodeData => ({
    label: 'Window Output',
    category: 'output',
    outputType: 'window',
    windowConfig: {
      title: 'Visoic Output',
      width: 1920,
      height: 1080,
      fullscreen: false,
      monitor: 0,
    },
    renderConfig: {
      scale: 1,
      antialiasing: true,
      fps: 60,
    },
    inputs: [
      { type: 'input', id: 'image', label: 'Image', dataType: 'image', required: true },
      { type: 'input', id: 'scale', label: 'Render Scale', dataType: 'number', defaultValue: 1 },
    ],
    outputs: [
      { type: 'output', id: 'width', label: 'Width', dataType: 'number' },
      { type: 'output', id: 'height', label: 'Height', dataType: 'number' },
      { type: 'output', id: 'fps', label: 'FPS', dataType: 'number' },
    ],
    inputValues: { image: null, scale: 1 },
    outputValues: { width: 1920, height: 1080, fps: 60 },
  }),
});

nodeRegistry.register({
  type: 'output:ndi',
  label: 'NDI Output',
  description: 'Stream output via NDI protocol',
  category: 'output',
  icon: '📡',
  tags: ['output', 'ndi', 'stream', 'network', 'broadcast'],
  inputs: [
    { type: 'input', id: 'image', label: 'Image', dataType: 'image', required: true },
  ],
  outputs: [
    { type: 'output', id: 'connected', label: 'Connected', dataType: 'boolean' },
    { type: 'output', id: 'fps', label: 'FPS', dataType: 'number' },
  ],
  createDefaultData: (): OutputNodeData => ({
    label: 'NDI Output',
    category: 'output',
    outputType: 'ndi',
    renderConfig: {
      scale: 1,
      fps: 60,
    },
    inputs: [
      { type: 'input', id: 'image', label: 'Image', dataType: 'image', required: true },
    ],
    outputs: [
      { type: 'output', id: 'connected', label: 'Connected', dataType: 'boolean' },
      { type: 'output', id: 'fps', label: 'FPS', dataType: 'number' },
    ],
    inputValues: { image: null },
    outputValues: { connected: false, fps: 0 },
  }),
});

nodeRegistry.register({
  type: 'output:spout',
  label: 'Spout Output',
  description: 'Share texture via Spout (Windows GPU sharing)',
  category: 'output',
  icon: '🔗',
  tags: ['output', 'spout', 'share', 'texture', 'gpu', 'resolume', 'touchdesigner'],
  inputs: [
    { type: 'input', id: 'image', label: 'Image', dataType: 'image', required: true },
  ],
  outputs: [
    { type: 'output', id: 'active', label: 'Active', dataType: 'boolean' },
    { type: 'output', id: 'receivers', label: 'Receivers', dataType: 'number' },
    { type: 'output', id: 'fps', label: 'FPS', dataType: 'number' },
  ],
  createDefaultData: (): OutputNodeData => ({
    label: 'Spout Output',
    category: 'output',
    outputType: 'spout',
    renderConfig: {
      scale: 1,
      fps: 60,
    },
    inputs: [
      { type: 'input', id: 'image', label: 'Image', dataType: 'image', required: true },
    ],
    outputs: [
      { type: 'output', id: 'active', label: 'Active', dataType: 'boolean' },
      { type: 'output', id: 'receivers', label: 'Receivers', dataType: 'number' },
      { type: 'output', id: 'fps', label: 'FPS', dataType: 'number' },
    ],
    inputValues: { image: null },
    outputValues: { active: false, receivers: 0, fps: 0 },
  }),
});

export { NodeRegistry };
