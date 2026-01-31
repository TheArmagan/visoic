<script lang="ts">
  import { useSvelteFlow } from "@xyflow/svelte";
  import type { UtilityNodeData } from "$lib/api/nodes/types";
  import BaseNode from "./BaseNode.svelte";
  import * as Select from "$lib/components/ui/select";
  import { Input } from "$lib/components/ui/input";
  import { Slider } from "$lib/components/ui/slider";
  import { Label } from "$lib/components/ui/label";

  interface Props {
    id: string;
    data: UtilityNodeData;
    selected?: boolean;
  }

  let props: Props = $props();

  const { updateNodeData } = useSvelteFlow();

  const time = $derived(props.data.outputValues?.time ?? 0);
  const delta = $derived(props.data.outputValues?.delta ?? 0);
  const frame = $derived(props.data.outputValues?.frame ?? 0);
  const value = $derived(
    props.data.outputValues?.value ?? props.data.outputValues?.smoothed ?? 0,
  );

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

  function updateAccumulatorConfig(key: string, value: unknown) {
    updateNodeData(props.id, {
      accumulatorConfig: {
        ...props.data.accumulatorConfig,
        [key]: value,
      },
    });
  }

  function updateOscillatorConfig(key: string, value: unknown) {
    updateNodeData(props.id, {
      oscillatorConfig: {
        ...props.data.oscillatorConfig,
        [key]: value,
      },
    });
  }
</script>

