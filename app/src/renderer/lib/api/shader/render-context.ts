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
    }

    this.emit('resize', { width, height });
  }

  /**
   * Set FPS limit
   */
  setFpsLimit(fps: number): void {
    this.fpsLimit = Math.max(1, Math.min(240, fps));
    this.minFrameTime = 1000 / this.fpsLimit;
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
          console.error(`[RenderContext] Vertex shader error in ${layer.id}:`, msg.message, `(line ${msg.lineNum}, col ${msg.linePos})`);
          this.emit('error', { error: new Error(`Vertex shader error: ${msg.message}`) });
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
          console.error(`[RenderContext] Fragment shader error in ${layer.id}:`, msg.message, `(line ${msg.lineNum}, col ${msg.linePos})`);
          console.error(`[RenderContext] Fragment shader code:\n${fragmentShader}`);
          this.emit('error', { error: new Error(`Fragment shader error: ${msg.message}`) });
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
      // Render enabled layers
      let isFirstLayer = true;
      for (const layerId of enabledLayers) {
        const layer = this.layers.get(layerId)!;

        // Best-effort texture upload for image inputs (if any)
        const textures = layer.getTextureInputs();
        for (const [name, src] of textures.entries()) {
          if (!src) continue;
          const isImage = typeof HTMLImageElement !== 'undefined' && src instanceof HTMLImageElement;
          const isCanvas = typeof HTMLCanvasElement !== 'undefined' && src instanceof HTMLCanvasElement;
          const isVideo = typeof HTMLVideoElement !== 'undefined' && src instanceof HTMLVideoElement;
          if (isImage || isCanvas || isVideo) {
            this.updateLayerTextureFromExternalSource(layer, name, src);
          }
        }

        // Update uniforms
        const uniformData = layer.getUniformData();

        // Fill built-in uniforms
        uniformData[0] = totalTime;           // time
        uniformData[1] = deltaTime;           // timeDelta
        uniformData[2] = this.canvas.width;   // renderSize.x
        uniformData[3] = this.canvas.height;  // renderSize.y
        uniformData[4] = 0;                   // passIndex (packed as f32)
        uniformData[5] = this.frameCount;     // frameIndex (packed as f32)

        // Padding for 16-byte alignment before date vec4
        uniformData[6] = 0;
        uniformData[7] = 0;

        // Date uniform
        const date = new Date();
        uniformData[8] = date.getFullYear();
        uniformData[9] = date.getMonth();
        uniformData[10] = date.getDate();
        uniformData[11] = date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds();

        this.device!.queue.writeBuffer(layer.uniformBuffer!, 0, uniformData.buffer);

        // Create render pass
        const renderPass = commandEncoder.beginRenderPass({
          colorAttachments: [
            {
              view: textureView,
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

        isFirstLayer = false;
      }
    }

    // Submit commands
    this.device.queue.submit([commandEncoder.finish()]);

    this.lastRenderTime = currentTime;
    this.frameCount++;
  }

  /**
   * Main render loop
   */
  private renderLoop = (): void => {
    if (!this._isRunning) return;

    const currentTime = performance.now();
    const elapsed = currentTime - this.lastFrameTime;

    // FPS limiting - only render if enough time has passed
    if (elapsed >= this.minFrameTime) {
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

    this.animationFrameId = requestAnimationFrame(this.renderLoop);
  };

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

    // Clear context
    this.context = null;
    this.device = null;

    this.removeAllListeners();
  }
}
