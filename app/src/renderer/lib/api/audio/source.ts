// ============================================
// Visoic Audio FFT API - Audio Source
// ============================================

import type {
  AudioSourceConfig,
  AnalyzerConfig,
  AudioEventType,
  AudioEventListener,
  DataEvent,
  PeakEvent,
  BeatEvent,
  StateChangeEvent,
} from './types';
import { AudioEventEmitter } from './event-emitter';
import { FFTAnalyzer } from './analyzer';

let sourceIdCounter = 0;

function generateSourceId(): string {
  return `source_${Date.now()}_${++sourceIdCounter}`;
}

export type AudioSourceState = 'inactive' | 'active' | 'suspended' | 'error';

export class AudioSource extends AudioEventEmitter {
  public readonly id: string;
  public readonly deviceId: string;
  public readonly sourceType: 'microphone' | 'desktop' | 'application';
  public readonly desktopSourceId?: string;

  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private gainNode: GainNode | null = null; // For listen/mute functionality
  private analyzers: Map<string, FFTAnalyzer> = new Map();
  private config: AudioSourceConfig;
  private state: AudioSourceState = 'inactive';
  private animationFrameId: number | null = null;
  private isRunning = false;
  private listening: boolean = false;

  // Peak detection settings
  private peakThreshold = 0.9;
  private lastPeakTime: Map<string, number> = new Map();
  private peakCooldown = 100; // ms

  // Beat detection settings
  private beatThreshold = 1.5;

  constructor(config: AudioSourceConfig) {
    super();
    this.id = generateSourceId();
    this.deviceId = config.deviceId;
    this.sourceType = config.sourceType ?? 'microphone';
    this.desktopSourceId = config.desktopSourceId;
    this.config = {
      sampleRate: 48000,
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      channelCount: 2,
      ...config,
    };
  }

  /**
   * Get current state
   */
  getState(): AudioSourceState {
    return this.state;
  }

  /**
   * Check if source is active
   */
  isActive(): boolean {
    return this.state === 'active' && this.isRunning;
  }

  /**
   * Get audio context
   */
  getAudioContext(): AudioContext | null {
    return this.audioContext;
  }

  /**
   * Get sample rate
   */
  getSampleRate(): number {
    return this.audioContext?.sampleRate ?? this.config.sampleRate ?? 48000;
  }

  /**
   * Initialize the audio source
   */
  async start(): Promise<void> {
    if (this.state === 'active') {
      return;
    }

    console.log(`[AudioSource] Starting source:`, {
      id: this.id,
      sourceType: this.sourceType,
      desktopSourceId: this.desktopSourceId,
      deviceId: this.deviceId,
    });

    try {
      // Create audio context
      this.audioContext = new AudioContext({
        sampleRate: this.config.sampleRate,
      });

      // Request media stream based on source type
      if (this.sourceType === 'desktop' || this.sourceType === 'application') {
        // Desktop/Application audio capture using Electron's chromeMediaSource
        if (!this.desktopSourceId) {
          throw new Error('Desktop source ID is required for desktop/application audio capture. Please select a source first.');
        }

        // Use Electron-specific constraints (like MediaNode)
        this.mediaStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            // @ts-ignore - Electron specific constraint
            mandatory: {
              chromeMediaSource: 'desktop',
              chromeMediaSourceId: this.desktopSourceId,
            },
          },
          video: {
            // @ts-ignore - Electron specific constraint - video is required but we'll stop it
            mandatory: {
              chromeMediaSource: 'desktop',
              chromeMediaSourceId: this.desktopSourceId,
            },
          },
        });

        // Stop video tracks - we only need audio
        const videoTracks = this.mediaStream.getVideoTracks();
        videoTracks.forEach(track => track.stop());

        // Check if we got an audio track
        const audioTracks = this.mediaStream.getAudioTracks();
        if (audioTracks.length === 0) {
          throw new Error('No audio track available from the selected source.');
        }

