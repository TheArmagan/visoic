<script lang="ts">
  import { useSvelteFlow } from "@xyflow/svelte";
  import type { AudioNodeData } from "$lib/api/nodes/types";
  import { nodeGraph, nodeRuntime, useNodeProperty } from "$lib/api/nodes";
  import { onMount } from "svelte";
  import BaseNode from "./BaseNode.svelte";
  import * as Select from "$lib/components/ui/select";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import { RangeSlider } from "$lib/components/ui/range-slider";

  interface Props {
    id: string;
    data: AudioNodeData;
    selected?: boolean;
  }

  let props: Props = $props();

  // Use props.data for config values (user editable)
  const data = $derived(props.data);

  // Subscribe to outputValues changes from nodeGraph (runtime computed values)
  const outputValues = useNodeProperty<AudioNodeData, "outputValues">(
    props.id,
    "outputValues",
  );

  const { updateNodeData } = useSvelteFlow();

  // Helper to update both nodeGraph (for runtime) and SvelteFlow (for UI)
  function updateData(updates: Partial<AudioNodeData>) {
    // Update nodeGraph directly (no listener notification to avoid loop)
    const node = nodeGraph.getNode(props.id);
    if (node) {
      // Deep merge for nested objects like inputValues
      for (const [key, value] of Object.entries(updates)) {
        if (
          value !== null &&
          typeof value === "object" &&
          !Array.isArray(value)
        ) {
          (node.data as Record<string, unknown>)[key] = {
            ...(((node.data as Record<string, unknown>)[key] as Record<
              string,
              unknown
            >) ?? {}),
            ...value,
          };
        } else {
          (node.data as Record<string, unknown>)[key] = value;
        }
      }
    }
    // Update SvelteFlow for UI
    updateNodeData(props.id, updates);
  }

  // Fetch device list from audio API
  let devices = $state<{ value: string; label: string }[]>([
    { value: "default", label: "Default Device" },
  ]);

  onMount(() => {
    nodeRuntime.getAudioDevices().then((deviceList) => {
      devices = deviceList.map((d) => ({
        value: d.deviceId,
        label: d.label || d.deviceId,
      }));
      if (devices.length === 0) {
        devices = [{ value: "default", label: "Default Device" }];
      }
    });
  });

  const fftSizes = [
    { value: "256", label: "256" },
    { value: "512", label: "512" },
    { value: "1024", label: "1024" },
    { value: "2048", label: "2048" },
    { value: "4096", label: "4096" },
    { value: "8192", label: "8192" },
  ];

  const windowFunctions = [
    { value: "blackman", label: "Blackman" },
    { value: "hann", label: "Hann" },
    { value: "hamming", label: "Hamming" },
    { value: "bartlett", label: "Bartlett" },
    { value: "rectangular", label: "Rectangular" },
  ];

  const calculationModes = [
    { value: "average", label: "Average" },
    { value: "peak", label: "Peak" },
    { value: "rms", label: "RMS" },
    { value: "sum", label: "Sum" },
    { value: "weighted", label: "Weighted" },
  ];

  const frequencyBands = [
    { value: "subBass", label: "Sub Bass (20-60Hz)" },
    { value: "bass", label: "Bass (60-250Hz)" },
    { value: "lowMid", label: "Low Mid (250-500Hz)" },
    { value: "mid", label: "Mid (500-2kHz)" },
    { value: "upperMid", label: "Upper Mid (2-4kHz)" },
    { value: "presence", label: "Presence (4-6kHz)" },
    { value: "brilliance", label: "Brilliance (6-20kHz)" },
  ];

  const frequencyPresets = [
    { value: "custom", label: "Custom", low: 60, high: 250 },
    { value: "subBass", label: "Sub Bass", low: 20, high: 60 },
    { value: "bass", label: "Bass", low: 60, high: 250 },
    { value: "lowMid", label: "Low Mid", low: 250, high: 500 },
    { value: "mid", label: "Mid", low: 500, high: 2000 },
    { value: "upperMid", label: "Upper Mid", low: 2000, high: 4000 },
    { value: "presence", label: "Presence", low: 4000, high: 6000 },
    { value: "brilliance", label: "Brilliance", low: 6000, high: 20000 },
    { value: "kick", label: "Kick", low: 40, high: 100 },
    { value: "snare", label: "Snare Body", low: 150, high: 350 },
    { value: "hihat", label: "Hi-Hat", low: 6000, high: 16000 },
    { value: "clap", label: "Clap", low: 1000, high: 5000 },
    { value: "vocals", label: "Vocals", low: 80, high: 1100 },
  ];

  function applyFrequencyPreset(preset: string) {
    const found = frequencyPresets.find((p) => p.value === preset);
    if (found && found.value !== "custom") {
      updateData({
        frequencyPreset: preset as AudioNodeData["frequencyPreset"],
        inputValues: {
          ...data.inputValues,
          lowFreq: found.low,
          highFreq: found.high,
        },
      });
    } else {
      updateData({ frequencyPreset: "custom" as const });
    }
  }

  function updatePercussionConfig(key: string, value: number) {
    updateData({
      percussionConfig: {
        ...data.percussionConfig,
        [key]: value,
      },
      inputValues: {
        ...data.inputValues,
        [key]: value,
      },
    });
  }

  function updateTransientSensitivity(value: number) {
    updateData({
      percussionConfig: {
        ...data.percussionConfig,
        transientSensitivity: value,
      },
      inputValues: {
        ...data.inputValues,
        sensitivity: value,
      },
    });
  }

  function updateAnalyzerConfig(key: string, value: number | string) {
    updateData({
      analyzerConfig: {
        ...data.analyzerConfig,
        [key]: value,
      },
      inputValues: {
        ...data.inputValues,
        [key]: value,
      },
    });
  }

  function updateNormalizerConfig(key: string, value: number) {
    updateData({
      normalizerConfig: {
        ...data.normalizerConfig,
        [key]: value,
      },
      inputValues: {
        ...data.inputValues,
        [key]: value,
      },
    });
  }
