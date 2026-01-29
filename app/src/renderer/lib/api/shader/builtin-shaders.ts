// ============================================
// Visoic Shader API - Built-in Shaders
// ============================================

// Re-export ISF loader for external use
export { isfLoader, type ISFShaderInfo, type ISFShaderSource } from './isf-loader';

/**
 * Get all available shader categories
 */
export async function getShaderCategories(): Promise<string[]> {
  const { isfLoader } = await import('./isf-loader');
  return isfLoader.getCategories();
}

/**
 * Get all available shaders
 */
export async function getAllShaders() {
  const { isfLoader } = await import('./isf-loader');
  return isfLoader.getAllShaders();
}

/**
 * Get shaders by category
 */
export async function getShadersByCategory(category: string) {
  const { isfLoader } = await import('./isf-loader');
  return isfLoader.getShadersByCategory(category);
}

/**
 * Load a shader by ID
 */
export async function loadShader(id: string) {
  const { isfLoader } = await import('./isf-loader');
  return isfLoader.loadShader(id);
}

/**
 * Search shaders
 */
export async function searchShaders(query: string) {
  const { isfLoader } = await import('./isf-loader');
  return isfLoader.searchShaders(query);
}

// ============================================
// Legacy compatibility - BUILTIN_SHADERS object
// ============================================

/**
 * Fallback simple shaders that don't require ISF parsing
 * These are pure WGSL and work without the native API
 */
export const FALLBACK_SHADERS = {
  solidColor: {
    name: 'Solid Color',
    category: 'Generator',
    source: `/*{
  "DESCRIPTION": "Simple solid color",
  "CREDIT": "Visoic",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    {
      "NAME": "color",
      "TYPE": "color",
      "DEFAULT": [1.0, 0.0, 0.0, 1.0]
    }
  ]
}*/

void main() {
  gl_FragColor = color;
}`,
  },
  gradient: {
    name: 'Simple Gradient',
    category: 'Generator',
    source: `/*{
  "DESCRIPTION": "Simple horizontal gradient",
  "CREDIT": "Visoic",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    {
      "NAME": "color1",
      "TYPE": "color",
      "DEFAULT": [1.0, 0.0, 0.0, 1.0]
    },
    {
      "NAME": "color2",
      "TYPE": "color",
      "DEFAULT": [0.0, 0.0, 1.0, 1.0]
    }
  ]
}*/

void main() {
  vec2 uv = isf_FragNormCoord;
  gl_FragColor = mix(color1, color2, uv.x);
}`,
  },
  uvTest: {
    name: 'UV Test',
    category: 'Utilities',
    source: `/*{
  "DESCRIPTION": "Shows UV coordinates as colors",
  "CREDIT": "Visoic",
  "CATEGORIES": ["Utilities"],
  "INPUTS": []
}*/

void main() {
  vec2 uv = isf_FragNormCoord;
  gl_FragColor = vec4(uv.x, uv.y, 0.0, 1.0);
}`,
  },
  timeTest: {
    name: 'Time Test',
    category: 'Generator',
    source: `/*{
  "DESCRIPTION": "Animated color based on time",
  "CREDIT": "Visoic",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    {
      "NAME": "speed",
      "TYPE": "float",
      "DEFAULT": 1.0,
      "MIN": 0.1,
      "MAX": 10.0
    }
  ]
}*/

void main() {
  float t = TIME * speed;
  vec3 col = 0.5 + 0.5 * cos(t + vec3(0.0, 2.0, 4.0));
  gl_FragColor = vec4(col, 1.0);
}`,
  },
} as const;

export type FallbackShaderKey = keyof typeof FALLBACK_SHADERS;

/**
 * For backward compatibility - returns both ISF shaders and fallbacks
 * Use getAllShaders() for async ISF loading instead
 */
export const BUILTIN_SHADERS = FALLBACK_SHADERS;
export type BuiltinShaderKey = FallbackShaderKey;
