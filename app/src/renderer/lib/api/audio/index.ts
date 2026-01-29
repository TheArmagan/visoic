


// ============================================
// Visoic Audio FFT API - Public Exports
// ============================================

// Main Manager (Primary Entry Point)
export { AudioManager, audioManager } from './audio-manager';
export type { CreateAnalyzerOptions, AnalyzerHandle } from './audio-manager';

// Svelte Hooks (Reactive Stores)
export {
  useAnalyzer,
  useMultiAnalyzer,
  useAudioDevices,
  useBeats,
  usePeaks,
  useBPM,
} from './hooks';
export type { AnalyzerStore, MultiAnalyzerStore } from './hooks';

// Core Classes
export { AudioSource } from './source';
export type { AudioSourceState } from './source';
export { FFTAnalyzer } from './analyzer';
export { AudioDeviceManager } from './device-manager';
export { AudioEventEmitter } from './event-emitter';

// Types
export type {
  // Config Types
  FFTSize,
  WindowFunction,
  AnalyzerConfig,
  AudioSourceConfig,
  AudioDeviceInfo,
  NormalizationConfig,

  // Data Types
  AnalyzerData,
  FrequencyBandData,

  // Event Types
  AudioEventType,
  AudioEvent,
  AudioEventMap,
  AudioEventListener,
  DataEvent,
  DeviceChangeEvent,
  StateChangeEvent,
  ErrorEvent,
  PeakEvent,
  BeatEvent,
} from './types';

export { DEFAULT_ANALYZER_CONFIG, DEFAULT_NORMALIZATION_CONFIG } from './types';

// ============================================
// Quick Start Example:
// ============================================
//
// import { audioManager } from './api/audio';
//
// // Initialize
// await audioManager.initialize();
//
// // Create analyzer with 128 FFT, no smoothing
// const fast = await audioManager.createAnalyzer({
//   fftSize: 128,
//   smoothingTimeConstant: 0,
//   label: 'fast-response',
// });
//
// // Create analyzer with 1024 FFT, smoothing and gain
// const smooth = await audioManager.createAnalyzer({
//   fftSize: 1024,
//   smoothingTimeConstant: 0.9,
//   gain: 2.0,
//   label: 'smooth-boosted',
// });
//
// // Subscribe to data
// fast.onData((event) => {
//   console.log('Fast:', event.data.averageAmplitude);
// });
//
// smooth.onData((event) => {
//   console.log('Smooth:', event.frequencyBands);
// });
//
// // Or subscribe to all events
// audioManager.on('beat', (event) => {
//   console.log('Beat detected!', event.data.intensity);
// });
// ============================================