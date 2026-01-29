// ============================================
// Visoic Audio FFT API - Svelte Hooks
// ============================================

import { writable, derived, readable, type Readable, type Writable } from 'svelte/store';
import { onDestroy, onMount } from 'svelte';
import {
  audioManager,
  type AnalyzerHandle,
  type CreateAnalyzerOptions,
  type AnalyzerData,
  type FrequencyBandData,
  type AudioDeviceInfo,
  type DataEvent,
} from './index';

/**
 * Svelte store for audio analyzer data
 */
export interface AnalyzerStore {
  /** Current analyzer data */
  data: Readable<AnalyzerData | null>;
  /** Current frequency bands */
  bands: Readable<FrequencyBandData | null>;
  /** Whether the analyzer is active */
  isActive: Readable<boolean>;
  /** The analyzer handle */
  handle: AnalyzerHandle | null;
  /** Destroy the analyzer */
  destroy: () => void;
}

/**
 * Create a reactive analyzer store for use in Svelte components
 * 
 * @example
 * ```svelte
 * <script>
 *   import { useAnalyzer } from '$lib/api/audio/hooks';
 *   
 *   const { data, bands, isActive } = useAnalyzer({
 *     fftSize: 1024,
 *     smoothingTimeConstant: 0.8,
 *   });
 * </script>
 * 
 * {#if $isActive}
 *   <div>Average: {$data?.averageAmplitude}</div>
 *   <div>Bass: {$bands?.bass}</div>
 * {/if}
 * ```
 */
export function useAnalyzer(options: CreateAnalyzerOptions = {}): AnalyzerStore {
  const dataStore = writable<AnalyzerData | null>(null);
  const bandsStore = writable<FrequencyBandData | null>(null);
  const isActiveStore = writable(false);

  let handle: AnalyzerHandle | null = null;
  let unsubscribe: (() => void) | null = null;

  const init = async () => {
    try {
      if (!audioManager.isInitialized()) {
        await audioManager.initialize();
      }

      handle = await audioManager.createAnalyzer(options);
      isActiveStore.set(true);

      unsubscribe = handle.onData((event) => {
        dataStore.set(event.data);
        bandsStore.set(event.frequencyBands);
      });
    } catch (error) {
      console.error('Failed to create analyzer:', error);
      isActiveStore.set(false);
    }
  };

  const destroy = () => {
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
    if (handle) {
      handle.destroy();
      handle = null;
    }
    isActiveStore.set(false);
    dataStore.set(null);
    bandsStore.set(null);
  };

  // Auto-initialize on mount
  onMount(() => {
    init();
  });

  // Auto-cleanup on destroy
  onDestroy(() => {
    destroy();
  });

  return {
    data: { subscribe: dataStore.subscribe },
    bands: { subscribe: bandsStore.subscribe },
    isActive: { subscribe: isActiveStore.subscribe },
    get handle() { return handle; },
    destroy,
  };
}

/**
 * Create multiple analyzers as a single store
 */
export interface MultiAnalyzerStore {
  /** Map of analyzer ID to data */
  analyzers: Readable<Map<string, { data: AnalyzerData; bands: FrequencyBandData }>>;
  /** All handles */
  handles: AnalyzerHandle[];
  /** Add a new analyzer */
  add: (options: CreateAnalyzerOptions) => Promise<AnalyzerHandle>;
  /** Remove an analyzer by ID */
  remove: (id: string) => void;
  /** Destroy all analyzers */
  destroyAll: () => void;
}

/**
 * Create multiple reactive analyzer stores
 * 
 * @example
 * ```svelte
 * <script>
 *   import { useMultiAnalyzer } from '$lib/api/audio/hooks';
 *   
 *   const { analyzers, add, remove } = useMultiAnalyzer([
 *     { fftSize: 128, label: 'fast' },
 *     { fftSize: 1024, label: 'detailed' },
 *   ]);
 *   
 *   // Add another analyzer dynamically
 *   async function addAnalyzer() {
 *     await add({ fftSize: 2048, gain: 2.0 });
 *   }
 * </script>
 * 
 * {#each [...$analyzers] as [id, { data, bands }]}
 *   <div>{id}: {data.averageAmplitude}</div>
 * {/each}
 * ```
 */
