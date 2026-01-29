<script lang="ts">
  import { onMount, onDestroy, untrack } from "svelte";
  import {
    shaderManager,
    ShaderManager,
    FALLBACK_SHADERS,
    isfLoader,
    type ISFShaderInfo,
    type RenderContext,
    type ShaderLayer,
    type ISFInput,
    type BlendMode,
    type RenderStats,
  } from "$lib/api/shader";
  import {
    valueManager,
    configManager,
    type ShaderLayerSaveConfig,
    type RenderContextSaveConfig,
    type ShaderUniformConfig,
    type UniformBindingConfig,
    type ColorChannelBindingConfig,
  } from "$lib/api/values";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import { Slider } from "$lib/components/ui/slider";
  import { Switch } from "$lib/components/ui/switch";
  import * as Select from "$lib/components/ui/select";
  import * as Tabs from "$lib/components/ui/tabs";
  import * as Dialog from "$lib/components/ui/dialog";
  import { toast } from "svelte-sonner";
  import {
    Plus,
    Trash2,
    Play,
    Pause,
    Settings2,
    Eye,
    EyeOff,
    ChevronDown,
    ChevronRight,
    Link,
    Unlink,
    Layers,
    Monitor,
    RefreshCw,
    Copy,
    Code,
    Search,
    FolderOpen,
  } from "@lucide/svelte";

  // ==========================================
  // State
  // ==========================================

  let isSupported = $state(false);
  let isInitialized = $state(false);
  let isLoading = $state(true);

  // ISF Shader browser state
  let isfCategories = $state<string[]>([]);
  let isfShaders = $state<ISFShaderInfo[]>([]);
  let isfSearchQuery = $state("");
  let isfSelectedCategory = $state<string | null>(null);
  let isLoadingShaders = $state(false);

  // Derived: filtered shaders based on search and category
  let filteredShaders = $derived.by(() => {
    let filtered = isfShaders;

    if (isfSelectedCategory) {
      filtered = filtered.filter((s) => s.category === isfSelectedCategory);
    }

    if (isfSearchQuery.trim()) {
      const query = isfSearchQuery.toLowerCase();
      filtered = filtered.filter(
        (s) =>
          s.name.toLowerCase().includes(query) ||
          s.category.toLowerCase().includes(query),
      );
    }

    return filtered;
  });

  // Current context and layer
  let currentContextId = $state<string | null>(null);
  let currentLayerId = $state<string | null>(null);

  // Render contexts state
  let contexts = $state<
    Array<{
      id: string;
      width: number;
      height: number;
      fpsLimit: number;
      isRunning: boolean;
      stats: RenderStats | null;
    }>
  >([]);

  // Layers state
  let layers = $state<
    Array<{
      id: string;
      contextId: string;
      shaderKey: string;
      enabled: boolean;
      opacity: number;
      blendMode: BlendMode;
      uniforms: Array<{
        name: string;
        type: string;
        value: number | boolean | number[];
        min?: number | number[];
        max?: number | number[];
        label?: string;
        binding?: UniformBindingConfig;
        colorBinding?: ColorChannelBindingConfig;
      }>;
    }>
  >([]);

  // Available values from value manager
  let availableValues = $state<Array<{ id: string; name: string }>>([]);

  // Canvas refs - NOT reactive to avoid infinite loops
  let canvasRefs: Map<string, HTMLCanvasElement> = new Map();
  let previewContainer: HTMLDivElement | null = null;

  // Dialog states
  let showAddContextDialog = $state(false);
  let showAddLayerDialog = $state(false);
  let showBindingDialog = $state(false);

  // New context form
  let newContextForm = $state({
    id: "",
    width: 800,
    height: 600,
    fpsLimit: 60,
  });

  // New layer form
  let newLayerForm = $state({
    id: "",
    shaderId: "", // ISF shader ID (category/name format) or 'fallback:xxx' or 'custom'
    customSource: "",
  });

  // Binding dialog state
  let bindingTarget = $state<{
    contextId: string;
    layerId: string;
    uniformName: string;
    uniformType: string;
    channel?: "r" | "g" | "b" | "a";
  } | null>(null);

  let bindingForm = $state<UniformBindingConfig>({
    valueId: "",
    inputMin: 0,
    inputMax: 1,
    outputMin: 0,
    outputMax: 1,
  });

  // Expanded layers - NOT reactive to avoid infinite loops
  let expandedLayers: Set<string> = new Set();
  let expandedLayersVersion = $state(0); // Increment to trigger re-render

  // Blend modes
  const blendModes: BlendMode[] = [
    "normal",
    "add",
    "multiply",
    "screen",
    "overlay",
    "difference",
  ];

  // ==========================================
  // Lifecycle
  // ==========================================

  onMount(async () => {
    isSupported = ShaderManager.isSupported();

    if (!isSupported) {
      toast.error("WebGPU is not supported in this browser");
      isLoading = false;
      return;
    }

    try {
      await shaderManager.initialize();
      isInitialized = true;

      // Load available values
      refreshAvailableValues();

      // Load ISF shaders
      await loadISFShaders();

      // Load saved config
      await loadSavedConfig();

      // Start sync loop for value bindings
      startSyncLoop();

      toast.success("Shader system initialized");
    } catch (error) {
      toast.error("Failed to initialize shader system: " + error);
    } finally {
      isLoading = false;
    }

    // Cleanup on unmount
    return () => {
      stopSyncLoop();
    };
  });

  onDestroy(() => {
    // Save config
    saveConfig();

    // Don't stop or destroy contexts - they keep running in background
    // Just clear canvas refs since they'll be recreated on remount
    canvasRefs.clear();
  });

  // Handle HMR - cleanup before reload (only for dev)
  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      // For HMR we do need to cleanup to avoid duplicates
      shaderManager.destroyAllContexts();
    });
  }

  // ==========================================
  // ISF Shader Loading
  // ==========================================

  async function loadISFShaders() {
    isLoadingShaders = true;
    try {
      // Load categories and all shaders
      const [categories, shaders] = await Promise.all([
        isfLoader.getCategories(),
        isfLoader.getAllShaders(),
      ]);

      isfCategories = categories;
      isfShaders = shaders;

      console.log(
        `[ShaderEditor] Loaded ${shaders.length} ISF shaders in ${categories.length} categories`,
      );
    } catch (error) {
      console.error("[ShaderEditor] Failed to load ISF shaders:", error);
      // Fall back to built-in fallback shaders
      isfCategories = ["Fallback"];
      isfShaders = Object.keys(FALLBACK_SHADERS).map((key) => ({
        id: `fallback:${key}`,
        name: FALLBACK_SHADERS[key as keyof typeof FALLBACK_SHADERS].name,
        category: "Fallback",
        hasVertex: false,
      }));
    } finally {
      isLoadingShaders = false;
    }
  }

  // getFilteredShaders is now a derived state (filteredShaders) defined above

  async function loadShaderSource(shaderId: string): Promise<string> {
    // Check if it's a fallback shader
    if (shaderId.startsWith("fallback:")) {
      const key = shaderId.replace(
        "fallback:",
        "",
      ) as keyof typeof FALLBACK_SHADERS;
      return FALLBACK_SHADERS[key]?.source || "";
    }

    // Load from ISF loader
    const shader = await isfLoader.loadShader(shaderId);
    return shader?.fragment || "";
  }

  // ==========================================
  // Config Management
  // ==========================================

  async function loadSavedConfig() {
    const shaderConfig = configManager.getShaderConfig();

    for (const ctxConfig of shaderConfig.contexts) {
      // Check if context already exists (running in background)
      const existingContext = shaderManager.getContext(ctxConfig.id);
      if (existingContext) {
        // Context exists, just reconnect canvas ref
        const canvas = existingContext.canvas as HTMLCanvasElement;
        canvasRefs.set(ctxConfig.id, canvas);
      } else {
        // Create new context
        await createContextFromConfig(ctxConfig);
      }
    }

    refreshContexts();
    refreshLayers();
  }

  async function createContextFromConfig(config: RenderContextSaveConfig) {
    // Create canvas element
    const canvas = document.createElement("canvas");
    canvas.width = config.width;
    canvas.height = config.height;

    try {
      const context = await shaderManager.createContext({
        id: config.id,
        canvas,
        width: config.width,
        height: config.height,
        fpsLimit: config.fpsLimit,
      });

      canvasRefs.set(config.id, canvas);

      // Add layers
      for (const layerConfig of config.layers) {
        await createLayerFromConfig(context, layerConfig);
      }

      context.start();

      // Force update preview after context is fully setup
      setTimeout(() => {
        currentContextId = config.id;
      }, 100);
    } catch (error) {
      console.error("Failed to create context from config:", error);
    }
  }

  async function createLayerFromConfig(
    context: RenderContext,
    config: ShaderLayerSaveConfig,
  ) {
    let source: string;

    if (config.shaderKey === "custom" && config.customSource) {
      source = config.customSource;
    } else {
      // Load shader source dynamically
      source = await loadShaderSource(config.shaderKey);
    }

    if (!source) return;

    const layer = context.addLayer({
      id: config.id,
      source: { fragment: source },
      enabled: config.enabled,
      opacity: config.opacity,
      blendMode: config.blendMode,
    });

    // Apply saved uniform values
    for (const uniformConfig of config.uniforms) {
      if (uniformConfig.value !== undefined) {
        layer.setUniform(
          uniformConfig.name,
          uniformConfig.value as number | boolean | number[],
        );
      }
    }
  }

  function saveConfig() {
    const shaderConfig: { contexts: RenderContextSaveConfig[] } = {
      contexts: [],
    };

    for (const ctx of contexts) {
      const ctxLayers = layers.filter((l) => l.contextId === ctx.id);

      const contextConfig: RenderContextSaveConfig = {
        id: ctx.id,
        width: ctx.width,
        height: ctx.height,
        fpsLimit: ctx.fpsLimit,
        layers: ctxLayers.map((l) => ({
          id: l.id,
          shaderKey: l.shaderKey,
          customSource:
            l.shaderKey === "custom"
              ? getLayerCustomSource(ctx.id, l.id)
              : undefined,
          enabled: l.enabled,
          opacity: l.opacity,
          blendMode: l.blendMode,
          uniforms: l.uniforms.map((u) => ({
            name: u.name,
            type: u.type,
            value: u.value,
            binding: u.binding,
            colorBinding: u.colorBinding,
          })),
        })),
      };

      shaderConfig.contexts.push(contextConfig);
    }

    configManager.setShaderConfig(shaderConfig);
  }

  function getLayerCustomSource(
    contextId: string,
    layerId: string,
  ): string | undefined {
    const layer = shaderManager.getLayer(contextId, layerId);
    return layer?.getCompileResult()?.fragmentShader;
  }

  // ==========================================
  // Refresh Functions
  // ==========================================

  function refreshContexts() {
    const ctxList: typeof contexts = [];

    for (const [id, ctx] of shaderManager.getContexts()) {
      ctxList.push({
        id,
        width: ctx.getConfig().width || 800,
        height: ctx.getConfig().height || 600,
        fpsLimit: ctx.getFpsLimit(),
        isRunning: ctx.isRunning(),
        stats: ctx.getStats(),
      });
    }

    contexts = ctxList;

    if (contexts.length === 0) {
      currentContextId = null;
    } else if (!currentContextId && contexts.length > 0) {
      currentContextId = contexts[0].id;
    }
  }

  function refreshLayers() {
    const layerList: typeof layers = [];

    for (const ctx of contexts) {
      const context = shaderManager.getContext(ctx.id);
      if (!context) continue;

      for (const layer of context.getLayers()) {
        const uniforms = layer.getUniformDefinitions();
        const layerConfig = layers.find(
          (l) => l.id === layer.id && l.contextId === ctx.id,
        );

        // Check for pending shader key (newly added layer)
        const layerKey = `${ctx.id}:${layer.id}`;
        const pending = pendingLayerShaderKeys.get(layerKey);
        const shaderKey =
          pending?.shaderKey || layerConfig?.shaderKey || "custom";

        layerList.push({
          id: layer.id,
          contextId: ctx.id,
          shaderKey,
          enabled: layer.enabled,
          opacity: layer.opacity,
          blendMode: layer.blendMode,
          uniforms: uniforms.map((u) => ({
            name: u.name,
            type: u.type,
            value: normalizeUniformValue(
              u.type,
              // UniformValue can be null or Float32Array; normalize to primitives/number[]
              // so the UI never crashes on .toFixed or index access.
              (u as any).value,
              (u as any).default,
            ),
            min: u.min,
            max: u.max,
            label: u.label,
            binding: layerConfig?.uniforms.find((lu) => lu.name === u.name)
              ?.binding,
            colorBinding: layerConfig?.uniforms.find((lu) => lu.name === u.name)
              ?.colorBinding,
          })),
        });
      }
    }

    layers = layerList;

    if (!currentLayerId && layers.length > 0) {
      currentLayerId = layers[0].id;
    }
  }

  function refreshAvailableValues() {
    const defs = valueManager.getAllDefinitions();
    availableValues = defs
      .filter((d) => d.type === "number")
      .map((d) => ({ id: d.id, name: d.name }));
  }

  // ==========================================
  // Context Management
  // ==========================================

  async function createContext() {
    if (!newContextForm.id) {
      toast.error("Context ID is required");
      return;
    }

    if (shaderManager.getContext(newContextForm.id)) {
      toast.error("Context with this ID already exists");
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = newContextForm.width;
    canvas.height = newContextForm.height;

    try {
      await shaderManager.createContext({
        id: newContextForm.id,
        canvas,
        width: newContextForm.width,
        height: newContextForm.height,
        fpsLimit: newContextForm.fpsLimit,
      });

      canvasRefs.set(newContextForm.id, canvas);

      refreshContexts();
      currentContextId = newContextForm.id;
      showAddContextDialog = false;

      // Reset form
      newContextForm = { id: "", width: 800, height: 600, fpsLimit: 60 };

      saveConfig();
      toast.success("Context created");
    } catch (error) {
      toast.error("Failed to create context: " + error);
    }
  }

  function deleteContext(id: string) {
    shaderManager.destroyContext(id);
    canvasRefs.delete(id);
    refreshContexts();
    refreshLayers();

    if (currentContextId === id) {
      currentContextId = contexts[0]?.id || null;
    }

    // Ensure preview is cleared/updated after context removal
    setTimeout(updatePreview, 0);

    saveConfig();
    toast.success("Context deleted");
  }

  function toggleContext(id: string) {
    const context = shaderManager.getContext(id);
    if (!context) return;

    if (context.isRunning()) {
      context.stop();
    } else {
      context.start();
    }

    refreshContexts();
  }

  // ==========================================
  // Layer Management
  // ==========================================

  // Track shader keys for newly added layers (before config is saved)
  let pendingLayerShaderKeys: Map<
    string,
    { contextId: string; shaderKey: string; customSource?: string }
  > = new Map();

  async function addLayer() {
    if (!currentContextId) {
      toast.error("Select a context first");
      return;
    }

    if (!newLayerForm.id) {
      toast.error("Layer ID is required");
      return;
    }

    if (!newLayerForm.shaderId) {
      toast.error("Select a shader");
      return;
    }

    const context = shaderManager.getContext(currentContextId);
    if (!context) return;

    let source: string;

    if (newLayerForm.shaderId === "custom") {
      source = newLayerForm.customSource || FALLBACK_SHADERS.solidColor.source;
    } else {
      // Load shader source dynamically
      source = await loadShaderSource(newLayerForm.shaderId);
    }

    if (!source) {
      toast.error("Failed to load shader");
      return;
    }

    // Store shader key before adding
    const layerKey = `${currentContextId}:${newLayerForm.id}`;
    pendingLayerShaderKeys.set(layerKey, {
      contextId: currentContextId,
      shaderKey: newLayerForm.shaderId,
      customSource:
        newLayerForm.shaderId === "custom"
          ? newLayerForm.customSource
          : undefined,
    });

    try {
      context.addLayer({
        id: newLayerForm.id,
        source: { fragment: source },
        enabled: true,
        opacity: 1,
        blendMode: "normal",
      });

      refreshLayers();
      currentLayerId = newLayerForm.id;
      showAddLayerDialog = false;

      // Reset form
      newLayerForm = { id: "", shaderId: "", customSource: "" };

      saveConfig();
      toast.success("Layer added");
    } catch (error) {
      toast.error("Failed to add layer: " + error);
    }
  }

  function deleteLayer(contextId: string, layerId: string) {
    const context = shaderManager.getContext(contextId);
    if (!context) return;

    context.removeLayer(layerId);
    refreshLayers();

    if (currentLayerId === layerId) {
      currentLayerId = layers[0]?.id || null;
    }

    saveConfig();
    toast.success("Layer deleted");
  }

  function toggleLayerEnabled(contextId: string, layerId: string) {
    const layer = shaderManager.getLayer(contextId, layerId);
    if (!layer) return;

    layer.enabled = !layer.enabled;
    refreshLayers();
    saveConfig();
  }

  function updateLayerOpacity(
    contextId: string,
    layerId: string,
    opacity: number,
  ) {
    const layer = shaderManager.getLayer(contextId, layerId);
    if (!layer) return;

    layer.opacity = opacity;
    refreshLayers();
    saveConfig();
  }

  function updateLayerBlendMode(
    contextId: string,
    layerId: string,
    mode: BlendMode,
  ) {
    const layer = shaderManager.getLayer(contextId, layerId);
    if (!layer) return;

    layer.blendMode = mode;
    refreshLayers();
    saveConfig();
  }

  // ==========================================
  // Uniform Management
  // ==========================================

  function updateUniform(
    contextId: string,
    layerId: string,
    name: string,
    value: number | boolean | number[],
  ) {
    const layer = shaderManager.getLayer(contextId, layerId);
    if (!layer) return;

    layer.setUniform(name, value);

    // Update local state
    const layerState = layers.find(
      (l) => l.id === layerId && l.contextId === contextId,
    );
    if (layerState) {
      const uniform = layerState.uniforms.find((u) => u.name === name);
      if (uniform) {
        uniform.value = value;
      }
    }

    saveConfig();
  }

  function updateColorChannel(
    contextId: string,
    layerId: string,
    name: string,
    channel: number,
    value: number,
  ) {
    const layer = shaderManager.getLayer(contextId, layerId);
    if (!layer) return;

    const currentValue = layer.getUniform(name);
    const currentArray = toNumberArray(currentValue);
    if (!currentArray) return;

    // Ensure we have at least 4 channels for color/vec4 editing.
    const newValue = padNumberArray(currentArray, 4, 0);
    if (newValue.length >= 4) {
      // alpha defaults to 1 if missing
      if (currentArray.length < 4) newValue[3] = 1;
    }
    newValue[channel] = value;
    layer.setUniform(name, newValue);

    // Update local state
    const layerState = layers.find(
      (l) => l.id === layerId && l.contextId === contextId,
    );
    if (layerState) {
      const uniform = layerState.uniforms.find((u) => u.name === name);
      if (uniform && Array.isArray(uniform.value)) {
        uniform.value = newValue;
      }
    }

    saveConfig();
  }

  // ==========================================
  // Value Binding
  // ==========================================

  function openBindingDialog(
    contextId: string,
    layerId: string,
    uniformName: string,
    uniformType: string,
    channel?: "r" | "g" | "b" | "a",
  ) {
    bindingTarget = { contextId, layerId, uniformName, uniformType, channel };

    // Get existing binding
    const layerState = layers.find(
      (l) => l.id === layerId && l.contextId === contextId,
    );
    const uniform = layerState?.uniforms.find((u) => u.name === uniformName);

    if (channel && uniform?.colorBinding) {
      const channelBinding = uniform.colorBinding[channel];
      if (channelBinding) {
        bindingForm = { ...channelBinding };
      } else {
        bindingForm = {
          valueId: "",
          inputMin: 0,
          inputMax: 1,
          outputMin: 0,
          outputMax: 1,
        };
      }
    } else if (uniform?.binding) {
      bindingForm = { ...uniform.binding };
    } else {
      // Set defaults based on uniform min/max
      bindingForm = {
        valueId: "",
        inputMin: 0,
        inputMax: 1,
        outputMin: getNumericBound(uniform?.min, 0, 0),
        outputMax: getNumericBound(uniform?.max, 0, 1),
      };
    }

    showBindingDialog = true;
  }

  function saveBinding() {
    if (!bindingTarget) return;

    const { contextId, layerId, uniformName, channel } = bindingTarget;
    const layerState = layers.find(
      (l) => l.id === layerId && l.contextId === contextId,
    );
    if (!layerState) return;

    const uniform = layerState.uniforms.find((u) => u.name === uniformName);
    if (!uniform) return;

    if (channel) {
      // Color channel binding
      if (!uniform.colorBinding) {
        uniform.colorBinding = {};
      }
      if (bindingForm.valueId) {
        uniform.colorBinding[channel] = { ...bindingForm };
      } else {
        delete uniform.colorBinding[channel];
      }
    } else {
      // Regular binding
      if (bindingForm.valueId) {
        uniform.binding = { ...bindingForm };
      } else {
        delete uniform.binding;
      }
    }

    showBindingDialog = false;
    bindingTarget = null;
    saveConfig();
    toast.success("Binding saved");
  }

  function removeBinding(
    contextId: string,
    layerId: string,
    uniformName: string,
    channel?: "r" | "g" | "b" | "a",
  ) {
    const layerState = layers.find(
      (l) => l.id === layerId && l.contextId === contextId,
    );
    if (!layerState) return;

    const uniform = layerState.uniforms.find((u) => u.name === uniformName);
    if (!uniform) return;

    if (channel && uniform.colorBinding) {
      delete uniform.colorBinding[channel];
    } else {
      delete uniform.binding;
    }

    saveConfig();
    toast.success("Binding removed");
  }

  // ==========================================
  // Value Sync Loop
  // ==========================================

  let syncInterval: ReturnType<typeof setInterval> | null = null;

  function startSyncLoop() {
    if (syncInterval) return;
    syncInterval = setInterval(() => {
      // Use untrack to prevent reactive tracking inside interval
      syncBindingsUntracked();
    }, 16); // ~60fps
  }

  function stopSyncLoop() {
    if (syncInterval) {
      clearInterval(syncInterval);
      syncInterval = null;
    }
  }

  function syncBindingsUntracked() {
    // Use untrack to prevent reactive tracking inside interval
    untrack(() => {
      for (const layerState of layers) {
        const layer = shaderManager.getLayer(
          layerState.contextId,
          layerState.id,
        );
        if (!layer) continue;

        for (const uniform of layerState.uniforms) {
          // Handle regular number binding
          if (uniform.binding?.valueId) {
            const rawValue = valueManager.get(uniform.binding.valueId);
            if (typeof rawValue === "number") {
              const mapped = mapValue(
                rawValue,
                uniform.binding.inputMin,
                uniform.binding.inputMax,
                uniform.binding.outputMin,
                uniform.binding.outputMax,
              );
              layer.setUniform(uniform.name, mapped);
            }
          }

          // Handle color channel bindings
          if (
            uniform.colorBinding &&
            (uniform.type === "color" ||
              uniform.type === "vec4" ||
              uniform.type === "vec3")
          ) {
            const currentValue = layer.getUniform(uniform.name);
            const currentArray = toNumberArray(currentValue);
            if (!currentArray) continue;

            const channelCount = uniform.type === "vec3" ? 3 : 4;
            const newValue = padNumberArray(currentArray, channelCount, 0);

            // alpha defaults to 1 when we treat it like color/vec4
            if (channelCount === 4 && currentArray.length < 4) {
              newValue[3] = 1;
            }

            const channels: Array<"r" | "g" | "b" | "a"> =
              channelCount === 3 ? ["r", "g", "b"] : ["r", "g", "b", "a"];

            for (let i = 0; i < channels.length; i++) {
              const channelBinding = uniform.colorBinding[channels[i]];
              if (channelBinding?.valueId) {
                const rawValue = valueManager.get(channelBinding.valueId);
                if (typeof rawValue === "number") {
                  newValue[i] = mapValue(
                    rawValue,
                    channelBinding.inputMin,
                    channelBinding.inputMax,
                    channelBinding.outputMin,
                    channelBinding.outputMax,
                  );
                }
              }
            }

            layer.setUniform(uniform.name, newValue);
          }
        }
      }
    });
  }

  function mapValue(
    value: number,
    inMin: number,
    inMax: number,
    outMin: number,
    outMax: number,
  ): number {
    const denom = inMax - inMin;
    if (!Number.isFinite(denom) || denom === 0) return outMin;
    const tRaw = (value - inMin) / denom;
    const t = Math.max(0, Math.min(1, Number.isFinite(tRaw) ? tRaw : 0));
    return outMin + t * (outMax - outMin);
  }

  // ==========================================
  // Preview
  // ==========================================

  // Update preview when context changes
  function updatePreview() {
    if (!previewContainer || !currentContextId) return;

    // Clear previous canvas
    previewContainer.innerHTML = "";

    // Get the WebGPU canvas and add it directly to DOM
    const srcCanvas = canvasRefs.get(currentContextId);
    if (srcCanvas) {
      srcCanvas.style.maxWidth = "100%";
      srcCanvas.style.maxHeight = "100%";
      srcCanvas.style.objectFit = "contain";
      previewContainer.appendChild(srcCanvas);
    }
  }

  // Called when currentContextId changes
  $effect(() => {
    // Track both previewContainer and currentContextId
    const container = previewContainer;
    const ctxId = currentContextId;

    if (!container) return;

    // When there is no context selected, clear any previously mounted canvas
    // (e.g. after deleting the last context) so the layout doesn't look broken.
    if (!ctxId) {
      container.innerHTML = "";
      return;
    }

    // Small delay to ensure DOM is ready
    setTimeout(updatePreview, 0);
  });

  // ==========================================
  // Helpers
  // ==========================================

  function toNumberArray(value: unknown): number[] | null {
    if (Array.isArray(value) && value.every((v) => typeof v === "number")) {
      return value;
    }

    if (value instanceof Float32Array) {
      return Array.from(value);
    }

    return null;
  }

  function padNumberArray(
    arr: number[],
    length: number,
    fill: number,
  ): number[] {
    if (arr.length >= length) return arr.slice(0, length);
    const out = arr.slice();
    while (out.length < length) out.push(fill);
    return out;
  }

  function defaultValueForUniformType(
    type: string,
  ): number | boolean | number[] {
    switch (type) {
      case "bool":
      case "event":
        return false;
      case "vec2":
      case "point2D":
        return [0, 0];
      case "vec3":
        return [0, 0, 0];
      case "vec4":
      case "color":
        return [0, 0, 0, 1];
      case "int":
      case "float":
      default:
        return 0;
    }
  }

  function normalizeUniformValue(
    type: string,
    value: unknown,
    defaultValue: unknown,
  ): number | boolean | number[] {
    const fallback =
      defaultValue !== undefined && defaultValue !== null
        ? defaultValue
        : defaultValueForUniformType(type);

    // Normalize bool/event (ISF sometimes provides DEFAULT as 0/1)
    if (type === "bool" || type === "event") {
      if (typeof value === "boolean") return value;
      if (typeof value === "number" && Number.isFinite(value))
        return value !== 0;
      if (typeof fallback === "boolean") return fallback;
      if (typeof fallback === "number" && Number.isFinite(fallback))
        return fallback !== 0;
      return false;
    }

    // Normalize scalar numbers
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "boolean") return value;

    // Normalize vectors/colors (array or Float32Array)
    const arrayValue = toNumberArray(value) ?? toNumberArray(fallback);
    if (arrayValue) {
      // Ensure expected lengths so UI safely reads indexes.
      if (type === "vec2" || type === "point2D") {
        return padNumberArray(arrayValue, 2, 0);
      }
      if (type === "vec3") {
        return padNumberArray(arrayValue, 3, 0);
      }
      if (type === "vec4" || type === "color") {
        const padded = padNumberArray(arrayValue, 4, 0);
        // alpha defaults to 1 if missing
        if (arrayValue.length < 4) padded[3] = 1;
        return padded;
      }
      return arrayValue;
    }

    // If we got null/undefined or unsupported type, fall back
    if (typeof fallback === "number" && Number.isFinite(fallback))
      return fallback;
    if (typeof fallback === "boolean") return fallback;

    const fallbackArray = toNumberArray(fallback);
    if (fallbackArray) return fallbackArray;
    return defaultValueForUniformType(type);
  }

  function getNumericBound(
    bound: number | number[] | undefined,
    index: number,
    fallback: number,
  ): number {
    if (typeof bound === "number" && Number.isFinite(bound)) return bound;
    if (Array.isArray(bound)) {
      const v = bound[index] ?? bound[0];
      if (typeof v === "number" && Number.isFinite(v)) return v;
    }
    return fallback;
  }

  function toggleLayerExpanded(layerId: string) {
    if (expandedLayers.has(layerId)) {
      expandedLayers.delete(layerId);
    } else {
      expandedLayers.add(layerId);
    }
    expandedLayersVersion++; // Trigger re-render
  }

  function formatValue(value: unknown): string {
    if (typeof value === "boolean") return value ? "true" : "false";
    if (typeof value === "number")
      return Number.isFinite(value) ? value.toFixed(2) : "NaN";
    if (value instanceof Float32Array) {
      return Array.from(value)
        .map((v) => (Number.isFinite(v) ? v.toFixed(2) : "NaN"))
        .join(", ");
    }
    if (Array.isArray(value)) {
      return value
        .map((v) =>
          typeof v === "number" && Number.isFinite(v)
            ? v.toFixed(2)
            : String(v),
        )
        .join(", ");
    }
    if (value === null) return "null";
    if (value === undefined) return "undefined";
    return String(value);
  }

  function getShaderName(key: string): string {
    if (key === "custom") return "Custom Shader";

    // Check fallback shaders
    if (key.startsWith("fallback:")) {
      const fallbackKey = key.replace(
        "fallback:",
        "",
      ) as keyof typeof FALLBACK_SHADERS;
      return FALLBACK_SHADERS[fallbackKey]?.name || key;
    }

    // Find in loaded ISF shaders - use untrack to avoid reactive loops
    const shader = untrack(() => isfShaders.find((s) => s.id === key));
    return shader?.name || key;
  }
