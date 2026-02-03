// ============================================
// Visoic Audio FFT API - Type Definitions
// ============================================

export type FFTSize = 32 | 64 | 128 | 256 | 512 | 1024 | 2048 | 4096 | 8192 | 16384 | 32768;

export type WindowFunction = 'blackman' | 'hann' | 'hamming' | 'bartlett' | 'rectangular';

export interface AudioDeviceInfo {
  deviceId: string;
  label: string;
  groupId: string;
  kind: 'audioinput' | 'audiooutput';
  isDefault: boolean;
}

export interface AnalyzerConfig {
  /** Optional ID for the analyzer. If not provided, one will be generated */
  id?: string;

  /** FFT size - must be power of 2 between 32 and 32768 */
  fftSize: FFTSize;

  /** Smoothing time constant (0-1). Higher = smoother but slower response */
  smoothingTimeConstant: number;

  /** Gain multiplier for the input signal */
  gain: number;

  /** Minimum decibel value for getByteFrequencyData */
  minDecibels: number;

  /** Maximum decibel value for getByteFrequencyData */
  maxDecibels: number;

  /** Window function for FFT analysis */
  windowFunction: WindowFunction;

  /** Custom label for this analyzer */
  label?: string;

  /** Enable volume normalization */
  normalizationEnabled?: boolean;

  /** Normalization settings */
  normalization?: NormalizationConfig;
}

export interface NormalizationConfig {
  /** Target RMS level (0-1). Default: 0.5 */
  targetLevel: number;

  /** How fast normalization responds to level changes (0-1). Lower = slower. Default: 0.1 */
  attackTime: number;

  /** How fast normalization releases after loud sounds (0-1). Lower = slower. Default: 0.05 */
  releaseTime: number;

  /** Maximum gain boost allowed. Default: 3.0 */
  maxGain: number;

  /** Minimum gain (for limiting loud sounds). Default: 0.1 */
  minGain: number;

  /** Use compressor for limiting peaks. Default: true */
  useCompressor: boolean;

  /** Compressor threshold in dB. Default: -24 */
  compressorThreshold: number;

  /** Compressor ratio. Default: 4 */
  compressorRatio: number;
}

export const DEFAULT_NORMALIZATION_CONFIG: NormalizationConfig = {
  targetLevel: 0.5,
  attackTime: 0.1,
  releaseTime: 0.05,
  maxGain: 3.0,
  minGain: 0.1,
  useCompressor: true,
  compressorThreshold: -24,
  compressorRatio: 4,
};

export interface AnalyzerData {
  /** Raw frequency data in decibels (Float32Array) */
  frequencyData: Float32Array<ArrayBuffer>;

  /** Normalized frequency data (0-255 Uint8Array) */
  byteFrequencyData: Uint8Array<ArrayBuffer>;

  /** Time domain waveform data */
  timeDomainData: Float32Array<ArrayBuffer>;

  /** Normalized time domain data (0-255 Uint8Array) */
  byteTimeDomainData: Uint8Array<ArrayBuffer>;

  /** Computed average amplitude */
  averageAmplitude: number;

  /** Peak frequency bin index */
  peakFrequencyBin: number;

  /** Peak frequency in Hz */
  peakFrequency: number;

  /** RMS (Root Mean Square) level */
  rmsLevel: number;

  /** Timestamp of this data capture */
  timestamp: number;
}

export interface FrequencyBandData {
  /** Sub-bass (20-60 Hz) */
  subBass: number;
  /** Bass (60-250 Hz) */
  bass: number;
  /** Low-mid (250-500 Hz) */
  lowMid: number;
  /** Mid (500-2000 Hz) */
  mid: number;
  /** Upper-mid (2000-4000 Hz) */
  upperMid: number;
  /** Presence (4000-6000 Hz) */
  presence: number;
  /** Brilliance (6000-20000 Hz) */
  brilliance: number;
}

export interface AudioSourceConfig {
  /** Device ID to use. Use 'default' for system default */
  deviceId: string;

