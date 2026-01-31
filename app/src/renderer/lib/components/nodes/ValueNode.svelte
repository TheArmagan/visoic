<script lang="ts">
  import { useSvelteFlow } from "@xyflow/svelte";
  import type { ValueNodeData } from "$lib/api/nodes/types";
  import { nodeGraph, useNodeProperty } from "$lib/api/nodes";
  import BaseNode from "./BaseNode.svelte";
  import { Switch } from "$lib/components/ui/switch";
  import { Input } from "$lib/components/ui/input";
  import { RangeSlider } from "$lib/components/ui/range-slider";

  interface Props {
    id: string;
    data: ValueNodeData;
    selected?: boolean;
  }

  let props: Props = $props();
  const data = $derived(props.data);
  const { updateNodeData } = useSvelteFlow();

  // Subscribe to value changes from nodeGraph (for external updates)
  const valueProperty = useNodeProperty<ValueNodeData, "value">(props.id, "value");
  const reactiveValue = $derived(valueProperty.value ?? data.value);

  // Use refs for inputs to avoid controlled input lag
  let numberInputRef = $state<HTMLInputElement | null>(null);
  let sliderRef = $state<HTMLInputElement | null>(null);

  // Keep input refs in sync with value when it changes externally
  $effect(() => {
    const val = reactiveValue;
    if (data.valueType === "number" && typeof val === "number") {
      if (numberInputRef && document.activeElement !== numberInputRef) {
        numberInputRef.value = String(val);
      }
      if (sliderRef && document.activeElement !== sliderRef) {
        sliderRef.value = String(val);
      }
    }
  });

  function updateValue(newValue: unknown) {
    const node = nodeGraph.getNode(props.id);
    if (node) {
      node.data.value = newValue;
    }
    updateNodeData(props.id, { value: newValue });
  }

  function handleNumberBlur(e: FocusEvent) {
    const value = parseFloat((e.target as HTMLInputElement).value) || 0;
    updateValue(value);
    if (sliderRef) sliderRef.value = String(value);
  }

  function handleNumberKeydown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      const value = parseFloat((e.target as HTMLInputElement).value) || 0;
      updateValue(value);
      if (sliderRef) sliderRef.value = String(value);
      (e.target as HTMLInputElement).blur();
    }
  }

  // Slider dragging - only update nodeGraph for runtime
  function handleSliderInput(e: Event) {
    const v = parseFloat((e.target as HTMLInputElement).value);
    // Update nodeGraph for runtime only
    const node = nodeGraph.getNode(props.id);
    if (node) {
      node.data.value = v;
    }
    // Update number input display
    if (numberInputRef) {
      numberInputRef.value = String(v);
    }
  }

  // Slider released - commit to SvelteFlow
  function handleSliderChange(e: Event) {
    const v = parseFloat((e.target as HTMLInputElement).value);
    updateNodeData(props.id, { value: v });
  }
</script>

<BaseNode {...props}>
  {#if data.valueType === "number"}
    <div class="space-y-2">
      <input
        bind:this={numberInputRef}
        type="number"
        value={data.value as number}
        min={data.min}
        max={data.max}
        step={data.step}
        onblur={handleNumberBlur}
        onkeydown={handleNumberKeydown}
        class="flex h-7 w-full rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1 text-xs shadow-sm transition-colors placeholder:text-neutral-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400 nodrag"
      />
      {#if data.min !== undefined && data.max !== undefined}
        <input
          bind:this={sliderRef}
          type="range"
          value={data.value as number}
          min={data.min}
          max={data.max}
          step={data.step ?? 0.01}
          oninput={handleSliderInput}
          onchange={handleSliderChange}
          class="w-full h-1.5 bg-neutral-700 rounded-lg appearance-none cursor-pointer nodrag accent-white"
        />
      {/if}
    </div>
  {:else if data.valueType === "boolean"}
    <div class="flex items-center justify-between">
      <span class="text-xs text-neutral-400">Value</span>
      <Switch
        checked={data.value as boolean}
        onCheckedChange={(checked) => updateValue(checked)}
        class="nodrag"
      />
    </div>
  {:else if data.valueType === "color"}
    <div class="space-y-2">
      <input
        type="color"
        value={`#${(reactiveValue as number[])
          .slice(0, 3)
          .map((v) =>
            Math.round(v * 255)
              .toString(16)
              .padStart(2, "0"),
          )
          .join("")}`}
        oninput={(e) => {
          const hex = (e.target as HTMLInputElement).value;
          const r = parseInt(hex.slice(1, 3), 16) / 255;
          const g = parseInt(hex.slice(3, 5), 16) / 255;
          const b = parseInt(hex.slice(5, 7), 16) / 255;
          const a = (reactiveValue as number[])[3] ?? 1;
          updateValue([r, g, b, a]);
        }}
        class="w-full h-8 rounded cursor-pointer nodrag"
      />
      <div class="flex items-center gap-2">
        <span class="text-[10px] text-neutral-500">Alpha</span>
        <RangeSlider
          value={(reactiveValue as number[])[3] ?? 1}
          min={0}
          max={1}
          step={0.01}
          oninput={(e) => {
            const v = parseFloat((e.target as HTMLInputElement).value);
            const node = nodeGraph.getNode(props.id);
            if (node && Array.isArray(node.data.value)) {
              node.data.value[3] = v;
            }
          }}
          onchange={(e) => {
            const v = parseFloat((e.target as HTMLInputElement).value);
            const color = reactiveValue as number[];
            updateValue([color[0], color[1], color[2], v]);
          }}
          class="flex-1"
        />
      </div>
    </div>
  {:else if data.valueType === "vec2"}
    <div class="grid grid-cols-2 gap-1">
      <Input
        type="number"
        value={(reactiveValue as number[])[0]}
        step={0.01}
        oninput={(e) => {
          const vec = data.value as number[];
          updateValue([
            parseFloat((e.target as HTMLInputElement).value) || 0,
            vec[1],
          ]);
        }}
        class="h-6 text-xs bg-neutral-800 border-neutral-700 nodrag"
        placeholder="X"
      />
      <Input
        type="number"
        value={(reactiveValue as number[])[1]}
        step={0.01}
        oninput={(e) => {
          const vec = data.value as number[];
          updateValue([
            vec[0],
            parseFloat((e.target as HTMLInputElement).value) || 0,
          ]);
        }}
        class="h-6 text-xs bg-neutral-800 border-neutral-700 nodrag"
        placeholder="Y"
      />
    </div>
  {:else if data.valueType === "vec3"}
    <div class="grid grid-cols-3 gap-1">
      {#each ["X", "Y", "Z"] as label, i}
        <Input
          type="number"
          value={(reactiveValue as number[])[i]}
          step={0.01}
          oninput={(e) => {
            const vec = [...(reactiveValue as number[])];
            vec[i] = parseFloat((e.target as HTMLInputElement).value) || 0;
            updateValue(vec);
          }}
          class="h-6 text-xs bg-neutral-800 border-neutral-700 nodrag"
          placeholder={label}
        />
      {/each}
    </div>
  {/if}
</BaseNode>


