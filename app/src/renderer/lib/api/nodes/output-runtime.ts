// ============================================
// Visoic Node System - Output Runtime
// ============================================
// Manages output windows using window.open() for maximum performance
// All rendering stays client-side - no IPC bottleneck

import { nodeGraph } from './graph';
import { renderContextRuntime } from './render-context-runtime';
import type { OutputNodeData, VisoicNode } from './types';

// ============================================
// Output Window Manager
// ============================================

interface OutputWindow {
  nodeId: string;
  window: Window | null;
  canvas: HTMLCanvasElement | null;
  ctx: CanvasRenderingContext2D | null;
  isOpen: boolean;
  config: {
    title: string;
    width: number;
    height: number;
    fullscreen: boolean;
    monitor: number;
    fpsLimit: number;
    showFps: boolean;
  };
  lastFrameTime: number;
  lastRenderTime: number;
  frameCount: number;
  fps: number;
  // Cached frame source to avoid expensive edge lookups every frame
  cachedFrameSource: CanvasImageSource | null;
  cachedFrameSourceNodeId: string | null;
}

class OutputRuntimeManager {
  private outputWindows: Map<string, OutputWindow> = new Map();
  private sourceCanvas: HTMLCanvasElement | null = null;
  private animationFrameId: number | null = null;
  private isRunning = false;
  private graphUnsubscribe: (() => void) | null = null;

  constructor() {
    // Subscribe to graph changes to invalidate frame source cache
    this.graphUnsubscribe = nodeGraph.subscribe(() => {
      this.invalidateFrameSourceCache();
    });
  }

  // ============================================
  // Lifecycle
  // ============================================

  /**
   * Set the source canvas that will be rendered to output windows
   */
  setSourceCanvas(canvas: HTMLCanvasElement): void {
    this.sourceCanvas = canvas;
  }

