<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { useSvelteFlow } from "@xyflow/svelte";
  import type { MediaNodeData } from "$lib/api/nodes/types";
  import { nodeGraph } from "$lib/api/nodes";
  import BaseNode from "./BaseNode.svelte";
  import { Label } from "$lib/components/ui/label";
  import { Switch } from "$lib/components/ui/switch";
  import { RangeSlider } from "$lib/components/ui/range-slider";
  import { Button } from "$lib/components/ui/button";

  interface Props {
    id: string;
    data: MediaNodeData;
    selected?: boolean;
  }

  let props: Props = $props();

  // Native API type
  type NativeAPI = {
    media?: {
      showOpenDialog: (options: {
        type: "image" | "video";
      }) => Promise<{ canceled: boolean; filePaths: string[] }>;
      readFile: (filePath: string) => Promise<{
        success: boolean;
        data?: ArrayBuffer;
        mimeType?: string;
        error?: string;
      }>;
    };
  };

  const nativeAPI = (window as unknown as { VISOICNative?: NativeAPI })
    .VISOICNative;

  // Reactive data state - poll from nodeGraph for real-time updates
  let liveData = $state<MediaNodeData>(props.data);
  let updateInterval: ReturnType<typeof setInterval> | null = null;

  // Preview canvas and video element
  let previewCanvas = $state<HTMLCanvasElement | null>(null);
  let videoElement = $state<HTMLVideoElement | null>(null);
  let imageElement = $state<HTMLImageElement | null>(null);
  let blobUrl = $state<string | null>(null);
  let imageLoaded = $state(false);
  let videoLoaded = $state(false);

  onMount(() => {
    // Poll for updates at 20fps for smooth slider display
    updateInterval = setInterval(() => {
      const node = nodeGraph.getNode(props.id);
      if (node) {
        liveData = node.data as MediaNodeData;
      }
    }, 50);

    // Initialize video element if this is a video source
    if (props.data.mediaType === "video" && props.data.filePath) {
      loadVideo(props.data.filePath);
    }

    // Initialize image element if this is an image source
    if (props.data.mediaType === "image" && props.data.filePath) {
      loadImage(props.data.filePath);
    }
  });

  onDestroy(() => {
    if (updateInterval) clearInterval(updateInterval);
    if (videoElement) {
      videoElement.pause();
      videoElement.src = "";
    }
    // Revoke blob URL to free memory
    if (blobUrl) {
      URL.revokeObjectURL(blobUrl);
    }
  });

  // Use live data for display
  const data = $derived(liveData);
  const { updateNodeData } = useSvelteFlow();

  function updateSetting(key: string, value: unknown) {
    // Update nodeGraph for runtime
    nodeGraph.updateNodeDataSilent(props.id, { [key]: value });
    // Update SvelteFlow for UI
    updateNodeData(props.id, { [key]: value });
  }

  async function handleFileSelect() {
    try {
      const result = await nativeAPI?.media?.showOpenDialog({
        type: data.mediaType,
      });

      if (result && !result.canceled && result.filePaths.length > 0) {
        const filePath = result.filePaths[0];
        updateSetting("filePath", filePath);

        if (data.mediaType === "video") {
          loadVideo(filePath);
        } else {
          loadImage(filePath);
        }
      }
    } catch (e) {
      console.error("Failed to open file dialog:", e);
    }
  }

  async function loadVideo(filePath: string) {
    try {
      videoLoaded = false;

      // Read file via IPC
      const result = await nativeAPI?.media?.readFile(filePath);
      if (!result?.success || !result.data) {
        console.error("Failed to load video:", result?.error);
        return;
      }

      // Create blob URL from buffer
      const blob = new Blob([result.data], {
        type: result.mimeType || "video/mp4",
      });

      // Revoke old blob URL
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
      }
      blobUrl = URL.createObjectURL(blob);

      if (!videoElement) {
        videoElement = document.createElement("video");
        videoElement.playsInline = true;
        videoElement.muted = true;
      }

      videoElement.src = blobUrl;
      videoElement.loop = data.loop ?? true;
      videoElement.playbackRate = data.playbackSpeed ?? 1;
      videoElement.load();

      videoElement.onloadeddata = () => {
        updateSetting("width", videoElement!.videoWidth);
        updateSetting("height", videoElement!.videoHeight);
        updateSetting("_mediaElement", videoElement);
        videoLoaded = true;

        if (data.autoplay !== false) {
          videoElement!.play().catch(console.error);
        }
      };

      videoElement.ontimeupdate = () => {
        updatePreview();
      };
    } catch (e) {
      console.error("Failed to load video:", e);
    }
  }

  async function loadImage(filePath: string) {
    try {
      imageLoaded = false;

      // Read file via IPC
      const result = await nativeAPI?.media?.readFile(filePath);
      if (!result?.success || !result.data) {
        console.error("Failed to load image:", result?.error);
        return;
      }

      // Create blob URL from buffer
      const blob = new Blob([result.data], {
        type: result.mimeType || "image/png",
      });

      // Revoke old blob URL
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
      }
      blobUrl = URL.createObjectURL(blob);

      if (!imageElement) {
        imageElement = new Image();
      }

      imageElement.src = blobUrl;

      imageElement.onload = () => {
        updateSetting("width", imageElement!.naturalWidth);
        updateSetting("height", imageElement!.naturalHeight);
        updateSetting("_mediaElement", imageElement);
        imageLoaded = true;
      };
    } catch (e) {
      console.error("Failed to load image:", e);
    }
  }

  function updatePreview() {
    if (!previewCanvas) return;

    const ctx = previewCanvas.getContext("2d");
    if (!ctx) return;

    const source = data.mediaType === "video" ? videoElement : imageElement;
    if (!source) return;

    const width =
      (source as HTMLVideoElement).videoWidth ??
      (source as HTMLImageElement).naturalWidth;
    const height =
      (source as HTMLVideoElement).videoHeight ??
      (source as HTMLImageElement).naturalHeight;

    if (!width || !height) return;

    // Fit to preview canvas
    const aspect = width / height;
    const canvasWidth = previewCanvas.width;
    const canvasHeight = previewCanvas.height;
    const canvasAspect = canvasWidth / canvasHeight;

    let drawWidth, drawHeight, drawX, drawY;
    if (aspect > canvasAspect) {
      drawWidth = canvasWidth;
      drawHeight = canvasWidth / aspect;
      drawX = 0;
      drawY = (canvasHeight - drawHeight) / 2;
    } else {
      drawHeight = canvasHeight;
      drawWidth = canvasHeight * aspect;
      drawX = (canvasWidth - drawWidth) / 2;
      drawY = 0;
    }

    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    ctx.drawImage(source, drawX, drawY, drawWidth, drawHeight);
  }

  // Update preview when canvas is ready and image is loaded
  $effect(() => {
    if (
      previewCanvas &&
      imageElement &&
      imageLoaded &&
      data.mediaType === "image"
    ) {
      updatePreview();
    }
  });

  // Update preview when canvas is ready and video is loaded
  $effect(() => {
    if (
      previewCanvas &&
      videoElement &&
      videoLoaded &&
      data.mediaType === "video"
    ) {
      updatePreview();
    }
  });

  // Update video settings when they change
  $effect(() => {
    if (videoElement && data.mediaType === "video") {
      videoElement.loop = data.loop ?? true;
      videoElement.playbackRate = data.playbackSpeed ?? 1;
    }
  });

  function togglePlayback() {
    if (!videoElement) return;

    if (videoElement.paused) {
      videoElement.play().catch(console.error);
    } else {
      videoElement.pause();
    }
  }

  function restartVideo() {
    if (!videoElement) return;
    videoElement.currentTime = 0;
    videoElement.play().catch(console.error);
  }

  const fileName = $derived(
    data.filePath ? data.filePath.split(/[/\\]/).pop() : null,
  );

  const isVideo = $derived(data.mediaType === "video");
