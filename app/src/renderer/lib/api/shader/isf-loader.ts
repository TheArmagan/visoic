// ============================================
// Visoic Shader API - ISF Loader
// ============================================

import { ISFParser } from './isf-parser';

/**
 * ISF Shader metadata
 */
export interface ISFShaderInfo {
  id: string;
  name: string;
  category: string;
  hasVertex: boolean;
}

/**
 * ISF Shader source
 */
export interface ISFShaderSource {
  fragment: string;
  vertex: string | null;
}

/**
 * Shader validation result
 */
export interface ShaderValidationResult {
  shaderId: string;
  valid: boolean;
  error?: string;
}

/**
 * Native API interface
 */
interface ISFNativeAPI {
  getCategories(): Promise<string[]>;
  getShadersByCategory(category: string): Promise<Array<{ name: string; hasVertex: boolean }>>;
  getAllShaders(): Promise<ISFShaderInfo[]>;
  readShader(category: string, name: string): Promise<ISFShaderSource | null>;
  readShaderById(id: string): Promise<ISFShaderSource | null>;
}

/**
 * Get the native ISF API
 */
function getNativeAPI(): ISFNativeAPI | null {
  const win = window as unknown as { VISOICNative?: { isf?: ISFNativeAPI } };
  return win.VISOICNative?.isf ?? null;
}

/**
 * ISF Loader - Loads ISF shaders from the file system
 */
class ISFLoader {
  private cache: Map<string, ISFShaderSource> = new Map();
  private shaderList: ISFShaderInfo[] | null = null;
  private categories: string[] | null = null;

  // Validation state
  private validatedShaders: Set<string> = new Set();
  private invalidShaders: Set<string> = new Set();
  private validationErrors: Map<string, string> = new Map();
  private validationInProgress = false;
  private validationPromise: Promise<void> | null = null;
  private gpuDevice: GPUDevice | null = null;
  private parser: ISFParser = new ISFParser();

  /**
   * Check if native API is available
   */
  isAvailable(): boolean {
    return getNativeAPI() !== null;
  }

  /**
   * Get all ISF categories
   */
  async getCategories(): Promise<string[]> {
    if (this.categories) return this.categories;

    const api = getNativeAPI();
    if (!api) {
      console.warn('[ISFLoader] Native API not available');
      return [];
    }

    this.categories = await api.getCategories();
    return this.categories;
  }

  /**
   * Get all available shaders
   */
  async getAllShaders(): Promise<ISFShaderInfo[]> {
    if (this.shaderList) return this.shaderList;

    const api = getNativeAPI();
    if (!api) {
      console.warn('[ISFLoader] Native API not available');
      return [];
    }

    this.shaderList = await api.getAllShaders();
    return this.shaderList;
  }

  /**
   * Get shaders by category
   */
  async getShadersByCategory(category: string): Promise<ISFShaderInfo[]> {
    const all = await this.getAllShaders();
    return all.filter(s => s.category === category);
  }

  /**
   * Load shader source by ID (category/name format)
   */
  async loadShader(id: string): Promise<ISFShaderSource | null> {
    // Check cache
    if (this.cache.has(id)) {
      return this.cache.get(id)!;
    }

    const api = getNativeAPI();
    if (!api) {
      console.warn('[ISFLoader] Native API not available');
      return null;
    }

    const source = await api.readShaderById(id);
    if (source) {
      this.cache.set(id, source);
    }

    return source;
  }

  /**
   * Load shader source by category and name
   */
  async loadShaderByName(category: string, name: string): Promise<ISFShaderSource | null> {
    const id = `${category}/${name}`;
    return this.loadShader(id);
  }

  /**
   * Get shader info by ID
   */
  async getShaderInfo(id: string): Promise<ISFShaderInfo | null> {
    const all = await this.getAllShaders();
    return all.find(s => s.id === id) ?? null;
  }

  /**
   * Search shaders by name
   */
  async searchShaders(query: string): Promise<ISFShaderInfo[]> {
    const all = await this.getAllShaders();
    const lowerQuery = query.toLowerCase();
    return all.filter(s =>
      s.name.toLowerCase().includes(lowerQuery) ||
      s.category.toLowerCase().includes(lowerQuery)
    );
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
    this.shaderList = null;
    this.categories = null;
  }

  /**
   * Preload all shader sources (useful for faster access)
   */
  async preloadAll(): Promise<void> {
    const all = await this.getAllShaders();
    await Promise.all(all.map(s => this.loadShader(s.id)));
  }

  /**
   * Preload shaders in a category
   */
  async preloadCategory(category: string): Promise<void> {
    const shaders = await this.getShadersByCategory(category);
    await Promise.all(shaders.map(s => this.loadShader(s.id)));
  }

  /**
   * Initialize WebGPU device for validation
   */
  private async initGPU(): Promise<GPUDevice | null> {
    if (this.gpuDevice) return this.gpuDevice;

    try {
      const adapter = await navigator.gpu?.requestAdapter();
      if (adapter) {
        this.gpuDevice = await adapter.requestDevice();
      }
    } catch (e) {
      console.warn('[ISFLoader] Failed to initialize WebGPU for validation:', e);
    }
    return this.gpuDevice;
  }