</script>

<div class="flex flex-col h-full p-4 gap-4 w-full">
  <!-- Header -->
  <div class="flex items-center justify-between gap-2">
    <h1 class="text-2xl font-bold">Shader Editor</h1>
    {#if !isSupported}
      <span class="text-red-500">WebGPU not supported</span>
    {:else if !isInitialized}
      <span class="text-yellow-500">Initializing...</span>
    {:else}
      <span class="text-green-500">Ready</span>
    {/if}
  </div>

  {#if isLoading}
    <div class="flex-1 flex items-center justify-center">
      <RefreshCw class="w-8 h-8 animate-spin" />
    </div>
  {:else if !isSupported}
    <div class="flex-1 flex items-center justify-center text-muted-foreground">
      WebGPU is not supported in this browser. Please use Chrome 113+ or Edge
      113+.
    </div>
  {:else}
    <div class="flex-1 flex gap-4 overflow-hidden">
      <!-- Left Panel: Contexts & Layers -->
      <div class="w-80 flex flex-col gap-4 overflow-hidden">
        <!-- Contexts -->
        <div class="border rounded-lg p-3 flex flex-col gap-2">
          <div class="flex items-center justify-between">
            <h3 class="font-semibold flex items-center gap-2">
              <Monitor class="w-4 h-4" />
              Render Contexts
            </h3>
            <Button
              size="sm"
              variant="ghost"
              onclick={() => (showAddContextDialog = true)}
            >
              <Plus class="w-4 h-4" />
            </Button>
          </div>

          <div class="flex flex-col gap-1 max-h-40 overflow-y-auto">
            {#each contexts as ctx}
              <div
                class="flex items-center gap-2 p-2 rounded cursor-pointer hover:bg-muted/50"
                class:bg-muted={currentContextId === ctx.id}
                onclick={() => (currentContextId = ctx.id)}
              >
                <button
                  onclick={(e) => {
                    e.stopPropagation();
                    toggleContext(ctx.id);
                  }}
                >
                  {#if ctx.isRunning}
                    <Pause class="w-4 h-4 text-green-500" />
                  {:else}
                    <Play class="w-4 h-4 text-muted-foreground" />
                  {/if}
                </button>
                <span class="flex-1 text-sm truncate">{ctx.id}</span>
                <span class="text-xs text-muted-foreground">
                  {ctx.stats?.fps.toFixed(0) || 0} fps
                </span>
                <button
                  onclick={(e) => {
                    e.stopPropagation();
                    deleteContext(ctx.id);
                  }}
                >
                  <Trash2 class="w-4 h-4 text-destructive" />
                </button>
              </div>
            {/each}

            {#if contexts.length === 0}
              <p class="text-sm text-muted-foreground text-center py-2">
                No contexts. Click + to add one.
              </p>
            {/if}
          </div>
        </div>

        <!-- Layers -->
        <div
          class="border rounded-lg p-3 flex-1 flex flex-col gap-2 overflow-hidden"
        >
          <div class="flex items-center justify-between">
            <h3 class="font-semibold flex items-center gap-2">
              <Layers class="w-4 h-4" />
              Layers
            </h3>
            <Button
              size="sm"
              variant="ghost"
              onclick={() => (showAddLayerDialog = true)}
              disabled={!currentContextId}
            >
              <Plus class="w-4 h-4" />
            </Button>
          </div>

          <div class="flex flex-col gap-1 flex-1 overflow-y-auto">
            <!-- Hidden dependency on expandedLayersVersion for reactivity -->
            {#if expandedLayersVersion >= 0}
              {#each layers.filter((l) => l.contextId === currentContextId) as layer}
                <div
                  class="border rounded p-2"
                  class:border-primary={currentLayerId === layer.id}
                >
                  <div
                    class="flex items-center gap-2 cursor-pointer"
                    onclick={() => {
                      currentLayerId = layer.id;
                      toggleLayerExpanded(layer.id);
                    }}
                  >
                    {#if expandedLayers.has(layer.id)}
                      <ChevronDown class="w-4 h-4" />
                    {:else}
                      <ChevronRight class="w-4 h-4" />
                    {/if}

                    <button
                      onclick={(e) => {
                        e.stopPropagation();
                        toggleLayerEnabled(layer.contextId, layer.id);
                      }}
                    >
                      {#if layer.enabled}
                        <Eye class="w-4 h-4 text-green-500" />
                      {:else}
                        <EyeOff class="w-4 h-4 text-muted-foreground" />
                      {/if}
                    </button>

                    <span class="flex-1 text-sm truncate">{layer.id}</span>
                    <span class="text-xs text-muted-foreground"
                      >{getShaderName(layer.shaderKey)}</span
                    >

                    <button
                      onclick={(e) => {
                        e.stopPropagation();
                        deleteLayer(layer.contextId, layer.id);
                      }}
                    >
                      <Trash2 class="w-3 h-3 text-destructive" />
                    </button>
                  </div>

                  {#if expandedLayers.has(layer.id)}
                    <div class="mt-2 pl-6 flex flex-col gap-2">
                      <!-- Opacity -->
                      <div class="flex items-center gap-2">
                        <Label class="w-16 text-xs">Opacity</Label>
                        <Slider
                          value={[layer.opacity]}
                          min={0}
                          max={1}
                          step={0.01}
                          onValueChange={(v) =>
                            updateLayerOpacity(layer.contextId, layer.id, v[0])}
                          class="flex-1"
                        />
                        <span class="text-xs w-10"
                          >{(layer.opacity * 100).toFixed(0)}%</span
                        >
                      </div>

                      <!-- Blend Mode -->
                      <div class="flex items-center gap-2">
                        <Label class="w-16 text-xs">Blend</Label>
                        <Select.Root
                          type="single"
                          value={layer.blendMode}
                          onValueChange={(v) =>
                            updateLayerBlendMode(
                              layer.contextId,
                              layer.id,
                              v as BlendMode,
                            )}
                        >
                          <Select.Trigger class="flex-1 h-7 text-xs">
                            {layer.blendMode}
                          </Select.Trigger>
                          <Select.Content>
                            {#each blendModes as mode}
                              <Select.Item value={mode}>{mode}</Select.Item>
                            {/each}
                          </Select.Content>
                        </Select.Root>
                      </div>
                    </div>
                  {/if}
                </div>
              {/each}
            {/if}

            {#if layers.filter((l) => l.contextId === currentContextId).length === 0}
              <p class="text-sm text-muted-foreground text-center py-2">
                No layers. Click + to add one.
              </p>
            {/if}
          </div>
        </div>
      </div>

      <!-- Center: Preview -->
      <div
        class="flex-1 border rounded-lg p-4 flex flex-col gap-4 overflow-hidden w-full"
      >
        <h3 class="font-semibold">Preview</h3>
        <div class="flex-1 bg-black rounded-lg overflow-hidden relative w-full">
          <div
            bind:this={previewContainer}
            class="absolute inset-0 flex items-center justify-center"
          ></div>

          {#if !currentContextId}
            <div
              class="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground"
            >
              Create/select a context to preview
            </div>
          {/if}
        </div>
        {#if currentContextId}
          {@const ctx = contexts.find((c) => c.id === currentContextId)}
          {#if ctx}
            <div
              class="flex items-center justify-between text-xs text-muted-foreground"
            >
              <span>{ctx.width} × {ctx.height}</span>
              <span>{ctx.stats?.fps.toFixed(1) || 0} FPS</span>
              <span>Frame: {ctx.stats?.frameCount || 0}</span>
            </div>
          {/if}
        {/if}
      </div>

      <!-- Right Panel: Uniforms -->
      <div
        class="w-80 border rounded-lg p-3 flex flex-col gap-2 overflow-hidden"
      >
        <h3 class="font-semibold flex items-center gap-2">
          <Settings2 class="w-4 h-4" />
          Uniforms
        </h3>

        {#if currentLayerId}
          {@const currentLayer = layers.find(
            (l) => l.id === currentLayerId && l.contextId === currentContextId,
          )}
          {#if currentLayer}
            <div class="flex-1 overflow-y-auto flex flex-col gap-3">
              {#each currentLayer.uniforms as uniform}
                <div class="border rounded p-2 flex flex-col gap-2">
                  <div class="flex items-center justify-between">
                    <Label class="text-sm font-medium"
                      >{uniform.label || uniform.name}</Label
                    >
                    <span class="text-xs text-muted-foreground"
                      >{uniform.type}</span
                    >
                  </div>

                  {#if uniform.type === "float" || uniform.type === "int"}
                    <div class="flex items-center gap-2">
                      <Slider
                        value={[uniform.value as number]}
                        min={getNumericBound(uniform.min, 0, 0)}
                        max={getNumericBound(uniform.max, 0, 1)}
                        step={uniform.type === "int" ? 1 : 0.01}
                        onValueChange={(v) =>
                          updateUniform(
                            currentLayer.contextId,
                            currentLayer.id,
                            uniform.name,
                            v[0],
                          )}
                        class="flex-1"
                        disabled={!!uniform.binding?.valueId}
                      />
                      <span class="text-xs w-12 text-right">
                        {(uniform.value as number).toFixed(
                          uniform.type === "int" ? 0 : 2,
                        )}
                      </span>
                      <button
                        onclick={() =>
                          openBindingDialog(
                            currentLayer.contextId,
                            currentLayer.id,
                            uniform.name,
                            uniform.type,
                          )}
                        class="p-1 hover:bg-muted rounded"
                        title={uniform.binding?.valueId
                          ? "Edit binding"
                          : "Add binding"}
                      >
                        {#if uniform.binding?.valueId}
                          <Link class="w-4 h-4 text-primary" />
                        {:else}
                          <Unlink class="w-4 h-4 text-muted-foreground" />
                        {/if}
                      </button>
                    </div>
                    {#if uniform.binding?.valueId}
                      <div
                        class="text-xs text-muted-foreground flex items-center gap-1"
                      >
                        <Link class="w-3 h-3" />
                        {uniform.binding.valueId}
                        <button
                          onclick={() =>
                            removeBinding(
                              currentLayer.contextId,
                              currentLayer.id,
                              uniform.name,
                            )}
                          class="ml-auto text-destructive"
                        >
                          <Trash2 class="w-3 h-3" />
                        </button>
                      </div>
                    {/if}
                  {:else if uniform.type === "bool"}
                    <Switch
                      checked={uniform.value as boolean}
                      onCheckedChange={(v) =>
                        updateUniform(
                          currentLayer.contextId,
                          currentLayer.id,
                          uniform.name,
                          v,
                        )}
                    />
                  {:else if uniform.type === "color" || uniform.type === "vec4"}
                    {@const colorValue = uniform.value as number[]}
                    <div class="flex flex-col gap-2">
                      <!-- Color preview -->
                      <div
                        class="h-8 rounded border"
                        style="background-color: rgba({colorValue[0] *
                          255}, {colorValue[1] * 255}, {colorValue[2] *
                          255}, {colorValue[3]})"
                      ></div>

                      <!-- R channel -->
                      <div class="flex items-center gap-2">
                        <span class="text-xs w-4 text-red-500">R</span>
                        <Slider
                          value={[colorValue[0]]}
                          min={0}
                          max={1}
                          step={0.01}
                          onValueChange={(v) =>
                            updateColorChannel(
                              currentLayer.contextId,
                              currentLayer.id,
                              uniform.name,
                              0,
                              v[0],
                            )}
                          class="flex-1"
                          disabled={!!uniform.colorBinding?.r?.valueId}
                        />
                        <span class="text-xs w-8"
                          >{colorValue[0].toFixed(2)}</span
                        >
                        <button
                          onclick={() =>
                            openBindingDialog(
                              currentLayer.contextId,
                              currentLayer.id,
                              uniform.name,
                              uniform.type,
                              "r",
                            )}
                          class="p-1 hover:bg-muted rounded"
                        >
                          {#if uniform.colorBinding?.r?.valueId}
                            <Link class="w-3 h-3 text-primary" />
                          {:else}
                            <Unlink class="w-3 h-3 text-muted-foreground" />
                          {/if}
                        </button>
                      </div>

                      <!-- G channel -->
                      <div class="flex items-center gap-2">
                        <span class="text-xs w-4 text-green-500">G</span>
                        <Slider
                          value={[colorValue[1]]}
                          min={0}
                          max={1}
                          step={0.01}
                          onValueChange={(v) =>
                            updateColorChannel(
                              currentLayer.contextId,
                              currentLayer.id,
                              uniform.name,
                              1,
                              v[0],
                            )}
                          class="flex-1"
                          disabled={!!uniform.colorBinding?.g?.valueId}
                        />
                        <span class="text-xs w-8"
                          >{colorValue[1].toFixed(2)}</span
                        >
                        <button
                          onclick={() =>
                            openBindingDialog(
                              currentLayer.contextId,
                              currentLayer.id,
                              uniform.name,
                              uniform.type,
                              "g",
                            )}
                          class="p-1 hover:bg-muted rounded"
                        >
                          {#if uniform.colorBinding?.g?.valueId}
                            <Link class="w-3 h-3 text-primary" />
                          {:else}
                            <Unlink class="w-3 h-3 text-muted-foreground" />
                          {/if}
                        </button>
                      </div>

                      <!-- B channel -->
                      <div class="flex items-center gap-2">
                        <span class="text-xs w-4 text-blue-500">B</span>
                        <Slider
                          value={[colorValue[2]]}
                          min={0}
                          max={1}
                          step={0.01}
                          onValueChange={(v) =>
                            updateColorChannel(
                              currentLayer.contextId,
                              currentLayer.id,
                              uniform.name,
                              2,
                              v[0],
                            )}
                          class="flex-1"
                          disabled={!!uniform.colorBinding?.b?.valueId}
                        />
                        <span class="text-xs w-8"
                          >{colorValue[2].toFixed(2)}</span
                        >
                        <button
                          onclick={() =>
                            openBindingDialog(
                              currentLayer.contextId,
                              currentLayer.id,
                              uniform.name,
                              uniform.type,
                              "b",
                            )}
                          class="p-1 hover:bg-muted rounded"
                        >
                          {#if uniform.colorBinding?.b?.valueId}
                            <Link class="w-3 h-3 text-primary" />
                          {:else}
                            <Unlink class="w-3 h-3 text-muted-foreground" />
                          {/if}
                        </button>
                      </div>

                      <!-- A channel -->
                      <div class="flex items-center gap-2">
                        <span class="text-xs w-4 text-gray-500">A</span>
                        <Slider
                          value={[colorValue[3]]}
                          min={0}
                          max={1}
                          step={0.01}
                          onValueChange={(v) =>
                            updateColorChannel(
                              currentLayer.contextId,
                              currentLayer.id,
                              uniform.name,
                              3,
                              v[0],
                            )}
                          class="flex-1"
                          disabled={!!uniform.colorBinding?.a?.valueId}
                        />
                        <span class="text-xs w-8"
                          >{colorValue[3].toFixed(2)}</span
                        >
                        <button
                          onclick={() =>
                            openBindingDialog(
                              currentLayer.contextId,
                              currentLayer.id,
                              uniform.name,
                              uniform.type,
                              "a",
                            )}
                          class="p-1 hover:bg-muted rounded"
                        >
                          {#if uniform.colorBinding?.a?.valueId}
                            <Link class="w-3 h-3 text-primary" />
                          {:else}
                            <Unlink class="w-3 h-3 text-muted-foreground" />
                          {/if}
                        </button>
                      </div>
                    </div>
                  {:else if uniform.type === "vec2" || uniform.type === "point2D"}
                    {@const vec2Value = uniform.value as number[]}
                    <div class="flex flex-col gap-2">
                      <div class="flex items-center gap-2">
                        <span class="text-xs w-4">X</span>
                        <Slider
                          value={[vec2Value[0]]}
                          min={getNumericBound(uniform.min, 0, 0)}
                          max={getNumericBound(uniform.max, 0, 1)}
                          step={0.01}
                          onValueChange={(v) => {
                            const newVal = [...vec2Value];
                            newVal[0] = v[0];
                            updateUniform(
                              currentLayer.contextId,
                              currentLayer.id,
                              uniform.name,
                              newVal,
                            );
                          }}
                          class="flex-1"
                        />
                        <span class="text-xs w-10"
                          >{vec2Value[0].toFixed(2)}</span
                        >
                      </div>
                      <div class="flex items-center gap-2">
                        <span class="text-xs w-4">Y</span>
                        <Slider
                          value={[vec2Value[1]]}
                          min={getNumericBound(uniform.min, 1, 0)}
                          max={getNumericBound(uniform.max, 1, 1)}
                          step={0.01}
                          onValueChange={(v) => {
                            const newVal = [...vec2Value];
                            newVal[1] = v[0];
                            updateUniform(
                              currentLayer.contextId,
                              currentLayer.id,
                              uniform.name,
                              newVal,
                            );
                          }}
                          class="flex-1"
                        />
                        <span class="text-xs w-10"
                          >{vec2Value[1].toFixed(2)}</span
                        >
                      </div>
                    </div>
                  {:else if uniform.type === "vec3"}
                    {@const vec3Value = uniform.value as number[]}
                    <div class="flex flex-col gap-2">
                      {#each ["X", "Y", "Z"] as label, i}
                        <div class="flex items-center gap-2">
                          <span class="text-xs w-4">{label}</span>
                          <Slider
                            value={[vec3Value[i]]}
                            min={getNumericBound(uniform.min, i, 0)}
                            max={getNumericBound(uniform.max, i, 1)}
                            step={0.01}
                            onValueChange={(v) => {
                              const newVal = [...vec3Value];
                              newVal[i] = v[0];
                              updateUniform(
                                currentLayer.contextId,
                                currentLayer.id,
                                uniform.name,
                                newVal,
                              );
                            }}
                            class="flex-1"
                          />
                          <span class="text-xs w-10"
                            >{vec3Value[i].toFixed(2)}</span
                          >
                        </div>
                      {/each}
                    </div>
                  {:else}
                    <span class="text-xs text-muted-foreground"
                      >{formatValue(uniform.value)}</span
                    >
                  {/if}
                </div>
              {/each}
            </div>
          {/if}
        {:else}
          <p class="text-sm text-muted-foreground text-center py-4">
            Select a layer to edit its uniforms
          </p>
        {/if}
      </div>
    </div>
  {/if}
</div>

<!-- Add Context Dialog -->
<Dialog.Root bind:open={showAddContextDialog}>
  <Dialog.Content>
    <Dialog.Header>
      <Dialog.Title>Add Render Context</Dialog.Title>
      <Dialog.Description>Create a new rendering canvas</Dialog.Description>
    </Dialog.Header>

    <div class="flex flex-col gap-4 py-4">
      <div class="flex flex-col gap-2">
        <Label>Context ID</Label>
        <Input bind:value={newContextForm.id} placeholder="main" />
      </div>

      <div class="grid grid-cols-2 gap-4">
        <div class="flex flex-col gap-2">
          <Label>Width</Label>
          <Input type="number" bind:value={newContextForm.width} />
        </div>
        <div class="flex flex-col gap-2">
          <Label>Height</Label>
          <Input type="number" bind:value={newContextForm.height} />
        </div>
      </div>

      <div class="flex flex-col gap-2">
        <Label>FPS Limit</Label>
        <Input
          type="number"
          bind:value={newContextForm.fpsLimit}
          min={1}
          max={240}
        />
      </div>
    </div>

    <Dialog.Footer>
      <Button variant="outline" onclick={() => (showAddContextDialog = false)}
        >Cancel</Button
      >
      <Button onclick={createContext}>Create</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<!-- Add Layer Dialog -->
<Dialog.Root bind:open={showAddLayerDialog}>
  <Dialog.Content class="max-w-2xl">
    <Dialog.Header>
      <Dialog.Title>Add Shader Layer</Dialog.Title>
      <Dialog.Description
        >Add a new shader to the current context</Dialog.Description
      >
    </Dialog.Header>

    <div class="flex flex-col gap-4 py-4">
      <div class="flex flex-col gap-2">
        <Label>Layer ID</Label>
        <Input bind:value={newLayerForm.id} placeholder="effect1" />
      </div>

      <!-- Shader Browser -->
      <div class="flex flex-col gap-2">
        <Label>Shader</Label>

        <!-- Search & Category Filter -->
        <div class="flex gap-2">
          <div class="relative flex-1">
            <Search
              class="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground"
            />
            <Input
              class="pl-8"
              bind:value={isfSearchQuery}
              placeholder="Search shaders..."
            />
          </div>
          <Select.Root
            type="single"
            value={isfSelectedCategory || ""}
            onValueChange={(v) => (isfSelectedCategory = v || null)}
          >
            <Select.Trigger class="w-40">
              <FolderOpen class="h-4 w-4 mr-2" />
              {isfSelectedCategory || "All Categories"}
            </Select.Trigger>
            <Select.Content>
              <Select.Item value="">All Categories</Select.Item>
              {#each isfCategories as category}
                <Select.Item value={category}>{category}</Select.Item>
              {/each}
            </Select.Content>
          </Select.Root>
        </div>

        <!-- Shader List -->
        <div class="h-48 overflow-y-auto border rounded p-2 bg-muted/50">
          {#if isLoadingShaders}
            <div class="flex items-center justify-center h-full">
              <RefreshCw class="w-6 h-6 animate-spin" />
            </div>
          {:else}
            <div class="grid grid-cols-2 gap-1">
              {#each filteredShaders as shader}
                <button
                  class="text-left px-2 py-1.5 rounded text-sm hover:bg-accent transition-colors {newLayerForm.shaderId ===
                  shader.id
                    ? 'bg-accent ring-1 ring-primary'
                    : ''}"
                  onclick={() => (newLayerForm.shaderId = shader.id)}
                >
                  <div class="font-medium truncate">{shader.name}</div>
                  <div class="text-xs text-muted-foreground">
                    {shader.category}
                  </div>
                </button>
              {/each}
              <!-- Custom shader option -->
              <button
                class="text-left px-2 py-1.5 rounded text-sm hover:bg-accent transition-colors {newLayerForm.shaderId ===
                'custom'
                  ? 'bg-accent ring-1 ring-primary'
                  : ''}"
                onclick={() => (newLayerForm.shaderId = "custom")}
              >
                <div class="font-medium flex items-center gap-1">
                  <Code class="h-3 w-3" />
                  Custom Shader
                </div>
                <div class="text-xs text-muted-foreground">Write your own</div>
              </button>
            </div>
          {/if}
        </div>

        {#if newLayerForm.shaderId}
          <div class="text-sm text-muted-foreground">
            Selected: <span class="font-medium"
              >{getShaderName(newLayerForm.shaderId)}</span
            >
          </div>
        {/if}
      </div>

      {#if newLayerForm.shaderId === "custom"}
        <div class="flex flex-col gap-2">
          <Label>Shader Source (ISF)</Label>
          <textarea
            class="min-h-32 p-2 border rounded text-xs font-mono bg-muted"
            bind:value={newLayerForm.customSource}
            placeholder="Paste your ISF shader here..."
          ></textarea>
        </div>
      {/if}
    </div>

    <Dialog.Footer>
      <Button variant="outline" onclick={() => (showAddLayerDialog = false)}
        >Cancel</Button
      >
      <Button
        onclick={addLayer}
        disabled={!newLayerForm.id || !newLayerForm.shaderId}>Add Layer</Button
      >
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<!-- Binding Dialog -->
<Dialog.Root bind:open={showBindingDialog}>
  <Dialog.Content>
    <Dialog.Header>
      <Dialog.Title>Value Binding</Dialog.Title>
      <Dialog.Description>
        Bind a value to {bindingTarget?.uniformName}
        {#if bindingTarget?.channel}
          ({bindingTarget.channel.toUpperCase()} channel)
        {/if}
      </Dialog.Description>
    </Dialog.Header>

    <div class="flex flex-col gap-4 py-4">
      <div class="flex flex-col gap-2">
        <Label>Value Source</Label>
        <Select.Root
          type="single"
          value={bindingForm.valueId}
          onValueChange={(v) => (bindingForm.valueId = v)}
        >
          <Select.Trigger>
            {bindingForm.valueId || "Select a value..."}
          </Select.Trigger>
          <Select.Content>
            <Select.Item value="">None (manual)</Select.Item>
            {#each availableValues as val}
              <Select.Item value={val.id}>{val.name} ({val.id})</Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
      </div>

      {#if bindingForm.valueId}
        <div class="border rounded p-3 flex flex-col gap-3">
          <h4 class="font-medium text-sm">Value Mapping</h4>

          <div class="grid grid-cols-2 gap-4">
            <div class="flex flex-col gap-2">
              <Label class="text-xs">Input Min</Label>
              <Input
                type="number"
                bind:value={bindingForm.inputMin}
                step={0.01}
              />
            </div>
            <div class="flex flex-col gap-2">
              <Label class="text-xs">Input Max</Label>
              <Input
                type="number"
                bind:value={bindingForm.inputMax}
                step={0.01}
              />
            </div>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div class="flex flex-col gap-2">
              <Label class="text-xs">Output Min</Label>
              <Input
                type="number"
                bind:value={bindingForm.outputMin}
                step={0.01}
              />
            </div>
            <div class="flex flex-col gap-2">
              <Label class="text-xs">Output Max</Label>
              <Input
                type="number"
                bind:value={bindingForm.outputMax}
                step={0.01}
              />
            </div>
          </div>

          <p class="text-xs text-muted-foreground">
            Maps input [{bindingForm.inputMin}, {bindingForm.inputMax}] → output
            [{bindingForm.outputMin}, {bindingForm.outputMax}]
          </p>
        </div>
      {/if}
    </div>

    <Dialog.Footer>
      <Button variant="outline" onclick={() => (showBindingDialog = false)}
        >Cancel</Button
      >
      <Button onclick={saveBinding}>Save Binding</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
