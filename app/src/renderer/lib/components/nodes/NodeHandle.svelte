<script lang="ts">
  import { Handle, Position, type Connection } from "@xyflow/svelte";
  import type { HandleDefinition, DataType } from "$lib/api/nodes/types";
  import { DATA_TYPE_INFO, isConnectionValid } from "$lib/api/nodes/types";
  import { cn } from "$lib/utils";

  interface Props {
    handle: HandleDefinition;
    type: "source" | "target";
    position?: Position;
    showLabel?: boolean;
    class?: string;
  }

  let {
    handle,
    type,
    position = type === "source" ? Position.Right : Position.Left,
    showLabel = true,
    class: className,
  }: Props = $props();

  const typeInfo = $derived(DATA_TYPE_INFO[handle.dataType]);
</script>

<div
  class={cn(
    "relative flex items-center h-5",
    type === "source" ? "flex-row-reverse" : "flex-row",
    className,
  )}
>
  <Handle
    {type}
    {position}
    id={handle.id}
    class="!w-3 !h-3 !rounded-full !border-2 !border-neutral-800 !transition-all hover:!scale-125"
    style="background-color: {typeInfo.color};"
  />

  {#if showLabel}
    <span
      class={cn(
        "text-[10px] font-medium text-neutral-400 whitespace-nowrap",
        type === "source" ? "mr-2" : "ml-2",
      )}
    >
      {handle.label}
    </span>
  {/if}
</div>

<style>
  :global(.svelte-flow__handle.connecting) {
    animation: pulse 0.5s ease-in-out infinite;
  }

  :global(.svelte-flow__handle.valid) {
    box-shadow: 0 0 8px currentColor;
  }

  @keyframes pulse {
    0%,
    100% {
      transform: scale(1);
    }
    50% {
      transform: scale(1.3);
    }
  }
</style>
