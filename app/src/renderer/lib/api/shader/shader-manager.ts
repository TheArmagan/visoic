// ============================================
// Visoic Shader API - Shader Manager
// ============================================

/// <reference types="@webgpu/types" />
/// <reference types="vite/client" />

import { EventEmitter } from './event-emitter';
import { RenderContext } from './render-context';
import type {
  ShaderManagerEvents,
  RenderContextConfig,
  ShaderLayerConfig,
} from './types';

/**
 * Shader Manager - Main entry point for the shader rendering system
 * 
 * Manages GPU device, multiple render contexts, and provides
 * a unified API for shader management.
 */
export class ShaderManager extends EventEmitter<ShaderManagerEvents> {
  private static instance: ShaderManager | null = null;

  private adapter: GPUAdapter | null = null;
  private device: GPUDevice | null = null;
  private contexts: Map<string, RenderContext> = new Map();
  private initialized: boolean = false;

  private constructor() {
    super();
  }

  /**
   * Get singleton instance
   */
  static getInstance(): ShaderManager {
    if (!ShaderManager.instance) {
      ShaderManager.instance = new ShaderManager();
    }
    return ShaderManager.instance;
  }

  /**
   * Initialize WebGPU
   */
  async initialize(): Promise<boolean> {
    if (this.initialized) {
      console.log('[ShaderManager] Already initialized, skipping');
      return true;
    }

    // Check WebGPU support
    if (!navigator.gpu) {
      console.error('WebGPU is not supported in this browser');
      return false;
    }

    console.log('[ShaderManager] Starting initialization...');

    try {
      // Request adapter - prefer high-performance, reject fallback
      this.adapter = await navigator.gpu.requestAdapter({
        powerPreference: 'high-performance',
      });

      if (!this.adapter) {
        console.error('Failed to get WebGPU adapter');
        return false;
      }

      // Check if we got a fallback adapter (SwiftShader)
      if (this.adapter.info.isFallbackAdapter) {
        console.warn('[ShaderManager] Got fallback adapter (SwiftShader), trying again without preference...');

        // Try again without power preference
        this.adapter = await navigator.gpu.requestAdapter();

        if (!this.adapter) {
          console.error('Failed to get WebGPU adapter on retry');
          return false;
        }

        if (this.adapter.info.isFallbackAdapter) {
          console.warn('[ShaderManager] Still using fallback adapter. Real GPU may not support WebGPU.');
          console.warn('[ShaderManager] Adapter info:', this.adapter.info);
        }
      }

      console.log('[ShaderManager] Got adapter:', this.adapter.info);

      // Request device
      this.device = await this.adapter.requestDevice({
        label: 'Visoic Shader Device',
        requiredFeatures: [],
        requiredLimits: {},
      });

      console.log('[ShaderManager] Got device');

      // Handle device loss - don't auto-reinitialize, just log
      this.device.lost.then((info: GPUDeviceLostInfo) => {
        console.warn('[ShaderManager] WebGPU device was lost:', info.message, 'reason:', info.reason);
        this.initialized = false;
      });

      this.initialized = true;
      console.log('[ShaderManager] WebGPU initialized successfully');
      return true;
    } catch (error) {
      console.error('Failed to initialize WebGPU:', error);
      return false;
    }
  }

  /**
   * Check if WebGPU is supported
   */
  static isSupported(): boolean {
    return typeof navigator !== 'undefined' && 'gpu' in navigator;
  }

  /**
   * Check if manager is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get GPU device
   */
  getDevice(): GPUDevice | null {
    return this.device;
  }

  /**
   * Get adapter info
   */
  getAdapterInfo(): GPUAdapterInfo | null {
    if (!this.adapter) return null;
    return this.adapter.info;
  }

  // ==========================================
  // Context Management
  // ==========================================

