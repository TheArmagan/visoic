<script lang="ts">
  import { onDestroy } from "svelte";
  import { useSvelteFlow } from "@xyflow/svelte";
  import type { ValueNodeData } from "$lib/api/nodes/types";
  import { nodeGraph } from "$lib/api/nodes";
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

  // Use subscription-based updates instead of polling for better performance
  let liveData = $state<ValueNodeData>(props.data);

  // Subscribe to this specific node's updates
  const unsubscribe = nodeGraph.subscribeToNode(props.id, (newData) => {
    liveData = newData as ValueNodeData;
  });

  onDestroy(() => {
    unsubscribe();
  });

  const data = $derived(liveData);
  const { updateNodeData } = useSvelteFlow();

  // Use reactive value from live data
  const reactiveValue = $derived(data.value);

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
    {@const baseColor = reactiveValue as number[]}
    {@const inputValues = data.inputValues ?? {}}
    {@const hasRInput = inputValues.r !== undefined}
    {@const hasGInput = inputValues.g !== undefined}
    {@const hasBInput = inputValues.b !== undefined}
    {@const hasAInput = inputValues.a !== undefined}
    {@const computedR = hasRInput ? Number(inputValues.r) : (baseColor[0] ?? 1)}
    {@const computedG = hasGInput ? Number(inputValues.g) : (baseColor[1] ?? 1)}
    {@const computedB = hasBInput ? Number(inputValues.b) : (baseColor[2] ?? 1)}
    {@const computedA = hasAInput ? Number(inputValues.a) : (baseColor[3] ?? 1)}
    {@const anyInputConnected =
      hasRInput || hasGInput || hasBInput || hasAInput}
    <div class="space-y-2">
      <!-- Color preview showing computed color -->
      <div
        class="w-full h-8 rounded border border-neutral-700"
        style="background-color: rgba({Math.round(
          computedR * 255,
        )}, {Math.round(computedG * 255)}, {Math.round(
          computedB * 255,
        )}, {computedA});"
      ></div>

      <!-- Color picker (only affects base color, disabled channels show connected value) -->
      {#if !anyInputConnected}
        <input
          type="color"
          value={`#${baseColor
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
            const a = baseColor[3] ?? 1;
            updateValue([r, g, b, a]);
          }}
          class="w-full h-6 rounded cursor-pointer nodrag"
        />
      {/if}

      <!-- RGBA channel controls -->
      <div class="grid grid-cols-4 gap-1">
        {#each [{ label: "R", index: 0, connected: hasRInput, value: computedR }, { label: "G", index: 1, connected: hasGInput, value: computedG }, { label: "B", index: 2, connected: hasBInput, value: computedB }, { label: "A", index: 3, connected: hasAInput, value: computedA }] as channel}
          <div class="flex flex-col items-center gap-0.5">
            <span class="text-[9px] text-neutral-500">{channel.label}</span>
            {#if channel.connected}
              <div
                class="h-5 w-full flex items-center justify-center text-[10px] text-neutral-400 bg-neutral-800 rounded border border-neutral-600"
              >
                {channel.value.toFixed(2)}
              </div>
            {:else}
              <input
                type="number"
                value={baseColor[channel.index] ??
                  (channel.index === 3 ? 1 : 0)}
                min={0}
                max={1}
                step={0.01}
                oninput={(e) => {
                  const v =
                    parseFloat((e.target as HTMLInputElement).value) || 0;
                  const node = nodeGraph.getNode(props.id);
                  if (node && Array.isArray(node.data.value)) {
                    node.data.value[channel.index] = v;
                  }
                }}
                onchange={(e) => {
                  const v =
                    parseFloat((e.target as HTMLInputElement).value) || 0;
                  const newColor = [...baseColor];
                  newColor[channel.index] = v;
                  updateValue(newColor);
                }}
                class="h-5 w-full text-[10px] text-center bg-neutral-800 border border-neutral-700 rounded nodrag px-1"
              />
            {/if}
          </div>
        {/each}
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
