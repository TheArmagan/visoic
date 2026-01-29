import { EventEmitter } from '../audio/event-emitter';
import type { AudioExtraction } from './types';
import type { FFTSize } from '../audio/types';
import type { BlendMode } from '../shader/types';

// ============================================================================
// Types
// ============================================================================

export interface AnalyzerConfig {
  id: string;
  deviceId: string;
  fftSize: FFTSize;
  smoothingTimeConstant: number;
  gain: number;
  label: string;
  normalizationEnabled: boolean;
}

export interface BindingConfig {
  valueId: string;
  analyzerId: string;
  extraction: AudioExtraction;
  valueName: string;
  valueMin: number;
  valueMax: number;
}

export interface ComputedValueConfig {
  id: string;
  name: string;
  expression: string;
  dependencies: string[];
}

// ============================================================================
// Shader Config Types
// ============================================================================

/**
 * Uniform value binding to a value manager value
 */
export interface UniformBindingConfig {
  valueId: string;              // Value manager value ID
  inputMin: number;             // Input value min (for mapping)
  inputMax: number;             // Input value max (for mapping)
  outputMin: number;            // Output uniform min
  outputMax: number;            // Output uniform max
}

/**
 * Color channel binding configuration
 */
export interface ColorChannelBindingConfig {
  r?: UniformBindingConfig;
  g?: UniformBindingConfig;
  b?: UniformBindingConfig;
  a?: UniformBindingConfig;
}

/**
 * Vec2/point2D binding configuration
 */
export interface Vec2BindingConfig {
  x?: UniformBindingConfig;
  y?: UniformBindingConfig;
}

/**
 * Vec3 binding configuration
 */
export interface Vec3BindingConfig {
  x?: UniformBindingConfig;
  y?: UniformBindingConfig;
  z?: UniformBindingConfig;
}

/**
 * Shader uniform configuration with optional binding
 */
export interface ShaderUniformConfig {
  name: string;
  type: string;
  value: number | boolean | number[];
  binding?: UniformBindingConfig;           // For number types
  colorBinding?: ColorChannelBindingConfig; // For color/vec4 types
  vec2Binding?: Vec2BindingConfig;          // For vec2/point2D types
  vec3Binding?: Vec3BindingConfig;          // For vec3 types
}

/**
 * Shader layer configuration for persistence
 */
export interface ShaderLayerSaveConfig {
  id: string;
  shaderKey: string;            // Built-in shader key or 'custom'
  customSource?: string;        // Custom shader source if shaderKey is 'custom'
  enabled: boolean;
  opacity: number;
  blendMode: BlendMode;
  uniforms: ShaderUniformConfig[];
}

/**
 * Render context configuration for persistence
 */
export interface RenderContextSaveConfig {
  id: string;
  width: number;
  height: number;
  fpsLimit: number;
  layers: ShaderLayerSaveConfig[];
}

/**
 * Shader system configuration
 */
export interface ShaderConfig {
  contexts: RenderContextSaveConfig[];
}

export interface AppSettings {
  autoSave: boolean;
  autoSaveInterval: number;
}

export interface AppConfig {
  version: number;
  analyzers: AnalyzerConfig[];
  bindings: BindingConfig[];
  computedValues: ComputedValueConfig[];
  shader: ShaderConfig;
  settings: AppSettings;
}

export type ConfigEventMap = {
  save: [config: AppConfig];
  load: [config: AppConfig];
  reset: [];
  change: [key: string, value: unknown];
};

// ============================================================================
// Constants
// ============================================================================

const CONFIG_STORAGE_KEY = 'visoic:config';
const CONFIG_VERSION = 1;
const DEFAULT_AUTO_SAVE_INTERVAL = 2000; // ms

// ============================================================================
// Default Config
// ============================================================================

function createDefaultConfig(): AppConfig {
  return {
    version: CONFIG_VERSION,
    analyzers: [],
    bindings: [],
    computedValues: [],
    shader: {
      contexts: [],
    },
    settings: {
      autoSave: true,
      autoSaveInterval: DEFAULT_AUTO_SAVE_INTERVAL,
    },
  };
}

// ============================================================================
// Config Manager Class
// ============================================================================

