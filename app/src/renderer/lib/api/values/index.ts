// ============================================
// Visoic Value Manager - Public Exports
// ============================================

// Core
export { ValueManager, valueManager, updateFrameTiming } from './value-manager';
export { audioBridge } from './audio-bridge';
export { ConfigManager, configManager } from './config-manager';

// Hooks
export {
  useValue,
  useValueWritable,
  useValues,
  useCategory,
  useAllValues,
  useValueDefinition,
  useAudioAnalyzers,
  useAudioBindings,
} from './hooks';

// Types
export type {
  // Value types
  ValueType,
  ValueDefinition,
  NumberValueDefinition,
  BooleanValueDefinition,
  StringValueDefinition,
  ArrayValueDefinition,
  AnyValueDefinition,

  // Source types
  ValueSourceType,
  ValueSource,
  AudioValueSource,
  AudioExtraction,
  ComputedValueSource,
  AccumulatorValueSource,
  AccumulatorWrapMode,

  // Event types
  ValueEventType,
  ValueEvent,
  ValueEventMap,
  ValueEventListener,
  ValueChangeEvent,
  ValueAddEvent,
  ValueRemoveEvent,
  ValueErrorEvent,

  // Presets
  ValuePreset,
} from './types';

// Config types
export type {
  AnalyzerConfig,
  BindingConfig,
  ComputedValueConfig,
  AccumulatorValueConfig,
  AppConfig,
  // Shader config types
  UniformBindingConfig,
  ColorChannelBindingConfig,
  Vec2BindingConfig,
  Vec3BindingConfig,
  ShaderUniformConfig,
  ShaderLayerSaveConfig,
  RenderContextSaveConfig,
  ShaderConfig,
} from './config-manager';