        // Create source node from media stream
        this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);
      } else {
        // Microphone audio capture using getUserMedia
        const constraints: MediaStreamConstraints = {
          audio: {
            deviceId: this.deviceId === 'default' ? undefined : { exact: this.deviceId },
            echoCancellation: this.config.echoCancellation,
            noiseSuppression: this.config.noiseSuppression,
            autoGainControl: this.config.autoGainControl,
            channelCount: this.config.channelCount,
            sampleRate: this.config.sampleRate,
          },
        };

        this.mediaStream = await navigator.mediaDevices.getUserMedia(constraints);

        // Create source node from media stream
        this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);
      }

      // Reconnect existing analyzers
      for (const analyzer of this.analyzers.values()) {
        analyzer.destroy();
      }
      this.analyzers.clear();

      this.setState('active');
      this.startLoop();

    } catch (error) {
      this.setState('error');
      throw error;
    }
  }

  /**
   * Set listen mode (output to speakers)
   */
  setListening(listen: boolean): void {
    this.listening = listen;
    if (this.gainNode) {
      this.gainNode.gain.value = listen ? 1.0 : 0.0;
    }
  }

  /**
   * Get current listening state
   */
  isListening(): boolean {
    return this.listening;
  }

  /**
   * Stop the audio source
   */
  async stop(): Promise<void> {
    this.stopLoop();

    // Stop all media tracks
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }

    // Disconnect source node
    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }

    // Close audio context
    if (this.audioContext) {
      await this.audioContext.close();
      this.audioContext = null;
    }

    // Destroy all analyzers
    for (const analyzer of this.analyzers.values()) {
      analyzer.destroy();
    }
    this.analyzers.clear();

    this.setState('inactive');
  }

  /**
   * Suspend audio processing
   */
  async suspend(): Promise<void> {
    if (this.audioContext && this.state === 'active') {
      await this.audioContext.suspend();
      this.stopLoop();
      this.setState('suspended');
    }
  }

  /**
   * Resume audio processing
   */
  async resumeContext(): Promise<void> {
    if (this.audioContext && this.state === 'suspended') {
      await this.audioContext.resume();
      this.setState('active');
      this.startLoop();
    }
  }

  /**
   * Create a new FFT analyzer attached to this source
   */
  createAnalyzer(config: Partial<AnalyzerConfig> = {}): FFTAnalyzer {
    if (!this.audioContext) {
      throw new Error('Audio source is not active. Call start() first.');
    }

    // We need the sourceNode for microphone/desktop/application sources
    if (!this.sourceNode) {
      throw new Error('Audio source is not active. Call start() first.');
    }

    const analyzer = new FFTAnalyzer(this.audioContext, this.sourceNode, config);
    this.analyzers.set(analyzer.id, analyzer);
    this.lastPeakTime.set(analyzer.id, 0);

    return analyzer;
  }

  /**
   * Get an analyzer by ID
   */
  getAnalyzer(id: string): FFTAnalyzer | undefined {
    return this.analyzers.get(id);
  }

  /**
   * Get all analyzers
   */
  getAnalyzers(): FFTAnalyzer[] {
    return Array.from(this.analyzers.values());
  }

  /**
   * Remove an analyzer
   */
  removeAnalyzer(id: string): boolean {
    const analyzer = this.analyzers.get(id);
    if (analyzer) {
      analyzer.destroy();
      this.analyzers.delete(id);
      this.lastPeakTime.delete(id);
      return true;
    }
    return false;
  }

  /**
   * Remove all analyzers
   */
  removeAllAnalyzers(): void {
    for (const analyzer of this.analyzers.values()) {
      analyzer.destroy();
    }
    this.analyzers.clear();
    this.lastPeakTime.clear();
  }

  /**
   * Set peak detection threshold
   */
  setPeakThreshold(threshold: number): void {
    this.peakThreshold = Math.max(0, Math.min(1, threshold));
  }

  /**
   * Set beat detection threshold
   */
  setBeatThreshold(threshold: number): void {
    this.beatThreshold = Math.max(1, threshold);
  }

  private setState(state: AudioSourceState): void {
    const oldState = this.state;
    this.state = state;

    if (oldState !== state) {
      const event: StateChangeEvent = {
        type: 'stateChange',
        timestamp: performance.now(),
        source: this.id,
        data: { state: state === 'error' ? 'inactive' : state as 'active' | 'inactive' | 'suspended' },
      };
      this.emit('stateChange', event);
    }
  }

  private startLoop(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.processFrame();
  }

  private stopLoop(): void {
    this.isRunning = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  private processFrame = (): void => {
    if (!this.isRunning) return;

    const now = performance.now();

    for (const analyzer of this.analyzers.values()) {
      // Get analyzer data
      const data = analyzer.getData();
      const frequencyBands = analyzer.getFrequencyBands();

      // Emit data event
      const dataEvent: DataEvent = {
        type: 'data',
        timestamp: now,
        source: this.id,
        analyzerId: analyzer.id,
        data,
        frequencyBands,
      };
      this.emit('data', dataEvent);

      // Check for peak
      const lastPeak = this.lastPeakTime.get(analyzer.id) ?? 0;
      if (data.averageAmplitude > this.peakThreshold && now - lastPeak > this.peakCooldown) {
        this.lastPeakTime.set(analyzer.id, now);
        const peakEvent: PeakEvent = {
          type: 'peak',
          timestamp: now,
          source: this.id,
          analyzerId: analyzer.id,
          data: {
            level: data.averageAmplitude,
            frequency: data.peakFrequency,
          },
        };
        this.emit('peak', peakEvent);
      }

      // Check for beat
      const beat = analyzer.detectBeat(this.beatThreshold);
      if (beat.detected) {
        const beatEvent: BeatEvent = {
          type: 'beat',
          timestamp: now,
          source: this.id,
          analyzerId: analyzer.id,
          data: {
            intensity: beat.intensity,
            bpm: beat.bpm,
            bpmConfidence: beat.bpmConfidence,
          },
        };
        this.emit('beat', beatEvent);
      }
    }

    this.animationFrameId = requestAnimationFrame(this.processFrame);
  };

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.stop();
    this.removeAllListeners();
  }
}
