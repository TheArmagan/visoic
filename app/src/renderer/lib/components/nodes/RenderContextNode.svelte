<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import type { RenderContextNodeData } from "$lib/api/nodes/types";
  import { renderContextRuntime, nodeGraph } from "$lib/api/nodes";
  import BaseNode from "./BaseNode.svelte";
  import { Label } from "$lib/components/ui/label";
  import { Input } from "$lib/components/ui/input";
  import { useSvelteFlow } from "@xyflow/svelte";

  interface Props {
    id: string;
    data: RenderContextNodeData;
    selected?: boolean;
  }

  let props: Props = $props();

  // Reactive data state - poll from nodeGraph for real-time updates
  let liveData = $state<RenderContextNodeData>(props.data);
  let updateInterval: ReturnType<typeof setInterval> | null = null;

  onMount(() => {
    // Create context when mounted
    renderContextRuntime.createContext(props.id);

    // Poll for updates at 20fps
    updateInterval = setInterval(() => {
      const node = nodeGraph.getNode(props.id);
      if (node) {
        liveData = node.data as RenderContextNodeData;
      }
    }, 50);
  });

  onDestroy(() => {
    if (updateInterval) clearInterval(updateInterval);
  });

  // Use live data for display
  const data = $derived(liveData);

  const { updateNodeData } = useSvelteFlow();

  function updateConfig(key: string, value: number) {
    const updates = {
      [key]: value,
      inputValues: {
        ...data.inputValues,
        [key]: value,
      },
    };
    // Update nodeGraph for runtime
    nodeGraph.updateNodeDataSilent(props.id, updates);
    // Update SvelteFlow for UI
    updateNodeData(props.id, updates);
  }
</script>

<BaseNode {...props}>
  {#snippet headerExtra()}
    <span class="text-[9px] px-1.5 py-0.5 bg-pink-500/20 text-pink-300 rounded">
      Renderer
    </span>
  {/snippet}

  <div class="space-y-2">
    <!-- Resolution Controls -->
    <div class="grid grid-cols-2 gap-2">
      <div>
        <Label class="text-[10px] text-neutral-400">Width</Label>
        <Input
          type="number"
          value={data.width}
          step={1}
          min={64}
          max={7680}
          oninput={(e) =>
            updateConfig(
              "width",
              parseInt((e.target as HTMLInputElement).value) || 1920,
            )}
          class="h-6 text-xs bg-neutral-800 border-neutral-700 nodrag"
        />
      </div>
      <div>
        <Label class="text-[10px] text-neutral-400">Height</Label>
        <Input
          type="number"
          value={data.height}
          step={1}
          min={64}
          max={4320}
          oninput={(e) =>
            updateConfig(
              "height",
              parseInt((e.target as HTMLInputElement).value) || 1080,
            )}
          class="h-6 text-xs bg-neutral-800 border-neutral-700 nodrag"
        />
      </div>
    </div>

    <!-- FPS Limit -->
    <div>
      <Label class="text-[10px] text-neutral-400">FPS Limit</Label>
      <Input
        type="number"
        value={data.fpsLimit}
        step={1}
        min={1}
        max={240}
        oninput={(e) =>
          updateConfig(
            "fpsLimit",
            parseInt((e.target as HTMLInputElement).value) || 60,
          )}
        class="h-6 text-xs bg-neutral-800 border-neutral-700 nodrag"
      />
    </div>

    <p class="text-[9px] text-neutral-500">
      Connect shader nodes to this context to render layers.
    </p>
  </div>
</BaseNode>
