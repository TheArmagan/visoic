// ============================================
// Visoic Shader API - ISF Loader
// ============================================

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
}

/**
 * Singleton ISF loader instance
 */
export const isfLoader = new ISFLoader();

/**
 * Re-export for convenience
 */
export { ISFLoader };
