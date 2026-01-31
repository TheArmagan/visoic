// ============================================
// Visoic Audio FFT API - FFT Analyzer
// ============================================

import type {
  AnalyzerConfig,
  AnalyzerData,
  FrequencyBandData,
  FFTSize,
  NormalizationConfig,
  PercussionDetectorConfig,
  PercussionDetectionResult,
  PercussionType,
} from './types';
import { DEFAULT_ANALYZER_CONFIG, DEFAULT_NORMALIZATION_CONFIG, PERCUSSION_PRESETS } from './types';

import Meyda from 'meyda';

let analyzerIdCounter = 0;

function generateAnalyzerId(): string {
  return `analyzer_${Date.now()}_${++analyzerIdCounter}`;
}

export class FFTAnalyzer {
  public readonly id: string;
  public readonly label: string;

  private analyzerNode: AnalyserNode;
  private gainNode: GainNode;
  private compressorNode: DynamicsCompressorNode | null = null;
  private normalizationGainNode: GainNode | null = null;
  private config: AnalyzerConfig;
  private audioContext: AudioContext;
  private sourceNode: AudioNode;

  // Pre-allocated buffers for performance
  private frequencyData: Float32Array<ArrayBuffer>;
  private byteFrequencyData: Uint8Array<ArrayBuffer>;
  private timeDomainData: Float32Array<ArrayBuffer>;
  private byteTimeDomainData: Uint8Array<ArrayBuffer>;

  // Beat detection state
  private energyHistory: number[] = [];
  private readonly energyHistorySize = 43; // ~1 second at 60fps
  private lastBeatTime = 0;
  private readonly beatCooldown = 100; // ms between beats

  // BPM calculation state
  private beatTimes: number[] = [];
  private readonly maxBeatHistory = 20; // Number of beats to track for BPM
  private currentBPM = 0;
  private bpmConfidence = 0; // 0-1, how confident we are in the BPM
  private readonly minBPM = 60;
  private readonly maxBPM = 200;

  // Normalization state
  private normalizationEnabled = false;
  private normalizationConfig: NormalizationConfig;
  private currentNormalizationGain = 1.0;
  private rmsHistory: number[] = [];
  private readonly rmsHistorySize = 30; // ~0.5 second at 60fps

  // Percussion detection state
  private percussionDetectors: Map<string, {
    config: PercussionDetectorConfig;
    energyHistory: number[];
    fluxHistory: number[];
    rmsHistory: number[];
    lastDetectionTime: number;
    holdUntilTime: number;
    lastIntensity: number;
    lastEnergy: number;
    lastAverageEnergy: number;
    previousSpectrum: Float32Array | null;
  }> = new Map();

  private frequencyRangeToSpectrumBins(lowFreq: number, highFreq: number, spectrumLength: number): { lowBin: number; highBin: number } {
    const sampleRate = this.audioContext.sampleRate;
    const nyquist = sampleRate / 2;
    const binWidth = nyquist / spectrumLength;

    const lowBin = Math.max(0, Math.floor(lowFreq / binWidth));
    const highBin = Math.min(Math.ceil(highFreq / binWidth), spectrumLength - 1);
    return { lowBin, highBin };
  }

  private calculateSpectrumBandEnergy(spectrum: Float32Array, lowFreq: number, highFreq: number): number {
    const { lowBin, highBin } = this.frequencyRangeToSpectrumBins(lowFreq, highFreq, spectrum.length);
    if (lowBin >= highBin) return 0;

    let sumSq = 0;
    for (let i = lowBin; i <= highBin; i++) {
      const v = spectrum[i];
      sumSq += v * v;
    }
    return Math.sqrt(sumSq / (highBin - lowBin + 1));
  }

  private computeSpectralFlux(current: Float32Array, previous: Float32Array | null): number {
    if (!previous || previous.length !== current.length) return 0;
    let flux = 0;
    for (let i = 0; i < current.length; i++) {
      const diff = current[i] - previous[i];
      if (diff > 0) flux += diff * diff;
    }
    return Math.sqrt(flux / current.length);
  }

