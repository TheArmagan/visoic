<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { useSvelteFlow } from "@xyflow/svelte";
  import type { UtilityNodeData } from "$lib/api/nodes/types";
  import { nodeGraph } from "$lib/api/nodes";
  import BaseNode from "./BaseNode.svelte";
  import * as Select from "$lib/components/ui/select";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import { RangeSlider } from "$lib/components/ui/range-slider";

  interface Props {
    id: string;
    data: UtilityNodeData;
    selected?: boolean;
  }

  let props: Props = $props();

  // Reactive data state - poll from nodeGraph for real-time updates
  let liveData = $state<UtilityNodeData>(props.data);
  let updateInterval: ReturnType<typeof setInterval> | null = null;

  onMount(() => {
    // Poll for updates at 30fps for smooth display
    updateInterval = setInterval(() => {
      const node = nodeGraph.getNode(props.id);
      if (node) {
        liveData = node.data as UtilityNodeData;
      }
    }, 33);
  });

  onDestroy(() => {
    if (updateInterval) clearInterval(updateInterval);
  });

  // Use live data for display
  const data = $derived(liveData);

  // Get output values from live data
  const outputValues = $derived(data.outputValues);

  const { updateNodeData } = useSvelteFlow();

  // Helper to update both nodeGraph and SvelteFlow
  function updateData(updates: Partial<UtilityNodeData>) {
    const node = nodeGraph.getNode(props.id);
    if (node) {
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
    updateNodeData(props.id, updates);
  }

  // Use reactive outputValues from live data
  const time = $derived(outputValues?.time ?? 0);
  const delta = $derived(outputValues?.delta ?? 0);
  const frame = $derived(outputValues?.frame ?? 0);
  const value = $derived(outputValues?.value ?? outputValues?.smoothed ?? 0);

  const wrapModes = [
    { value: "clamp", label: "Clamp" },
    { value: "wrap", label: "Wrap" },
    { value: "pingpong", label: "Ping-Pong" },
  ];

  const waveforms = [
    { value: "sine", label: "Sine" },
    { value: "square", label: "Square" },
    { value: "sawtooth", label: "Sawtooth" },
    { value: "triangle", label: "Triangle" },
    { value: "pulse", label: "Pulse" },
  ];

  const triggerModes = [
    { value: "rising", label: "Rising Edge" },
    { value: "falling", label: "Falling Edge" },
    { value: "both", label: "Both Edges" },
  ];

  function updateAccumulatorConfig(key: string, val: unknown) {
    updateData({
      accumulatorConfig: {
        ...data.accumulatorConfig,
        [key]: val,
      },
    });
  }

  function updateOscillatorConfig(key: string, val: unknown) {
    updateData({
      oscillatorConfig: {
        ...data.oscillatorConfig,
        [key]: val,
      },
    });
  }
</script>

<BaseNode {...props}>
  {#if data.utilityType === "time"}
    <div class="space-y-1 font-mono text-[10px]">
      <div class="flex justify-between text-neutral-400">
        <span>Time:</span>
        <span class="text-green-400">{(time as number).toFixed(2)}s</span>
      </div>
      <div class="flex justify-between text-neutral-400">
        <span>Delta:</span>
        <span class="text-blue-400"
          >{((delta as number) * 1000).toFixed(1)}ms</span
        >
      </div>
      <div class="flex justify-between text-neutral-400">
        <span>Frame:</span>
        <span class="text-purple-400">{frame}</span>
      </div>
    </div>
  {:else if data.utilityType === "random"}
    <div class="flex flex-col items-center gap-1">
      <span class="text-2xl">🎲</span>
      <span class="text-xs font-mono text-neutral-400">
        {(value as number).toFixed(4)}
      </span>
    </div>
  {:else if data.utilityType === "smooth"}
    <div class="space-y-2">
      <div>
        <Label class="text-[10px] text-neutral-400">Value</Label>
        <Input
          type="number"
          step="0.01"
          value={data.inputValues?.value ?? 0}
          oninput={(e) => {
            const val = parseFloat((e.target as HTMLInputElement).value) || 0;
            const node = nodeGraph.getNode(props.id);
            if (node?.data?.inputValues) {
              node.data.inputValues.value = val;
            }
          }}
          onchange={(e) => {
            const val = parseFloat((e.target as HTMLInputElement).value) || 0;
            updateData({ inputValues: { ...data.inputValues, value: val } });
          }}
          class="h-6 text-xs bg-neutral-800 border-neutral-700 nodrag"
        />
      </div>
      <div>
        <Label class="text-[10px] text-neutral-400">
          Speed: {(data.inputValues?.speed ?? 0.1).toFixed(2)}
        </Label>
        <RangeSlider
          value={data.inputValues?.speed ?? 0.1}
          min={0.001}
          max={1}
          step={0.001}
          oninput={(e) => {
            const val = parseFloat((e.target as HTMLInputElement).value) || 0.1;
            const node = nodeGraph.getNode(props.id);
            if (node?.data?.inputValues) {
              node.data.inputValues.speed = val;
            }
          }}
          onchange={(e) => {
            const val = parseFloat((e.target as HTMLInputElement).value) || 0.1;
            updateData({ inputValues: { ...data.inputValues, speed: val } });
          }}
          class="w-full nodrag"
        />
      </div>
      <div class="w-full h-6 bg-neutral-800 rounded overflow-hidden relative">
        <div
          class="absolute inset-y-0 left-0 bg-linear-to-r from-blue-500 to-purple-500 transition-all duration-100"
          style="width: {Math.min(100, Math.max(0, (value as number) * 100))}%"
        ></div>
      </div>
      <span class="text-xs font-mono text-neutral-400">
        {(value as number).toFixed(4)}
      </span>
    </div>
  {:else if data.utilityType === "accumulator"}
    <div class="space-y-2">
      <div>
        <Label class="text-[10px] text-neutral-400">
          Rate: {(data.accumulatorConfig?.rate ?? 1).toFixed(2)}/s
        </Label>
        <RangeSlider
          value={data.accumulatorConfig?.rate ?? 1}
          min={-10}
          max={10}
          step={0.1}
          oninput={(e) => {
            const val = parseFloat((e.target as HTMLInputElement).value);
            const node = nodeGraph.getNode(props.id);
            if (node && node.data.accumulatorConfig) {
              node.data.accumulatorConfig.rate = val;
            }
          }}
          onchange={(e) =>
            updateAccumulatorConfig(
              "rate",
              parseFloat((e.target as HTMLInputElement).value),
            )}
        />
      </div>
      <div class="grid grid-cols-2 gap-2">
        <div>
          <Label class="text-[10px] text-neutral-400">Min</Label>
          <Input
            type="number"
            value={data.accumulatorConfig?.min ?? 0}
            oninput={(e) => {
              const val = parseFloat((e.target as HTMLInputElement).value) || 0;
              const node = nodeGraph.getNode(props.id);
              if (node?.data?.accumulatorConfig) {
                node.data.accumulatorConfig.min = val;
              }
            }}
            onchange={(e) =>
              updateAccumulatorConfig(
                "min",
                parseFloat((e.target as HTMLInputElement).value) || 0,
              )}
            class="h-6 text-xs bg-neutral-800 border-neutral-700 nodrag"
          />
        </div>
        <div>
          <Label class="text-[10px] text-neutral-400">Max</Label>
          <Input
            type="number"
            value={data.accumulatorConfig?.max ?? 1}
            oninput={(e) => {
              const val = parseFloat((e.target as HTMLInputElement).value) || 1;
              const node = nodeGraph.getNode(props.id);
              if (node?.data?.accumulatorConfig) {
                node.data.accumulatorConfig.max = val;
              }
            }}
            onchange={(e) =>
              updateAccumulatorConfig(
                "max",
                parseFloat((e.target as HTMLInputElement).value) || 1,
              )}
            class="h-6 text-xs bg-neutral-800 border-neutral-700 nodrag"
          />
        </div>
      </div>
      <div>
        <Label class="text-[10px] text-neutral-400">Mode</Label>
        <Select.Root
          type="single"
          value={data.accumulatorConfig?.wrapMode ?? "wrap"}
          onValueChange={(v) => updateAccumulatorConfig("wrapMode", v)}
        >
          <Select.Trigger
            class="h-7 text-xs bg-neutral-800 border-neutral-700 nodrag"
          >
            {wrapModes.find((m) => m.value === data.accumulatorConfig?.wrapMode)
              ?.label ?? "Wrap"}
          </Select.Trigger>
          <Select.Content>
            {#each wrapModes as mode}
              <Select.Item value={mode.value}>{mode.label}</Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
      </div>
      <!-- Value visualization -->
      <div class="w-full h-6 bg-neutral-800 rounded overflow-hidden relative">
        <div
          class="absolute inset-y-0 left-0 bg-green-500 transition-all"
          style="width: {Math.min(100, Math.max(0, (value as number) * 100))}%"
        ></div>
      </div>
      <span class="text-[10px] text-neutral-500 font-mono">
        Value: {(value as number).toFixed(4)}
      </span>
    </div>
  {:else if data.utilityType === "oscillator"}
    <div class="space-y-2">
      <div>
        <Label class="text-[10px] text-neutral-400">Waveform</Label>
        <Select.Root
          type="single"
          value={data.oscillatorConfig?.waveform ?? "sine"}
          onValueChange={(v) => updateOscillatorConfig("waveform", v)}
        >
          <Select.Trigger
            class="h-7 text-xs bg-neutral-800 border-neutral-700 nodrag"
          >
            {waveforms.find((w) => w.value === data.oscillatorConfig?.waveform)
              ?.label ?? "Sine"}
          </Select.Trigger>
          <Select.Content>
            {#each waveforms as waveform}
              <Select.Item value={waveform.value}>{waveform.label}</Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
      </div>
      <div>
        <Label class="text-[10px] text-neutral-400">
          Frequency: {(data.oscillatorConfig?.frequency ?? 1).toFixed(2)} Hz
        </Label>
        <RangeSlider
          value={data.oscillatorConfig?.frequency ?? 1}
          min={0.01}
          max={10}
          step={0.01}
          oninput={(e) => {
            const val = parseFloat((e.target as HTMLInputElement).value);
            const node = nodeGraph.getNode(props.id);
            if (node && (node.data.oscillatorConfig as any)) {
              (node.data.oscillatorConfig as any).frequency = val;
            }
          }}
          onchange={(e) =>
            updateOscillatorConfig(
              "frequency",
              parseFloat((e.target as HTMLInputElement).value),
            )}
        />
      </div>
      <div>
        <Label class="text-[10px] text-neutral-400">
          Phase: {((data.oscillatorConfig?.phase ?? 0) * 360).toFixed(0)}°
        </Label>
        <RangeSlider
          value={data.oscillatorConfig?.phase ?? 0}
          min={0}
          max={1}
          step={0.01}
          oninput={(e) => {
            const val = parseFloat((e.target as HTMLInputElement).value);
            const node = nodeGraph.getNode(props.id);
            if (node && (node.data.oscillatorConfig as any)) {
              (node.data.oscillatorConfig as any).phase = val;
            }
          }}
          onchange={(e) =>
            updateOscillatorConfig(
              "phase",
              parseFloat((e.target as HTMLInputElement).value),
            )}
        />
      </div>
      {#if data.oscillatorConfig?.waveform === "pulse"}
        <div>
          <Label class="text-[10px] text-neutral-400">
            Duty: {((data.oscillatorConfig?.pulseWidth ?? 0.5) * 100).toFixed(
              0,
            )}%
          </Label>
          <RangeSlider
            value={data.oscillatorConfig?.pulseWidth ?? 0.5}
            min={0.01}
            max={0.99}
            step={0.01}
            oninput={(e) => {
              const val = parseFloat((e.target as HTMLInputElement).value);
              const node = nodeGraph.getNode(props.id);
              if (node && (node.data.oscillatorConfig as any)) {
                (node.data.oscillatorConfig as any).pulseWidth = val;
              }
            }}
            onchange={(e) =>
              updateOscillatorConfig(
                "pulseWidth",
                parseFloat((e.target as HTMLInputElement).value),
              )}
          />
        </div>
      {/if}
      <!-- Oscillator visualization -->
      <div
        class="w-full h-8 bg-neutral-800 rounded overflow-hidden relative flex items-center"
      >
        <div
          class="absolute h-4 w-4 rounded-full bg-purple-500 transition-all"
          style="left: calc({Math.min(
            100,
            Math.max(0, ((value as number) + 1) * 50),
          )}% - 8px)"
        ></div>
      </div>
      <span class="text-[10px] text-neutral-500 font-mono">
        Value: {(value as number).toFixed(4)}
      </span>
    </div>
  {:else if data.utilityType === "expression"}
    <div class="space-y-2">
      <div>
        <Label class="text-[10px] text-neutral-400">Expression</Label>
        <Input
          type="text"
          value={data.expression ?? "a + b"}
          oninput={(e) =>
            updateData({
              expression: (e.target as HTMLInputElement).value,
            })}
          class="h-7 text-xs bg-neutral-800 border-neutral-700 nodrag font-mono"
          placeholder="a + b * sin(time)"
        />
      </div>
      <div class="text-[9px] text-neutral-500">
        Variables: a, b, time, dt, frame
      </div>
      <span class="text-[10px] text-neutral-500 font-mono">
        Result: {(value as number).toFixed(4)}
      </span>
    </div>
  {:else if data.utilityType === "trigger"}
    <div class="space-y-2">
      <div>
        <Label class="text-[10px] text-neutral-400">Mode</Label>
        <Select.Root
          type="single"
          value={data.triggerConfig?.mode ?? "rising"}
          onValueChange={(v) =>
            updateData({
              triggerConfig: { ...data.triggerConfig, mode: v as any },
            })}
        >
          <Select.Trigger
            class="h-7 text-xs bg-neutral-800 border-neutral-700 nodrag"
          >
            {triggerModes.find((m) => m.value === data.triggerConfig?.mode)
              ?.label ?? "Rising Edge"}
          </Select.Trigger>
          <Select.Content>
            {#each triggerModes as mode}
              <Select.Item value={mode.value}>{mode.label}</Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
      </div>
      <div>
        <Label class="text-[10px] text-neutral-400">
          Threshold: {(data.triggerConfig?.threshold ?? 0.5).toFixed(2)}
        </Label>
        <RangeSlider
          value={data.triggerConfig?.threshold ?? 0.5}
          min={0}
          max={1}
          step={0.01}
          oninput={(e) => {
            const val = parseFloat((e.target as HTMLInputElement).value);
            const node = nodeGraph.getNode(props.id);
            if (node && node.data.triggerConfig) {
              node.data.triggerConfig.threshold = val;
            }
          }}
          onchange={(e) =>
            updateData({
              triggerConfig: {
                ...data.triggerConfig,
                threshold: parseFloat((e.target as HTMLInputElement).value),
              },
            })}
        />
      </div>
      <!-- Trigger indicator -->
      <div
        class="h-8 rounded flex items-center justify-center transition-all duration-75"
        class:bg-yellow-500={outputValues?.triggered}
        class:bg-neutral-800={!outputValues?.triggered}
      >
        <span class="text-xs font-bold">
          {outputValues?.triggered ? "TRIGGERED" : "—"}
        </span>
      </div>
    </div>
  {:else if data.utilityType === "noise"}
    <div class="space-y-2">
      <div>
        <Label class="text-[10px] text-neutral-400">
          Octaves: {data.noiseConfig?.octaves ?? 4}
        </Label>
        <RangeSlider
          value={data.noiseConfig?.octaves ?? 4}
          min={1}
          max={8}
          step={1}
          oninput={(e) => {
            const val = parseInt((e.target as HTMLInputElement).value);
            const node = nodeGraph.getNode(props.id);
            if (node && node.data.noiseConfig) {
              node.data.noiseConfig.octaves = val;
            }
          }}
          onchange={(e) =>
            updateData({
              noiseConfig: {
                ...data.noiseConfig,
                octaves: parseInt((e.target as HTMLInputElement).value),
              },
            })}
        />
      </div>
      <span class="text-[10px] text-neutral-500 font-mono">
        Value: {(value as number).toFixed(4)}
      </span>
    </div>
  {:else if data.utilityType === "delay"}
    <div class="space-y-2">
      <div>
        <Label class="text-[10px] text-neutral-400">
          Delay: {((data.delayConfig?.time ?? 0.1) * 1000).toFixed(0)}ms
        </Label>
        <RangeSlider
          value={data.delayConfig?.time ?? 0.1}
          min={0.01}
          max={2}
          step={0.01}
          oninput={(e) => {
            const val = parseFloat((e.target as HTMLInputElement).value);
            const node = nodeGraph.getNode(props.id);
            if (node && node.data.delayConfig) {
              node.data.delayConfig.time = val;
            }
          }}
          onchange={(e) =>
            updateData({
              delayConfig: {
                ...data.delayConfig,
                time: parseFloat((e.target as HTMLInputElement).value),
              },
            })}
        />
      </div>
      <div class="flex gap-2 text-[10px] text-neutral-500 font-mono">
        <span>In: {((data.inputValues?.value as number) ?? 0).toFixed(3)}</span>
        <span>→</span>
        <span>Out: {(value as number).toFixed(3)}</span>
      </div>
    </div>
  {:else if data.utilityType === "hold"}
    <div class="space-y-2">
      <div>
        <Label class="text-[10px] text-neutral-400">
          Hold Time: {data.holdConfig?.holdTime ?? 100}ms
        </Label>
        <RangeSlider
          value={data.holdConfig?.holdTime ?? 100}
          min={10}
          max={1000}
          step={10}
          oninput={(e) => {
            const val = parseFloat((e.target as HTMLInputElement).value);
            const node = nodeGraph.getNode(props.id);
            if (node && node.data.holdConfig) {
              node.data.holdConfig.holdTime = val;
            }
            if (node && node.data.inputValues) {
              node.data.inputValues.holdTime = val;
            }
          }}
          onchange={(e) => {
            const val = parseFloat((e.target as HTMLInputElement).value);
            updateData({
              holdConfig: { ...data.holdConfig, holdTime: val },
              inputValues: { ...data.inputValues, holdTime: val },
            });
          }}
        />
      </div>
      <!-- Active indicator -->
      <div
        class="h-6 rounded flex items-center justify-center transition-all duration-75"
        class:bg-green-500={outputValues?.active}
        class:bg-neutral-800={!outputValues?.active}
      >
        <span class="text-xs font-bold">
          {outputValues?.active ? "ACTIVE" : "—"}
        </span>
      </div>
      <div class="flex justify-between text-[10px] text-neutral-500 font-mono">
        <span>Trigger: {data.inputValues?.trigger ? "ON" : "OFF"}</span>
        <span>Value: {((outputValues?.value as number) ?? 0).toFixed(2)}</span>
      </div>
    </div>
  {:else}
    <div class="text-center text-xs text-neutral-500">
      {data.utilityType}
    </div>
  {/if}
</BaseNode>
