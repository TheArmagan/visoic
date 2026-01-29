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
