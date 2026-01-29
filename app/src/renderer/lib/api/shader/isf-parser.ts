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
   * 
   * @param source - The GLSL source code
   * @param uniformNames - Set of uniform names that should NOT be expanded (they are ISF inputs)
   */
  private expandGLSLDefines(source: string, uniformNames: Set<string>): string {
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
        // Extract macro body, stripping any trailing comment
        let macroBody = fn[3];
        const commentIdx = macroBody.indexOf('//');
        if (commentIdx >= 0) {
          macroBody = macroBody.slice(0, commentIdx).trim();
        }
        macroBody = macroBody.replace(/\/\*.*?\*\//g, '').trim();

        if (macroBody) {
          functionDefines.push({ name: fn[1], args, body: macroBody });
        }
        outLines.push(`// (removed #define ${fn[1]}(${args.join(',')}) ...)`);
        continue;
      }

      // Object-like: #define NAME body...
      const obj = line.match(/^\s*#define\s+(\w+)\s+(.+?)\s*$/);
      if (obj) {
        const macroName = obj[1];
        // Skip macros that match ISF uniform names - these should use the uniform instead
        if (uniformNames.has(macroName)) {
          outLines.push(`// (skipped #define ${macroName} - using uniform instead)`);
          continue;
        }
        // Extract macro value, stripping any trailing comment
        let macroValue = obj[2];
        const commentIdx = macroValue.indexOf('//');
        if (commentIdx >= 0) {
          macroValue = macroValue.slice(0, commentIdx).trim();
        }
        // Also handle /* */ comments in macro value
        macroValue = macroValue.replace(/\/\*.*?\*\//g, '').trim();

        if (macroValue) {
          objectDefines.set(macroName, macroValue);
        }
        outLines.push(`// (removed #define ${macroName} ...)`);
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
      // We need to avoid expanding inside comments.
      for (const [name, value] of objectDefines.entries()) {
        code = this.expandObjectMacroSafe(code, name, value);
      }

      if (code === before) break;
    }

    return code;
  }

  /**
   * Expand object-like macro while avoiding comments.
   * This prevents recursive expansion when macro names appear in comment text.
   */
  private expandObjectMacroSafe(code: string, name: string, value: string): string {
    const result: string[] = [];
    const lines = code.split('\n');

    for (const line of lines) {
      // Find where the comment starts (if any)
      const singleLineComment = line.indexOf('//');
      const codePartEnd = singleLineComment >= 0 ? singleLineComment : line.length;

      // Split line into code part and comment part
      const codePart = line.slice(0, codePartEnd);
      const commentPart = line.slice(codePartEnd);

      // Only expand macros in the code part, not in comments
      const re = new RegExp(`\\b${this.escapeRegExp(name)}\\b`, 'g');
      const expandedCodePart = codePart.replace(re, `(${value})`);

      result.push(expandedCodePart + commentPart);
    }

    return result.join('\n');
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

  private replaceCall(code: string, name: string, replacer: (args: string[]) => string | null): string {
    let out = code;
    let startFrom = 0;
    let safety = 0;

    while (safety < 10000) {
      const found = this.findMacroInvocation(out, name, startFrom);
      if (!found) break;

      safety++;
      const parsed = this.parseParenInvocationArgs(out, found.argsStartIndex);
      if (!parsed) {
        startFrom = found.argsStartIndex + 1;
        continue;
      }

      const replacement = replacer(parsed.args);
      if (replacement !== null) {
        out = out.slice(0, found.startIndex) + replacement + out.slice(parsed.endIndex + 1);
        startFrom = found.startIndex + replacement.length;
      } else {
        startFrom = parsed.endIndex + 1;
      }
    }
    return out;
  }

  private replaceTextureSamplingCalls(code: string): string {
    let wgsl = code;

    // IMG_NORM_PIXEL(tex, coord) -> textureSampleLevel(tex, texSampler, coord, 0.0)
    wgsl = this.replaceCall(wgsl, 'IMG_NORM_PIXEL', (args) => {
      if (args.length !== 2) return null;
      return `textureSampleLevel(${args[0]}, ${args[0]}Sampler, ${args[1]}, 0.0)`;
    });

    // IMG_PIXEL(tex, coord) -> textureSampleLevel(tex, texSampler, coord / uniforms.renderSize, 0.0)
    wgsl = this.replaceCall(wgsl, 'IMG_PIXEL', (args) => {
      if (args.length !== 2) return null;
      return `textureSampleLevel(${args[0]}, ${args[0]}Sampler, (${args[1]}) / uniforms.renderSize, 0.0)`;
    });

    // IMG_THIS_PIXEL(tex) -> textureSampleLevel(tex, texSampler, input.uv, 0.0)
    wgsl = this.replaceCall(wgsl, 'IMG_THIS_PIXEL', (args) => {
      if (args.length !== 1) return null;
      return `textureSampleLevel(${args[0]}, ${args[0]}Sampler, input.uv, 0.0)`;
    });

    // IMG_THIS_NORM_PIXEL(tex) -> textureSampleLevel(tex, texSampler, input.uv, 0.0)
    wgsl = this.replaceCall(wgsl, 'IMG_THIS_NORM_PIXEL', (args) => {
      if (args.length !== 1) return null;
      return `textureSampleLevel(${args[0]}, ${args[0]}Sampler, input.uv, 0.0)`;
    });

    // texture2D(tex, coord) -> textureSampleLevel(tex, texSampler, coord, 0.0)
    wgsl = this.replaceCall(wgsl, 'texture2D', (args) => {
      if (args.length !== 2) return null;
      return `textureSampleLevel(${args[0]}, ${args[0]}Sampler, ${args[1]}, 0.0)`;
    });

    // texture(tex, coord) -> textureSampleLevel(tex, texSampler, coord, 0.0)
    wgsl = this.replaceCall(wgsl, 'texture', (args) => {
      if (args.length !== 2) return null;
      return `textureSampleLevel(${args[0]}, ${args[0]}Sampler, ${args[1]}, 0.0)`;
    });

    // textureLod(tex, coord, lod) -> textureSampleLevel(tex, texSampler, coord, lod)
    wgsl = this.replaceCall(wgsl, 'textureLod', (args) => {
      if (args.length !== 3) return null;
      return `textureSampleLevel(${args[0]}, ${args[0]}Sampler, ${args[1]}, ${args[2]})`;
    });

    // textureSample(tex, samp, coord) -> textureSampleLevel(tex, samp, coord, 0.0)
    wgsl = this.replaceCall(wgsl, 'textureSample', (args) => {
      if (args.length !== 3) return null;
      return `textureSampleLevel(${args[0]}, ${args[1]}, ${args[2]}, 0.0)`;
    });

    return wgsl;
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

    let metadata: ISFMetadata | null = null;

    try {
      metadata = JSON.parse(metadataString);
    } catch {
      // Try to fix common JSON issues
      try {
        const fixed = metadataString
          .replace(/,\s*}/g, '}')
          .replace(/,\s*]/g, ']')
          .replace(/'/g, '"');
        metadata = JSON.parse(fixed);
      } catch {
        return null;
      }
    }

    // Inject BUILTIN_SPEED
    if (metadata) {
      if (!metadata.INPUTS) metadata.INPUTS = [];
      const hasSpeed = metadata.INPUTS.some((i: any) => i.NAME === 'BUILTIN_SPEED');
      if (!hasSpeed) {
        metadata.INPUTS.push({
          NAME: 'BUILTIN_SPEED',
          TYPE: 'float',
          DEFAULT: 1.0,
          MIN: 0.0,
          MAX: 5.0,
          LABEL: 'Speed'
        });
      }
    }

    return metadata;
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
    uniformStruct += '  layerOpacity: f32,\n';
    uniformStruct += '  speed: f32,\n';
    uniformStruct += '  date: vec4<f32>,\n';

    const reservedUniforms = new Set([
      'time', 'timeDelta', 'renderSize', 'passIndex',
      'frameIndex', 'layerOpacity', 'speed', 'date'
    ]);

    // Add user inputs to uniform struct
    for (const input of inputs) {
      if (input.TYPE !== 'image' && !reservedUniforms.has(input.NAME)) {
        const wgslType = TYPE_MAP[input.TYPE] || 'f32';
        uniformStruct += `  ${input.NAME}: ${wgslType},\n`;
      }
    }
    uniformStruct += '};\n\n';

    // Build bindings
    let bindings = '@group(0) @binding(0) var<uniform> uniforms: Uniforms;\n';
    let bindingIndex = 1;

    // Add texture bindings for images (user inputs)
    for (const input of inputs) {
      if (input.TYPE === 'image') {
        bindings += `@group(0) @binding(${bindingIndex}) var ${input.NAME}: texture_2d<f32>;\n`;
        bindingIndex++;
        bindings += `@group(0) @binding(${bindingIndex}) var ${input.NAME}Sampler: sampler;\n`;
        bindingIndex++;
      }
    }

    // Add bindings for Multipass Targets (pass1, pass2, etc.)
    // If we have passes, we might need access to previous pass outputs
    const passes = this.metadata?.PASSES || [];
    if (passes.length > 0) {
      // Technically we should only bind passes that are actually used in the shader code
      // But for simplicity, we can try to bind them if they correspond to valid previous passes
      // In ISF, passes are usually named by their TARGET property, or implicitly passN

      // For each pass, we potentially have a texture available
      // The bindings here must match what RenderContext sets up
      // Based on RenderContext implementation, it binds passes after user inputs

      // Note: We scan the original source code to see if these passes are referenced
      // to avoid declaring unused bindings (though unused bindings are generally handled by wgpu/dawn)

      // Standard ISF pass names: pass1, pass2, etc. (referencing the OUTPUT of that pass)
      // Also custom target names from TARGET property

      const referencedPasses = new Set<string>();

      // Simple regex to find texture usage: textureSample(NAME, ...) or just the name
      // We look for pass names in the source code
      // Default names are pass1, pass2... (referring to index 0, 1...)

      for (let i = 0; i < passes.length; i++) {
        const pass = passes[i];
        const defaultName = `pass${i + 1}`; // pass1 is output of first pass (index 0)

        if (this.fragmentMain.includes(defaultName)) {
          referencedPasses.add(defaultName);
        }

        if (pass.TARGET && this.fragmentMain.includes(pass.TARGET)) {
          referencedPasses.add(pass.TARGET);
        }
      }

      // Generate bindings for referenced passes
      // Important: The binding index MUST match the order expected by RenderContext
      // RenderContext binds passes sequentially after inputs

      // We will declare bindings for ALL potential passes to ensure indices align
      // with RenderContext if it binds them blindly. 
      // If RenderContext binds only used passes, we need to match that logic.
      // Assuming RenderContext binds based on what the shader needs OR all previous passes.

      // Let's assume we binding all previous passes for now, as that's safer for ISF logic
      // where any pass can reference any previous pass.

      // NOTE: We need to coordinate with render-context.ts.
      // If render-context.ts binds ALL passes, we should declare ALL passes here?
      // Or specific ones?

      // Let's modify this to just ensure we have bindings for referenced passes
      // We'll trust that render-context binds them in a predictable order
      // usually: Uniforms (0), Inputs (1..N), Passes (N+1...)

      // Actually, we can just iterate and add them if they appear in source
      // effectively reserving binding slots

      // Since we don't know EXACTLY what render-context does yet (user didn't share that part completely),
      // we will implement a strategy that declares bindings for detected pass names
      // and hope render-context matches the binding indices.

      const detectedPassNames: string[] = [];

      // Check for pass1, pass2, etc.
      for (let i = 0; i < passes.length; i++) {
        const pName = `pass${i + 1}`;
        if (this.fragmentMain.includes(pName)) {
          if (!detectedPassNames.includes(pName)) detectedPassNames.push(pName);
        }
        if (passes[i].TARGET && this.fragmentMain.includes(passes[i].TARGET)) {
          const tName = passes[i].TARGET!;
          if (!detectedPassNames.includes(tName)) detectedPassNames.push(tName);
        }
      }

      for (const passName of detectedPassNames) {
        bindings += `@group(0) @binding(${bindingIndex}) var ${passName}: texture_2d<f32>;\n`;
        bindingIndex++;
        bindings += `@group(0) @binding(${bindingIndex}) var ${passName}Sampler: sampler;\n`;
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
fn SPEED() -> f32 { return uniforms.speed; }

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
// Use textureSampleLevel with LOD 0 to allow sampling in non-uniform control flow (if statements)
fn IMG_NORM_PIXEL(tex: texture_2d<f32>, samp: sampler, coord: vec2<f32>) -> vec4<f32> {
  return textureSampleLevel(tex, samp, coord, 0.0);
}

fn IMG_PIXEL(tex: texture_2d<f32>, samp: sampler, coord: vec2<f32>) -> vec4<f32> {
  return textureSampleLevel(tex, samp, coord / uniforms.renderSize, 0.0);
}

fn IMG_THIS_PIXEL(tex: texture_2d<f32>, samp: sampler, uv: vec2<f32>) -> vec4<f32> {
  return textureSampleLevel(tex, samp, uv, 0.0);
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
    // Get ISF uniform names to prevent macro expansion of these
    const isfInputs = this.metadata?.INPUTS || [];
    const uniformNames = new Set<string>(
      isfInputs.filter(i => i.TYPE !== 'image').map(i => i.NAME)
    );

    let wgsl = this.expandGLSLDefines(glsl, uniformNames);

    // Preserve comments by replacing them with placeholders before transformations
    // This prevents regex replacements from corrupting comment content
    const comments: string[] = [];
    wgsl = wgsl.replace(/\/\/[^\n]*/g, (match) => {
      const idx = comments.length;
      comments.push(match);
      return `__COMMENT_${idx}__`;
    });
    // Also preserve multi-line comments
    wgsl = wgsl.replace(/\/\*[\s\S]*?\*\//g, (match) => {
      const idx = comments.length;
      comments.push(match);
      return `__COMMENT_${idx}__`;
    });

    // Remove common ISF/Shadertoy alias variable declarations BEFORE type conversion.
    // These create local aliases for built-ins that we handle via uniforms.
    // Example: vec3 iResolution = vec3(RENDERSIZE, 1.); -> removed
    // Example: float iTime = TIME; -> removed
    wgsl = wgsl.replace(/^\s*vec3\s+iResolution\s*=\s*[^;]+;\s*$/gm, '// (removed iResolution alias - use uniforms.renderSize)');
    wgsl = wgsl.replace(/^\s*vec2\s+iResolution\s*=\s*[^;]+;\s*$/gm, '// (removed iResolution alias - use uniforms.renderSize)');
    wgsl = wgsl.replace(/^\s*float\s+iTime\s*=\s*[^;]+;\s*$/gm, '// (removed iTime alias - use uniforms.time)');
    wgsl = wgsl.replace(/^\s*float\s+iTimeDelta\s*=\s*[^;]+;\s*$/gm, '// (removed iTimeDelta alias - use uniforms.timeDelta)');
    wgsl = wgsl.replace(/^\s*float\s+iFrame\s*=\s*[^;]+;\s*$/gm, '// (removed iFrame alias - use uniforms.frameIndex)');
    wgsl = wgsl.replace(/^\s*int\s+iFrame\s*=\s*[^;]+;\s*$/gm, '// (removed iFrame alias - use uniforms.frameIndex)');
    wgsl = wgsl.replace(/^\s*vec4\s+iDate\s*=\s*[^;]+;\s*$/gm, '// (removed iDate alias - use uniforms.date)');
    // Also handle resolution/time without 'i' prefix
    wgsl = wgsl.replace(/^\s*vec3\s+resolution\s*=\s*[^;]+;\s*$/gm, '// (removed resolution alias - use uniforms.renderSize)');
    wgsl = wgsl.replace(/^\s*vec2\s+resolution\s*=\s*[^;]+;\s*$/gm, '// (removed resolution alias - use uniforms.renderSize)');
    wgsl = wgsl.replace(/^\s*float\s+time\s*=\s*[^;]+;\s*$/gm, '// (removed time alias - use uniforms.time)');

    // GLSL scalar casts look like function calls (e.g. `float(i)`).
    // In WGSL, scalar conversion uses type constructors (e.g. `f32(i)`).
    wgsl = wgsl.replace(/\bfloat\s*\(/g, 'f32(');
    wgsl = wgsl.replace(/\bint\s*\(/g, 'i32(');
    wgsl = wgsl.replace(/\buint\s*\(/g, 'u32(');

    // Drop common GLSL interface declarations that can appear in imported shaders.
    // (ISF provides uniforms/textures via our generated WGSL bindings.)
    wgsl = wgsl.replace(/^\s*(uniform|varying|attribute)\b.*$/gm, (_m, kind) => `// (removed ${kind} decl)`);

    // Remove preprocessor directives (not supported in WGSL)
    wgsl = wgsl.replace(/^\s*#define\s+.*$/gm, '// (removed #define ...)');
    wgsl = wgsl.replace(/^\s*#if\s+.*$/gm, '// (removed #if)');
    wgsl = wgsl.replace(/^\s*#ifdef\s+.*$/gm, '// (removed #ifdef)');
    wgsl = wgsl.replace(/^\s*#ifndef\s+.*$/gm, '// (removed #ifndef)');
    wgsl = wgsl.replace(/^\s*#elif\s+.*$/gm, '// (removed #elif)');
    wgsl = wgsl.replace(/^\s*#else\s*$/gm, '// (removed #else)');
    wgsl = wgsl.replace(/^\s*#endif\s*$/gm, '// (removed #endif)');
    wgsl = wgsl.replace(/^\s*#include\s+.*$/gm, '// (removed #include)');
    wgsl = wgsl.replace(/^\s*#pragma\s+.*$/gm, '// (removed #pragma)');
    wgsl = wgsl.replace(/^\s*#version\s+.*$/gm, '// (removed #version)');
    wgsl = wgsl.replace(/^\s*#extension\s+.*$/gm, '// (removed #extension)');
    wgsl = wgsl.replace(/^\s*#line\s+.*$/gm, '// (removed #line)');
    wgsl = wgsl.replace(/^\s*#error\s+.*$/gm, '// (removed #error)');
    wgsl = wgsl.replace(/^\s*precision\s+.*$/gm, '// (removed precision)');

    // Remove GLSL OUT macro usage (common pattern for out parameters in function calls)
    // GLSL: func(a, b, OUT t) -> WGSL: func(a, b, t)
    wgsl = wgsl.replace(/\bOUT\s+(\w+)/g, '$1');

    // Remove GLSL function forward declarations (prototypes)
    // WGSL doesn't support forward declarations - functions can be called before definition
    // Pattern: void/float/vec/mat funcName(...); (ending with semicolon, not opening brace)
    wgsl = wgsl.replace(/^\s*(void|float|int|bool|vec[234]|ivec[234]|uvec[234]|mat[234])\s+\w+\s*\([^)]*\)\s*;/gm,
      '// (removed forward declaration)');

    // Remove 'in', 'out', 'inout' qualifiers from function parameters
    wgsl = wgsl.replace(/\b(in|out|inout)\s+(?=\w+\s+\w+)/g, '');

    // Convert GLSL function declarations to WGSL
    // GLSL: float funcName(float x, vec2 y) { ... }
    // WGSL: fn funcName(x: f32, y: vec2<f32>) -> f32 { ... }
    wgsl = this.convertFunctionDeclarations(wgsl);

    // Convert GLSL variable declarations to WGSL format
    // GLSL: float x = 5.0;  ->  WGSL: var x: f32 = 5.0;
    // GLSL: vec2 pos = ...  ->  WGSL: var pos: vec2<f32> = ...
    // GLSL: const mat3 m = ... -> WGSL: const m: mat3x3<f32> = ...

    // First handle `const` declarations specially - WGSL uses `const name: TYPE` not `const TYPE name`
    // Do this BEFORE the general variable declaration conversion
    wgsl = wgsl.replace(/\bconst\s+(vec2|vec3|vec4|ivec2|ivec3|ivec4|uvec2|uvec3|uvec4|mat2|mat3|mat4|float|int|bool)\s+(\w+)\s*=/g,
      (_, type, name) => {
        const typeMap: Record<string, string> = {
          'vec2': 'vec2<f32>', 'vec3': 'vec3<f32>', 'vec4': 'vec4<f32>',
          'ivec2': 'vec2<i32>', 'ivec3': 'vec3<i32>', 'ivec4': 'vec4<i32>',
          'uvec2': 'vec2<u32>', 'uvec3': 'vec3<u32>', 'uvec4': 'vec4<u32>',
          'mat2': 'mat2x2<f32>', 'mat3': 'mat3x3<f32>', 'mat4': 'mat4x4<f32>',
          'float': 'f32', 'int': 'i32', 'bool': 'bool'
        };
        return `const ${name}: ${typeMap[type] || type} =`;
      });

    // Preprocess GLSL comma-separated declarations before type conversion
    // GLSL: float pa, a = pa = 0.;  ->  float pa = 0.; float a = pa;
    wgsl = this.preprocessGLSLCommaDeclarations(wgsl);

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

    // Convert variable declarations WITH initialization: TYPE name = value; -> var name: TYPE = value;
    wgsl = wgsl.replace(/(__VEC2__|__VEC3__|__VEC4__|__IVEC2__|__IVEC3__|__IVEC4__|__UVEC2__|__UVEC3__|__UVEC4__|__MAT2__|__MAT3__|__MAT4__|__FLOAT__|__INT__|__BOOL__)\s+(\w+)\s*=/g,
      'var $2: $1 =');

    // Convert variable declarations WITHOUT initialization: TYPE name; -> var name: TYPE;
    // Match: TYPE identifier; (at end of statement, not followed by =)
    wgsl = wgsl.replace(/(__VEC2__|__VEC3__|__VEC4__|__IVEC2__|__IVEC3__|__IVEC4__|__UVEC2__|__UVEC3__|__UVEC4__|__MAT2__|__MAT3__|__MAT4__|__FLOAT__|__INT__|__BOOL__)\s+(\w+)\s*;/g,
      'var $2: $1;');

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

    // Split comma-separated variable declarations into separate statements
    // GLSL: var a: f32 = 1.0, b = 2.0, c = 3.0;  ->  var a: f32 = 1.0; var b: f32 = 2.0; var c: f32 = 3.0;
    wgsl = this.splitCommaVariableDeclarations(wgsl);

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
    // Handle both direct calls and parenthesized macro expansions like (inversesqrt)(x)
    wgsl = wgsl.replace(/\(inversesqrt\)\s*\(/g, 'inverseSqrt(');
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

    // Replace texture sampling (IMG_PIXEL, texture2D, etc.)
    // Uses textureSampleLevel with LOD 0 to allow sampling in non-uniform control flow
    wgsl = this.replaceTextureSamplingCalls(wgsl);


    // Replace built-in variables
    wgsl = wgsl.replace(/\bisf_FragNormCoord\b/g, 'input.uv');
    wgsl = wgsl.replace(/\bvv_FragNormCoord\b/g, 'input.uv');
    wgsl = wgsl.replace(/\btexCoord\b/g, 'input.uv');
    wgsl = wgsl.replace(/\btexcoord\b/g, 'input.uv');
    wgsl = wgsl.replace(/\bv_texcoord\b/g, 'input.uv');
    wgsl = wgsl.replace(/\bvTexCoord\b/g, 'input.uv');
    wgsl = wgsl.replace(/\bv_uv\b/g, 'input.uv');
    wgsl = wgsl.replace(/\bvUv\b/g, 'input.uv');
    wgsl = wgsl.replace(/\bisf_FragCoord\b/g, '(input.uv * uniforms.renderSize)');
    // Handle Shadertoy-style mainImage function BEFORE replacing fragCoord
    // This preserves the parameter name in the function signature
    wgsl = this.convertMainImageFunction(wgsl);
    wgsl = wgsl.replace(/\bfragCoord\b/g, '(input.uv * uniforms.renderSize)');
    wgsl = wgsl.replace(/\bgl_FragCoord\b/g, '(input.uv * uniforms.renderSize)');
    wgsl = wgsl.replace(/\bgl_FragColor\b/g, 'outputColor');
    wgsl = wgsl.replace(/\bfragColor\b/g, 'outputColor');

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
    // But first, we need to avoid replacing parameter local copies
    // Parameter local copies are: var name: TYPE = name_in;
    // We should not replace the "name" in variable declarations that are followed by "_in"
    const inputs = this.metadata?.INPUTS || [];
    for (const input of inputs) {
      if (input.TYPE !== 'image') {
        // Negative lookahead to avoid replacing in "var name: TYPE = name_in" pattern
        // Also avoid replacing when preceded by "var " (variable declaration of same name)
        const regex = new RegExp(`(?<!var\\s+)\\b${input.NAME}\\b(?!_in)(?!\\()`, 'g');
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

    // WGSL requires braces for if/else statements - convert single-line if/else to braced form
    wgsl = this.addBracesToIfStatements(wgsl);

    // Fix swizzle assignments - WGSL doesn't support assigning to swizzles like var.rgb = expr
    // NOTE: Must run BEFORE fixMatrixNegation because swizzle fixes can create patterns like vec * (-mat)
    wgsl = this.fixSwizzleAssignments(wgsl);

    // Fix unary negation of matrices - WGSL doesn't support -matrix
    // Convert: vec * (-mat) -> -(vec * mat)
    wgsl = this.fixMatrixNegation(wgsl);

    // Fix out/inout parameters (convert to pointers)
    // This must run before clamp fixes, as pointers might change text structure
    wgsl = this.fixOutParameters(wgsl);

    // Fix clamp() calls with scalar min/max on vectors
    // WGSL requires: clamp(vec4, vec4, vec4), not clamp(vec4, scalar, scalar)
    wgsl = this.fixClampCalls(wgsl);

    // Fix smoothstep() calls with scalar edge0/edge1 on vectors
    // WGSL requires: smoothstep(vec3, vec3, vec3), not smoothstep(scalar, scalar, vec3)
    wgsl = this.fixSmoothstepCalls(wgsl);

    // Fix max() and min() calls with vector and scalar arguments
    // WGSL requires: max(vec3, vec3), not max(vec3, scalar)
    wgsl = this.fixMaxMinCalls(wgsl);

    // Fix matrix division by scalar
    // WGSL doesn't support mat / scalar, convert to mat * (1.0 / scalar)
    wgsl = this.fixMatrixDivision(wgsl);

    // Fix C-style array declarations
    // vec4<f32> arr[9]; -> var arr: array<vec4<f32>, 9>;
    wgsl = this.fixArrayDeclarations(wgsl);

    // Rename identifiers that conflict with WGSL reserved keywords
    wgsl = this.renameReservedKeywords(wgsl);

    // Fix function overloading (WGSL doesn't support it)
    // Rename duplicate function names with different signatures
    wgsl = this.fixFunctionOverloading(wgsl);

    // Fix helper functions that use coordinate built-ins (before replacing built-in variables)
    wgsl = this.fixHelperFunctionCoordinates(wgsl);

    // Fix module-scope var declarations - WGSL requires address space
    // This must happen before main() conversion to identify module-scope vars
    wgsl = this.fixModuleScopeVarDeclarations(wgsl);

    // Get vars that need to be initialized in fs_main (they reference uniforms)
    const varsToInitInMain = (this as any)._varsToInitInMain as Array<{ name: string, value: string }> || [];
    const initVarsCode = varsToInitInMain.length > 0
      ? '\n  ' + varsToInitInMain.map(v => `${v.name} = ${v.value};`).join('\n  ')
      : '';

    // Convert main function - handle both void main() and void main(void)
    wgsl = wgsl.replace(
      /void\s+main\s*\(\s*(void)?\s*\)\s*\{/,
      `@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
  var outputColor: vec4<f32> = vec4<f32>(0.0, 0.0, 0.0, 1.0);${initVarsCode}`
    );

    // Ensure fs_main returns outputColor at its actual closing brace (not the last brace in the file).
    wgsl = this.ensureFsMainReturn(wgsl);

    // Restore comments from placeholders
    for (let i = 0; i < comments.length; i++) {
      wgsl = wgsl.replace(`__COMMENT_${i}__`, comments[i]);
    }

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
    // Check if there's already a return with opacity applied
    if (/\breturn\s+vec4.*layerOpacity\s*\)\s*;\s*$/.test(beforeClose)) return code;
    // Check if there's already a simple return outputColor
    if (/\breturn\s+outputColor\s*;\s*$/.test(beforeClose)) {
      // Replace it with opacity-applied version
      return code.slice(0, closeIdx).replace(
        /\breturn\s+outputColor\s*;\s*$/,
        'return vec4<f32>(outputColor.rgb, outputColor.a * uniforms.layerOpacity);\n'
      ) + code.slice(closeIdx);
    }

    return code.slice(0, closeIdx) + '\n  return vec4<f32>(outputColor.rgb, outputColor.a * uniforms.layerOpacity);\n' + code.slice(closeIdx);
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

    // Compound assignment forms: lhs += cond ? a : b; (also -=, *=, /=)
    out = out.replace(
      /(\b[\w\.\[\]]+\b)\s*(\+=|-=|\*=|\/=)\s*([^;\n\r]+?)\s*\?\s*([^;\n\r]+?)\s*:\s*([^;\n\r]+?)\s*;/g,
      (_m, lhs, op, cond, a, b) => `${lhs} ${op} select(${b}, ${a}, ${cond});`,
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
   * Convert Shadertoy-style mainImage function to WGSL format.
   * This must be called BEFORE fragCoord replacement to preserve the parameter name.
   * GLSL: void mainImage(out vec4 fragColor, in vec2 fragCoord) { ... }
   * WGSL: fn mainImage(fragColor_ptr: ptr<function, vec4<f32>>, fragCoord: vec2<f32>) { ... }
   */
  private convertMainImageFunction(code: string): string {
    let result = code;

    // Match Shadertoy-style mainImage function
    // Support both GLSL types (vec4, vec2) and WGSL types (vec4<f32>, vec2<f32>)
    // Also support temporary markers (__VEC4__, __VEC2__)
    const mainImageRegex = /\bvoid\s+mainImage\s*\(\s*(?:out\s+)?(?:vec4|vec4<f32>|__VEC4__)\s+(\w+)\s*,\s*(?:in\s+)?(?:vec2|vec2<f32>|__VEC2__)\s+(\w+)\s*\)\s*\{/;
    const mainImageMatch = result.match(mainImageRegex);

    if (mainImageMatch) {
      const fragColorName = mainImageMatch[1]; // Usually 'fragColor'
      const fragCoordName = mainImageMatch[2]; // Usually 'fragCoord'

      // Use a unique parameter name that won't be replaced by fragCoord->... substitution
      const safeFragCoordParam = '_mainImage_fragCoord';
      const safeFragCoordParamIn = '_mainImage_fragCoord_in';

      // Replace the function declaration with pointer version
      // Use safe parameter name to avoid later fragCoord replacement affecting it
      result = result.replace(
        mainImageRegex,
        `fn mainImage(${fragColorName}_ptr: ptr<function, vec4<f32>>, ${safeFragCoordParamIn}: vec2<f32>) {\n  var ${fragColorName} = *${fragColorName}_ptr;\n  var ${safeFragCoordParam} = ${safeFragCoordParamIn};`
      );

      // Replace uses of original fragCoord name inside mainImage body with the safe parameter name
      // Find mainImage function body and replace fragCoord only within it
      const mainImageIdx = result.indexOf('fn mainImage(');
      if (mainImageIdx !== -1) {
        let braceDepth = 0;
        let foundOpen = false;
        let closeIdx = -1;
        let openIdx = -1;

        for (let i = mainImageIdx; i < result.length; i++) {
          if (result[i] === '{') {
            if (!foundOpen) openIdx = i;
            braceDepth++;
            foundOpen = true;
          } else if (result[i] === '}') {
            braceDepth--;
            if (foundOpen && braceDepth === 0) {
              closeIdx = i;
              break;
            }
          }
        }

        if (closeIdx !== -1 && openIdx !== -1) {
          // Extract function body and replace fragCoord with safe name
          let funcBody = result.slice(openIdx + 1, closeIdx);
          const fragCoordRegex = new RegExp(`\\b${fragCoordName}\\b`, 'g');
          funcBody = funcBody.replace(fragCoordRegex, safeFragCoordParam);

          // Insert the pointer write-back before the closing brace
          funcBody += `\n  *${fragColorName}_ptr = ${fragColorName};\n`;

          result = result.slice(0, openIdx + 1) + funcBody + result.slice(closeIdx);
        }
      }

      // Update the call to mainImage to pass a pointer
      // mainImage(outputColor, fragCoord) -> mainImage(&outputColor, (input.uv * uniforms.renderSize))
      result = result.replace(
        /\bmainImage\s*\(\s*(\w+)\s*,/g,
        (match, firstArg) => {
          // Only replace calls, not the function definition
          if (firstArg === fragColorName + '_ptr') return match;
          return `mainImage(&${firstArg},`;
        }
      );
    }

    return result;
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

    let result = code;

    // Regular expression to match GLSL function declarations
    // Matches: returnType funcName(params) { (with flexible whitespace)
    // Using more specific type names to avoid partial matches
    const typePattern = 'void|float|int|bool|vec2|vec3|vec4|ivec2|ivec3|ivec4|uvec2|uvec3|uvec4|mat2|mat3|mat4';
    const funcRegex = new RegExp(
      `\\b(${typePattern})\\s+(\\w+)\\s*\\(([^)]*)\\)(?:\\s|__COMMENT_\\d+__)*\\{`,
      'g'
    );

    return result.replace(funcRegex, (match, returnType, funcName, params) => {
      // Skip main function - it's handled separately
      if (funcName === 'main') {
        return match;
      }

      // Skip mainImage - already handled above
      if (funcName === 'mainImage') {
        return match;
      }

      // Convert parameters - returns both param string and list of mutable params
      const { params: convertedParams, mutableParams } = this.convertFunctionParams(params, typeMap);

      // Build WGSL function declaration
      const wgslReturnType = typeMap[returnType] || 'f32';

      // Create local variable copies for mutable parameters (ONLY for non-pointers)
      // For pointers (converted from out/inout), we don't create local copies here,
      // we handle them in fixOutParameters via dereferencing.

      const localVarDecls = mutableParams
        .filter(p => !p.isPointer)
        .map(p => `  var ${p.name}: ${p.type} = ${p.name}_in;`)
        .join('\n');

      const bodyPrefix = localVarDecls ? '\n' + localVarDecls : '';

      if (wgslReturnType === 'void') {
        return `fn ${funcName}(${convertedParams}) {${bodyPrefix}`;
      } else {
        return `fn ${funcName}(${convertedParams}) -> ${wgslReturnType} {${bodyPrefix}`;
      }
    });
  }

  /**
   * Convert GLSL function parameters to WGSL format
   * GLSL: float x, vec2 y, in vec3 z
   * WGSL: x: f32, y: vec2<f32>, z: vec3<f32>
   * 
   * Returns: { params: string, mutableParams: Array<{name: string, type: string, isPointer: boolean}> }
   * mutableParams contains parameters that need local copies in the function body
   */
  private convertFunctionParams(params: string, typeMap: Record<string, string>): { params: string; mutableParams: Array<{ name: string, type: string, isPointer: boolean }> } {
    if (!params.trim()) return { params: '', mutableParams: [] };

    const paramList = params.split(',').map(p => p.trim()).filter(p => p);
    const typePattern = 'void|float|int|bool|vec2|vec3|vec4|ivec2|ivec3|ivec4|uvec2|uvec3|uvec4|mat2|mat3|mat4';
    const mutableParams: Array<{ name: string, type: string, isPointer: boolean }> = [];

    const converted = paramList.map(param => {
      // Check for out/inout BEFORE removing qualifiers
      const isOut = /\bout\b/.test(param);
      const isInOut = /\binout\b/.test(param);
      const isPointer = isOut || isInOut;

      // Remove in/out/inout qualifiers
      param = param.replace(/\b(in|out|inout)\s+/g, '');

      // Match: type name (with optional const)
      const match = param.match(new RegExp(`^\\s*(?:const\\s+)?(${typePattern})\\s+(\\w+)\\s*$`));

      if (match) {
        const [, type, name] = match;
        const wgslType = typeMap[type] || 'f32';

        if (isPointer) {
          // For pointers, we pass ptr<function, T>
          // We keep the original name (no _in suffix) because we will replace usages with (*name)
          mutableParams.push({ name, type: wgslType, isPointer: true });
          return `${name}: ptr<function, ${wgslType}>`;
        } else {
          // Mark all non-const parameters as potentially mutable
          mutableParams.push({ name, type: wgslType, isPointer: false });
          // Rename parameter to _in suffix, we'll create local copy in body
          return `${name}_in: ${wgslType}`;
        }
      }

      // If we couldn't parse it, return as-is (might cause errors but better than losing it)
      console.warn('[ISFParser] Could not parse function parameter:', param);
      return param;
    });

    return { params: converted.join(', '), mutableParams };
  }

  /**
   * Add braces to if/else statements that don't have them.
   * WGSL requires braces for all if/else bodies.
   * GLSL: if (cond) statement;  ->  WGSL: if (cond) { statement; }
   */
  private addBracesToIfStatements(code: string): string {
    let result = code;

    // Match: if (condition) followed by a statement (not a brace)
    // This regex finds: if (...) statement; where statement doesn't start with {
    // We need to handle nested parentheses in the condition
    let safety = 0;
    const maxIterations = 500;

    while (safety < maxIterations) {
      safety++;

      // Find "if" followed by condition in parentheses
      const ifMatch = result.match(/\bif\s*\(/);
      if (!ifMatch || ifMatch.index === undefined) break;

      const ifStart = ifMatch.index;
      const condStart = ifStart + ifMatch[0].length - 1; // Position of opening (

      // Find the matching closing parenthesis
      let depth = 1;
      let condEnd = condStart + 1;
      while (condEnd < result.length && depth > 0) {
        if (result[condEnd] === '(') depth++;
        else if (result[condEnd] === ')') depth--;
        condEnd++;
      }

      if (depth !== 0) break; // Unbalanced parentheses

      // Now condEnd is right after the closing )
      // Check what comes after: whitespace, then either { or a statement
      const afterCond = result.slice(condEnd);
      const wsMatch = afterCond.match(/^\s*/);
      const wsLen = wsMatch ? wsMatch[0].length : 0;
      const afterWs = afterCond.slice(wsLen);

      if (afterWs.startsWith('{')) {
        // Already has braces, skip this if statement
        // Move past it to find the next one
        result = result.slice(0, ifStart) + '__IF_PROCESSED__' + result.slice(ifStart + 2);
        continue;
      }

      // Check if it's a nested control structure (if/for/while)
      const nestedMatch = afterWs.match(/^(if|for|while)\s*\(/);
      if (nestedMatch) {
        // Find the complete nested statement (including its body)
        // First find the condition's closing paren
        let nestedCondStart = nestedMatch[0].length - 1;
        let nestedDepth = 1;
        let nestedCondEnd = nestedCondStart + 1;
        while (nestedCondEnd < afterWs.length && nestedDepth > 0) {
          if (afterWs[nestedCondEnd] === '(') nestedDepth++;
          else if (afterWs[nestedCondEnd] === ')') nestedDepth--;
          nestedCondEnd++;
        }

        // After nested condition, find the body
        const afterNestedCond = afterWs.slice(nestedCondEnd);
        const nestedWsMatch = afterNestedCond.match(/^\s*/);
        const nestedWsLen = nestedWsMatch ? nestedWsMatch[0].length : 0;
        const afterNestedWs = afterNestedCond.slice(nestedWsLen);

        let nestedBodyEnd = 0;
        if (afterNestedWs.startsWith('{')) {
          // Nested has braces, find closing brace
          let braceDepth = 1;
          let pos = 1;
          while (pos < afterNestedWs.length && braceDepth > 0) {
            if (afterNestedWs[pos] === '{') braceDepth++;
            else if (afterNestedWs[pos] === '}') braceDepth--;
            pos++;
          }
          nestedBodyEnd = nestedCondEnd + nestedWsLen + pos;
        } else {
          // Nested doesn't have braces, find semicolon
          let semiPos = 0;
          let braceDepth = 0;
          let parenDepth = 0;
          while (semiPos < afterNestedWs.length) {
            const ch = afterNestedWs[semiPos];
            if (ch === '(') parenDepth++;
            else if (ch === ')') parenDepth--;
            else if (ch === '{') braceDepth++;
            else if (ch === '}') braceDepth--;
            else if (ch === ';' && braceDepth === 0 && parenDepth === 0) {
              break;
            }
            semiPos++;
          }
          nestedBodyEnd = nestedCondEnd + nestedWsLen + semiPos + 1;
        }

        // Wrap the entire nested statement
        const nestedStatement = afterWs.slice(0, nestedBodyEnd);
        const beforeIf = result.slice(0, condEnd);
        const afterStatement = result.slice(condEnd + wsLen + nestedBodyEnd);

        result = beforeIf + ' { ' + nestedStatement + ' }' + afterStatement;
        continue;
      }

      // Find the semicolon that ends this statement
      // But be careful of semicolons inside strings or nested structures
      let semiPos = 0;
      let braceDepth = 0;
      let parenDepth = 0;
      while (semiPos < afterWs.length) {
        const ch = afterWs[semiPos];
        if (ch === '(') parenDepth++;
        else if (ch === ')') parenDepth--;
        else if (ch === '{') braceDepth++;
        else if (ch === '}') braceDepth--;
        else if (ch === ';' && braceDepth === 0 && parenDepth === 0) {
          break;
        }
        semiPos++;
      }

      if (semiPos >= afterWs.length) {
        // No semicolon found, skip
        result = result.slice(0, ifStart) + '__IF_PROCESSED__' + result.slice(ifStart + 2);
        continue;
      }

      // Extract the statement and wrap it in braces
      const statement = afterWs.slice(0, semiPos + 1);
      const beforeIf = result.slice(0, condEnd);
      const afterStatement = result.slice(condEnd + wsLen + semiPos + 1);

      result = beforeIf + ' { ' + statement + ' }' + afterStatement;
    }

    // Restore the if keywords
    result = result.replace(/__IF_PROCESSED__/g, 'if');

    // Now handle else without braces
    // Match: } else statement; (not } else { or } else if)
    // The negative lookahead excludes both { and if
    result = result.replace(
      /\}\s*else\s+(?!\{)(?!if\b)([^;]+;)/g,
      '} else { $1 }'
    );

    return result;
  }

  /**
  /**
   * Preprocess GLSL comma-separated declarations and chained assignments.
   * Must be called BEFORE type conversion.
   * GLSL: float pa, a = pa = 0.;  ->  float pa; float a; pa = 0.; a = pa;
   * GLSL: float a, b = 1.0;  ->  float a; float b = 1.0;
   */
  private preprocessGLSLCommaDeclarations(code: string): string {
    const glslTypes = ['float', 'int', 'bool', 'vec2', 'vec3', 'vec4', 'ivec2', 'ivec3', 'ivec4', 'uvec2', 'uvec3', 'uvec4', 'mat2', 'mat3', 'mat4'];
    let result = code;

    for (const type of glslTypes) {
      // Match: type var1, var2, var3 = expr;  or  type var1 = expr, var2 = expr;
      // Pattern explanation: type followed by identifier and optionally = expr, then comma and more
      const pattern = new RegExp(
        `\\b${type}\\s+(\\w+(?:\\s*=\\s*[^,;]+)?(?:\\s*,\\s*\\w+(?:\\s*=\\s*[^,;]+)?)+)\\s*;`,
        'g'
      );

      result = result.replace(pattern, (match, declPart) => {
        const parts = this.splitByTopLevelComma(declPart);
        const statements: string[] = [];
        const declaredVars = new Set<string>();

        // First pass: collect all variable names that appear as standalone (no assignment)
        // These might be assigned in chained expressions later
        const standaloneVars = new Set<string>();
        for (const part of parts) {
          const trimmed = part.trim();
          if (!trimmed.includes('=')) {
            standaloneVars.add(trimmed);
          }
        }

        for (const part of parts) {
          const trimmed = part.trim();
          // Check for chained assignment: a = b = 0
          const chainedMatch = trimmed.match(/^(\w+)\s*=\s*(\w+)\s*=\s*(.+)$/);
          if (chainedMatch) {
            // a = b = 0  ->  b = 0; a = b;
            const [, var1, var2, value] = chainedMatch;
            // Only declare var2 if not already declared
            if (!declaredVars.has(var2)) {
              statements.push(`${type} ${var2} = ${value};`);
              declaredVars.add(var2);
            }
            // Only declare var1 if not already declared
            if (!declaredVars.has(var1)) {
              statements.push(`${type} ${var1} = ${var2};`);
              declaredVars.add(var1);
            }
          } else if (trimmed.includes('=')) {
            // Simple assignment: name = value
            const varName = trimmed.match(/^(\w+)\s*=/)?.[1];
            if (varName && !declaredVars.has(varName)) {
              statements.push(`${type} ${trimmed};`);
              declaredVars.add(varName);
            }
          } else {
            // Just variable name, no initialization
            // Check if this var will be initialized by a later chained assignment
            const varName = trimmed;
            // Look ahead to see if this var appears in a chained assignment
            const willBeChainedInit = parts.some(p => {
              const m = p.trim().match(/^(\w+)\s*=\s*(\w+)\s*=\s*(.+)$/);
              return m && m[2] === varName;
            });
            if (!willBeChainedInit && !declaredVars.has(varName)) {
              statements.push(`${type} ${varName};`);
              declaredVars.add(varName);
            }
          }
        }

        return statements.join(' ');
      });
    }

    return result;
  }

  /**
   * Split comma-separated variable declarations into separate statements.
   * GLSL allows: float a = 1.0, b = 2.0, c = 3.0;
   * WGSL requires: var a: f32 = 1.0; var b: f32 = 2.0; var c: f32 = 3.0;
   */
  private splitCommaVariableDeclarations(code: string): string {
    const wgslTypes = ['f32', 'i32', 'u32', 'bool',
      'vec2<f32>', 'vec3<f32>', 'vec4<f32>',
      'vec2<i32>', 'vec3<i32>', 'vec4<i32>',
      'vec2<u32>', 'vec3<u32>', 'vec4<u32>',
      'mat2x2<f32>', 'mat3x3<f32>', 'mat4x4<f32>'];

    let result = code;

    // Match: var name: TYPE = expr, name2 = expr2, ...;
    // We need to find these and split them
    for (const type of wgslTypes) {
      const escapedType = type.replace(/[<>]/g, '\\$&');
      // Pattern: var identifier: TYPE = something, identifier = something, ... ;
      const pattern = new RegExp(
        `var\\s+(\\w+)\\s*:\\s*${escapedType}\\s*=\\s*([^;]+);`,
        'g'
      );

      result = result.replace(pattern, (match, firstName, restOfDecl) => {
        // Check if there are commas outside of parentheses/brackets
        const parts = this.splitByTopLevelComma(restOfDecl);

        if (parts.length === 1) {
          // No comma-separated declarations
          return match;
        }

        // First part is the value for the first variable
        const statements: string[] = [];
        statements.push(`var ${firstName}: ${type} = ${parts[0].trim()};`);

        // Remaining parts are: name = value
        for (let i = 1; i < parts.length; i++) {
          const part = parts[i].trim();
          const assignMatch = part.match(/^(\w+)\s*=\s*(.+)$/);
          if (assignMatch) {
            statements.push(`var ${assignMatch[1]}: ${type} = ${assignMatch[2]};`);
          } else {
            // Just a variable name without initialization
            const nameMatch = part.match(/^(\w+)$/);
            if (nameMatch) {
              statements.push(`var ${nameMatch[1]}: ${type};`);
            } else {
              // Can't parse, keep as comment
              statements.push(`/* unparsed: ${part} */`);
            }
          }
        }

        return statements.join(' ');
      });
    }

    return result;
  }

  /**
   * Split a string by commas, but only at the top level (not inside parentheses, brackets, etc.)
   */
  private splitByTopLevelComma(str: string): string[] {
    const parts: string[] = [];
    let current = '';
    let parenDepth = 0;
    let bracketDepth = 0;
    let angleDepth = 0;

    for (let i = 0; i < str.length; i++) {
      const ch = str[i];

      if (ch === '(') parenDepth++;
      else if (ch === ')') parenDepth--;
      else if (ch === '[') bracketDepth++;
      else if (ch === ']') bracketDepth--;
      else if (ch === '<') angleDepth++;
      else if (ch === '>') angleDepth--;
      else if (ch === ',' && parenDepth === 0 && bracketDepth === 0 && angleDepth === 0) {
        parts.push(current);
        current = '';
        continue;
      }

      current += ch;
    }

    if (current) {
      parts.push(current);
    }

    return parts;
  }

  /**
   * Fix out/inout parameters (convert to pointers)
   * This handles dereferencing in function bodies and taking addresses in function calls.
   */
  private fixOutParameters(code: string): string {
    let result = code;

    // 1. Identify functions with pointer params
    const ptrFuncs = new Map<string, Array<{ name: string, index: number }>>();

    const fnDefPattern = /fn\s+(\w+)\s*\(([^)]*)\)/g;
    let match;
    while ((match = fnDefPattern.exec(result)) !== null) {
      const funcName = match[1];
      const paramsStr = match[2];
      const params = this.splitByTopLevelComma(paramsStr);

      const ptrs: Array<{ name: string, index: number }> = [];
      params.forEach((p, i) => {
        if (p.includes('ptr<function')) {
          const nameMatch = p.trim().match(/^(\w+)\s*:/);
          if (nameMatch) {
            ptrs.push({ name: nameMatch[1], index: i });
          }
        }
      });

      if (ptrs.length > 0) {
        ptrFuncs.set(funcName, ptrs);
      }
    }

    // 2. Fix function bodies (dereference pointers)
    const funcsToFix = Array.from(ptrFuncs.keys());

    for (const funcName of funcsToFix) {
      const ptrs = ptrFuncs.get(funcName)!;

      // Regex to find function definitions
      const defRegex = new RegExp(`fn\\s+${funcName}\\s*\\([^)]*\\)(?:\\s*->\\s*[^\\{]+)?\\s*\\{`, 'g');
      const defMatches: any[] = [];
      let m;
      while ((m = defRegex.exec(result)) !== null) {
        defMatches.push(m);
      }

      // Process definitions in reverse
      for (let i = defMatches.length - 1; i >= 0; i--) {
        const defMatch = defMatches[i];
        const bodyStart = defMatch.index + defMatch[0].length; // After '{'

        // Find matching closing brace
        let depth = 1;
        let bodyEnd = -1;
        for (let k = bodyStart; k < result.length; k++) {
          if (result[k] === '{') depth++;
          else if (result[k] === '}') {
            depth--;
            if (depth === 0) {
              bodyEnd = k;
              break;
            }
          }
        }

        if (bodyEnd === -1) continue;

        let body = result.slice(bodyStart, bodyEnd);

        // Replace parameter usages with deference
        for (const ptr of ptrs) {
          const ptrName = ptr.name;
          // Matches "name" NOT preceded by `*` or `&` or `.` and NOT followed by `:`
          const usageRegex = new RegExp(`([\\*&\\.]?)\\b${ptrName}\\b(:?)`, 'g');
          body = body.replace(usageRegex, (m, prefix, suffix) => {
            if (prefix || suffix) return m;
            return `(*${ptrName})`;
          });
        }

        result = result.slice(0, bodyStart) + body + result.slice(bodyEnd);
      }
    }

    // 3. Fix function calls (pass address)
    const calls: Array<{ funcName: string, start: number, argsStart: number, endIndex: number, args: string[] }> = [];

    for (const [funcName, ptrs] of ptrFuncs.entries()) {
      const callRegex = new RegExp(`\\b${funcName}\\s*\\(`, 'g');
      let m;
      while ((m = callRegex.exec(result)) !== null) {
        // Check if it's a definition (skip)
        const prefix = result.slice(Math.max(0, m.index - 8), m.index);
        if (/\bfn\s+$/.test(prefix)) continue;

        const argsStart = m.index + m[0].length;
        const parsed = this.parseParenInvocationArgs(result, argsStart - 1);
        if (parsed) {
          calls.push({
            funcName,
            start: m.index,
            argsStart,
            endIndex: parsed.endIndex,
            args: parsed.args
          });
        }
      }
    }

    // Sort calls by start index descending
    calls.sort((a, b) => b.start - a.start);

    for (const call of calls) {
      const ptrs = ptrFuncs.get(call.funcName)!;
      const args = [...call.args]; // copy
      let modified = false;

      for (const ptr of ptrs) {
        if (ptr.index < args.length) {
          const arg = args[ptr.index].trim();
          // Add address-of operator & if not already there
          if (!arg.startsWith('&')) {
            args[ptr.index] = `&${arg}`;
            modified = true;
          }
        }
      }

      if (modified) {
        const newArgs = args.join(', ');
        result = result.slice(0, call.argsStart) + newArgs + result.slice(call.endIndex);
      }
    }

    return result;
  }

  /**
   * Fix clamp() calls where a vector is clamped with scalar min/max values.
   * WGSL requires all arguments to be the same type.
   * clamp(vec4(...), 0.0, 1.0) -> clamp(vec4(...), vec4<f32>(0.0), vec4<f32>(1.0))
   */
  private fixClampCalls(code: string): string {
    // First, collect all variable declarations to know their types
    const varTypes = new Map<string, string>();
    const varDeclPattern = /\bvar\s+(\w+)\s*:\s*(vec[234]<f32>|vec[234])/g;
    let match;
    while ((match = varDeclPattern.exec(code)) !== null) {
      const varName = match[1];
      let varType = match[2];
      // Normalize to just vec2/vec3/vec4
      if (varType.includes('<')) {
        varType = varType.split('<')[0];
      }
      varTypes.set(varName, varType);
    }

    // Functions that take a vector and return a scalar.
    // Functions like abs, sin, cos, etc. are component-wise and return vectors when given vectors.
    const scalarReturningFuncs = ['dot', 'length', 'distance', 'determinant'];

    const isScalarByVectorUsage = (expr: string): boolean => {
      let hasVectorUsage = false;

      // 1. Check variables
      for (const [varName] of varTypes) {
        // Look for occurrences of the variable
        const varUsagePattern = new RegExp(`\\b${varName}\\b(\\.[xyzwrgba]+)?`, 'g');
        let usageMatch;
        while ((usageMatch = varUsagePattern.exec(expr)) !== null) {
          const swizzle = usageMatch[1];
          const matchStart = usageMatch.index;

          // Single-component swizzle is scalar.
          if (swizzle && swizzle.length === 2 && !/[xyzwrgba]{2,}/.test(swizzle)) { // .x is 2 chars
            continue;
          }

          // Check if usage is inside a scalar-returning function call.
          let insideScalarFunc = false;
          // Simple reverse scan to count parens
          const beforeMatch = expr.slice(0, matchStart);

          for (const fn of scalarReturningFuncs) {
            // Check if we are inside fn( ... )
            // Find last occurrence of fn
            const fnIdx = beforeMatch.lastIndexOf(fn);
            if (fnIdx !== -1) {
              // Check if parens balance after fn
              const verifyRegion = beforeMatch.slice(fnIdx + fn.length);
              let parenCount = 0;
              let hasOpen = false;
              for (const ch of verifyRegion) {
                if (ch === '(') { parenCount++; hasOpen = true; }
                else if (ch === ')') parenCount--;
              }
              if (hasOpen && parenCount > 0) {
                insideScalarFunc = true;
                break;
              }
            }
          }

          if (!insideScalarFunc) {
            // Vector used outside scalar-returning function.
            hasVectorUsage = true;
            return false; // Found a vector context usage
          }
        }
      }

      // 2. Check explicitly constructed vectors: vec3(...), vec3<f32>(...)
      const constructorPattern = /vec[234](?:<f32>)?\s*\(/g;
      let cMatch;
      while ((cMatch = constructorPattern.exec(expr)) !== null) {
        const matchStart = cMatch.index;
        // Check if inside scalar function
        let insideScalarFunc = false;
        const beforeMatch = expr.slice(0, matchStart);

        for (const fn of scalarReturningFuncs) {
          const fnIdx = beforeMatch.lastIndexOf(fn);
          if (fnIdx !== -1) {
            const verifyRegion = beforeMatch.slice(fnIdx + fn.length);
            let parenCount = 0;
            let hasOpen = false;
            for (const ch of verifyRegion) {
              if (ch === '(') { parenCount++; hasOpen = true; }
              else if (ch === ')') parenCount--;
            }
            if (hasOpen && parenCount > 0) {
              insideScalarFunc = true;
              break;
            }
          }
        }

        if (!insideScalarFunc) {
          hasVectorUsage = true;
          return false;
        }
      }

      // If we found any vector variables or constructors that were NOT used in scalar context, we returned false.
      // If we are here, it means either:
      // a) No vector variables/constructors found at all (assume scalar)
      // b) All found were used in scalar context
      // However, if we found NO vector var/constructors, but `vecType` was somehow inferred 
      // (e.g. from a swizzle on a temp result we couldn't track), we should be careful.
      // But for now, if we found no vector indicators, we treat as scalar.
      return true;
    };

    let result = code;
    let safety = 0;
    const maxIterations = 1000;

    while (safety < maxIterations) {
      safety++;

      // Find clamp( 
      const clampMatch = result.match(/\bclamp\s*\(/);
      if (!clampMatch || clampMatch.index === undefined) break;

      const clampStart = clampMatch.index;

      // Parse the arguments
      const parsed = this.parseParenInvocationArgs(result, clampStart + 'clamp'.length);
      if (!parsed || parsed.args.length !== 3) {
        // Can't parse or wrong number of args, skip
        result = result.slice(0, clampStart) + '__CLAMP_PROCESSED__' + result.slice(clampStart + 5);
        continue;
      }

      const [arg1, arg2, arg3] = parsed.args.map(a => a.trim());

      // Check if bounds look like scalars
      const looksLikeScalar = (s: string) => {
        const trimmed = s.trim();
        // Is it a number? Match: 0, 0.0, .5, 0., 1.0f, -0.5, etc.
        // Also simple expressions like 1.0/2.0 or -1.0
        if (/^-?\d*\.?\d*f?$/.test(trimmed) && /\d/.test(trimmed)) return true;
        return false;
      };

      // Detect vector type from first argument
      let vecType: string | null = null;
      const trimmedArg1 = arg1.trim();

      // Check constructor
      if (trimmedArg1.includes('vec4<f32>') || trimmedArg1.match(/\bvec4\s*\(/)) vecType = 'vec4';
      else if (trimmedArg1.includes('vec3<f32>') || trimmedArg1.match(/\bvec3\s*\(/)) vecType = 'vec3';
      else if (trimmedArg1.includes('vec2<f32>') || trimmedArg1.match(/\bvec2\s*\(/)) vecType = 'vec2';
      // Check variable
      else if (/^[a-zA-Z_]\w*$/.test(trimmedArg1)) {
        const knownType = varTypes.get(trimmedArg1);
        if (knownType) vecType = knownType;
      }

      if (!vecType) {
        // Infer from swizzles
        const swizzleMatches = trimmedArg1.match(/\.[xyzwrgba]{2,4}/g);
        if (swizzleMatches) {
          let maxSwizzleLen = 0;
          for (const swizzle of swizzleMatches) {
            // Check if swizzle is inside scalar function
            let insideScalarFunc = false;
            const idx = trimmedArg1.indexOf(swizzle);
            const beforeMatch = trimmedArg1.slice(0, idx);
            for (const fn of scalarReturningFuncs) {
              const fnIdx = beforeMatch.lastIndexOf(fn);
              if (fnIdx !== -1) {
                const verifyRegion = beforeMatch.slice(fnIdx + fn.length);
                let parenCount = 0;
                let hasOpen = false;
                for (const ch of verifyRegion) {
                  if (ch === '(') { parenCount++; hasOpen = true; }
                  else if (ch === ')') parenCount--;
                }
                if (hasOpen && parenCount > 0) {
                  insideScalarFunc = true;
                  break;
                }
              }
            }

            if (!insideScalarFunc) {
              maxSwizzleLen = Math.max(maxSwizzleLen, swizzle.length - 1);
            }
          }
          if (maxSwizzleLen === 4) vecType = 'vec4';
          else if (maxSwizzleLen === 3) vecType = 'vec3';
          else if (maxSwizzleLen === 2) vecType = 'vec2';
        }
      }

      // Fallback: Check if expression contains any vector variables NOT in scalar context
      if (!vecType) {
        for (const [varName, varType] of varTypes) {
          if (trimmedArg1.includes(varName) && !isScalarByVectorUsage(trimmedArg1)) {
            vecType = varType;
            break;
          }
        }
      }

      // If we inferred a vector type, but the expression only uses vector vars/constructors in scalar contexts,
      // treat it as scalar.
      if (vecType && isScalarByVectorUsage(trimmedArg1)) {
        vecType = null;
      }

      if (vecType && looksLikeScalar(arg2) && looksLikeScalar(arg3)) {
        const wgslVecType = `${vecType}<f32>`;
        const newClamp = `clamp(${arg1}, ${wgslVecType}(${arg2}), ${wgslVecType}(${arg3}))`;
        result = result.slice(0, clampStart) + newClamp + result.slice(parsed.endIndex + 1);
      } else {
        result = result.slice(0, clampStart) + '__CLAMP_PROCESSED__' + result.slice(clampStart + 5);
      }
    }

    // Restore clamp keywords
    result = result.replace(/__CLAMP_PROCESSED__/g, 'clamp');

    return result;
  }

  /**
   * Fix smoothstep() calls where edge0/edge1 are scalars but x is a vector.
   * GLSL allows: smoothstep(0.0, 1.0, vec3) returning vec3
   * WGSL requires: smoothstep(vec3, vec3, vec3) - all same type
   */
  private fixSmoothstepCalls(code: string): string {
    // First, collect variable types so we can detect vector types from simple variable names
    const varTypes = new Map<string, string>();
    const varDeclPattern = /var\s+(\w+)\s*:\s*(vec[234](?:<f32>)?)/g;
    let match;
    while ((match = varDeclPattern.exec(code)) !== null) {
      const varName = match[1];
      let varType = match[2];
      // Normalize to just vec2/vec3/vec4
      if (varType.includes('<')) {
        varType = varType.split('<')[0];
      }
      varTypes.set(varName, varType);
    }

    let result = code;
    let safety = 0;
    const maxIterations = 1000;

    while (safety < maxIterations) {
      safety++;

      // Find smoothstep( 
      const smoothstepMatch = result.match(/\bsmoothstep\s*\(/);
      if (!smoothstepMatch || smoothstepMatch.index === undefined) break;

      const smoothstepStart = smoothstepMatch.index;

      // Parse the arguments
      const parsed = this.parseParenInvocationArgs(result, smoothstepStart + 'smoothstep'.length);
      if (!parsed || parsed.args.length !== 3) {
        // Can't parse or wrong number of args, skip
        result = result.slice(0, smoothstepStart) + '__SMOOTHSTEP_PROCESSED__' + result.slice(smoothstepStart + 10);
        continue;
      }

      const [arg1, arg2, arg3] = parsed.args.map(a => a.trim());

      // Check if arg1 and arg2 look like scalars (numbers)
      const looksLikeScalar = (s: string) => {
        const trimmed = s.trim();
        // Is it a number? Match: 0, 0.0, .5, 0., 1.0f, -0.5, etc.
        if (/^-?\d*\.?\d*f?$/.test(trimmed) && /\d/.test(trimmed)) return true;
        return false;
      };

      // Detect vector type from third argument (x in smoothstep(edge0, edge1, x))
      let vecType: string | null = null;
      const trimmedArg3 = arg3.trim();

      // Check if expression CONTAINS a vector constructor
      if (trimmedArg3.includes('vec4<f32>') || trimmedArg3.match(/\bvec4\s*\(/)) {
        vecType = 'vec4';
      } else if (trimmedArg3.includes('vec3<f32>') || trimmedArg3.match(/\bvec3\s*\(/)) {
        vecType = 'vec3';
      } else if (trimmedArg3.includes('vec2<f32>') || trimmedArg3.match(/\bvec2\s*\(/)) {
        vecType = 'vec2';
      } else if (/^[a-zA-Z_]\w*$/.test(trimmedArg3)) {
        // It's a simple variable name - check if we know its type
        const knownType = varTypes.get(trimmedArg3);
        if (knownType) {
          vecType = knownType;
        }
      }

      // Fallback: Check if the third arg is a function call or expression with arithmetic
      /*
      // Removed: This is too aggressive and breaks scalar smoothstep expressions
      if (!vecType) {
        const startsWithFunctionCall = /^[a-zA-Z_]\w*\s*\(/.test(trimmedArg3);
        const hasArithmetic = /[*+\-\/]/.test(trimmedArg3);

        if ((startsWithFunctionCall || hasArithmetic) && looksLikeScalar(arg1) && looksLikeScalar(arg2)) {
          // Assume vec3 for function calls and expressions (common for color operations)
          vecType = 'vec3';
        }
      }
      */

      if (vecType && looksLikeScalar(arg1) && looksLikeScalar(arg2)) {
        // Need to wrap scalars in vector constructors
        const wgslVecType = `${vecType}<f32>`;
        const newSmoothstep = `smoothstep(${wgslVecType}(${arg1}), ${wgslVecType}(${arg2}), ${arg3})`;
        result = result.slice(0, smoothstepStart) + newSmoothstep + result.slice(parsed.endIndex + 1);
      } else {
        // Mark as processed
        result = result.slice(0, smoothstepStart) + '__SMOOTHSTEP_PROCESSED__' + result.slice(smoothstepStart + 10);
      }
    }

    // Restore smoothstep keywords
    result = result.replace(/__SMOOTHSTEP_PROCESSED__/g, 'smoothstep');

    return result;
  }

  /**
   * Fix max() and min() calls where one argument is a vector and the other is a scalar.
   * GLSL allows: max(vec3, 0.0) returning vec3
   * WGSL requires: max(vec3, vec3) - both same type
   */
  private fixMaxMinCalls(code: string): string {
    // First, collect variable types so we can detect vector types from simple variable names
    const varTypes = new Map<string, string>();
    const varDeclPattern = /var\s+(\w+)\s*:\s*(vec[234](?:<f32>)?)/g;
    let match;
    while ((match = varDeclPattern.exec(code)) !== null) {
      const varName = match[1];
      let varType = match[2];
      // Normalize to just vec2/vec3/vec4
      if (varType.includes('<')) {
        varType = varType.split('<')[0];
      }
      varTypes.set(varName, varType);
    }

    let result = code;

    // Process both max and min
    for (const funcName of ['max', 'min']) {
      let safety = 0;
      const maxIterations = 1000;

      while (safety < maxIterations) {
        safety++;

        // Find funcName( 
        const funcRegex = new RegExp(`\\b${funcName}\\s*\\(`);
        const funcMatch = result.match(funcRegex);
        if (!funcMatch || funcMatch.index === undefined) break;

        const funcStart = funcMatch.index;

        // Parse the arguments
        const parsed = this.parseParenInvocationArgs(result, funcStart + funcName.length);
        if (!parsed || parsed.args.length !== 2) {
          // Can't parse or wrong number of args, skip
          result = result.slice(0, funcStart) + `__${funcName.toUpperCase()}_PROCESSED__` + result.slice(funcStart + funcName.length);
          continue;
        }

        const [arg1, arg2] = parsed.args.map(a => a.trim());

        // Check if argument looks like a scalar (number)
        const looksLikeScalar = (s: string) => {
          const trimmed = s.trim();
          // Is it a number? Match: 0, 0.0, .5, 0., 1.0f, -0.5, etc.
          if (/^-?\d*\.?\d*f?$/.test(trimmed) && /\d/.test(trimmed)) return true;
          return false;
        };

        // Detect vector type from either argument
        const detectVecType = (s: string): string | null => {
          const trimmed = s.trim();
          if (trimmed.includes('vec4<f32>') || trimmed.match(/\bvec4\s*\(/)) {
            return 'vec4';
          } else if (trimmed.includes('vec3<f32>') || trimmed.match(/\bvec3\s*\(/)) {
            return 'vec3';
          } else if (trimmed.includes('vec2<f32>') || trimmed.match(/\bvec2\s*\(/)) {
            return 'vec2';
          } else if (/^[a-zA-Z_]\w*$/.test(trimmed)) {
            // It's a simple variable name - check if we know its type
            const knownType = varTypes.get(trimmed);
            if (knownType) {
              return knownType;
            }
          }
          return null;
        };

        const vecType1 = detectVecType(arg1);
        const vecType2 = detectVecType(arg2);
        const isScalar1 = looksLikeScalar(arg1);
        const isScalar2 = looksLikeScalar(arg2);

        let needsFix = false;
        let vecType: string | null = null;
        let newFunc: string = '';

        if (vecType1 && isScalar2) {
          // First arg is vector, second is scalar
          needsFix = true;
          vecType = vecType1;
          const wgslVecType = `${vecType}<f32>`;
          newFunc = `${funcName}(${arg1}, ${wgslVecType}(${arg2}))`;
        } else if (vecType2 && isScalar1) {
          // Second arg is vector, first is scalar
          needsFix = true;
          vecType = vecType2;
          const wgslVecType = `${vecType}<f32>`;
          newFunc = `${funcName}(${wgslVecType}(${arg1}), ${arg2})`;
        }

        if (needsFix) {
          result = result.slice(0, funcStart) + newFunc + result.slice(parsed.endIndex + 1);
        } else {
          // Mark as processed
          result = result.slice(0, funcStart) + `__${funcName.toUpperCase()}_PROCESSED__` + result.slice(funcStart + funcName.length);
        }
      }

      // Restore keywords
      result = result.replace(new RegExp(`__${funcName.toUpperCase()}_PROCESSED__`, 'g'), funcName);
    }

    return result;
  }

  /**
   * Fix matrix division by scalar.
   * GLSL allows: mat2 / scalar
   * WGSL doesn't support this operator, so convert to: mat2 * (1.0 / scalar)
   */
  private fixMatrixDivision(code: string): string {
    let result = code;

    // Pattern to match matrix constructor or variable followed by / scalar
    // mat2x2<f32>(...) / expr  or  matVar / expr
    // We need to handle:
    // 1. mat2x2<f32>(...) / (expr)
    // 2. matVar / (expr)
    // 3. matVar / scalar

    // First, find matrix variable declarations to know which variables are matrices
    const matVars = new Set<string>();
    const matDeclPattern = /var\s+(\w+)\s*:\s*(mat[234]x[234]<f32>)/g;
    let match;
    while ((match = matDeclPattern.exec(code)) !== null) {
      matVars.add(match[1]);
    }

    // Handle matrix constructor divided by expression: mat2x2<f32>(...) / (expr)
    // This pattern matches the matrix constructor followed by division
    const matConstructorDivPattern = /(mat[234]x?[234]?<f32>\s*\([^)]*(?:\([^)]*\)[^)]*)*\))\s*\/\s*(\([^)]+\)|\w+(?:\.\w+)?(?:\s*[\*\+\-]\s*\w+(?:\.\w+)?)*)/g;

    result = result.replace(matConstructorDivPattern, (match, matExpr, divisor) => {
      // Convert mat / divisor to mat * (1.0 / divisor)
      const cleanDivisor = divisor.trim();
      // If divisor is already parenthesized, use it directly
      if (cleanDivisor.startsWith('(')) {
        return `${matExpr} * (1.0 / ${cleanDivisor})`;
      } else {
        return `${matExpr} * (1.0 / (${cleanDivisor}))`;
      }
    });

    // Handle matrix variable divided by expression: matVar / (expr)
    for (const matVar of matVars) {
      const varDivPattern = new RegExp(
        `\\b(${matVar})\\s*\\/\\s*(\\([^)]+\\)|\\w+(?:\\.\\w+)?(?:\\s*[\\*\\+\\-]\\s*\\w+(?:\\.\\w+)?)*)`,
        'g'
      );
      result = result.replace(varDivPattern, (match, varName, divisor) => {
        const cleanDivisor = divisor.trim();
        if (cleanDivisor.startsWith('(')) {
          return `${varName} * (1.0 / ${cleanDivisor})`;
        } else {
          return `${varName} * (1.0 / (${cleanDivisor}))`;
        }
      });
    }

    return result;
  }

  /**
   * Fix C-style array declarations.
   * Converts: Type name[Size]; -> var name: array<Type, Size>;
   */
  private fixArrayDeclarations(code: string): string {
    const wgslTypes = 'f32|i32|u32|bool|vec[234]<f32>|mat\\d+x\\d+<f32>';

    // Match: Type name[Size];
    // We already converted basic types to WGSL types in converting definitions
    const pattern = new RegExp(
      `\\b(${wgslTypes})\\s+(\\w+)\\s*\\[(\\d+)\\]\\s*;`,
      'g'
    );

    return code.replace(pattern, (match, type, name, size) => {
      return `var ${name}: array<${type}, ${size}>;`;
    });
  }

  /**
   * Rename identifiers that conflict with WGSL reserved keywords.
   * WGSL has many reserved keywords that can't be used as identifiers.
   */
  private renameReservedKeywords(code: string): string {
    // WGSL reserved keywords that are commonly used in GLSL shaders
    const reservedKeywords = [
      'filter', 'sample', 'sampler', 'read', 'write',
      'static', 'uniform', 'storage', 'private', 'function',
      'workgroup', 'push_constant', 'const', 'let', 'var',
      'override', 'struct', 'bitcast', 'discard', 'enable',
      'alias', 'break', 'case', 'continue', 'continuing',
      'default', 'else', 'elseif', 'fallthrough', 'for',
      'if', 'loop', 'return', 'switch', 'while', 'from',
      'final', 'texture', 'true', 'false', 'null', 'ptr',
      // Add more as needed
    ];

    let result = code;

    for (const keyword of reservedKeywords) {
      // Only rename if it's used as an identifier (function name or variable)
      // Match: fn keyword( or var keyword: or keyword(

      // Function definitions: fn keyword(...)
      const fnDefPattern = new RegExp(`\\bfn\\s+${keyword}\\s*\\(`, 'g');
      if (fnDefPattern.test(result)) {
        const newName = `${keyword}_`;
        // Replace function definition
        result = result.replace(fnDefPattern, `fn ${newName}(`);
        // Replace function calls
        const fnCallPattern = new RegExp(`\\b${keyword}\\s*\\(`, 'g');
        result = result.replace(fnCallPattern, `${newName}(`);
      }

      // Variable declarations: var keyword: or let keyword:
      const varPattern = new RegExp(`\\b(var|let)\\s+${keyword}\\s*:`, 'g');
      if (varPattern.test(result)) {
        const newName = `${keyword}_`;
        result = result.replace(varPattern, `$1 ${newName}:`);
        // Replace variable usage - this is tricky, only replace as standalone identifier
        const varUsePattern = new RegExp(`\\b${keyword}\\b(?!\\s*:)`, 'g');
        result = result.replace(varUsePattern, newName);
      }
    }

    return result;
  }

  /**
   * Fix function overloading - WGSL doesn't support it.
   * Rename duplicate function definitions with different signatures.
   * e.g., mod289(vec3) and mod289(vec2) become mod289_vec3 and mod289_vec2
   */
  private fixFunctionOverloading(code: string): string {
    // Find all function definitions: fn name(params) -> returnType {
    const fnDefPattern = /fn\s+(\w+)\s*\(([^)]*)\)\s*->\s*(\w+(?:<[^>]+>)?)\s*\{/g;

    // Track function names and their parameter signatures
    const functionDefs: Map<string, Array<{ params: string; returnType: string; paramType: string; newName: string }>> = new Map();

    let match;
    while ((match = fnDefPattern.exec(code)) !== null) {
      const [, funcName, params] = match;

      // Extract first parameter type for suffix
      // e.g., "x_in: vec3<f32>" -> "vec3"
      const paramTypes = params
        .split(',')
        .map(p => {
          const typeMatch = p.match(/:\s*(\w+)/);
          return typeMatch ? typeMatch[1] : '';
        })
        .filter(t => t);

      const paramType = paramTypes.join('_') || 'void';

      if (!functionDefs.has(funcName)) {
        functionDefs.set(funcName, []);
      }

      const newName = `${funcName}_${paramType}`;
      functionDefs.get(funcName)!.push({
        params,
        returnType: match[3],
        paramType,
        newName
      });
    }

    let result = code;

    // Process only functions that have multiple definitions (overloaded)
    for (const [funcName, defs] of functionDefs.entries()) {
      if (defs.length <= 1) continue; // Not overloaded

      // First pass: rename all function definitions
      for (const def of defs) {
        const oldDef = `fn ${funcName}(${def.params})`;
        const newDef = `fn ${def.newName}(${def.params})`;
        result = result.replace(oldDef, newDef);
      }

      // Second pass: update all function calls
      // We need to analyze each call to determine which overload to use
      const callPattern = new RegExp(`\\b${funcName}\\s*\\(`, 'g');

      // Process calls from end to start to maintain indices
      const calls: Array<{ start: number; end: number; args: string }> = [];
      let callMatch;

      while ((callMatch = callPattern.exec(result)) !== null) {
        const startIdx = callMatch.index;
        const argsStart = startIdx + callMatch[0].length;

        // Find matching closing parenthesis
        let depth = 1;
        let endIdx = argsStart;
        while (depth > 0 && endIdx < result.length) {
          if (result[endIdx] === '(') depth++;
          else if (result[endIdx] === ')') depth--;
          endIdx++;
        }

        const args = result.slice(argsStart, endIdx - 1).trim();
        calls.push({ start: startIdx, end: endIdx, args });
      }

      // Process calls in reverse order to maintain string indices
      for (let i = calls.length - 1; i >= 0; i--) {
        const call = calls[i];

        // Determine which overload to use based on argument type
        let targetDef = defs[0]; // Default to first

        // Check argument patterns to determine type
        const args = call.args;

        // Look for explicit type constructors or swizzles
        if (/vec4\s*[<(]|\.xyzw/.test(args)) {
          targetDef = defs.find(d => d.paramType.includes('vec4')) || targetDef;
        } else if (/vec3\s*[<(]|\.xyz(?![w])/.test(args)) {
          targetDef = defs.find(d => d.paramType.includes('vec3')) || targetDef;
        } else if (/vec2\s*[<(]|\.xy(?![zw])/.test(args)) {
          targetDef = defs.find(d => d.paramType.includes('vec2')) || targetDef;
        } else if (/f32\s*[<(]|^\s*\d+\./.test(args)) {
          targetDef = defs.find(d => d.paramType.includes('f32')) || targetDef;
        } else {
          // Try to infer from context - look for variable declarations
          // First, extract the first argument (before the first comma at depth 0)
          let firstArg = '';
          let depth = 0;
          for (const char of args) {
            if (char === '(' || char === '[') depth++;
            else if (char === ')' || char === ']') depth--;
            else if (char === ',' && depth === 0) break;
            firstArg += char;
          }
          firstArg = firstArg.trim();

          // Extract all identifiers from the expression (e.g., "F+1.0" -> ["F"])
          const identifiers = firstArg.match(/\b[a-zA-Z_]\w*\b/g) || [];

          // Check each identifier for its declared type
          for (const identifier of identifiers) {
            // Skip common keywords/functions
            if (['f32', 'i32', 'u32', 'vec2', 'vec3', 'vec4', 'mat2', 'mat3', 'mat4',
              'sin', 'cos', 'tan', 'floor', 'ceil', 'abs', 'sqrt', 'pow', 'min', 'max',
              'dot', 'cross', 'normalize', 'length', 'clamp', 'mix', 'step', 'smoothstep'].includes(identifier)) {
              continue;
            }

            // Look for variable declaration of this identifier
            const varDeclPattern = new RegExp(`var\\s+${identifier}\\s*:\\s*(\\w+)`);
            const varMatch = result.match(varDeclPattern);
            if (varMatch) {
              const varType = varMatch[1];
              const matchingDef = defs.find(d => d.paramType.includes(varType));
              if (matchingDef) {
                targetDef = matchingDef;
                break;
              }
            }
          }
        }

        // Replace the call
        const newCall = `${targetDef.newName}(${call.args})`;
        result = result.slice(0, call.start) + newCall + result.slice(call.end);
      }
    }

    return result;
  }

  /**
   * Fix helper functions that reference coordinate built-ins.
   * Adds uv parameter to functions that use input.uv and replaces references.
   */
  private fixHelperFunctionCoordinates(code: string): string {
    // This needs to run BEFORE the built-in variable replacements
    // So we look for the original GLSL/ISF coordinate variable names
    // Also check for input.uv which may already be present in the code
    const coordinatePatterns = [
      'vv_FragNormCoord',
      'isf_FragNormCoord',
      'texCoord',
      'texcoord',
      'v_texcoord',
      'vTexCoord',
      'v_uv',
      'vUv',
      'input\\.uv'  // Also match input.uv (escaped dot for regex)
    ];

    let result = code;

    // Find all function definitions (excluding fs_main and helper functions)
    const funcPattern = /fn\s+(\w+)\s*\(([^)]*)\)\s*(->\s*[^\{]+)?\s*\{/g;
    let match;

    const functionsToFix: Array<{ name: string, hasParams: boolean }> = [];

    // First pass: identify functions that use coordinates
    while ((match = funcPattern.exec(code)) !== null) {
      const funcName = match[1];

      // Skip these functions
      if (funcName === 'fs_main' ||
        funcName.startsWith('TIME') ||
        funcName.startsWith('RENDERSIZE') ||
        funcName.startsWith('PASSINDEX') ||
        funcName.startsWith('FRAMEINDEX') ||
        funcName.startsWith('DATE') ||
        funcName === 'isf_FragNormCoord' ||
        funcName === 'isf_FragCoord' ||
        funcName.startsWith('IMG_') ||
        funcName.startsWith('mix_') ||
        funcName.startsWith('fract_') ||
        funcName.startsWith('mod_')) {
        continue;
      }

      const funcStart = match.index;
      const funcBodyStart = code.indexOf('{', funcStart);

      // Find function end
      let braceDepth = 0;
      let funcEnd = funcBodyStart;
      for (let i = funcBodyStart; i < code.length; i++) {
        if (code[i] === '{') braceDepth++;
        else if (code[i] === '}') {
          braceDepth--;
          if (braceDepth === 0) {
            funcEnd = i;
            break;
          }
        }
      }

      const funcBody = code.slice(funcBodyStart, funcEnd + 1);

      // Check if function uses any coordinate patterns
      const hasCoords = coordinatePatterns.some(pattern =>
        new RegExp(`\\b${pattern}\\b`).test(funcBody)
      );

      if (hasCoords) {
        const params = match[2].trim();
        functionsToFix.push({ name: funcName, hasParams: params.length > 0 });
      }
    }

    // Second pass: Add uv parameter and update function bodies and call sites
    for (const func of functionsToFix) {
      // Update function signature to add uv parameter
      const funcRegex = new RegExp(
        `fn\\s+${func.name}\\s*\\(([^)]*)\\)(\\s*->\\s*[^\\{]+)?\\s*\\{`,
        'g'
      );

      result = result.replace(funcRegex, (match, params, returnType) => {
        const trimmedParams = params.trim();
        const newParams = trimmedParams ? `${trimmedParams}, uv: vec2<f32>` : 'uv: vec2<f32>';
        return `fn ${func.name}(${newParams})${returnType || ''} {`;
      });

      // Update call sites to pass input.uv
      // Match function calls: funcName(args) but NOT function definitions (fn funcName)
      const callRegex = new RegExp(`\\b${func.name}\\s*\\(`, 'g');
      const matches: Array<{ start: number, end: number }> = [];

      let callMatch;
      while ((callMatch = callRegex.exec(result)) !== null) {
        // Skip if this is a function definition (preceded by 'fn ')
        const prefixStart = Math.max(0, callMatch.index - 10);
        const prefix = result.slice(prefixStart, callMatch.index);
        if (/\bfn\s+$/.test(prefix)) {
          continue; // This is a function definition, not a call site
        }

        const openParen = callMatch.index + func.name.length;

        // Find matching close paren
        let parenDepth = 0;
        let closeParen = openParen;
        for (let k = openParen; k < result.length; k++) {
          if (result[k] === '(') parenDepth++;
          else if (result[k] === ')') {
            parenDepth--;
            if (parenDepth === 0) {
              closeParen = k;
              break;
            }
          }
        }

        matches.push({ start: openParen, end: closeParen });
      }

      // Process in reverse order to maintain positions
      for (let i = matches.length - 1; i >= 0; i--) {
        const { start, end } = matches[i];
        const args = result.slice(start + 1, end).trim();
        const newArgs = args ? `${args}, input.uv` : 'input.uv';
        result = result.slice(0, start + 1) + newArgs + result.slice(end);
      }

      // Replace coordinate references inside function body with 'uv'
      // Find the function body
      const bodyRegex = new RegExp(`fn\\s+${func.name}\\s*\\([^)]*\\)[^\\{]*\\{`, 'g');
      const bodyMatch = bodyRegex.exec(result);

      if (bodyMatch) {
        const bodyStart = result.indexOf('{', bodyMatch.index);
        let braceDepth = 0;
        let bodyEnd = bodyStart;

        for (let i = bodyStart; i < result.length; i++) {
          if (result[i] === '{') braceDepth++;
          else if (result[i] === '}') {
            braceDepth--;
            if (braceDepth === 0) {
              bodyEnd = i;
              break;
            }
          }
        }

        let funcBody = result.slice(bodyStart, bodyEnd + 1);

        // Replace coordinate patterns with 'uv'
        for (const pattern of coordinatePatterns) {
          // Special handling for input.uv pattern (has a dot, no word boundary)
          if (pattern === 'input\\.uv') {
            funcBody = funcBody.replace(/input\.uv/g, 'uv');
          } else {
            funcBody = funcBody.replace(new RegExp(`\\b${pattern}\\b`, 'g'), 'uv');
          }
        }

        result = result.slice(0, bodyStart) + funcBody + result.slice(bodyEnd + 1);
      }
    }

    return result;
  }

  /**
   * Fix module-scope var declarations by adding <private> address space.
   * WGSL requires: var<private> name: type = value;
   * for module-scope mutable variables (not texture/sampler).
   * Function-scope vars should NOT have an address space.
   * 
   * Also handles module-scope vars that reference uniforms - these need special handling
   * because WGSL doesn't allow uniform references at module scope.
   * We declare them with default values and initialize them in fs_main.
   */
  private fixModuleScopeVarDeclarations(code: string): string {
    // Find all function definitions to determine what's module scope vs function scope
    // Functions are: fn name(...) { ... }
    const lines = code.split('\n');
    const result: string[] = [];
    let braceDepth = 0;
    let inFunction = false;

    // Track module-scope vars that reference uniforms - these need initialization in fs_main
    const varsToInitInMain: Array<{ name: string, value: string }> = [];

    for (const line of lines) {
      // Check if we're entering a function
      if (/\bfn\s+\w+\s*\(/.test(line)) {
        inFunction = true;
      }

      // Count opening braces BEFORE checking if we should process
      // This ensures we correctly identify function scope
      let openBraces = 0;
      let closeBraces = 0;
      for (const char of line) {
        if (char === '{') openBraces++;
        if (char === '}') closeBraces++;
      }

      // Determine if this line is at module scope BEFORE we update braceDepth
      // A line is at module scope if:
      // 1. We're not in a function, AND
      // 2. Current brace depth is 0, AND
      // 3. The line doesn't open a new brace (or if it does, it's a function definition itself)
      const isModuleScope = !inFunction && braceDepth === 0 && openBraces === 0;

      // Update brace depth
      braceDepth += openBraces - closeBraces;

      // If we're at brace depth 0 after processing, we're back at module scope
      if (braceDepth === 0) {
        inFunction = false;
      }

      // Only process var declarations at module scope (not inside functions)
      if (isModuleScope) {
        // Check if this is a var declaration that references uniforms
        const varMatch = line.match(/^\s*var(?:<private>)?\s+(\w+)\s*:\s*([^=]+?)\s*=\s*(.+?)\s*;?\s*$/);
        if (varMatch && /uniforms\./.test(varMatch[3])) {
          // This var references uniforms - declare with default value
          const varName = varMatch[1];
          const varType = varMatch[2].trim();
          const varValue = varMatch[3].trim().replace(/;$/, '');

          // Get default value based on type
          let defaultValue = '0.0';
          if (varType.startsWith('vec2')) defaultValue = 'vec2<f32>(0.0, 0.0)';
          else if (varType.startsWith('vec3')) defaultValue = 'vec3<f32>(0.0, 0.0, 0.0)';
          else if (varType.startsWith('vec4')) defaultValue = 'vec4<f32>(0.0, 0.0, 0.0, 0.0)';
          else if (varType === 'i32') defaultValue = '0';
          else if (varType === 'u32') defaultValue = '0u';
          else if (varType === 'bool') defaultValue = 'false';

          varsToInitInMain.push({ name: varName, value: varValue });
          result.push(`var<private> ${varName}: ${varType} = ${defaultValue};`);
          continue;
        }

        // Add <private> to module-scope var declarations that don't reference uniforms
        // Match: var name: type ...
        // Updated to support array types and generic types
        const fixedLine = line.replace(
          /\bvar\s+(?!<)(\w+)\s*:\s*(f32|i32|u32|bool|vec[234]<[^>]+>|mat[234]x[234]<[^>]+>|array<[^>]+>)/g,
          'var<private> $1: $2'
        );
        result.push(fixedLine);
      } else {
        result.push(line);
      }
    }

    // Store the vars to initialize for later injection into fs_main
    (this as any)._varsToInitInMain = varsToInitInMain;

    return result.join('\n');
  }

  /**
   * Fix unary negation of matrices - WGSL doesn't support -matrix operator.
   * GLSL allows: vec * (-mat)
   * WGSL requires: -(vec * mat)
   */
  private fixMatrixNegation(code: string): string {
    let result = code;

    // Pattern: expr * (-matrixVar) -> -(expr * matrixVar)
    // Match any expression (including swizzles like from_.xy) multiplied by a negated variable
    // The key is matching * (-varname) and converting appropriately

    // Handle patterns like: something.xy * (-rot_xy)
    // We need to negate the result of the multiplication instead of the matrix
    // Note: \s* handles optional whitespace, the - may or may not have space after it
    result = result.replace(
      /(\w+(?:_\w*)?(?:\.\w+)?)\s*\*\s*\(\s*-\s*(\w+(?:_\w*)?)\s*\)/g,
      (match, vec, mat) => `-(${vec} * ${mat})`
    );

    // Also handle: (-matrixVar) * expr -> -(matrixVar * expr)
    result = result.replace(
      /\(\s*-\s*(\w+(?:_\w*)?)\s*\)\s*\*\s*(\w+(?:_\w*)?(?:\.\w+)?)/g,
      (match, mat, vec) => `-(${mat} * ${vec})`
    );

    return result;
  }

  /**
   * Fix swizzle assignments - WGSL doesn't support assigning to swizzles like var.rgb = expr
   * Converts: var.rgb = expr; -> var = vec4<f32>(expr, var.a);
   * Converts: var.xyz = expr; -> var = vec4<f32>(expr, var.w);
   * Converts: var.xy = expr; (for vec2) -> var = expr;
   * Also handles compound assignments: var.xy += expr; -> var = vec3<f32>(var.xy + expr, var.z);
   */
  private fixSwizzleAssignments(code: string): string {
    let result = code;

    // Collect variable types so we can detect vec2, vec3 vs vec4
    const varTypes = new Map<string, string>();

    // Match var declarations
    const varDeclPattern = /var\s+(\w+)\s*:\s*(vec[234]<f32>)/g;
    let match;
    while ((match = varDeclPattern.exec(code)) !== null) {
      varTypes.set(match[1], match[2]);
    }

    // Also match function parameters (name: type or name_in: type)
    const paramPattern = /(\w+)(?:_in)?\s*:\s*(vec[234]<f32>)/g;
    while ((match = paramPattern.exec(code)) !== null) {
      // Store both with and without _in suffix
      const baseName = match[1].replace(/_in$/, '');
      varTypes.set(match[1], match[2]);
      varTypes.set(baseName, match[2]);
    }

    // Helper to get the remaining component for a vec3 after .xy
    const getVec3Remaining = (varName: string) => `${varName}.z`;
    // Helper to get the remaining components for a vec4 after .xy
    const getVec4Remaining = (varName: string) => `${varName}.z, ${varName}.w`;

    // Handle compound assignments first (+=, -=, *=, /=)
    // Pattern: identifier.xy += expression;
    // Convert to: identifier = vec2<f32>(identifier.xy + expression); for vec2
    // Convert to: identifier = vec3<f32>(identifier.xy + expression, identifier.z); for vec3
    // Or: identifier = vec4<f32>(identifier.xy + expression, identifier.z, identifier.w); for vec4
    result = result.replace(
      /(\w+)\.xy\s*(\+|-|\*|\/)\s*=\s*([^;]+);/g,
      (match, varName, op, expr) => {
        const varType = varTypes.get(varName);
        if (varType === 'vec2<f32>') {
          return `${varName} = ${varName}.xy ${op} (${expr.trim()});`;
        } else if (varType === 'vec3<f32>') {
          return `${varName} = vec3<f32>(${varName}.xy ${op} (${expr.trim()}), ${getVec3Remaining(varName)});`;
        } else {
          // Assume vec4 or unknown
          return `${varName} = vec4<f32>(${varName}.xy ${op} (${expr.trim()}), ${getVec4Remaining(varName)});`;
        }
      }
    );

    // Handle compound assignments for .xyz
    result = result.replace(
      /(\w+)\.xyz\s*(\+|-|\*|\/)\s*=\s*([^;]+);/g,
      (match, varName, op, expr) => {
        return `${varName} = vec4<f32>(${varName}.xyz ${op} (${expr.trim()}), ${varName}.w);`;
      }
    );

    // Handle compound assignments for .rgb
    result = result.replace(
      /(\w+)\.rgb\s*(\+|-|\*|\/)\s*=\s*([^;]+);/g,
      (match, varName, op, expr) => {
        return `${varName} = vec4<f32>(${varName}.rgb ${op} (${expr.trim()}), ${varName}.a);`;
      }
    );

    // Handle compound assignments for .rg
    result = result.replace(
      /(\w+)\.rg\s*(\+|-|\*|\/)\s*=\s*([^;]+);/g,
      (match, varName, op, expr) => {
        const varType = varTypes.get(varName);
        if (varType === 'vec3<f32>') {
          return `${varName} = vec3<f32>(${varName}.rg ${op} (${expr.trim()}), ${varName}.b);`;
        } else {
          return `${varName} = vec4<f32>(${varName}.rg ${op} (${expr.trim()}), ${varName}.b, ${varName}.a);`;
        }
      }
    );

    // Handle compound assignments for .xz (non-contiguous swizzle)
    // vec3: v.xz *= m  ->  { let t = v.xz * m; v.x = t.x; v.z = t.y; }
    result = result.replace(
      /(\w+)\.xz\s*(\+|-|\*|\/)\s*=\s*([^;]+);/g,
      (match, varName, op, expr) => {
        return `{ let _sw = ${varName}.xz ${op} (${expr.trim()}); ${varName}.x = _sw.x; ${varName}.z = _sw.y; }`;
      }
    );

    // Handle compound assignments for .yz (non-contiguous swizzle)
    result = result.replace(
      /(\w+)\.yz\s*(\+|-|\*|\/)\s*=\s*([^;]+);/g,
      (match, varName, op, expr) => {
        return `{ let _sw = ${varName}.yz ${op} (${expr.trim()}); ${varName}.y = _sw.x; ${varName}.z = _sw.y; }`;
      }
    );

    // Handle simple assignments for .xz
    result = result.replace(
      /(\w+)\.xz\s*=\s*([^;]+);/g,
      (match, varName, expr) => {
        return `{ let _sw = ${expr.trim()}; ${varName}.x = _sw.x; ${varName}.z = _sw.y; }`;
      }
    );

    // Handle simple assignments for .yz
    result = result.replace(
      /(\w+)\.yz\s*=\s*([^;]+);/g,
      (match, varName, expr) => {
        return `{ let _sw = ${expr.trim()}; ${varName}.y = _sw.x; ${varName}.z = _sw.y; }`;
      }
    );

    // Handle compound assignments for .bg (non-contiguous swizzle)
    result = result.replace(
      /(\w+)\.bg\s*(\+|-|\*|\/)\s*=\s*([^;]+);/g,
      (match, varName, op, expr) => {
        return `{ let _sw = ${varName}.bg ${op} (${expr.trim()}); ${varName}.b = _sw.x; ${varName}.g = _sw.y; }`;
      }
    );

    // Handle simple assignments for .bg
    result = result.replace(
      /(\w+)\.bg\s*=\s*([^;]+);/g,
      (match, varName, expr) => {
        return `{ let _sw = ${expr.trim()}; ${varName}.b = _sw.x; ${varName}.g = _sw.y; }`;
      }
    );

    // Now handle simple assignments (existing code, but improved for vec3)
    // Pattern: identifier.rgb = expression;
    // Convert to: identifier = vec4<f32>(expression, identifier.a);
    result = result.replace(
      /(\w+)\.rgb\s*=\s*([^;]+);/g,
      (match, varName, expr) => {
        return `${varName} = vec4<f32>(${expr.trim()}, ${varName}.a);`;
      }
    );

    // Pattern: identifier.xyz = expression;
    // Convert to: identifier = vec4<f32>(expression, identifier.w);
    result = result.replace(
      /(\w+)\.xyz\s*=\s*([^;]+);/g,
      (match, varName, expr) => {
        return `${varName} = vec4<f32>(${expr.trim()}, ${varName}.w);`;
      }
    );

    // Pattern: identifier.xy = expression;
    // Check variable type to determine if vec2, vec3 or vec4
    result = result.replace(
      /(\w+)\.xy\s*=\s*([^;]+);/g,
      (match, varName, expr) => {
        const varType = varTypes.get(varName);
        if (varType === 'vec2<f32>') {
          // For vec2, .xy = expr is the same as var = expr
          return `${varName} = ${expr.trim()};`;
        } else if (varType === 'vec3<f32>') {
          return `${varName} = vec3<f32>(${expr.trim()}, ${varName}.z);`;
        } else {
          // Assume vec4 or unknown
          return `${varName} = vec4<f32>(${expr.trim()}, ${varName}.z, ${varName}.w);`;
        }
      }
    );

    // Pattern: identifier.rg = expression;
    result = result.replace(
      /(\w+)\.rg\s*=\s*([^;]+);/g,
      (match, varName, expr) => {
        const varType = varTypes.get(varName);
        if (varType === 'vec3<f32>') {
          return `${varName} = vec3<f32>(${expr.trim()}, ${varName}.b);`;
        } else {
          return `${varName} = vec4<f32>(${expr.trim()}, ${varName}.b, ${varName}.a);`;
        }
      }
    );

    return result;
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
