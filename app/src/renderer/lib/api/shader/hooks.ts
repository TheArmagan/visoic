// ============================================
// Visoic Shader API - Svelte Hooks
// ============================================

import { onMount, onDestroy } from 'svelte';
import { shaderManager, ShaderManager } from './shader-manager';
import { shaderValueBridge, type ShaderValueBridge } from './value-bridge';
import type { RenderContext } from './render-context';
import type { ShaderLayer } from './shader-layer';
import type { RenderContextConfig, ShaderLayerConfig, RenderStats } from './types';

/**
 * Hook to use the shader manager
 */
export function useShaderManager(): {
  manager: ShaderManager;
  initialize: () => Promise<boolean>;
  isSupported: boolean;
} {
  return {
    manager: shaderManager,
    initialize: () => shaderManager.initialize(),
    isSupported: ShaderManager.isSupported(),
  };
}

/**
 * Hook to create and manage a render context
 */
export function useRenderContext(
  config: RenderContextConfig,
  options?: {
    autoStart?: boolean;
    onFrame?: (stats: RenderStats) => void;
    onError?: (error: Error) => void;
  }
): {
  context: RenderContext | null;
  isInitialized: boolean;
  start: () => void;
  stop: () => void;
  destroy: () => void;
} {
  let context: RenderContext | null = null;
  let isInitialized = false;
  let unsubscribers: Array<() => void> = [];

  const initialize = async () => {
    if (!shaderManager.isInitialized()) {
      await shaderManager.initialize();
    }

    context = await shaderManager.createContext(config);
    isInitialized = true;

    if (options?.onFrame) {
      unsubscribers.push(
        context.on('frame', (data) => options.onFrame!(data.stats))
      );
    }

    if (options?.onError) {
      unsubscribers.push(
        context.on('error', (data) => options.onError!(data.error))
      );
    }

    if (options?.autoStart !== false) {
      context.start();
    }
  };

  const cleanup = () => {
    unsubscribers.forEach(unsub => unsub());
    unsubscribers = [];

    if (context) {
      shaderManager.destroyContext(config.id);
      context = null;
      isInitialized = false;
    }
  };

  // Auto-initialize in Svelte context
  if (typeof window !== 'undefined') {
    onMount(() => {
      initialize();
    });

    onDestroy(() => {
      cleanup();
    });
  }

  return {
    get context() { return context; },
    get isInitialized() { return isInitialized; },
    start: () => context?.start(),
    stop: () => context?.stop(),
    destroy: cleanup,
  };
}

/**
 * Hook to manage shader layers
 */
export function useShaderLayer(
  contextId: string,
  config: ShaderLayerConfig
): {
  layer: ShaderLayer | null;
  setUniform: (name: string, value: unknown) => void;
  setNormalizedUniform: (name: string, value: number) => void;
  setEnabled: (enabled: boolean) => void;
  setOpacity: (opacity: number) => void;
  destroy: () => void;
} {
  let layer: ShaderLayer | null = null;

  const initialize = () => {
    const context = shaderManager.getContext(contextId);
    if (context) {
      layer = context.addLayer(config);
    }
  };

  const cleanup = () => {
    if (layer) {
      const context = shaderManager.getContext(contextId);
      context?.removeLayer(config.id);
      layer = null;
    }
  };

  // Auto-initialize in Svelte context
  if (typeof window !== 'undefined') {
    onMount(() => {
      // Delay to ensure context is created first
      setTimeout(initialize, 0);
    });

    onDestroy(() => {
      cleanup();
    });
  }

  return {
    get layer() { return layer; },
    setUniform: (name, value) => layer?.setUniform(name, value as any),
    setNormalizedUniform: (name, value) => layer?.setNormalizedUniform(name, value),
    setEnabled: (enabled) => { if (layer) layer.enabled = enabled; },
    setOpacity: (opacity) => { if (layer) layer.opacity = opacity; },
    destroy: cleanup,
  };
}

/**
 * Hook to use the value bridge
 */
export function useShaderValueBridge(): {
  bridge: ShaderValueBridge;
  bind: (
    bindingId: string,
    contextId: string,
    layerId: string,
    uniformName: string,
    valueId: string,
    transform?: (value: number) => number
  ) => void;
  unbind: (bindingId: string) => void;
  sync: () => void;
} {
  const cleanup = () => {
    shaderValueBridge.stop();
  };

  if (typeof window !== 'undefined') {
    onMount(() => {
      shaderValueBridge.start();
    });

    onDestroy(() => {
      cleanup();
    });
  }

  return {
    bridge: shaderValueBridge,
    bind: (bindingId, contextId, layerId, uniformName, valueId, transform) => {
      shaderValueBridge.bind(bindingId, contextId, layerId, uniformName, valueId, transform);
    },
    unbind: (bindingId) => shaderValueBridge.unbind(bindingId),
    sync: () => shaderValueBridge.sync(),
  };
}

/**
 * Create a reactive shader uniform from a Svelte store
 */
export function createUniformBinding<T>(
  contextId: string,
  layerId: string,
  uniformName: string,
  initialValue: T
): {
  get: () => T;
  set: (value: T) => void;
  subscribe: (callback: (value: T) => void) => () => void;
} {
  let value = initialValue;
  const subscribers = new Set<(value: T) => void>();

  const updateUniform = (newValue: T) => {
    value = newValue;
    const layer = shaderManager.getLayer(contextId, layerId);
    if (layer) {
      layer.setUniform(uniformName, newValue as any);
    }
    subscribers.forEach(callback => callback(newValue));
  };

  return {
    get: () => value,
    set: updateUniform,
    subscribe: (callback) => {
      subscribers.add(callback);
      callback(value); // Initial call
      return () => subscribers.delete(callback);
    },
  };
}
