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

    // Ensure fftSize is a valid FFTSize type
    const fftSizeValue = data.analyzerConfig?.fftSize;
    const validFftSizes: FFTSize[] = [32, 64, 128, 256, 512, 1024, 2048, 4096, 8192, 16384, 32768];
    const fftSize: FFTSize = validFftSizes.includes(fftSizeValue as FFTSize)
      ? (fftSizeValue as FFTSize)
      : 2048;

    try {
      // Create analyzer for this device
      const handle = await audioManager.createAnalyzer({
        deviceId,
        fftSize,
        smoothingTimeConstant: data.analyzerConfig?.smoothing ?? 0.8,
        gain: data.analyzerConfig?.gain ?? 1.0,
        label: `Node: ${node.id}`,
      });

      this.audioRuntimes.set(node.id, {
        nodeId: node.id,
        analyzerId: handle.id,
        analyzerHandle: handle,
      });

      // Update node output to reference this analyzer
      nodeGraph.updateNodeData(node.id, {
        outputValues: {
          audio: handle.id, // Pass analyzer ID as audio reference
        },
      });
    } catch (error) {
      console.error(`Failed to create audio runtime for node ${node.id}:`, error);
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

    for (const node of nodes) {
      if (node.data.category !== 'audio') continue;

      const data = node.data as AudioNodeData;
      const outputs: Record<string, unknown> = {};

      // Get analyzer from connected audio input or own runtime
      let analyzer: FFTAnalyzer | undefined;
      const audioInput = node.data.inputValues?.audio;

      if (typeof audioInput === 'string') {
        // It's an analyzer ID
        analyzer = audioManager.getAnalyzer(audioInput);
      }

      // If this is a device node, use its own runtime
      if (data.audioType === 'device') {
        const runtime = this.audioRuntimes.get(node.id);
        if (runtime?.analyzerHandle) {
          analyzer = runtime.analyzerHandle.analyzer;
          outputs.audio = runtime.analyzerId;
        }
      }

      if (!analyzer) {
        // No analyzer available, skip update
        continue;
      }

      // Get data based on audio node type
      switch (data.audioType) {
        case 'analyzer': {
          const analyzerData = analyzer.getData();
          outputs.fft = analyzer.id;
          outputs.waveform = Array.from(analyzerData.timeDomainData);
          outputs.volume = analyzerData.averageAmplitude;
          break;
        }

        case 'frequency-range': {
          const lowFreq = Number(node.data.inputValues?.lowFreq ?? 60);
          const highFreq = Number(node.data.inputValues?.highFreq ?? 250);
          const mode = (data.calculationMode || 'average') as 'average' | 'peak' | 'rms' | 'sum' | 'weighted';

          outputs.value = analyzer.getFrequencyRangeAdvanced(lowFreq, highFreq, mode);
          outputs.peak = analyzer.getFrequencyRangeAdvanced(lowFreq, highFreq, 'peak');
          break;
        }

        case 'amplitude': {
          const analyzerData = analyzer.getData();
          outputs.value = analyzerData.averageAmplitude;
          break;
        }

        case 'rms': {
          const analyzerData = analyzer.getData();
          outputs.value = analyzerData.rmsLevel;
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
          const threshold = Number(node.data.inputValues?.threshold ?? 0.5);
          const beatData = analyzer.detectBeat(threshold);
          outputs.detected = beatData.detected;
          outputs.intensity = beatData.intensity;
          outputs.trigger = beatData.detected ? 1 : 0;
          break;
        }

        // Preset frequency bands
        case 'band': {
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
            outputs.value = analyzer.getFrequencyRangeAdvanced(low, high, 'average');
            outputs.peak = analyzer.getFrequencyRangeAdvanced(low, high, 'peak');
          }
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
}

export const nodeRuntime = new NodeRuntimeManager();
export { NodeRuntimeManager };
