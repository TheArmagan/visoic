# Visoic Node System

Node-based görsel programlama sistemi. Shader'lar, ses analizi, matematik işlemleri ve mantık operasyonları için modüler bir yapı sunar.

## Mimari

```
nodes/
├── types.ts           # Type tanımları ve veri tipleri
├── registry.ts        # Node kayıt sistemi
├── shader-registry.ts # Shader node kayıtları
├── graph.ts           # Graf yönetimi ve evaluation
├── hooks.ts           # Svelte hooks
└── index.ts           # Ana export
```

## Node Kategorileri

### 🎨 Shader Nodes (`shader:*`)
Görsel efektler için ISF formatında shader'lar.

- `shader:Blur` - Gaussian blur efekti
- `shader:Brightness` - Parlaklık/kontrast ayarı
- `shader:ColorCorrection` - RGB renk düzeltme
- `shader:Pixelate` - Pikselleştirme efekti
- `shader:Invert` - Renk ters çevirme
- `shader:Grayscale` - Gri tonlama
- `shader:Vignette` - Vignette efekti
- `shader:ChromaticAberration` - Kromatik sapma
- `shader:NoiseGenerator` - Noise üreteci
- `shader:SolidColor` - Düz renk üreteci
- `shader:Gradient` - Gradient üreteci
- `shader:Blend` - İki görüntüyü karıştırma

### 🔢 Math Nodes (`math:*`)
Matematiksel operasyonlar.

- `math:add` - Toplama
- `math:subtract` - Çıkarma
- `math:multiply` - Çarpma
- `math:divide` - Bölme
- `math:clamp` - Değer sınırlama
- `math:lerp` - Linear interpolation
- `math:map` - Aralık dönüştürme
- `math:sin` - Sinüs
- `math:cos` - Kosinüs

### 📊 Value Nodes (`value:*`)
Sabit değerler.

- `value:number` - Sayı değeri
- `value:boolean` - Boolean değeri
- `value:color` - RGBA renk
- `value:vec2` - 2D vektör
- `value:vec3` - 3D vektör

### 🎵 Audio Nodes (`audio:*`)
Ses analizi ve işleme.

- `audio:device` - Ses giriş cihazı
- `audio:analyzer` - Ses analiz edici (FFT)
- `audio:normalizer` - Ses normalizasyonu
- `audio:fft-band` - Frekans bandı çıkarma

### ⚡ Logic Nodes (`logic:*`)
Mantıksal operasyonlar.

- `logic:compare` - Karşılaştırma (==, !=, <, >, <=, >=)
- `logic:select` - Koşullu seçim (ternary)
- `logic:and` - AND operasyonu
- `logic:or` - OR operasyonu
- `logic:not` - NOT operasyonu

### 🔧 Utility Nodes (`utility:*`)
Yardımcı araçlar.

- `utility:time` - Zaman değerleri
- `utility:random` - Rastgele sayı üreteci
- `utility:smooth` - Değer yumuşatma

### 📺 Output Nodes (`output:*`)
Çıkış noktaları.

- `output:canvas` - Canvas render çıkışı

## Veri Tipleri

| Tip | Renk | Açıklama |
|-----|------|----------|
| `number` | 🟢 | Sayısal değer |
| `boolean` | 🔴 | True/False |
| `string` | 🟠 | Metin |
| `vec2` | 🟣 | 2D vektör |
| `vec3` | 🔵 | 3D vektör |
| `vec4` | 🔵 | 4D vektör |
| `color` | 💗 | RGBA renk |
| `image` | 🩵 | Görüntü/Texture |
| `audio` | 🟧 | Ses sinyali |
| `fft` | 🩵 | FFT verisi |
| `array` | 💚 | Dizi |
| `any` | ⚪ | Herhangi bir tip |

## Bağlantı Kuralları

- Her giriş (input) yalnızca bir bağlantı alabilir
- Çıkışlar (output) birden fazla bağlantı verebilir
- Tip uyumluluğu otomatik kontrol edilir
- `any` tipi tüm tiplerle uyumludur
- `vec4` ve `color` birbirine dönüştürülebilir

## Kullanım

### Node Ekleme
- Canvas'ta çift tıklama yapın
- Açılan arama penceresinden node seçin
- Veya bir çıkıştan bağlantı sürükleyip bırakın

### Bağlantı Kurma
- Çıkış handle'ından sürükleyin
- Uyumlu giriş handle'ına bırakın
- Uyumsuz bağlantılar otomatik reddedilir

### Değer Düzenleme
- Node içindeki kontrolleri kullanın (slider, input, color picker vb.)
- Veya başka node'lardan bağlantı yapın

### Klavye Kısayolları
- `Delete` / `Backspace` - Seçili öğeleri sil
- `Ctrl+S` - Graf'ı dışa aktar
- `Ctrl+O` - Graf içe aktar

## Yeni Node Ekleme

```typescript
import { nodeRegistry } from '$lib/api/nodes';

nodeRegistry.register({
  type: 'custom:mynode',
  label: 'My Node',
  description: 'Custom node description',
  category: 'utility',
  icon: '🎯',
  tags: ['custom', 'example'],
  inputs: [
    { type: 'input', id: 'value', label: 'Value', dataType: 'number', defaultValue: 0 },
  ],
  outputs: [
    { type: 'output', id: 'result', label: 'Result', dataType: 'number' },
  ],
  createDefaultData: () => ({
    label: 'My Node',
    category: 'utility',
    // ... node data
  }),
});
```

## Yeni Shader Node Ekleme

```typescript
import { registerShaderNode } from '$lib/api/nodes';

registerShaderNode(
  'MyEffect',
  {
    DESCRIPTION: 'My custom effect',
    CATEGORIES: ['Effects'],
    INPUTS: [
      { NAME: 'inputImage', TYPE: 'image', LABEL: 'Input' },
      { NAME: 'amount', TYPE: 'float', DEFAULT: 0.5, MIN: 0, MAX: 1, LABEL: 'Amount' },
    ],
  },
  `
    precision highp float;
    varying vec2 vUv;
    uniform sampler2D inputImage;
    uniform float amount;
    
    void main() {
      vec4 color = texture2D(inputImage, vUv);
      // ... effect code
      gl_FragColor = color;
    }
  `
);
```

## API

### Hooks

```typescript
// Node durumunu takip et
const { nodes, edges } = useGraphState();

// Node operasyonları
const { addNode, removeNode, updateNode } = useNodeOperations();

// Edge operasyonları
const { addEdge, removeEdge, isValidConnection } = useEdgeOperations();

// Graf değerlendirme
const { isRunning, start, stop, toggle } = useGraphEvaluation();

// Serializasyon
const { serialize, deserialize, exportToFile, importFromFile, clear } = useGraphSerialization();
```

### Graf Yöneticisi

```typescript
import { nodeGraph } from '$lib/api/nodes';

// Node ekle
const node = nodeGraph.addNode('math:multiply', { x: 100, y: 100 });

// Edge ekle
nodeGraph.addEdge({
  source: 'node1',
  target: 'node2',
  sourceHandle: 'result',
  targetHandle: 'a',
});

// Graf değerlendir
nodeGraph.evaluate({
  time: 0,
  deltaTime: 0.016,
  frame: 0,
  resolution: [1920, 1080],
});
```
