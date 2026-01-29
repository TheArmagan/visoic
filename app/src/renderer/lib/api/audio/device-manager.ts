// ============================================
// Visoic Audio FFT API - Device Manager
// ============================================

import type {
  AudioDeviceInfo,
  DeviceChangeEvent,
  ErrorEvent,
  AudioEventType,
  AudioEventListener,
} from './types';
import { AudioEventEmitter } from './event-emitter';

export class AudioDeviceManager extends AudioEventEmitter {
  private devices: Map<string, AudioDeviceInfo> = new Map();
  private initialized = false;
  private deviceChangeHandler: (() => void) | null = null;

  constructor() {
    super();
  }

  /**
   * Initialize the device manager and start listening for device changes
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Request permission first (needed to get device labels)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());
    } catch (error) {
      const errorEvent: ErrorEvent = {
        type: 'error',
        timestamp: performance.now(),
        data: {
          code: 'PERMISSION_DENIED',
          message: 'Microphone permission denied',
        },
      };
      this.emit('error', errorEvent);
      throw error;
    }

    // Load initial devices
    await this.refreshDevices();

    // Listen for device changes
    this.deviceChangeHandler = () => {
      this.refreshDevices();
    };
    navigator.mediaDevices.addEventListener('devicechange', this.deviceChangeHandler);

    this.initialized = true;
  }

  /**
   * Refresh the list of available audio devices
   */
  async refreshDevices(): Promise<AudioDeviceInfo[]> {
    try {
      const mediaDevices = await navigator.mediaDevices.enumerateDevices();

      const oldDeviceIds = new Set(this.devices.keys());
      this.devices.clear();

      const defaultDeviceId = await this.getDefaultDeviceId();

      for (const device of mediaDevices) {
        if (device.kind === 'audioinput' || device.kind === 'audiooutput') {
          const info: AudioDeviceInfo = {
            deviceId: device.deviceId,
            label: device.label || `${device.kind === 'audioinput' ? 'Microphone' : 'Speaker'} ${this.devices.size + 1}`,
            groupId: device.groupId,
            kind: device.kind,
            isDefault: device.deviceId === defaultDeviceId || device.deviceId === 'default',
          };
          this.devices.set(device.deviceId, info);
        }
      }

      // Check if devices changed
      const newDeviceIds = new Set(this.devices.keys());
      const hasChanges =
        oldDeviceIds.size !== newDeviceIds.size ||
        [...oldDeviceIds].some(id => !newDeviceIds.has(id));

      if (hasChanges) {
        const event: DeviceChangeEvent = {
          type: 'deviceChange',
          timestamp: performance.now(),
          data: this.getAllDevices(),
        };
        this.emit('deviceChange', event);
      }

      return this.getAllDevices();
    } catch (error) {
      const errorEvent: ErrorEvent = {
        type: 'error',
        timestamp: performance.now(),
        data: {
          code: 'ENUMERATE_FAILED',
          message: `Failed to enumerate devices: ${error}`,
        },
      };
      this.emit('error', errorEvent);
      throw error;
    }
  }

  /**
   * Get all available audio devices
   */
  getAllDevices(): AudioDeviceInfo[] {
    return Array.from(this.devices.values());
  }

  /**
   * Get only input devices (microphones)
   */
  getInputDevices(): AudioDeviceInfo[] {
    return this.getAllDevices().filter(d => d.kind === 'audioinput');
  }

  /**
   * Get only output devices (speakers)
   */
  getOutputDevices(): AudioDeviceInfo[] {
    return this.getAllDevices().filter(d => d.kind === 'audiooutput');
  }

  /**
   * Get a device by ID
   */
  getDevice(deviceId: string): AudioDeviceInfo | undefined {
    return this.devices.get(deviceId);
  }

  /**
   * Get the default input device
   */
  getDefaultInputDevice(): AudioDeviceInfo | undefined {
    return this.getInputDevices().find(d => d.isDefault) || this.getInputDevices()[0];
  }

  /**
   * Get the default output device
   */
  getDefaultOutputDevice(): AudioDeviceInfo | undefined {
    return this.getOutputDevices().find(d => d.isDefault) || this.getOutputDevices()[0];
  }

  /**
   * Check if a device exists
   */
  hasDevice(deviceId: string): boolean {
    return this.devices.has(deviceId);
  }

  /**
   * Get the system default device ID
   */
  private async getDefaultDeviceId(): Promise<string | null> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const defaultDevice = devices.find(
        d => d.kind === 'audioinput' && d.deviceId === 'default'
      );
      return defaultDevice?.deviceId ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Request permission to use audio devices
   */
  async requestPermission(): Promise<boolean> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if permission is granted
   */
  async checkPermission(): Promise<PermissionState> {
    try {
      const result = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      return result.state;
    } catch {
      // Fallback: try to enumerate devices
      const devices = await navigator.mediaDevices.enumerateDevices();
      const hasLabels = devices.some(d => d.label !== '');
      return hasLabels ? 'granted' : 'prompt';
    }
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.deviceChangeHandler) {
      navigator.mediaDevices.removeEventListener('devicechange', this.deviceChangeHandler);
      this.deviceChangeHandler = null;
    }
    this.devices.clear();
    this.removeAllListeners();
    this.initialized = false;
  }
}
