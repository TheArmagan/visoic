# Value Manager System

A reactive value management system for Visoic that bridges audio FFT analysis with application state. This system provides a unified way to create, manage, and persist reactive values from various sources including audio analyzers, computed expressions, and manual inputs.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Value Manager                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │   Values    │  │   Events    │  │   Computed Values       │ │
│  │   Storage   │  │   System    │  │   (Expression Engine)   │ │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
         ▲                                      ▲
         │                                      │
         │              ┌───────────────────────┘
         │              │
┌────────┴──────────────┴─────────────────────────────────────────┐
│                      Audio Bridge                                │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │  Analyzer   │  │  Bindings   │  │   Extraction Methods    │ │
│  │  Handles    │  │   Map       │  │   (FFT → Value)         │ │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
         ▲
         │
┌────────┴────────────────────────────────────────────────────────┐
│                      Config Manager                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │   Storage   │  │   Auto-     │  │   Import/Export         │ │
│  │   (JSON)    │  │   Save      │  │   Profiles              │ │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. Value Manager (`value-manager.ts`)

The central registry for all reactive values in the application.

#### Value Types

```typescript
type ValueType = 'number' | 'boolean' | 'string' | 'array' | 'object';

interface NumberValueDefinition {
  id: string;           // Unique identifier (e.g., "audio.bass")
  name: string;         // Display name
  type: 'number';
  defaultValue: number;
  min?: number;         // Minimum value
  max?: number;         // Maximum value
  step?: number;        // Increment step
  precision?: number;   // Decimal places for display
  unit?: string;        // Unit label (e.g., "Hz", "dB")
  category?: string;    // Grouping category
  source: ValueSource;  // Origin of the value
}
```

#### Source Types

```typescript
type ValueSource = 
  | { type: 'audio'; analyzerId: string; extraction: AudioExtraction }
  | { type: 'computed'; expression: string; dependencies: string[] }
  | { type: 'manual' }
  | { type: 'system' };
```

#### Key Methods

```typescript
// Registration
valueManager.register(definition: AnyValueDefinition): void
valueManager.unregister(id: string): void

// Value access
valueManager.get<T>(id: string): T | undefined
valueManager.set(id: string, value: unknown): void
valueManager.reset(id: string): void

// Queries
valueManager.getAllDefinitions(): AnyValueDefinition[]
valueManager.getByCategory(category: string): AnyValueDefinition[]
valueManager.getBySource(sourceType: string): AnyValueDefinition[]

// Computed values
valueManager.createComputed(
  id: string,
  name: string,
  expression: string,    // e.g., "(audio_bass + audio_mid) / 2"
  dependencies: string[] // e.g., ["audio.bass", "audio.mid"]
): void

// Events
valueManager.on('change', (id, value, oldValue) => {})
valueManager.on('add', (definition) => {})
valueManager.on('remove', (id) => {})
```

#### Expression Engine

Computed values support mathematical expressions with these functions:

- **Math**: `abs`, `floor`, `ceil`, `round`, `min`, `max`, `pow`, `sqrt`, `sin`, `cos`, `tan`
- **Utility**: `clamp(value, min, max)`, `lerp(a, b, t)`, `map(value, inMin, inMax, outMin, outMax)`

Variable naming: Use underscores for dots (e.g., `audio.bass` → `audio_bass`)

### 2. Audio Bridge (`audio-bridge.ts`)

Connects FFT analyzers to the value system.

#### Creating Analyzers

```typescript
const handle = await audioBridge.createAnalyzer({
  deviceId: 'default',
  fftSize: 1024,
  smoothingTimeConstant: 0.8,
  gain: 1.0,
  label: 'Main Analyzer',
  normalizationEnabled: false,
});
```

#### Binding Values to FFT Data

```typescript
audioBridge.bind(
  'audio.bass',           // Value ID
  analyzerId,             // Analyzer handle ID
  {
    type: 'frequencyRange',
    lowFreq: 60,
    highFreq: 250,
    mode: 'average',      // 'average' | 'peak' | 'rms' | 'sum' | 'weighted'
    smoothing: 0.5,
    outputRange: { min: 0, max: 1 }
  },
  {
    name: 'Bass Level',
    min: 0,
    max: 1,
  }
);
```

#### Extraction Types

| Type | Description | Parameters |
|------|-------------|------------|
| `frequencyRange` | Custom frequency range | `lowFreq`, `highFreq`, `mode` |
| `frequencyBand` | Predefined band | `band`: subBass, bass, lowMid, mid, upperMid, presence, brilliance |
| `amplitude` | Overall amplitude | - |
| `rms` | RMS level | - |
| `peak` | Peak value | - |
| `bpm` | Detected BPM | - |
| `beat` | Beat detection (0/1) | - |

### 3. Config Manager (`config-manager.ts`)

Persists configuration to localStorage with automatic saving.

#### Configuration Structure

```typescript
interface AppConfig {
  version: number;
  analyzers: AnalyzerConfig[];
  bindings: BindingConfig[];
  computedValues: ComputedValueConfig[];
  settings: {
    autoSave: boolean;
    autoSaveInterval: number;
  };
}
```

#### Key Methods

```typescript
// Manual save/load
configManager.save(): void
configManager.load(): AppConfig

// Auto-save (enabled by default)
configManager.enableAutoSave(interval?: number): void
configManager.disableAutoSave(): void

// Export/Import
configManager.exportToJson(): string
configManager.importFromJson(json: string): void

// Reset
configManager.reset(): void
```

## Svelte Hooks

### Value Hooks

