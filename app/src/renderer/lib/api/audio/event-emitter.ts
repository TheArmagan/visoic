// ============================================
// Visoic Audio FFT API - Event Emitter
// ============================================

import type { AudioEventType, AudioEventMap, AudioEventListener } from './types';

type ListenerEntry<T extends AudioEventType> = {
  listener: AudioEventListener<T>;
  once: boolean;
};

// ============================================
// Generic Event Emitter (for any event map)
// ============================================

type GenericListenerEntry<L> = {
  listener: L;
  once: boolean;
};

/**
 * Generic EventEmitter that can be used with any event map type
 */
export class EventEmitter<TEventMap extends Record<string, unknown[]>> {
  private listeners: Map<keyof TEventMap, Set<GenericListenerEntry<(...args: unknown[]) => void>>> = new Map();
  private maxListeners: number = 100;

  setMaxListeners(max: number): this {
    this.maxListeners = max;
    return this;
  }

  getMaxListeners(): number {
    return this.maxListeners;
  }

  on<K extends keyof TEventMap>(event: K, listener: (...args: TEventMap[K]) => void): this {
    return this.addListener(event, listener, false);
  }

  once<K extends keyof TEventMap>(event: K, listener: (...args: TEventMap[K]) => void): this {
    return this.addListener(event, listener, true);
  }

  off<K extends keyof TEventMap>(event: K, listener: (...args: TEventMap[K]) => void): this {
    const listeners = this.listeners.get(event);
    if (listeners) {
      for (const entry of listeners) {
        if (entry.listener === listener) {
          listeners.delete(entry);
          break;
        }
      }
    }
    return this;
  }

  removeAllListeners<K extends keyof TEventMap>(event?: K): this {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
    return this;
  }

  emit<K extends keyof TEventMap>(event: K, ...args: TEventMap[K]): boolean {
    const listeners = this.listeners.get(event);
    if (!listeners || listeners.size === 0) {
      return false;
    }

    const toRemove: GenericListenerEntry<(...args: unknown[]) => void>[] = [];

    for (const entry of listeners) {
      try {
        entry.listener(...args);
        if (entry.once) {
          toRemove.push(entry);
        }
      } catch (error) {
        console.error(`Error in event listener for '${String(event)}':`, error);
      }
    }

    for (const entry of toRemove) {
      listeners.delete(entry);
    }

    return true;
  }

  listenerCount<K extends keyof TEventMap>(event: K): number {
    return this.listeners.get(event)?.size ?? 0;
  }

  eventNames(): (keyof TEventMap)[] {
    return Array.from(this.listeners.keys());
  }

  private addListener<K extends keyof TEventMap>(
    event: K,
    listener: (...args: TEventMap[K]) => void,
    once: boolean
  ): this {
    let listeners = this.listeners.get(event);

    if (!listeners) {
      listeners = new Set();
      this.listeners.set(event, listeners);
    }

    if (listeners.size >= this.maxListeners) {
      console.warn(
        `MaxListenersExceeded: Possible memory leak detected. ` +
        `${listeners.size} listeners added for event '${String(event)}'. ` +
        `Use emitter.setMaxListeners() to increase limit.`
      );
    }

    listeners.add({ listener: listener as (...args: unknown[]) => void, once });
    return this;
  }
}

// ============================================
// Audio-specific Event Emitter (legacy support)
// ============================================

export class AudioEventEmitter {
  private listeners: Map<AudioEventType, Set<ListenerEntry<AudioEventType>>> = new Map();
  private maxListeners: number = 100;

  /**
   * Set maximum number of listeners per event type
   */
  setMaxListeners(max: number): this {
    this.maxListeners = max;
    return this;
  }

  /**
   * Get maximum number of listeners
   */
  getMaxListeners(): number {
    return this.maxListeners;
  }

  /**
   * Add an event listener
   */
  on<T extends AudioEventType>(event: T, listener: AudioEventListener<T>): this {
    return this.addListener(event, listener, false);
  }

  /**
   * Add a one-time event listener
   */
  once<T extends AudioEventType>(event: T, listener: AudioEventListener<T>): this {
    return this.addListener(event, listener, true);
  }

  /**
   * Remove an event listener
   */
  off<T extends AudioEventType>(event: T, listener: AudioEventListener<T>): this {
    const listeners = this.listeners.get(event);
    if (listeners) {
      for (const entry of listeners) {
        if (entry.listener === listener) {
          listeners.delete(entry);
          break;
        }
      }
    }
    return this;
  }

  /**
   * Remove all listeners for an event type, or all listeners if no type specified
   */
  removeAllListeners(event?: AudioEventType): this {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
    return this;
  }

  /**
   * Emit an event to all listeners
   */
  emit<T extends AudioEventType>(event: T, data: AudioEventMap[T]): boolean {
    const listeners = this.listeners.get(event);
    if (!listeners || listeners.size === 0) {
      return false;
    }

    const toRemove: ListenerEntry<AudioEventType>[] = [];

    for (const entry of listeners) {
      try {
        (entry.listener as AudioEventListener<T>)(data);
        if (entry.once) {
          toRemove.push(entry);
        }
      } catch (error) {
        console.error(`Error in audio event listener for '${event}':`, error);
      }
    }

    // Remove one-time listeners
    for (const entry of toRemove) {
      listeners.delete(entry);
    }

    return true;
  }

  /**
   * Get the number of listeners for an event type
   */
  listenerCount(event: AudioEventType): number {
    return this.listeners.get(event)?.size ?? 0;
  }

  /**
   * Get all event types with listeners
   */
  eventNames(): AudioEventType[] {
    return Array.from(this.listeners.keys());
  }

  private addListener<T extends AudioEventType>(
    event: T,
    listener: AudioEventListener<T>,
    once: boolean
  ): this {
    let listeners = this.listeners.get(event);

    if (!listeners) {
      listeners = new Set();
      this.listeners.set(event, listeners);
    }

    if (listeners.size >= this.maxListeners) {
      console.warn(
        `MaxListenersExceeded: Possible memory leak detected. ` +
        `${listeners.size} listeners added for event '${event}'. ` +
        `Use emitter.setMaxListeners() to increase limit.`
      );
    }

    listeners.add({ listener: listener as AudioEventListener<AudioEventType>, once });
    return this;
  }
}
