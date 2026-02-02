<script lang="ts">
  import type { Snippet } from "svelte";
  import type { AnyNodeData, HandleDefinition } from "$lib/api/nodes/types";
  import { NODE_CATEGORIES } from "$lib/api/nodes/types";
  import NodeHandle from "./NodeHandle.svelte";
  import { cn } from "$lib/utils";
  import { getNodeEditorContext } from "./node-context";

  interface Props {
    id: string;
    data: AnyNodeData;
    selected?: boolean;
    children?: Snippet;
    headerExtra?: Snippet;
    class?: string;
  }

  let {
    id,
    data,
    selected,
    children,
    headerExtra,
    class: className,
  }: Props = $props();

  const categoryInfo = $derived(NODE_CATEGORIES[data.category]);
  const editorContext = getNodeEditorContext();

  function handleOutputDoubleClick(
    handle: HandleDefinition,
    event: MouseEvent,
  ) {
    editorContext?.onOutputHandleDoubleClick?.(id, handle, event);
  }
</script>

<div
  class={cn(
    "min-w-[180px] rounded-lg border shadow-lg transition-all",
    "bg-neutral-900",
    selected
      ? "border-white/30 shadow-xl ring-2 ring-white/10"
      : "border-neutral-700/50",
    data.hasError && "border-red-500/50",
    data.bypassed && "opacity-50",
    className,
  )}
>
  <!-- Header -->
  <div
    class="flex items-center gap-2 px-3 py-2 rounded-t-lg border-b border-neutral-700/50"
    style="background: linear-gradient(135deg, {categoryInfo.color}20 0%, transparent 100%);"
  >
    <span class="text-sm">{categoryInfo.icon}</span>
    <span class="text-xs font-semibold text-white truncate flex-1">
      {data.label}
    </span>
    {#if headerExtra}
      {@render headerExtra()}
    {/if}
  </div>

  <!-- Content -->
  <div class="relative px-0 py-2">
    <!-- Inputs (left side) -->
    {#if data.inputs.length > 0}
      <div class="flex flex-col gap-1 mb-2">
        {#each data.inputs as input (input.id)}
          <NodeHandle handle={input} type="target" />
        {/each}
      </div>
    {/if}

    <!-- Custom Content -->
    {#if children}
      <div class="px-3 py-1">
        {@render children()}
      </div>
    {/if}

    <!-- Outputs (right side) -->
    {#if data.outputs.length > 0}
      <div class="flex flex-col gap-1 mt-2">
        {#each data.outputs as output (output.id)}
          <div class="flex justify-end">
            <NodeHandle
              handle={output}
              type="source"
              onHandleDoubleClick={handleOutputDoubleClick}
            />
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <!-- Error indicator -->
  {#if data.hasError}
    <div
      class="px-3 py-1 text-[10px] text-red-400 bg-red-500/10 border-t border-red-500/20 rounded-b-lg"
    >
      {data.errorMessage ?? "Error"}
    </div>
  {/if}
</div>
