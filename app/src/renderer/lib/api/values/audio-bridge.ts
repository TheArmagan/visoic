// ============================================
// Visoic Value Manager - Audio Bridge
// ============================================

import { valueManager } from './value-manager';
import { configManager, type AnalyzerConfig, type BindingConfig } from './config-manager';
import type {
  NumberValueDefinition,
  AudioValueSource,
  AudioExtraction,
} from './types';
import {
  audioManager,
  type AnalyzerHandle,
  type DataEvent,
  type FFTAnalyzer,
  type CreateAnalyzerOptions,
  FFTSize,
} from '../audio';

interface AudioValueBinding {
  valueId: string;
  analyzerId: string;
  extraction: AudioExtraction;
  unsubscribe?: () => void;
}

/**
 * Audio Bridge - Connects FFT Analyzers to Value Manager
 *
 * Creates bindings between audio analyzer outputs and values,
 * automatically updating values when audio data changes.
 * Integrates with ConfigManager for persistence.
 */
class AudioValueBridge {
  private bindings: Map<string, AudioValueBinding> = new Map();
  private analyzerHandles: Map<string, AnalyzerHandle> = new Map();
  private globalUnsubscribe: (() => void) | null = null;
  private isListening = false;
  private isRestoring = false;

  /**
   * Initialize the bridge and start listening to audio events
   */
  async initialize(): Promise<void> {
    if (this.isListening) return;

    if (!audioManager.isInitialized()) {
      await audioManager.initialize();
    }

    // Initialize config manager
    await configManager.initialize();

    // Listen to all data events
    this.globalUnsubscribe = () => {
      audioManager.off('data', this.handleAudioData);
    };
    audioManager.on('data', this.handleAudioData);

    this.isListening = true;

    // Restore saved config
    await this.restoreFromConfig();
  }

  /**
   * Restore analyzers and bindings from saved config
   */
  private async restoreFromConfig(): Promise<void> {
    this.isRestoring = true;

    try {
      const savedAnalyzers = configManager.getAnalyzers();
      const savedBindings = configManager.getBindings();
      const savedComputed = configManager.getComputedValues();

      console.log(`[AudioBridge] Restoring ${savedAnalyzers.length} analyzers, ${savedBindings.length} bindings, ${savedComputed.length} computed values`);

      // Restore analyzers
      for (const analyzerConfig of savedAnalyzers) {
        try {
          const handle = await audioManager.createAnalyzer({
            id: analyzerConfig.id,  // Pass the saved ID to preserve it
            deviceId: analyzerConfig.deviceId,
            fftSize: analyzerConfig.fftSize,
            smoothingTimeConstant: analyzerConfig.smoothingTimeConstant,
            gain: analyzerConfig.gain,
            label: analyzerConfig.label,
            normalizationEnabled: analyzerConfig.normalizationEnabled,
          });

          // Store with the handle's ID (should match analyzerConfig.id)
          this.analyzerHandles.set(handle.id, handle);
        } catch (error) {
          console.warn(`[AudioBridge] Failed to restore analyzer ${analyzerConfig.label}:`, error);
        }
      }

      // Restore bindings
      for (const bindingConfig of savedBindings) {
        try {
          // Find the actual analyzer handle
          const handle = this.analyzerHandles.get(bindingConfig.analyzerId);
          if (!handle) {
            console.warn(`[AudioBridge] Analyzer ${bindingConfig.analyzerId} not found for binding ${bindingConfig.valueId}`);
            continue;
          }

          this.bind(
            bindingConfig.valueId,
            handle.id,
            bindingConfig.extraction,
            {
              name: bindingConfig.valueName,
              min: bindingConfig.valueMin,
              max: bindingConfig.valueMax,
            }
          );
        } catch (error) {
          console.warn(`[AudioBridge] Failed to restore binding ${bindingConfig.valueId}:`, error);
        }
      }

      // Restore computed values
      for (const computed of savedComputed) {
        try {
          valueManager.createComputed(
            computed.id,
            computed.name,
            computed.expression,
            {},    // options
            true   // skipSave - already in config
          );
        } catch (error) {
          console.warn(`[AudioBridge] Failed to restore computed value ${computed.id}:`, error);
        }
      }

      // Restore accumulator values
      const savedAccumulators = configManager.getAccumulatorValues();
      for (const acc of savedAccumulators) {
        try {
          valueManager.createAccumulator(
            acc.id,
            acc.name,
            acc.rateExpression,
            {
              limitExpression: acc.limitExpression,
              minExpression: acc.minExpression,
              wrapMode: acc.wrapMode,
              initialValue: acc.initialValue,
              resetOnLimit: acc.resetOnLimit,
            },
            true   // skipSave - already in config
          );
        } catch (error) {
          console.warn(`[AudioBridge] Failed to restore accumulator value ${acc.id}:`, error);
        }
      }

      console.log('[AudioBridge] Config restoration complete');
    } finally {
      this.isRestoring = false;
    }
  }

