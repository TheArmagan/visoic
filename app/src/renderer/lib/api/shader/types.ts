// ============================================
// Visoic Shader API - Type Definitions
// ============================================

/**
 * Supported uniform types for ISF shaders
 */
export type UniformType =
  | 'float'
  | 'int'
  | 'long'
  | 'bool'
  | 'vec2'
  | 'vec3'
  | 'vec4'
  | 'color'
  | 'point2D'
  | 'image'
  | 'event';

/**
 * ISF Input definition from shader metadata
 */
export interface ISFInput {
  NAME: string;
  TYPE: UniformType;
  DEFAULT?: number | number[] | boolean;
  MIN?: number;
  MAX?: number;
  LABEL?: string;
  LABELS?: string[];
  VALUES?: number[];
  IDENTITY?: number;
}

/**
 * ISF Pass definition for multi-pass rendering
 */
export interface ISFPass {
  TARGET?: string;
  WIDTH?: string | number;
  HEIGHT?: string | number;
  FLOAT?: boolean;
  PERSISTENT?: boolean;
  persistent?: boolean;
}

/**
 * ISF Shader metadata extracted from JSON header
 */
export interface ISFMetadata {
  DESCRIPTION?: string;
  CREDIT?: string;
  CATEGORIES?: string[];
  INPUTS?: ISFInput[];
  PASSES?: ISFPass[];
  IMPORTED?: Record<string, { PATH: string }>;
  PERSISTENT_BUFFERS?: string[];
  ISFVSN?: string | number;
}

/**
 * Parsed pass information
 */
export interface ParsedPass {
  target?: string;
  width: string | number;
  height: string | number;
  float: boolean;
  persistent: boolean;
}

/**
 * Uniform value type
 */
export type UniformValue =
  | number
  | boolean
  | number[]
  | Float32Array
  | HTMLImageElement
  | HTMLVideoElement
  | HTMLCanvasElement
  | ImageBitmap
  | null;

/**
 * Uniform definition with metadata
 */
export interface UniformDefinition {
  name: string;
  type: UniformType;
  value: UniformValue;
  min?: number;
  max?: number;
  default?: UniformValue;
  label?: string;
  labels?: string[];
  values?: number[];
}

/**
 * Shader source configuration
 */
export interface ShaderSource {
  fragment: string;
  vertex?: string;
}

/**
 * Render context configuration
 */
export interface RenderContextConfig {
  id: string;
  canvas: HTMLCanvasElement | OffscreenCanvas;
  width?: number;
  height?: number;
  pixelRatio?: number;
  fpsLimit?: number;
  antialias?: boolean;
  preserveDrawingBuffer?: boolean;
  powerPreference?: 'default' | 'high-performance' | 'low-power';
}

/**
 * Shader layer configuration
 */
export interface ShaderLayerConfig {
  id: string;
  source: ShaderSource;
  enabled?: boolean;
  opacity?: number;
  blendMode?: BlendMode;
  uniforms?: Record<string, UniformValue>;
}

/**
 * Blend modes for layering shaders
 */
export type BlendMode =
  | 'normal'
  | 'add'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'difference';

/**
 * Render statistics
 */
export interface RenderStats {
  fps: number;
  frameTime: number;
  drawCalls: number;
  frameCount: number;
  lastFrameTime: number;
}

/**
 * Shader compilation result
 */
export interface ShaderCompileResult {
  success: boolean;
  error?: string;
  errorLine?: number;
  fragmentShader?: string;
  vertexShader?: string;
  inputs?: ISFInput[];
  passes?: ParsedPass[];
  type?: 'generator' | 'filter' | 'transition';
}

/**
 * Texture configuration
 */
export interface TextureConfig {
  id: string;
  width: number;
  height: number;
  format?: 'rgba8unorm' | 'rgba16float' | 'rgba32float';
  usage?: number;
  data?: ArrayBufferView | ImageBitmap | HTMLCanvasElement | HTMLVideoElement | HTMLImageElement;
}

/**
 * Framebuffer for render-to-texture
 */
export interface FramebufferConfig {
  id: string;
  width: number;
  height: number;
  colorFormat?: 'rgba8unorm' | 'rgba16float';
  hasDepth?: boolean;
}

/**
 * Built-in uniform names
 */
export const BUILTIN_UNIFORMS = {
  TIME: 'TIME',
  TIMEDELTA: 'TIMEDELTA',
  RENDERSIZE: 'RENDERSIZE',
  PASSINDEX: 'PASSINDEX',
  FRAMEINDEX: 'FRAMEINDEX',
  DATE: 'DATE',
} as const;

/**
 * Event map for ShaderManager
 */
export type ShaderManagerEvents = {
  [K: string]: unknown;
  'context:created': { contextId: string };
  'context:destroyed': { contextId: string };
  'context:resized': { contextId: string; width: number; height: number };
  'layer:added': { contextId: string; layerId: string };
  'layer:removed': { contextId: string; layerId: string };
  'layer:updated': { contextId: string; layerId: string };
  'render:frame': { contextId: string; stats: RenderStats };
  'render:error': { contextId: string; error: Error };
  'shader:compiled': { layerId: string; result: ShaderCompileResult };
  'shader:error': { layerId: string; error: string };
};

/**
 * Event map for RenderContext
 */
export type RenderContextEvents = {
  [K: string]: unknown;
  'frame': { stats: RenderStats };
  'resize': { width: number; height: number };
  'error': { error: Error };
  'shader:error': { layerId: string; error: ShaderError };
  'layer:added': { layerId: string };
  'layer:removed': { layerId: string };
};

/**
 * Shader compilation error details
 */
export interface ShaderError {
  layerId: string;
  message: string;
  line?: number;
  column?: number;
  shaderCode: string;
}

/**
 * Event map for ShaderLayer
 */
export type ShaderLayerEvents = {
  [K: string]: unknown;
  'compiled': { result: ShaderCompileResult };
  'error': { error: string };
  'uniform:changed': { name: string; value: UniformValue };
};
