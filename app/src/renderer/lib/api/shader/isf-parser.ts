// ============================================
// Visoic Shader API - ISF Parser (Wrapper for ISFToWGSLCompiler)
// ============================================

import { ISFToWGSLCompiler, type CompilerOutput } from './isf-compiler/isf-compiler';
import type { ShaderCompileResult, ISFInput, ParsedPass, ISFMetadata } from './types';

/**
 * Map ISF types to WGSL/GLSL types
 */
const TYPE_MAP: Record<string, string> = {
  float: 'f32',
  int: 'f32',
  long: 'f32',
  bool: 'f32',
  vec2: 'vec2<f32>',
  vec3: 'vec3<f32>',
  vec4: 'vec4<f32>',
  color: 'vec4<f32>',
  point2D: 'vec2<f32>',
  image: 'texture_2d<f32>',
  event: 'f32',
};

/**
 * ISF Parser - Wrapper class that provides backward compatibility
 * with the original ISFParser interface while using the new ISFToWGSLCompiler
 */
export class ISFParser {
  private compiler: ISFToWGSLCompiler;
  private lastMetadata: ISFMetadata | null = null;
  private rawFragmentShader: string = '';
  private rawVertexShader: string = '';

  constructor() {
    this.compiler = new ISFToWGSLCompiler();
  }

  /**
   * Parse ISF shader source
   */
  parse(fragmentSource: string, vertexSource?: string): ShaderCompileResult {
    try {
      this.rawFragmentShader = fragmentSource;
      this.rawVertexShader = vertexSource || '';

      // Use the new compiler
      const result = this.compiler.compile(fragmentSource);

      // Store metadata for later access
      this.lastMetadata = result.metadata as ISFMetadata;

      // Parse passes from metadata
      const passes = this.parsePasses(result.metadata.PASSES);

      // Determine shader type
      const type = this.inferShaderType(result.metadata.INPUTS || []);

      // Map compiler output to ShaderCompileResult format
      return {
        success: true,
        fragmentShader: result.wgsl,
        vertexShader: result.vertexShader,
        inputs: (result.metadata.INPUTS || []) as ISFInput[],
        passes,
        type,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Parse pass definitions
   */
  private parsePasses(passesArray?: ISFMetadata['PASSES']): ParsedPass[] {
    if (!passesArray || passesArray.length === 0) {
      return [{ width: '$WIDTH', height: '$HEIGHT', float: false, persistent: false }];
    }

    return passesArray.map(pass => ({
      target: pass?.TARGET,
      width: pass?.WIDTH || '$WIDTH',
      height: pass?.HEIGHT || '$HEIGHT',
      float: !!pass?.FLOAT,
      persistent: !!(pass?.PERSISTENT || pass?.persistent),
    }));
  }

  /**
   * Infer shader type from inputs
   */
  private inferShaderType(inputs: ISFInput[]): 'generator' | 'filter' | 'transition' {
    const hasInputImage = inputs.some(i => i.TYPE === 'image' && i.NAME === 'inputImage');
    const hasStartEnd = inputs.some(i => i.TYPE === 'image' && i.NAME === 'startImage') &&
      inputs.some(i => i.TYPE === 'image' && i.NAME === 'endImage');
    const hasProgress = inputs.some(i => i.TYPE === 'float' && i.NAME === 'progress');

    if (hasStartEnd && hasProgress) return 'transition';
    if (hasInputImage) return 'filter';
    return 'generator';
  }

  /**
   * Get parsed metadata
   */
  getMetadata(): ISFMetadata | null {
    return this.lastMetadata;
  }

  /**
   * Get input definitions
   */
  getInputs(): ISFInput[] {
    return (this.lastMetadata?.INPUTS || []) as ISFInput[];
  }
}

/**
 * Singleton parser instance
 */
export const isfParser = new ISFParser();

// Also export the compiler directly for advanced usage
export { ISFToWGSLCompiler, type CompilerOutput } from './isf-compiler/isf-compiler';
