// ============================================
// Visoic Audio FFT API - Main Audio Manager
// ============================================

import type {
  AudioSourceConfig,
  AnalyzerConfig,
  AudioDeviceInfo,
  AudioEventType,
  AudioEventListener,
  AudioEventMap,
  DataEvent,
} from './types';
import { AudioEventEmitter } from './event-emitter';
import { AudioDeviceManager } from './device-manager';
import { AudioSource } from './source';
import { FFTAnalyzer } from './analyzer';

export interface CreateAnalyzerOptions extends Partial<AnalyzerConfig> {
  /** Device ID to use. Use 'default' for system default device */
  deviceId?: string;
  /** Source type: 'microphone' for input devices, 'desktop' for full system audio, 'application' for specific app/window audio */
  sourceType?: 'microphone' | 'desktop' | 'application';
  /** Desktop source ID from Electron's desktopCapturer (for desktop/application capture) */
  desktopSourceId?: string;
  /** Source configuration options */
  sourceConfig?: Partial<Omit<AudioSourceConfig, 'deviceId' | 'sourceType' | 'desktopSourceId'>>;
}

export interface AnalyzerHandle {
  /** Unique analyzer ID */
  id: string;
  /** Source ID this analyzer belongs to */
  sourceId: string;
  /** Device ID being used */
  deviceId: string;
  /** The analyzer instance */
  analyzer: FFTAnalyzer;
  /** Subscribe to data events for this analyzer only */
  onData: (callback: (event: DataEvent) => void) => () => void;
  /** Get current data */
  getData: () => ReturnType<FFTAnalyzer['getData']>;
  /** Get frequency bands */
  getFrequencyBands: () => ReturnType<FFTAnalyzer['getFrequencyBands']>;
  /** Update configuration */
  updateConfig: (config: Partial<AnalyzerConfig>) => void;
  /** Destroy this analyzer */
  destroy: () => void;
  /** Set listen mode (output to speakers) */
  setListening?: (listen: boolean) => void;
  /** Get listening state */
  isListening?: () => boolean;
}

/**
 * Main Audio Manager - Entry point for the Visoic Audio API
 * 
 * @example
 * ```typescript
 * const audio = new AudioManager();
 * await audio.initialize();
 * 
 * // Create multiple analyzers on the same device with different settings
 * const analyzer1 = await audio.createAnalyzer({
 *   deviceId: 'default',
 *   fftSize: 128,
 *   smoothingTimeConstant: 0.5,
 * });
 * 
 * const analyzer2 = await audio.createAnalyzer({
 *   deviceId: 'default',
 *   fftSize: 1024,
 *   smoothingTimeConstant: 0.8,
 *   gain: 2.0,
 * });
 * 
 * // Subscribe to data
 * analyzer1.onData((event) => {
 *   console.log('Analyzer 1:', event.data.averageAmplitude);
 * });
 * 
 * // Or subscribe to all data events
 * audio.on('data', (event) => {
 *   console.log(`${event.analyzerId}:`, event.data.averageAmplitude);
 * });
 * ```
 */
export class AudioManager extends AudioEventEmitter {
  private deviceManager: AudioDeviceManager;
  private sources: Map<string, AudioSource> = new Map();
  private analyzerToSource: Map<string, string> = new Map();
  private initialized = false;

  constructor() {
    super();
    this.deviceManager = new AudioDeviceManager();
  }

  /**
   * Initialize the audio manager
   * Must be called before using any other methods
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    await this.deviceManager.initialize();

    // Forward device change events
    this.deviceManager.on('deviceChange', (event) => {
      this.emit('deviceChange', event);
    });

    this.deviceManager.on('error', (event) => {
      this.emit('error', event);
    });

    this.initialized = true;
  }

  /**
   * Check if manager is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  // ==========================================
  // Device Management
  // ==========================================

  /**
   * Get all available audio devices
   */
  getDevices(): AudioDeviceInfo[] {
    return this.deviceManager.getAllDevices();
  }