<BaseNode {...props}>
  {#if props.data.utilityType === "time"}
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
  {:else if props.data.utilityType === "random"}
    <div class="flex flex-col items-center gap-1">
      <span class="text-2xl">🎲</span>
      <span class="text-xs font-mono text-neutral-400">
        {(value as number).toFixed(4)}
      </span>
    </div>
  {:else if props.data.utilityType === "smooth"}
    <div class="flex flex-col items-center gap-1">
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
  {:else if props.data.utilityType === "accumulator"}
    <div class="space-y-2">
      <div>
        <Label class="text-[10px] text-neutral-400">
          Rate: {(props.data.accumulatorConfig?.rate ?? 1).toFixed(2)}/s
        </Label>
        <Slider
          type="single"
          value={props.data.accumulatorConfig?.rate ?? 1}
          min={-10}
          max={10}
          step={0.1}
          onValueChange={(v) => updateAccumulatorConfig("rate", v)}
          class="nodrag"
        />
      </div>
      <div class="grid grid-cols-2 gap-2">
        <div>
          <Label class="text-[10px] text-neutral-400">Min</Label>
          <Input
            type="number"
            value={props.data.accumulatorConfig?.min ?? 0}
            oninput={(e) =>
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
            value={props.data.accumulatorConfig?.max ?? 1}
            oninput={(e) =>
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
          value={props.data.accumulatorConfig?.mode ?? "wrap"}
          onValueChange={(v) => updateAccumulatorConfig("mode", v)}
        >
          <Select.Trigger
            class="h-7 text-xs bg-neutral-800 border-neutral-700 nodrag"
          >
            {wrapModes.find(
              (m) => m.value === props.data.accumulatorConfig?.mode,
            )?.label ?? "Wrap"}
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
  {:else if props.data.utilityType === "oscillator"}
    <div class="space-y-2">
      <div>
        <Label class="text-[10px] text-neutral-400">Waveform</Label>
        <Select.Root
          type="single"
          value={props.data.oscillatorConfig?.waveform ?? "sine"}
          onValueChange={(v) => updateOscillatorConfig("waveform", v)}
        >
          <Select.Trigger
            class="h-7 text-xs bg-neutral-800 border-neutral-700 nodrag"
          >
            {waveforms.find(
              (w) => w.value === props.data.oscillatorConfig?.waveform,
            )?.label ?? "Sine"}
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
          Frequency: {(props.data.oscillatorConfig?.frequency ?? 1).toFixed(2)} Hz
        </Label>
        <Slider
          type="single"
          value={props.data.oscillatorConfig?.frequency ?? 1}
          min={0.01}
          max={10}
          step={0.01}
          onValueChange={(v) => updateOscillatorConfig("frequency", v)}
          class="nodrag"
        />
      </div>
      <div>
        <Label class="text-[10px] text-neutral-400">
          Phase: {((props.data.oscillatorConfig?.phase ?? 0) * 360).toFixed(0)}°
        </Label>
        <Slider
          type="single"
          value={props.data.oscillatorConfig?.phase ?? 0}
          min={0}
          max={1}
          step={0.01}
          onValueChange={(v) => updateOscillatorConfig("phase", v)}
          class="nodrag"
        />
      </div>
      {#if props.data.oscillatorConfig?.waveform === "pulse"}
        <div>
          <Label class="text-[10px] text-neutral-400">
            Duty: {(
              (props.data.oscillatorConfig?.pulseWidth ?? 0.5) * 100
            ).toFixed(0)}%
          </Label>
          <Slider
            type="single"
            value={props.data.oscillatorConfig?.pulseWidth ?? 0.5}
            min={0.01}
            max={0.99}
            step={0.01}
            onValueChange={(v) => updateOscillatorConfig("pulseWidth", v)}
            class="nodrag"
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
  {:else if props.data.utilityType === "expression"}
    <div class="space-y-2">
      <div>
        <Label class="text-[10px] text-neutral-400">Expression</Label>
        <Input
          type="text"
          value={props.data.expression ?? "a + b"}
          oninput={(e) =>
            updateNodeData(props.id, {
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
  {:else if props.data.utilityType === "trigger"}
    <div class="space-y-2">
      <div>
        <Label class="text-[10px] text-neutral-400">Mode</Label>
        <Select.Root
          type="single"
          value={props.data.triggerConfig?.mode ?? "rising"}
          onValueChange={(v) =>
            updateNodeData(props.id, {
              triggerConfig: { ...props.data.triggerConfig, mode: v },
            })}
        >
          <Select.Trigger
            class="h-7 text-xs bg-neutral-800 border-neutral-700 nodrag"
          >
            {triggerModes.find(
              (m) => m.value === props.data.triggerConfig?.mode,
            )?.label ?? "Rising Edge"}
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
          Threshold: {(props.data.triggerConfig?.threshold ?? 0.5).toFixed(2)}
        </Label>
        <Slider
          type="single"
          value={props.data.triggerConfig?.threshold ?? 0.5}
          min={0}
          max={1}
          step={0.01}
          onValueChange={(v) =>
            updateNodeData(props.id, {
              triggerConfig: { ...props.data.triggerConfig, threshold: v },
            })}
          class="nodrag"
        />
      </div>
      <!-- Trigger indicator -->
      <div
        class="h-8 rounded flex items-center justify-center transition-all duration-75"
        class:bg-yellow-500={props.data.outputValues?.triggered}
        class:bg-neutral-800={!props.data.outputValues?.triggered}
      >
        <span class="text-xs font-bold">
          {props.data.outputValues?.triggered ? "TRIGGERED" : "—"}
        </span>
      </div>
    </div>
  {:else if props.data.utilityType === "noise"}
    <div class="space-y-2">
      <div>
        <Label class="text-[10px] text-neutral-400">
          Octaves: {props.data.noiseConfig?.octaves ?? 4}
        </Label>
        <Slider
          type="single"
          value={props.data.noiseConfig?.octaves ?? 4}
          min={1}
          max={8}
          step={1}
          onValueChange={(v) =>
            updateNodeData(props.id, {
              noiseConfig: { ...props.data.noiseConfig, octaves: v },
            })}
          class="nodrag"
        />
      </div>
      <span class="text-[10px] text-neutral-500 font-mono">
        Value: {(value as number).toFixed(4)}
      </span>
    </div>
  {:else if props.data.utilityType === "delay"}
    <div class="space-y-2">
      <div>
        <Label class="text-[10px] text-neutral-400">
          Delay: {((props.data.delayConfig?.time ?? 0.1) * 1000).toFixed(0)}ms
        </Label>
        <Slider
          type="single"
          value={props.data.delayConfig?.time ?? 0.1}
          min={0.01}
          max={2}
          step={0.01}
          onValueChange={(v) =>
            updateNodeData(props.id, {
              delayConfig: { ...props.data.delayConfig, time: v },
            })}
          class="nodrag"
        />
      </div>
      <div class="flex gap-2 text-[10px] text-neutral-500 font-mono">
        <span
          >In: {((props.data.inputValues?.value as number) ?? 0).toFixed(
            3,
          )}</span
        >
        <span>→</span>
        <span>Out: {(value as number).toFixed(3)}</span>
      </div>
    </div>
  {:else}
    <div class="text-center text-xs text-neutral-500">
      {props.data.utilityType}
    </div>
  {/if}
</BaseNode>
