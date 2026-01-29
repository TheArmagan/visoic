// ============================================
// Visoic Shader API - Shader Layer
// ============================================

/// <reference types="@webgpu/types" />

import { EventEmitter } from './event-emitter';
import { ISFParser } from './isf-parser';
import type {
  ShaderLayerConfig,
  ShaderLayerEvents,
  ShaderCompileResult,
  UniformValue,
  UniformDefinition,
  ISFInput,
  BlendMode,
} from './types';

/**
 * Shader Layer - Represents a single shader in the render pipeline
 * 
 * Each layer can have its own uniforms and can be enabled/disabled.
 * Multiple layers can be composited together.
 */
export class ShaderLayer extends EventEmitter<ShaderLayerEvents> {
  readonly id: string;

  private parser: ISFParser;
  private compileResult: ShaderCompileResult | null = null;
  private _enabled: boolean = true;
  private _opacity: number = 1.0;
  private _blendMode: BlendMode = 'normal';
  private uniforms: Map<string, UniformDefinition> = new Map();
  private textureInputs: Map<string, HTMLImageElement | HTMLVideoElement | HTMLCanvasElement | null> = new Map();

  // GPU resources (will be set by RenderContext)
  pipeline: GPURenderPipeline | null = null;
  uniformBuffer: GPUBuffer | null = null;
  bindGroup: GPUBindGroup | null = null;

  constructor(config: ShaderLayerConfig) {
    super();
    this.id = config.id;
    this.parser = new ISFParser();
    this._enabled = config.enabled ?? true;
    this._opacity = config.opacity ?? 1.0;
    this._blendMode = config.blendMode ?? 'normal';

    // Compile the shader
    if (config.source) {
      this.setSource(config.source.fragment, config.source.vertex);
    }

    // Set initial uniforms
    if (config.uniforms) {
      for (const [name, value] of Object.entries(config.uniforms)) {
        this.setUniform(name, value);
      }
    }
  }

  /**
   * Set shader source and compile
   */
  setSource(fragment: string, vertex?: string): ShaderCompileResult {
    this.compileResult = this.parser.parse(fragment, vertex);

    if (this.compileResult.success) {
      // Initialize uniforms from inputs
      this.initializeUniforms(this.compileResult.inputs || []);
      this.emit('compiled', { result: this.compileResult });
    } else {
      this.emit('error', { error: this.compileResult.error || 'Unknown compilation error' });
    }

    // Reset GPU resources - they need to be recreated
    this.pipeline = null;
    this.uniformBuffer = null;
    this.bindGroup = null;

    return this.compileResult;
  }

  /**
   * Initialize uniforms from ISF inputs
   */
  private initializeUniforms(inputs: ISFInput[]): void {
    this.uniforms.clear();
    this.textureInputs.clear();

    for (const input of inputs) {
      if (input.TYPE === 'image') {
        this.textureInputs.set(input.NAME, null);
      } else {
        const def: UniformDefinition = {
          name: input.NAME,
          type: input.TYPE,
          value: this.getDefaultValue(input),
          min: input.MIN,
          max: input.MAX,
          default: input.DEFAULT,
          label: input.LABEL,
        };
        this.uniforms.set(input.NAME, def);
      }
    }
  }

  /**
   * Get default value for an input
   */
  private getDefaultValue(input: ISFInput): UniformValue {
    if (input.DEFAULT !== undefined) {
      return input.DEFAULT;
    }

    switch (input.TYPE) {
      case 'float':
        return input.MIN ?? 0;
      case 'int':
        return input.MIN ?? 0;
      case 'long':
        return input.MIN ?? 0;
      case 'bool':
        return false;
      case 'event':
        return false;
      case 'vec2':
      case 'point2D':
        return [0, 0];
      case 'vec3':
        return [0, 0, 0];
      case 'vec4':
      case 'color':
        return [0, 0, 0, 1];
      default:
        return 0;
    }
  }

  /**
   * Set a uniform value
   */
  setUniform(name: string, value: UniformValue): void {
    const def = this.uniforms.get(name);
    if (def) {
      def.value = value;
      this.emit('uniform:changed', { name, value });
    } else if (this.textureInputs.has(name)) {
      this.textureInputs.set(name, value as HTMLImageElement | HTMLVideoElement | HTMLCanvasElement | null);
      this.emit('uniform:changed', { name, value });
    }
  }

  /**
   * Set uniform from normalized value (0-1)
   */
  setNormalizedUniform(name: string, normalizedValue: number): void {
    const def = this.uniforms.get(name);
    if (def && def.min !== undefined && def.max !== undefined) {
      const value = def.min + (def.max - def.min) * normalizedValue;
      this.setUniform(name, value);
    }
  }

  /**
   * Get a uniform value
   */
  getUniform(name: string): UniformValue | undefined {
    const def = this.uniforms.get(name);
    if (def) return def.value;
    return this.textureInputs.get(name);
  }

