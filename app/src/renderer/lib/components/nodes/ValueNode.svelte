<script lang="ts">
  import { useSvelteFlow } from "@xyflow/svelte";
  import type { ValueNodeData } from "$lib/api/nodes/types";
  import { nodeGraph } from "$lib/api/nodes";
  import BaseNode from "./BaseNode.svelte";
  import { Input } from "$lib/components/ui/input";
  import { Switch } from "$lib/components/ui/switch";
  import { Slider } from "$lib/components/ui/slider";

  interface Props {
    id: string;
    data: ValueNodeData;
    selected?: boolean;
  }

  let props: Props = $props();

  const { updateNodeData } = useSvelteFlow();

  function updateValue(newValue: unknown) {
    // Update nodeGraph for runtime (silent - no listener trigger for perf)
    nodeGraph.updateNodeDataSilent(props.id, { value: newValue });
    // Update SvelteFlow for UI
    updateNodeData(props.id, { value: newValue });
  }
</script>

<BaseNode {...props}>
  {#if props.data.valueType === "number"}
    <div class="space-y-2">
      <Input
        type="number"
        value={props.data.value as number}
        min={props.data.min}
        max={props.data.max}
        step={props.data.step}
        oninput={(e) =>
          updateValue(parseFloat((e.target as HTMLInputElement).value) || 0)}
        class="h-7 text-xs bg-neutral-800 border-neutral-700 nodrag"
      />
      {#if props.data.min !== undefined && props.data.max !== undefined}
        <Slider
          type="single"
          value={props.data.value as number}
          min={props.data.min}
          max={props.data.max}
          step={props.data.step ?? 0.01}
          onValueChange={(v) => updateValue(v)}
          class="nodrag"
        />
      {/if}
    </div>
  {:else if props.data.valueType === "boolean"}
    <div class="flex items-center justify-between">
      <span class="text-xs text-neutral-400">Value</span>
      <Switch
        checked={props.data.value as boolean}
        onCheckedChange={(checked) => updateValue(checked)}
        class="nodrag"
      />
    </div>
  {:else if props.data.valueType === "color"}
    <div class="space-y-2">
      <input
        type="color"
        value={`#${(props.data.value as number[])
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
          const a = (props.data.value as number[])[3] ?? 1;
          updateValue([r, g, b, a]);
        }}
        class="w-full h-8 rounded cursor-pointer nodrag"
      />
      <div class="flex items-center gap-2">
        <span class="text-[10px] text-neutral-500">Alpha</span>
        <Slider
          type="single"
          value={(props.data.value as number[])[3] ?? 1}
          min={0}
          max={1}
          step={0.01}
          onValueChange={(v) => {
            const color = props.data.value as number[];
            updateValue([color[0], color[1], color[2], v]);
          }}
          class="nodrag flex-1"
        />
      </div>
    </div>
  {:else if props.data.valueType === "vec2"}
    <div class="grid grid-cols-2 gap-1">
      <Input
        type="number"
        value={(props.data.value as number[])[0]}
        step={0.01}
        oninput={(e) => {
          const vec = props.data.value as number[];
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
        value={(props.data.value as number[])[1]}
        step={0.01}
        oninput={(e) => {
          const vec = props.data.value as number[];
          updateValue([
            vec[0],
            parseFloat((e.target as HTMLInputElement).value) || 0,
          ]);
        }}
        class="h-6 text-xs bg-neutral-800 border-neutral-700 nodrag"
        placeholder="Y"
      />
    </div>
  {:else if props.data.valueType === "vec3"}
    <div class="grid grid-cols-3 gap-1">
      {#each ["X", "Y", "Z"] as label, i}
        <Input
          type="number"
          value={(props.data.value as number[])[i]}
          step={0.01}
          oninput={(e) => {
            const vec = [...(props.data.value as number[])];
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
