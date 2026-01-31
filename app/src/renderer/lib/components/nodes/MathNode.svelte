<script lang="ts">
  import type { MathNodeData } from "$lib/api/nodes/types";
  import BaseNode from "./BaseNode.svelte";

  interface Props {
    id: string;
    data: MathNodeData;
    selected?: boolean;
  }

  let props: Props = $props();

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

  const result = $derived(props.data.outputValues?.result ?? 0);
</script>

<BaseNode {...props}>
  <div class="flex flex-col items-center gap-1">
    <span class="text-lg font-bold text-neutral-300">
      {operationSymbols[props.data.operation] ?? props.data.operation}
    </span>
    <span class="text-[10px] text-neutral-500 font-mono">
      = {typeof result === "number" ? result.toFixed(3) : result}
    </span>
  </div>
</BaseNode>