export class ConfigManager extends EventEmitter<ConfigEventMap> {
  private config: AppConfig;
  private autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
  private isDirty: boolean = false;
  private isLoading: boolean = false;

  constructor() {
    super();
    this.config = createDefaultConfig();
  }

  // --------------------------------------------------------------------------
  // Initialization
  // --------------------------------------------------------------------------

  /**
   * Initialize the config manager by loading saved config
   */
  async initialize(): Promise<AppConfig> {
    await this.load();

    if (this.config.settings.autoSave) {
      this.enableAutoSave(this.config.settings.autoSaveInterval);
    }

    return this.config;
  }

  // --------------------------------------------------------------------------
  // Save / Load
  // --------------------------------------------------------------------------

  /**
   * Save current config to file
   */
  async save(): Promise<void> {
    try {
      this.isDirty = false;
      const api = (window as any).VISOICNative;
      if (api?.config?.save) {
        await api.config.save(this.config);
        this.emit('save', this.config);
        console.log('[ConfigManager] Config saved');
      } else {
        // Fallback or dev mode without context bridge
        const json = JSON.stringify(this.config);
        localStorage.setItem(CONFIG_STORAGE_KEY, json);
        this.emit('save', this.config);
        console.log('[ConfigManager] Config saved to localStorage (fallback)');
      }
    } catch (error) {
      console.error('[ConfigManager] Failed to save config:', error);
      this.isDirty = true;
    }
  }

  /**
   * Load config from file
   */
  async load(): Promise<AppConfig> {
    this.isLoading = true;

    try {
      let loaded: AppConfig | null = null;

      const api = (window as any).VISOICNative;
      if (api?.config?.load) {
        loaded = await api.config.load();
      } else {
        // Fallback
        const json = localStorage.getItem(CONFIG_STORAGE_KEY);
        if (json) loaded = JSON.parse(json) as AppConfig;
      }

      if (loaded) {
        // Version migration if needed
        if (loaded.version < CONFIG_VERSION) {
          this.config = this.migrateConfig(loaded);
        } else {
          this.config = this.mergeWithDefaults(loaded);
        }

        console.log('[ConfigManager] Config loaded');
      } else {
        this.config = createDefaultConfig();
        console.log('[ConfigManager] No saved config, using defaults');
      }

      this.emit('load', this.config);
    } catch (error) {
      console.error('[ConfigManager] Failed to load config:', error);
      this.config = createDefaultConfig();
    } finally {
      this.isLoading = false;
    }

    return this.config;
  }

  /**
   * Reset config to defaults
   */
  reset(): void {
    this.config = createDefaultConfig();
    this.save();
    this.emit('reset');
    console.log('[ConfigManager] Config reset to defaults');
  }

  // --------------------------------------------------------------------------
  // Auto-Save
  // --------------------------------------------------------------------------

  /**
   * Enable auto-save with debouncing
   */
  enableAutoSave(interval: number = DEFAULT_AUTO_SAVE_INTERVAL): void {
    this.config.settings.autoSave = true;
    this.config.settings.autoSaveInterval = interval;
  }

