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
  let previewCanvas: HTMLCanvasElement | null = $state(null);
  let animationFrameId: number | null = null;
  let lastRenderTime = 0;
  const PREVIEW_FPS = 15; // Low fps for preview - doesn't need to be smooth
  const PREVIEW_INTERVAL = 1000 / PREVIEW_FPS;

  const { updateNodeData } = useSvelteFlow();

  // Create context when mounted
  onMount(async () => {
    await renderContextRuntime.createContext(props.id);
    startPreviewLoop();
  });

  onDestroy(() => {
    stopPreviewLoop();
    // Note: Don't destroy context here - runtime manages lifecycle
  });

  function startPreviewLoop() {
    if (animationFrameId !== null) return;

    function renderPreview(timestamp: number) {
      // Throttle to PREVIEW_FPS
      if (timestamp - lastRenderTime < PREVIEW_INTERVAL) {
        animationFrameId = requestAnimationFrame(renderPreview);
        return;
      }
      lastRenderTime = timestamp;

      const sourceCanvas = renderContextRuntime.getCanvas(props.id);
      if (sourceCanvas && previewCanvas) {
        const ctx = previewCanvas.getContext("2d");
        if (ctx) {
          // Scale down for preview
          ctx.drawImage(
            sourceCanvas,
            0,
            0,
            sourceCanvas.width,
            sourceCanvas.height,
            0,
            0,
            previewCanvas.width,
            previewCanvas.height,
          );
        }
      }
      animationFrameId = requestAnimationFrame(renderPreview);
    }

    animationFrameId = requestAnimationFrame(renderPreview);
  }

  function stopPreviewLoop() {
    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
  }

  function updateConfig(key: string, value: number) {
    const updates = {
      [key]: value,
      inputValues: {
        ...props.data.inputValues,
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
    <div class="flex items-center gap-1">
      <span
        class="text-[9px] px-1.5 py-0.5 bg-fuchsia-500/20 text-fuchsia-300 rounded"
      >
        Context
      </span>
      {#if props.data.isRunning}
        <span class="text-[9px] text-green-400">
          {props.data.currentFps?.toFixed(0) ?? 0} FPS
        </span>
      {:else}
        <span class="text-[9px] text-yellow-400">Stopped</span>
      {/if}
    </div>
  {/snippet}

  <div class="space-y-2">
    <!-- Preview Canvas -->
    <div
      class="bg-black rounded overflow-hidden"
      style="aspect-ratio: 16 / 9; width: 100%;"
    >
      <canvas
        bind:this={previewCanvas}
        width="192"
        height="108"
        class="w-full h-full"
      ></canvas>
    </div>

    <!-- Resolution Controls -->
    <div class="grid grid-cols-2 gap-2">
      <div>
        <Label class="text-[10px] text-neutral-400">Width</Label>
        <Input
          type="number"
          value={props.data.width}
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
          value={props.data.height}
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
        value={props.data.fpsLimit}
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
