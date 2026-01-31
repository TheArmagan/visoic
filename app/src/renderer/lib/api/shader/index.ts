// ============================================
// Visoic Shader API - Main Export
// ============================================

// Types
export type {
  UniformType,
  ISFInput,
  ISFPass,
  ISFMetadata,
  ParsedPass,
  UniformValue,
  UniformDefinition,
  ShaderSource,
  RenderContextConfig,
  ShaderLayerConfig,
  BlendMode,
  RenderStats,
  ShaderCompileResult,
  TextureConfig,
  FramebufferConfig,
  ShaderManagerEvents,
  RenderContextEvents,
  ShaderLayerEvents,
  ShaderError,
} from './types';

// Test Suite Types
export type {
  ShaderTestResult,
  ShaderTestSuiteResult,
  ShaderTestProgress,
  ShaderFixSuggestion,
  ShaderTestIPCMessage,
  ShaderTestConfig,
} from './test-types';

export { DEFAULT_TEST_CONFIG } from './test-types';

export { BUILTIN_UNIFORMS } from './types';

// Classes
export { EventEmitter } from './event-emitter';
export { ISFParser, isfParser } from './isf-parser';
export { ShaderLayer } from './shader-layer';
export { RenderContext } from './render-context';
export { ShaderManager, shaderManager } from './shader-manager';
export { ShaderValueBridge, shaderValueBridge } from './value-bridge';

// Hooks
export {
  useShaderManager,
  useRenderContext,
  useShaderLayer,
  useShaderValueBridge,
  createUniformBinding,
} from './hooks';

// Built-in shaders & ISF Loader
export {
  BUILTIN_SHADERS,
  FALLBACK_SHADERS,
  type BuiltinShaderKey,
  type FallbackShaderKey,
  // ISF Loader
  isfLoader,
  type ISFShaderInfo,
  type ISFShaderSource,
  // Helper functions
  getShaderCategories,
  getAllShaders,
  getShadersByCategory,
  loadShader,
  searchShaders,
} from './builtin-shaders';
