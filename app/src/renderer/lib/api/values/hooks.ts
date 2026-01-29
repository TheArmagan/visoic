// ============================================
// Visoic Value Manager - Svelte Hooks
// ============================================

import { writable, readable, derived, type Readable, type Writable } from 'svelte/store';
import { onDestroy, onMount } from 'svelte';
import { valueManager } from './value-manager';
import { audioBridge } from './audio-bridge';
import type { AnyValueDefinition, NumberValueDefinition, AudioExtraction } from './types';

/**
 * Create a reactive store for a single value
 */
export function useValue<T = unknown>(id: string): Readable<T | undefined> {
  const store = writable<T | undefined>(valueManager.get<T>(id));

  let unsubscribe: (() => void) | null = null;

  onMount(() => {
    // Get initial value
    store.set(valueManager.get<T>(id));

    // Subscribe to changes
    unsubscribe = valueManager.watch(id, (newValue) => {
      store.set(newValue as T);
    });
  });

  onDestroy(() => {
    unsubscribe?.();
  });

  return { subscribe: store.subscribe };
}

/**
 * Create a writable store for a value (two-way binding)
 */
export function useValueWritable<T = unknown>(id: string): Writable<T | undefined> {
  const internal = writable<T | undefined>(valueManager.get<T>(id));
  let unsubscribe: (() => void) | null = null;
  let isInternalUpdate = false;

  onMount(() => {
    internal.set(valueManager.get<T>(id));

    unsubscribe = valueManager.watch(id, (newValue) => {
      if (!isInternalUpdate) {
        internal.set(newValue as T);
      }
    });
  });

  onDestroy(() => {
    unsubscribe?.();
  });

  return {
    subscribe: internal.subscribe,
    set: (value: T | undefined) => {
      isInternalUpdate = true;
      internal.set(value);
      if (value !== undefined) {
        valueManager.set(id, value);
      }
      isInternalUpdate = false;
    },
    update: (fn: (value: T | undefined) => T | undefined) => {
      internal.update((current) => {
        const newValue = fn(current);
        isInternalUpdate = true;
        if (newValue !== undefined) {
          valueManager.set(id, newValue);
        }
        isInternalUpdate = false;
        return newValue;
      });
    },
  };
}

/**
 * Create a reactive store for multiple values
 */
export function useValues(ids: string[]): Readable<Record<string, unknown>> {
  const store = writable<Record<string, unknown>>(valueManager.getMany(ids));
  const unsubscribes: (() => void)[] = [];

  onMount(() => {
    store.set(valueManager.getMany(ids));

    for (const id of ids) {
      const unsub = valueManager.watch(id, () => {
        store.set(valueManager.getMany(ids));
      });
      unsubscribes.push(unsub);
    }
  });

  onDestroy(() => {
    for (const unsub of unsubscribes) {
      unsub();
    }
  });

  return { subscribe: store.subscribe };
}

/**
 * Create a reactive store for all values in a category
 */
export function useCategory(category: string): Readable<AnyValueDefinition[]> {
  const store = writable<AnyValueDefinition[]>(valueManager.getByCategory(category));

  let unsubscribeChange: (() => void) | null = null;
  let unsubscribeAdd: (() => void) | null = null;
  let unsubscribeRemove: (() => void) | null = null;

  onMount(() => {
    const update = () => store.set(valueManager.getByCategory(category));

    update();

    unsubscribeChange = valueManager.on('change', update);
    unsubscribeAdd = valueManager.on('add', update);
    unsubscribeRemove = valueManager.on('remove', update);
  });

  onDestroy(() => {
    unsubscribeChange?.();
    unsubscribeAdd?.();
    unsubscribeRemove?.();
  });

  return { subscribe: store.subscribe };
}

/**
 * Create a reactive store for all value definitions
 */
export function useAllValues(): Readable<AnyValueDefinition[]> {
  const store = writable<AnyValueDefinition[]>(valueManager.getAllDefinitions());

  let unsubscribeChange: (() => void) | null = null;
  let unsubscribeAdd: (() => void) | null = null;
  let unsubscribeRemove: (() => void) | null = null;

  onMount(() => {
    const update = () => store.set(valueManager.getAllDefinitions());

    update();

    unsubscribeChange = valueManager.on('change', update);
    unsubscribeAdd = valueManager.on('add', update);
    unsubscribeRemove = valueManager.on('remove', update);
  });

  onDestroy(() => {
    unsubscribeChange?.();
    unsubscribeAdd?.();
    unsubscribeRemove?.();
  });

  return { subscribe: store.subscribe };
}

/**
 * Create a reactive store for value definition
 */
export function useValueDefinition(id: string): Readable<AnyValueDefinition | undefined> {
  const store = writable<AnyValueDefinition | undefined>(valueManager.getDefinition(id));

  let unsubscribe: (() => void) | null = null;

  onMount(() => {
    store.set(valueManager.getDefinition(id));

    unsubscribe = valueManager.on('change', (event) => {
      if (event.valueId === id) {
        store.set(valueManager.getDefinition(id));
      }
    });
  });

  onDestroy(() => {
    unsubscribe?.();
  });

  return { subscribe: store.subscribe };
}

// ============================================
// Audio Bridge Hooks
// ============================================

/**
 * Get all audio analyzer handles
 */
export function useAudioAnalyzers(): Readable<ReturnType<typeof audioBridge.getAnalyzers>> {
  const store = writable(audioBridge.getAnalyzers());

  // Simple polling since we don't have proper events for analyzer changes
  let interval: ReturnType<typeof setInterval> | null = null;

  onMount(() => {
    store.set(audioBridge.getAnalyzers());
    interval = setInterval(() => {
      store.set(audioBridge.getAnalyzers());
    }, 1000);
  });

  onDestroy(() => {
    if (interval) clearInterval(interval);
  });

  return { subscribe: store.subscribe };
}

/**
 * Get all audio bindings
 */
export function useAudioBindings(): Readable<ReturnType<typeof audioBridge.getBindings>> {
  const store = writable(audioBridge.getBindings());

  let interval: ReturnType<typeof setInterval> | null = null;

  onMount(() => {
    store.set(audioBridge.getBindings());
    interval = setInterval(() => {
      store.set(audioBridge.getBindings());
    }, 500);
  });

  onDestroy(() => {
    if (interval) clearInterval(interval);
  });

  return { subscribe: store.subscribe };
}