  /**
   * Get only input devices
   */
  getInputDevices(): AudioDeviceInfo[] {
    return this.deviceManager.getInputDevices();
  }

  /**
   * Get only output devices
   */
  getOutputDevices(): AudioDeviceInfo[] {
    return this.deviceManager.getOutputDevices();
  }

  /**
   * Get the default input device
   */
  getDefaultDevice(): AudioDeviceInfo | undefined {
    return this.deviceManager.getDefaultInputDevice();
  }

  /**
   * Refresh device list
   */
  async refreshDevices(): Promise<AudioDeviceInfo[]> {
    return this.deviceManager.refreshDevices();
  }

  // ==========================================
  // Source Management
  // ==========================================

  /**
   * Get or create an audio source for a device
   */
  private async getOrCreateSource(
    deviceId: string,
    sourceType: 'microphone' | 'desktop' | 'application' = 'microphone',
    desktopSourceId?: string,
    config?: Partial<Omit<AudioSourceConfig, 'deviceId' | 'sourceType' | 'desktopSourceId'>>
  ): Promise<AudioSource> {
    // For microphone sources, we can reuse existing active sources
    if (sourceType === 'microphone') {
      for (const source of this.sources.values()) {
        if (source.deviceId === deviceId && source.sourceType === sourceType && source.isActive()) {
          return source;
        }
      }
    }

    // For desktop/application sources, check if we have an existing source with same desktopSourceId
    if ((sourceType === 'desktop' || sourceType === 'application') && desktopSourceId) {
      for (const source of this.sources.values()) {
        if (source.sourceType === sourceType &&
          source.desktopSourceId === desktopSourceId &&
          source.isActive()) {
          return source;
        }
      }
    }

    // Create new source
    const source = new AudioSource({
      deviceId,
      sourceType,
      desktopSourceId,
      ...config,
    });

    // Forward events
    source.on('data', (event) => this.emit('data', event));
    source.on('peak', (event) => this.emit('peak', event));
    source.on('beat', (event) => this.emit('beat', event));
    source.on('stateChange', (event) => this.emit('stateChange', event));

    await source.start();
    this.sources.set(source.id, source);

    return source;
  }

  /**
   * Get all active sources
   */
  getSources(): AudioSource[] {
    return Array.from(this.sources.values());
  }

  /**
   * Get a source by ID
   */
  getSource(sourceId: string): AudioSource | undefined {
    return this.sources.get(sourceId);
  }

  // ==========================================
  // Analyzer Management (Main API)
  // ==========================================

  /**
   * Create a new FFT analyzer
   * 
   * This is the main method to create analyzers. You can create multiple analyzers
   * on the same device with different configurations.
   * 
   * @example
   * ```typescript
   * // Simple analyzer with defaults
   * const analyzer = await audio.createAnalyzer();
   * 
   * // Analyzer with specific settings
   * const analyzer = await audio.createAnalyzer({
   *   deviceId: 'specific-device-id',
   *   fftSize: 2048,
   *   smoothingTimeConstant: 0.85,
   *   gain: 1.5,
   * });
   * 
   * // Desktop audio analyzer (full system audio)
   * const desktopAnalyzer = await audio.createAnalyzer({
   *   sourceType: 'desktop',
   * });
   * 
   * // Application-specific audio analyzer
   * const appAnalyzer = await audio.createAnalyzer({
   *   sourceType: 'application',
   *   displaySurface: 'window', // Will prompt user to select a window
   * });
   * ```
   */
  async createAnalyzer(options: CreateAnalyzerOptions = {}): Promise<AnalyzerHandle> {
    if (!this.initialized) {
      throw new Error('AudioManager not initialized. Call initialize() first.');
    }

    const {
      deviceId = 'default',
      sourceType = 'microphone',
      desktopSourceId,
      sourceConfig,
      ...analyzerConfig
    } = options;

    // Get or create source for this device and source type
    const source = await this.getOrCreateSource(deviceId, sourceType, desktopSourceId, sourceConfig);

    // Create analyzer on the source
    const analyzer = source.createAnalyzer(analyzerConfig);
    this.analyzerToSource.set(analyzer.id, source.id);

    // Create handle with convenient methods
    const handle: AnalyzerHandle = {
      id: analyzer.id,
      sourceId: source.id,
      deviceId: source.deviceId,
      analyzer,

      onData: (callback) => {
        const listener = (event: DataEvent) => {
          if (event.analyzerId === analyzer.id) {
            callback(event);
          }
        };
        this.on('data', listener);
        return () => this.off('data', listener);
      },

      getData: () => analyzer.getData(),

      getFrequencyBands: () => analyzer.getFrequencyBands(),

      updateConfig: (config) => analyzer.updateConfig(config),

      destroy: () => this.removeAnalyzer(analyzer.id),

      setListening: (listen: boolean) => source.setListening(listen),
      isListening: () => source.isListening(),
    };

    return handle;
  }