  /** Source type: 'microphone' for input devices, 'desktop' for full system audio, 'application' for specific app/window audio */
  sourceType?: 'microphone' | 'desktop' | 'application';

  /** Desktop source ID from Electron's desktopCapturer (for desktop/application capture) */
  desktopSourceId?: string;

  /** Sample rate for the audio context */
  sampleRate?: number;

  /** Enable echo cancellation */
  echoCancellation?: boolean;

  /** Enable noise suppression */
  noiseSuppression?: boolean;

  /** Enable auto gain control */
  autoGainControl?: boolean;

  /** Channel count */
  channelCount?: number;
}

// ============================================
// Sound Detection Types
// ============================================

/** Types of percussive sounds that can be detected */
export type PercussionType = 'kick' | 'snare' | 'hihat' | 'clap' | 'tom' | 'cymbal' | 'custom';

/** Preset frequency ranges for common audio bands */
export type FrequencyPreset =
  | 'subBass'      // 20-60 Hz
  | 'bass'         // 60-250 Hz
  | 'lowMid'       // 250-500 Hz
  | 'mid'          // 500-2000 Hz
  | 'upperMid'     // 2000-4000 Hz
  | 'presence'     // 4000-6000 Hz
  | 'brilliance'   // 6000-20000 Hz
  | 'kick'         // 40-100 Hz (kick drum focus)
  | 'snare'        // 150-350 Hz body + 3000-8000 Hz snap
  | 'hihat'        // 6000-16000 Hz
  | 'clap'         // 1000-5000 Hz
  | 'vocals'       // 80-1100 Hz
  | 'custom';

/** Frequency preset definitions */
export const FREQUENCY_PRESETS: Record<FrequencyPreset, { low: number; high: number; label: string }> = {
  subBass: { low: 20, high: 60, label: 'Sub Bass' },
  bass: { low: 60, high: 250, label: 'Bass' },
  lowMid: { low: 250, high: 500, label: 'Low Mid' },
  mid: { low: 500, high: 2000, label: 'Mid' },
  upperMid: { low: 2000, high: 4000, label: 'Upper Mid' },
  presence: { low: 4000, high: 6000, label: 'Presence' },
  brilliance: { low: 6000, high: 20000, label: 'Brilliance' },
  kick: { low: 40, high: 100, label: 'Kick' },
  snare: { low: 150, high: 350, label: 'Snare Body' },
  hihat: { low: 6000, high: 16000, label: 'Hi-Hat' },
  clap: { low: 1000, high: 5000, label: 'Clap' },
  vocals: { low: 80, high: 1100, label: 'Vocals' },
  custom: { low: 20, high: 20000, label: 'Custom' },
};

/** Configuration for percussion/transient detection */
export interface PercussionDetectorConfig {
  /** Type of percussion to detect */
  type: PercussionType;

  /** Detection threshold (multiplier over average energy) */
  threshold: number;

  /** Minimum time between detections in ms */
  cooldown: number;

  /** Minimum duration that detection stays active in ms */
  holdTime: number;

  /** Low frequency of detection range in Hz */
  lowFreq: number;

  /** High frequency of detection range in Hz */
  highFreq: number;

  /** Secondary frequency range (for complex sounds like snare) */
  secondaryLowFreq?: number;
  secondaryHighFreq?: number;
  secondaryWeight?: number;

  /** Sensitivity to transients (0-1, higher = more sensitive to sharp attacks) */
  transientSensitivity: number;

  /** Energy history size for averaging */
  historySize: number;

  /** Use spectral flux instead of energy (better for transients) */
  useSpectralFlux: boolean;
}

