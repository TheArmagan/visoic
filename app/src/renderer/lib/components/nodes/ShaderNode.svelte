<script lang="ts">
  import { useSvelteFlow } from "@xyflow/svelte";
  import type { ShaderNodeData } from "$lib/api/nodes/types";
  import { nodeGraph } from "$lib/api/nodes";
  import BaseNode from "./BaseNode.svelte";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import * as Select from "$lib/components/ui/select";
  import { RangeSlider } from "$lib/components/ui/range-slider";

  interface Props {
    id: string;
    data: ShaderNodeData;
    selected?: boolean;
  }

  let props: Props = $props();

  // Use props.data directly - SvelteFlow handles reactivity
  const data = $derived(props.data);

  const { updateNodeData } = useSvelteFlow();

  function updateInputValue(inputId: string, value: unknown) {
    const newInputValues = {
      ...data.inputValues,
      [inputId]: value,
    };
    // Update nodeGraph for runtime (silent - no listener trigger for perf)
    nodeGraph.updateNodeDataSilent(props.id, { inputValues: newInputValues });
    // Update SvelteFlow for UI
    updateNodeData(props.id, { inputValues: newInputValues });
  }

  function updateLayerSetting(key: string, value: unknown) {
    // Update nodeGraph for runtime (silent - no listener trigger for perf)
    nodeGraph.updateNodeDataSilent(props.id, { [key]: value });
    // Update SvelteFlow for UI
    updateNodeData(props.id, { [key]: value });
  }

  // Filter inputs to show only controllable ones (not images, not renderContext)
  const controllableInputs = $derived(
    data.inputs.filter(
      (i) => i.dataType !== "image" && i.dataType !== "renderContext",
    ),
  );

  const blendModes = [
    { value: "normal", label: "Normal" },
    { value: "add", label: "Add" },
    { value: "multiply", label: "Multiply" },
    { value: "screen", label: "Screen" },
    { value: "overlay", label: "Overlay" },
    { value: "difference", label: "Difference" },
  ];
</script>

