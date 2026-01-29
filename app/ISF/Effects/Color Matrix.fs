/*{
  "DESCRIPTION": "Transform the color channels based on customizable matrix coefficients.",
  "CATEGORIES": [
    "Color", "Static"
  ],
  "CREDIT": "Nuvotion",
  "ISFVSN": "2",
  "VSN": "1.0",
  "INPUTS": [
    {
      "NAME": "inputImage",
      "TYPE": "image",
      "LABEL": "Input Image"
    },
    {
      "NAME": "r2r",
      "TYPE": "float",
      "DEFAULT": 1.0,
      "LABEL": "Red to Red",
      "MIN": -1.0,
      "MAX": 1.0
    },
    {
      "NAME": "r2g",
      "TYPE": "float",
      "DEFAULT": 0.0,
      "LABEL": "Red to Green",
      "MIN": -1.0,
      "MAX": 1.0
    },
    {
      "NAME": "r2b",
      "TYPE": "float",
      "DEFAULT": 0.0,
      "LABEL": "Red to Blue",
      "MIN": -1.0,
      "MAX": 1.0
    },
    {
      "NAME": "g2r",
      "TYPE": "float",
      "DEFAULT": 0.0,
      "LABEL": "Green to Red",
      "MIN": -1.0,
      "MAX": 1.0
    },
    {
      "NAME": "g2g",
      "TYPE": "float",
      "DEFAULT": 1.0,
      "LABEL": "Green to Green",
      "MIN": -1.0,
      "MAX": 1.0
    },
    {
      "NAME": "g2b",
      "TYPE": "float",
      "DEFAULT": 0.0,
      "LABEL": "Green to Blue",
      "MIN": -1.0,
      "MAX": 1.0
    },
    {
      "NAME": "b2r",
      "TYPE": "float",
      "DEFAULT": 0.0,
      "LABEL": "Blue to Red",
      "MIN": -1.0,
      "MAX": 1.0
    },
    {
      "NAME": "b2g",
      "TYPE": "float",
      "DEFAULT": 0.0,
      "LABEL": "Blue to Green",
      "MIN": -1.0,
      "MAX": 1.0
    },
    {
      "NAME": "b2b",
      "TYPE": "float",
      "DEFAULT": 1.0,
      "LABEL": "Blue to Blue",
      "MIN": -1.0,
      "MAX": 1.0
    }
  ]
}*/

void main() {
  vec2 uv = isf_FragNormCoord;

  // Sample the input image
  vec4 texel = IMG_NORM_PIXEL(inputImage, uv);

  // Apply the color matrix transformation
  vec4 outputColor = vec4(
    texel.r * r2r + texel.g * g2r + texel.b * b2r,
    texel.r * r2g + texel.g * g2g + texel.b * b2g,
    texel.r * r2b + texel.g * g2b + texel.b * b2b,
    texel.a // Preserve the original alpha value
  );

  // Set the output color
  gl_FragColor = outputColor;
}
