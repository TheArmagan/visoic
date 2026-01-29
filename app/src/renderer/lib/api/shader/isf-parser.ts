// ============================================
// Visoic Shader API - ISF Parser
// ============================================

import type {
  ISFMetadata,
  ISFInput,
  ParsedPass,
  ShaderCompileResult,
  UniformType,
} from './types';

/**
 * Map ISF types to WGSL/GLSL types
 */
const TYPE_MAP: Record<UniformType, string> = {
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
 * ISF Parser - Parses Interactive Shader Format files
 * Extracts metadata and converts ISF GLSL to WebGPU WGSL
 */
export class ISFParser {
  private metadata: ISFMetadata | null = null;
  private rawFragmentShader: string = '';
  private rawVertexShader: string = '';
  private fragmentMain: string = '';

  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Best-effort expansion for common GLSL `#define` macros found in ISF shaders.
   * WGSL has no preprocessor, so we inline simple object-like macros (constants)
   * and function-like macros. This is not a full C preprocessor, but it covers
   * the majority of ISF shaders in the wild.
   */
  private expandGLSLDefines(source: string): string {
    type FnDef = { name: string; args: string[]; body: string };

    const rawLines = source.split(/\r?\n/);

    // Join backslash-continued defines into a single logical line.
    const lines: string[] = [];
    for (let i = 0; i < rawLines.length; i++) {
      let line = rawLines[i];
      while (/\\\s*$/.test(line) && i + 1 < rawLines.length) {
        line = line.replace(/\\\s*$/, ' ') + rawLines[i + 1].trimStart();
        i++;
      }
      lines.push(line);
    }

    const objectDefines = new Map<string, string>();
    const functionDefines: FnDef[] = [];

    const outLines: string[] = [];
    for (const line of lines) {
      // Function-like: #define NAME(a,b,c) body...
      const fn = line.match(/^\s*#define\s+(\w+)\s*\(([^)]*)\)\s+(.+?)\s*$/);
      if (fn) {
        const args = fn[2]
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        functionDefines.push({ name: fn[1], args, body: fn[3] });
        outLines.push(`// (removed #define ${fn[1]}(${args.join(',')}) ...)`);
        continue;
      }

      // Object-like: #define NAME body...
      const obj = line.match(/^\s*#define\s+(\w+)\s+(.+?)\s*$/);
      if (obj) {
        objectDefines.set(obj[1], obj[2]);
        outLines.push(`// (removed #define ${obj[1]} ...)`);
        continue;
      }

      outLines.push(line);
    }

    let code = outLines.join('\n');

    // Iteratively expand to cover nested macros / macros that reference macros.
    // Safety limits keep us from looping forever on recursive defines.
    const maxPasses = 8;
    for (let pass = 0; pass < maxPasses; pass++) {
      const before = code;

      // Expand function-like macros first (more specific).
      for (const def of functionDefines) {
        code = this.expandFunctionLikeMacro(code, def.name, def.args, def.body);
      }

      // Expand object-like macros (constants).
      for (const [name, value] of objectDefines.entries()) {
        const re = new RegExp(`\\b${this.escapeRegExp(name)}\\b`, 'g');
        code = code.replace(re, `(${value})`);
      }

      if (code === before) break;
    }

    return code;
  }

  private expandFunctionLikeMacro(code: string, name: string, argNames: string[], body: string): string {
    let out = code;

    // Limit iterations to avoid accidental infinite loops.
    let safety = 0;
    for (let idx = 0; idx < out.length && safety < 20000;) {
      const found = this.findMacroInvocation(out, name, idx);
      if (!found) break;

      safety++;
      const { startIndex, argsStartIndex } = found;
      const parsed = this.parseParenInvocationArgs(out, argsStartIndex);
      if (!parsed) {
        idx = argsStartIndex + 1;
        continue;
      }

      const { endIndex, args } = parsed;

      // Only replace if arg count matches (common case). If it doesn't match,
      // leave as-is to avoid corrupting code.
      if (args.length !== argNames.length) {
        idx = endIndex + 1;
        continue;
      }

      let replacedBody = body;
      for (let i = 0; i < argNames.length; i++) {
        replacedBody = replacedBody.replace(
          new RegExp(`\\b${this.escapeRegExp(argNames[i])}\\b`, 'g'),
          `(${args[i].trim()})`,
        );
      }

      const replacement = `(${replacedBody})`;
      out = out.slice(0, startIndex) + replacement + out.slice(endIndex + 1);
      idx = startIndex + replacement.length;
    }

    return out;
  }

  private findMacroInvocation(
    code: string,
    name: string,
    startFrom: number,
  ): { startIndex: number; argsStartIndex: number } | null {
    const n = name.length;
    for (let i = startFrom; i < code.length - n; i++) {
      // Word boundary-ish check for start.
      const prev = i > 0 ? code[i - 1] : '';
      if (prev && /[A-Za-z0-9_]/.test(prev)) continue;

      if (code.slice(i, i + n) !== name) continue;

      // Skip whitespace between NAME and '('
      let j = i + n;
      while (j < code.length && /\s/.test(code[j])) j++;
      if (code[j] !== '(') continue;

      return { startIndex: i, argsStartIndex: j };
    }
    return null;
  }

  private parseParenInvocationArgs(
    code: string,
    openParenIndex: number,
  ): { endIndex: number; args: string[] } | null {
    if (code[openParenIndex] !== '(') return null;

    const args: string[] = [];
    let current = '';
    let depth = 0;
    let inString = false;
    let stringChar: '"' | "'" | null = null;

    for (let i = openParenIndex; i < code.length; i++) {
      const ch = code[i];

      if (inString) {
        current += ch;
        if (ch === stringChar && code[i - 1] !== '\\') {
          inString = false;
          stringChar = null;
        }
        continue;
      }

      if (ch === '"' || ch === "'") {
        inString = true;
        stringChar = ch as '"' | "'";
        current += ch;
        continue;
      }

      if (ch === '(') {
        depth++;
        if (depth > 1) current += ch;
        continue;
      }

      if (ch === ')') {
        depth--;
        if (depth === 0) {
          args.push(current.trim());
          return { endIndex: i, args: args.filter((a) => a.length > 0 || args.length > 1) };
        }
        current += ch;
        continue;
      }

      if (ch === ',' && depth === 1) {
        args.push(current.trim());
        current = '';
        continue;
      }

      if (depth >= 1) {
        current += ch;
      }
    }

    return null;
  }

  private rewriteCallNameByArgCount(
    code: string,
    name: string,
    argCount: number,
    newName: string,
  ): string {
    let out = code;
    let idx = 0;
    let safety = 0;

    while (idx < out.length && safety < 20000) {
      const found = this.findMacroInvocation(out, name, idx);
      if (!found) break;
      safety++;

      const parsed = this.parseParenInvocationArgs(out, found.argsStartIndex);
      if (!parsed) {
        idx = found.argsStartIndex + 1;
        continue;
      }

      if (parsed.args.length === argCount) {
        out = out.slice(0, found.startIndex) + newName + out.slice(found.startIndex + name.length);
        idx = found.startIndex + newName.length;
      } else {
        idx = parsed.endIndex + 1;
      }
    }

    return out;
  }

  /**
   * Parse ISF shader source
   */
  parse(fragmentSource: string, vertexSource?: string): ShaderCompileResult {
    try {
      this.rawFragmentShader = fragmentSource;
      this.rawVertexShader = vertexSource || '';

      // Extract metadata from JSON comment block
      const metadata = this.extractMetadata(fragmentSource);
      if (!metadata) {
        return {
          success: false,
          error: 'No ISF metadata found in shader',
        };
      }
      this.metadata = metadata;

      // Parse passes
      const passes = this.parsePasses(metadata.PASSES || [{}]);

      // Extract main shader code (after metadata)
      this.fragmentMain = this.extractMainCode(fragmentSource);

      // Determine shader type
      const type = this.inferShaderType(metadata.INPUTS || []);

      // Generate WGSL shaders
      const { fragmentShader, vertexShader } = this.generateWGSL();

      return {
        success: true,
        fragmentShader,
        vertexShader,
        inputs: metadata.INPUTS || [],
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
   * Extract metadata JSON from shader comment block
   */
  private extractMetadata(source: string): ISFMetadata | null {
    const startIndex = source.indexOf('/*');
    const endIndex = source.indexOf('*/');

    if (startIndex === -1 || endIndex === -1) {
      return null;
    }

    const metadataString = source.substring(startIndex + 2, endIndex).trim();

    try {
      return JSON.parse(metadataString);
    } catch {
      // Try to fix common JSON issues
      try {
        const fixed = metadataString
          .replace(/,\s*}/g, '}')
          .replace(/,\s*]/g, ']')
          .replace(/'/g, '"');
        return JSON.parse(fixed);
      } catch {
        return null;
      }
    }
  }

  /**
   * Extract main shader code after metadata
   */
  private extractMainCode(source: string): string {
    const endIndex = source.indexOf('*/');
    if (endIndex === -1) return source;
    return source.substring(endIndex + 2).trim();
  }

  /**
   * Parse pass definitions
   */
  private parsePasses(passesArray: ISFMetadata['PASSES']): ParsedPass[] {
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
   * Generate WGSL shaders from ISF
   */
  private generateWGSL(): { fragmentShader: string; vertexShader: string } {
    const inputs = this.metadata?.INPUTS || [];

    // Build uniform struct
    let uniformStruct = 'struct Uniforms {\n';
    uniformStruct += '  time: f32,\n';
    uniformStruct += '  timeDelta: f32,\n';
    uniformStruct += '  renderSize: vec2<f32>,\n';
    uniformStruct += '  passIndex: f32,\n';
    uniformStruct += '  frameIndex: f32,\n';
    uniformStruct += '  _pad0: vec2<f32>,\n';
    uniformStruct += '  date: vec4<f32>,\n';

    // Add user inputs to uniform struct
    for (const input of inputs) {
      if (input.TYPE !== 'image') {
        const wgslType = TYPE_MAP[input.TYPE] || 'f32';
        uniformStruct += `  ${input.NAME}: ${wgslType},\n`;
      }
    }
    uniformStruct += '};\n\n';

    // Build bindings
    let bindings = '@group(0) @binding(0) var<uniform> uniforms: Uniforms;\n';
    let bindingIndex = 1;

    // Add texture bindings for images
    for (const input of inputs) {
      if (input.TYPE === 'image') {
        bindings += `@group(0) @binding(${bindingIndex}) var ${input.NAME}: texture_2d<f32>;\n`;
        bindingIndex++;
        bindings += `@group(0) @binding(${bindingIndex}) var ${input.NAME}Sampler: sampler;\n`;
        bindingIndex++;
      }
    }
    bindings += '\n';

    // Vertex shader
    const vertexShader = `
struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

@vertex
fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
  // Full-screen triangle
  var pos = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>(3.0, -1.0),
    vec2<f32>(-1.0, 3.0)
  );
  
  var output: VertexOutput;
  output.position = vec4<f32>(pos[vertexIndex], 0.0, 1.0);
  output.uv = (pos[vertexIndex] + 1.0) * 0.5;
  output.uv.y = 1.0 - output.uv.y; // Flip Y for conventional UV coords
  return output;
}
`;

    // Convert GLSL fragment to WGSL
    const convertedMain = this.convertGLSLtoWGSL(this.fragmentMain);

    const fragmentShader = `
${uniformStruct}
${bindings}

// Vertex output structure (must match vertex shader)
struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

// Helper functions
fn TIME() -> f32 { return uniforms.time; }
fn TIMEDELTA() -> f32 { return uniforms.timeDelta; }
fn RENDERSIZE() -> vec2<f32> { return uniforms.renderSize; }
fn PASSINDEX() -> i32 { return i32(uniforms.passIndex); }
fn FRAMEINDEX() -> i32 { return i32(uniforms.frameIndex); }
fn DATE() -> vec4<f32> { return uniforms.date; }

fn PASSINDEX_F32() -> f32 { return uniforms.passIndex; }
fn FRAMEINDEX_F32() -> f32 { return uniforms.frameIndex; }

// ISF coordinate helpers
fn isf_FragNormCoord(uv: vec2<f32>) -> vec2<f32> {
  return uv;
}

fn isf_FragCoord(uv: vec2<f32>) -> vec2<f32> {
  return uv * uniforms.renderSize;
}

// Texture sampling helpers
fn IMG_NORM_PIXEL(tex: texture_2d<f32>, samp: sampler, coord: vec2<f32>) -> vec4<f32> {
  return textureSample(tex, samp, coord);
}

fn IMG_PIXEL(tex: texture_2d<f32>, samp: sampler, coord: vec2<f32>) -> vec4<f32> {
  return textureSample(tex, samp, coord / uniforms.renderSize);
}

fn IMG_THIS_PIXEL(tex: texture_2d<f32>, samp: sampler, uv: vec2<f32>) -> vec4<f32> {
  return textureSample(tex, samp, uv);
}

// GLSL compatibility
fn mix_f32(a: f32, b: f32, t: f32) -> f32 { return a * (1.0 - t) + b * t; }
fn mix_vec2(a: vec2<f32>, b: vec2<f32>, t: f32) -> vec2<f32> { return a * (1.0 - t) + b * t; }
fn mix_vec3(a: vec3<f32>, b: vec3<f32>, t: f32) -> vec3<f32> { return a * (1.0 - t) + b * t; }
fn mix_vec4(a: vec4<f32>, b: vec4<f32>, t: f32) -> vec4<f32> { return a * (1.0 - t) + b * t; }


fn fract_f32(x: f32) -> f32 { return x - floor(x); }
fn fract_vec2(x: vec2<f32>) -> vec2<f32> { return x - floor(x); }
fn fract_vec3(x: vec3<f32>) -> vec3<f32> { return x - floor(x); }
fn fract_vec4(x: vec4<f32>) -> vec4<f32> { return x - floor(x); }

fn mod_f32(x: f32, y: f32) -> f32 { return x - y * floor(x / y); }
fn mod_vec2(x: vec2<f32>, y: f32) -> vec2<f32> { return x - y * floor(x / y); }
fn mod_vec3(x: vec3<f32>, y: f32) -> vec3<f32> { return x - y * floor(x / y); }
fn mod_vec4(x: vec4<f32>, y: f32) -> vec4<f32> { return x - y * floor(x / y); }

// NOTE: WGSL reserves mod as a keyword and does not support function overloading.
// We rewrite GLSL mod(a,b) calls into a - b * floor(a / b) in the converter.

${convertedMain}
`;

    return { fragmentShader, vertexShader };
  }

  /**
   * Convert GLSL to WGSL (basic conversion)
   */
  private convertGLSLtoWGSL(glsl: string): string {
    let wgsl = this.expandGLSLDefines(glsl);

    // GLSL scalar casts look like function calls (e.g. `float(i)`).
    // In WGSL, scalar conversion uses type constructors (e.g. `f32(i)`).
    wgsl = wgsl.replace(/\bfloat\s*\(/g, 'f32(');
    wgsl = wgsl.replace(/\bint\s*\(/g, 'i32(');
    wgsl = wgsl.replace(/\buint\s*\(/g, 'u32(');

    // Drop common GLSL interface declarations that can appear in imported shaders.
    // (ISF provides uniforms/textures via our generated WGSL bindings.)
    wgsl = wgsl.replace(/^\s*(uniform|varying|attribute)\b.*$/gm, (_m, kind) => `// (removed ${kind} decl)`);

    // Remove preprocessor directives (not supported in WGSL)
    wgsl = wgsl.replace(/^\s*#define\s+.*$/gm, '// (removed #define)');
    wgsl = wgsl.replace(/^\s*#ifdef\s+.*$/gm, '// (removed #ifdef)');
    wgsl = wgsl.replace(/^\s*#ifndef\s+.*$/gm, '// (removed #ifndef)');
    wgsl = wgsl.replace(/^\s*#else\s*$/gm, '// (removed #else)');
    wgsl = wgsl.replace(/^\s*#endif\s*$/gm, '// (removed #endif)');
    wgsl = wgsl.replace(/^\s*#include\s+.*$/gm, '// (removed #include)');
    wgsl = wgsl.replace(/^\s*#pragma\s+.*$/gm, '// (removed #pragma)');
    wgsl = wgsl.replace(/^\s*#version\s+.*$/gm, '// (removed #version)');
    wgsl = wgsl.replace(/^\s*#extension\s+.*$/gm, '// (removed #extension)');
    wgsl = wgsl.replace(/^\s*precision\s+.*$/gm, '// (removed precision)');

    // Remove 'in', 'out', 'inout' qualifiers from function parameters
    wgsl = wgsl.replace(/\b(in|out|inout)\s+(?=\w+\s+\w+)/g, '');

    // Convert GLSL function declarations to WGSL
    // GLSL: float funcName(float x, vec2 y) { ... }
    // WGSL: fn funcName(x: f32, y: vec2<f32>) -> f32 { ... }
    wgsl = this.convertFunctionDeclarations(wgsl);

    // Convert GLSL variable declarations to WGSL format
    // GLSL: float x = 5.0;  ->  WGSL: var x: f32 = 5.0;
    // GLSL: vec2 pos = ...  ->  WGSL: var pos: vec2<f32> = ...

    // First, replace types with temporary markers to avoid conflicts
    // Use negative lookahead to avoid matching types already in WGSL format (e.g., vec2<f32>)
    wgsl = wgsl.replace(/\bvec2\b(?!<)/g, '__VEC2__');
    wgsl = wgsl.replace(/\bvec3\b(?!<)/g, '__VEC3__');
    wgsl = wgsl.replace(/\bvec4\b(?!<)/g, '__VEC4__');
    wgsl = wgsl.replace(/\bivec2\b(?!<)/g, '__IVEC2__');
    wgsl = wgsl.replace(/\bivec3\b(?!<)/g, '__IVEC3__');
    wgsl = wgsl.replace(/\bivec4\b(?!<)/g, '__IVEC4__');
    wgsl = wgsl.replace(/\buvec2\b(?!<)/g, '__UVEC2__');
    wgsl = wgsl.replace(/\buvec3\b(?!<)/g, '__UVEC3__');
    wgsl = wgsl.replace(/\buvec4\b(?!<)/g, '__UVEC4__');
    wgsl = wgsl.replace(/\bmat2\b(?!x)/g, '__MAT2__');
    wgsl = wgsl.replace(/\bmat3\b(?!x)/g, '__MAT3__');
    wgsl = wgsl.replace(/\bmat4\b(?!x)/g, '__MAT4__');
    // Only convert float/int/bool that appear before an identifier (variable declarations)
    // This regex matches: float varname, int varname, bool varname
    // But NOT float after colon (: f32) or arrow (-> f32) which are WGSL syntax
    wgsl = wgsl.replace(/\bfloat\s+(?=\w)/g, '__FLOAT__ ');
    wgsl = wgsl.replace(/\bint\s+(?=\w)(?!\s*\()/g, '__INT__ ');
    wgsl = wgsl.replace(/\bbool\s+(?=\w)/g, '__BOOL__ ');

    // Convert variable declarations: TYPE name = value; -> var name: TYPE = value;
    // Match: __TYPE__ identifier = (not inside function params)
    wgsl = wgsl.replace(/(__VEC2__|__VEC3__|__VEC4__|__IVEC2__|__IVEC3__|__IVEC4__|__UVEC2__|__UVEC3__|__UVEC4__|__MAT2__|__MAT3__|__MAT4__|__FLOAT__|__INT__|__BOOL__)\s+(\w+)\s*=/g,
      'var $2: $1 =');

    // Now replace markers with actual WGSL types
    wgsl = wgsl.replace(/__VEC2__/g, 'vec2<f32>');
    wgsl = wgsl.replace(/__VEC3__/g, 'vec3<f32>');
    wgsl = wgsl.replace(/__VEC4__/g, 'vec4<f32>');
    wgsl = wgsl.replace(/__IVEC2__/g, 'vec2<i32>');
    wgsl = wgsl.replace(/__IVEC3__/g, 'vec3<i32>');
    wgsl = wgsl.replace(/__IVEC4__/g, 'vec4<i32>');
    wgsl = wgsl.replace(/__UVEC2__/g, 'vec2<u32>');
    wgsl = wgsl.replace(/__UVEC3__/g, 'vec3<u32>');
    wgsl = wgsl.replace(/__UVEC4__/g, 'vec4<u32>');
    wgsl = wgsl.replace(/__MAT2__/g, 'mat2x2<f32>');
    wgsl = wgsl.replace(/__MAT3__/g, 'mat3x3<f32>');
    wgsl = wgsl.replace(/__MAT4__/g, 'mat4x4<f32>');
    wgsl = wgsl.replace(/__FLOAT__/g, 'f32');
    wgsl = wgsl.replace(/__INT__/g, 'i32');
    wgsl = wgsl.replace(/__BOOL__/g, 'bool');

    // Replace built-in functions
    wgsl = wgsl.replace(/\bclamp\s*\(/g, 'clamp(');
    wgsl = wgsl.replace(/\bmin\s*\(/g, 'min(');
    wgsl = wgsl.replace(/\bmax\s*\(/g, 'max(');
    wgsl = wgsl.replace(/\babs\s*\(/g, 'abs(');
    wgsl = wgsl.replace(/\bsign\s*\(/g, 'sign(');
    wgsl = wgsl.replace(/\bfloor\s*\(/g, 'floor(');
    wgsl = wgsl.replace(/\bceil\s*\(/g, 'ceil(');
    wgsl = wgsl.replace(/\bround\s*\(/g, 'round(');
    wgsl = wgsl.replace(/\bsin\s*\(/g, 'sin(');
    wgsl = wgsl.replace(/\bcos\s*\(/g, 'cos(');
    wgsl = wgsl.replace(/\btan\s*\(/g, 'tan(');
    wgsl = wgsl.replace(/\basin\s*\(/g, 'asin(');
    wgsl = wgsl.replace(/\bacos\s*\(/g, 'acos(');
    // WGSL uses `atan2(y, x)` for the 2-arg form.
    // Keep 1-arg `atan(x)` as-is.
    wgsl = this.rewriteCallNameByArgCount(wgsl, 'atan', 2, 'atan2');
    wgsl = wgsl.replace(/\batan\s*\(/g, 'atan(');
    wgsl = wgsl.replace(/\bpow\s*\(/g, 'pow(');
    wgsl = wgsl.replace(/\bexp\s*\(/g, 'exp(');
    wgsl = wgsl.replace(/\blog\s*\(/g, 'log(');
    wgsl = wgsl.replace(/\binversesqrt\s*\(/g, 'inverseSqrt(');
    wgsl = wgsl.replace(/\bsqrt\s*\(/g, 'sqrt(');
    wgsl = wgsl.replace(/\blength\s*\(/g, 'length(');
    wgsl = wgsl.replace(/\bdistance\s*\(/g, 'distance(');
    wgsl = wgsl.replace(/\bdot\s*\(/g, 'dot(');
    wgsl = wgsl.replace(/\bcross\s*\(/g, 'cross(');
    wgsl = wgsl.replace(/\bnormalize\s*\(/g, 'normalize(');
    wgsl = wgsl.replace(/\breflect\s*\(/g, 'reflect(');
    wgsl = wgsl.replace(/\brefract\s*\(/g, 'refract(');
    wgsl = wgsl.replace(/\bstep\s*\(/g, 'step(');
    wgsl = wgsl.replace(/\bsmoothstep\s*\(/g, 'smoothstep(');

    // ++/-- are not supported in WGSL.
    wgsl = wgsl.replace(/\b(\w+)\s*\+\+/g, '$1 = $1 + 1');
    wgsl = wgsl.replace(/\b(\w+)\s*--/g, '$1 = $1 - 1');
    wgsl = wgsl.replace(/\+\+\s*(\w+)\b/g, '$1 = $1 + 1');
    wgsl = wgsl.replace(/--\s*(\w+)\b/g, '$1 = $1 - 1');

    // Replace texture sampling
    wgsl = wgsl.replace(/\btexture2D\s*\(\s*(\w+)\s*,/g, 'textureSample($1, $1Sampler,');
    // GLSL 3xx+ uses `texture(sampler, uv)`
    wgsl = wgsl.replace(/\btexture\s*\(\s*(\w+)\s*,/g, 'textureSample($1, $1Sampler,');
    // `textureLod(sampler, uv, lod)` -> `textureSampleLevel(...)`
    wgsl = wgsl.replace(/\btextureLod\s*\(\s*(\w+)\s*,/g, 'textureSampleLevel($1, $1Sampler,');

    // Replace ISF specific functions
    wgsl = wgsl.replace(/\bIMG_NORM_PIXEL\s*\(\s*(\w+)\s*,\s*([^)]+)\)/g,
      'textureSample($1, $1Sampler, $2)');
    wgsl = wgsl.replace(/\bIMG_PIXEL\s*\(\s*(\w+)\s*,\s*([^)]+)\)/g,
      'textureSample($1, $1Sampler, ($2) / uniforms.renderSize)');
    wgsl = wgsl.replace(/\bIMG_THIS_PIXEL\s*\(\s*(\w+)\s*\)/g,
      'textureSample($1, $1Sampler, input.uv)');
    wgsl = wgsl.replace(/\bIMG_THIS_NORM_PIXEL\s*\(\s*(\w+)\s*\)/g,
      'textureSample($1, $1Sampler, input.uv)');

    // Replace built-in variables
    wgsl = wgsl.replace(/\bisf_FragNormCoord\b/g, 'input.uv');
    wgsl = wgsl.replace(/\bisf_FragCoord\b/g, '(input.uv * uniforms.renderSize)');
    wgsl = wgsl.replace(/\bgl_FragCoord\b/g, '(input.uv * uniforms.renderSize)');
    wgsl = wgsl.replace(/\bgl_FragColor\b/g, 'outputColor');

    // ISF built-in uniforms (capitalized)
    wgsl = wgsl.replace(/\bTIME\b(?!\()/g, 'uniforms.time');
    wgsl = wgsl.replace(/\bTIMEDELTA\b(?!\()/g, 'uniforms.timeDelta');
    wgsl = wgsl.replace(/\bRENDERSIZE\b(?!\()/g, 'uniforms.renderSize');
    wgsl = wgsl.replace(/\bPASSINDEX\b(?!\()/g, 'uniforms.passIndex');
    wgsl = wgsl.replace(/\bFRAMEINDEX\b(?!\()/g, 'uniforms.frameIndex');
    wgsl = wgsl.replace(/\bDATE\b(?!\()/g, 'uniforms.date');

    // Common aliases (lowercase) - often used via #define macros
    // Avoid matching already-qualified members like `uniforms.time` (would become `uniforms.uniforms.time`).
    wgsl = wgsl.replace(/(?<!\.)\btime\b(?!\()/g, 'uniforms.time');
    wgsl = wgsl.replace(/(?<!\.)\bresolution\b(?!\()/g, 'uniforms.renderSize');
    wgsl = wgsl.replace(/(?<!\.)\biResolution\b(?!\()/g, 'uniforms.renderSize');
    wgsl = wgsl.replace(/(?<!\.)\biTime\b(?!\()/g, 'uniforms.time');
    wgsl = wgsl.replace(/(?<!\.)\biTimeDelta\b(?!\()/g, 'uniforms.timeDelta');
    wgsl = wgsl.replace(/(?<!\.)\biFrame\b(?!\()/g, 'f32(uniforms.frameIndex)');

    // Replace user uniforms
    const inputs = this.metadata?.INPUTS || [];
    for (const input of inputs) {
      if (input.TYPE !== 'image') {
        const regex = new RegExp(`\\b${input.NAME}\\b(?!\\()`, 'g');
        wgsl = wgsl.replace(regex, `uniforms.${input.NAME}`);
      }
    }

    // Convert bool/event uniforms (stored as u32) to boolean expressions when read.
    // This makes them usable in `if (...)`, `select(...)`, etc.
    const boolLike = new Set(
      inputs
        .filter((i) => i.TYPE === 'bool' || i.TYPE === 'event')
        .map((i) => i.NAME),
    );
    for (const name of boolLike) {
      const u = new RegExp(`\\buniforms\\.${name}\\b`, 'g');
      wgsl = wgsl.replace(u, `(uniforms.${name} != 0.0)`);
    }

    // Rewrite GLSL casts/mod that WGSL doesn't support.
    wgsl = this.rewriteBoolCasts(wgsl);
    wgsl = this.rewriteModCalls(wgsl);

    // Convert GLSL ternary operator `cond ? a : b` to WGSL `select(b, a, cond)`.
    // WGSL does not support `?:`.
    // We handle common statement forms used in ISF shaders.
    wgsl = this.convertTernaryToSelect(wgsl);

    // Convert main function - handle both void main() and void main(void)
    wgsl = wgsl.replace(
      /void\s+main\s*\(\s*(void)?\s*\)\s*\{/,
      `@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
  var outputColor: vec4<f32> = vec4<f32>(0.0, 0.0, 0.0, 1.0);`
    );

    // Fix `const TYPE name = ...;` to WGSL `const name: TYPE = ...;`
    // Run after type-marker replacement so TYPE is already WGSL-ish.
    wgsl = wgsl.replace(/\bconst\s+([A-Za-z0-9_<>,]+)\s+(\w+)\s*=/g, 'const $2: $1 =');

    // Ensure fs_main returns outputColor at its actual closing brace (not the last brace in the file).
    wgsl = this.ensureFsMainReturn(wgsl);

    return wgsl;
  }

  private rewriteBoolCasts(code: string): string {
    let out = code;
    let idx = 0;
    let safety = 0;

    while (idx < out.length && safety < 20000) {
      const found = this.findMacroInvocation(out, 'bool', idx);
      if (!found) break;
      safety++;

      const parsed = this.parseParenInvocationArgs(out, found.argsStartIndex);
      if (!parsed) {
        idx = found.argsStartIndex + 1;
        continue;
      }

      const [arg] = parsed.args;
      if (parsed.args.length !== 1) {
        idx = parsed.endIndex + 1;
        continue;
      }

      const expr = arg.trim();
      const looksBoolean =
        expr === 'true' ||
        expr === 'false' ||
        /[!<>=]=|\b(and|or)\b|&&|\|\|/.test(expr) ||
        /\b(uniforms\.[A-Za-z0-9_]+\s*!=\s*0u)\b/.test(expr);

      let replacement: string;
      if (looksBoolean) {
        replacement = `(${expr})`;
      } else if (/\b(u32\s*\()|0u\b|\b\d+u\b/.test(expr)) {
        replacement = `((${expr}) != 0u)`;
      } else if (/\b(i32\s*\()|\b\d+\b/.test(expr) && !/\./.test(expr)) {
        replacement = `((${expr}) != 0)`;
      } else if (/\.|\bf32\s*\(/.test(expr)) {
        replacement = `((${expr}) != 0.0)`;
      } else {
        // Fallback: treat as integer-like.
        replacement = `((${expr}) != 0)`;
      }

      out = out.slice(0, found.startIndex) + replacement + out.slice(parsed.endIndex + 1);
      idx = found.startIndex + replacement.length;
    }

    return out;
  }

  private rewriteModCalls(code: string): string {
    let out = code;
    let idx = 0;
    let safety = 0;

    while (idx < out.length && safety < 20000) {
      const found = this.findMacroInvocation(out, 'mod', idx);
      if (!found) break;
      safety++;

      const parsed = this.parseParenInvocationArgs(out, found.argsStartIndex);
      if (!parsed) {
        idx = found.argsStartIndex + 1;
        continue;
      }

      if (parsed.args.length !== 2) {
        idx = parsed.endIndex + 1;
        continue;
      }

      const a = parsed.args[0].trim();
      const b = parsed.args[1].trim();
      const replacement = `(((${a}) - (${b}) * floor((${a}) / (${b}))))`;
      out = out.slice(0, found.startIndex) + replacement + out.slice(parsed.endIndex + 1);
      idx = found.startIndex + replacement.length;
    }

    return out;
  }

  private ensureFsMainReturn(code: string): string {
    const fnIdx = code.indexOf('fn fs_main');
    if (fnIdx === -1) return code;

    const openIdx = code.indexOf('{', fnIdx);
    if (openIdx === -1) return code;

    let depth = 0;
    let closeIdx = -1;
    for (let i = openIdx; i < code.length; i++) {
      const ch = code[i];
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) {
          closeIdx = i;
          break;
        }
      }
    }

    if (closeIdx === -1) return code;

    const beforeClose = code.slice(0, closeIdx);
    if (/\breturn\s+outputColor\s*;\s*$/.test(beforeClose)) return code;

    return code.slice(0, closeIdx) + '\n  return outputColor;\n' + code.slice(closeIdx);
  }

  /**
   * Convert common GLSL ternary expressions to WGSL select().
   * Note: This is a best-effort string transform (not a full parser).
   */
  private convertTernaryToSelect(code: string): string {
    let out = code;

    // Assignment form: lhs = cond ? a : b;
    out = out.replace(
      /(\b[\w\.\[\]]+\b)\s*=\s*([^;\n\r]+?)\s*\?\s*([^;\n\r]+?)\s*:\s*([^;\n\r]+?)\s*;/g,
      (_m, lhs, cond, a, b) => `${lhs} = select(${b}, ${a}, ${cond});`,
    );

    // Return form: return cond ? a : b;
    out = out.replace(
      /return\s+([^;\n\r]+?)\s*\?\s*([^;\n\r]+?)\s*:\s*([^;\n\r]+?)\s*;/g,
      (_m, cond, a, b) => `return select(${b}, ${a}, ${cond});`,
    );

    // Var init form: var x: T = cond ? a : b;
    out = out.replace(
      /(var\s+\w+\s*:\s*[\w<>]+\s*=\s*)([^;\n\r]+?)\s*\?\s*([^;\n\r]+?)\s*:\s*([^;\n\r]+?)\s*;/g,
      (_m, prefix, cond, a, b) => `${prefix}select(${b}, ${a}, ${cond});`,
    );

    return out;
  }

  /**
   * Convert GLSL function declarations to WGSL format
   * GLSL: float funcName(float x, vec2 y) { ... }
   * WGSL: fn funcName(x: f32, y: vec2<f32>) -> f32 { ... }
   */
  private convertFunctionDeclarations(code: string): string {
    // Type mapping for functions
    const typeMap: Record<string, string> = {
      'void': 'void',
      'float': 'f32',
      'int': 'i32',
      'bool': 'bool',
      'vec2': 'vec2<f32>',
      'vec3': 'vec3<f32>',
      'vec4': 'vec4<f32>',
      'ivec2': 'vec2<i32>',
      'ivec3': 'vec3<i32>',
      'ivec4': 'vec4<i32>',
      'uvec2': 'vec2<u32>',
      'uvec3': 'vec3<u32>',
      'uvec4': 'vec4<u32>',
      'mat2': 'mat2x2<f32>',
      'mat3': 'mat3x3<f32>',
      'mat4': 'mat4x4<f32>',
    };

    // Regular expression to match GLSL function declarations
    // Matches: returnType funcName(params) { (with flexible whitespace)
    // Using more specific type names to avoid partial matches
    const typePattern = 'void|float|int|bool|vec2|vec3|vec4|ivec2|ivec3|ivec4|uvec2|uvec3|uvec4|mat2|mat3|mat4';
    const funcRegex = new RegExp(
      `\\b(${typePattern})\\s+(\\w+)\\s*\\(([^)]*)\\)\\s*\\{`,
      'g'
    );

    return code.replace(funcRegex, (match, returnType, funcName, params) => {
      // Skip main function - it's handled separately
      if (funcName === 'main') {
        return match;
      }

      // Convert parameters
      const convertedParams = this.convertFunctionParams(params, typeMap);

      // Build WGSL function declaration
      const wgslReturnType = typeMap[returnType] || 'f32';

      if (wgslReturnType === 'void') {
        return `fn ${funcName}(${convertedParams}) {`;
      } else {
        return `fn ${funcName}(${convertedParams}) -> ${wgslReturnType} {`;
      }
    });
  }

  /**
   * Convert GLSL function parameters to WGSL format
   * GLSL: float x, vec2 y, in vec3 z
   * WGSL: x: f32, y: vec2<f32>, z: vec3<f32>
   */
  private convertFunctionParams(params: string, typeMap: Record<string, string>): string {
    if (!params.trim()) return '';

    const paramList = params.split(',').map(p => p.trim()).filter(p => p);
    const typePattern = 'void|float|int|bool|vec2|vec3|vec4|ivec2|ivec3|ivec4|uvec2|uvec3|uvec4|mat2|mat3|mat4';

    const converted = paramList.map(param => {
      // Remove in/out/inout qualifiers
      param = param.replace(/\b(in|out|inout)\s+/g, '');

      // Match: type name (with optional const)
      const match = param.match(new RegExp(`^\\s*(?:const\\s+)?(${typePattern})\\s+(\\w+)\\s*$`));

      if (match) {
        const [, type, name] = match;
        const wgslType = typeMap[type] || 'f32';
        return `${name}: ${wgslType}`;
      }

      // If we couldn't parse it, return as-is (might cause errors but better than losing it)
      console.warn('[ISFParser] Could not parse function parameter:', param);
      return param;
    });

    return converted.join(', ');
  }

  /**
   * Get parsed metadata
   */
  getMetadata(): ISFMetadata | null {
    return this.metadata;
  }

  /**
   * Get input definitions
   */
  getInputs(): ISFInput[] {
    return this.metadata?.INPUTS || [];
  }
}

/**
 * Singleton parser instance
 */
export const isfParser = new ISFParser();