<BaseNode {...props}>
  {#snippet headerExtra()}
    <div class="flex items-center gap-1">
      <span
        class="text-[9px] px-1.5 py-0.5 bg-purple-500/20 text-purple-300 rounded"
      >
        Shader
      </span>
      {#if data.enabled === false}
        <span class="text-[9px] text-yellow-400">OFF</span>
      {/if}
    </div>
  {/snippet}

  <div class="space-y-2">
    <!-- Layer Controls -->
    <div class="border-b border-neutral-700 pb-2 mb-2">
      <div class="flex items-center justify-between mb-1">
        <Label class="text-[10px] text-neutral-400">Opacity</Label>
        <span class="text-[9px] font-mono text-neutral-500">
          {((data.opacity ?? 1) * 100).toFixed(0)}%
        </span>
      </div>
      <RangeSlider
        value={data.opacity ?? 1}
        min={0}
        max={1}
        step={0.01}
        oninput={(e) => {
          const val = parseFloat((e.target as HTMLInputElement).value);
          const node = nodeGraph.getNode(props.id);
          if (node) {
            node.data.opacity = val;
          }
        }}
        onchange={(e) => updateLayerSetting("opacity", parseFloat((e.target as HTMLInputElement).value))}
        />

      <div class="flex items-center gap-2 mt-2">
        <div class="flex-1">
          <Label class="text-[10px] text-neutral-400 block mb-1">Blend</Label>
          <Select.Root
            type="single"
            value={data.blendMode ?? "normal"}
            onValueChange={(v) => updateLayerSetting("blendMode", v)}
          >
            <Select.Trigger
              class="h-6 text-xs bg-neutral-800 border-neutral-700 nodrag"
            >
              {blendModes.find(
                (m) => m.value === (data.blendMode ?? "normal"),
              )?.label ?? "Normal"}
            </Select.Trigger>
            <Select.Content>
              {#each blendModes as mode}
                <Select.Item value={mode.value}>{mode.label}</Select.Item>
              {/each}
            </Select.Content>
          </Select.Root>
        </div>
        <div class="pt-4">
          <label class="flex items-center gap-1 cursor-pointer nodrag">
            <input
              type="checkbox"
              checked={data.enabled !== false}
              onchange={(e) =>
                updateLayerSetting(
                  "enabled",
                  (e.target as HTMLInputElement).checked,
                )}
              class="nodrag"
            />
            <span class="text-[10px] text-neutral-400">On</span>
          </label>
        </div>
      </div>
    </div>

    <!-- Uniform Controls -->
    {#each controllableInputs as input (input.id)}
      {@const value = data.inputValues[input.id]}

      {#if input.dataType === "number" && input.values && input.labels}
        <!-- Long type with VALUES/LABELS - show as dropdown -->
        <div>
          <Label class="text-[10px] text-neutral-400 block mb-1">{input.label}</Label>
          <Select.Root
            type="single"
            value={String((value as number) ?? (input.defaultValue as number) ?? input.values[0])}
            onValueChange={(v) => updateInputValue(input.id, parseInt(v))}
          >
            <Select.Trigger
              class="h-6 text-xs bg-neutral-800 border-neutral-700 nodrag w-full"
            >
              {input.labels[input.values.indexOf((value as number) ?? (input.defaultValue as number) ?? input.values[0])] ?? `Value: ${value}`}
            </Select.Trigger>
            <Select.Content>
              {#each input.values as val, idx}
                <Select.Item value={String(val)}>{input.labels[idx] ?? val}</Select.Item>
              {/each}
            </Select.Content>
          </Select.Root>
        </div>
      {:else if input.dataType === "number"}
        <div>
          <div class="flex items-center justify-between mb-1">
            <Label class="text-[10px] text-neutral-400">{input.label}</Label>
            <span class="text-[9px] font-mono text-neutral-500">
              {typeof value === "number" ? value.toFixed(3) : value}
            </span>
          </div>
          <RangeSlider
            value={(value as number) ?? (input.defaultValue as number) ?? 0}
            min={input.min ?? 0}
            max={input.max ?? 1}
            step={(input.max ?? 1) - (input.min ?? 0) > 10 ? 1 : 0.001}
            oninput={(e) => {
              const val = parseFloat((e.target as HTMLInputElement).value);
              const node = nodeGraph.getNode(props.id);
              if (node && node.data.inputValues) {
                node.data.inputValues[input.id] = val;
              }
            }}
            onchange={(e) => updateInputValue(input.id, parseFloat((e.target as HTMLInputElement).value))}
            />
        </div>
      {:else if input.dataType === "color"}
        <div>
          <Label class="text-[10px] text-neutral-400 block mb-1"
            >{input.label}</Label
          >
          <input
            type="color"
            value={`#${((value as number[]) ?? [1, 1, 1, 1])
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
              updateInputValue(input.id, [r, g, b, 1]);
            }}
            class="w-full h-6 rounded cursor-pointer nodrag"
          />
        </div>
      {:else if input.dataType === "boolean"}
        <div class="flex items-center justify-between">
          <Label class="text-[10px] text-neutral-400">{input.label}</Label>
          <input
            type="checkbox"
            checked={(value as boolean) ?? false}
            onchange={(e) =>
              updateInputValue(
                input.id,
                (e.target as HTMLInputElement).checked,
              )}
            class="nodrag"
          />
        </div>
      {:else if input.dataType === "vec2"}
        <div>
          <Label class="text-[10px] text-neutral-400 block mb-1"
            >{input.label}</Label
          >
          <div class="grid grid-cols-2 gap-1">
            <Input
              type="number"
              value={((value as number[]) ?? [0, 0])[0]}
              step={0.01}
              oninput={(e) => {
                const vec = (value as number[]) ?? [0, 0];
                updateInputValue(input.id, [
                  parseFloat((e.target as HTMLInputElement).value) || 0,
                  vec[1],
                ]);
              }}
              class="h-6 text-xs bg-neutral-800 border-neutral-700 nodrag"
              placeholder="X"
            />
            <Input
              type="number"
              value={((value as number[]) ?? [0, 0])[1]}
              step={0.01}
              oninput={(e) => {
                const vec = (value as number[]) ?? [0, 0];
                updateInputValue(input.id, [
                  vec[0],
                  parseFloat((e.target as HTMLInputElement).value) || 0,
                ]);
              }}
              class="h-6 text-xs bg-neutral-800 border-neutral-700 nodrag"
              placeholder="Y"
            />
          </div>
        </div>
      {/if}
    {/each}

    {#if data.metadata?.description}
      <p class="text-[9px] text-neutral-500 italic mt-2">
        {data.metadata.description}
      </p>
    {/if}
  </div>
</BaseNode>