```typescript
// Single value (readable store)
const bassLevel = useValue<number>('audio.bass');
// Usage: {$bassLevel}

// Writable value
const threshold = useValueWritable<number>('settings.threshold');
// Usage: {$threshold}, $threshold = 0.5

// Multiple values
const audioValues = useValues(['audio.bass', 'audio.mid', 'audio.high']);
// Usage: {$audioValues['audio.bass']}

// By category
const allAudio = useCategory('audio');
// Returns: Readable<AnyValueDefinition[]>
```

### Audio Hooks

```typescript
// All analyzers
const analyzers = useAudioAnalyzers();
// Returns: Readable<AnalyzerHandle[]>

// All bindings
const bindings = useAudioBindings();
// Returns: Readable<BindingInfo[]>
```

## Data Flow

### 1. Audio → Value Flow

```
Microphone → MediaStream → AudioContext → AnalyserNode
                                              │
                                              ▼
                                    FFT Data (Uint8Array)
                                              │
                                              ▼
                              AudioValueBridge.update() [60fps]
                                              │
                              ┌───────────────┼───────────────┐
                              ▼               ▼               ▼
                        frequencyRange   frequencyBand     bpm/beat
                              │               │               │
                              ▼               ▼               ▼
                        Extract value    Get band data   Detect rhythm
                              │               │               │
                              └───────────────┼───────────────┘
                                              ▼
                                    Apply smoothing
                                              │
                                              ▼
                                    Map to output range
                                              │
                                              ▼
                                 ValueManager.set(id, value)
                                              │
                                              ▼
                                    Emit 'change' event
                                              │
                              ┌───────────────┼───────────────┐
                              ▼               ▼               ▼
                        Update stores   Trigger computed   Notify UI
```

### 2. Computed Value Flow

```
Dependency value changes
         │
         ▼
ValueManager detects change
         │
         ▼
Find computed values depending on this
         │
         ▼
Build expression context:
  { audio_bass: 0.5, audio_mid: 0.3, ... }
         │
         ▼
Evaluate expression:
  "(audio_bass + audio_mid) / 2" → 0.4
         │
         ▼
Set computed value (with recursion guard)
         │
         ▼
Trigger dependent computed values (if any)
```

### 3. Config Persistence Flow

```
UI Change (e.g., create analyzer)
         │
         ▼
audioBridge.createAnalyzer()
         │
         ▼
Emit 'analyzer:add' event
         │
         ▼
ConfigManager receives event
         │
         ▼
Update in-memory config
         │
         ▼
Schedule auto-save (debounced)
         │
         ▼
Save to localStorage
```

## Usage Examples

### Example 1: Simple Bass Reactive Value

```typescript
// Setup
await audioBridge.initialize();
const handle = await audioBridge.createAnalyzer({
  deviceId: 'default',
  fftSize: 2048,
  smoothingTimeConstant: 0.8,
});

audioBridge.bind('audio.bass', handle.id, {
  type: 'frequencyRange',
  lowFreq: 20,
  highFreq: 250,
  mode: 'average',
  smoothing: 0.3,
});

// In Svelte component
const bass = useValue<number>('audio.bass');
```

### Example 2: Computed Average

```typescript
// Create base values
audioBridge.bind('audio.low', analyzerId, { type: 'frequencyBand', band: 'bass' });
audioBridge.bind('audio.mid', analyzerId, { type: 'frequencyBand', band: 'mid' });
audioBridge.bind('audio.high', analyzerId, { type: 'frequencyBand', band: 'brilliance' });

// Create computed average
valueManager.createComputed(
  'audio.average',
  'Audio Average',
  '(audio_low + audio_mid + audio_high) / 3',
  ['audio.low', 'audio.mid', 'audio.high']
);
```

### Example 3: Beat-Reactive Scaling

```typescript
audioBridge.bind('audio.beat', analyzerId, { type: 'beat' });
audioBridge.bind('audio.intensity', analyzerId, { type: 'rms' });

valueManager.createComputed(
  'visual.scale',
  'Visual Scale',
  'lerp(1.0, 1.5, audio_beat * audio_intensity)',
  ['audio.beat', 'audio.intensity']
);
```

## File Structure

```
lib/api/values/
├── types.ts           # Type definitions
├── value-manager.ts   # Core value registry
├── audio-bridge.ts    # FFT → Value bridge
├── config-manager.ts  # Persistence layer
├── hooks.ts           # Svelte reactive hooks
├── index.ts           # Public exports
└── README.md          # This documentation
```

## Best Practices

1. **Naming Convention**: Use dot notation for IDs (`audio.bass`, `computed.average`)
2. **Categories**: Group related values (`audio`, `computed`, `settings`)
3. **Smoothing**: Use 0.3-0.7 for responsive but smooth visuals
4. **Output Range**: Normalize to 0-1 for easier use in shaders/animations
5. **Computed Dependencies**: Keep dependency chains shallow to avoid latency
6. **Auto-Save**: Enabled by default, disable during batch operations

## Events Reference

### ValueManager Events

| Event | Payload | Description |
|-------|---------|-------------|
| `change` | `(id, value, oldValue)` | Value changed |
| `add` | `(definition)` | Value registered |
| `remove` | `(id)` | Value unregistered |

### AudioBridge Events

| Event | Payload | Description |
|-------|---------|-------------|
| `analyzer:add` | `(handle)` | Analyzer created |
| `analyzer:remove` | `(id)` | Analyzer removed |
| `binding:add` | `(info)` | Binding created |
| `binding:remove` | `(valueId)` | Binding removed |

### ConfigManager Events

| Event | Payload | Description |
|-------|---------|-------------|
| `save` | `(config)` | Config saved |
| `load` | `(config)` | Config loaded |
| `reset` | `()` | Config reset |