export function useMultiAnalyzer(
  initialConfigs: CreateAnalyzerOptions[] = []
): MultiAnalyzerStore {
  const analyzersStore = writable<Map<string, { data: AnalyzerData; bands: FrequencyBandData }>>(
    new Map()
  );

  const handles: AnalyzerHandle[] = [];
  const unsubscribers: Map<string, () => void> = new Map();

  const add = async (options: CreateAnalyzerOptions): Promise<AnalyzerHandle> => {
    if (!audioManager.isInitialized()) {
      await audioManager.initialize();
    }

    const handle = await audioManager.createAnalyzer(options);
    handles.push(handle);

    const unsub = handle.onData((event) => {
      analyzersStore.update((map) => {
        map.set(handle.id, {
          data: event.data,
          bands: event.frequencyBands,
        });
        return new Map(map);
      });
    });

    unsubscribers.set(handle.id, unsub);
    return handle;
  };

  const remove = (id: string) => {
    const index = handles.findIndex(h => h.id === id);
    if (index !== -1) {
      const handle = handles[index];
      const unsub = unsubscribers.get(id);

      if (unsub) {
        unsub();
        unsubscribers.delete(id);
      }

      handle.destroy();
      handles.splice(index, 1);

      analyzersStore.update((map) => {
        map.delete(id);
        return new Map(map);
      });
    }
  };

  const destroyAll = () => {
    for (const unsub of unsubscribers.values()) {
      unsub();
    }
    unsubscribers.clear();

    for (const handle of handles) {
      handle.destroy();
    }
    handles.length = 0;

    analyzersStore.set(new Map());
  };

  // Initialize with initial configs
  onMount(async () => {
    for (const config of initialConfigs) {
      await add(config);
    }
  });

  // Cleanup on destroy
  onDestroy(() => {
    destroyAll();
  });

  return {
    analyzers: { subscribe: analyzersStore.subscribe },
    handles,
    add,
    remove,
    destroyAll,
  };
}

/**
 * Reactive store for available audio devices
 */
export function useAudioDevices(): Readable<AudioDeviceInfo[]> {
  const store = writable<AudioDeviceInfo[]>([]);
  let unsubscribe: (() => void) | null = null;

  onMount(async () => {
    if (!audioManager.isInitialized()) {
      await audioManager.initialize();
    }

    store.set(audioManager.getInputDevices());

    const listener = () => {
      store.set(audioManager.getInputDevices());
    };

    audioManager.on('deviceChange', listener);
    unsubscribe = () => audioManager.off('deviceChange', listener);
  });

  onDestroy(() => {
    if (unsubscribe) {
      unsubscribe();
    }
  });

  return { subscribe: store.subscribe };
}

/**
 * Subscribe to beat events
 */
export function useBeats(
  analyzerId?: string,
  callback?: (intensity: number, bpm: number) => void
): Readable<{ detected: boolean; intensity: number; bpm: number; bpmConfidence: number; timestamp: number }> {
  const store = writable({ detected: false, intensity: 0, bpm: 0, bpmConfidence: 0, timestamp: 0 });

  onMount(() => {
    const listener = (event: any) => {
      if (!analyzerId || event.analyzerId === analyzerId) {
        store.set({
          detected: true,
          intensity: event.data.intensity,
          bpm: event.data.bpm,
          bpmConfidence: event.data.bpmConfidence,
          timestamp: event.timestamp,
        });
        callback?.(event.data.intensity, event.data.bpm);

        // Reset detected after a short delay
        setTimeout(() => {
          store.update(s => ({ ...s, detected: false }));
        }, 100);
      }
    };

    audioManager.on('beat', listener);

    return () => {
      audioManager.off('beat', listener);
    };
  });

  return { subscribe: store.subscribe };
}

/**
 * Subscribe to peak events
 */
export function usePeaks(
  analyzerId?: string,
  callback?: (level: number, frequency: number) => void
): Readable<{ detected: boolean; level: number; frequency: number; timestamp: number }> {
  const store = writable({ detected: false, level: 0, frequency: 0, timestamp: 0 });

  onMount(() => {
    const listener = (event: any) => {
      if (!analyzerId || event.analyzerId === analyzerId) {
        store.set({
          detected: true,
          level: event.data.level,
          frequency: event.data.frequency,
          timestamp: event.timestamp,
        });
        callback?.(event.data.level, event.data.frequency);

        // Reset detected after a short delay
        setTimeout(() => {
          store.update(s => ({ ...s, detected: false }));
        }, 100);
      }
    };

    audioManager.on('peak', listener);

    return () => {
      audioManager.off('peak', listener);
    };
  });

  return { subscribe: store.subscribe };
}

/**
 * Subscribe to BPM updates
 * 
 * @example
 * ```svelte
 * <script>
 *   import { useBPM } from '$lib/api/audio';
 *   const bpm = useBPM();
 * </script>
 * 
 * {#if $bpm.confidence > 0.5}
 *   <div>BPM: {$bpm.value}</div>
 * {/if}
 * ```
 */
export function useBPM(
  analyzerId?: string,
  callback?: (bpm: number, confidence: number) => void
): Readable<{ value: number; confidence: number; isStable: boolean }> {
  const store = writable({ value: 0, confidence: 0, isStable: false });

  onMount(() => {
    const listener = (event: any) => {
      if (!analyzerId || event.analyzerId === analyzerId) {
        const bpm = event.data.bpm;
        const confidence = event.data.bpmConfidence;
        const isStable = confidence > 0.6;

        store.set({ value: bpm, confidence, isStable });
        callback?.(bpm, confidence);
      }
    };

    audioManager.on('beat', listener);

    return () => {
      audioManager.off('beat', listener);
    };
  });

  return { subscribe: store.subscribe };
}