  /**
   * Handle incoming audio data
   */
  private handleAudioData = (event: DataEvent): void => {
    const analyzerId = event.analyzerId;

    // Find all bindings for this analyzer
    for (const binding of this.bindings.values()) {
      if (binding.analyzerId === analyzerId) {
        this.updateValueFromAudio(binding, event);
      }
    }
  };

  /**
   * Update a value from audio data
   */
  private updateValueFromAudio(binding: AudioValueBinding, event: DataEvent): void {
    const { extraction, valueId } = binding;
    let value: number = 0;

    const analyzer = audioManager.getAnalyzer(binding.analyzerId);
    if (!analyzer) return;

    switch (extraction.type) {
      case 'frequencyRange': {
        if (extraction.lowFreq !== undefined && extraction.highFreq !== undefined) {
          value = analyzer.getFrequencyRangeAdvanced(
            extraction.lowFreq,
            extraction.highFreq,
            extraction.mode || 'average'
          );
        }
        break;
      }

      case 'frequencyBand': {
        if (extraction.band) {
          value = event.frequencyBands[extraction.band] ?? 0;
        }
        break;
      }

      case 'amplitude': {
        value = event.data.averageAmplitude;
        break;
      }

      case 'rms': {
        value = event.data.rmsLevel;
        break;
      }

      case 'peak': {
        // Use peak from frequency data
        value = Math.max(...Array.from(event.data.byteFrequencyData)) / 255;
        break;
      }

      case 'bpm': {
        const bpmData = analyzer.getBPM();
        value = bpmData.bpm;
        break;
      }

      case 'beat': {
        const beatData = analyzer.detectBeat();
        value = beatData.detected ? beatData.intensity : 0;
        break;
      }
    }

    // Apply smoothing if configured
    const smoothing = extraction.smoothing ?? 0;
    valueManager.setFromAudio(valueId, value, smoothing);
  }

  /**
   * Create an analyzer and register it
   */
  async createAnalyzer(
    config: CreateAnalyzerOptions
  ): Promise<AnalyzerHandle> {
    if (!this.isListening) {
      await this.initialize();
    }

    const handle = await audioManager.createAnalyzer(config);
    this.analyzerHandles.set(handle.id, handle);

    // Save to config (skip during restore)
    if (!this.isRestoring) {
      configManager.addAnalyzer({
        id: handle.id,
        deviceId: config.deviceId ?? 'default',
        fftSize: config.fftSize ?? 1024,
        smoothingTimeConstant: config.smoothingTimeConstant ?? 0.8,
        gain: config.gain ?? 1.0,
        label: config.label ?? handle.id,
        normalizationEnabled: config.normalizationEnabled ?? false,
      });
      // Immediately save to ensure persistence
      configManager.save();
    }

    return handle;
  }

  /**
   * Get all registered analyzer handles
   */
  getAnalyzers(): AnalyzerHandle[] {
    return Array.from(this.analyzerHandles.values());
  }

  /**
   * Get an analyzer by ID
   */
  getAnalyzer(id: string): AnalyzerHandle | undefined {
    return this.analyzerHandles.get(id);
  }

  /**
   * Update analyzer configuration
   */
  updateAnalyzerConfig(id: string, config: { fftSize?: FFTSize; smoothingTimeConstant?: number; gain?: number }): boolean {
    const handle = this.analyzerHandles.get(id);
    if (!handle) return false;

    // Update the actual analyzer
    handle.updateConfig(config);

    // Update the config manager
    if (!this.isRestoring) {
      const existingConfig = configManager.getAnalyzers().find(a => a.id === id);
      if (existingConfig) {
        configManager.removeAnalyzer(id);
        configManager.addAnalyzer({
          ...existingConfig,
          fftSize: config.fftSize as FFTSize ?? existingConfig.fftSize as FFTSize,
          smoothingTimeConstant: config.smoothingTimeConstant ?? existingConfig.smoothingTimeConstant,
          gain: config.gain ?? existingConfig.gain,
        });
        // Immediately save to ensure persistence
        configManager.save();
      }
    }

    return true;
  }

  /**
   * Remove an analyzer
   */
  removeAnalyzer(id: string): boolean {
    const handle = this.analyzerHandles.get(id);
    if (!handle) return false;

    // Remove all bindings for this analyzer
    for (const [valueId, binding] of this.bindings) {
      if (binding.analyzerId === id) {
        this.unbind(valueId);
      }
    }

    handle.destroy();
    this.analyzerHandles.delete(id);

    // Remove from config (skip during restore)
    if (!this.isRestoring) {
      configManager.removeAnalyzer(id);
      // Immediately save to ensure persistence
      configManager.save();
    }

    return true;
  }

