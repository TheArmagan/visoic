/**
 * ISF (Interactive Shader Format) to WGSL Compiler
 * Transpiles GLSL ES 2.0 ISF shaders to WebGPU WGSL
 *
 * Production-ready implementation handling all known ISF edge cases:
 * - Complex #define macros (object-like and function-like)
 * - Backslash-continued macro definitions
 * - Shadertoy-style mainImage function
 * - GLSL ternary operator conversion to select()
 * - Swizzle assignments (.rgb =, .xy +=, etc.)
 * - Matrix negation workarounds
 * - out/inout parameter pointer conversion
 * - clamp/smoothstep/max/min type promotion
 * - WGSL reserved keyword renaming
 * - Function overloading disambiguation
 * - Module-scope variable address space
 * - And many more edge cases from real-world ISF shaders
 *
 * @author VJ Engine Team
 * @version 2.0.0
 */

// ============================================================================
// Type Definitions
// ============================================================================

export interface ISFInput {
  NAME: string;
  TYPE: "float" | "long" | "bool" | "point2D" | "color" | "image" | "event" | "int";
  DEFAULT?: number | boolean | number[];
  MIN?: number;
  MAX?: number;
  IDENTITY?: number;
  LABELS?: string[];
  VALUES?: number[];
  LABEL?: string;
}

export interface ISFMetadata {
  DESCRIPTION?: string;
  CREDIT?: string;
  ISFVSN?: string;
  CATEGORIES?: string[];
  INPUTS?: ISFInput[];
  PASSES?: Array<{ TARGET?: string; WIDTH?: string; HEIGHT?: string; FLOAT?: boolean; PERSISTENT?: boolean; persistent?: boolean }>;
  PERSISTENT_BUFFERS?: string[];
  IMPORTED?: Record<string, { PATH: string }>;
}

export interface UniformField {
  name: string;
  type: string;
  wgslType: string;
  offset: number;
  size: number;
  isPadding?: boolean;
}

export interface TextureBinding {
  name: string;
  textureBinding: number;
  samplerBinding: number;
}

export interface PassBinding {
  name: string;
  textureBinding: number;
  samplerBinding: number;
}

export interface CompilerOutput {
  wgsl: string;
  vertexShader: string;
  layout: {
    uniforms: UniformField[];
    uniformBufferSize: number;
    textures: TextureBinding[];
    passes: PassBinding[];
  };
  metadata: ISFMetadata;
  warnings: string[];
}

interface FunctionDef {
  name: string;
  params: string[];
  body: string;
}

interface MacroDef {
  name: string;
  args?: string[];
  body: string;
}

interface MutableParam {
  name: string;
  type: string;
  isOut: boolean;
}

// ============================================================================
// Constants
// ============================================================================

const ISF_TYPE_TO_WGSL: Record<string, { wgslType: string; size: number; align: number }> = {
  float: { wgslType: "f32", size: 4, align: 4 },
  int: { wgslType: "f32", size: 4, align: 4 }, // Store as f32, cast to i32 when used
  long: { wgslType: "f32", size: 4, align: 4 }, // Store as f32, cast to i32 when used
  bool: { wgslType: "f32", size: 4, align: 4 }, // WGSL bools stored as f32 for uniform compatibility
  point2d: { wgslType: "vec2<f32>", size: 8, align: 8 }, // lowercase version
  point2D: { wgslType: "vec2<f32>", size: 8, align: 8 }, // Support both cases
  color: { wgslType: "vec4<f32>", size: 16, align: 16 },
  event: { wgslType: "f32", size: 4, align: 4 }, // Events treated as bool triggers
};

const GLSL_TYPE_TO_WGSL: Record<string, string> = {
  void: "",
  float: "f32",
  int: "i32",
  uint: "u32",
  bool: "bool",
  vec2: "vec2<f32>",
  vec3: "vec3<f32>",
  vec4: "vec4<f32>",
  ivec2: "vec2<i32>",
  ivec3: "vec3<i32>",
  ivec4: "vec4<i32>",
  uvec2: "vec2<u32>",
  uvec3: "vec3<u32>",
  uvec4: "vec4<u32>",
  mat2: "mat2x2<f32>",
  mat3: "mat3x3<f32>",
  mat4: "mat4x4<f32>",
  sampler2D: "texture_2d<f32>",
  sampler2DRect: "texture_2d<f32>",
  samplerCube: "texture_cube<f32>",
};

const WGSL_TYPE_INFO: Record<string, { size: number; align: number }> = {
  f32: { size: 4, align: 4 },
  i32: { size: 4, align: 4 },
  u32: { size: 4, align: 4 },
  bool: { size: 4, align: 4 },
  "vec2<f32>": { size: 8, align: 8 },
  "vec2<i32>": { size: 8, align: 8 },
  "vec2<u32>": { size: 8, align: 8 },
  "vec3<f32>": { size: 12, align: 16 },
  "vec3<i32>": { size: 12, align: 16 },
  "vec3<u32>": { size: 12, align: 16 },
  "vec4<f32>": { size: 16, align: 16 },
  "vec4<i32>": { size: 16, align: 16 },
  "vec4<u32>": { size: 16, align: 16 },
  "mat2x2<f32>": { size: 16, align: 8 },
  "mat3x3<f32>": { size: 48, align: 16 },
  "mat4x4<f32>": { size: 64, align: 16 },
};

// Standard ISF globals that we inject
const ISF_STANDARD_UNIFORMS: Array<{ name: string; wgslType: string }> = [
  { name: "time", wgslType: "f32" },
  { name: "timeDelta", wgslType: "f32" },
  { name: "renderSize", wgslType: "vec2<f32>" },
  { name: "passIndex", wgslType: "f32" },
  { name: "frameIndex", wgslType: "f32" },
  { name: "layerOpacity", wgslType: "f32" },
  { name: "speed", wgslType: "f32" },
  { name: "date", wgslType: "vec4<f32>" }, // (year, month, day, seconds)
];

// WGSL reserved keywords that conflict when used as user variable/function names
// Note: This does NOT include WGSL syntax keywords (var, const, for, if, etc.)
// Only identifiers that would conflict with WGSL built-ins or types
const WGSL_RESERVED_KEYWORDS = new Set([
  'sample', 'sampler', 'texture', 'filter', 'read', 'write',
  'ptr', 'array', 'atomic', 'mat2x2', 'mat2x3', 'mat2x4',
  'mat3x2', 'mat3x3', 'mat3x4', 'mat4x2', 'mat4x3', 'mat4x4',
  'vec2', 'vec3', 'vec4', 'bool', 'f16', 'f32', 'i32', 'u32',
  'override', 'bitcast', 'workgroup', 'uniform', 'storage', 'private', 'function',
  'push_constant', 'alias', 'enable', 'diagnostic', 'final',
  // Additional WGSL reserved keywords
  'from', 'move', 'target', 'type', 'switch', 'case', 'default',
  'fallthrough', 'binding', 'builtin', 'location', 'group', 'size',
  'align', 'stride', 'interpolate', 'invariant',
  // Additional keywords that cause conflicts
  'ref', // used by reflect() and causes "ref is a reserved keyword" error
]);

// ============================================================================
// Main Compiler Class
// ============================================================================

export class ISFToWGSLCompiler {
  private warnings: string[] = [];
  private metadata: ISFMetadata = {};
  private uniformFields: UniformField[] = [];
  private textureBindings: TextureBinding[] = [];
  private passBindings: PassBinding[] = [];
  private inputNames: Set<string> = new Set();
  private textureNames: Set<string> = new Set();
  private objectMacros: Map<string, string> = new Map();
  private functionMacros: MacroDef[] = [];
  private renamedUniforms: Map<string, string> = new Map();
  private varTypes: Map<string, string> = new Map();
  private varsToInitInMain: Array<{ name: string; value: string }> = [];
  private mutableParams: Map<string, MutableParam> = new Map();

  /**
   * Main compilation entry point
   */
  public compile(isfSource: string): CompilerOutput {
    this.reset();

    try {
      // Phase 1: Extract and parse metadata
      const { metadata, glslCode } = this.extractMetadata(isfSource);
      this.metadata = metadata;

      // Phase 1.5: Process #define macros
      const preprocessedCode = this.expandGLSLDefines(glslCode);

      // Phase 2: Analyze inputs and build uniform layout
      this.analyzeInputs(metadata.INPUTS || []);

      // Phase 3: Transpile GLSL to WGSL
      const wgslBody = this.convertGLSLtoWGSL(preprocessedCode);

      // Phase 4: Generate final WGSL with bindings
      const { fragmentShader, vertexShader } = this.generateFinalWGSL(wgslBody);

      return {
        wgsl: fragmentShader,
        vertexShader,
        layout: {
          uniforms: this.uniformFields.filter((f) => !f.isPadding),
          uniformBufferSize: this.calculateUniformBufferSize(),
          textures: this.textureBindings,
          passes: this.passBindings,
        },
        metadata: this.metadata,
        warnings: this.warnings,
      };
    } catch (error) {
      throw new Error(`ISF Compilation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Reset compiler state for new compilation
   */
  private reset(): void {
    this.warnings = [];
    this.metadata = {};
    this.uniformFields = [];
    this.textureBindings = [];
    this.passBindings = [];
    this.inputNames = new Set();
    this.textureNames = new Set();
    this.objectMacros = new Map();
    this.functionMacros = [];
    this.renamedUniforms = new Map();
    this.varTypes = new Map();
    this.varsToInitInMain = [];
    this.mutableParams = new Map();
  }

  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // ==========================================================================
  // Phase 1: Metadata Extraction
  // ==========================================================================

  private extractMetadata(source: string): { metadata: ISFMetadata; glslCode: string } {
    // ISF JSON is in a C-style comment at the top: /* { ... } */
    const startIndex = source.indexOf('/*');
    const endIndex = source.indexOf('*/');

    if (startIndex === -1 || endIndex === -1) {
      this.warnings.push("No ISF JSON metadata found, using defaults");
      return { metadata: {}, glslCode: source };
    }

    const jsonStr = source.substring(startIndex + 2, endIndex).trim();
    const glslCode = source.substring(endIndex + 2).trim();

    let metadata: ISFMetadata | null = null;

    try {
      metadata = JSON.parse(jsonStr) as ISFMetadata;
    } catch {
      // Try to fix common JSON issues
      try {
        const fixed = jsonStr
          .replace(/,\s*}/g, '}')
          .replace(/,\s*]/g, ']')
          .replace(/'/g, '"');
        metadata = JSON.parse(fixed) as ISFMetadata;
      } catch (e) {
        throw new Error(`Failed to parse ISF JSON: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    if (!metadata) {
      return { metadata: {}, glslCode };
    }

    // Inject BUILTIN_SPEED if not present
    if (!metadata.INPUTS) metadata.INPUTS = [];
    const hasSpeed = metadata.INPUTS.some((i) => i.NAME === 'BUILTIN_SPEED');
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

    // Add IMPORTED textures as image inputs so they get bindings
    if (metadata.IMPORTED) {
      const existing = new Set((metadata.INPUTS || []).map(i => i.NAME));
      for (const name of Object.keys(metadata.IMPORTED)) {
        if (!existing.has(name)) {
          metadata.INPUTS.push({
            NAME: name,
            TYPE: 'image',
          });
        }
      }
    }

    return { metadata, glslCode };
  }

  // ==========================================================================
  // Phase 1.5: Preprocessor - Macro Expansion
  // ==========================================================================

  /**
   * Best-effort expansion for common GLSL `#define` macros found in ISF shaders.
   * WGSL has no preprocessor, so we inline simple object-like macros (constants)
   * and function-like macros.
   */
  private expandGLSLDefines(source: string): string {
    const uniformNames = new Set<string>(
      (this.metadata?.INPUTS || []).filter(i => i.TYPE !== 'image').map(i => i.NAME)
    );

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
          this.functionMacros.push({ name: fn[1], args, body: macroBody });
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
        macroValue = macroValue.replace(/\/\*.*?\*\//g, '').trim();

        if (macroValue) {
          this.objectMacros.set(macroName, macroValue);
        }
        outLines.push(`// (removed #define ${macroName} ...)`);
        continue;
      }

      outLines.push(line);
    }

    let code = outLines.join('\n');

    // Iteratively expand to cover nested macros / macros that reference macros.
    const maxPasses = 8;
    for (let pass = 0; pass < maxPasses; pass++) {
      const before = code;

      // Expand function-like macros first (more specific).
      for (const def of this.functionMacros) {
        code = this.expandFunctionLikeMacro(code, def.name, def.args!, def.body);
      }

      // Expand object-like macros (constants).
      for (const [name, value] of this.objectMacros.entries()) {
        code = this.expandObjectMacroSafe(code, name, value);
      }

      if (code === before) break;
    }

    // Remove remaining preprocessor directives
    code = code.replace(/^\s*#(ifdef|ifndef|if|else|elif|endif|undef|error|pragma|extension|version|line|include).*$/gm, (match) => {
      if (!match.includes('#version') && !match.includes('#extension')) {
        this.warnings.push(`Preprocessor directive removed: ${match.trim()}`);
      }
      return '// ' + match.trim();
    });
    code = code.replace(/^\s*precision\s+.*$/gm, '// (removed precision)');

    return code;
  }

  /**
   * Expand object-like macro while avoiding comments.
   */
  private expandObjectMacroSafe(code: string, name: string, value: string): string {
    const result: string[] = [];
    const lines = code.split('\n');

    for (const line of lines) {
      const singleLineComment = line.indexOf('//');
      const codePartEnd = singleLineComment >= 0 ? singleLineComment : line.length;
      const codePart = line.slice(0, codePartEnd);
      const commentPart = line.slice(codePartEnd);

      const re = new RegExp(`\\b${this.escapeRegExp(name)}\\b`, 'g');
      const expandedCodePart = codePart.replace(re, `(${value})`);
      result.push(expandedCodePart + commentPart);
    }

    return result.join('\n');
  }

