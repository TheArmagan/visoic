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
  const outputValues = useNodeProperty<AudioNodeData, "outputValues">(props.id, "outputValues");

  const { updateNodeData } = useSvelteFlow();

  // Helper to update both nodeGraph (for runtime) and SvelteFlow (for UI)
  function updateData(updates: Partial<AudioNodeData>) {
    // Update nodeGraph directly (no listener notification to avoid loop)
    const node = nodeGraph.getNode(props.id);
    if (node) {
      // Deep merge for nested objects like inputValues
      for (const [key, value] of Object.entries(updates)) {
        if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
          (node.data as Record<string, unknown>)[key] = {
            ...((node.data as Record<string, unknown>)[key] as Record<string, unknown> ?? {}),
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

  function updateAnalyzerConfig(key: string, value: number) {
    updateData({
      analyzerConfig: {
        ...data.analyzerConfig,
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
          style="width: {((outputValues.value?.volume as number) ?? 0) *
            100}%"
        ></div>
      </div>
    </div>
  {:else if data.audioType === "analyzer"}
    <div class="space-y-3">
      <div>
        <Label class="text-[10px] text-neutral-400">FFT Size</Label>
        <Select.Root
          type="single"
          value={String(data.analyzerConfig?.fftSize ?? 2048)}
          onValueChange={(v) => updateAnalyzerConfig("fftSize", parseInt(v))}
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
            if (node && node.data.analyzerConfig) {
              node.data.analyzerConfig.smoothing = val;
            }
          }}
          onchange={(e) => updateAnalyzerConfig("smoothing", parseFloat((e.target as HTMLInputElement).value))}
        />
      </div>
      <!-- Volume meter visualization -->
      <div class="h-2 bg-neutral-800 rounded overflow-hidden">
        <div
          class="h-full bg-linear-to-r from-green-500 via-yellow-500 to-red-500 transition-all"
          style="width: {((outputValues.value?.volume as number) ?? 0) *
            100}%"
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
          oninput={(e) => {
            const val = parseFloat((e.target as HTMLInputElement).value);
            const node = nodeGraph.getNode(props.id);
            if (node && node.data.normalizerConfig) {
              node.data.normalizerConfig.targetLevel = val;
            }
          }}
          onchange={(e) => updateNormalizerConfig("targetLevel", parseFloat((e.target as HTMLInputElement).value))}
        />
      </div>
      <div>
        <Label class="text-[10px] text-neutral-400">
          Attack: {(data.normalizerConfig?.attackTime ?? 0.1).toFixed(2)}
        </Label>
        <RangeSlider
          value={data.normalizerConfig?.attackTime ?? 0.1}
          min={0.01}
          max={1}
          step={0.01}
          oninput={(e) => {
            const val = parseFloat((e.target as HTMLInputElement).value);
            const node = nodeGraph.getNode(props.id);
            if (node && node.data.normalizerConfig) {
              node.data.normalizerConfig.attackTime = val;
            }
          }}
          onchange={(e) => updateNormalizerConfig("attackTime", parseFloat((e.target as HTMLInputElement).value))}
        />
      </div>
      <div>
        <Label class="text-[10px] text-neutral-400">
          Release: {(data.normalizerConfig?.releaseTime ?? 0.05).toFixed(
            2,
          )}
        </Label>
        <RangeSlider
          value={data.normalizerConfig?.releaseTime ?? 0.05}
          min={0.01}
          max={1}
          step={0.01}
          oninput={(e) => {
            const val = parseFloat((e.target as HTMLInputElement).value);
            const node = nodeGraph.getNode(props.id);
            if (node && node.data.normalizerConfig) {
              node.data.normalizerConfig.releaseTime = val;
            }
          }}
          onchange={(e) => updateNormalizerConfig("releaseTime", parseFloat((e.target as HTMLInputElement).value))}
        />
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
          style="width: {((outputValues.value?.value as number) ?? 0) *
            100}%"
        ></div>
      </div>
      <span class="text-[10px] text-neutral-500 font-mono">
        Value: {((outputValues.value?.value as number) ?? 0).toFixed(3)}
      </span>
    </div>
  {:else if data.audioType === "frequency-range"}
    <div class="space-y-2">
      <div class="grid grid-cols-2 gap-2">
        <div>
          <Label class="text-[10px] text-neutral-400">Low Hz</Label>
          <Input
            type="number"
            value={data.inputValues?.lowFreq ?? 60}
            oninput={(e) =>
              updateData({
                inputValues: {
                  ...data.inputValues,
                  lowFreq:
                    parseFloat((e.target as HTMLInputElement).value) || 60,
                },
              })}
            class="h-6 text-xs bg-neutral-800 border-neutral-700 nodrag"
          />
        </div>
        <div>
          <Label class="text-[10px] text-neutral-400">High Hz</Label>
          <Input
            type="number"
            value={data.inputValues?.highFreq ?? 250}
            oninput={(e) =>
              updateData({
                inputValues: {
                  ...data.inputValues,
                  highFreq:
                    parseFloat((e.target as HTMLInputElement).value) || 250,
                },
              })}
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
            updateData({ calculationMode: v })}
        >
          <Select.Trigger
            class="h-7 text-xs bg-neutral-800 border-neutral-700 nodrag"
          >
            {calculationModes.find(
              (m) => m.value === data.calculationMode,
            )?.label ?? "Average"}
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
          onchange={(e) => updateData({ smoothing: parseFloat((e.target as HTMLInputElement).value) })}
        />
      </div>
      <!-- Level visualization -->
      <div class="h-4 bg-neutral-800 rounded overflow-hidden">
        <div
          class="h-full bg-orange-500 transition-all"
          style="width: {((outputValues.value?.value as number) ?? 0) *
            100}%"
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
          onchange={(e) => updateData({ smoothing: parseFloat((e.target as HTMLInputElement).value) })}
        />
      </div>
      <!-- Level visualization -->
      <div class="h-4 bg-neutral-800 rounded overflow-hidden">
        <div
          class="h-full bg-green-500 transition-all"
          style="width: {((outputValues.value?.value as number) ?? 0) *
            100}%"
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
          Threshold: {Number(data.inputValues?.threshold ?? 0.5).toFixed(
            2,
          )}
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
              inputValues: { ...data.inputValues, threshold: parseFloat((e.target as HTMLInputElement).value) },
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
        Intensity: {(
          (outputValues.value?.intensity as number) ?? 0
        ).toFixed(3)}
      </span>
    </div>
  {:else}
    <!-- Default preset bands (bass, mid, treble, etc.) -->
    <div class="space-y-2">
      {#if data.frequencyBand}
        <Label class="text-[10px] text-neutral-400">
          {frequencyBands.find((b) => b.value === data.frequencyBand)
            ?.label}
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
          onchange={(e) => updateData({ smoothing: parseFloat((e.target as HTMLInputElement).value) })}
        />
      </div>
      <!-- Level visualization -->
      <div class="h-4 bg-neutral-800 rounded overflow-hidden">
        <div
          class="h-full bg-cyan-500 transition-all"
          style="width: {((outputValues.value?.value as number) ?? 0) *
            100}%"
        ></div>
      </div>
      <span class="text-[10px] text-neutral-500 font-mono">
        Value: {((outputValues.value?.value as number) ?? 0).toFixed(3)}
      </span>
    </div>
  {/if}
</BaseNode>