  /**
   * Bind a value to an analyzer output
   */
  bind(
    valueId: string,
    analyzerId: string,
    extraction: AudioExtraction,
    options: Partial<Omit<NumberValueDefinition, 'id' | 'source' | 'type' | 'value'>> = {}
  ): void {
    // Unbind existing if any
    this.unbind(valueId);

    // Register the value if it doesn't exist
    if (!valueManager.has(valueId)) {
      const source: AudioValueSource = {
        type: 'audio',
        sourceId: analyzerId,
        extraction,
      };

      valueManager.register({
        id: valueId,
        name: options.name ?? valueId,
        description: options.description,
        type: 'number',
        value: 0,
        defaultValue: 0,
        source,
        category: options.category ?? 'audio',
        tags: options.tags ?? ['audio', extraction.type],
        min: options.min ?? 0,
        max: options.max ?? 1,
        precision: options.precision ?? 3,
        unit: options.unit,
        lastUpdated: 0,
      } as NumberValueDefinition);
    }

    // Create binding
    const binding: AudioValueBinding = {
      valueId,
      analyzerId,
      extraction,
    };

    this.bindings.set(valueId, binding);

    // Save to config (skip during restore)
    if (!this.isRestoring) {
      configManager.addBinding({
        valueId,
        analyzerId,
        extraction,
        valueName: options.name ?? valueId,
        valueMin: options.min ?? 0,
        valueMax: options.max ?? 1,
      });
      // Immediately save to ensure persistence
      configManager.save();
    }
  }

  /**
   * Unbind a value from audio
   */
  unbind(valueId: string): boolean {
    const binding = this.bindings.get(valueId);
    if (!binding) return false;

    binding.unsubscribe?.();
    this.bindings.delete(valueId);

    // Remove from config (skip during restore)
    if (!this.isRestoring) {
      configManager.removeBinding(valueId);
      // Immediately save to ensure persistence
      configManager.save();
    }

    return true;
  }

  /**
   * Get all bindings
   */
  getBindings(): AudioValueBinding[] {
    return Array.from(this.bindings.values());
  }

  /**
   * Get bindings for a specific analyzer
   */
  getBindingsForAnalyzer(analyzerId: string): AudioValueBinding[] {
    return this.getBindings().filter((b) => b.analyzerId === analyzerId);
  }

  /**
   * Quick bind helpers
   */

  bindFrequencyRange(
    valueId: string,
    analyzerId: string,
    lowFreq: number,
    highFreq: number,
    options: {
      mode?: AudioExtraction['mode'];
      smoothing?: number;
      outputMin?: number;
      outputMax?: number;
      name?: string;
    } = {}
  ): void {
    this.bind(valueId, analyzerId, {
      type: 'frequencyRange',
      lowFreq,
      highFreq,
      mode: options.mode ?? 'average',
      smoothing: options.smoothing,
      outputRange: options.outputMin !== undefined ? {
        min: options.outputMin,
        max: options.outputMax ?? 1,
      } : undefined,
    }, {
      name: options.name ?? `${lowFreq}-${highFreq}Hz`,
      min: options.outputMin ?? 0,
      max: options.outputMax ?? 1,
    });
  }

  bindFrequencyBand(
    valueId: string,
    analyzerId: string,
    band: AudioExtraction['band'],
    options: { smoothing?: number; name?: string } = {}
  ): void {
    this.bind(valueId, analyzerId, {
      type: 'frequencyBand',
      band,
      smoothing: options.smoothing,
    }, {
      name: options.name ?? band,
    });
  }

  bindAmplitude(
    valueId: string,
    analyzerId: string,
    options: { smoothing?: number; name?: string } = {}
  ): void {
    this.bind(valueId, analyzerId, {
      type: 'amplitude',
      smoothing: options.smoothing,
    }, {
      name: options.name ?? 'Amplitude',
    });
  }

  bindBPM(valueId: string, analyzerId: string, options: { name?: string } = {}): void {
    this.bind(valueId, analyzerId, {
      type: 'bpm',
    }, {
      name: options.name ?? 'BPM',
      min: 0,
      max: 300,
      unit: 'BPM',
    });
  }

  /**
   * Cleanup
   */
  destroy(): void {
    // Remove all bindings
    for (const valueId of this.bindings.keys()) {
      this.unbind(valueId);
    }

    // Remove all analyzers
    for (const id of this.analyzerHandles.keys()) {
      this.removeAnalyzer(id);
    }

    // Stop listening
    this.globalUnsubscribe?.();
    this.isListening = false;
  }
}

// Export singleton
export const audioBridge = new AudioValueBridge();