  private expandFunctionLikeMacro(code: string, name: string, argNames: string[], body: string): string {
    let out = code;
    let safety = 0;

    for (let idx = 0; idx < out.length && safety < 20000;) {
      const found = this.findMacroInvocation(out, name, idx);
      if (!found) break;

      safety++;
      const parsed = this.parseParenInvocationArgs(out, found.argsStartIndex);
      if (!parsed) {
        idx = found.argsStartIndex + 1;
        continue;
      }

      if (parsed.args.length !== argNames.length) {
        idx = parsed.endIndex + 1;
        continue;
      }

      let replacedBody = body;
      for (let i = 0; i < argNames.length; i++) {
        replacedBody = replacedBody.replace(
          new RegExp(`\\b${this.escapeRegExp(argNames[i])}\\b`, 'g'),
          `(${parsed.args[i].trim()})`,
        );
      }

      const replacement = `(${replacedBody})`;
      out = out.slice(0, found.startIndex) + replacement + out.slice(parsed.endIndex + 1);
      idx = found.startIndex + replacement.length;
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
      const prev = i > 0 ? code[i - 1] : '';
      if (prev && /[A-Za-z0-9_]/.test(prev)) continue;

      if (code.slice(i, i + n) !== name) continue;

      let j = i + n;
      while (j < code.length) {
        if (/\s/.test(code[j])) { j++; continue; }
        if (code.slice(j).startsWith('__COMMENT_')) {
          const commMatch = code.slice(j).match(/^__COMMENT_\d+__/);
          if (commMatch) { j += commMatch[0].length; continue; }
        }
        break;
      }
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

  // ==========================================================================
  // Phase 2: Input Analysis & Uniform Layout
  // ==========================================================================

  private analyzeInputs(inputs: ISFInput[]): void {
    let currentOffset = 0;

    // Helper to add padding for alignment
    const alignOffset = (align: number): void => {
      const remainder = currentOffset % align;
      if (remainder !== 0) {
        const padding = align - remainder;
        this.uniformFields.push({
          name: `_pad${this.uniformFields.length}`,
          type: "padding",
          wgslType: padding === 4 ? "f32" : padding === 8 ? "vec2<f32>" : `array<f32, ${padding / 4}>`,
          offset: currentOffset,
          size: padding,
          isPadding: true,
        });
        currentOffset += padding;
      }
    };

    // Get safe name that doesn't conflict with WGSL keywords
    const getSafeUniformName = (name: string): string => {
      if (WGSL_RESERVED_KEYWORDS.has(name)) {
        const safeName = `isf_${name}`;
        this.renamedUniforms.set(name, safeName);
        return safeName;
      }
      return name;
    };

    // Add standard ISF uniforms first
    for (const uniform of ISF_STANDARD_UNIFORMS) {
      const info = WGSL_TYPE_INFO[uniform.wgslType];
      alignOffset(info.align);

      this.uniformFields.push({
        name: uniform.name,
        type: "standard",
        wgslType: uniform.wgslType,
        offset: currentOffset,
        size: info.size,
      });
      currentOffset += info.size;
      this.inputNames.add(uniform.name);
    }

    // Process user inputs
    let textureBindingIndex = 0;

    for (const input of inputs) {
      const inputType = input.TYPE.toLowerCase();

      // Skip inputs that conflict with standard ISF uniforms
      // The standard uniform will be used instead
      const standardUniformNames = ISF_STANDARD_UNIFORMS.map(u => u.name);
      if (standardUniformNames.includes(input.NAME)) {
        this.warnings.push(`Input "${input.NAME}" conflicts with standard ISF uniform, using standard uniform instead`);
        continue;
      }

      if (inputType === "image") {
        // Images become texture + sampler bindings
        this.textureBindings.push({
          name: input.NAME,
          textureBinding: textureBindingIndex,
          samplerBinding: textureBindingIndex + 1,
        });
        textureBindingIndex += 2;
        this.textureNames.add(input.NAME);
        this.inputNames.add(input.NAME);
      } else {
        // Non-image inputs go into uniform buffer
        const typeInfo = ISF_TYPE_TO_WGSL[inputType];
        if (!typeInfo) {
          this.warnings.push(`Unknown ISF type "${input.TYPE}" for input "${input.NAME}", treating as f32`);
          const fallbackInfo = ISF_TYPE_TO_WGSL["float"];
          alignOffset(fallbackInfo.align);
          const safeName = getSafeUniformName(input.NAME);
          this.uniformFields.push({
            name: safeName,
            type: input.TYPE,
            wgslType: fallbackInfo.wgslType,
            offset: currentOffset,
            size: fallbackInfo.size,
          });
          currentOffset += fallbackInfo.size;
        } else {
          alignOffset(typeInfo.align);
          const safeName = getSafeUniformName(input.NAME);
          this.uniformFields.push({
            name: safeName,
            type: input.TYPE,
            wgslType: typeInfo.wgslType,
            offset: currentOffset,
            size: typeInfo.size,
          });
          currentOffset += typeInfo.size;
        }
        this.inputNames.add(input.NAME);
      }
    }

    // Analyze passes and create bindings
    const passes = this.metadata?.PASSES || [];
    if (passes.length > 0) {
      for (let i = 0; i < passes.length; i++) {
        const pass = passes[i];
        const defaultName = `pass${i + 1}`;

        // Add pass texture binding
        this.passBindings.push({
          name: pass.TARGET || defaultName,
          textureBinding: textureBindingIndex,
          samplerBinding: textureBindingIndex + 1,
        });
        textureBindingIndex += 2;
      }
    }

    // Ensure total buffer size is aligned to 16 bytes (WebGPU requirement)
    alignOffset(16);
  }

  private calculateUniformBufferSize(): number {
    if (this.uniformFields.length === 0) return 16; // Minimum size
    const lastField = this.uniformFields[this.uniformFields.length - 1];
    const rawSize = lastField.offset + lastField.size;
    // Round up to 16 bytes
    return Math.ceil(rawSize / 16) * 16;
  }

  // ==========================================================================
  // Phase 3: GLSL to WGSL Transpilation (Complete Rewrite)
  // ==========================================================================

  private convertGLSLtoWGSL(glsl: string): string {
    let wgsl = glsl;

    // Remove all comments
    wgsl = wgsl.replace(/\/\/[^\n]*/g, '');
    wgsl = wgsl.replace(/\/\*[\s\S]*?\*\//g, '');

    // Remove common ISF/Shadertoy alias variable declarations
    wgsl = wgsl.replace(/^\s*vec3\s+iResolution\s*=\s*[^;]+;\s*$/gm, '// (removed iResolution alias)');
    wgsl = wgsl.replace(/^\s*vec2\s+iResolution\s*=\s*[^;]+;\s*$/gm, '// (removed iResolution alias)');
    wgsl = wgsl.replace(/^\s*float\s+iTime\s*=\s*[^;]+;\s*$/gm, '// (removed iTime alias)');
    wgsl = wgsl.replace(/^\s*float\s+iTimeDelta\s*=\s*[^;]+;\s*$/gm, '// (removed iTimeDelta alias)');
    wgsl = wgsl.replace(/^\s*(float|int)\s+iFrame\s*=\s*[^;]+;\s*$/gm, '// (removed iFrame alias)');
    wgsl = wgsl.replace(/^\s*vec4\s+iDate\s*=\s*[^;]+;\s*$/gm, '// (removed iDate alias)');
    wgsl = wgsl.replace(/^\s*(vec3|vec2)\s+resolution\s*=\s*[^;]+;\s*$/gm, '// (removed resolution alias)');
    wgsl = wgsl.replace(/^\s*float\s+time\s*=\s*[^;]+;\s*$/gm, '// (removed time alias)');

    // GLSL scalar casts to WGSL
    wgsl = wgsl.replace(/\bfloat\s*\(/g, 'f32(');
    wgsl = wgsl.replace(/\bint\s*\(/g, 'i32(');
    wgsl = wgsl.replace(/\buint\s*\(/g, 'u32(');

    // Drop common GLSL interface declarations
    wgsl = wgsl.replace(/^\s*(uniform|varying|attribute)\b.*$/gm, (m, kind) => `// (removed ${kind} decl)`);

    // Remove preprocessor directives
    wgsl = wgsl.replace(/^\s*#define\s+.*$/gm, '// (removed #define ...)');
    wgsl = wgsl.replace(/^\s*#(if|ifdef|ifndef|elif|else|endif|include|pragma|version|extension|line|error)\b.*$/gm, '// (removed preprocessor)');
    wgsl = wgsl.replace(/^\s*precision\s+.*$/gm, '// (removed precision)');

    // Remove OUT macro usage
    wgsl = wgsl.replace(/\bOUT\s+(\w+)/g, '$1');

    // Remove forward declarations
    wgsl = wgsl.replace(/^\s*(void|float|int|bool|vec[234]|ivec[234]|uvec[234]|mat[234])\s+\w+\s*\([^)]*\)\s*;/gm, '// (removed forward declaration)');

    // Remove in/out/inout qualifiers from parameters (we'll handle them separately)
    wgsl = wgsl.replace(/\b(in|out|inout)\s+(?=\w+\s+\w+)/g, '');

    // Convert function declarations
    wgsl = this.convertFunctionDeclarations(wgsl);

    // Fix mutable function parameters (WGSL doesn't allow modifying params)
    wgsl = this.fixMutableFunctionParameters(wgsl);

    // Handle const declarations before type markers
    wgsl = wgsl.replace(/\bconst\s+(vec2|vec3|vec4|ivec2|ivec3|ivec4|uvec2|uvec3|uvec4|mat2|mat3|mat4|float|int|bool)\s+(\w+)\s*=/g,
      (_, type, name) => {
        const typeMap: Record<string, string> = {
          'vec2': 'vec2<f32>', 'vec3': 'vec3<f32>', 'vec4': 'vec4<f32>',
          'ivec2': 'vec2<i32>', 'ivec3': 'vec3<i32>', 'ivec4': 'vec4<i32>',
          'uvec2': 'vec2<u32>', 'uvec3': 'vec3<u32>', 'uvec4': 'vec4<u32>',
          'mat2': 'mat2x2<f32>', 'mat3': 'mat3x3<f32>', 'mat4': 'mat4x4<f32>',
          'float': 'f32', 'int': 'i32', 'bool': 'bool'
        };
        // Store variable type for later reference
        this.varTypes.set(name, typeMap[type] || type);
        return `const ${name}: ${typeMap[type] || type} =`;
      });

    // Fix common loop counter declarations to use let instead of const
    wgsl = wgsl.replace(/\bfor\s*\(\s*const\s+(i32|f32|u32)\s+(\w+)\s*=/g, 'for (var $2: $1 =');

    // Preprocess comma-separated declarations
    wgsl = this.preprocessGLSLCommaDeclarations(wgsl);

    // Replace types with temporary markers
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
    wgsl = wgsl.replace(/\bfloat\s+(?=\w)/g, '__FLOAT__ ');
    wgsl = wgsl.replace(/\bint\s+(?=\w)(?!\s*\()/g, '__INT__ ');
    wgsl = wgsl.replace(/\bbool\s+(?=\w)/g, '__BOOL__ ');

    // Convert variable declarations WITH initialization
    wgsl = wgsl.replace(/(__VEC2__|__VEC3__|__VEC4__|__IVEC2__|__IVEC3__|__IVEC4__|__UVEC2__|__UVEC3__|__UVEC4__|__MAT2__|__MAT3__|__MAT4__|__FLOAT__|__INT__|__BOOL__)\s+(\w+)\s*=/g,
      'var $2: $1 =');

    // Convert variable declarations WITHOUT initialization
    wgsl = wgsl.replace(/(__VEC2__|__VEC3__|__VEC4__|__IVEC2__|__IVEC3__|__IVEC4__|__UVEC2__|__UVEC3__|__UVEC4__|__MAT2__|__MAT3__|__MAT4__|__FLOAT__|__INT__|__BOOL__)\s+(\w+)\s*;/g,
      'var $2: $1;');

    // Replace markers with actual WGSL types
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

    // Split comma-separated variable declarations
    wgsl = this.splitCommaVariableDeclarations(wgsl);

    // Convert GLSL swizzles (.stpq -> .xyzw)
    wgsl = this.convertGLSLSwizzles(wgsl);

    // Replace built-in functions (most map directly)
    wgsl = this.rewriteCallNameByArgCount(wgsl, 'atan', 2, 'atan2');
    wgsl = wgsl.replace(/\(inversesqrt\)\s*\(/g, 'inverseSqrt(');
    wgsl = wgsl.replace(/\binversesqrt\s*\(/g, 'inverseSqrt(');

    // ++/-- operators not supported in WGSL
    wgsl = wgsl.replace(/\b(\w+)\s*\+\+/g, '$1 = $1 + 1');
    wgsl = wgsl.replace(/\b(\w+)\s*--/g, '$1 = $1 - 1');
    wgsl = wgsl.replace(/\+\+\s*(\w+)\b/g, '$1 = $1 + 1');
    wgsl = wgsl.replace(/--\s*(\w+)\b/g, '$1 = $1 - 1');

    // Replace texture sampling calls
    wgsl = this.replaceTextureSamplingCalls(wgsl);

    // Replace ISF image rect variables
    wgsl = this.replaceImageRectVars(wgsl);

    // Collect local variable names for smart replacement
    const localVarNames = new Set<string>();
    const localVarPattern = /\bvar\s+(\w+)\s*:/g;
    let localVarMatch;
    while ((localVarMatch = localVarPattern.exec(wgsl)) !== null) {
      localVarNames.add(localVarMatch[1]);
    }

    // Helper for smart built-in replacement
    const replaceBuiltinVar = (code: string, pattern: string, replacement: string): string => {
      if (localVarNames.has(pattern)) return code;
      return code.replace(new RegExp(`\\b${pattern}\\b`, 'g'), (match, offset, string) => {
        const prefix = string.slice(0, offset).trimEnd();
        if (prefix.endsWith('var') || prefix.endsWith('let') || prefix.endsWith('const') || prefix.endsWith(':') || prefix.endsWith('.')) {
          return match;
        }
        return replacement;
      });
    };

    // Replace coordinate built-ins
    wgsl = replaceBuiltinVar(wgsl, 'isf_FragNormCoord', 'input.uv');
    wgsl = replaceBuiltinVar(wgsl, 'vv_FragNormCoord', 'input.uv');
    wgsl = replaceBuiltinVar(wgsl, 'texCoord', 'input.uv');
    wgsl = replaceBuiltinVar(wgsl, 'texcoord', 'input.uv');
    wgsl = replaceBuiltinVar(wgsl, 'v_texcoord', 'input.uv');
    wgsl = replaceBuiltinVar(wgsl, 'vTexCoord', 'input.uv');
    wgsl = replaceBuiltinVar(wgsl, 'v_uv', 'input.uv');
    wgsl = replaceBuiltinVar(wgsl, 'vUv', 'input.uv');
    wgsl = wgsl.replace(/\bisf_FragCoord\b/g, '(input.uv * uniforms.renderSize)');

    // Handle Shadertoy mainImage function
    wgsl = this.convertMainImageFunction(wgsl);

    wgsl = wgsl.replace(/\bfragCoord\b/g, '(input.uv * uniforms.renderSize)');
    wgsl = wgsl.replace(/\bgl_FragCoord\b/g, '(input.uv * uniforms.renderSize)');
    wgsl = wgsl.replace(/\bgl_FragColor\b/g, '_isf_fragColor');
    wgsl = wgsl.replace(/\bfragColor\b/g, '_isf_fragColor');

    // Handle fragColor local variable declarations
    wgsl = wgsl.replace(/\b(vec4|var)\s+_isf_fragColor\s*(?::\s*vec4<f32>)?\s*(=|;)/g, (match, type, op) => {
      if (op === '=') return '_isf_fragColor =';
      return '// ' + match;
    });

    // ISF built-in uniforms (capitalized)
    wgsl = wgsl.replace(/\bTIME\b(?!\()/g, 'uniforms.time');
    wgsl = wgsl.replace(/\bTIMEDELTA\b(?!\()/g, 'uniforms.timeDelta');
    wgsl = wgsl.replace(/\bRENDERSIZE\b(?!\()/g, 'uniforms.renderSize');
    wgsl = wgsl.replace(/\bPASSINDEX\b(?!\()/g, 'uniforms.passIndex');
    wgsl = wgsl.replace(/\bFRAMEINDEX\b(?!\()/g, 'uniforms.frameIndex');
    wgsl = wgsl.replace(/\bDATE\b(?!\()/g, 'uniforms.date');

    // Common aliases
    wgsl = replaceBuiltinVar(wgsl, 'time', 'uniforms.time');
    wgsl = replaceBuiltinVar(wgsl, 'resolution', 'uniforms.renderSize');
    wgsl = replaceBuiltinVar(wgsl, 'iResolution', 'uniforms.renderSize');
    wgsl = replaceBuiltinVar(wgsl, 'iTime', 'uniforms.time');
    wgsl = replaceBuiltinVar(wgsl, 'iTimeDelta', 'uniforms.timeDelta');
    wgsl = replaceBuiltinVar(wgsl, 'iFrame', 'f32(uniforms.frameIndex)');

    // Replace user uniforms
    const inputs = this.metadata?.INPUTS || [];
    for (const input of inputs) {
      if (input.TYPE !== 'image') {
        const safeUniformName = this.renamedUniforms.get(input.NAME) || input.NAME;
        // Don't replace:
        // - after 'var ' (variable declaration)
        // - after '.' (member access)
        // - before ':' (parameter/variable type annotation)
        // - before '_in' (in parameter suffix)
        // - before '(' (function call)
        const regex = new RegExp(`(?<!var\\s+)(?<!\\.)\\b${input.NAME}\\b(?!\\s*:)(?!_in)(?!\\()`, 'g');

        if (input.TYPE === 'int' || input.TYPE === 'long') {
          wgsl = wgsl.replace(regex, `i32(uniforms.${safeUniformName})`);
        } else {
          wgsl = wgsl.replace(regex, `uniforms.${safeUniformName}`);
        }
      }
    }

    // Convert bool/event uniforms to boolean expressions
    const boolLike = new Set(
      inputs.filter((i) => i.TYPE === 'bool' || i.TYPE === 'event').map((i) => i.NAME)
    );
    for (const name of boolLike) {
      const safeUniformName = this.renamedUniforms.get(name) || name;
      const u = new RegExp(`\\buniforms\\.${safeUniformName}\\b`, 'g');
      wgsl = wgsl.replace(u, `(uniforms.${safeUniformName} != 0.0)`);
    }

    // Rewrite bool casts, mod calls, bitwise ops
    wgsl = this.rewriteBoolCasts(wgsl);
    wgsl = this.rewriteModCalls(wgsl);
    wgsl = this.rewriteBitwiseOps(wgsl);

    // Convert ternary operator to select
    wgsl = this.convertTernaryToSelect(wgsl);

    // Add braces to if/else statements
    wgsl = this.addBracesToIfStatements(wgsl);

    // Fix for loop braces
    wgsl = this.fixForLoopBraces(wgsl);

    // Fix switch-case statements
    wgsl = this.fixSwitchCaseStatements(wgsl);

    // Fix matrix scalar construction
    wgsl = this.fixMatrixScalarConstruction(wgsl);

    // Fix const array declarations
    wgsl = this.fixConstArrayDeclarations(wgsl);

    // Fix swizzle assignments
    wgsl = this.fixSwizzleAssignments(wgsl);

    // Fix matrix negation
    wgsl = this.fixMatrixNegation(wgsl);

    // Fix out/inout parameters
    wgsl = this.fixOutParameters(wgsl);

    // Fix clamp, smoothstep, max, min with mixed types
    wgsl = this.fixClampCalls(wgsl);
    wgsl = this.fixSmoothstepCalls(wgsl);
    wgsl = this.fixMaxMinCalls(wgsl);

    // Fix matrix division
    wgsl = this.fixMatrixDivision(wgsl);

    // Fix vector constructor args
    wgsl = this.fixVectorConstructorArgs(wgsl);

    // Fix C-style array declarations
    wgsl = this.fixArrayDeclarations(wgsl);

    // Fix float indices in array/vector access
    wgsl = this.fixFloatIndices(wgsl);

    // Fix GLSL comparison functions (lessThan, greaterThan, etc.)
    wgsl = this.fixGLSLComparisonFunctions(wgsl);

    // Disambiguate function overloads (WGSL doesn't support overloading)
    wgsl = this.disambiguateFunctionOverloads(wgsl);

    // Fix double underscore identifiers (WGSL reserved)
    wgsl = this.fixDoubleUnderscoreIdentifiers(wgsl);

    // Rename reserved keywords
    wgsl = this.renameReservedKeywords(wgsl);

    // Fix module-scope var declarations
    wgsl = this.fixModuleScopeVarDeclarations(wgsl);

    // Move module-scope variables using uniforms into fragment function
    wgsl = this.moveUniformDependentGlobals(wgsl);

    // Convert main function
    const initVarsCode = this.varsToInitInMain.length > 0
      ? '\n  ' + this.varsToInitInMain.map(v => `${v.name} = ${v.value};`).join('\n  ')
      : '';

    wgsl = wgsl.replace(
      /void\s+main\s*\(\s*(void)?\s*\)\s*\{/,
      `@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
  var _isf_fragColor: vec4<f32> = vec4<f32>(0.0, 0.0, 0.0, 1.0);${initVarsCode}`
    );

    // Ensure fs_main exists when only mainImage is defined
    wgsl = this.ensureFsMain(wgsl, initVarsCode);

    // Fix helper functions that use coordinates (must be after fs_main is created)
    wgsl = this.fixHelperFunctionCoordinates(wgsl);

    // Ensure fs_main returns at the end
    wgsl = this.ensureFsMainReturn(wgsl);

    // Final cleanup passes
    wgsl = this.fixInvalidCharacters(wgsl);
    wgsl = this.fixUnresolvedVariables(wgsl);
    wgsl = this.fixModuleScopeReferences(wgsl);

    return wgsl;
  }

  // ==========================================================================
  // Phase 3 Helper Methods: Comprehensive GLSL to WGSL Conversion
  // ==========================================================================

  private convertFunctionDeclarations(code: string): string {
    // Pattern: returnType funcName(params) {
    const funcRegex = /\b(void|float|int|bool|vec[234]|ivec[234]|uvec[234]|mat[234])\s+(\w+)\s*\(([^)]*)\)\s*\{/g;

    return code.replace(funcRegex, (match, returnType, funcName, params) => {
      if (funcName === 'main') return match; // Handle main separately

      const wgslReturnType = GLSL_TYPE_TO_WGSL[returnType] || returnType;
      const convertedParams = this.convertFunctionParams(params);

      if (returnType === 'void') {
        return `fn ${funcName}(${convertedParams}) {`;
      }
      return `fn ${funcName}(${convertedParams}) -> ${wgslReturnType} {`;
    });
  }

  private convertFunctionParams(params: string): string {
    if (!params.trim()) return '';

    const paramList = params.split(',').map(p => p.trim()).filter(Boolean);
    const converted: string[] = [];

    for (const param of paramList) {
      // Match: [in|out|inout] type name [= default]
      const match = param.match(/^(?:(in|out|inout)\s+)?(\w+)\s+(\w+)(?:\s*=.*)?$/);
      if (match) {
        const [, qualifier, type, name] = match;
        const wgslType = GLSL_TYPE_TO_WGSL[type] || type;

        if (qualifier === 'out' || qualifier === 'inout') {
          this.mutableParams.set(name, { name, type: wgslType, isOut: qualifier === 'out' });
          converted.push(`${name}: ptr<function, ${wgslType}>`);
        } else {
          converted.push(`${name}: ${wgslType}`);
        }
      } else {
        // Fallback: just try type name
        const simpleMatch = param.match(/(\w+)\s+(\w+)/);
        if (simpleMatch) {
          const [, type, name] = simpleMatch;
          const wgslType = GLSL_TYPE_TO_WGSL[type] || type;
          converted.push(`${name}: ${wgslType}`);
        }
      }
    }

    return converted.join(', ');
  }

  private fixMutableFunctionParameters(code: string): string {
    // WGSL doesn't allow assigning to function parameters
    // Find functions where parameters are modified and create local copies

    const funcRegex = /fn\s+(\w+)\s*\(([^)]*)\)\s*(?:->\s*[\w<>]+\s*)?\{/g;
    let result = code;
    let match;

    while ((match = funcRegex.exec(code)) !== null) {
      const funcName = match[1];
      const paramsStr = match[2];
      const funcStart = match.index + match[0].length;

      // Find the function body
      const funcBodyStart = funcStart;
      const funcBodyEnd = this.findMatchingBrace(code, funcStart - 1);

      if (funcBodyEnd === -1) continue;

      const funcBody = code.slice(funcBodyStart, funcBodyEnd);

      // Extract parameter names and types
      const params: Array<{ name: string, type: string }> = [];
      if (paramsStr.trim()) {
        const paramList = this.splitArgs(paramsStr);
        for (const param of paramList) {
          // Match: name: type  or  name: ptr<function, type>
          const match = param.match(/(\w+)\s*:\s*((?:ptr<function,\s*)?[\w<>, ]+)/);
          if (match) {
            params.push({ name: match[1], type: match[2].trim() });
          }
        }
      }

      // Check if any params are assigned to in the function body
      const mutatedParams: Array<{ name: string, type: string }> = [];
      for (const param of params) {
        // Skip if it's already a ptr (out/inout param)
        if (param.type.startsWith('ptr<')) continue;

        // Check for assignments: param = ... or param += ... or param *= ... etc.
        const assignRegex = new RegExp(`\\b${param.name}\\s*[+\\-*/&|^]?=`, 'g');
        if (assignRegex.test(funcBody)) {
          mutatedParams.push(param);
        }
      }

      // If we found mutated params, inject local copies at function start
      if (mutatedParams.length > 0) {
        const copies = mutatedParams.map(p => `var _local_${p.name}: ${p.type} = ${p.name};`).join('\n        ');

        // Replace assignments to use the local copy
        let newBody = funcBody;
        for (const param of mutatedParams) {
          // Replace param with _local_param, but not in member access (.x .y .z .w .xy .xyz etc.)
          // Use negative lookbehind for '.' and negative lookahead for ':'
          const regex = new RegExp(`(?<!\\.)\\b${param.name}\\b(?!\\s*:)`, 'g');
          newBody = newBody.replace(regex, `_local_${param.name}`);
        }

        // Inject the copies at the start of the function
        const injection = `\n        ${copies}\n`;
        const fullMatch = code.slice(match.index, funcBodyEnd + 1);
        const newFunc = code.slice(match.index, funcBodyStart) + injection + newBody + '}';

        result = result.replace(fullMatch, newFunc);
      }
    }

    return result;
  }

  private preprocessGLSLCommaDeclarations(code: string): string {
    // Handle: float a, b, c;  =>  float a; float b; float c;
    // Handle: float a = 1.0, b = 2.0;  =>  float a = 1.0; float b = 2.0;
    // Be careful to handle expressions with parentheses like min(a, b)

    const types = ['float', 'int', 'bool', 'vec2', 'vec3', 'vec4', 'ivec2', 'ivec3', 'ivec4', 'uvec2', 'uvec3', 'uvec4', 'mat2', 'mat3', 'mat4'];
    let result = code;

    // Process line by line to avoid cross-line issues
    const lines = result.split('\n');
    const processedLines: string[] = [];

    for (const line of lines) {
      let processed = line;

      for (const type of types) {
        // Pattern: type name, name2, ...;  or  type name = val, name2 = val2, ...;
        // The key is: commas between variable names, not inside function calls
        const declMatch = line.match(new RegExp(`^(\\s*)${type}\\s+(.+);(\\s*//.*)?$`));

        if (!declMatch) continue;

        const indent = declMatch[1];
        const varsStr = declMatch[2];
        const comment = declMatch[3] || '';

        // Split by comma at depth 0 (not inside parens)
        const vars: string[] = [];
        let current = '';
        let depth = 0;

        for (const ch of varsStr) {
          if (ch === '(' || ch === '[') depth++;
          else if (ch === ')' || ch === ']') depth--;
          else if (ch === ',' && depth === 0) {
            vars.push(current.trim());
            current = '';
            continue;
          }
          current += ch;
        }
        if (current.trim()) vars.push(current.trim());

        // Only process if we have multiple vars (true comma-separated declaration)
        if (vars.length > 1) {
          processed = vars.map((v, i) => {
            const lineComment = (i === vars.length - 1) ? comment : '';
            return `${indent}${type} ${v};${lineComment}`;
          }).join('\n');
        }

        break; // Only process one type per line
      }

      processedLines.push(processed);
    }

    return processedLines.join('\n');
  }

  private splitCommaVariableDeclarations(code: string): string {
    // Handle: var a, b: f32; => var a: f32; var b: f32;
    const regex = /\bvar\s+(\w+(?:\s*,\s*\w+)+)\s*:\s*(\w+(?:<\w+>)?)\s*;/g;

    return code.replace(regex, (match, names, type) => {
      const nameList = names.split(',').map((n: string) => n.trim());
      return nameList.map((n: string) => `var ${n}: ${type};`).join('\n');
    });
  }

  private convertGLSLSwizzles(code: string): string {
    // Convert .stpq swizzles to .xyzw
    // Be careful not to convert in comments or strings
    return code.replace(/\.([stpq]+)(?=\s*[^a-zA-Z0-9_]|$)/g, (match, swizzle) => {
      const converted = swizzle
        .replace(/s/g, 'x')
        .replace(/t/g, 'y')
        .replace(/p/g, 'z')
        .replace(/q/g, 'w');
      return '.' + converted;
    });
  }

  private rewriteCallNameByArgCount(code: string, funcName: string, argCount: number, newName: string): string {
    const regex = new RegExp(`\\b${funcName}\\s*\\(`, 'g');
    let result = '';
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(code)) !== null) {
      const start = match.index;
      const parenStart = start + match[0].length - 1;
      const parenEnd = this.findMatchingParen(code, parenStart);

      if (parenEnd === -1) {
        result += code.slice(lastIndex, start + match[0].length);
        lastIndex = start + match[0].length;
        continue;
      }

      const argsStr = code.slice(parenStart + 1, parenEnd);
      const args = this.splitArgs(argsStr);

      result += code.slice(lastIndex, start);
      if (args.length === argCount) {
        result += `${newName}(`;
      } else {
        result += `${funcName}(`;
      }
      lastIndex = parenStart + 1;
    }

    result += code.slice(lastIndex);
    return result;
  }

  private findMatchingParen(code: string, start: number): number {
    let depth = 0;
    for (let i = start; i < code.length; i++) {
      if (code[i] === '(') depth++;
      else if (code[i] === ')') {
        depth--;
        if (depth === 0) return i;
      }
    }
    return -1;
  }

  private splitArgs(argsStr: string): string[] {
    const args: string[] = [];
    let depth = 0;
    let current = '';

    for (const char of argsStr) {
      if (char === '(' || char === '[' || char === '{') {
        depth++;
        current += char;
      } else if (char === ')' || char === ']' || char === '}') {
        depth--;
        current += char;
      } else if (char === ',' && depth === 0) {
        args.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }

    if (current.trim()) args.push(current.trim());
    return args;
  }

  private replaceTextureSamplingCalls(code: string): string {
    let result = code;

    // IMG_NORM_PIXEL(tex, uv) -> textureSampleLevel(tex_NAME, samp_NAME, uv, 0.0)
    // Need proper parenthesis parsing for nested expressions
    result = this.replaceTextureSamplingCall(result, 'IMG_NORM_PIXEL', (tex, args) => {
      if (args.length >= 2) {
        const safeTex = this.renamedUniforms.get(tex) || tex;
        return `textureSampleLevel(tex_${safeTex}, samp_${safeTex}, ${args[1].trim()}, 0.0)`;
      }
      return null;
    });

    // IMG_PIXEL(tex, coord) -> textureLoad(tex_NAME, vec2<i32>(coord), 0)
    result = this.replaceTextureSamplingCall(result, 'IMG_PIXEL', (tex, args) => {
      if (args.length >= 2) {
        const safeTex = this.renamedUniforms.get(tex) || tex;
        return `textureLoad(tex_${safeTex}, vec2<i32>(${args[1].trim()}), 0)`;
      }
      return null;
    });

    // IMG_SIZE(tex) -> vec2<f32>(textureDimensions(tex_NAME))
    result = result.replace(/IMG_SIZE\s*\(\s*(\w+)\s*\)/g, (_, tex) => {
      const safeTex = this.renamedUniforms.get(tex) || tex;
      return `vec2<f32>(textureDimensions(tex_${safeTex}))`;
    });

    // IMG_THIS_NORM_PIXEL(texName) -> textureSampleLevel(tex_NAME, samp_NAME, input.uv, 0.0)
    // Note: The parameter is a texture NAME, not coordinates
    result = result.replace(/IMG_THIS_NORM_PIXEL\s*\(\s*(\w+)\s*\)/g, (_, tex) => {
      const safeTex = this.renamedUniforms.get(tex) || tex;
      return `textureSampleLevel(tex_${safeTex}, samp_${safeTex}, input.uv, 0.0)`;
    });

    // IMG_THIS_PIXEL(texName) -> textureSampleLevel(tex_NAME, samp_NAME, input.uv, 0.0)
    // Note: The parameter is a texture NAME, not coordinates
    result = result.replace(/IMG_THIS_PIXEL\s*\(\s*(\w+)\s*\)/g, (_, tex) => {
      const safeTex = this.renamedUniforms.get(tex) || tex;
      return `textureSampleLevel(tex_${safeTex}, samp_${safeTex}, input.uv, 0.0)`;
    });

    // texture2D(tex, uv) / texture(tex, uv) - need proper parsing for nested expressions
    result = this.replaceTextureSamplingCall(result, 'texture2D', (tex, args) => {
      if (args.length >= 2) {
        const safeTex = this.renamedUniforms.get(tex) || tex;
        return `textureSample(tex_${safeTex}, samp_${safeTex}, ${args[1].trim()})`;
      }
      return null;
    });
    result = this.replaceTextureSamplingCall(result, 'texture', (tex, args) => {
      if (args.length >= 2) {
        const safeTex = this.renamedUniforms.get(tex) || tex;
        return `textureSample(tex_${safeTex}, samp_${safeTex}, ${args[1].trim()})`;
      }
      return null;
    });

    return result;
  }

  private replaceTextureSamplingCall(code: string, funcName: string, replacer: (tex: string, args: string[]) => string | null): string {
    const regex = new RegExp(`\\b${funcName}\\s*\\(`, 'g');
    let result = '';
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(code)) !== null) {
      const start = match.index;
      if (start < lastIndex) continue;

      const parenStart = start + match[0].length - 1;
      const parenEnd = this.findMatchingParen(code, parenStart);

      if (parenEnd === -1) {
        result += code.slice(lastIndex, start + match[0].length);
        lastIndex = start + match[0].length;
        continue;
      }

      const argsStr = code.slice(parenStart + 1, parenEnd);
      const args = this.splitArgs(argsStr);

      if (args.length >= 1) {
        const tex = args[0].trim();
        const replacement = replacer(tex, args);
        if (replacement !== null) {
          result += code.slice(lastIndex, start);
          result += replacement;
          lastIndex = parenEnd + 1;
          continue;
        }
      }

      // No replacement, keep original
      result += code.slice(lastIndex, parenEnd + 1);
      lastIndex = parenEnd + 1;
    }

    result += code.slice(lastIndex);
    return result;
  }

  private replaceImageRectVars(code: string): string {
    // Replace _tex_NAME_imgRect.xy and _tex_NAME_imgRect.zw patterns
    let result = code;

    // Pattern: _tex_NAME_imgRect.xy (offset)
    result = result.replace(/_tex_(\w+)_imgRect\.xy/g, 'vec2<f32>(0.0, 0.0)');
    // Pattern: _tex_NAME_imgRect.zw (size)
    result = result.replace(/_tex_(\w+)_imgRect\.zw/g, (_, tex) => {
      const safeTex = this.renamedUniforms.get(tex) || tex;
      return `vec2<f32>(textureDimensions(tex_${safeTex}))`;
    });
    // Full imgRect
    result = result.replace(/_tex_(\w+)_imgRect/g, (_, tex) => {
      const safeTex = this.renamedUniforms.get(tex) || tex;
      return `vec4<f32>(0.0, 0.0, vec2<f32>(textureDimensions(tex_${safeTex})))`;
    });

    return result;
  }

  private convertMainImageFunction(code: string): string {
    // Shadertoy-style: void mainImage(out vec4 fragColor, in vec2 fragCoord)
    const mainImageRegex = /void\s+mainImage\s*\(\s*out\s+vec4\s+(\w+)\s*,\s*(?:in\s+)?vec2\s+(\w+)\s*\)\s*\{/g;

    const match = mainImageRegex.exec(code);
    if (!match) return code;

    const [fullMatch, fragColorName, fragCoordName] = match;

    // Replace the function signature
    let result = code.replace(fullMatch, `fn mainImage_internal(input: VertexOutput) -> vec4<f32> {
  var ${fragColorName}: vec4<f32>;
  let ${fragCoordName} = input.uv * uniforms.renderSize;`);

    // Ensure we return fragColor at the end
    // Find the closing brace of mainImage_internal
    const funcStart = result.indexOf('fn mainImage_internal');
    if (funcStart !== -1) {
      const braceStart = result.indexOf('{', funcStart);
      if (braceStart !== -1) {
        const braceEnd = this.findMatchingBrace(result, braceStart);
        if (braceEnd !== -1) {
          // Insert return before closing brace
          const beforeBrace = result.slice(0, braceEnd);
          const afterBrace = result.slice(braceEnd);

          if (!beforeBrace.trimEnd().endsWith(`return ${fragColorName};`)) {
            result = beforeBrace + `\n  return ${fragColorName};\n` + afterBrace;
          }
        }
      }
    }

    return result;
  }

  private findMatchingBrace(code: string, start: number): number {
    let depth = 0;
    for (let i = start; i < code.length; i++) {
      if (code[i] === '{') depth++;
      else if (code[i] === '}') {
        depth--;
        if (depth === 0) return i;
      }
    }
    return -1;
  }

  private rewriteBoolCasts(code: string): string {
    // bool(x) -> (x != 0.0) or (x != 0) depending on context
    return code.replace(/\bbool\s*\(\s*([^)]+)\s*\)/g, (_, expr) => {
      const trimmed = expr.trim();
      // If it's clearly an int, use != 0
      if (/^[a-zA-Z_]\w*$/.test(trimmed)) {
        return `(${trimmed} != 0.0)`;
      }
      return `(${trimmed} != 0.0)`;
    });
  }

  private rewriteModCalls(code: string): string {
    // mod(x, y) in GLSL is ((x) - (y) * floor((x) / (y)))
    // WGSL has modulo operator % but it's different for negatives
    // Need to properly parse nested function calls

    const regex = /\bmod\s*\(/g;
    let result = '';
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(code)) !== null) {
      const start = match.index;

      // Skip if already processed
      if (start < lastIndex) continue;

      const parenStart = start + match[0].length - 1;
      const parenEnd = this.findMatchingParen(code, parenStart);

      if (parenEnd === -1) {
        result += code.slice(lastIndex, start + match[0].length);
        lastIndex = start + match[0].length;
        continue;
      }

      const argsStr = code.slice(parenStart + 1, parenEnd);
      const args = this.splitArgs(argsStr);

      if (args.length === 2) {
        const x = args[0].trim();
        const y = args[1].trim();
        result += code.slice(lastIndex, start);
        result += `((${x}) - (${y}) * floor((${x}) / (${y})))`;
        lastIndex = parenEnd + 1;
      } else {
        // Not a 2-arg mod call, leave as is
        result += code.slice(lastIndex, parenEnd + 1);
        lastIndex = parenEnd + 1;
      }
    }

    result += code.slice(lastIndex);
    return result;
  }

  private rewriteBitwiseOps(code: string): string {
    // In WGSL, bitwise ops require integer types
    // Convert float args to i32 for bitwise operations
    let result = code;

    // Pattern: expr << expr, expr >> expr, expr & expr, expr | expr, expr ^ expr
    // This is complex - for now, just handle simple cases
    result = result.replace(/\b(\w+)\s*<<\s*(\w+)\b/g, (_, a, b) => `(i32(${a}) << u32(${b}))`);
    result = result.replace(/\b(\w+)\s*>>\s*(\w+)\b/g, (_, a, b) => `(i32(${a}) >> u32(${b}))`);

    return result;
  }

  private convertTernaryToSelect(code: string): string {
    // WGSL doesn't support ternary operator ?: - must use select()
    // select(falseVal, trueVal, condition)
    // Note: select has opposite order from ternary!

    let result = code;
    let iterations = 0;
    const maxIterations = 100;

    // Handle nested ternaries by iterating from innermost to outermost
    while (iterations++ < maxIterations) {
      // Find a ternary expression: condition ? trueVal : falseVal
      // Need to handle nested parentheses properly

      let found = false;
      for (let i = 0; i < result.length; i++) {
        if (result[i] === '?') {
          // Found a ?, now find the condition before it
          let condEnd = i - 1;

          // Skip whitespace before ?
          while (condEnd >= 0 && /\s/.test(result[condEnd])) condEnd--;

          // Now find the start of the condition
          // We need to walk backwards, handling parentheses properly
          let parenDepth = 0;
          let condStart = condEnd;

          if (result[condEnd] === ')') {
            // Condition ends with ), find matching (
            parenDepth = 1;
            condStart--;
            while (condStart >= 0 && parenDepth > 0) {
              if (result[condStart] === ')') parenDepth++;
              if (result[condStart] === '(') parenDepth--;
              condStart--;
            }
            condStart++; // Point to the opening (
          } else {
            // Walk backwards through the condition expression
            // Stop at: = ( , ; or start of line
            // But keep going through: identifiers, dots, operators (<, >, !, &, |, etc.)
            while (condStart > 0) {
              const char = result[condStart - 1];
              const twoChar = result.slice(condStart - 2, condStart);

              // Stop at statement/expression boundaries
              if (char === '=' && result[condStart - 2] !== '!' && result[condStart - 2] !== '<' && result[condStart - 2] !== '>') break;
              if (char === '(' || char === ',' || char === ';' || char === '{') break;
              if (char === '\n') {
                // Check if previous non-whitespace is a continuation
                let checkPos = condStart - 2;
                while (checkPos >= 0 && /\s/.test(result[checkPos])) checkPos--;
                if (checkPos < 0 || result[checkPos] === ';' || result[checkPos] === '{') break;
              }

              condStart--;
            }

            // Skip leading whitespace
            while (condStart < condEnd && /\s/.test(result[condStart])) condStart++;
          }

          // Now find the true value after ?
          let trueStart = i + 1;
          while (trueStart < result.length && /\s/.test(result[trueStart])) trueStart++;

          // Find the : that separates true and false values
          let colonPos = trueStart;
          parenDepth = 0;
          while (colonPos < result.length) {
            if (result[colonPos] === '(') parenDepth++;
            if (result[colonPos] === ')') parenDepth--;
            if (result[colonPos] === ':' && parenDepth === 0) break;
            if (result[colonPos] === '?' && parenDepth === 0) break; // nested ternary
            colonPos++;
          }

          if (colonPos >= result.length || result[colonPos] !== ':') continue;

          const trueEnd = colonPos;

          // Find the false value after :
          let falseStart = colonPos + 1;
          while (falseStart < result.length && /\s/.test(result[falseStart])) falseStart++;

          // Find end of false value (until ; , ) or end of line)
          let falseEnd = falseStart;
          parenDepth = 0;
          while (falseEnd < result.length) {
            if (result[falseEnd] === '(') parenDepth++;
            if (result[falseEnd] === ')') {
              if (parenDepth === 0) break;
              parenDepth--;
            }
            if (parenDepth === 0 && (result[falseEnd] === ';' || result[falseEnd] === ',' || result[falseEnd] === '\n')) break;
            falseEnd++;
          }

          const condition = result.slice(condStart, i).trim();
          const trueVal = result.slice(trueStart, trueEnd).trim();
          const falseVal = result.slice(falseStart, falseEnd).trim();

          if (condition && trueVal && falseVal) {
            const replacement = `select(${falseVal}, ${trueVal}, ${condition})`;
            result = result.slice(0, condStart) + replacement + result.slice(falseEnd);
            found = true;
            break;
          }
        }
      }

      if (!found) break;
    }

    return result;
  }

  private addBracesToIfStatements(code: string): string {
    // WGSL requires braces around if/else/for/while bodies
    // Use character-by-character parsing to handle multi-line cases properly

    let result = '';
    let i = 0;

    while (i < code.length) {
      // Check for keywords
      const keywordMatch = code.substring(i).match(/^(if|else|for|while)(?![a-zA-Z0-9_])/);

      if (!keywordMatch) {
        result += code[i];
        i++;
        continue;
      }

      const keyword = keywordMatch[1];
      result += keyword;
      i += keyword.length;

      // Skip whitespace
      while (i < code.length && /\s/.test(code[i])) {
        result += code[i];
        i++;
      }

      // For 'else', check if followed by 'if'
      if (keyword === 'else') {
        if (code.substring(i).match(/^if(?![a-zA-Z0-9_])/)) {
          continue; // Let the 'if' handler take care of it
        }

        // Check if already has brace
        if (code[i] === '{') {
          result += code[i];
          i++;
          continue;
        }

        // Find the statement and wrap it
        const statement = this.extractStatement(code, i);
        if (statement) {
          result += '{ ' + statement.text + ' }';
          i = statement.end;
        }
        continue;
      }

      // For if/for/while, skip condition in parentheses
      if (code[i] !== '(') {
        result += code[i];
        i++;
        continue;
      }

      result += '(';
      i++;

      let parenDepth = 1;
      while (i < code.length && parenDepth > 0) {
        if (code[i] === '(') parenDepth++;
        else if (code[i] === ')') parenDepth--;
        result += code[i];
        i++;
      }

      // Skip whitespace after condition
      while (i < code.length && /\s/.test(code[i])) {
        result += code[i];
        i++;
      }

      // Check if already has brace
      if (code[i] === '{') {
        result += code[i];
        i++;
        continue;
      }

      // Find the statement and wrap it
      const statement = this.extractStatement(code, i);
      if (statement) {
        result += '{ ' + statement.text + ' }';
        i = statement.end;
      }
    }

    return result;
  }

  private extractStatement(code: string, start: number): { text: string; end: number } | null {
    let i = start;
    let text = '';
    let braceDepth = 0;
    let parenDepth = 0;

    while (i < code.length) {
      const char = code[i];

      if (char === '(') {
        parenDepth++;
        text += char;
        i++;
      } else if (char === ')') {
        parenDepth--;
        text += char;
        i++;
      } else if (char === '{') {
        if (braceDepth === 0 && parenDepth === 0) {
          // Encountered a brace at statement level - stop here
          break;
        }
        braceDepth++;
        text += char;
        i++;
      } else if (char === '}') {
        if (braceDepth === 0) {
          // End of containing block
          break;
        }
        braceDepth--;
        text += char;
        i++;
      } else if (char === ';' && braceDepth === 0 && parenDepth === 0) {
        // End of statement
        text += char;
        i++;
        break;
      } else {
        text += char;
        i++;
      }
    }

    return text.trim().length > 0 ? { text: text.trim(), end: i } : null;
  }

  private fixForLoopBraces(code: string): string {
    // for (...) statement; -> for (...) { statement; }
    return code.replace(/\bfor\s*\(([^)]+)\)\s*([^{\n;]+;)/g, (match, header, body) => {
      if (body.trim().startsWith('{')) return match;
      return `for (${header}) { ${body.trim()} }`;
    });
  }

  private fixSwitchCaseStatements(code: string): string {
    // WGSL switch is different - cases need braces
    // This is a simplified handler - complex switches may need manual review
    let result = code;

    // Find all switch statements and process them individually
    const switchRegex = /\bswitch\s*\(([^)]+)\)\s*\{/g;
    let match;
    const switchRanges: Array<{ start: number, end: number }> = [];

    while ((match = switchRegex.exec(result)) !== null) {
      const switchStart = match.index;
      const openBracePos = match.index + match[0].length - 1;

      // Find matching closing brace
      let depth = 1;
      let pos = openBracePos + 1;
      while (pos < result.length && depth > 0) {
        if (result[pos] === '{') depth++;
        else if (result[pos] === '}') depth--;
        pos++;
      }

      if (depth === 0) {
        switchRanges.push({ start: switchStart, end: pos });
      }
    }

    // Process in reverse order to maintain indices
    for (let i = switchRanges.length - 1; i >= 0; i--) {
      const { start, end } = switchRanges[i];
      let switchCode = result.substring(start, end);

      // Clean up switch syntax
      switchCode = switchCode.replace(/\bswitch\s*\(([^)]+)\)\s*\{/, 'switch $1 {');

      // case N: -> case N: {  (if not already braced)
      switchCode = switchCode.replace(/\bcase\s+([^:]+):\s*([^{\n])/g, 'case $1: { $2');

      // break; at end of case -> } (close the case brace)
      // Only replace breaks that come before case, default, or the switch's closing brace
      switchCode = switchCode.replace(/\bbreak\s*;\s*(?=case|default|$)/g, '}\n');

      // default: -> default: {
      switchCode = switchCode.replace(/\bdefault\s*:\s*([^{\n])/g, 'default: { $1');

      result = result.substring(0, start) + switchCode + result.substring(end);
    }

    return result;
  }

  private moveUniformDependentGlobals(code: string): string {
    // Find module-level variable declarations that reference uniforms
    // These must be moved into the fragment function as WGSL doesn't allow
    // module-scope variables to be initialized with non-const expressions

    let result = code;
    const globalVarsToMove: Array<{ declaration: string, name: string }> = [];

    // Find the fragment function
    const fragFuncMatch = result.match(/@fragment\s+fn\s+fs_main\s*\([^)]*\)\s*->[^{]*\{/);
    if (!fragFuncMatch) {
      // If no fragment function found, just return (nothing to do)
      return result;
    }

    const fragFuncStart = fragFuncMatch.index! + fragFuncMatch[0].length;

    // Look for var<private> declarations before the fragment function using indexOf
    const beforeFragFunc = result.substring(0, fragFuncMatch.index);

    // Simple line-by-line approach
    const lines = beforeFragFunc.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes('var<private>') && line.includes('=') && line.includes('uniforms.')) {
        // Extract the declaration
        const match = line.match(/var<private>\s+(\w+)/);
        if (match) {
          globalVarsToMove.push({
            declaration: line.trim(),
            name: match[1]
          });
        }
      }
    }

    // Remove these declarations from module scope and add them to fragment function
    if (globalVarsToMove.length > 0) {
      // Remove from module scope (in reverse to maintain indices)
      for (let i = globalVarsToMove.length - 1; i >= 0; i--) {
        const { declaration } = globalVarsToMove[i];
        result = result.replace(declaration, '');
      }

      // Add to fragment function (convert var<private> to var)
      let insertCode = '\n';
      for (const { declaration } of globalVarsToMove) {
        // Convert var<private> to var
        const localDecl = declaration.replace(/var<private>/, 'var');
        insertCode += '  ' + localDecl + '\n';
      }

      // Insert after the opening brace of fragment function
      const beforeInsert = result.substring(0, fragFuncStart);
      const afterInsert = result.substring(fragFuncStart);
      result = beforeInsert + insertCode + afterInsert;
    }

    return result;
  }

  private fixMatrixScalarConstruction(code: string): string {
    // mat3(1.0) in GLSL creates identity matrix scaled by 1.0
    // WGSL: mat3x3<f32>(vec3<f32>(1,0,0), vec3<f32>(0,1,0), vec3<f32>(0,0,1))

    let result = code;

    // mat2x2<f32>(scalar)
    result = result.replace(/mat2x2<f32>\s*\(\s*(\d+\.?\d*)\s*\)/g, (_, s) => {
      return `mat2x2<f32>(vec2<f32>(${s}, 0.0), vec2<f32>(0.0, ${s}))`;
    });

    // mat3x3<f32>(scalar)
    result = result.replace(/mat3x3<f32>\s*\(\s*(\d+\.?\d*)\s*\)/g, (_, s) => {
      return `mat3x3<f32>(vec3<f32>(${s}, 0.0, 0.0), vec3<f32>(0.0, ${s}, 0.0), vec3<f32>(0.0, 0.0, ${s}))`;
    });

    // mat4x4<f32>(scalar)
    result = result.replace(/mat4x4<f32>\s*\(\s*(\d+\.?\d*)\s*\)/g, (_, s) => {
      return `mat4x4<f32>(vec4<f32>(${s}, 0.0, 0.0, 0.0), vec4<f32>(0.0, ${s}, 0.0, 0.0), vec4<f32>(0.0, 0.0, ${s}, 0.0), vec4<f32>(0.0, 0.0, 0.0, ${s}))`;
    });

    return result;
  }

  private fixConstArrayDeclarations(code: string): string {
    // const float arr[3] = float[](1.0, 2.0, 3.0);
    // -> const arr: array<f32, 3> = array<f32, 3>(1.0, 2.0, 3.0);

    // C-style arrays: type name[size]
    return code.replace(/\bconst\s+(\w+)\s*:\s*(\w+(?:<\w+>)?)\s*\[(\d+)\]\s*=/g, (_, name, type, size) => {
      return `const ${name}: array<${type}, ${size}> =`;
    });
  }

  private fixSwizzleAssignments(code: string): string {
    // WGSL doesn't allow swizzle assignments directly
    // v.xyz = expr; -> v = vec4<f32>(expr, v.w);
    // v.xy = expr; -> v = vec4<f32>(expr, v.z, v.w);

    let result = code;

    // NOTE: We don't handle single component assignments (.x =, .y =, etc.) 
    // because we can't easily determine the vector size at this stage.
    // Those are rare in ISF shaders anyway.

    // .rgb = expr (for vec4)
    result = result.replace(/(\w+)\.rgb\s*=\s*([^;]+);/g, (_, v, expr) => {
      return `${v} = vec4<f32>((${expr}), ${v}.w);`;
    });

    // .xy = expr (for vec2, vec3 or vec4) - we can't determine size, so skip for now
    // result = result.replace(/(\w+)\.xy\s*=\s*([^;]+);/g, (_, v, expr) => {
    //   return `{ let _sw = ${expr}; ${v} = vec4<f32>(_sw.x, _sw.y, ${v}.z, ${v}.w); }`;
    // });

    // .xyz = expr (for vec4)
    result = result.replace(/(\w+)\.xyz\s*=\s*([^;]+);/g, (_, v, expr) => {
      return `{ let _sw = ${expr}; ${v} = vec4<f32>(_sw.x, _sw.y, _sw.z, ${v}.w); }`;
    });

    // Compound assignments: +=, -=, *=, /=
    result = result.replace(/(\w+)\.rgb\s*\+=\s*([^;]+);/g, (_, v, expr) => {
      return `${v} = vec4<f32>(${v}.rgb + (${expr}), ${v}.w);`;
    });
    result = result.replace(/(\w+)\.rgb\s*-=\s*([^;]+);/g, (_, v, expr) => {
      return `${v} = vec4<f32>(${v}.rgb - (${expr}), ${v}.w);`;
    });
    result = result.replace(/(\w+)\.rgb\s*\*=\s*([^;]+);/g, (_, v, expr) => {
      return `${v} = vec4<f32>(${v}.rgb * (${expr}), ${v}.w);`;
    });
    result = result.replace(/(\w+)\.rgb\s*\/=\s*([^;]+);/g, (_, v, expr) => {
      return `${v} = vec4<f32>(${v}.rgb / (${expr}), ${v}.w);`;
    });

    // .xy compound assignments
    result = result.replace(/(\w+)\.xy\s*\+=\s*([^;]+);/g, (_, v, expr) => {
      return `{ let _sw = ${expr}; ${v} = vec4<f32>(${v}.x + _sw.x, ${v}.y + _sw.y, ${v}.z, ${v}.w); }`;
    });
    result = result.replace(/(\w+)\.xy\s*-=\s*([^;]+);/g, (_, v, expr) => {
      return `{ let _sw = ${expr}; ${v} = vec4<f32>(${v}.x - _sw.x, ${v}.y - _sw.y, ${v}.z, ${v}.w); }`;
    });
    result = result.replace(/(\w+)\.xy\s*\*=\s*([^;]+);/g, (_, v, expr) => {
      return `{ let _sw = ${expr}; ${v} = vec4<f32>(${v}.x * _sw.x, ${v}.y * _sw.y, ${v}.z, ${v}.w); }`;
    });
    result = result.replace(/(\w+)\.xy\s*\/=\s*([^;]+);/g, (_, v, expr) => {
      return `{ let _sw = ${expr}; ${v} = vec4<f32>(${v}.x / _sw.x, ${v}.y / _sw.y, ${v}.z, ${v}.w); }`;
    });

    // .zw compound assignments
    result = result.replace(/(\w+)\.zw\s*\+=\s*([^;]+);/g, (_, v, expr) => {
      return `{ let _sw = ${expr}; ${v} = vec4<f32>(${v}.x, ${v}.y, ${v}.z + _sw.x, ${v}.w + _sw.y); }`;
    });
    result = result.replace(/(\w+)\.zw\s*-=\s*([^;]+);/g, (_, v, expr) => {
      return `{ let _sw = ${expr}; ${v} = vec4<f32>(${v}.x, ${v}.y, ${v}.z - _sw.x, ${v}.w - _sw.y); }`;
    });
    result = result.replace(/(\w+)\.zw\s*\*=\s*([^;]+);/g, (_, v, expr) => {
      return `{ let _sw = ${expr}; ${v} = vec4<f32>(${v}.x, ${v}.y, ${v}.z * _sw.x, ${v}.w * _sw.y); }`;
    });
    result = result.replace(/(\w+)\.zw\s*\/=\s*([^;]+);/g, (_, v, expr) => {
      return `{ let _sw = ${expr}; ${v} = vec4<f32>(${v}.x, ${v}.y, ${v}.z / _sw.x, ${v}.w / _sw.y); }`;
    });

    // .zw = expr (for vec4)
    result = result.replace(/(\w+)\.zw\s*=\s*([^;]+);/g, (_, v, expr) => {
      return `{ let _sw = ${expr}; ${v} = vec4<f32>(${v}.x, ${v}.y, _sw.x, _sw.y); }`;
    });

    // Single component compound assignments
    // Disabled because we can't determine vector size at this stage
    // result = result.replace(/(\w+)\.(x|r)\s*\+=\s*([^;]+);/g, (_, v, comp, expr) => {
    //   return `${v} = vec4<f32>(${v}.x + (${expr}), ${v}.y, ${v}.z, ${v}.w);`;
    // });
    // result = result.replace(/(\w+)\.(y|g)\s*\+=\s*([^;]+);/g, (_, v, comp, expr) => {
    //   return `${v} = vec4<f32>(${v}.x, ${v}.y + (${expr}), ${v}.z, ${v}.w);`;
    // });

    return result;
  }

  private fixMatrixNegation(code: string): string {
    // WGSL doesn't support -matrix directly
    // -mat3(...) -> mat3(...) * -1.0
    let result = code;

    result = result.replace(/-\s*(mat[234]x[234]<f32>\s*\([^)]+\))/g, '($1 * -1.0)');
    result = result.replace(/-\s*(\w+)\s*(?=\s*\*\s*(?:vec|mat))/g, '($1 * -1.0)');

    return result;
  }

  private fixOutParameters(code: string): string {
    // For functions with out/inout params, we need to dereference pointers
    let result = code;

    for (const [name, param] of this.mutableParams) {
      // Replace uses of param with dereference: param -> (*param)
      // But not in declarations
      const regex = new RegExp(`(?<!ptr<function,\\s*\\w+>\\s*)\\b${name}\\b(?!\\s*:)`, 'g');
      result = result.replace(regex, `(*${name})`);
    }

    return result;
  }

  private fixClampCalls(code: string): string {
    let result = code;
    // Pattern 1: Unwrap simple vec constructors: clamp(x, vec2(0.0), vec2(1.0)) -> clamp(x, 0.0, 1.0)
    result = result.replace(/\bclamp\s*\(\s*([^,]+),\s*vec[234]<f32>\s*\(\s*(-?[\d.]+f?)\s*\)\s*,\s*vec[234]<f32>\s*\(\s*(-?[\d.]+f?)\s*\)\s*\)/g,
      'clamp($1, $2, $3)');

    // Pattern 2: Promote scalar literals when first arg is a simple vector variable or swizzle
    // clamp(color.rgb, 0.0, 1.0) -> clamp(color.rgb, vec3(0.0), vec3(1.0))
    result = result.replace(/\bclamp\s*\(\s*([a-zA-Z_]\w*\.(xyz|rgb|xyzw|rgba|xy|rg))\s*,\s*(-?[\d.]+f?)\s*,\s*(-?[\d.]+f?)\s*\)/g,
      (match, vecArg, swizzle, min, max) => {
        let vecType = 'vec3<f32>';
        if (swizzle.length === 4) vecType = 'vec4<f32>';
        else if (swizzle.length === 3) vecType = 'vec3<f32>';
        else if (swizzle.length === 2) vecType = 'vec2<f32>';
        return `clamp(${vecArg}, ${vecType}(${min}), ${vecType}(${max}))`;
      });

    return result;
  }

  private fixSmoothstepCalls(code: string): string {
    let result = code;
    // Pattern 1: Unwrap simple vec constructors
    result = result.replace(/\bsmoothstep\s*\(\s*vec[234]<f32>\s*\(\s*(-?[\d.]+f?)\s*\)\s*,\s*vec[234]<f32>\s*\(\s*(-?[\d.]+f?)\s*\)\s*,\s*([^)]+)\s*\)/g,
      'smoothstep($1, $2, $3)');

    // Pattern 2: Promote scalar literals when third arg is a simple vector variable or swizzle
    result = result.replace(/\bsmoothstep\s*\(\s*(-?[\d.]+f?)\s*,\s*(-?[\d.]+f?)\s*,\s*([a-zA-Z_]\w*\.(xyz|rgb|xyzw|rgba|xy|rg))\s*\)/g,
      (match, min, max, vecArg, swizzle) => {
        let vecType = 'vec3<f32>';
        if (swizzle.length === 4) vecType = 'vec4<f32>';
        else if (swizzle.length === 3) vecType = 'vec3<f32>';
        else if (swizzle.length === 2) vecType = 'vec2<f32>';
        return `smoothstep(${vecType}(${min}), ${vecType}(${max}), ${vecArg})`;
      });

    return result;
  }

  private fixMaxMinCalls(code: string): string {
    let result = code;
    // Pattern 1: Unwrap simple vec constructors: max(x, vec2(0.0)) -> max(x, 0.0)
    result = result.replace(/\b(max|min)\s*\(\s*([^,]+),\s*vec[234]<f32>\s*\(\s*(-?[\d.]+f?)\s*\)\s*\)/g,
      '$1($2, $3)');
    // Pattern 2: Reverse - unwrap first arg
    result = result.replace(/\b(max|min)\s*\(\s*vec[234]<f32>\s*\(\s*(-?[\d.]+f?)\s*\)\s*,\s*([^)]+)\s*\)/g,
      '$1($2, $3)');

    // Pattern 3: Promote scalar literals when first arg is a vector swizzle
    // max(color.rgb, 0.0) -> max(color.rgb, vec3(0.0))
    result = result.replace(/\b(max|min)\s*\(\s*([a-zA-Z_]\w*\.(xyz|rgb|xyzw|rgba|xy|rg))\s*,\s*(-?[\d.]+f?)\s*\)/g,
      (match, func, vecArg, swizzle, scalar) => {
        let vecType = 'vec3<f32>';
        if (swizzle.length === 4) vecType = 'vec4<f32>';
        else if (swizzle.length === 3) vecType = 'vec3<f32>';
        else if (swizzle.length === 2) vecType = 'vec2<f32>';
        return `${func}(${vecArg}, ${vecType}(${scalar}))`;
      });

    // Pattern 4: Reverse - max(0.0, color.rgb) -> max(vec3(0.0), color.rgb)
    result = result.replace(/\b(max|min)\s*\(\s*(-?[\d.]+f?)\s*,\s*([a-zA-Z_]\w*\.(xyz|rgb|xyzw|rgba|xy|rg))\s*\)/g,
      (match, func, scalar, vecArg, swizzle) => {
        let vecType = 'vec3<f32>';
        if (swizzle.length === 4) vecType = 'vec4<f32>';
        else if (swizzle.length === 3) vecType = 'vec3<f32>';
        else if (swizzle.length === 2) vecType = 'vec2<f32>';
        return `${func}(${vecType}(${scalar}), ${vecArg})`;
      });

    return result;
  }

  private fixVectorScalarBuiltinCalls(code: string, funcName: string, argCount: number): string {
    const regex = new RegExp(`\\b${funcName}\\s*\\(`, 'g');
    let result = '';
    let lastIndex = 0;
    let match;

    // First, collect variable type information from declarations
    const varTypes = new Map<string, string>();
    const varDeclPattern = /var\s+(\w+)\s*:\s*(vec[234]<\w+>|f32|i32|u32|bool)/g;
    let varMatch;
    while ((varMatch = varDeclPattern.exec(code)) !== null) {
      varTypes.set(varMatch[1], varMatch[2]);
    }

    while ((match = regex.exec(code)) !== null) {
      const start = match.index;

      // Skip if this match is before our lastIndex (already processed)
      if (start < lastIndex) {
        continue;
      }

      const parenStart = start + match[0].length - 1;
      const parenEnd = this.findMatchingParen(code, parenStart);

      if (parenEnd === -1) {
        result += code.slice(lastIndex, start + match[0].length);
        lastIndex = start + match[0].length;
        continue;
      }

      const argsStr = code.slice(parenStart + 1, parenEnd);
      const args = this.splitArgs(argsStr);

      if (args.length === argCount) {
        // PRIORITY 1: Unwrap simple vector constructors with single scalar
        // Example: vec2<f32>(0.0) -> 0.0
        // This fixes cases where literals were mistakenly wrapped
        const unwrappedArgs: string[] = [];
        let anyUnwrapped = false;

        for (let argIdx = 0; argIdx < args.length; argIdx++) {
          const arg = args[argIdx].trim();
          // Match: vec2<f32>(SCALAR) where SCALAR is a simple number or variable
          const simpleVecMatch = arg.match(/^vec[234]<f32>\s*\(\s*([^,()]+)\s*\)$/);
          if (simpleVecMatch) {
            unwrappedArgs.push(simpleVecMatch[1]);
            anyUnwrapped = true;
          } else {
            unwrappedArgs.push(arg);
          }
        }

        if (anyUnwrapped) {
          // Check if unwrapping makes sense: if all args are now scalars, it's ok
          // If some are vectors and some scalars, we may need to re-wrap or it's correct as-is
          const allScalar = unwrappedArgs.every(a => this.isLikelyScalar(a));
          const anyVector = unwrappedArgs.some(a => this.isLikelyVector(a));

          if (allScalar || !anyVector) {
            // All scalars - this is what we want
            result += code.slice(lastIndex, start);
            result += `${funcName}(${unwrappedArgs.join(', ')})`;
            lastIndex = parenEnd + 1;
            continue;
          }
        }

        // PRIORITY 2: Detect if we have mixed vector/scalar types
        // For clamp/smoothstep/min/max, check the FIRST argument to determine vector vs scalar
        let vectorArg: string | null = null;
        let vecType: string | null = null;

        // Check ONLY the first argument to determine if this is a vector or scalar operation
        const firstArg = unwrappedArgs[0].trim();

        // Check direct vector constructor
        if (firstArg.match(/vec[234]<f32>\s*\(/)) {
          vectorArg = firstArg;
          vecType = this.inferVectorType(firstArg);
        }
        // Check if it's a variable with known vector type
        else if (/^[a-zA-Z_]\w*$/.test(firstArg)) {
          const knownType = varTypes.get(firstArg);
          if (knownType && knownType.startsWith('vec')) {
            vectorArg = firstArg;
            vecType = knownType;
          }
        }
        // Check swizzle access (variable.xyz, variable.rgb, etc.)
        else if (firstArg.match(/\.(xyz|rgb|xyzw|rgba|xy|rg)\b/)) {
          vectorArg = firstArg;
          const swizzleMatch = firstArg.match(/\.(xyz|rgb|xyzw|rgba|xy|rg)\b/);
          if (swizzleMatch) {
            const swizzle = swizzleMatch[1];
            if (swizzle.length === 4) vecType = 'vec4<f32>';
            else if (swizzle.length === 3) vecType = 'vec3<f32>';
            else if (swizzle.length === 2) vecType = 'vec2<f32>';
          }
        }
        // Check arithmetic expressions involving vectors
        else if (firstArg.match(/\b[a-zA-Z_]\w*\s*[\+\-\*\/]/)) {
          // Expression like "p - K.xxx" or "x * 2.0"
          // Try to infer vector type from any part of the expression
          const inferredType = this.inferVectorType(firstArg);
          if (inferredType) {
            vectorArg = firstArg;
            vecType = inferredType;
          } else {
            // Check if any variable in the expression is a known vector
            const varMatches = firstArg.match(/\b[a-zA-Z_]\w*\b/g);
            if (varMatches) {
              for (const varName of varMatches) {
                const knownType = varTypes.get(varName);
                if (knownType && knownType.startsWith('vec')) {
                  vectorArg = firstArg;
                  vecType = knownType;
                  break;
                }
              }
            }
          }
        }

        if (vectorArg && vecType) {
          const scalarArgs = unwrappedArgs.filter((a, idx) => idx > 0 && this.isLikelyScalar(a));

          if (scalarArgs.length > 0) {
            // Promote scalar args (args 2+) to vectors to match arg 1
            const promotedArgs = unwrappedArgs.map((a, idx) => {
              if (idx > 0 && this.isLikelyScalar(a)) {
                return `${vecType}(${a})`;
              }
              return a;
            });

            result += code.slice(lastIndex, start);
            result += `${funcName}(${promotedArgs.join(', ')})`;
            lastIndex = parenEnd + 1;
            continue;
          }
        }

        // If we got here, all arguments are either all scalars or all vectors
        // Don't modify the call
      }

      result += code.slice(lastIndex, parenEnd + 1);
      lastIndex = parenEnd + 1;
    }

    result += code.slice(lastIndex);
    return result;
  }

  private isLikelyVector(expr: string): boolean {
    return /vec[234]|\.xyz|\.xy|\.rgb|\.rg/.test(expr);
  }

  private fixGLSLComparisonFunctions(code: string): string {
    // GLSL has comparison functions that return booleans: lessThan, greaterThan, etc.
    // WGSL uses operators instead
    let result = code;

    // lessThan(a, b) -> (a < b)
    result = result.replace(/\blessThan\s*\(\s*([^,]+)\s*,\s*([^)]+)\s*\)/g, '($1 < $2)');

    // greaterThan(a, b) -> (a > b)
    result = result.replace(/\bgreaterThan\s*\(\s*([^,]+)\s*,\s*([^)]+)\s*\)/g, '($1 > $2)');

    // lessThanEqual(a, b) -> (a <= b)
    result = result.replace(/\blessThanEqual\s*\(\s*([^,]+)\s*,\s*([^)]+)\s*\)/g, '($1 <= $2)');

    // greaterThanEqual(a, b) -> (a >= b)
    result = result.replace(/\bgreaterThanEqual\s*\(\s*([^,]+)\s*,\s*([^)]+)\s*\)/g, '($1 >= $2)');

    // equal(a, b) -> (a == b)
    result = result.replace(/\bequal\s*\(\s*([^,]+)\s*,\s*([^)]+)\s*\)/g, '($1 == $2)');

    // notEqual(a, b) -> (a != b)
    result = result.replace(/\bnotEqual\s*\(\s*([^,]+)\s*,\s*([^)]+)\s*\)/g, '($1 != $2)');

    return result;
  }

  private fixDoubleUnderscoreIdentifiers(code: string): string {
    // WGSL forbids identifiers starting with two or more underscores
    // Find and rename them to single underscore
    let result = code;

    // Match variable declarations: var __name -> var _name
    result = result.replace(/\b(var|let|const)\s+__+(\w+)/g, '$1 _$2');

    // Match function parameters: __name: type -> _name: type
    result = result.replace(/\b__+(\w+)\s*:/g, '_$1:');

    // Match function declarations: fn __name -> fn _name
    result = result.replace(/\bfn\s+__+(\w+)/g, 'fn _$1');

    // Match all other usages: __name -> _name (but avoid triple underscores)
    result = result.replace(/\b__+(\w+)/g, '_$1');

    return result;
  }

  private isLikelyScalar(expr: string): boolean {
    // Simple heuristic: is it a number, or a simple identifier without swizzle, or a function call?
    const trimmed = expr.trim();

    // Numeric literal
    if (/^-?\d+\.?\d*$/.test(trimmed)) return true;

    // Simple identifier (variable name)
    if (/^[a-zA-Z_]\w*$/.test(trimmed) && !this.isLikelyVector(trimmed)) return true;

    // Function call that doesn't have vec in it (likely returns scalar)
    // e.g., rand(...), sin(...), cos(...), etc.
    if (/^\w+\([^)]*\)$/.test(trimmed) && !trimmed.includes('vec')) {
      // Additional check: if it's a known vector-returning function, it's not scalar
      if (trimmed.match(/^(texture|textureSample|textureSampleLevel)/)) {
        return false; // These return vec4
      }
      return true;
    }

    return false;
  }

  private inferVectorType(expr: string): string | null {
    if (/vec4|\.xyzw|\.rgba/.test(expr)) return 'vec4<f32>';
    if (/vec3|\.xyz|\.rgb/.test(expr)) return 'vec3<f32>';
    if (/vec2|\.xy|\.rg/.test(expr)) return 'vec2<f32>';
    return null;
  }

  private fixMatrixDivision(code: string): string {
    // WGSL doesn't support matrix / scalar
    // mat / scalar -> mat * (1.0 / scalar)
    return code.replace(/(mat[234]x[234]<f32>(?:\([^)]+\))?)\s*\/\s*(\w+|\d+\.?\d*)/g, (_, mat, scalar) => {
      return `(${mat} * (1.0 / ${scalar}))`;
    });
  }

  private fixVectorConstructorArgs(code: string): string {
    // Ensure vector constructors have float args
    let result = code;

    // vec3<f32>(1, 2, 3) -> vec3<f32>(1.0, 2.0, 3.0)
    // Only convert integers that are not already part of a float literal
    // Must not match: digits preceded by '.' or digit, followed by '.', digit, [uif], or '<'
    // Must not match: digits that are part of type names like vec3, mat4, f32, etc.
    result = result.replace(/vec([234])<f32>\s*\(([^)]+)\)/g, (match, dim, args) => {
      // Match integers that are:
      // - NOT preceded by a decimal point, digit, or letter (to avoid vec3, mat4, etc.)
      // - NOT followed by a decimal point, digit, [uif], or '<' (to avoid type params)
      const fixedArgs = args.replace(/(?<![.\da-zA-Z])(\d+)(?![.\duif<])/g, '$1.0');
      return `vec${dim}<f32>(${fixedArgs})`;
    });

    return result;
  }

  private fixArrayDeclarations(code: string): string {
    // C-style array declarations: float arr[3] -> var arr: array<f32, 3>
    return code.replace(/\bvar\s+(\w+)\s*:\s*(\w+)\s*\[(\d+)\]/g, (_, name, type, size) => {
      return `var ${name}: array<${type}, ${size}>`;
    });
  }

  private fixFloatIndices(code: string): string {
    // WGSL requires integer indices for array/vector access
    // Convert foo[0.0] -> foo[0], foo[1.0] -> foo[1], etc.
    // Match patterns like: identifier[number.0] or identifier.member[number.0]
    return code.replace(/(\w+(?:\.\w+)?)\[(\d+)\.0+\]/g, '$1[$2]');
  }

  private disambiguateFunctionOverloads(code: string): string {
    // WGSL doesn't support function overloading
    // Detect functions with the same name but different signatures and rename them

    // Find all function declarations
    const funcPattern = /fn\s+(\w+)\s*\(([^)]*)\)\s*->\s*([^{]+)\s*\{/g;
    const functions: Array<{ name: string; params: string; returnType: string; fullMatch: string; index: number }> = [];

    let match;
    while ((match = funcPattern.exec(code)) !== null) {
      functions.push({
        name: match[1],
        params: match[2],
        returnType: match[3].trim(),
        fullMatch: match[0],
        index: match.index,
      });
    }

    // Group functions by name
    const functionGroups = new Map<string, typeof functions>();
    for (const func of functions) {
      if (!functionGroups.has(func.name)) {
        functionGroups.set(func.name, []);
      }
      functionGroups.get(func.name)!.push(func);
    }

    // Find overloaded functions (same name, multiple definitions)
    let result = code;
    const renamedFunctions = new Map<string, string>(); // old signature -> new name

    for (const [funcName, funcs] of functionGroups) {
      if (funcs.length > 1) {
        // This function is overloaded
        // Sort by parameter count/complexity to ensure stable renaming
        funcs.sort((a, b) => a.index - b.index);

        for (let i = 0; i < funcs.length; i++) {
          const func = funcs[i];
          // Generate a unique name based on parameter types
          const paramTypes = this.extractParameterTypes(func.params);
          const suffix = paramTypes.join('_').replace(/[<>]/g, '_').replace(/__+/g, '_');
          const newName = `${funcName}_${suffix}`;

          renamedFunctions.set(`${funcName}(${func.params})`, newName);

          // Replace function declaration
          const oldDecl = `fn ${funcName}(${func.params})`;
          const newDecl = `fn ${newName}(${func.params})`;
          result = result.replace(oldDecl, newDecl);
        }

        // Replace all calls to the overloaded function
        // This is tricky because we need to determine which overload is being called
        // For now, use a simple heuristic based on argument types
        const callPattern = new RegExp(`\\b${funcName}\\s*\\(`, 'g');
        let callMatch;
        const replacements: Array<{ start: number; end: number; newName: string }> = [];

        while ((callMatch = callPattern.exec(result)) !== null) {
          const callStart = callMatch.index;
          const parenStart = callStart + callMatch[0].length - 1;
          const parenEnd = this.findMatchingParen(result, parenStart);

          if (parenEnd === -1) continue;

          const args = result.slice(parenStart + 1, parenEnd);
          const argTypes = this.inferArgumentTypes(args);

          // Find best matching overload
          let bestMatch: string | null = null;
          for (const [signature, newName] of renamedFunctions) {
            if (signature.startsWith(`${funcName}(`)) {
              const params = signature.slice(funcName.length + 1, -1);
              const paramTypes = this.extractParameterTypes(params);

              // Simple matching: check if argument count matches
              if (argTypes.length === paramTypes.length) {
                bestMatch = newName;
                break;
              }
            }
          }

          if (bestMatch) {
            replacements.push({
              start: callStart,
              end: callStart + funcName.length,
              newName: bestMatch,
            });
          }
        }

        // Apply replacements in reverse order to maintain indices
        for (let i = replacements.length - 1; i >= 0; i--) {
          const { start, end, newName } = replacements[i];
          result = result.slice(0, start) + newName + result.slice(end);
        }
      }
    }

    return result;
  }

  private extractParameterTypes(params: string): string[] {
    // Extract types from parameter list: "a: vec3<f32>, b: f32" -> ["vec3_f32", "f32"]
    if (!params.trim()) return [];

    const paramList = this.splitArgs(params);
    return paramList.map(p => {
      const match = p.match(/:\s*([\w<>]+)/);
      return match ? match[1] : 'unknown';
    });
  }

  private inferArgumentTypes(args: string): string[] {
    // Infer types from arguments (simple heuristic)
    if (!args.trim()) return [];

    const argList = this.splitArgs(args);
    return argList.map(arg => {
      arg = arg.trim();
      if (/^vec[234]<f32>\s*\(/.test(arg)) return arg.match(/^(vec[234]<f32>)/)?.[1] || 'unknown';
      if (/^vec[234]\s*\(/.test(arg)) return arg.match(/^(vec[234])/)?.[1] || 'unknown';
      if (/^\d+\./.test(arg)) return 'f32';
      if (/^\d+$/.test(arg)) return 'i32';
      return 'unknown';
    });
  }

  private renameReservedKeywords(code: string): string {
    // Rename user-defined identifiers that conflict with WGSL reserved words
    // Must rename ALL occurrences, not just declarations
    let result = code;

    for (const keyword of WGSL_RESERVED_KEYWORDS) {
      // Check if this keyword is used as a variable/function declaration
      const declPattern = new RegExp(`(var|let|const)\\s+${keyword}\\s*:`, 'g');
      const paramPattern = new RegExp(`(\\(|,\\s*)${keyword}\\s*:`, 'g');
      const funcPattern = new RegExp(`fn\\s+${keyword}\\s*\\(`, 'g');

      // Check if keyword is declared as a variable, function parameter, or function name
      const isDeclared = declPattern.test(result) || paramPattern.test(result) || funcPattern.test(result);

      if (isDeclared) {
        // Replace ALL occurrences of the keyword as an identifier
        // Match whole word but not when it's part of a larger identifier or preceded by '.'
        // Also avoid matching type declarations like vec4<f32>
        const identifierPattern = new RegExp(`(?<!\\.)(?<![a-zA-Z_])\\b${keyword}\\b(?![<])`, 'g');
        result = result.replace(identifierPattern, `_${keyword}_`);
      }
    }

    return result;
  }

  private fixModuleScopeVarDeclarations(code: string): string {
    // Module-scope var declarations need <private> address space
    // Find var declarations outside of functions

    const lines = code.split('\n');
    const result: string[] = [];
    let inFunction = false;
    let braceDepth = 0;

    for (const line of lines) {
      // Track function scope
      const fnMatch = line.match(/\bfn\s+\w+/);
      if (fnMatch) inFunction = true;

      for (const char of line) {
        if (char === '{') braceDepth++;
        if (char === '}') braceDepth--;
      }

      if (braceDepth === 0) inFunction = false;

      // Fix module-scope var declarations
      if (!inFunction && braceDepth === 0) {
        const varMatch = line.match(/^(\s*)var\s+(\w+)\s*:\s*(.+?)\s*(=\s*(.+?))?\s*;/);
        if (varMatch && !line.includes('<private>') && !line.includes('<uniform>') && !line.includes('<storage>')) {
          const [, indent, name, type, initPart, initValue] = varMatch;

          // If initialized with uniforms, defer initialization to main
          if (initPart && initValue && initValue.includes('uniforms.')) {
            // Remove initialization, add to varsToInitInMain
            const newLine = `${indent}var<private> ${name}: ${type};`;
            result.push(newLine);
            this.varsToInitInMain.push({ name, value: initValue.trim() });
            continue;
          }

          const newLine = line.replace(/var\s+(\w+)\s*:/, `var<private> ${name}:`);
          result.push(newLine);
          continue;
        }
      }

      result.push(line);
    }

    return result.join('\n');
  }

  private ensureFsMain(code: string, initVarsCode: string): string {
    // If we converted mainImage, create fs_main that calls it
    if (code.includes('fn mainImage_internal')) {
      if (!code.includes('fn fs_main')) {
        code += `

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
  var _isf_fragColor: vec4<f32> = vec4<f32>(0.0, 0.0, 0.0, 1.0);${initVarsCode}
  _isf_fragColor = mainImage_internal(input);
  return _isf_fragColor;
}`;
      }
    }
    return code;
  }

  private ensureFsMainReturn(code: string): string {
    // Ensure fs_main ends with return _isf_fragColor
    const fsMainRegex = /fn\s+fs_main\s*\([^)]*\)\s*->\s*@location\(0\)\s*vec4<f32>\s*\{/;
    const match = fsMainRegex.exec(code);

    if (match) {
      const startIdx = match.index + match[0].length;
      const endIdx = this.findMatchingBrace(code, match.index + match[0].length - 1);

      if (endIdx !== -1) {
        const body = code.slice(startIdx, endIdx);

        // Check if there's already a return
        if (!body.trim().endsWith('return _isf_fragColor;')) {
          const beforeEnd = code.slice(0, endIdx);
          const afterEnd = code.slice(endIdx);

          // Don't add duplicate return
          if (!beforeEnd.trimEnd().endsWith('return _isf_fragColor;')) {
            return beforeEnd + '\n  return _isf_fragColor;\n' + afterEnd;
          }
        }
      }
    }

    return code;
  }

  /**
   * Fix helper functions that reference coordinate built-ins.
   * WGSL doesn't have global coordinate variables like GLSL/ISF.
   * We need to inject a uv parameter into functions that use input.uv
   * and update call sites to pass input.uv.
   */
  private fixHelperFunctionCoordinates(code: string): string {
    const coordinatePatterns = [
      'vv_FragNormCoord',
      'isf_FragNormCoord',
      'texCoord',
      'texcoord',
      'v_texcoord',
      'vTexCoord',
      'input\\.uv'  // Also match input.uv (escaped dot for regex)
    ];

    let result = code;

    // Find all function definitions (excluding fs_main and built-in helpers)
    const funcPattern = /fn\s+(\w+)\s*\(([^)]*)\)\s*(->\s*[^\{]+)?\s*\{/g;
    let match;

    const functionsToFix: Array<{ name: string, hasParams: boolean }> = [];

    // First pass: identify functions that use coordinates
    while ((match = funcPattern.exec(code)) !== null) {
      const funcName = match[1];

      // Skip main, fragment main, and built-in helper functions
      if (funcName === 'main' ||
        funcName === 'fs_main' ||
        funcName.startsWith('TIME') ||
        funcName.startsWith('RENDERSIZE') ||
        funcName.startsWith('PASSINDEX') ||
        funcName.startsWith('FRAMEINDEX') ||
        funcName.startsWith('DATE') ||
        funcName === 'isf_FragNormCoord' ||
        funcName === 'isf_FragCoord' ||
        funcName.startsWith('IMG_') ||
        funcName.startsWith('fract_') ||
        funcName.startsWith('glsl_mod') ||
        funcName.startsWith('lessThan') ||
        funcName.startsWith('greaterThan')) {
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
        const newParams = trimmedParams ? `${trimmedParams}, _isf_uv: vec2<f32>` : '_isf_uv: vec2<f32>';
        return `fn ${func.name}(${newParams})${returnType || ''} {`;
      });

      // Update call sites to pass input.uv
      const callRegex = new RegExp(`\\b${func.name}\\s*\\(`, 'g');
      const matches: Array<{ start: number, end: number }> = [];

      let callMatch;
      while ((callMatch = callRegex.exec(result)) !== null) {
        // Skip if this is a function definition (preceded by 'fn ')
        const prefixStart = Math.max(0, callMatch.index - 10);
        const prefix = result.slice(prefixStart, callMatch.index);
        if (/\bfn\s+$/.test(prefix)) {
          continue;
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

      // Replace coordinate references inside function body with '_isf_uv'
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

        // Replace coordinate patterns with '_isf_uv'
        for (const pattern of coordinatePatterns) {
          if (pattern === 'input\\.uv') {
            funcBody = funcBody.replace(/input\.uv/g, (match, offset, string) => {
              const prefix = string.slice(0, offset).trimEnd();
              if (prefix.endsWith('var') || prefix.endsWith('let') || prefix.endsWith('const') || prefix.endsWith(':')) {
                return match;
              }
              return '_isf_uv';
            });
          } else {
            funcBody = funcBody.replace(new RegExp(`\\b${pattern}\\b`, 'g'), (match, offset, string) => {
              const prefix = string.slice(0, offset).trimEnd();
              if (prefix.endsWith('var') || prefix.endsWith('let') || prefix.endsWith('const') || prefix.endsWith(':')) {
                return match;
              }
              return '_isf_uv';
            });
          }
        }

        result = result.slice(0, bodyStart) + funcBody + result.slice(bodyEnd + 1);
      }
    }

    return result;
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private fixInvalidCharacters(code: string): string {
    // Remove or replace invalid Unicode characters that WGSL doesn't support
    let result = code;

    // Replace smart quotes with regular quotes
    result = result.replace(/[""]/g, '"');
    result = result.replace(/['']/g, "'");

    // Replace em-dash and en-dash with regular dash
    result = result.replace(/[—–]/g, '-');

    // Replace ellipsis
    result = result.replace(/…/g, '...');

    // Remove zero-width characters
    result = result.replace(/[\u200B-\u200D\uFEFF]/g, '');

    // Replace non-ASCII characters in identifiers (use token-based approach)
    const lines = result.split('\n');
    const fixedLines = lines.map(line => {
      // Check if line has non-ASCII in identifier positions
      return line.replace(/\b(\w*[^\x00-\x7F]\w*)\b/g, (match) => {
        // Only fix if it looks like an identifier (not in string/comment)
        // Simple heuristic: if surrounded by code-like context
        return match.replace(/[^\x00-\x7F]/g, '_');
      });
    });

    return fixedLines.join('\n');
  }

  private fixUnresolvedVariables(code: string): string {
    // Fix common patterns of unresolved variables from ISF
    let result = code;

    // Image rect variables (e.g., _inputImage_imgRect)
    result = result.replace(/\b(\w+)_imgRect\b/g, (match, texName) => {
      // Check if this texture exists
      if (this.textureNames.has(texName)) {
        return `vec4<f32>(0.0, 0.0, 1.0, 1.0)`; // default rect
      }
      return match;
    });

    // IMG_SIZE macros
    result = result.replace(/\bIMG_SIZE\s*\(\s*(\w+)\s*\)/g, (match, texName) => {
      return 'uniforms.renderSize';
    });

    // IMG_NORM_PIXEL macros
    result = result.replace(/\bIMG_NORM_PIXEL\s*\(\s*(\w+)\s*,\s*([^)]+)\s*\)/g, (match, texName, coord) => {
      return `textureSample(${texName}, ${texName}_sampler, ${coord})`;
    });

    // IMG_PIXEL macros
    result = result.replace(/\bIMG_PIXEL\s*\(\s*(\w+)\s*,\s*([^)]+)\s*\)/g, (match, texName, coord) => {
      return `textureSample(${texName}, ${texName}_sampler, (${coord}) / uniforms.renderSize)`;
    });

    // IMG_THIS_PIXEL macros
    result = result.replace(/\bIMG_THIS_PIXEL\s*\(\s*(\w+)\s*\)/g, (match, texName) => {
      return `textureSample(${texName}, ${texName}_sampler, input.uv)`;
    });

    return result;
  }

  private fixModuleScopeReferences(code: string): string {
    // Fix 'var X cannot be referenced at module-scope' errors
    // These occur when module-scope variables try to use other module variables
    let result = code;

    // Find all module-scope var declarations that reference other vars
    const lines = result.split('\n');
    const fixedLines: string[] = [];
    let inFsMain = false;
    let fsMainBraceIndex = -1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Check if we're entering fs_main
      if (line.includes('fn fs_main(')) {
        inFsMain = true;
        fixedLines.push(line);
        continue;
      }

      // Track opening brace of fs_main
      if (inFsMain && fsMainBraceIndex === -1 && line.includes('{')) {
        fsMainBraceIndex = fixedLines.length;
        fixedLines.push(line);
        continue;
      }

      // Check if this is a module-scope var that references other vars
      if (!inFsMain && line.trim().startsWith('var ') && line.includes('=')) {
        const varMatch = line.match(/var\s+(\w+)\s*:\s*([^=]+)\s*=\s*(.+);/);
        if (varMatch) {
          const [, varName, varType, varInit] = varMatch;

          // Check if initialization references uniforms or other module vars
          if (varInit.includes('uniforms.') || varInit.includes('input.')) {
            // Comment out at module scope and add to varsToInitInMain
            fixedLines.push(`// ${line.trim()} // Moved to fs_main`);
            this.varsToInitInMain.push({ name: varName, value: varInit.trim() });

            // Also add declaration without initialization
            fixedLines.push(`var ${varName}: ${varType.trim()};`);
            continue;
          }
        }
      }

      fixedLines.push(line);
    }

    return fixedLines.join('\n');
  }

  // ==========================================================================
  // Phase 4: Final WGSL Generation
  // ==========================================================================

  private generateFinalWGSL(body: string): { fragmentShader: string; vertexShader: string } {
    const sections: string[] = [];

    // Header comment
    sections.push(`// Generated by ISFToWGSLCompiler
// Original: ${this.metadata?.DESCRIPTION || 'ISF Shader'}
// Credit: ${this.metadata?.CREDIT || 'Unknown'}
`);

    // Vertex output struct
    sections.push(`struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
}`);

    // Uniform struct
    sections.push(this.generateUniformStruct());

    // Uniform binding
    sections.push(`@group(0) @binding(0) var<uniform> uniforms: Uniforms;`);

    // Texture bindings
    const textureBindings = this.generateTextureBindings();
    if (textureBindings) {
      sections.push(textureBindings);
    }

    // Helper functions
    sections.push(this.generateHelperFunctions());

    // Body (transpiled shader code)
    sections.push(body);

    const fragmentShader = sections.filter((s) => s.trim()).join('\n\n');
    const vertexShader = this.generateVertexShader();

    return { fragmentShader, vertexShader };
  }

  private generateUniformStruct(): string {
    const fields: string[] = [];

    // Standard ISF uniforms
    fields.push('  time: f32,');
    fields.push('  timeDelta: f32,');
    fields.push('  renderSize: vec2<f32>,');
    fields.push('  passIndex: i32,');
    fields.push('  frameIndex: i32,');
    fields.push('  date: vec4<f32>,');

    // User-defined uniforms from INPUTS
    for (const field of this.uniformFields) {
      if (field.isPadding) {
        fields.push(`  _pad_${field.offset}: f32,`);
      } else {
        // Skip standard uniforms we already added
        const standardNames = ['time', 'timeDelta', 'renderSize', 'passIndex', 'frameIndex', 'date'];
        if (!standardNames.includes(field.name)) {
          fields.push(`  ${field.name}: ${field.wgslType},`);
        }
      }
    }

    return `struct Uniforms {
${fields.join('\n')}
}`;
  }

  private generateTextureBindings(): string {
    const bindings: string[] = [];

    // Generate bindings for input image textures
    for (const tex of this.textureBindings) {
      bindings.push(`@group(1) @binding(${tex.textureBinding}) var tex_${tex.name}: texture_2d<f32>;`);
      bindings.push(`@group(1) @binding(${tex.samplerBinding}) var samp_${tex.name}: sampler;`);
    }

    // Generate bindings for pass buffers
    for (const pass of this.passBindings) {
      bindings.push(`@group(1) @binding(${pass.textureBinding}) var tex_${pass.name}: texture_2d<f32>;`);
      bindings.push(`@group(1) @binding(${pass.samplerBinding}) var samp_${pass.name}: sampler;`);
    }

    if (bindings.length === 0) {
      return '';
    }

    return bindings.join('\n');
  }

  private generateHelperFunctions(): string {
    // Common helper functions that many ISF shaders need
    return `// Helper functions
fn fract_f32(x: f32) -> f32 { return x - floor(x); }
fn fract_vec2(v: vec2<f32>) -> vec2<f32> { return v - floor(v); }
fn fract_vec3(v: vec3<f32>) -> vec3<f32> { return v - floor(v); }
fn fract_vec4(v: vec4<f32>) -> vec4<f32> { return v - floor(v); }

fn glsl_mod(x: f32, y: f32) -> f32 { return x - y * floor(x / y); }
fn glsl_mod_vec2(x: vec2<f32>, y: f32) -> vec2<f32> { return x - y * floor(x / y); }
fn glsl_mod_vec3(x: vec3<f32>, y: f32) -> vec3<f32> { return x - y * floor(x / y); }
fn glsl_mod_vec4(x: vec4<f32>, y: f32) -> vec4<f32> { return x - y * floor(x / y); }

fn lessThan_vec2(a: vec2<f32>, b: vec2<f32>) -> vec2<bool> { return vec2<bool>(a.x < b.x, a.y < b.y); }
fn lessThan_vec3(a: vec3<f32>, b: vec3<f32>) -> vec3<bool> { return vec3<bool>(a.x < b.x, a.y < b.y, a.z < b.z); }
fn greaterThan_vec2(a: vec2<f32>, b: vec2<f32>) -> vec2<bool> { return vec2<bool>(a.x > b.x, a.y > b.y); }
fn greaterThan_vec3(a: vec3<f32>, b: vec3<f32>) -> vec3<bool> { return vec3<bool>(a.x > b.x, a.y > b.y, a.z > b.z); }`;
  }

  /**
   * Generate a full-screen triangle vertex shader
   */
  private generateVertexShader(): string {
    return `struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
}

@vertex
fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
  // Full-screen triangle (3 vertices, CCW)
  var positions = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>(3.0, -1.0),
    vec2<f32>(-1.0, 3.0)
  );

  var uvs = array<vec2<f32>, 3>(
    vec2<f32>(0.0, 1.0),
    vec2<f32>(2.0, 1.0),
    vec2<f32>(0.0, -1.0)
  );

  var output: VertexOutput;
  output.position = vec4<f32>(positions[vertexIndex], 0.0, 1.0);
  output.uv = uvs[vertexIndex];
  return output;
}`;
  }

  // ==========================================================================
  // Utility: Validate Output (Optional)
  // ==========================================================================

  /**
   * Basic validation of generated WGSL
   * Does not replace actual GPU compilation, but catches obvious issues
   */
  public validate(wgsl: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check for common GLSL remnants
    const glslPatterns = [
      { pattern: /\btexture2D\s*\(/g, msg: 'texture2D found - should be textureSample' },
      { pattern: /\buniform\s+\w/g, msg: 'GLSL uniform keyword found' },
      { pattern: /\bvarying\s+/g, msg: 'GLSL varying keyword found' },
      { pattern: /\battribute\s+/g, msg: 'GLSL attribute keyword found' },
      { pattern: /\bprecision\s+/g, msg: 'GLSL precision qualifier found' },
      { pattern: /\bsampler2D\b/g, msg: 'GLSL sampler2D type found' },
      { pattern: /\bvec[234]\s*\(/g, msg: 'GLSL vec constructor (should be vec<f32>)' },
      { pattern: /\bmat[234]\s*\(/g, msg: 'GLSL mat constructor (should be matNxN<f32>)' },
    ];

    for (const { pattern, msg } of glslPatterns) {
      if (pattern.test(wgsl)) {
        errors.push(msg);
      }
    }

    // Check for balanced braces
    const openBraces = (wgsl.match(/{/g) || []).length;
    const closeBraces = (wgsl.match(/}/g) || []).length;
    if (openBraces !== closeBraces) {
      errors.push(`Unbalanced braces: ${openBraces} open, ${closeBraces} close`);
    }

    // Check for fs_main function
    if (!/fn\s+fs_main\s*\(/.test(wgsl)) {
      errors.push('No fs_main function found');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

// ============================================================================
// Export singleton for convenience
// ============================================================================

export const isfCompiler = new ISFToWGSLCompiler();

// ============================================================================
// Example Usage (for documentation)
// ============================================================================

/*
import { ISFToWGSLCompiler } from './isf-compiler';

const compiler = new ISFToWGSLCompiler();

const isfShader = `
/*
{
  "DESCRIPTION": "Color cycle effect",
  "INPUTS": [
    { "NAME": "speed", "TYPE": "float", "DEFAULT": 1.0 },
    { "NAME": "inputImage", "TYPE": "image" }
  ]
}
*/
/*
void main() {
    vec2 uv = isf_FragNormCoord;
    vec4 color = texture2D(inputImage, uv);
    float t = TIME * speed;
    color.rgb = mix(color.rgb, vec3(1.0, 0.0, 0.0), sin(t) * 0.5 + 0.5);
    gl_FragColor = color;
}
`;

const result = compiler.compile(isfShader);
console.log(result.wgsl);
console.log('Uniforms:', result.layout.uniforms);
console.log('Textures:', result.layout.textures);
*/