  /**
   * Create a new render context
   */
  async createContext(config: RenderContextConfig): Promise<RenderContext> {
    if (!this.initialized || !this.device) {
      throw new Error('ShaderManager not initialized');
    }

    if (this.contexts.has(config.id)) {
      throw new Error(`Context with ID "${config.id}" already exists`);
    }

    const context = new RenderContext(config);
    await context.initialize(this.device);

    this.contexts.set(config.id, context);
    this.emit('context:created', { contextId: config.id });

    // Forward context events
    context.on('frame', (data) => {
      this.emit('render:frame', { contextId: config.id, stats: data.stats });
    });

    context.on('error', (data) => {
      this.emit('render:error', { contextId: config.id, error: data.error });
    });

    context.on('resize', (data) => {
      this.emit('context:resized', { contextId: config.id, ...data });
    });

    context.on('layer:added', (data) => {
      this.emit('layer:added', { contextId: config.id, layerId: data.layerId });
    });

    context.on('layer:removed', (data) => {
      this.emit('layer:removed', { contextId: config.id, layerId: data.layerId });
    });

    return context;
  }

  /**
   * Get a render context by ID
   */
  getContext(contextId: string): RenderContext | undefined {
    return this.contexts.get(contextId);
  }

  /**
   * Get all render contexts as Map
   */
  getContexts(): Map<string, RenderContext> {
    return new Map(this.contexts);
  }

  /**
   * Destroy a render context
   */
  destroyContext(contextId: string): boolean {
    const context = this.contexts.get(contextId);
    if (!context) return false;

    context.destroy();
    this.contexts.delete(contextId);
    this.emit('context:destroyed', { contextId });

    return true;
  }

  // ==========================================
  // Layer Shortcuts
  // ==========================================

  /**
   * Add a layer to a context
   */
  addLayer(contextId: string, config: ShaderLayerConfig) {
    const context = this.contexts.get(contextId);
    if (!context) {
      throw new Error(`Context "${contextId}" not found`);
    }
    return context.addLayer(config);
  }

  /**
   * Remove a layer from a context
   */
  removeLayer(contextId: string, layerId: string): boolean {
    const context = this.contexts.get(contextId);
    if (!context) return false;
    return context.removeLayer(layerId);
  }

  /**
   * Get a layer from a context
   */
  getLayer(contextId: string, layerId: string) {
    const context = this.contexts.get(contextId);
    if (!context) return undefined;
    return context.getLayer(layerId);
  }

  // ==========================================
  // Render Control
  // ==========================================

  /**
   * Start all render contexts
   */
  startAll(): void {
    for (const context of this.contexts.values()) {
      context.start();
    }
  }

  /**
   * Stop all render contexts
   */
  stopAll(): void {
    for (const context of this.contexts.values()) {
      context.stop();
    }
  }

  /**
   * Destroy all contexts but keep device alive for re-use
   */
  destroyAllContexts(): void {
    this.stopAll();
    for (const context of this.contexts.values()) {
      context.destroy();
    }
    this.contexts.clear();
  }

  /**
   * Start a specific context
   */
  start(contextId: string): void {
    const context = this.contexts.get(contextId);
    if (context) {
      context.start();
    }
  }

  /**
   * Stop a specific context
   */
  stop(contextId: string): void {
    const context = this.contexts.get(contextId);
    if (context) {
      context.stop();
    }
  }

  // ==========================================
  // Cleanup
  // ==========================================

  /**
   * Destroy all contexts and release resources
   */
  destroy(): void {
    console.log('[ShaderManager] destroy() called');
    console.trace('[ShaderManager] destroy() stack trace');

    this.stopAll();

    for (const context of this.contexts.values()) {
      context.destroy();
    }
    this.contexts.clear();

    if (this.device) {
      console.log('[ShaderManager] Destroying device...');
      this.device.destroy();
    }
    this.device = null;
    this.adapter = null;
    this.initialized = false;

    this.removeAllListeners();
    ShaderManager.instance = null;
    console.log('[ShaderManager] destroy() complete');
  }
}

/**
 * Singleton shader manager instance
 */
export const shaderManager = ShaderManager.getInstance();

// HMR handling - only in dev mode
if (import.meta.hot) {
  console.log('[ShaderManager] HMR is active');
  import.meta.hot.dispose(() => {
    console.log('[ShaderManager] HMR dispose triggered');
    // Don't destroy on HMR - causes device lost issues
    shaderManager.stopAll();
  });
  import.meta.hot.accept();
}