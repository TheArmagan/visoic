<script lang="ts">
  import { useSvelteFlow } from "@xyflow/svelte";
  import type { LogicNodeData, DataType } from "$lib/api/nodes/types";
  import { DATA_TYPE_INFO } from "$lib/api/nodes/types";
  import BaseNode from "./BaseNode.svelte";
  import * as Select from "$lib/components/ui/select";
  import { Label } from "$lib/components/ui/label";
  import { cn } from "$lib/utils";

  interface Props {
    id: string;
    data: LogicNodeData;
    selected?: boolean;
  }

  let props: Props = $props();

  const { updateNodeData } = useSvelteFlow();

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

  const result = $derived(props.data.outputValues?.result);
</script>

<BaseNode {...props}>
  {#if props.data.logicType === "compare"}
    <div class="space-y-2">
      <Select.Root
        type="single"
        value={props.data.compareOp ?? "=="}
        onValueChange={(v) =>
          updateNodeData(props.id, {
            compareOp: v as LogicNodeData["compareOp"],
          })}
      >
        <Select.Trigger
          class="h-8 text-lg font-bold bg-neutral-800 border-neutral-700 nodrag"
        >
          {compareOperators.find((o) => o.value === props.data.compareOp)
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
  {:else if props.data.logicType === "select"}
    <div class="space-y-2">
      <Label class="text-[10px] text-neutral-400">Output Type</Label>
      <Select.Root
        type="single"
        value={props.data.outputDataType ?? "any"}
        onValueChange={(v) => {
          const newType = v as DataType;
          updateNodeData(props.id, {
            outputDataType: newType,
            outputs: props.data.outputs.map((o) =>
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
              props.data.outputDataType ?? 'any'
            ].color}"
          ></span>
          {DATA_TYPE_INFO[props.data.outputDataType ?? "any"].label}
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
  {:else if props.data.logicType === "and" || props.data.logicType === "or"}
    <div class="flex flex-col items-center gap-1">
      <span class="text-xl font-bold text-neutral-300">
        {props.data.logicType === "and" ? "∧" : "∨"}
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
  {:else if props.data.logicType === "not"}
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
