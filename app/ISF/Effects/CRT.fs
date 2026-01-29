/*{
  "DESCRIPTION": "Simulates CRT display with distortion, color flicker, scanlines, and vignette effects.",
  "CATEGORIES": [
    "Texture", "Animated"
  ],
  "CREDIT": "Nuvotion",
  "ISFVSN": "2",
  "VSN": "1.0",
  "INPUTS": [
    {
      "NAME": "inputImage",
      "TYPE": "image",
      "LABEL": "Input Image"
    }
  ]
}*/

vec2 curve(vec2 uv) {
  uv = (uv - 0.5) * 2.0;
  uv *= 1.1;
  uv.x *= 1.0 + pow((abs(uv.y) / 5.0), 2.0);
  uv.y *= 1.0 + pow((abs(uv.x) / 4.0), 2.0);
  uv = (uv / 2.0) + 0.5;
  uv = uv * 0.92 + 0.04;
  return uv;
}

void main() {
  vec2 uv = isf_FragNormCoord;

  // Apply the curve distortion
  uv = curve(uv);

  // Sample the input image
  vec4 originalColor = IMG_NORM_PIXEL(inputImage, uv);

  // Calculate time-modulated distortion
  float x = sin(0.3 * TIME + uv.y * 21.0) * sin(0.7 * TIME + uv.y * 29.0) * sin(0.3 + 0.33 * TIME + uv.y * 31.0) * 0.0017;

  vec3 col;
  col.r = IMG_NORM_PIXEL(inputImage, vec2(x + uv.x + 0.001, uv.y + 0.001)).x + 0.05;
  col.g = IMG_NORM_PIXEL(inputImage, vec2(x + uv.x + 0.000, uv.y - 0.002)).y + 0.05;
  col.b = IMG_NORM_PIXEL(inputImage, vec2(x + uv.x - 0.002, uv.y + 0.000)).z + 0.05;

  col.r += 0.08 * IMG_NORM_PIXEL(inputImage, 0.75 * vec2(x + 0.025, -0.027) + vec2(uv.x + 0.001, uv.y + 0.001)).x;
  col.g += 0.05 * IMG_NORM_PIXEL(inputImage, 0.75 * vec2(x - 0.022, -0.02) + vec2(uv.x + 0.000, uv.y - 0.002)).y;
  col.b += 0.08 * IMG_NORM_PIXEL(inputImage, 0.75 * vec2(x - 0.02, -0.018) + vec2(uv.x - 0.002, uv.y + 0.000)).z;

  col = clamp(col * 0.6 + 0.4 * col * col, 0.0, 1.0);

  // Add vignette effect
  float vig = (0.0 + 1.0 * 16.0 * uv.x * uv.y * (1.0 - uv.x) * (1.0 - uv.y));
  col *= vec3(pow(vig, 0.3));

  // Adjust colors
  col *= vec3(0.95, 1.05, 0.95);
  col *= 2.8;

  // Add scanline effect
  float scans = clamp(0.35 + 0.35 * sin(3.5 * TIME + uv.y * 480.0 * 1.5), 0.0, 0.5);
  float s = pow(scans, 1.7);
  col *= vec3(0.4 + 0.7 * s);

  // Add global flicker
  col *= 1.0 + 0.01 * sin(110.0 * TIME);

  // Add CRT stripes
  col *= 1.0 - 0.65 * vec3(clamp((mod(uv.x, 2.0) - 1.0) * 2.0, 0.0, 1.0));

  vec4 finalColor = vec4(col, originalColor.a);
  gl_FragColor = finalColor;
}
