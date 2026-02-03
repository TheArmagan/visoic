<script lang="ts">
  import { onDestroy } from "svelte";
  import { useSvelteFlow, useEdges } from "@xyflow/svelte";
  import type { MathNodeData } from "$lib/api/nodes/types";
  import { nodeGraph } from "$lib/api/nodes";
  import BaseNode from "./BaseNode.svelte";
  import { Input } from "$lib/components/ui/input";

  interface Props {
    id: string;
    data: MathNodeData;
    selected?: boolean;
  }

  let props: Props = $props();

  // Use subscription-based updates instead of polling for better performance
  let liveData = $state<MathNodeData>(props.data);

  // Subscribe to this specific node's updates
  const unsubscribe = nodeGraph.subscribeToNode(props.id, (newData) => {
    liveData = newData as MathNodeData;
  });

  onDestroy(() => {
    unsubscribe();
  });

  // Use live data for display
  const data = $derived(liveData);

  const { updateNodeData } = useSvelteFlow();
  const edges = useEdges();

  const operationSymbols: Record<string, string> = {
    add: "+",
    subtract: "−",
    multiply: "×",
    divide: "÷",
    power: "^",
    sqrt: "√",
    abs: "|x|",
    sin: "sin",
    cos: "cos",
    tan: "tan",
    min: "min",
    max: "max",
    clamp: "⊏⊐",
    lerp: "↔",
    map: "→",
  };

  const result = $derived(data.outputValues?.result ?? 0);

  // Compute connected inputs reactively
  const connectedInputs = $derived(
    new Set(
      edges.current
        .filter((e) => e.target === props.id)
        .map((e) => e.targetHandle),
    ),
  );

  // Update input value
  function updateInputValue(inputId: string, value: number) {
    const newInputValues = { ...data.inputValues, [inputId]: value };
    // Update nodeGraph for runtime directly (no listener notification to avoid loop)
    const node = nodeGraph.getNode(props.id);
    if (node) {
      node.data.inputValues = newInputValues;
    }
    // Update SvelteFlow for UI
    updateNodeData(props.id, { inputValues: newInputValues });
  }

  // Get default value for an input
  function getInputDefault(inputId: string): number {
    const input = data.inputs.find((i) => i.id === inputId);
    return (input?.defaultValue as number) ?? 0;
  }
</script>

<BaseNode {...props}>
  <div class="flex flex-col gap-2 min-w-20">
    <!-- Operation symbol -->
    <div class="flex items-center justify-center">
      <span class="text-lg font-bold text-neutral-300">
        {operationSymbols[data.operation] ?? data.operation}
      </span>
    </div>

    <!-- Input fields - show only if not connected -->
    <div class="space-y-1">
      {#each data.inputs as input (input.id)}
        {#if !connectedInputs.has(input.id)}
          <div class="flex items-center gap-1">
            <span class="text-[10px] text-neutral-500 w-8 truncate"
              >{input.label}</span
            >
            <Input
              type="number"
              value={(data.inputValues?.[input.id] ??
                getInputDefault(input.id)) as number}
              step={0.1}
              oninput={(e) =>
                updateInputValue(
                  input.id,
                  parseFloat((e.target as HTMLInputElement).value) || 0,
                )}
              class="h-5 text-[10px] bg-neutral-800 border-neutral-700 nodrag px-1 flex-1"
            />
          </div>
        {/if}
      {/each}
    </div>

    <!-- Result -->
    <div class="text-center border-t border-neutral-700 pt-1">
      <span class="text-[10px] text-neutral-500 font-mono">
        = {typeof result === "number" ? result.toFixed(3) : result}
      </span>
    </div>
  </div>
</BaseNode>
