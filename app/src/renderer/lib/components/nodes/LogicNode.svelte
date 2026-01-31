<script lang="ts">
  import { useSvelteFlow, useEdges } from "@xyflow/svelte";
  import type { LogicNodeData, DataType } from "$lib/api/nodes/types";
  import { DATA_TYPE_INFO } from "$lib/api/nodes/types";
  import { nodeGraph, useNodeData } from "$lib/api/nodes";
  import BaseNode from "./BaseNode.svelte";
  import * as Select from "$lib/components/ui/select";
  import { Label } from "$lib/components/ui/label";
  import { Input } from "$lib/components/ui/input";
  import { cn } from "$lib/utils";

  interface Props {
    id: string;
    data: LogicNodeData;
    selected?: boolean;
  }

  let props: Props = $props();

  // Subscribe to this node's data changes for reactive updates
  const nodeData = useNodeData<LogicNodeData>(props.id);
  const data = $derived(nodeData.data ?? props.data);

  const { updateNodeData } = useSvelteFlow();
  const edges = useEdges();

  // Compute connected inputs reactively
  const connectedInputs = $derived(
    new Set(
      edges.current
        .filter((e) => e.target === props.id)
        .map((e) => e.targetHandle)
    )
  );

  // Helper to update both nodeGraph and SvelteFlow
  function updateData(updates: Partial<LogicNodeData>) {
    const node = nodeGraph.getNode(props.id);
    if (node) {
      Object.assign(node.data, updates);
    }
    updateNodeData(props.id, updates);
  }

  // Update input value
  function updateInputValue(inputId: string, value: number) {
    const newInputValues = { ...data.inputValues, [inputId]: value };
    const node = nodeGraph.getNode(props.id);
    if (node) {
      node.data.inputValues = newInputValues;
    }
    updateNodeData(props.id, { inputValues: newInputValues });
  }

  // Get default value for an input
  function getInputDefault(inputId: string): number {
    const input = data.inputs.find((i) => i.id === inputId);
    return (input?.defaultValue as number) ?? 0;
  }

  const compareOperators = [
    { value: "==", label: "=" },
    { value: "!=", label: "≠" },
    { value: "<", label: "<" },
    { value: ">", label: ">" },
    { value: "<=", label: "≤" },
    { value: ">=", label: "≥" },
  ];

  const outputTypes: { value: DataType; label: string }[] = [
    { value: "number", label: "Number" },
    { value: "boolean", label: "Boolean" },
    { value: "string", label: "String" },
    { value: "vec2", label: "Vec2" },
    { value: "vec3", label: "Vec3" },
    { value: "vec4", label: "Vec4" },
    { value: "color", label: "Color" },
    { value: "any", label: "Any" },
  ];

  const result = $derived(data.outputValues?.result);
</script>

<BaseNode {...props}>
  {#if data.logicType === "compare"}
    <div class="space-y-2">
      <!-- Input A - show if not connected -->
      {#if !connectedInputs.has("a")}
        <div class="flex items-center gap-1">
          <span class="text-[10px] text-neutral-500 w-6">A</span>
          <Input
            type="number"
            value={(data.inputValues?.a ?? getInputDefault("a")) as number}
            step={0.1}
            oninput={(e) =>
              updateInputValue("a", parseFloat((e.target as HTMLInputElement).value) || 0)}
            class="h-5 text-[10px] bg-neutral-800 border-neutral-700 nodrag px-1 flex-1"
          />
        </div>
      {/if}

      <Select.Root
        type="single"
        value={data.compareOp ?? "=="}
        onValueChange={(v) =>
          updateData({
            compareOp: v as LogicNodeData["compareOp"],
          })}
      >
        <Select.Trigger
          class="h-8 text-lg font-bold bg-neutral-800 border-neutral-700 nodrag"
        >
          {compareOperators.find((o) => o.value === data.compareOp)
            ?.label ?? "="}
        </Select.Trigger>
        <Select.Content>
          {#each compareOperators as op}
            <Select.Item value={op.value} class="text-lg"
              >{op.label}</Select.Item
            >
          {/each}
        </Select.Content>
      </Select.Root>

      <!-- Input B - show if not connected -->
      {#if !connectedInputs.has("b")}
        <div class="flex items-center gap-1">
          <span class="text-[10px] text-neutral-500 w-6">B</span>
          <Input
            type="number"
            value={(data.inputValues?.b ?? getInputDefault("b")) as number}
            step={0.1}
            oninput={(e) =>
              updateInputValue("b", parseFloat((e.target as HTMLInputElement).value) || 0)}
            class="h-5 text-[10px] bg-neutral-800 border-neutral-700 nodrag px-1 flex-1"
          />
        </div>
      {/if}

      <div class="text-center">
        <span
          class={cn(
            "inline-block px-2 py-0.5 rounded text-xs font-mono",
            result === true && "bg-green-500/20 text-green-400",
            result === false && "bg-red-500/20 text-red-400",
          )}
        >
          {result ? "TRUE" : "FALSE"}
        </span>
      </div>
    </div>
  {:else if data.logicType === "select"}
    <div class="space-y-2">
      <Label class="text-[10px] text-neutral-400">Output Type</Label>
      <Select.Root
        type="single"
        value={data.outputDataType ?? "any"}
        onValueChange={(v) => {
          const newType = v as DataType;
          updateData({
            outputDataType: newType,
            outputs: data.outputs.map((o) =>
              o.id === "result" ? { ...o, dataType: newType } : o,
            ),
          });
        }}
      >
        <Select.Trigger
          class="h-7 text-xs bg-neutral-800 border-neutral-700 nodrag"
        >
          <span
            class="inline-block w-2 h-2 rounded-full mr-2"
            style="background-color: {DATA_TYPE_INFO[
              data.outputDataType ?? 'any'
            ].color}"
          ></span>
          {DATA_TYPE_INFO[data.outputDataType ?? "any"].label}
        </Select.Trigger>
        <Select.Content>
          {#each outputTypes as type}
            <Select.Item value={type.value}>
              <span
                class="inline-block w-2 h-2 rounded-full mr-2"
                style="background-color: {DATA_TYPE_INFO[type.value].color}"
              ></span>
              {type.label}
            </Select.Item>
          {/each}
        </Select.Content>
      </Select.Root>
      <div class="text-center">
        <span class="text-[10px] text-neutral-500 font-mono">
          = {JSON.stringify(result)}
        </span>
      </div>
    </div>
  {:else if data.logicType === "and" || data.logicType === "or"}
    <div class="flex flex-col items-center gap-1">
      <span class="text-xl font-bold text-neutral-300">
        {data.logicType === "and" ? "∧" : "∨"}
      </span>
      <span
        class={cn(
          "inline-block px-2 py-0.5 rounded text-xs font-mono",
          result === true && "bg-green-500/20 text-green-400",
          result === false && "bg-red-500/20 text-red-400",
        )}
      >
        {result ? "TRUE" : "FALSE"}
      </span>
    </div>
  {:else if data.logicType === "not"}
    <div class="flex flex-col items-center gap-1">
      <span class="text-xl font-bold text-neutral-300">¬</span>
      <span
        class={cn(
          "inline-block px-2 py-0.5 rounded text-xs font-mono",
          result === true && "bg-green-500/20 text-green-400",
          result === false && "bg-red-500/20 text-red-400",
        )}
      >
        {result ? "TRUE" : "FALSE"}
      </span>
    </div>
  {/if}
</BaseNode>
