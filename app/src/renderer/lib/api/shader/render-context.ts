// ============================================
// Visoic Shader API - Render Context
// ============================================

/// <reference types="@webgpu/types" />

import { EventEmitter } from './event-emitter';
import { ShaderLayer } from './shader-layer';
import type {
  RenderContextConfig,
  RenderContextEvents,
  RenderStats,
  ShaderLayerConfig,
  ShaderError,
} from './types';

/**
 * Render Context - Manages a single canvas and its shader layers
 * 
 * Each context can have multiple shader layers that are composited together.
 * Supports FPS limiting and render statistics.
 */
export class RenderContext extends EventEmitter<RenderContextEvents> {
  readonly id: string;
  readonly canvas: HTMLCanvasElement | OffscreenCanvas;

  private device: GPUDevice | null = null;
  private context: GPUCanvasContext | null = null;
  private format: GPUTextureFormat = 'bgra8unorm';

  private layers: Map<string, ShaderLayer> = new Map();
  private layerOrder: string[] = [];

  private width: number;
  private height: number;
  private pixelRatio: number;
  private fpsLimit: number;
  private minFrameTime: number;

  private _isRunning: boolean = false;
  private animationFrameId: number | null = null;
  private lastFrameTime: number = 0;
  private frameCount: number = 0;
  private fpsAccumulator: number = 0;
  private fpsFrameCount: number = 0;
  private currentFps: number = 0;

  private startTime: number = 0;
  private lastRenderTime: number = 0;

  private placeholderTextureView: GPUTextureView | null = null;
  private placeholderSampler: GPUSampler | null = null;
  private layerTextureViews: Map<string, Map<string, GPUTextureView>> = new Map();

  // Intermediate textures for layer compositing (ping-pong pattern)
  private intermediateTextureA: GPUTexture | null = null;
  private intermediateTextureB: GPUTexture | null = null;
  private intermediateTextureViewA: GPUTextureView | null = null;
  private intermediateTextureViewB: GPUTextureView | null = null;
  private currentReadTexture: 'A' | 'B' | null = null;

  // Per-layer output textures for dependency-based shader chains
  // Each layer stores its rendered output so other layers can use it as input
  private layerOutputTextures: Map<string, GPUTexture> = new Map();
  private layerOutputTextureViews: Map<string, GPUTextureView> = new Map();

  // Per-layer output canvases for external access (e.g., output windows)
  // Each layer can have its own canvas showing only that layer's output
  private layerOutputCanvases: Map<string, HTMLCanvasElement> = new Map();
  private layerOutputCanvasContexts: Map<string, GPUCanvasContext> = new Map();

  // Input source mapping: which layer's output should be used for which input
  // Map<targetLayerId, Map<inputName, sourceLayerId>>
  private layerInputSources: Map<string, Map<string, string>> = new Map();

  // Blit pipeline for copying intermediate texture to canvas (swap chain doesn't support CopyDst)
  private blitPipeline: GPURenderPipeline | null = null;
  private blitBindGroupLayout: GPUBindGroupLayout | null = null;
  private blitSampler: GPUSampler | null = null;

  // Performance optimizations
  private bindGroupCache: Map<string, { bindGroup: GPUBindGroup; inputImageView: GPUTextureView | null }> = new Map();
  private vsyncEnabled: boolean = true;
  private highFpsChannel: MessageChannel | null = null;

  // Last shader error
  private _lastShaderError: ShaderError | null = null;

  constructor(config: RenderContextConfig) {
    super();
    this.id = config.id;
    this.canvas = config.canvas;
    this.width = config.width ?? this.canvas.width;
    this.height = config.height ?? this.canvas.height;
    this.pixelRatio = config.pixelRatio ?? (typeof window !== 'undefined' ? window.devicePixelRatio : 1);
    this.fpsLimit = config.fpsLimit ?? 60;
    this.minFrameTime = 1000 / this.fpsLimit;
  }

  /**
   * Initialize WebGPU
   */
  async initialize(device: GPUDevice): Promise<void> {
    this.device = device;

    // Get canvas context
    this.context = this.canvas.getContext('webgpu') as GPUCanvasContext;
    if (!this.context) {
      throw new Error('Failed to get WebGPU context');
    }

    // Configure the context
    this.format = navigator.gpu.getPreferredCanvasFormat();
    this.context.configure({
      device: this.device,
      format: this.format,
      alphaMode: 'premultiplied',
    });

    // Set canvas size
    this.resize(this.width, this.height);

    this.startTime = performance.now();
    this.lastRenderTime = this.startTime;

    this.createPlaceholderTexture();
    this.createIntermediateTextures();
    this.createBlitPipeline();
  }

  private createPlaceholderTexture(): void {
    if (!this.device) return;

    const texture = this.device.createTexture({
      label: `${this.id}-placeholder-texture`,
      size: { width: 1, height: 1, depthOrArrayLayers: 1 },
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });

    // White pixel
    const pixel = new Uint8Array([255, 255, 255, 255]);
    this.device.queue.writeTexture(
      { texture },
      pixel,
      { bytesPerRow: 4, rowsPerImage: 1 },
      { width: 1, height: 1, depthOrArrayLayers: 1 },
    );

    this.placeholderTextureView = texture.createView();
    this.placeholderSampler = this.device.createSampler({
      label: `${this.id}-placeholder-sampler`,
      magFilter: 'linear',
      minFilter: 'linear',
      mipmapFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    });
  }

  private createIntermediateTextures(): void {
    if (!this.device) return;

    const size = {
      width: this.canvas.width,
      height: this.canvas.height,
      depthOrArrayLayers: 1,
    };

    this.intermediateTextureA = this.device.createTexture({
      label: `${this.id}-intermediate-A`,
      size,
      format: this.format,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC,
    });

    this.intermediateTextureB = this.device.createTexture({
      label: `${this.id}-intermediate-B`,
      size,
      format: this.format,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC,
    });

    this.intermediateTextureViewA = this.intermediateTextureA.createView();
    this.intermediateTextureViewB = this.intermediateTextureB.createView();
    this.currentReadTexture = null;
  }

