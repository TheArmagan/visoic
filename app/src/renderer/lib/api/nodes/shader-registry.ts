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

      inputs.push({
        type: 'input',
        id: input.NAME,
        label: input.LABEL ?? input.NAME,
        dataType,
        defaultValue: input.DEFAULT ?? getDefaultForType(dataType),
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

      inputs.push({
        type: 'input',
        id: input.NAME,
        label: input.LABEL ?? input.NAME,
        dataType,
        defaultValue: input.DEFAULT ?? getDefaultForType(dataType),
        min: input.MIN,
        max: input.MAX,
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
// Register Built-in Shader Nodes
// ============================================

// Blur shader
registerShaderNode(
  'Blur',
  {
    DESCRIPTION: 'Gaussian blur effect',
    CATEGORIES: ['Effects', 'Blur'],
    INPUTS: [
      { NAME: 'inputImage', TYPE: 'image', LABEL: 'Input' },
      { NAME: 'blurAmount', TYPE: 'float', DEFAULT: 10, MIN: 0, MAX: 100, LABEL: 'Amount' },
    ],
  },
  `
    precision highp float;
    varying vec2 vUv;
    uniform sampler2D inputImage;
    uniform float blurAmount;
    uniform vec2 resolution;
    
    void main() {
      vec2 uv = vUv;
      vec4 color = vec4(0.0);
      float total = 0.0;
      float blur = blurAmount / resolution.x;
      
      for (float x = -4.0; x <= 4.0; x++) {
        for (float y = -4.0; y <= 4.0; y++) {
          vec2 offset = vec2(x, y) * blur;
          color += texture2D(inputImage, uv + offset);
          total += 1.0;
        }
      }
      
      gl_FragColor = color / total;
    }
  `
);

// Brightness/Contrast shader
registerShaderNode(
  'Brightness',
  {
    DESCRIPTION: 'Adjust brightness and contrast',
    CATEGORIES: ['Effects', 'Color'],
    INPUTS: [
      { NAME: 'inputImage', TYPE: 'image', LABEL: 'Input' },
      { NAME: 'brightness', TYPE: 'float', DEFAULT: 0, MIN: -1, MAX: 1, LABEL: 'Brightness' },
      { NAME: 'contrast', TYPE: 'float', DEFAULT: 1, MIN: 0, MAX: 2, LABEL: 'Contrast' },
    ],
  },
  `
    precision highp float;
    varying vec2 vUv;
    uniform sampler2D inputImage;
    uniform float brightness;
    uniform float contrast;
    
    void main() {
      vec4 color = texture2D(inputImage, vUv);
      color.rgb += brightness;
      color.rgb = (color.rgb - 0.5) * contrast + 0.5;
      gl_FragColor = color;
    }
  `
);

// Color Correction shader
registerShaderNode(
  'ColorCorrection',
  {
    DESCRIPTION: 'RGB color correction',
    CATEGORIES: ['Effects', 'Color'],
    INPUTS: [
      { NAME: 'inputImage', TYPE: 'image', LABEL: 'Input' },
      { NAME: 'redMult', TYPE: 'float', DEFAULT: 1, MIN: 0, MAX: 2, LABEL: 'Red' },
      { NAME: 'greenMult', TYPE: 'float', DEFAULT: 1, MIN: 0, MAX: 2, LABEL: 'Green' },
      { NAME: 'blueMult', TYPE: 'float', DEFAULT: 1, MIN: 0, MAX: 2, LABEL: 'Blue' },
    ],
  },
  `
    precision highp float;
    varying vec2 vUv;
    uniform sampler2D inputImage;
    uniform float redMult;
    uniform float greenMult;
    uniform float blueMult;
    
    void main() {
      vec4 color = texture2D(inputImage, vUv);
      color.r *= redMult;
      color.g *= greenMult;
      color.b *= blueMult;
      gl_FragColor = color;
    }
  `
);

// Pixelate shader
registerShaderNode(
  'Pixelate',
  {
    DESCRIPTION: 'Pixelation effect',
    CATEGORIES: ['Effects', 'Stylize'],
    INPUTS: [
      { NAME: 'inputImage', TYPE: 'image', LABEL: 'Input' },
      { NAME: 'pixelSize', TYPE: 'float', DEFAULT: 10, MIN: 1, MAX: 100, LABEL: 'Pixel Size' },
    ],
  },
  `
    precision highp float;
    varying vec2 vUv;
    uniform sampler2D inputImage;
    uniform float pixelSize;
    uniform vec2 resolution;
    
    void main() {
      vec2 uv = vUv;
      vec2 pixels = resolution / pixelSize;
      uv = floor(uv * pixels) / pixels;
      gl_FragColor = texture2D(inputImage, uv);
    }
  `
);

// Invert shader
registerShaderNode(
  'Invert',
  {
    DESCRIPTION: 'Invert colors',
    CATEGORIES: ['Effects', 'Color'],
    INPUTS: [
      { NAME: 'inputImage', TYPE: 'image', LABEL: 'Input' },
      { NAME: 'amount', TYPE: 'float', DEFAULT: 1, MIN: 0, MAX: 1, LABEL: 'Amount' },
    ],
  },
  `
    precision highp float;
    varying vec2 vUv;
    uniform sampler2D inputImage;
    uniform float amount;
    
    void main() {
      vec4 color = texture2D(inputImage, vUv);
      vec3 inverted = 1.0 - color.rgb;
      color.rgb = mix(color.rgb, inverted, amount);
      gl_FragColor = color;
    }
  `
);

// Grayscale shader
registerShaderNode(
  'Grayscale',
  {
    DESCRIPTION: 'Convert to grayscale',
    CATEGORIES: ['Effects', 'Color'],
    INPUTS: [
      { NAME: 'inputImage', TYPE: 'image', LABEL: 'Input' },
      { NAME: 'amount', TYPE: 'float', DEFAULT: 1, MIN: 0, MAX: 1, LABEL: 'Amount' },
    ],
  },
  `
    precision highp float;
    varying vec2 vUv;
    uniform sampler2D inputImage;
    uniform float amount;
    
    void main() {
      vec4 color = texture2D(inputImage, vUv);
      float gray = dot(color.rgb, vec3(0.299, 0.587, 0.114));
      color.rgb = mix(color.rgb, vec3(gray), amount);
      gl_FragColor = color;
    }
  `
);

// Vignette shader
registerShaderNode(
  'Vignette',
  {
    DESCRIPTION: 'Vignette effect',
    CATEGORIES: ['Effects', 'Stylize'],
    INPUTS: [
      { NAME: 'inputImage', TYPE: 'image', LABEL: 'Input' },
      { NAME: 'amount', TYPE: 'float', DEFAULT: 0.5, MIN: 0, MAX: 1, LABEL: 'Amount' },
      { NAME: 'softness', TYPE: 'float', DEFAULT: 0.5, MIN: 0, MAX: 1, LABEL: 'Softness' },
    ],
  },
  `
    precision highp float;
    varying vec2 vUv;
    uniform sampler2D inputImage;
    uniform float amount;
    uniform float softness;
    
    void main() {
      vec4 color = texture2D(inputImage, vUv);
      vec2 center = vUv - 0.5;
      float dist = length(center);
      float vignette = smoothstep(0.5 - softness, 0.5, dist * amount);
      color.rgb *= 1.0 - vignette;
      gl_FragColor = color;
    }
  `
);

// Chromatic Aberration shader
registerShaderNode(
  'ChromaticAberration',
  {
    DESCRIPTION: 'RGB channel separation effect',
    CATEGORIES: ['Effects', 'Distort'],
    INPUTS: [
      { NAME: 'inputImage', TYPE: 'image', LABEL: 'Input' },
      { NAME: 'amount', TYPE: 'float', DEFAULT: 0.01, MIN: 0, MAX: 0.1, LABEL: 'Amount' },
    ],
  },
  `
    precision highp float;
    varying vec2 vUv;
    uniform sampler2D inputImage;
    uniform float amount;
    
    void main() {
      vec2 uv = vUv;
      vec2 center = uv - 0.5;
      
      float r = texture2D(inputImage, uv + center * amount).r;
      float g = texture2D(inputImage, uv).g;
      float b = texture2D(inputImage, uv - center * amount).b;
      
      gl_FragColor = vec4(r, g, b, 1.0);
    }
  `
);

// Noise Generator shader
registerShaderNode(
  'NoiseGenerator',
  {
    DESCRIPTION: 'Generate noise pattern',
    CATEGORIES: ['Generators'],
    INPUTS: [
      { NAME: 'scale', TYPE: 'float', DEFAULT: 10, MIN: 0.1, MAX: 100, LABEL: 'Scale' },
      { NAME: 'speed', TYPE: 'float', DEFAULT: 1, MIN: 0, MAX: 10, LABEL: 'Speed' },
      { NAME: 'time', TYPE: 'float', DEFAULT: 0, LABEL: 'Time' },
    ],
  },
  `
    precision highp float;
    varying vec2 vUv;
    uniform float scale;
    uniform float speed;
    uniform float time;
    
    float random(vec2 st) {
      return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
    }
    
    void main() {
      vec2 uv = vUv * scale;
      float n = random(floor(uv) + time * speed);
      gl_FragColor = vec4(vec3(n), 1.0);
    }
  `
);

// Solid Color Generator
registerShaderNode(
  'SolidColor',
  {
    DESCRIPTION: 'Generate solid color',
    CATEGORIES: ['Generators'],
    INPUTS: [
      { NAME: 'color', TYPE: 'color', DEFAULT: [1, 1, 1, 1], LABEL: 'Color' },
    ],
  },
  `
    precision highp float;
    varying vec2 vUv;
    uniform vec4 color;
    
    void main() {
      gl_FragColor = color;
    }
  `
);

// Gradient Generator
registerShaderNode(
  'Gradient',
  {
    DESCRIPTION: 'Generate gradient',
    CATEGORIES: ['Generators'],
    INPUTS: [
      { NAME: 'color1', TYPE: 'color', DEFAULT: [0, 0, 0, 1], LABEL: 'Color 1' },
      { NAME: 'color2', TYPE: 'color', DEFAULT: [1, 1, 1, 1], LABEL: 'Color 2' },
      { NAME: 'angle', TYPE: 'float', DEFAULT: 0, MIN: 0, MAX: 360, LABEL: 'Angle' },
    ],
  },
  `
    precision highp float;
    varying vec2 vUv;
    uniform vec4 color1;
    uniform vec4 color2;
    uniform float angle;
    
    void main() {
      float rad = angle * 3.14159 / 180.0;
      vec2 dir = vec2(cos(rad), sin(rad));
      float t = dot(vUv - 0.5, dir) + 0.5;
      gl_FragColor = mix(color1, color2, t);
    }
  `
);

// Blend shader
registerShaderNode(
  'Blend',
  {
    DESCRIPTION: 'Blend two images together',
    CATEGORIES: ['Compositing'],
    INPUTS: [
      { NAME: 'inputImage1', TYPE: 'image', LABEL: 'Image 1' },
      { NAME: 'inputImage2', TYPE: 'image', LABEL: 'Image 2' },
      { NAME: 'mix', TYPE: 'float', DEFAULT: 0.5, MIN: 0, MAX: 1, LABEL: 'Mix' },
    ],
  },
  `
    precision highp float;
    varying vec2 vUv;
    uniform sampler2D inputImage1;
    uniform sampler2D inputImage2;
    uniform float mix;
    
    void main() {
      vec4 color1 = texture2D(inputImage1, vUv);
      vec4 color2 = texture2D(inputImage2, vUv);
      gl_FragColor = mix(color1, color2, mix);
    }
  `
);

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
  category: 'shader',
  icon: '🖼️',
  tags: ['render', 'context', 'canvas', 'output', 'webgpu'],
  inputs: renderContextInputs,
  outputs: renderContextOutputs,
  createDefaultData: (): RenderContextNodeData => ({
    label: 'Render Context',
    category: 'shader',
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