</script>

<BaseNode {...props}>
  {#if data.audioType === "device"}
    <div class="space-y-2">
      <Label class="text-[10px] text-neutral-400">Device</Label>
      <Select.Root
        type="single"
        value={data.deviceId ?? "default"}
        onValueChange={(v) => {
          updateData({ deviceId: v });
          nodeRuntime.setNodeDevice(props.id, v);
        }}
      >
        <Select.Trigger
          class="h-7 text-xs bg-neutral-800 border-neutral-700 nodrag"
        >
          {devices.find((d) => d.value === data.deviceId)?.label ??
            "Select Device"}
        </Select.Trigger>
        <Select.Content>
          {#each devices as device}
            <Select.Item value={device.value}>{device.label}</Select.Item>
          {/each}
        </Select.Content>
      </Select.Root>
      <!-- Volume meter -->
      <div class="h-2 bg-neutral-800 rounded overflow-hidden">
        <div
          class="h-full bg-linear-to-r from-green-500 via-yellow-500 to-red-500 transition-all"
          style="width: {((outputValues.value?.volume as number) ?? 0) * 100}%"
        ></div>
      </div>
    </div>
  {:else if data.audioType === "analyzer"}
    <div class="space-y-3">
      <div class="grid grid-cols-2 gap-2">
        <div>
          <Label class="text-[10px] text-neutral-400">FFT Size</Label>
          <Select.Root
            type="single"
            value={String(data.analyzerConfig?.fftSize ?? 2048)}
            onValueChange={(v) => {
              const val = parseInt(v);
              const node = nodeGraph.getNode(props.id);
              if (node) {
                if (node.data.analyzerConfig as any)
                  (node.data.analyzerConfig as any).fftSize = val;
                if (node.data.inputValues) node.data.inputValues.fftSize = val;
              }
              updateAnalyzerConfig("fftSize", val);
            }}
          >
            <Select.Trigger
              class="h-7 text-xs bg-neutral-800 border-neutral-700 nodrag"
            >
              {data.analyzerConfig?.fftSize ?? 2048}
            </Select.Trigger>
            <Select.Content>
              {#each fftSizes as size}
                <Select.Item value={size.value}>{size.label}</Select.Item>
              {/each}
            </Select.Content>
          </Select.Root>
        </div>
        <div>
          <Label class="text-[10px] text-neutral-400">Window</Label>
          <Select.Root
            type="single"
            value={data.analyzerConfig?.windowFunction ?? "blackman"}
            onValueChange={(v) => {
              const node = nodeGraph.getNode(props.id);
              if (node) {
                if (node.data.analyzerConfig as any)
                  (node.data.analyzerConfig as any).windowFunction = v;
                if (node.data.inputValues)
                  node.data.inputValues.windowFunction = v;
              }
              updateAnalyzerConfig("windowFunction", v);
            }}
          >
            <Select.Trigger
              class="h-7 text-xs bg-neutral-800 border-neutral-700 nodrag"
            >
              {windowFunctions.find(
                (w) =>
                  w.value ===
                  (data.analyzerConfig?.windowFunction ?? "blackman"),
              )?.label ?? "Blackman"}
            </Select.Trigger>
            <Select.Content>
              {#each windowFunctions as wf}
                <Select.Item value={wf.value}>{wf.label}</Select.Item>
              {/each}
            </Select.Content>
          </Select.Root>
        </div>
      </div>
      <div>
        <Label class="text-[10px] text-neutral-400">
          Smoothing: {(data.analyzerConfig?.smoothing ?? 0.8).toFixed(2)}
        </Label>
        <RangeSlider
          value={data.analyzerConfig?.smoothing ?? 0.8}
          min={0}
          max={1}
          step={0.01}
          oninput={(e) => {
            const val = parseFloat((e.target as HTMLInputElement).value);
            const node = nodeGraph.getNode(props.id);
            if (node) {
              if (node.data.analyzerConfig as any)
                (node.data.analyzerConfig as any).smoothing = val;
              if (node.data.inputValues) node.data.inputValues.smoothing = val;
            }
          }}
          onchange={(e) =>
            updateAnalyzerConfig(
              "smoothing",
              parseFloat((e.target as HTMLInputElement).value),
            )}
        />
      </div>
      <div>
        <Label class="text-[10px] text-neutral-400">
          Gain: {(data.analyzerConfig?.gain ?? 1.0).toFixed(2)}
        </Label>
        <RangeSlider
          value={data.analyzerConfig?.gain ?? 1.0}
          min={0}
          max={3}
          step={0.01}
          oninput={(e) => {
            const val = parseFloat((e.target as HTMLInputElement).value);
            const node = nodeGraph.getNode(props.id);
            if (node) {
              if (node.data.analyzerConfig as any)
                (node.data.analyzerConfig as any).gain = val;
              if (node.data.inputValues) node.data.inputValues.gain = val;
            }
          }}
          onchange={(e) =>
            updateAnalyzerConfig(
              "gain",
              parseFloat((e.target as HTMLInputElement).value),
            )}
        />
      </div>
      <div class="grid grid-cols-2 gap-2">
        <div>
          <Label class="text-[10px] text-neutral-400">
            Min dB: {data.analyzerConfig?.minDecibels ?? -100}
          </Label>
          <RangeSlider
            value={data.analyzerConfig?.minDecibels ?? -100}
            min={-100}
            max={-30}
            step={1}
            oninput={(e) => {
              const val = parseFloat((e.target as HTMLInputElement).value);
              const node = nodeGraph.getNode(props.id);
              if (node) {
                if (node.data.analyzerConfig as any)
                  (node.data.analyzerConfig as any).minDecibels = val;
                if (node.data.inputValues)
                  node.data.inputValues.minDecibels = val;
              }
            }}
            onchange={(e) =>
              updateAnalyzerConfig(
                "minDecibels",
                parseFloat((e.target as HTMLInputElement).value),
              )}
          />
        </div>
        <div>
          <Label class="text-[10px] text-neutral-400">
            Max dB: {data.analyzerConfig?.maxDecibels ?? -30}
          </Label>
          <RangeSlider
            value={data.analyzerConfig?.maxDecibels ?? -30}
            min={-60}
            max={0}
            step={1}
            oninput={(e) => {
              const val = parseFloat((e.target as HTMLInputElement).value);
              const node = nodeGraph.getNode(props.id);
              if (node) {
                if (node.data.analyzerConfig as any)
                  (node.data.analyzerConfig as any).maxDecibels = val;
                if (node.data.inputValues)
                  node.data.inputValues.maxDecibels = val;
              }
            }}
            onchange={(e) =>
              updateAnalyzerConfig(
                "maxDecibels",
                parseFloat((e.target as HTMLInputElement).value),
              )}
          />
        </div>
      </div>
      <!-- Volume meter visualization -->
      <div class="h-2 bg-neutral-800 rounded overflow-hidden">
        <div
          class="h-full bg-linear-to-r from-green-500 via-yellow-500 to-red-500 transition-all"
          style="width: {((outputValues.value?.volume as number) ?? 0) * 100}%"
        ></div>
      </div>
    </div>
  {:else if data.audioType === "normalizer"}
    <div class="space-y-2">
      <div>
        <Label class="text-[10px] text-neutral-400">
          Target: {(data.normalizerConfig?.targetLevel ?? 0.5).toFixed(2)}
        </Label>
        <RangeSlider
          value={data.normalizerConfig?.targetLevel ?? 0.5}
          min={0}
          max={1}
          step={0.01}
          oninput={(e) =>
            updateNormalizerConfig(
              "targetLevel",
              parseFloat((e.target as HTMLInputElement).value),
            )}
          onchange={(e) =>
            updateNormalizerConfig(
              "targetLevel",
              parseFloat((e.target as HTMLInputElement).value),
            )}
        />
      </div>
      <div class="grid grid-cols-2 gap-2">
        <div>
          <Label class="text-[10px] text-neutral-400">
            Min: {(data.normalizerConfig?.minGain ?? 0.1).toFixed(2)}
          </Label>
          <RangeSlider
            value={data.normalizerConfig?.minGain ?? 0.1}
            min={0}
            max={1}
            step={0.01}
            oninput={(e) =>
              updateNormalizerConfig(
                "minGain",
                parseFloat((e.target as HTMLInputElement).value),
              )}
            onchange={(e) =>
              updateNormalizerConfig(
                "minGain",
                parseFloat((e.target as HTMLInputElement).value),
              )}
          />
        </div>
        <div>
          <Label class="text-[10px] text-neutral-400">
            Max: {(data.normalizerConfig?.maxGain ?? 3.0).toFixed(1)}
          </Label>
          <RangeSlider
            value={data.normalizerConfig?.maxGain ?? 3.0}
            min={1}
            max={10}
            step={0.1}
            oninput={(e) =>
              updateNormalizerConfig(
                "maxGain",
                parseFloat((e.target as HTMLInputElement).value),
              )}
            onchange={(e) =>
              updateNormalizerConfig(
                "maxGain",
                parseFloat((e.target as HTMLInputElement).value),
              )}
          />
        </div>
      </div>
      <div>
        <Label class="text-[10px] text-neutral-400">
          Attack: {(data.normalizerConfig?.attackTime ?? 0.1).toFixed(2)}s
        </Label>
        <RangeSlider
          value={data.normalizerConfig?.attackTime ?? 0.1}
          min={0.01}
          max={1}
          step={0.01}
          oninput={(e) =>
            updateNormalizerConfig(
              "attackTime",
              parseFloat((e.target as HTMLInputElement).value),
            )}
          onchange={(e) =>
            updateNormalizerConfig(
              "attackTime",
              parseFloat((e.target as HTMLInputElement).value),
            )}
        />
      </div>
      <div>
        <Label class="text-[10px] text-neutral-400">
          Release: {(data.normalizerConfig?.releaseTime ?? 0.05).toFixed(2)}s
        </Label>
        <RangeSlider
          value={data.normalizerConfig?.releaseTime ?? 0.05}
          min={0.01}
          max={1}
          step={0.01}
          oninput={(e) =>
            updateNormalizerConfig(
              "releaseTime",
              parseFloat((e.target as HTMLInputElement).value),
            )}
          onchange={(e) =>
            updateNormalizerConfig(
              "releaseTime",
              parseFloat((e.target as HTMLInputElement).value),
            )}
        />
      </div>
      <!-- Gain output display -->
      <div class="text-center border-t border-neutral-700 pt-2">
        <span class="text-[10px] text-neutral-500">Gain:</span>
        <span class="text-xs font-mono text-green-400 ml-1">
          {((outputValues.value?.gain as number) ?? 1).toFixed(3)}
        </span>
      </div>
    </div>
  {:else if data.audioType === "band"}
    <div class="space-y-2">
      <div class="grid grid-cols-2 gap-2">
        <div>
          <Label class="text-[10px] text-neutral-400">Low Hz</Label>
          <Input
            type="number"
            value={data.inputValues?.lowFreq ?? 20}
            oninput={(e) =>
              updateData({
                inputValues: {
                  ...data.inputValues,
                  lowFreq:
                    parseFloat((e.target as HTMLInputElement).value) || 20,
                },
              })}
            class="h-6 text-xs bg-neutral-800 border-neutral-700 nodrag"
          />
        </div>
        <div>
          <Label class="text-[10px] text-neutral-400">High Hz</Label>
          <Input
            type="number"
            value={data.inputValues?.highFreq ?? 200}
            oninput={(e) =>
              updateData({
                inputValues: {
                  ...data.inputValues,
                  highFreq:
                    parseFloat((e.target as HTMLInputElement).value) || 200,
                },
              })}
            class="h-6 text-xs bg-neutral-800 border-neutral-700 nodrag"
          />
        </div>
      </div>
      <!-- Band level visualization -->
      <div class="h-4 bg-neutral-800 rounded overflow-hidden">
        <div
          class="h-full bg-cyan-500 transition-all"
          style="width: {((outputValues.value?.value as number) ?? 0) * 100}%"
        ></div>
      </div>
      <span class="text-[10px] text-neutral-500 font-mono">
        Value: {((outputValues.value?.value as number) ?? 0).toFixed(3)}
      </span>
    </div>
  {:else if data.audioType === "frequency-range"}
    <div class="space-y-2">
      <!-- Preset Dropdown -->
      <div>
        <Label class="text-[10px] text-neutral-400">Preset</Label>
        <Select.Root
          type="single"
          value={data.frequencyPreset ?? "custom"}
          onValueChange={(v) => applyFrequencyPreset(v)}
        >
          <Select.Trigger
            class="h-7 text-xs bg-neutral-800 border-neutral-700 nodrag"
          >
            {frequencyPresets.find(
              (p) => p.value === (data.frequencyPreset ?? "custom"),
            )?.label ?? "Custom"}
          </Select.Trigger>
          <Select.Content>
            {#each frequencyPresets as preset}
              <Select.Item value={preset.value}>{preset.label}</Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
      </div>
      <div class="grid grid-cols-2 gap-2">
        <div>
          <Label class="text-[10px] text-neutral-400">Low Hz</Label>
          <Input
            type="number"
            value={data.inputValues?.lowFreq ?? 60}
            oninput={(e) => {
              updateData({
                frequencyPreset: "custom",
                inputValues: {
                  ...data.inputValues,
                  lowFreq:
                    parseFloat((e.target as HTMLInputElement).value) || 60,
                },
              });
            }}
            class="h-6 text-xs bg-neutral-800 border-neutral-700 nodrag"
          />
        </div>
        <div>
          <Label class="text-[10px] text-neutral-400">High Hz</Label>
          <Input
            type="number"
            value={data.inputValues?.highFreq ?? 250}
            oninput={(e) => {
              updateData({
                frequencyPreset: "custom",
                inputValues: {
                  ...data.inputValues,
                  highFreq:
                    parseFloat((e.target as HTMLInputElement).value) || 250,
                },
              });
            }}
            class="h-6 text-xs bg-neutral-800 border-neutral-700 nodrag"
          />
        </div>
      </div>
      <div>
        <Label class="text-[10px] text-neutral-400">Mode</Label>
        <Select.Root
          type="single"
          value={data.calculationMode ?? "average"}
          onValueChange={(v) =>
            updateData({
              calculationMode: v as AudioNodeData["calculationMode"],
            })}
        >
          <Select.Trigger
            class="h-7 text-xs bg-neutral-800 border-neutral-700 nodrag"
          >
            {calculationModes.find((m) => m.value === data.calculationMode)
              ?.label ?? "Average"}
          </Select.Trigger>
          <Select.Content>
            {#each calculationModes as mode}
              <Select.Item value={mode.value}>{mode.label}</Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
      </div>
      <div>
        <Label class="text-[10px] text-neutral-400">
          Smoothing: {(data.smoothing ?? 0.1).toFixed(2)}
        </Label>
        <RangeSlider
          value={data.smoothing ?? 0.1}
          min={0}
          max={0.99}
          step={0.01}
          oninput={(e) => {
            const val = parseFloat((e.target as HTMLInputElement).value);
            const node = nodeGraph.getNode(props.id);
            if (node) {
              node.data.smoothing = val;
            }
          }}
          onchange={(e) =>
            updateData({
              smoothing: parseFloat((e.target as HTMLInputElement).value),
            })}
        />
      </div>
      <!-- Level visualization -->
      <div class="h-4 bg-neutral-800 rounded overflow-hidden">
        <div
          class="h-full bg-orange-500 transition-all"
          style="width: {((outputValues.value?.value as number) ?? 0) * 100}%"
        ></div>
      </div>
      <span class="text-[10px] text-neutral-500 font-mono">
        Value: {((outputValues.value?.value as number) ?? 0).toFixed(3)}
      </span>
    </div>
  {:else if data.audioType === "amplitude" || data.audioType === "rms"}
    <div class="space-y-2">
      <div>
        <Label class="text-[10px] text-neutral-400">
          Smoothing: {(data.smoothing ?? 0).toFixed(2)}
        </Label>
        <RangeSlider
          value={data.smoothing ?? 0}
          min={0}
          max={0.99}
          step={0.01}
          oninput={(e) => {
            const val = parseFloat((e.target as HTMLInputElement).value);
            const node = nodeGraph.getNode(props.id);
            if (node) {
              node.data.smoothing = val;
            }
          }}
          onchange={(e) =>
            updateData({
              smoothing: parseFloat((e.target as HTMLInputElement).value),
            })}
        />
      </div>
      <!-- Level visualization -->
      <div class="h-4 bg-neutral-800 rounded overflow-hidden">
        <div
          class="h-full bg-green-500 transition-all"
          style="width: {((outputValues.value?.value as number) ?? 0) * 100}%"
        ></div>
      </div>
      <span class="text-[10px] text-neutral-500 font-mono">
        Value: {((outputValues.value?.value as number) ?? 0).toFixed(3)}
      </span>
    </div>
  {:else if data.audioType === "peak"}
    <div class="space-y-2">
      <div class="text-[10px] text-neutral-400">
        Peak Frequency: <span class="text-white font-mono">
          {((outputValues.value?.frequency as number) ?? 0).toFixed(0)} Hz
        </span>
      </div>
      <!-- Peak visualization -->
      <div class="h-4 bg-neutral-800 rounded overflow-hidden">
        <div
          class="h-full bg-purple-500 transition-all"
          style="width: {Math.min(
            ((outputValues.value?.value as number) ?? 0) * 100,
            100,
          )}%"
        ></div>
      </div>
      <span class="text-[10px] text-neutral-500 font-mono">
        Level: {((outputValues.value?.value as number) ?? 0).toFixed(3)}
      </span>
    </div>
  {:else if data.audioType === "bpm"}
    <div class="space-y-2">
      <div class="text-center">
        <span class="text-2xl font-bold text-orange-400">
          {((outputValues.value?.bpm as number) ?? 0).toFixed(0)}
        </span>
        <span class="text-xs text-neutral-500"> BPM</span>
      </div>
      <div class="text-[10px] text-neutral-400 text-center">
        Confidence: {(
          ((outputValues.value?.confidence as number) ?? 0) * 100
        ).toFixed(0)}%
      </div>
    </div>
  {:else if data.audioType === "beat"}
    <div class="space-y-2">
      <div>
        <Label class="text-[10px] text-neutral-400">
          Threshold: {Number(data.inputValues?.threshold ?? 0.5).toFixed(2)}
        </Label>
        <RangeSlider
          value={(data.inputValues?.threshold as number) ?? 0.5}
          min={0}
          max={1}
          step={0.01}
          oninput={(e) => {
            const val = parseFloat((e.target as HTMLInputElement).value);
            const node = nodeGraph.getNode(props.id);
            if (node && node.data.inputValues) {
              node.data.inputValues.threshold = val;
            }
          }}
          onchange={(e) =>
            updateData({
              inputValues: {
                ...data.inputValues,
                threshold: parseFloat((e.target as HTMLInputElement).value),
              },
            })}
        />
      </div>
      <!-- Beat indicator -->
      <div
        class="h-8 rounded flex items-center justify-center transition-all duration-75"
        class:bg-red-500={outputValues.value?.detected}
        class:bg-neutral-800={!outputValues.value?.detected}
      >
        <span class="text-xs font-bold">
          {outputValues.value?.detected ? "BEAT!" : "—"}
        </span>
      </div>
      <span class="text-[10px] text-neutral-500 font-mono">
        Intensity: {((outputValues.value?.intensity as number) ?? 0).toFixed(3)}
      </span>
    </div>
  {:else if data.audioType === "kick" || data.audioType === "snare" || data.audioType === "hihat" || data.audioType === "clap"}
    <!-- Percussion Detector Nodes -->
    <div class="space-y-2">
      <div class="grid grid-cols-2 gap-2">
        <div>
          <Label class="text-[10px] text-neutral-400">
            Threshold: {(
              (data.inputValues?.threshold as number) ??
              data.percussionConfig?.threshold ??
              1.5
            ).toFixed(2)}
          </Label>
          <RangeSlider
            value={(data.inputValues?.threshold as number) ??
              data.percussionConfig?.threshold ??
              1.5}
            min={1}
            max={3}
            step={0.05}
            oninput={(e) => {
              const val = parseFloat((e.target as HTMLInputElement).value);
              const node = nodeGraph.getNode(props.id);
              if (node && node.data.inputValues) {
                node.data.inputValues.threshold = val;
              }
            }}
            onchange={(e) =>
              updatePercussionConfig(
                "threshold",
                parseFloat((e.target as HTMLInputElement).value),
              )}
          />
        </div>
        <div>
          <Label class="text-[10px] text-neutral-400">
            Cooldown: {(data.inputValues?.cooldown as number) ??
              data.percussionConfig?.cooldown ??
              100}ms
          </Label>
          <RangeSlider
            value={(data.inputValues?.cooldown as number) ??
              data.percussionConfig?.cooldown ??
              100}
            min={20}
            max={300}
            step={5}
            oninput={(e) => {
              const val = parseFloat((e.target as HTMLInputElement).value);
              const node = nodeGraph.getNode(props.id);
              if (node && node.data.inputValues) {
                node.data.inputValues.cooldown = val;
              }
            }}
            onchange={(e) =>
              updatePercussionConfig(
                "cooldown",
                parseFloat((e.target as HTMLInputElement).value),
              )}
          />
        </div>
      </div>
      <div>
        <Label class="text-[10px] text-neutral-400">
          Hold Time: {(data.inputValues?.holdTime as number) ??
            data.percussionConfig?.holdTime ??
            100}ms
        </Label>
        <RangeSlider
          value={(data.inputValues?.holdTime as number) ??
            data.percussionConfig?.holdTime ??
            100}
          min={20}
          max={500}
          step={10}
          oninput={(e) => {
            const val = parseFloat((e.target as HTMLInputElement).value);
            const node = nodeGraph.getNode(props.id);
            if (node && node.data.inputValues) {
              node.data.inputValues.holdTime = val;
            }
          }}
          onchange={(e) =>
            updatePercussionConfig(
              "holdTime",
              parseFloat((e.target as HTMLInputElement).value),
            )}
        />
      </div>
      <div class="grid grid-cols-2 gap-2">
        <div>
          <Label class="text-[10px] text-neutral-400">Low Hz</Label>
          <Input
            type="number"
            value={(data.inputValues?.lowFreq as number) ??
              data.percussionConfig?.lowFreq ??
              40}
            oninput={(e) =>
              updatePercussionConfig(
                "lowFreq",
                parseFloat((e.target as HTMLInputElement).value) || 40,
              )}
            class="h-6 text-xs bg-neutral-800 border-neutral-700 nodrag"
          />
        </div>
        <div>
          <Label class="text-[10px] text-neutral-400">High Hz</Label>
          <Input
            type="number"
            value={(data.inputValues?.highFreq as number) ??
              data.percussionConfig?.highFreq ??
              100}
            oninput={(e) =>
              updatePercussionConfig(
                "highFreq",
                parseFloat((e.target as HTMLInputElement).value) || 100,
              )}
            class="h-6 text-xs bg-neutral-800 border-neutral-700 nodrag"
          />
        </div>
      </div>
      <div>
        <Label class="text-[10px] text-neutral-400">
          Sensitivity: {(
            (data.inputValues?.sensitivity as number) ??
            data.percussionConfig?.transientSensitivity ??
            0.7
          ).toFixed(2)}
        </Label>
        <RangeSlider
          value={(data.inputValues?.sensitivity as number) ??
            data.percussionConfig?.transientSensitivity ??
            0.7}
          min={0}
          max={1}
          step={0.05}
          oninput={(e) =>
            updateTransientSensitivity(
              parseFloat((e.target as HTMLInputElement).value),
            )}
          onchange={(e) =>
            updateTransientSensitivity(
              parseFloat((e.target as HTMLInputElement).value),
            )}
        />
      </div>
      {#if data.audioType === "snare"}
        <!-- Snare-specific snap controls -->
        <div class="grid grid-cols-3 gap-1 pt-1 border-t border-neutral-700">
          <div>
            <Label class="text-[10px] text-neutral-400">Snap Lo</Label>
            <Input
              type="number"
              value={(data.inputValues?.snapLow as number) ??
                data.percussionConfig?.secondaryLowFreq ??
                3000}
              oninput={(e) =>
                updatePercussionConfig(
                  "secondaryLowFreq",
                  parseFloat((e.target as HTMLInputElement).value) || 3000,
                )}
              class="h-6 text-xs bg-neutral-800 border-neutral-700 nodrag"
            />
          </div>
          <div>
            <Label class="text-[10px] text-neutral-400">Snap Hi</Label>
            <Input
              type="number"
              value={(data.inputValues?.snapHigh as number) ??
                data.percussionConfig?.secondaryHighFreq ??
                8000}
              oninput={(e) =>
                updatePercussionConfig(
                  "secondaryHighFreq",
                  parseFloat((e.target as HTMLInputElement).value) || 8000,
                )}
              class="h-6 text-xs bg-neutral-800 border-neutral-700 nodrag"
            />
          </div>
          <div>
            <Label class="text-[10px] text-neutral-400">Weight</Label>
            <Input
              type="number"
              value={(data.inputValues?.snapWeight as number) ??
                data.percussionConfig?.secondaryWeight ??
                0.4}
              oninput={(e) =>
                updatePercussionConfig(
                  "secondaryWeight",
                  parseFloat((e.target as HTMLInputElement).value) || 0.4,
                )}
              class="h-6 text-xs bg-neutral-800 border-neutral-700 nodrag"
              step="0.1"
              min="0"
              max="1"
            />
          </div>
        </div>
      {/if}
      <!-- Detection indicator -->
      <div
        class="h-8 rounded flex items-center justify-center transition-all duration-75"
        class:bg-purple-500={outputValues.value?.detected}
        class:bg-neutral-800={!outputValues.value?.detected}
      >
        <span class="text-xs font-bold">
          {outputValues.value?.detected
            ? data.audioType.toUpperCase() + "!"
            : "—"}
        </span>
      </div>
      <div class="flex justify-between text-[10px] text-neutral-500 font-mono">
        <span
          >Intensity: {((outputValues.value?.intensity as number) ?? 0).toFixed(
            2,
          )}</span
        >
        <span
          >Energy: {((outputValues.value?.energy as number) ?? 0).toFixed(
            3,
          )}</span
        >
      </div>
    </div>
  {:else}
    <!-- Default preset bands (bass, mid, treble, etc.) -->
    <div class="space-y-2">
      {#if data.frequencyBand}
        <Label class="text-[10px] text-neutral-400">
          {frequencyBands.find((b) => b.value === data.frequencyBand)?.label}
        </Label>
      {/if}
      <div>
        <Label class="text-[10px] text-neutral-400">
          Smoothing: {(data.smoothing ?? 0).toFixed(2)}
        </Label>
        <RangeSlider
          value={data.smoothing ?? 0}
          min={0}
          max={0.99}
          step={0.01}
          oninput={(e) => {
            const val = parseFloat((e.target as HTMLInputElement).value);
            const node = nodeGraph.getNode(props.id);
            if (node) {
              node.data.smoothing = val;
            }
          }}
          onchange={(e) =>
            updateData({
              smoothing: parseFloat((e.target as HTMLInputElement).value),
            })}
        />
      </div>
      <!-- Level visualization -->
      <div class="h-4 bg-neutral-800 rounded overflow-hidden">
        <div
          class="h-full bg-cyan-500 transition-all"
          style="width: {((outputValues.value?.value as number) ?? 0) * 100}%"
        ></div>
      </div>
      <span class="text-[10px] text-neutral-500 font-mono">
        Value: {((outputValues.value?.value as number) ?? 0).toFixed(3)}
      </span>
    </div>
  {/if}
</BaseNode>