  /**
   * Disable auto-save
   */
  disableAutoSave(): void {
    this.config.settings.autoSave = false;

    if (this.autoSaveTimer) {
      clearTimeout(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
  }

  /**
   * Mark config as dirty and schedule auto-save
   */
  private scheduleSave(): void {
    if (this.isLoading) return;

    this.isDirty = true;

    if (!this.config.settings.autoSave) return;

    if (this.autoSaveTimer) {
      clearTimeout(this.autoSaveTimer);
    }

    this.autoSaveTimer = setTimeout(() => {
      if (this.isDirty) {
        this.save();
      }
      this.autoSaveTimer = null;
    }, this.config.settings.autoSaveInterval);
  }

  // --------------------------------------------------------------------------
  // Analyzer Config
  // --------------------------------------------------------------------------

  /**
   * Add analyzer config
   */
  addAnalyzer(analyzer: AnalyzerConfig): void {
    const existing = this.config.analyzers.findIndex(a => a.id === analyzer.id);

    if (existing >= 0) {
      this.config.analyzers[existing] = analyzer;
    } else {
      this.config.analyzers.push(analyzer);
    }

    this.emit('change', 'analyzers', this.config.analyzers);
    this.scheduleSave();
  }

  /**
   * Remove analyzer config
   */
  removeAnalyzer(id: string): void {
    this.config.analyzers = this.config.analyzers.filter(a => a.id !== id);
    // Also remove bindings that reference this analyzer
    this.config.bindings = this.config.bindings.filter(b => b.analyzerId !== id);

    this.emit('change', 'analyzers', this.config.analyzers);
    this.scheduleSave();
  }

  /**
   * Get all analyzer configs
   */
  getAnalyzers(): AnalyzerConfig[] {
    return [...this.config.analyzers];
  }

  // --------------------------------------------------------------------------
  // Binding Config
  // --------------------------------------------------------------------------

  /**
   * Add binding config
   */
  addBinding(binding: BindingConfig): void {
    const existing = this.config.bindings.findIndex(b => b.valueId === binding.valueId);

    if (existing >= 0) {
      this.config.bindings[existing] = binding;
    } else {
      this.config.bindings.push(binding);
    }

    this.emit('change', 'bindings', this.config.bindings);
    this.scheduleSave();
  }

  /**
   * Remove binding config
   */
  removeBinding(valueId: string): void {
    this.config.bindings = this.config.bindings.filter(b => b.valueId !== valueId);

    this.emit('change', 'bindings', this.config.bindings);
    this.scheduleSave();
  }

  /**
   * Get all binding configs
   */
  getBindings(): BindingConfig[] {
    return [...this.config.bindings];
  }

  // --------------------------------------------------------------------------
  // Computed Value Config
  // --------------------------------------------------------------------------

  /**
   * Add computed value config
   */
  addComputedValue(computed: ComputedValueConfig): void {
    const existing = this.config.computedValues.findIndex(c => c.id === computed.id);

    if (existing >= 0) {
      this.config.computedValues[existing] = computed;
    } else {
      this.config.computedValues.push(computed);
    }

    this.emit('change', 'computedValues', this.config.computedValues);
    this.scheduleSave();
  }

  /**
   * Remove computed value config
   */
  removeComputedValue(id: string): void {
    this.config.computedValues = this.config.computedValues.filter(c => c.id !== id);

    this.emit('change', 'computedValues', this.config.computedValues);
    this.scheduleSave();
  }

  /**
   * Get all computed value configs
   */
  getComputedValues(): ComputedValueConfig[] {
    return [...this.config.computedValues];
  }

  // --------------------------------------------------------------------------
  // Shader Config
  // --------------------------------------------------------------------------

  /**
   * Get shader config
   */
  getShaderConfig(): ShaderConfig {
    return JSON.parse(JSON.stringify(this.config.shader));
  }

  /**
   * Set shader config
   */
  setShaderConfig(config: ShaderConfig): void {
    this.config.shader = config;
    this.emit('change', 'shader', this.config.shader);
    this.scheduleSave();
  }

  /**
   * Add or update render context config
   */
  addRenderContext(context: RenderContextSaveConfig): void {
    const existing = this.config.shader.contexts.findIndex(c => c.id === context.id);

    if (existing >= 0) {
      this.config.shader.contexts[existing] = context;
    } else {
      this.config.shader.contexts.push(context);
    }

    this.emit('change', 'shader.contexts', this.config.shader.contexts);
    this.scheduleSave();
  }

  /**
   * Remove render context config
   */
  removeRenderContext(id: string): void {
    this.config.shader.contexts = this.config.shader.contexts.filter(c => c.id !== id);
    this.emit('change', 'shader.contexts', this.config.shader.contexts);
    this.scheduleSave();
  }

  /**
   * Get render context config
   */
  getRenderContext(id: string): RenderContextSaveConfig | undefined {
    return this.config.shader.contexts.find(c => c.id === id);
  }

  /**
   * Get all render context configs
   */
  getRenderContexts(): RenderContextSaveConfig[] {
    return [...this.config.shader.contexts];
  }

  /**
   * Add or update layer in a context
   */
  addLayerToContext(contextId: string, layer: ShaderLayerSaveConfig): void {
    const context = this.config.shader.contexts.find(c => c.id === contextId);
    if (!context) return;

    const existing = context.layers.findIndex(l => l.id === layer.id);
    if (existing >= 0) {
      context.layers[existing] = layer;
    } else {
      context.layers.push(layer);
    }

    this.emit('change', `shader.contexts.${contextId}.layers`, context.layers);
    this.scheduleSave();
  }

  /**
   * Remove layer from context
   */
  removeLayerFromContext(contextId: string, layerId: string): void {
    const context = this.config.shader.contexts.find(c => c.id === contextId);
    if (!context) return;

    context.layers = context.layers.filter(l => l.id !== layerId);
    this.emit('change', `shader.contexts.${contextId}.layers`, context.layers);
    this.scheduleSave();
  }

  /**
   * Update layer uniform
   */
  updateLayerUniform(contextId: string, layerId: string, uniform: ShaderUniformConfig): void {
    const context = this.config.shader.contexts.find(c => c.id === contextId);
    if (!context) return;

    const layer = context.layers.find(l => l.id === layerId);
    if (!layer) return;

    const existing = layer.uniforms.findIndex(u => u.name === uniform.name);
    if (existing >= 0) {
      layer.uniforms[existing] = uniform;
    } else {
      layer.uniforms.push(uniform);
    }

    this.emit('change', `shader.contexts.${contextId}.layers.${layerId}.uniforms`, layer.uniforms);
    this.scheduleSave();
  }

  // --------------------------------------------------------------------------
  // Settings
  // --------------------------------------------------------------------------

  /**
   * Update settings
   */
  updateSettings(settings: Partial<AppSettings>): void {
    this.config.settings = { ...this.config.settings, ...settings };

    this.emit('change', 'settings', this.config.settings);
    this.scheduleSave();
  }

  /**
   * Get settings
   */
  getSettings(): AppSettings {
    return { ...this.config.settings };
  }

  // --------------------------------------------------------------------------
  // Export / Import
  // --------------------------------------------------------------------------

  /**
   * Export config as JSON string
   */
  exportToJson(): string {
    return JSON.stringify(this.config, null, 2);
  }

  /**
   * Import config from JSON string
   */
  importFromJson(json: string): void {
    try {
      const imported = JSON.parse(json) as AppConfig;

      // Validate structure
      if (!imported.version || !Array.isArray(imported.analyzers)) {
        throw new Error('Invalid config format');
      }

      this.config = this.mergeWithDefaults(imported);
      this.save();
      this.emit('load', this.config);

      console.log('[ConfigManager] Config imported');
    } catch (error) {
      console.error('[ConfigManager] Failed to import config:', error);
      throw error;
    }
  }

  /**
   * Get full config (readonly)
   */
  getConfig(): Readonly<AppConfig> {
    return this.config;
  }

  // --------------------------------------------------------------------------
  // Migration & Merge
  // --------------------------------------------------------------------------

  /**
   * Migrate older config versions
   */
  private migrateConfig(oldConfig: AppConfig): AppConfig {
    let config = { ...oldConfig };

    // Add migration logic here as versions increase
    // Example:
    // if (config.version < 2) {
    //   config.newField = 'default';
    //   config.version = 2;
    // }

    config.version = CONFIG_VERSION;
    return this.mergeWithDefaults(config);
  }

  /**
   * Merge loaded config with defaults to ensure all fields exist
   */
  private mergeWithDefaults(loaded: Partial<AppConfig>): AppConfig {
    const defaults = createDefaultConfig();

    return {
      version: loaded.version ?? defaults.version,
      analyzers: loaded.analyzers ?? defaults.analyzers,
      bindings: loaded.bindings ?? defaults.bindings,
      computedValues: loaded.computedValues ?? defaults.computedValues,
      shader: loaded.shader ?? defaults.shader,
      settings: {
        ...defaults.settings,
        ...loaded.settings,
      },
    };
  }

  // --------------------------------------------------------------------------
  // Cleanup
  // --------------------------------------------------------------------------

  /**
   * Cleanup resources
   */
  dispose(): void {
    if (this.autoSaveTimer) {
      clearTimeout(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }

    // Save any pending changes
    if (this.isDirty) {
      this.save();
    }

    this.removeAllListeners();
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

export const configManager = new ConfigManager();