  /**
   * Validate a single shader (parse + WebGPU compilation)
   */
  async validateShader(id: string): Promise<ShaderValidationResult> {
    // Check if already validated
    if (this.validatedShaders.has(id)) {
      return { shaderId: id, valid: true };
    }
    if (this.invalidShaders.has(id)) {
      return { shaderId: id, valid: false, error: this.validationErrors.get(id) };
    }

    const source = await this.loadShader(id);
    if (!source) {
      const error = 'Failed to load shader source';
      this.invalidShaders.add(id);
      this.validationErrors.set(id, error);
      return { shaderId: id, valid: false, error };
    }

    try {
      // Parse and convert to WGSL
      const compileResult = this.parser.parse(source.fragment, source.vertex || undefined);

      if (!compileResult.success) {
        const error = compileResult.error || 'Unknown compile error';
        this.invalidShaders.add(id);
        this.validationErrors.set(id, error);
        return { shaderId: id, valid: false, error };
      }

      // Try WebGPU compilation if available
      const device = await this.initGPU();
      if (device && compileResult.fragmentShader) {
        try {
          const module = device.createShaderModule({
            code: compileResult.fragmentShader,
          });

          const info = await module.getCompilationInfo();
          const errors = info.messages.filter((m) => m.type === 'error');

          if (errors.length > 0) {
            const error = errors.map((e) => e.message).join('\n');
            this.invalidShaders.add(id);
            this.validationErrors.set(id, error);
            return { shaderId: id, valid: false, error };
          }
        } catch (e: unknown) {
          const error = e instanceof Error ? e.message : String(e);
          this.invalidShaders.add(id);
          this.validationErrors.set(id, error);
          return { shaderId: id, valid: false, error };
        }
      }

      // Shader is valid
      this.validatedShaders.add(id);
      return { shaderId: id, valid: true };
    } catch (e: unknown) {
      const error = e instanceof Error ? e.message : String(e);
      this.invalidShaders.add(id);
      this.validationErrors.set(id, error);
      return { shaderId: id, valid: false, error };
    }
  }

  /**
   * Validate all shaders asynchronously
   * @param onProgress Optional callback for progress updates
   */
  async validateAllShaders(onProgress?: (current: number, total: number, shaderId: string) => void): Promise<{
    valid: string[];
    invalid: Array<{ id: string; error: string }>;
  }> {
    // Prevent multiple simultaneous validations
    if (this.validationPromise) {
      await this.validationPromise;
      return {
        valid: [...this.validatedShaders],
        invalid: [...this.invalidShaders].map(id => ({ id, error: this.validationErrors.get(id) || 'Unknown error' })),
      };
    }

    this.validationInProgress = true;

    this.validationPromise = (async () => {
      const shaders = await this.getAllShaders();
      console.log(`[ISFLoader] Validating ${shaders.length} shaders...`);

      for (let i = 0; i < shaders.length; i++) {
        const shader = shaders[i];

        // Skip if already validated
        if (this.validatedShaders.has(shader.id) || this.invalidShaders.has(shader.id)) {
          onProgress?.(i + 1, shaders.length, shader.id);
          continue;
        }

        await this.validateShader(shader.id);
        onProgress?.(i + 1, shaders.length, shader.id);

        // Small yield to prevent UI blocking
        if (i % 10 === 0) {
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      }

      console.log(`[ISFLoader] Validation complete: ${this.validatedShaders.size} valid, ${this.invalidShaders.size} invalid`);
      this.validationInProgress = false;
    })();

    await this.validationPromise;
    this.validationPromise = null;

    return {
      valid: [...this.validatedShaders],
      invalid: [...this.invalidShaders].map(id => ({ id, error: this.validationErrors.get(id) || 'Unknown error' })),
    };
  }

  /**
   * Check if a shader is valid (returns false if not yet validated)
   */
  isShaderValid(id: string): boolean {
    return this.validatedShaders.has(id);
  }

  /**
   * Check if a shader is invalid
   */
  isShaderInvalid(id: string): boolean {
    return this.invalidShaders.has(id);
  }

  /**
   * Check if validation is in progress
   */
  isValidating(): boolean {
    return this.validationInProgress;
  }

  /**
   * Check if all shaders have been validated
   */
  isValidationComplete(): boolean {
    if (!this.shaderList) return false;
    return (this.validatedShaders.size + this.invalidShaders.size) >= this.shaderList.length;
  }

  /**
   * Get only valid shaders (for node search)
   */
  async getValidShaders(): Promise<ISFShaderInfo[]> {
    const all = await this.getAllShaders();

    // If validation hasn't started or completed, return all
    if (!this.isValidationComplete() && !this.validationInProgress) {
      return all;
    }

    // Filter to only valid shaders
    return all.filter(s => !this.invalidShaders.has(s.id));
  }

  /**
   * Get invalid shaders with their errors
   */
  getInvalidShaders(): Array<{ id: string; error: string }> {
    return [...this.invalidShaders].map(id => ({
      id,
      error: this.validationErrors.get(id) || 'Unknown error',
    }));
  }

  /**
   * Get validation error for a specific shader
   */
  getValidationError(id: string): string | undefined {
    return this.validationErrors.get(id);
  }

  /**
   * Reset validation state (useful for re-validation)
   */
  resetValidation(): void {
    this.validatedShaders.clear();
    this.invalidShaders.clear();
    this.validationErrors.clear();
  }
}

/**
 * Singleton ISF loader instance
 */
export const isfLoader = new ISFLoader();

/**
 * Re-export for convenience
 */
export { ISFLoader };