  private sanitizeFinite(value: unknown, fallback = 0): number {
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  private percussionFeatureMatch(type: PercussionType, features: { spectralCentroid?: number; spectralFlatness?: number; zcr?: number }): number {
    const centroid = features.spectralCentroid ?? 0;
    const flatness = features.spectralFlatness ?? 0;
    const zcr = features.zcr ?? 0;

    // Returns 0..1 where 1 means "looks like this percussion type"
    switch (type) {
      case 'kick': {
        const centroidOk = centroid > 0 && centroid < 1500;
        const zcrOk = zcr < 0.12;
        const flatOk = flatness < 0.55;
        return (Number(centroidOk) + Number(zcrOk) + Number(flatOk)) / 3;
      }
      case 'snare': {
        const centroidOk = centroid > 1200 && centroid < 6500;
        const zcrOk = zcr > 0.05 && zcr < 0.22;
        const flatOk = flatness > 0.15;
        return (Number(centroidOk) + Number(zcrOk) + Number(flatOk)) / 3;
      }
      case 'clap': {
        const centroidOk = centroid > 1500 && centroid < 8000;
        const zcrOk = zcr > 0.08;
        const flatOk = flatness > 0.2;
        return (Number(centroidOk) + Number(zcrOk) + Number(flatOk)) / 3;
      }
      case 'hihat': {
        const centroidOk = centroid > 5500;
        const zcrOk = zcr > 0.12;
        const flatOk = flatness > 0.35;
        return (Number(centroidOk) + Number(zcrOk) + Number(flatOk)) / 3;
      }
      case 'cymbal': {
        const centroidOk = centroid > 4500;
        const zcrOk = zcr > 0.1;
        const flatOk = flatness > 0.3;
        return (Number(centroidOk) + Number(zcrOk) + Number(flatOk)) / 3;
      }
      case 'tom': {
        const centroidOk = centroid > 0 && centroid < 2500;
        const zcrOk = zcr < 0.14;
        const flatOk = flatness < 0.6;
        return (Number(centroidOk) + Number(zcrOk) + Number(flatOk)) / 3;
      }
      case 'custom':
      default:
        return 1;
    }
  }

  constructor(
    audioContext: AudioContext,
    sourceNode: AudioNode,
    config: Partial<AnalyzerConfig> = {}
  ) {
    this.id = config.id ?? generateAnalyzerId();
    this.audioContext = audioContext;
    this.sourceNode = sourceNode;
    this.config = { ...DEFAULT_ANALYZER_CONFIG, ...config };
    this.label = this.config.label ?? this.id;
    this.normalizationConfig = { ...DEFAULT_NORMALIZATION_CONFIG, ...config.normalization };
    this.normalizationEnabled = config.normalizationEnabled ?? false;

    // Create gain node for volume control
    this.gainNode = audioContext.createGain();
    this.gainNode.gain.value = this.config.gain;

    // Create analyzer node
    this.analyzerNode = audioContext.createAnalyser();
    this.applyConfig();

    // Build audio graph
    this.buildAudioGraph();

    // Initialize buffers
    const bufferLength = this.analyzerNode.frequencyBinCount;
    this.frequencyData = new Float32Array(bufferLength);
    this.byteFrequencyData = new Uint8Array(bufferLength);
    this.timeDomainData = new Float32Array(this.config.fftSize);
    this.byteTimeDomainData = new Uint8Array(this.config.fftSize);
  }

  /**
   * Build the audio processing graph based on current settings
   */
  private buildAudioGraph(): void {
    // Disconnect existing connections
    try {
      this.sourceNode.disconnect();
      this.gainNode.disconnect();
      this.normalizationGainNode?.disconnect();
      this.compressorNode?.disconnect();
    } catch {
      // Nodes might not be connected
    }

    if (this.normalizationEnabled) {
      // Create normalization nodes if needed
      if (!this.normalizationGainNode) {
        this.normalizationGainNode = this.audioContext.createGain();
        this.normalizationGainNode.gain.value = this.currentNormalizationGain;
      }

      if (this.normalizationConfig.useCompressor && !this.compressorNode) {
        this.compressorNode = this.audioContext.createDynamicsCompressor();
        this.applyCompressorSettings();
      }

      // Connect: source -> gain -> normalizationGain -> (compressor?) -> analyzer
      this.sourceNode.connect(this.gainNode);
      this.gainNode.connect(this.normalizationGainNode);

      if (this.normalizationConfig.useCompressor && this.compressorNode) {
        this.normalizationGainNode.connect(this.compressorNode);
        this.compressorNode.connect(this.analyzerNode);
      } else {
        this.normalizationGainNode.connect(this.analyzerNode);
      }
    } else {
      // Simple path: source -> gain -> analyzer
      this.sourceNode.connect(this.gainNode);
      this.gainNode.connect(this.analyzerNode);
    }
  }

  /**
   * Apply compressor settings
   */
  private applyCompressorSettings(): void {
    if (!this.compressorNode) return;

    this.compressorNode.threshold.value = this.normalizationConfig.compressorThreshold;
    this.compressorNode.ratio.value = this.normalizationConfig.compressorRatio;
    this.compressorNode.knee.value = 10;
    this.compressorNode.attack.value = 0.003;
    this.compressorNode.release.value = 0.25;
  }

  /**
   * Apply configuration to analyzer node
   */
  private applyConfig(): void {
    this.analyzerNode.fftSize = this.config.fftSize;
    this.analyzerNode.smoothingTimeConstant = this.config.smoothingTimeConstant;
    this.analyzerNode.minDecibels = this.config.minDecibels;
    this.analyzerNode.maxDecibels = this.config.maxDecibels;
  }

  /**
   * Get the number of frequency bins
   */
  get frequencyBinCount(): number {
    return this.analyzerNode.frequencyBinCount;
  }

  /**
   * Get the current FFT size
   */
  get fftSize(): FFTSize {
    return this.config.fftSize;
  }

  /**
   * Get current configuration
   */
  getConfig(): Readonly<AnalyzerConfig> {
    return { ...this.config };
  }

  /**
   * Update analyzer configuration
   */
  updateConfig(config: Partial<AnalyzerConfig>): void {
    const needsBufferResize = config.fftSize && config.fftSize !== this.config.fftSize;

    this.config = { ...this.config, ...config };

    if (config.gain !== undefined) {
      this.gainNode.gain.value = config.gain;
    }

    this.applyConfig();

    if (needsBufferResize) {
      const bufferLength = this.analyzerNode.frequencyBinCount;
      this.frequencyData = new Float32Array(bufferLength);
      this.byteFrequencyData = new Uint8Array(bufferLength);
      this.timeDomainData = new Float32Array(this.config.fftSize);
      this.byteTimeDomainData = new Uint8Array(this.config.fftSize);
    }
  }

  /**
   * Set gain value
   */
  setGain(gain: number): void {
    this.config.gain = gain;
    this.gainNode.gain.setValueAtTime(gain, this.audioContext.currentTime);
  }

  /**
   * Set gain with smooth transition
   */
  setGainSmooth(gain: number, duration: number = 0.1): void {
    this.config.gain = gain;
    this.gainNode.gain.linearRampToValueAtTime(
      gain,
      this.audioContext.currentTime + duration
    );
  }

  // ==========================================
  // Volume Normalization
  // ==========================================

  /**
   * Enable volume normalization
   */
  enableNormalization(config?: Partial<NormalizationConfig>): void {
    if (config) {
      this.normalizationConfig = { ...this.normalizationConfig, ...config };
    }
    this.normalizationEnabled = true;
    this.rmsHistory = [];
    this.currentNormalizationGain = 1.0;
    this.buildAudioGraph();
  }

  /**
   * Disable volume normalization
   */
  disableNormalization(): void {
    this.normalizationEnabled = false;
    this.rmsHistory = [];
    this.currentNormalizationGain = 1.0;
    if (this.normalizationGainNode) {
      this.normalizationGainNode.gain.value = 1.0;
    }
    this.buildAudioGraph();
  }

  /**
   * Toggle volume normalization
   */
  toggleNormalization(): boolean {
    if (this.normalizationEnabled) {
      this.disableNormalization();
    } else {
      this.enableNormalization();
    }
    return this.normalizationEnabled;
  }

  /**
   * Check if normalization is enabled
   */
  isNormalizationEnabled(): boolean {
    return this.normalizationEnabled;
  }

  /**
   * Get current normalization config
   */
  getNormalizationConfig(): Readonly<NormalizationConfig> {
    return { ...this.normalizationConfig };
  }

  /**
   * Update normalization config
   */
  updateNormalizationConfig(config: Partial<NormalizationConfig>): void {
    this.normalizationConfig = { ...this.normalizationConfig, ...config };

    if (this.normalizationEnabled) {
      this.applyCompressorSettings();
    }
  }

  /**
   * Get current normalization gain value
   */
  getNormalizationGain(): number {
    return this.currentNormalizationGain;
  }

  /**
   * Process normalization - call this during audio processing loop
   */
  private processNormalization(rmsLevel: number): void {
    if (!this.normalizationEnabled || !this.normalizationGainNode) return;

    // Add to RMS history
    this.rmsHistory.push(rmsLevel);
    if (this.rmsHistory.length > this.rmsHistorySize) {
      this.rmsHistory.shift();
    }

    // Calculate average RMS
    const avgRMS = this.rmsHistory.reduce((a, b) => a + b, 0) / this.rmsHistory.length;

    if (avgRMS < 0.001) return; // Avoid division by near-zero

    // Calculate target gain
    const targetGain = this.normalizationConfig.targetLevel / avgRMS;

    // Clamp gain to min/max
    const clampedGain = Math.max(
      this.normalizationConfig.minGain,
      Math.min(this.normalizationConfig.maxGain, targetGain)
    );

    // Smooth gain changes (attack/release)
    const gainDiff = clampedGain - this.currentNormalizationGain;
    const rate = gainDiff > 0
      ? this.normalizationConfig.attackTime
      : this.normalizationConfig.releaseTime;

    this.currentNormalizationGain += gainDiff * rate;

    // Apply gain
    this.normalizationGainNode.gain.setValueAtTime(
      this.currentNormalizationGain,
      this.audioContext.currentTime
    );
  }

  /**
   * Set smoothing time constant
   */
  setSmoothing(smoothing: number): void {
    this.config.smoothingTimeConstant = Math.max(0, Math.min(1, smoothing));
    this.analyzerNode.smoothingTimeConstant = this.config.smoothingTimeConstant;
  }

  /**
   * Set FFT size
   */
  setFFTSize(fftSize: FFTSize): void {
    this.updateConfig({ fftSize });
  }

  /**
   * Get all analyzer data at once (most efficient for visualization)
   */
  getData(): AnalyzerData {
    // Get frequency data
    this.analyzerNode.getFloatFrequencyData(this.frequencyData);
    this.analyzerNode.getByteFrequencyData(this.byteFrequencyData);

    // Get time domain data
    this.analyzerNode.getFloatTimeDomainData(this.timeDomainData);
    this.analyzerNode.getByteTimeDomainData(this.byteTimeDomainData);

    // Calculate metrics
    const { average, peak, peakIndex } = this.calculateMetrics();
    const rms = this.calculateRMS();
    const peakFrequency = this.binToFrequency(peakIndex);

    // Process normalization if enabled
    this.processNormalization(rms);

    return {
      frequencyData: this.frequencyData,
      byteFrequencyData: this.byteFrequencyData,
      timeDomainData: this.timeDomainData,
      byteTimeDomainData: this.byteTimeDomainData,
      averageAmplitude: average,
      peakFrequencyBin: peakIndex,
      peakFrequency,
      rmsLevel: rms,
      timestamp: performance.now(),
    };
  }

  /**
   * Get frequency data only (for when you only need frequency visualization)
   */
  getFrequencyData(): Float32Array<ArrayBuffer> {
    this.analyzerNode.getFloatFrequencyData(this.frequencyData);
    return this.frequencyData;
  }

  /**
   * Get byte frequency data (0-255, useful for simple visualizations)
   */
  getByteFrequencyData(): Uint8Array<ArrayBuffer> {
    this.analyzerNode.getByteFrequencyData(this.byteFrequencyData);
    return this.byteFrequencyData;
  }

  /**
   * Get time domain waveform data
   */
  getTimeDomainData(): Float32Array<ArrayBuffer> {
    this.analyzerNode.getFloatTimeDomainData(this.timeDomainData);
    return this.timeDomainData;
  }

  /**
   * Get frequency bands (bass, mid, treble, etc.)
   */
  getFrequencyBands(): FrequencyBandData {
    this.analyzerNode.getByteFrequencyData(this.byteFrequencyData);

    const sampleRate = this.audioContext.sampleRate;
    const binCount = this.frequencyBinCount;
    const nyquist = sampleRate / 2;
    const binWidth = nyquist / binCount;

    const getBandAverage = (lowFreq: number, highFreq: number): number => {
      const lowBin = Math.floor(lowFreq / binWidth);
      const highBin = Math.min(Math.ceil(highFreq / binWidth), binCount - 1);

      if (lowBin >= highBin) return 0;

      let sum = 0;
      for (let i = lowBin; i <= highBin; i++) {
        sum += this.byteFrequencyData[i];
      }
      return sum / (highBin - lowBin + 1) / 255; // Normalize to 0-1
    };

    return {
      subBass: getBandAverage(20, 60),
      bass: getBandAverage(60, 250),
      lowMid: getBandAverage(250, 500),
      mid: getBandAverage(500, 2000),
      upperMid: getBandAverage(2000, 4000),
      presence: getBandAverage(4000, 6000),
      brilliance: getBandAverage(6000, 20000),
    };
  }

  /**
   * Get specific frequency range average (normalized 0-1)
   */
  getFrequencyRange(lowFreq: number, highFreq: number): number {
    this.analyzerNode.getByteFrequencyData(this.byteFrequencyData);

    const sampleRate = this.audioContext.sampleRate;
    const binCount = this.frequencyBinCount;
    const nyquist = sampleRate / 2;
    const binWidth = nyquist / binCount;

    const lowBin = Math.floor(lowFreq / binWidth);
    const highBin = Math.min(Math.ceil(highFreq / binWidth), binCount - 1);

    if (lowBin >= highBin) return 0;

    let sum = 0;
    for (let i = lowBin; i <= highBin; i++) {
      sum += this.byteFrequencyData[i];
    }
    return sum / (highBin - lowBin + 1) / 255;
  }

  /**
   * Get frequency range with different calculation modes
   * @param lowFreq - Low frequency in Hz
   * @param highFreq - High frequency in Hz
   * @param mode - Calculation mode: 'average' | 'peak' | 'rms' | 'sum' | 'weighted'
   * @returns Value between 0-1
   */
  getFrequencyRangeAdvanced(
    lowFreq: number,
    highFreq: number,
    mode: 'average' | 'peak' | 'rms' | 'sum' | 'weighted' = 'average'
  ): number {
    this.analyzerNode.getByteFrequencyData(this.byteFrequencyData);

    const { lowBin, highBin } = this.frequencyRangeToBins(lowFreq, highFreq);
    if (lowBin >= highBin) return 0;

    const binCount = highBin - lowBin + 1;
    let result = 0;

    switch (mode) {
      case 'average': {
        let sum = 0;
        for (let i = lowBin; i <= highBin; i++) {
          sum += this.byteFrequencyData[i];
        }
        result = sum / binCount / 255;
        break;
      }

      case 'peak': {
        let peak = 0;
        for (let i = lowBin; i <= highBin; i++) {
          if (this.byteFrequencyData[i] > peak) {
            peak = this.byteFrequencyData[i];
          }
        }
        result = peak / 255;
        break;
      }

      case 'rms': {
        let sumSquares = 0;
        for (let i = lowBin; i <= highBin; i++) {
          const val = this.byteFrequencyData[i] / 255;
          sumSquares += val * val;
        }
        result = Math.sqrt(sumSquares / binCount);
        break;
      }

      case 'sum': {
        let sum = 0;
        for (let i = lowBin; i <= highBin; i++) {
          sum += this.byteFrequencyData[i];
        }
        // Normalize by max possible sum
        result = sum / (binCount * 255);
        break;
      }

      case 'weighted': {
        // Higher frequencies get more weight (useful for detecting brightness)
        let weightedSum = 0;
        let totalWeight = 0;
        for (let i = lowBin; i <= highBin; i++) {
          const weight = (i - lowBin + 1) / binCount;
          weightedSum += this.byteFrequencyData[i] * weight;
          totalWeight += weight;
        }
        result = weightedSum / totalWeight / 255;
        break;
      }
    }

    return result;
  }

  /**
   * Get multiple frequency ranges at once (more efficient than calling getFrequencyRange multiple times)
   * @param ranges - Array of [lowFreq, highFreq] tuples or {low, high, label?, mode?} objects
   * @returns Map of range results with labels
   */
  getFrequencyRanges(
    ranges: Array<
      | [number, number]
      | { low: number; high: number; label?: string; mode?: 'average' | 'peak' | 'rms' | 'sum' | 'weighted' }
    >
  ): Map<string, number> {
    // Get data once
    this.analyzerNode.getByteFrequencyData(this.byteFrequencyData);

    const results = new Map<string, number>();
    const sampleRate = this.audioContext.sampleRate;
    const binCount = this.frequencyBinCount;
    const nyquist = sampleRate / 2;
    const binWidth = nyquist / binCount;

    for (let idx = 0; idx < ranges.length; idx++) {
      const range = ranges[idx];

      let lowFreq: number;
      let highFreq: number;
      let label: string;
      let mode: 'average' | 'peak' | 'rms' | 'sum' | 'weighted' = 'average';

      if (Array.isArray(range)) {
        [lowFreq, highFreq] = range;
        label = `${lowFreq}-${highFreq}Hz`;
      } else {
        lowFreq = range.low;
        highFreq = range.high;
        label = range.label ?? `${lowFreq}-${highFreq}Hz`;
        mode = range.mode ?? 'average';
      }

      const lowBin = Math.floor(lowFreq / binWidth);
      const highBin = Math.min(Math.ceil(highFreq / binWidth), binCount - 1);

      if (lowBin >= highBin) {
        results.set(label, 0);
        continue;
      }

      let value = 0;
      const numBins = highBin - lowBin + 1;

      switch (mode) {
        case 'average': {
          let sum = 0;
          for (let i = lowBin; i <= highBin; i++) {
            sum += this.byteFrequencyData[i];
          }
          value = sum / numBins / 255;
          break;
        }
        case 'peak': {
          for (let i = lowBin; i <= highBin; i++) {
            if (this.byteFrequencyData[i] > value) {
              value = this.byteFrequencyData[i];
            }
          }
          value = value / 255;
          break;
        }
        case 'rms': {
          let sumSquares = 0;
          for (let i = lowBin; i <= highBin; i++) {
            const v = this.byteFrequencyData[i] / 255;
            sumSquares += v * v;
          }
          value = Math.sqrt(sumSquares / numBins);
          break;
        }
        case 'sum': {
          let sum = 0;
          for (let i = lowBin; i <= highBin; i++) {
            sum += this.byteFrequencyData[i];
          }
          value = sum / (numBins * 255);
          break;
        }
        case 'weighted': {
          let weightedSum = 0;
          let totalWeight = 0;
          for (let i = lowBin; i <= highBin; i++) {
            const weight = (i - lowBin + 1) / numBins;
            weightedSum += this.byteFrequencyData[i] * weight;
            totalWeight += weight;
          }
          value = weightedSum / totalWeight / 255;
          break;
        }
      }

      results.set(label, value);
    }

    return results;
  }

  /**
   * Get frequency ranges as a simple array (for easier iteration)
   */
  getFrequencyRangesArray(
    ranges: Array<[number, number]>
  ): number[] {
    this.analyzerNode.getByteFrequencyData(this.byteFrequencyData);

    const { binWidth } = this.getFrequencyInfo();
    const binCount = this.frequencyBinCount;

    return ranges.map(([lowFreq, highFreq]) => {
      const lowBin = Math.floor(lowFreq / binWidth);
      const highBin = Math.min(Math.ceil(highFreq / binWidth), binCount - 1);

      if (lowBin >= highBin) return 0;

      let sum = 0;
      for (let i = lowBin; i <= highBin; i++) {
        sum += this.byteFrequencyData[i];
      }
      return sum / (highBin - lowBin + 1) / 255;
    });
  }

  /**
   * Get raw bin value at specific frequency
   */
  getValueAtFrequency(frequency: number): number {
    this.analyzerNode.getByteFrequencyData(this.byteFrequencyData);
    const bin = this.frequencyToBin(frequency);
    if (bin < 0 || bin >= this.frequencyBinCount) return 0;
    return this.byteFrequencyData[bin] / 255;
  }

  /**
   * Get raw bin values for a range (useful for custom visualizations)
   */
  getBinsInRange(lowFreq: number, highFreq: number): { bins: number[]; frequencies: number[] } {
    this.analyzerNode.getByteFrequencyData(this.byteFrequencyData);

    const { lowBin, highBin } = this.frequencyRangeToBins(lowFreq, highFreq);
    const bins: number[] = [];
    const frequencies: number[] = [];

    for (let i = lowBin; i <= highBin; i++) {
      bins.push(this.byteFrequencyData[i] / 255);
      frequencies.push(this.binToFrequency(i));
    }

    return { bins, frequencies };
  }

  /**
   * Get frequency analysis info
   */
  getFrequencyInfo(): { sampleRate: number; nyquist: number; binWidth: number; binCount: number } {
    const sampleRate = this.audioContext.sampleRate;
    const nyquist = sampleRate / 2;
    const binCount = this.frequencyBinCount;
    const binWidth = nyquist / binCount;
    return { sampleRate, nyquist, binWidth, binCount };
  }

  /**
   * Convert frequency range to bin range
   */
  private frequencyRangeToBins(lowFreq: number, highFreq: number): { lowBin: number; highBin: number } {
    const { binWidth, binCount } = this.getFrequencyInfo();
    return {
      lowBin: Math.floor(lowFreq / binWidth),
      highBin: Math.min(Math.ceil(highFreq / binWidth), binCount - 1),
    };
  }

  /**
   * Detect if a beat occurred
   */
  detectBeat(threshold: number = 1.5): { detected: boolean; intensity: number; bpm: number; bpmConfidence: number } {
    this.analyzerNode.getByteFrequencyData(this.byteFrequencyData);

    // Calculate current energy (focus on bass frequencies for beat detection)
    let energy = 0;
    const bassEnd = Math.floor(this.frequencyBinCount * 0.1); // First 10% of bins
    for (let i = 0; i < bassEnd; i++) {
      energy += this.byteFrequencyData[i] * this.byteFrequencyData[i];
    }
    energy = Math.sqrt(energy / bassEnd);

    // Add to history
    this.energyHistory.push(energy);
    if (this.energyHistory.length > this.energyHistorySize) {
      this.energyHistory.shift();
    }

    // Calculate average energy
    const avgEnergy = this.energyHistory.reduce((a, b) => a + b, 0) / this.energyHistory.length;

    // Detect beat
    const now = performance.now();
    const detected =
      energy > avgEnergy * threshold &&
      now - this.lastBeatTime > this.beatCooldown;

    if (detected) {
      this.lastBeatTime = now;
      this.recordBeatForBPM(now);
    }

    return {
      detected,
      intensity: avgEnergy > 0 ? energy / avgEnergy : 0,
      bpm: this.currentBPM,
      bpmConfidence: this.bpmConfidence,
    };
  }

  /**
   * Record a beat timestamp for BPM calculation
   */
  private recordBeatForBPM(timestamp: number): void {
    this.beatTimes.push(timestamp);

    // Keep only recent beats
    if (this.beatTimes.length > this.maxBeatHistory) {
      this.beatTimes.shift();
    }

    // Need at least 4 beats to calculate BPM
    if (this.beatTimes.length >= 4) {
      this.calculateBPM();
    }
  }

  /**
   * Calculate BPM from beat history
   */
  private calculateBPM(): void {
    if (this.beatTimes.length < 4) {
      this.currentBPM = 0;
      this.bpmConfidence = 0;
      return;
    }

    // Calculate intervals between consecutive beats
    const intervals: number[] = [];
    for (let i = 1; i < this.beatTimes.length; i++) {
      const interval = this.beatTimes[i] - this.beatTimes[i - 1];
      // Filter out unrealistic intervals (< 300ms = 200bpm, > 1000ms = 60bpm)
      const minInterval = 60000 / this.maxBPM; // ms
      const maxInterval = 60000 / this.minBPM; // ms
      if (interval >= minInterval && interval <= maxInterval) {
        intervals.push(interval);
      }
    }

    if (intervals.length < 3) {
      return;
    }

    // Use median interval for robustness against outliers
    const sortedIntervals = [...intervals].sort((a, b) => a - b);
    const medianInterval = sortedIntervals[Math.floor(sortedIntervals.length / 2)];

    // Calculate BPM from median interval
    const bpm = 60000 / medianInterval;

    // Calculate confidence based on interval consistency
    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const variance = intervals.reduce((sum, int) => sum + Math.pow(int - avgInterval, 2), 0) / intervals.length;
    const stdDev = Math.sqrt(variance);
    const coefficientOfVariation = stdDev / avgInterval;

    // Lower variation = higher confidence (max confidence when CV < 0.1)
    this.bpmConfidence = Math.max(0, Math.min(1, 1 - coefficientOfVariation * 5));

    // Only update BPM if we have reasonable confidence
    if (this.bpmConfidence > 0.3) {
      // Smooth BPM changes
      if (this.currentBPM === 0) {
        this.currentBPM = Math.round(bpm);
      } else {
        // Weighted average with existing BPM for stability
        this.currentBPM = Math.round(this.currentBPM * 0.7 + bpm * 0.3);
      }
    }
  }

  /**
   * Get current BPM estimate
   */
  getBPM(): { bpm: number; confidence: number } {
    return {
      bpm: this.currentBPM,
      confidence: this.bpmConfidence,
    };
  }

  /**
   * Reset BPM calculation (useful when switching tracks)
   */
  resetBPM(): void {
    this.beatTimes = [];
    this.currentBPM = 0;
    this.bpmConfidence = 0;
  }

  /**
   * Manually tap tempo to set BPM
   */
  tapTempo(): { bpm: number; confidence: number } {
    const now = performance.now();
    this.recordBeatForBPM(now);
    return this.getBPM();
  }

  /**
   * Convert frequency bin index to frequency in Hz
   */
  binToFrequency(bin: number): number {
    return (bin * this.audioContext.sampleRate) / this.config.fftSize;
  }

  /**
   * Convert frequency in Hz to bin index
   */
  frequencyToBin(frequency: number): number {
    return Math.round((frequency * this.config.fftSize) / this.audioContext.sampleRate);
  }

  /**
   * Calculate average and peak from frequency data
   */
  private calculateMetrics(): { average: number; peak: number; peakIndex: number } {
    let sum = 0;
    let peak = -Infinity;
    let peakIndex = 0;

    for (let i = 0; i < this.byteFrequencyData.length; i++) {
      const value = this.byteFrequencyData[i];
      sum += value;
      if (value > peak) {
        peak = value;
        peakIndex = i;
      }
    }

    return {
      average: sum / this.byteFrequencyData.length / 255,
      peak: peak / 255,
      peakIndex,
    };
  }

  /**
   * Calculate RMS level from time domain data
   */
  private calculateRMS(): number {
    let sum = 0;
    for (let i = 0; i < this.timeDomainData.length; i++) {
      const sample = this.timeDomainData[i];
      sum += sample * sample;
    }
    return Math.sqrt(sum / this.timeDomainData.length);
  }

  // ==========================================
  // Percussion Detection
  // ==========================================

  /**
   * Create or update a percussion detector
   */
  createPercussionDetector(id: string, config: Partial<PercussionDetectorConfig> & { type: PercussionType }): void {
    const preset = PERCUSSION_PRESETS[config.type] || PERCUSSION_PRESETS.custom;
    const fullConfig: PercussionDetectorConfig = { ...preset, ...config };

    this.percussionDetectors.set(id, {
      config: fullConfig,
      energyHistory: [],
      fluxHistory: [],
      rmsHistory: [],
      lastDetectionTime: 0,
      holdUntilTime: 0,
      lastIntensity: 0,
      lastEnergy: 0,
      lastAverageEnergy: 0,
      previousSpectrum: null,
    });
  }

  /**
   * Update percussion detector configuration
   */
  updatePercussionDetector(id: string, config: Partial<PercussionDetectorConfig>): boolean {
    const detector = this.percussionDetectors.get(id);
    if (!detector) return false;

    detector.config = { ...detector.config, ...config };
    return true;
  }

  /**
   * Remove a percussion detector
   */
  removePercussionDetector(id: string): boolean {
    return this.percussionDetectors.delete(id);
  }

  /**
   * Get percussion detector configuration
   */
  getPercussionDetectorConfig(id: string): PercussionDetectorConfig | undefined {
    return this.percussionDetectors.get(id)?.config;
  }

  /**
   * Detect percussion/transient sounds with configurable parameters
   */
  detectPercussion(id: string): PercussionDetectionResult {
    const detector = this.percussionDetectors.get(id);
    if (!detector) {
      return {
        detected: false,
        intensity: 0,
        energy: 0,
        averageEnergy: 0,
        timestamp: performance.now(),
      };
    }

    const { config, energyHistory, fluxHistory, rmsHistory, lastDetectionTime, holdUntilTime, previousSpectrum } = detector;
    const now = performance.now();

    // Check if we're still in hold period from previous detection
    const inHoldPeriod = now < holdUntilTime;
    if (inHoldPeriod) {
      // Return the stored values from when detection occurred
      return {
        detected: true,
        intensity: detector.lastIntensity,
        energy: detector.lastEnergy,
        averageEnergy: detector.lastAverageEnergy,
        timestamp: now,
      };
    }

    // Pull fresh time-domain buffer (more reliable for transients than AnalyserNode's smoothed spectrum)
    this.analyzerNode.getFloatTimeDomainData(this.timeDomainData);

    const bufferSize = this.timeDomainData.length;
    const sampleRate = this.audioContext.sampleRate;

    // Meyda feature extraction
    // NOTE: Meyda can return arrays as number[]; normalize to Float32Array for performance.
    // Meyda's TS types do not currently expose per-call options; configure globals.
    (Meyda as unknown as { sampleRate?: number; bufferSize?: number }).sampleRate = sampleRate;
    (Meyda as unknown as { sampleRate?: number; bufferSize?: number }).bufferSize = bufferSize;

    const meydaFeatures = Meyda.extract(
      ['rms', 'zcr', 'spectralCentroid', 'spectralFlatness', 'amplitudeSpectrum'],
      this.timeDomainData as unknown as Float32Array
    ) as unknown as {
      rms?: number;
      zcr?: number;
      spectralCentroid?: number;
      spectralFlatness?: number;
      amplitudeSpectrum?: number[] | Float32Array;
    };

    const rms = this.clamp(this.sanitizeFinite(meydaFeatures?.rms, 0), 0, 1);
    const amplitudeSpectrumRaw = meydaFeatures?.amplitudeSpectrum ?? [];
    const amplitudeSpectrum =
      amplitudeSpectrumRaw instanceof Float32Array
        ? amplitudeSpectrumRaw
        : Float32Array.from(amplitudeSpectrumRaw);

    // Primary band energy from Meyda spectrum
    let bandEnergy = this.sanitizeFinite(
      this.calculateSpectrumBandEnergy(amplitudeSpectrum, config.lowFreq, config.highFreq),
      0
    );

    // Optional secondary band (snare-style)
    if (config.secondaryLowFreq && config.secondaryHighFreq && config.secondaryWeight) {
      const secondary = this.sanitizeFinite(
        this.calculateSpectrumBandEnergy(amplitudeSpectrum, config.secondaryLowFreq, config.secondaryHighFreq),
        0
      );
      bandEnergy = bandEnergy * (1 - config.secondaryWeight) + secondary * config.secondaryWeight;
    }

    // Spectral flux (onset strength)
    const spectralFlux = this.sanitizeFinite(this.computeSpectralFlux(amplitudeSpectrum, previousSpectrum), 0);

    // Update histories using RAW metrics (avoid feedback loops)
    energyHistory.push(bandEnergy);
    if (energyHistory.length > config.historySize) energyHistory.shift();

    fluxHistory.push(spectralFlux);
    if (fluxHistory.length > config.historySize) fluxHistory.shift();

    rmsHistory.push(rms);
    if (rmsHistory.length > config.historySize) rmsHistory.shift();

    // Store current spectrum for next frame
    if (!detector.previousSpectrum || detector.previousSpectrum.length !== amplitudeSpectrum.length) {
      detector.previousSpectrum = new Float32Array(amplitudeSpectrum.length);
    }
    detector.previousSpectrum.set(amplitudeSpectrum);

    const avgEnergy = energyHistory.reduce((a, b) => a + b, 0) / energyHistory.length;
    const avgFlux = fluxHistory.reduce((a, b) => a + b, 0) / fluxHistory.length;
    const avgRms = rmsHistory.reduce((a, b) => a + b, 0) / rmsHistory.length;
    const eps = 1e-9;

    // Basic silence/noise gate (prevents random triggers on tiny mic noise)
    const minRmsByType: Record<PercussionType, number> = {
      kick: 0.015,
      snare: 0.012,
      hihat: 0.008,
      clap: 0.01,
      tom: 0.012,
      cymbal: 0.008,
      custom: 0.006,
    };
    const minRms = minRmsByType[config.type] ?? 0.01;

    // Warm up baseline before attempting detection
    const minWarmup = Math.min(12, Math.max(6, Math.floor(config.historySize / 4)));
    const warmedUp = energyHistory.length >= minWarmup && fluxHistory.length >= minWarmup && rmsHistory.length >= minWarmup;

    const safeAvgEnergy = Math.max(this.sanitizeFinite(avgEnergy, 0), 1e-6);
    const safeAvgFlux = Math.max(this.sanitizeFinite(avgFlux, 0), 1e-6);

    // Ratios can explode when averages are tiny; clamp to keep score stable.
    const energyRatio = this.clamp(bandEnergy / (safeAvgEnergy + eps), 0, 5);
    const fluxRatio = this.clamp(spectralFlux / (safeAvgFlux + eps), 0, 5);

    const sensitivity = this.clamp(this.sanitizeFinite(config.transientSensitivity, 0.7), 0, 1);

    // Blend energy + flux; sensitivity strongly increases flux influence
    const baseFluxWeight = config.useSpectralFlux ? 0.55 : 0.25;
    const fluxWeight = this.clamp(baseFluxWeight + sensitivity * 0.45, 0, 0.9);
    let score = energyRatio * (1 - fluxWeight) + fluxRatio * fluxWeight;

    // Type gating using Meyda descriptors (prevents e.g. hi-hat triggering kick)
    const match = this.percussionFeatureMatch(config.type, {
      spectralCentroid: meydaFeatures?.spectralCentroid,
      spectralFlatness: meydaFeatures?.spectralFlatness,
      zcr: meydaFeatures?.zcr,
    });
    // Keep gating gentle, but still reduce obvious mismatches.
    score *= 0.4 + 0.6 * match;

    // Absolute onset gate: higher sensitivity makes onset requirement easier.
    const onsetMultiplier = this.clamp(1.3 - sensitivity * 0.35, 1.0, 1.3);
    const onsetOk = spectralFlux > safeAvgFlux * onsetMultiplier;

    // Early exit: no detection attempt if silent or not warmed up.
    if (!warmedUp || rms < minRms) {
      return {
        detected: false,
        intensity: 0,
        energy: rms,
        averageEnergy: this.clamp(avgRms, 0, 1),
        spectralFlux: config.useSpectralFlux ? this.clamp(fluxRatio / 5, 0, 1) : undefined,
        timestamp: now,
      };
    }

    const effectiveThreshold = config.threshold * this.clamp(1.15 - sensitivity * 0.25, 0.85, 1.15);
    const newDetection =
      onsetOk &&
      score > effectiveThreshold &&
      now - lastDetectionTime > config.cooldown;

    const intensity = this.clamp(score, 0, 5);

    if (newDetection) {
      detector.lastDetectionTime = now;
      detector.holdUntilTime = now + (config.holdTime || 100);
      detector.lastIntensity = intensity;
      detector.lastEnergy = rms;
      detector.lastAverageEnergy = Math.max(0, Math.min(1, avgRms));
    }

    return {
      detected: newDetection,
      intensity,
      energy: rms,
      averageEnergy: Math.max(0, Math.min(1, avgRms)),
      spectralFlux: config.useSpectralFlux ? this.clamp(fluxRatio / 5, 0, 1) : undefined,
      timestamp: now,
    };
  }

  /**
   * Convenience method: detect kick drum
   */
  detectKick(threshold?: number, cooldown?: number): PercussionDetectionResult {
    const id = '__kick__';
    if (!this.percussionDetectors.has(id)) {
      this.createPercussionDetector(id, {
        type: 'kick',
        ...(threshold !== undefined && { threshold }),
        ...(cooldown !== undefined && { cooldown }),
      });
    } else if (threshold !== undefined || cooldown !== undefined) {
      this.updatePercussionDetector(id, {
        ...(threshold !== undefined && { threshold }),
        ...(cooldown !== undefined && { cooldown }),
      });
    }
    return this.detectPercussion(id);
  }

  /**
   * Convenience method: detect snare drum
   */
  detectSnare(threshold?: number, cooldown?: number): PercussionDetectionResult {
    const id = '__snare__';
    if (!this.percussionDetectors.has(id)) {
      this.createPercussionDetector(id, {
        type: 'snare',
        ...(threshold !== undefined && { threshold }),
        ...(cooldown !== undefined && { cooldown }),
      });
    } else if (threshold !== undefined || cooldown !== undefined) {
      this.updatePercussionDetector(id, {
        ...(threshold !== undefined && { threshold }),
        ...(cooldown !== undefined && { cooldown }),
      });
    }
    return this.detectPercussion(id);
  }

  /**
   * Convenience method: detect hi-hat
   */
  detectHihat(threshold?: number, cooldown?: number): PercussionDetectionResult {
    const id = '__hihat__';
    if (!this.percussionDetectors.has(id)) {
      this.createPercussionDetector(id, {
        type: 'hihat',
        ...(threshold !== undefined && { threshold }),
        ...(cooldown !== undefined && { cooldown }),
      });
    } else if (threshold !== undefined || cooldown !== undefined) {
      this.updatePercussionDetector(id, {
        ...(threshold !== undefined && { threshold }),
        ...(cooldown !== undefined && { cooldown }),
      });
    }
    return this.detectPercussion(id);
  }

  /**
   * Convenience method: detect clap
   */
  detectClap(threshold?: number, cooldown?: number): PercussionDetectionResult {
    const id = '__clap__';
    if (!this.percussionDetectors.has(id)) {
      this.createPercussionDetector(id, {
        type: 'clap',
        ...(threshold !== undefined && { threshold }),
        ...(cooldown !== undefined && { cooldown }),
      });
    } else if (threshold !== undefined || cooldown !== undefined) {
      this.updatePercussionDetector(id, {
        ...(threshold !== undefined && { threshold }),
        ...(cooldown !== undefined && { cooldown }),
      });
    }
    return this.detectPercussion(id);
  }

  /**
   * Convenience method: detect any percussion with custom config
   */
  detectCustomPercussion(
    lowFreq: number,
    highFreq: number,
    threshold?: number,
    cooldown?: number,
    useSpectralFlux?: boolean
  ): PercussionDetectionResult {
    const id = `__custom_${lowFreq}_${highFreq}__`;
    if (!this.percussionDetectors.has(id)) {
      this.createPercussionDetector(id, {
        type: 'custom',
        lowFreq,
        highFreq,
        ...(threshold !== undefined && { threshold }),
        ...(cooldown !== undefined && { cooldown }),
        ...(useSpectralFlux !== undefined && { useSpectralFlux }),
      });
    } else {
      this.updatePercussionDetector(id, {
        lowFreq,
        highFreq,
        ...(threshold !== undefined && { threshold }),
        ...(cooldown !== undefined && { cooldown }),
        ...(useSpectralFlux !== undefined && { useSpectralFlux }),
      });
    }
    return this.detectPercussion(id);
  }

  /**
   * Disconnect and cleanup
   */
  destroy(): void {
    try {
      this.sourceNode.disconnect();
      this.gainNode.disconnect();
      this.analyzerNode.disconnect();
      this.normalizationGainNode?.disconnect();
      this.compressorNode?.disconnect();
    } catch {
      // Already disconnected
    }
    this.energyHistory = [];
    this.beatTimes = [];
    this.rmsHistory = [];
    this.currentBPM = 0;
    this.bpmConfidence = 0;
    this.currentNormalizationGain = 1.0;
    this.normalizationGainNode = null;
    this.compressorNode = null;
    this.percussionDetectors.clear();
  }
}
