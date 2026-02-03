// ============================================
// Visoic Node System - Shader Node Registry
// ============================================

import { nodeRegistry } from './registry';
import { isfLoader, type ISFShaderInfo } from '../shader';
import type {
  NodeDefinition,
  ShaderNodeData,
  RenderContextNodeData,
  InputHandle,
  OutputHandle,
  DataType,
} from './types';

// Re-export for external use
export { isfTypeToDataType };

// Map ISF uniform types to our data types
function isfTypeToDataType(isfType: string): DataType {
  switch (isfType.toLowerCase()) {
    case 'float':
    case 'int':
    case 'long':
      return 'number';
    case 'bool':
      return 'boolean';
    case 'vec2':
    case 'point2d':
      return 'vec2';
    case 'vec3':
      return 'vec3';
    case 'vec4':
      return 'vec4';
    case 'color':
      return 'color';
    case 'image':
      return 'image';
    default:
      return 'any';
  }
}

interface ISFInput {
  NAME: string;
  TYPE: string;
  DEFAULT?: number | number[] | boolean;
  MIN?: number;
  MAX?: number;
  LABEL?: string;
  VALUES?: number[];
  LABELS?: string[];
}

interface ISFMetadata {
  DESCRIPTION?: string;
  CREDIT?: string;
  CATEGORIES?: string[];
  INPUTS?: ISFInput[];
}

/**
 * Register a shader as a node type
 */
export function registerShaderNode(
  shaderType: string,
  metadata: ISFMetadata,
  fragmentSource: string,
  vertexSource?: string
): NodeDefinition {
  const inputs: InputHandle[] = [
    // Always add renderContext as first input
    { type: 'input', id: 'renderContext', label: 'Render Context', dataType: 'renderContext', required: true },
  ];
  const outputs: OutputHandle[] = [
    { type: 'output', id: 'output', label: 'Output', dataType: 'image' },
  ];

  // Convert ISF inputs to node inputs
  if (metadata.INPUTS) {
    for (const input of metadata.INPUTS) {
      const dataType = isfTypeToDataType(input.TYPE);

      // For long type with VALUES, compute min/max from values array
      let minVal = input.MIN;
      let maxVal = input.MAX;
      if (input.TYPE.toLowerCase() === 'long' && input.VALUES && input.VALUES.length > 0) {
        minVal = Math.min(...input.VALUES);
        maxVal = Math.max(...input.VALUES);
      }

      inputs.push({
        type: 'input',
        id: input.NAME,
        label: input.LABEL ?? input.NAME,
        dataType,
        defaultValue: input.DEFAULT ?? getDefaultForType(dataType),
        min: minVal,
        max: maxVal,
        values: input.VALUES,
        labels: input.LABELS,
      });
    }
  }

  const definition: NodeDefinition = {
    type: `shader:${shaderType}`,
    label: shaderType,
    description: metadata.DESCRIPTION ?? `${shaderType} shader effect`,
    category: 'shader',
    icon: '🎨',
    tags: [
      'shader',
      'effect',
      shaderType.toLowerCase(),
      ...(metadata.CATEGORIES ?? []).map((c) => c.toLowerCase()),
    ],
    inputs,
    outputs,
    createDefaultData: (): ShaderNodeData => ({
      label: shaderType,
      category: 'shader',
      shaderType,
      fragmentSource,
      vertexSource,
      metadata: {
        description: metadata.DESCRIPTION,
        credit: metadata.CREDIT,
        categories: metadata.CATEGORIES,
      },
      inputs: [...inputs],
      outputs: [...outputs],
      inputValues: Object.fromEntries(
        inputs.map((i) => [i.id, i.defaultValue])
      ),
      outputValues: { output: null },
      // Layer settings
      layerOrder: 0,
      blendMode: 'normal',
      opacity: 1,
      enabled: true,
    }),
  };

  nodeRegistry.register(definition);
  return definition;
}

