// ============================================
// Visoic Node System - Runtime Bridge
// ============================================
// Connects node graph to actual audio/value systems

import { nodeGraph } from './graph';
import { outputRuntime } from './output-runtime';
import { renderContextRuntime } from './render-context-runtime';
import type { VisoicNode, AudioNodeData, EvaluationContext } from './types';
import { audioManager, type AnalyzerHandle, type FFTAnalyzer, type FFTSize } from '../audio';

// ============================================
// Audio Node Runtime
// ============================================

interface AudioNodeRuntime {
  nodeId: string;
  analyzerId?: string;
  analyzerHandle?: AnalyzerHandle;
  initializing?: boolean;
}

class NodeRuntimeManager {
  private audioRuntimes: Map<string, AudioNodeRuntime> = new Map();
  private isRunning = false;
  private animationFrameId: number | null = null;
  private startTime = 0;
  private lastFrameTime = 0;
  private frameCount = 0;

  // ============================================
  // Lifecycle
  // ============================================

  async initialize(): Promise<void> {
    // Initialize audio system
    if (!audioManager.isInitialized()) {
      await audioManager.initialize();
    }

    // Initialize render context runtime
    await renderContextRuntime.initialize();

    // Subscribe to graph changes
    nodeGraph.subscribe(() => {
      this.syncAudioNodes();
    });

    // Initial sync
    this.syncAudioNodes();
  }

  start(): void {
    if (this.isRunning) return;

    this.isRunning = true;
    this.startTime = performance.now() / 1000;
    this.lastFrameTime = this.startTime;
    this.frameCount = 0;

    this.runLoop();
  }

