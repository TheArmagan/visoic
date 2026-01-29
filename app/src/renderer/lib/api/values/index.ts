// ============================================
// Visoic Value Manager - Public Exports
// ============================================

// Core
export { ValueManager, valueManager } from './value-manager';
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
  AppConfig,
  // Shader config types
  UniformBindingConfig,
  ColorChannelBindingConfig,
  ShaderUniformConfig,
  ShaderLayerSaveConfig,
  RenderContextSaveConfig,
  ShaderConfig,
} from './config-manager';