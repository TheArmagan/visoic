<script lang="ts">
  import { useSvelteFlow } from "@xyflow/svelte";
  import type { AudioNodeData } from "$lib/api/nodes/types";
  import { nodeRuntime } from "$lib/api/nodes";
  import { onMount } from "svelte";
  import BaseNode from "./BaseNode.svelte";
  import * as Select from "$lib/components/ui/select";
  import { Input } from "$lib/components/ui/input";
  import { Slider } from "$lib/components/ui/slider";
  import { Label } from "$lib/components/ui/label";

  interface Props {
    id: string;
    data: AudioNodeData;
    selected?: boolean;
  }

  let props: Props = $props();

  const { updateNodeData } = useSvelteFlow();

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
    updateNodeData(props.id, {
      analyzerConfig: {
        ...props.data.analyzerConfig,
        [key]: value,
      },
    });
  }

  function updateNormalizerConfig(key: string, value: number) {
    updateNodeData(props.id, {
      normalizerConfig: {
        ...props.data.normalizerConfig,
        [key]: value,
      },
    });
  }
</script>

<BaseNode {...props}>
  {#if props.data.audioType === "device"}
    <div class="space-y-2">
      <Label class="text-[10px] text-neutral-400">Device</Label>
      <Select.Root
        type="single"
        value={props.data.deviceId ?? "default"}
        onValueChange={(v) => {
          updateNodeData(props.id, { deviceId: v });
          nodeRuntime.setNodeDevice(props.id, v);
        }}
      >
        <Select.Trigger
          class="h-7 text-xs bg-neutral-800 border-neutral-700 nodrag"
        >
          {devices.find((d) => d.value === props.data.deviceId)?.label ??
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
          style="width: {((props.data.outputValues?.volume as number) ?? 0) *
            100}%"
        ></div>
      </div>
    </div>
  {:else if props.data.audioType === "analyzer"}
    <div class="space-y-3">
      <div>
        <Label class="text-[10px] text-neutral-400">FFT Size</Label>
        <Select.Root
          type="single"
          value={String(props.data.analyzerConfig?.fftSize ?? 2048)}
          onValueChange={(v) => updateAnalyzerConfig("fftSize", parseInt(v))}
        >
          <Select.Trigger
            class="h-7 text-xs bg-neutral-800 border-neutral-700 nodrag"
          >
            {props.data.analyzerConfig?.fftSize ?? 2048}
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
          Smoothing: {(props.data.analyzerConfig?.smoothing ?? 0.8).toFixed(2)}
        </Label>
        <Slider
          type="single"
          value={props.data.analyzerConfig?.smoothing ?? 0.8}
          min={0}
          max={1}
          step={0.01}
          onValueChange={(v) => updateAnalyzerConfig("smoothing", v)}
          class="nodrag"
        />
      </div>
      <!-- Volume meter visualization -->
      <div class="h-2 bg-neutral-800 rounded overflow-hidden">
        <div
          class="h-full bg-linear-to-r from-green-500 via-yellow-500 to-red-500 transition-all"
          style="width: {((props.data.outputValues?.volume as number) ?? 0) *
            100}%"
        ></div>
      </div>
    </div>
  {:else if props.data.audioType === "normalizer"}
    <div class="space-y-2">
      <div>
        <Label class="text-[10px] text-neutral-400">
          Target: {(props.data.normalizerConfig?.targetLevel ?? 0.5).toFixed(2)}
        </Label>
        <Slider
          type="single"
          value={props.data.normalizerConfig?.targetLevel ?? 0.5}
          min={0}
          max={1}
          step={0.01}
          onValueChange={(v) => updateNormalizerConfig("targetLevel", v)}
          class="nodrag"
        />
      </div>
      <div>
        <Label class="text-[10px] text-neutral-400">
          Attack: {(props.data.normalizerConfig?.attackTime ?? 0.1).toFixed(2)}
        </Label>
        <Slider
          type="single"
          value={props.data.normalizerConfig?.attackTime ?? 0.1}
          min={0.01}
          max={1}
          step={0.01}
          onValueChange={(v) => updateNormalizerConfig("attackTime", v)}
          class="nodrag"
        />
      </div>
      <div>
        <Label class="text-[10px] text-neutral-400">
          Release: {(props.data.normalizerConfig?.releaseTime ?? 0.05).toFixed(
            2,
          )}
        </Label>
        <Slider
          type="single"
          value={props.data.normalizerConfig?.releaseTime ?? 0.05}
          min={0.01}
          max={1}
          step={0.01}
          onValueChange={(v) => updateNormalizerConfig("releaseTime", v)}
          class="nodrag"
        />
      </div>
    </div>
  {:else if props.data.audioType === "band"}
    <div class="space-y-2">
      <div class="grid grid-cols-2 gap-2">
        <div>
          <Label class="text-[10px] text-neutral-400">Low Hz</Label>
          <Input
            type="number"
            value={props.data.inputValues?.lowFreq ?? 20}
            oninput={(e) =>
              updateNodeData(props.id, {
                inputValues: {
                  ...props.data.inputValues,
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
            value={props.data.inputValues?.highFreq ?? 200}
            oninput={(e) =>
              updateNodeData(props.id, {
                inputValues: {
                  ...props.data.inputValues,
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
          style="width: {((props.data.outputValues?.value as number) ?? 0) *
            100}%"
        ></div>
      </div>
      <span class="text-[10px] text-neutral-500 font-mono">
        Value: {((props.data.outputValues?.value as number) ?? 0).toFixed(3)}
      </span>
    </div>
  {:else if props.data.audioType === "frequency-range"}
    <div class="space-y-2">
      <div class="grid grid-cols-2 gap-2">
        <div>
          <Label class="text-[10px] text-neutral-400">Low Hz</Label>
          <Input
            type="number"
            value={props.data.inputValues?.lowFreq ?? 60}
            oninput={(e) =>
              updateNodeData(props.id, {
                inputValues: {
                  ...props.data.inputValues,
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
            value={props.data.inputValues?.highFreq ?? 250}
            oninput={(e) =>
              updateNodeData(props.id, {
                inputValues: {
                  ...props.data.inputValues,
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
          value={props.data.calculationMode ?? "average"}
          onValueChange={(v) =>
            updateNodeData(props.id, { calculationMode: v })}
        >
          <Select.Trigger
            class="h-7 text-xs bg-neutral-800 border-neutral-700 nodrag"
          >
            {calculationModes.find(
              (m) => m.value === props.data.calculationMode,
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
          Smoothing: {(props.data.smoothing ?? 0).toFixed(2)}
        </Label>
        <Slider
          type="single"
          value={props.data.smoothing ?? 0}
          min={0}
          max={0.99}
          step={0.01}
          onValueChange={(v) => updateNodeData(props.id, { smoothing: v })}
          class="nodrag"
        />
      </div>
      <!-- Level visualization -->
      <div class="h-4 bg-neutral-800 rounded overflow-hidden">
        <div
          class="h-full bg-orange-500 transition-all"
          style="width: {((props.data.outputValues?.value as number) ?? 0) *
            100}%"
        ></div>
      </div>
      <span class="text-[10px] text-neutral-500 font-mono">
        Value: {((props.data.outputValues?.value as number) ?? 0).toFixed(3)}
      </span>
    </div>
  {:else if props.data.audioType === "amplitude" || props.data.audioType === "rms"}
    <div class="space-y-2">
      <div>
        <Label class="text-[10px] text-neutral-400">
          Smoothing: {(props.data.smoothing ?? 0).toFixed(2)}
        </Label>
        <Slider
          type="single"
          value={props.data.smoothing ?? 0}
          min={0}
          max={0.99}
          step={0.01}
          onValueChange={(v) => updateNodeData(props.id, { smoothing: v })}
          class="nodrag"
        />
      </div>
      <!-- Level visualization -->
      <div class="h-4 bg-neutral-800 rounded overflow-hidden">
        <div
          class="h-full bg-green-500 transition-all"
          style="width: {((props.data.outputValues?.value as number) ?? 0) *
            100}%"
        ></div>
      </div>
      <span class="text-[10px] text-neutral-500 font-mono">
        Value: {((props.data.outputValues?.value as number) ?? 0).toFixed(3)}
      </span>
    </div>
  {:else if props.data.audioType === "peak"}
    <div class="space-y-2">
      <div class="text-[10px] text-neutral-400">
        Peak Frequency: <span class="text-white font-mono">
          {((props.data.outputValues?.frequency as number) ?? 0).toFixed(0)} Hz
        </span>
      </div>
      <!-- Peak visualization -->
      <div class="h-4 bg-neutral-800 rounded overflow-hidden">
        <div
          class="h-full bg-purple-500 transition-all"
          style="width: {Math.min(
            ((props.data.outputValues?.value as number) ?? 0) * 100,
            100,
          )}%"
        ></div>
      </div>
      <span class="text-[10px] text-neutral-500 font-mono">
        Level: {((props.data.outputValues?.value as number) ?? 0).toFixed(3)}
      </span>
    </div>
  {:else if props.data.audioType === "bpm"}
    <div class="space-y-2">
      <div class="text-center">
        <span class="text-2xl font-bold text-orange-400">
          {((props.data.outputValues?.bpm as number) ?? 0).toFixed(0)}
        </span>
        <span class="text-xs text-neutral-500"> BPM</span>
      </div>
      <div class="text-[10px] text-neutral-400 text-center">
        Confidence: {(
          ((props.data.outputValues?.confidence as number) ?? 0) * 100
        ).toFixed(0)}%
      </div>
    </div>
  {:else if props.data.audioType === "beat"}
    <div class="space-y-2">
      <div>
        <Label class="text-[10px] text-neutral-400">
          Threshold: {Number(props.data.inputValues?.threshold ?? 0.5).toFixed(
            2,
          )}
        </Label>
        <Slider
          type="single"
          value={(props.data.inputValues?.threshold as number) ?? 0.5}
          min={0}
          max={1}
          step={0.01}
          onValueChange={(v) =>
            updateNodeData(props.id, {
              inputValues: { ...props.data.inputValues, threshold: v },
            })}
          class="nodrag"
        />
      </div>
      <!-- Beat indicator -->
      <div
        class="h-8 rounded flex items-center justify-center transition-all duration-75"
        class:bg-red-500={props.data.outputValues?.detected}
        class:bg-neutral-800={!props.data.outputValues?.detected}
      >
        <span class="text-xs font-bold">
          {props.data.outputValues?.detected ? "BEAT!" : "—"}
        </span>
      </div>
      <span class="text-[10px] text-neutral-500 font-mono">
        Intensity: {(
          (props.data.outputValues?.intensity as number) ?? 0
        ).toFixed(3)}
      </span>
    </div>
  {:else}
    <!-- Default preset bands (bass, mid, treble, etc.) -->
    <div class="space-y-2">
      {#if props.data.frequencyBand}
        <Label class="text-[10px] text-neutral-400">
          {frequencyBands.find((b) => b.value === props.data.frequencyBand)
            ?.label}
        </Label>
      {/if}
      <div>
        <Label class="text-[10px] text-neutral-400">
          Smoothing: {(props.data.smoothing ?? 0).toFixed(2)}
        </Label>
        <Slider
          type="single"
          value={props.data.smoothing ?? 0}
          min={0}
          max={0.99}
          step={0.01}
          onValueChange={(v) => updateNodeData(props.id, { smoothing: v })}
          class="nodrag"
        />
      </div>
      <!-- Level visualization -->
      <div class="h-4 bg-neutral-800 rounded overflow-hidden">
        <div
          class="h-full bg-cyan-500 transition-all"
          style="width: {((props.data.outputValues?.value as number) ?? 0) *
            100}%"
        ></div>
      </div>
      <span class="text-[10px] text-neutral-500 font-mono">
        Value: {((props.data.outputValues?.value as number) ?? 0).toFixed(3)}
      </span>
    </div>
  {/if}
</BaseNode>