  /**
   * Get an analyzer by ID
   */
  getAnalyzer(analyzerId: string): FFTAnalyzer | undefined {
    const sourceId = this.analyzerToSource.get(analyzerId);
    if (!sourceId) return undefined;

    const source = this.sources.get(sourceId);
    return source?.getAnalyzer(analyzerId);
  }

  /**
   * Get all analyzers
   */
  getAnalyzers(): FFTAnalyzer[] {
    const analyzers: FFTAnalyzer[] = [];
    for (const source of this.sources.values()) {
      analyzers.push(...source.getAnalyzers());
    }
    return analyzers;
  }

  /**
   * Remove an analyzer
   */
  removeAnalyzer(analyzerId: string): boolean {
    const sourceId = this.analyzerToSource.get(analyzerId);
    if (!sourceId) return false;

    const source = this.sources.get(sourceId);
    if (!source) return false;

    const result = source.removeAnalyzer(analyzerId);
    this.analyzerToSource.delete(analyzerId);

    // Clean up source if no more analyzers
    if (source.getAnalyzers().length === 0) {
      source.destroy();
      this.sources.delete(sourceId);
    }

    return result;
  }

  /**
   * Remove all analyzers for a specific device
   */
  removeAnalyzersForDevice(deviceId: string): void {
    for (const source of this.sources.values()) {
      if (source.deviceId === deviceId) {
        for (const analyzer of source.getAnalyzers()) {
          this.analyzerToSource.delete(analyzer.id);
        }
        source.destroy();
        this.sources.delete(source.id);
      }
    }
  }

  // ==========================================
  // Batch Operations
  // ==========================================

  /**
   * Create multiple analyzers at once
   */
  async createAnalyzers(
    configs: CreateAnalyzerOptions[]
  ): Promise<AnalyzerHandle[]> {
    const handles: AnalyzerHandle[] = [];
    for (const config of configs) {
      const handle = await this.createAnalyzer(config);
      handles.push(handle);
    }
    return handles;
  }

  /**
   * Suspend all audio processing
   */
  async suspendAll(): Promise<void> {
    const promises = Array.from(this.sources.values()).map(s => s.suspend());
    await Promise.all(promises);
  }

  /**
   * Resume all audio processing
   */
  async resumeAll(): Promise<void> {
    const promises = Array.from(this.sources.values()).map(s => s.resume());
    await Promise.all(promises);
  }

  // ==========================================
  // Cleanup
  // ==========================================

  /**
   * Stop all sources and cleanup
   */
  async stopAll(): Promise<void> {
    const promises = Array.from(this.sources.values()).map(s => s.stop());
    await Promise.all(promises);
    this.sources.clear();
    this.analyzerToSource.clear();
  }

  /**
   * Destroy the audio manager and release all resources
   */
  async destroy(): Promise<void> {
    await this.stopAll();
    this.deviceManager.destroy();
    this.removeAllListeners();
    this.initialized = false;
  }
}

// Export singleton instance for convenience
export const audioManager = new AudioManager();
