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
  import * as Select from "$lib/components/ui/select";

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
        type: "image" | "video" | "audio";
      }) => Promise<{ canceled: boolean; filePaths: string[] }>;
      readFile: (filePath: string) => Promise<{
        success: boolean;
        data?: ArrayBuffer | string;
        mimeType?: string;
        error?: string;
        isBase64?: boolean;
      }>;
      getDesktopSources: () => Promise<{
        success: boolean;
        sources?: Array<{ id: string; name: string; thumbnail?: string }>;
        error?: string;
      }>;
    };
  };

  const nativeAPI = (window as unknown as { VISOICNative?: NativeAPI })
    .VISOICNative;

  // Use subscription-based updates instead of polling for better performance
  let liveData = $state<MediaNodeData>(props.data);

  // Subscribe to this specific node's updates
  const unsubscribe = nodeGraph.subscribeToNode(props.id, (newData) => {
    liveData = newData as MediaNodeData;
  });

  // Preview canvas and video element - NOT reactive to avoid re-render loops
  let previewCanvas: HTMLCanvasElement | null = null;
  let videoElement: HTMLVideoElement | null = null;
  let imageElement: HTMLImageElement | null = null;
  let blobUrl: string | null = null;
  let imageLoaded = false;
  let videoLoaded = false;
  let captureActive = $state(false);
  let videoPaused = $state(true); // Only this is reactive for UI
  let previewUpdated = false; // Flag to prevent repeated preview updates
  let mediaStream: MediaStream | null = null; // Local reference, not in node data

  // Desktop sources list
  let desktopSources = $state<
    Array<{ id: string; name: string; thumbnail?: string }>
  >([]);
  let cameraDevices = $state<MediaDeviceInfo[]>([]);

  onMount(() => {
    // Initialize based on media type
    if (props.data.mediaType === "video" && props.data.filePath) {
      loadVideo(props.data.filePath);
    } else if (props.data.mediaType === "image" && props.data.filePath) {
      loadImage(props.data.filePath);
    } else if (props.data.mediaType === "desktop") {
      loadDesktopSources();
      if (props.data.sourceId) {
        startDesktopCapture(props.data.sourceId);
      }
    } else if (props.data.mediaType === "camera") {
      loadCameraDevices();
      if (props.data.deviceId) {
        startCameraCapture(props.data.deviceId);
      }
    }
  });

  onDestroy(() => {
    unsubscribe();
    if (videoElement) {
      videoElement.pause();
      videoElement.src = "";
    }
    // Revoke blob URL to free memory
    if (blobUrl) {
      URL.revokeObjectURL(blobUrl);
    }
    // Stop media stream
    stopCapture();
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
    if (data.mediaType !== "image" && data.mediaType !== "video") return;

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

      // Handle base64 encoded data from IPC
      let blobData: BlobPart;
      if (result.isBase64 && typeof result.data === "string") {
        // Decode base64 to ArrayBuffer
        const binary = atob(result.data);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        blobData = bytes;
      } else {
        blobData = result.data as ArrayBuffer;
      }

      // Create blob URL from buffer
      const blob = new Blob([blobData], {
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
          videoElement!
            .play()
            .then(() => {
              videoPaused = false;
            })
            .catch(console.error);
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

      // Handle base64 encoded data from IPC
      let blobData: BlobPart;
      if (result.isBase64 && typeof result.data === "string") {
        // Decode base64 to ArrayBuffer
        const binary = atob(result.data);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        blobData = bytes;
      } else {
        blobData = result.data as ArrayBuffer;
      }

      // Create blob URL from buffer
      const blob = new Blob([blobData], {
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
        previewUpdated = false;
        // Trigger preview update after a short delay to ensure canvas is bound
        setTimeout(() => {
          if (previewCanvas && !previewUpdated) {
            previewUpdated = true;
            updatePreview();
          }
        }, 50);
      };

      imageElement.onerror = (e) => {
        console.error("[MediaNode] Image load error:", e);
      };
    } catch (e) {
      console.error("Failed to load image:", e);
    }
  }

  // Desktop capture functions
  async function loadDesktopSources() {
    try {
      const result = await nativeAPI?.media?.getDesktopSources();
      if (result?.success && result.sources) {
        desktopSources = result.sources;
      }
    } catch (e) {
      console.error("Failed to get desktop sources:", e);
    }
  }

  async function startDesktopCapture(sourceId: string) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          // @ts-ignore - Electron specific constraint
          mandatory: {
            chromeMediaSource: "desktop",
            chromeMediaSourceId: sourceId,
          },
        },
      });

      setupStreamCapture(stream);
      updateSetting("sourceId", sourceId);

      const source = desktopSources.find((s) => s.id === sourceId);
      if (source) {
        updateSetting("sourceName", source.name);
      }
    } catch (e) {
      console.error("Failed to start desktop capture:", e);
    }
  }

  // Camera capture functions
  async function loadCameraDevices() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      cameraDevices = devices.filter((d) => d.kind === "videoinput");
    } catch (e) {
      console.error("Failed to enumerate devices:", e);
    }
  }

  async function startCameraCapture(deviceId: string) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          deviceId: { exact: deviceId },
        },
      });

      setupStreamCapture(stream);
      updateSetting("deviceId", deviceId);

      const device = cameraDevices.find((d) => d.deviceId === deviceId);
      if (device) {
        updateSetting("deviceLabel", device.label);
      }
    } catch (e) {
      console.error("Failed to start camera capture:", e);
    }
  }

  function setupStreamCapture(stream: MediaStream) {
    // Stop any existing stream first
    stopCapture();

    mediaStream = stream; // Store locally

    if (!videoElement) {
      videoElement = document.createElement("video");
      videoElement.playsInline = true;
      videoElement.muted = true;
    }

    videoElement.srcObject = stream;
    videoElement.play().catch(console.error);

    videoElement.onloadedmetadata = () => {
      updateSetting("width", videoElement!.videoWidth);
      updateSetting("height", videoElement!.videoHeight);
      updateSetting("_mediaElement", videoElement);
      captureActive = true;
      videoLoaded = true;
    };

    videoElement.ontimeupdate = () => {
      updatePreview();
    };

    // Also update preview on each frame for live captures
    const updateFrame = () => {
      if (captureActive && videoElement) {
        updatePreview();
        requestAnimationFrame(updateFrame);
      }
    };
    requestAnimationFrame(updateFrame);
  }

  function stopCapture() {
    captureActive = false;
    if (mediaStream) {
      mediaStream.getTracks().forEach((track) => track.stop());
      mediaStream = null;
    }
    if (videoElement) {
      videoElement.srcObject = null;
    }
  }

  function updatePreview() {
    if (!previewCanvas) return;

    const ctx = previewCanvas.getContext("2d");
    if (!ctx) return;

    // For desktop/camera, always use videoElement
    const isCapture =
      data.mediaType === "desktop" || data.mediaType === "camera";
    const source =
      isCapture || data.mediaType === "video" ? videoElement : imageElement;
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

  // Svelte action for canvas binding
  function canvasAction(canvas: HTMLCanvasElement) {
    previewCanvas = canvas;
    // Update preview if image is already loaded
    if (imageLoaded && data.mediaType === "image" && !previewUpdated) {
      previewUpdated = true;
      updatePreview();
    }
    // Update preview if video is already loaded
    if (videoLoaded && data.mediaType === "video") {
      updatePreview();
    }

    return {
      destroy() {
        previewCanvas = null;
      },
    };
  }

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
      videoElement
        .play()
        .then(() => {
          videoPaused = false;
        })
        .catch(console.error);
    } else {
      videoElement.pause();
      videoPaused = true;
    }
  }

  function restartVideo() {
    if (!videoElement) return;
    videoElement.currentTime = 0;
    videoElement
      .play()
      .then(() => {
        videoPaused = false;
      })
      .catch(console.error);
  }

  const fileName = $derived(
    data.filePath ? data.filePath.split(/[/\\]/).pop() : null,
  );

  const isVideo = $derived(data.mediaType === "video");
  const isImage = $derived(data.mediaType === "image");
  const isDesktop = $derived(data.mediaType === "desktop");
  const isCamera = $derived(data.mediaType === "camera");
  const isCapture = $derived(isDesktop || isCamera);

  const mediaTypeLabel = $derived(() => {
    switch (data.mediaType) {
      case "video":
        return "Video";
      case "image":
        return "Image";
      case "desktop":
        return "Desktop";
      case "camera":
        return "Camera";
      default:
        return "Media";
    }
  });
