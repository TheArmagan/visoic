/*{
  "CATEGORIES": [
    "Reflection", "Static"
  ],
  "DESCRIPTION": "Reflective tiling with customizable quadrants including directional symmetry and quad panel layout.",
  "ISFVSN": "2",
  "INPUTS": [
    {
      "NAME": "inputImage",
      "TYPE": "image"
    },
    {
      "NAME": "mode",
      "TYPE": "long",
      "DEFAULT": 0,
      "VALUES": [0, 1, 2, 3, 4],
      "LABELS": ["Left Up", "Right Up", "Right Down", "Left Down", "Quad Panel"],
      "LABEL": "Mode"
    }
  ],
  "CREDIT": "Nuvotion"
}*/

void main() {
  vec2 p = isf_FragNormCoord;

  // Quad reflect left up
  if (mode == 0) {
    p.x = p.x > 0.5 ? (p.x - 0.5) * 2.0 : 1.0 - p.x * 2.0;
    p.y = p.y > 0.5 ? (p.y - 0.5) * 2.0 : 1.0 - p.y * 2.0;
  }

  // Quad reflect right up
  if (mode == 1) {
    p.x = p.x > 0.5 ? 1.0 - (p.x - 0.5) * 2.0 : p.x * 2.0;
    p.y = p.y > 0.5 ? (p.y - 0.5) * 2.0 : 1.0 - p.y * 2.0;
  }

  // Quad reflect right down
  if (mode == 2) {
    p.x = p.x > 0.5 ? (p.x - 0.5) * 2.0 : 1.0 - p.x * 2.0;
    p.y = p.y > 0.5 ? 1.0 - (p.y - 0.5) * 2.0 : p.y * 2.0;
  }

  // Quad reflect left down
  if (mode == 3) {
    p.x = p.x > 0.5 ? 1.0 - (p.x - 0.5) * 2.0 : p.x * 2.0;
    p.y = p.y > 0.5 ? 1.0 - (p.y - 0.5) * 2.0 : p.y * 2.0;
  }

  // Quad panel
  if (mode == 4) {
    p.x = p.x > 0.5 ? (p.x - 0.5) * 2.0 : p.x * 2.0;
    p.y = p.y > 0.5 ? (p.y - 0.5) * 2.0 : p.y * 2.0;
  }

  vec4 color = IMG_NORM_PIXEL(inputImage, p);
  gl_FragColor = color;
}