function getDefaultForType(type: DataType): unknown {
  switch (type) {
    case 'number':
      return 0;
    case 'boolean':
      return false;
    case 'vec2':
      return [0, 0];
    case 'vec3':
      return [0, 0, 0];
    case 'vec4':
      return [0, 0, 0, 0];
    case 'color':
      return [1, 1, 1, 1];
    default:
      return null;
  }
}

// ============================================
// ISF Shader Parsing
// ============================================

interface ParsedISFMetadata {
  DESCRIPTION?: string;
  CREDIT?: string;
  CATEGORIES?: string[];
  INPUTS?: ISFInput[];
  PASSES?: Array<{ TARGET?: string; WIDTH?: string; HEIGHT?: string }>;
  PERSISTENT_BUFFERS?: string[];
  VSN?: string;
  ISFVSN?: string;
}

/**
 * Parse ISF metadata from shader source
 * ISF uses a JSON block at the start of the file wrapped in comments
 */
function parseISFMetadata(source: string): ParsedISFMetadata | null {
  // ISF metadata is in a comment block at the start: /* { ... } */
  const match = source.match(/\/\*\s*([\s\S]*?)\s*\*\//);
  if (!match) return null;

  try {
    // The content might be JSON
    const jsonStr = match[1].trim();
    return JSON.parse(jsonStr);
  } catch {
    return null;
  }
}

/**
 * Register an ISF shader as a node
 */
function registerISFShaderNode(
  info: ISFShaderInfo,
  fragmentSource: string,
  vertexSource?: string | null
): NodeDefinition | null {
  const metadata = parseISFMetadata(fragmentSource);

  const inputs: InputHandle[] = [
    // Always add renderContext as first input
    { type: 'input', id: 'renderContext', label: 'Render Context', dataType: 'renderContext', required: true },
  ];
  const outputs: OutputHandle[] = [
    { type: 'output', id: 'output', label: 'Output', dataType: 'image' },
  ];

  // Convert ISF inputs to node inputs
  if (metadata?.INPUTS) {
    for (const input of metadata.INPUTS) {
      const dataType = isfTypeToDataType(input.TYPE);

      // For long type with VALUES, compute min/max from values array
      let minVal = input.MIN;
      let maxVal = input.MAX;
      if (input.TYPE.toLowerCase() === 'long' && input.VALUES && input.VALUES.length > 0) {
        minVal = Math.min(...input.VALUES);
        maxVal = Math.max(...input.VALUES);
      }

      inputs.push({
        type: 'input',
        id: input.NAME,
        label: input.LABEL ?? input.NAME,
        dataType,
        defaultValue: input.DEFAULT ?? getDefaultForType(dataType),
        min: minVal,
        max: maxVal,
        values: input.VALUES,
        labels: input.LABELS,
      });
    }
  } else {
    // Default input for shaders without metadata
    inputs.push({
      type: 'input',
      id: 'inputImage',
      label: 'Input',
      dataType: 'image',
    });
  }

  // Create a sanitized type name
  const typeName = info.name.replace(/[^a-zA-Z0-9]/g, '_');
  const fullType = `shader:isf:${info.category}:${typeName}`;

  const definition: NodeDefinition = {
    type: fullType,
    label: info.name,
    description: metadata?.DESCRIPTION ?? `${info.name} ISF shader`,
    category: 'shader',
    icon: '🎨',
    isfId: info.id, // Store ISF shader ID for validation filtering
    tags: [
      'shader',
      'isf',
      'effect',
      info.name.toLowerCase(),
      info.category.toLowerCase(),
      ...(metadata?.CATEGORIES ?? []).map((c) => c.toLowerCase()),
    ],
    inputs,
    outputs,
    createDefaultData: (): ShaderNodeData => ({
      label: info.name,
      category: 'shader',
      shaderType: fullType,
      fragmentSource,
      vertexSource: vertexSource ?? undefined,
      metadata: {
        description: metadata?.DESCRIPTION,
        credit: metadata?.CREDIT,
        categories: metadata?.CATEGORIES ?? [info.category],
        isfId: info.id,
      },
      inputs: [...inputs],
      outputs: [...outputs],
      inputValues: Object.fromEntries(
        inputs.map((i) => [i.id, i.defaultValue])
      ),
      outputValues: { output: null },
      // Layer settings
      layerOrder: 0,
      blendMode: 'normal',
      opacity: 1,
      enabled: true,
    }),
  };

  nodeRegistry.register(definition);
  return definition;
}

// ============================================
// ISF Shader Loading
// ============================================

let isfShadersLoaded = false;
let isfLoadPromise: Promise<void> | null = null;

/**
 * Load and register all ISF shaders from the file system
 */
export async function loadISFShaders(): Promise<number> {
  if (isfShadersLoaded) return 0;

  // Prevent multiple simultaneous loads
  if (isfLoadPromise) {
    await isfLoadPromise;
    return 0;
  }

  isfLoadPromise = (async () => {
    try {
      // Check if ISF loader is available
      if (!isfLoader.isAvailable()) {
        console.warn('[ShaderRegistry] ISF loader not available - native API not ready');
        return;
      }

      // Get all ISF shaders
      const shaders = await isfLoader.getAllShaders();
      console.log(`[ShaderRegistry] Found ${shaders.length} ISF shaders`);

      let registered = 0;

      // Register each shader
      for (const info of shaders) {
        try {
          const source = await isfLoader.loadShader(info.id);
          if (source) {
            const def = registerISFShaderNode(info, source.fragment, source.vertex);
            if (def) {
              registered++;
            }
          }
        } catch (err) {
          console.warn(`[ShaderRegistry] Failed to load shader ${info.id}:`, err);
        }
      }

      console.log(`[ShaderRegistry] Registered ${registered} ISF shader nodes`);
      isfShadersLoaded = true;
    } catch (err) {
      console.error('[ShaderRegistry] Failed to load ISF shaders:', err);
    }
  })();

  await isfLoadPromise;
  isfLoadPromise = null;

  return nodeRegistry.getAll().filter(d => d.type.startsWith('shader:isf:')).length;
}

/**
 * Check if ISF shaders have been loaded
 */
export function areISFShadersLoaded(): boolean {
  return isfShadersLoaded;
}

// ============================================
// Render Context Node
// ============================================

const renderContextInputs: InputHandle[] = [
  { type: 'input', id: 'width', label: 'Width', dataType: 'number', defaultValue: 1920 },
  { type: 'input', id: 'height', label: 'Height', dataType: 'number', defaultValue: 1080 },
  { type: 'input', id: 'fpsLimit', label: 'FPS Limit', dataType: 'number', defaultValue: 60 },
];

const renderContextOutputs: OutputHandle[] = [
  { type: 'output', id: 'context', label: 'Context', dataType: 'renderContext' },
  { type: 'output', id: 'image', label: 'Image', dataType: 'image' },
];

const renderContextDefinition: NodeDefinition = {
  type: 'render:context',
  label: 'Render Context',
  description: 'Creates a WebGPU render context for compositing shader layers',
  category: 'renderer',
  icon: '🖼️',
  tags: ['render', 'context', 'canvas', 'output', 'webgpu'],
  inputs: renderContextInputs,
  outputs: renderContextOutputs,
  createDefaultData: (): RenderContextNodeData => ({
    label: 'Render Context',
    category: 'renderer',
    shaderType: 'render:context',
    width: 1920,
    height: 1080,
    fpsLimit: 60,
    isRunning: false,
    currentFps: 0,
    backgroundColor: [0, 0, 0, 1],
    inputs: [...renderContextInputs],
    outputs: [...renderContextOutputs],
    inputValues: {
      width: 1920,
      height: 1080,
      fpsLimit: 60,
    },
    outputValues: {
      context: null,
      image: null,
    },
  }),
};

nodeRegistry.register(renderContextDefinition);