</script>

<BaseNode {...props}>
  {#snippet headerExtra()}
    <div class="flex items-center gap-1">
      <span
        class="text-[9px] px-1.5 py-0.5 bg-cyan-500/20 text-cyan-300 rounded"
      >
        {mediaTypeLabel()}
      </span>
    </div>
  {/snippet}

  <div class="space-y-2">
    <!-- File Selection (for image/video) -->
    {#if isImage || isVideo}
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
    {/if}

    <!-- Desktop Source Selection -->
    {#if isDesktop}
      <div class="space-y-1">
        <div class="flex gap-1">
          <Select.Root
            type="single"
            value={data.sourceId}
            onValueChange={(v) => startDesktopCapture(v)}
          >
            <Select.Trigger
              class="flex-1 h-7 text-xs bg-neutral-800 border-neutral-700 nodrag"
            >
              {data.sourceName ?? "Select Source..."}
            </Select.Trigger>
            <Select.Content>
              {#each desktopSources as source}
                <Select.Item value={source.id}>{source.name}</Select.Item>
              {/each}
            </Select.Content>
          </Select.Root>
          <Button
            variant="outline"
            size="sm"
            onclick={loadDesktopSources}
            class="h-7 px-2 text-xs bg-neutral-800 border-neutral-700 nodrag"
          >
            ↻
          </Button>
        </div>
        {#if captureActive}
          <Button
            variant="destructive"
            size="sm"
            onclick={stopCapture}
            class="w-full h-6 text-xs nodrag"
          >
            Stop Capture
          </Button>
        {/if}
      </div>
    {/if}

    <!-- Camera Selection -->
    {#if isCamera}
      <div class="space-y-1">
        <div class="flex gap-1">
          <Select.Root
            type="single"
            value={data.deviceId}
            onValueChange={(v) => startCameraCapture(v)}
          >
            <Select.Trigger
              class="flex-1 h-7 text-xs bg-neutral-800 border-neutral-700 nodrag"
            >
              {data.deviceLabel ?? "Select Camera..."}
            </Select.Trigger>
            <Select.Content>
              {#each cameraDevices as device}
                <Select.Item value={device.deviceId}
                  >{device.label ||
                    `Camera ${device.deviceId.slice(0, 8)}`}</Select.Item
                >
              {/each}
            </Select.Content>
          </Select.Root>
          <Button
            variant="outline"
            size="sm"
            onclick={loadCameraDevices}
            class="h-7 px-2 text-xs bg-neutral-800 border-neutral-700 nodrag"
          >
            ↻
          </Button>
        </div>
        {#if captureActive}
          <Button
            variant="destructive"
            size="sm"
            onclick={stopCapture}
            class="w-full h-6 text-xs nodrag"
          >
            Stop Capture
          </Button>
        {/if}
      </div>
    {/if}

    <!-- Preview -->
    {#if data.filePath || captureActive}
      <div class="relative">
        <canvas
          use:canvasAction
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
            {videoPaused ? "▶" : "⏸"}
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
