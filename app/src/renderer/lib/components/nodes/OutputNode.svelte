<script lang="ts">
  import { useSvelteFlow } from "@xyflow/svelte";
  import type { OutputNodeData } from "$lib/api/nodes/types";
  import { nodeGraph, outputRuntime } from "$lib/api/nodes";
  import BaseNode from "./BaseNode.svelte";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import { Switch } from "$lib/components/ui/switch";
  import { Button } from "$lib/components/ui/button";
  import { RangeSlider } from "$lib/components/ui/range-slider";

  interface Props {
    id: string;
    data: OutputNodeData;
    selected?: boolean;
  }

  let props: Props = $props();
  let isWindowOpen = $state(false);

  // Use props.data directly - SvelteFlow handles reactivity
  const data = $derived(props.data);

  const { updateNodeData } = useSvelteFlow();

  // Track window state
  $effect(() => {
    const checkState = () => {
      isWindowOpen = outputRuntime.isWindowOpen(props.id);
    };
    checkState();
    const interval = setInterval(checkState, 500);
    return () => clearInterval(interval);
  });

  function openWindow() {
    outputRuntime.openWindow(props.id);
    isWindowOpen = true;
  }

  function closeWindow() {
    outputRuntime.closeWindow(props.id);
    isWindowOpen = false;
  }

  function toggleFullscreen() {
    outputRuntime.toggleFullscreen(props.id);
  }

  function updateWindowConfig(key: string, value: unknown) {
    const updates = {
      windowConfig: {
        ...data.windowConfig,
        [key]: value,
      },
    };
    // Update nodeGraph for runtime
    nodeGraph.updateNodeDataSilent(props.id, updates);
    // Update SvelteFlow for UI
    updateNodeData(props.id, updates);
  }

  function updateRenderConfig(key: string, value: unknown) {
    const updates = {
      renderConfig: {
        ...data.renderConfig,
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
  <div class="flex flex-col items-center gap-2">
    {#if data.outputType === "canvas"}
      <div
        class="w-full aspect-video bg-neutral-800 rounded border border-neutral-700 flex items-center justify-center"
      >
        <span class="text-2xl">📺</span>
      </div>
      <span class="text-[10px] text-neutral-500">
        Canvas: {data.canvasId ?? "main"}
      </span>
    {:else if data.outputType === "preview"}
      <div
        class="w-full aspect-video bg-neutral-800 rounded border border-neutral-700 flex items-center justify-center"
      >
        <span class="text-2xl">👁️</span>
      </div>
      <span class="text-[10px] text-neutral-500">Preview</span>
    {:else if data.outputType === "window"}
      <div class="space-y-2 w-full">
        <!-- Window preview with status indicator -->
        <div
          class="w-full aspect-video bg-neutral-800 rounded border flex items-center justify-center relative {isWindowOpen
            ? 'border-green-500'
            : 'border-neutral-700'}"
        >
          <span class="text-2xl">🪟</span>
          {#if isWindowOpen}
            <div
              class="absolute top-1 right-1 w-2 h-2 rounded-full bg-green-500 animate-pulse"
            ></div>
          {/if}
        </div>

        <!-- Open/Close/Fullscreen buttons -->
        <div class="flex gap-1 w-full">
          {#if isWindowOpen}
            <Button
              variant="destructive"
              size="sm"
              class="flex-1 h-7 text-xs nodrag"
              onclick={closeWindow}
            >
              <svg
                class="w-3 h-3 mr-1"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                <line x1="8" y1="21" x2="16" y2="21" />
                <line x1="12" y1="17" x2="12" y2="21" />
                <line x1="4" y1="7" x2="20" y2="14" />
                <line x1="4" y1="14" x2="20" y2="7" />
              </svg>
              Close
            </Button>
            <Button
              variant="secondary"
              size="sm"
              class="h-7 text-xs nodrag"
              onclick={toggleFullscreen}
              title="Toggle Fullscreen (F11)"
            >
              <svg
                class="w-3 h-3"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <polyline points="15,3 21,3 21,9" />
                <polyline points="9,21 3,21 3,15" />
                <line x1="21" y1="3" x2="14" y2="10" />
                <line x1="3" y1="21" x2="10" y2="14" />
              </svg>
            </Button>
          {:else}
            <Button
              variant="default"
              size="sm"
              class="flex-1 h-7 text-xs bg-green-600 hover:bg-green-700 nodrag"
              onclick={openWindow}
            >
              <svg
                class="w-3 h-3 mr-1"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                <line x1="8" y1="21" x2="16" y2="21" />
                <line x1="12" y1="17" x2="12" y2="21" />
              </svg>
              Open Window
            </Button>
          {/if}
        </div>

        <div>
          <Label class="text-[10px] text-neutral-400">Title</Label>
          <Input
            type="text"
            value={data.windowConfig?.title ?? "Output Window"}
            oninput={(e) =>
              updateWindowConfig("title", (e.target as HTMLInputElement).value)}
            class="h-6 text-xs bg-neutral-800 border-neutral-700 nodrag"
            disabled={isWindowOpen}
          />
        </div>
        <div class="grid grid-cols-2 gap-2">
          <div>
            <Label class="text-[10px] text-neutral-400">Width</Label>
            <Input
              type="number"
              value={data.windowConfig?.width ?? 1920}
              oninput={(e) =>
                updateWindowConfig(
                  "width",
                  parseInt((e.target as HTMLInputElement).value) || 1920,
                )}
              class="h-6 text-xs bg-neutral-800 border-neutral-700 nodrag"
              disabled={isWindowOpen}
            />
          </div>
          <div>
            <Label class="text-[10px] text-neutral-400">Height</Label>
            <Input
              type="number"
              value={data.windowConfig?.height ?? 1080}
              oninput={(e) =>
                updateWindowConfig(
                  "height",
                  parseInt((e.target as HTMLInputElement).value) || 1080,
                )}
              class="h-6 text-xs bg-neutral-800 border-neutral-700 nodrag"
              disabled={isWindowOpen}
            />
          </div>
        </div>
        <div class="flex items-center gap-2">
          <Switch
            checked={data.windowConfig?.fullscreen ?? false}
            onCheckedChange={(v) => updateWindowConfig("fullscreen", v)}
            class="nodrag"
            disabled={isWindowOpen}
          />
          <Label class="text-[10px] text-neutral-400">Fullscreen</Label>
        </div>
        <div>
          <Label class="text-[10px] text-neutral-400">
            Monitor: {data.windowConfig?.monitor ?? 0}
          </Label>
          <RangeSlider
            value={data.windowConfig?.monitor ?? 0}
            min={0}
            max={4}
            step={1}
            oninput={(e) => {
              const val = parseInt((e.target as HTMLInputElement).value);
              const node = nodeGraph.getNode(props.id);
              if (node && node.data.windowConfig) {
                node.data.windowConfig.monitor = val;
              }
            }}
            onchange={(e) => updateWindowConfig("monitor", parseInt((e.target as HTMLInputElement).value))}
            class="nodrag w-full h-2 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-white"
            disabled={isWindowOpen}
          />
        </div>
        <div>
          <Label class="text-[10px] text-neutral-400">
            FPS Limit: {data.renderConfig?.fps ?? 60}
          </Label>
          <RangeSlider
            value={data.renderConfig?.fps ?? 60}
            min={1}
            max={240}
            step={1}
            oninput={(e) => {
              const val = parseInt((e.target as HTMLInputElement).value);
              const node = nodeGraph.getNode(props.id);
              if (node && node.data.renderConfig) {
                node.data.renderConfig.fps = val;
              }
            }}
            onchange={(e) => updateRenderConfig("fps", parseInt((e.target as HTMLInputElement).value))}
            />
        </div>
        <div class="flex items-center gap-2">
          <Switch
            checked={data.renderConfig?.showFps ?? false}
            onCheckedChange={(v) => updateRenderConfig("showFps", v)}
            class="nodrag"
          />
          <Label class="text-[10px] text-neutral-400">Show FPS</Label>
        </div>
      </div>
    {:else if data.outputType === "ndi"}
      <div class="space-y-2 w-full">
        <div
          class="w-full aspect-video bg-linear-to-br from-blue-900/50 to-purple-900/50 rounded border border-blue-700 flex items-center justify-center"
        >
          <span class="text-xl font-bold text-blue-400">NDI</span>
        </div>
        <div>
          <Label class="text-[10px] text-neutral-400">Stream Name</Label>
          <Input
            type="text"
            value={data.windowConfig?.title ?? "Visoic Output"}
            oninput={(e) =>
              updateWindowConfig("title", (e.target as HTMLInputElement).value)}
            class="h-6 text-xs bg-neutral-800 border-neutral-700 nodrag"
          />
        </div>
        <div>
          <Label class="text-[10px] text-neutral-400">
            FPS: {data.renderConfig?.fps ?? 60}
          </Label>
          <RangeSlider
            value={data.renderConfig?.fps ?? 60}
            min={24}
            max={120}
            step={1}
            oninput={(e) => {
              const val = parseInt((e.target as HTMLInputElement).value);
              const node = nodeGraph.getNode(props.id);
              if (node && node.data.renderConfig) {
                node.data.renderConfig.fps = val;
              }
            }}
            onchange={(e) => updateRenderConfig("fps", parseInt((e.target as HTMLInputElement).value))}
            />
        </div>
        <span class="text-[10px] text-blue-400">
          Resolution: {data.windowConfig?.width ?? 1920}×{data
            .windowConfig?.height ?? 1080}
        </span>
      </div>
    {:else if data.outputType === "spout"}
      <div class="space-y-2 w-full">
        <div
          class="w-full aspect-video bg-linear-to-br from-green-900/50 to-emerald-900/50 rounded border border-green-700 flex items-center justify-center"
        >
          <span class="text-xl font-bold text-green-400">Spout</span>
        </div>
        <div>
          <Label class="text-[10px] text-neutral-400">Sender Name</Label>
          <Input
            type="text"
            value={data.windowConfig?.title ?? "Visoic"}
            oninput={(e) =>
              updateWindowConfig("title", (e.target as HTMLInputElement).value)}
            class="h-6 text-xs bg-neutral-800 border-neutral-700 nodrag"
          />
        </div>
        <span class="text-[10px] text-green-400">
          Resolution: {data.windowConfig?.width ?? 1920}×{data
            .windowConfig?.height ?? 1080}
        </span>
      </div>
    {:else}
      <div
        class="w-full aspect-video bg-neutral-800 rounded border border-neutral-700 flex items-center justify-center"
      >
        <span class="text-2xl">💾</span>
      </div>
      <span class="text-[10px] text-neutral-500">Export</span>
    {/if}
  </div>
</BaseNode>


