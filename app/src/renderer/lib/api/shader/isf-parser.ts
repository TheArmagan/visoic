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
        functionDefines.push({ name: fn[1], args, body: fn[3] });
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
        objectDefines.set(macroName, obj[2]);
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
    uniformStruct += '  layerOpacity: f32,\n';
    uniformStruct += '  _pad0: f32,\n';
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
    wgsl = this.fixSwizzleAssignments(wgsl);

    // Fix clamp() calls with scalar min/max on vectors
    // WGSL requires: clamp(vec4, vec4, vec4), not clamp(vec4, scalar, scalar)
    wgsl = this.fixClampCalls(wgsl);

    // Fix smoothstep() calls with scalar edge0/edge1 on vectors
    // WGSL requires: smoothstep(vec3, vec3, vec3), not smoothstep(scalar, scalar, vec3)
    wgsl = this.fixSmoothstepCalls(wgsl);

    // Fix C-style array declarations
    // vec4<f32> arr[9]; -> var arr: array<vec4<f32>, 9>;
    wgsl = this.fixArrayDeclarations(wgsl);

    // Fix module-scope var declarations - WGSL requires address space
    // This must happen before main() conversion to identify module-scope vars
    wgsl = this.fixModuleScopeVarDeclarations(wgsl);

    // Convert main function - handle both void main() and void main(void)
    wgsl = wgsl.replace(
      /void\s+main\s*\(\s*(void)?\s*\)\s*\{/,
      `@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
  var outputColor: vec4<f32> = vec4<f32>(0.0, 0.0, 0.0, 1.0);`
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

    let result = code;

    // Special handling for Shadertoy-style mainImage function
    // void mainImage(out vec4 fragColor, in vec2 fragCoord) { ... }
    // We need to convert this to use a pointer for the out parameter
    const mainImageRegex = /\bvoid\s+mainImage\s*\(\s*(?:out\s+)?vec4\s+(\w+)\s*,\s*(?:in\s+)?vec2\s+(\w+)\s*\)\s*\{/;
    const mainImageMatch = result.match(mainImageRegex);

    if (mainImageMatch) {
      const fragColorName = mainImageMatch[1]; // Usually 'fragColor'
      const fragCoordName = mainImageMatch[2]; // Usually 'fragCoord'

      // Replace the function declaration with pointer version
      result = result.replace(
        mainImageRegex,
        `fn mainImage(${fragColorName}_ptr: ptr<function, vec4<f32>>, ${fragCoordName}: vec2<f32>) {\n  var ${fragColorName} = *${fragColorName}_ptr;`
      );

      // Find the closing brace of mainImage and add the pointer write-back
      // This is a simple heuristic - find mainImage and track braces
      const mainImageIdx = result.indexOf('fn mainImage(');
      if (mainImageIdx !== -1) {
        let braceDepth = 0;
        let foundOpen = false;
        let closeIdx = -1;

        for (let i = mainImageIdx; i < result.length; i++) {
          if (result[i] === '{') {
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

        if (closeIdx !== -1) {
          // Insert the pointer write-back before the closing brace
          result = result.slice(0, closeIdx) + `\n  *${fragColorName}_ptr = ${fragColorName};\n` + result.slice(closeIdx);
        }
      }

      // Update the call to mainImage to pass a pointer
      // mainImage(outputColor, fragCoord) -> mainImage(&outputColor, fragCoord)
      result = result.replace(
        /\bmainImage\s*\(\s*(\w+)\s*,/g,
        (match, firstArg) => {
          // Only replace calls, not the function definition
          if (firstArg === fragColorName + '_ptr') return match;
          return `mainImage(&${firstArg},`;
        }
      );
    }

    // Regular expression to match GLSL function declarations
    // Matches: returnType funcName(params) { (with flexible whitespace)
    // Using more specific type names to avoid partial matches
    const typePattern = 'void|float|int|bool|vec2|vec3|vec4|ivec2|ivec3|ivec4|uvec2|uvec3|uvec4|mat2|mat3|mat4';
    const funcRegex = new RegExp(
      `\\b(${typePattern})\\s+(\\w+)\\s*\\(([^)]*)\\)\\s*\\{`,
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

      // Create local variable copies for mutable parameters
      // WGSL function parameters are immutable, so we need local copies
      // Use _local_ prefix to avoid collision with uniform names
      const localVarDecls = mutableParams.map(p => `  var ${p.name}: ${p.type} = ${p.name}_in;`).join('\n');
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
   * Returns: { params: string, mutableParams: Array<{name: string, type: string}> }
   * mutableParams contains parameters that need local copies in the function body
   */
  private convertFunctionParams(params: string, typeMap: Record<string, string>): { params: string; mutableParams: Array<{ name: string, type: string }> } {
    if (!params.trim()) return { params: '', mutableParams: [] };

    const paramList = params.split(',').map(p => p.trim()).filter(p => p);
    const typePattern = 'void|float|int|bool|vec2|vec3|vec4|ivec2|ivec3|ivec4|uvec2|uvec3|uvec4|mat2|mat3|mat4';
    const mutableParams: Array<{ name: string, type: string }> = [];

    const converted = paramList.map(param => {
      // Remove in/out/inout qualifiers
      param = param.replace(/\b(in|out|inout)\s+/g, '');

      // Match: type name (with optional const)
      const match = param.match(new RegExp(`^\\s*(?:const\\s+)?(${typePattern})\\s+(\\w+)\\s*$`));

      if (match) {
        const [, type, name] = match;
        const wgslType = typeMap[type] || 'f32';
        // Mark all non-const parameters as potentially mutable
        mutableParams.push({ name, type: wgslType });
        // Rename parameter to _in suffix, we'll create local copy in body
        return `${name}_in: ${wgslType}`;
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

      // Find the statement (everything up to ; or { for nested structures)
      // Handle the case where it's another if/for/while without braces
      let stmtEnd = 0;
      if (afterWs.match(/^(if|for|while)\s*\(/)) {
        // Nested control structure - we'll handle it in the next iteration
        // For now, skip this if
        result = result.slice(0, ifStart) + '__IF_PROCESSED__' + result.slice(ifStart + 2);
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

    let result = code;
    let safety = 0;
    const maxIterations = 1000;

    while (safety < maxIterations) {
      safety++;

      // Find clamp( 
      const clampMatch = result.match(/\bclamp\s*\(/);
      if (!clampMatch || clampMatch.index === undefined) break;

      const clampStart = clampMatch.index;
      const argsStart = clampStart + clampMatch[0].length;

      // Parse the arguments
      const parsed = this.parseParenInvocationArgs(result, clampStart + 'clamp'.length);
      if (!parsed || parsed.args.length !== 3) {
        // Can't parse or wrong number of args, skip
        result = result.slice(0, clampStart) + '__CLAMP_PROCESSED__' + result.slice(clampStart + 5);
        continue;
      }

      const [arg1, arg2, arg3] = parsed.args.map(a => a.trim());

      // Check if arg2 and arg3 look like scalars (numbers)
      const looksLikeScalar = (s: string) => {
        const trimmed = s.trim();
        // Is it a number? Match: 0, 0.0, .5, 0., 1.0f, -0.5, etc.
        if (/^-?\d*\.?\d*f?$/.test(trimmed) && /\d/.test(trimmed)) return true;
        return false;
      };

      // Detect vector type from first argument
      // We need to find any vector type in the expression
      let vecType: string | null = null;

      const trimmedArg1 = arg1.trim();

      // Check if expression CONTAINS a vector constructor (anywhere, not just at start)
      // Priority: vec4 > vec3 > vec2 to get the most likely result type
      // For expressions like "1.- vec3<f32>(val)", the result is vec3
      if (trimmedArg1.includes('vec4<f32>') || trimmedArg1.match(/\bvec4\s*\(/)) {
        vecType = 'vec4';
      } else if (trimmedArg1.includes('vec3<f32>') || trimmedArg1.match(/\bvec3\s*\(/)) {
        vecType = 'vec3';
      } else if (trimmedArg1.includes('vec2<f32>') || trimmedArg1.match(/\bvec2\s*\(/)) {
        vecType = 'vec2';
      } else if (/^[a-zA-Z_]\w*$/.test(trimmedArg1)) {
        // It's a simple variable name - check if we know its type
        const knownType = varTypes.get(trimmedArg1);
        if (knownType) {
          vecType = knownType;
        }
      }

      // Fallback: Check if the first token is a function call or expression with arithmetic
      /*
      // Removed: This is too aggressive and breaks scalar clamping (e.g. clamp(x * 2.0, 0.0, 1.0))
      if (!vecType) {
        const startsWithFunctionCall = /^[a-zA-Z_]\w*\s*\(/.test(trimmedArg1);
        const hasArithmetic = /[*+\-\/]/.test(trimmedArg1);

        if ((startsWithFunctionCall || hasArithmetic) && looksLikeScalar(arg2) && looksLikeScalar(arg3)) {
          // Assume vec4 for function calls and expressions (most common for colors)
          vecType = 'vec4';
        }
      }
      */

      if (vecType && looksLikeScalar(arg2) && looksLikeScalar(arg3)) {
        // Need to wrap scalars in vector constructors
        const wgslVecType = `${vecType}<f32>`;
        const newClamp = `clamp(${arg1}, ${wgslVecType}(${arg2}), ${wgslVecType}(${arg3}))`;
        result = result.slice(0, clampStart) + newClamp + result.slice(parsed.endIndex + 1);
      } else {
        // Mark as processed
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
   * Fix module-scope var declarations by adding <private> address space.
   * WGSL requires: var<private> name: type = value;
   * for module-scope mutable variables (not texture/sampler).
   * Function-scope vars should NOT have an address space.
   */
  private fixModuleScopeVarDeclarations(code: string): string {
    // Find all function definitions to determine what's module scope vs function scope
    // Functions are: fn name(...) { ... }
    const lines = code.split('\n');
    const result: string[] = [];
    let braceDepth = 0;
    let inFunction = false;

    for (const line of lines) {
      // Check if we're entering a function
      if (/\bfn\s+\w+\s*\(/.test(line)) {
        inFunction = true;
      }

      // Track brace depth
      for (const char of line) {
        if (char === '{') braceDepth++;
        if (char === '}') braceDepth--;
      }

      // If we're at brace depth 0 after processing, we're back at module scope
      if (braceDepth === 0) {
        inFunction = false;
      }

      // Only add <private> to var declarations at module scope (not inside functions)
      if (!inFunction && braceDepth === 0) {
        // Add <private> to module-scope var declarations
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

    return result.join('\n');
  }

  /**
   * Fix swizzle assignments - WGSL doesn't support assigning to swizzles like var.rgb = expr
   * Converts: var.rgb = expr; -> var = vec4<f32>(expr, var.a);
   * Converts: var.xyz = expr; -> var = vec4<f32>(expr, var.w);
   */
  private fixSwizzleAssignments(code: string): string {
    let result = code;

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
    // Convert to: identifier = vec4<f32>(expression, identifier.z, identifier.w); for vec4
    // Or: identifier = vec3<f32>(expression, identifier.z); for vec3
    // For simplicity, assume vec4 context (most common in shaders)
    result = result.replace(
      /(\w+)\.xy\s*=\s*([^;]+);/g,
      (match, varName, expr) => {
        // Check context - if the variable looks like it's a vec2, don't modify
        // Otherwise assume vec4 and preserve z, w
        return `${varName} = vec4<f32>(${expr.trim()}, ${varName}.z, ${varName}.w);`;
      }
    );

    // Pattern: identifier.rg = expression;
    result = result.replace(
      /(\w+)\.rg\s*=\s*([^;]+);/g,
      (match, varName, expr) => {
        return `${varName} = vec4<f32>(${expr.trim()}, ${varName}.b, ${varName}.a);`;
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