</script>

<BaseNode {...props}>
  {#snippet headerExtra()}
    <div class="flex items-center gap-1">
      <span
        class="text-[9px] px-1.5 py-0.5 bg-teal-500/20 text-teal-300 rounded"
      >
        {isVideo ? "Video" : "Image"}
      </span>
    </div>
  {/snippet}

  <div class="space-y-2">
    <!-- File Selection -->
    <div>
      <Button
        variant="outline"
        size="sm"
        onclick={handleFileSelect}
        class="w-full h-7 text-xs bg-neutral-800 border-neutral-700 nodrag"
      >
        {fileName ?? (isVideo ? "Select Video..." : "Select Image...")}
      </Button>
    </div>

    <!-- Preview -->
    {#if data.filePath}
      <div class="relative">
        <canvas
          bind:this={previewCanvas}
          width="160"
          height="90"
          class="w-full h-auto rounded bg-black"
        ></canvas>

        {#if data.width && data.height}
          <span
            class="absolute bottom-1 right-1 text-[8px] text-white/60 bg-black/50 px-1 rounded"
          >
            {data.width}×{data.height}
          </span>
        {/if}
      </div>
    {/if}

    <!-- Video Controls (only for video type) -->
    {#if isVideo && data.filePath}
      <div class="border-t border-neutral-700 pt-2 mt-2 space-y-2">
        <!-- Playback Controls -->
        <div class="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onclick={togglePlayback}
            class="h-6 px-2 text-xs nodrag"
          >
            {videoElement?.paused ? "▶" : "⏸"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onclick={restartVideo}
            class="h-6 px-2 text-xs nodrag"
          >
            ⏮
          </Button>
        </div>

        <!-- Loop Toggle -->
        <div class="flex items-center justify-between">
          <Label class="text-[10px] text-neutral-400">Loop</Label>
          <Switch
            checked={data.loop ?? true}
            onCheckedChange={(checked) => updateSetting("loop", checked)}
            class="nodrag scale-75"
          />
        </div>

        <!-- Playback Speed -->
        <div>
          <div class="flex items-center justify-between mb-1">
            <Label class="text-[10px] text-neutral-400">Speed</Label>
            <span class="text-[9px] font-mono text-neutral-500">
              {(data.playbackSpeed ?? 1).toFixed(2)}x
            </span>
          </div>
          <RangeSlider
            value={data.playbackSpeed ?? 1}
            min={0.1}
            max={4}
            step={0.1}
            oninput={(e) => {
              const val = parseFloat((e.target as HTMLInputElement).value);
              // Apply to both local videoElement AND data._mediaElement
              if (videoElement) {
                videoElement.playbackRate = val;
              }
              // Also apply to _mediaElement in case it's a different reference
              const mediaEl = data._mediaElement;
              if (mediaEl && mediaEl instanceof HTMLVideoElement) {
                mediaEl.playbackRate = val;
              }
              // Update node data
              updateSetting("playbackSpeed", val);
            }}
          />
        </div>
      </div>
    {/if}
  </div>
</BaseNode>
