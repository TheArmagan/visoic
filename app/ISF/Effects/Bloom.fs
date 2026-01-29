/*{
  "DESCRIPTION": "Bloom glow with adjustable threshold, intensity, and radius.",
  "CATEGORIES": ["Color", "Static"],
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
      "NAME": "threshold",
      "TYPE": "float",
      "DEFAULT": 0.5,
      "MIN": 0.0,
      "MAX": 1.0,
      "LABEL": "Threshold"
    },
    {
      "NAME": "intensity",
      "TYPE": "float",
      "DEFAULT": 1.0,
      "MIN": 0.0,
      "MAX": 5.0,
      "LABEL": "Intensity"
    },
    {
      "NAME": "radius",
      "TYPE": "float",
      "DEFAULT": 1.0,
      "MIN": 0.0,
      "MAX": 10.0,
      "LABEL": "Radius"
    }
  ]
}*/

void main() {
  vec2 uv = isf_FragNormCoord;
  vec4 originalColor = IMG_NORM_PIXEL(inputImage, uv);
  vec4 sum = vec4(0.0);

  // Factor for offset, adjust for blur resolution
  const float factor = 0.005;

  for (int n = -4; n <= 4; ++n) {
    for (int m = -4; m <= 4; ++m) {
      vec2 offset = vec2(float(m), float(n)) * radius * factor;
      vec4 sampleColor = IMG_NORM_PIXEL(inputImage, uv + offset);

      // Apply threshold
      sampleColor.rgb = max(vec3(0.0), sampleColor.rgb - threshold);

      sum += sampleColor;
    }
  }

  // Average the color value
  sum /= 81.0;

  // Apply intensity
  sum *= intensity;

  // Combine with the original image
  gl_FragColor = originalColor + sum;
}