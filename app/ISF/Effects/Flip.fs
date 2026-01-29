/*{
  "DESCRIPTION": "Flip horizontally or vertically.",
  "CATEGORIES": ["Reflection", "Static"],
  "CREDIT": "Nuvotion",
  "ISFVSN": "2",
  "VSN": "1",
  "INPUTS": [
    {
      "NAME": "inputImage",
      "TYPE": "image",
      "LABEL": "Input Image"
    },
    {
      "NAME": "side",
      "TYPE": "long",
      "DEFAULT": 0,
      "VALUES": [0, 1],
      "LABELS": ["Horizontal", "Vertical"],
      "LABEL": "Flip Side"
    }
  ]
}*/

void main() {
  vec2 p = isf_FragNormCoord;

  // Horizontal flip
  if (side == 0) {
    p.x = 1.0 - p.x;
  }

  // Vertical flip
  if (side == 1) {
    p.y = 1.0 - p.y;
  }

  vec4 flippedColor = IMG_NORM_PIXEL(inputImage, p);

  gl_FragColor = flippedColor;
}