  /**
   * Get all uniform definitions
   */
  getUniformDefinitions(): UniformDefinition[] {
    return Array.from(this.uniforms.values());
  }

  /**
   * Get texture inputs
   */
  getTextureInputs(): Map<string, HTMLImageElement | HTMLVideoElement | HTMLCanvasElement | null> {
    return new Map(this.textureInputs);
  }

  /**
   * Get uniform data as Float32Array for GPU buffer
   */
  getUniformData(): Float32Array {
    // WGSL uniform buffers have strict alignment rules.
    // We pack built-ins and user uniforms with alignment so the generated WGSL struct matches.
    // Built-ins occupy 12 floats (48 bytes):
    // time(1), timeDelta(1), renderSize(2), passIndex(1), frameIndex(1), padding(2), date(4)
    const builtInSizeFloats = 12;

    const floats: number[] = new Array(builtInSizeFloats).fill(0);

    // User uniforms start after built-ins, already aligned to 16 bytes.
    let byteOffset = builtInSizeFloats * 4;

    for (const def of this.uniforms.values()) {
      const { alignBytes, sizeBytes, components } = this.getPackedTypeLayout(def.type);

      // Align the start of this uniform.
      if (byteOffset % alignBytes !== 0) {
        byteOffset += alignBytes - (byteOffset % alignBytes);
      }

      const floatIndex = byteOffset / 4;
      const neededFloats = floatIndex + Math.ceil(sizeBytes / 4);
      while (floats.length < neededFloats) floats.push(0);

      const value = def.value;
      if (typeof value === 'number') {
        floats[floatIndex] = value;
      } else if (typeof value === 'boolean') {
        floats[floatIndex] = value ? 1 : 0;
      } else if (Array.isArray(value)) {
        for (let i = 0; i < Math.min(components, value.length); i++) {
          floats[floatIndex + i] = value[i] as number;
        }
      }

      byteOffset += sizeBytes;
    }

    // Pad total size to multiple of 16 bytes.
    const totalBytes = Math.ceil(byteOffset / 16) * 16;
    const totalFloats = totalBytes / 4;
    while (floats.length < totalFloats) floats.push(0);

    return Float32Array.from(floats);
  }

  /**
   * Get size of uniform type in floats
   */
  private getUniformSize(type: string): number {
    switch (type) {
      case 'float':
      case 'int':
      case 'long':
      case 'bool':
      case 'event':
        return 1;
      case 'vec2':
      case 'point2D':
        return 2;
      case 'vec3':
        return 4; // padded to 16 bytes in uniform buffers
      case 'vec4':
      case 'color':
        return 4;
      default:
        return 1;
    }
  }

  private getPackedTypeLayout(type: string): { alignBytes: number; sizeBytes: number; components: number } {
    switch (type) {
      case 'vec2':
      case 'point2D':
        return { alignBytes: 8, sizeBytes: 8, components: 2 };
      case 'vec3':
        // vec3 has 16-byte alignment in uniform buffers; occupies 16 bytes.
        return { alignBytes: 16, sizeBytes: 16, components: 3 };
      case 'vec4':
      case 'color':
        return { alignBytes: 16, sizeBytes: 16, components: 4 };
      case 'float':
      case 'int':
      case 'long':
      case 'bool':
      case 'event':
      default:
        return { alignBytes: 4, sizeBytes: 4, components: 1 };
    }
  }

  /**
   * Get compilation result
   */
  getCompileResult(): ShaderCompileResult | null {
    return this.compileResult;
  }

  /**
   * Check if shader is compiled successfully
   */
  isCompiled(): boolean {
    return this.compileResult?.success ?? false;
  }

  /**
   * Get WGSL fragment shader
   */
  getFragmentShader(): string | undefined {
    return this.compileResult?.fragmentShader;
  }

  /**
   * Get WGSL vertex shader
   */
  getVertexShader(): string | undefined {
    return this.compileResult?.vertexShader;
  }

  /**
   * Enable/disable layer
   */
  get enabled(): boolean {
    return this._enabled;
  }

  set enabled(value: boolean) {
    this._enabled = value;
  }

  /**
   * Layer opacity
   */
  get opacity(): number {
    return this._opacity;
  }

  set opacity(value: number) {
    this._opacity = Math.max(0, Math.min(1, value));
  }

  /**
   * Blend mode
   */
  get blendMode(): BlendMode {
    return this._blendMode;
  }

  set blendMode(value: BlendMode) {
    this._blendMode = value;
  }

  /**
   * Destroy layer and release resources
   */
  destroy(): void {
    this.uniforms.clear();
    this.textureInputs.clear();
    this.compileResult = null;
    this.pipeline = null;
    this.uniformBuffer?.destroy();
    this.uniformBuffer = null;
    this.bindGroup = null;
    this.removeAllListeners();
  }
}
