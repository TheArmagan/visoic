/*{
  "DESCRIPTION": "Threshold-based black and white with optional color inversion.",
  "CATEGORIES": [
    "Color", "Static"
  ],
  "CREDIT": "Nuvotion",
  "VSN": "2",
  "ISFVSN": "2",
  "INPUTS": [
    {
      "NAME": "inputImage",
      "TYPE": "image",
      "LABEL": "Input Image"
    },
    {
      "NAME": "threshold",
      "TYPE": "float",
      "DEFAULT": 0.5,
      "MIN": 0.01,
      "MAX": 1.0,
      "LABEL": "Threshold"
    },
    {
      "NAME": "invert",
      "TYPE": "bool",
      "DEFAULT": false,
      "LABEL": "Invert"
    }
  ]
}*/

void main() {
  vec2 uv = isf_FragNormCoord;
  vec4 color = IMG_NORM_PIXEL(inputImage, uv);
  float average = (color.r + color.g + color.b) / 3.0;

  // Reordered arguments from original, threshhold was producing opposite result
  // in ISF
  //float bw = step(threshold, average);
   float bw = step(average, threshold);
   bw = mix(bw, 1.0 - bw, float(invert));
  gl_FragColor = vec4(bw, bw, bw, 1.0);
}
