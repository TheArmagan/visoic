# Visoic Audio FFT API

A comprehensive, high-performance audio analysis API for real-time FFT visualization, beat detection, BPM calculation, and audio processing. Designed for audio visualization applications with support for multiple input devices and analyzers.

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Core Concepts](#core-concepts)
- [API Reference](#api-reference)
  - [AudioManager](#audiomanager)
  - [FFTAnalyzer](#fftanalyzer)
  - [Frequency Analysis](#frequency-analysis)
  - [Beat & BPM Detection](#beat--bpm-detection)
  - [Volume Normalization](#volume-normalization)
  - [Events](#events)
- [Svelte Hooks](#svelte-hooks)
- [Types](#types)
- [Examples](#examples)

---

## Features

- **Multiple Input Devices** - Manage and switch between audio input devices
- **Multiple Analyzers per Device** - Create multiple FFT analyzers on the same device with different configurations
- **Configurable FFT** - FFT sizes from 32 to 32768, adjustable smoothing, gain, and decibel range
- **Frequency Band Analysis** - Pre-defined bands (sub-bass, bass, mid, etc.) and custom frequency ranges
- **Beat Detection** - Real-time beat detection with configurable threshold
- **BPM Calculation** - Automatic tempo estimation with confidence scoring
- **Volume Normalization** - Automatic gain control with compressor support
- **Event System** - Subscribe to data, beat, peak, and device change events
- **Svelte Integration** - Reactive stores and hooks for Svelte components
- **TypeScript** - Fully typed API

---

## Installation

The API is part of the Visoic application. Import from:

```typescript
import { audioManager } from '$lib/api/audio';
```

---

## Quick Start

```typescript
import { audioManager } from '$lib/api/audio';

// 1. Initialize the audio manager
await audioManager.initialize();

// 2. Create an analyzer with desired settings
const analyzer = await audioManager.createAnalyzer({
  fftSize: 1024,
  smoothingTimeConstant: 0.8,
  gain: 1.0,
});

// 3. Subscribe to data events
analyzer.onData((event) => {
  const { frequencyBands, data } = event;
  
  console.log('Bass level:', frequencyBands.bass);
  console.log('Average amplitude:', data.averageAmplitude);
  console.log('BPM:', data.bpm);
});

// 4. Or subscribe to specific events
audioManager.on('beat', (event) => {
  console.log('Beat detected!', event.data.intensity);
  console.log('Current BPM:', event.data.bpm);
});
```

---

## Core Concepts

### Architecture

```
AudioManager (singleton)
    │
    ├── DeviceManager (manages input devices)
    │
    └── AudioSource (one per device)
            │
            ├── FFTAnalyzer #1 (fftSize: 128, smoothing: 0)
            ├── FFTAnalyzer #2 (fftSize: 1024, smoothing: 0.8)
            └── FFTAnalyzer #3 (fftSize: 2048, gain: 2.0)
```

### Audio Graph

```
Without Normalization:
  MediaStream → GainNode → AnalyserNode

With Normalization:
  MediaStream → GainNode → NormalizationGain → Compressor → AnalyserNode
```

---

## API Reference

### AudioManager

The main entry point for the audio API. Use the singleton instance `audioManager`.

#### Methods

```typescript
// Initialize (required before use)
await audioManager.initialize(): Promise<void>

// Check initialization status
audioManager.isInitialized(): boolean

// Get available devices
audioManager.getDevices(): AudioDeviceInfo[]
audioManager.getInputDevices(): AudioDeviceInfo[]
audioManager.getDefaultDevice(): AudioDeviceInfo | undefined
await audioManager.refreshDevices(): Promise<AudioDeviceInfo[]>

// Create analyzers
await audioManager.createAnalyzer(options?: CreateAnalyzerOptions): Promise<AnalyzerHandle>
await audioManager.createAnalyzers(configs: CreateAnalyzerOptions[]): Promise<AnalyzerHandle[]>

// Manage analyzers
audioManager.getAnalyzer(id: string): FFTAnalyzer | undefined
audioManager.getAnalyzers(): FFTAnalyzer[]
audioManager.removeAnalyzer(id: string): boolean

// Control
await audioManager.suspendAll(): Promise<void>
await audioManager.resumeAll(): Promise<void>
await audioManager.stopAll(): Promise<void>
await audioManager.destroy(): Promise<void>

// Events
audioManager.on(event: AudioEventType, listener: Function): this
audioManager.off(event: AudioEventType, listener: Function): this
audioManager.once(event: AudioEventType, listener: Function): this
```

#### CreateAnalyzerOptions

```typescript
interface CreateAnalyzerOptions {
  // Device selection
  deviceId?: string;              // 'default' or specific device ID
  
  // FFT settings
  fftSize?: FFTSize;              // 32-32768, power of 2
  smoothingTimeConstant?: number; // 0-1, default: 0.8
  gain?: number;                  // Gain multiplier, default: 1.0
  minDecibels?: number;           // Default: -100
  maxDecibels?: number;           // Default: -30
  
  // Normalization
  normalizationEnabled?: boolean;
  normalization?: NormalizationConfig;
  
  // Metadata
  label?: string;
}
```

---

### FFTAnalyzer

Performs FFT analysis on audio data.

#### Properties

```typescript
analyzer.id: string              // Unique identifier
analyzer.label: string           // Custom or auto-generated label
analyzer.frequencyBinCount: number
analyzer.fftSize: FFTSize
```

#### Core Methods

```typescript
// Get all data at once (most efficient)
analyzer.getData(): AnalyzerData

// Individual data access
analyzer.getFrequencyData(): Float32Array        // Raw frequency data in dB
analyzer.getByteFrequencyData(): Uint8Array      // Normalized 0-255
analyzer.getTimeDomainData(): Float32Array       // Waveform data
analyzer.getFrequencyBands(): FrequencyBandData  // Pre-defined bands

// Configuration
analyzer.getConfig(): AnalyzerConfig
analyzer.updateConfig(config: Partial<AnalyzerConfig>): void
analyzer.setGain(gain: number): void
analyzer.setGainSmooth(gain: number, duration?: number): void
analyzer.setSmoothing(smoothing: number): void
analyzer.setFFTSize(fftSize: FFTSize): void

// Cleanup
analyzer.destroy(): void
```

---

### Frequency Analysis

#### Pre-defined Frequency Bands

```typescript
const bands = analyzer.getFrequencyBands();
// Returns FrequencyBandData:
// {
//   subBass: number,    // 20-60 Hz
//   bass: number,       // 60-250 Hz
//   lowMid: number,     // 250-500 Hz
//   mid: number,        // 500-2000 Hz
//   upperMid: number,   // 2000-4000 Hz
//   presence: number,   // 4000-6000 Hz
//   brilliance: number  // 6000-20000 Hz
// }
// All values normalized 0-1
```

#### Custom Frequency Ranges

```typescript
// Simple average (0-1)
const bassLevel = analyzer.getFrequencyRange(60, 250);

// Advanced with calculation mode
const value = analyzer.getFrequencyRangeAdvanced(lowFreq, highFreq, mode);
// Modes: 'average' | 'peak' | 'rms' | 'sum' | 'weighted'

// Multiple ranges at once (efficient)
const ranges = analyzer.getFrequencyRanges([
  [20, 60],      // Returns as "20-60Hz"
  [60, 250],     // Returns as "60-250Hz"
  { low: 100, high: 500, label: 'kick', mode: 'peak' }
]);
// Returns Map<string, number>

// As array for easy iteration
const values = analyzer.getFrequencyRangesArray([
  [20, 60],
  [60, 250],
  [250, 2000]
]);
// Returns number[]

// Single frequency value
const at440Hz = analyzer.getValueAtFrequency(440);

// Raw bins in range
const { bins, frequencies } = analyzer.getBinsInRange(100, 1000);

// Frequency info
const info = analyzer.getFrequencyInfo();
// { sampleRate, nyquist, binWidth, binCount }
```

#### Frequency/Bin Conversion

```typescript
const frequency = analyzer.binToFrequency(binIndex);
const bin = analyzer.frequencyToBin(frequency);
```

---

### Beat & BPM Detection

#### Beat Detection

```typescript
const beat = analyzer.detectBeat(threshold?: number);
// Returns:
// {
//   detected: boolean,      // True if beat detected this frame
//   intensity: number,      // Beat intensity relative to average
//   bpm: number,           // Current BPM estimate
//   bpmConfidence: number  // 0-1, confidence in BPM
// }
```

#### BPM Methods

```typescript
// Get current BPM
const { bpm, confidence } = analyzer.getBPM();

// Reset BPM calculation (e.g., when switching tracks)
analyzer.resetBPM();

// Manual tap tempo
const { bpm, confidence } = analyzer.tapTempo();
```

#### Beat Events

```typescript
audioManager.on('beat', (event) => {
  console.log('Beat!', {
    intensity: event.data.intensity,
    bpm: event.data.bpm,
    bpmConfidence: event.data.bpmConfidence
  });
});
```

---

### Volume Normalization

Automatically adjusts gain to maintain consistent audio levels.

#### Enable/Disable

```typescript
// Enable with default settings
analyzer.enableNormalization();

// Enable with custom settings
analyzer.enableNormalization({
  targetLevel: 0.5,         // Target RMS level (0-1)
  attackTime: 0.1,          // How fast to increase gain
  releaseTime: 0.05,        // How fast to decrease gain
  maxGain: 3.0,             // Maximum gain boost
  minGain: 0.1,             // Minimum gain (limiter)
  useCompressor: true,      // Use dynamics compressor
  compressorThreshold: -24, // Compressor threshold in dB
  compressorRatio: 4        // Compressor ratio
});

// Disable
analyzer.disableNormalization();

// Toggle
const isEnabled = analyzer.toggleNormalization();
```

#### Query State

```typescript
analyzer.isNormalizationEnabled(): boolean
analyzer.getNormalizationConfig(): NormalizationConfig
analyzer.getNormalizationGain(): number  // Current gain value
analyzer.updateNormalizationConfig(config: Partial<NormalizationConfig>): void
```

---

### Events

#### Event Types

| Event | Description | Data |
|-------|-------------|------|
| `data` | New analyzer data available | `AnalyzerData` + `FrequencyBandData` |
| `beat` | Beat detected | `{ intensity, bpm, bpmConfidence }` |
| `peak` | Peak level detected | `{ level, frequency }` |
| `deviceChange` | Audio devices changed | `AudioDeviceInfo[]` |
| `stateChange` | Source state changed | `{ state: 'active' \| 'inactive' \| 'suspended' }` |
| `error` | Error occurred | `{ code, message }` |

#### Subscribing

```typescript
// Subscribe to all data events
audioManager.on('data', (event) => {
  console.log(event.analyzerId, event.data);
});

// Subscribe to specific analyzer's data
const handle = await audioManager.createAnalyzer();
const unsubscribe = handle.onData((event) => {
  // Only receives events for this analyzer
});

// One-time listener
audioManager.once('beat', (event) => {
  console.log('First beat detected!');
});

// Unsubscribe
audioManager.off('data', listener);
audioManager.removeAllListeners('data');
audioManager.removeAllListeners(); // Remove all
```

---

## Svelte Hooks

### useAnalyzer

Creates a reactive analyzer store.

```svelte
<script>
  import { useAnalyzer } from '$lib/api/audio';
  
  const { data, bands, isActive } = useAnalyzer({
    fftSize: 1024,
    smoothingTimeConstant: 0.8,
  });
</script>

{#if $isActive}
  <div>Bass: {($bands?.bass * 100).toFixed(0)}%</div>
  <div>RMS: {$data?.rmsLevel.toFixed(3)}</div>
{/if}
```

### useMultiAnalyzer

Manages multiple analyzers.

```svelte
<script>
  import { useMultiAnalyzer } from '$lib/api/audio';
  
  const { analyzers, add, remove } = useMultiAnalyzer([
    { fftSize: 128, label: 'fast' },
    { fftSize: 2048, label: 'detailed' },
  ]);
</script>

{#each [...$analyzers] as [id, { data, bands }]}
  <div>{id}: {data.averageAmplitude.toFixed(2)}</div>
{/each}
```

### useAudioDevices

Reactive list of audio devices.

```svelte
<script>
  import { useAudioDevices } from '$lib/api/audio';
  const devices = useAudioDevices();
</script>

<select>
  {#each $devices as device}
    <option value={device.deviceId}>{device.label}</option>
  {/each}
</select>
```

### useBeats

Subscribe to beat events.

```svelte
<script>
  import { useBeats } from '$lib/api/audio';
  const beats = useBeats();
</script>

<div class:pulse={$beats.detected}>
  BPM: {$beats.bpm} (confidence: {($beats.bpmConfidence * 100).toFixed(0)}%)
</div>
```

### useBPM

Subscribe to BPM updates.

```svelte
<script>
  import { useBPM } from '$lib/api/audio';
  const bpm = useBPM();
</script>

{#if $bpm.isStable}
  <div class="bpm">{$bpm.value} BPM</div>
{:else}
  <div class="bpm calculating">Calculating...</div>
{/if}
```

### usePeaks

Subscribe to peak events.

```svelte
<script>
  import { usePeaks } from '$lib/api/audio';
  const peaks = usePeaks();
</script>

{#if $peaks.detected}
  <div>Peak at {$peaks.frequency.toFixed(0)} Hz</div>
{/if}
```

---

## Types

### FFTSize

```typescript
type FFTSize = 32 | 64 | 128 | 256 | 512 | 1024 | 2048 | 4096 | 8192 | 16384 | 32768;
```

### AnalyzerConfig

```typescript
interface AnalyzerConfig {
  fftSize: FFTSize;
  smoothingTimeConstant: number;  // 0-1
  gain: number;
  minDecibels: number;
  maxDecibels: number;
  windowFunction: WindowFunction;
  label?: string;
  normalizationEnabled?: boolean;
  normalization?: NormalizationConfig;
}
```

### AnalyzerData

```typescript
interface AnalyzerData {
  frequencyData: Float32Array;      // Raw dB values
  byteFrequencyData: Uint8Array;    // 0-255 normalized
  timeDomainData: Float32Array;     // Waveform
  byteTimeDomainData: Uint8Array;   // 0-255 waveform
  averageAmplitude: number;         // 0-1
  peakFrequencyBin: number;
  peakFrequency: number;            // Hz
  rmsLevel: number;
  timestamp: number;
}
```

### FrequencyBandData

```typescript
interface FrequencyBandData {
  subBass: number;    // 20-60 Hz
  bass: number;       // 60-250 Hz
  lowMid: number;     // 250-500 Hz
  mid: number;        // 500-2000 Hz
  upperMid: number;   // 2000-4000 Hz
  presence: number;   // 4000-6000 Hz
  brilliance: number; // 6000-20000 Hz
}
```

### NormalizationConfig

```typescript
interface NormalizationConfig {
  targetLevel: number;        // 0-1, default: 0.5
  attackTime: number;         // 0-1, default: 0.1
  releaseTime: number;        // 0-1, default: 0.05
  maxGain: number;            // default: 3.0
  minGain: number;            // default: 0.1
  useCompressor: boolean;     // default: true
  compressorThreshold: number; // dB, default: -24
  compressorRatio: number;    // default: 4
}
```

### AudioDeviceInfo

```typescript
interface AudioDeviceInfo {
  deviceId: string;
  label: string;
  groupId: string;
  kind: 'audioinput' | 'audiooutput';
  isDefault: boolean;
}
```

---

## Examples

### Basic Visualizer

```typescript
import { audioManager } from '$lib/api/audio';

const canvas = document.getElementById('visualizer');
const ctx = canvas.getContext('2d');

await audioManager.initialize();
const handle = await audioManager.createAnalyzer({ fftSize: 256 });

function draw() {
  const data = handle.getData();
  const bars = data.byteFrequencyData;
  
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  const barWidth = canvas.width / bars.length;
  bars.forEach((value, i) => {
    const height = (value / 255) * canvas.height;
    ctx.fillRect(i * barWidth, canvas.height - height, barWidth - 1, height);
  });
  
  requestAnimationFrame(draw);
}

draw();
```

### Multi-Band Visualizer

```typescript
const handle = await audioManager.createAnalyzer({ fftSize: 2048 });

function update() {
  const bands = handle.getFrequencyBands();
  
  document.getElementById('sub-bass').style.height = `${bands.subBass * 100}%`;
  document.getElementById('bass').style.height = `${bands.bass * 100}%`;
  document.getElementById('mid').style.height = `${bands.mid * 100}%`;
  document.getElementById('high').style.height = `${bands.brilliance * 100}%`;
  
  requestAnimationFrame(update);
}
```

### Beat-Reactive Effects

```typescript
audioManager.on('beat', (event) => {
  if (event.data.bpmConfidence > 0.5) {
    // Flash effect
    document.body.classList.add('flash');
    setTimeout(() => document.body.classList.remove('flash'), 100);
    
    // Scale effect based on intensity
    const scale = 1 + event.data.intensity * 0.2;
    element.style.transform = `scale(${scale})`;
  }
});
```

### Multiple Analyzers for Different Purposes

```typescript
// Fast analyzer for reactive effects
const fastAnalyzer = await audioManager.createAnalyzer({
  fftSize: 128,
  smoothingTimeConstant: 0,
  label: 'fast-reactive',
});

// Detailed analyzer for spectrum display
const detailedAnalyzer = await audioManager.createAnalyzer({
  fftSize: 2048,
  smoothingTimeConstant: 0.8,
  label: 'spectrum-display',
});

// Normalized analyzer for consistent levels
const normalizedAnalyzer = await audioManager.createAnalyzer({
  fftSize: 1024,
  normalizationEnabled: true,
  normalization: { targetLevel: 0.6 },
  label: 'normalized',
});
```

### Custom Frequency Ranges

```typescript
// Define custom ranges for specific instruments
const drumRanges = analyzer.getFrequencyRanges([
  { low: 20, high: 80, label: 'kick', mode: 'peak' },
  { low: 150, high: 250, label: 'snare-body', mode: 'rms' },
  { low: 2000, high: 5000, label: 'snare-snap', mode: 'average' },
  { low: 8000, high: 16000, label: 'hihat', mode: 'average' },
]);

// Use in visualization
const kickLevel = drumRanges.get('kick');
const snareLevel = (drumRanges.get('snare-body') + drumRanges.get('snare-snap')) / 2;
```

---

## License

Part of the Visoic project.