  /**
   * Create a simple blit pipeline for copying texture to canvas.
   * This is needed because swap chain textures don't support CopyDst usage.
   */
  private createBlitPipeline(): void {
    if (!this.device) return;

    // Simple fullscreen blit shader
    const blitShaderCode = `
      struct VertexOutput {
        @builtin(position) position: vec4f,
        @location(0) uv: vec2f,
      }

      @vertex
      fn vertexMain(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
        // Full-screen triangle
        var pos = array<vec2f, 3>(
          vec2f(-1.0, -1.0),
          vec2f(3.0, -1.0),
          vec2f(-1.0, 3.0)
        );
        var uv = array<vec2f, 3>(
          vec2f(0.0, 1.0),
          vec2f(2.0, 1.0),
          vec2f(0.0, -1.0)
        );
        var output: VertexOutput;
        output.position = vec4f(pos[vertexIndex], 0.0, 1.0);
        output.uv = uv[vertexIndex];
        return output;
      }

      @group(0) @binding(0) var srcTexture: texture_2d<f32>;
      @group(0) @binding(1) var srcSampler: sampler;

      @fragment
      fn fragmentMain(@location(0) uv: vec2f) -> @location(0) vec4f {
        return textureSample(srcTexture, srcSampler, uv);
      }
    `;

    const blitShaderModule = this.device.createShaderModule({
      label: 'blit-shader',
      code: blitShaderCode,
    });

    this.blitBindGroupLayout = this.device.createBindGroupLayout({
      label: 'blit-bind-group-layout',
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: 'float' },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: { type: 'filtering' },
        },
      ],
    });

    const blitPipelineLayout = this.device.createPipelineLayout({
      label: 'blit-pipeline-layout',
      bindGroupLayouts: [this.blitBindGroupLayout],
    });

    this.blitPipeline = this.device.createRenderPipeline({
      label: 'blit-pipeline',
      layout: blitPipelineLayout,
      vertex: {
        module: blitShaderModule,
        entryPoint: 'vertexMain',
      },
      fragment: {
        module: blitShaderModule,
        entryPoint: 'fragmentMain',
        targets: [{ format: this.format }],
      },
      primitive: {
        topology: 'triangle-list',
      },
    });

    this.blitSampler = this.device.createSampler({
      label: 'blit-sampler',
      magFilter: 'linear',
      minFilter: 'linear',
    });
  }

  private getLayerTextureView(layer: ShaderLayer, name: string): GPUTextureView {
    if (!this.device) throw new Error('Device not initialized');
    if (!this.placeholderTextureView) this.createPlaceholderTexture();

    let perLayer = this.layerTextureViews.get(layer.id);
    if (!perLayer) {
      perLayer = new Map();
      this.layerTextureViews.set(layer.id, perLayer);
    }

    const existing = perLayer.get(name);
    if (existing) return existing;

    // Default to placeholder until we have an external image.
    perLayer.set(name, this.placeholderTextureView!);
    return this.placeholderTextureView!;
  }

  private updateLayerTextureFromExternalSource(
    layer: ShaderLayer,
    name: string,
    source: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement,
  ): void {
    if (!this.device) return;

    // Determine size
    const width = (source as HTMLVideoElement).videoWidth ?? (source as HTMLImageElement).naturalWidth ?? (source as HTMLCanvasElement).width;
    const height = (source as HTMLVideoElement).videoHeight ?? (source as HTMLImageElement).naturalHeight ?? (source as HTMLCanvasElement).height;
    if (!width || !height) return;

    let perLayer = this.layerTextureViews.get(layer.id);
    if (!perLayer) {
      perLayer = new Map();
      this.layerTextureViews.set(layer.id, perLayer);
    }

    // Create a new texture each time size changes; otherwise, reuse the view.
    const existing = perLayer.get(name);
    const needsNew = existing === this.placeholderTextureView;

    if (needsNew) {
      const texture = this.device.createTexture({
        label: `${layer.id}-${name}-texture`,
        size: { width, height, depthOrArrayLayers: 1 },
        format: 'rgba8unorm',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
      });
      perLayer.set(name, texture.createView());
    }

    // Best-effort upload for dynamic sources.
    try {
      const view = perLayer.get(name);
      if (!view) return;

      // Unfortunately WebGPU doesn't let us get the texture from a view; recreate on each update is heavy.
      // For now, only upload when we just created the texture (placeholder -> real).
      // Future improvement: store GPUTexture alongside the view.
      if (needsNew) {
        // Recreate the texture again to upload into it (since we don't retain the handle above).
        const texture = this.device.createTexture({
          label: `${layer.id}-${name}-texture-upload`,
          size: { width, height, depthOrArrayLayers: 1 },
          format: 'rgba8unorm',
          usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
        });
        this.device.queue.copyExternalImageToTexture(
          { source },
          { texture },
          { width, height, depthOrArrayLayers: 1 },
        );
        perLayer.set(name, texture.createView());
      }
    } catch (e) {
      console.warn(`[RenderContext] Failed to upload texture ${name} for layer ${layer.id}`, e);
    }
  }

  /**
   * Resize the canvas
   */
  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;

    if (this.canvas instanceof HTMLCanvasElement) {
      this.canvas.width = width * this.pixelRatio;
      this.canvas.height = height * this.pixelRatio;
      this.canvas.style.width = `${width}px`;
      this.canvas.style.height = `${height}px`;
    } else {
      this.canvas.width = width * this.pixelRatio;
      this.canvas.height = height * this.pixelRatio;
    }

    // Reconfigure context
    if (this.context && this.device) {
      this.context.configure({
        device: this.device,
        format: this.format,
        alphaMode: 'premultiplied',
      });

      // Recreate intermediate textures with new size
      this.createIntermediateTextures();
    }

    this.emit('resize', { width, height });
  }

  /**
   * Set FPS limit (0 = unlimited/vsync only)
   */
  setFpsLimit(fps: number): void {
    if (fps === 0) {
      // Unlimited - rely on vsync or GPU timing
      this.fpsLimit = 0;
      this.minFrameTime = 0;
      this.vsyncEnabled = true;
    } else {
      this.fpsLimit = Math.max(1, Math.min(1000, fps));
      this.minFrameTime = 1000 / this.fpsLimit;
      this.vsyncEnabled = fps <= 60;
    }
  }

  /**
   * Enable/disable vsync-based rendering
   */
  setVsyncEnabled(enabled: boolean): void {
    this.vsyncEnabled = enabled;
  }

  /**
   * Get current FPS limit
   */
  getFpsLimit(): number {
    return this.fpsLimit;
  }

  /**
   * Get context configuration
   */
  getConfig(): { id: string; width: number; height: number; fpsLimit: number } {
    return {
      id: this.id,
      width: this.width,
      height: this.height,
      fpsLimit: this.fpsLimit,
    };
  }

  /**
   * Check if render loop is running
   */
  isRunning(): boolean {
    return this._isRunning;
  }

  /**
   * Get the last shader compilation error (if any)
   */
  getLastShaderError(): ShaderError | null {
    return this._lastShaderError;
  }

  /**
   * Clear the last shader error
   */
  clearLastShaderError(): void {
    this._lastShaderError = null;
  }

  /**
   * Add a shader layer
   */
  addLayer(config: ShaderLayerConfig): ShaderLayer {
    const layer = new ShaderLayer(config);
    this.layers.set(layer.id, layer);
    this.layerOrder.push(layer.id);

    // Create GPU resources for the layer
    if (this.device && layer.isCompiled()) {
      this.createLayerResources(layer);
    } else {
      console.warn(`[RenderContext] Layer ${layer.id} not ready: device=${!!this.device}, compiled=${layer.isCompiled()}`);
      if (!layer.isCompiled()) {
        const result = layer.getCompileResult();
        console.warn(`[RenderContext] Compile result:`, result?.error || 'No error but not compiled');
      }
    }

    this.emit('layer:added', { layerId: layer.id });
    return layer;
  }

  /**
   * Remove a shader layer
   */
  removeLayer(layerId: string): boolean {
    const layer = this.layers.get(layerId);
    if (!layer) return false;

    layer.destroy();
    this.layers.delete(layerId);
    this.layerOrder = this.layerOrder.filter(id => id !== layerId);

    // Clean up output texture
    this.destroyLayerOutputTexture(layerId);

    // Clean up input source mappings
    this.layerInputSources.delete(layerId);
    // Also remove this layer as a source from other layers
    for (const [, inputMap] of this.layerInputSources) {
      for (const [inputName, sourceId] of inputMap) {
        if (sourceId === layerId) {
          inputMap.delete(inputName);
        }
      }
    }

    // Clean up bind group cache
    this.bindGroupCache.delete(layerId);

    this.emit('layer:removed', { layerId });
    return true;
  }

  /**
   * Get a layer by ID
   */
  getLayer(layerId: string): ShaderLayer | undefined {
    return this.layers.get(layerId);
  }

  /**
   * Get all layers in order
   */
  getLayers(): ShaderLayer[] {
    return this.layerOrder.map(id => this.layers.get(id)!).filter(Boolean);
  }

  /**
   * Reorder layers
   */
  setLayerOrder(order: string[]): void {
    // Validate all IDs exist
    if (order.every(id => this.layers.has(id))) {
      this.layerOrder = order;
    }
  }

  /**
   * Move layer to index
   */
  moveLayer(layerId: string, toIndex: number): void {
    const fromIndex = this.layerOrder.indexOf(layerId);
    if (fromIndex === -1) return;

    this.layerOrder.splice(fromIndex, 1);
    this.layerOrder.splice(toIndex, 0, layerId);
  }

  // ============================================
  // Layer Input Source Management (Dependency-Based)
  // ============================================

  /**
   * Set which layer's output should be used as input for another layer
   * This enables dependency-based shader chains where one shader's output
   * feeds into another shader's input
   * 
   * @param targetLayerId - The layer that will receive the input
   * @param inputName - The name of the input (e.g., 'inputImage')
   * @param sourceLayerId - The layer whose output will be used, or null to clear
   */
  setLayerInputSource(targetLayerId: string, inputName: string, sourceLayerId: string | null): void {
    if (!this.layers.has(targetLayerId)) return;
    if (sourceLayerId && !this.layers.has(sourceLayerId)) return;

    let inputMap = this.layerInputSources.get(targetLayerId);
    if (!inputMap) {
      inputMap = new Map();
      this.layerInputSources.set(targetLayerId, inputMap);
    }

    if (sourceLayerId) {
      inputMap.set(inputName, sourceLayerId);
      // Ensure source layer has an output texture
      this.ensureLayerOutputTexture(sourceLayerId);
    } else {
      inputMap.delete(inputName);
    }

    // Invalidate bind group cache for target layer
    this.bindGroupCache.delete(targetLayerId);
  }

  /**
   * Get the input source mapping for a layer
   */
  getLayerInputSources(layerId: string): Map<string, string> | undefined {
    return this.layerInputSources.get(layerId);
  }

  /**
   * Get the output texture view for a layer (if it has been rendered)
   */
  getLayerOutputTextureView(layerId: string): GPUTextureView | null {
    return this.layerOutputTextureViews.get(layerId) ?? null;
  }

  /**
   * Ensure a layer has an output texture for its rendered result
   */
  private ensureLayerOutputTexture(layerId: string): void {
    if (!this.device || this.layerOutputTextures.has(layerId)) return;

    const texture = this.device.createTexture({
      label: `layer-output-${layerId}`,
      size: [this.width, this.height],
      format: this.format,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC | GPUTextureUsage.COPY_DST,
    });

    this.layerOutputTextures.set(layerId, texture);
    this.layerOutputTextureViews.set(layerId, texture.createView());
  }

  /**
   * Clean up output texture for a layer
   */
  private destroyLayerOutputTexture(layerId: string): void {
    const texture = this.layerOutputTextures.get(layerId);
    if (texture) {
      texture.destroy();
      this.layerOutputTextures.delete(layerId);
      this.layerOutputTextureViews.delete(layerId);
    }
  }

  /**
   * Ensure a layer has an output canvas for viewing its individual output
   */
  ensureLayerOutputCanvas(layerId: string): HTMLCanvasElement | null {
    if (!this.device) return null;

    // Check if canvas already exists
    let canvas = this.layerOutputCanvases.get(layerId);
    if (canvas) return canvas;

    // Create new canvas for this layer
    canvas = document.createElement('canvas');
    canvas.width = this.width;
    canvas.height = this.height;
    canvas.style.width = '100%';
    canvas.style.height = '100%';

    // Configure canvas for WebGPU
    const gpuContext = canvas.getContext('webgpu');
    if (!gpuContext) {
      console.error(`[RenderContext] Failed to get WebGPU context for layer ${layerId}`);
      return null;
    }

    gpuContext.configure({
      device: this.device,
      format: this.format,
      alphaMode: 'premultiplied',
    });

    this.layerOutputCanvases.set(layerId, canvas);
    this.layerOutputCanvasContexts.set(layerId, gpuContext);

    // Also ensure the layer has an output texture
    this.ensureLayerOutputTexture(layerId);

    return canvas;
  }

  /**
   * Get the output canvas for a layer (creates it if needed)
   */
  getLayerOutputCanvas(layerId: string): HTMLCanvasElement | null {
    return this.ensureLayerOutputCanvas(layerId);
  }

  /**
   * Blit a layer's output texture to its dedicated canvas
   * Call this after rendering to update the layer's output canvas
   */
  blitLayerOutputToCanvas(layerId: string): void {
    if (!this.device || !this.blitPipeline || !this.blitBindGroupLayout || !this.blitSampler) return;

    const textureView = this.layerOutputTextureViews.get(layerId);
    const gpuContext = this.layerOutputCanvasContexts.get(layerId);

    if (!textureView || !gpuContext) return;

    try {
      const canvasTextureView = gpuContext.getCurrentTexture().createView();

      // Create bind group for blit
      const blitBindGroup = this.device.createBindGroup({
        label: `blit-layer-${layerId}`,
        layout: this.blitBindGroupLayout,
        entries: [
          { binding: 0, resource: textureView },
          { binding: 1, resource: this.blitSampler },
        ],
      });

      const commandEncoder = this.device.createCommandEncoder();

      const blitPass = commandEncoder.beginRenderPass({
        colorAttachments: [
          {
            view: canvasTextureView,
            loadOp: 'clear',
            storeOp: 'store',
            clearValue: { r: 0, g: 0, b: 0, a: 1 },
          },
        ],
      });

      blitPass.setPipeline(this.blitPipeline);
      blitPass.setBindGroup(0, blitBindGroup);
      blitPass.draw(3);
      blitPass.end();

      this.device.queue.submit([commandEncoder.finish()]);
    } catch (error) {
      console.error(`[RenderContext] Failed to blit layer ${layerId} output:`, error);
    }
  }

  /**
   * Clean up output canvas for a layer
   */
  private destroyLayerOutputCanvas(layerId: string): void {
    this.layerOutputCanvases.delete(layerId);
    this.layerOutputCanvasContexts.delete(layerId);
  }

  /**
   * Create GPU resources for a layer
   */
  private async createLayerResources(layer: ShaderLayer): Promise<void> {
    if (!this.device) return;

    const fragmentShader = layer.getFragmentShader();
    const vertexShader = layer.getVertexShader();

    if (!fragmentShader || !vertexShader) {
      console.warn(`[RenderContext] Layer ${layer.id}: missing shader code`);
      return;
    }

    try {
      // Create shader modules with compilation info
      const vertexModule = this.device.createShaderModule({
        label: `${layer.id}-vertex`,
        code: vertexShader,
      });

      // Check for vertex shader compilation errors
      const vertexInfo = await vertexModule.getCompilationInfo();
      for (const msg of vertexInfo.messages) {
        if (msg.type === 'error') {
          const shaderError: ShaderError = {
            layerId: layer.id,
            message: msg.message,
            line: msg.lineNum,
            column: msg.linePos,
            shaderCode: vertexShader,
          };
          this._lastShaderError = shaderError;
          console.error(`[RenderContext] Vertex shader error in ${layer.id}:`, msg.message, `(line ${msg.lineNum}, col ${msg.linePos})`);
          this.emit('shader:error', { layerId: layer.id, error: shaderError });
          this.emit('error', { error: new Error(`Vertex shader error: ${msg.message}`) });
          this.stop();
          return;
        } else if (msg.type === 'warning') {
          console.warn(`[RenderContext] Vertex shader warning in ${layer.id}:`, msg.message);
        }
      }

      const fragmentModule = this.device.createShaderModule({
        label: `${layer.id}-fragment`,
        code: fragmentShader,
      });

      // Check for fragment shader compilation errors
      const fragmentInfo = await fragmentModule.getCompilationInfo();
      for (const msg of fragmentInfo.messages) {
        if (msg.type === 'error') {
          const shaderError: ShaderError = {
            layerId: layer.id,
            message: msg.message,
            line: msg.lineNum,
            column: msg.linePos,
            shaderCode: fragmentShader,
          };
          this._lastShaderError = shaderError;
          console.error(`[RenderContext] Fragment shader error in ${layer.id}:`, msg.message, `(line ${msg.lineNum}, col ${msg.linePos})`);
          console.error(`[RenderContext] Fragment shader code:\n${fragmentShader}`);
          this.emit('shader:error', { layerId: layer.id, error: shaderError });
          this.emit('error', { error: new Error(`Fragment shader error: ${msg.message}`) });
          this.stop();
          return;
        } else if (msg.type === 'warning') {
          console.warn(`[RenderContext] Fragment shader warning in ${layer.id}:`, msg.message);
        }
      }

      // Create uniform buffer
      const uniformData = layer.getUniformData();
      layer.uniformBuffer = this.device.createBuffer({
        label: `${layer.id}-uniforms`,
        size: uniformData.byteLength,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });

      // Create bind group layout
      const inputs = layer.getCompileResult()?.inputs || [];
      const imageInputs = inputs.filter(i => i.TYPE === 'image');

      const entries: GPUBindGroupLayoutEntry[] = [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: 'uniform' },
        },
      ];

      let bindingIndex = 1;
      for (const img of imageInputs) {
        entries.push({
          binding: bindingIndex,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: 'float' },
        });
        bindingIndex++;
        entries.push({
          binding: bindingIndex,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: { type: 'filtering' },
        });
        bindingIndex++;
      }

      // Multi-pass Textures Layout
      const passes = layer.getCompileResult()?.passes || [];
      const fragShader = layer.getCompileResult()?.fragmentShader || '';

      for (let i = 0; i < passes.length; i++) {
        const passName = `pass${i + 1}`;
        const targetName = passes[i].target;

        let needed = false;
        if (fragShader.includes(`var ${passName}: texture_2d<f32>`)) needed = true;
        if (targetName && fragShader.includes(`var ${targetName}: texture_2d<f32>`)) needed = true;

        if (needed) {
          entries.push({
            binding: bindingIndex,
            visibility: GPUShaderStage.FRAGMENT,
            texture: { sampleType: 'float' },
          });
          bindingIndex++;
          entries.push({
            binding: bindingIndex,
            visibility: GPUShaderStage.FRAGMENT,
            sampler: { type: 'filtering' },
          });
          bindingIndex++;
        }
      }

      const bindGroupLayout = this.device.createBindGroupLayout({
        label: `${layer.id}-bind-group-layout`,
        entries,
      });

      // Create pipeline layout
      const pipelineLayout = this.device.createPipelineLayout({
        label: `${layer.id}-pipeline-layout`,
        bindGroupLayouts: [bindGroupLayout],
      });

      // Create render pipeline
      layer.pipeline = this.device.createRenderPipeline({
        label: `${layer.id}-pipeline`,
        layout: pipelineLayout,
        vertex: {
          module: vertexModule,
          entryPoint: 'vs_main',
        },
        fragment: {
          module: fragmentModule,
          entryPoint: 'fs_main',
          targets: [
            {
              format: this.format,
              blend: this.getBlendState(layer.blendMode),
            },
          ],
        },
        primitive: {
          topology: 'triangle-list',
        },
      });

      // Create bind group
      const bindEntries: GPUBindGroupEntry[] = [
        {
          binding: 0,
          resource: { buffer: layer.uniformBuffer },
        },
      ];

      // Use placeholder resources for images; best-effort external uploads happen during render.
      if (!this.placeholderSampler) this.createPlaceholderTexture();
      bindingIndex = 1;

      // User Input Images
      for (const img of imageInputs) {
        bindEntries.push({
          binding: bindingIndex,
          resource: this.getLayerTextureView(layer, img.NAME),
        });
        bindingIndex++;
        bindEntries.push({
          binding: bindingIndex,
          resource: this.placeholderSampler!,
        });
        bindingIndex++;
      }

      // Multi-pass Textures
      // We must bind textures for previous passes if they exist and are referenced
      // The ISF parser generates bindings for passes it detects usage of.
      // We must match that order.
      // Since we don't have the exact list of DETECTED passes from Parser here easily without reparsing,
      // we need a robust way to match bindings.
      // Ideally, ISF Parser result should include "referencedTextures" or similar.
      //
      // For now, we will bind ALL available previous passes if the shader is multipass.
      // Note: This relies on ISFParser also generating bindings for ALL passes or matching this logic.

      // Reusing 'passes' and 'fragShader' from above

      // Heuristic: bind passes that appear in the shader text
      // Must match ISFParser.generateWGSL logic exactly
      for (let i = 0; i < passes.length; i++) {
        const passName = `pass${i + 1}`;
        const targetName = passes[i].target;

        let needed = false;
        if (fragShader.includes(`var ${passName}: texture_2d<f32>`)) needed = true;
        if (targetName && fragShader.includes(`var ${targetName}: texture_2d<f32>`)) needed = true;

        // If we found the variable declaration in the generated shader, we MUST bind it
        if (needed) {
          // Find the texture for this pass. 
          // Warning: pass textures are double-buffered or managed by the renderer.
          // At creation time, they might not exist yet if this is the first frame setup.
          // We use placeholder if not yet created.

          // Note: multipass textures are typically managed in renderFrame or specialized buffers
          // This initial bind group creation might be too early for dynamic pass textures?
          // Actually, we can bind the placeholder for now and update later in render loop
          // or ensure buffers are initialized.

          // For now, bind placeholder. The render loop's `recreateBindGroupForLayer` 
          // or specific per-frame bind group logic should handle the real textures.

          bindEntries.push({
            binding: bindingIndex,
            resource: this.placeholderTextureView!, // Placeholder for now
          });
          bindingIndex++;
          bindEntries.push({
            binding: bindingIndex,
            resource: this.placeholderSampler!,
          });
          bindingIndex++;
        }
      }

      layer.bindGroup = this.device.createBindGroup({
        label: `${layer.id}-bind-group`,
        layout: bindGroupLayout,
        entries: bindEntries,
      });
    } catch (error) {
      console.error(`Failed to create resources for layer ${layer.id}:`, error);
      this.emit('error', { error: error as Error });
    }
  }

  /**
   * Recreate bind group for a layer (used when inputImage texture changes)
   */
  private recreateBindGroupForLayer(layer: ShaderLayer): void {
    if (!this.device || !layer.pipeline || !layer.uniformBuffer) return;

    const compileResult = layer.getCompileResult();
    const inputs = compileResult?.inputs || [];
    const imageInputs = inputs.filter(i => i.TYPE === 'image');
    const passes = compileResult?.passes || [];
    const fragShader = compileResult?.fragmentShader || '';

    const entries: GPUBindGroupLayoutEntry[] = [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: { type: 'uniform' },
      },
    ];

    let bindingIndex = 1;
    for (const img of imageInputs) {
      entries.push({
        binding: bindingIndex,
        visibility: GPUShaderStage.FRAGMENT,
        texture: { sampleType: 'float' },
      });
      bindingIndex++;
      entries.push({
        binding: bindingIndex,
        visibility: GPUShaderStage.FRAGMENT,
        sampler: { type: 'filtering' },
      });
      bindingIndex++;
    }

    // Multi-pass Textures Layout
    for (let i = 0; i < passes.length; i++) {
      const passName = `pass${i + 1}`;
      const targetName = passes[i].target;

      let needed = false;
      if (fragShader.includes(`var ${passName}: texture_2d<f32>`)) needed = true;
      if (targetName && fragShader.includes(`var ${targetName}: texture_2d<f32>`)) needed = true;

      if (needed) {
        entries.push({
          binding: bindingIndex,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: 'float' },
        });
        bindingIndex++;
        entries.push({
          binding: bindingIndex,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: { type: 'filtering' },
        });
        bindingIndex++;
      }
    }

    const bindGroupLayout = this.device.createBindGroupLayout({
      label: `${layer.id}-bind-group-layout`,
      entries,
    });

    const bindEntries: GPUBindGroupEntry[] = [
      {
        binding: 0,
        resource: { buffer: layer.uniformBuffer },
      },
    ];

    if (!this.placeholderSampler) this.createPlaceholderTexture();
    bindingIndex = 1;
    for (const img of imageInputs) {
      bindEntries.push({
        binding: bindingIndex,
        resource: this.getLayerTextureView(layer, img.NAME),
      });
      bindingIndex++;
      bindEntries.push({
        binding: bindingIndex,
        resource: this.placeholderSampler!,
      });
      bindingIndex++;
    }

    // Multi-pass Textures Resources
    for (let i = 0; i < passes.length; i++) {
      const passName = `pass${i + 1}`;
      const targetName = passes[i].target;

      let needed = false;
      if (fragShader.includes(`var ${passName}: texture_2d<f32>`)) needed = true;
      if (targetName && fragShader.includes(`var ${targetName}: texture_2d<f32>`)) needed = true;

      if (needed) {
        bindEntries.push({
          binding: bindingIndex,
          resource: this.placeholderTextureView!,
        });
        bindingIndex++;
        bindEntries.push({
          binding: bindingIndex,
          resource: this.placeholderSampler!,
        });
        bindingIndex++;
      }
    }

    layer.bindGroup = this.device.createBindGroup({
      label: `${layer.id}-bind-group`,
      layout: bindGroupLayout,
      entries: bindEntries,
    });
  }

  /**
   * Get blend state for blend mode
   */
  private getBlendState(mode: string): GPUBlendState {
    switch (mode) {
      case 'add':
        return {
          color: {
            srcFactor: 'src-alpha',
            dstFactor: 'one',
            operation: 'add',
          },
          alpha: {
            srcFactor: 'one',
            dstFactor: 'one',
            operation: 'add',
          },
        };
      case 'multiply':
        return {
          color: {
            srcFactor: 'dst',
            dstFactor: 'zero',
            operation: 'add',
          },
          alpha: {
            srcFactor: 'dst-alpha',
            dstFactor: 'zero',
            operation: 'add',
          },
        };
      case 'screen':
        return {
          color: {
            srcFactor: 'one',
            dstFactor: 'one-minus-src',
            operation: 'add',
          },
          alpha: {
            srcFactor: 'one',
            dstFactor: 'one-minus-src-alpha',
            operation: 'add',
          },
        };
      default: // normal
        return {
          color: {
            srcFactor: 'src-alpha',
            dstFactor: 'one-minus-src-alpha',
            operation: 'add',
          },
          alpha: {
            srcFactor: 'one',
            dstFactor: 'one-minus-src-alpha',
            operation: 'add',
          },
        };
    }
  }

  /**
   * Start render loop
   */
  start(): void {
    if (this._isRunning) return;
    this._isRunning = true;
    this.lastFrameTime = performance.now();
    this.renderLoop();
  }

  /**
   * Stop render loop
   */
  stop(): void {
    this._isRunning = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    // Close the high FPS channel to stop MessageChannel-based rendering
    if (this.highFpsChannel) {
      this.highFpsChannel.port1.close();
      this.highFpsChannel.port2.close();
      this.highFpsChannel = null;
    }
  }

  /**
   * Render a single frame
   */
  renderFrame(): void {
    if (!this.device || !this.context) {
      console.warn('[RenderContext] renderFrame called but device or context is null');
      return;
    }

    const currentTime = performance.now();
    const deltaTime = (currentTime - this.lastRenderTime) / 1000;
    const totalTime = (currentTime - this.startTime) / 1000;

    // Get current texture
    let textureView: GPUTextureView;
    try {
      textureView = this.context.getCurrentTexture().createView();
    } catch (error) {
      console.error('[RenderContext] Failed to get current texture:', error);
      return;
    }

    // Create command encoder
    const commandEncoder = this.device.createCommandEncoder();

    // Rebuild resources for layers that need it (e.g., blend mode changed)
    for (const layerId of this.layerOrder) {
      const layer = this.layers.get(layerId);
      if (layer?.enabled && layer.isCompiled() && !layer.pipeline) {
        this.createLayerResources(layer);
      }
    }

    // Check if we have any enabled layers with valid pipelines
    const enabledLayers = this.layerOrder.filter(id => {
      const layer = this.layers.get(id);
      return layer?.enabled && layer?.pipeline && layer?.bindGroup && layer?.uniformBuffer;
    });

    // Always do at least a clear pass
    if (enabledLayers.length === 0) {
      // No layers, just clear
      const clearPass = commandEncoder.beginRenderPass({
        colorAttachments: [
          {
            view: textureView,
            loadOp: 'clear',
            storeOp: 'store',
            clearValue: { r: 0, g: 0, b: 0, a: 1 },
          },
        ],
      });
      clearPass.end();
    } else {
      // Render enabled layers with ping-pong for inputImage support
      // Track which texture contains the previous layer's output
      // null = no previous output yet (first layer)
      // 'A' = previous output is in texture A
      // 'B' = previous output is in texture B
      let previousOutputTexture: 'A' | 'B' | null = null;

      for (let i = 0; i < enabledLayers.length; i++) {
        const layerId = enabledLayers[i];
        const layer = this.layers.get(layerId)!;
        const isFirstLayer = i === 0;
        const isLastLayer = i === enabledLayers.length - 1;

        // Get layer inputs for texture binding
        const inputs = layer.getCompileResult()?.inputs || [];

        // Determine output target
        let outputView: GPUTextureView;
        let currentOutputTexture: 'A' | 'B' | null = null;

        // Always render to intermediate texture so we can copy to output texture
        // This allows each layer's output to be accessed independently
        // Write to the opposite texture of what we're reading from
        if (previousOutputTexture === 'A') {
          outputView = this.intermediateTextureViewB!;
          currentOutputTexture = 'B';
        } else {
          // previousOutputTexture is null or 'B'
          outputView = this.intermediateTextureViewA!;
          currentOutputTexture = 'A';
        }

        // Handle image inputs based on dependency mappings or previous layer output
        const imageInputs = inputs.filter(inp => inp.TYPE === 'image');
        const inputSourceMap = this.layerInputSources.get(layerId);
        let needsBindGroupRecreate = false;

        for (const imageInput of imageInputs) {
          const inputName = imageInput.NAME;
          let sourceTextureView: GPUTextureView | null = null;

          // Check if there's a specific source layer mapped for this input
          const sourceLayerId = inputSourceMap?.get(inputName);
          if (sourceLayerId) {
            // Use the output texture from the source layer
            sourceTextureView = this.layerOutputTextureViews.get(sourceLayerId) ?? null;
          } else if (inputName === 'inputImage' && previousOutputTexture && !isFirstLayer) {
            // Fallback: use previous layer's output for inputImage (legacy behavior)
            sourceTextureView = previousOutputTexture === 'A'
              ? this.intermediateTextureViewA!
              : this.intermediateTextureViewB!;
          }

          if (sourceTextureView) {
            // Check if texture view changed
            let perLayer = this.layerTextureViews.get(layer.id);
            const currentView = perLayer?.get(inputName);

            if (currentView !== sourceTextureView) {
              if (!perLayer) {
                perLayer = new Map();
                this.layerTextureViews.set(layer.id, perLayer);
              }
              perLayer.set(inputName, sourceTextureView);
              needsBindGroupRecreate = true;
            }
          }
        }

        // Recreate bind group if any input texture changed
        if (needsBindGroupRecreate) {
          this.recreateBindGroupForLayer(layer);

          // Cache for inputImage (primary input)
          const inputImageView = this.layerTextureViews.get(layer.id)?.get('inputImage') ?? null;
          this.bindGroupCache.set(layer.id, {
            bindGroup: layer.bindGroup!,
            inputImageView,
          });
        }

        // Best-effort texture upload for other image inputs
        const textures = layer.getTextureInputs();
        for (const [name, src] of textures.entries()) {
          if (name === 'inputImage') continue; // Skip inputImage, already handled
          if (!src) continue;
          const isImage = typeof HTMLImageElement !== 'undefined' && src instanceof HTMLImageElement;
          const isCanvas = typeof HTMLCanvasElement !== 'undefined' && src instanceof HTMLCanvasElement;
          const isVideo = typeof HTMLVideoElement !== 'undefined' && src instanceof HTMLVideoElement;
          if (isImage || isCanvas || isVideo) {
            this.updateLayerTextureFromExternalSource(layer, name, src);
          }
        }

        // Update uniforms using double-buffered uniform buffer
        const uniformData = layer.getUniformData();

        // Calculate accumulated time based on speed
        const speed = (layer.getUniform('BUILTIN_SPEED') as number) ?? 1.0;

        // Update accumulated time
        // Note: accumulatedTime is defined in ShaderLayer
        if (typeof layer.accumulatedTime === 'undefined') {
          layer.accumulatedTime = 0;
        }
        layer.accumulatedTime += deltaTime * speed;

        // Fill built-in uniforms
        uniformData[0] = layer.accumulatedTime; // time (accumulated)
        uniformData[1] = deltaTime;           // timeDelta
        uniformData[2] = this.canvas.width;   // renderSize.x
        uniformData[3] = this.canvas.height;  // renderSize.y
        uniformData[4] = 0;                   // passIndex (packed as f32)
        uniformData[5] = this.frameCount;     // frameIndex (packed as f32)
        uniformData[6] = layer.opacity;       // layerOpacity
        uniformData[7] = speed;               // speed (was _pad0)

        // Date uniform - cache date to avoid repeated allocations
        const now = Date.now();
        const date = new Date(now);
        uniformData[8] = date.getFullYear();
        uniformData[9] = date.getMonth();
        uniformData[10] = date.getDate();
        uniformData[11] = date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds();

        // Write to layer's uniform buffer (WebGPU handles synchronization internally)
        this.device!.queue.writeBuffer(layer.uniformBuffer!, 0, uniformData.buffer);

        // Create render pass
        const renderPass = commandEncoder.beginRenderPass({
          colorAttachments: [
            {
              view: outputView,
              loadOp: isFirstLayer ? 'clear' : 'load',
              storeOp: 'store',
              clearValue: { r: 0, g: 0, b: 0, a: 1 },
            },
          ],
        });

        renderPass.setPipeline(layer.pipeline!);
        renderPass.setBindGroup(0, layer.bindGroup!);
        renderPass.draw(3); // Full-screen triangle
        renderPass.end();

        // Always ensure this layer has an output texture for potential consumers
        this.ensureLayerOutputTexture(layerId);

        // Copy the rendered result to the layer's output texture
        // This allows the output to be accessed independently or used by other layers
        const layerOutputTexture = this.layerOutputTextures.get(layerId);
        if (layerOutputTexture && currentOutputTexture) {
          const sourceTexture = currentOutputTexture === 'A'
            ? this.intermediateTextureA!
            : this.intermediateTextureB!;

          commandEncoder.copyTextureToTexture(
            { texture: sourceTexture },
            { texture: layerOutputTexture },
            [this.width, this.height]
          );
        }

        // Update previousOutputTexture for next layer to read from
        if (currentOutputTexture) {
          previousOutputTexture = currentOutputTexture;
        }
      }

      // After all layers are rendered, blit the final result to canvas
      // Now we always render to intermediate textures, so we always need to blit
      // Note: We use a render pass instead of copyTextureToTexture because
      // swap chain textures don't support CopyDst usage.
      if (previousOutputTexture) {
        const finalTextureView = previousOutputTexture === 'A'
          ? this.intermediateTextureViewA!
          : this.intermediateTextureViewB!;

        // Create bind group for blit
        const blitBindGroup = this.device!.createBindGroup({
          label: 'blit-bind-group',
          layout: this.blitBindGroupLayout!,
          entries: [
            { binding: 0, resource: finalTextureView },
            { binding: 1, resource: this.blitSampler! },
          ],
        });

        // Render the final texture to canvas using blit pipeline
        const blitPass = commandEncoder.beginRenderPass({
          colorAttachments: [
            {
              view: this.context!.getCurrentTexture().createView(),
              loadOp: 'clear',
              storeOp: 'store',
              clearValue: { r: 0, g: 0, b: 0, a: 1 },
            },
          ],
        });

        blitPass.setPipeline(this.blitPipeline!);
        blitPass.setBindGroup(0, blitBindGroup);
        blitPass.draw(3);
        blitPass.end();
      }
    }

    // Submit commands
    this.device.queue.submit([commandEncoder.finish()]);

    this.lastRenderTime = currentTime;
    this.frameCount++;
  }

  /**
   * Main render loop - optimized for high FPS
   */
  private renderLoop = (): void => {
    if (!this._isRunning) return;

    const currentTime = performance.now();
    const elapsed = currentTime - this.lastFrameTime;

    // For unlimited FPS (fpsLimit = 0) or when enough time has passed
    const shouldRender = this.fpsLimit === 0 || elapsed >= this.minFrameTime;

    if (shouldRender) {
      this.renderFrame();

      // Update FPS counter
      this.fpsAccumulator += elapsed;
      this.fpsFrameCount++;

      if (this.fpsAccumulator >= 1000) {
        this.currentFps = this.fpsFrameCount;
        this.fpsAccumulator = 0;
        this.fpsFrameCount = 0;

        // Only emit stats once per second to avoid UI thrashing
        const stats: RenderStats = {
          fps: this.currentFps,
          frameTime: elapsed,
          drawCalls: this.layerOrder.filter(id => {
            const layer = this.layers.get(id);
            return layer?.enabled && layer?.pipeline;
          }).length,
          frameCount: this.frameCount,
          lastFrameTime: currentTime,
        };

        this.emit('frame', { stats });
      }

      this.lastFrameTime = currentTime;
    }

    // Schedule next frame based on FPS target
    if (this.fpsLimit === 0 || this.fpsLimit > 60) {
      // For unlimited or high FPS targets, use faster scheduling
      // MessageChannel provides ~0ms latency vs setTimeout's minimum ~4ms
      if (!this.highFpsChannel) {
        this.highFpsChannel = new MessageChannel();
        this.highFpsChannel.port1.onmessage = () => {
          if (this._isRunning) {
            this.renderLoop();
          }
        };
      }
      this.highFpsChannel.port2.postMessage(null);
    } else {
      // For 60 FPS or below, use requestAnimationFrame for vsync
      this.animationFrameId = requestAnimationFrame(this.renderLoop);
    }
  };

  /**
   * Start render loop with high-performance mode
   */
  private startHighPerformanceLoop(): void {
    if (!this.highFpsChannel) {
      this.highFpsChannel = new MessageChannel();
      this.highFpsChannel.port1.onmessage = () => {
        if (this._isRunning) {
          this.renderLoop();
        }
      };
    }
    this.highFpsChannel.port2.postMessage(null);
  }

  /**
   * Get render statistics
   */
  getStats(): RenderStats {
    return {
      fps: this.currentFps,
      frameTime: this.minFrameTime,
      drawCalls: this.layerOrder.filter(id => {
        const layer = this.layers.get(id);
        return layer?.enabled && layer?.pipeline;
      }).length,
      frameCount: this.frameCount,
      lastFrameTime: this.lastRenderTime,
    };
  }

  /**
   * Get canvas dimensions
   */
  getDimensions(): { width: number; height: number } {
    return { width: this.width, height: this.height };
  }

  /**
   * Check if context is initialized
   */
  isInitialized(): boolean {
    return this.device !== null && this.context !== null;
  }

  /**
   * Check if render loop is running
   */
  isActive(): boolean {
    return this._isRunning;
  }

  /**
   * Destroy context and release resources
   */
  destroy(): void {
    this.stop();

    // Destroy all layers
    for (const layer of this.layers.values()) {
      layer.destroy();
    }
    this.layers.clear();
    this.layerOrder = [];

    // Clean up intermediate textures
    this.intermediateTextureA?.destroy();
    this.intermediateTextureB?.destroy();
    this.intermediateTextureA = null;
    this.intermediateTextureB = null;
    this.intermediateTextureViewA = null;
    this.intermediateTextureViewB = null;

    // Clean up layer output textures and canvases
    for (const texture of this.layerOutputTextures.values()) {
      texture.destroy();
    }
    this.layerOutputTextures.clear();
    this.layerOutputTextureViews.clear();
    this.layerOutputCanvases.clear();
    this.layerOutputCanvasContexts.clear();

    // Clear caches
    this.bindGroupCache.clear();
    this.layerTextureViews.clear();

    // Clear context
    this.context = null;
    this.device = null;

    this.removeAllListeners();
  }
}