  /**
   * Start the output rendering loop
   */
  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.renderLoop();
  }

  /**
   * Stop the output rendering loop
   */
  stop(): void {
    this.isRunning = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  /**
   * Clean up all output windows
   */
  destroy(): void {
    this.stop();
    for (const [nodeId] of this.outputWindows) {
      this.closeWindow(nodeId);
    }
    this.outputWindows.clear();
  }

  // ============================================
  // Window Management
  // ============================================

  /**
   * Open an output window for a node
   */
  openWindow(nodeId: string): boolean {
    const node = nodeGraph.getNode(nodeId);
    if (!node || node.data.category !== 'output') return false;

    const data = node.data as OutputNodeData;
    if (data.outputType !== 'window') return false;

    // Check if already open
    const existing = this.outputWindows.get(nodeId);
    if (existing?.isOpen && existing.window && !existing.window.closed) {
      existing.window.focus();
      return true;
    }

    const config = {
      title: data.windowConfig?.title ?? 'Visoic Output',
      width: data.windowConfig?.width ?? 1920,
      height: data.windowConfig?.height ?? 1080,
      fullscreen: data.windowConfig?.fullscreen ?? false,
      monitor: data.windowConfig?.monitor ?? 0,
      fpsLimit: data.renderConfig?.fps ?? 60,
      showFps: data.renderConfig?.showFps ?? false,
    };

    // Calculate window position
    const left = config.monitor * config.width;
    const top = 0;

    // Build window features string
    const features = [
      `width=${config.width}`,
      `height=${config.height}`,
      `left=${left}`,
      `top=${top}`,
      'menubar=no',
      'toolbar=no',
      'location=no',
      'status=no',
      'resizable=yes',
      'scrollbars=no',
    ].join(',');

    // Open the window
    const outputWindow = window.open('about:blank', `visoic_output_${nodeId}`, features);

    if (!outputWindow) {
      console.error('Failed to open output window - popup blocked?');
      return false;
    }

    // Setup the window content
    this.setupOutputWindow(nodeId, outputWindow, config);

    return true;
  }

  /**
   * Setup the output window with canvas and styles
   */
  private setupOutputWindow(
    nodeId: string,
    outputWindow: Window,
    config: OutputWindow['config']
  ): void {
    const doc = outputWindow.document;

    // Write the HTML structure
    doc.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${config.title}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            html, body {
              width: 100%;
              height: 100%;
              overflow: hidden;
              background: #000;
            }
            canvas {
              display: block;
              width: 100%;
              height: 100%;
              object-fit: contain;
            }
            .fps-counter {
              position: fixed;
              top: 10px;
              left: 10px;
              color: #0f0;
              font-family: monospace;
              font-size: 14px;
              text-shadow: 1px 1px 2px #000;
              pointer-events: none;
              opacity: 0.7;
              z-index: 1000;
              display: ${config.showFps ? 'block' : 'none'};
            }
          </style>
        </head>
        <body>
          <canvas id="output-canvas"></canvas>
          <div class="fps-counter" id="fps-counter">0 FPS</div>
        </body>
      </html>
    `);
    doc.close();

    // Get the canvas
    const canvas = doc.getElementById('output-canvas') as HTMLCanvasElement;
    canvas.width = config.width;
    canvas.height = config.height;

    const ctx = canvas.getContext('2d', {
      alpha: false,
      desynchronized: true, // Better performance
    });

    // Store the output window reference
    this.outputWindows.set(nodeId, {
      nodeId,
      window: outputWindow,
      canvas,
      ctx,
      isOpen: true,
      config,
      lastFrameTime: performance.now(),
      lastRenderTime: 0,
      frameCount: 0,
      fps: 0,
      cachedFrameSource: null,
      cachedFrameSourceNodeId: null,
    });

    // Handle window close
    outputWindow.addEventListener('beforeunload', () => {
      const entry = this.outputWindows.get(nodeId);
      if (entry) {
        entry.isOpen = false;
        entry.window = null;
        entry.canvas = null;
        entry.ctx = null;
      }
    });

    // Handle fullscreen toggle with F11 or double-click
    doc.addEventListener('keydown', (e) => {
      if (e.key === 'F11' || e.key === 'f') {
        e.preventDefault();
        this.toggleFullscreen(nodeId);
      } else if (e.key === 'Escape') {
        if (doc.fullscreenElement) {
          doc.exitFullscreen();
        }
      }
    });

    doc.addEventListener('dblclick', () => {
      this.toggleFullscreen(nodeId);
    });

    // Request fullscreen if configured
    if (config.fullscreen) {
      // Small delay to ensure window is ready
      setTimeout(() => this.toggleFullscreen(nodeId), 100);
    }
  }

  /**
   * Toggle fullscreen for an output window
   */
  toggleFullscreen(nodeId: string): void {
    const entry = this.outputWindows.get(nodeId);
    if (!entry?.window || !entry.canvas) return;

    const doc = entry.window.document;

    if (!doc.fullscreenElement) {
      entry.canvas.requestFullscreen().catch((err) => {
        console.warn('Fullscreen request failed:', err);
      });
    } else {
      doc.exitFullscreen();
    }
  }

  /**
   * Close an output window
   */
  closeWindow(nodeId: string): void {
    const entry = this.outputWindows.get(nodeId);
    if (entry?.window && !entry.window.closed) {
      entry.window.close();
    }
    this.outputWindows.delete(nodeId);
  }

  /**
   * Check if an output window is open
   */
  isWindowOpen(nodeId: string): boolean {
    const entry = this.outputWindows.get(nodeId);
    return entry?.isOpen === true && entry.window !== null && !entry.window.closed;
  }

  /**
   * Invalidate frame source cache for all output windows
   * Called when graph edges change
   */
  invalidateFrameSourceCache(): void {
    for (const entry of this.outputWindows.values()) {
      entry.cachedFrameSourceNodeId = null;
      entry.cachedFrameSource = null;
    }
  }

  /**
   * Get frame source from a specific node (fast path - no edge lookup)
   */
  private getFrameSourceFromNode(sourceNodeId: string): CanvasImageSource | null {
    const sourceNode = nodeGraph.getNode(sourceNodeId);
    if (!sourceNode) return null;

    // Check if the source is a render context node
    if ((sourceNode.data as any).shaderType === 'render:context') {
      return renderContextRuntime.getCanvas(sourceNodeId);
    }

    // Check if the source is a shader node
    if (sourceNode.data.category === 'shader' && (sourceNode.data as any).shaderType !== 'render:context') {
      const shaderCanvas = renderContextRuntime.getShaderOutputCanvas(sourceNodeId);
      if (shaderCanvas) return shaderCanvas;
    }

    // Check outputValues
    if (sourceNode?.data.outputValues) {
      const frame = sourceNode.data.outputValues['output'];
      if (frame instanceof HTMLCanvasElement ||
        frame instanceof OffscreenCanvas ||
        frame instanceof ImageBitmap ||
        frame instanceof HTMLImageElement ||
        frame instanceof HTMLVideoElement) {
        return frame;
      }
    }

    return null;
  }

  /**
   * Find the frame source for an output node (slow path - does edge lookup)
   * Only called when cache is empty or invalid
   */
  private findFrameSource(outputNodeId: string): { source: CanvasImageSource; sourceNodeId: string } | null {
    // Use graph's edge index for O(1) lookup
    const incomingEdges = nodeGraph.getEdgesToNode(outputNodeId);

    for (const edge of incomingEdges) {
      const sourceNode = nodeGraph.getNode(edge.source);
      if (!sourceNode) continue;

      // Check if the source is a render context node
      if ((sourceNode.data as any).shaderType === 'render:context') {
        const canvas = renderContextRuntime.getCanvas(edge.source);
        if (canvas) {
          return { source: canvas, sourceNodeId: edge.source };
        }
      }

      // Check if the source is a shader node
      if (sourceNode.data.category === 'shader' && (sourceNode.data as any).shaderType !== 'render:context') {
        const shaderCanvas = renderContextRuntime.getShaderOutputCanvas(edge.source);
        if (shaderCanvas) {
          return { source: shaderCanvas, sourceNodeId: edge.source };
        }

        // Fallback: Use RenderContext canvas
        const renderContextEdge = nodeGraph.getEdgeToInput(edge.source, 'renderContext');
        if (renderContextEdge) {
          const contextNode = nodeGraph.getNode(renderContextEdge.source);
          if (contextNode && (contextNode.data as any).shaderType === 'render:context') {
            const canvas = renderContextRuntime.getCanvas(renderContextEdge.source);
            if (canvas) {
              return { source: canvas, sourceNodeId: renderContextEdge.source };
            }
          }
        }
      }

      // Check other source outputs
      if (sourceNode?.data.outputValues) {
        const outputKey = edge.sourceHandle || 'output';
        const frame = sourceNode.data.outputValues[outputKey];

        if (frame instanceof HTMLCanvasElement ||
          frame instanceof OffscreenCanvas ||
          frame instanceof ImageBitmap ||
          frame instanceof HTMLImageElement ||
          frame instanceof HTMLVideoElement) {
          return { source: frame, sourceNodeId: edge.source };
        }
      }
    }

    return null;
  }

  // ============================================
  // Rendering
  // ============================================

  /**
   * Called each frame from nodeRuntime to update output windows
   */
  tick(): void {
    this.renderToOutputWindows();
  }

  /**
   * Main render loop - copies source canvas to all output windows
   * Only used if running standalone (not called from nodeRuntime)
   */
  private renderLoop = (): void => {
    if (!this.isRunning) return;

    this.renderToOutputWindows();

    this.animationFrameId = requestAnimationFrame(this.renderLoop);
  };

  /**
   * Render the source canvas to all open output windows
   * Gets frame data from connected input nodes
   * Optimized: Uses cached frame source to avoid expensive edge lookups every frame
   */
  private renderToOutputWindows(): void {
    const now = performance.now();

    for (const [nodeId, entry] of this.outputWindows) {
      if (!entry.isOpen || !entry.ctx || !entry.canvas || entry.window?.closed) {
        continue;
      }

      // Apply FPS limit
      const minFrameTime = 1000 / entry.config.fpsLimit;
      if (now - entry.lastRenderTime < minFrameTime) {
        continue;
      }
      entry.lastRenderTime = now;

      try {
        // Get frame source - use cache if available
        let frameSource: CanvasImageSource | null = null;

        // Try to get from cached source node first (fast path)
        if (entry.cachedFrameSourceNodeId) {
          frameSource = this.getFrameSourceFromNode(entry.cachedFrameSourceNodeId);
        }

        // If no cached source or cache miss, do full lookup (slow path)
        // This only happens when graph changes, not every frame
        if (!frameSource) {
          const result = this.findFrameSource(nodeId);
          if (result) {
            frameSource = result.source;
            entry.cachedFrameSourceNodeId = result.sourceNodeId;
          }
        }

        // If we have a source canvas set globally, use it as fallback
        if (!frameSource && this.sourceCanvas) {
          frameSource = this.sourceCanvas;
        }

        // If we have a frame source, render it
        if (frameSource) {
          // Get source dimensions
          const srcWidth = 'width' in frameSource ? frameSource.width : (frameSource as any).videoWidth || entry.canvas.width;
          const srcHeight = 'height' in frameSource ? frameSource.height : (frameSource as any).videoHeight || entry.canvas.height;

          entry.ctx.drawImage(
            frameSource,
            0, 0,
            srcWidth, srcHeight,
            0, 0,
            entry.canvas.width, entry.canvas.height
          );
        } else {
          // No source - draw a placeholder
          entry.ctx.fillStyle = '#1a1a2e';
          entry.ctx.fillRect(0, 0, entry.canvas.width, entry.canvas.height);
          entry.ctx.fillStyle = '#4a4a6a';
          entry.ctx.font = '24px monospace';
          entry.ctx.textAlign = 'center';
          entry.ctx.textBaseline = 'middle';
          entry.ctx.fillText('No Input Connected', entry.canvas.width / 2, entry.canvas.height / 2);
        }

        // Update FPS counter
        entry.frameCount++;
        const elapsed = now - entry.lastFrameTime;
        if (elapsed >= 1000) {
          entry.fps = Math.round((entry.frameCount * 1000) / elapsed);
          entry.frameCount = 0;
          entry.lastFrameTime = now;

          // Update FPS display
          const fpsEl = entry.window?.document.getElementById('fps-counter');
          if (fpsEl) {
            fpsEl.textContent = `${entry.fps} FPS`;
          }
        }

        // Update node output values
        nodeGraph.updateNodeDataSilent(nodeId, {
          outputValues: {
            width: entry.canvas.width,
            height: entry.canvas.height,
            fps: entry.fps,
          },
        });
      } catch (error) {
        // Window might have been closed
        console.warn(`Failed to render to output window ${nodeId}:`, error);
        entry.isOpen = false;
      }
    }
  }

  /**
   * Render a specific canvas/image to an output window
   */
  renderFrame(nodeId: string, source: CanvasImageSource): void {
    const entry = this.outputWindows.get(nodeId);
    if (!entry?.ctx || !entry.canvas || !entry.isOpen) return;

    entry.ctx.drawImage(
      source,
      0, 0,
      entry.canvas.width, entry.canvas.height
    );
  }

  // ============================================
  // Sync with Node Graph
  // ============================================

  /**
   * Sync output windows with the node graph
   * Called when nodes are added/removed
   */
  syncWithGraph(): void {
    const nodes = nodeGraph.getNodes();
    const windowNodes = nodes.filter(
      (n) => n.data.category === 'output' && (n.data as OutputNodeData).outputType === 'window'
    );

    // Remove windows for deleted nodes
    const activeNodeIds = new Set(windowNodes.map((n) => n.id));
    for (const [nodeId] of this.outputWindows) {
      if (!activeNodeIds.has(nodeId)) {
        this.closeWindow(nodeId);
      }
    }
  }

  // ============================================
  // Getters
  // ============================================

  get running(): boolean {
    return this.isRunning;
  }

  getOpenWindows(): string[] {
    return Array.from(this.outputWindows.entries())
      .filter(([, entry]) => entry.isOpen)
      .map(([nodeId]) => nodeId);
  }

  getWindowFPS(nodeId: string): number {
    return this.outputWindows.get(nodeId)?.fps ?? 0;
  }
}

// Singleton instance
export const outputRuntime = new OutputRuntimeManager();
export { OutputRuntimeManager };
