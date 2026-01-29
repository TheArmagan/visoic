# Visoic Shader API

WebGPU-based shader rendering system with ISF (Interactive Shader Format) support for audio-reactive visualizations.

## Features

- 🎨 **WebGPU Rendering** - Modern GPU-accelerated rendering
- 🔄 **ISF Support** - Interactive Shader Format compatibility
- 📊 **Multi-Canvas** - Multiple render contexts
- 🎵 **Audio Integration** - Bridge with Value Manager for audio-reactive visuals
- ⚡ **Real-time Updates** - All uniforms can be changed instantly
- 🎚️ **FPS Control** - Configurable frame rate limits
- 🔗 **Layer System** - Stack multiple shaders with blend modes

## Quick Start

```typescript
import { shaderManager, BUILTIN_SHADERS } from '$lib/api/shader';

// Initialize WebGPU
await shaderManager.initialize();

// Create a render context
const canvas = document.getElementById('myCanvas') as HTMLCanvasElement;
const context = await shaderManager.createContext({
  id: 'main',
  canvas,
  width: 800,
  height: 600,
  fpsLimit: 60,
});

// Add a shader layer
const layer = context.addLayer({
  id: 'plasma',
  source: { fragment: BUILTIN_SHADERS.plasma.source },
});

// Start rendering
context.start();

// Update uniforms in real-time
layer.setUniform('speed', 1.5);
layer.setUniform('scale', 12);
```

## API Reference

### ShaderManager

Main entry point for the shader system.

```typescript
// Get singleton instance
const manager = shaderManager;

// Initialize WebGPU
await manager.initialize();

// Check WebGPU support
if (ShaderManager.isSupported()) {
  // WebGPU is available
}

// Create render context
const context = await manager.createContext({
  id: 'myContext',
  canvas: document.getElementById('canvas'),
  width: 1920,
  height: 1080,
  fpsLimit: 60,
});

// Get existing context
const ctx = manager.getContext('myContext');

// Destroy context
manager.destroyContext('myContext');

// Start/stop all contexts
manager.startAll();
manager.stopAll();
```

### RenderContext

Manages a single canvas and its shader layers.

```typescript
// Resize canvas
context.resize(1920, 1080);

// Set FPS limit
context.setFpsLimit(30);

// Add layer
const layer = context.addLayer({
  id: 'layer1',
  source: { fragment: shaderCode },
  enabled: true,
  opacity: 1.0,
  blendMode: 'normal',
});

// Remove layer
context.removeLayer('layer1');

// Get layer
const layer = context.getLayer('layer1');

// Reorder layers
context.setLayerOrder(['layer2', 'layer1']);
context.moveLayer('layer1', 0);

// Control rendering
context.start();
context.stop();

// Get statistics
const stats = context.getStats();
console.log(`FPS: ${stats.fps}`);
```

### ShaderLayer

Represents a single shader in the pipeline.

```typescript
// Set uniform values
layer.setUniform('time', 1.5);
layer.setUniform('color', [1, 0, 0.5, 1]);

// Set normalized (0-1) value (respects MIN/MAX in shader)
layer.setNormalizedUniform('speed', 0.5);

// Get uniform value
const speed = layer.getUniform('speed');

// Get all uniform definitions
const uniforms = layer.getUniformDefinitions();

// Enable/disable
layer.enabled = false;

// Set opacity
layer.opacity = 0.5;

// Set blend mode
layer.blendMode = 'add';
```

### ISF Format

Write shaders in ISF format with JSON metadata:

```glsl
/*{
  "DESCRIPTION": "My shader",
  "CREDIT": "Author",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    {
      "NAME": "speed",
      "TYPE": "float",
      "MIN": 0.0,
      "MAX": 2.0,
      "DEFAULT": 1.0
    },
    {
      "NAME": "color",
      "TYPE": "color",
      "DEFAULT": [1.0, 0.5, 0.0, 1.0]
    }
  ]
}*/

void main() {
  vec2 uv = isf_FragNormCoord;
  gl_FragColor = vec4(uv.x, uv.y, sin(TIME * speed), 1.0);
}
```

