// ============================================
// Visoic Shader API - Event Emitter
// ============================================

type EventCallback<T> = (data: T) => void;

/**
 * Generic type-safe event emitter
 */
export class EventEmitter<TEventMap extends Record<string, unknown>> {
  private listeners: Map<keyof TEventMap, Set<EventCallback<unknown>>> = new Map();

  /**
   * Subscribe to an event
   */
  on<K extends keyof TEventMap>(event: K, callback: EventCallback<TEventMap[K]>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback as EventCallback<unknown>);

    // Return unsubscribe function
    return () => this.off(event, callback);
  }

  /**
   * Subscribe to an event once
   */
  once<K extends keyof TEventMap>(event: K, callback: EventCallback<TEventMap[K]>): () => void {
    const wrapper: EventCallback<TEventMap[K]> = (data) => {
      this.off(event, wrapper);
      callback(data);
    };
    return this.on(event, wrapper);
  }

  /**
   * Unsubscribe from an event
   */
  off<K extends keyof TEventMap>(event: K, callback: EventCallback<TEventMap[K]>): void {
    const listeners = this.listeners.get(event);
    if (listeners) {
      listeners.delete(callback as EventCallback<unknown>);
    }
  }

  /**
   * Emit an event
   */
  protected emit<K extends keyof TEventMap>(event: K, data: TEventMap[K]): void {
    const listeners = this.listeners.get(event);
    if (listeners) {
      listeners.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in event listener for ${String(event)}:`, error);
        }
      });
    }
  }

  /**
   * Remove all listeners for an event or all events
   */
  removeAllListeners(event?: keyof TEventMap): void {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }

  /**
   * Get listener count for an event
   */
  listenerCount(event: keyof TEventMap): number {
    return this.listeners.get(event)?.size ?? 0;
  }
}