  stop(): void {
    this.isRunning = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  private runLoop = (): void => {
    if (!this.isRunning) return;

    const now = performance.now() / 1000;
    const deltaTime = now - this.lastFrameTime;
    this.lastFrameTime = now;
    this.frameCount++;

    const context: EvaluationContext = {
      time: now - this.startTime,
      deltaTime,
      frame: this.frameCount,
      resolution: [1920, 1080],
    };

    // Update audio node outputs before graph evaluation
    this.updateAudioNodeOutputs();

    // Evaluate graph
    nodeGraph.evaluate(context);

    // Update render context runtime (shader uniforms, layer settings)
    renderContextRuntime.tick(context.time, context.deltaTime);

    // Update output windows
    outputRuntime.tick();

    this.animationFrameId = requestAnimationFrame(this.runLoop);
  };

  // ============================================
  // Audio Node Management
  // ============================================

  private syncAudioNodes(): void {
    const nodes = nodeGraph.getNodes();
    const audioNodes = nodes.filter((n) => n.data.category === 'audio');

    // Find new audio device nodes that need analyzers
    for (const node of audioNodes) {
      const data = node.data as AudioNodeData;

      if (data.audioType === 'device' && !this.audioRuntimes.has(node.id)) {
        this.createAudioDeviceRuntime(node);
      }
    }

    // Clean up removed nodes
    const currentNodeIds = new Set(audioNodes.map((n) => n.id));
    for (const [nodeId] of this.audioRuntimes) {
      if (!currentNodeIds.has(nodeId)) {
        this.destroyAudioRuntime(nodeId);
      }
    }
  }

  private async createAudioDeviceRuntime(node: VisoicNode): Promise<void> {
    const data = node.data as AudioNodeData;
    const deviceId = data.deviceId || 'default';
    const sourceType = data.sourceType || 'microphone';
    const desktopSourceId = data.desktopSourceId;

    // For desktop/application sources, require desktopSourceId
    if ((sourceType === 'desktop' || sourceType === 'application') && !desktopSourceId) {
      console.log(`[NodeRuntime] Skipping audio runtime creation for node ${node.id} - no desktop source selected`);
      return;
    }

    // Prevent duplicate creation
    if (this.audioRuntimes.has(node.id)) return;

    // Mark as initializing
    this.audioRuntimes.set(node.id, {
      nodeId: node.id,
      initializing: true
    });

    // Ensure fftSize is a valid FFTSize type
    const fftSizeValue = data.analyzerConfig?.fftSize;
    const validFftSizes: FFTSize[] = [32, 64, 128, 256, 512, 1024, 2048, 4096, 8192, 16384, 32768];
    const fftSize: FFTSize = validFftSizes.includes(fftSizeValue as FFTSize)
      ? (fftSizeValue as FFTSize)
      : 2048;

    try {
      // Create analyzer for this device/source
      const handle = await audioManager.createAnalyzer({
        deviceId,
        sourceType,
        desktopSourceId,
        fftSize,
        smoothingTimeConstant: data.analyzerConfig?.smoothing ?? 0.8,
        gain: data.analyzerConfig?.gain ?? 1.0,
        label: `Node: ${node.id}`,
      });

      // Check if node was removed or re-initialized while we were waiting
      const currentRuntime = this.audioRuntimes.get(node.id);
      if (!currentRuntime || !currentRuntime.initializing) {
        // Obsolete request
        handle.destroy();
        return;
      }

      this.audioRuntimes.set(node.id, {
        nodeId: node.id,
        analyzerId: handle.id,
        analyzerHandle: handle,
        initializing: false,
      });

      // Update node output to reference this analyzer
      nodeGraph.updateNodeData(node.id, {
        outputValues: {
          audio: handle.id, // Pass analyzer ID as audio reference
        },
      });

      console.log(`[NodeRuntime] Created audio runtime for node ${node.id} with sourceType=${sourceType}`);
    } catch (error) {
      console.error(`[NodeRuntime] Failed to create audio runtime for node ${node.id}:`, error);
      this.audioRuntimes.delete(node.id); // Clear pending entry
    }
  }

  private destroyAudioRuntime(nodeId: string): void {
    const runtime = this.audioRuntimes.get(nodeId);
    if (runtime?.analyzerHandle) {
      runtime.analyzerHandle.destroy();
    }
    this.audioRuntimes.delete(nodeId);
  }

  private updateAudioNodeOutputs(): void {
    const nodes = nodeGraph.getNodes();
    const edges = nodeGraph.getEdges();

    for (const node of nodes) {
      if (node.data.category !== 'audio') continue;

      const data = node.data as AudioNodeData;
      const outputs: Record<string, unknown> = {};

      // Get actual input values from edges (not just stored inputValues)
      const inputValues: Record<string, unknown> = { ...node.data.inputValues };

      // Override with connected edge values
      for (const edge of edges) {
        if (edge.target === node.id && edge.targetHandle) {
          const sourceNode = nodeGraph.getNode(edge.source);
          if (sourceNode?.data.outputValues && edge.sourceHandle) {
            inputValues[edge.targetHandle] = sourceNode.data.outputValues[edge.sourceHandle];
          }
        }
      }

      // Get analyzer from connected audio input, fft input, or own runtime
      let analyzer: FFTAnalyzer | undefined;
      let inputGain = 1.0; // Gain from upstream normalizer
      const audioInput = inputValues.audio;
      const fftInput = inputValues.fft;

      // Try audio input first - can be string (analyzer ID) or object with gain
      if (audioInput) {
        if (typeof audioInput === 'string') {
          // It's an analyzer ID
          analyzer = audioManager.getAnalyzer(audioInput);
        } else if (typeof audioInput === 'object' && audioInput !== null) {
          // It's an object with analyzerId and gain
          const audioObj = audioInput as { analyzerId?: string; gain?: number };
          if (audioObj.analyzerId) {
            analyzer = audioManager.getAnalyzer(audioObj.analyzerId);
            inputGain = audioObj.gain ?? 1.0;
          }
        }
      }

      // Try fft input if no audio input (for FFT Band nodes)
      if (!analyzer && fftInput) {
        if (typeof fftInput === 'string') {
          analyzer = audioManager.getAnalyzer(fftInput);
        } else if (typeof fftInput === 'object' && fftInput !== null) {
          const fftObj = fftInput as { analyzerId?: string; gain?: number };
          if (fftObj.analyzerId) {
            analyzer = audioManager.getAnalyzer(fftObj.analyzerId);
            inputGain = fftObj.gain ?? 1.0;
          }
        }
      }

      // If this is a device node, use its own runtime
      if (data.audioType === 'device') {
        const runtime = this.audioRuntimes.get(node.id);
        if (runtime?.analyzerHandle) {
          analyzer = runtime.analyzerHandle.analyzer;
          outputs.audio = runtime.analyzerId;

          // Sync analyzer config from node's analyzerConfig or inputValues
          const nodeConfig = data.analyzerConfig;
          const currentConfig = analyzer.getConfig();

          const desiredFftSize = Number(inputValues.fftSize ?? nodeConfig?.fftSize ?? 2048);
          const desiredSmoothing = Number(inputValues.smoothing ?? nodeConfig?.smoothing ?? 0.8);
          const desiredGain = Number(inputValues.gain ?? nodeConfig?.gain ?? 1.0);
          const desiredMinDecibels = Number(inputValues.minDecibels ?? nodeConfig?.minDecibels ?? -100);
          const desiredMaxDecibels = Number(inputValues.maxDecibels ?? nodeConfig?.maxDecibels ?? -30);
          const desiredWindowFunction = (inputValues.windowFunction ?? nodeConfig?.windowFunction ?? 'blackman') as any;

          // Update if any config changed
          if (
            currentConfig.fftSize !== desiredFftSize ||
            currentConfig.smoothingTimeConstant !== desiredSmoothing ||
            currentConfig.gain !== desiredGain ||
            currentConfig.minDecibels !== desiredMinDecibels ||
            currentConfig.maxDecibels !== desiredMaxDecibels ||
            currentConfig.windowFunction !== desiredWindowFunction
          ) {
            runtime.analyzerHandle.updateConfig({
              fftSize: desiredFftSize as any,
              smoothingTimeConstant: desiredSmoothing,
              gain: desiredGain,
              minDecibels: desiredMinDecibels,
              maxDecibels: desiredMaxDecibels,
              windowFunction: desiredWindowFunction,
            });
          }
        }
      }

      if (!analyzer) {
        // No analyzer available, skip update
        continue;
      }

      // Get data based on audio node type
      switch (data.audioType) {
        case 'analyzer': {
          // Apply analyzer node's config to the connected analyzer
          const nodeConfig = data.analyzerConfig;
          const currentConfig = analyzer.getConfig();

          const desiredFftSize = Number(inputValues.fftSize ?? nodeConfig?.fftSize ?? currentConfig.fftSize);
          const desiredSmoothing = Number(inputValues.smoothing ?? nodeConfig?.smoothing ?? currentConfig.smoothingTimeConstant);
          const desiredGain = Number(inputValues.gain ?? nodeConfig?.gain ?? currentConfig.gain);
          const desiredMinDecibels = Number(inputValues.minDecibels ?? nodeConfig?.minDecibels ?? currentConfig.minDecibels);
          const desiredMaxDecibels = Number(inputValues.maxDecibels ?? nodeConfig?.maxDecibels ?? currentConfig.maxDecibels);
          const desiredWindowFunction = (inputValues.windowFunction ?? nodeConfig?.windowFunction ?? currentConfig.windowFunction) as any;

          // Update if any config changed
          if (
            currentConfig.fftSize !== desiredFftSize ||
            currentConfig.smoothingTimeConstant !== desiredSmoothing ||
            currentConfig.gain !== desiredGain ||
            currentConfig.minDecibels !== desiredMinDecibels ||
            currentConfig.maxDecibels !== desiredMaxDecibels ||
            currentConfig.windowFunction !== desiredWindowFunction
          ) {
            analyzer.updateConfig({
              fftSize: desiredFftSize as any,
              smoothingTimeConstant: desiredSmoothing,
              gain: desiredGain,
              minDecibels: desiredMinDecibels,
              maxDecibels: desiredMaxDecibels,
              windowFunction: desiredWindowFunction,
            });
          }

          const analyzerData = analyzer.getData();
          outputs.fft = analyzer.id;
          outputs.waveform = Array.from(analyzerData.timeDomainData);
          outputs.volume = analyzerData.averageAmplitude;
          break;
        }

        case 'normalizer': {
          // Audio normalizer - pass through audio with gain adjustment
          const targetLevel = Number(inputValues.targetLevel ?? data.normalizerConfig?.targetLevel ?? 0.5);
          const attackTime = Number(inputValues.attackTime ?? data.normalizerConfig?.attackTime ?? 0.1);
          const releaseTime = Number(inputValues.releaseTime ?? data.normalizerConfig?.releaseTime ?? 0.05);
          const minGain = Number(inputValues.minGain ?? data.normalizerConfig?.minGain ?? 0.1);
          const maxGain = Number(inputValues.maxGain ?? data.normalizerConfig?.maxGain ?? 3.0);

          const analyzerData = analyzer.getData();
          const currentLevel = analyzerData.averageAmplitude * inputGain; // Apply upstream gain

          // Calculate gain to reach target level
          let targetGain = currentLevel > 0.001 ? targetLevel / currentLevel : 1;
          targetGain = Math.max(minGain, Math.min(maxGain, targetGain)); // Clamp gain with config values

          // Smooth gain changes using exponential smoothing
          // Convert attack/release time to per-frame smoothing factor (assuming ~60fps)
          const prevGain = Number(node.data.outputValues?.gain ?? 1);
          const isIncreasing = targetGain > prevGain;
          const timeConstant = isIncreasing ? attackTime : releaseTime;
          // Smoothing factor: smaller timeConstant = faster response
          // Factor = 1 - e^(-deltaTime/timeConstant), approximated for 60fps
          const smoothingFactor = Math.min(1, (1 / 60) / Math.max(0.001, timeConstant));
          const newGain = prevGain + (targetGain - prevGain) * smoothingFactor;

          // Clamp final gain
          const clampedGain = Math.max(minGain, Math.min(maxGain, newGain));

          // Total gain = upstream gain * this normalizer's gain
          const totalGain = inputGain * clampedGain;

          // Calculate normalized output value
          const normalizedValue = Math.min(1, analyzerData.averageAmplitude * totalGain);

          // Pass audio with gain info for downstream nodes
          outputs.audio = { analyzerId: analyzer.id, gain: totalGain };
          outputs.gain = clampedGain;
          outputs.value = normalizedValue; // Normalized audio level output
          break;
        }

        case 'frequency-range': {
          const lowFreq = Number(inputValues.lowFreq ?? 60);
          const highFreq = Number(inputValues.highFreq ?? 250);
          const mode = (data.calculationMode || 'average') as 'average' | 'peak' | 'rms' | 'sum' | 'weighted';

          // Apply upstream gain to frequency range values
          const rawValue = analyzer.getFrequencyRangeAdvanced(lowFreq, highFreq, mode);
          const rawPeak = analyzer.getFrequencyRangeAdvanced(lowFreq, highFreq, 'peak');
          outputs.value = Math.min(1, rawValue * inputGain);
          outputs.peak = Math.min(1, rawPeak * inputGain);
          // Pass through audio with gain for chaining
          outputs.audio = inputGain !== 1.0 ? { analyzerId: analyzer.id, gain: inputGain } : analyzer.id;
          break;
        }

        case 'amplitude': {
          const analyzerData = analyzer.getData();
          // Apply upstream gain
          outputs.value = Math.min(1, analyzerData.averageAmplitude * inputGain);
          break;
        }

        case 'rms': {
          const analyzerData = analyzer.getData();
          // Apply upstream gain
          outputs.value = Math.min(1, analyzerData.rmsLevel * inputGain);
          break;
        }

        case 'peak': {
          const analyzerData = analyzer.getData();
          outputs.value = analyzerData.peakFrequencyBin;
          outputs.frequency = analyzerData.peakFrequency;
          break;
        }

        case 'bpm': {
          const bpmData = analyzer.getBPM();
          outputs.bpm = bpmData.bpm;
          outputs.confidence = bpmData.confidence;
          break;
        }

        case 'beat': {
          const threshold = Number(inputValues.threshold ?? 0.5);
          // Adjust threshold based on input gain for consistent beat detection
          const adjustedThreshold = inputGain > 0 ? threshold / inputGain : threshold;
          const beatData = analyzer.detectBeat(adjustedThreshold);
          outputs.detected = beatData.detected;
          outputs.intensity = Math.min(1, beatData.intensity * inputGain);
          outputs.trigger = beatData.detected ? 1 : 0;
          break;
        }

        // Preset frequency bands OR custom range from FFT Band node
        case 'band': {
          // Check if using custom low/high freq (FFT Band node)
          const lowFreq = inputValues.lowFreq;
          const highFreq = inputValues.highFreq;

          if (lowFreq !== undefined && highFreq !== undefined) {
            // Custom frequency range (FFT Band node)
            const low = Number(lowFreq);
            const high = Number(highFreq);
            // Apply upstream gain
            outputs.value = Math.min(1, analyzer.getFrequencyRangeAdvanced(low, high, 'average') * inputGain);
            outputs.peak = Math.min(1, analyzer.getFrequencyRangeAdvanced(low, high, 'peak') * inputGain);
          } else {
            // Preset frequency band
            const band = data.frequencyBand;
            const bandRanges: Record<string, [number, number]> = {
              subBass: [20, 60],
              bass: [60, 250],
              lowMid: [250, 500],
              mid: [500, 2000],
              upperMid: [2000, 4000],
              presence: [4000, 6000],
              brilliance: [6000, 20000],
            };

            if (band && bandRanges[band]) {
              const [low, high] = bandRanges[band];
              // Apply upstream gain
              outputs.value = Math.min(1, analyzer.getFrequencyRangeAdvanced(low, high, 'average') * inputGain);
              outputs.peak = Math.min(1, analyzer.getFrequencyRangeAdvanced(low, high, 'peak') * inputGain);
            }
          }
          break;
        }

        // Percussion detection nodes
        case 'kick':
        case 'snare':
        case 'hihat':
        case 'clap': {
          const percType = data.audioType;
          const detectorId = `${node.id}_${percType}`;

          // Get parameters from inputs or config
          const threshold = Number(inputValues.threshold ?? data.percussionConfig?.threshold ?? 1.5);
          const cooldown = Number(inputValues.cooldown ?? data.percussionConfig?.cooldown ?? 100);
          const holdTime = Number(inputValues.holdTime ?? data.percussionConfig?.holdTime ?? 100);
          const lowFreq = Number(inputValues.lowFreq ?? data.percussionConfig?.lowFreq ?? 40);
          const highFreq = Number(inputValues.highFreq ?? data.percussionConfig?.highFreq ?? 100);
          const sensitivity = Number(
            inputValues.sensitivity ??
            (inputValues as Record<string, unknown>).transientSensitivity ??
            data.percussionConfig?.transientSensitivity ??
            0.7
          );

          // Create or update detector
          if (!analyzer.getPercussionDetectorConfig(detectorId)) {
            analyzer.createPercussionDetector(detectorId, {
              type: percType as 'kick' | 'snare' | 'hihat' | 'clap',
              threshold,
              cooldown,
              holdTime,
              lowFreq,
              highFreq,
              transientSensitivity: sensitivity,
              // Snare-specific secondary range
              ...(percType === 'snare' && {
                secondaryLowFreq: Number(inputValues.snapLow ?? data.percussionConfig?.secondaryLowFreq ?? 3000),
                secondaryHighFreq: Number(inputValues.snapHigh ?? data.percussionConfig?.secondaryHighFreq ?? 8000),
                secondaryWeight: Number(inputValues.snapWeight ?? data.percussionConfig?.secondaryWeight ?? 0.4),
              }),
            });
          } else {
            analyzer.updatePercussionDetector(detectorId, {
              threshold,
              cooldown,
              holdTime,
              lowFreq,
              highFreq,
              transientSensitivity: sensitivity,
              ...(percType === 'snare' && {
                secondaryLowFreq: Number(inputValues.snapLow ?? 3000),
                secondaryHighFreq: Number(inputValues.snapHigh ?? 8000),
                secondaryWeight: Number(inputValues.snapWeight ?? 0.4),
              }),
            });
          }

          const result = analyzer.detectPercussion(detectorId);
          outputs.detected = result.detected;
          outputs.intensity = result.intensity * inputGain;
          outputs.trigger = result.detected ? 1 : 0;
          outputs.energy = result.energy * inputGain;
          break;
        }
      }

      // Apply smoothing if configured
      const smoothing = data.smoothing ?? 0;
      if (smoothing > 0 && typeof outputs.value === 'number') {
        const prevValue = Number(node.data.outputValues?.value ?? outputs.value);
        outputs.value = prevValue + (outputs.value - prevValue) * (1 - smoothing);
      }

      // Update node outputs silently (no re-render trigger)
      nodeGraph.updateNodeDataSilent(node.id, { outputValues: outputs });
    }
  }

  // ============================================
  // Getters
  // ============================================

  get running(): boolean {
    return this.isRunning;
  }

  get currentFrame(): number {
    return this.frameCount;
  }

  get currentTime(): number {
    return this.lastFrameTime - this.startTime;
  }

  // ============================================
  // Device Management
  // ============================================

  async getAudioDevices(): Promise<{ deviceId: string; label: string }[]> {
    const devices = await audioManager.refreshDevices();
    return devices.map((d) => ({ deviceId: d.deviceId, label: d.label }));
  }

  setNodeDevice(nodeId: string, deviceId: string): void {
    const node = nodeGraph.getNode(nodeId);
    if (!node || node.data.category !== 'audio') return;

    // Update node data
    nodeGraph.updateNodeData(nodeId, { deviceId });

    // Recreate runtime with new device
    this.destroyAudioRuntime(nodeId);
    this.createAudioDeviceRuntime(node);
  }

  /**
   * Recreate audio runtime for a node (e.g., when source type changes)
   */
  recreateAudioRuntime(nodeId: string): void {
    const node = nodeGraph.getNode(nodeId);
    if (!node || node.data.category !== 'audio') return;

    const data = node.data as AudioNodeData;
    console.log(`[NodeRuntime] Recreating audio runtime for ${nodeId}:`, {
      sourceType: data.sourceType,
      desktopSourceId: data.desktopSourceId,
      desktopSourceName: data.desktopSourceName,
    });

    // Destroy and recreate runtime
    this.destroyAudioRuntime(nodeId);
    this.createAudioDeviceRuntime(node);
  }

  // ============================================
  // Audio Controls
  // ============================================

  /**
   * Get the analyzer handle for an audio node (if it exists)
   */
  getAudioHandle(nodeId: string): AnalyzerHandle | undefined {
    return this.audioRuntimes.get(nodeId)?.analyzerHandle;
  }

  /**
   * Toggle listen mode (output to speakers) for an audio node
   */
  setAudioListening(nodeId: string, listen: boolean): void {
    const handle = this.audioRuntimes.get(nodeId)?.analyzerHandle;
    if (handle?.setListening) {
      handle.setListening(listen);
    }
  }

  /**
   * Check if audio node is in listen mode
   */
  isAudioListening(nodeId: string): boolean {
    const handle = this.audioRuntimes.get(nodeId)?.analyzerHandle;
    return handle?.isListening?.() ?? false;
  }
}

export const nodeRuntime = new NodeRuntimeManager();
export { NodeRuntimeManager };