### Supported Input Types

| Type | GLSL Type | Description |
|------|-----------|-------------|
| `float` | `float` | Single number |
| `int` | `int` | Integer |
| `bool` | `bool` | Boolean |
| `vec2` | `vec2` | 2D vector |
| `vec3` | `vec3` | 3D vector |
| `vec4` | `vec4` | 4D vector |
| `color` | `vec4` | RGBA color |
| `point2D` | `vec2` | 2D point |
| `image` | `sampler2D` | Texture input |

### Built-in Uniforms

These uniforms are automatically available:

| Name | Type | Description |
|------|------|-------------|
| `TIME` | `float` | Time in seconds since start |
| `TIMEDELTA` | `float` | Time since last frame |
| `RENDERSIZE` | `vec2` | Canvas size in pixels |
| `PASSINDEX` | `int` | Current pass index |
| `FRAMEINDEX` | `int` | Total frames rendered |
| `DATE` | `vec4` | Year, month, day, seconds |

### Blend Modes

| Mode | Description |
|------|-------------|
| `normal` | Standard alpha blending |
| `add` | Additive blending |
| `multiply` | Multiply colors |
| `screen` | Screen blend |
| `overlay` | Overlay effect |
| `difference` | Color difference |

## Audio Integration

Connect audio values to shader uniforms:

```typescript
import { shaderValueBridge } from '$lib/api/shader';
import { valueManager } from '$lib/api/values';

// Start the bridge
shaderValueBridge.start();

// Bind audio value to shader uniform
shaderValueBridge.bind(
  'bass-to-scale',     // binding ID
  'main',              // context ID
  'plasma',            // layer ID
  'scale',             // uniform name
  'audio.bass',        // value ID from valueManager
  (v) => v * 10 + 1    // optional transform
);

// Sync values (call in render loop or let bridge handle it)
shaderValueBridge.sync();

// Unbind
shaderValueBridge.unbind('bass-to-scale');
```

## Svelte Hooks

```svelte
<script>
  import { 
    useShaderManager, 
    useRenderContext,
    useShaderLayer 
  } from '$lib/api/shader';

  const { manager, initialize, isSupported } = useShaderManager();

  let canvas: HTMLCanvasElement;

  // Context is created and managed automatically
  const { context, start, stop } = useRenderContext({
    id: 'main',
    canvas,
    fpsLimit: 60,
  }, {
    autoStart: true,
    onFrame: (stats) => console.log(stats.fps),
  });

  // Layer is added and removed automatically
  const { layer, setUniform } = useShaderLayer('main', {
    id: 'effect',
    source: { fragment: shaderCode },
  });

  // Update uniform
  setUniform('speed', 2.0);
</script>

<canvas bind:this={canvas} />
```

## Built-in Shaders

| Shader | Category | Description |
|--------|----------|-------------|
| `gradient` | Generator | Simple gradient |
| `audioBars` | Audio | Frequency bars |
| `circularWave` | Audio | Circular waveform |
| `kaleidoscope` | Pattern | Kaleidoscope effect |
| `plasma` | Generator | Classic plasma |
| `vhsGlitch` | Filter | VHS glitch effect |
| `colorFilter` | Filter | Color adjustment |

```typescript
import { BUILTIN_SHADERS } from '$lib/api/shader';

// Use a built-in shader
const layer = context.addLayer({
  id: 'plasma',
  source: { fragment: BUILTIN_SHADERS.plasma.source },
});
```

## Performance Tips

1. **FPS Limiting** - Set appropriate FPS limits to reduce GPU usage
2. **Layer Count** - Minimize active layers
3. **Shader Complexity** - Simpler shaders = better performance
4. **Canvas Size** - Smaller canvases render faster
5. **Disable Unused** - Set `layer.enabled = false` for inactive layers

## Browser Support

WebGPU is required. Check support:

```typescript
if (ShaderManager.isSupported()) {
  // WebGPU available
} else {
  // Fallback or show message
}
```

Currently supported in:
- Chrome 113+
- Edge 113+
- Firefox (behind flag)
- Safari 17+ (macOS Sonoma)
