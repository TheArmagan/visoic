// ============================================
// Visoic Node Types - Svelte Flow Mapping
// ============================================

import type { Component } from 'svelte';
// @ts-ignore
import ValueNode from './ValueNode.svelte';
// @ts-ignore
import MathNode from './MathNode.svelte';
// @ts-ignore
import AudioNode from './AudioNode.svelte';
// @ts-ignore
import LogicNode from './LogicNode.svelte';
// @ts-ignore
import UtilityNode from './UtilityNode.svelte';
// @ts-ignore
import ShaderNode from './ShaderNode.svelte';
// @ts-ignore
import BaseNode from './BaseNode.svelte';
// @ts-ignore
import OutputNode from './OutputNode.svelte';
// @ts-ignore
import RenderContextNode from './RenderContextNode.svelte';

// Define our own node types mapping (SvelteFlow compatible)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type NodeComponent = Component<any>;
type NodeTypesMap = Record<string, NodeComponent>;

// Map node type prefixes to their components
export const nodeTypes: NodeTypesMap = {
  // Value nodes
  'value:number': ValueNode,
  'value:boolean': ValueNode,
  'value:color': ValueNode,
  'value:vec2': ValueNode,
  'value:vec3': ValueNode,

  // Math nodes
  'math:add': MathNode,
  'math:subtract': MathNode,
  'math:multiply': MathNode,
  'math:divide': MathNode,
  'math:clamp': MathNode,
  'math:lerp': MathNode,
  'math:map': MathNode,
  'math:sin': MathNode,
  'math:cos': MathNode,

  // Audio nodes
  'audio:device': AudioNode,
  'audio:analyzer': AudioNode,
  'audio:normalizer': AudioNode,
  'audio:fft-band': AudioNode,
  'audio:frequency-range': AudioNode,
  'audio:amplitude': AudioNode,
  'audio:rms': AudioNode,
  'audio:peak': AudioNode,
  'audio:bpm': AudioNode,
  'audio:beat': AudioNode,

  // Logic nodes
  'logic:compare': LogicNode,
  'logic:select': LogicNode,
  'logic:and': LogicNode,
  'logic:or': LogicNode,
  'logic:not': LogicNode,

  // Utility nodes
  'utility:time': UtilityNode,
  'utility:random': UtilityNode,
  'utility:smooth': UtilityNode,
  'utility:accumulator': UtilityNode,
  'utility:oscillator': UtilityNode,
  'utility:expression': UtilityNode,
  'utility:trigger': UtilityNode,
  'utility:noise': UtilityNode,
  'utility:delay': UtilityNode,

  // Output nodes
  'output:canvas': OutputNode,
  'output:window': OutputNode,
  'output:ndi': OutputNode,
  'output:spout': OutputNode,
  'output:preview': OutputNode,

  // Render Context node
  'render:context': RenderContextNode,

  // Shader nodes - built-in effects
  'shader:Blur': ShaderNode,
  'shader:Brightness': ShaderNode,
  'shader:ColorCorrection': ShaderNode,
  'shader:Pixelate': ShaderNode,
  'shader:Invert': ShaderNode,
  'shader:Grayscale': ShaderNode,
  'shader:Vignette': ShaderNode,
  'shader:ChromaticAberration': ShaderNode,
  'shader:NoiseGenerator': ShaderNode,
  'shader:SolidColor': ShaderNode,
  'shader:Gradient': ShaderNode,
  'shader:Blend': ShaderNode,
};

// Dynamic node type getter for shader nodes and others
export function getNodeComponent(type: string): NodeComponent {
  // Check if we have a direct mapping
  if (type in nodeTypes) {
    return nodeTypes[type];
  }

  // Check prefix-based mapping
  const prefix = type.split(':')[0];
  switch (prefix) {
    case 'value':
      return ValueNode;
    case 'math':
      return MathNode;
    case 'audio':
      return AudioNode;
    case 'logic':
      return LogicNode;
    case 'utility':
      return UtilityNode;
    case 'output':
      return OutputNode;
    case 'render':
      return RenderContextNode;
    case 'shader':
      // Check if it's a render context specifically
      if (type === 'render:context') {
        return RenderContextNode;
      }
      return ShaderNode;
    default:
      return BaseNode;
  }
}

/**
 * Register a node type dynamically
 * This is called when ISF shaders are loaded to add them to the nodeTypes map
 */
export function registerNodeType(type: string, component?: NodeComponent): void {
  if (!(type in nodeTypes)) {
    nodeTypes[type] = component ?? getNodeComponent(type);
  }
}

/**
 * Ensure all node types from registry are registered in nodeTypes
 */
export function syncNodeTypesWithRegistry(types: string[]): void {
  for (const type of types) {
    registerNodeType(type);
  }
}

// Create a Proxy to handle dynamic node types (ISF shaders, etc.)
// SvelteFlow accesses nodeTypes directly, so we need this proxy
const nodeTypesProxy = new Proxy(nodeTypes, {
  get(target, prop: string) {
    if (prop in target) {
      return target[prop];
    }
    // Handle dynamic types by prefix - also register them
    const component = getNodeComponent(prop);
    target[prop] = component; // Cache it
    return component;
  },
  has(target, prop: string) {
    if (prop in target) return true;
    // All prefixed types are valid
    const prefix = prop.split(':')[0];
    return ['value', 'math', 'audio', 'logic', 'utility', 'output', 'render', 'shader'].includes(prefix);
  },
});

export { nodeTypesProxy as dynamicNodeTypes };