/** Default configurations for different percussion types */
export const PERCUSSION_PRESETS: Record<PercussionType, PercussionDetectorConfig> = {
  kick: {
    type: 'kick',
    threshold: 1.5,
    cooldown: 150,
    holdTime: 80,
    lowFreq: 40,
    highFreq: 120,
    transientSensitivity: 0.8,
    historySize: 45,
    useSpectralFlux: false,
  },
  snare: {
    type: 'snare',
    threshold: 1.8,
    cooldown: 100,
    holdTime: 60,
    lowFreq: 150,
    highFreq: 400,
    secondaryLowFreq: 2000,
    secondaryHighFreq: 9000,
    secondaryWeight: 0.3,
    transientSensitivity: 0.8,
    historySize: 30,
    useSpectralFlux: true,
  },
  hihat: {
    type: 'hihat',
    threshold: 1.5,
    cooldown: 50,
    holdTime: 40,
    lowFreq: 8000,
    highFreq: 18000,
    transientSensitivity: 0.9,
    historySize: 15,
    useSpectralFlux: true,
  },
  clap: {
    type: 'clap',
    threshold: 1.6,
    cooldown: 100,
    holdTime: 100,
    lowFreq: 800,
    highFreq: 4000,
    transientSensitivity: 0.85,
    historySize: 20,
    useSpectralFlux: true,
  },
  tom: {
    type: 'tom',
    threshold: 1.6,
    cooldown: 120,
    holdTime: 100,
    lowFreq: 80,
    highFreq: 600,
    transientSensitivity: 0.6,
    historySize: 35,
    useSpectralFlux: false,
  },
  cymbal: {
    type: 'cymbal',
    threshold: 1.4,
    cooldown: 200,
    holdTime: 150,
    lowFreq: 5000,
    highFreq: 20000,
    transientSensitivity: 0.7,
    historySize: 40,
    useSpectralFlux: true,
  },
  custom: {
    type: 'custom',
    threshold: 1.5,
    cooldown: 100,
    holdTime: 100,
    lowFreq: 20,
    highFreq: 20000,
    transientSensitivity: 0.5,
    historySize: 43,
    useSpectralFlux: false,
  },
};

/** Result from percussion detection */
export interface PercussionDetectionResult {
  /** Whether the sound was detected */
  detected: boolean;

  /** Detection intensity (ratio of current energy to average) */
  intensity: number;

  /** Current energy level */
  energy: number;

  /** Average energy level */
  averageEnergy: number;

  /** Spectral flux value (if using spectral flux mode) */
  spectralFlux?: number;

  /** Timestamp of detection */
  timestamp: number;
}

export type AudioEventType =
  | 'data'           // New analyzer data available
  | 'deviceChange'   // Audio devices changed
  | 'stateChange'    // Source state changed
  | 'error'          // Error occurred
  | 'peak'           // Peak detected
  | 'beat';          // Beat detected

export interface AudioEvent<T = unknown> {
  type: AudioEventType;
  timestamp: number;
  source?: string;
  analyzerId?: string;
  data: T;
}

export interface DataEvent extends AudioEvent<AnalyzerData> {
  type: 'data';
  analyzerId: string;
  frequencyBands: FrequencyBandData;
}

export interface DeviceChangeEvent extends AudioEvent<AudioDeviceInfo[]> {
  type: 'deviceChange';
}

export interface StateChangeEvent extends AudioEvent<{ state: 'active' | 'inactive' | 'suspended' }> {
  type: 'stateChange';
}

export interface ErrorEvent extends AudioEvent<{ code: string; message: string }> {
  type: 'error';
}

export interface PeakEvent extends AudioEvent<{ level: number; frequency: number }> {
  type: 'peak';
  analyzerId: string;
}

export interface BeatEvent extends AudioEvent<{ intensity: number; bpm: number; bpmConfidence: number }> {
  type: 'beat';
  analyzerId: string;
}

export type AudioEventMap = {
  'data': DataEvent;
  'deviceChange': DeviceChangeEvent;
  'stateChange': StateChangeEvent;
  'error': ErrorEvent;
  'peak': PeakEvent;
  'beat': BeatEvent;
};

export type AudioEventListener<T extends AudioEventType> = (event: AudioEventMap[T]) => void;

export const DEFAULT_ANALYZER_CONFIG: AnalyzerConfig = {
  fftSize: 2048,
  smoothingTimeConstant: 0.8,
  gain: 1.0,
  minDecibels: -100,
  maxDecibels: -30,
  windowFunction: 'blackman',
  normalizationEnabled: false,
};
