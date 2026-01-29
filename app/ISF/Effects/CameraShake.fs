/*{
  "DESCRIPTION": "Simulates camera shake with adjustable strength and subtle zoom.",
  "CATEGORIES": [
    "Distortion", "Animated"
  ],
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
      "NAME": "strength",
      "TYPE": "float",
      "DEFAULT": 0.02,
      "MIN": 0.0,
      "MAX": 0.1,
      "LABEL": "Shake Strength"
    }
  ]
}*/

float noise(float x) {
  float i = floor(x);
  float f = fract(x);
  float a = fract(i * 0.0174533);
  float b = fract((i + 1.0) * 0.0174533);
  return mix(a, b, f * f * (3.0 - 2.0 * f));
}

void main() {
  // Combine pseudo-randomness with smoothly varying sine and cosine
  float offsetX = strength * (sin(TIME * 1.5 + noise(TIME)) + cos(TIME * 2.3 + noise(TIME)));
  float offsetY = strength * (cos(TIME * 1.7 + noise(TIME)) + sin(TIME * 2.9 + noise(TIME)));

  // Introduce a subtle zoom effect
  float zoom = 1.0 + (strength * 5.0 * sin(TIME * 0.5));

  vec2 shakenUv = zoom * vec2(isf_FragNormCoord.x + offsetX, isf_FragNormCoord.y + offsetY);

  vec4 shakenCol = IMG_NORM_PIXEL(inputImage, shakenUv);

  gl_FragColor = shakenCol;
}
