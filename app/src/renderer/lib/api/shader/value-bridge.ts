// ============================================
// Visoic Shader API - Value Bridge
// ============================================

import { shaderManager } from './shader-manager';
import { valueManager } from '../values';

/**
 * Bridge between Value Manager and Shader System
 * 
 * Allows binding values from the Value Manager to shader uniforms,
 * enabling real-time data-driven visualizations.
 */
export class ShaderValueBridge {
  private bindings: Map<string, {
    contextId: string;
    layerId: string;
    uniformName: string;
    valueId: string;
    transform?: (value: number) => number;
    unsubscribe?: () => void;
  }> = new Map();

  private isActive: boolean = false;

  /**
   * Start the bridge - begins syncing values to uniforms
   */
  start(): void {
    if (this.isActive) return;
    this.isActive = true;

    // Subscribe to value changes
    for (const [bindingId, binding] of this.bindings) {
      this.subscribeToValue(bindingId, binding);
    }
  }

  /**
   * Stop the bridge
   */
  stop(): void {
    this.isActive = false;

    // Unsubscribe from all value changes
    for (const [, binding] of this.bindings) {
      if (binding.unsubscribe) {
        binding.unsubscribe();
        binding.unsubscribe = undefined;
      }
    }
  }

  /**
   * Bind a value to a shader uniform
   */
  bind(
    bindingId: string,
    contextId: string,
    layerId: string,
    uniformName: string,
    valueId: string,
    transform?: (value: number) => number
  ): void {
    // Remove existing binding if any
    this.unbind(bindingId);

    const binding = {
      contextId,
      layerId,
      uniformName,
      valueId,
      transform,
      unsubscribe: undefined as (() => void) | undefined,
    };

    this.bindings.set(bindingId, binding);

    if (this.isActive) {
      this.subscribeToValue(bindingId, binding);
    }
  }

  /**
   * Unbind a value
   */
  unbind(bindingId: string): void {
    const binding = this.bindings.get(bindingId);
    if (binding?.unsubscribe) {
      binding.unsubscribe();
    }
    this.bindings.delete(bindingId);
  }

  /**
   * Subscribe to value changes for a binding
   */
  private subscribeToValue(
    bindingId: string,
    binding: {
      contextId: string;
      layerId: string;
      uniformName: string;
      valueId: string;
      transform?: (value: number) => number;
      unsubscribe?: () => void;
    }
  ): void {
    const updateUniform = (newValue: unknown) => {
      let value = newValue;

      if (typeof value === 'number' && binding.transform) {
        value = binding.transform(value);
      }

      const layer = shaderManager.getLayer(binding.contextId, binding.layerId);
      if (layer && value !== undefined && value !== null) {
        layer.setUniform(binding.uniformName, value as number);
      }
    };

    // Initial sync
    const initialValue = valueManager.get(binding.valueId);
    updateUniform(initialValue);

    // Subscribe to value changes using valueManager.watch
    binding.unsubscribe = valueManager.watch(binding.valueId, (newValue) => {
      updateUniform(newValue);
    });
  }

  /**
   * Sync all bindings manually (useful for polling mode)
   */
  sync(): void {
    if (!this.isActive) return;

    for (const [, binding] of this.bindings) {
      let value = valueManager.get(binding.valueId);

      if (typeof value === 'number' && binding.transform) {
        value = binding.transform(value);
      }

      const layer = shaderManager.getLayer(binding.contextId, binding.layerId);
      if (layer && value !== undefined && value !== null) {
        layer.setUniform(binding.uniformName, value as number);
      }
    }
  }

  /**
   * Get all bindings for a context
   */
  getContextBindings(contextId: string) {
    const result: Array<{
      bindingId: string;
      layerId: string;
      uniformName: string;
      valueId: string;
    }> = [];

    for (const [bindingId, binding] of this.bindings) {
      if (binding.contextId === contextId) {
        result.push({
          bindingId,
          layerId: binding.layerId,
          uniformName: binding.uniformName,
          valueId: binding.valueId,
        });
      }
    }

    return result;
  }

  /**
   * Get all bindings for a layer
   */
  getLayerBindings(contextId: string, layerId: string) {
    const result: Array<{
      bindingId: string;
      uniformName: string;
      valueId: string;
    }> = [];

    for (const [bindingId, binding] of this.bindings) {
      if (binding.contextId === contextId && binding.layerId === layerId) {
        result.push({
          bindingId,
          uniformName: binding.uniformName,
          valueId: binding.valueId,
        });
      }
    }

    return result;
  }

  /**
   * Clear all bindings
   */
  clear(): void {
    this.stop();
    this.bindings.clear();
  }

  /**
   * Destroy the bridge
   */
  destroy(): void {
    this.clear();
  }
}

/**
 * Singleton value bridge instance
 */
export const shaderValueBridge = new ShaderValueBridge();
